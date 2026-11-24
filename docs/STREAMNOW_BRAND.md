# Stream Now — identidade visual canônica aplicada

Referência visual: duas imagens enviadas pelo proprietário em 23/11/2026. Este documento registra a aplicação visual; não reivindica registro de marca.

## Sistema visual

- Marca pública: **Stream Now**, sem logotipo DrivMatch nem rótulo provisório SN.
- Paleta de referência: vermelho primário `#FF003C`, rosa `#FF1478`, violeta `#9C00FF`, fundo `#080114`, fundo secundário `#1A0E2A`, branco `#FFFFFF`.
- Marca horizontal no cabeçalho TV Samsung/desktop, na tela clássica, na biblioteca e no login.
- Ícone da versão app usado como favicon, sem redesenhar a geometria do triângulo nem das ondas.
- Fontes: referência Montserrat; UI continua em Arial/system fallback para não exigir dependência externa nem mudar a compatibilidade dos browsers Samsung.
- Gradientes vermelho→rosa e superfícies roxo-preto; controles focados com borda rosa clara e contraste visível.

## Assets reais incorporados

- `site/streamnow-brand.webp`: recorte otimizado da versão horizontal oficial da primeira imagem fornecida, com proporção original preservada.
- `site/streamnow-icon.webp`: recorte otimizado do ícone de aplicativo da mesma referência.
- São derivados rasterizados da prancha enviada, não arquivos-mestre vetoriais nem uma reconstrução do símbolo. Para uso comercial impresso/lojas de aplicativos em alta resolução, substituir pelos PNG/SVG oficiais fornecidos pelo designer sem recriar a geometria.
- As imagens só são expostas nos caminhos públicos explicitamente permitidos `/stream/brand.webp` e `/stream/icon.webp`. Outros arquivos de aplicativo exigem autenticação.

## Escopo aplicado

- Login do Cloudflare Worker: identidade Stream Now, fundo escuro, botão com degradê oficial, logo antes do formulário.
- Samsung/desktop/mobile: cabeçalho com logotipo, selo AO VIVO, nova paleta nas três colunas e no player, estados ativos e foco.
- Interface clássica: logo, fundo, filtros, canais, player e cartões com paleta Stream Now.
- Biblioteca M3U: header com logo, cartões e botões coerentes.
- Não foram incluídas telas fictícias de catálogo de filmes, séries, recomendações personalizadas ou assinatura; a prancha também mostra aplicações futuras que não existem no produto atual.

## Controle de mudanças

- Preservar ID/seletores críticos de player, países, categorias e pesquisas.
- Não remover autenticação, PIN, favoritos, histórico, autopiloto ou checagens de direitos e fontes.
- Conferir testes de Worker, navegador Chromium e dispositivos Samsung reais antes de afirmar qualidade de produção.
- Novo Pages `streamnow.pages.dev` segue condicionado à permissão de token Cloudflare Pages:Edit (erro 10000 em tentativa anterior). Esta atualização visual não equivale a publicação desse endereço.
