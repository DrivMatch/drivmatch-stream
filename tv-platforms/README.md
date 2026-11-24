# Stream Now — distribuição em Smart TVs (preparação, não publicação)
Fonte do catálogo e autenticação: https://streamnow-2o1.pages.dev/stream/ (mesmo backend e mesmas listas; nada duplicado). A logomarca canônica é convertida do asset existente `site/streamnow-icon.webp` no workflow. Não criar logos alternativos.

## LG webOS
O projeto `lg/` é um **hosted web app** suportado na documentação da LG. O workflow monta `icon.png` (80x80) e `largeIcon.png` (130x130) e tenta gerar um **IPK de teste** via ares-package. O ID `com.streamnow.tv` é PROVISÓRIO: verificar titularidade e disponibilidade antes de submissão; o ID não poderá ser alterado depois da publicação. A verificação do pacote não atesta reprodução real, controles nem aprovação na loja.

## Samsung Tizen
O projeto `samsung/` é um **development shell**, não um produto apto para envio. Samsung normalmente não aceita aplicativos apenas hospedados sem prévia autorização do Content Manager. O widget ID, Tizen application ID e certificate profile são **placeholders** que precisam ser gerados/validados pelo Tizen Studio com credenciais e certificado Samsung do titular. É proibido apresentar um ZIP não assinado como WGT instalável.
Alternativa para produção: app Tizen empacotado, com interface remota integrada por APIs oficiais e sessão segura, após adaptar a autenticação ao origin do aplicativo. Não substituir por iframe (o sistema atual bloqueia incorporação via `frame-ancestors 'none'`). Não colocar credenciais no aplicativo.

## Bloqueios antes da publicação
- Cadastrar e validar contas de vendedor nos portais Samsung TV Seller Office e LG Seller Lounge.
- Confirmar ID/publisher/legal entity e termos de serviço, privacidade, suporte e política de retenção de dados.
- Verificar formalmente direitos de exibição/distribuição de cada canal por país. Playlists públicas não provam autorização.
- Confirmar teste com TVs físicas, teclas de controle remoto, back, login, aprovação, sessão, encerramento, rede instável, codecs e DRM.
- Produzir screenshots reais e assets específicos nas dimensões exigidas; confirmar variantes do símbolo no kit canônico.
- Submeter ao QA de cada fabricante. Somente o retorno oficial confirma publicação.

Referências oficiais:
https://webostv.developer.lge.com/develop/getting-started/web-app-types
https://webostv.developer.lge.com/distribute/app-approval-process
https://developer.samsung.com/smarttv/develop/faq/hosted-applications.html
https://developer.samsung.com/tv-seller-office/guides/applications/registering-application.html
