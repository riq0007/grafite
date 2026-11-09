## Why

A pasta de cada backup tem o nome do minuto em que ele começou, como `2026-10-14T0605Z` (design do F2d, "Formato em cada destino"). Um segundo backup no mesmo minuto ganha o mesmo nome, e o Windows recusa dar à `.parcial` dele o nome de uma pasta que já existe. O erro é um `EPERM`, que as tentativas da "Pasta do backup presa por um instante" não resolvem.

Isso derrubou duas vezes seguidas o job "Instalação num Windows" do PR da change `ci-paralelo`. O passo do `backup agora` e o backup que o `atualizar` faz antes de mudar a produção caíram no mesmo minuto. Quem opera bate no mesmo erro se pedir um backup e atualizar a produção em menos de um minuto.

A change pertence ao F2d · Operação, que criou o backup, e à spec `backup`. Ela não muda o formato dos nomes que já existem.

Ficam fora desta change:
- os segundos no nome de todo backup;
- a pasta da versão desempacotada, que já tem o nome da versão e não se repete no mesmo minuto.

## What Changes

- **O nome livre:** o backup que começa num minuto que já tem um backup pronto, em qualquer destino, ganha o sufixo `-2`; o seguinte, `-3`, e assim por diante. O primeiro do minuto continua com o nome de sempre.
- **Os nomes com sufixo valem como backups:**
  - a lista dos backups e a retenção os reconhecem;
  - a ordem do mais antigo ao mais novo põe `-2` depois do nome sem sufixo, e `-10` depois de `-9`;
  - a retenção conta o momento pelo minuto do nome.
- **A restauração pelo nome** aceita o nome com sufixo, como qualquer outro.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `backup`: um requisito novo, "Dois backups no mesmo minuto".

## Impact

- **Código:** `packages/operacao/src/distribuicao.ts` (o nome livre, o padrão dos nomes e a ordem) e `packages/operacao/src/backup.ts` (o nome escolhido antes de montar a `.parcial`).
- **Banco:** a migration `0032_backups_no_mesmo_minuto`, com a restrição da pasta na tabela `operacao.backups` aceitando o sufixo.
- **Testes:** os unitários da distribuição e os de integração do backup e do registro.
- **Documentação:** o mapa traz a change em andamento.
