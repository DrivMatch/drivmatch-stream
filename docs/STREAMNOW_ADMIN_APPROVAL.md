# Stream Now — aprovação administrativa de cadastros
Fluxo: usuário escolhe e-mail e senha no cadastro, confirma o e-mail via Supabase, e fica com `approval_state=pending` no D1. Somente o administrador autenticado, com step-up e CSRF, aprova ou rejeita no painel `/stream/admin`. Enquanto pendente ou rejeitado, tanto login quanto sessão existente são bloqueados no backend.

## Ordem segura de implantação
1. Aplicar a migração `migrations/0007_stream_approval.sql` no banco D1 de cada ambiente.
2. Implantar o Worker alterado e verificar cadastro novo → pendente → aprovação → login.
3. Validar também rejeição, recuperação de senha, confirmação de e-mail, usuário já existente, sessão revogada e permissões.
4. Só depois publicar versões para TVs. Não há senha em texto aberto no painel: o Supabase gerencia a credencial.

**Importante:** código em branch de desenvolvimento. Nenhum deploy de produção ou aprovação em lojas é implícito. A lista de canais e o player existentes permanecem inalterados.

## Correção de registro e comunicação (25/11/2026)
- Em caso de rejeição definitiva do remetente SMTP, o backend tenta criar a identidade **não confirmada** por meio da API administrativa do Supabase e registrar o pedido no D1 como pendente. Não confirma endereço nem concede sessão. Se a identidade já existe ou a criação falhar, não altera a credencial existente. O usuário pode solicitar confirmação novamente em /stream/resend-confirmation.
- Pendências são priorizadas no painel. A ficha registra o estado de cada aviso; aceitação pelo provedor não prova entrega.
- Avisos independentes via Brevo, somente quando configurados no Worker: STREAM_NOTIFICATION_BREVO_KEY (segredo), STREAM_NOTIFICATION_FROM (remetente verificado), STREAM_NOTIFICATION_ADMIN_TO (endereço do administrador autorizado). Não colocar chaves no repositório. Nenhuma configuração/assinatura externa é feita pelo código. O SMTP de autenticação do Supabase deve ser configurado e validado separadamente; a integração de avisos não substitui a confirmação de identidade. Os avisos compartilham o limite global de 20 solicitações por dia de São Paulo.
- Aplicar também a migração 0008_stream_signup_notifications.sql antes do deploy. Sem configuração de avisos, o painel informa a ausência do serviço; a solicitação permanece visível. Sem SMTP funcional, o usuário não pode confirmar o endereço nem entrar. Não usar a aprovação para ignorar a confirmação.
- Validar em produção com uma conta de teste autorizada e destinatário controlado: cadastro normal; rejeição de SMTP e cadastro pendente; reenvio após corrigir SMTP; recepção real de alerta; decisão; recepção real da decisão; login antes/depois de confirmar e aprovar; rejeição; site e APK. Não declarar a entrega validada somente a partir de mocks ou smoke test GET.
