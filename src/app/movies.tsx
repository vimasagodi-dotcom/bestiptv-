import { router } from 'expo-router';
import { View } from 'react-native';

import { ContentBrowser } from '../components/ContentBrowser';
import { EmptyView, ScreenHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { colors } from '../theme';

export default function Movies() {
  const { provider } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Filmes" />
      {provider ? (
        <ContentBrowser
          kind="movie"
          layout="grid"
          deps={[provider]}
          loadCategories={() => provider.getMovieCategories()}
          loadItems={() => provider.getMovies()}
          onOpen={(item) => router.push({ pathname: '/movie/[id]', params: { id: item.id } })}
        />
      ) : (
        <EmptyView message="Sem playlist ativa" />
      )}
    </View>
  );
}

