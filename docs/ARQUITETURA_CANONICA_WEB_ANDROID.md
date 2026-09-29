# Arquitetura canônica Web + Android

## Decisão

O repositório `Tecnologia-odonto/Adesart` é a fonte canônica do produto Adesart.

O aplicativo Android é um cliente nativo do mesmo sistema. Ele não possui backend,
migrations, Edge Functions ou regras de negócio independentes.

## Estrutura

- `src/`: cliente Web React.
- `android-app/`: cliente Android nativo em Kotlin/Jetpack Compose.
- `supabase/functions/`: única fonte de Edge Functions.
- `supabase/migrations/`: único histórico de banco de dados.
- `contracts/business-rules/`: contratos funcionais que Web e Android devem respeitar.

## Autoridade das regras

Quando houver divergência entre implementações antigas:

1. a regra existente no Web canônico prevalece;
2. regras criadas apenas no antigo repositório Mobile não são promovidas automaticamente;
3. melhorias técnicas do Mobile podem ser reaproveitadas somente se não alterarem a regra de negócio;
4. decisões que dependem do ERP devem ser centralizadas no backend sempre que possível.

## Regras que o Android não pode decidir sozinho

O Android não deve inferir por texto de erro:

- situação atual de associado/dependente;
- elegibilidade para nova adesão;
- se uma adesão foi criada no ERP;
- se um documento foi entregue ao ERP.

Essas decisões pertencem ao backend canônico e ao ERP.

## Backend

Web e Android devem apontar para as mesmas Edge Functions publicadas a partir de
`supabase/functions/` deste repositório.

Não deve existir uma segunda cópia de `supabase/` específica do Android.

## Processo de mudança

Alterações em cadastro, ERP, status de beneficiário, empresa, vendedor, anexos,
Link/QR, migrations ou Edge Functions devem considerar Web e Android no mesmo PR.

O CI de paridade verifica automaticamente:
- existência do app Android dentro do repositório canônico;
- ausência de backend duplicado dentro de `android-app/`;
- ausência da antiga inferência Mobile de "dependente ativo" por texto;
- endpoints Android correspondentes a Edge Functions existentes neste repositório;
- alinhamento dos status locais de cadastro pendente.
