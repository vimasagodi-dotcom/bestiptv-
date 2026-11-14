const { Readable } = require('stream');

// Short-lived in-memory cache (3s) for resolved HLS manifests.
// Crucial for iOS (expo-video): VideoPlayerItem.swift fires two simultaneous requests
// (AVURLAsset.load + fetchHlsVideoTracks) within ~10ms. Without this cache, single-connection
// IPTV servers see 2 hits to the main panel and invalidate the first session token!
const manifestCache = new Map();
const MANIFEST_CACHE_TTL_MS = 3000;

const USER_AGENTS = [
  'IPTVSmartersPlayer',
  'VLC/3.0.20 LibVLC/3.0.20',
  'TiviMate/4.7.0 (Linux; Android 12)',
];

const XTREAM_LIVE_RE = /^(https?:\/\/[^/\s]+)(?:\/live)?\/([^/\s]+)\/([^/\s]+)\/(\d+)(?:\.(m3u8|ts))?(\?.*)?$/i;

function getOriginUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.cocas.online';
  return `${proto}://${host}`;
}

async function fetchUpstream(url, extraHeaders = {}, timeoutMs = 9000) {
  let lastErr = null;
  for (const ua of USER_AGENTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: '*/*',
          ...extraHeaders,
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok || res.status === 206) {
        return { res, controller };
      }
      // If 403/401/404, try next User-Agent
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return { res: null, controller: null };
}

/**
 * Reads a slice of a continuous raw MPEG-TS (.ts) stream (~1.1 MB or ~2.8s),
 * aligned to the 188-byte MPEG-TS packet sync byte (0x47) so iOS AVPlayer
 * can play raw .ts channels via a live HLS wrapper manifest.
 */
