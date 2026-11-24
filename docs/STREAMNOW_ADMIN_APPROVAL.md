# Stream Now — aprovação administrativa de cadastros
Fluxo: usuário escolhe e-mail e senha no cadastro, confirma o e-mail via Supabase, e fica com `approval_state=pending` no D1. Somente o administrador autenticado, com step-up e CSRF, aprova ou rejeita no painel `/stream/admin`. Enquanto pendente ou rejeitado, tanto login quanto sessão existente são bloqueados no backend.

## Ordem segura de implantação
1. Aplicar a migração `migrations/0007_stream_approval.sql` no banco D1 de cada ambiente.
2. Implantar o Worker alterado e verificar cadastro novo → pendente → aprovação → login.
3. Validar também rejeição, recuperação de senha, confirmação de e-mail, usuário já existente, sessão revogada e permissões.
4. Só depois publicar versões para TVs. Não há senha em texto aberto no painel: o Supabase gerencia a credencial.

**Importante:** código em branch de desenvolvimento. Nenhum deploy de produção ou aprovação em lojas é implícito. A lista de canais e o player existentes permanecem inalterados.
