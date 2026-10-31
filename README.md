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

- Para cada responsável, o `Nome` precisa ser o mesmo da coluna Chefe/Responsável de Equipe do arquivo de serviços. Acentos e maiúsculas não importam. É nesse telefone que o botão abre a conversa.
- A linha com `meu numero` em `mais_informacoes` identifica o seu telefone no painel.

A planilha precisa estar compartilhada como qualquer pessoa com o link pode ver.

## WhatsApp

Em cada serviço, **Avisar no WhatsApp** abre o WhatsApp (celular ou WhatsApp Web) na conversa do responsável, com a mensagem já escrita. Você só confirma o envio. Não precisa de API nem de plano pago.

A mensagem leva o aviso de prazo, o nome do cliente, o código do TdC, o responsável, o endereço, o prazo e o link da rota no Google Maps.

O envio automático continua disponível, se um dia quiser ligar uma API. Em **WhatsApp** no topo da tela:

- **Cloud API da Meta:** token de acesso e ID do número.
- **Webhook:** URL que recebe `POST` com `{ "phone", "number", "message", "text" }`. Serve para Z-API, Evolution e n8n.

As mesmas credenciais podem ir nas variáveis do arquivo `.env.example`.

## Cores do prazo

Vermelho escuro é prazo vencido. Vermelho é menos de 1 hora, a hora de abrir o WhatsApp e enviar. Laranja é até 3 horas, âmbar até 8, verde-limão até 24 e verde depois disso.
