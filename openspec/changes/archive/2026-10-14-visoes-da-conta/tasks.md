## 1. Domínio e banco

- [x] 1.1 Escrever primeiro os testes e depois as regras das mudanças da conta no domínio (design, decisões 1 e 3): a definição com os limites da visão, a composição do endereço, das mudanças e da visão, e o estado "Personalizada" ou "Do link". Verificar: os testes do domínio passam.
- [x] 1.2 Escrever primeiro o teste de integração e depois a migration com a tabela `mudancas_das_visoes`, com o isolamento, a chave única e a cascata da visão removida. Verificar: `pnpm --filter @grafite/db test:integration` passa, com o teste-guarda do isolamento.

## 2. API

Cada tarefa entra com os esquemas e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 2.1 Escrever primeiro os testes de integração e depois `GET /visoes` com as mudanças, `PUT` e `DELETE /visoes/mudancas`, com o evento para a conta dona e as recusas da visão que a conta não usa (decisão 2). Verificar: os testes de integração passam, e nenhuma mudança da conta vai à auditoria.
- [x] 2.2 Escrever primeiro os testes de integração e depois a publicação na visão da organização, com a permissão, a auditoria e as mudanças apagadas, e a anonimização que apaga as mudanças da conta. Verificar: os testes de integração passam.

## 3. Web

- [x] 3.1 Escrever primeiro os testes e depois o estado da tabela com as três camadas e a gravação com espera e na saída da página (decisão 3). Verificar: os testes da web passam com os cenários da spec visoes-de-tabela.
- [x] 3.2 Escrever primeiro as histórias e os testes e depois a escolha da visão com "Personalizada", "Do link", "Duplicar…", "Restaurar a visão" e "Salvar na visão da organização", e a linha de estado sob a barra (decisão 4). Verificar: `pnpm test:stories` e os testes da web passam.
- [x] 3.3 Escrever primeiro os testes e depois a atualização pelas outras sessões e o aviso da visão mudada pela organização (decisão 5), e "Restaurar as minhas mudanças nas tabelas" em Ajustes › Tabelas (decisão 6). Verificar: os testes da web passam.

## 4. Ponta a ponta

- [x] 4.1 A ponta a ponta simulada (a coluna mostrada continua ao voltar pelo dock, e o link mostra "Do link") e a da pilha (a personalização chega à outra sessão da conta e volta noutro navegador). As referências visuais da barra da tabela são regravadas. Verificar: `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` passam.

## 5. Fechamento

- [x] 5.1 O contrato de módulo, na seção da tabela configurável, e o mapa. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes, `contrato:verificar` em dia, e `openspec validate visoes-da-conta --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
