const { Readable } = require('stream');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = req.query.url;
  if (!rawUrl) {
    return res.status(400).send('Missing url parameter');
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }
  } catch {
    return res.status(400).send('Invalid url');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'IPTVSmartersPro/1.0',
        'Accept': '*/*',
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isM3U8 =
      targetUrl.includes('.m3u8') ||
      contentType.includes('mpegurl') ||
      contentType.includes('application/x-mpegURL');

    // If it's an M3U8 manifest, rewrite segment/playlist URLs so browser fetches them through our HTTPS proxy
    if (isM3U8) {
      const text = await upstreamRes.text();
      const lines = text.split('\n');
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        try {
          const resolved = new URL(trimmed, targetUrl).href;
          return `/api/stream?url=${encodeURIComponent(resolved)}`;
        } catch {
          return line;
        }
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(rewritten.join('\n'));
    }

    // Binary stream (.ts segments, etc.)
    res.status(upstreamRes.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentLen = upstreamRes.headers.get('content-length');
    if (contentLen) res.setHeader('Content-Length', contentLen);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (upstreamRes.body) {
      const nodeStream = Readable.fromWeb(upstreamRes.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send('Stream error: ' + (err.message || 'connection failed'));
    }
  }
};

