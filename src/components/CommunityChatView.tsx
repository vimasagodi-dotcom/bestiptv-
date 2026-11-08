import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useApp } from '../context/AppContext';
import { formatTime } from '../lib/utils';
import { colors, radius } from '../theme';

const PANEL_API_URLS = [
  'https://www.cocas.online/api/panel',
  'https://iptvcocas.vercel.app/api/panel',
];
const NICK_STORAGE_KEY = '@cocas/chatNick.v1';

type ChatRole = 'owner' | 'admin' | 'mod' | 'member' | 'guest';

interface ChatUser {
  nick: string;
  role: ChatRole;
  banned?: boolean;
  muted?: boolean;
  room?: string;
  lastSeenAt?: number;
}

interface ChatMessage {
  id: string;
  room: string;
  nick: string;
  role: ChatRole;
  text: string;
  ts: number;
}

interface PrivateRoom {
  id: string;
  targetNick: string;
}

async function requestChatApi(payload: Record<string, any>): Promise<any> {
  let lastErr = null;
  for (const url of PANEL_API_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 400 || res.status === 403) {
        return await res.json();
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

const ROLE_META: Record<ChatRole, { label: string; badge: string; color: string }> = {
  owner: { label: 'Dono', badge: '👑', color: '#F59E0B' },
  admin: { label: 'Admin', badge: '🛡️', color: '#E50914' },
  mod: { label: 'Moderador', badge: '⚔️', color: '#3B82F6' },
  member: { label: 'Membro VIP', badge: '⭐', color: '#10B981' },
  guest: { label: 'Visitante', badge: '👤', color: '#94A3B8' },
};

const ROOMS = [
  { id: 'geral', label: '#Geral' },
  { id: 'desporto', label: '#Desporto' },
  { id: 'ajuda', label: '#Ajuda' },
];

export interface CommunityChatViewProps {
  activeTab?: boolean;
  compact?: boolean;
  readOnly?: boolean;
}

export function CommunityChatView({ activeTab = true, compact = false, readOnly = false }: CommunityChatViewProps) {
  const { active } = useApp();
  const [savedNick, setSavedNick] = useState<string | null>(null);
  const [nickInput, setNickInput] = useState('');
  const [room, setRoom] = useState('geral');
  const [privateRooms, setPrivateRooms] = useState<PrivateRoom[]>([]);
  const [showUsersList, setShowUsersList] = useState(false);

  const [topic, setTopic] = useState('🔥 Bem-vindo ao Chat da Comunidade Cocas!');
  const [myProfile, setMyProfile] = useState<ChatUser | null>(null);
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const listRef = useRef<any>(null);

  // Each account (Cocas login or own line) has its OWN chat identity.
  // Switching account never reuses the previous account's nickname/role.
  const ownerKey = active?.panelUsername
    ? `panel:${active.panelUsername.trim().toLowerCase()}`
    : active?.username
    ? `line:${String(active.server || '').trim().toLowerCase()}|${active.username.trim().toLowerCase()}`
    : active?.url
    ? `m3u:${active.url.trim().toLowerCase()}`
    : active?.id
    ? `pl:${active.id}`
    : 'anon';
  const nickStorageKey = `${NICK_STORAGE_KEY}:${ownerKey}`;

  useEffect(() => {
    setSavedNick(null);
    setMyProfile(null);
    setMessages([]);
    setNickInput('');
    setPrivateRooms([]);
    AsyncStorage.getItem(nickStorageKey)
      .then((val) => {
        if (val) {
          setSavedNick(val);
          setNickInput(val);
        }
      })
      .catch(() => {});
  }, [nickStorageKey]);

  const fetchChatState = useCallback(
    async (silent = false) => {
      if (!savedNick && !readOnly) return;
      if (!silent) setLoading(true);
      try {
        const data = await requestChatApi({
          action: 'chat_state',
          room,
          nick: savedNick || 'Espectador',
          ownerKey,
          panelUsername: active?.panelUsername || '',
        });
        if (data?.ok) {
          if (data.topic) setTopic(data.topic);
          if (data.myProfile) setMyProfile(data.myProfile);
          if (Array.isArray(data.chatUsers)) setChatUsers(data.chatUsers);
          if (Array.isArray(data.messages)) setMessages(data.messages);
          if (Array.isArray(data.privateRooms)) {
            setPrivateRooms((prev) => {
              const map = new Map<string, PrivateRoom>();
              prev.forEach((p) => map.set(p.id, p));
              data.privateRooms.forEach((p: PrivateRoom) => {
                if (!map.has(p.id)) map.set(p.id, p);
              });
              return Array.from(map.values());
            });
          }
        } else if (data?.code === 'nick_taken' && !readOnly) {
          AsyncStorage.removeItem(nickStorageKey).catch(() => {});
          setSavedNick(null);
          setMyProfile(null);
          Alert.alert('Nickname ocupado', data.error || 'Este nickname já pertence a outro membro. Escolha outro.');
        }
      } catch {
        // ignore network hiccup
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [savedNick, readOnly, room, ownerKey, nickStorageKey, active?.panelUsername],
  );

  useEffect(() => {
    if (!activeTab || (!savedNick && !readOnly)) return;
    fetchChatState(false);
    const t = setInterval(() => {
      fetchChatState(true);
    }, 4000);
    return () => clearInterval(t);
  }, [activeTab, savedNick, readOnly, room, fetchChatState]);

  // Keep latest message pinned to bottom smoothly
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        try {
          listRef.current?.scrollToEnd?.({ animated: true });
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const handleSaveNick = async () => {
    const clean = nickInput.trim().replace(/\s+/g, '_').slice(0, 20);
    if (clean.length < 2) {
      Alert.alert('Nome inválido', 'Escolha um nome de utilizador com pelo menos 2 letras.');
      return;
    }
    try {
      const data = await requestChatApi({
        action: 'chat_state',
        room,
        nick: clean,
        ownerKey,
        panelUsername: active?.panelUsername || '',
      });
      if (data?.code === 'nick_taken') {
        Alert.alert('Nickname ocupado', data.error || 'Este nickname já pertence a outro membro. Escolha outro.');
        return;
      }
    } catch {
      // offline: allow and verify later
    }
    try {
      await AsyncStorage.setItem(nickStorageKey, clean);
    } catch {
      // ignore
    }
    setSavedNick(clean);
  };

  const handleSend = async () => {
    const msgText = text.trim();
    if (!msgText || !savedNick || sending) return;
    setSending(true);
    setText('');
    try {
      const data = await requestChatApi({
        action: 'chat_send',
        room,
        nick: savedNick,
        ownerKey,
        text: msgText,
        panelUsername: active?.panelUsername || '',
      });
      if (!data?.ok) {
        Alert.alert('Chat Cocas', data?.error || 'Não foi possível enviar a mensagem.');
      } else {
        if (Array.isArray(data.messages)) setMessages(data.messages);
        if (data.myProfile) setMyProfile(data.myProfile);
      }
    } catch {
      Alert.alert('Erro', 'Verifique a sua ligação à internet.');
    } finally {
      setSending(false);
    }
  };

  const openPrivateRoom = (targetNick: string) => {
    if (!savedNick) return;
    if (targetNick.toLowerCase() === savedNick.toLowerCase()) return;
    const pair = [savedNick.toLowerCase(), targetNick.toLowerCase()].sort();
    const privId = `priv_${pair[0]}__${pair[1]}`;
    setPrivateRooms((prev) => {
      if (prev.some((p) => p.id === privId)) return prev;
      return [...prev, { id: privId, targetNick }];
    });
    setRoom(privId);
    setShowUsersList(false);
  };

  const closePrivateRoom = (privId: string) => {
    setPrivateRooms((prev) => prev.filter((p) => p.id !== privId));
    if (room === privId) {
      setRoom('geral');
    }
  };

  const canModerate = myProfile && ['owner', 'admin', 'mod'].includes(myProfile.role);

  const handleUserClick = (target: ChatUser) => {
    if (!savedNick) return;
    const isSelf = target.nick.toLowerCase() === savedNick.toLowerCase();
    if (isSelf) return;

    const options: { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: `💬 Sala Privada com ${target.nick}`,
        onPress: () => openPrivateRoom(target.nick),
      },
    ];

    if (canModerate) {
      options.push({
        text: '⚙️ Opções de Moderação',
        onPress: () => handleModAction(target.nick),
      });
    }

    Alert.alert(`Membro: ${target.nick}`, 'Escolha a opção pretendida:', options);
  };

  const handleModAction = (targetNick: string, msgId?: string) => {
    if (!canModerate || !savedNick) return;
    Alert.alert(`Moderação: ${targetNick}`, 'Escolha a ação de moderador/admin:', [
      { text: 'Cancelar', style: 'cancel' },
      ...(msgId
        ? [
            {
              text: '🗑️ Apagar Mensagem',
              onPress: async () => {
                await requestChatApi({
                  action: 'chat_mod_action',
                  actorNick: savedNick,
                  ownerKey,
                  targetNick,
                  modOp: 'delete_msg',
                  msgId,
                });
                fetchChatState(true);
              },
            },
          ]
        : []),
      {
        text: '🔇 Silenciar / Desilenciar (Mute)',
        onPress: async () => {
          await requestChatApi({
            action: 'chat_mod_action',
            actorNick: savedNick,
            ownerKey,
            targetNick,
            modOp: 'mute',
          });
          fetchChatState(true);
        },
      },
      ...(myProfile?.role === 'owner' || myProfile?.role === 'admin'
        ? [
            {
              text: '🚫 Banir do Chat',
              style: 'destructive' as const,
              onPress: async () => {
                await requestChatApi({
                  action: 'chat_mod_action',
                  actorNick: savedNick,
                  ownerKey,
                  targetNick,
                  modOp: 'ban',
                });
                fetchChatState(true);
              },
            },
          ]
        : []),
    ]);
  };

  // Screen 1: Create Nickname before entering xat-style chat (bypassed if readOnly mode)
  if (!savedNick && !readOnly) {
    return (
      <View style={[styles.nickSetupWrap, compact && { padding: 12 }]}>
        <View style={[styles.nickCard, compact && { padding: 16 }]}>
          <View style={[styles.nickIconCircle, compact && { width: 44, height: 44, borderRadius: 22, marginBottom: 8 }]}>
            <Ionicons name="chatbubbles" size={compact ? 22 : 32} color="#fff" />
          </View>
          <Text style={[styles.nickTitle, compact && { fontSize: 16 }]}>Chat da Comunidade Cocas</Text>
          <Text style={[styles.nickSub, compact && { fontSize: 12, marginBottom: 10 }]}>
            Escolha o seu Nickname para conversar enquanto vê TV.
          </Text>

          <TextInput
            value={nickInput}
            onChangeText={setNickInput}
            placeholder="Ex: Victor_PT"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.nickInput, compact && { paddingVertical: 8, fontSize: 14 }]}
          />

          {!compact && (
            <View style={styles.rankLegendBox}>
              <Text style={styles.rankLegendTitle}>Estatutos na Sala (Estilo xat):</Text>
              <View style={styles.rankLegendRow}>
                <Text style={styles.rankLegendItem}>👑 Dono</Text>
                <Text style={styles.rankLegendItem}>🛡️ Admin</Text>
                <Text style={styles.rankLegendItem}>⚔️ Mod</Text>
                <Text style={styles.rankLegendItem}>⭐ Membro VIP</Text>
                <Text style={styles.rankLegendItem}>👤 Visitante</Text>
              </View>
            </View>
          )}

          <Pressable onPress={handleSaveNick} style={[styles.enterChatBtn, compact && { paddingVertical: 10, marginTop: 8 }]}>
            <Ionicons name="enter-outline" size={18} color="#fff" />
            <Text style={styles.enterChatBtnText}>Entrar no Chat</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const myRoleMeta = ROLE_META[myProfile?.role || 'guest'];
  const activePrivate = privateRooms.find((p) => p.id === room);
  const inputPlaceholder = activePrivate
    ? `Mensagem privada para ${activePrivate.targetNick}...`
    : `Escrever em #${room}...`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={compact ? 0 : 90}
    >
      {/* Top Header: Rooms + Private Rooms + Users Online Toggle + My Nickname */}
      <View style={[styles.topHeader, compact && { paddingHorizontal: 6, paddingVertical: 4 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roomsRow}
          style={{ flex: 1, marginRight: 6 }}
        >
          {ROOMS.map((r) => {
            const activeRoom = room === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRoom(r.id)}
                style={[
                  styles.roomChip,
                  compact && { paddingHorizontal: 8, paddingVertical: 4 },
                  activeRoom && styles.roomChipActive,
                ]}
              >
                <Text style={[styles.roomChipText, compact && { fontSize: 11 }, activeRoom && { color: '#fff' }]}>
                  {r.label}
                </Text>
              </Pressable>
            );
          })}

          {privateRooms.map((pr) => {
            const activeRoom = room === pr.id;
            return (
              <Pressable
                key={pr.id}
                onPress={() => setRoom(pr.id)}
                style={[
                  styles.roomChip,
                  styles.roomChipPrivate,
                  compact && { paddingHorizontal: 8, paddingVertical: 4 },
                  activeRoom && styles.roomChipActivePrivate,
                ]}
              >
                <Ionicons
                  name="lock-closed"
                  size={compact ? 10 : 11}
                  color={activeRoom ? '#fff' : colors.primary}
                  style={{ marginRight: 3 }}
                />
                <Text
                  style={[styles.roomChipText, compact && { fontSize: 11 }, activeRoom && { color: '#fff' }]}
                  numberOfLines={1}
                >
                  {pr.targetNick}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    closePrivateRoom(pr.id);
                  }}
                  style={styles.closePrivChip}
                >
                  <Ionicons name="close" size={11} color={activeRoom ? '#ffffffcc' : colors.textMuted} />
                </Pressable>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowUsersList((v) => !v)}
            style={[styles.usersToggleBtn, compact && { paddingHorizontal: 7, paddingVertical: 4 }, showUsersList && { backgroundColor: colors.primary }]}
          >
            <Ionicons name="people" size={compact ? 13 : 15} color="#fff" />
            <Text style={[styles.usersToggleText, compact && { fontSize: 11 }]}>{chatUsers.length}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              AsyncStorage.removeItem(nickStorageKey).catch(() => {});
              setSavedNick(null);
              setMyProfile(null);
            }}
            style={[styles.nickBadgeBtn, compact && { paddingHorizontal: 7, paddingVertical: 4 }]}>
            <Text style={[styles.nickBadgeText, compact && { fontSize: 11 }]}>
              {myRoleMeta.badge} {savedNick}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Topic Banner */}
      {!compact && (
        <View style={styles.topicBar}>
          <Text style={styles.topicText} numberOfLines={1}>
            {activePrivate ? `🔒 Conversa privada com ${activePrivate.targetNick}` : topic}
          </Text>
        </View>
      )}

      <View style={styles.bodyWrap}>
        {/* Messages Area */}
        <View style={{ flex: 1 }}>
          {loading && messages.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={[styles.msgList, { flexGrow: 1, justifyContent: 'flex-end' }]}
              onContentSizeChange={() => {
                try {
                  listRef.current?.scrollToEnd?.({ animated: true });
                } catch {}
              }}
              onLayout={() => {
                try {
                  listRef.current?.scrollToEnd?.({ animated: false });
                } catch {}
              }}
              renderItem={({ item }) => {
                const rMeta = ROLE_META[item.role] || ROLE_META.guest;
                const isMe = Boolean(savedNick && item.nick.toLowerCase() === savedNick.toLowerCase());
                return (
                  <Pressable
                    onLongPress={() => canModerate && handleModAction(item.nick, item.id)}
                    style={[styles.msgRow, isMe && styles.msgRowMe]}
                  >
                    <View style={styles.msgHeader}>
                      <Text style={[styles.msgNick, { color: rMeta.color }]}>
                        {rMeta.badge} {item.nick}
                      </Text>
                      <Text style={styles.msgTime}>{formatTime(item.ts)}</Text>
                    </View>
                    <Text style={styles.msgText}>{item.text}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/* Online Users List (with Private Room button) */}
        {showUsersList && (
          <View style={[styles.usersSidebar, compact && { width: 145 }]}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>UTILIZADORES ({chatUsers.length})</Text>
              <Pressable hitSlop={8} onPress={() => setShowUsersList(false)}>
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            <FlatList
              data={chatUsers}
              keyExtractor={(u) => u.nick}
              renderItem={({ item: u }) => {
                const rMeta = ROLE_META[u.role] || ROLE_META.guest;
                const isSelf = Boolean(savedNick && u.nick.toLowerCase() === savedNick.toLowerCase());
                return (
                  <Pressable
                    onPress={() => handleUserClick(u)}
                    style={styles.userPawnRow}
                  >
                    <Text style={{ fontSize: 13 }}>{rMeta.badge}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.userPawnNick, { color: rMeta.color }]} numberOfLines={1}>
                        {u.nick}
                      </Text>
                      {u.muted && <Text style={styles.userPawnMuted}>🔇 Mudo</Text>}
                    </View>
                    {!isSelf && (
                      <Pressable
                        onPress={() => openPrivateRoom(u.nick)}
                        style={styles.privBtn}
                        hitSlop={4}
                      >
                        <Ionicons name="lock-closed" size={10} color="#fff" />
                        <Text style={styles.privBtnText}>Privado</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              }}
            />
          </View>
        )}
      </View>

      {/* Message Input Bar (hidden in read-only overlay) */}
      {!readOnly && (
        <View style={[styles.inputBar, compact && { paddingHorizontal: 8, paddingVertical: 6 }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={inputPlaceholder}
            placeholderTextColor={colors.textMuted}
            style={[styles.chatInput, compact && { height: 36, fontSize: 12, paddingHorizontal: 10 }]}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable onPress={handleSend} style={[styles.sendBtn, compact && { width: 36, height: 36, borderRadius: 18 }]}>
            <Ionicons name="send" size={compact ? 14 : 16} color="#fff" />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  nickSetupWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  nickCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12,
  },
  nickIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nickTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  nickSub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  nickInput: {
    width: '100%',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  rankLegendBox: {
    width: '100%',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  rankLegendTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  rankLegendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  rankLegendItem: { color: '#fff', fontSize: 11, fontWeight: '600' },
  enterChatBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: radius.md,
    marginTop: 4,
  },
  enterChatBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roomsRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roomChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roomChipPrivate: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#E5091444',
  },
  roomChipActivePrivate: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  closePrivChip: {
    marginLeft: 5,
    padding: 1,
  },
  roomChipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  usersToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  usersToggleText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  nickBadgeBtn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nickBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  topicBar: {
    backgroundColor: '#191C26',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topicText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  bodyWrap: { flex: 1, flexDirection: 'row' },
  msgList: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 3,
  },
  msgRow: {
    backgroundColor: '#111522',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffffff0d',
    gap: 1,
  },
  msgRowMe: {
    borderColor: '#E5091444',
    backgroundColor: '#1a131b',
  },
  msgHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  msgNick: { fontSize: 11, fontWeight: '800' },
  msgTime: { color: colors.textMuted, fontSize: 9 },
  msgText: { color: '#e2e8f0', fontSize: 12, lineHeight: 16 },
  usersSidebar: {
    width: 155,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    padding: 6,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sidebarTitle: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  userPawnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ffffff10',
  },
  userPawnNick: { fontSize: 11, fontWeight: '800' },
  userPawnMuted: { color: colors.accent, fontSize: 8 },
  privBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
  },
  privBtnText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
