# DRIVMATCH STREAM — GLOBAL CHANNEL DISCOVERY & NAMING PROTOCOL

## Protocolo canônico de descoberta, verificação, cadastro e normalização internacional

**Missão:** ampliar a cobertura mundial do Stream sem sacrificar rastreabilidade, nomes originais, qualidade, segurança ou as interfaces Samsung/desktop/celular. Este documento preserva as quinze áreas operacionais do Prompt Mestre fornecido pelo projeto. Fonte original: conversa do projeto DrivMatch Stream de 23/11/2026.

### 1 — Pesquisa mundial
Pesquisar América do Norte, Central, do Sul, Caribe, Europa Ocidental/Central/Oriental/Báltica/Bálcãs, Rússia/Ucrânia/Belarus/Cáucaso, Oriente Médio, África, Ásia Oriental/Meridional/Central/Sudeste e Oceania (incluindo Austrália/Nova Zelândia). Incluir canais nacionais, regionais, municipais, universitários, educativos, culturais, comunitários, religiosos, esportivos, de notícias e entretenimento. Procurar canais brasileiros em listas estrangeiras e canais estrangeiros disponíveis no Brasil. Origem da lista não determina nacionalidade dos canais.

### 2 — Pesquisas em idiomas locais
Inglês, português, espanhol, russo, ucraniano, polonês, romeno, francês, alemão, italiano, turco, árabe, chinês, japonês, coreano, hindi, indonésio e idiomas regionais relevantes. Exemplos: free IPTV playlist m3u; public television live stream; бесплатное IPTV плейлист m3u; телеканалы онлайн прямой эфир; darmowe kanały telewizyjne m3u; listas IPTV canales abiertos; chaînes TV gratuites en direct; freie TV Sender Livestream; 免费 IPTV 直播源; IPTV 免费频道; playlist IPTV gratis Indonesia; canais brasileiros no exterior ao vivo. Não depender apenas de pesquisa em português ou de buscadores brasileiros.

### 3 — Onde investigar
Repositórios GitHub/GitLab/Gitee/Codeberg, projetos regionais, IPTV-org e APIs, diretórios M3U/M3U8, emissoras e seus sites, YouTube/YouTube Live, Twitch, portais públicos de notícias/esportes, plataformas FAST, distribuidores OTT e canais institucionais. Avaliar catálogos comercializados para descobrir países e canais, mas diferenciar assinatura individual de autorização de integração/distribuição. Não usar credenciais vazadas, invasão, DRM bypass ou retransmissões não autorizadas.

### 4 — Objetos distintos
SOURCE = repositório, playlist, API, site ou distribuidor. CHANNEL = identidade da emissora/programação. STREAM = URL técnica, quando houver. OFFICIAL ACCESS = site/app oficial. EMBED = player incorporável autorizado. Não confundir uma URL existente, um canal catalogado e reprodução funcionando.

### 5 — Registro permanente
Para cada fonte guardar ID estável, mantenedor, URL, tipo, país de origem conhecido, cobertura, idiomas, descoberta, verificação, estado, condições de distribuição, número de canais, duplicados/novos, evidências. Ler o catálogo existente antes de adicionar; preservar proveniência, mudanças e história.

### 6 — Nomes internacionais
Preservar SEMPRE original_name exato. Manter, quando aplicável, official_name confirmado, international_name, display_name_pt, aliases, original_script, country_code, language_codes e category. Exemplos:
- Россия 24 → Rossiya 24 → Rossiya 24 — Notícias da Rússia
- Первый канал → Pervy Kanal → Pervy Kanal — Rússia
- 日本テレビ → Nippon TV → Nippon TV — Japão
- 中央电视台 → CCTV → CCTV — China
- الجزيرة → Al Jazeera → Al Jazeera — Catar
Transliteração/IA não significa nome oficial. Se a conversão não for confiável, conservar original e registrar incerteza.