async function streamAlignedTsSegment(targetUrl, res) {
  const { res: upstreamRes } = await fetchUpstream(targetUrl, {}, 9000);
  if (!upstreamRes || !upstreamRes.ok || !upstreamRes.body) {
    return res.status(502).send('Unable to open TS stream');
  }

  res.status(200);
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const reader = upstreamRes.body.getReader();
  const MAX_BYTES = 188 * 6000; // ~1.12 MB (exact multiple of 188 bytes)
  const MAX_DURATION_MS = 2800;
  const startTime = Date.now();
  let totalSent = 0;
  let aligned = false;
  let leftover = Buffer.alloc(0);

  try {
    while (totalSent < MAX_BYTES && Date.now() - startTime < MAX_DURATION_MS) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      let buf = leftover.length > 0 ? Buffer.concat([leftover, Buffer.from(value)]) : Buffer.from(value);

      if (!aligned) {
        // Find MPEG-TS sync byte 0x47 confirmed at offset and offset + 188
        let syncIdx = -1;
        for (let i = 0; i + 188 < buf.length; i++) {
          if (buf[i] === 0x47 && buf[i + 188] === 0x47) {
            syncIdx = i;
            break;
          }
        }
        if (syncIdx === -1) {
          if (buf.length > 1880) {
            // Not TS packet aligned, send as-is
            aligned = true;
          } else {
            leftover = buf;
            continue;
          }
        } else {
          buf = buf.slice(syncIdx);
          aligned = true;
        }
      }

      const validLen = buf.length - (buf.length % 188);
      if (validLen > 0) {
        const toSend = buf.slice(0, validLen);
        leftover = buf.slice(validLen);
        res.write(toSend);
        totalSent += toSend.length;
      } else {
        leftover = buf;
      }
    }
  } catch {
    // Client or upstream closed
  } finally {
    try {
      await reader.cancel();
    } catch {}
    res.end();
  }
}

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
    targetUrl = decodeURIComponent(rawUrl).trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }
  } catch {
    return res.status(400).send('Invalid url');
  }

  // Mode 1: Serve a clean 188-byte aligned MPEG-TS segment for raw .ts channels on iOS
  if (req.query.ts_seg === '1') {
    return streamAlignedTsSegment(targetUrl, res);
  }

  const forceHls = req.query.hls === '1';
  const directSegments = req.query.direct === '1';
  const originUrl = getOriginUrl(req);

  // Check short-lived manifest cache to prevent duplicate hits from iOS expo-video
  const cacheKey = `${targetUrl}|${forceHls}|${directSegments}`;
  const cached = manifestCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MANIFEST_CACHE_TTL_MS) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(cached.body);
  }

  try {
    // If forceHls=1 and URL is an Xtream URL, try .m3u8 first
    let candidateUrl = targetUrl;
    const xtMatch = targetUrl.match(XTREAM_LIVE_RE);
    if (forceHls && xtMatch) {
      const [, srvOrigin, user, pass, streamId, , qs = ''] = xtMatch;
      candidateUrl = `${srvOrigin}/live/${user}/${pass}/${streamId}.m3u8${qs}`;
    }

    const rangeHeader = req.headers.range ? { Range: req.headers.range } : {};
    let { res: upstreamRes } = await fetchUpstream(candidateUrl, rangeHeader, 8500);

    // If .m3u8 failed on Xtream URL, fallback to .ts URL
    if ((!upstreamRes || !upstreamRes.ok) && xtMatch) {
      const [, srvOrigin, user, pass, streamId, , qs = ''] = xtMatch;
      const tsFallback = `${srvOrigin}/live/${user}/${pass}/${streamId}.ts${qs}`;
      if (tsFallback !== candidateUrl) {
        const retry = await fetchUpstream(tsFallback, rangeHeader, 8500);
        if (retry.res && retry.res.ok) {
          upstreamRes = retry.res;
          candidateUrl = tsFallback;
        }
      }
    }

    if (!upstreamRes || !upstreamRes.ok) {
      return res.status(upstreamRes?.status || 502).send(`Upstream error: ${upstreamRes?.status || 502}`);
    }

    const finalUrl = upstreamRes.url || candidateUrl;
    const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();

    // Peek at the first chunk of the body to detect whether it's #EXTM3U or raw binary TS (0x47)
    const reader = upstreamRes.body ? upstreamRes.body.getReader() : null;
    if (!reader) {
      return res.status(502).send('Empty upstream body');
    }

    const firstRead = await reader.read();
    const firstChunk = firstRead.value ? Buffer.from(firstRead.value) : Buffer.alloc(0);
    const firstText = firstChunk.slice(0, 128).toString('utf8').trimStart();
    const isM3U8Content =
      firstText.startsWith('#EXTM3U') ||
      contentType.includes('mpegurl') ||
      contentType.includes('application/x-mpegurl');

    if (isM3U8Content) {
      // Read the rest of the M3U8 manifest (usually 200B - 4KB)
      const chunks = [firstChunk];
      let totalLen = firstChunk.length;
      while (!firstRead.done && totalLen < 512 * 1024) {
        const next = await reader.read();
        if (next.done || !next.value) break;
        const b = Buffer.from(next.value);
        chunks.push(b);
        totalLen += b.length;
      }
      try {
        await reader.cancel();
      } catch {}

      const text = Buffer.concat(chunks).toString('utf8');
      const lines = text.split(/\r?\n/);
      const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        // Rewrite URI="..." inside #EXT-X-KEY or #EXT-X-MAP tags
        if (trimmed.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/gi, (_, uriVal) => {
            try {
              const abs = new URL(uriVal, finalUrl).href;
              return directSegments
                ? `URI="${abs}"`
                : `URI="${originUrl}/api/stream?url=${encodeURIComponent(abs)}"`;
            } catch {
              return `URI="${uriVal}"`;
            }
          });
        }
        try {
          const resolved = new URL(trimmed, finalUrl).href;
          if (directSegments) {
            // If it's a nested .m3u8 variant playlist, keep it routed through /api/stream so tokens/headers stay intact
            if (/\.m3u8($|\?)/i.test(resolved)) {
              return `${originUrl}/api/stream?hls=1&direct=1&url=${encodeURIComponent(resolved)}&ext=.m3u8`;
            }
            return resolved;
          }
          return `${originUrl}/api/stream?url=${encodeURIComponent(resolved)}`;
        } catch {
          return line;
        }
      });

      const bodyOut = rewritten.join('\n');
      manifestCache.set(cacheKey, { ts: Date.now(), body: bodyOut });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(bodyOut);
    }

    // If forceHls=1 was requested (e.g. by iPhone AVPlayer) but the IPTV server returned
    // raw MPEG-TS binary bytes instead of #EXTM3U, wrap the raw .ts stream into a live HLS manifest!
    if (forceHls) {
      try {
        await reader.cancel();
      } catch {}

      const rawTsTarget = xtMatch
        ? `${xtMatch[1]}/live/${xtMatch[2]}/${xtMatch[3]}/${xtMatch[4]}.ts${xtMatch[6] || ''}`
        : finalUrl;

      const seq = Math.floor(Date.now() / 2800);
      const segBase = `${originUrl}/api/stream?ts_seg=1&url=${encodeURIComponent(rawTsTarget)}`;
      const syntheticM3u8 = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:3',
        `#EXT-X-MEDIA-SEQUENCE:${seq}`,
        '#EXTINF:2.8,',
        `${segBase}&seq=${seq}`,
        '#EXTINF:2.8,',
        `${segBase}&seq=${seq + 1}`,
        '#EXTINF:2.8,',
        `${segBase}&seq=${seq + 2}`,
      ].join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(syntheticM3u8);
    }

    // Otherwise stream binary content (.ts, .mp4, etc.) directly
    res.status(upstreamRes.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentLen = upstreamRes.headers.get('content-length');
    if (contentLen) res.setHeader('Content-Length', contentLen);
    res.setHeader('Cache-Control', 'no-cache');

    if (firstChunk.length > 0) {
      res.write(firstChunk);
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).send('Stream error: ' + (err.message || 'connection failed'));
    } else {
      res.end();
    }
  }
};
