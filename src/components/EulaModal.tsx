import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';

const EULA_STORAGE_KEY = '@cocas/eulaAccepted.v1';

export function EulaModal() {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    AsyncStorage.getItem(EULA_STORAGE_KEY)
      .then((val) => {
        if (val !== 'true') setVisible(true);
      })
      .catch(() => setVisible(true));
  }, []);

  const accept = async () => {
    if (!checked) return;
    try {
      await AsyncStorage.setItem(EULA_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="shield-checkmark" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Acordo de Utilização (EULA) e Regras</Text>
            <Text style={styles.subtitle}>Comunidade Cocas · Leitura Obrigatória na Instalação</Text>
          </View>
        </View>

        <ScrollView style={styles.scrollBox} contentContainerStyle={styles.scrollContent}>
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={22} color={colors.accent} />
            <Text style={styles.warningText}>
              AVISO IMPORTANTE: A Cocas NÃO vende, NÃO fornece, NÃO hospeda nem distribui canais de televisão ou conteúdos audiovisuais.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>1. Natureza da Aplicação e da Comunidade</Text>
          <Text style={styles.paragraph}>
            A aplicação <Text style={styles.bold}>Cocas</Text> é exclusivamente um reprodutor multimédia (media player) avançado combinado com uma plataforma de comunidade online. A aplicação não contém quaisquer canais, filmes, séries ou listas pré-instaladas.
          </Text>

          <Text style={styles.sectionTitle}>2. Responsabilidade sobre Listas e Conteúdos</Text>
          <Text style={styles.paragraph}>
            Para utilizar o leitor de vídeo, o utilizador deve configurar a sua própria lista ou portal (M3U ou Xtream). O utilizador declara e garante que possui todos os direitos e autorizações legais necessários para aceder aos conteúdos que reproduz na aplicação, isentando a Comunidade Cocas de qualquer responsabilidade sobre a origem ou legalidade desses fluxos.
          </Text>

          <Text style={styles.sectionTitle}>3. Membros da Comunidade e Publicidade</Text>
          <Text style={styles.paragraph}>
            O uso do leitor com listas próprias é gratuito e suportado por publicidade exibida durante a mudança de canais. As contribuições de membro da Comunidade Cocas destinam-se exclusivamente ao acesso VIP às funcionalidades da comunidade, destaque no chat e remoção de publicidade do software, não representando em caso algum a venda de sinal de TV.
          </Text>

          <Text style={styles.sectionTitle}>4. Regras de Conduta no Chat da Comunidade</Text>
          <Text style={styles.paragraph}>
            • É estritamente proibido partilhar links piratas, spam ou dados pessoais no chat.{'\n'}
            • Mantenha o respeito por todos os membros, moderadores e administradores da sala.{'\n'}
            • O incumprimento das regras resulta no silenciamento ou bloqueio da conta pelos administradores da comunidade.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => setChecked((v) => !v)} style={styles.checkRow}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
            </View>
            <Text style={styles.checkLabel}>
              Compreendo que a <Text style={styles.bold}>Cocas não vende TV</Text> (somos apenas uma comunidade) e aceito os Termos de Utilização (EULA) e Regras.
            </Text>
          </Pressable>

          <Pressable
            disabled={!checked}
            onPress={accept}
            style={[styles.acceptBtn, !checked && styles.acceptBtnDisabled]}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.acceptBtnText}>Aceitar e Entrar na Aplicação</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  scrollBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F59E0B1F',
    borderWidth: 1,
    borderColor: '#F59E0B55',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 4,
  },
  warningText: {
    flex: 1,
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
  },
  paragraph: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  bold: { color: '#fff', fontWeight: '700' },
  footer: { gap: 12 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
  },
  acceptBtnDisabled: {
    opacity: 0.4,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});

