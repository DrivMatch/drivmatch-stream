# DrivMatch Stream — login pessoal sem cartão

Destinação: drivmatch.com/stream/; independente de News (/news) e TV original (/TV).
GitHub Pages publica apenas a interface pública, sem senhas nem dados privados.
Worker exclusivo drivmatch-stream-proxy controla acesso e encaminha os arquivos da interface.

Autenticação: formulário de senha hospedado no Worker; Cloudflare Access Zero Trust e Supabase não são usados.
Senha escolhida pelo proprietário com pelo menos 20 caracteres, guardada como GitHub Actions Repository Secret chamado STREAM_ACCESS_PASSWORD.
Link direto: https://github.com/DrivMatch/drivmatch-stream/settings/secrets/actions/new
Github Actions transmite essa senha no upload pelo Wrangler --secrets-file, sem armazená-la no repositório.
Login em /stream/ gera cookie HMAC-SHA256 assinado, HttpOnly, Secure, SameSite=Strict, Path=/stream, 7 dias.
Troca da senha invalida sessões. Não há limitação distribuída de tentativas nesta versão; use senha exclusiva e forte.
Sem secret configurado, Worker retorna 503 e não revela a interface.

Para publicar: configurar segredo STREAM_ACCESS_PASSWORD; executar workflow cloudflare-worker.yml
que já tem CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID no GitHub.
Verificar login e logout na URL temporária https://drivmatch-stream-proxy.drivmatch.workers.dev/stream/ .
Em seguida conectar apenas rotas Workers drivmatch.com/stream e drivmatch.com/stream/*, não a raiz do domínio.
Nunca modificar Worker drivmatch-news-proxy ou original TV /TV.
Testes automatizados são simulados. Reprodução real dos HLS e direitos permanecem não verificados.

## Optional TV-friendly PIN (2026-11-22)

Keep the strong original `STREAM_ACCESS_PASSWORD` as the HMAC signing secret. To enable the eight-digit numeric TV login, create another GitHub Actions secret named `STREAM_TV_PIN` with exactly 8 decimal digits. The Worker then accepts **only the PIN** for interactive login; the original secret remains server-side for signing, and new sessions are bound to the PIN so changing it expires previous sessions. Login is limited using Cloudflare Workers rate-limit binding `STREAM_LOGIN_LIMITER` at about five attempts per minute per Cloudflare location, not a strict global guarantee. If rate limiter is absent, PIN login fails closed. Without this optional PIN secret, prior long password login remains available. Never put PIN or signing secret in HTML, Git history or chat; the PIN has weaker entropy than a strong password. Avoid obvious PINs and rotate if exposed.
