## Context

Hoje, o mais perto de uma visualização no `packages/ui` é:
- o `Indicador`, com o número, a meta e a decisão;
- a barra de progresso dos Campos;
- no `apps/web`, a barra do nível do suprimento, que fica no CSS do módulo Ativos (`barraDoNivel`).

A fundamentos-v3 deu as cores:
- `--cor-serie-1` a `--cor-serie-8`;
- `--cor-tinta-ciano`, `--cor-tinta-magenta`, `--cor-tinta-amarelo` e `--cor-tinta-preto`, cada uma com 3:1 contra as superfícies;
- as situações completas (`--cor-ok-forte`, `--cor-critico-forte` e as outras);
- o `--texto-numeral` (28 px) e o `--texto-legenda` (11 px).

O ANTISLOP v3, na seção 31, descreve os instrumentos.

## Goals / Non-Goals

**Goals:**
- Cinco instrumentos reutilizáveis, que leem como num desenho técnico: o valor em texto, as marcas finas e o número em numeral.
- O estado legível sem a cor, pela forma e pelo texto.
- O nome acessível e o papel ARIA certo em cada um.
- A lógica (a posição na régua, o resumo dos dias e o caminho da linha) em funções puras, testadas sem o DOM.

**Non-Goals:**
- Buscar dados: os componentes recebem o que mostram.
- A estimativa de quando o suprimento acaba e as telas dos módulos, que vêm na change seguinte.
- Uma biblioteca de gráficos. O SVG e o CSS bastam para estes cinco.

## Decisions

### 1. Uma pasta própria e a seção do catálogo

Os componentes ficam em `packages/ui/src/componentes/dados`, e as histórias, em "Visualização de dados", como o Carbon separa os gráficos dos componentes. O catálogo passa a ter Fundamentos, Componentes, Visualização de dados e Casca, como pede o ANTISLOP v3, seção 42.

### 2. A cor por nome, e não por valor

Cada componente recebe a `tinta`:
- `'ciano' | 'magenta' | 'amarelo' | 'preto'`;
- `'serie-1'` a `'serie-8'`;
- `'neutra'`, que usa o texto secundário.

O CSS resolve a tinta para a variável, por `data-tinta`. Nenhuma cor passa como valor, e o verificador de cores continua valendo. O padrão é a `neutra`: o componente só ganha cor quando a cor tem significado.

### 3. Medidor

```ts
interface PropsDoMedidor {
  rotulo: string;
  valor: number | null;
  maximo?: number; // 100
  unidade?: string; // '%'
  marcas?: number[]; // [25, 50, 75], em % do máximo
  limite?: { valor: number; rotulo: string };
  tinta?: Tinta;
  semValor?: string; // 'Sem dado'
}
```

- **Com valor:** `role="meter"`, com `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, o `aria-valuetext` ("38%") e o `aria-label`.
- **A trilha:** é a superfície afundada, com a linha fina, e as marcas são traços de 1 px.
- **O limite:** é o cursor ▲ sob a trilha, na posição dele, com o texto ao lado ou embaixo. O cursor é um triângulo de CSS, sem ícone.
- **Sem valor (`null`):** só o texto do `semValor`, sem a trilha, para nenhuma barra vazia parecer um zero. É o mesmo princípio do "Nível dos suprimentos".
- **A posição:** sai de `posicaoNaRegua(valor, maximo)`, limitada a 0 e 100%, e o texto mostra o valor de verdade.

### 4. Cartucho

```ts
type NivelDoCartucho =
  | { tipo: 'medido'; percentual: number }
  | { tipo: 'ha-suprimento' }
  | { tipo: 'sem-dado' }
  | { tipo: 'inconsistente'; valor: number | null };

