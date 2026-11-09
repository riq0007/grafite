## Why

No Windows, logo depois de um programa gravar arquivos, o antivírus e o indexador os abrem para conferir. Enquanto isso, renomear a pasta deles falha com EPERM, EACCES ou EBUSY, e a falha passa sozinha em instantes. O backup monta tudo numa pasta `.parcial` e só lhe dá o nome final no fim, e o comando faz o mesmo com a versão desempacotada. O CI achou o problema: na instalação num Windows, o backup antes da atualização da produção falhou ao renomear a `.parcial` com EPERM, e a atualização parou.

Esta change corrige o F2d · Operação (spec mestre, seção 3.3), no backup e no pacote da versão.

## What Changes

- **Renomeação com paciência:** ao dar o nome final a uma pasta recém-gravada, a operação tenta de novo enquanto o erro for passageiro (EPERM, EACCES ou EBUSY), com esperas crescentes, por até 10 s somadas as esperas. Outro erro, ou o passageiro que passa do limite, sobe como veio.
- **Onde vale:** a pasta do backup no primeiro destino, a cópia nos outros destinos e a versão desempacotada pelo comando.
- Nada muda no banco, nas rotas, no contrato nem na web.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `backup`: um requisito novo, "Pasta do backup presa por um instante".
- `operacao-servicos`: um requisito novo, "Versão desempacotada presa por um instante".

## Impact

- **`packages/operacao`:** `renomear.ts`, novo, exportado pelo pacote; o backup e a distribuição passam a usá-lo.
- **`apps/operacao/src/pacote.ts`:** a versão desempacotada ganha o nome final pela mesma função.
- Os testes unitários da função, e os de integração do backup e da restauração continuam passando.
