# STREAM NOW — CONSTITUIÇÃO DE PRESERVAÇÃO DE FAVORITOS v1.0
Status: **REGRA OBRIGATÓRIA / NÃO NEGOCIÁVEL** — 25/11/2026.

## Princípio fundamental
**Favoritos, listas pessoais, histórico útil e seleções construídas pelo usuário são dados do usuário, não caches ou componentes de interface. Nenhuma atualização, migração, troca de domínio, alteração visual, logout ou substituição de player pode zerá-los.**

A reconstrução manual de uma lista com 153 canais na Samsung após aparecimento de zero é um incidente real e inaceitável. A captura posterior com 153 canais prova somente a reconstrução, **não** uma recuperação pelo sistema.

## 12 regras de veto à publicação
1. **NUNCA APAGAR:** é proibido usar `localStorage.clear`, `removeItem`, sobrescrita por lista vazia ou migração destrutiva nas chaves de favoritos e seus backups.
2. **FALHAR FECHADO:** erro de leitura, JSON malformado, quota, navegador sem armazenamento ou estado indefinido devem impedir escrita. Nunca converter erro em `[]` e salvar silenciosamente.
3. **MUTAÇÃO EXPLÍCITA:** só um comando humano de favoritar/desfavoritar pode remover uma entrada; atualizações de catálogo, login, renderização, logout e mudanças de fonte são operações somente de leitura sobre favoritos.
4. **SEM REMOÇÃO EM MASSA:** atualizações normais podem remover no máximo a entrada selecionada explicitamente. Exclusão em lote exige uma operação futura separada com confirmação inequívoca e backup externo testado.
5. **SNAPSHOT PRÉVIO:** antes de uma escrita em lista não vazia, salvar cópia histórica inicial imutável (foundation) e snapshot anterior (previous) e confirmar ambas as gravações. Falha no backup = bloquear a mudança.
6. **CONTROLE DE CONCORRÊNCIA:** comparar o conteúdo persistido com a lista carregada antes de gravar; se for diferente, bloquear, recarregar ou reconciliar, nunca sobrescrever.
7. **MIGRAÇÃO ADITIVA:** novas chaves, formatos e aliases devem preservar as chaves anteriores e importar por união explícita, com deduplicação; nunca apagar o valor legado.
8. **RECUPERAÇÃO SEM PROVA FALSA:** contagem zero não prova exclusão. Não declarar “recuperado” até verificar os dados restaurados. Cópia local não atravessa origens, televisões ou navegadores.
9. **BACKUP PORTÁTIL:** disponibilizar exportação de favoritos para arquivo que o usuário possa manter fora da TV; sem confirmação de download, nunca declarar backup externo concluído.
10. **NÃO DEPENDER DO CATÁLOGO:** mudanças nos IDs, disponibilidade ou nomes dos canais não devem fazer desaparecer a lista de favoritos. Itens órfãos continuam identificados como indisponíveis.
11. **GATE DE REGRESSÃO:** todo release que altera interface, autenticação, domínio, cache, catálogo ou armazenamento executa testes com 0, 1, 153 e muitos favoritos, incluindo atualização/recarregamento, falha de escrita, JSON inválido, remoção unitária, migração e concorrência. Falha = BLOQUEIO DE PUBLICAÇÃO.
12. **DURABILIDADE REAL:** `localStorage` + backup no mesmo navegador **não é garantia contra limpeza de dados, defeito de TV, mudança de domínio ou hardware**. A sincronização de favoritos por conta autenticada, no servidor e com backup/versionamento, é requisito pendente antes de declarar armazenamento durável/multidispositivo. Não assumir que está implementado.

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
1. Construir armazenamento de favoritos por conta no backend já existente com controle de autorização por usuário, revisões e backup recuperável.
2. Migração assistida das chaves locais para a conta, precedida de backup/exportação e consentimento; resolver conflitos por união até o usuário decidir.
3. Testes em aparelho físico Samsung, incluindo desligar/religar, atualização do navegador, falha de rede, logout, mudança de versão e armazenamento cheio.
4. Exercício de desastre: provar restauração da conta e conferência da lista inteira, não só do contador.

**Status atual:** proteções locais e exportação implementadas; sincronização de favoritos no servidor ainda **NÃO IMPLEMENTADA**. Não confundir com garantia de restauração em outra TV.

Regra de mudança: qualquer exceção exige justificativa expressa do titular, avaliação de risco, cópia externa verificada e testes de recuperação aprovados.