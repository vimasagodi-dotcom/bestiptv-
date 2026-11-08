import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaDetails } from '../lib/types';
import { colors, radius } from '../theme';

export function MediaHeader({ info, actions }: { info: MediaDetails; actions?: ReactNode }) {
  const meta = [info.releaseDate?.slice(0, 4), info.duration, info.genre].filter(Boolean).join(' · ');
  const rating = Number(info.rating);
  return (
    <View>
      {info.backdrop || info.icon ? (
        <Image source={info.backdrop || info.icon} style={styles.backdrop} contentFit="cover" blurRadius={info.backdrop ? 0 : 20} />
      ) : (
        <View style={[styles.backdrop, { backgroundColor: colors.surface }]} />
      )}
      <View style={styles.overlay} />
      <View style={styles.content}>
        <View style={styles.poster}>
          {info.icon ? (
            <Image source={info.icon} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Ionicons name="film-outline" size={40} color={colors.textMuted} />
          )}
        </View>
        <View style={{ flex: 1, gap: 6, justifyContent: 'flex-end' }}>
          <Text style={styles.title}>{info.name}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {rating > 0 && <Text style={styles.rating}>★ {rating.toFixed(1)}</Text>}
          {actions}
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {info.plot ? <Text style={styles.plot}>{info.plot}</Text> : null}
        {info.cast ? (
          <Text style={styles.small}>
            <Text style={styles.smallLabel}>Elenco: </Text>
            {info.cast}
          </Text>
        ) : null}
        {info.director ? (
          <Text style={styles.small}>
            <Text style={styles.smallLabel}>Realização: </Text>
            {info.director}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 260, opacity: 0.5 },
  overlay: {
    position: 'absolute',
    top: 160,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: colors.bg,
    opacity: 0.6,
  },
  content: { flexDirection: 'row', gap: 16, padding: 16, paddingTop: 110 },
  poster: {
    width: 120,
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13 },
  rating: { color: colors.accent, fontWeight: '700' },
  plot: { color: colors.text, fontSize: 14, lineHeight: 21 },
  small: { color: colors.textMuted, fontSize: 13 },
  smallLabel: { color: colors.text, fontWeight: '600' },
});