### 7 — Pesquisa multilíngue
Encontrar nomes em escrita original, transliteração, inglês/português e aliases. Normalizar Unicode e acentos. Não duplicar um canal somente por ortografia. Não fundir canais regionais diferentes (CNN Brasil ≠ CNN International) sem comprovação por país, identificador e programação.

### 8 — Identidade e reprodução
CHANNEL → UNIQUE IDENTITY → MULTIPLE ACCESS SOURCES. Preservar HLS principal e alternativos, site oficial, embed permitido, lives oficiais, FAST e origens regionais separadamente. Antes de declarar indisponibilidade, buscar alternativas permitidas. Não transformar página de site em URL de vídeo fictícia.

### 9 — Verificação técnica
Distinguir origem existente, manifesto HLS, segmento de mídia, vídeo reproduzido, direitos, região, codec, CORS, navegador/TV e expiração. Status: DISCOVERED, SOURCE_ACCESSIBLE, STREAM_CANDIDATE, PLAYBACK_TESTED, PLAYBACK_CONFIRMED, EMBED_AVAILABLE, RESTRICTED, UNAVAILABLE, NEEDS_REVIEW. Teste de HTTP/servidor NÃO equivale a reprodução Samsung confirmada.

### 10 — Lives e DrivMatch News
Aproveitar padrões aplicáveis de busca de lives do /news para YouTube, Twitch, emissoras, esportes e FAST. Usar embeds oficiais permitidos na coluna 3. Quando bloqueados, oferecer acesso externo. Página existente não significa live ativa.

### 11 — Deduplicação global
Comparar nome oficial/original/transliterado, aliases, tvg-id, país/região, website, URL, programação e categoria. Novo endereço do mesmo canal = alternativa. Versão regional distinta = registro próprio. Não contar fonte como canal.

### 12 — Apresentação
Exibir nomes em português por padrão, com opção de internacional e original. Preservar país/categoria/idioma. Pesquisa global por todos os nomes/aliases em Samsung, desktop e celular.

### 13 — Integração no projeto real
Consultar repositório DrivMatch/drivmatch-stream, API/autenticação, listas e player existentes. Registrar proveniência e nomes; passar por revisão e testes sem apagar favoritos, histórico ou listas anteriores. Declarar publicação apenas após confirmação real de deploy.

### 14 — Relatórios
Informar A fontes/URLs/idiomas/estados; B canais examinados, novos, duplicados, alternativas, confirmação/pendências; C nomes e aliases; D arquivos, testes, PR e deploy; E próximos mercados e limitações. Diferenciar fato, evidência, inferência, candidato e desconhecido.

### 15 — Evolução
Sem limite conceitual de 14 listas ou 12 países. Crescimento incremental, cache, filas, controle de tempo/custos, deduplicação e histórico, sem transformar quantidade de links em métrica exclusiva. Descoberta recorrente somente quando o código e agendamento estiverem implantados.

## Acoplamento à automação das 02h00
O workflow existente .github/workflows/daily-channel-autopilot.yml deve executar às 02:00 America/Sao_Paulo (= 05:00 UTC em UTC−3; GitHub pode iniciar depois). Não existe um agente ChatGPT executando sozinho às 02h: somente consultas implementadas em código são executadas.

**Trilha A — publicação:** scripts/daily_channel_autopilot.py conserva lista curada, validação de manifesto e segmento e publicação de sinais já elegíveis. Isso não certifica direitos, região ou Samsung.

**Trilha B — pesquisa mundial:** scripts/global_channel_discovery.py realiza varredura rotativa de países por continente + países adicionais e pesquisas multilíngues de repositórios. Registra candidatos, nomes originais/transliterados e alternativas em data/global-discovery-state.json, com relatório próprio. Nenhuma URL descoberta nessa trilha é promovida automaticamente à lista reproduzível antes de cumprir critérios de integração.

Tudo integra a MESMA rotina diária, sem agendamento duplicado. Falhas parciais de descoberta não apagam acervo anterior. O relatório registra resultado real; candidato não é publicado, teste simulado não é reprodução real.
