# AGENTS.md — Regras do Projeto Adesart

Este arquivo registra regras obrigatorias de desenvolvimento e manutencao do projeto Adesart.

## Regra obrigatoria: paridade Web + Android + iOS

Por padrao, Web, Android e iOS representam o mesmo produto e devem permanecer sincronizados.

Toda melhoria que afete comportamento, fluxo, regra de negocio, validacao, status, cadastro, dashboard, links/QR, vendedor, adesionista, seguranca, contratos de API ou outra funcionalidade compartilhada deve ser avaliada e aplicada nos tres clientes quando fizer sentido:

- Web: `src/`
- Android: `android-app/app/`
- iOS: `android-app/iosApp/`
- Codigo mobile compartilhado: `android-app/shared/`

Nao considerar uma melhoria compartilhada concluida se apenas um dos clientes tiver sido atualizado.

A unica excecao e quando o usuario determinar explicitamente que a alteracao deve ficar restrita a uma plataforma, branch, experimento ou cliente especifico. Essa instrucao explicita prevalece para o escopo solicitado.

## Backend canonico

Regras compartilhadas nao devem ser duplicadas desnecessariamente entre Web, Android e iOS.

Quando um cliente consumir uma RPC, view, Edge Function ou outro contrato canonico que resolva regra de negocio, os demais clientes devem consumir a mesma fonte. E proibido substituir essa fonte por leitura direta de tabela seguida de reconstrucao local da regra no cliente.

Quando possivel:

1. centralizar a decisao no backend canonico;
2. retornar uma resposta estruturada;
3. fazer Web, Android e iOS consumirem a mesma decisao.

As fontes canonicas de backend sao:

- `supabase/functions/`
- `supabase/migrations/`

Nao criar backend, migrations ou Edge Functions exclusivos dentro de `android-app/`.

### Conclusao de adesao e documentos ERP

A conclusao de uma adesao e uma transacao de backend. Apos o ERP confirmar o cadastro:

1. `erp-novo-usuario2` e a autoridade para persistir `status=enviado` e os metadados comerciais;
2. Web, Android e iOS nao devem reaplicar PATCH parcial de conclusao;
3. nome, empresa, vendedor, adesionista e plano devem estar persistidos antes de o cliente considerar o fluxo concluido;
4. documento/anexo deve ser enfileirado por contrato canonico e nao enviado por logica paralela especifica de cliente;
5. a fila `erp_upload_queue` deve ser operada pelas RPCs/worker canonicos, com retry, lease, erro observavel e reprocessamento administrativo.

E proibido voltar a implementar conclusao, fila ou reprocessamento com regras independentes no Web, Android ou iOS.

## Arquitetura mobile

O diretorio `android-app/` passa a ser o workspace mobile do Venda+:

- `app/`: cliente Android nativo existente;
- `shared/`: Kotlin Multiplatform / Compose Multiplatform para codigo compartilhado e infraestrutura comum;
- `iosApp/`: host iOS/Xcode.

O Android existente nao deve ser desmontado para viabilizar o iOS. Migracoes para codigo compartilhado devem ser incrementais, mantendo o Android compilavel e funcional em cada etapa.

O iOS pode usar o shell compartilhado para consumir o Web canonico enquanto funcionalidades sao promovidas para implementacoes nativas compartilhadas. Regras de negocio nao devem ser reinventadas no shell iOS.

## Alteracoes visuais especificas

Alteracoes exclusivamente visuais ou especificas de uma plataforma podem permanecer apenas nela, desde que seja verificado se existe impacto funcional ou de paridade nas demais.

## Planejamento antes da implementacao

Antes de implementar uma mudanca, informar claramente quais areas serao afetadas:

- Web;
- Android;
- iOS;
- shared mobile;
- backend;
- migrations;
- Edge Functions;
- contratos/regras compartilhadas.

## Regra de conclusao

Ao receber pedidos como "adicione esta funcionalidade", "ajuste este fluxo", "corrija esta regra" ou equivalentes, assumir por padrao:

**Web + Android + iOS, mantendo paridade entre os tres.**

Somente limitar a alteracao a uma unica plataforma quando isso for explicitamente solicitado ou quando a funcionalidade for comprovadamente exclusiva daquela plataforma.

## Governanca

As decisoes descritas em:

- `docs/ARQUITETURA_CANONICA_WEB_ANDROID.md`
- `contracts/business-rules/`
- `android-app/PARIDADE_WEB_MOBILE.md`

devem ser respeitadas em qualquer implementacao futura.

Mudancas de regra de negocio devem preservar a arquitetura canonica e, quando necessario, atualizar os contratos compartilhados e os testes de paridade.
