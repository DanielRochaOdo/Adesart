# Documentação da API - Regras e Integrações

Este documento descreve todas as regras, validações e integrações implementadas no sistema de cadastro.

## Índice

1. [Edge Functions](#edge-functions)
2. [Estrutura de Dados](#estrutura-de-dados)
3. [Regras de Validação](#regras-de-validação)
4. [Mapeamento de Dados](#mapeamento-de-dados)
5. [Controle de Uso da API Lemmit](#controle-de-uso-da-api-lemmit)

---

## Edge Functions

### 1. `erp-novo-usuario2`

**Endpoint:** `/functions/v1/erp-novo-usuario2`
**Método:** POST
**Descrição:** Cadastra um novo usuário no ERP.

#### Request Body

```json
{
  "dados": {
    "parceiro": {
      "codigo": 123,
      "tipoCobranca": 1
    },
    "parcelaRetidaComissao": "0",
    "responsavelFinanceiro": {
      "codigoContrato": "5", // Código da empresa selecionada
      "nome": "João Silva",
      "dataNascimento": "01/01/1990",
      "cpf": "123.456.789-00",
      "sexo": 1,
      "grupoFaturamento": 0,
      "sexoDescricao": "Masculino",
      "identidadeNumero": "123456789",
      "identidadeOrgaoExpeditor": "SSPDS",
      "Matricula": "MAT123", // Opcional
      "endereco": {
        "cep": "60000000",
        "tipoLogradouro": "816",
        "logradouro": "Rua Exemplo",
        "numero": "123",
        "complemento": "Apto 101",
        "bairro": "1262",
        "municipio": "2",
        "uf": "5",
        "descricaoUf": "CE"
      },
      "contatoResponsavelFinanceiro": [
        {
          "tipo": 8, // 8=Celular, 1=Fixo, 10=WhatsApp, 50=Email
          "dado": "85999999999"
        }
      ],
      "fl_AlteraSituacao": 1,
      "dataApresentacao": "2024-01-01T00:00:00.000Z"
    },
    "dependente": [
      {
        "tipo": 1,
        "nome": "Maria Silva",
        "dataNascimento": "01/01/2010",
        "cpf": "987.654.321-00",
        "sexo": 0,
        "sexoDescricao": "Feminino",
        "plano": 123,
        "planoValor": "100.00",
        "nomeMae": "Ana Silva",
        "carenciaAtendimento": 1,
        "funcionarioCadastro": 123
      }
    ]
  },
  "empresa": "5"
}
```

#### Regras de Validação

1. **Campo `dados` obrigatório**: O payload deve conter o campo `dados`
2. **Campo `responsavelFinanceiro` obrigatório**: Dentro de `dados`, o campo `responsavelFinanceiro` é obrigatório
3. **Validação de sucesso especial**: A API do ERP pode retornar status 400, mas ainda assim ter dados válidos. A validação de sucesso verifica se existe `dados.codigo` no response, independente do status HTTP
4. **Código do contrato**: O campo `codigoContrato` deve ser o código da empresa selecionada

#### Response de Sucesso

```json
{
  "success": true,
  "data": {
    "dados": {
      "codigo": 311193412,
      "boletoId": 6277862,
      "boletoURL": "http://...",
      "dependentes": [
        {
          "codigo": "311444312",
          "contrato": ""
        }
      ]
    },
    "erros": null,
    "codigo": 1,
    "mensagem": null
  }
}
```

#### Response de Erro

```json
{
  "error": "Mensagem de erro",
  "details": {
    // Detalhes do erro retornado pelo ERP
  },
  "status": 400
}
```

---

### 2. `erp-search-empresa`

**Endpoint:** `/functions/v1/erp-search-empresa`
**Método:** POST
**Descrição:** Busca empresas no ERP.

#### Request Body

```json
{
  "query": "Nome da Empresa"
}
```

#### Response de Sucesso

```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "nome": "Empresa Exemplo",
      "cnpj": "12.345.678/0001-00"
    }
  ]
}
```

---

### 3. `erp-check-associado`

**Endpoint:** `/functions/v1/erp-check-associado`
**Método:** POST
**Descrição:** Verifica se um CPF já existe como associado no ERP.

#### Request Body

```json
{
  "cpf": "12345678900",
  "empresaId": "5"
}
```

#### Response de Sucesso (Não existe)

```json
{
  "exists": false,
  "data": null
}
```

#### Response de Sucesso (Existe)

```json
{
  "exists": true,
  "data": {
    "codigo": 123456,
    "nome": "João Silva",
    "cpf": "123.456.789-00"
  }
}
```

---

### 4. `lemit-consulta-pessoa`

**Endpoint:** `/functions/v1/lemit-consulta-pessoa`
**Método:** POST
**Descrição:** Consulta dados de uma pessoa na API Lemmit (consulta de CPF).

#### Controle de Uso

- Limite diário: 100 consultas por time
- Limite mensal: 500 consultas por time
- Contador resetado automaticamente às 00:00 UTC

#### Request Body

```json
{
  "cpf": "12345678900"
}
```

#### Response de Sucesso

```json
{
  "success": true,
  "data": {
    "nome": "João Silva",
    "nome_mae": "Maria Silva",
    "data_nascimento": "1990-01-01",
    "sexo": "M",
    "celulares": [
      {
        "numero": "85999999999"
      }
    ],
    "telefones_fixos": [],
    "emails": [
      {
        "email": "joao@example.com"
      }
    ],
    "enderecos": [
      {
        "cep": "60000000",
        "tipo_logradouro": "Rua",
        "logradouro": "Exemplo",
        "numero": "123",
        "complemento": "Apto 101",
        "bairro": "Centro",
        "cidade": "Fortaleza",
        "uf": "CE"
      }
    ]
  }
}
```

#### Response de Erro (Limite Excedido)

```json
{
  "error": "Limite diário de consultas excedido",
  "usage": {
    "daily": 100,
    "monthly": 450
  },
  "limits": {
    "daily": 100,
    "monthly": 500
  }
}
```

---

### 5. `erp-endereco-cep`

**Endpoint:** `/functions/v1/erp-endereco-cep`
**Método:** POST
**Descrição:** Busca informações de endereço pelo CEP no ERP.

#### Request Body

```json
{
  "cep": "60000000"
}
```

#### Response de Sucesso

```json
{
  "success": true,
  "data": {
    "cep": "60000-000",
    "logradouro": "Rua Exemplo",
    "bairro": "Centro",
    "cidade": "Fortaleza",
    "uf": "CE",
    "idTipoLogradouro": 816,
    "idBairro": 1262,
    "idMunicipio": 2,
    "idUf": 5
  }
}
```

---

## Estrutura de Dados

### Cadastro Completo

```typescript
interface CadastroFormData {
  cpf: string;
  nome: string;
  dataNascimento: string;
  sexo: string;
  sexoCodigo: number; // 0=Feminino, 1=Masculino
  contatos: CadastroContato[];
  endereco: CadastroEndereco;
  nomeMae?: string;
  dependentes?: Dependente[];
  numeroMatricula?: string;
}
```

### Contato

```typescript
interface CadastroContato {
  tipo: 'celular' | 'fixo' | 'email' | 'whatsapp';
  valor: string;
  principal?: boolean;
}
```

### Endereço

```typescript
interface CadastroEndereco {
  cep: string;
  tipoLogradouro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  idTipoLogradouro?: number;
  idBairro?: number;
  idMunicipio?: number;
  idUf?: number;
  ufSigla?: string;
}
```

### Dependente

```typescript
interface Dependente {
  tipo: number;
  nome: string;
  dataNascimento: string;
  cpf: string;
  sexo: number; // 0=Feminino, 1=Masculino
  sexoDescricao: string;
  plano: number;
  planoValor: string;
  nomeMae: string;
  carenciaAtendimento: number;
  funcionarioCadastro: number;
}
```

---

## Regras de Validação

### 1. CPF

- Deve ser válido (validação com dígitos verificadores)
- Armazenado sem máscara (apenas números)
- Formatado com máscara ao enviar para o ERP

### 2. Data de Nascimento

- Formato interno: `YYYY-MM-DD`
- Formato ERP: `DD/MM/YYYY`
- Conversão automática no mapper

### 3. Sexo

- Valores aceitos:
  - `0` ou `F` ou `Feminino` = Feminino
  - `1` ou `M` ou `Masculino` = Masculino

### 4. Código de Contrato

**REGRA ATUAL:** O campo `codigoContrato` no payload do ERP deve ser o **código da empresa** selecionada pelo usuário.

- Anteriormente era gerado com base no CPF e data de nascimento
- Atualmente usa o `empresaId` da empresa selecionada
- Exemplo: Se empresa selecionada tem ID 5, o `codigoContrato` será "5"

### 5. Contatos

Mapeamento de tipos:

| Tipo Frontend | Código ERP | Descrição |
|--------------|-----------|-----------|
| celular      | 8         | Celular   |
| fixo         | 1         | Telefone Fixo |
| whatsapp     | 10        | WhatsApp  |
| email        | 50        | Email     |

### 6. Parceiro (Vendedor) e Funcionário Cadastro

**REGRA IMPORTANTE:** O comportamento difere baseado no tipo de usuário que está cadastrando:

#### Para usuários do tipo CADASTRO ou ADESIONISTA:

- `dados.parceiro.codigo`: Usa o **código do vendedor** selecionado (`vendedorCodigo`)
- `dados.dependente[].funcionarioCadastro`: Usa o **ID Externo** (`external_id`) do usuário que está cadastrando

**Exemplo:** Se um usuário do tipo CADASTRO com `external_id = "123"` está cadastrando um cliente e seleciona o vendedor de código "456":
- `dados.parceiro.codigo` = 456 (código do vendedor selecionado)
- `dados.dependente[].funcionarioCadastro` = 123 (ID externo do usuário CADASTRO)

#### Para outros tipos de usuários (ADMINISTRADOR, GERENTE, SUPERVISOR, VENDEDOR):

- `dados.parceiro.codigo`: Usa o **código do vendedor** selecionado (`vendedorCodigo`) ou `funcionarioCadastroId` se não houver vendedor
- `dados.dependente[].funcionarioCadastro`: Usa o **mesmo valor** de `dados.parceiro.codigo`

**Validação Obrigatória:**
- Usuários do tipo CADASTRO e ADESIONISTA **devem ter** um `external_id` configurado antes de poder cadastrar clientes
- O sistema exibe erro se o `external_id` não estiver configurado

### 7. Status de Sucesso do ERP

A validação de sucesso verifica se existe o campo `dados.codigo` no response do ERP, independente do status HTTP retornado. Isso porque a API do ERP pode retornar:

- Status 400 com `dados.codigo` presente = **SUCESSO**
- Status 200 sem `dados.codigo` = **ERRO**
- Status 400 sem `dados.codigo` = **ERRO**

---

## Mapeamento de Dados

### Lemmit → Cadastro

O mapper `mapLemitToCadastro` converte os dados da API Lemmit para o formato do formulário:

```typescript
// Input: Lemmit Response
{
  "nome": "João Silva",
  "data_nascimento": "1990-01-01",
  "sexo": "M",
  "celulares": [{"numero": "85999999999"}]
}

// Output: CadastroFormData
{
  "nome": "João Silva",
  "dataNascimento": "1990-01-01",
  "sexo": "M",
  "sexoCodigo": 1,
  "contatos": [
    {
      "tipo": "celular",
      "valor": "85999999999",
      "principal": true
    }
  ]
}
```

### Cadastro → ERP

O mapper `buildERPPayload` converte os dados do formulário para o formato esperado pelo ERP:

- Formata CPF com máscara
- Formata data de nascimento (DD/MM/YYYY)
- Converte tipos de contato
- Define código do contrato como código da empresa
- Mapeia IDs de endereço
- Adiciona campos obrigatórios (identidade, dataApresentacao, etc.)

---

## Controle de Uso da API Lemmit

### Tabela: `lemmit_usage_control`

Controla o uso da API Lemmit por time.

```sql
CREATE TABLE lemmit_usage_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  daily_count integer DEFAULT 0,
  monthly_count integer DEFAULT 0,
  last_reset_daily timestamptz DEFAULT now(),
  last_reset_monthly timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### Limites

- **Limite Diário:** 100 consultas
- **Limite Mensal:** 500 consultas
- **Reset Diário:** 00:00 UTC
- **Reset Mensal:** Primeiro dia do mês às 00:00 UTC

### Incremento Automático

A edge function `lemit-consulta-pessoa` incrementa automaticamente os contadores:

1. Verifica se existe registro para o time
2. Se não existe, cria com contador = 1
3. Se existe, verifica se precisa resetar os contadores
4. Incrementa o contador apropriado
5. Verifica se excedeu os limites

---

## Logs de API

Todas as edge functions registram logs na tabela `api_logs`:

```sql
CREATE TABLE api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  endpoint text NOT NULL,
  method text NOT NULL,
  request_body jsonb,
  response_body jsonb,
  status_code integer,
  success boolean DEFAULT false,
  error_message text,
  duration_ms integer,
  created_at timestamptz DEFAULT now()
);
```

### Campos

- `user_id`: ID do usuário que fez a requisição
- `user_email`: Email do usuário
- `endpoint`: Nome da edge function
- `method`: Método HTTP (POST, GET, etc.)
- `request_body`: Payload enviado
- `response_body`: Resposta retornada
- `status_code`: Código HTTP de status
- `success`: Se a requisição foi bem sucedida
- `error_message`: Mensagem de erro (se houver)
- `duration_ms`: Tempo de execução em milissegundos

---

## Configurações

### Tabela: `cadastro_config`

Armazena configurações globais do módulo de cadastro.

```sql
CREATE TABLE cadastro_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_codigo text,
  funcionario_cadastro_id integer,
  updated_at timestamptz DEFAULT now()
);
```

### Tabela: `cadastro_parentesco_map`

Mapeia tipos de parentesco do frontend para códigos do ERP.

```sql
CREATE TABLE cadastro_parentesco_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo_erp integer NOT NULL,
  ativo boolean DEFAULT true,
  ordem integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

### Tabela: `cadastro_planos_map`

Mapeia planos do ERP com suas informações.

```sql
CREATE TABLE cadastro_planos_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  codigo_erp integer NOT NULL,
  valor decimal(10,2) NOT NULL,
  ativo boolean DEFAULT true,
  ordem integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

---

## Variáveis de Ambiente

As seguintes variáveis de ambiente são necessárias:

### Supabase (Pré-configuradas)

- `SUPABASE_URL`: URL do projeto Supabase
- `SUPABASE_ANON_KEY`: Chave anônima do Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço (para edge functions)

### APIs Externas (Configurar manualmente)

- `ERP_TOKEN`: Token de autenticação do ERP
- `ERP_URL`: URL base da API do ERP (padrão: https://odontoart.s4e.com.br/api/vendedor/NovoUsuario2)
- `LEMMIT_TOKEN`: Token de autenticação da API Lemmit

---

## Observações Importantes

1. **Todos os CPFs são armazenados sem máscara** no banco de dados
2. **Formatação é aplicada apenas no envio** para APIs externas
3. **Logs são salvos para todas as requisições**, facilitando debug
4. **Contadores da Lemmit são resetados automaticamente** pela edge function
5. **Verificação de sucesso do ERP olha para `dados.codigo`**, não para status HTTP
6. **Código do contrato = Código da empresa** selecionada pelo usuário
