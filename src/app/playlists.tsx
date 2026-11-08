import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyView, IconButton, ScreenHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import type { Playlist } from '../lib/types';
import { colors, radius } from '../theme';

export default function Playlists() {
  const { playlists, active, selectPlaylist, removePlaylist } = useApp();
  const insets = useSafeAreaInsets();

  const confirmRemove = (p: Playlist) =>
    Alert.alert('Remover playlist', `Tem a certeza que quer remover "${p.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => removePlaylist(p.id) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Playlists" back={playlists.length > 0} />
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyView icon="tv-outline" message={'Bem-vindo ao BestIPTV!\nAdicione a sua primeira playlist para começar.'} />
          </View>
        }
        renderItem={({ item }) => {
          const isActive = item.id === active?.id;
          return (
            <Pressable
              onPress={async () => {
                await selectPlaylist(item.id);
                router.replace('/');
              }}
              style={({ pressed }) => [styles.card, isActive && styles.cardActive, pressed && { opacity: 0.8 }]}
            >
              <View style={[styles.icon, { backgroundColor: item.type === 'xtream' ? colors.primary : colors.movies }]}>
                <Ionicons name={item.type === 'xtream' ? 'server' : 'document-text'} size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.type === 'xtream' ? `Xtream · ${item.username}@${item.server}` : `M3U · ${item.url}`}
                </Text>
              </View>
              {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.success} />}
              <IconButton name="create-outline" onPress={() => router.push({ pathname: '/playlist-form', params: { id: item.id } })} />
              <IconButton name="trash-outline" color={colors.danger} onPress={() => confirmRemove(item)} />
            </Pressable>
          );
        }}
      />
      <View style={{ padding: 16, paddingBottom: insets.bottom + 16 }}>
        <Button title="Adicionar playlist" icon="add" onPress={() => router.push('/playlist-form')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: { borderColor: colors.primary },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});

