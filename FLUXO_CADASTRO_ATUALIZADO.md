# Fluxo Completo de Cadastro - Documentação Detalhada

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Fluxo 1: Consulta Inicial de CPF](#fluxo-1-consulta-inicial-de-cpf)
- [Fluxo 2: Edição e Complemento de Dados](#fluxo-2-edição-e-complemento-de-dados)
- [Fluxo 3: Upload de Documentos](#fluxo-3-upload-de-documentos)
- [Fluxo 4: Finalização e Envio ao ERP](#fluxo-4-finalização-e-envio-ao-erp)
- [Fluxo 5: Tratamento de Erros](#fluxo-5-tratamento-de-erros)
- [Diagramas de Sequência](#diagramas-de-sequência)
- [Estados e Transições](#estados-e-transições)

---

## 🎯 Visão Geral

O sistema de cadastro implementa um fluxo completo de 5 etapas principais:

1. **Consulta Inicial:** Validação de CPF, verificação de duplicidade e consulta Lemmit
2. **Edição:** Complemento de dados, busca de empresa e gestão de dependentes
3. **Upload:** Anexação de documentos com armazenamento temporário
4. **Envio:** Validação final e envio ao ERP
5. **Limpeza:** Envio de documento ao ERP e liberação de recursos

---

## 🔍 Fluxo 1: Consulta Inicial de CPF

### Objetivo
Validar CPF, verificar se já existe no ERP, consultar dados na API Lemmit e criar rascunho inicial.

### Etapas Detalhadas

```
┌─────────────────────────────────────────────────────────────┐
│ INÍCIO: Usuário na tela "Novo Cadastro"                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuário digita CPF no campo                             │
│    - Máscara automática (###.###.###-##)                   │
│    - 11 dígitos numéricos                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Usuário clica em "Consultar"                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. VALIDAÇÃO LOCAL DO CPF                                  │
│    - Remove máscara                                         │
│    - Verifica se tem 11 dígitos                            │
│    - Verifica se não é sequência (111.111.111-11)          │
│    - Calcula e valida dígito verificador 1                 │
│    - Calcula e valida dígito verificador 2                 │
│                                                              │
│    ❌ INVÁLIDO → Exibe erro "CPF inválido" → FIM           │
│    ✅ VÁLIDO → Continua                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. VERIFICAÇÃO DE DUPLICIDADE NO ERP                       │
│    Edge Function: erp-check-associado                      │
│    Endpoint: GET /v2/api/associados?cpfDependente={CPF}    │
│                                                              │
│    Request: { cpf: "12345678900" }                         │
│                                                              │
│    ❌ ERRO NA CONSULTA → Exibe erro → FIM                  │
│    ✅ EXISTE NO ERP →                                       │
│       - Exibe modal AlreadyExistsModal                     │
│       - Mostra: nome, empresa, código contrato             │
│       - Botão "Ver detalhes completos" (JSON)             │
│       - FIM DO FLUXO (não pode continuar)                  │
│    ✅ NÃO EXISTE → Continua                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. VERIFICAÇÃO DE LIMITE LEMMIT                           │
│    - Busca registro em lemmit_usage_control               │
│    - Verifica se precisa resetar contadores               │
│    - Verifica limite diário (100 consultas)               │
│    - Verifica limite mensal (500 consultas)               │
│                                                              │
│    ❌ LIMITE EXCEDIDO →                                    │
│       - Exibe LemmitErrorModal                            │
│       - Mostra uso atual e limites                        │
│       - FIM DO FLUXO                                       │
│    ✅ DENTRO DO LIMITE → Continua                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. CONSULTA API LEMMIT                                     │
│    Edge Function: lemit-consulta-pessoa                    │
│    - Envia CPF                                             │
│    - Registra log da chamada                               │
│    - Incrementa contador de uso                            │
│                                                              │
│    Response esperado:                                       │
│    {                                                        │
│      nome: "João Silva",                                   │
│      nome_mae: "Maria Silva",                              │
│      data_nascimento: "1990-01-01",                        │
│      sexo: "M",                                            │
│      celulares: [...],                                     │
│      telefones_fixos: [...],                               │
│      emails: [...],                                        │
│      enderecos: [...]                                      │
│    }                                                        │
│                                                              │
│    ❌ ERRO → Exibe mensagem → FIM                          │
│    ✅ SUCESSO → Dados recebidos → Continua                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. MAPEAMENTO DE DADOS LEMMIT                             │
│    Função: mapLemitToCadastro()                            │
│                                                              │
│    Transforma:                                              │
│    - Sexo: "M" → 1, "F" → 0                               │
│    - Data: "YYYY-MM-DD" (mantém)                           │
│    - Telefones: adiciona à lista de contatos              │
│    - Emails: adiciona à lista de contatos                 │
│    - Marca primeiro telefone como principal               │
│    - Endereços: pega primeiro da lista                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. ENRIQUECIMENTO DE ENDEREÇO (SE HOUVER CEP)            │
│    SE cep existir:                                         │
│      Edge Function: erp-endereco-cep                      │
│      Request: { cep: "60000000" }                         │
│                                                              │
│      Response esperado:                                     │
│      {                                                      │
│        IdTipoLogradouro: 816,                             │
│        TipoLogradouro: "RUA",                             │
│        Logradouro: "...",                                 │
│        IdBairro: 1262,                                    │
│        Bairro: "...",                                     │
│        IdMunicipio: 2,                                    │
│        Municipio: "Fortaleza",                            │
│        IdUf: 5,                                           │
│        Uf: "CEARA",                                       │
│        UfSigla: "CE"                                      │
│      }                                                      │
│                                                              │
│      ✅ SUCESSO → IDs do ERP são salvos no objeto         │
│      ❌ ERRO → Apenas loga warning, não bloqueia          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. CRIAÇÃO DO TITULAR AUTOMÁTICO                          │
│    - Cria dependente do tipo 1 (Titular)                  │
│    - Usa dados do CPF consultado:                         │
│      * nome                                                 │
│      * dataNascimento                                       │
│      * cpf                                                  │
│      * sexo                                                 │
│      * nomeMae                                             │
│    - plano: 0 (a selecionar)                              │
│    - funcionarioCadastro: External ID do usuário          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. SALVAMENTO DE RASCUNHO NO BANCO                       │
│     INSERT INTO cadastros:                                 │
│     {                                                       │
│       status: 'incompleto',                               │
│       cpf: "12345678900",                                 │
│       nome: "João Silva",                                 │
│       data_nascimento: "1990-01-01",                      │
│       sexo: "M",                                          │
│       sexo_codigo: 1,                                     │
│       nome_mae: "Maria Silva",                            │
│       contatos: [...],                                    │
│       endereco: {...},                                    │
│       dependentes: [titular],                             │
│       lemit_raw: {...},  // Dados brutos da Lemmit       │
│       created_by: user_id,                                │
│       team_id: user_team_id                               │
│     }                                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 11. ABERTURA DO MODAL DE EDIÇÃO                           │
│     - CadastroModal é aberto automaticamente              │
│     - Dados pré-preenchidos                                │
│     - Usuário pode editar/complementar                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
                      CONTINUA
               (Ver Fluxo 2: Edição)
```

### Componentes Envolvidos

- **NovoCadastroCard**: Interface de consulta
- **AlreadyExistsModal**: Modal de duplicidade
- **LemmitErrorModal**: Modal de limite excedido

### Edge Functions Utilizadas

1. `erp-check-associado`: Verificação de duplicidade
2. `lemit-consulta-pessoa`: Consulta de dados
3. `erp-endereco-cep`: Enriquecimento de endereço

### Dados Salvos no Banco

- CPF (sem máscara)
- Dados pessoais da Lemmit
- Contatos mapeados
- Endereço (com ou sem IDs do ERP)
- Titular criado automaticamente
- lemit_raw (dados brutos para auditoria)
- Status: `incompleto`

---

## ✏️ Fluxo 2: Edição e Complemento de Dados

### Objetivo
Permitir edição manual, buscar empresa, adicionar dependentes e selecionar planos.

### Etapas Detalhadas

```
┌─────────────────────────────────────────────────────────────┐
│ INÍCIO: Modal CadastroModal aberto                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. VISUALIZAÇÃO INICIAL                                    │
│    - Dados pré-preenchidos da Lemmit                       │
│    - Titular já existe na lista de dependentes            │
│    - Empresa ainda não selecionada                         │
│    - Planos vazios (aguardando seleção de empresa)        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. EDIÇÃO DE DADOS PESSOAIS                               │
│    Usuário pode editar:                                    │
│    - Nome completo                                         │
│    - Data de nascimento                                    │
│    - Sexo                                                  │
│    - Nome da mãe                                           │
│                                                              │
│    Sincronização automática:                                │
│    - Mudanças nos campos acima atualizam titular          │
│      automaticamente em useEffect                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. GESTÃO DE CONTATOS                                     │
│    Adicionar contatos:                                     │
│    - Seleciona tipo: celular, fixo, whatsapp, email      │
│    - Digita valor                                          │
│    - Clica em "Adicionar"                                 │
│    - Primeiro telefone é marcado como principal           │
│                                                              │
│    Editar contatos:                                         │
│    - Marcar/desmarcar como principal (checkbox)           │
│    - Remover contato (botão lixeira)                      │
│                                                              │
│    Validação:                                               │
│    - Não permite duplicados                                │
│    - Exige pelo menos 1 telefone                          │
│    - Exige 1 telefone marcado como principal              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. EDIÇÃO DE ENDEREÇO                                     │
│    Opção A: Editar CEP                                     │
│    - Usuário digita novo CEP (8 dígitos)                 │
│    - Sistema detecta completude                            │
│    - Consulta ERP automaticamente                         │
│    - Preenche campos automaticamente                       │
│    - Salva IDs do ERP                                     │
│                                                              │
│    Opção B: Editar manualmente                             │
│    - Logradouro                                            │
│    - Número (obrigatório)                                 │
│    - Complemento (opcional)                                │
│    - Bairro                                                │
│    - Cidade                                                │
│    - UF                                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. BUSCA DE EMPRESA CONVENIADA                           │
│    Componente: EmpresaSearchCard                          │
│                                                              │
│    Opção A: Busca por nome/CNPJ                           │
│    - Usuário digita query                                 │
│    - Clica em "Buscar"                                    │
│    - Edge Function: erp-search-empresa                    │
│    - Lista de resultados exibida                          │
│                                                              │
│    Opção B: Busca por ID                                   │
│    - Usuário digita ID numérico                           │
│    - Clica em "Buscar por ID"                             │
│    - Busca direta                                          │
│                                                              │
│    Resultado:                                               │
│    {                                                        │
│      id: 5,                                                │
│      nome: "Empresa Exemplo",                             │
│      cnpj: "12.345.678/0001-00",                          │
│      exigeMatricula: 1,                                   │
│      precoPlano: [                                        │
│        {                                                   │
│          Plano: 123,                                      │
│          ValorTitular: "100.00",                          │
│          ValorDependente: "80.00"                         │
│        }                                                   │
│      ],                                                    │
│      observacoes: "..."                                   │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. SELEÇÃO DA EMPRESA                                     │
│    - Usuário clica em "Selecionar" na empresa desejada   │
│    - Sistema salva dados da empresa no cadastro:         │
│      * empresa_id                                          │
│      * empresa_nome                                        │
│      * empresa_cnpj                                        │
│      * empresa_exige_matricula                            │
│      * empresa_raw (JSON completo)                        │
│      * planos_raw (lista de planos)                       │
│    - Planos são enriquecidos com nomes personalizados    │
│      (busca em cadastro_planos_map)                       │
│    - Planos ocultos são filtrados                         │
│    - Planos ficam disponíveis para seleção               │
│    - Se exige matrícula: campo aparece como obrigatório  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. MATRÍCULA (SE EXIGIDA)                                 │
│    SE empresa_exige_matricula === 1:                      │
│      - Campo "Matrícula" aparece                          │
│      - Marcado como obrigatório (*)                       │
│      - Usuário preenche                                    │
│      - Validado antes do envio final                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. GESTÃO DE DEPENDENTES                                  │
│    Componente: DependentesSection                          │
│                                                              │
│    Estado inicial:                                          │
│    - Titular já existe (criado automaticamente)           │
│    - Titular sincronizado com dados principais            │
│    - Plano do titular: 0 (não selecionado)               │
│                                                              │
│    Adicionar dependente:                                    │
│    - Clica em "Adicionar Dependente"                      │
│    - Formulário abre                                       │
│    - Preenche campos:                                      │
│      * Grau de parentesco (select configurável)          │
│      * Nome completo                                       │
│      * Data de nascimento                                  │
│      * CPF (obrigatório se >= 18 anos)                   │
│      * Sexo                                                │
│      * Plano (select com planos da empresa)              │
│      * Nome da mãe                                         │
│    - Clica em "Adicionar"                                 │
│    - Dependente é adicionado à lista                      │
│                                                              │
│    Validações:                                              │
│    - Somente 1 titular permitido                          │
│    - Não pode haver 2 titulares                           │
│    - CPF obrigatório para maiores de 18 anos             │
│    - Todos os campos obrigatórios preenchidos             │
│                                                              │
│    Editar dependente:                                       │
│    - Clica em botão "Editar" (ícone lápis)               │
│    - Formulário abre com dados preenchidos                │
│    - Usuário altera                                        │
│    - Clica em "Salvar"                                    │
│    - Dependente é atualizado na lista                     │
│                                                              │
│    Remover dependente:                                      │
│    - Clica em botão "Excluir" (ícone lixeira)            │
│    - Confirma exclusão                                     │
│    - Dependente é removido da lista                       │
│                                                              │
│    Seleção de planos:                                       │
│    - Planos disponíveis: lista da empresa                 │
│    - Planos ocultos: NÃO aparecem (filtrados)            │
│    - Se editando dependente com plano oculto:             │
│      plano atual continua disponível                       │
│    - Valores exibidos: Titular e Dependente               │
│    - Valor correto é salvo automaticamente                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. SALVAMENTO DO RASCUNHO                                 │
│    - Usuário clica em "Salvar"                            │
│    - Sistema valida campos mínimos                         │
│    - UPDATE cadastros SET:                                 │
│      * nome                                                 │
│      * data_nascimento                                      │
│      * sexo_codigo                                          │
│      * nome_mae                                             │
│      * numero_matricula                                     │
│      * contatos (JSONB)                                    │
│      * endereco (JSONB)                                    │
│      * dependentes (JSONB)                                 │
│      * empresa_id, empresa_nome, etc                       │
│      * arquivo_path (se arquivo foi carregado)            │
│      * updated_at = now()                                  │
│      WHERE id = cadastro.id                                │
│                                                              │
│    - Status permanece: 'incompleto'                       │
│    - Mensagem: "Cadastro salvo com sucesso!"              │
│    - Modal pode ser fechado                                │
│    - Dados não são perdidos                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 10. REABERTURA DO CADASTRO                                │
│     Usuário pode:                                           │
│     - Fechar modal                                          │
│     - Reabrir da lista "Inclusões Pendentes"              │
│     - Todos os dados aparecem salvos                       │
│     - Arquivo carregado aparece (se houver)               │
│     - Continuar edição de onde parou                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
                      CONTINUA
          (Ver Fluxo 3: Upload de Documentos)
```

### Componentes Envolvidos

- **CadastroModal**: Modal principal de edição
- **EmpresaSearchCard**: Busca de empresas
- **DependentesSection**: Gestão de dependentes
- **ObservacoesEmpresaModal**: Observações da empresa

### Edge Functions Utilizadas

1. `erp-search-empresa`: Busca de empresas
2. `erp-endereco-cep`: Consulta de CEP (se alterado)

---

## 📤 Fluxo 3: Upload de Documentos

### Objetivo
Permitir upload de arquivo com armazenamento temporário até conclusão do cadastro.

### Etapas Detalhadas

```
┌─────────────────────────────────────────────────────────────┐
│ INÍCIO: Seção de documentos no CadastroModal              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. SELEÇÃO DO ARQUIVO                                      │
│    - Usuário clica no input file                          │
│    - Seleciona arquivo do computador                       │
│    - Tipos aceitos: PDF, JPG, PNG                         │
│    - Tamanho máximo: 10MB                                  │
│                                                              │
│    Event: onChange do input file                           │
│    Handler: handleArquivoChange()                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. VALIDAÇÃO DO ARQUIVO                                    │
│    Verifica:                                                │
│    - Tipo do arquivo (extensão)                           │
│    - Tamanho do arquivo (<= 10MB)                         │
│                                                              │
│    ❌ INVÁLIDO → Exibe erro → Volta                        │
│    ✅ VÁLIDO → Continua                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. GERAÇÃO DO NOME E CAMINHO                              │
│    Nome do arquivo:                                         │
│    `{nome}_{cpf}_{timestamp}.{extensão}`                  │
│                                                              │
│    Exemplo:                                                 │
│    "JoaoSilva_12345678900_1673456789.pdf"                 │
│                                                              │
│    Caminho no Storage:                                      │
│    `cadastros/{cadastro_id}/{nome_arquivo}`               │
│                                                              │
│    Exemplo completo:                                        │
│    "cadastros/uuid-123/JoaoSilva_12345678900_1673456789.pdf" │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. UPLOAD PARA SUPABASE STORAGE                           │
│    Estado: setUploadingFile(true)                         │
│    Feedback: "Fazendo upload do arquivo..."               │
│                                                              │
│    Código:                                                  │
│    const { error } = await supabase.storage                │
│      .from('cadastros-temp-files')                         │
│      .upload(filePath, file, {                            │
│        cacheControl: '3600',                               │
│        upsert: true  // Permite substituir               │
│      });                                                    │
│                                                              │
│    ❌ ERRO → Exibe mensagem → Limpa estados → FIM         │
│    ✅ SUCESSO → Continua                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CONVERSÃO PARA BASE64                                   │
│    Para envio ao ERP posteriormente:                       │
│                                                              │
│    const reader = new FileReader();                        │
│    reader.onload = () => {                                 │
│      const base64 = reader.result as string;              │
│      const base64Puro = base64.split(',')[1];             │
│      setArquivoBase64(base64Puro);                        │
│    };                                                       │
│    reader.readAsDataURL(file);                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. ATUALIZAÇÃO DOS ESTADOS                                │
│    setArquivoBase64(base64Puro)                           │
│    setArquivoNome(nomeArquivo)                            │
│    setArquivoPath(filePath)                               │
│    setUploadingFile(false)                                │
│                                                              │
│    Feedback visual:                                         │
│    "Arquivo carregado com sucesso! Clique em 'Salvar'"   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. EXIBIÇÃO DO ARQUIVO CARREGADO                          │
│    Card verde com:                                          │
│    - Nome do arquivo                                        │
│    - Botão de remover (ícone lixeira)                     │
│                                                              │
│    SE usuário clicar em remover:                           │
│      - Deleta do Storage                                   │
│      - Limpa estados (base64, nome, path)                 │
│      - Volta ao estado inicial                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. SALVAMENTO DA REFERÊNCIA NO BANCO                      │
│    Usuário clica em "Salvar"                              │
│                                                              │
│    UPDATE cadastros SET                                     │
│      arquivo_path = 'cadastros/...',                      │
│      updated_at = now()                                    │
│    WHERE id = cadastro.id                                  │
│                                                              │
│    Arquivo permanece no Storage                            │
│    Referência salva no banco                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. RECUPERAÇÃO EM REABERTURA                              │
│    Quando usuário reabre cadastro:                         │
│                                                              │
│    useEffect(() => {                                       │
│      if (cadastro.arquivo_path) {                         │
│        // Extrai nome do arquivo                          │
│        setArquivoNome(fileName);                          │
│        setArquivoPath(cadastro.arquivo_path);             │
│                                                              │
│        // Baixa do Storage                                 │
│        supabase.storage                                    │
│          .from('cadastros-temp-files')                    │
│          .download(cadastro.arquivo_path)                 │
│          .then(({ data }) => {                            │
│            // Converte para base64 novamente              │
│            const reader = new FileReader();               │
│            reader.onload = () => {                         │
│              setArquivoBase64(base64Puro);                │
│            };                                               │
│            reader.readAsDataURL(data);                    │
│          });                                                │
│      }                                                      │
│    }, [cadastro.id]);                                     │
│                                                              │
│    Arquivo está pronto para envio ao ERP                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
                      CONTINUA
         (Ver Fluxo 4: Finalização e Envio)
```

### Estrutura do Storage

```
Supabase Storage
└── cadastros-temp-files/
    └── cadastros/
        └── {cadastro_id}/
            └── {nome}_{cpf}_{timestamp}.{ext}
```

### Bucket: cadastros-temp-files

- **Público:** Não
- **Tamanho máximo:** 10MB
- **Tipos aceitos:** PDF, JPG, PNG
- **Políticas RLS:**
  - Authenticated users podem upload
  - Authenticated users podem read
  - Authenticated users podem delete

---

## ✅ Fluxo 4: Finalização e Envio ao ERP

### Objetivo
Validar todos os dados e enviar cadastro completo ao ERP.

### Etapas Detalhadas

```
┌─────────────────────────────────────────────────────────────┐
│ INÍCIO: Usuário clica em "Cadastrar"                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. VALIDAÇÃO COMPLETA                                      │
│    ✅ Nome completo preenchido?                            │
│    ✅ Nome da mãe preenchido?                              │
│    ✅ Data de nascimento preenchida?                       │
│    ✅ Sexo selecionado?                                    │
│    ✅ External ID configurado? (CADASTRO/ADESIONISTA)     │
│    ✅ Pelo menos 1 telefone?                               │
│    ✅ 1 telefone marcado como principal?                   │
│    ✅ CEP preenchido?                                      │
│    ✅ Logradouro preenchido?                               │
│    ✅ Número preenchido?                                   │
│    ✅ Bairro preenchido?                                   │
│    ✅ Cidade preenchida?                                   │
│    ✅ UF preenchida?                                       │
│    ✅ Empresa selecionada?                                 │
│    ✅ Matrícula preenchida? (se empresa exige)            │
│    ✅ Exatamente 1 titular nos dependentes?               │
│    ✅ Todos os dependentes com plano selecionado?         │
│    ✅ Arquivo carregado? (se configurado obrigatório)     │
│                                                              │
│    ❌ ALGUMA VALIDAÇÃO FALHA →                             │
│       Exibe mensagem específica do erro                    │
│       Usuário corrige                                       │
│       FIM                                                   │
│                                                              │
│    ✅ TODAS AS VALIDAÇÕES OK → Continua                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. MONTAGEM DO PAYLOAD ERP                                │
│    Função: buildERPPayload()                               │
│                                                              │
│    Estrutura:                                               │
│    {                                                        │
│      dados: {                                               │
│        parceiro: {                                          │
│          codigo: vendedorCodigo ou funcionarioCadastroId,│
│          tipoCobranca: 1                                  │
│        },                                                   │
│        parcelaRetidaComissao: "0",                        │
│        responsavelFinanceiro: {                            │
│          codigoContrato: empresaId (código da empresa),  │
│          nome: formData.nome,                             │
│          dataNascimento: "DD/MM/YYYY",                    │
│          cpf: "###.###.###-##",                           │
│          sexo: 1 ou 0,                                    │
│          sexoDescricao: "Masculino" ou "Feminino",       │
│          grupoFaturamento: 0,                             │
│          identidadeNumero: "123456789",                   │
│          identidadeOrgaoExpeditor: "SSPDS",               │
│          Matricula: numeroMatricula (se aplicável),       │
│          endereco: {                                       │
│            cep: "60000000",                               │
│            tipoLogradouro: idTipoLogradouro ou "816",    │
│            logradouro: "...",                             │
│            numero: "123",                                 │
│            complemento: "...",                            │
│            bairro: idBairro ou "1262",                    │
│            municipio: idMunicipio ou "2",                 │
│            uf: idUf ou "5",                               │
│            descricaoUf: ufSigla ou uf                     │
│          },                                                 │
│          contatoResponsavelFinanceiro: [                   │
│            {                                               │
│              tipo: 8 (celular) / 1 (fixo) / 10 (whatsapp),│
│              dado: "85999999999"                          │
│            }                                               │
│          ],                                                 │
│          fl_AlteraSituacao: 1,                            │
│          dataApresentacao: "2024-01-01T00:00:00.000Z"     │
│        },                                                   │
│        dependente: [                                       │
│          {                                                 │
│            tipo: 1 (titular),                             │
│            nome: "...",                                   │
│            dataNascimento: "DD/MM/YYYY",                  │
│            cpf: "###.###.###-##",                         │
│            sexo: 0 ou 1,                                  │
│            sexoDescricao: "...",                          │
│            plano: 123,                                    │
│            planoValor: "100.00",                          │
│            nomeMae: "...",                                │
│            carenciaAtendimento: 1,                        │
│            funcionarioCadastro: externalId                │
│          }                                                 │
│        ]                                                    │
│      },                                                     │
│      empresa: "5" (código da empresa)                     │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. ENVIO VIA EDGE FUNCTION                                │
│    Edge Function: erp-novo-usuario2                        │
│    Endpoint ERP: POST /api/vendedor/NovoUsuario2          │
│                                                              │
│    const result = await enviarParaERP(cadastro.id, payload);│
│                                                              │
│    Edge Function:                                           │
│    - Adiciona token de autenticação                        │
│    - Adiciona headers                                       │
│    - Faz POST para API do ERP                             │
│    - Registra log (api_logs)                              │
│    - Retorna response                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. ANÁLISE DA RESPOSTA DO ERP                             │
│    Validação de sucesso especial:                          │
│    - Verifica se existe `dados.codigo` no response        │
│    - Ignora status HTTP (pode ser 400 e ter sucesso)     │
│                                                              │
│    ❌ ERRO (sem dados.codigo) →                            │
│       SE erro.codigo === 3:                                │
│         - Dependente já está ativo                        │
│         - Exibe DependenteAtivoModal                      │
│         - Lista dependentes ativos                         │
│       SENÃO:                                                │
│         - Exibe mensagem de erro genérica                 │
│       FIM                                                   │
│                                                              │
│    ✅ SUCESSO (com dados.codigo) → Continua                │
│                                                              │
│    Response esperado:                                       │
│    {                                                        │
│      dados: {                                               │
│        codigo: 311193412,                                 │
│        boletoId: 6277862,                                 │
│        boletoURL: "http://...",                           │
│        dependentes: [                                      │
│          {                                                 │
│            codigo: "311444312",                           │
│            contrato: ""                                   │
│          }                                                 │
│        ]                                                    │
│      },                                                     │
│      codigo: 1,                                            │
│      mensagem: null                                        │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. ATUALIZAÇÃO DO CADASTRO NO BANCO                       │
│    UPDATE cadastros SET                                     │
│      status = 'enviado',                                  │
│      erp_response = response (JSONB),                     │
│      updated_at = now()                                    │
│    WHERE id = cadastro.id                                  │
│                                                              │
│    Dados salvos:                                            │
│    - Código gerado pelo ERP                                │
│    - ID do boleto                                          │
│    - URL do boleto                                         │
│    - Códigos dos dependentes                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. UPLOAD DE DOCUMENTO PARA ERP (SE HOUVER)              │
│    IF arquivoBase64 && dados.dependentes[0].codigo:       │
│                                                              │
│      Edge Function: erp-upload-documento                   │
│      Endpoint ERP: POST /api/associado/DocumentoDependente │
│                                                              │
│      Payload:                                               │
│      {                                                      │
│        idFuncionario: funcionarioCadastroId,              │
│        idDependente: dados.dependentes[0].codigo,         │
│        arquivo: arquivoBase64,                            │
│        arquivoNome: arquivoNome                           │
│      }                                                      │
│                                                              │
│      TRY:                                                   │
│        const uploadResponse = await fetch(...)            │
│        const uploadResult = await uploadResponse.json()   │
│                                                              │
│        ❌ ERRO →                                            │
│           Exibe: "Cadastro criado, mas erro ao enviar     │
│           arquivo: {erro}"                                 │
│           Arquivo permanece no Storage                     │
│           return (para não continuar)                      │
│                                                              │
│        ✅ SUCESSO → Continua                               │
│                                                              │
│      CATCH:                                                 │
│        Similar ao erro acima                               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. LIMPEZA DO ARQUIVO DO STORAGE                          │
│    IF arquivoPath:                                         │
│      TRY:                                                   │
│        // Deleta do Storage                                │
│        await supabase.storage                              │
│          .from('cadastros-temp-files')                    │
│          .remove([arquivoPath]);                          │
│                                                              │
│        // Limpa referência no banco                        │
│        await updateCadastro(cadastro.id, {                │
│          arquivo_path: null                                │
│        });                                                  │
│                                                              │
│        console.log('Arquivo deletado com sucesso');       │
│                                                              │
│      CATCH:                                                 │
│        console.error('Erro ao limpar arquivo');           │
│        // Não bloqueia o fluxo                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. FEEDBACK FINAL                                          │
│    setSuccess('Cadastro enviado com sucesso para o ERP!');│
│    setTimeout(() => {                                      │
│      onSuccess();  // Atualiza lista                      │
│      onClose();    // Fecha modal                         │
│    }, 2000);                                                │
│                                                              │
│    Cadastro:                                                │
│    - Removido da lista "Inclusões Pendentes"              │
│    - Aparece na lista "Completos"                         │
│    - Arquivo deletado do Storage                           │
│    - Recursos liberados                                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
                         FIM
                  (Fluxo completo)
```

### Componentes Envolvidos

- **CadastroModal**: Orquestra todo o fluxo
- **DependenteAtivoModal**: Exibe dependentes já ativos (erro)

### Edge Functions Utilizadas

1. `erp-novo-usuario2`: Cadastro principal
2. `erp-upload-documento`: Upload de documento

### Dados Salvos no Banco

- `status`: `enviado`
- `erp_response`: Response completo do ERP
- `arquivo_path`: `null` (arquivo deletado)
- `updated_at`: timestamp atual

---

## ❌ Fluxo 5: Tratamento de Erros

### Erros Possíveis e Tratamento

#### 1. CPF Inválido

```
┌──────────────────────────────────┐
│ CPF digitado incorretamente     │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ Validação local detecta         │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ Exibe: "CPF inválido"           │
│ Permite nova tentativa          │
└──────────────────────────────────┘
```

#### 2. CPF Duplicado no ERP

```
┌──────────────────────────────────┐
│ CPF já existe no ERP            │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ erp-check-associado retorna     │
│ exists: true                     │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ Abre AlreadyExistsModal         │
│ Exibe dados do cadastro         │
│ BLOQUEIA continuação            │
└──────────────────────────────────┘
```

#### 3. Limite Lemmit Excedido

```
┌──────────────────────────────────┐
│ Limite diário ou mensal atingido│
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ lemit-consulta-pessoa retorna   │
│ erro de limite                   │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ Abre LemmitErrorModal           │
│ Mostra uso atual e limites      │
│ Informa quando resetará         │
└──────────────────────────────────┘
```

#### 4. Erro ao Enviar para ERP

```
┌────────────────────────────────���─┐
│ ERP retorna erro                │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ SE codigo === 3:                │
│   Dependente já ativo           │
│   Abre DependenteAtivoModal     │
│ SENÃO:                           │
│   Exibe mensagem de erro        │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ status = 'erro_envio'           │
│ Salva mensagem de erro          │
│ Cadastro fica na lista          │
│ Arquivo NÃO é deletado          │
└──────────────────────────────────┘
```

#### 5. Erro ao Enviar Arquivo

```
┌──────────────────────────────────┐
│ Cadastro OK, mas erro no arquivo│
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ Exibe: "Cadastro criado,        │
│ mas erro ao enviar arquivo"     │
└──────────────────────────────────┘
            ↓
┌──────────────────────────────────┐
│ status = 'enviado'              │
│ Arquivo permanece no Storage    │
│ Pode tentar enviar manualmente  │
└──────────────────────────────────┘
```

---

## 📊 Diagramas de Sequência

### Diagrama Completo Simplificado

```
Usuário  →  Frontend  →  Edge Functions  →  APIs Externas  →  Banco
   │            │              │                  │              │
   │  digita CPF│              │                  │              │
   │───────────>│              │                  │              │
   │            │ check-assoc. │                  │              │
   │            │─────────────>│  ERP /associados │              │
   │            │              │─────────────────>│              │
   │            │              │<─────────────────│              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │            │ consulta-cpf │                  │              │
   │            │─────────────>│  Lemmit API      │              │
   │            │              │─────────────────>│              │
   │            │              │<─────────────────│              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │            │ salva dados  │                  │              │
   │            │─────────────────────────────────────────────────>│
   │            │              │                  │              │
   │ edita dados│              │                  │              │
   │───────────>│              │                  │              │
   │            │ search-empresa│                 │              │
   │            │─────────────>│  ERP /empresas   │              │
   │            │              │─────────────────>│              │
   │            │              │<─────────────────│              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │upload arq. │              │                  │              │
   │───────────>│  Storage     │                  │              │
   │            │─────────────>│                  │              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │clica Salvar│              │                  │              │
   │───────────>│ atualiza     │                  │              │
   │            │─────────────────────────────────────────────────>│
   │            │              │                  │              │
   │clica Enviar│              │                  │              │
   │───────────>│ novo-usuario2│                  │              │
   │            │─────────────>│  ERP /NovoUsuario2│              │
   │            │              │─────────────────>│              │
   │            │              │<─────────────────│              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │            │ upload-doc   │                  │              │
   │            │─────────────>│  ERP /DocumentoDep│              │
   │            │              │─────────────────>│              │
   │            │              │<─────────────────│              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │            │ delete arquivo│                 │              │
   │            │─────────────>│  Storage         │              │
   │            │<─────────────│                  │              │
   │            │              │                  │              │
   │            │ atualiza status│                │              │
   │            │─────────────────────────────────────────────────>│
   │            │              │                  │              │
   │<───────────│ Sucesso!     │                  │              │
   │            │              │                  │              │
```

---

## 🔄 Estados e Transições

### Estados do Cadastro

```
┌────────────┐
│   INÍCIO   │
└─────┬──────┘
      │ (consulta CPF)
      ↓
┌────────────┐
│ incompleto │ ←──┐
└─────┬──────┘    │
      │           │ (edita e salva)
      │ (clica    │
      │ Cadastrar)│
      ↓           │
┌────────────┐    │
│  enviando  │────┘ (erro)
└─────┬──────┘
      │
      ↓
┌────────────┐
│  enviado   │
└────────────┘
```

### Estados do Arquivo

```
┌────────────┐
│  SEM ARQUIVO│
└─────┬──────┘
      │ (usuário seleciona)
      ↓
┌────────────┐
│ UPLOADING  │
└─────┬──────┘
      │ (sucesso)
      ↓
┌────────────┐
│ NO STORAGE │ ←──┐
└─────┬──────┘    │
      │           │ (salva rascunho)
      │ (cadastra)│
      ↓           │
┌────────────┐    │
│ ENVIANDO   │────┘ (erro)
└─────┬──────┘
      │ (sucesso)
      ↓
┌────────────┐
│  DELETADO  │
└────────────┘
```

---

## 📝 Resumo dos Fluxos

| Fluxo | Início | Fim | Duração Típica |
|-------|--------|-----|----------------|
| 1. Consulta CPF | Digita CPF | Modal aberto | 5-10 segundos |
| 2. Edição | Modal aberto | Clica Salvar | 5-15 minutos |
| 3. Upload | Seleciona arquivo | Arquivo no Storage | 2-5 segundos |
| 4. Envio | Clica Cadastrar | Status enviado | 5-10 segundos |
| 5. Limpeza | Envio bem-sucedido | Arquivo deletado | 1-2 segundos |

---

## ✅ Checklist de Implementação

- [x] Validação de CPF
- [x] Verificação de duplicidade
- [x] Consulta Lemmit
- [x] Consulta de endereço
- [x] Busca de empresas
- [x] Gestão de dependentes
- [x] Upload de arquivos
- [x] Salvamento de rascunhos
- [x] Validação completa
- [x] Envio ao ERP
- [x] Upload de documento
- [x] Limpeza de recursos
- [x] Tratamento de erros
- [x] Feedback visual
- [x] Logs de API

---

**Versão:** 2.0
**Última atualização:** Janeiro 2026
