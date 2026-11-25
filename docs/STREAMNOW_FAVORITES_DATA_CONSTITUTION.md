# STREAM NOW — CONSTITUIÇÃO DE PRESERVAÇÃO DE FAVORITOS v2.0 — CANÔNICA
Status: **CANÔNICO / NORMATIVO / PRESERVAÇÃO PERMANENTE / ALTERAÇÃO APENAS POR CHANGE CONTROL FORMAL** — 25/11/2026.

## Princípio fundamental
**Favoritos, listas pessoais, histórico útil e seleções construídas pelo usuário são dados do usuário, não caches ou componentes de interface. Nenhuma atualização, migração, troca de domínio, alteração visual, logout ou substituição de player pode zerá-los.**

A reconstrução manual de uma lista com 153 canais na Samsung após aparecimento de zero é um incidente real e inaceitável. A captura posterior com 153 canais prova somente a reconstrução, **não** uma recuperação pelo sistema.

## 12 regras de veto à publicação
1. **NUNCA APAGAR:** é proibido usar `localStorage.clear`, `removeItem`, sobrescrita por lista vazia ou migração destrutiva nas chaves de favoritos e seus backups.
2. **FALHAR FECHADO:** erro de leitura, JSON malformado, quota, navegador sem armazenamento ou estado indefinido devem impedir escrita. Nunca converter erro em `[]` e salvar silenciosamente.
3. **MUTAÇÃO EXPLÍCITA:** na proteção emergencial vigente, **nenhum canal salvo pode ser removido nem por clique nem por automação**. Qualquer futura remoção voluntária precisa ser deliberada, individual, autenticada, auditável, precedida de backup e reversível. Atualizações de catálogo, login, renderização, logout e mudanças de fonte são operações somente de leitura sobre favoritos.
4. **SEM REMOÇÃO EM MASSA:** atualizações normais podem remover **zero** entradas. O bloqueio emergencial de remoção é obrigatório no backend e no banco. Exclusão em lote exige uma operação futura separada com confirmação inequívoca e backup externo testado.
5. **SNAPSHOT PRÉVIO:** antes de uma escrita em lista não vazia, salvar cópia histórica inicial imutável (foundation) e snapshot anterior (previous) e confirmar ambas as gravações. Falha no backup = bloquear a mudança.
6. **CONTROLE DE CONCORRÊNCIA:** comparar o conteúdo persistido com a lista carregada antes de gravar; se for diferente, bloquear, recarregar ou reconciliar, nunca sobrescrever.
7. **MIGRAÇÃO ADITIVA:** novas chaves, formatos e aliases devem preservar as chaves anteriores e importar por união explícita, com deduplicação; nunca apagar o valor legado.
8. **RECUPERAÇÃO SEM PROVA FALSA:** contagem zero não prova exclusão. Não declarar “recuperado” até verificar os dados restaurados. Cópia local não atravessa origens, televisões ou navegadores.
9. **BACKUP PORTÁTIL:** disponibilizar exportação de favoritos para arquivo que o usuário possa manter fora da TV; sem confirmação de download, nunca declarar backup externo concluído.
10. **NÃO DEPENDER DO CATÁLOGO:** mudanças nos IDs, disponibilidade ou nomes dos canais não devem fazer desaparecer a lista de favoritos. Itens órfãos continuam identificados como indisponíveis.
11. **GATE DE REGRESSÃO:** todo release que altera interface, autenticação, domínio, cache, catálogo ou armazenamento executa testes com 0, 1, 153 e muitos favoritos, incluindo atualização/recarregamento, falha de escrita, JSON inválido, remoção unitária, migração e concorrência. Falha = BLOQUEIO DE PUBLICAÇÃO.
12. **DURABILIDADE REAL:** `localStorage` + backup no mesmo navegador **não é garantia contra limpeza de dados, defeito de TV, mudança de domínio ou hardware**. A conta autenticada e o armazenamento D1 são a fonte de verdade para favoritos de conta. Já existem snapshots na tabela de arquivo e bloqueios de exclusão; ainda faltam prova real de sincronização em todos os dispositivos, backup independente e teste de restauração completa antes de garantir durabilidade de desastre. Não assumir que está implementado.

