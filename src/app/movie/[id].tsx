import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { MediaHeader } from '../../components/MediaHeader';
import { Button, ErrorView, IconButton, Loading, ScreenHeader } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { useAsync } from '../../hooks/useAsync';
import { colors } from '../../theme';

export default function MovieDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { provider, isFavorite, toggleFavorite } = useApp();
  const { data, error, loading, retry } = useAsync(async () => provider!.getMovieInfo(id), [provider, id]);
  const fav = isFavorite('movie', id);

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
                onPress={() => toggleFavorite({ kind: 'movie', id, name: data.name, icon: data.icon })}
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
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <MediaHeader
            info={data}
            actions={
              <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                <Button
                  title="Ver agora"
                  icon="play"
                  onPress={() => router.push({ pathname: '/player', params: { kind: 'vod', url: data.url, title: data.name } })}
                />
              </View>
            }
          />
        </ScrollView>
      )}
    </View>
  );
}

