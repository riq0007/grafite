## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois as escolhas do e-mail e do push nas preferências (design, decisão 4): `emailCritico`, `resumo` (`desligado` ou `diario`), `pushCritico`, `pushAtencao` e `pushInformacao`, com os padrões de fábrica e a validação campo a campo. Verificar: os testes do domínio passam com os cenários "Resumo inválido" e os padrões de fábrica.
- [x] 1.2 Escrever primeiro os testes e depois a decisão dos canais de cada notificação (decisão 4): o e-mail na hora, o push com as severidades e o Foco, e o que entra no resumo. Verificar: os testes do domínio passam com os cenários "Pessoa sem e-mail", "E-mail do crítico desligado", "Atenção não vai na hora", "Atenção fora das escolhas" e "Foco no celular".
- [x] 1.3 Escrever primeiro os testes e depois o texto do e-mail do crítico, do resumo e do teste, e o conteúdo do push (decisões 6 e 7): o assunto, o corpo, o endereço do registro na origem da organização, as 50 mais novas do resumo com quantas mais há, e o título com a severidade. Verificar: os testes do domínio passam com os assuntos "Crítico: <título>" e "Resumo do Grafite: N notificações não lidas".
- [x] 1.4 Escrever primeiro os testes e depois as regras do formato do SMTP, do remetente e das chaves do push (decisão 10): `smtp://` e `smtps://` com o servidor, o remetente com nome e e-mail, as chaves em base64url com o tamanho de um par da curva P-256 e o contato `mailto:` ou `https://`. O par em si, que pede a conta da curva, a API confere na configuração (tarefa 3.1). Verificar: os testes do domínio passam com cada formato recusado e o motivo dele.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration (decisões 3 e 8): `email_em` e `push_em` nas notificações e a tabela `inscricoes_de_push`, com o RLS forçado, o endereço único, as checagens e a conta pela chave estrangeira. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro os testes e depois a configuração do SMTP, do remetente, das chaves do push, da origem dos links e dos serviços de push extras (decisões 8 e 10), inteira ou nada, com os canais desligados no ambiente de teste e o aviso no log da partida. Verificar: os testes da configuração passam com os cenários "SMTP sem remetente", "Chave do push que não forma par", com uma chave pública de outro par recusada, e "Sem e-mail e sem push", sem a senha nem a chave privada nas mensagens.
- [x] 3.2 Escrever primeiro o teste de integração e depois o carteiro do e-mail e o entregador do push (decisão 1), com o servidor SMTP em processo e o serviço de push falso que decifra o conteúdo; o cabeçalho `Auto-Submitted`; a inscrição que não existe mais, pelas respostas 404 e 410; e o endereço fora dos serviços de push conhecidos, que o entregador não chama. Verificar: os testes de integração passam, e o conteúdo decifrado é o que o domínio montou.
- [x] 3.3 Escrever primeiro o teste de integração e depois as rotas dos canais da conta e dos aparelhos (decisão 8): `GET /conta/canais` com a situação de cada canal, `POST /conta/push` que troca a inscrição de mesmo endereço e recusa o endereço fora dos serviços de push, `DELETE /conta/push/{id}` com o 404 para o aparelho de outra conta, e a inativação da conta que apaga as inscrições dela. Verificar: os testes de integração passam com os cenários "Inscrever o celular", "Tirar um aparelho", "Aparelho de outra conta" e "Endereço fora dos serviços de push".
- [x] 3.4 Escrever primeiro o teste de integração e depois a entrega pela fila (decisões 2 e 3): o `notificar` com a fila, a `entregar-notificacoes`, a `enviar-email` e a `enviar-push`, com as chaves únicas, as marcas e as novas tentativas. Verificar: os testes de integração passam com os cenários "Alerta crítico com e-mail", "Dois aparelhos", "Aparelho que deixou de existir" e "Servidor de e-mail fora do ar", e uma nova tentativa não manda de novo.
- [x] 3.5 Escrever primeiro o teste de integração e depois o resumo diário (decisão 5): a `resumos-por-email` agendada às 8h, a `enviar-resumos` por organização e a `enviar-resumo` por conta, com as marcas. Verificar: os testes de integração passam com os cenários "Resumo com Atenção e Informação", "Nada para resumir", "Lida antes do resumo", "Crítico já enviado" e "Resumo desligado".
- [x] 3.6 Escrever primeiro o teste de integração e depois o teste dos canais (decisão 9): o e-mail e o aviso de teste, sem notificação gravada, a recusa do SMTP com o código de rastreio e o 429 antes de 30 s. Verificar: os testes de integração passam com os cenários "E-mail de teste", "Servidor de e-mail recusa" e "Aviso de teste".
- [x] 3.7 Escrever primeiro o teste de integração e depois o comando `grafite email testar` da API (decisão 10), que manda o e-mail de teste pela configuração e diz a recusa do SMTP sem a senha. Verificar: os testes de integração do comando passam com o cenário "Teste do envio pelo comando".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o `sw-avisos.js` do service worker (decisão 7), pelo `importScripts` do Workbox: o push mostrado com o ícone e a etiqueta, e o toque que foca a janela aberta ou abre uma nova no endereço. Verificar: os testes do `sw-avisos.js` passam num escopo de service worker falso, e o `vite build` gera o service worker com a importação.
- [x] 4.2 Escrever primeiro os testes e depois a inscrição do aparelho (decisão 8): o suporte do navegador, o iPhone fora do Grafite instalado, a permissão, a inscrição com a chave pública, o nome do aparelho e "Este aparelho". Verificar: os testes da web passam com um `PushManager` falso, com os cenários "Inscrever o celular" e "Avisos bloqueados".
- [x] 4.3 Escrever primeiro os testes e depois os grupos "Por e-mail" e "No celular" na seção Notificações dos Ajustes, com a busca dos Ajustes: o e-mail da pessoa, o crítico na hora, o resumo, os testes, as severidades do push, os aparelhos com "Tirar" e cada motivo em texto. Verificar: os testes da web passam com os cenários "E-mail da pessoa", "Pessoa sem e-mail", "Receber neste aparelho", "Servidor sem SMTP" e "Ambiente de teste".

