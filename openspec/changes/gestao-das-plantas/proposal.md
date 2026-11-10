## Why

A tela das plantas só lista e cadastra. A API já renomeia, liga a um local e inativa a planta (`PATCH /mapa/plantas/{id}`), mas nenhuma tela chama essa rota. A planta enviada por engano não sai mais, nem pela tela nem pela API, e a que falhou na conversão não pode nem ser inativada. Em 09/11/2026 o usuário pediu a "opção de excluir plantas".

Esta change segue o subprojeto P7 · Mapa da planta da spec mestre. Ficam fora dela:
- o desenho do mapa, com a leveza, as camadas e os marcadores, que é outra change;
- editar o desenho pela tela, como mover uma parede.

## What Changes

- **As ações da planta na tela:** para quem tem `mapa.editar`, cada planta ganha "Renomear…", "Ligar a um local…", "Inativar" ou "Reativar", "Substituir o desenho…" e "Excluir…".
- **Excluir a planta:** a exclusão apaga a planta, o desenho guardado e as posições de tudo o que estava nela, e os ativos, as salas e os painéis continuam. Ela pede o nome da planta digitado e fica na auditoria.
- **Substituir o desenho:** outro DXF ou modelo vai para a mesma planta, as posições ficam, e a tela diz quantas ficaram fora do desenho novo. A planta que falhou passa a ativa.
- **A exceção na spec mestre:** a decisão "Nada se exclui, tudo se inativa" (seção 5.2) passa a dizer que a planta é um desenho enviado, que se substitui e se exclui, com o histórico na auditoria.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `mapa-da-planta`: as ações da planta na tela, a exclusão e a substituição do desenho.

## Impact

- `apps/api/src/mapa/mapa.ts` e `apps/api/src/rotas/mapa.ts`: a exclusão e a substituição do desenho; o contrato gerado.
- `apps/web/src/modulos/mapa`: a tela das plantas, as consultas e o mapa aberto de uma planta excluída.
- `apps/web/src/modulos/administracao/Confirmacao.tsx`: a confirmação com um texto digitado.
- A spec mestre (seção 5.2, decisão 8) e o mapa dos documentos.
