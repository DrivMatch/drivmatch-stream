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

## Publicação no Supabase hospedado

1. Acesse o projeto **DrivMatch Stream Auth** no Supabase.
2. Abra **Authentication → Emails → Templates → Invite user** (a localização pode variar).
3. Substitua o **Subject** pelo conteúdo de `invite-subject.txt`.
4. Substitua o **Body** pelo HTML integral de `invite.html` e salve.
5. Preserve **`{{ .ConfirmationURL }}`** no atributo `href` do botão. É um link seguro, individual e temporário gerado pelo Supabase.
6. Confirme que **Authentication → URL Configuration** inclui a URL permitida
   `https://drivmatch-stream-v2-test.drivmatch.workers.dev/stream/activate`.
7. Para envio real a pessoas que não sejam membros da equipe no Supabase,
   configure **Authentication → Emails → SMTP Settings** com um serviço próprio.
   Sem SMTP, o serviço padrão tem restrições de destinatário e volume.
8. Teste com destinatário voluntário: recebimento, criação de senha, login,
   recuperação, expiração e cancelamento.

> Este repositório armazena o modelo como fonte versionada. Criá-lo aqui **não altera**
> o template no dashboard Supabase automaticamente. A configuração em produção requer
> acesso ao painel ou um token da Management API diferente da chave `sb_secret_*`.
> Nunca coloque segredo ou senha em templates nem em commits.

Não prometa disponibilidade irrestrita de conteúdo, transmissão de todos os canais
ou direitos de mídia não validados. O convite descreve apenas a experiência de descoberta.