interface PropsDoCartucho {
  nome: string;
  tinta: 'ciano' | 'magenta' | 'amarelo' | 'preto' | null;
  nivel: NivelDoCartucho;
  estimativa?: string;
  limite?: number;
}
```

- **O formato:** um retângulo vertical de 28 × 72 px, com o raio do rótulo.
  - No topo, a placa da tinta tem a letra C, M, Y ou K em mono, e a tinta de verdade, com a borda fina. O preto mostra o preto, porque a placa tem borda.
  - Sem tinta, como no cilindro e no fusor, a placa fica neutra, sem letra.
- **O medido:** enche de baixo para cima até o percentual, na tinta do tema, e o número e o nome vêm embaixo.
- **"Há suprimento":** o corpo vem hachurado, com linhas finas a 45°, e o texto "Há suprimento". Nenhuma altura sugere um percentual.
- **"Sem dado" e "Inconsistente":** o corpo vazio, com o texto. O inconsistente traz o valor lido, quando há, e o rótulo de situação de atenção.
- **O limite:** uma marca horizontal no corpo, na altura do limite.
- **A estimativa:** vai numa linha em texto secundário, como "Acaba em cerca de 21 dias".
- **A acessibilidade:** o medido tem `role="meter"`, e os outros têm `role="img"`, com o `aria-label` em texto, como "Preto: há suprimento".

### 5. Faixa de dias

```ts
interface DiaDaFaixa {
  data: string; // AAAA-MM-DD
  situacao: 'ok' | 'parcial' | 'falha' | 'nada';
  detalhe?: string;
}
```

- **Os quadrados:** um por dia, com 10 px de lado, na ordem do mais antigo ao mais recente.
  - **ok:** cheio, na `--cor-ok-forte`.
  - **parcial:** meio cheio na diagonal, na `--cor-atencao-forte`.
  - **falha:** cheio, na `--cor-critico-forte`, com o X na cor sobre ele.
  - **nada:** só o contorno, na linha forte.

  A forma separa os estados sem a cor.
- **A lista:** é uma `role="list"`, e cada dia é um item com o `aria-label`, como "12/10: concluído", e o `title` com o detalhe.
- **O resumo:** sai de `resumoDosDias(dias)`, como "26 de 30 dias com backup · 2 falhas · 1 parcial", e vai em texto, ao lado dos quadrados.
- **O texto do resumo:** é do componente. O que conta como "com backup" (ok ou parcial) também é decisão dele, e o nome do que é contado vem por propriedade (`oQue`, como "backup").

### 6. Tendência

```ts
interface PropsDaTendencia {
  rotulo: string;
  pontos: Array<{ momento: string; valor: number }>;
  unidade?: string;
  periodo: string; // '30 dias'
  projecao?: { momento: string; valor: number };
  tinta?: Tinta;
}
```

- **O desenho:** um SVG de 120 × 32 px, com a linha de 1,5 px e o último ponto marcado.
  - O caminho sai de `caminhoDaTendencia(pontos, largura, altura)`, que normaliza o tempo e o valor.
  - Com um ponto só, o desenho é o ponto, e sem pontos, só o texto "Sem dado".
- **A projeção:** fica tracejada, do último ponto até ela.
- **Ao lado:** o último valor em texto e o período, como "412 rostos · 30 dias".
- **A acessibilidade:** `role="img"`, com o `aria-label` que resume, como "Rostos: de 380 a 412 em 30 dias".

### 7. Contagem

```ts
interface PropsDaContagem {
  rotulo: string;
  valor: number | null;
  unidade?: string;
  capacidade?: number;
  variacao?: { valor: number; desde: string }; // +3 desde o backup anterior
  semValor?: string;
}
```

- **O número:** em numeral, com os milhares do pt-BR, e a unidade em texto secundário.
- **Com a capacidade:** "412 de 3.000" e um `Medidor` compacto da ocupação, que é a régua sem o número repetido.
- **A variação:** em texto, "+3 desde o backup anterior" ou "Sem mudança desde o backup anterior". O sinal vai sempre escrito, e a cor não é usada, porque subir não é bom nem ruim por si.

### 8. Os números em pt-BR

Todos usam o `Intl.NumberFormat('pt-BR')`: os milhares com ponto e os decimais com vírgula. O percentual vai colado ao número, como o "8%" dos suprimentos (spec impressoras-por-snmp). As outras unidades vão separadas por um espaço que não quebra (U+00A0), como em "412 rostos".

## Risks / Trade-offs

- **A faixa com 90 dias fica larga no celular.** Ela quebra em linhas, porque é uma lista flexível, e o resumo em texto continua na frente.
- **O SVG da tendência não tem eixo.** Por isso o último valor e o período vão sempre em texto, e o desenho é só a forma da série.

## Migration Plan

Nada a migrar: são componentes novos.

## Open Questions

Nenhuma.
