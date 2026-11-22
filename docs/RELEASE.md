# DrivMatch Stream — release e fronteiras

Destino: **https://drivmatch.com/stream/**. **Produto independente** de DrivMatch News (`/news`) e DrivMatch TV broadcast (`/TV`): repositório, site, pipeline, secrets e Worker próprios. Nenhum arquivo de News ou TV foi alterado.

Visual: paleta e componentes da origem News (preto #070c12, azul-marinho #091a2b, azul ativo #167ade, papel #f6f8fa, cartões brancos #fff), mas identidade Stream própria sem copiar o nome News.

Pipeline GitHub Pages: `site/` é a raiz publicada. URL de origem esperada: https://drivmatch.github.io/drivmatch-stream/ . A URL personalizada exige **Worker separado** `cloudflare/stream-proxy.mjs` ligado somente à rota `drivmatch.com/stream*`.

Gate de privacidade: inicialização bloqueada até sessão Supabase válida e resposta allow de `supabase/functions/stream-owner-access` usando o UUID guardado exclusivamente no servidor em `STREAM_OWNER_USER_ID`. Secrets GitHub Actions: `STREAM_SUPABASE_URL` e `STREAM_SUPABASE_PUBLISHABLE_KEY` (valores de navegador permitidos; *nunca* service_role). Após instalação, implantar a função no projeto correto e testar Owner 200, outro usuário 403 e anônimo 401/403. Aplicar também uma política Cloudflare Access em `/stream*`, pois o HTML está em origem pública GitHub Pages.

Catálogo comunitário IPTV-org: disponibilidade, CORS, suporte Samsung, geoblocks e autorização de reprodução **não comprovados**. Canais pagos ou protegidos não podem ser contornados. Não afirmar funcionamento no ar sem testar o sinal real em navegador e domínio.

**Status: código staged; implantação condicionada à ativação Pages e Cloudflare/Supabase.**
