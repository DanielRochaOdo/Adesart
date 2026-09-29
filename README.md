# Adesão+ - Sistema Completo de Gestão ERP

Sistema ERP completo para gestão de planos de saúde, incluindo autenticação, controle de acesso baseado em roles (RBAC), cadastro de clientes com consulta de CPF, integração com APIs externas e gestão de equipes.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Sistema de Permissões](#sistema-de-permissões)
- [Módulos](#módulos)
- [Integrações](#integrações)
- [Configuração](#configuração)
- [Segurança](#segurança)
- [Documentação Adicional](#documentação-adicional)

---

## 🎯 Visão Geral

O **Adesão+** é um sistema completo de gestão para operadoras de planos de saúde, permitindo:

- Cadastro de clientes com consulta automática de dados via CPF
- Verificação de duplicidade antes do cadastro
- Busca inteligente de empresas conveniadas
- Gestão completa de dependentes e planos
- Upload de documentos com armazenamento temporário
- Controle de equipes e vendedores
- Sistema de permissões granular por tipo de usuário
- Integração completa com ERP externo
- Controle de uso de APIs externas

---

## ✨ Funcionalidades

### 🔐 Autenticação e Segurança

- Login seguro com email e senha via Supabase Auth
- Recuperação de senha (sistema nativo do Supabase)
- Proteção de rotas baseada em roles
- Row Level Security (RLS) em todas as tabelas
- Tokens JWT para autenticação de requisições
- Validação de permissões em Edge Functions

### 👥 Gestão de Usuários e Equipes

- Criação, visualização e edição de usuários
- 5 níveis de acesso: ADMINISTRADOR, GERENTE, SUPERVISOR, VENDEDOR, ADESIONISTA
- Gestão de equipes com membros
- Perfil do usuário com edição de dados pessoais
- Vinculação de usuários a equipes
- ID Externo para integração com sistemas externos

### 📝 Módulo de Cadastro de Clientes (Vidas)

#### Consulta de CPF
- Validação completa de CPF (dígitos verificadores)
- Consulta automática de dados via API Lemmit
- Controle de uso da API Lemmit (limites diário e mensal)
- Preenchimento automático de dados pessoais
- Verificação de duplicidade no ERP antes de consultar

#### Busca de Empresas
- Busca inteligente por nome ou CNPJ
- Busca por ID específico
- Listagem de planos disponíveis por empresa
- Informações sobre matrícula obrigatória
- Observações e configurações específicas por empresa

#### Gestão de Dependentes
- Cadastro ilimitado de dependentes
- Tipos de parentesco configuráveis
- Validação de idade para CPF
- Seleção individual de planos por dependente
- Valores diferenciados (Titular vs Dependente)
- Nome da mãe obrigatório

#### Endereço Inteligente
- Consulta automática de CEP no ERP
- Preenchimento automático de logradouro, bairro, cidade e UF
- IDs do ERP para integração correta
- Validação de campos obrigatórios

#### Upload de Documentos
- Upload de arquivos (PDF, JPG, PNG)
- Armazenamento temporário no Supabase Storage
- Limite de 10MB por arquivo
- Manutenção do arquivo até conclusão do cadastro
- Exclusão automática após envio ao ERP
- Possibilidade de remoção manual antes do envio

#### Configurações de Cadastro
- Planos ocultos (não aparecem na seleção)
- Planos válidos para cadastro
- Situações que barram o cadastro
- Ativação/desativação da consulta Lemmit
- Campo arquivo obrigatório ou opcional
- Mapeamento de tipos de parentesco
- Mapeamento de planos com nomes personalizados

#### Controles e Validações
- Status do cadastro (Incompleto, Enviado, Erro)
- Salvamento automático de rascunhos
- Validação completa antes do envio
- Logs detalhados de todas as operações
- Histórico de consultas e envios
- Tratamento de erros do ERP

### 📊 Dashboard

- Visão geral do sistema
- Estatísticas por tipo de usuário
- Acesso rápido às funcionalidades

### 📄 Uso da API Lemmit

- Visualização de uso diário e mensal
- Limite configurável por time
- Reset automático de contadores
- Histórico de consultas

---

## 🛠 Tecnologias

### Frontend
- **React 18** - Biblioteca JavaScript para interfaces
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **Tailwind CSS** - Framework CSS utility-first
- **React Router DOM** - Roteamento
- **Lucide React** - Ícones SVG

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL - Banco de dados
  - Auth - Autenticação
  - Storage - Armazenamento de arquivos
  - Edge Functions - Serverless functions
  - Row Level Security - Segurança em nível de linha

### Integrações Externas
- **API Lemmit** - Consulta de dados por CPF
- **API ERP Odontoart** - Sistema ERP externo

---

## 📁 Estrutura do Projeto

```
/
├── src/
│   ├── components/           # Componentes reutilizáveis
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── DateInput.tsx
│   │   ├── Input.tsx
│   │   ├── Layout.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── Select.tsx
│   │   ├── cadastro/         # Componentes do módulo de cadastro
│   │   │   ├── AlreadyExistsModal.tsx
│   │   │   ├── CadastroModal.tsx
│   │   │   ├── CadastrosCompletosList.tsx
│   │   │   ├── CadastrosGerenteView.tsx
│   │   │   ├── CadastrosIncompletosList.tsx
│   │   │   ├── CadastrosSupervisorView.tsx
│   │   │   ├── ClientExistsModal.tsx
│   │   │   ├── DependenteAtivoModal.tsx
│   │   │   ├── DependentesSection.tsx
│   │   │   ├── EmpresaSearchCard.tsx
│   │   │   ├── LemmitErrorModal.tsx
│   │   │   ├── NovoCadastroCard.tsx
│   │   │   └── ObservacoesEmpresaModal.tsx
│   │   ├── config/           # Componentes de configuração
│   │   │   ├── ApiLogsTable.tsx
│   │   │   ├── GeralConfigCard.tsx
│   │   │   ├── ParentescoMapTable.tsx
│   │   │   └── PlanosMapTable.tsx
│   │   ├── teams/            # Componentes de equipes
│   │   │   ├── EditTeamMembersModal.tsx
│   │   │   └── EditTeamModal.tsx
│   │   └── users/            # Componentes de usuários
│   │       └── EditUserModal.tsx
│   ├── contexts/             # Contextos React
│   │   ├── AuthContext.tsx
│   │   └── ConfigCadastroContext.tsx
│   ├── hooks/                # Custom hooks
│   │   └── useCadastros.ts
│   ├── lib/                  # Utilitários e bibliotecas
│   │   ├── cpf.ts
│   │   ├── mappers.ts
│   │   └── supabase.ts
│   ├── pages/                # Páginas da aplicação
│   │   ├── Cadastro.tsx
│   │   ├── ConfiguracoesCadastro.tsx
│   │   ├── Dashboard.tsx
│   │   ├── LemmitUsage.tsx
│   │   ├── Login.tsx
│   │   ├── Profile.tsx
│   │   ├── Teams.tsx
│   │   └── Users.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── migrations/           # Migrações do banco de dados
│   └── functions/            # Edge Functions
│       ├── create-user/
│       ├── erp-check-associado/
│       ├── erp-endereco-cep/
│       ├── erp-novo-usuario2/
│       ├── erp-search-empresa/
│       ├── erp-upload-documento/
│       └── lemit-consulta-pessoa/
├── .env                      # Variáveis de ambiente
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 🔑 Sistema de Permissões

O sistema possui 5 níveis de acesso hierárquicos:

### 1. ADMINISTRADOR

**Acesso Total ao Sistema**

✅ Pode fazer:
- Criar, editar e excluir usuários
- Criar, editar e excluir equipes
- Ver todos os cadastros
- Editar todos os cadastros
- Deletar cadastros
- Acessar todas as configurações
- Ver logs de todas as APIs

**Campos obrigatórios:**
- Nome
- Email

---

### 2. GERENTE

**Acesso Amplo com Algumas Restrições**

✅ Pode fazer:
- Ver todos os usuários e equipes
- Criar e editar usuários
- Ver e editar todos os cadastros
- Acessar configurações de cadastro
- Ver logs de APIs

❌ Não pode:
- Excluir ou desativar usuários
- Deletar cadastros
- Excluir equipes

**Campos obrigatórios:**
- Nome
- Email

---

### 3. SUPERVISOR

**Acesso Limitado à Sua Equipe**

✅ Pode fazer:
- Ver usuários da sua equipe
- Criar e editar usuários da sua equipe
- Ver cadastros da sua equipe
- Editar cadastros da sua equipe
- Adicionar membros à sua equipe

❌ Não pode:
- Ver outras equipes
- Deletar cadastros
- Acessar configurações globais

**Campos obrigatórios:**
- Nome
- Email
- ID Externo (código no sistema externo)
- Equipe

---

### 4. VENDEDOR

**Acesso Apenas aos Próprios Cadastros**

✅ Pode fazer:
- Ver apenas seus próprios cadastros
- Criar novos cadastros
- Editar seus próprios cadastros
- Editar seu próprio perfil

❌ Não pode:
- Ver cadastros de outros vendedores
- Deletar cadastros
- Ver ou criar usuários
- Acessar configurações

**Campos obrigatórios:**
- Nome
- Email
- ID Externo (código do vendedor no ERP)
- Equipe

---

### 5. ADESIONISTA / CADASTRO

**Acesso para Cadastramento de Clientes**

✅ Pode fazer:
- Ver todos os cadastros
- Criar novos cadastros
- Editar todos os cadastros
- Editar seu próprio perfil

❌ Não pode:
- Deletar cadastros
- Ver ou criar usuários
- Acessar configurações

**Campos obrigatórios:**
- Nome
- Email
- ID Externo (código no sistema externo)
- Equipe

**Observação:** O role pode ser configurado como "ADESIONISTA" ou "CADASTRO", ambos têm as mesmas permissões.

---

## 📦 Módulos

### 1. Dashboard
- Tela inicial após login
- Informações contextuais por tipo de usuário
- Atalhos para funcionalidades principais

### 2. Usuários
- Listagem de usuários (respeitando permissões)
- Criação de novos usuários
- Edição de usuários existentes
- Ativação/desativação de contas
- Filtros e busca

### 3. Equipes
- Listagem de equipes
- Criação de novas equipes
- Edição de equipes
- Gestão de membros

### 4. Cadastro (Vidas)
- **Novo Cadastro:** Consulta por CPF e criação de rascunho
- **Inclusões Pendentes:** Cadastros em andamento
- **Completos:** Cadastros finalizados e enviados ao ERP
- Views específicas por tipo de usuário (Gerente vs Supervisor)

### 5. Configurações de Cadastro
- Configurações gerais
- Mapeamento de tipos de parentesco
- Mapeamento de planos
- Logs de API
- Controle de planos válidos e ocultos
- Situações que barram cadastro

### 6. Uso da API Lemmit
- Contador de uso diário
- Contador de uso mensal
- Limites configurados
- Data de próximo reset

### 7. Meu Perfil
- Visualização de dados pessoais
- Edição de nome
- Alteração de senha
- ID Externo (se aplicável)

---

## 🔌 Integrações

### API Lemmit

**Finalidade:** Consulta de dados de pessoas físicas por CPF

**Edge Function:** `lemit-consulta-pessoa`

**Fluxo:**
1. Usuário digita CPF no formulário
2. Sistema valida CPF (dígitos verificadores)
3. Verifica se não existe no ERP (evita duplicidade)
4. Consulta API Lemmit via Edge Function
5. Retorna nome, nascimento, sexo, contatos e endereços
6. Preenche formulário automaticamente
7. Incrementa contador de uso

**Limites:**
- 100 consultas por dia (por time)
- 500 consultas por mês (por time)
- Reset automático diário às 00:00 UTC
- Reset mensal no dia 1 às 00:00 UTC

**Controle:**
- Tabela `lemmit_usage_control` armazena contadores
- Edge function verifica limites antes de consultar
- Retorna erro se limite excedido

---

### API ERP Odontoart

Sistema ERP externo para gestão de planos de saúde.

#### 1. Verificação de Duplicidade

**Edge Function:** `erp-check-associado`

**Endpoint:** `GET /v2/api/associados?cpfDependente={CPF}`

**Finalidade:** Verificar se CPF já existe no ERP antes de consultar Lemmit

**Fluxo:**
1. Usuário clica em "Consultar" após digitar CPF
2. Sistema consulta ERP primeiro
3. Se existe: exibe modal de duplicidade e PARA
4. Se não existe: continua para consulta Lemmit

---

#### 2. Busca de Empresas

**Edge Function:** `erp-search-empresa`

**Endpoint:** `GET /api/RedeatendimentoEmpresa/Listar?query={QUERY}`

**Finalidade:** Buscar empresas conveniadas por nome, CNPJ ou ID

**Fluxo:**
1. Usuário digita nome ou CNPJ da empresa
2. Sistema busca no ERP
3. Retorna lista de empresas com planos disponíveis
4. Usuário seleciona empresa
5. Planos são carregados para seleção de dependentes

**Dados Retornados:**
- ID da empresa
- Nome
- CNPJ
- Se exige matrícula
- Lista de planos com valores
- Observações

---

#### 3. Consulta de Endereço por CEP

**Edge Function:** `erp-endereco-cep`

**Endpoint:** `GET /api/redeatendimento/Endereco?cep={CEP}`

**Finalidade:** Obter dados completos de endereço com IDs do ERP

**Fluxo:**
1. Sistema pega CEP da consulta Lemmit (ou usuário digita no modal)
2. Consulta ERP
3. Recebe IDs de tipo de logradouro, bairro, município e UF
4. Usa IDs corretos no payload final

**Dados Retornados:**
- IdTipoLogradouro
- IdBairro
- IdMunicipio
- IdUf
- Logradouro, Bairro, Cidade, UF (textos)

---

#### 4. Cadastro de Cliente (NovoUsuario2)

**Edge Function:** `erp-novo-usuario2`

**Endpoint:** `POST /api/vendedor/NovoUsuario2`

**Finalidade:** Enviar cadastro completo ao ERP

**Fluxo:**
1. Usuário preenche todos os dados e clica em "Cadastrar"
2. Sistema valida campos obrigatórios
3. Monta payload no formato do ERP
4. Envia via Edge Function
5. Se sucesso: atualiza status para "enviado"
6. Se erro: atualiza status para "erro_envio" e exibe mensagem

**Payload Enviado:**
- Dados do responsável financeiro
- Endereço completo com IDs do ERP
- Contatos (celular, fixo, WhatsApp, email)
- Lista de dependentes com planos
- Código da empresa
- Código do vendedor/parceiro
- Matrícula (se exigida)

**Resposta de Sucesso:**
- Código do cadastro gerado
- Códigos dos dependentes
- ID do boleto
- URL do boleto

---

#### 5. Upload de Documento

**Edge Function:** `erp-upload-documento`

**Endpoint:** `POST /api/associado/DocumentoDependente`

**Finalidade:** Enviar documento do cliente após cadastro

**Fluxo:**
1. Usuário seleciona arquivo (PDF, JPG, PNG)
2. Arquivo é enviado ao Supabase Storage temporariamente
3. Usuário clica em "Salvar": referência é salva no banco
4. Usuário clica em "Cadastrar" e cadastro é bem-sucedido
5. Sistema envia arquivo para o ERP usando código do dependente
6. Arquivo é deletado do Storage após envio com sucesso

**Dados Enviados:**
- idFuncionario (ID do usuário que está cadastrando)
- idDependente (código retornado pelo ERP)
- arquivo (base64)
- arquivoNome

---

## ⚙️ Configuração

### Variáveis de Ambiente (Frontend)

Arquivo `.env`:

```env
VITE_SUPABASE_URL=https://vrstknodamvtgbpyxfql.supabase.co
VITE_SUPABASE_ANON_KEY=seu-anon-key-aqui
```

### Variáveis de Ambiente (Supabase Edge Functions)

Configurar no Dashboard do Supabase > Edge Functions > Secrets:

```env
# API Lemmit
LEMMIT_TOKEN=seu-token-lemmit

# API ERP
ERP_TOKEN=seu-token-erp
ERP_BASE_URL=https://odontoart.s4e.com.br (opcional, já tem default)

# Supabase (pré-configuradas automaticamente)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Ver `TOKENS_SETUP.md` e `EDGE_FUNCTIONS_SECRETS.md` para instruções detalhadas.

---

### Banco de Dados

O banco de dados é gerenciado via migrações no Supabase.

**Tabelas Principais:**

1. **auth.users** - Gerenciada pelo Supabase Auth
2. **profiles** - Perfis dos usuários
3. **teams** - Equipes
4. **cadastros** - Cadastros de clientes
5. **cadastro_config** - Configurações do módulo
6. **cadastro_parentesco_map** - Mapeamento de parentescos
7. **cadastro_planos_map** - Mapeamento de planos
8. **lemmit_usage_control** - Controle de uso da API Lemmit
9. **api_logs** - Logs de todas as chamadas de API

**Storage Buckets:**

1. **cadastros-temp-files** - Arquivos temporários de cadastros
   - Limite: 10MB por arquivo
   - Tipos aceitos: PDF, JPG, PNG
   - Políticas RLS: usuários autenticados podem criar, ler e deletar

---

### Bootstrap Inicial

#### 1. Criar Primeiro Administrador

```sql
-- 1. Crie o usuário no Supabase Auth Dashboard
-- 2. Execute este SQL substituindo os valores:

INSERT INTO profiles (id, name, email, role, is_active)
VALUES (
  'USER_ID_FROM_AUTH',  -- ID do usuário criado no Auth
  'Admin Principal',
  'admin@adesaomais.com',
  'ADMINISTRADOR',
  true
);
```

#### 2. Configurar Tokens das APIs

1. Acesse Supabase Dashboard
2. Vá em Edge Functions > Secrets
3. Adicione os tokens conforme documentado acima

#### 3. Popular Dados Iniciais (Opcional)

Execute o script `BOOTSTRAP.sql` para popular:
- Tipos de parentesco padrão
- Configurações iniciais
- Planos exemplo (se necessário)

---

## 🔒 Segurança

### Row Level Security (RLS)

Todas as tabelas possuem RLS ativado com políticas específicas por role:

**Exemplo - Tabela `cadastros`:**

```sql
-- ADMINISTRADOR: acesso total
CREATE POLICY "Admins can do all"
  ON cadastros FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'ADMINISTRADOR');

-- GERENTE: visualiza e edita todos, não deleta
CREATE POLICY "Managers can view all"
  ON cadastros FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'GERENTE');

-- SUPERVISOR: apenas sua equipe
CREATE POLICY "Supervisors view team"
  ON cadastros FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM profiles
      WHERE id = auth.uid()
    )
  );

-- VENDEDOR: apenas seus próprios
CREATE POLICY "Sellers view own"
  ON cadastros FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());
```

### Validações

1. **CPF:** Validação completa de dígitos verificadores
2. **Email:** Validação de formato
3. **Senha:** Mínimo 6 caracteres (gerenciado pelo Supabase Auth)
4. **Campos Obrigatórios:** Validação antes de envio ao ERP
5. **Limites de API:** Verificação antes de cada consulta
6. **Duplicidade:** Verificação no ERP antes de criar rascunho

### Proteção de Tokens

- Todos os tokens de APIs externas ficam no backend (Edge Functions)
- Frontend nunca tem acesso direto aos tokens
- Requisições autenticadas via JWT do Supabase
- Edge Functions validam permissões antes de executar

---

## 📚 Documentação Adicional

### Arquivos de Documentação

1. **`MODULO_CADASTRO.md`** - Documentação completa do módulo de cadastro
2. **`FLUXO_CADASTRO_ATUALIZADO.md`** - Fluxo detalhado de todas as etapas do cadastro
3. **`API_REGRAS.md`** - Regras de validação e integração com APIs
4. **`TOKENS_SETUP.md`** - Guia de configuração de tokens
5. **`EDGE_FUNCTIONS_SECRETS.md`** - Configuração de secrets das Edge Functions
6. **`REGRAS_CADASTRO_USUARIO.md`** - Regras específicas de cadastro de usuários
7. **`BOOTSTRAP.sql`** - Script de inicialização do banco de dados
8. **`QUICK_START.md`** - Guia rápido de início

### Exemplos de Payload

Ver `API_REGRAS.md` para exemplos completos de:
- Payload de cadastro completo
- Response do ERP
- Mapeamento de dados
- Tratamento de erros

---

## 🚀 Como Usar

### Desenvolvimento

O servidor de desenvolvimento é executado automaticamente.

```bash
npm run dev
```

### Build de Produção

```bash
npm run build
```

### Deploy das Edge Functions

```bash
# Via ferramenta interna do Supabase
# As funções são deployadas automaticamente quando modificadas
```

---

## 🔄 Fluxo Completo de Cadastro

### 1. Consulta Inicial

```
Usuário digita CPF
    ↓
Valida formato e dígitos verificadores
    ↓
Consulta ERP: verifica duplicidade
    ↓
├─ Existe? → Modal de duplicidade → FIM
└─ Não existe? → Continua
    ↓
Consulta API Lemmit
    ↓
Preenche dados automaticamente
    ↓
Se houver CEP: consulta endereço no ERP
    ↓
Salva rascunho (status='incompleto')
    ↓
Abre modal de edição
```

### 2. Edição e Complemento

```
Usuário edita dados no modal
    ↓
Busca empresa conveniada
    ↓
Seleciona empresa
    ↓
Adiciona/edita dependentes
    ↓
Seleciona plano para cada dependente
    ↓
Upload de documento (opcional/obrigatório)
    ↓
Clica em "Salvar"
    ↓
Dados salvos no banco (ainda incompleto)
    ↓
Arquivo mantido no Storage
```

### 3. Envio ao ERP

```
Usuário clica em "Cadastrar"
    ↓
Sistema valida todos os campos obrigatórios
    ↓
├─ Falta algo? → Exibe erro → Volta para edição
└─ Tudo OK? → Continua
    ↓
Monta payload no formato do ERP
    ↓
Envia para Edge Function
    ↓
Edge Function chama API do ERP
    ↓
├─ Sucesso?
│   ↓
│   Atualiza status='enviado'
│   ↓
│   Se houver arquivo:
│   ├─ Upload documento para ERP
│   └─ Delete arquivo do Storage
│   ↓
│   Exibe mensagem de sucesso
│   ↓
│   Fecha modal
│
└─ Erro?
    ↓
    Atualiza status='erro_envio'
    ↓
    Salva mensagem de erro
    ↓
    Exibe modal com detalhes
    ↓
    Arquivo permanece no Storage
```

---

## 📊 Estrutura do Banco de Dados

### Diagrama Simplificado

```
auth.users (Supabase Auth)
    ↓ (1:1)
profiles
    ↓ (N:1)
teams

profiles (created_by)
    ↓ (1:N)
cadastros
    ↓ (N:1)
teams

cadastros
    ← (1:1) cadastro_config
    ← (1:N) lemmit_usage_control
    ← (1:N) api_logs
```

### Principais Relacionamentos

- Um **usuário** (auth.users) tem um **profile**
- Um **profile** pode pertencer a um **team**
- Um **profile** pode criar vários **cadastros**
- Cada **cadastro** pertence a um **team**
- Cada **cadastro** pode ter arquivo temporário no **Storage**
- Cada **team** tem controle de uso da **API Lemmit**

---

## 🐛 Troubleshooting

### Erro: "Limite de consultas excedido"

**Causa:** Time atingiu limite diário ou mensal de consultas Lemmit

**Solução:**
1. Aguardar reset automático (diário às 00:00 UTC)
2. Admin pode resetar manualmente na tabela `lemmit_usage_control`
3. Admin pode aumentar limites nas configurações

---

### Erro: "CPF já cadastrado no ERP"

**Causa:** CPF já existe como associado no ERP

**Solução:**
1. Verificar dados no modal exibido
2. Confirmar se é duplicidade real
3. Se necessário, atualizar no ERP diretamente
4. Não é possível criar novo cadastro com CPF duplicado

---

### Erro: "Campo obrigatório: External ID"

**Causa:** Usuários CADASTRO/ADESIONISTA precisam de External ID configurado

**Solução:**
1. Ir em "Meu Perfil"
2. Preencher campo "ID Externo"
3. Este ID é usado no payload enviado ao ERP
4. Salvar e tentar cadastrar novamente

---

### Arquivo não aparece após reabrir cadastro

**Causa:** Arquivo não foi salvo (usuário não clicou em "Salvar")

**Solução:**
1. Fazer upload do arquivo novamente
2. Clicar em "Salvar" para persistir a referência
3. Arquivo ficará disponível mesmo após fechar o modal

---

## 📝 Próximos Passos e Melhorias

### Em Desenvolvimento
- [ ] Relatórios e dashboards analíticos
- [ ] Exportação de dados em Excel/PDF
- [ ] Notificações em tempo real
- [ ] Auditoria de ações dos usuários

### Planejado
- [ ] App mobile
- [ ] Integração com WhatsApp para notificações
- [ ] Sistema de comissões
- [ ] Gestão de boletos
- [ ] Assinatura digital de contratos

---

## 📞 Suporte

Para dúvidas, problemas ou sugestões:

1. Consulte a documentação específica na pasta do projeto
2. Verifique os logs de API na tela de "Configurações de Cadastro"
3. Entre em contato com o administrador do sistema

---

## 📄 Licença

Propriedade de **Adesão+**. Todos os direitos reservados.

---

**Versão:** 2.0
**Última atualização:** Janeiro 2026


## Web e Android no mesmo repositório

O Adesart possui duas interfaces oficiais no mesmo repositório: o cliente Web em `src/` e o cliente Android nativo em `android-app/`. O backend Supabase, migrations e Edge Functions de `supabase/` são únicos e canônicos para ambos. Consulte `docs/ARQUITETURA_CANONICA_WEB_ANDROID.md` para as regras de paridade.
