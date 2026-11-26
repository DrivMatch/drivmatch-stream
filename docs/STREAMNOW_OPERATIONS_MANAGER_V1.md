# STREAM NOW — Gestor Operacional 24/7

**Estado:** ARCHITECTURE V1 / PARTIALLY IMPLEMENTED — NOT PRODUCTION CERTIFIED  
**Responsável humano:** fundador/operador autorizado  
**Base técnica:** repositório `DrivMatch/drivmatch-stream`, GitHub Actions, Cloudflare Pages/Workers e D1.

## Objetivo

Uma única torre de controle para detectar, diagnosticar, recuperar, validar e comunicar incidentes do Stream Now sem exigir do fundador a inspeção manual constante de workflows. **Não criar automações adicionais no ChatGPT** para funções já cobertas pelo OPS Sentinel. O gestor deve reutilizar workflows existentes e somente consolidá-los, sem comprometer proteção de contas e favoritos.

**Importante:** observação e alertas GitHub não equivalem a notificação entregue ao celular/e-mail do operador. O canal de alerta e seu recebimento precisam de teste real e reconhecimento (ACK).

## Fluxo de decisão

**Detect → Classify → Incident → Recover once → Verify real outcome → Close / Escalate**

- **Detect:** GitHub workflow_run, verificação de heartbeat e respostas do produto público.
- **Classify:** P0 (indisponibilidade do app/login, corrupção/desaparecimento de favoritos, publicação de catálogo perigoso), P1 (varredura diária falhou, audit incompleto, divergência GitHub–Cloudflare), P2 (queda parcial de fonte de pesquisa).
- **Incident:** Issue única por ocorrência em `[Stream Now OPS] ...`, atribuída ao operador. Registrar run, início/fim, impacto, evidência, estado e ação.
- **Recover once:** reiniciar somente jobs com falha quando seguro e autorizado; nunca repetir indefinidamente ou substituir conteúdo do usuário.
- **Verify:** estado `success` sozinho não basta: conferir playlist publicada (SHA-256), registro de autenticação, retomada de reprodução real quando possível, integridade da D1 e cobertura das auditorias.
- **Escalate:** falha após retry, ausência de sinais, falha na notificação ou impacto em dados exige intervenção humana e incidente aberto.
- **Close:** somente após verificação de resultado e registro de evidências; o assistente não deve declarar o serviço reparado sem prova.

## Capacidades e maturidade

| Domínio | Rotina operacional existente | Papel do gestor | Situação verificada |
|---|---|---|---|
| Descoberta global | `daily-channel-autopilot.yml`, `global_channel_discovery.py` | Observar fontes, categorias, países, candidatos, erros e bloqueios | Existe; pesquisa fora do HLS é parcialmente research-only |
| Verificação diária | Autopiloto 02h | Exigir meta de **1.200 candidatos/dia** (ou relatar déficit) e HLS até **60 s** | Configurado; produção contínua ainda não certificada |
| Auditoria integral | `streamnow-full-channel-health.yml` | Exigir cobertura de todos os candidatos HLS coletados, 24 shards e consolidação completa | Existe; execução anterior falhou; reexecução não é prova de conclusão |
| Inclusão/ocultação | `site/daily-autopilot.m3u8`, `site/channel-health.json` | Publicar apenas após gates; ocultar URL HLS reprovada no escopo testado, preservar opção de recuperação | Pipeline implementado, resultado global ainda não certificado |
| Favoritos | D1/archive e `streamnow-favorites-integrity-audit.yml` | Detectar divergência, verificar chave→país→fonte→stream e acompanhar teste real de clique | Integridade D1 é monitorada; reprodução end-to-end ainda não comprovada |
| Deploy | `streamnow-pages.yml` e Workers | Validar build, autorização e correspondência GitHub vs Cloudflare | Sentinel compara SHA-256 do catálogo |
| Contas/acesso | Worker de contas e Supabase | Verificar login/cadastro, 401 anônimo, erros e regressões sem acessar segredos | Testes de build; disponibilidade real contínua ainda não monitorada ponta a ponta |
| Alertas e resposta | `streamnow-ops-sentinel.yml` | Criar Issues, atribuir, tentar recuperação uma vez e escalar | Implementado; recebimento externo não validado |
| TVs e distribuição | Workflows Samsung/LG/Android | Acompanhar aprovações, regressões e evidência de compatibilidade | Ainda não integrado a alertas operacionais 24/7 |
| Negócio e compliance | Regras de catálogo de fontes | Não publicar streams pagos/restritos sem autorização; distinguir sinal técnico de direitos | Verificação técnica não comprova direitos nem reprodução em todo dispositivo |

