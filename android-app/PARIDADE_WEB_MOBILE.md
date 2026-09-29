# Paridade Web / Android

## Regra principal

O Web do repositório `Tecnologia-odonto/Adesart` é a referência funcional do produto.

O Android não mantém uma segunda versão das regras de negócio. Ele deve consumir o
mesmo backend Supabase e reproduzir o comportamento funcional definido pelo Web.

## Fonte única

- Web: `src/`
- Android: `android-app/`
- Edge Functions: `supabase/functions/`
- Migrations: `supabase/migrations/`
- Contratos funcionais: `contracts/business-rules/`

Não existe `supabase/` próprio do Android.

## O que pode ser diferente

A apresentação nativa pode ser diferente quando necessário para Android:

- navegação;
- componentes visuais;
- permissões do sistema;
- câmera/arquivos;
- ciclo de vida do app;
- armazenamento temporário local.

Essas diferenças não podem mudar a decisão de negócio.

## O que deve ser idêntico

- elegibilidade de CPF;
- continuidade de cadastro pendente;
- regras de empresa e planos;
- vendedor e adesionista;
- validações de envio;
- situação retornada pelo ERP;
- criação/reconciliação de adesão;
- upload/fila de documentos;
- permissões por perfil.

Quando uma decisão depende do ERP, a preferência é movê-la para o backend canônico
e fazer Web e Android consumirem a resposta estruturada.

## Regra para divergências históricas

Código trazido do antigo repositório Mobile não tem precedência sobre o Web.
Uma regra existente apenas no Mobile deve ser removida ou substituída pela regra
canônica antes de ser considerada parte definitiva do produto.

Exemplo já corrigido nesta consolidação: o Android não transforma mais uma frase de
erro contendo "já cadastrado e ativo" em estado `DependenteAtivo` por conta própria.

## CI

O workflow `Verificar paridade Android` impede:
- backend duplicado dentro de `android-app/`;
- retorno da antiga inferência textual de dependente ativo;
- uso de Edge Function inexistente no backend canônico;
- divergência dos status locais de cadastro pendente.

A paridade funcional deve ser ampliada com testes sempre que uma regra compartilhada
for alterada.
