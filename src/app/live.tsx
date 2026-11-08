import { router } from 'expo-router';
import { View } from 'react-native';

import { ContentBrowser } from '../components/ContentBrowser';
import { EmptyView, ScreenHeader } from '../components/ui';
import { useApp } from '../context/AppContext';
import { colors } from '../theme';

export default function LiveTV() {
  const { provider } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="TV em Direto" />
      {provider ? (
        <ContentBrowser
          kind="live"
          layout="list"
          deps={[provider]}
          loadCategories={() => provider.getLiveCategories()}
          loadItems={() => provider.getLiveChannels()}
          onOpen={(item, categoryId) =>
            router.push({ pathname: '/player', params: { kind: 'live', id: item.id, categoryId } })
          }
        />
      ) : (
        <EmptyView message="Sem playlist ativa" />
      )}
    </View>
  );
}

