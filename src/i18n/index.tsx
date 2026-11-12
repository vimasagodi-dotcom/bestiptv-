import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

export type SupportedLang = 'pt' | 'es' | 'en' | 'fr';

const STORAGE_LANG_KEY = '@cocas_language';

const TRANSLATIONS: Record<SupportedLang, Record<string, string>> = {
  pt: {
    lang_label: 'Idioma',
    tab_live: 'TV ao Vivo',
    tab_movies: 'Filmes',
    tab_series: 'Séries',
    tab_chat: 'Chat',
    tab_account: 'Conta',
    open_chat: 'Abrir Chat',
    view_channels: 'Ver Canais',
    search_channels: 'Pesquisar canais...',
    all_categories: 'Todos',
    favorites: 'Favoritos',
    no_channels: 'Sem canais disponíveis',
    loading_channels: 'A carregar canais...',
    chat_title: 'Chat da Comunidade',
    chat_placeholder: 'Escreve uma mensagem...',
    chat_send: 'Enviar',
    chat_change_name: 'Mudar Nome',
    chat_online: 'online',
    chat_account_required: 'Conta necessária',
    chat_account_required_msg: 'Para mudares o teu nome no chat precisas de iniciar sessão ou criar uma conta.',
    account_title: 'A Minha Conta',
    login_btn: 'Iniciar Sessão',
    register_btn: 'Criar Conta',
    logout_btn: 'Terminar Sessão',
    add_playlist: 'Adicionar Lista',
    settings_language: 'Idioma da Aplicação',
    cancel: 'Cancelar',
    save: 'Guardar',
    ok: 'OK',
    error: 'Erro',
  },
  es: {
    lang_label: 'Idioma',
    tab_live: 'TV en Directo',
    tab_movies: 'Películas',
    tab_series: 'Series',
    tab_chat: 'Chat',
    tab_account: 'Cuenta',
    open_chat: 'Abrir Chat',
    view_channels: 'Ver Canales',
    search_channels: 'Buscar canales...',
    all_categories: 'Todos',
    favorites: 'Favoritos',
    no_channels: 'No hay canales disponibles',
    loading_channels: 'Cargando canales...',
    chat_title: 'Chat de la Comunidad',
    chat_placeholder: 'Escribe un mensaje...',
    chat_send: 'Enviar',
    chat_change_name: 'Cambiar Nombre',
    chat_online: 'en línea',
    chat_account_required: 'Cuenta requerida',
    chat_account_required_msg: 'Para cambiar tu nombre en el chat necesitas iniciar sesión o crear una cuenta.',
    account_title: 'Mi Cuenta',
    login_btn: 'Iniciar Sesión',
    register_btn: 'Crear Cuenta',
    logout_btn: 'Cerrar Sesión',
    add_playlist: 'Añadir Lista',
    settings_language: 'Idioma de la Aplicación',
    cancel: 'Cancelar',
    save: 'Guardar',
    ok: 'Aceptar',
    error: 'Error',
  },
  en: {
    lang_label: 'Language',
    tab_live: 'Live TV',
    tab_movies: 'Movies',
    tab_series: 'Series',
    tab_chat: 'Chat',
    tab_account: 'Account',
    open_chat: 'Open Chat',
    view_channels: 'View Channels',
    search_channels: 'Search channels...',
    all_categories: 'All',
    favorites: 'Favorites',
    no_channels: 'No channels available',
    loading_channels: 'Loading channels...',
    chat_title: 'Community Chat',
    chat_placeholder: 'Write a message...',
    chat_send: 'Send',
    chat_change_name: 'Change Name',
    chat_online: 'online',
    chat_account_required: 'Account required',
    chat_account_required_msg: 'To change your chat nickname you need to sign in or create an account.',
    account_title: 'My Account',
    login_btn: 'Sign In',
    register_btn: 'Create Account',
    logout_btn: 'Sign Out',
    add_playlist: 'Add Playlist',
    settings_language: 'App Language',
    cancel: 'Cancel',
    save: 'Save',
    ok: 'OK',
    error: 'Error',
  },
  fr: {
    lang_label: 'Langue',
    tab_live: 'TV en Direct',
    tab_movies: 'Films',
    tab_series: 'Séries',
    tab_chat: 'Chat',
    tab_account: 'Compte',
    open_chat: 'Ouvrir le Chat',
    view_channels: 'Voir les Chaînes',
    search_channels: 'Rechercher des chaînes...',
    all_categories: 'Tous',
    favorites: 'Favoris',
    no_channels: 'Aucune chaîne disponible',
    loading_channels: 'Chargement des chaînes...',
    chat_title: 'Chat de la Communauté',
    chat_placeholder: 'Écris un message...',
    chat_send: 'Envoyer',
    chat_change_name: 'Changer de Pseudo',
    chat_online: 'en ligne',
    chat_account_required: 'Compte requis',
    chat_account_required_msg: 'Pour changer ton pseudo dans le chat, tu dois te connecter ou créer un compte.',
    account_title: 'Mon Compte',
    login_btn: 'Se Connecter',
    register_btn: 'Créer un Compte',
    logout_btn: 'Se Déconnecter',
    add_playlist: 'Ajouter une Liste',
    settings_language: "Langue de l'Application",
    cancel: 'Annuler',
    save: 'Enregistrer',
    ok: 'OK',
    error: 'Erreur',
  },
};

function detectDeviceLanguage(): SupportedLang {
  try {
    let raw = '';
    if (Platform.OS === 'ios') {
      raw =
        NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
        '';
    } else if (Platform.OS === 'android') {
      raw = NativeModules.I18nManager?.localeIdentifier || '';
    }
    if (!raw && typeof Intl !== 'undefined') {
      raw = Intl.DateTimeFormat().resolvedOptions().locale || '';
    }
    const code = raw.slice(0, 2).toLowerCase();
    if (code === 'es' || code === 'en' || code === 'fr' || code === 'pt') {
      return code;
    }
  } catch {
    // fallback below
  }
  return 'pt';
}

interface I18nContextValue {
  lang: SupportedLang;
  setLanguage: (lang: SupportedLang) => Promise<void>;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'pt',
  setLanguage: async () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<SupportedLang>('pt');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_LANG_KEY)
      .then((saved) => {
        if (!mounted) return;
        if (saved === 'pt' || saved === 'es' || saved === 'en' || saved === 'fr') {
          setLang(saved);
        } else {
          setLang(detectDeviceLanguage());
        }
      })
      .catch(() => {
        if (mounted) setLang(detectDeviceLanguage());
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: SupportedLang) => {
    setLang(next);
    try {
      await AsyncStorage.setItem(STORAGE_LANG_KEY, next);
    } catch {
      // ignore storage failure
    }
  }, []);

  const t = useCallback(
    (key: string) => {
      return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.pt[key] ?? key;
    },
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
