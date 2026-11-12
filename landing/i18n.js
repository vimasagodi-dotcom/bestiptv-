// Cocas Multi-Language Engine (PT, ES, EN, FR)
(function() {
  const TRANSLATIONS = {
    pt: {
      seo_title: "Cocas - Reprodutor M3U & IPTV Player Online Grátis",
      seo_desc: "Reprodutor multimédia neutro para as tuas próprias linhas IPTV, listas M3U/M3U8 e comunidade de utilizadores em tempo real.",
      nav_smart_tv: "📺 Smart TV",
      nav_download_apk: "⬇ Baixar APK",
      mob_badge: "Leitor Multimédia Cocas",
      mob_h1: 'Leitor multimédia para as tuas próprias linhas IPTV em <span>Telemóvel e Smart TV</span>',
      mob_sub: "Leitor integrado no topo do ecrã com EPG ao vivo, reconexão automática e modo adaptativo otimizado para Smart TV e TV Box.",
      mob_btn_apk: "Baixar APK (Android / TV Box)",
      mob_btn_ios: "Abrir no iPhone (iOS)",
      mob_btn_tv: "📺 Instalar em Smart TV",
      tile1_h3: "Leitor Multimédia Otimizado",
      tile1_p: "Vídeo integrado no topo do ecrã enquanto navegas nos grupos e canais da tua linha, ou ecrã inteiro limpo com gaveta lateral.",
      tile2_h3: "Reconexão Inteligente",
      tile2_p: "Libertação imediata de ligação ao mudar de canal, reconexão automática e reprodução estável.",
      tile3_h3: "Modo Smart TV (3 Colunas)",
      tile3_p: "Em Smart TVs, Tablets e TV Boxes, a interface adapta-se para Grupos + Canais + Pré-visualização com EPG.",
      web_badge: "Leitor Web & Comunidade Cocas",
      web_h1: 'Leitor Multimédia & <span>Comunidade Cocas</span>',
      web_sub: "Regista a tua conta para utilizar o leitor no teu navegador ou descarrega a app para a tua televisão enquanto conversas no chat em tempo real.",
      auth_reg_title: "Criar Conta Web Cocas",
      auth_reg_sub: "Cria a tua conta para acederes ao leitor web e participares na Comunidade Cocas.",
      auth_login_title: "Iniciar Sessão Cocas",
      auth_login_sub: "Acede com a tua conta ou linha IPTV para continuar a ver TV.",
      auth_name_lbl: "Nome (Opcional)",
      auth_name_ph: "O teu nome (opcional)",
      auth_email_lbl: "Email",
      auth_email_ph: "O teu email",
      auth_user_lbl: "Username (Login & Chat)",
      auth_user_ph: "Escolhe um username",
      auth_pass_lbl: "Palavra-passe",
      auth_pass_ph: "Cria uma palavra-passe",
      auth_tab_xtream: "⚡ Xtream Codes",
      auth_tab_m3u: "📋 Lista M3U",
      auth_server_lbl: "Servidor / URL Xtream",
      auth_xuser_lbl: "Utilizador da Linha",
      auth_xpass_lbl: "Password da Linha",
      auth_m3u_lbl: "Link M3U / get.php",
      auth_btn_reg: "Criar Conta e Entrar no Leitor",
      auth_btn_login: "Entrar no Leitor",
      auth_switch_login: "Já tens conta? Iniciar Sessão",
      auth_switch_reg: "Ainda não tens conta? Criar Conta",
      footer_legal_title: "⚖️ Aviso Legal",
      footer_legal_text: "A Cocas é apenas um reprodutor multimédia técnico e neutro. Não fornecemos, alojamos, vendemos nem distribuímos quaisquer conteúdos televisivos, listas ou canais.",
      footer_terms: "Termos de Uso",
      footer_privacy: "Política de Privacidade",
      footer_cookies: "Cookies",
      footer_contact: "Contacto"
    },
    es: {
      seo_title: "Cocas - Reproductor IPTV y M3U Web Online Gratis",
      seo_desc: "Reproductor multimedia neutro para tus propias listas IPTV M3U/M3U8 y Xtream Codes en navegador, móvil y Smart TV con chat en tiempo real.",
      nav_smart_tv: "📺 Smart TV",
      nav_download_apk: "⬇ Descargar APK",
      mob_badge: "Reproductor Multimedia Cocas",
      mob_h1: 'Reproductor multimedia para tus propias líneas IPTV en <span>Móvil y Smart TV</span>',
      mob_sub: "Reproductor integrado en la parte superior con EPG en vivo, reconexión automática y modo adaptativo optimizado para Smart TV y TV Box.",
      mob_btn_apk: "Descargar APK (Android / TV Box)",
      mob_btn_ios: "Abrir en iPhone (iOS)",
      mob_btn_tv: "📺 Instalar en Smart TV",
      tile1_h3: "Reproductor Optimizado",
      tile1_p: "Vídeo integrado arriba mientras navegas por grupos y canales de tu lista, o pantalla completa limpia con menú lateral.",
      tile2_h3: "Reconexión Inteligente",
      tile2_p: "Liberación inmediata de conexión al cambiar de canal, reconexión automática y reproducción estable.",
      tile3_h3: "Modo Smart TV (3 Columnas)",
      tile3_p: "En Smart TVs, Tablets y TV Boxes, la interfaz se adapta a Grupos + Canales + Vista previa con EPG.",
      web_badge: "Reproductor Web y Comunidad Cocas",
      web_h1: 'Reproductor Multimedia & <span>Comunidad Cocas</span>',
      web_sub: "Crea tu cuenta para usar el reproductor en tu navegador o descarga la app para tu televisor mientras chateas en tiempo real.",
      auth_reg_title: "Crear Cuenta Web Cocas",
      auth_reg_sub: "Crea tu cuenta para acceder al reproductor web y participar en la Comunidad Cocas.",
      auth_login_title: "Iniciar Sesión Cocas",
      auth_login_sub: "Accede con tu cuenta o línea IPTV para seguir viendo TV.",
      auth_name_lbl: "Nombre (Opcional)",
      auth_name_ph: "Tu nombre (opcional)",
      auth_email_lbl: "Correo electrónico",
      auth_email_ph: "Tu email",
      auth_user_lbl: "Usuario (Login y Chat)",
      auth_user_ph: "Elige un usuario",
      auth_pass_lbl: "Contraseña",
      auth_pass_ph: "Crea una contraseña",
      auth_tab_xtream: "⚡ Xtream Codes",
      auth_tab_m3u: "📋 Lista M3U",
      auth_server_lbl: "Servidor / URL Xtream",
      auth_xuser_lbl: "Usuario de la Línea",
      auth_xpass_lbl: "Contraseña de la Línea",
      auth_m3u_lbl: "Enlace M3U / get.php",
      auth_btn_reg: "Crear Cuenta y Entrar",
      auth_btn_login: "Entrar al Reproductor",
      auth_switch_login: "¿Ya tienes cuenta? Iniciar Sesión",
      auth_switch_reg: "¿Aún no tienes cuenta? Crear Cuenta",
      footer_legal_title: "⚖️ Aviso Legal",
      footer_legal_text: "Cocas es únicamente un reproductor multimedia técnico y neutro. No proporcionamos, alojamos, vendemos ni distribuimos contenidos televisivos, listas o canales.",
      footer_terms: "Términos de Uso",
      footer_privacy: "Política de Privacidad",
      footer_cookies: "Cookies",
      footer_contact: "Contacto"
    },
    en: {
      seo_title: "Cocas - Free Online IPTV Web Player & M3U Streamer",
      seo_desc: "Neutral multimedia web & mobile player for your own IPTV M3U/M3U8 playlists and Xtream Codes with live EPG and real-time community chat.",
      nav_smart_tv: "📺 Smart TV",
      nav_download_apk: "⬇ Download APK",
      mob_badge: "Cocas Media Player",
      mob_h1: 'Media player for your own IPTV lines on <span>Mobile and Smart TV</span>',
      mob_sub: "Top-docked video player with live EPG, smart auto-reconnection, and adaptive layout optimized for Smart TV and TV Box.",
      mob_btn_apk: "Download APK (Android / TV Box)",
      mob_btn_ios: "Open on iPhone (iOS)",
      mob_btn_tv: "📺 Install on Smart TV",
      tile1_h3: "Optimized Media Player",
      tile1_p: "Video docked at the top while browsing your groups and channels, or clean full-screen mode with side drawer.",
      tile2_h3: "Smart Reconnection",
      tile2_p: "Instant connection release on channel switch, automatic reconnection, and ultra-stable playback.",
      tile3_h3: "Smart TV Mode (3 Columns)",
      tile3_p: "On Smart TVs, Tablets, and TV Boxes, the UI adapts into Groups + Channels + Preview with live EPG.",
      web_badge: "Web Player & Cocas Community",
      web_h1: 'Media Player & <span>Cocas Community</span>',
      web_sub: "Register your account to use the browser web player or download the app for your TV while chatting live with the community.",
      auth_reg_title: "Create Cocas Web Account",
      auth_reg_sub: "Create your account to access the web player and join the Cocas Community.",
      auth_login_title: "Sign In to Cocas",
      auth_login_sub: "Sign in with your account or IPTV line to keep watching.",
      auth_name_lbl: "Name (Optional)",
      auth_name_ph: "Your name (optional)",
      auth_email_lbl: "Email",
      auth_email_ph: "Your email",
      auth_user_lbl: "Username (Login & Chat)",
      auth_user_ph: "Choose a username",
      auth_pass_lbl: "Password",
      auth_pass_ph: "Create a password",
      auth_tab_xtream: "⚡ Xtream Codes",
      auth_tab_m3u: "📋 M3U Playlist",
      auth_server_lbl: "Xtream Server / URL",
      auth_xuser_lbl: "Line Username",
      auth_xpass_lbl: "Line Password",
      auth_m3u_lbl: "M3U / get.php Link",
      auth_btn_reg: "Create Account & Launch Player",
      auth_btn_login: "Open Player",
      auth_switch_login: "Already have an account? Sign In",
      auth_switch_reg: "Don't have an account yet? Sign Up",
      footer_legal_title: "⚖️ Legal Disclaimer",
      footer_legal_text: "Cocas is strictly a neutral technical media player. We do not provide, host, sell, or distribute any television content, playlists, or channels.",
      footer_terms: "Terms of Use",
      footer_privacy: "Privacy Policy",
      footer_cookies: "Cookies",
      footer_contact: "Contact"
    },
    fr: {
      seo_title: "Cocas - Lecteur IPTV en Ligne Gratuit & Player M3U Web",
      seo_desc: "Lecteur multimédia neutre pour vos propres listes IPTV M3U/M3U8 et Xtream Codes sur navigateur, mobile et Smart TV avec chat en temps réel.",
      nav_smart_tv: "📺 Smart TV",
      nav_download_apk: "⬇ Télécharger APK",
      mob_badge: "Lecteur Multimédia Cocas",
      mob_h1: 'Lecteur multimédia pour vos propres lignes IPTV sur <span>Mobile et Smart TV</span>',
      mob_sub: "Lecteur intégré en haut de l'écran avec EPG en direct, reconnexion automatique et mode adaptatif pour Smart TV et TV Box.",
      mob_btn_apk: "Télécharger APK (Android / TV Box)",
      mob_btn_ios: "Ouvrir sur iPhone (iOS)",
      mob_btn_tv: "📺 Installer sur Smart TV",
      tile1_h3: "Lecteur Optimisé",
      tile1_p: "Vidéo intégrée en haut pendant que vous parcourez vos groupes et chaînes, ou mode plein écran fluide avec tiroir latéral.",
      tile2_h3: "Reconnexion Intelligente",
      tile2_p: "Libération instantanée de la connexion lors du changement de chaîne, reconnexion automatique et lecture stable.",
      tile3_h3: "Mode Smart TV (3 Colonnes)",
      tile3_p: "Sur Smart TV, Tablettes et TV Box, l'interface s'adapte en Groupes + Chaînes + Aperçu avec EPG.",
      web_badge: "Lecteur Web & Communauté Cocas",
      web_h1: 'Lecteur Multimédia & <span>Communauté Cocas</span>',
      web_sub: "Créez votre compte pour utiliser le lecteur dans votre navigateur ou téléchargez l'application TV tout en discutant en direct.",
      auth_reg_title: "Créer un Compte Web Cocas",
      auth_reg_sub: "Créez votre compte pour accéder au lecteur web et rejoindre la Communauté Cocas.",
      auth_login_title: "Connexion Cocas",
      auth_login_sub: "Connectez-vous avec votre compte ou votre ligne IPTV pour continuer.",
      auth_name_lbl: "Nom (Optionnel)",
      auth_name_ph: "Votre nom (optionnel)",
      auth_email_lbl: "E-mail",
      auth_email_ph: "Votre e-mail",
      auth_user_lbl: "Nom d'utilisateur (Login & Chat)",
      auth_user_ph: "Choisissez un pseudo",
      auth_pass_lbl: "Mot de passe",
      auth_pass_ph: "Créez un mot de passe",
      auth_tab_xtream: "⚡ Xtream Codes",
      auth_tab_m3u: "📋 Liste M3U",
      auth_server_lbl: "Serveur / URL Xtream",
      auth_xuser_lbl: "Utilisateur de la Ligne",
      auth_xpass_lbl: "Mot de passe de la Ligne",
      auth_m3u_lbl: "Lien M3U / get.php",
      auth_btn_reg: "Créer un Compte et Lancer le Lecteur",
      auth_btn_login: "Ouvrir le Lecteur",
      auth_switch_login: "Déjà un compte ? Se Connecter",
      auth_switch_reg: "Pas encore de compte ? S'inscrire",
      footer_legal_title: "⚖️ Avis Légal",
      footer_legal_text: "Cocas est uniquement un lecteur multimédia technique et neutre. Nous ne fournissons, n'hébergeons, ne vendons ni ne distribuons aucun contenu télévisé, liste ou chaîne.",
      footer_terms: "Conditions d'Utilisation",
      footer_privacy: "Politique de Confidentialité",
      footer_cookies: "Cookies",
      footer_contact: "Contact"
    }
  };

  const SUPPORTED = ['pt', 'es', 'en', 'fr'];

  function detectInitialLang() {
    const params = new URLSearchParams(window.location.search);
    const urlLang = (params.get('lang') || '').toLowerCase().slice(0, 2);
    if (SUPPORTED.includes(urlLang)) return urlLang;

    const stored = localStorage.getItem('@cocas_lang');
    if (stored && SUPPORTED.includes(stored)) return stored;

    const navLang = (navigator.language || navigator.userLanguage || 'pt').toLowerCase().slice(0, 2);
    if (SUPPORTED.includes(navLang)) return navLang;

    return 'pt';
  }

  window.setCocasLang = function(lang) {
    if (!SUPPORTED.includes(lang)) lang = 'pt';
    localStorage.setItem('@cocas_lang', lang);
    document.documentElement.lang = lang;

    const dict = TRANSLATIONS[lang] || TRANSLATIONS.pt;
    if (dict.seo_title) document.title = dict.seo_title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && dict.seo_desc) metaDesc.setAttribute('content', dict.seo_desc);

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.innerHTML = dict[key];
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });

    document.querySelectorAll('.lang-pill-btn').forEach(btn => {
      const bLang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', bLang === lang);
    });

    // Sync URL param gently for shareability without reload
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  document.addEventListener('DOMContentLoaded', () => {
    const initial = detectInitialLang();
    window.setCocasLang(initial);
  });
})();
