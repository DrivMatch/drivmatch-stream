# DrivMatch Stream — biblioteca independente de playlists IPTV

Pesquisa e arquitetura: 2026-11-22. Este arquivo documenta fontes candidatas e implementação, **não** uma certificação de direitos ou verificação de reprodução.

## Produto e benchmark

- Bob Player (https://frontend.bobplayer.com/): aplicativo geral de reprodução que informa não fornecer playlists nem assinaturas. Inspiração: o player é separado da fonte.
- IBO Player (https://apps.iboiptv.com/support): player de listas M3U/M3U8; a origem e permissões do conteúdo são externas.
- CAP Player (https://pt.capplayer.com/): aceita playlists M3U e URL de EPG, reforçando a separação entre playlist e guia.
- M3U Extended: #EXTM3U, #EXTINF, tvg-id, tvg-logo, tvg-country e group-title. O EPG de programação XMLTV é um artefato separado; o ID tvg-id sozinho não fornece a grade de programação.

O escopo implementado é um catálogo de listas, protegido por sessão: /stream/listas/. A interface e a configuração ficam separadas do Stream original /stream/. A mesma autenticação privada do Cloudflare Worker é reaproveitada. Nenhuma alteração em /news ou /TV.

## Fontes candidatas registradas

| Número | Nome | URL(s) e origem | Relação e limites |
|---|---|---|---|
| 1 | Free-TV | https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8 | Fonte distinta, catálogo internacional. Direitos dos sinais exigem checagem individual. |
| 2 | IPTV-org 12 países | https://iptv-org.github.io/iptv/countries/br.m3u e mais 11 códigos: pt, es, jp, cn, us, ar, uk, be, it, fr, de | Mesma fonte-base do Stream original, agora como lista opcional. |
| 3 | IPTV-org Notícias | https://iptv-org.github.io/iptv/categories/news.m3u | Recorte temático da mesma origem da Lista 2. |
| 4 | IPTV-org Esportes | https://iptv-org.github.io/iptv/categories/sports.m3u | Recorte temático da Lista 2; canais premium não recebem acesso automático. |
| 5 | Nexonic IPTV | https://shahrukhalid.github.io/nexonic-iptv/playlists/all.m3u | Diretório alternativo que declara checagens frequentes; declaração do mantenedor não equivale a teste nosso. |
| 6 | LegalFreeIPTV Live | https://biskyt.github.io/legalFreeIPTVplaylist/live.m3u | Coleção pequena de transmissões ao vivo com justificativas de uso. |
| 7 | FreeCastHub | https://raw.githubusercontent.com/freecasthub/public-iptv/main/playlist.m3u | Diretório comunitário experimental, sujeito a revisão de origem e direitos. |

**Importante:** sete listas não significam sete provedores independentes nem sete conjuntos sem canais repetidos. As contagens variam. Não foi realizado teste real de todos os sinais.

## Regras de implementação

1. Carregar somente a lista escolhida, com limite de tamanho, timeout e erros por fonte; exibir quantos canais foram importados sem prometer disponibilidade.
2. Tratar arquivos M3U/M3U8 de catálogo separadamente de manifestos HLS de vídeo. Na seleção pública, reproduzir URLs HTTPS HLS/MP4 compatíveis com navegador.
3. Extrair só metadados textuais e URLs seguras; nunca executar scripts da playlist. Proteger saída no DOM por textContent.
4. Permitir 12 países, categoria, busca, favoritos e paginação. País ausente fica como não informado.
5. Reproduzir com mídia nativa ou HLS.js, alternativas limitadas e timeout. Indicar “reproduziu” somente após evento de mídia deste aparelho.
6. Importação própria via URL HTTPS ou arquivo local; sem persistência de URLs privadas, armazenamento de credenciais, bypass de CORS/DRM ou retransmissão.
7. Pay-per-view e fontes pagas: somente serviços oficiais e direitos/autenticação aplicáveis. Não incluir catálogos piratas, credenciais compartilhadas ou canais pagos liberados por listas públicas.
8. Os testes do Worker e do navegador para a biblioteca usam mídia simulada. Não comprovam funcionamento de nenhum canal real.

## Limites e próximas fases

- CORS, DRM, regiões, validade de URLs, codecs, condições comerciais e direitos podem impedir a reprodução.
- Os grupos e logos externos não comprovam a identidade ou direitos do canal.
- **EPG completo XMLTV não está integrado nesta versão.** O ID tvg-id é catalogado para integração futura com autorização e correspondência.
- **Xtream Codes não está integrado.** Exigiria tratamento específico de credenciais e fornecedor autorizado; não expor senhas de assinatura no frontend.
- A plataforma não monitora periodicamente todos os sinais; o status é de sessão e aparelho.
- Filmes, séries, VOD e PPV oficiais exigem fontes, contratos e interfaces específicas.
- O número bruto de links não é indicador de qualidade. Futuro QA precisa medir taxa real de reprodução por país, tipo e dispositivo com método e evidência.

Referências: https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md ;
https://github.com/iptv-org/iptv/blob/master/docs/playlists.md ;
https://github.com/Free-TV/IPTV ;
https://github.com/Shahrukhalid/nexonic-iptv ;
https://github.com/biskyt/legalFreeIPTVplaylist ;
https://github.com/freecasthub/public-iptv ;
https://pt.capplayer.com/ .
