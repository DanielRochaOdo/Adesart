# Contrato canônico — Cadastro

Este documento descreve as regras compartilhadas entre Web e Android.

## Fonte de verdade

- Histórico local do Adesart pode ser usado para continuidade de rascunhos e preenchimento auxiliar.
- Histórico local concluído não determina sozinho a situação atual do beneficiário.
- Situação atual e elegibilidade dependentes do ERP devem ser resolvidas pelo backend canônico.
- O Android não pode criar uma interpretação própria de respostas do ERP.

## Cadastro pendente

Os status locais considerados pendentes são:

- `incompleto`
- `adesoes_pendentes`

Web e Android devem usar a mesma classificação.

## Dependente ativo

O cliente Android não pode transformar uma mensagem textual como
"já cadastrado e ativo no contrato" em estado de negócio por conta própria.

Qualquer indicação de dependente ativo deve vir de uma decisão estruturada do
backend canônico baseada nos dados atuais do ERP.

## Envio ao ERP e anexos

A criação da adesão no ERP e a entrega de documentos são eventos distintos.

Uma falha de entrega de documento não autoriza o cliente a concluir que a adesão
não foi criada nem a reenviar automaticamente a criação sem reconciliação.

## Paridade

Quando Web e Android precisarem de uma mesma decisão de negócio, a preferência é:

1. implementar a decisão uma única vez no backend canônico;
2. retornar resposta estruturada;
3. Web e Android apenas renderizam a decisão.

Regras duplicadas nos clientes devem ser evitadas.
