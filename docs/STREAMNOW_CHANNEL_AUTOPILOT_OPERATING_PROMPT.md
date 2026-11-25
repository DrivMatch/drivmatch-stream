# STREAM NOW — PROMPT OPERACIONAL OBRIGATÓRIO DE DESCOBERTA E AUDITORIA v3.0
Data: 25/11/2026. Aplica-se a qualquer agente, script, operador, workflow, revisão e publicação.

## Missão
Descobrir, avaliar e organizar **toda a programação aberta e oficialmente disponibilizada**: canais generalistas, regionais, comunitários, notícias, jornalismo, economia, esportes, futebol, filmes, séries, infantil, desenhos, música, entretenimento, cultura, educação, documentários, ciência, tecnologia, viagens, gastronomia, natureza, religião, universidades e eventos públicos. Cobrir progressivamente todas as regiões e países do mundo e todos os idiomas disponíveis, com pesquisa local, multilingue e transliteração prudente. A busca de notícias e esportes é importante mas **NÃO pode monopolizar a descoberta**. Operar diariamente o catálogo sem destruir ativos existentes dos usuários.

## CONSTITUIÇÃO INVIOLÁVEL — FAVORITOS
**NUNCA APAGAR, ZERAR, SUBSTITUIR OU REINICIALIZAR FAVORITOS, HISTÓRICO OU LISTAS DO USUÁRIO.**
NÃO USAR `localStorage.clear()`, `removeItem` de favoritos, nenhuma migração destrutiva, nenhum reset de storage, perfil, hostname, aplicativo ou cache. Nunca assumir que lista vazia significa ausência de dados. Se dados existentes não puderem ser lidos, bloquear escrita. Não tocar nas chaves locais, backups nem em dados da conta durante descoberta, auditoria, publicação ou atualização visual. Aplicar `docs/STREAMNOW_FAVORITES_DATA_CONSTITUTION.md` a **APK, AAB, Android TV, Tizen Samsung, LG webOS, desktop, iPad, iPhone, celulares e todos os navegadores**. Os testes de preservação são gates de publicação obrigatórios.

## Cadência e responsabilidade
- **02h America/Sao_Paulo — Agente principal:** pesquisar, validar, classificar, produzir relatório, publicar apenas artefatos de catálogo permitidos e nunca modificar dados pessoais.
- **04h — Auditor A independente:** verificar execução da madrugada, data, fontes respondidas, catálogo e integridade; se não houver execução válida, disparar nova varredura com o workflow oficial. Não declarar sucesso só porque o job iniciou.
- **06h — Auditor B independente:** reexaminar a execução e os dados publicados por lógica distinta; conferir integridade dos totais, playlist, pesquisa mundial e multilíngue; disparar recuperação se ausente/incompleta. Não duplicar desnecessariamente uma recuperação ainda em execução.
- Agendamentos dependem da entrega do evento pelo GitHub; eventos podem sofrer atraso ou perda. Auditoria deve reportar a incerteza e registrar o que foi/ não foi executado. Nunca prometer execução no minuto exato sem infraestrutura com SLA.

## MÁQUINA 01 — YouTube oficial ao vivo (antes da expansão geral)
- Descobrir lives do **próprio titular** via YouTube Data API (search.list com eventType=live e type=video), seguida de videos.list para verificar liveBroadcastContent=live e status.embeddable=true; timestamps e TTL são obrigatórios. Resultado de busca não é evidência de canal oficial. Validar canalId contra cadastro de identidades oficiais conhecido/curado; canais desconhecidos ficam apenas em RESEARCH_PENDING até revisão.
- Prioridades explícitas rotativas e globais: **ge tv / Globo Esporte, CazéTV, CNN Brasil, CNN International, CNN en Español, CNN TÜRK e demais operações CNN verificadas, Bloomberg Television / Bloomberg TV Brasil e operações Bloomberg internacionais verificadas, Times Brasil CNBC, CBF TV, GOAT, Xsports, emissoras e organizações de jornalismo oficial**, além de clubes brasileiros e federações, ligas e produtores de eventos. Nunca atribuir direitos de um evento à marca só pela existência do canal.
- Cobrir futebol masculino/feminino, base, clubes, campeonatos, vôlei, tênis, basquete, NFL/futebol americano, automobilismo, Fórmula 1, NASCAR, atletismo, ginástica, natação, ciclismo, rugby, handebol, beisebol, hóquei e esportes emergentes. A presença de direitos premium não permite retransmissão nem acesso indevido; observar direitos por território e competição.
- Lives intermitentes: manter **identidade canônica do canal** separada do **evento ao vivo**, com horário verificado, status `LIVE_CONFIRMED / OFFLINE / SCHEDULED / UNKNOWN`, vídeo corrente e histórico. Nunca deixar o vídeo anterior reproduzindo como se a emissora ainda estivesse ao vivo.
- Apresentar no mesmo guia dos demais canais, com nome, país, categoria, favoritos, pesquisa, controle remoto, atualização e indicação **Fonte: YouTube**. Preservar anúncio, controles, créditos e origem no player oficial incorporado (`youtube.com/embed`) somente quando permitido. Sem download, proxy HLS, extração de mídia, mascaramento de origem ou reprodução de paywall.
- **Não prometer canal ativo só porque um resultado apareceu.** Sem chave `STREAMNOW_YOUTUBE_DATA_API_KEY` ou quando quota/validação falhar, registrar `NOT_VERIFIED`, não fabricar transmissões. `RESEARCH_ONLY` até confirmação de identidade, regras do YouTube, direitos e política de acesso. A API não fornece autorização de exploração comercial ou redistribuição.
- Não cobrar para assistir conteúdo embutido do YouTube nem colocar visualização do próprio vídeo atrás de exigência adicional de cadastro/pagamento; revisar a autenticação atualmente exigida pelo Stream Now antes de promover lives do YouTube para a interface pública. A marca e os controles oficiais devem continuar visíveis.

