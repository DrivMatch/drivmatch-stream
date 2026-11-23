# DrivMatch Stream

Visualizador privado pessoal de TV — projeto independente do DrivMatch News e DrivMatch TV.

- Stream original: https://drivmatch.com/stream/ (ou a prévia https://drivmatch-stream-proxy.drivmatch.workers.dev/stream/).
- Biblioteca IPTV: /stream/listas/ — nove listas numeradas. A Lista 2 é um índice consolidado por país que reúne as Listas 1 a 8 (não inclui a 9), preservando a origem de cada canal, até três alternativas e a classificação de país quando há metadados. A Lista 8 contém canais públicos da Free-TV Brasil; a Lista 9 permanece separada e contém uma seleção restrita de emissoras abertas extraídas de uma fonte comunitária com testes diários de manifesto HLS, sem comprovar direito de retransmissão nem funcionamento na Samsung. Disney+, DAZN, ESPN, SporTV, Premiere, Telecine e SKY+ não são falsamente exibidos como canais reproduzíveis por meio de links de páginas institucionais.
- Autenticação: Cloudflare Worker com segredo de acesso STREAM_ACCESS_PASSWORD e cookie HttpOnly assinado. O JavaScript cliente e o GitHub Pages não contêm a senha.
- A biblioteca reutiliza **apenas** a sessão privada. Mantém arquivos, UI e gerenciamento próprios, sem alterar DrivMatch News (/news) ou DrivMatch TV (/TV).
- Fontes de playlists externas são diretórios públicos não verificados canal a canal. Inclusão não implica autorização, disponibilidade nem licença.
- O site não armazena ou retransmite mídia. Sem proxy para contornar CORS, DRM ou bloqueios regionais. Pay-per-view requer integração oficial.
- Importações próprias por URL e arquivo operam na sessão do navegador e não são persistidas; credenciais privadas não devem ser inseridas.
- Grade de programação XMLTV/EPG completa, integração Xtream licenciada e VOD ainda não estão implementados.

Pesquisa e decisões: docs/IPTV_PLAYLIST_LIBRARY_RESEARCH.md.

## Testes

- node --test tests/stream_worker.test.mjs
- node tests/stream_browser.cjs
- node tests/listas_browser.cjs

Os testes de navegador simulam playlists e mídia; não confirmam quais canais realmente reproduzem em produção.

## Busca de canais na Samsung TV (22/11/2026)

- Os nomes **Globo**, **SporTV** e **ESPN** são pesquisáveis quando presentes nas listas compatíveis.
- O guia mantém indicação separada para canais que exigem acesso oficial/assinatura; uma entrada em M3U pública não comprova autorização nem reprodução.
- A origem real, o formato do stream, o bloqueio regional e o dispositivo podem afetar a disponibilidade. Não há garantia de que todas as listas possuam esses canais.

## Lista 02 — consolidação por país (22/11/2026)

- A Lista 02 exibe as fontes das Listas **1 a 8**, incluindo seus próprios canais IPTV-org, sem apagar os catálogos originais.
- País baseado em metadados `tvg-country`, `tvg-id`, grupo explícito ou país de origem inequívoco da playlist. Informação insuficiente aparece em **Outros / não identificados**.
- A grade identifica a origem (Lista 1, Lista 2 etc.) e mantém até 3 URLs alternativas por canal/país. Resultados organizados por país e nome; links repetidos são deduplicados.
- Endpoint `/stream/countries?list=lista-2` retorna países efetivamente observados nas fontes, além dos 12 países históricos. Endpoint `/stream/catalog?list=lista-2&country=XX` retorna a união segmentada; `ALL` pode ser limitado por segurança de memória e informa truncamento.
- A Lista 9 está **fora** da consolidação, conforme escopo pedido. Fontes podem falhar e o catálogo mostra carregamento parcial. Testes de catálogo não comprovam autorização nem reprodução na Samsung.

## Ampliação internacional de canais e filmes — pesquisa de 22/11/2026

A navegação **País → Categoria → Canal** na Samsung mantém as fontes técnicas recolhidas no **último elemento** do rodapé da coluna. O novo diretório `site/official-access.json` diferencia:
- **HLS incorporado**: playlist HTTPS da fonte original, ainda sem comprovação de reprodução na Samsung, licença de distribuição ou disponibilidade geográfica
- **Site oficial gratuito**: o canal/filme está no site ou aplicativo da emissora, mas o Stream **não reproduz** automaticamente o vídeo da plataforma; há botão para abrir o destino oficial
- **Assinatura**: Netflix, Prime Video, HBO Max, Paramount+, Apple TV, Universal+, Disney+, Telecine, SKY+, SporTV, Premiere, ESPN, Combate, Sport TV PT, FOX News e CNN EUA aparecem **somente no painel recolhido de serviços**, sem promessa de acesso gratuito

Para Filmes, o guia separa **português**, **outros idiomas** e **idioma não informado**. A classificação de idioma é baseada somente em indicação de metadados da playlist ou diretório oficial, não no país da emissora. Entre as fontes gratuitas de filmes estão NetMovies (YouTube oficial), Pluto TV, Runtime, Mercado Play, Plex, Samsung TV Plus e EiTV (páginas HALLO); a disponibilidade é verificada no fornecedor. O diretório contém acesso ao emissor e não cópias não autorizadas de obras ou canais.

Novas fontes temáticas internas (não exibidas na navegação principal): **Lista 10 Filmes FAST (Free-TV)** e **Lista 11 Notícias internacionais (Free-TV)**; os links M3U são filtrados pelas regras existentes (HTTPS, HLS/MP4, bloqueio de nomes de redes pagas). A consolidação por país inclui a Lista 9 brasileira já filtrada, junto das Listas 1–8 e 10–11, com deduplicação parcial e indicação de fontes indisponíveis. Duas limitações: listas de terceiros não comprovam direitos de distribuição, e testes de navegador com vídeo simulado **não equivalem** a confirmação de reprodução real.

Fontes públicas utilizadas: Free-TV/IPTV, canal oficial NetMovies, RTP Play, CBS News 24/7, FOX Weather, DAZN PT Freemium, canais oficiais da Samsung, Pluto TV (Paramount), EiTV Play e páginas oficiais das emissoras. Filmes de catálogo de Netflix, Prime Video, HBO/Max, Paramount+ e Apple TV não foram convertidos em links HLS gratuitos.
