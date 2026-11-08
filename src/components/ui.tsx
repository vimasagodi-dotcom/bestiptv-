import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';

export function ScreenHeader({ title, right, back = true }: { title: string; right?: ReactNode; back?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {back && (
        <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  color = colors.text,
  size = 22,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Loading({ label = 'A carregar...' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry && <Button title="Tentar novamente" onPress={onRetry} />}
    </View>
  );
}

export function EmptyView({ message, icon = 'file-tray-outline' }: { message: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.surfaceAlt;
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color="#fff" />}
          <Text style={styles.buttonText}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Pesquisar...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && <IconButton name="close-circle" size={18} color={colors.textMuted} onPress={() => onChange('')} />}
    </View>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  headerTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  errorText: { color: colors.text, fontSize: 15, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
});

