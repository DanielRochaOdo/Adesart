# Paridade Web -> Mobile (Kotlin/Compose)

## Escopo
- Repositório backend/Supabase compartilhado com o web.
- Sem alteração de schema/regras de banco.
- Foco em paridade funcional dos fluxos de cadastro, dependente, auditoria e integrações Edge/RPC.

## Arquitetura Implementada
- `Kotlin + Jetpack Compose + ViewModel + StateFlow`.
- Camadas existentes mantidas por contexto:
  - `data.remote`: clientes Supabase/Edge Functions/RPC.
  - `domain.cadastro`: máquina de estados e mapeamento de erro ERP -> overlay.
  - `ui`: telas, navegação por tabs e dialogs/overlays.

## Rotas/Telas
- Implementadas/atualizadas:
  - `Login`, `Dashboard`, `Users`, `Teams`, `Cadastro`, `Configurações`, `Profile`.
  - `Auditoria Lemmit`, `Fila Upload ERP`, `Adesões Excluídas`.
  - Fluxo público por token (`/adesao/:token`) via deep link.

## Fluxo de Modais e Prioridade
- Implementado motor de prioridade em `CadastroModalStateMachine`:
  1. `EmpresaNaoIdentificada`
  2. `ObservacoesEmpresa`
  3. `EmpresaCancelada`
  4. `LemmitLimit`
  5. `SelectStatus`
  6. Erros ERP (`ParceiroInvalido` / `DependenteAtivo`)
  7. `ExcluirCadastro`
  8. `AlreadyExists`
  9. `LinkQr`
  10. `LinkAssociados`
  11. `VisualizarArquivo`
- Overlays globais renderizados em `CadastroOverlayDialogs`.

## Regras de Negócio Replicadas
- CPF:
  - validação de formato/dígitos (`CadastroPayloadBuilder.validateCpf`).
  - checagem de duplicidade local + ERP no fluxo de criação de rascunho.
- Elegibilidade por configuração:
  - bloqueio por empresa/situação inválida (empresa cancelada).
- Lemmit:
  - warning de limite atingido e exibição de `LemmitLimitModal`.
- Save/close com status obrigatório:
  - `CadastroEditorDialog` exige seleção de status antes de fechar.
- Erros ERP -> modal:
  - parceiro inválido com retry via ajuste de vendedor.
  - dependente ativo.
- Exclusão lógica:
  - usa Edge Function `excluir-cadastro` com motivo (não remove físico).
- Upload resiliente:
  - direto + fila (`enqueue/process/reset`) mantidos no repositório e telas admin.
- Fluxo público por token:
  - `cadastro-link-resolve` -> `cadastro-link-check-cpf` -> `cadastro-public-submit`.

## Integrações (Edge/RPC) Cobertas no Mobile
- Edge Functions:
  - `create-user`
  - `erp-check-associado`
  - `lemit-consulta-pessoa`
  - `erp-endereco-cep`
  - `erp-search-empresa`
  - `erp-novo-usuario2`
  - `erp-novo-dependente`
  - `erp-upload-documento`
  - `erp-enqueue-upload`
  - `erp-process-upload-queue`
  - `excluir-cadastro`
  - `cadastro-link-resolve`
  - `cadastro-link-check-cpf`
  - `cadastro-public-submit`
- RPC:
  - `check_cpf_existente`
  - `can_use_lemmit`
  - `get_lemmit_limit_info`
  - `debit_lemmit_balance`
  - `get_cadastros_stats`
  - `get_stats_from_cache` (fallback)
  - `get_stats_by_vendedor`
  - `audit_lemmit`
  - `reset_stuck_queue_items`

## Testes
- Unitários adicionados:
  - `CadastroModalStateMachineTest`
  - `CadastroApiErrorMapperTest`
  - `CadastroPayloadBuilderTest`
- Instrumentado adicionado:
  - `MainActivityTest` (launch normal + launch com deep link).

## Validação Executada
- `:app:assembleDebug` -> OK.
- `:app:testDebugUnitTest` -> OK.
- `:app:connectedDebugAndroidTest` -> build dos testes OK, execução bloqueada por ausência de device/emulador conectado.

## Observações
- `ClientExistsModal` e `LemmitErrorModal` do legado web devem permanecer tratados como fluxo `legacy/inativo` até validação final de produto.
