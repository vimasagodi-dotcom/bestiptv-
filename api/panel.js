const crypto = require('crypto');

const REPO = 'vimasagodi-dotcom/bestiptv-';
const BRANCH = 'panel-data';
const FILE_PATH = 'panel-db.enc';

function getKey() {
  const secret = process.env.PANEL_SECRET_KEY || 'default-kiko-secret-key-32-chars!!';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const json = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  });
}

function decrypt(payloadStr) {
  const payload = JSON.parse(payloadStr);
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'KikoIPTV-ControlPanel',
    'Content-Type': 'application/json',
  };
}

async function loadDb() {
  const url = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) {
    return {
      db: { adminPassword: 'admin', users: [] },
      sha: null,
    };
  }
  if (!res.ok) {
    throw new Error(`Storage read error (${res.status})`);
  }
  const meta = await res.json();
  const raw = Buffer.from(meta.content || '', 'base64').toString('utf8');
  try {
    return { db: decrypt(raw), sha: meta.sha };
  } catch {
    return { db: { adminPassword: 'admin', users: [] }, sha: meta.sha };
  }
}

async function saveDb(db, sha) {
  const encrypted = encrypt(db);
  const contentB64 = Buffer.from(encrypted, 'utf8').toString('base64');
  const url = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const body = {
    message: 'Update encrypted panel store',
    content: contentB64,
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Retry once on SHA conflict
    const fresh = await loadDb();
    body.sha = fresh.sha || undefined;
    const retryRes = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify(body),
    });
    if (!retryRes.ok) {
      throw new Error(`Storage write error (${retryRes.status})`);
    }
  }
}

function parseXtreamUrl(rawUrl) {
  if (!rawUrl) return null;
  let u = String(rawUrl).trim();
  if (!/^https?:\/\//i.test(u) && u.includes('/get.php?')) {
    u = 'http://' + u;
  }
  const m = u.match(/^(https?:\/\/[^/\s]+)\/get\.php\?(.*)$/i);
  if (!m) return null;
  const params = {};
  for (const part of m[2].split('&')) {
    const [k, v = ''] = part.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  if (!params.username || !params.password) return null;
  return {
    server: m[1],
    username: params.username.trim(),
    password: params.password.trim(),
  };
}

function normalizeServerUrl(srv) {
  let s = String(srv || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/(c|player_api\.php|get\.php.*|panel_api\.php)?\/?$/i, '');
  return s.replace(/\/+$/, '');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action || req.query?.action;

    const { db, sha } = await loadDb();

    // 1. Client login from KikoIPTV App (Username + Password defined in Control Panel)
    if (action === 'client_login') {
      const usr = String(body.username || '').trim().toLowerCase();
      const pwd = String(body.password || '').trim();
      if (!usr || !pwd) {
        return res.status(400).json({ ok: false, error: 'Introduza o utilizador e a palavra-passe.' });
      }
      const found = (db.users || []).find(
        (u) => String(u.username || '').trim().toLowerCase() === usr && String(u.password || '').trim() === pwd
      );
      if (!found) {
        return res.status(401).json({ ok: false, error: 'Utilizador ou palavra-passe incorretos no Painel KikoIPTV.' });
      }
      if (found.active === false) {
        return res.status(403).json({ ok: false, error: 'Esta conta encontra-se desativada no Painel de Controlo.' });
      }

      // Build playlist config for the app
      const xtFromM3u = parseXtreamUrl(found.m3uUrl || found.server);
      if (found.playlistType === 'xtream' || xtFromM3u) {
        const server = xtFromM3u ? xtFromM3u.server : normalizeServerUrl(found.server);
        const xtreamUser = xtFromM3u ? xtFromM3u.username : String(found.xtreamUser || '').trim();
        const xtreamPass = xtFromM3u ? xtFromM3u.password : String(found.xtreamPass || '').trim();
        return res.status(200).json({
          ok: true,
          playlist: {
            name: found.name || `KikoIPTV (${found.username})`,
            type: 'xtream',
            server,
            username: xtreamUser,
            password: xtreamPass,
            liveFormat: found.liveFormat || 'm3u8',
          },
        });
      } else {
        return res.status(200).json({
          ok: true,
          playlist: {
            name: found.name || `KikoIPTV (${found.username})`,
            type: 'm3u',
            url: String(found.m3uUrl || '').trim(),
            liveFormat: found.liveFormat || 'm3u8',
          },
        });
      }
    }

    // Verify Admin Password for all admin actions
    const adminPass = String(body.adminPassword || '').trim();
    if (!adminPass || adminPass !== db.adminPassword) {
      return res.status(401).json({
        ok: false,
        error: 'Palavra-passe de Administrador incorreta (Padrão inicial: admin).',
      });
    }

    if (action === 'admin_list') {
      return res.status(200).json({ ok: true, users: db.users || [] });
    }

    if (action === 'admin_save_user') {
      const u = body.user || {};
      const username = String(u.username || '').trim();
      const password = String(u.password || '').trim();
      if (!username || !password) {
        return res.status(400).json({ ok: false, error: 'Defina o Utilizador e a Password de login do cliente.' });
      }

      // Check duplicate username
      const existingIdx = (db.users || []).findIndex(
        (item) => item.id === u.id || item.username.toLowerCase() === username.toLowerCase()
      );

      let playlistType = u.playlistType === 'm3u' ? 'm3u' : 'xtream';
      let server = normalizeServerUrl(u.server || '');
      let xtreamUser = String(u.xtreamUser || '').trim();
      let xtreamPass = String(u.xtreamPass || '').trim();
      let m3uUrl = String(u.m3uUrl || '').trim();

      // Auto-extract Xtream credentials if the admin pasted a get.php?username=... M3U link
      const autoXt = parseXtreamUrl(m3uUrl) || parseXtreamUrl(u.server);
      if (autoXt) {
        playlistType = 'xtream';
        server = autoXt.server;
        xtreamUser = autoXt.username;
        xtreamPass = autoXt.password;
      }

      const record = {
        id: existingIdx >= 0 ? db.users[existingIdx].id : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        username,
        password,
        name: String(u.name || username).trim(),
        active: u.active !== false,
        playlistType,
        server,
        xtreamUser,
        xtreamPass,
        m3uUrl,
        liveFormat: u.liveFormat === 'ts' ? 'ts' : 'm3u8',
        notes: String(u.notes || '').trim(),
        updatedAt: Date.now(),
      };

      if (existingIdx >= 0) {
        db.users[existingIdx] = record;
      } else {
        db.users.unshift(record);
      }

      await saveDb(db, sha);
      return res.status(200).json({ ok: true, users: db.users });
    }

    if (action === 'admin_delete_user') {
      const id = String(body.id || '');
      db.users = (db.users || []).filter((item) => item.id !== id);
      await saveDb(db, sha);
      return res.status(200).json({ ok: true, users: db.users });
    }

    if (action === 'admin_change_password') {
      const nextPass = String(body.newAdminPassword || '').trim();
      if (!nextPass || nextPass.length < 3) {
        return res.status(400).json({ ok: false, error: 'A nova password deve ter pelo menos 3 caracteres.' });
      }
      db.adminPassword = nextPass;
      await saveDb(db, sha);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Ação inválida.' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Erro interno do servidor.' });
  }
};

