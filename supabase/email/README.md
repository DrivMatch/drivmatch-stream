# DrivMatch Stream — convite por e-mail

Modelo aprovado de convite, independente de DrivMatch News e de outros projetos.

**Assunto:** `Seu convite para o DrivMatch Stream | TV de vários países`

**Template HTML:** `supabase/email/invite.html`

**Stream web (ambiente de teste):** https://drivmatch-stream-v2-test.drivmatch.workers.dev/stream/

**APK Android testado no pipeline (GitHub Release público):**
https://github.com/DrivMatch/drivmatch-stream/releases/download/stream-android-test-v0.1.1/app-debug.apk

O APK é **debug/teste**, não uma versão assinada para distribuição comercial pela
Google Play. A versão do release foi compilada com o endereço do Worker de teste
pré-configurado. O link foi verificado pelo endpoint de releases do GitHub;
os fluxos de login e de instalação física em aparelhos diferentes ainda precisam de
testes reais. Quando houver uma versão estável, atualizar simultaneamente o
template, o link e a informação de versão. **Nunca** manter um link APK desatualizado
em convites recorrentes.

## Publicação automatizada — situação atual

O HTML do convite e o APK estão disponíveis e validados por teste automatizado, mas
o template **não está aplicado** ao Supabase hospedado. O último convite real foi
enviado pelo modelo padrão em inglês, como confirmado em 2026-11-23.

Verificação no GitHub: https://github.com/DrivMatch/drivmatch-stream/actions/runs/45280958363

**Bloqueio confirmado:** não existe um secret denominado
`STREAM_SUPABASE_MANAGEMENT_TOKEN` no ambiente GitHub utilizado. A chave
`STREAM_SUPABASE_SECRET_KEY` é para Auth Admin, não para configurações do projeto.

Uma única autorização de gerenciamento permite continuar o diagnóstico sem
exibir a senha ou o token nesta conversa:

1. No [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens),
   criar um Personal Access Token com acesso à configuração de Auth do projeto
   `DrivMatch Stream Auth` (`ysrpfwemqrysjkoahoaa`).
2. Salvar a credencial como GitHub Actions secret
   `STREAM_SUPABASE_MANAGEMENT_TOKEN` no repositório
   `DrivMatch/drivmatch-stream`. Não enviá-la por chat.
3. Executar manualmente o workflow
   `.github/workflows/apply-stream-invite-branding.yml` a partir do branch
   `feature/independent-cloudflare-access`. Ele verifica projeto, template e
   a configuração SMTP, atualiza apenas a configuração de envio de convite e
   confirma o assunto e HTML após aplicar. Não dispara convites automaticamente.

Se houver SMTP próprio já configurado, a rotina mantém o remetente existente.
Se não houver, exigirá um provedor SMTP e seu remetente verificado; atualmente a
automação oferece a opção de Resend e exige
`STREAM_RESEND_API_KEY` e `STREAM_EMAIL_SENDER`, sujeitos à verificação
do domínio. **Não assumir que um provedor SMTP já existe.**

O limite de **20 solicitações por dia** no aplicativo é independente do limite
de envio do serviço SMTP. Sem SMTP próprio, o Supabase Free criado em 2026
não libera a personalização do modelo de e-mail.

A versão do modelo contém: saudação em português; identidade DrivMatch Stream;
botão `{{ .ConfirmationURL }}` para criar senha; link do Stream web; link de APK
Android de teste; e aviso de segurança.

## Verificação de recebimento

Depois de configurar o SMTP e aplicar o template, disparar **um novo convite
autorizado** ou um teste consensual. O e-mail anterior não pode ser alterado
retroativamente. Conferir assunto, corpo, link pessoal, Stream, APK, criação de
senha, login e recebimento real na caixa de entrada. Não confundir confirmação
do provedor com entrega efetiva.

