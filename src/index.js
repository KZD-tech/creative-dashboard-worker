/**
 * Rumah Padi Dashboard — Cloudflare Worker
 * Routes:
 *   POST /webhook/onpay  → terima donation dari Onpay
 *   GET  /api/sync-fb    → trigger sync FB Ads secara manual
 *   GET  /api/metrics    → data gabungan untuk dashboard
 *   GET  /api/donations  → senarai donation terkini
 */

const FB_AD_ACCOUNT = 'act_1147393289134936';
const FB_API_VERSION = 'v19.0';
const FB_FIELDS = [
  'ad_id', 'ad_name', 'campaign_name', 'adset_name',
  'spend', 'impressions', 'reach',
  'ctr',                          // CTR (all)
  'actions',                       // purchases, etc
  'cost_per_action_type',
  'purchase_roas',
  'landing_page_views',
  'cost_per_landing_page_view',
  'video_play_actions',            // untuk kira hook rate
  'video_3_sec_watched_actions',   // 3-second views (= hook)
].join(',');

// ─── CORS ────────────────────────────────────────────────────────────────────
function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ─── MAIN ROUTER ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const c = cors(env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: c });

    try {
      if (pathname === '/webhook/onpay' && request.method === 'POST')
        return await handleOnpayWebhook(request, env, c);

      if (pathname === '/api/sync-fb' && request.method === 'GET')
        return await syncFacebook(env, c);

      if (pathname === '/api/metrics' && request.method === 'GET')
        return await getMetrics(request, env, c);

      if (pathname === '/api/donations' && request.method === 'GET')
        return await getDonations(request, env, c);

      return new Response('Not found', { status: 404 });
    } catch (err) {
      await logSync(env, 'error', 'error', err.message).catch(() => {});
      return json({ ok: false, error: err.message }, 500, c);
    }
  },

  // Cron trigger — jalankan setiap 6 jam
  async scheduled(event, env) {
    await syncFacebook(env, {});
  },
};

