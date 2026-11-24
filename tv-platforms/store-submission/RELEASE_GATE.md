# STREAM NOW — TV STORE RELEASE GATE

Data-base: 24 de novembro de 2026. **Não enviar a nenhuma loja sem passar por todos os critérios.**

| Controle | Situação verificada | Critério de saída |
|---|---|---|
| Backend e aprovação de usuário | Código e deploy confirmados no GitHub | Revalidar cadastro e reprodução em TVs físicas |
| LG webOS | IPK de teste CI gerado | Assinar/preparar versão final, testar em LG, concluir metadados |
| Samsung Tizen | Somente pacote-fonte de desenvolvimento | Resolver política de hosted apps ou criar aplicativo empacotado com login/sessão seguros, assinar WGT |
| Direitos dos canais | Fontes públicas sem autorização global demonstrada | Arquivo de concessões/licenças por canal, território, tecnologia e prazo |
| Contas seller | Nenhuma conexão de Samsung/LG disponível | Criar/vincular contas sob titular legal e concluir verificações |
| Política de privacidade e termos | Sem páginas legais verificadas no repositório | Publicar documentos adequados ao processamento de e-mail e autenticação |
| Suporte | Não identificado | E-mail e URL de suporte válidos |
| Screenshots | Não capturadas em equipamentos reais | Capturas reais e dimensões aprovadas por cada loja |
| Marca | Símbolo canônico existente | Conferir recortes e textos na loja |
| Aprovação Samsung | Nenhuma | Review Samsung TV Seller Office |
| Aprovação LG | Nenhuma | Review LG Seller Lounge |

## Decisão automática

`node tv-platforms/store-submission/preflight.mjs` verifica se os dados essenciais foram preenchidos.
A aprovação técnica e jurídica **não é inferida** pelo script, que bloqueia explicitamente submissões incompletas.

## Envio oficial
Samsung: https://seller.samsungapps.com/tv/
LG: https://seller.lgappstv.com/

Nota de produto: o catálogo usa playlists de terceiros; origem pública e funcionamento técnico não equivalem a licença de distribuição. O responsável deve apresentar documentação aplicável antes de enviar o aplicativo como catálogo de canais.
