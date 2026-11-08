import { router } from 'expo-router';
import { View } from 'react-native';

import { ContentBrowser } from '../../components/ContentBrowser';
import { EmptyView, ScreenHeader } from '../../components/ui';
import { useApp } from '../../context/AppContext';
import { colors } from '../../theme';

export default function SeriesList() {
  const { provider } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Séries" />
      {provider ? (
        <ContentBrowser
          kind="series"
          layout="grid"
          deps={[provider]}
          loadCategories={() => provider.getSeriesCategories()}
          loadItems={() => provider.getSeries()}
          onOpen={(item) => router.push({ pathname: '/series/[id]', params: { id: item.id } })}
        />
      ) : (
        <EmptyView message="Sem playlist ativa" />
      )}
    </View>
  );
}

