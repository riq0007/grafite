## 1. A API

- [x] 1.1 Escrever primeiro os testes de integração e depois o `DELETE /mapa/plantas/{id}` (design, decisão 2). Verificar: os testes passam com "Planta enviada por engano" (as posições saem, os ativos ficam, a auditoria traz a contagem), "Exclusão sem a permissão" (403) e a planta que não existe (404), e o modelo sai do armazenamento.
- [x] 1.2 Escrever primeiro os testes de integração e depois o `PUT /mapa/plantas/{id}/modelo` (decisões 3 e 4). Verificar: os testes passam com "Desenho corrigido", "Arquivo recusado na substituição", "Planta que falhou, corrigida" e "Posições fora do desenho novo".
- [x] 1.3 Gerar o contrato e o cliente. Verificar: o `pnpm contrato:verificar` passa.

## 2. A tela

- [x] 2.1 Escrever primeiro os testes e depois a propriedade `conferir` da `Confirmacao` (decisão 1). Verificar: os testes passam com "Nome que não confere" e com o botão liberado quando o texto confere.
- [x] 2.2 Escrever primeiro os testes e depois o menu "Ações" da planta, com "Renomear…", "Ligar a um local…", "Inativar" e "Reativar", e as inativas e as que falharam depois das ativas (decisões 1 e 4). Verificar: os testes passam com "Renomear pela tela", "Inativar pela tela", "Planta que falhou" e "Quem só vê o mapa".
- [x] 2.3 Escrever primeiro os testes e depois "Excluir…" e o estado do mapa de uma planta excluída (decisões 2 e 5). Verificar: os testes passam com "Planta enviada por engano" e "Mapa aberto em outra sessão".
- [x] 2.4 Escrever primeiro os testes e depois "Substituir o desenho…", com o aviso das posições fora (decisão 3). Verificar: os testes passam com "Desenho corrigido" e "Posições fora do desenho novo", e a consulta do modelo é relida.

## 3. Fechamento

- [ ] 3.1 Conferir no `pnpm dev`: cadastrar uma planta, posicionar um ativo, renomear, substituir o desenho, inativar, reativar e excluir. Verificar: cada ação dá o retorno da spec, o ativo continua cadastrado depois da exclusão, e a auditoria mostra a exclusão com a contagem.
- [ ] 3.2 Atualizar a spec mestre (seção 5.2, decisão 8) e o mapa dos documentos (design, decisão 6). Verificar: os testes da documentação e do mapa passam.
- [ ] 3.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm contrato:verificar`;
  - `openspec validate gestao-das-plantas --strict`.

  Verificar: os comandos passam.