## Invariantes técnicos atuais
- Samsung/guia: `drivmatch-tv-guide-favorites-v1`.
- Legado: `drivmatch-stream-favorites-v1`.
- Metadados: `drivmatch-tv-favorite-meta-v1`.
- Snapshot fundação: `drivmatch-tv-guide-favorites-foundation-v1`.
- Snapshot anterior: `drivmatch-tv-guide-favorites-previous-v1`.
- Legado da biblioteca: `drivmatch-iptv-library-fav-v1`.
- Nunca renomear ou substituir essas chaves sem migração compatível e teste com dados reais simulados.
- Nunca associar favoritos apenas à presença momentânea do canal na playlist.
- A interface nunca deve anunciar que dados foram recuperados apenas por uma contagem exibida; a origem e o resultado da recuperação devem ser explicitados.

## Etapas técnicas pendentes
1. Concluir e homologar sincronização de todas as interfaces com o backend D1 por usuário autenticado; controle de autorização por user_id já existe, porém backup externo recuperável, revisões e restauração de desastre permanecem pendentes.
2. Migração assistida das chaves locais para a conta, precedida de backup/exportação e consentimento; resolver conflitos por união até o usuário decidir.
3. Testes em aparelho físico Samsung, incluindo desligar/religar, atualização do navegador, falha de rede, logout, mudança de versão e armazenamento cheio.
4. Exercício de desastre: provar restauração da conta e conferência da lista inteira, não só do contador.

**Status atual (25/11/2026):** tabela de favoritos por usuário em D1, arquivamento append-only e bloqueio SQL de DELETE/UPDATE implantados no servidor; guia principal /stream/tv/ integrado ao backend. Unificação dos players moderno, legado e biblioteca está implementada em PR de revisão e depende de gate/deploy. **Nenhuma homologação real cross-device ou restauração de desastre foi comprovada.** Não confundir migração técnica com recuperação de favoritos que já não existem em fonte acessível.

Regra de mudança: qualquer exceção exige justificativa expressa do titular, avaliação de risco, cópia externa verificada e testes de recuperação aprovados.
## 13. UNIVERSALIDADE OBRIGATÓRIA — TODOS OS DISPOSITIVOS E FORMATOS

**Esta constituição aplica-se sem exceção e sem interpretação restritiva a:** APK Android (debug/release), AAB Google Play, app Android TV e Google TV quando existir, aplicativo Samsung Tizen e navegador Samsung Smart TV, aplicativo LG webOS e navegador LG, desktop Windows/macOS/Linux e navegadores, iPad/iPadOS (Safari e app/PWA quando existirem), iPhone/iOS e celulares Android, versão mobile web e qualquer implementação futura de tablet, Smart TV ou TV box. A inclusão em uma plataforma não exclui nenhuma outra. O conjunto de plataformas é extensível, não fechado.

**Invariantes universais obrigatórios:** preservação de favoritos, listas pessoais, histórico útil e preferências do usuário; proibição de sobrescrita por vazio ou erro; snapshots e exportação; migração aditiva e rastreável; bloqueio de release sem teste; identificação explícita de onde os dados estão. Toda feature e correção deve ser analisada em matriz cross-platform ANTES da implementação, e testada nos alvos correspondentes ANTES da entrega.

**Arquitetura única:** todas as interfaces hospedadas apontam para o mesmo serviço Stream Now; wrappers Android, Tizen, webOS NÃO podem criar um armazenamento paralelo independente sem mecanismo real de migração/sincronização. Embora já exista armazenamento autenticado no servidor, a sincronização só funciona nas interfaces integradas e com contas autenticadas; favoritos exclusivamente locais **não** são compartilhados automaticamente entre aparelhos e origens. É proibido prometer sincronização universal até que haja prova ponta a ponta de gravação, leitura, concorrência, exportação, restauração, logout/login e troca de dispositivo.

**Regra adicional de release:** workflows web/Cloudflare, Android APK e AAB, Samsung e LG devem executar a suíte de preservação universal. Novos clientes/plataformas devem incluí-la como condição de aceite. Ausência do teste ou incompatibilidade => não publicar. Uma modificação visual ou de catálogo também deve passar pelo gate.

**Matriz de validação mínima:** Android APK; Android AAB/Play; celular Android via navegador; iPhone; iPad; desktop; Samsung navegador; Samsung app; LG navegador; LG app. Para cada um, registrar se o comportamento foi verificado em código, em emulação ou em aparelho real. Nunca converter um teste de web browser em homologação de TV física.

