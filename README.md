# DrivMatch Stream

Visualizador privado pessoal de TV — projeto independente do DrivMatch News e DrivMatch TV.

- Stream original: https://drivmatch.com/stream/ (ou a prévia https://drivmatch-stream-proxy.drivmatch.workers.dev/stream/).
- Biblioteca IPTV: /stream/listas/ — oito listas independentes numeradas; a Lista 8 contém canais públicos da Free-TV Brasil; a Lista 9 contém seleção restrita de emissoras públicas/abertas extraídas de uma fonte comunitária com testes diários de manifesto HLS, sem comprovar direito de retransmissão nem funcionamento na Samsung. Disney+, DAZN, ESPN, SporTV, Premiere, Telecine e SKY+ não são falsamente exibidos como canais reproduzíveis por meio de links de páginas institucionais.
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
