# Regras de Cadastro de Usuário - Sistema de Vidas

## Índice
1. [Visão Geral](#visão-geral)
2. [Fluxo Completo de Cadastro](#fluxo-completo-de-cadastro)
3. [Regras de Negócio](#regras-de-negócio)
4. [Dependentes e Titular](#dependentes-e-titular)
5. [Possíveis Falhas e Soluções](#possíveis-falhas-e-soluções)
6. [Validações Obrigatórias](#validações-obrigatórias)
7. [Tratamento de Erros](#tratamento-de-erros)

---

## Visão Geral

O sistema de cadastro de usuários (vidas) permite a criação de cadastros de titulares e seus dependentes para planos de saúde. O processo envolve múltiplas etapas de consulta e validação antes do envio final ao ERP.

### Estados de um Cadastro
- **incompleto**: Cadastro salvo como rascunho, aguardando complementação de dados
- **enviado**: Cadastro completo e enviado com sucesso para o ERP
- **erro_envio**: Erro ao tentar enviar para o ERP

---

## Fluxo Completo de Cadastro

### 1. Consulta de CPF (Novo Cadastro)

#### Passo 1.1: Verificação de Duplicidade no ERP
- **API**: `erp-check-associado`
- **Endpoint**: `GET /v2/api/associados?cpfDependente={CPF}`
- **Objetivo**: Verificar se o CPF já está cadastrado no sistema

**Cenários:**
- **CPF JÁ EXISTE**:
  - ❌ Modal de duplicidade é exibido
  - ❌ Fluxo é BLOQUEADO
  - ℹ️ Mostra empresa e código do contrato existente
  - ℹ️ Não permite continuar o cadastro

- **CPF NÃO EXISTE**:
  - ✅ Continua para o Passo 1.2

#### Passo 1.2: Consulta de Dados na Lemit
- **API**: `lemit-consulta-pessoa`
- **Objetivo**: Enriquecer dados do CPF com informações públicas

**Dados retornados:**
- Nome completo
- Data de nascimento
- Sexo
- Nome da mãe
- Contatos (celular, fixo, email)
- Endereço (CEP, logradouro, número, bairro, cidade, UF)

**Cenários:**
- **Dados encontrados**: Campos são preenchidos automaticamente
- **Dados não encontrados**: Campos ficam vazios para preenchimento manual
- **Erro na API**: Mensagem de erro é exibida, não salva rascunho

#### Passo 1.3: Enriquecimento de Endereço (Automático)
- **API**: `erp-endereco-cep`
- **Quando**: Se CEP foi retornado pela Lemit
- **Objetivo**: Obter IDs do ERP para o endereço

**Dados enriquecidos:**
```javascript
{
  cep: "60000000",
  tipoLogradouro: "RUA",
  logradouro: "Nome da Rua",
  numero: "123",
  complemento: "Apto 101",
  bairro: "Centro",
  cidade: "Fortaleza",
  uf: "CE",
  // IDs necessários para o ERP:
  idTipoLogradouro: 816,
  idBairro: 1262,
  idMunicipio: 41,
  idUf: 5,
  ufSigla: "CE"
}
```

**Estrutura de Retorno da API:**
```javascript
{
  "ok": true,
  "dados": {
    "IdTipoLogradouro": 816,
    "TipoLogradouro": "RUA",
    "Logradouro": "DESEMBARGADOR LEITE ALBUQUERQUE",
    "IdBairro": 1262,
    "Bairro": "ALDEOTA",
    "IdMunicipio": 41,
    "Municipio": "FORTALEZA",
    "IdUf": 5,
    "Uf": "CEARA",
    "CodigoMunicipioIBGE": "2304400",
    "UfSigla": "CE"
  }
}
```

**Processamento Inteligente:**
- Sistema verifica a existência de cada campo antes de preencher
- Apenas campos retornados pela API são atualizados
- Campos não retornados preservam seus valores anteriores
- Previne erros caso algum campo venha vazio ou null

**Cenários:**
- **CEP válido no ERP**: IDs são salvos e usados no envio final
- **CEP não encontrado no ERP**: Usa valores de fallback (não bloqueia)
- **Erro na API**: Não bloqueia, continua sem IDs (usa fallback no envio)
- **Campos vazios na resposta**: Preserva valores existentes

#### Passo 1.4: Busca de Empresa
- **Quando**: Após consultas Lemit e CEP
- **Como**: Modal de busca onde o usuário pesquisa por CNPJ ou nome
- **API**: `erp-search-empresa`

**Dados da empresa salvos:**
- ID da empresa
- Nome da empresa
- CNPJ
- Lista de planos disponíveis

#### Passo 1.5: Criação do Rascunho
- **Status**: `incompleto`
- **Dados salvos**:
  - CPF (obrigatório)
  - Dados da Lemit (se disponíveis)
  - Endereço enriquecido (se CEP válido)
  - Empresa selecionada
  - Planos da empresa

**Após salvar:**
- ✅ Cadastro aparece na aba "Incompletos"
- ✅ Modal de edição é aberto automaticamente

---

### 2. Edição de Cadastro Incompleto

Ao abrir o modal de edição de um cadastro incompleto:

#### 2.1: Adição Automática do Titular como Dependente

**REGRA CRÍTICA:** O titular (responsável financeiro) é SEMPRE adicionado automaticamente à lista de dependentes quando o modal é aberto.

**Comportamento:**
```javascript
// Titular é adicionado automaticamente com:
{
  tipo: 1,              // Grau de parentesco "Titular"
  cpf: "12345678900",   // CPF sempre preenchido
  nome: "...",          // Preenchido se disponível, senão vazio
  dataNascimento: "...", // Preenchido se disponível, senão vazio
  sexo: 1,              // Preenchido se disponível, senão 0
  plano: 39,            // Primeiro plano da empresa, senão 0
  nomeMae: "...",       // Preenchido se disponível, senão vazio
}
```

**Campos obrigatórios do titular:**
- ✅ CPF (sempre presente)
- ⚠️ Nome (pode estar vazio se Lemit não retornou)
- ⚠️ Data de Nascimento (pode estar vazio se Lemit não retornou)
- ⚠️ Sexo (pode ser 0 se Lemit não retornou)
- ⚠️ Plano (pode ser 0 se empresa não tem planos)

**Permissões:**
- ✅ Usuário PODE remover o titular da lista de dependentes
- ✅ Usuário PODE editar os dados do titular
- ✅ Usuário PODE adicionar outros dependentes

#### 2.2: Preenchimento de Dados do Responsável Financeiro

**Seção: Dados Pessoais**
- Nome completo
- Data de nascimento
- Sexo (Masculino/Feminino)

**Seção: Contatos**
- Celular/Fixo/Email
- Marcar um telefone como principal (obrigatório)

**Seção: Endereço**
- CEP (com consulta automática ao digitar 8 dígitos)
- Tipo de logradouro
- Logradouro
- Número
- Complemento
- Bairro
- Cidade
- UF

**Seção: Contatos do Responsável Financeiro**
- Lista de contatos específicos para cobrança
- Tipo: Celular (1) ou Email (2)
- Valor do contato

#### 2.3: Adição de Dependentes (Opcional)

**Como adicionar:**
1. Clicar em "Adicionar Dependente"
2. Preencher formulário:
   - Grau de parentesco (obrigatório)
   - Nome completo (obrigatório)
   - Data de nascimento (obrigatório)
   - CPF (obrigatório)
   - Sexo (obrigatório)
   - Plano (obrigatório)
   - Nome da mãe (opcional)

**Graus de parentesco disponíveis:**
- Configuráveis em "Configurações de Cadastro"
- Mapeados para IDs do ERP
- Apenas parentescos ativos são exibidos

**Ações disponíveis:**
- ✏️ Editar dependente
- 🗑️ Remover dependente
- ✅ Salvar/Cancelar edição

---

### 3. Envio Final para o ERP

#### 3.1: Validações Antes do Envio

**Dados do Responsável Financeiro:**
- ✅ Nome preenchido
- ✅ Data de nascimento preenchida
- ✅ Sexo selecionado (1=M, 2=F)
- ✅ Pelo menos um telefone marcado como principal
- ✅ CEP preenchido (8 dígitos)
- ✅ Logradouro preenchido

**Dados de Dependentes:**
- ⚠️ Pelo menos 1 dependente na lista (titular ou outros)
- ✅ Todos os campos obrigatórios preenchidos
- ✅ Plano selecionado para cada dependente

**Se validações falharem:**
- ❌ Envio é bloqueado
- ℹ️ Mensagem de erro específica é exibida

#### 3.2: Construção do Payload

**API**: `erp-novo-usuario2`
**Estrutura:**
```json
{
  "dados": {
    "parceiro": {
      "codigo": 15921,
      "tipoCobranca": 1
    },
    "parcelaRetidaComissao": "0",
    "responsavelFinanceiro": {
      "codigoContrato": 4688,
      "nome": "Nome Completo",
      "dataNascimento": "01/01/1990",
      "cpf": "123.456.789-00",
      "sexo": 1,
      "grupoFaturamento": 0,
      "sexoDescricao": "Masculino",
      "identidadeNumero": "123456789",
      "identidadeOrgaoExpeditor": "SSPDS",
      "endereco": {
        "cep": "60000000",
        "tipoLogradouro": "816",
        "logradouro": "Nome da Rua",
        "numero": "123",
        "complemento": "Apto 101",
        "bairro": "1262",
        "municipio": "41",
        "uf": "5",
        "descricaoUf": "CE"
      },
      "contatoResponsavelFinanceiro": [
        { "tipo": 1, "dado": "85986119546" },
        { "tipo": 2, "dado": "email@exemplo.com" }
      ],
      "fl_AlteraSituacao": 1
    },
    "dependente": [
      {
        "tipo": 1,
        "nome": "Nome do Titular",
        "dataNascimento": "01/01/1990",
        "cpf": "123.456.789-00",
        "sexo": 1,
        "sexoDescricao": "Masculino",
        "plano": 39,
        "planoValor": "6,90",
        "nomeMae": "Nome da Mãe",
        "carenciaAtendimento": 1,
        "funcionarioCadastro": 15921
      }
    ]
  },
  "empresa": "4688"
}
```

**Valores de Fallback:**
- `tipoLogradouro`: 816 (RUA)
- `bairro`: 1262
- `municipio`: 2
- `uf`: 5 (CEARA)
- `descricaoUf`: "CE"

#### 3.3: Envio e Resposta

**Sucesso:**
- ✅ Status do cadastro muda para `enviado`
- ✅ Payload e resposta do ERP são salvos no banco
- ✅ Mensagem de sucesso é exibida
- ✅ Modal fecha após 2 segundos
- ✅ Cadastro aparece na aba "Completos"

**Erro:**
- ❌ Status permanece `incompleto` ou muda para `erro_envio`
- ❌ Mensagem de erro é exibida
- ℹ️ Usuário pode corrigir e tentar novamente

---

## Regras de Negócio

### Dependentes

1. **Titular como Dependente:**
   - O titular (responsável financeiro) DEVE ser adicionado automaticamente à lista de dependentes ao abrir o modal
   - CPF é sempre preenchido
   - Outros campos preenchidos se dados da Lemit estiverem disponíveis
   - Usuário pode remover se desejar

2. **Outros Dependentes:**
   - São opcionais
   - Podem ser cônjuge, filho(a), pai, mãe, etc.
   - Cada dependente tem seu próprio plano

3. **Grau de Parentesco:**
   - ID 1 = Titular (responsável financeiro)
   - Outros IDs configuráveis em "Configurações de Cadastro"
   - Mapeamento com ERP configurável

4. **Planos:**
   - Cada dependente pode ter um plano diferente
   - Planos disponíveis vêm da empresa selecionada
   - Se empresa não tem planos, campo fica como 0 (pode causar erro no ERP)

### Contatos

1. **Contatos Gerais:**
   - Pelo menos um telefone (celular ou fixo) deve ser marcado como principal
   - Podem ter múltiplos contatos
   - Tipos: Celular, Fixo, Email

2. **Contatos do Responsável Financeiro:**
   - Lista separada para fins de cobrança
   - Tipo: 1 (Celular) ou 2 (Email)
   - Enviados no campo `contatoResponsavelFinanceiro` do payload

### Endereço

1. **CEP:**
   - Ao digitar 8 dígitos, consulta automática no ERP
   - Preenche automaticamente: logradouro, bairro, cidade, UF
   - Salva IDs do ERP para uso no payload final

2. **Campos editáveis:**
   - Número e complemento sempre editáveis pelo usuário
   - Outros campos podem ser editados se consulta falhar

3. **IDs do ERP:**
   - Essenciais para envio correto ao ERP
   - Se não disponíveis, usa valores de fallback
   - Fallback pode causar erro no ERP se não for válido

---

## Possíveis Falhas e Soluções

### Falha 1: CPF já cadastrado no ERP

**Sintoma:**
- Modal de duplicidade aparece após consulta de CPF
- Não permite continuar o cadastro

**Causa:**
- CPF já existe no sistema ERP

**Solução:**
- Verificar se é o mesmo cliente
- Não é possível cadastrar CPF duplicado
- Entrar em contato com suporte para verificar situação

---

### Falha 2: Lemit não retorna dados

**Sintoma:**
- Campos ficam vazios após consulta de CPF
- Apenas CPF é preenchido

**Causa:**
- CPF não encontrado na base da Lemit
- CPF inválido ou não possui dados públicos

**Solução:**
- ✅ Preencher manualmente todos os campos obrigatórios
- ✅ Titular ainda será adicionado automaticamente à lista de dependentes (apenas com CPF)
- ✅ Completar dados do titular na seção de dependentes antes de enviar

---

### Falha 3: CEP não encontrado no ERP

**Sintoma:**
- Consulta de CEP não retorna dados
- Campos de endereço ficam vazios ou incompletos

**Causa:**
- CEP não existe na base do ERP
- CEP inválido

**Solução:**
- ✅ Preencher manualmente logradouro, bairro, cidade, UF
- ⚠️ IDs do ERP não serão salvos (usa fallback no envio)
- ⚠️ Pode causar erro no envio se fallback não for válido para aquela região

**Prevenção:**
- Verificar se CEP está correto
- Tentar CEP de regiões próximas se necessário
- Consultar base de CEPs externa se necessário

---

### Falha 4: Empresa sem planos cadastrados

**Sintoma:**
- Campo "Plano" aparece vazio ou com valor 0
- Não há opções para selecionar

**Causa:**
- Empresa selecionada não possui planos na base do ERP
- Erro ao buscar planos da empresa

**Solução:**
- ❌ Não é possível continuar o cadastro
- ℹ️ Empresa precisa ter planos cadastrados no ERP
- ℹ️ Entrar em contato com suporte para cadastrar planos

---

### Falha 5: Titular não aparece na lista de dependentes

**Sintoma:**
- Ao abrir modal de edição, lista de dependentes está vazia
- Titular não foi adicionado automaticamente

**Causa:**
- Dados do cadastro estão incompletos (falta CPF)
- Planos da empresa não foram carregados ainda
- Erro no useEffect que adiciona o titular

**Solução:**
- ✅ Verificar se CPF está presente no cadastro
- ✅ Verificar se empresa tem planos
- ✅ Fechar e abrir o modal novamente
- ✅ Adicionar manualmente o titular como dependente se necessário

**Prevenção:**
- Sistema deve SEMPRE adicionar titular se CPF estiver presente
- useEffect configurado para disparar quando: `cadastro.cpf` existe e `dependentes.length === 0`

---

### Falha 6: Erro ao enviar para o ERP

**Sintoma:**
- Mensagem de erro após clicar em "Enviar para ERP"
- Cadastro não muda para status "enviado"

**Causas possíveis:**
1. **Validação falhou:**
   - Campos obrigatórios não preenchidos
   - Telefone principal não selecionado
   - CEP ou logradouro vazios

2. **Erro no payload:**
   - IDs de endereço inválidos (fallback não funciona)
   - Plano inválido
   - Grau de parentesco não mapeado

3. **Erro no ERP:**
   - Empresa não existe
   - Plano não existe
   - Regra de negócio do ERP não satisfeita

**Solução:**
- ✅ Verificar todos os campos obrigatórios
- ✅ Verificar se pelo menos um telefone está marcado como principal
- ✅ Verificar se CEP foi consultado com sucesso
- ✅ Verificar se dependentes têm planos selecionados
- ✅ Verificar logs da API no Supabase
- ℹ️ Entrar em contato com suporte se erro persistir

---

### Falha 7: Dependente sem plano selecionado

**Sintoma:**
- Ao adicionar dependente, campo "Plano" fica como "Selecione"
- Validação permite salvar mas ERP recusa

**Causa:**
- Usuário não selecionou plano ao adicionar dependente
- Campo plano com valor 0

**Solução:**
- ✅ Editar dependente e selecionar um plano válido
- ✅ Remover e adicionar novamente o dependente com plano

**Prevenção:**
- Validação no frontend deve bloquear adição de dependente sem plano
- Campo "Plano" deve ser obrigatório (required)

---

### Falha 8: Contato do responsável financeiro vazio

**Sintoma:**
- Array `contatoResponsavelFinanceiro` vazio no payload
- ERP pode recusar cadastro

**Causa:**
- Usuário não adicionou contatos na seção específica
- Contatos gerais não são usados automaticamente

**Solução:**
- ✅ Adicionar pelo menos um contato (celular ou email) na seção "Contatos do Responsável Financeiro"
- ℹ️ Esses contatos são usados para cobrança

**Prevenção:**
- Sistema poderia copiar automaticamente contatos gerais para essa seção
- Validação poderia exigir pelo menos um contato

---

### Falha 9: Dados do titular incompletos

**Sintoma:**
- Titular aparece na lista de dependentes mas com campos vazios
- Nome vazio, data de nascimento vazia, sexo 0

**Causa:**
- Lemit não retornou dados
- Dados não foram preenchidos manualmente

**Solução:**
- ✅ Editar o titular na lista de dependentes
- ✅ Preencher todos os campos obrigatórios:
  - Nome completo
  - Data de nascimento
  - Sexo
  - Plano

**Prevenção:**
- Validação no frontend deve verificar se titular tem todos os dados antes de enviar
- Exibir alerta se campos estiverem vazios

---

### Falha 10: Modal não abre após consulta

**Sintoma:**
- Consulta de CPF executada com sucesso
- Rascunho salvo
- Modal não abre automaticamente

**Causa:**
- Erro no estado do React
- Cadastro não foi retornado corretamente

**Solução:**
- ✅ Ir para aba "Incompletos"
- ✅ Localizar cadastro pelo CPF
- ✅ Clicar para abrir

**Prevenção:**
- Verificar se `setSelectedCadastro` está sendo chamado
- Verificar se componente `CadastroModal` está renderizando

---

## Validações Obrigatórias

### Antes de Salvar Rascunho
- ✅ CPF válido (11 dígitos)
- ✅ Empresa selecionada
- ⚠️ Outros campos opcionais

### Antes de Enviar para ERP

**Responsável Financeiro:**
- ✅ Nome preenchido
- ✅ Data de nascimento preenchida
- ✅ Sexo selecionado (1 ou 2)
- ✅ Pelo menos um telefone marcado como principal
- ✅ CEP preenchido (8 dígitos)
- ✅ Logradouro preenchido

**Dependentes:**
- ✅ Pelo menos 1 dependente na lista
- ✅ Cada dependente com:
  - Nome completo
  - Data de nascimento
  - CPF válido
  - Sexo selecionado
  - Plano selecionado
  - Grau de parentesco válido

**Endereço:**
- ✅ CEP válido
- ✅ Logradouro preenchido
- ⚠️ IDs do ERP preferencialmente preenchidos (usa fallback se não)

---

## Tratamento de Erros

### Erros que Bloqueiam o Fluxo
1. **CPF duplicado no ERP** - Para tudo, não permite continuar
2. **Validações obrigatórias** - Não permite enviar até corrigir
3. **Empresa sem planos** - Não permite adicionar dependentes

### Erros que Não Bloqueiam (Warnings)
1. **CEP não encontrado no ERP** - Permite continuar, usa fallback
2. **Lemit sem dados** - Permite continuar, campos vazios
3. **Consulta de endereço falhada** - Permite edição manual

### Logs e Auditoria
- Todas as chamadas às APIs externas são registradas na tabela `api_logs`
- Inclui: função chamada, parâmetros, resposta, tempo de execução
- Útil para debug e auditoria

---

## Checklist para Cadastro Completo

### ☑️ Fase 1: Consulta Inicial
- [ ] CPF consultado e não existe no ERP
- [ ] Dados da Lemit carregados (ou campos vazios)
- [ ] CEP consultado no ERP (se disponível)
- [ ] Empresa pesquisada e selecionada
- [ ] Planos da empresa carregados

### ☑️ Fase 2: Preenchimento
- [ ] Nome do responsável preenchido
- [ ] Data de nascimento preenchida
- [ ] Sexo selecionado
- [ ] Pelo menos um telefone com marcação "principal"
- [ ] Endereço completo (CEP, logradouro, número, bairro, cidade, UF)
- [ ] Contatos do responsável financeiro adicionados

### ☑️ Fase 3: Dependentes
- [ ] Titular aparece automaticamente na lista
- [ ] Titular com todos os dados preenchidos (nome, data, sexo, plano)
- [ ] Outros dependentes adicionados (se necessário)
- [ ] Cada dependente com plano selecionado

### ☑️ Fase 4: Envio
- [ ] Todas as validações passaram
- [ ] "Enviar para ERP" clicado
- [ ] Sucesso confirmado
- [ ] Cadastro movido para aba "Completos"

---

## Documentos Relacionados

- `FLUXO_CADASTRO_ATUALIZADO.md` - Fluxo técnico detalhado das APIs
- `MODULO_CADASTRO.md` - Documentação original do módulo
- `TOKENS_SETUP.md` - Configuração de tokens do ERP
- `.env.example` - Variáveis de ambiente necessárias

---

## Suporte

Em caso de dúvidas ou problemas não cobertos neste documento:
1. Verificar logs na tabela `api_logs` do Supabase
2. Verificar console do navegador para erros JavaScript
3. Verificar Edge Functions logs no Supabase Dashboard
4. Entrar em contato com a equipe de desenvolvimento
