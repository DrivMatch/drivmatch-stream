# Stream Now — migração independente

Data: 2026-11-23. Endereço pretendido: https://streamnow.pages.dev/

## Arquitetura

- Cloudflare Pages, projeto streamnow, endereço gratuito pages.dev.
- A raiz / carrega a interface Samsung/desktop/celular após login; rotas /stream/ e /stream/tv/ permanecem compatíveis.
- O mesmo Worker mantém sessão HMAC-SHA256, HttpOnly, Secure, SameSite=Strict. No novo host o cookie usa Path=/.
- Páginas e scripts protegidos vêm de env.ASSETS.fetch, sem buscar o site antigo no GitHub Pages.
- Apenas daily-autopilot.m3u8 é publicamente acessível de propósito, pois é um índice de canais públicos.
- A playlist automática da fonte lista-12 aponta ao novo domínio ao servir pelo hostname streamnow.pages.dev.
- Links antigos continuam disponíveis como contingência durante a migração. Nenhum redirecionamento do DrivMatch foi ativado.
- Identidade pública HTML, login, Samsung e biblioteca foi trocada para Stream Now; marca SN é temporária até receber a logo.

## Publicação

1. Verificar se o nome streamnow está disponível no Cloudflare Pages; a criação do projeto precisa funcionar.
2. Confirmar secrets do repositório: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e STREAM_ACCESS_PASSWORD.
3. O token Cloudflare deve permitir Pages:Edit na conta. O arquivo .github/workflows/streamnow-pages.yml tenta criar o projeto, configura a senha e publica o diretório dist com _worker.js.
4. Exigir testes automatizados e deploy bem-sucedido, sem prometer site ativo antes disso.
5. Verificar ao vivo: GET / sem sessão mostra login; POST /stream/login válido retorna cookie Path=/ e redireciona para /; GET / com cookie mostra TV; GET /stream/session sem cookie dá 403.
6. Testar logout, desktop, Samsung, celular, canais HLS, listas e catálogo. A disponibilidade de mídia de terceiros e as licenças não são provadas por testes simulados.
7. Somente depois da verificação real considerar desligar a rota antiga e migrar o repositório para uma conta inteiramente nova, se desejar.

## Limites e cautelas

- Não criar ou comprar domínio: usa pages.dev gratuito.
- O Pages Functions conta na franquia gratuita de Workers; 500 a 1000 usuários simultâneos precisam teste de carga e monitoramento.
- O acesso atual é senha compartilhada, não login individual para mil pessoas.
- PIN TV de oito dígitos depende de rate limiter efetivo e falha fechado se ausente. A implantação Pages não copia esse PIN automaticamente; usa somente senha forte.
- Não colocar segredos, informações privadas nem credenciais de playlists nos arquivos estáticos; em erro não tratado no Advanced Mode o Cloudflare pode realizar fallback estático.
- Favoritos e histórico em localStorage pertencem ao domínio antigo e não migram automaticamente para outro domínio.
- O catálogo reúne fontes públicas de terceiros; HLS acessível não comprova direito de retransmissão.

## Pendência comprovada no deploy

- Execução GitHub Actions 45289833660: testes de código/autenticação e empacotamento PASS; criação/configuração de Cloudflare Pages BLOCKED por erro da API 10000 (permissões insuficientes no token existente). Nenhum deploy do endereço novo foi confirmado.
- Correção no workflow (commit 4959964dc9043f814636bde29d6c66d6a633f0cd): suporta um token separado em GitHub Actions Repository Secrets chamado `CLOUDFLARE_PAGES_API_TOKEN`, com prioridade sobre `CLOUDFLARE_API_TOKEN` legado. O workflow agora não trata a recusa de criar projeto como sucesso.
- Ação manual necessária: criar no Cloudflare um token restrito à conta correta com permissão `Account → Cloudflare Pages → Edit`, armazenar somente no GitHub como `CLOUDFLARE_PAGES_API_TOKEN` e executar novamente `.github/workflows/streamnow-pages.yml` pelo GitHub Actions. Não colar token no chat e não mudar o token do Worker antigo.
- Depois: exigir deploy PASS e verificar HTTP com e sem cookie; sem isso `https://streamnow.pages.dev/` permanece apenas endereço pretendido.
