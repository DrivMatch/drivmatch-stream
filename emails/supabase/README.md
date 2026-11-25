# Stream Now — modelos de autenticação PT-BR

Modelos para Auth > Emails > Templates no projeto Supabase DrivMatch Stream Auth. Preservam o link dinâmico oficial `{{ .ConfirmationURL }}`, a confirmação do endereço e a aprovação obrigatória quando aplicável. Não alterar SMTP, segurança ou contas. A logo é a aplicação canônica existente, servida externamente; clientes podem bloquear imagens ou não suportar WebP. Texto permanece legível sem imagem.

- confirmation.html — assunto: Bem-vindo ao Stream Now! Confirme seu e-mail
- invite.html — assunto: Seu convite para o Stream Now
- recovery.html — assunto: Stream Now | Recupere o acesso à sua conta

Aplicação no projeto hospedado requer acesso autorizado ao painel ou Management API; este commit não publica os modelos no Supabase. Validar visual em Gmail/Outlook, links em conta de teste autorizada, confirmação e login. Desabilitar rastreamento de links de autenticação no provedor se estiver habilitado. Não afirmar que os e-mails de decisão administrativos estão configurados: são separados.
