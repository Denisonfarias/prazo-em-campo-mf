# Prazo em Campo

Acompanhamento dos serviços de campo. Você anexa o Excel ou o CSV, a lista mostra cada serviço e o painel colore o **Prazo ANS legal** do que ainda está em aberto. O botão abre o WhatsApp do responsável com a mensagem pronta.

A lista de serviços fica salva neste navegador. Os telefones são lidos da planilha do Google.

## Colocar no ar pelo GitHub

1. Crie um repositório vazio no GitHub.
2. Envie o arquivo `prazo-em-campo.zip` (em **Add file → Upload files**) e confirme.
3. Em [vercel.com/new](https://vercel.com/new), importe esse repositório.
4. Deixe o framework como Next.js e clique em **Deploy**.

O endereço público aparece no fim do deploy. Abra esse endereço, anexe a planilha de serviços e use **Avisar no WhatsApp**.

## Como rodar neste computador

```bash
npm install
npm run dev
```

Abra [http://127.0.0.1:4317](http://127.0.0.1:4317).

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

Um arquivo novo atualiza a fila. Serviço marcado como **feito** que ainda aparece no arquivo continua feito. Se o código não vier mais, ele passa para **concluído**. Serviço em aberto que não está no arquivo novo sai da lista.

## Feito e concluído

O painel separa duas confirmações:

1. **Feito** — você marcou depois que o responsável respondeu que o serviço já foi feito. Ele sai das contagens de em aberto, vencidos e menos de 1 hora.
2. **Concluído** — um arquivo seguinte não trouxe mais aquele Código TdC, então o sistema já atualizou.

**Desfazer feito** devolve o serviço para em aberto, enquanto ele ainda estiver no arquivo. A lista inteira continua disponível no filtro **Todos**.

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
