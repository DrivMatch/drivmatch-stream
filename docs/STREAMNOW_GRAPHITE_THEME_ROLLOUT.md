# Stream Now — correção do tema preto/vermelho/cinza

**Decisão do proprietário (23/11/2026):** interface somente em preto, vermelho e cinza, incluindo tons de luminosidade e contraste necessários. A direção visual é moderna, de baixo estímulo cromático e confortável para assistir na TV.

## Escopo entregue em código
- `site/streamnow-graphite.css` é a camada final de estilos para o visual Samsung/Tizen, desktop, celular e biblioteca.
- CSS carregado **depois** dos estilos legados por `site/tv.html`, `site/index.html` e `site/listas.html`.
- A rota protegida `/stream/graphite.css` é servida pelo Worker a partir do mesmo projeto; sem sessão, 403.
- A tela de login no Worker recebeu tema preto/grafite/vermelho e preserva a logomarca original sem mudar seus pixels.
- `emails/streamnow-invite.html`: template de convite real para integrar futuramente a serviço de envio. Substituir `{{BRAND_LOGO_URL}}` por URL HTTPS acessível do logotipo e `{{ACCESS_URL}}` pelo endereço confirmado do Stream; **não enviar automaticamente**. Não inventar endereço de suporte nem prometer filmes/séries que não estão implementados.
- `tests/streamnow_red_theme.test.mjs`: valida que o CSS novo não emprega outras cores, protege o acesso à rota e verifica a ligação das páginas e do convite.

## Não concluído
- **Aplicativo Android APK 0.1.1**: release `stream-android-test-v0.1.1` foi feito antes desta atualização e aponta para `drivmatch-stream-v2-test.drivmatch.workers.dev`. Seu binário **não foi reconstruído**. É necessário recuperar ou construir o projeto Android e publicar uma nova release que use o domínio realmente operacional.
- **`streamnow.pages.dev`** continua bloqueado pela permissão `Account → Cloudflare Pages → Edit` no token.
- **Homologação Smart TV Samsung física:** não realizada. GitHub Actions com Chromium serve como regressão técnica, não garante aparência em modelo específico de Smart TV.
- **Template de e-mail** não equivale a envio de convites, infraestrutura de entrega ou endereço de e-mail configurado.

## Identidade canônica
O logotipo original mantém a geometria e os pixels originais, conforme a referência visual congelada v1.0. Esta decisão restringe **as cores da interface**, sem recriar nem alterar o arquivo canônico da marca.

## Aceitação real
Conferir em Samsung/desktop/mobile: fundo preto/grafite, textos branco/cinza, somente vermelho nas ações e itens ativos, ausência de verde; testar login/logout, canais, favoritos, controles remotos, guias e player em dispositivos reais. Evitar marcar como concluído sem validação em produção.
