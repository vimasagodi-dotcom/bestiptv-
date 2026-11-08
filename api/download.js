// Dynamic download endpoint for cocas.online/tv and cocas.online/cocas.apk
// Always redirects to the latest active APK URL configured in the panel / firestore

const FALLBACK_APK_URL = 'https://expo.dev/artifacts/eas/SZp1mYng3LMok3awjQyWVvyqq3eCt9Z_zaPK3Fv2fHM.apk';

module.exports = async function handler(req, res) {
  // Never cache aggressively so changing the APK link takes effect instantly
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'] || 'www.cocas.online';

    const r = await fetch(`${proto}://${host}/api/panel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_ad_config' }),
    }).catch(() => null);

    if (r && r.ok) {
      const d = await r.json().catch(() => null);
      if (d?.ok && d?.adConfig?.apkDownloadUrl && d.adConfig.apkDownloadUrl.startsWith('http')) {
        return res.redirect(302, d.adConfig.apkDownloadUrl);
      }
    }
  } catch (e) {
    // fallback
  }

  return res.redirect(302, FALLBACK_APK_URL);
};

