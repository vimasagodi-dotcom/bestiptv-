# BestIPTV

Leitor de listas IPTV para **iOS e Android** (estilo MyTVOnline), feito com Expo / React Native.

## Funcionalidades

- **Playlists múltiplas**: Xtream Codes (servidor + utilizador + palavra-passe) ou URL M3U/M3U8
  - Links `get.php?username=...&password=...` são convertidos automaticamente para Xtream
- **TV em Direto**: categorias, pesquisa, favoritos, EPG (agora / a seguir), troca de canal no player e lista lateral de canais
- **Filmes (VOD)** e **Séries** com capas, sinopse, elenco, temporadas e episódios
- **Favoritos** por playlist (manter premido ou tocar na estrela)
- Informação da conta Xtream (estado e data de expiração)
- Layout adaptado a telemóvel e tablet (barra lateral de categorias em ecrãs largos)
- Player nativo (AVPlayer no iOS, ExoPlayer no Android) com HLS, Picture-in-Picture e User-Agent personalizado

## Desenvolvimento

```bash
npm install
npx expo run:android      # build de desenvolvimento local (precisa Android Studio)
npx expo run:ios          # só em macOS com Xcode
```

> O `expo-video` e o `expo-screen-orientation` são módulos nativos – use uma *development build*
> (`npx expo run:*` ou `npx eas-cli@latest build --profile development`).

## Builds para as lojas (EAS, sem Mac necessário)

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android   # APK/AAB
npx eas-cli@latest build --platform ios       # requer conta Apple Developer
```

## Estrutura

```
src/
  app/                 # ecrãs (Expo Router)
    index.tsx          # menu principal
    playlists.tsx      # gestão de playlists
    playlist-form.tsx  # adicionar / editar playlist
    live.tsx           # TV em direto
    movies.tsx         # filmes
    movie/[id].tsx     # detalhes do filme
    series/            # séries + detalhes/episódios
    player.tsx         # leitor de vídeo
  components/          # UI reutilizável
  context/AppContext   # playlists, favoritos, provider ativo
  lib/
    xtream.ts          # cliente da API Xtream Codes
    m3u.ts             # parser de listas M3U
```

## Notas

- No iOS o AVPlayer não reproduz streams MPEG-TS (`.ts`) diretos – em Xtream use o formato HLS (`.m3u8`, por defeito).
- O tráfego HTTP (não HTTPS) está permitido em ambas as plataformas, pois muitos servidores IPTV usam HTTP.
- A app é apenas um leitor: não fornece qualquer conteúdo.

