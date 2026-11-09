## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois, no domínio (design, decisões 1, 4, 6 e 9):
  - a capacidade `controlid.backup` no catálogo e a conferência dela em `capacidadesPedidas`;
  - as categorias do backup, com os rótulos, e o `resultadoDoBackup`;
  - a retenção `backupsQueSaem`;
  - as permissões `controlid.ver` e `controlid.backup`, as ações da auditoria e o evento `controlid.mudaram`.

  Verificar: os testes do domínio passam com os cenários "Backup ligado no tipo", "Sem a saúde do Control iD", "Biometria que falha", "Oitavo dia", "Dois backups no mesmo dia" e "Quem só vê".

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration 0041 (decisão 2): os backups do Control iD, com as checagens, o índice único do pedido aberto e o RLS forçado. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS.

## 3. API

- [x] 3.1 Escrever primeiro o teste de integração e depois o pedido manual, o de todos e a agenda com a expiração (decisões 2 e 5). Verificar: os testes de integração passam com os cenários:
  - "Backup pedido pela ficha", "Pedido repetido" e "Agenda depois de um servidor parado";
  - "Coletor desligado".
- [x] 3.2 Escrever primeiro o teste de integração e depois os pedidos do coletor, o arquivo, a falha e a retenção (decisões 3, 6 e 7). Verificar: os testes de integração passam com os cenários "Backup buscado pelo coletor da rede", "Resposta de outro coletor", "Backup completo", "Login recusado" e "Oitavo dia".
- [x] 3.3 Escrever primeiro o teste de integração e depois a lista, o download, o conteúdo, as fotos e a exclusão (decisões 8 e 9), com o contrato gerado de novo. Verificar: os testes de integração passam com os cenários "Histórico na ficha", "ZIP baixado", "Pessoa procurada no backup", "Backup apagado" e "Quem só vê".

## 4. Coletor

- [x] 4.1 Escrever primeiro os testes e depois a busca dos pedidos, a leitura do controle, o ZIP e o envio (decisões 3 e 4), contra o simulador do Control iD. Verificar: os testes do coletor passam com os cenários "Backup completo", "Biometria que falha" e "Login recusado".

## 5. Web

- [x] 5.1 Escrever primeiro os testes e depois a seção Backups na ficha do controle e a tela "Backups do Control iD" no Ativos (decisão 10), com o "Backup de todos os controles", o "Baixar os filtrados" e o evento. Verificar: os testes da web passam com os cenários "Histórico na ficha", "Primeiro backup", "Quem só vê" e "Backup que termina com a ficha aberta".
- [x] 5.2 Escrever primeiro os testes e depois o visualizador do conteúdo, com as abas Pessoas, Grupos, Regras de acesso e Horários, a busca e o "Carregar mais" (decisão 8). Verificar: os testes da web passam com o cenário "Pessoa procurada no backup".

## 6. Fechamento

- [x] 6.1 Atualizar a documentação: a P5 na spec mestre (seção 3.2), o contrato de módulo e o mapa. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 6.2 Conferir: `pnpm lint`, `pnpm typecheck` e os testes do domínio, da API, do coletor e da web verdes, e `openspec validate p5a-backup-do-control-id --strict` sem erros. O CI fica de lado até o fim de outubro, por pedido do usuário.
  - Feito em 28/10: o `pnpm lint` e o `pnpm typecheck` verdes; os testes do domínio (1.184), os unitários da API (339), os de integração dos backups (12), da coleta e do Control iD (43) e do banco (20), os do coletor (106) e os da web que a change toca (os backups, a ficha, o registro e o contrato de módulo); a change valida sem erros. O CI fica de lado até o fim de outubro.