// ─── ONPAY WEBHOOK ───────────────────────────────────────────────────────────
async function handleOnpayWebhook(request, env, c) {
  const data = await request.json();

  // Verify token
  if (!data.token || data.token !== env.ONPAY_WEBHOOK_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Hanya proses sale.confirmed
  if (data.event_type !== 'sale.confirmed') {
    return json({ ok: true, skipped: data.event_type }, 200, c);
  }

  const sale = data.sale;

  // Parse UTM fields
  // extra_field_2: "facebook (New)" / "facebook (Returning)"
  // extra_field_3: "Campaign | Adset | Ad Name"
  const extra2 = sale.extra_field_2 || '';
  const extra3 = sale.extra_field_3 || '';

  const isNew = extra2.toLowerCase().includes('new') ? 1 : 0;
  const source = extra2.split('(')[0].trim();

  const parts = extra3.split(' | ').map(s => s.trim());
  const campaignName = parts[0] || '';
  const adsetName    = parts[1] || '';
  const adName       = parts[2] || '';

  const amount = parseFloat(sale.total_amount) || 0;

  await env.DB.prepare(`
    INSERT OR REPLACE INTO donations
      (id, uid, donor_name, donor_email, amount, source,
       campaign_name, adset_name, ad_name,
       is_new, payment_method, status,
       confirmed_at, created_at, raw_extra_2, raw_extra_3)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)
  `).bind(
    sale.id, sale.uid, sale.client_fullname, sale.client_email,
    amount, source,
    campaignName, adsetName, adName,
    isNew, sale.payment_method,
    sale.confirmed_at, sale.created_at,
    extra2, extra3
  ).run();

  return json({ ok: true }, 200, c);
}

// ─── FACEBOOK SYNC ───────────────────────────────────────────────────────────
async function syncFacebook(env, c) {
  if (!env.FB_ACCESS_TOKEN) {
    return json({ ok: false, error: 'FB_ACCESS_TOKEN tidak diset' }, 400, c);
  }

  const params = new URLSearchParams({
    level:        'ad',
    fields:       FB_FIELDS,
    date_preset:  'last_30d',
    access_token: env.FB_ACCESS_TOKEN,
    limit:        '100',
  });

  const res  = await fetch(`https://graph.facebook.com/${FB_API_VERSION}/${FB_AD_ACCOUNT}/insights?${params}`);
  const body = await res.json();

  if (body.error) {
    await logSync(env, 'fb', 'error', body.error.message);
    return json({ ok: false, error: body.error.message }, 400, c);
  }

  let synced = 0;
  for (const ad of (body.data || [])) {
    const purchases       = getAction(ad.actions, 'purchase');
    const costPerPurchase = getAction(ad.cost_per_action_type, 'purchase');
    const roas            = parseFloat(ad.purchase_roas?.[0]?.value || 0);
    const lpv             = parseInt(ad.landing_page_views || 0);
    const costPerLpv      = parseFloat(ad.cost_per_landing_page_view || 0);

    // Hook Rate = 3-sec video views / video plays
    const videoPlays = parseInt(ad.video_play_actions?.[0]?.value || 0);
    const video3s    = parseInt(ad.video_3_sec_watched_actions?.[0]?.value || 0);
    const hookRate   = videoPlays > 0 ? video3s / videoPlays : 0;

    await env.DB.prepare(`
      INSERT OR REPLACE INTO fb_ads
        (ad_id, ad_name, campaign_name, adset_name,
         spend, impressions, reach, ctr,
         purchases, cost_per_purchase, purchase_roas,
         lpv, cost_per_lpv, hook_rate,
         date_start, date_stop, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      ad.ad_id, ad.ad_name, ad.campaign_name, ad.adset_name,
      parseFloat(ad.spend || 0),
      parseInt(ad.impressions || 0),
      parseInt(ad.reach || 0),
      parseFloat(ad.ctr || 0),
      purchases, costPerPurchase, roas,
      lpv, costPerLpv, hookRate,
      ad.date_start, ad.date_stop
    ).run();

    synced++;
  }

  await logSync(env, 'fb', 'ok', `Synced ${synced} ads`);
  return json({ ok: true, synced }, 200, c);
}

// ─── API: METRICS ─────────────────────────────────────────────────────────────
async function getMetrics(request, env, c) {
  // Ambil semua FB ads
  const fbResult = await env.DB.prepare(
    'SELECT * FROM fb_ads ORDER BY spend DESC'
  ).all();

  // Donation summary per ad
  const donResult = await env.DB.prepare(`
    SELECT
      ad_name,
      COUNT(*)      AS donor_count,
      SUM(amount)   AS total_revenue,
      SUM(is_new)   AS new_donors,
      SUM(1-is_new) AS returning_donors,
      AVG(amount)   AS avg_amount
    FROM donations
    WHERE status = 'confirmed'
    GROUP BY ad_name
  `).all();

  // Map donation by ad_name
  const donMap = {};
  for (const d of donResult.results) donMap[d.ad_name] = d;

  // Gabung FB + Onpay
  const ads = fbResult.results.map(ad => {
    const don = donMap[ad.ad_name] || {
      donor_count: 0, total_revenue: 0,
      new_donors: 0, returning_donors: 0, avg_amount: 0
    };
    const roas_actual = ad.spend > 0 ? (don.total_revenue / ad.spend) : 0;
    return { ...ad, ...don, roas_actual };
  });

  // Summary
  const totalSpend   = ads.reduce((s, a) => s + (a.spend || 0), 0);
  const totalRevenue = ads.reduce((s, a) => s + (a.total_revenue || 0), 0);

  return json({
    ok: true,
    summary: {
      total_spend:   totalSpend,
      total_revenue: totalRevenue,
      overall_roas:  totalSpend > 0 ? totalRevenue / totalSpend : 0,
      total_ads:     ads.length,
      winners:       ads.filter(a => a.roas_actual >= 1).length,
    },
    ads,
    synced_at: new Date().toISOString(),
  }, 200, c);
}

// ─── API: DONATIONS ───────────────────────────────────────────────────────────
async function getDonations(request, env, c) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  const result = await env.DB.prepare(`
    SELECT * FROM donations
    WHERE status = 'confirmed'
    ORDER BY confirmed_at DESC
    LIMIT ?
  `).bind(limit).all();

  return json({ ok: true, donations: result.results }, 200, c);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getAction(arr, type) {
  if (!Array.isArray(arr)) return 0;
  return parseFloat(arr.find(a => a.action_type === type)?.value || 0);
}

async function logSync(env, type, status, message) {
  await env.DB.prepare(
    'INSERT INTO sync_log (type, status, message) VALUES (?, ?, ?)'
  ).bind(type, status, String(message)).run();
}
