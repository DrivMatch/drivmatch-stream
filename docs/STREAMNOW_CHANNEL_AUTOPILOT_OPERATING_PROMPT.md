# STREAM NOW — PROMPT OPERACIONAL OBRIGATÓRIO DE DESCOBERTA E AUDITORIA v2.0
Data: 25/11/2026. Aplica-se a qualquer agente, script, operador, workflow, revisão e publicação.

## Missão
Descobrir, avaliar e organizar canais públicos/abertos, jornalismo e esportes, transmissões oficiais ao vivo e novas fontes de todas as regiões e países do mundo, em todas as línguas disponíveis, com pesquisa local, multilingue e transliteração prudente. Operar diariamente o catálogo sem destruir ativos existentes dos usuários.

## CONSTITUIÇÃO INVIOLÁVEL — FAVORITOS
**NUNCA APAGAR, ZERAR, SUBSTITUIR OU REINICIALIZAR FAVORITOS, HISTÓRICO OU LISTAS DO USUÁRIO.**
NÃO USAR `localStorage.clear()`, `removeItem` de favoritos, nenhuma migração destrutiva, nenhum reset de storage, perfil, hostname, aplicativo ou cache. Nunca assumir que lista vazia significa ausência de dados. Se dados existentes não puderem ser lidos, bloquear escrita. Não tocar nas chaves locais, backups nem em dados da conta durante descoberta, auditoria, publicação ou atualização visual. Aplicar `docs/STREAMNOW_FAVORITES_DATA_CONSTITUTION.md` a **APK, AAB, Android TV, Tizen Samsung, LG webOS, desktop, iPad, iPhone, celulares e todos os navegadores**. Os testes de preservação são gates de publicação obrigatórios.

## Cadência e responsabilidade
- **02h America/Sao_Paulo — Agente principal:** pesquisar, validar, classificar, produzir relatório, publicar apenas artefatos de catálogo permitidos e nunca modificar dados pessoais.
- **04h — Auditor A independente:** verificar execução da madrugada, data, fontes respondidas, catálogo e integridade; se não houver execução válida, disparar nova varredura com o workflow oficial. Não declarar sucesso só porque o job iniciou.
- **06h — Auditor B independente:** reexaminar a execução e os dados publicados por lógica distinta; conferir integridade dos totais, playlist, pesquisa mundial e multilíngue; disparar recuperação se ausente/incompleta. Não duplicar desnecessariamente uma recuperação ainda em execução.
- Agendamentos dependem da entrega do evento pelo GitHub; eventos podem sofrer atraso ou perda. Auditoria deve reportar a incerteza e registrar o que foi/ não foi executado. Nunca prometer execução no minuto exato sem infraestrutura com SLA.

## Pesquisa mundial e fontes novas
- Cobrir *progressivamente* TODOS os países disponíveis no índice e TODAS as regiões: Américas, Caribe, Europa ocidental e oriental, África, Oriente Médio, Ásia, Oceania e territórios adicionais. Cobertura diária usa rotação verificável; não afirmar todos os países na mesma noite quando somente parte foi varrida.
- Consultar listas públicas de emissoras, veículos locais, TVs universitárias, canais regionais, autoridades de trânsito quando aplicável, redes oficiais de notícias, organizações esportivas, rádios com vídeo e serviços FAST; expandir regularmente e nunca limitar a lista aos provedores atuais.
- Pesquisar em português, inglês, espanhol, francês, alemão, italiano, russo, ucraniano, árabe, chinês, japonês, coreano, hindi, bengali, swahili, persa, turco, tailandês, vietnamita, indonésio, neerlandês, grego, hebraico e outros idiomas conforme os países visitados.
- Buscar especificamente **notícias ao vivo**, **esportes ao vivo**, eventos públicos, cobertura local, canais comunitários e canais oficiais de imprensa. Registrar países, idiomas, fontes, erros e novas identidades sem afirmar playback que não foi testado.
- Separar estados: IDENTIFIED_SOURCE / OFFICIAL_IDENTITY_VERIFIED / EMBED_ELIGIBLE / MEDIA_PROBE_OK / PHYSICAL_DEVICE_PLAYBACK_VERIFIED / RIGHTS_VERIFIED. Um estado não implica outro.

## YouTube e integridade de origem
- Aprender com o conceito do DrivMatch News de organizar lives públicas sem baixar, converter ou redistribuir mídia. A implementação específica do projeto News precisa ser revisada separadamente antes de afirmar reutilização de seu código.
- Canais oficiais YouTube podem aparecer na lista como qualquer canal de notícias/esportes, com nome, gênero, país e possibilidade de favoritar. A origem deve continuar identificável nos metadados e na interface, e o player oficial deve manter a atribuição do YouTube.
- NUNCA esconder marca, origem, controles obrigatórios, propagandas, restrições geográficas ou monetização do YouTube. NUNCA transformar live do YouTube em HLS próprio via extração de URLs, proxy, download ou retransmissão não autorizada.
- Incorporar somente via player oficial quando o titular permitir embed e conforme políticas da plataforma, ou oferecer link externo ao canal oficial. A condição “live agora” exige verificação própria; inscrição oficial no catálogo não é prova de transmissão ativa.
- Direitos de redistribuição, patrocínio, paywall e eventos esportivos são verificados separadamente. Esportes premium são somente referência oficial, nunca canal aberto simulado.
- Pesquisa de novos canais requer revisão de fonte oficial, identidade do titular, disponibilidade, segurança, compatibilidade, direitos e atribuição. Não promover link genérico de uma playlist desconhecida ao player automaticamente.

## Resultado exigido de cada rodada
Registrar horário local real, conclusão do job, fontes pesquisadas e respondidas, países visitados, idiomas consultados, candidatos novos, candidatos aprovados para guia oficial, canais HLS saudáveis e falhas, métricas comparáveis, direitos pendentes, limitações reais, integridade de favoritos e eventuais ações corretivas tomadas. Se a auditoria falhar, registrar causa e se o redisparo foi confirmado.

**Regra final:** descoberta e crescimento não podem custar um único favorito salvo; expansão de catálogo e continuidade do usuário são invariantes simultâneas.
