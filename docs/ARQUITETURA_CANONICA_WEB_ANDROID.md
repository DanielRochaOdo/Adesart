# Arquitetura canônica Web + Android

O repositório **Tecnologia-odonto/Adesart** é a única fonte oficial do produto Adesart.

O aplicativo Android vive em `android-app/` dentro do mesmo repositório. O antigo
`DanielRochaOdo/vendamais-mobile` deixa de ser fonte de regras, migrations, Edge Functions
ou evolução funcional.

## Hierarquia de autoridade

1. Regras Web/Backend canônicas deste repositório.
2. Supabase deste repositório: `supabase/functions` e `supabase/migrations`.
3. Clientes: Web em `src/` e Android em `android-app/`.

O Android é um cliente nativo do mesmo sistema. Ele não pode criar uma regra de negócio
alternativa quando a regra já existe no Web/Backend.

## Divergências

Ao encontrar comportamento diferente entre Web e Android:

1. a regra do Web/Backend é considerada correta por padrão;
2. a regra Android divergente deve ser removida;
3. melhorias técnicas do Android só podem ser aproveitadas se não alterarem a regra;
4. a alteração deve incluir teste de regressão/paridade.

## Backend único

Existe somente uma árvore válida de backend:

```
supabase/
├── functions/
└── migrations/
```

Não é permitido manter uma segunda versão de migrations ou Edge Functions dentro do Android.

## Caso Dependente ativo

O Android não pode inferir a situação cadastral apenas por uma frase de erro do ERP.
A antiga inferência textual foi removida nesta consolidação. Decisões de situação ERP
devem vir da regra canônica do backend/Web.

## Processo de mudança

```
regra canônica / backend
        ↓
Web
        ↓
Android
        ↓
testes de paridade
```

Quando a regra puder ser resolvida totalmente no backend, Web e Android devem apenas
consumir a decisão estruturada retornada pelo servidor.
