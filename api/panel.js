const crypto = require('crypto');

const REPO = 'vimasagodi-dotcom/bestiptv-';
const BRANCH = 'panel-data';
const FILE_PATH = 'panel-db.enc';

// Configuração Firebase — Projeto: cocas-iptv
const FIREBASE_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyBlKw07SpE40G38CaZ6viJNFpCVcwHo3Gw',
  authDomain: 'cocas-iptv.firebaseapp.com',
  projectId: 'cocas-iptv',
  storageBucket: 'cocas-iptv.firebasestorage.app',
  messagingSenderId: '425316020423',
  appId: '1:425316020423:web:1833d9fa8925ff181a0ee2',
  measurementId: 'G-Q8FV1PDF5N',
};

const FIRESTORE_DOC_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/cocas_vault/main?key=${FIREBASE_CONFIG.apiKey}`;
const FIRESTORE_PUBLIC_DOC_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/cocas_chat/public_state?key=${FIREBASE_CONFIG.apiKey}`;

const PLANS = {
  '6m': { key: '6m', months: 6, years: 0.5, price: 6, label: '6 Meses — 6 €' },
  '12m': { key: '12m', months: 12, years: 1, price: 10, label: '12 Meses — 10 €' },
  1: { key: '12m', months: 12, years: 1, price: 10, label: '12 Meses — 10 €' },
};

const DEFAULT_AD_CONFIG = {
  enabled: true,
  durationSec: 5,
  title: 'Torne-se Membro VIP da Comunidade Cocas!',
  subtitle: 'Remova toda a publicidade ao mudar de canal e tenha acesso VIP ao Chat da Comunidade.',
  plansText: '6 Meses: 6€ · 12 Meses: 10€',
  imageUrl: '',
  bannerEnabled: true,
  bannerText: 'DaPortas · Portas, Roupeiros e Soluções por Medida',
  bannerSubtext: 'Visite daportas.pt · Qualidade e Design',
  bannerImageUrl: '',
  bannerLinkUrl: '',
  apkDownloadUrl: 'https://expo.dev/artifacts/eas/SZp1mYng3LMok3awjQyWVvyqq3eCt9Z_zaPK3Fv2fHM.apk',
};

function getKey() {
  const secret = process.env.PANEL_SECRET_KEY || 'default-kiko-secret-key-32-chars!!';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

// AES-256-GCM line credentials encryption at rest (RGPD & Data Protection Compliance)
const LINE_ENCRYPTION_SECRET = process.env.LINE_ENCRYPTION_KEY || process.env.PANEL_VAULT_KEY || process.env.PANEL_SECRET_KEY || 'cocas_media_player_legal_aes256_key_2026';
const LINE_KEY = crypto.createHash('sha256').update(String(LINE_ENCRYPTION_SECRET)).digest();

function encryptLineCredential(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (str.startsWith('enc_v1:')) return str;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', LINE_KEY, iv);
  const enc = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc_v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptLineCredential(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (!str.startsWith('enc_v1:')) return str;
  try {
    const parts = str.split(':');
    if (parts.length !== 4) return str;
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const enc = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', LINE_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Strong PBKDF2 Password Hashing with Salt
function hashPassword(plain) {
  if (!plain) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(plain), salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;
  const pStr = String(plain);
  const sStr = String(stored);
  if (sStr.startsWith('pbkdf2$')) {
    const parts = sStr.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHash = parts[2];
    const calculatedHash = crypto.pbkdf2Sync(pStr, salt, 100000, 64, 'sha512').toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    } catch {
      return false;
    }
  }
  // Legacy plain-text backwards compatibility
  return pStr === sStr || pStr.toLowerCase() === sStr.toLowerCase();
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
    'User-Agent': 'Cocas-ControlPanel',
    'Content-Type': 'application/json',
  };
}

function ensureDbShape(db) {
  db.adminPassword = db.adminPassword || 'admin';
  db.users = Array.isArray(db.users) ? db.users : [];
  db.chatUsers = Array.isArray(db.chatUsers) ? db.chatUsers : [];
  db.chatMessages = Array.isArray(db.chatMessages) ? db.chatMessages : [
    {
      id: 'welcome-1',
      room: 'geral',
      nick: 'CocasBot',
      role: 'owner',
      text: 'Bem-vindo ao Chat da Comunidade Cocas! Lembra-te: é estritamente proibido partilhar listas ou links de terceiros.',
      ts: Date.now(),
    },
  ];
  db.chatTopic = db.chatTopic || '🔥 Bem-vindo à Comunidade Cocas! Respeite os membros e moderadores.';
  db.chatReports = Array.isArray(db.chatReports) ? db.chatReports : [];
  db.modLogs = Array.isArray(db.modLogs) ? db.modLogs : [];
  db.takedownNotices = Array.isArray(db.takedownNotices) ? db.takedownNotices : [];
  db.adConfig = { ...DEFAULT_AD_CONFIG, ...(db.adConfig || {}) };
  return db;
}

async function loadBackupVault() {
  const url = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const res = await fetch(url, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) {
    return {
      db: ensureDbShape({}),
      sha: null,
    };
  }
  if (!res.ok) {
    throw new Error(`Storage read error (${res.status})`);
  }
  const meta = await res.json();
  const raw = Buffer.from(meta.content || '', 'base64').toString('utf8');
  try {
    return { db: ensureDbShape(decrypt(raw)), sha: meta.sha };
  } catch {
    return { db: ensureDbShape({}), sha: meta.sha };
  }
}

async function saveToFirestore(db, encryptedStr) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const body = {
      fields: {
        encryptedPayload: { stringValue: encryptedStr },
        updatedAt: { integerValue: String(Date.now()) },
        usersCount: { integerValue: String((db.users || []).length) },
        chatUsersCount: { integerValue: String((db.chatUsers || []).length) },
      },
    };
    const [res] = await Promise.all([
      fetch(FIRESTORE_DOC_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      fetch(FIRESTORE_PUBLIC_DOC_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            chatTopic: { stringValue: String(db.chatTopic || '') },
            chatUsersJson: { stringValue: JSON.stringify(db.chatUsers || []) },
            recentMessagesJson: { stringValue: JSON.stringify((db.chatMessages || []).slice(-60)) },
            usersMetaJson: {
              stringValue: JSON.stringify(
                (db.users || []).map((u) => ({
                  username: u.username,
                  name: u.name,
                  xtreamUser: u.xtreamUser,
                  playlistType: u.playlistType,
                  hasServer: Boolean(u.server),
                  hasM3u: Boolean(u.m3uUrl),
                  active: u.active,
                }))
              ),
            },
            updatedAt: { integerValue: String(Date.now()) },
          },
        }),
        signal: controller.signal,
      }).catch(() => null),
    ]);
    clearTimeout(timer);

    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

