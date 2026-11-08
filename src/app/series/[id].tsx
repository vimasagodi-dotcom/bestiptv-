import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MediaHeader } from '../../components/MediaHeader';
import { ErrorView, IconButton, Loading, ScreenHeader } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useAsync } from '../../hooks/useAsync';
import { colors, radius } from '../../theme';

export default function SeriesDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { provider, isFavorite, toggleFavorite } = useApp();
  const { data, error, loading, retry } = useAsync(async () => provider!.getSeriesInfo(id), [provider, id]);
  const [season, setSeason] = useState<number | null>(null);
  const fav = isFavorite('series', id);

  useEffect(() => {
    if (data && season === null) setSeason(data.seasons[0] ?? null);
  }, [data, season]);

  const episodes = data && season !== null ? (data.episodes[season] ?? []) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ position: 'absolute', zIndex: 2, left: 0, right: 0 }}>
        <ScreenHeader
          title=""
          right={
            data && (
              <IconButton
                name={fav ? 'star' : 'star-outline'}
                color={fav ? colors.accent : colors.text}
                onPress={() => toggleFavorite({ kind: 'series', id, name: data.name, icon: data.icon })}
              />
            )
          }
        />
      </View>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorView message={error ?? 'Erro'} onRetry={retry} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 16 }}>
          <MediaHeader info={data} />

          {data.seasons.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {data.seasons.map((s) => (
                <Pressable key={s} onPress={() => setSeason(s)} style={[styles.chip, s === season && styles.chipActive]}>
                  <Text style={[styles.chipText, s === season && { color: '#fff' }]}>Temporada {s}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.chipText, { textAlign: 'center' }]}>Sem episódios disponíveis</Text>
          )}

          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            {episodes.map((ep) => (
              <Pressable
                key={ep.id}
                onPress={() =>
                  router.push({
                    pathname: '/player',
                    params: { kind: 'vod', url: ep.url, title: `${data.name} - T${ep.season}E${ep.episode}` },
                  })
                }
                style={({ pressed }) => [styles.episode, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.thumb}>
                  {ep.icon ? (
                    <Image source={ep.icon} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : null}
                  <Ionicons name="play-circle" size={30} color="#fffc" />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.epTitle} numberOfLines={2}>
                    {ep.episode}. {ep.title}
                  </Text>
                  {ep.duration ? <Text style={styles.epMeta}>{ep.duration}</Text> : null}
                  {ep.plot ? (
                    <Text style={styles.epMeta} numberOfLines={2}>
                      {ep.plot}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: '600' },
  episode: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 8,
    alignItems: 'center',
  },
  thumb: {
    width: 120,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  epTitle: { color: colors.text, fontWeight: '600', fontSize: 14 },
  epMeta: { color: colors.textMuted, fontSize: 12 },
});