## 5. Operação e desenvolvimento

- [x] 5.1 Escrever primeiro os testes e depois as chaves do push na instalação da produção e na atualização de uma produção de antes (decisão 10), sem nada na configuração do teste. Verificar: os testes do comando de operação passam com os cenários "Push depois da instalação" e "Instalação de antes do push".
- [x] 5.2 Escrever primeiro os testes e depois `.\grafite.ps1 email configurar` e `.\grafite.ps1 email testar` (decisão 10), com a conferência do formato antes de gravar, o acesso restrito, o reinício com a saúde e a senha fora da tela. Verificar: os testes do comando de operação passam com os cenários "E-mail configurado", "Teste do envio pelo comando" e "Remetente fora do formato".
- [x] 5.3 Escrever primeiro os testes e depois o desenvolvimento com o Mailpit (decisão 11): o serviço no `compose.yaml` e o `.env` completado com o SMTP, o remetente, a origem dos links e as chaves do push, geradas uma vez. Verificar: os testes do `scripts/dev.ts` passam, e o `pnpm dev` mostra o e-mail de teste dos Ajustes no Mailpit.

## 6. Ponta a ponta

- [x] 6.1 A ponta a ponta com a API simulada: a seção Notificações com o e-mail da pessoa e o teste, a pessoa sem e-mail, o servidor sem os canais, e o aparelho inscrito com um `PushManager` simulado, listado como "Este aparelho" e tirado. Verificar: `pnpm test:e2e` passa.
- [x] 6.2 A ponta a ponta da pilha: a administradora, com o e-mail dela desde a criação da organização, vê esse e-mail nos Ajustes, inscreve o navegador com a inscrição simulada que aponta para o serviço de push falso, e o alerta do toner faz chegar o e-mail "Crítico: Black Toner Cartridge em 8%" ao servidor SMTP do teste e o push decifrado ao serviço falso. Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Atualizar a documentação:
  - a spec mestre: os canais (seção 6.5) e a configuração do e-mail e do push;
  - o runbook, com o SMTP, o teste do envio, as chaves do push e os serviços de push que o firewall libera;
  - o mapa (`docs/mapa.md`);
  - o contrato de módulo (`docs/casca/modulos.md`), com os canais que a notificação ganha sem mudança no módulo;
  - o `CLAUDE.md`, com o Mailpit no `pnpm dev` e o comando do e-mail.

  Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
- [x] 7.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p3c-email-e-push --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
