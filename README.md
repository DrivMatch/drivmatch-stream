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

## Navegação e recuperação de canais na Samsung (22/11/2026)

- A árvore do Brasil abre inicialmente com **todas as categorias recolhidas**. A abertura de uma categoria fecha a anterior; atualizar a grade recolhe novamente os grupos.
- Paleta visual revisada em grafite/verde-água, com diferenciação mais clara entre as três colunas, títulos claros, alternância de cartões e indicação de foco para o controle remoto.
- O timeout de 60 segundos é **por canal selecionado**, não uma limpeza geral. O navegador tenta a URL principal e até duas alternativas disponíveis durante o mesmo minuto. Somente se nenhum sinal gerar o evento real `playing` o canal é **ocultado do guia local**, por até **24 horas**, e pode ser restaurado manualmente pelo botão no guia.
- Não excluir playlists na origem, não ocultar outros canais, não remover favoritos ou histórico, não testar páginas oficiais ou assinaturas como vídeo. Ao mudar de canal, o timeout anterior é cancelado. Um bloqueio explícito de reprodução automática pelo navegador requer Play manual e não deve provocar ocultação.
- Trata-se de uma medição local de início de reprodução, **não de um certificado de que a URL está fora do ar**: DRM, geobloqueio ou codecs sem suporte na Samsung também podem impedir o evento `playing`. Uma transmissão que voltar a funcionar pode ser restaurada imediatamente, ou reaparecer após 24 horas.

## Autopiloto diário de canais — 23/11/2026

**Execução sem solicitação no ChatGPT:** `.github/workflows/daily-channel-autopilot.yml` agenda todos os dias às **12:20 UTC / 09:20 horário de São Paulo**, com disparo manual opcional. O cron depende da infraestrutura e das permissões GitHub Actions; o GitHub pode atrasar execuções agendadas. A introdução deste workflow dispara uma primeira execução após o merge em `main`.

1. **Descoberta:** `scripts/daily_channel_autopilot.py` varre 18 coleções públicas de TV, incluindo feeds de Brasil, Portugal, Espanha, Estados Unidos, filmes e notícias. Fontes comunitárias sem proveniência suficiente entram na pesquisa/relatório, **não são automaticamente promovidas** ao catálogo. Nenhuma fonte de assinatura ou URL com token/credencial é publicada.
2. **Classificação:** país explícito do feed/metadados; categoria por metadados e regras; idioma somente se identificado, sem inferir idioma pelo país. Sem país reconhecível = `OTHER`. Aplicam-se exclusões conservadoras de redes pagas; a existência de uma URL pública não prova sua licença.
3. **Teste técnico:** até **120 candidatos por dia** (prioridade Brasil, Portugal, Espanha e EUA), até 12 verificações paralelas. Cada candidato que não fornece manifesto HLS e conteúdo inicial de mídia dispõe de até **60 segundos**, com novas tentativas. Uma resposta HTTP 200 isolada **não** é prova de reprodução. Criptografia/DRM não são ignorados. O monitor mede disponibilidade remota; não atesta codecs, geobloqueio ou funcionamento na Samsung.
4. **Publicação:** `site/daily-autopilot.m3u8` inclui somente sinais públicos que passaram por leitura de segmento de mídia em verificações recentes (até 8 dias). Itens reprovados saem **desta lista automática** e continuam elegíveis a rechecagem; fontes originais 1–11 não são apagadas. A Lista 12 é inserida na mesma consolidação da Lista 02, com país/categoria, sem novo painel na coluna principal. `site/daily-autopilot-report.json` expõe o recorte verificado, quantos ficaram pendentes e eventuais erros de fontes. `site/daily-autopilot-state.json` conserva o estado da auditoria. O job cria um commit automaticamente e solicita a publicação do GitHub Pages. A primeira versão começa vazia: nenhuma reprodução foi fabricada.
5. **No aparelho:** a regra já implementada no navegador Samsung continua independente: após 60 segundos sem evento real de vídeo `playing`, o canal **selecionado** fica oculto do guia local por até 24 horas. Pode ser restaurado a qualquer momento; favoritos e recentes ficam preservados. O job diário **não consegue ligar a Samsung nem testar cada vídeo no dispositivo** e não deve alegar que testou todos os canais de uma lista grande quando só verificou uma amostra.

**Não inclui:** copiar vídeos de serviços pagos, procurar credenciais/códigos, contornar DRM, provar licenciamento, publicar indiscriminadamente listas de terceiros, nem apagar definitivamente canais. Novas origens fora da curadoria definida exigem revisão antes de entrarem na publicação automática.

Monitoramento: GitHub → Actions → **DrivMatch - Autopiloto diario de canais**. Se o job não tiver permissão para atualizar a branch, o deploy falhar ou nenhuma fonte responder, a automação registra a falha em vez de declarar sucesso.