async function loadDb() {
  let firebaseStatus = 'pending_firestore_init';
  let fbDb = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const fbRes = await fetch(FIRESTORE_DOC_URL, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);

    if (fbRes.ok) {
      const doc = await fbRes.json();
      const rawEnc = doc?.fields?.encryptedPayload?.stringValue;
      if (rawEnc) {
        fbDb = ensureDbShape(decrypt(rawEnc));
        firebaseStatus = 'connected';
      }
    } else if (fbRes.status === 404) {
      // Firestore is enabled and reachable, document not created yet -> migrate immediately!
      firebaseStatus = 'connected';
    }
  } catch {
    // Fallback to backup vault
  }

  const backup = await loadBackupVault().catch(() => ({ db: ensureDbShape({}), sha: null }));

  if (fbDb) {
    fbDb._firebaseStatus = firebaseStatus;
    return { db: fbDb, sha: backup.sha };
  }

  // If Firestore was just enabled (404), auto-seed Firestore from the existing vault
  if (firebaseStatus === 'connected' && backup.db) {
    saveToFirestore(backup.db, encrypt(backup.db)).catch(() => {});
  }

  backup.db._firebaseStatus = firebaseStatus;
  return backup;
}

async function saveDb(db, sha) {
  const cleanDb = { ...db };
  delete cleanDb._firebaseStatus;
  const encrypted = encrypt(cleanDb);

  // 1. Write to Firebase Cloud Firestore (cocas-iptv)
  const fbPromise = saveToFirestore(cleanDb, encrypted);

  // 2. Write to encrypted backup vault
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
    const fresh = await loadBackupVault();
    body.sha = fresh.sha || undefined;
    const retryRes = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify(body),
    });
    if (!retryRes.ok) {
      const fbOk = await fbPromise;
      if (!fbOk) {
        throw new Error(`Storage write error (${retryRes.status})`);
      }
    }
  }
  await fbPromise;
}

function parseXtreamUrl(rawUrl) {
  if (!rawUrl) return null;
  let u = String(rawUrl).trim();
  if (!/^https?:\/\//i.test(u) && /\/get\.php\?/i.test(u)) {
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
    server: m[1].trim(),
    username: params.username.trim(),
    password: params.password.trim(),
  };
}

function normalizeServerUrl(srv) {
  let s = String(srv || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/(c|player_api\.php|get\.php|panel_api\.php|xmltv\.php)(\?.*)?\/?$/i, '');
  return s.replace(/\/+$/, '');
}

