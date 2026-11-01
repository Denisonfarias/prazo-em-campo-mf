# Prazo em Campo

Acompanhamento dos serviços de campo. Você anexa o Excel ou o CSV, a lista mostra cada serviço e o painel colore o **Prazo ANS legal** do que ainda está em aberto. O botão abre o WhatsApp do responsável com a mensagem pronta.

A lista de serviços fica salva neste navegador. Os telefones são lidos da planilha do Google.

## Colocar no ar pelo GitHub

O GitHub não descompacta um zip enviado por **Add file**. Extraia a pasta primeiro.

1. Baixe `prazo_em_campo_github.zip` nesta conversa.
2. Clique com o botão direito no arquivo e escolha **Extrair**.
3. Em [github.com/new](https://github.com/new), crie um repositório vazio. Não marque a opção de criar README.
4. No seu computador, abra o terminal dentro da pasta extraída e envie os arquivos. Troque o endereço pelo do repositório que você criou:

```bash
git init
git add .
git commit -m "Prazo em campo"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/prazo-em-campo.git
git push -u origin main
```

5. Em [vercel.com/new](https://vercel.com/new), importe esse repositório.
6. Deixe o framework como Next.js e clique em **Deploy**.

O endereço público aparece no fim do deploy. Abra esse endereço, anexe a planilha de serviços e use **Avisar no WhatsApp**. O link de visualização desta conversa não substitui esse endereço: nele os botões do navegador podem não responder.

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

Um arquivo novo atualiza a fila. Serviço marcado como **feito** continua feito, mesmo que o código saia do arquivo. Serviço em aberto que não está no arquivo novo sai da lista.

## Feito

**Feito** é a confirmação de que o responsável já realizou o serviço. Ele sai das contagens de em aberto, vencido e das horas que faltam. **Desfazer feito** devolve o serviço para em aberto. A lista inteira continua no filtro **Todos**.

## Telefones

Os números vêm desta planilha do Google, relida automaticamente:

https://docs.google.com/spreadsheets/d/1hbC22pvcUOSiu8e7zhu0e0H852RnOEt8sD6be-YGyfM/edit

Colunas: `Nome`, `Telefone`, `mais_informacoes`.

- Para cada responsável, o `Nome` precisa ser o mesmo da coluna Chefe/Responsável de Equipe do arquivo de serviços. Acentos e maiúsculas não importam. É nesse telefone que o botão abre a conversa.
- A linha com `meu numero` em `mais_informacoes` identifica o seu telefone no painel.

A planilha precisa estar compartilhada como qualquer pessoa com o link pode ver.

## WhatsApp

Em cada serviço, **Avisar no WhatsApp** abre o WhatsApp (celular ou WhatsApp Web) na conversa do responsável, com a mensagem já escrita. Você só confirma o envio. Não precisa de API nem de plano pago.

A mensagem leva o aviso de prazo, o código do TdC, o responsável, o endereço, o prazo e o link da rota no Google Maps.

O envio automático continua disponível, se um dia quiser ligar uma API. Em **WhatsApp** no topo da tela:

- **Cloud API da Meta:** token de acesso e ID do número.
- **Webhook:** URL que recebe `POST` com `{ "phone", "number", "message", "text" }`. Serve para Z-API, Evolution e n8n.

As mesmas credenciais podem ir nas variáveis do arquivo `.env.example`.

## Cores do prazo

Preto é prazo vencido. Vermelho é a última hora, laranja é de 1 a 2 horas e amarelo é de 2 a 3 horas. Âmbar é até 8 horas, verde-limão até 24 e verde depois disso. Feito, no painel, é verde. Em aberto é azul.
