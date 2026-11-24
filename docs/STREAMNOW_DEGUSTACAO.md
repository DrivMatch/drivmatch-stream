# Plano Degustação

O acesso ao plano aparece no guia compartilhado do desktop e do Android após o login. A ativação é voluntária e vinculada à conta do Stream Now. O catálogo segue acessível pelo fluxo de convites já existente.

## Configuração no Sandbox Stripe

Crie um produto chamado **Stream Now — Degustação** e um preço recorrente, fixo, em BRL, com valor **R$ 0,00**. Use cobrança por unidade e periodicidade mensal. O Worker valida o preço antes de criar a assinatura.

| Configuração do Worker | Valor |
| --- | --- |
| `STRIPE_TASTING_MODE` | `test` na homologação |
| `STRIPE_TASTING_SECRET_KEY` | Chave de teste guardada como secret, com leitura de Prices e leitura/escrita de Customers e Subscriptions |
| `STRIPE_TASTING_PRICE_ID` | Identificador `price_…` do preço de R$ 0 |
| `STRIPE_TASTING_DAYS` | Número de dias, ou `0` para acesso sem prazo |

A migração `0005_stream_tasting.sql` é aditiva. O deploy de homologação existente aplica a migração no D1 do Stream Now. A configuração ausente desabilita a página e o acesso ao plano no guia.

O Worker cria um Customer exclusivo para a degustação, associado a uma referência opaca. A assinatura usa o preço de R$ 0, sem método de pagamento, e recebe uma data de cancelamento quando há prazo. O estado apresentado vem da API do Stripe. A atualização do estado ocorre ao abrir a página do plano.

Após ativar pelo Sandbox, confirme a assinatura no Stripe, o valor de R$ 0, a ausência de método de pagamento e a data de cancelamento para um plano com prazo. As configurações de teste e produção são separadas.