async function fetchXtreamLineInfo(server, username, password, timeoutMs = 4500) {
  const base = normalizeServerUrl(server);
  const usr = String(username || '').trim();
  const pwd = String(password || '').trim();
  if (!base || !usr || !pwd) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const apiUrl = `${base}/player_api.php?username=${encodeURIComponent(usr)}&password=${encodeURIComponent(pwd)}`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'CocasMediaPlayer/1.0', Accept: '*/*' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const u = data?.user_info;
    if (!u || Number(u.auth) === 0) {
      return { valid: false, error: 'Credenciais Xtream inválidas na linha.' };
    }
    const expSec = u.exp_date ? Number(u.exp_date) : null;
    return {
      valid: true,
      status: String(u.status || 'Active'),
      expDate: expSec && !Number.isNaN(expSec) ? expSec * 1000 : null,
      activeCons: Number(u.active_cons ?? 0),
      maxCons: Number(u.max_connections ?? 1),
      server: base,
      username: usr,
      password: pwd,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function addMonthsMs(baseMs, months) {
  const d = new Date(baseMs);
  d.setMonth(d.getMonth() + Number(months));
  return d.getTime();
}

function addYearsMs(baseMs, years) {
  const d = new Date(baseMs);
  d.setFullYear(d.getFullYear() + Number(years));
  return d.getTime();
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

    if (action === 'inspect_line') {
      const autoXt = parseXtreamUrl(body.m3uUrl) || parseXtreamUrl(body.server);
      const srv = autoXt ? autoXt.server : body.server;
      const usr = autoXt ? autoXt.username : body.xtreamUser;
      const pwd = autoXt ? autoXt.password : body.xtreamPass;

      if (!srv || !usr || !pwd) {
        return res.status(200).json({
          ok: false,
          error: 'Forneça um link M3U (com get.php?username=...) ou Servidor + Utilizador + Password Xtream.',
        });
      }
      const info = await fetchXtreamLineInfo(srv, usr, pwd, 6000);
      if (!info) {
        return res.status(200).json({
          ok: false,
          error: 'Não foi possível contactar o servidor da linha para ler a data.',
        });
      }
      if (!info.valid) {
        return res.status(200).json({ ok: false, error: info.error });
      }
      return res.status(200).json({ ok: true, lineInfo: info });
    }

    const { db, sha } = await loadDb();

    // Public Ad Config fetch for the app
    if (action === 'get_ad_config') {
      return res.status(200).json({ ok: true, adConfig: db.adConfig });
    }

    // ---- COMMUNITY CHAT ACTIONS (xat.com style) ----
    // Each nickname is bound to the account (ownerKey) that created it, so another
    // login on the same phone is treated as a NEW community member.
    const NICK_TAKEN_ERR = 'Este nickname já pertence a outro membro da comunidade. Escolha outro.';
    const claimNick = (cu, ownerKey) => {
      if (!cu) return true;
      if (!ownerKey) return !cu.ownerKey;
      if (!cu.ownerKey) {
        cu.ownerKey = ownerKey;
        return true;
      }
      return cu.ownerKey === ownerKey;
    };

    if (action === 'chat_state') {
      const room = String(body.room || 'geral').toLowerCase();
      const nick = String(body.nick || '').trim();
      const panelUsername = String(body.panelUsername || '').trim();
      const ownerKey = String(body.ownerKey || '').trim();

      let myProfile = null;
      if (nick) {
        let cu = db.chatUsers.find((u) => u.nick.toLowerCase() === nick.toLowerCase());
        if (cu && !claimNick(cu, ownerKey)) {
          return res.status(200).json({ ok: false, code: 'nick_taken', error: NICK_TAKEN_ERR });
        }
        const isPaidMember = Boolean(
          panelUsername &&
            db.users.some(
              (u) =>
                u.username.toLowerCase() === panelUsername.toLowerCase() &&
                u.active !== false &&
                (!u.appExpDate || Date.now() <= Number(u.appExpDate))
            )
        );
        if (!cu) {
          cu = {
            nick,
            ownerKey: ownerKey || null,
            role: isPaidMember ? 'member' : 'guest',
            banned: false,
            muted: false,
            room,
            avatar: String(body.avatar || '').trim(),
            lastSeenAt: Date.now(),
          };
          db.chatUsers.push(cu);
          await saveDb(db, sha).catch(() => {});
        } else {
          if (cu.role === 'guest' && isPaidMember) cu.role = 'member';
          if (body.avatar) cu.avatar = String(body.avatar).trim();
          cu.lastSeenAt = Date.now();
          cu.room = room;
        }
        myProfile = cu;
      }

      // In-memory typing tracker (cleaned up automatically)
      db.typingUsers = db.typingUsers || {};
      const nowTs = Date.now();
      for (const k of Object.keys(db.typingUsers)) {
        if (!db.typingUsers[k] || nowTs - (db.typingUsers[k].ts || 0) > 4000) {
          delete db.typingUsers[k];
        }
      }
      if (nick && body.typing) {
        db.typingUsers[nick.toLowerCase()] = { nick, room, ts: nowTs };
      }
      const typingList = Object.values(db.typingUsers)
        .filter((t) => t.room === room && t.nick.toLowerCase() !== nick.toLowerCase())
        .map((t) => t.nick);

      // Online threshold: active in the last 25 seconds
      const ONLINE_THRESHOLD_MS = 25000;
      const roleOrder = { owner: 0, admin: 1, mod: 2, member: 3, guest: 4 };
      const sortedUsers = [...db.chatUsers]
        .filter((u) => !u.banned && u.lastSeenAt && (nowTs - Number(u.lastSeenAt) <= ONLINE_THRESHOLD_MS))
        .sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4));

      // Active private rooms where this user is a participant
      let privateRooms = [];
      if (nick) {
        const myLower = nick.toLowerCase();
        const privMap = new Map();
        for (const m of db.chatMessages) {
          const r = String(m.room || '').toLowerCase();
          if (r.startsWith('priv_')) {
            const raw = r.replace('priv_', '');
            const parts = raw.split('__');
            if (parts.includes(myLower)) {
              const other = parts.find((p) => p !== myLower) || myLower;
              const matchUser = db.chatUsers.find((u) => u.nick.toLowerCase() === other);
              const displayNick = matchUser ? matchUser.nick : other;
              privMap.set(r, { id: r, targetNick: displayNick });
            }
          }
        }
        privateRooms = Array.from(privMap.values());
      }

      const messages = db.chatMessages.filter((m) => (m.room || 'geral') === room).slice(-50);
      return res.status(200).json({
        ok: true,
        topic: db.chatTopic,
        myProfile,
        chatUsers: sortedUsers,
        messages,
        privateRooms,
        typingList,
      });
    }

    if (action === 'chat_send') {
      const nick = String(body.nick || '').trim();
      const text = String(body.text || '').trim();
      const room = String(body.room || 'geral').toLowerCase();
      const panelUsername = String(body.panelUsername || '').trim();
      const ownerKey = String(body.ownerKey || '').trim();
      if (!nick || !text) {
        return res.status(400).json({ ok: false, error: 'Mensagem vazia.' });
      }

      let cu = db.chatUsers.find((u) => u.nick.toLowerCase() === nick.toLowerCase());
      if (cu && !claimNick(cu, ownerKey)) {
        return res.status(403).json({ ok: false, code: 'nick_taken', error: NICK_TAKEN_ERR });
      }
      const isPaidMember = Boolean(
        panelUsername &&
          db.users.some(
            (u) =>
              u.username.toLowerCase() === panelUsername.toLowerCase() &&
              u.active !== false &&
              (!u.appExpDate || Date.now() <= Number(u.appExpDate))
          )
      );

      if (!cu) {
        cu = {
          nick,
          ownerKey: ownerKey || null,
          role: isPaidMember ? 'member' : 'guest',
          banned: false,
          muted: false,
          room,
          lastSeenAt: Date.now(),
        };
        db.chatUsers.push(cu);
      } else {
        cu.lastSeenAt = Date.now();
        cu.room = room;
        if (cu.role === 'guest' && isPaidMember) cu.role = 'member';
      }

      if (cu.banned) {
        return res.status(403).json({ ok: false, error: 'O seu nickname foi banido do chat pelo administrador.' });
      }
      if (cu.muted) {
        return res.status(403).json({ ok: false, error: 'Está temporariamente silenciado (mute) no chat.' });
      }

      // Legal & Anti-Piracy filter: block IPTV playlist / credential leaks & pirate links
      const IPTV_PATTERN = /(?:player_api\.php|get\.php\?|\.m3u8?(?:$|[?&#])|username=[^&\s]+&password=[^&\s]+|xtream-codes|server_info|user_info|mag\/stb)/i;
      if (IPTV_PATTERN.test(text)) {
        return res.status(400).json({
          ok: false,
          error: 'Aviso Legal: É expressamente proibido partilhar credenciais de linhas IPTV, listas (.m3u/.m3u8) ou links piratas na comunidade Cocas.',
        });
      }

      // Anti-spam cooldown (1.2s)
      const nowMsg = Date.now();
      if (cu.lastMsgAt && nowMsg - cu.lastMsgAt < 1200) {
        return res.status(429).json({ ok: false, error: 'Aguarde 1 segundo antes de enviar outra mensagem (anti-spam).' });
      }
      cu.lastMsgAt = nowMsg;
      if (body.avatar) cu.avatar = String(body.avatar).trim();

      const msg = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        room,
        nick: cu.nick,
        role: cu.role,
        avatar: cu.avatar || '',
        text: text.slice(0, 400),
        ts: Date.now(),
      };
      db.chatMessages.push(msg);
      if (db.chatMessages.length > 150) {
        db.chatMessages = db.chatMessages.slice(-150);
      }
      await saveDb(db, sha);

      const messages = db.chatMessages.filter((m) => (m.room || 'geral') === room).slice(-50);
      return res.status(200).json({ ok: true, messages, myProfile: cu });
    }

    // In-chat moderation by Chat Owners/Admins/Mods or message author
    if (action === 'chat_mod_action') {
      const actorNick = String(body.actorNick || '').trim();
      const targetNick = String(body.targetNick || '').trim();
      const modOp = String(body.modOp || ''); // 'mute' | 'unmute' | 'ban' | 'kick' | 'delete_msg'
      const msgId = String(body.msgId || '');

      const actor = db.chatUsers.find((u) => u.nick.toLowerCase() === actorNick.toLowerCase());
      const actorOwnerKey = String(body.ownerKey || '').trim();

      // Deleting a message: Allowed for moderator/admin/owner OR if the message belongs to actorNick
      if (modOp === 'delete_msg' && msgId) {
        const targetMsg = (db.chatMessages || []).find((m) => m.id === msgId);
        const isAuthor = targetMsg && targetMsg.nick.toLowerCase() === actorNick.toLowerCase();
        const isMod = actor && ['owner', 'admin', 'mod'].includes(actor.role);
        if (!isAuthor && !isMod) {
          return res.status(403).json({ ok: false, error: 'Sem permissões para apagar esta mensagem.' });
        }
        db.chatMessages = db.chatMessages.filter((m) => m.id !== msgId);
      } else {
        if (
          !actor ||
          !['owner', 'admin', 'mod'].includes(actor.role) ||
          (actor.ownerKey && actor.ownerKey !== actorOwnerKey)
        ) {
          return res.status(403).json({ ok: false, error: 'Sem permissões de moderação no chat.' });
        }

        if (targetNick) {
          const target = db.chatUsers.find((u) => u.nick.toLowerCase() === targetNick.toLowerCase());
          if (target && target.role !== 'owner') {
            if (modOp === 'mute') target.muted = !target.muted;
            if (modOp === 'ban' && ['owner', 'admin'].includes(actor.role)) target.banned = !target.banned;
            if (modOp === 'kick' && ['owner', 'admin', 'mod'].includes(actor.role)) {
              db.chatUsers = db.chatUsers.filter((u) => u.nick.toLowerCase() !== targetNick.toLowerCase());
            }
          }
        }
      }

      // Record mod audit log (DSA & Moderation Compliance)
      db.modLogs = Array.isArray(db.modLogs) ? db.modLogs : [];
      db.modLogs.push({
        id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actorNick: actor.nick,
        actorRole: actor.role,
        targetNick: targetNick || null,
        modOp,
        msgId: msgId || null,
        ts: Date.now(),
      });
      if (db.modLogs.length > 200) db.modLogs = db.modLogs.slice(-200);

      await saveDb(db, sha);
      return res.status(200).json({ ok: true });
    }

    // Report illicit content / spam message in chat
    if (action === 'chat_report_msg') {
      const reporterNick = String(body.reporterNick || '').trim();
      const msgId = String(body.msgId || '').trim();
      const reason = String(body.reason || 'Conteúdo ilícito ou violação dos termos').trim();
      const msg = (db.chatMessages || []).find((m) => m.id === msgId);
      db.chatReports = Array.isArray(db.chatReports) ? db.chatReports : [];
      db.chatReports.push({
        id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        reporterNick: reporterNick || 'Anónimo',
        msgId,
        reportedNick: msg ? msg.nick : 'Desconhecido',
        reportedText: msg ? msg.text : '',
        reason,
        status: 'pendente',
        ts: Date.now(),
      });
      if (db.chatReports.length > 200) db.chatReports = db.chatReports.slice(-200);
      await saveDb(db, sha).catch(() => {});
      return res.status(200).json({ ok: true, message: 'Denúncia registada. A equipa de moderação irá avaliar com brevidade.' });
    }

    // DSA Notice & Takedown Form submission
    if (action === 'notice_takedown') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const contentUrl = String(body.contentUrl || '').trim();
      const description = String(body.description || '').trim();
      const legalBasis = String(body.legalBasis || '').trim();
      if (!name || !email || !description) {
        return res.status(400).json({ ok: false, error: 'Por favor preencha nome, email e descrição da notificação.' });
      }
      db.takedownNotices = Array.isArray(db.takedownNotices) ? db.takedownNotices : [];
      db.takedownNotices.push({
        id: `dsa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        contentUrl,
        description,
        legalBasis,
        status: 'recebido',
        ts: Date.now(),
      });
      if (db.takedownNotices.length > 200) db.takedownNotices = db.takedownNotices.slice(-200);
      await saveDb(db, sha).catch(() => {});
      return res.status(200).json({ ok: true, message: 'Notificação recebida com sucesso. A equipa responderá com celeridade.' });
    }

    // 1. Client login from Cocas App & Web
    if (action === 'client_login') {
      const usr = String(body.username || '').trim().toLowerCase();
      const pwd = String(body.password || '').trim();
      if (!usr || !pwd) {
        return res.status(400).json({ ok: false, error: 'Introduza o utilizador e a palavra-passe.' });
      }
      const foundIdx = (db.users || []).findIndex((u) => {
        const uUsr = String(u.username || '').trim().toLowerCase();
        const uEmail = String(u.email || '').trim().toLowerCase();
        const userMatch = uUsr === usr || (uEmail && uEmail === usr);
        return userMatch && verifyPassword(pwd, u.password);
      });
      if (foundIdx < 0) {
        return res.status(401).json({ ok: false, error: 'Utilizador ou palavra-passe incorretos.' });
      }
      const found = db.users[foundIdx];
      if (found.active === false) {
        return res.status(403).json({ ok: false, error: 'Esta conta encontra-se suspensa.' });
      }
      if (found.appExpDate && Date.now() > Number(found.appExpDate)) {
        return res.status(403).json({
          ok: false,
          error: 'A validade do seu acesso Cocas expirou. Contacte o suporte para renovar.',
        });
      }

      // Upgrade plain password to PBKDF2 hash on login
      if (!String(found.password).startsWith('pbkdf2$')) {
        found.password = hashPassword(pwd);
      }

      found.lastSeenAt = Date.now();
      if (body.device) found.device = String(body.device);
      await saveDb(db, sha).catch(() => {});

      const decM3u = decryptLineCredential(found.m3uUrl);
      const decServer = decryptLineCredential(found.server);
      const decXtUser = decryptLineCredential(found.xtreamUser);
      const decXtPass = decryptLineCredential(found.xtreamPass);

      const xtFromM3u = parseXtreamUrl(decM3u || decServer);
      const hasXtreamFields = Boolean(decServer && decXtUser && decXtPass);
      if (found.playlistType === 'xtream' || xtFromM3u || hasXtreamFields) {
        const server = xtFromM3u ? xtFromM3u.server : normalizeServerUrl(decServer);
        const xtreamUser = xtFromM3u ? xtFromM3u.username : String(decXtUser || '').trim();
        const xtreamPass = xtFromM3u ? xtFromM3u.password : String(decXtPass || '').trim();
        return res.status(200).json({
          ok: true,
          playlist: {
            name: found.name || `Cocas (${found.username})`,
            type: 'xtream',
            server,
            username: xtreamUser,
            password: xtreamPass,
            liveFormat: found.liveFormat || 'm3u8',
            panelUsername: found.username,
            appExpDate: found.appExpDate || null,
            planYears: found.planYears || 1,
            planPrice: found.isOffer ? 0 : (found.planPrice ?? 5),
            isOffer: Boolean(found.isOffer),
          },
        });
      } else {
        return res.status(200).json({
          ok: true,
          playlist: {
            name: found.name || `Cocas (${found.username})`,
            type: 'm3u',
            url: String(decM3u || '').trim(),
            liveFormat: found.liveFormat || 'm3u8',
            panelUsername: found.username,
            appExpDate: found.appExpDate || null,
            planYears: found.planYears || 1,
            planPrice: found.isOffer ? 0 : (found.planPrice ?? 5),
            isOffer: Boolean(found.isOffer),
          },
        });
      }
    }

    // 1b. Client Registration from Web (obligatory user account creation + legal consent)
    if (action === 'client_register') {
      const rawUser = String(body.username || '').trim().toLowerCase().replace(/\s+/g, '_');
      const name = String(body.name || '').trim() || rawUser; // RGPD Art. 5: Name is optional, defaults to username
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const lineType = String(body.lineType || 'xtream').toLowerCase();
      const server = String(body.server || '').trim();
      const xtreamUser = String(body.xtreamUser || '').trim();
      const xtreamPass = String(body.xtreamPass || '').trim();
      const m3uUrl = String(body.m3uUrl || '').trim();
      const legalConsent = Boolean(body.legalConsent);

      if (!legalConsent) {
        return res.status(200).json({
          ok: false,
          error: 'É obrigatório declarar que tens direito legal a aceder à tua linha e aceitar os Termos e a Política de Privacidade.',
        });
      }
      if (!email || !email.includes('@') || !email.includes('.')) {
        return res.status(200).json({ ok: false, error: 'Por favor introduz um endereço de email válido.' });
      }
      if (!rawUser || rawUser.length < 3) {
        return res.status(200).json({ ok: false, error: 'O nome de utilizador deve ter pelo menos 3 caracteres.' });
      }
      if (!password || password.length < 4) {
        return res.status(200).json({ ok: false, error: 'A palavra-passe deve ter pelo menos 4 caracteres.' });
      }

      // Check unique username (no duplicates allowed for login and chat)
      const userExists = (db.users || []).some(
        (u) => String(u.username || '').toLowerCase() === rawUser
      );
      if (userExists) {
        return res.status(200).json({
          ok: false,
          error: 'Este nome de utilizador já se encontra registado. Escolhe outro.',
        });
      }

      const emailExists = (db.users || []).some(
        (u) => String(u.email || '').toLowerCase() === email
      );
      if (emailExists) {
        return res.status(200).json({
          ok: false,
          error: 'Este email já está associado a outra conta. Faz login ou utiliza outro email.',
        });
      }

      if (lineType === 'xtream') {
        if (!server || !xtreamUser || !xtreamPass) {
          return res.status(200).json({
            ok: false,
            error: 'Preenche o servidor, utilizador e password da tua linha Xtream.',
          });
        }
      } else if (lineType === 'm3u') {
        if (!m3uUrl) {
          return res.status(200).json({
            ok: false,
            error: 'Por favor introduz o link da tua lista M3U.',
          });
        }
      }

      const newUser = {
        id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        email,
        username: rawUser,
        password: hashPassword(password),
        playlistType: lineType === 'xtream' ? 'xtream' : 'm3u',
        server: lineType === 'xtream' ? encryptLineCredential(normalizeServerUrl(server)) : '',
        xtreamUser: lineType === 'xtream' ? encryptLineCredential(xtreamUser) : '',
        xtreamPass: lineType === 'xtream' ? encryptLineCredential(xtreamPass) : '',
        m3uUrl: lineType === 'm3u' ? encryptLineCredential(m3uUrl) : '',
        liveFormat: 'm3u8',
        isSelfRegistered: true,
        isPrivateLine: true, // Administrator cannot view customer's private line
        active: true,
        legalConsent: true,
        legalConsentAt: Date.now(),
        termsAcceptedAt: Date.now(),
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      };

      db.users.push(newUser);

      // Bind username to chat as VIP Member
      let cu = db.chatUsers.find((u) => u.nick.toLowerCase() === rawUser);
      if (!cu) {
        db.chatUsers.push({
          nick: rawUser,
          ownerKey: `panel:${rawUser}`,
          role: 'member',
          banned: false,
          muted: false,
          room: 'geral',
          lastSeenAt: Date.now(),
        });
      } else {
        cu.role = 'member';
        cu.ownerKey = `panel:${rawUser}`;
        cu.lastSeenAt = Date.now();
      }

      await saveDb(db, sha).catch(() => {});

      return res.status(200).json({
        ok: true,
        playlist: {
          name: newUser.name,
          type: newUser.playlistType,
          server: lineType === 'xtream' ? normalizeServerUrl(server) : '',
          username: lineType === 'xtream' ? xtreamUser : '',
          password: lineType === 'xtream' ? xtreamPass : '',
          m3uUrl: lineType === 'm3u' ? m3uUrl : '',
          liveFormat: 'm3u8',
          panelUsername: newUser.username,
        },
      });
    }

    // 1c. Member updates their own line details (with consent & AES-256 encryption)
    if (action === 'update_my_line') {
      const usr = String(body.username || '').trim().toLowerCase();
      const pwd = String(body.password || '').trim();
      const lineType = String(body.lineType || 'xtream').toLowerCase();
      const server = String(body.server || '').trim();
      const xtreamUser = String(body.xtreamUser || '').trim();
      const xtreamPass = String(body.xtreamPass || '').trim();
      const m3uUrl = String(body.m3uUrl || '').trim();
      const legalConsent = Boolean(body.legalConsent);

      if (!legalConsent) {
        return res.status(200).json({
          ok: false,
          error: 'É obrigatório declarar que tens direito legal a aceder ao conteúdo da tua linha.',
        });
      }

      const user = (db.users || []).find(
        (u) => String(u.username || '').toLowerCase() === usr && verifyPassword(pwd, u.password)
      );
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });
      }

      user.playlistType = lineType === 'xtream' ? 'xtream' : 'm3u';
      if (lineType === 'xtream') {
        user.server = encryptLineCredential(normalizeServerUrl(server));
        user.xtreamUser = encryptLineCredential(xtreamUser);
        user.xtreamPass = encryptLineCredential(xtreamPass);
        user.m3uUrl = '';
      } else {
        user.m3uUrl = encryptLineCredential(m3uUrl);
        user.server = '';
        user.xtreamUser = '';
        user.xtreamPass = '';
      }
      user.isPrivateLine = true;
      user.lineConsentAt = Date.now();
      user.lastSeenAt = Date.now();

      await saveDb(db, sha).catch(() => {});

      return res.status(200).json({
        ok: true,
        playlist: {
          name: user.name,
          type: user.playlistType,
          server: lineType === 'xtream' ? normalizeServerUrl(server) : '',
          username: lineType === 'xtream' ? xtreamUser : '',
          password: lineType === 'xtream' ? xtreamPass : '',
          m3uUrl: lineType === 'm3u' ? m3uUrl : '',
          liveFormat: 'm3u8',
          panelUsername: user.username,
        },
      });
    }

    // GDPR Data Portability: export_my_data
    if (action === 'export_my_data') {
      const usr = String(body.username || '').trim().toLowerCase();
      const pwd = String(body.password || '').trim();
      const user = (db.users || []).find(
        (u) => String(u.username || '').toLowerCase() === usr && verifyPassword(pwd, u.password)
      );
      if (!user) {
        return res.status(401).json({ ok: false, error: 'Credenciais inválidas.' });
      }

      const userMessages = (db.chatMessages || []).filter(
        (m) => String(m.nick || '').toLowerCase() === usr
      );

      const exportData = {
        exportedAt: new Date().toISOString(),
        service: 'Cocas Media Player (www.cocas.online)',
        compliance: 'RGPD / Regulamento Geral sobre a Proteção de Dados (UE 2016/679)',
        account: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
          lastSeenAt: user.lastSeenAt ? new Date(user.lastSeenAt).toISOString() : null,
          legalConsent: Boolean(user.legalConsent),
          legalConsentAt: user.legalConsentAt ? new Date(user.legalConsentAt).toISOString() : null,
          termsAcceptedAt: user.termsAcceptedAt ? new Date(user.termsAcceptedAt).toISOString() : null,
        },
        lineConfiguration: {
          type: user.playlistType,
          server: decryptLineCredential(user.server),
          xtreamUser: decryptLineCredential(user.xtreamUser),
          m3uUrl: decryptLineCredential(user.m3uUrl),
        },
        chatActivity: {
          messagesCount: userMessages.length,
          messages: userMessages.map((m) => ({
            id: m.id,
            room: m.room,
            text: m.text,
            timestamp: new Date(m.ts).toISOString(),
          })),
        },
      };

      return res.status(200).json({ ok: true, data: exportData });
    }

    // GDPR Right to Erasure: delete_my_account
    if (action === 'delete_my_account') {
      const usr = String(body.username || '').trim().toLowerCase();
      const pwd = String(body.password || '').trim();
      const userIndex = (db.users || []).findIndex(
        (u) => String(u.username || '').toLowerCase() === usr && verifyPassword(pwd, u.password)
      );
      if (userIndex < 0) {
        return res.status(401).json({ ok: false, error: 'Credenciais inválidas. Não foi possível apagar a conta.' });
      }

      // 1. Remove user
      db.users.splice(userIndex, 1);
      // 2. Remove chat user profile
      db.chatUsers = (db.chatUsers || []).filter(
        (u) => String(u.nick || '').toLowerCase() !== usr
      );
      // 3. Remove all chat messages authored by user
      db.chatMessages = (db.chatMessages || []).filter(
        (m) => String(m.nick || '').toLowerCase() !== usr
      );

      await saveDb(db, sha);
      return res.status(200).json({ ok: true, message: 'A sua conta, linhas associadas e mensagens foram apagadas permanentemente.' });
    }

    // Fetch channels for Web Player (supports Xtream Codes and M3U playlists, bypassing browser CORS & Mixed-Content)
    if (action === 'get_web_channels') {
      let srv = normalizeServerUrl(decryptLineCredential(body.server));
      let usr = decryptLineCredential(body.username);
      let pwd = decryptLineCredential(body.password);
      const m3uUrl = decryptLineCredential(body.m3uUrl);

      if (m3uUrl) {
        const parsed = parseXtreamUrl(m3uUrl);
        if (parsed) {
          srv = normalizeServerUrl(parsed.server);
          usr = parsed.username;
          pwd = parsed.password;
        }
      }

      if (srv && usr && pwd) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 7000);
          const url = `${srv}/player_api.php?username=${encodeURIComponent(usr)}&password=${encodeURIComponent(pwd)}&action=get_live_streams`;
          const r = await fetch(url, {
            headers: { 'User-Agent': 'CocasMediaPlayer/1.0' },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (r.ok) {
            const list = await r.json();
            if (Array.isArray(list) && list.length > 0) {
              const channels = list.slice(0, 150).map((c) => ({
                id: c.stream_id,
                num: c.num || c.stream_id,
                name: c.name || `Canal ${c.stream_id}`,
                logo: c.stream_icon || '',
                url: `${srv}/live/${usr}/${pwd}/${c.stream_id}.m3u8`,
                tsUrl: `${srv}/live/${usr}/${pwd}/${c.stream_id}.ts`,
                directUrl: `${srv}/live/${usr}/${pwd}/${c.stream_id}.ts`,
              }));
              return res.status(200).json({ ok: true, channels });
            }
          }
        } catch (e) {}
      }

      // If raw M3U playlist provided
      if (m3uUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 7000);
          const r = await fetch(m3uUrl, {
            headers: { 'User-Agent': 'CocasMediaPlayer/1.0' },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!r.ok) return res.status(200).json({ ok: false, error: 'Não foi possível carregar a lista M3U.' });
          const text = await r.text();
          const lines = text.split('\n');
          const channels = [];
          let currentName = '';
          let currentLogo = '';
          for (let i = 0; i < lines.length && channels.length < 100; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXTINF:')) {
              const nameMatch = line.match(/,(.+)$/);
              currentName = nameMatch ? nameMatch[1].trim() : 'Canal';
              const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
              currentLogo = logoMatch ? logoMatch[1] : '';
            } else if (line && !line.startsWith('#')) {
              if (currentName) {
                channels.push({
                  id: channels.length + 1,
                  num: channels.length + 1,
                  name: currentName,
                  logo: currentLogo,
                  url: line,
                });
                currentName = '';
                currentLogo = '';
              }
            }
          }
          if (channels.length > 0) {
            return res.status(200).json({ ok: true, channels });
          }
        } catch (e) {
          return res.status(200).json({ ok: false, error: 'Erro ao processar M3U: ' + e.message });
        }
      }

      if (!srv || !usr || !pwd) {
        return res.status(200).json({ ok: false, error: 'Dados da linha incompletos ou inválidos.' });
      }

      return res.status(200).json({ ok: false, error: 'Não foi possível ler canais com estes dados.' });
    }

    // 2. Real-time Heartbeat from Cocas Player
    if (action === 'heartbeat') {
      const panelUsr = String(body.panelUsername || '').trim().toLowerCase();
      const xtUsr = String(body.xtreamUser || '').trim().toLowerCase();
      const channelName = body.playing === false ? null : String(body.channelName || '').trim() || null;
      const device = String(body.device || '').trim() || undefined;

      if (!panelUsr && !xtUsr) {
        return res.status(200).json({ ok: true });
      }

      const idx = (db.users || []).findIndex((u) => {
        if (panelUsr && String(u.username || '').trim().toLowerCase() === panelUsr) return true;
        if (xtUsr && String(u.xtreamUser || '').trim().toLowerCase() === xtUsr) return true;
        return false;
      });

      if (idx >= 0) {
        const u = db.users[idx];
        const prevChannel = u.currentChannel || null;
        const now = Date.now();
        const elapsed = now - (u.lastSeenAt || 0);
        u.lastSeenAt = now;
        u.currentChannel = channelName;
        if (device) u.device = device;

        if (prevChannel !== channelName || elapsed > 40000) {
          await saveDb(db, sha);
        }
      }
      return res.status(200).json({ ok: true });
    }

    // Verify Admin Password for all admin actions
    const adminPass = String(body.adminPassword || '').trim();
    if (!adminPass || adminPass !== db.adminPassword) {
      return res.status(401).json({
        ok: false,
        error: 'Palavra-passe de Administrador incorreta (Padrão inicial: admin).',
      });
    }

    // 3. Admin List Users + Chat Users + Ad Config
    if (action === 'admin_list') {
      const users = db.users || [];
      let changed = false;

      await Promise.all(
        users.slice(0, 12).map(async (u) => {
          const autoXt = parseXtreamUrl(u.m3uUrl || u.server);
          const srv = autoXt ? autoXt.server : u.server;
          const xUsr = autoXt ? autoXt.username : u.xtreamUser;
          const xPwd = autoXt ? autoXt.password : u.xtreamPass;
          if (srv && xUsr && xPwd) {
            const info = await fetchXtreamLineInfo(srv, xUsr, xPwd, 2500);
            if (info && info.valid) {
              if (info.expDate !== u.lineExpDate) {
                u.lineExpDate = info.expDate;
                changed = true;
              }
              u.lineStatus = info.status;
              u.lineActiveCons = info.activeCons;
              u.lineMaxCons = info.maxCons;
            }
          }
        })
      );

      if (changed) {
        saveDb(db, sha).catch(() => {});
      }

      const now = Date.now();
      const enriched = users.map((u) => {
        const recentlySeen = u.lastSeenAt && now - u.lastSeenAt < 110000;
        const lineActive = Number(u.lineActiveCons || 0) > 0;
        const isOnline = Boolean((recentlySeen && u.currentChannel) || lineActive);
        const isPrivate = Boolean(u.isPrivateLine || u.isSelfRegistered);
        return {
          ...u,
          server: isPrivate ? '🔒 [Linha Privada do Membro]' : u.server,
          xtreamUser: isPrivate ? '🔒 [Protegido]' : u.xtreamUser,
          xtreamPass: isPrivate ? '🔒 [Protegido]' : u.xtreamPass,
          m3uUrl: isPrivate ? '🔒 [Linha Privada do Membro]' : u.m3uUrl,
          isOnline,
          currentChannel: recentlySeen ? u.currentChannel : lineActive ? (u.currentChannel || 'Canal em Direto (Ativo na Linha)') : null,
        };
      });

      return res.status(200).json({
        ok: true,
        users: enriched,
        plans: PLANS,
        chatUsers: db.chatUsers,
        chatTopic: db.chatTopic,
        adConfig: db.adConfig,
        firebaseInfo: {
          projectId: FIREBASE_CONFIG.projectId,
          status: db._firebaseStatus || 'pending_firestore_init',
        },
      });
    }

    // Admin Update Chat User Role / Ban / Mute (xat.com style admin powers)
    if (action === 'admin_update_chat_user') {
      const nick = String(body.nick || '').trim();
      if (!nick) return res.status(400).json({ ok: false, error: 'Indique o nickname.' });
      let cu = db.chatUsers.find((u) => u.nick.toLowerCase() === nick.toLowerCase());
      if (!cu) {
        cu = { nick, role: 'guest', banned: false, muted: false, room: 'geral', lastSeenAt: Date.now() };
        db.chatUsers.push(cu);
      }
      if (body.role) cu.role = body.role;
      if (typeof body.banned === 'boolean') cu.banned = body.banned;
      if (typeof body.muted === 'boolean') cu.muted = body.muted;
      if (body.chatTopic !== undefined) db.chatTopic = String(body.chatTopic);
      await saveDb(db, sha);
      return res.status(200).json({ ok: true, chatUsers: db.chatUsers, chatTopic: db.chatTopic });
    }

    // Admin Save Ad Config
    if (action === 'admin_save_ad') {
      db.adConfig = { ...db.adConfig, ...(body.adConfig || {}) };
      if (body.chatTopic !== undefined) db.chatTopic = String(body.chatTopic);
      await saveDb(db, sha);
      return res.status(200).json({ ok: true, adConfig: db.adConfig, chatTopic: db.chatTopic });
    }

    // 4. Admin Save / Edit User & Line
    if (action === 'admin_save_user') {
      const u = body.user || {};
      const username = String(u.username || '').trim();
      const password = String(u.password || '').trim();
      if (!username || !password) {
        return res.status(400).json({ ok: false, error: 'Defina o Utilizador e a Password de login do cliente.' });
      }

      const existingIdx = (db.users || []).findIndex(
        (item) => (u.id && item.id === u.id) || item.username.toLowerCase() === username.toLowerCase()
      );
      const existing = existingIdx >= 0 ? db.users[existingIdx] : null;

      let playlistType = u.playlistType === 'm3u' ? 'm3u' : 'xtream';
      let server = normalizeServerUrl(u.server || '');
      let xtreamUser = String(u.xtreamUser || '').trim();
      let xtreamPass = String(u.xtreamPass || '').trim();
      let m3uUrl = String(u.m3uUrl || '').trim();

      const autoXt = parseXtreamUrl(m3uUrl) || parseXtreamUrl(u.server);
      if (autoXt) {
        playlistType = 'xtream';
        server = autoXt.server;
        xtreamUser = autoXt.username;
        xtreamPass = autoXt.password;
      } else if (server && xtreamUser && xtreamPass) {
        playlistType = 'xtream';
      }

      const isOffer = Boolean(u.isOffer || u.planPrice === 0 || String(u.planPrice) === '0');
      const rawPlanKey = String(u.planKey || u.planYears || '12m');
      const planKey = (rawPlanKey === '6m' || rawPlanKey === '6' || Number(rawPlanKey) === 0.5) ? '6m' : '12m';
      const planInfo = PLANS[planKey] || PLANS['12m'];
      const planPrice = isOffer ? 0 : planInfo.price;
      const createdAt = existing?.createdAt || Date.now();
      const baseDate = u.renewFromNow ? Date.now() : createdAt;
      const appExpDate = u.appExpDate ? Number(u.appExpDate) : addMonthsMs(baseDate, planInfo.months || 12);

      let lineExpDate = u.lineExpDate ?? existing?.lineExpDate ?? null;
      let lineStatus = existing?.lineStatus ?? 'Active';
      let lineActiveCons = existing?.lineActiveCons ?? 0;
      let lineMaxCons = existing?.lineMaxCons ?? 1;

      if (server && xtreamUser && xtreamPass) {
        const info = await fetchXtreamLineInfo(server, xtreamUser, xtreamPass, 4500);
        if (info && info.valid) {
          lineExpDate = info.expDate;
          lineStatus = info.status;
          lineActiveCons = info.activeCons;
          lineMaxCons = info.maxCons;
        }
      }

      const record = {
        id: existing ? existing.id : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
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
        planYears: planInfo.years,
        planPrice,
        isOffer,
        createdAt,
        appExpDate,
        lineExpDate,
        lineStatus,
        lineActiveCons,
        lineMaxCons,
        lastSeenAt: existing?.lastSeenAt || null,
        currentChannel: existing?.currentChannel || null,
        device: existing?.device || null,
        notes: String(u.notes || '').trim(),
        updatedAt: Date.now(),
      };

      if (existingIdx >= 0) {
        db.users[existingIdx] = record;
      } else {
        db.users.unshift(record);
      }

      await saveDb(db, sha);
      return res.status(200).json({ ok: true, users: db.users, savedUser: record });
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