**Nenhum compartilhamento de conta implica compartilhamento de favoritos** sem sincronização de backend implementada, efetivamente utilizada por todas as telas e auditada. Dados locais são propriedade do usuário; o sistema só poderá substituí-los após reconciliação e backup verificado.

## 14. CONSTITUIÇÃO CANÔNICA DE FAVORITOS POR CONTA — v2.0

**Decisão canônica vinculante do titular — 25/11/2026:** Os favoritos não pertencem ao navegador, televisão ou celular. Eles pertencem à CONTA STREAM NOW. Quando o usuário acessar com o mesmo e-mail, onde quer que esteja, deve encontrar os mesmos canais salvos. JAMAIS uma atualização ou aparelho pode excluí-los.

**Identidade:** o e-mail verificado corresponde a um user_id interno estável. O cliente não determina de quem são os favoritos por um e-mail digitado, cabeçalho arbitrário ou cookie não validado. Somente a sessão autenticada determina o user_id; todas as consultas e inclusões são filtradas pelo servidor com isolamento entre contas.

**Fonte autoritativa:** a tabela stream_favorites em Cloudflare D1 é a referência por user_id; stream_favorites_archive preserva cópia append-only, com gatilhos contra DELETE e UPDATE. Nunca substituir por zero, sobrescrever arquivo anterior ou confundir falha de consulta GET com lista vazia.

**Experiência universal:** o login na mesma conta deve devolver a mesma coleção em /stream/tv/, /stream/, /stream/listas/, Android, Samsung, LG, iPhone, iPad, desktop e futuros clientes. Favoritar em um aparelho exige confirmação no servidor; outro aparelho deve encontrar o canal sem reconstituição manual. Quando sem rede ou com sessão inválida, bloquear mutação e avisar, não simular sucesso.

**Dados diferentes:** favoritos e histórico de recentemente visitados são coleções distintas. Não prometer sincronização do histórico entre aparelhos até que a persistência por conta, privacidade, retenção e testes estejam implementados e verificados.

**Legado e contas compartilhando aparelhos:** preservar chaves locais e arquivos previamente baixados. Importação apenas aditiva, sob consentimento explícito e leitura de volta do servidor. Nunca presumir que a lista local de um navegador compartilhado pertence ao usuário que acabou de entrar. Verificar os aliases de canais entre catálogos, sem fundir identidades diferentes por semelhança de nome.

**Imutabilidade operacional:** durante o incidente P0, remover/desfavoritar permanece bloqueado na API e no banco. INSERT arquiva o dado. Acesso administrativo e infraestrutura demandam controles adicionais, portanto não existe alegação de impossibilidade física absoluta de exclusão. Qualquer futura remoção intencional exige Change Control aprovado, trilha de auditoria, restauração demonstrada, backup independente e ação inequívoca do usuário.

**Bloqueio de release:** testes obrigatórios com 0, 1, 93, 153 e 10.000 favoritos, contas A e B isoladas, navegador sem cache, troca de aparelhos, sessões concorrentes, login/logout, falha de rede, mudança de domínio, migração de IDs, catálogo modificado, replay e restauração externa. Falha em segurança ou regressão => NÃO PUBLICAR. Testes sintéticos não equivalem a homologação física.

**Auditorias:** 02h05, 04h05 e 06h05 (America/Sao_Paulo); comparar linhas ativas e arquivo, procurar divergência de pares por user_id/favorite_key, verificar gatilhos e impedir alterações destrutivas em falha. Manter backup independente versionado e executar testes de restauração de desastre para declarar durabilidade completa.

**Proibições:** localStorage.clear, removeItem de dados pessoais, DROP/TRUNCATE/DELETE em favoritos, migração substitutiva, sync com lista vazia após GET malsucedido, logout que limpa dados, deduplicação sem proveniência, falha escondida por contador zero, marketing que alega recuperação não comprovada.

**Governança:** referência canônica obrigatória para agentes, desenvolvedores, auditorias, automações, deployments e versões futuras. Um prompt posterior não revoga esta regra. Mudança somente por Change Control expresso do titular registrado e verificado em GitHub, com validação independente.