## Regras invioláveis

1. Nenhuma atualização de catálogo pode excluir ou sobrescrever os favoritos, histórico pessoal, usuários ou suas credenciais.
2. `não testado` **não é** `reprovado`. Nunca ocultar em massa por falta de resposta do scanner.
3. Um teste HLS confirma resposta do manifesto e segmento remoto, **não** reprodução real em webOS/Samsung/Android, ausência de geo-restrição ou direitos de distribuição.
4. Diferenciar: `TESTED_OK`, `FAILED_60S`, `UNTESTED`, `GEO_BLOCKED`, `DRM_RESTRICTED`, `SOURCE_ERROR`. Confirmar região de teste antes de decisão global.
5. Catálogo integral só pode ser publicado após **todos** os shards; falha em qualquer shard impede a publicação parcial.
6. Autopiloto diário e auditoria integral compartilham um único grupo de concorrência no GitHub, impedindo duas rotinas de escrita simultâneas.
7. Limite de recuperação automática: uma repetição controlada por falha. Não apagar dados, alterar políticas, comprar serviços ou mudar segredos automaticamente.
8. Alerta de P0 deve ser entregue, reconhecido e escalado; Issue criada no GitHub **não é prova de entrega**.

## Inventário de agendamentos — 26/11/2026

- **02h BRT:** `daily-channel-autopilot.yml`: descoberta e até 1.200 testes.
- **04h e 06h BRT:** `daily-channel-audits.yml`: auditorias independentes e solicitação de recuperação.
- **02h05, 04h05 e 06h05 BRT:** `streamnow-favorites-integrity-audit.yml`: integridade da conta e arquivo, sem exclusão.
- **OPS Sentinel:** acionado por conclusão de pipelines e a cada 15 minutos aproximadamente (`8,23,38,53 * * * *`). Essa é **a única rotina de orquestração/alerta no GitHub**.
- **ChatGPT Stream Now — Monitor de Incidentes:** verificação horária secundária já existente; manter até comprovar push externo. Não abrir outra tarefa.
- **Validação antiga pontual do catálogo:** automação ChatGPT já desativada; apta a limpeza após aceite do fundador.
- Workflows de testes, APK/AAB, pacotes TV e release são acionados por eventos/PR/manual, não são cron jobs a eliminar apenas por existirem.

## Incidentes reais identificados no diagnóstico

- GitHub issue #75: auditoria integral #45806930206 falhou, sem consolidação final. A reexecução #45818791680 deve ser auditada independentemente.
- GitHub issues #76, #77 e #78: ausência/atraso reconhecidos nas janelas 02h/04h/06h de 26/11.
- O último relatório do autopiloto não equivale à auditoria integral. Favoritos ainda exigem prova real de reprodução.
- O monitor atual cria Issues GitHub atribuídas a `DrivMatch`, mas entrega ao proprietário por e-mail/push e ACK ainda **não foram comprovados**.

## Critérios de aceite comercial (Definition of Done)

- [ ] Simular falha de pipeline e verificar Issue P1 criada, enviada e **recebida** no canal aprovado.
- [ ] Simular indisponibilidade de login e favorito e verificar abertura de incidente P0.
- [ ] Validar retrigger exatamente uma vez, sem loop, e escalonamento quando a repetição falha.
- [ ] Executar auditoria integral completa: `tested = passed + failed`, nenhum shard ausente, tempo início/fim/duração e publicações conferidas.
- [ ] Conferir que os aprovados permanecem visíveis e os reprovados ficam ocultos no **catálogo efetivamente servido**; nenhuma exclusão da D1.
- [ ] Comparar GitHub e Cloudflare por SHA-256 e fazer teste real da experiência TV/celular.
- [ ] Criar quadro único de serviço: catálogo, favoritos, contas, deploy, TV, falhas e última verificação.
- [ ] Confirmar cobertura de indisponibilidade regional antes de esconder um canal globalmente.
- [ ] Validar procedimento de rollback e operador on-call.

## Governança de mudanças

O gestor controla fluxos, não substitui decisão humana sobre exclusão de dados pessoais, permissões, cobrança, segurança ou conteúdo não autorizado. Mudanças no escopo de atuação devem passar por PR, testes, evidências e publicação verificada.

**Status atual:** núcleo de observação e incidentes existente. Não anunciar como gestor comercial 24/7 plenamente implementado antes de validar recebimento de alertas, testes reais de usuário, integridade do catálogo e recuperação de ponta a ponta.
