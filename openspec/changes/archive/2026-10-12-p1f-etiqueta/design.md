## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. As decisões de produto vêm da spec mestre: a seção 3.2 (o P1f, a etiqueta com QR code, uma ou várias de uma vez, para imprimir) e a seção 5.2, decisão 10 (o id em UUIDv7 vai no QR code e não permite adivinhar os outros, e abrir o link continua exigindo a entrada).

Pontos de partida no código, depois do P1e:
- **UI:** o `CodigoQR`, vetor, com as cores fixas `--cor-qr-fundo` e `--cor-qr-modulo`, geradas em `tokens/gerar.ts` fora dos temas; o `ControleSegmentado`, a `Selecao` e o `ContagemDaSelecao` da tabela.
- **API:** `GET /ativos/:id` e a lista, com o `ativos.ver` pelo local do ativo (`podeEm`); `rotuloDoAtivo`.
- **Web:** a `TabelaDosAtivos`, com a seleção e o menu de contexto (`itensDoMenuDosAtivos`, que já monta o "Copiar link" com `${origem}/ativos/${id}`); a `FichaDoAtivo`, com o cabeçalho; o nome da organização na sessão (`useSessao`); a tela de entrada, que cobre a casca sem trocar o endereço, e a casca, que volta no mesmo endereço depois da entrada.
- **Nada imprime ainda:** não há estilo de impressão no projeto.

## Goals / Non-Goals

**Goals:**
- A etiqueta sai do navegador comum, pelo diálogo de impressão, sem programa nem driver próprio, nas medidas certas da folha A4 de etiquetas e da impressora de etiquetas.
- O que a tela mostra na prévia é o que sai no papel: o mesmo componente, nas mesmas medidas.

**Non-Goals:**
- Guardar quais etiquetas foram impressas, ou quando.
- Escolher o conteúdo da etiqueta por organização.
- Imprimir sem o diálogo do navegador.

## Decisions

### 1. A etiqueta em milímetros, com as medidas num módulo só

O `EtiquetaDoAtivo` (`packages/ui`) recebe o endereço, o patrimônio, o nome, a organização e o formato, e desenha a etiqueta nas medidas reais, em milímetros: o QR code à esquerda, no lado menor da etiqueta, e o texto à direita, com o patrimônio em destaque, o nome em até duas linhas (`line-clamp`) e a organização embaixo. As medidas ficam em `FORMATOS_DE_ETIQUETA`, ao lado do componente, como dados das folhas que se compram:
- **folha A4:** etiqueta de 63,5 × 38,1 mm, 3 colunas e 7 linhas, 2,5 mm entre as colunas, margens de 15,15 mm em cima e 7,25 mm dos lados, como as folhas A4 de 21 etiquetas (Pimaco A4356, Avery L7160);
- **impressora de etiquetas:** etiqueta e página de 50 × 30 mm.

O componente passa as medidas como variáveis de CSS no próprio elemento, e o CSS só as usa: as cores e os espaçamentos da tela continuam nos tokens.

Alternativa: as medidas como tokens. Foi descartada: são as medidas do papel que se compra, e não escolhas visuais; nos tokens, elas se misturariam às escalas da tela, em pixels.

### 2. As cores fixas da impressão nos tokens

`--cor-etiqueta-fundo` (branco) e `--cor-etiqueta-texto` (preto) entram em `tokens/gerar.ts` como as do QR code: na raiz, fora dos temas, iguais em todos eles. A etiqueta usa as duas na tela e no papel, e a verificação das cores literais continua valendo.

### 3. A impressão por um portal só para o papel

A tela das etiquetas mostra a prévia dentro da janela, e põe uma segunda cópia das folhas num portal no `body`, com a classe da impressão. O CSS global da impressão esconde, no papel, tudo o que não é o portal, e o portal some na tela. O `@page` do formato (o tamanho e a margem zero) entra num `<style>` enquanto a tela está aberta. Assim, a casca, o dock e a janela nunca saem no papel, e a prévia na tela pode rolar sem afetar a impressão.

Alternativa: esconder os elementos da casca pelo `visibility` na impressão. Foi descartada: depende da estrutura da casca, que muda, e a janela com rolagem cortaria as folhas.

### 4. A rota das etiquetas

`GET /ativos/etiquetas?ids=<id>,<id>` (com `ativos.ver` em algum escopo) devolve, na ordem pedida e sem repetir, o id, o nome (`rotuloDoAtivo`) e o patrimônio de cada ativo que a conta vê no local dele, e quantos ficaram de fora (os que não existem e os de fora do acesso, sem dizer quais). Mais de 200 ids são recusados, com "Escolha até 200 ativos por vez.". A rota só lê: nada vai para a auditoria nem para os eventos.

Alternativa: ler cada ativo pela ficha. Foi descartada: 200 pedidos para uma folha de etiquetas, e cada ficha traz muito mais do que a etiqueta usa.

### 5. A tela das etiquetas pelo endereço

`/ativos/etiquetas?ids=…&formato=…&inicio=…` guarda os ativos, o formato e a etiqueta onde começar no endereço: recarregar e voltar mantêm a tela. A tabela abre a tela com os selecionados, na ordem dela, o menu de contexto com as linhas dele, e a ficha com o ativo dela. O nome da organização vem da sessão. O endereço do QR é o da ficha na origem da página, como o "Copiar link": a organização é a do endereço.

## Risks / Trade-offs

- **[O navegador pode pôr margens ou cabeçalhos na impressão]** → O `@page` pede margem zero, e a tela diz para escolher "Margens: nenhuma" e "Escala: 100%" no diálogo, quando as etiquetas saírem fora do lugar.
- **[A folha de outra marca, com medidas diferentes]** → Os formatos ficam num módulo só; outro formato é uma entrada nova nele, sem mudar a tela.
- **[200 ativos no endereço]** → São cerca de 7,4 KB de ids, dentro do limite dos cabeçalhos do Node e dos navegadores.

## Migration Plan

Nada no banco. As cores novas entram nos tokens gerados (`pnpm tokens:gerar`).
