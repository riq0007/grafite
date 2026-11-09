## Context

O Início (`apps/web/src/modulos/inicio/Inicio.tsx`) desenha só o `OQueResolverAgora`, com as ocorrências das fontes que os módulos registram no contrato (`ocorrencias`). A busca global abre pela barra e pelo Ctrl K, com o estado na `CascaDoApp`.

Os dados dos dois blocos novos já existem:
- **os suprimentos:** a lista dos ativos ordena pela coluna `coleta.suprimentos`, o menor nível, e a ficha lê a série dos últimos 30 dias (`GET /ativos/{id}/suprimentos/serie`), que o `estimarFimDoSuprimento` do domínio transforma na estimativa;
- **os backups:** o resumo dos backups (`GET /controlid/backups/resumo`) traz, por controle, os dias e as contagens.

## Goals / Non-Goals

**Goals:**
- O Início que cada conta arruma, sem mudar a casca para cada bloco novo.
- Os toners e os backups da frota à vista na primeira tela, cada um levando à ficha.
- A ordem pelo teclado e pelo leitor de tela.

**Non-Goals:**
- Rotas novas na API.
- O arraste com o mouse.
- Os blocos de indicadores.

## Decisions

### 1. O bloco no contrato de módulo

```ts
export interface BlocoDoInicio extends ExigePermissoes {
  /** Único entre os módulos e gravado nas preferências, como "ativos.suprimentos". */
  id: string;
  /** O título, no carimbo do bloco. */
  titulo: string;
  componente: ComponentType;
}
```

O módulo declara `blocosDoInicio`, como declara as `relacoes`. O Início junta os da conta pelo `registroDaConta`, que já tira os módulos desligados e o que a conta não pode ver. "O que resolver agora" é o bloco `inicio.resolver`, do próprio Início, sempre registrado.

O Início põe o título de cada bloco de módulo num `Carimbo`, um `h2`. "O que resolver agora" continua com o título da janela, o `h1` com o número de abertas, que o foco da navegação procura e que os testes ponta a ponta usam como o marco do Início. Por isso ele fica sempre à vista: sem ele, a tela ficaria sem o `h1`.

### 2. A ordem e os ocultos

`inicio.blocos` é a lista `{ id, visivel }[]`, trocada inteira, como a ordenação. A tela resolve a lista assim:
1. os blocos registrados, na ordem salva;
2. os registrados que a lista não traz, no fim, à vista, na ordem do registro;
3. os ids salvos que ninguém registra, ignorados.

O leitor do domínio tira os itens inválidos e os repetidos, um a um, e corta em 20.

### 3. O modo Personalizar

"Personalizar o Início" fica no topo, ao lado da busca. No modo:
- cada bloco ganha, no cabeçalho, "Subir", "Descer" e "Ocultar", botões terciários com o nome do bloco no nome acessível, como "Subir Suprimentos que acabam primeiro";
- o conteúdo dos blocos continua à vista, para quem arruma ver o que move;
- os ocultos ficam numa lista no fim, com "Mostrar";
- "Concluir" fecha o modo.

O Subir do primeiro e o Descer do último ficam desabilitados, e "O que resolver agora" não tem o Ocultar. O mostrado volta ao fim. Cada clique grava na hora, como os Ajustes.

**Alternativa descartada:** o arraste. Ele precisa de um caminho pelo teclado de qualquer jeito, e os botões já são esse caminho.

### 4. A busca no topo

A `CascaDoApp` passa a dar, por um contexto, a função que abre a busca. O Início mostra um botão com a cara de um campo grande, com "Buscar ativos, pessoas, locais e ações" e a tecla do atalho. O clique abre a busca global vazia, como o Ctrl K: a busca continua abrindo sempre vazia.

### 5. Suprimentos que acabam primeiro

O bloco pede a lista dos ativos com a ordem `coleta.suprimentos` crescente, a coluna dela e o limite 6. As impressoras sem nível lido vêm no fim e ficam de fora. Para cada impressora, ele lê a série e estima o fim do suprimento de menor nível, pelo mesmo `estimarFimDoSuprimento` da ficha.

Cada linha é um link para a ficha, com:
- o cartucho compacto, na tinta do suprimento, pela descrição;
- o nome e a descrição;
- o nível, em numeral;
- a estimativa, como na ficha.

### 6. Backups do Control iD

O bloco pede o resumo dos backups de 14 dias e ordena os controles pelos dias seguidos sem backup até hoje. Cada linha é um link para a ficha do controle, com o nome, os rostos e a faixa de dias compacta. O componente fica com os outros do Control iD, em `apps/web/src/modulos/ativos/controlid`, e a Gestão de ativos o registra.

## Risks / Trade-offs

**Sete pedidos no bloco dos suprimentos:** a lista e uma série para cada uma das 6 impressoras. As séries são pequenas e ficam no cache do TanStack Query, com a mesma chave da ficha.

## Migration Plan

Nada a migrar: sem `inicio.blocos`, vale a ordem do registro.

## Open Questions

Nenhuma.
