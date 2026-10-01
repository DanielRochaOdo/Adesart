# AGENTS.md — Regras do Projeto Adesart

Este arquivo registra regras obrigatórias de desenvolvimento e manutenção do projeto Adesart.

## Regra padrão: paridade Web + Android

Toda melhoria que afete comportamento, fluxo, regra de negócio, validação, status, cadastro, dashboard, links/QR, vendedor, adesionista ou outra funcionalidade compartilhada deve ser avaliada e aplicada nos dois clientes quando fizer sentido:

- Web: `src/`
- Android: `android-app/`

Não considerar uma melhoria compartilhada concluída se apenas um dos clientes tiver sido atualizado, salvo quando houver instrução explícita para alterar somente uma plataforma.

## Backend canônico

Regras compartilhadas não devem ser duplicadas desnecessariamente entre Web e Android.

Quando o Web consumir uma RPC, view, Edge Function ou outro contrato canônico que resolva regra de negócio, o Android deve consumir a mesma fonte. É proibido substituir essa fonte por leitura direta de tabela seguida de reconstrução local da regra no aplicativo.

Quando possível:

1. centralizar a decisão no backend canônico;
2. retornar uma resposta estruturada;
3. fazer Web e Android consumirem a mesma decisão.

As fontes canônicas de backend são:

- `supabase/functions/`
- `supabase/migrations/`

Não criar backend, migrations ou Edge Functions exclusivos dentro de `android-app/`.

### Conclusão de adesão e documentos ERP

A conclusão de uma adesão é uma transação de backend. Após o ERP confirmar o cadastro:

1. `erp-novo-usuario2` é a autoridade para persistir `status=enviado` e os metadados comerciais;
2. Web e Android não devem reaplicar PATCH parcial de conclusão;
3. nome, empresa, vendedor, adesionista e plano devem estar persistidos antes de o cliente considerar o fluxo concluído;
4. documento/anexo deve ser enfileirado por contrato canônico e não enviado por lógica paralela específica de cliente;
5. a fila `erp_upload_queue` deve ser operada pelas RPCs/worker canônicos, com retry, lease, erro observável e reprocessamento administrativo.

É proibido voltar a implementar conclusão, fila ou reprocessamento com regras independentes no Web ou Android.

## Alterações visuais específicas

Alterações exclusivamente visuais ou específicas de uma plataforma podem permanecer apenas nela, desde que seja verificado se existe impacto funcional ou de paridade na outra plataforma.

## Planejamento antes da implementação

Antes de implementar uma mudança, informar claramente quais áreas serão afetadas:

- Web;
- Android;
- backend;
- migrations;
- Edge Functions;
- contratos/regras compartilhadas.

## Regra de conclusão

Ao receber pedidos como “adicione esta funcionalidade”, “ajuste este fluxo”, “corrija esta regra” ou equivalentes, assumir por padrão:

**Web + Android, mantendo paridade entre os dois.**

Somente limitar a alteração a uma única plataforma quando isso for explicitamente solicitado ou quando a funcionalidade for comprovadamente exclusiva daquela plataforma.

## Governança

As decisões descritas em:

- `docs/ARQUITETURA_CANONICA_WEB_ANDROID.md`
- `contracts/business-rules/`

devem ser respeitadas em qualquer implementação futura.

Mudanças de regra de negócio devem preservar a arquitetura canônica e, quando necessário, atualizar os contratos compartilhados e os testes de paridade.
