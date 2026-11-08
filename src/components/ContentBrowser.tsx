import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useApp } from '../context/AppContext';
import { useAsync } from '../hooks/useAsync';
import type { Category, FavoriteItem, FavoriteKind } from '../lib/types';
import { colors, radius } from '../theme';
import { EmptyView, ErrorView, Loading, SearchBar } from './ui';

export const ALL = '__all';
export const FAV = '__fav';

export interface BrowsableItem {
  id: string;
  name: string;
  icon?: string;
  categoryId: string;
  num?: number;
  rating?: string;
}

export function filterByCategory<T extends BrowsableItem>(
  items: T[],
  categoryId: string,
  favorites: FavoriteItem[],
  kind: FavoriteKind,
): T[] {
  if (categoryId === ALL) return items;
  if (categoryId === FAV) {
    const ids = new Set(favorites.filter((f) => f.kind === kind).map((f) => f.id));
    return items.filter((i) => ids.has(i.id));
  }
  return items.filter((i) => i.categoryId === categoryId);
}

interface Props<T extends BrowsableItem> {
  kind: FavoriteKind;
  layout: 'list' | 'grid';
  loadCategories: () => Promise<Category[]>;
  loadItems: () => Promise<T[]>;
  onOpen: (item: T, categoryId: string) => void;
  deps: unknown[];
}

export function ContentBrowser<T extends BrowsableItem>({ kind, layout, loadCategories, loadItems, onOpen, deps }: Props<T>) {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const { favorites, isFavorite, toggleFavorite } = useApp();
  const [categoryId, setCategoryId] = useState(ALL);
  const [search, setSearch] = useState('');

  const { data, error, loading, retry } = useAsync(
    async () => {
      const [cats, items] = await Promise.all([loadCategories(), loadItems()]);
      return { cats, items };
    },
    deps,
  );

  const categories = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const i of data.items) counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1);
    const favCount = favorites.filter((f) => f.kind === kind).length;
    return [
      { id: ALL, name: 'Todos', count: data.items.length },
      { id: FAV, name: 'Favoritos', count: favCount },
      ...data.cats.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 })).filter((c) => c.count > 0),
    ];
  }, [data, favorites, kind]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = filterByCategory(data.items, categoryId, favorites, kind);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    return list;
  }, [data, categoryId, search, favorites, kind]);

  if (loading) return <Loading label="A carregar conteúdos..." />;
  if (error) return <ErrorView message={error} onRetry={retry} />;

  const listWidth = wide ? width * 0.7 : width;
  const numColumns = layout === 'grid' ? Math.max(3, Math.floor(listWidth / 130)) : 1;
  const posterW = (listWidth - 16 - (numColumns - 1) * 10) / numColumns - 1;

  const toggleFav = (item: T) => toggleFavorite({ kind, id: item.id, name: item.name, icon: item.icon });

  const renderItem = ({ item }: { item: T }) => {
    const fav = isFavorite(kind, item.id);
    if (layout === 'list') {
      return (
        <Pressable
          onPress={() => onOpen(item, categoryId)}
          onLongPress={() => toggleFav(item)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={styles.num}>{item.num ?? ''}</Text>
          <View style={styles.logoBox}>
            {item.icon ? (
              <Image source={item.icon} style={styles.logo} contentFit="contain" recyclingKey={item.id} />
            ) : (
              <Ionicons name="tv-outline" size={22} color={colors.textMuted} />
            )}
          </View>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Pressable hitSlop={10} onPress={() => toggleFav(item)}>
            <Ionicons name={fav ? 'star' : 'star-outline'} size={20} color={fav ? colors.accent : colors.textMuted} />
          </Pressable>
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={() => onOpen(item, categoryId)}
        onLongPress={() => toggleFav(item)}
        style={({ pressed }) => [{ width: posterW, opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.poster, { height: posterW * 1.5 }]}>
          {item.icon ? (
            <Image source={item.icon} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} transition={150} />
          ) : (
            <Ionicons name="film-outline" size={32} color={colors.textMuted} />
          )}
          {fav && (
            <View style={styles.favBadge}>
              <Ionicons name="star" size={14} color={colors.accent} />
            </View>
          )}
          {item.rating && Number(item.rating) > 0 ? (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>★ {Number(item.rating).toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.posterTitle} numberOfLines={2}>
          {item.name}
        </Text>
      </Pressable>
    );
  };

  const categoryView = wide ? (
    <FlatList
      style={styles.sidebar}
      data={categories}
      keyExtractor={(c) => c.id}
      renderItem={({ item: c }) => (
        <Pressable onPress={() => setCategoryId(c.id)} style={[styles.sideItem, c.id === categoryId && styles.sideItemActive]}>
          <Text style={[styles.sideText, c.id === categoryId && { color: '#fff' }]} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={styles.sideCount}>{c.count}</Text>
        </Pressable>
      )}
    />
  ) : (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={categories}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 8 }}
      style={{ flexGrow: 0, marginBottom: 8 }}
      renderItem={({ item: c }) => (
        <Pressable onPress={() => setCategoryId(c.id)} style={[styles.chip, c.id === categoryId && styles.chipActive]}>
          <Text style={[styles.chipText, c.id === categoryId && { color: '#fff' }]}>
            {c.name} <Text style={styles.chipCount}>{c.count}</Text>
          </Text>
        </Pressable>
      )}
    />
  );

  return (
    <View style={[styles.container, wide && { flexDirection: 'row' }]}>
      {categoryView}
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
          <SearchBar value={search} onChange={setSearch} />
        </View>
        <FlatList
          key={`${layout}-${numColumns}`}
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 10, paddingHorizontal: 8 } : undefined}
          contentContainerStyle={{ gap: layout === 'grid' ? 14 : 0, paddingBottom: 40 }}
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          windowSize={11}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyView
              message={categoryId === FAV ? 'Ainda não tem favoritos.\nMantenha premido um item para adicionar.' : 'Nada encontrado'}
            />
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  sidebar: { width: '30%', maxWidth: 320, borderRightWidth: 1, borderRightColor: colors.border },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  sideItemActive: { backgroundColor: colors.primary },
  sideText: { flex: 1, color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  sideCount: { color: colors.textMuted, fontSize: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: '600', fontSize: 14 },
  chipCount: { fontSize: 11, fontWeight: '400' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    height: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  num: { color: colors.textMuted, width: 32, textAlign: 'right', fontSize: 13 },
  logoBox: {
    width: 56,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 52, height: 36 },
  rowTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
  poster: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterTitle: { color: colors.text, fontSize: 13, marginTop: 6 },
  favBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#000a',
    borderRadius: 12,
    padding: 4,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#000b',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
});

