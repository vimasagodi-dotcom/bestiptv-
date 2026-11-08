const crypto = require('crypto');

const REPO = 'vimasagodi-dotcom/bestiptv-';
const BRANCH = 'panel-data';
const FILE_PATH = 'panel-db.enc';

// Configuração Oficial Firebase — Projeto: cocas-iptv
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
  1: { years: 1, price: 5, label: '1 Ano — 5 €' },
  2: { years: 2, price: 9, label: '2 Anos — 9 €' },
  3: { years: 3, price: 13, label: '3 Anos — 13 €' },
  4: { years: 4, price: 16, label: '4 Anos — 16 €' },
  5: { years: 5, price: 19, label: '5 Anos — 19 €' },
};

const DEFAULT_AD_CONFIG = {
  enabled: true,
  durationSec: 5,
  title: 'Torne-se Membro VIP da Comunidade Cocas!',
  subtitle: 'Remova toda a publicidade ao mudar de canal e tenha acesso VIP ao Chat da Comunidade.',
  plansText: '1 Ano: 5€ · 2 Anos: 9€ · 3 Anos: 13€ · 4 Anos: 16€ · 5 Anos: 19€',
  imageUrl: '',
};

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
      text: 'Bem-vindo ao Chat Oficial da Comunidade Cocas! Escolha o seu nickname e participe.',
      ts: Date.now(),
    },
  ];
  db.chatTopic = db.chatTopic || '🔥 Bem-vindo à Comunidade Cocas! Respeite os membros e moderadores.';
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
    const res = await fetch(FIRESTORE_DOC_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Also sync public chat state document for easy inspection in Firebase Console
    fetch(FIRESTORE_PUBLIC_DOC_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          chatTopic: { stringValue: String(db.chatTopic || '') },
          chatUsersJson: { stringValue: JSON.stringify(db.chatUsers || []) },
          recentMessagesJson: { stringValue: JSON.stringify((db.chatMessages || []).slice(-60)) },
          updatedAt: { integerValue: String(Date.now()) },
        },
      }),
    }).catch(() => {});

    return res.ok;
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
      headers: { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' },
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
    if (action === 'chat_state') {
      const room = String(body.room || 'geral').toLowerCase();
      const nick = String(body.nick || '').trim();
      const panelUsername = String(body.panelUsername || '').trim();

      let myProfile = null;
      if (nick) {
        let cu = db.chatUsers.find((u) => u.nick.toLowerCase() === nick.toLowerCase());
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
            role: isPaidMember ? 'member' : 'guest',
            banned: false,
            muted: false,
            room,
            lastSeenAt: Date.now(),
          };
          db.chatUsers.push(cu);
          saveDb(db, sha).catch(() => {});
        } else {
          if (cu.role === 'guest' && isPaidMember) cu.role = 'member';
          cu.lastSeenAt = Date.now();
          cu.room = room;
        }
        myProfile = cu;
      }

      const roleOrder = { owner: 0, admin: 1, mod: 2, member: 3, guest: 4 };
      const sortedUsers = [...db.chatUsers]
        .filter((u) => !u.banned)
        .sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4));

      const messages = db.chatMessages.filter((m) => (m.room || 'geral') === room).slice(-60);
      return res.status(200).json({
        ok: true,
        topic: db.chatTopic,
        myProfile,
        chatUsers: sortedUsers,
        messages,
      });
    }

    if (action === 'chat_send') {
      const nick = String(body.nick || '').trim();
      const text = String(body.text || '').trim();
      const room = String(body.room || 'geral').toLowerCase();
      const panelUsername = String(body.panelUsername || '').trim();
      if (!nick || !text) {
        return res.status(400).json({ ok: false, error: 'Mensagem vazia.' });
      }

      let cu = db.chatUsers.find((u) => u.nick.toLowerCase() === nick.toLowerCase());
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

      const msg = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        room,
        nick: cu.nick,
        role: cu.role,
        text: text.slice(0, 400),
        ts: Date.now(),
      };
      db.chatMessages.push(msg);
      if (db.chatMessages.length > 150) {
        db.chatMessages = db.chatMessages.slice(-150);
      }
      await saveDb(db, sha);

      const messages = db.chatMessages.filter((m) => (m.room || 'geral') === room).slice(-60);
      return res.status(200).json({ ok: true, messages, myProfile: cu });
    }

    // In-chat moderation by Chat Owners/Admins/Mods
    if (action === 'chat_mod_action') {
      const actorNick = String(body.actorNick || '').trim();
      const targetNick = String(body.targetNick || '').trim();
      const modOp = String(body.modOp || ''); // 'mute' | 'unmute' | 'ban' | 'delete_msg'
      const msgId = String(body.msgId || '');

      const actor = db.chatUsers.find((u) => u.nick.toLowerCase() === actorNick.toLowerCase());
      if (!actor || !['owner', 'admin', 'mod'].includes(actor.role)) {
        return res.status(403).json({ ok: false, error: 'Sem permissões de moderação no chat.' });
      }

      if (modOp === 'delete_msg' && msgId) {
        db.chatMessages = db.chatMessages.filter((m) => m.id !== msgId);
      } else if (targetNick) {
        const target = db.chatUsers.find((u) => u.nick.toLowerCase() === targetNick.toLowerCase());
        if (target && target.role !== 'owner') {
          if (modOp === 'mute') target.muted = !target.muted;
          if (modOp === 'ban' && ['owner', 'admin'].includes(actor.role)) target.banned = !target.banned;
        }
      }
      await saveDb(db, sha);
      return res.status(200).json({ ok: true });
    }

    // 1. Client login from Cocas App
    if (action === 'client_login') {
      const usr = String(body.username || '').trim().toLowerCase();
      const pwd = String(body.password || '').trim();
      if (!usr || !pwd) {
        return res.status(400).json({ ok: false, error: 'Introduza o utilizador e a palavra-passe.' });
      }
      const foundIdx = (db.users || []).findIndex(
        (u) => String(u.username || '').trim().toLowerCase() === usr && String(u.password || '').trim() === pwd
      );
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

      found.lastSeenAt = Date.now();
      if (body.device) found.device = String(body.device);
      saveDb(db, sha).catch(() => {});

      const xtFromM3u = parseXtreamUrl(found.m3uUrl || found.server);
      if (found.playlistType === 'xtream' || xtFromM3u) {
        const server = xtFromM3u ? xtFromM3u.server : normalizeServerUrl(found.server);
        const xtreamUser = xtFromM3u ? xtFromM3u.username : String(found.xtreamUser || '').trim();
        const xtreamPass = xtFromM3u ? xtFromM3u.password : String(found.xtreamPass || '').trim();
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
            url: String(found.m3uUrl || '').trim(),
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
        return {
          ...u,
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
      }

      const isOffer = Boolean(u.isOffer || u.planPrice === 0 || String(u.planPrice) === '0');
      const planYears = [1, 2, 3, 4, 5].includes(Number(u.planYears)) ? Number(u.planYears) : (existing?.planYears || 1);
      const planInfo = PLANS[planYears] || PLANS[1];
      const planPrice = isOffer ? 0 : planInfo.price;
      const createdAt = existing?.createdAt || Date.now();
      const baseDate = u.renewFromNow ? Date.now() : createdAt;
      const appExpDate = u.appExpDate ? Number(u.appExpDate) : addYearsMs(baseDate, planInfo.years);

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