## MÁQUINA 02 — Descoberta integral, sem viés de categorias
- Pesquisar diariamente rotação equilibrada de categorias: notícias; economia; esportes; filmes/séries; infantil; música/entretenimento; documentários/educação/cultura; ciência/tecnologia; gastronomia/viagens/natureza; religioso; generalista/regional/comunitário; eventos e serviço público. Oportunidade que não encaixar nas classes atuais permanece como categoria provisória, não é descartada.
- Separar `pesquisado`, `encontrado`, `fonte oficial validada`, `embed elegível`, `sinal testado`, `direitos verificados`, `reproduzido em TV física`. Não promover automaticamente uma playlist comunitária, páginas de busca, vídeo não confirmado ou retransmissão não autorizada.
- Fontes alternativas por país e idioma: sites de emissoras, FAST, universidades, clubes, federações, veículos comunitários, players oficiais, guias públicos e listas abertas revisadas. Repetir validação antes de cada promoção.
- O objetivo é **novos canais efetivamente utilizáveis**, não apenas grandes totais de URLs. Reportar novos candidatos, qualidade, duplicações, direitos, falhas, cobertura temática, idioma e país.

## ROTINA OFICIAL — 02h / 04h / 06h (America/Sao_Paulo)
- **02h — Descoberta principal:** executar pesquisa YouTube live + varredura HLS e mundial geral; verificar ativos, proteger catálogo existente e gerar relatórios com categorias, fontes, progresso e motivos de reprovação. Publicar somente artefatos autorizados e verificados.
- **04h — Auditor A:** checar se o scan realmente concluiu, se os relatórios geral e YouTube são do dia, se as consultas cobriram a matriz de categorias, e se novos canais são legítimos; redisparar o workflow oficial em falha, sem duplicar scan em andamento.
- **06h — Auditor B:** revisão independente dos totais, categorias sub-representadas, eventos expirados, integridade de pesquisa global e resultados do YouTube, histórico e favoritos; reprocessar quando faltou a varredura e jamais publicar canal inseguro pela pressão por quantidade.
- Cron GitHub é tentativa de disparo e não SLA de horário. Segredos API apenas em GitHub Actions. Sem API key, a execução registra claramente BLOCKED e não finge ter descoberto lives.

## Pesquisa mundial e fontes novas
- Cobrir *progressivamente* TODOS os países disponíveis no índice e TODAS as regiões: Américas, Caribe, Europa ocidental e oriental, África, Oriente Médio, Ásia, Oceania e territórios adicionais. Cobertura diária usa rotação verificável; não afirmar todos os países na mesma noite quando somente parte foi varrida.
- Consultar listas públicas de emissoras, veículos locais, TVs universitárias, canais regionais, autoridades de trânsito quando aplicável, redes oficiais de notícias, organizações esportivas, rádios com vídeo e serviços FAST; expandir regularmente e nunca limitar a lista aos provedores atuais.
- Pesquisar em português, inglês, espanhol, francês, alemão, italiano, russo, ucraniano, árabe, chinês, japonês, coreano, hindi, bengali, swahili, persa, turco, tailandês, vietnamita, indonésio, neerlandês, grego, hebraico e outros idiomas conforme os países visitados.
- Buscar **todas as categorias** definidas na Máquina 02, incluindo notícias e esportes ao vivo, eventos públicos, cobertura local, canais comunitários, cinema e cultura; registrar a distribuição por categoria e diversidade geográfica. Registrar países, idiomas, fontes, erros e novas identidades sem afirmar playback que não foi testado.
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
