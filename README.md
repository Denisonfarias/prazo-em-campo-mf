# Prazo em Campo

Acompanhamento dos serviços de campo. Você anexa o Excel ou o CSV, o painel colore o **Prazo ANS legal** conforme a hora atual e, na última hora, dispara um WhatsApp para o responsável da equipe e para o seu número.

## Como rodar

```bash
npm install
npm run dev
```

Abra [http://127.0.0.1:4317](http://127.0.0.1:4317). O servidor precisa continuar ligado: a varredura dos prazos roda a cada 30 segundos dentro dele.

```bash
npm test
npm run lint
```

## Planilha de serviços

Anexe um `.xlsx` ou `.csv` exportado do sistema. As colunas usadas são:

- Código TdC
- Chefe/Responsável de Equipe
- Endereço Completo
- Prazo ANS legal
- Nome e Sobrenome Cliente
- Latitude e Longitude, quando existirem, para o link da rota

Um arquivo novo substitui a lista anterior. O mesmo serviço não recebe o aviso duas vezes.

## Telefones

Os números vêm desta planilha do Google, relida automaticamente:

https://docs.google.com/spreadsheets/d/1hbC22pvcUOSiu8e7zhu0e0H852RnOEt8sD6be-YGyfM/edit

Colunas: `Nome`, `Telefone`, `mais_informacoes`.

- No seu número, escreva `meu numero` em `mais_informacoes`. Esse telefone recebe todos os avisos.
- Para cada responsável, o `Nome` precisa ser o mesmo da coluna Chefe/Responsável de Equipe do arquivo de serviços. Acentos e maiúsculas não importam.

A planilha precisa estar compartilhada como qualquer pessoa com o link pode ver.

## WhatsApp

Sem uma API configurada, o sistema prepara a mensagem e mostra no painel, mas não envia. Em **WhatsApp**, escolha uma opção:

- **Cloud API da Meta:** token de acesso e ID do número.
- **Webhook:** URL que recebe `POST` com `{ "phone", "number", "message", "text" }`. Serve para Z-API (`.../send-text`), Evolution e n8n. Se a Z-API pedir Client-Token, cole esse token no campo.

Também dá para definir as variáveis do arquivo `.env.example` em vez de usar o painel. Há um botão para mandar uma mensagem de teste só para o seu número.

A mensagem leva o aviso de que falta cerca de uma hora, o nome do cliente, o código do TdC, o responsável, o endereço, o prazo e o link da rota no Google Maps.

## Cores do prazo

Vermelho escuro é prazo vencido. Vermelho é menos de 1 hora, que é quando o WhatsApp sai. Laranja é até 3 horas, âmbar até 8, verde-limão até 24 e verde depois disso.
