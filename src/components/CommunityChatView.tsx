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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useApp } from '../context/AppContext';
import { formatTime } from '../lib/utils';
import { colors, radius } from '../theme';

const PANEL_API_URL = 'https://iptvcocas.vercel.app/api/panel';
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

const ROOMS = [
  { id: 'geral', label: '#Geral' },
  { id: 'desporto', label: '#Desporto' },
  { id: 'ajuda', label: '#Ajuda' },
];

const ROLE_META: Record<ChatRole, { label: string; badge: string; color: string }> = {
  owner: { label: 'Dono', badge: '👑', color: '#F59E0B' },
  admin: { label: 'Admin', badge: '🛡️', color: '#E50914' },
  mod: { label: 'Moderador', badge: '⚔️', color: '#3B82F6' },
  member: { label: 'Membro VIP', badge: '⭐', color: '#10B981' },
  guest: { label: 'Visitante', badge: '👤', color: '#94A3B8' },
};

export function CommunityChatView({ activeTab }: { activeTab: boolean }) {
  const { active } = useApp();
  const [savedNick, setSavedNick] = useState<string | null>(null);
  const [nickInput, setNickInput] = useState('');
  const [room, setRoom] = useState('geral');
  const [showUsersList, setShowUsersList] = useState(false);

  const [topic, setTopic] = useState('🔥 Bem-vindo ao Chat da Comunidade Cocas!');
  const [myProfile, setMyProfile] = useState<ChatUser | null>(null);
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const listRef = useRef<any>(null);

  useEffect(() => {
    AsyncStorage.getItem(NICK_STORAGE_KEY)
      .then((val) => {
        if (val) {
          setSavedNick(val);
          setNickInput(val);
        } else if (active?.panelUsername) {
          setNickInput(active.panelUsername);
        }
      })
      .catch(() => {});
  }, [active?.panelUsername]);

  const fetchChatState = useCallback(
    async (silent = false) => {
      if (!savedNick) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(PANEL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'chat_state',
            room,
            nick: savedNick,
            panelUsername: active?.panelUsername || '',
          }),
        });
        const data = await res.json();
        if (data?.ok) {
          if (data.topic) setTopic(data.topic);
          if (data.myProfile) setMyProfile(data.myProfile);
          if (Array.isArray(data.chatUsers)) setChatUsers(data.chatUsers);
          if (Array.isArray(data.messages)) setMessages(data.messages);
        }
      } catch {
        // ignore network hiccup
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [savedNick, room, active?.panelUsername],
  );

  useEffect(() => {
    if (!activeTab || !savedNick) return;
    fetchChatState(false);
    const t = setInterval(() => {
      fetchChatState(true);
    }, 5000);
    return () => clearInterval(t);
  }, [activeTab, savedNick, room, fetchChatState]);

  const handleSaveNick = async () => {
    const clean = nickInput.trim().replace(/\s+/g, '_').slice(0, 20);
    if (clean.length < 2) {
      Alert.alert('Nome inválido', 'Escolha um nome de utilizador com pelo menos 2 letras.');
      return;
    }
    try {
      await AsyncStorage.setItem(NICK_STORAGE_KEY, clean);
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
      const res = await fetch(PANEL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat_send',
          room,
          nick: savedNick,
          text: msgText,
          panelUsername: active?.panelUsername || '',
        }),
      });
      const data = await res.json();
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

  const canModerate = myProfile && ['owner', 'admin', 'mod'].includes(myProfile.role);

  const handleModAction = (targetNick: string, msgId?: string) => {
    if (!canModerate || !savedNick) return;
    Alert.alert(`Moderação: ${targetNick}`, 'Escolha a ação de moderador/admin:', [
      { text: 'Cancelar', style: 'cancel' },
      ...(msgId
        ? [
            {
              text: '🗑️ Apagar Mensagem',
              onPress: async () => {
                await fetch(PANEL_API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'chat_mod_action',
                    actorNick: savedNick,
                    targetNick,
                    modOp: 'delete_msg',
                    msgId,
                  }),
                });
                fetchChatState(true);
              },
            },
          ]
        : []),
      {
        text: '🔇 Silenciar / Desilenciar (Mute)',
        onPress: async () => {
          await fetch(PANEL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'chat_mod_action',
              actorNick: savedNick,
              targetNick,
              modOp: 'mute',
            }),
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
                await fetch(PANEL_API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'chat_mod_action',
                    actorNick: savedNick,
                    targetNick,
                    modOp: 'ban',
                  }),
                });
                fetchChatState(true);
              },
            },
          ]
        : []),
    ]);
  };

  // Screen 1: Create Nickname before entering xat-style chat
  if (!savedNick) {
    return (
      <View style={styles.nickSetupWrap}>
        <View style={styles.nickCard}>
          <View style={styles.nickIconCircle}>
            <Ionicons name="chatbubbles" size={32} color="#fff" />
          </View>
          <Text style={styles.nickTitle}>Chat da Comunidade Cocas</Text>
          <Text style={styles.nickSub}>
            Escolha o seu nome de utilizador (Nickname) para entrar nas salas da comunidade.
          </Text>

          <TextInput
            value={nickInput}
            onChangeText={setNickInput}
            placeholder="Ex: Victor_PT"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.nickInput}
          />

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

          <Pressable onPress={handleSaveNick} style={styles.enterChatBtn}>
            <Ionicons name="enter-outline" size={20} color="#fff" />
            <Text style={styles.enterChatBtnText}>Entrar no Chat</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const myRoleMeta = ROLE_META[myProfile?.role || 'guest'];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Top xat.com Header: Rooms + Users Online Toggle + My Nickname */}
      <View style={styles.topHeader}>
        <View style={styles.roomsRow}>
          {ROOMS.map((r) => {
            const activeRoom = room === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setRoom(r.id)}
                style={[styles.roomChip, activeRoom && styles.roomChipActive]}
              >
                <Text style={[styles.roomChipText, activeRoom && { color: '#fff' }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setShowUsersList((v) => !v)}
            style={[styles.usersToggleBtn, showUsersList && { backgroundColor: colors.primary }]}
          >
            <Ionicons name="people" size={16} color="#fff" />
            <Text style={styles.usersToggleText}>{chatUsers.length}</Text>
          </Pressable>
          <Pressable onPress={() => setSavedNick(null)} style={styles.nickBadgeBtn}>
            <Text style={styles.nickBadgeText}>
              {myRoleMeta.badge} {savedNick}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Topic Banner */}
      <View style={styles.topicBar}>
        <Text style={styles.topicText} numberOfLines={1}>
          {topic}
        </Text>
      </View>

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
              contentContainerStyle={styles.msgList}
              onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
              renderItem={({ item }) => {
                const rMeta = ROLE_META[item.role] || ROLE_META.guest;
                const isMe = item.nick.toLowerCase() === savedNick.toLowerCase();
                return (
                  <Pressable
                    onLongPress={() => canModerate && handleModAction(item.nick, item.id)}
                    style={[styles.msgRow, isMe && styles.msgRowMe]}
                  >
                    <View style={styles.msgHeader}>
                      <Text style={[styles.msgNick, { color: rMeta.color }]}>
                        {rMeta.badge} {item.nick}
                      </Text>
                      <View style={[styles.roleTag, { borderColor: rMeta.color }]}>
                        <Text style={[styles.roleTagText, { color: rMeta.color }]}>{rMeta.label}</Text>
                      </View>
                      <Text style={styles.msgTime}>{formatTime(item.ts)}</Text>
                    </View>
                    <Text style={styles.msgText}>{item.text}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/* xat.com Right Sidebar: Online Users by Rank */}
        {showUsersList && (
          <View style={styles.usersSidebar}>
            <Text style={styles.sidebarTitle}>NA SALA ({chatUsers.length})</Text>
            <FlatList
              data={chatUsers}
              keyExtractor={(u) => u.nick}
              renderItem={({ item: u }) => {
                const rMeta = ROLE_META[u.role] || ROLE_META.guest;
                return (
                  <Pressable
                    onPress={() => canModerate && handleModAction(u.nick)}
                    style={styles.userPawnRow}
                  >
                    <Text style={{ fontSize: 14 }}>{rMeta.badge}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userPawnNick, { color: rMeta.color }]} numberOfLines={1}>
                        {u.nick}
                      </Text>
                      <Text style={styles.userPawnRole}>
                        {rMeta.label} {u.muted ? '· 🔇' : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}
      </View>

      {/* Message Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Escrever em #${room}...`}
          placeholderTextColor={colors.textMuted}
          style={styles.chatInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable onPress={handleSend} style={styles.sendBtn}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  roomsRow: { flexDirection: 'row', gap: 6 },
  roomChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roomChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  usersToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  usersToggleText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  nickBadgeBtn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nickBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  topicBar: {
    backgroundColor: '#191C26',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topicText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  bodyWrap: { flex: 1, flexDirection: 'row' },
  msgList: { padding: 10, gap: 8 },
  msgRow: {
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  msgRowMe: {
    borderColor: '#E5091466',
    backgroundColor: '#19151B',
  },
  msgHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  msgNick: { fontSize: 13, fontWeight: '800' },
  roleTag: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  roleTagText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  msgTime: { marginLeft: 'auto', color: colors.textMuted, fontSize: 10 },
  msgText: { color: '#fff', fontSize: 14, lineHeight: 19 },
  usersSidebar: {
    width: 155,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    padding: 8,
  },
  sidebarTitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  userPawnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  userPawnNick: { fontSize: 12, fontWeight: '800' },
  userPawnRole: { color: colors.textMuted, fontSize: 10 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

