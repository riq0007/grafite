# Contrato de módulo da casca

Como um módulo entra no Grafite (design do F1a, decisão 2; design do F1b, decisões 3, 4, 7, 8 e 12; design do F1c, decisões 2, 5, 7 e 8; design do F2a, decisões 12 e 13; design do F2b, decisões 2, 6, 14 e 15; design do F2c, decisões 4, 5, 8, 12 e 13; design do P1b, decisões 12 e 13; design do P1c, decisões 8 a 11; design do escolhas-a-vista, decisão 7; design do relacoes-vivas, decisões 2 a 5; spec mestre, seção 12.3). Um módulo novo entra com uma pasta e uma entrada no registro, sem mudar a casca: o dock, a barra de abas do celular, os menus da barra superior, as rotas, a busca, as ocorrências da tela inicial, as relações nas fichas dos outros módulos, os cadastros que os campos dos outros módulos abrem numa aba e a atualização pelos eventos do servidor saem do registro. As permissões, o módulo opcional, a sessão, o cliente da API, as consultas ao servidor, as preferências, a foto da pessoa, as notificações, as datas no fuso escolhido, a prévia na tabela, a tabela configurável com as visões, a referência com cartão, a tabela a partir de uma origem, as ações da tela na busca, as escolhas, o cursor e as etapas da chegada também têm contratos prontos, descritos abaixo.

## Passo a passo

1. **Pasta.** O módulo vive em `apps/web/src/modulos/<id>/`, com `rotas.tsx`, `modulo.ts` e as telas.
2. **Rotas.** A subárvore do módulo fica presa à raiz (`getParentRoute: () => raiz`). Cada rota fica numa constante própria e só depois entra no `addChildren`. Criadas dentro do `addChildren`, as rotas filhas perdem os tipos dos endereços, e um menu com destino errado passa a compilar.
3. **Entrada no registro.** O `modulo.ts` declara o módulo com `definirModulo`, que confere os endereços dos menus e das entradas de busca contra as rotas do próprio módulo. A entrada vai para o `REGISTRO`, antes de Ajustes, que fica sempre no fim do dock, depois do separador.
4. **Telas.** Toda tela começa pelo `CabecalhoDaPagina`, que leva o título da janela, em todos os estados: carregando, com erro, vazia e sem acesso. O foco vai para o título depois de cada navegação, e o teste-guarda `casca/cabecalhoDasTelas.test.ts` reprova o `TituloDaJanela` solto, fora do Início (change cabecalho-em-toda-tela). Nenhum item leva a uma tela em construção: o módulo só entra no registro quando cada destino tem uma tela que funciona.
   - **Rolagem.** A tela rola dentro da janela, na área abaixo da barra das abas, que esmaece o conteúdo perto da borda e volta ao começo quando a tela muda (change janela-rolavel-e-campos-em-colunas). A tela não cria uma rolagem própria para a página. A peça presa, com `position: sticky`, usa `top: 0`, que já fica abaixo da faixa esmaecida de cima.
   - **Título com a barra das abas.** A tela cujo título a primeira aba já repete, como o cadastro do ativo, pede `<CabecalhoDaPagina titulo={…} ocultarComAbas />`: com a barra das abas, o título sai da vista e continua para o leitor de tela e para o foco.
   - **Cabeçalho.** O `CabecalhoDaPagina` (change cabecalhos-e-fichas) põe o título à esquerda, com os selos ao lado e o detalhe embaixo, e as ações da tela juntas, à direita, na ordem dada, com a principal num `Botao` primário. Uma linha separa o cabeçalho do conteúdo. As seções da tela usam o `Carimbo`, e os dados só para leitura, a `ListaDeDados`.
   - **Tabela.** A coluna da tabela redimensionável só recebe `largura` quando a conta a guardou, como na visão. Sem ela, as colunas dividem a largura da área, e a principal fica com o dobro.
5. **Busca.** O módulo e os itens dos menus entram na busca sozinhos. Ações, atalhos para telas e ajustes entram pelas entradas de busca, e os registros de negócio, pelos provedores.
6. **Tela inicial.** As ocorrências abertas do módulo entram em "O que resolver agora" por uma fonte de ocorrências.
7. **Permissões.** As permissões do módulo entram no catálogo, e o registro diz quem vê o módulo, cada item de menu e cada entrada de busca. A tela confere o que a conta pode, e a API decide cada registro.
8. **Eventos.** O registro diz quais consultas do módulo cada evento do servidor atualiza. Quando outra pessoa muda um registro, as telas abertas se atualizam sozinhas.
9. **Opcional, se for o caso.** O módulo que a organização pode desligar entra nos módulos opcionais, e as rotas dele na API ficam atrás da guarda do módulo.
10. **Relações, se for o caso.** O que o módulo mostra na ficha de um registro de outro, como os ativos sob responsabilidade de uma pessoa, entra pelas relações do registro, e some com o módulo desligado.

## Campos da entrada

| Campo | O que é |
|---|---|
| `id` | Identificador estável, em minúsculas e único no registro |
| `nome` | Nome do módulo no dock, na barra de abas e na barra superior |
| `icone` | Ícone do `lucide-react`, desenhado com o traço do projeto |
| `endereco` | Aonde levam o item do dock e a aba do celular |
| `prioridadeNoCelular` | Ordem na barra de abas do celular: número menor vem antes, ou `'mais'` para ficar sempre em "Mais". Cabem cinco abas, ou quatro e "Mais" |
| `parteDe` | O id do módulo opcional de que este faz parte, como a Gestão de ativos do Ativos: o interruptor da organização vale para os dois (opcional; veja Módulo opcional) |
| `rotas` | A subárvore de rotas do módulo |
| `menu` | Menu em árvore do item do dock (opcional) |
| `menuDinamico` | Os itens do menu do dock que vêm dos dados, como as visões fixadas: a permissão, as consultas e o `montar` (opcional) |
| `menusDaBarra` | Menus do módulo na barra superior, como Visualizar e Ações (opcional) |
| `busca` | Entradas de busca e os provedores de busca, cada um com o grupo dele (opcional) |
| `ocorrencias` | Fonte das ocorrências abertas do módulo, para a tela inicial (opcional) |
| `permissoes` | As permissões que mostram o módulo: basta uma, em qualquer escopo. Vale também nos itens de menu, nas entradas de busca, nos provedores, na fonte de ocorrências, nas relações e nos cadastros (opcional) |
| `relacoes` | O que o módulo mostra na ficha de um registro de outro módulo, cada relação com o alvo, o componente e as permissões dela (opcional) |
| `cadastros` | Os cadastros do módulo que os campos dos outros módulos abrem numa aba da janela, cada um com o alvo, o título da aba, o texto do link, o componente e as permissões dele (opcional) |
| `eventos` | As consultas do módulo que cada tipo de evento do servidor atualiza (opcional) |

### Menus em árvore

Cada item leva a um destino (`{ rotulo, destino }`) ou abre um submenu (`{ rotulo, filhos }`). Com `separadoAntes: true`, uma linha separa o item dos anteriores. Os destinos são endereços das rotas do próprio módulo, conferidos na compilação.

A casca decide como o menu abre:
- **Dock:** abre ao parar o ponteiro sobre o item.
- **Toque:** abre no primeiro toque.
- **Celular:** abre num painel que sobe de baixo.

A Gestão de ativos põe as telas do catálogo num submenu, ao lado das importações, do software e dos backups do Control iD, cada item com a permissão dele. A lista das seções, a mesma da janela do catálogo, monta os filhos:

```ts
// apps/web/src/modulos/gestao/modulo.ts (trecho)
  menu: [
    {
      rotulo: 'Catálogo',
      permissoes: PERMISSOES_DO_CATALOGO,
      filhos: SECOES_DO_CATALOGO.map((secao) => ({ rotulo: secao.nome, destino: secao.endereco })),
    },
    { rotulo: 'Importações', destino: '/gestao/importacoes', permissoes: ['ativos.editar'] },
    // A base de software e as distribuições às máquinas (change distribuicao-de-software).
    { rotulo: 'Software', destino: '/gestao/software', permissoes: ['software.distribuir'] },
    // Os backups dos controles de acesso (change p5a-backup-do-control-id).
    {
      rotulo: 'Control iD',
      permissoes: ['controlid.ver'],
      filhos: [
        { rotulo: 'Backups', destino: '/gestao/control-id/backups' },
        { rotulo: 'Comparar backups', destino: '/gestao/control-id/comparar' },
      ],
    },
  ],
```

O submenu abre ao lado do item, no dock, e como mais um nível no painel do celular. Os filhos seguem as mesmas regras dos itens: cada um pode ter `permissoes`, e um submenu sem nenhum filho que a conta possa usar some.

### Itens de menu dos dados

Um menu do dock pode ter itens que vêm dos dados, além dos fixos, como as visões fixadas e os tipos de ativo (change visoes-no-dock). O módulo declara o `menuDinamico`, com a permissão dele, as consultas de que precisa e `montar`, que devolve o menu com os itens fixos e os dos dados, na ordem que o módulo quer:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/** Uma consulta de que o menu dinâmico precisa, como a das visões de uma tabela. */
export interface ConsultaDoMenu<TDado = unknown> {
  queryKey: QueryKey;
  queryFn: () => Promise<TDado>;
}

/** O que o módulo recebe para montar o menu com os dados. */
export interface ContextoDoMenuDinamico<TEndereco extends string> {
  /** O menu fixo do módulo, já só com o que a conta pode usar. */
  menu: readonly ItemDoMenuDoModulo<TEndereco>[];
  /** O dado de uma das consultas do menu: nenhum enquanto ela carrega ou se ela falhou. */
  ler: <TDado>(consulta: ConsultaDoMenu<TDado>) => TDado | undefined;
  /** O cliente da sessão, para montar as consultas que `ler` lê. */
  api: ClienteDaApi;
  /** As preferências resolvidas, como as visões fixadas. */
  preferencias: PreferenciasDaInterface;
}

/**
 * Os itens do menu que vêm dos dados, além dos fixos (change visoes-no-dock, design, decisão 2),
 * como as visões fixadas e os tipos de ativo. A casca carrega as consultas pelo TanStack Query, só
 * para a conta que tem a permissão e com o módulo ligado, e o menu do dock se refaz a cada vez que
 * os dados ou as preferências mudam; os eventos do módulo relêem as consultas. O item dos dados que
 * exige uma permissão que a conta não tem some, como os fixos.
 */
export interface MenuDinamicoDoModulo<TEndereco extends string> extends ExigePermissoes {
  consultas: (api: ClienteDaApi) => readonly ConsultaDoMenu[];
  /** O menu do módulo, com os itens fixos e os dos dados, na ordem que o módulo quer. */
  montar: (
    contexto: ContextoDoMenuDinamico<TEndereco>,
  ) => readonly ItemDoMenuDoModulo<DestinoComBusca<TEndereco>>[];
}
```

A casca carrega as consultas pelo TanStack Query, só para a conta que tem a permissão do `menuDinamico` e com o módulo ligado, e monta o menu de novo a cada vez que os dados ou as preferências mudam (`useMenusDinamicos`, em `apps/web/src/casca/menusDinamicos.ts`):
- **os eventos:** os do módulo relêem as consultas, como nas telas, e a visão removida sai do menu sozinha;
- **as permissões:** o item dos dados que exige uma permissão que a conta não tem some, como os fixos, e o submenu sem itens também;
- **o carregamento:** enquanto uma consulta carrega, ou se ela falha, `ler` não dá nada, e o menu sai sem os itens dela;
- **os destinos:** podem trazer a busca do endereço, como `/ativos?visao=<id>`, com o caminho conferido contra as rotas do módulo, e o item pode ter um `icone`, que aparece antes do nome.

Só o dock usa o menu dinâmico: a busca continua com os menus fixos. O Ativos completa "Todos os ativos" com os tipos ativos, direto no menu, e, depois de uma linha, com as visões fixadas, primeiro as da organização e depois as da conta:

```ts
// apps/web/src/modulos/ativos/menu.ts (trecho)
export const MENU_DINAMICO_DOS_ATIVOS: MenuDinamicoDoModulo<EnderecosDe<typeof rotasDosAtivos>> = {
  permissoes: ['ativos.ver'],
  consultas: (api) => [consultaDasVisoes(api, 'ativos'), consultaDosTipos(api)],
  montar: ({ menu, ler, api, preferencias }) => {
    const visoes = ler(consultaDasVisoes(api, 'ativos'))?.visoes ?? [];
    const tipos = ler(consultaDosTipos(api))?.tipos ?? [];
    const { fixadas, fixadasPelaOrganizacao } = preferencias.tabelas;
    const ids = new Set([...(fixadasPelaOrganizacao.ativos ?? []), ...(fixadas.ativos ?? [])]);
    const porTipo = tipos
      .filter((tipo) => tipo.situacao === 'ativo')
      .map((tipo) => ({
        rotulo: tipo.nome,
        destino: `/ativos?origem=${origemNoEndereco({ tipo: 'tipo', id: tipo.id })}` as const,
        icone: iconeDoTipo(tipo.icone),
      }));
    const dasFixadas = [...ids]
      .flatMap((id) => visoes.filter((visao) => visao.id === id))
      .map((visao, posicao) => ({
        rotulo: visao.nome,
        destino: `/ativos?visao=${visao.id}` as const,
        ...(posicao === 0 ? { separadoAntes: true } : {}),
      }));
    return [...menu, ...porTipo, ...dasFixadas];
  },
};
```

### Menus da barra

`menusDaBarra` é uma lista de `{ rotulo, itens }`, e os itens seguem a forma dos do menu em árvore. Abaixo de 1024 px, a barra reúne os menus no nome do módulo. No celular, eles entram no painel da árvore.

Nenhum módulo da fase 1 registra menus da barra. Um módulo de ativos registraria assim (ilustrativo):

```ts
menusDaBarra: [
  {
    rotulo: 'Visualizar',
    itens: [
      { rotulo: 'Lista', destino: '/ativos' },
      { rotulo: 'Galeria', destino: '/ativos/galeria' },
    ],
  },
],
```

## Busca

A busca (Ctrl+K, ou ⌘K no Mac) mostra os resultados em grupos, nesta ordem: Ir para, Ações, Ajustes e, depois, um grupo por provedor, na ordem do registro e, num módulo, na ordem dos provedores dele. Cada grupo local mostra até 8 resultados. O casamento ignora acentos e maiúsculas, aceita as palavras em qualquer ordem e põe primeiro o nome que começa pelo texto digitado.

**Ir para** sai sozinho do registro: o módulo e cada item dos menus, com o caminho até ele. Um mesmo destino aparece uma vez só. A entrada declarada pelo módulo vence a que sai dos menus, e por isso "Dock" aparece em Ajustes, e não repetido em Ir para.

### Entradas

`busca.entradas` lista as entradas fixas do módulo. Cada uma tem nome, grupo (`ir-para`, `acoes` ou `ajustes`), o caminho em texto secundário e as palavras-chave, que acham a entrada por outros nomes. Ela leva a um destino, com o foco opcional num controle, ou executa uma ação:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/**
 * Entrada de busca declarada pelo módulo: leva a um endereço do próprio módulo, com o foco
 * opcional num elemento marcado com `data-foco`, ou executa uma ação. O id só precisa ser único
 * dentro do módulo.
 */
export type EntradaDeBuscaDoModulo<TEndereco extends string> = ExigePermissoes & {
  id: string;
  rotulo: string;
  grupo: IdDoGrupoLocal;
  /** Onde fica, em texto secundário, como "Ajustes › Dock". */
  caminho?: string;
  palavrasChave?: readonly string[];
  icone?: LucideIcon;
} & (
    | { destino: TEndereco; foco?: string; executar?: never }
    | { executar: (contexto: ContextoDaAcao) => void; destino?: never; foco?: never }
  );
```

O `destino` é um endereço das rotas do próprio módulo, conferido na compilação como os dos menus. A ação recebe o que a casca oferece:

```ts
// apps/web/src/busca/tipos.ts (trecho)
/** O que a casca oferece às ações da busca. */
export interface ContextoDaAcao {
  /** Navega até o endereço e, com `foco`, põe o foco no elemento marcado com `data-foco`. */
  navegar: (destino: string, foco?: string) => void;
  mudarPreferencias: ControleDasPreferencias['mudar'];
  /** Abre a central de notificações. */
  abrirNotificacoes: () => void;
}
```

Os Ajustes, no exemplo mais abaixo, declaram cada seção, cada ajuste e as ações de tema, como "Usar o tema Névoa".

### Foco pelo endereço

Qualquer endereço aceita o parâmetro `foco`, com letras, números e hífen. Depois da navegação, a casca põe o foco no elemento marcado com `data-foco` igual ao valor, ou na parada de Tab dentro dele: num grupo de rádios, a opção escolhida. Sem esse elemento, o foco vai ao título, como em qualquer navegação.

É assim que a entrada "Tamanho do dock" leva a `/ajustes/dock?foco=tamanho-do-dock`, com o foco no controle marcado na seção Dock:

```tsx
// apps/web/src/modulos/ajustes/secoes/Dock.tsx (trecho)
        <ControleDeslizante
          rotulo="Tamanho"
          data-foco="tamanho-do-dock"
          unidade="px"
          minValue={casca.tamanhoItemDockMinimo}
          maxValue={casca.tamanhoItemDockMaximo}
          value={tamanho}
          onChange={(valor) => mudar('dock', { tamanho: valor })}
          className={estilos.deslizante}
        />
```

Os controles da biblioteca repassam o `data-foco` ao elemento de fora. Um módulo pode usar o mesmo mecanismo para levar a um campo de uma ficha.

### Provedores

`busca.provedores` buscam os registros do módulo no servidor, cada um no seu grupo. O Ativos tem dois: o dos ativos e o dos modelos. Cada provedor diz as permissões dele, e o registro da conta tira os que ela não pode usar:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/** Resultado de um provedor: um registro do módulo, com o endereço dele. */
export interface ResultadoDoProvedor {
  id: string;
  rotulo: string;
  caminho?: string;
  destino: string;
}

/** Os resultados de um provedor que sabe quantos o servidor acha ao todo. */
export interface PaginaDoProvedor {
  itens: ResultadoDoProvedor[];
  total: number;
}

/**
 * Provedor de busca de um módulo, como a busca de ativos no servidor. É chamado só depois de uma
 * pausa na digitação, e o `sinal` aborta a chamada quando o texto muda ou a busca fecha. A `api` é
 * o cliente da sessão, o mesmo do `useApi()`. Com o total e a lista do módulo com a busca, o grupo
 * termina com "Ver todos os N" quando há mais que os mostrados (change relacoes-vivas, decisão 5).
 */
export interface ProvedorDeBusca extends ExigePermissoes {
  /** Nome do grupo dos resultados, como "Ativos". */
  grupo: string;
  buscar: (
    termo: string,
    sinal: AbortSignal,
    api: ClienteDaApi,
  ) => Promise<ResultadoDoProvedor[] | PaginaDoProvedor>;
  /** A lista do módulo com a busca preenchida, como `/ativos?busca=laserjet`. */
  verTodos?: (termo: string) => string;
}
```

A casca cuida do resto:
- **Quando chama:** com pelo menos 2 caracteres e depois de 150 ms sem digitação.
- **Cancelamento:** aborta o `sinal` quando o texto muda ou a busca fecha, e descarta a resposta de um texto antigo. Passe o `sinal` ao `fetch`.
- **Estados:** "Buscando…" no grupo enquanto espera. Depois de 5 s, ou se a promessa falhar, o grupo mostra "Não foi possível buscar em <grupo> agora.", e os outros grupos continuam utilizáveis.
- **Chegada:** os resultados entram abaixo dos grupos locais, sem trocar o resultado escolhido.

O provedor fala com a API pelo cliente que a casca passa, e não pelo `useApi()`, porque é chamado fora dos componentes. O "Pessoas" da Administração, para quem tem `pessoas.ver`:

```ts
// apps/web/src/modulos/administracao/busca.ts (trecho)
/** As pessoas pelo nome, pela matrícula, pelo e-mail ou pelo usuário, como a lista acha. */
export const provedorDePessoas: ProvedorDeBusca = {
  grupo: 'Pessoas',
  permissoes: ['pessoas.ver'],
  buscar: async (termo, sinal, api) => {
    const { data, error } = await api.GET('/pessoas', {
      params: { query: { busca: termo, limite: NA_BUSCA } },
      signal: sinal,
    });
    if (error || !data) throw new Error('A busca de pessoas falhou.');
    const itens = data.itens.map((pessoa) => ({
      id: pessoa.id,
      rotulo: pessoa.nome,
      caminho:
        [pessoa.matricula, pessoa.conta?.usuario, pessoa.local?.caminho]
          .filter(Boolean)
          .join(' · ') || undefined,
      destino: `/administracao/pessoas/${pessoa.id}`,
    }));
    return { itens, total: data.total };
  },
  verTodos: (termo) => `/administracao/pessoas?busca=${encodeURIComponent(termo)}`,
};
```

O provedor que devolve a página, com o `total`, e diz `verTodos`, a lista do módulo com a busca, termina o grupo com "Ver todos os 23 em Ativos" quando o servidor acha mais que os mostrados. O provedor que devolve só a lista não tem o "Ver todos".

### Ações da tela

Cada tela declara as ações dela para a busca com `useAcoesDaTela`. A busca as mostra em "Nesta tela", antes de "Ir para", também com o campo vazio, e a ação da tela vale no lugar da entrada de mesmo nome, como "Novo ativo". A tela declara as ações a cada desenho, e a busca lê as de agora quando abre:

```ts
// apps/web/src/busca/acoesDaTela.tsx (trecho)
export interface AcaoDaTela {
  /** Único entre as ações da tela. */
  id: string;
  rotulo: string;
  palavrasChave?: readonly string[];
  icone?: LucideIcon;
  /** O que a ação faz, pela tela, como abrir o painel de filtros. A busca fecha antes. */
  executar: () => void;
}
```

```ts
// apps/web/src/busca/acoesDaTela.tsx (trecho)
/**
 * A tela declara as ações dela para a busca, enquanto estiver aberta. A busca lê as ações de agora
 * ao abrir, então elas podem depender do estado da tela.
 */
export function useAcoesDaTela(acoes: readonly AcaoDaTela[]) {
  const registro = useContext(ContextoDasAcoesDaTela);
  const atuais = useRef(acoes);
  atuais.current = acoes;
  useEffect(() => registro?.registrar(() => atuais.current), [registro]);
}
```

A tabela dos ativos declara "Novo ativo", que leva a origem da tabela ao cadastro, e "Filtrar por tipo…", que abre o painel de filtros no tipo; a ficha do ativo, "Imprimir etiqueta" e "Ir para Ligados". A busca fecha antes de a ação rodar.

## Ocorrências na tela inicial

O Início é "O que resolver agora": as ocorrências abertas de todos os módulos, na tabela base. Um módulo entra nele com uma fonte, no campo `ocorrencias` da entrada:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
export interface ContextoDaFonte {
  api: ClienteDaApi;
  canal: CanalDeEventos;
}

/**
 * A fonte das ocorrências abertas de um módulo, que a tela inicial reúne (design do F1c, decisão
 * 5). `buscar` traz as abertas agora, e o `sinal` aborta a busca quando a tela fecha ou busca de
 * novo. Com `assinar`, a fonte avisa quando as ocorrências mudam, como pelos eventos do módulo
 * no canal, e a tela busca de novo, sem recarregar a página; devolve a função que para os avisos.
 */
export interface FonteDeOcorrencias extends ExigePermissoes {
  buscar: (sinal: AbortSignal, contexto: ContextoDaFonte) => Promise<OcorrenciaAberta[]>;
  assinar?: (aoMudar: () => void, contexto: ContextoDaFonte) => () => void;
}
```

Cada ocorrência traz o ativo e o endereço do registro:

```ts
// packages/ui/src/inicio/ocorrencias.ts (trecho)
export type SeveridadeDaOcorrencia = 'critico' | 'atencao' | 'info';

/** O ativo de que a ocorrência fala, com as imagens da miniatura, se houver. */
export interface AtivoDaOcorrencia {
  nome: string;
  /** Define a imagem genérica da miniatura. */
  tipo: string;
  imagemDoAtivo?: string;
  imagemDoModelo?: string;
}

/** Uma ocorrência aberta, como uma fonte de um módulo a entrega à tela inicial. */
export interface OcorrenciaAberta {
  /** Único dentro da fonte que a trouxe. */
  id: string;
  severidade: SeveridadeDaOcorrencia;
  /** O que aconteceu, como "Toner preto em 8%". */
  texto: string;
  ativo: AtivoDaOcorrencia;
  /** Quando abriu. */
  desde: Date;
  /** O endereço do registro, que o clique e o Enter na linha abrem. */
  destino: string;
}
```

A casca cuida do resto:
- **Quando busca:** ao abrir o Início, cada fonte por conta própria, com o cliente da sessão no `contexto.api`. Sair da tela aborta o `sinal` das buscas em curso. Passe o `sinal` ao pedido.
- **Mudanças:** com `assinar`, a fonte chama `aoMudar` quando as ocorrências mudam, como num evento do servidor que ela ouve no `contexto.canal`, e a tela busca de novo só aquela fonte, com a lista anterior à vista até a nova chegar. Ao sair da tela, a casca chama a função devolvida, que para os avisos.
- **Estados:** o esqueleto no lugar das linhas enquanto a fonte responde. Se a promessa falhar, a tela mostra "Não foi possível carregar as ocorrências de <módulo>." com "Tentar de novo", e as ocorrências das outras fontes continuam à vista. Com fontes e nada aberto, a tela mostra "Nenhuma ocorrência aberta.".
- **Ordem e idade:** a fonte entrega as ocorrências em qualquer ordem. A tela as ordena pela severidade, de fábrica (Crítico, Atenção e Informação, com a mais antiga primeiro), ou pela coluna que o usuário escolher, e escreve há quanto tempo cada uma está aberta, como "32 min", a cada minuto.
- **Miniatura:** a imagem do ativo, a do modelo ou a genérica do `tipo`, nessa ordem. Os tipos com imagem própria são os do `iconesDeAtivo`, do `@grafite/ui`, como `impressora` e `switch`; um tipo sem ela recebe a genérica.

A fonte só entrega ocorrências reais: os dados de exemplo ficam no catálogo de componentes. Sem nenhum módulo com uma fonte que a conta possa ver, o Início diz "Nenhum módulo registra ocorrências ainda". O Alertas (P3a) registra a dele: os alertas abertos para resolver, sem os adiados e sem os dos ativos silenciados, página a página até 500, relidos pelo evento `alertas.mudaram`:

```ts
// apps/web/src/modulos/alertas/ocorrencias.ts (trecho)
  buscar: async (sinal, { api }) => {
    const alertas: AlertaNaLista[] = [];
    let cursor: string | undefined;
    do {
      const { data } = await api.GET('/alertas', {
        params: {
          query: { situacao: 'abertos', paraResolver: 'true', limite: POR_PAGINA, cursor },
        },
        signal: sinal,
      });
      if (!data) throw new Error('Não foi possível carregar os alertas.');
      alertas.push(...data.itens);
      cursor = data.proximo ?? undefined;
    } while (cursor && alertas.length < TETO_DA_TELA_INICIAL);
    return alertas.slice(0, TETO_DA_TELA_INICIAL).map(ocorrenciaDo);
  },
  assinar: (aoMudar, { canal }) => canal.ouvir('alertas.mudaram', aoMudar),
```

Uma ocorrência pode falar de um registro que não é um ativo, como o coletor sem contato nos alertas: o `ativo` traz o nome do registro e o tipo `generico`, que dá a imagem genérica, e o `destino` leva ao registro. O Operação (change p4c-estoque) registra a do estoque (`apps/web/src/modulos/operacao/estoque/ocorrencias.ts`): cada consumível abaixo do mínimo num local que a conta vê é uma ocorrência de Atenção, como "CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 2 de 5", com o código e o nome do consumível no lugar do ativo, desde quando ele ficou abaixo, levando ao Estoque filtrado pelo consumível e pelo local. A fonte lê `GET /estoque/abaixo-do-minimo`, que já traz só os do alcance da conta, e o evento `estoque.mudou` a relê, como depois da entrada que repõe.

## Blocos no Início

Além das ocorrências, um módulo pode pôr blocos no Início, depois de "O que resolver agora" (change inicio-ajustavel), no campo `blocosDoInicio` da entrada:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/**
 * Um bloco que o módulo põe no Início (change inicio-ajustavel, design, decisão 1), como os
 * suprimentos que acabam primeiro: a conta o sobe, desce e oculta, e a escolha fica nas preferências.
 */
export interface BlocoDoInicio extends ExigePermissoes {
  /** Único entre os módulos e gravado nas preferências, como "ativos.suprimentos". */
  id: string;
  /** O título, no carimbo do bloco. */
  titulo: string;
  componente: ComponentType;
}
```

O Início põe o título do bloco num `Carimbo` e desenha o componente embaixo, sem mudar a casca. O bloco segue as permissões dele e some com o módulo desligado, como as ocorrências. A conta arruma o Início em "Personalizar o Início": sobe, desce e oculta cada bloco, e a ordem fica em `inicio.blocos`, nas preferências; o bloco novo entra no fim, à vista, e "O que resolver agora" fica sempre à vista. O Ativos registra "Suprimentos que acabam primeiro" (`apps/web/src/modulos/ativos/suprimentos.tsx`), e a Gestão de ativos, "Backups do Control iD" (`apps/web/src/modulos/ativos/controlid/BackupsNoInicio.tsx`). O campo do topo do Início abre a busca global pelo `useAbrirBusca` (`apps/web/src/busca/abrirBusca.tsx`).

## Notificações

Um módulo notifica pela API, na transação da mudança que pede a atenção, com o `notificar`. A notificação é de uma conta: o módulo decide quem recebe, pelo acesso de cada conta, como os alertas fazem pelo local do ativo. Cada notificação nova é uma `NovaNotificacao`, do `@grafite/domain`:

```ts
// packages/domain/src/notificacoes/notificacoes.ts (trecho)
/** A notificação que um módulo grava para uma conta. */
export interface NovaNotificacao {
  contaId: string;
  severidade: SeveridadeDaNotificacao;
  titulo: string;
  descricao: string | null;
  /** O módulo que notifica, como "Alertas". */
  origem: string;
  /** O endereço do registro, para "Abrir". */
  destino: string | null;
  /** O alerta de que ela trata, que dá as ações de reconhecer e de adiar. */
  alertaId: string | null;
}
```

```ts
// apps/api/src/notificacoes/notificar.ts (trecho)
/**
 * Grava as notificações no momento dado e avisa as sessões das contas delas. Com a fila, põe nela a
 * entrega pelos canais de fora; sem ela, como nos testes que não tratam da fila, nada sai.
 */
export async function notificar(
  tx: Transacao,
  novas: readonly NovaNotificacao[],
  momento: Date,
  { enviar }: { enviar?: EnviarTarefa } = {},
): Promise<void> {
```

O que acontece:
- **Central e sino:** a notificação entra como não lida na central da conta, gravada no servidor, e o evento `notificacoes.mudaram` muda o número do sino em toda aba e em todo aparelho da conta. "Abrir" leva ao `destino` e marca como lida.
- **Aviso na tela:** a notificação que chega com a aplicação aberta vira aviso numa aba só, a usada por último. O Crítico sempre vira aviso e fica até ser reconhecido, adiado ou fechado. Atenção e Informação só viram aviso com essa severidade ligada em Ajustes › Notificações e o modo Foco desligado, e somem no tempo escolhido (6 s de fábrica, 10 s ou 20 s). O Foco liga e desliga na seção Notificações dos Ajustes ou na própria central, e o sino mostra "Foco" enquanto ele vale.
- **Reconhecer e adiar:** aparecem na notificação Crítica de um alerta que ainda pede ação, para quem pode tratá-lo.
- **E-mail e push:** com o `enviar` da fila, a mesma notificação sai pelos canais de fora, sem nada a mais no módulo. O Crítico vai por e-mail na hora, e o resto, ainda não lido, vai no resumo diário das 8h. O push vai aos aparelhos que a conta inscreveu, nas severidades que ela escolheu, e, com o Foco, só o Crítico. A rota passa o `enviar` da fila do app, quando ela está no ar, e a tarefa, o do contexto dela.
- **Texto que sai da aplicação:** o e-mail e o push levam o título, a descrição, a origem e o `destino`, no endereço da organização, e nada que a central não mostre. Como eles aparecem fora da aplicação, como na tela bloqueada do celular, o título e a descrição nunca levam um segredo nem um valor restrito.
- **Retenção:** a manutenção diária apaga as notificações de mais de 90 dias. Nenhum módulo inventa notificações para preencher a central.

A web não tem um `notificar`: o `useNotificacoes()` lê as notificações da API, e a casca as mostra.

### Retorno de operação

O resultado de uma operação que o próprio usuário acabou de fazer usa `avisar`, do `@grafite/ui`, e não uma notificação. Ele segue o tempo escolhido nos Ajustes, não entra na central nem no número do sino e aparece mesmo com os avisos daquela severidade desligados (ilustrativo):

```ts
avisar({ situacao: 'sucesso', titulo: 'Ativo salvo' });
```

### Aviso com ação

Um aviso que pede uma decisão oferece uma ação com nome próprio e fica na tela até a pessoa agir ou fechar, em qualquer severidade:

```ts
// packages/ui/src/componentes/aviso/avisos.ts (trecho)
  /**
   * Uma ação com nome próprio, como "Atualizar": o botão primário do aviso, antes de "Fechar".
   * Escolhida, ela acontece e o aviso sai da tela.
   */
  acao?: { rotulo: string; aoEscolher: () => void };
  /**
   * Fica na tela até a pessoa agir ou fechar, qualquer que seja a severidade e o tempo escolhido,
   * como a versão nova da aplicação. O crítico é sempre persistente.
   */
  persistente?: boolean;
```

É assim que a casca avisa a versão nova da aplicação:

```ts
// apps/web/src/pwa/versaoNova.ts (trecho)
      avisar(
        {
          situacao: 'info',
          titulo: 'Nova versão do Grafite',
          descricao: 'Atualizar recarrega a página na versão nova.',
          persistente: true,
          acao: { rotulo: 'Atualizar', aoEscolher: () => void trocarDeVersao(true) },
        },
        fila,
      );
```

As regras:
- **"Fechar"** continua sempre à vista, ao lado da ação.
- **Persistente só para decisão:** o resultado de uma operação continua temporário. Um persistente não sai da tela por causa de outro aviso, e, com três persistentes na tela, o seguinte espera a vez.
- **Fora da central:** como o retorno de operação, o aviso do `avisar` não entra na central nem no número do sino.

## Indicadores

Um módulo mostra um indicador só quando ele tem uma decisão ligada, com uma meta (ANTISLOP, §5 e §30). O número sem a meta e sem o que fazer não entra. O módulo usa o `Indicador` da biblioteca, que mostra o nome, o que mede, o valor ou o motivo sem valor, o anterior, a meta, a situação em texto e, fora da meta, a decisão:

```tsx
// packages/ui/src/componentes/indicador/Indicador.tsx (trecho)
export interface PropsDoIndicador extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** O nome, que é o título da seção. */
  nome: string;
  /** Uma linha com o que o indicador mede. */
  mede: string;
  /** A base do cálculo, como "Mediana de 3 trocas". */
  base?: string;
  /** O valor em texto, como "1,5 dia". Sem ele, o indicador mostra `semValor`. */
  valor?: string;
  /** O motivo de não ter valor, como "Nenhum toner trocado nos últimos 30 dias.". */
  semValor?: string;
  /** O valor do período anterior em texto, como "2,3 dias" ou "sem dado". */
  anterior: string;
  /** A meta em texto, como "2 dias". */
  meta: string;
  situacao: SituacaoDoIndicador;
  /** O que fazer com o indicador fora da meta. */
  decisao: string;
  /** A ação de quem usa o indicador, como "Mudar a meta". */
  acao?: ReactNode;
  /** O detalhe, como a lista do que passou da meta. */
  children?: ReactNode;
}
```

As regras, como os indicadores dos alertas (P3d) e os da operação (P4f) fazem:
- **Cálculo no domínio:** a conta de cada indicador fica no `@grafite/domain`, pura, e a API e a avaliação diária a usam. A API devolve números, e a web os escreve pelas funções do domínio, as mesmas da notificação.
- **Grupo do módulo:** cada indicador é de um grupo do domínio, como `INDICADORES_DOS_ALERTAS` e `INDICADORES_DA_OPERACAO`, com a tela, a rota da leitura e a rota da meta do módulo dele. As metas dos grupos ficam numa tabela só, e a avaliação diária avalia cada grupo com o módulo dele ligado.
- **Sem dado:** o indicador sem dado diz o motivo, e nunca um zero. O que conta itens, como ativos e toners, mostra o motivo também com zero, como "Nenhum ativo abaixo de 99%.".
- **Metas:** são da organização, com a de fábrica e os limites no domínio, e quem as muda fica na auditoria. A ação "Mudar a meta" entra pelo `acao`, só para quem pode, com o `MudarAMeta` de `apps/web/src/modulos/indicadores/`, que confere a meta pelo domínio antes de mandar e recebe a rota da meta do módulo e a chave da consulta que relê:

```tsx
// apps/web/src/modulos/indicadores/MudarAMeta.tsx (trecho)
/** A rota da meta de cada módulo: a dos alertas ou a da operação. */
export type RotaDaMeta =
  | '/alertas/indicadores/{indicador}/meta'
  | '/operacao/indicadores/{indicador}/meta';
```

- **Lista e foco:** a lista do que passou da meta, com "E mais <N>.", é a `ListaDoIndicador`, e o foco pelo endereço, o `useFocoNoIndicador`, ambos da mesma pasta. O `data-foco` passa para a seção do indicador, e a tela o aplica quando os dados chegam, para a notificação levar ao indicador.
- **Meta mudada:** a meta nova grava o evento `metas.mudaram`, para quem vê o indicador. O evento não diz o indicador, e cada módulo com indicadores o liga à consulta dos dele:

```ts
// apps/web/src/modulos/operacao/modulo.ts (trecho)
    // A meta de um indicador, do Operação ou do Alertas: o evento não diz qual.
    'metas.mudaram': () => [CHAVE_DOS_INDICADORES_DA_OPERACAO],
```

- **Fora da meta avisa:** uma avaliação diária notifica, pelo `notificar`, quem decide no módulo do indicador, como `alertas.administrar` ou `operacao.administrar`, com a origem do módulo, só quando o indicador sai da meta. O indicador não vira ocorrência em "O que resolver agora".

## Datas e horas

A casca mostra datas e horas no fuso escolhido em Ajustes › Idioma e região: "Seguir o sistema", de fábrica, ou um fuso da lista. Um módulo formata datas e horas pelo `useDataHora()`, do `@grafite/ui`, e nunca pelo fuso do navegador, com `toLocaleString` ou um `Intl.DateTimeFormat` sem fuso:

```ts
// packages/ui/src/regiao/dataHora.ts (trecho)
export interface DataHora {
  /** O fuso em vigor, como "America/Manaus": o escolhido, ou o do sistema. */
  fuso: string;
  /** "qui 24 set 14:32": o formato do relógio da barra. */
  formatarHorario: (data: Date) => string;
  /** "07/10/2026 14:32": com o ano, para registros de qualquer época, como os da auditoria. */
  formatarDataEHora: (data: Date) => string;
  /** "07/10/2026": o dia com o ano, como o de quando a conta entrou num grupo. */
  formatarData: (data: Date) => string;
  /** O primeiro instante do dia `aaaa-mm-dd` no fuso. */
  inicioDoDia: (dia: string) => Date;
  /** O último instante do dia `aaaa-mm-dd` no fuso: um período até ele inclui o dia inteiro. */
  fimDoDia: (dia: string) => Date;
  /** "14:32". */
  formatarHora: (data: Date) => string;
  /** "qua 23 set". */
  formatarDia: (data: Date) => string;
  /** "Hoje", "Ontem" ou o dia, com a virada do dia no fuso. */
  grupoDoDia: (data: Date, agora: Date) => string;
}
```

Um filtro de período por datas, como o da auditoria, converte o dia escolhido no `CampoDeData` pelo `inicioDoDia` e pelo `fimDoDia`, para o período incluir os dias inteiros no fuso escolhido.

O relógio da barra, a central de notificações e a seção Idioma e região usam o mesmo gancho. A troca do fuso nos Ajustes vale na hora: os componentes que usam o gancho se desenham de novo no fuso novo. A ficha de um ativo mostraria a última leitura assim (ilustrativo):

```tsx
const { formatarHorario } = useDataHora();
return <time dateTime={leitura.toISOString()}>{formatarHorario(leitura)}</time>;
```

## Prévia na tabela

A tabela base (`Tabela`) abre a prévia com a barra de espaço na linha em foco, pelo `aoPreverLinha`. O hook `usePrevia`, do `@grafite/ui`, liga a tabela à prévia (`QuickLook`):
- as setas trocam de registro na ordem da tabela, sem dar a volta;
- Enter aciona a ação principal, como "Abrir";
- Esc e o espaço fecham, com o foco na linha do registro que estava na prévia.

A tabela de exemplo do catálogo faz assim, como o P1 fará com a de ativos:

```tsx
// packages/ui/src/componentes/tabela/Tabela.stories.tsx (trecho)
function TabelaComPrevia() {
  const previa = usePrevia(ATIVOS, (ativo) => ativo.id);
  const ativo = previa.item;
  return (
    <>
      <TabelaDeAtivos aoAbrirLinha={() => {}} aoPreverLinha={previa.aoPreverLinha} />
      {ativo && (
        <QuickLook
          aberta={previa.aberta}
          aoFechar={previa.aoFechar}
          titulo={ativo.nome}
          subtitulo={ativo.local}
          posicao={previa.posicao}
          total={previa.total}
          visual={{ tipo: ativo.tipo }}
          campos={[
            { rotulo: 'Patrimônio', valor: ativo.patrimonio, mono: true },
            { rotulo: 'Situação', valor: ativo.situacao.texto },
          ]}
          aoAnterior={previa.aoAnterior}
          aoSeguinte={previa.aoSeguinte}
        />
      )}
    </>
  );
}
```

A prévia também aceita:
- `acoes`: as ações do registro, com `principal: true` na que responde ao Enter;
- `estado` e `aoTentarDeNovo`: o esqueleto enquanto carrega, e o erro com "Tentar de novo";
- outro conteúdo em `visual`, como o 3D do T1.

As tabelas seguem sozinhas as preferências de Ajustes › Tabelas. As linhas alternadas não pedem nada ao módulo, e a miniatura entra com `ColunaDaMiniatura` e `CelulaDaMiniatura`, que somem juntas quando o usuário as desliga.

## Tabela configurável e visões

Toda tabela usa a tabela base do `@grafite/ui`, e cada coluna declara a espécie do que mostra (`especie` na `Coluna`; change tabelas-consistentes): `numero` põe o cabeçalho e o valor à direita, na mono; `codigo` põe o valor na mono, como o patrimônio, o CNPJ e o IP; `data` mantém o momento numa linha; `situacao` é a coluna do `RotuloDeSituacao`; e a `ColunaDeAcoes` é a coluna "Ações", com os botões à direita, lado a lado, numa linha só. A `Celula` segue a espécie da coluna dela, sem repetir. O tempo desde um momento vem do `haQuantoTempo` ("Há 3 h"), e a lista diz quantos itens tem pela `ContagemDaLista` ("4 pessoas"), acima da tabela.

Uma tabela de registros pode ser configurável: colunas que o usuário escolhe, ordena e redimensiona, a ordem e os filtros pelas colunas, e as visões salvas da conta e da organização (spec tabelas-configuraveis e visoes-de-tabela). O que o usuário muda fica guardado sozinho na conta, sem um "Salvar", e volta em qualquer aparelho.

**Registrar a tabela.** A tabela entra em `TABELAS_COM_VISOES`, no domínio, com o módulo dela, a permissão de vê-la e a visão de fábrica, e em `TABELAS_COM_VISOES_NO_BANCO`, no `packages/db`. As colunas são uma lista de `ColunaDaTabela`, com o rótulo, o grupo do painel "Colunas", o filtro, se ordena, o alinhamento, a fonte e a largura, como `colunasDosAtivos` faz para os ativos. A API das visões (`/visoes` e `/visoes/mudancas`) serve a tabela nova sem mudança, e o módulo invalida `["visoes", tabela]` no evento `visoes.mudaram`, que também traz as mudanças guardadas em outra sessão da conta. Ajustes › Tabelas conta e restaura as mudanças da conta em toda tabela registrada, sem nada do módulo.

**O estado na conta e no endereço.** A tabela compõe três camadas: o endereço, as mudanças da conta e a visão salva. A rota lê o endereço com `lerEnderecoDaTabela` no `validateSearch`: a visão aberta, a busca e, só numa tabela que veio de um link, as colunas, a ordem e os filtros. Na tela:
- `useVisoes(tabela)` e `visoesUsaveis` dão as visões, com a de fábrica, `mudancasDaConta` dá as mudanças guardadas da conta, e `useVisaoQueAbre` dá a visão que abre, pelas duas camadas das preferências;
- `useGuardarTabela(tabela)` dá o `guardar`, que grava a mudança 400 ms depois da última, nas mudanças da conta ou na própria visão dela, e na hora ao sair da página, e o `descarregar`, que grava na hora o que espera;
- `useEstadoDaTabela`, com as mudanças da conta e o `guardar`, dá a tabela como aparece e o estado dela ("salva", "personalizada" ou "do-link"), mudar, voltar à tabela da conta, restaurar e escolher, reescreve o endereço sem visão e avisa da visão removida ou atualizada pela organização;
- `useVisoesDaTabela` dá a escolha da visão, para a barra, a linha de estado, para logo abaixo dela, e os diálogos: salvar como nova, duplicar, restaurar, salvar na visão da organização, renomear, remover e o padrão da organização;
- `useFixadas(tabela, visoes)` dá as visões fixadas no menu do módulo, as da conta, nas preferências dela (`tabelas.fixadas`), e as da organização, nos padrões (`tabelas.fixadasPelaOrganizacao`), e fixa e desafixa, gravando a lista inteira da camada, até 20, só com as visões que ainda existem. O módulo as põe no dock pelo menu dinâmico.

**A barra e os filtros.** A `BarraDaTabela` tem duas faixas: na primeira, os filhos (a escolha da visão, a busca e os controles da tabela) e a `contagem` à direita, como "1.204 ativos", ou "Atualizando…" enquanto a consulta nova não chega; na segunda, os `filtros` ativos ou, com a `selecao`, as ações em lote, as do menu de contexto que aceitam várias linhas. A `linhaDaVisao` fica entre as duas. Uma tabela que não é configurável também usa a barra para o lote: as Solicitações do Operação (change p4d-solicitacoes) dão à `Tabela` a `selecao`, só para quem atende, com o número como chave da linha, e à barra a ação "Mudar a situação", que abre a gaveta do lote com os números escolhidos; a seleção continua ao trazer mais linhas e é limpa depois da mudança e quando a busca ou um filtro mudam. Os filtros pelas colunas:
- o `PainelDeFiltros` lista as colunas que se filtram nos grupos, com a busca e "Filtrada" em texto, e mostra à direita o editor da escolhida; ele abre num `Popover` preso ao botão "Filtros" ou, pelo "Filtrar…" da coluna, ao cabeçalho dela;
- o `EditorDeFiltro` recebe as opções com `quantos`, que a tela pede só da coluna aberta, e `resultadoDaEscolha`, o texto do botão, como "Mostrar 134 ativos"; na lista múltipla, sem ele, o botão fica "Aplicar filtro". Os ativos contam por `GET /ativos/contagens`;
- os `FiltrosAtivos` dizem o `operador` quando a coluna tem mais de um (`partesDoFiltro` e `operadoresDa`, no domínio), e com o `editor` cada rótulo abre o editor do filtro preso a ele, e Backspace nele o tira;
- com um filtro de tipo, `colunasDosAtivos({ ..., tiposFiltrados })` põe primeiro os grupos daqueles tipos e os dos outros em `GRUPO_DOS_OUTROS_TIPOS`, que os painéis abrem recolhido (`recolhidos`).

**O carregamento.** Com `carregando`, a `Tabela` sem linhas desenha o esqueleto delas sob as colunas, e com as linhas de antes as mantém, com o `aria-busy` e uma linha de progresso, sem esmaecer o texto. A tela pede a consulta com `placeholderData: keepPreviousData` e passa `carregando` na primeira carga e enquanto a consulta nova não chega.

**Seleção, menu, resumo e copiar.** A `Tabela` seleciona com Ctrl e Shift por `selecao` e `aoMudarSelecao`, sem tirar do clique a abertura do registro. `menuDeContexto` dá os itens para as linhas, `aoCopiar` recebe as linhas do Ctrl+C, e `linhasParaCopiar` monta o texto com tabulações. `resumoDaLinha` dá as colunas de uma linha, com o rótulo e o valor, e a tabela mostra as que estão fora da área visível e as que tiveram o conteúdo cortado na célula quando o mouse para 1,5 s. No resumo, o valor aparece inteiro: o que passa da largura dele continua na linha de baixo, também o `ValorComposto`. A tela limpa a seleção quando a busca, um filtro, a ordem ou a visão mudam.

**A prévia paginada.** Numa lista paginada, o `usePrevia` recebe o total, a página seguinte e a seleção: a posição conta o total, a seta que passa do último carregado traz a página seguinte, com o esqueleto, e, aberta numa linha selecionada, a prévia passa só pelos selecionados. A história do catálogo faz assim:

```tsx
// packages/ui/src/componentes/tabela/TabelaComPrevia.stories.tsx (trecho)
  const previa = usePrevia(lista, (item) => item.id, { total: TOTAL, carregarMais, selecao });
  const item = previa.item;
  return (
    <>
      <Tabela
        rotulo="Equipamentos"
        alturaMaxima="320px"
        aoAbrirLinha={() => {}}
        aoPreverLinha={previa.aoPreverLinha}
        carregarMais={carregarMais}
        selecao={selecao}
        aoMudarSelecao={definirSelecao}
      >
```

A tabela virtualizada (`virtualizada`) ocupa a altura que recebe, como a de `useAlturaAteOFim`, que mede até o fim da área que rola da janela, e traz a página seguinte sozinha ao fim da rolagem, pelo mesmo `carregarMais`.

## Relações nas fichas

O que um módulo mostra na ficha de um registro de outro entra pelas `relacoes` do registro, sem mudar o módulo dono da ficha:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/** O registro de outro módulo em cuja ficha uma relação aparece. */
export type AlvoDaRelacao = 'pessoa' | 'local' | 'modelo' | 'tipo' | 'ativo' | 'fornecedor';

/**
 * O que um módulo mostra na ficha de um registro de outro (change relacoes-vivas, design, decisão
 * 4), como os ativos sob responsabilidade de uma pessoa: o componente recebe o id do registro e
 * desenha uma linha da ficha, ou nada. Some com o módulo desligado, como o dock e a busca.
 */
export interface RelacaoDoModulo extends ExigePermissoes {
  alvo: AlvoDaRelacao;
  /** Recebe o id do registro e, quando a ficha o dá, o nome dele, como o rótulo do ativo. */
  componente: ComponentType<{ id: string; nome?: string }>;
  /**
   * A linha que a relação dá ao cartão da Visão geral da ficha do ativo, como "1 alerta aberto"
   * (change ficha-em-cartoes, design, decisão 3). Feito pelo `resumoDaRelacao`.
   */
  resumo?: ResumoDaRelacao;
}

/** O que a consulta do resumo de uma relação recebe da ficha. */
export interface ContextoDoResumo {
  api: ClienteDaApi;
  consultas: QueryClient;
}

/**
 * O resumo de uma relação: a consulta que traz o que ele precisa, de preferência pelas mesmas
 * consultas do componente, para não pedir de novo, e o texto de uma linha, ou nada.
 */
export interface ResumoDaRelacao<TDados = unknown> {
  consulta: (
    id: string,
    contexto: ContextoDoResumo,
  ) => { queryKey: QueryKey; queryFn: () => Promise<TDados> };
  texto: (dados: TDados) => string | null;
}
```

A ficha mostra as relações do alvo dela com `<RelacoesDaFicha alvo="pessoa" id={pessoa.id} />` (`apps/web/src/modulos/relacoes.tsx`), que lê o registro da conta: só as dos módulos ligados e as que a conta pode ver, pelas permissões da relação. Desligado o módulo, a relação some sem recarregar. Cada componente recebe o id do registro e desenha uma linha da ficha, ou nada, como quando a conta não vê o que ele conta. O Ativos registra cinco, para quem tem `ativos.ver`: os ativos sob responsabilidade da pessoa, os do local, aqui e com os de dentro, os do modelo e do tipo, ou "Nenhum ativo deste modelo.", e os do fornecedor, "Ativos deste fornecedor: N" (change p4a-fornecedores), cada um com o link que abre a tabela com a origem do registro. A ficha da pessoa, a do modelo, a do tipo, a do fornecedor e os detalhes do local mostram as relações. A ficha do ativo mostra as do alvo `ativo` no cartão da Visão geral, com o rótulo dele no `nome` (`<RelacoesDaFicha alvo="ativo" id={ficha.id} nome={ficha.rotulo} />`): o Alertas registra o bloco Alertas (`apps/web/src/modulos/alertas/AlertasNaFicha.tsx`), com os alertas abertos do ativo e o silêncio, que só aparece quando a API diz que a conta vê os alertas no local do ativo (`permite.ver`). O Operação registra a seção Solicitações (`apps/web/src/modulos/operacao/solicitacoes/NaFichaDoAtivo.tsx`, change p4d-solicitacoes), para quem vê as solicitações: as pendentes do ativo e as 5 encerradas mais novas, por `GET /ativos/{id}/solicitacoes`, e, para quem atende, "Nova solicitação", que abre o Toner, quando a API diz que o tipo do ativo usa consumíveis (`usaConsumiveis`), ou o Conserto, com o ativo no endereço (`/operacao/solicitacoes?nova=toner&ativo=<id>`). A consulta fica sob a chave das solicitações, que o evento `solicitacoes.mudaram` relê, sem o registro do Ativos. Ao lado, a seção Ordens de serviço (`apps/web/src/modulos/operacao/ordens/NaFichaDoAtivo.tsx`, change p4e-ordens-de-servico), para quem vê as OS: as em aberto do ativo e as 5 resolvidas ou encerradas mais novas, por `GET /ativos/{id}/ordens`, e, para quem atende, "Nova ordem de serviço", com o ativo no endereço (`/operacao/ordens?nova=true&ativo=<id>`), sob a chave das OS, que o evento `ordens.mudaram` relê. O bloco de outro módulo na ficha do ativo tem como título o `Carimbo` do `@grafite/ui`, com o id que a seção usa no `aria-labelledby` (`` <Carimbo id={`alertas-${id}`}>Alertas</Carimbo> ``), para ter o mesmo desenho dos títulos dos blocos do Ativos (change componentes-v3).

Uma relação do alvo `ativo` pode dar também uma linha ao resumo do cartão da Visão geral, pelo `resumo`, feito com o `resumoDaRelacao` (`apps/web/src/modulos/relacoes.tsx`): a consulta, de preferência pelas mesmas consultas do componente, para não pedir de novo com o bloco aberto, e o texto, ou nada quando não há o que dizer. A ficha lê os resumos com o `useResumosDasRelacoes('ativo', id)`, que segue as relações que a conta vê, e os junta por " · "; sem nenhum, a Visão geral diz "Nada pede atenção". O resumo dos alertas (`apps/web/src/modulos/alertas/resumo.ts`) diz "1 alerta aberto", "N alertas abertos" ou "Alertas silenciados", com a chave sob a dos alertas, que o evento `alertas.mudaram` relê:

```ts
// apps/web/src/modulos/alertas/resumo.ts (trecho)
export const resumoDosAlertas = resumoDaRelacao<DadosDoResumo>({
  consulta: (id, { api, consultas }) => ({
    queryKey: [...CHAVE_DOS_ALERTAS, 'resumo-do-ativo', id],
    queryFn: async () => {
      const silencio = await consultas.fetchQuery(opcoesDoSilencio(id, api));
      if (!silencio.permite.ver) return { ver: false, abertos: 0, silenciado: false };
      const alertas = await consultas.fetchInfiniteQuery(
        opcoesDosAlertas({ situacao: 'abertos', ativo: id }, api),
      );
      return {
        ver: true,
        abertos: alertas.pages[0]?.total ?? 0,
        silenciado: silencio.silencio !== null,
      };
    },
  }),
  texto: textoDoResumoDosAlertas,
});
```

A relação é do módulo que a registra: o registro da conta tira o módulo que ela não vê com tudo o que ele registra, as relações também, mesmo a relação sem permissões. Um dado de outro módulo que é referência do registro, e que vale para quem não vê aquele módulo, não é uma relação: a ficha dona o mostra, lendo a API do outro módulo, e o esconde só com aquele módulo desligado, como o fornecedor no ativo. Assim, os consumíveis compatíveis de um modelo (change p4b-consumiveis) aparecem na ficha do modelo, pela seção `ConsumiveisDoModelo` do Ativos (`apps/web/src/modulos/ativos/modelos/ConsumiveisDoModelo.tsx`), e na ficha do ativo, no painel do cartão da capacidade `consumiveis.compatibilidade`, que a API da ficha traz. Os dois usam a lista do Operação (`apps/web/src/modulos/operacao/consumiveis/ListaDeCompativeis.tsx`), em que só quem vê os consumíveis abre a ficha do consumível, e é o registro do Ativos que os relê com o evento `consumiveis.mudaram`. Na ficha do ativo, a lista recebe o id do ativo: cada compatível mostra o saldo somado nos locais em que a conta vê o estoque, que a API da ficha traz (change p4c-estoque), e, para quem movimenta, "Registrar saída", que abre o Estoque com a saída do consumível para o ativo no endereço. O registro do Ativos relê a ficha também com o evento `estoque.mudou`.

Uma relação pode juntar partes com permissões diferentes. O Operação registra uma no alvo `fornecedor` (`apps/web/src/modulos/operacao/estoque/NoFornecedor.tsx`), com as permissões dos consumíveis e as do estoque: a relação aparece para quem tem qualquer uma delas, e o componente mostra cada parte só a quem tem a permissão dela, conferida com o `useAcesso`. Para quem vê os consumíveis, "Consumíveis deste fornecedor", com os ativos que ele vende, cada um levando à ficha; para quem vê o estoque, "Entradas no estoque: N, a última em <data>", com o link para as movimentações dele, ou as linhas que dizem que não há nenhum.

## Cadastros numa aba

Um campo que aponta o registro de outro módulo, como o Local do ativo, abre o cadastro dele numa aba da janela, sem fechar a tela de onde veio, e volta com o registro criado (change cadastro-em-abas). O módulo dono do cadastro o declara nos `cadastros` do registro, pelo que ele cria:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/** O que um cadastro cria, e que o campo de outro módulo pode pedir numa aba da janela. */
export type AlvoDoCadastro = 'local' | 'pessoa' | 'tipo' | 'modelo' | 'fornecedor' | 'consumivel';

/**
 * Um cadastro do módulo que abre numa aba da janela, pedido pelo campo de outro módulo (change
 * cadastro-em-abas, design, decisão 4), como o Novo local da Administração no campo Local do
 * ativo. O corpo é o mesmo da tela do módulo. Some sem a permissão e com o módulo desligado.
 */
export interface CadastroDoModulo extends ExigePermissoes {
  alvo: AlvoDoCadastro;
  /** O título da aba, como "Novo local". */
  titulo: string;
  /** O texto do link embaixo do campo, como "Cadastrar novo local". */
  link: string;
  componente: ComponentType<PropsDoCadastroNaAba>;
}
```

O componente é o corpo do formulário, o mesmo da tela do módulo, e recebe da aba:

```ts
// apps/web/src/casca/abasDoApp.tsx (trecho)
/** O que o corpo de um cadastro recebe numa aba. */
export interface PropsDoCadastroNaAba {
  /** Os valores com que o formulário abre, como o tipo do ativo no Novo modelo. */
  inicial?: Readonly<Record<string, string>>;
  /** O cadastro foi salvo: a aba fecha, e o registro vai ao campo que o pediu. */
  aoConcluir: (registro: RegistroCriado) => void;
  /** O Cancelar do formulário, que fecha a aba como o botão de fechar dela. */
  aoCancelar: () => void;
  /** Se algo já foi preenchido: fechar a aba, então, pede confirmação. */
  aoMudarPreenchido: (preenchido: boolean) => void;
}
```

As regras do corpo:
- **O pedido e o retorno:** o corpo faz o pedido à API, mostra as recusas nos campos e, ao salvar, avisa com o retorno dele, como "Local cadastrado.", e chama `aoConcluir` com o registro criado. A tela do módulo usa o mesmo corpo e, no `aoConcluir`, navega para a ficha, como a Nova pessoa (`apps/web/src/modulos/administracao/pessoas/PessoaNova.tsx`).
- **Sem navegar:** o roteador é da primeira aba, a da tela. O corpo só chama `aoConcluir` e `aoCancelar`.
- **O que foi preenchido:** o corpo avisa por `aoMudarPreenchido` se algo já foi digitado. Fechar a aba, ou o Cancelar, pergunta então "Fechar sem salvar?".

O campo pede o cadastro pelo alvo, sem conhecer o módulo, com o `CampoComCadastro` (`apps/web/src/modulos/cadastros.tsx`). Ele põe embaixo do campo o link do cadastro, como "Cadastrar novo local", só para a conta que pode criá-lo e com o módulo ligado, e, quando a aba fecha, devolve o foco ao campo:

```tsx
// apps/web/src/modulos/ativos/cadastro/CampoDoAtivo.tsx (trecho)
        <CampoComCadastro
          alvo="local"
          campo={definicao.rotulo}
          chave={definicao.chave}
          aoCriar={(local) => aoMudar(local.id)}
        >
          <SeletorDeLocal {...comum} valor={escolhido} aoMudar={aoMudar} />
        </CampoComCadastro>
```

Para um pedido fora de um campo, como o "Cadastrar novo tipo" do cadastro do ativo sem nenhum tipo, o `useCadastro(alvo)` devolve o título, o texto do link e o `pedir`, ou nada sem a permissão. Um campo dentro de uma gaveta, como o do consumível no lançamento do estoque (`apps/web/src/modulos/operacao/estoque/Lancamento.tsx`), pede o cadastro pelo `useCadastro` num componente fora da gaveta, e põe o `LinkDeCadastro` da biblioteca embaixo do campo: a gaveta, que cobriria a aba, sai da frente enquanto o cadastro está aberto e volta com o registro criado no campo, e o que foi preenchido fica guardado nesse componente, fora dela. A Administração registra o Novo local (`locais.editar`), a Nova pessoa (`pessoas.editar`) e o Novo fornecedor (`fornecedores.editar`, change p4a-fornecedores), o Ativos, o Novo tipo (`catalogo.administrar`) e o Novo modelo (`modelos.editar`), e o Operação, o Novo consumível (`consumiveis.editar`, change p4c-estoque), que volta ao campo pelo código. Os campos do ativo do tipo fornecedor, como o Fornecedor do Administrativo, pedem o Novo fornecedor pelo `CampoComCadastro`, como os de local e de pessoa.

As abas são da casca: a primeira é a tela do roteador, com o nome dela, e as outras são os cadastros abertos pelos campos, cada uma com o título dele. A barra aparece só com mais de uma aba. As de trás continuam montadas, escondidas e inertes, com o que foi preenchido nelas. Navegar pelo dock, pela busca, por um menu ou por uma notificação leva à primeira aba, e as de cadastro continuam abertas. Uma aba de cadastro pode pedir outra, como a Nova pessoa pede o Novo local pelo Local de trabalho, e cada uma volta à que a pediu.

## Referência com cartão

Uma tela que cita um registro, como o responsável de um ativo, mostra a referência a ele: o link para a ficha, com o nome em texto, e o cartão do resumo na camada flutuante, com o ponteiro parado 500 ms ou a seta para baixo no foco (spec componentes-base, "Referência com cartão"). A `ReferenciaComCartao` da biblioteca recebe o link, como o roteador o desenha, o nome do cartão e o conteúdo, desenhado só com ele aberto. O conteúdo usa o `CartaoDoRegistro` e lê o resumo com `useResumo(registro, id)` (`apps/web/src/relacoes/resumos.ts`), que busca ao abrir, cancela a busca se o cartão fechar antes da resposta, guarda o resumo por 30 s e o relê pelos eventos que invalidam `CHAVE_DOS_RESUMOS`.

As referências prontas ficam perto das telas do módulo dono: `ReferenciaAPessoa`, `ReferenciaAoLocal`, `ReferenciaAoModelo` e `ReferenciaAoTipo`. A referência só é link com cartão para quem abre a ficha do registro: a pessoa, para quem a vê no local de trabalho dela, como a lista dos ativos diz em `permite.verResponsavel`; o local, para quem abre a tela de locais, que recebe o local no endereço (`?local=`); o modelo e o tipo, sempre. Fora disso, e na pessoa anonimizada, é o texto. As células da tabela dos ativos usam as referências assim:

```ts
// apps/web/src/modulos/ativos/tabela/celulas.tsx (trecho)
/**
 * As relações do ativo como referências com cartão (spec cadastro-de-ativos, "Relações do ativo à
 * vista"): o tipo, o modelo, o local e o responsável; nenhuma nas outras colunas e no vazio.
 */
export function referenciaNaColuna(chave: string, ativo: AtivoNaLista): ReactNode | undefined {
  switch (chave) {
    case 'ativo.tipo':
      return <ReferenciaAoTipo tipo={ativo.tipo} />;
    case 'ativo.modelo':
      return ativo.modelo ? <ReferenciaAoModelo modelo={ativo.modelo} /> : undefined;
    case 'ativo.local':
      return ativo.local ? <ReferenciaAoLocal local={ativo.local} /> : undefined;
    case 'ativo.responsavel':
      return ativo.responsavel ? (
        <ReferenciaAPessoa pessoa={ativo.responsavel} comCartao={ativo.permite.verResponsavel} />
      ) : undefined;
  }
  return undefined;
}
```

Numa célula da `Tabela`, o clique e o Enter seguem o link, sem abrir a linha nem mexer na seleção, e o resumo da linha não aparece sobre a referência. A seta para baixo continua da grade, e o cartão abre com Alt+seta para baixo. Na prévia, a seta para baixo num link é dele.

"Ver ativos" e "Ver na tabela" abrem a tabela dos ativos com a origem no endereço, `origem=<tipo>:<id>`, com o tipo `local`, `pessoa`, `modelo`, `tipo` ou `fornecedor`, que `origemNoEndereco` monta (`apps/web/src/modulos/ativos/origem.ts`). A origem vira o filtro da coluna dela, fora da visão e das mudanças da conta, com a faixa que diz de onde a tabela veio (`FaixaDaOrigem`, na `origem` da `BarraDaTabela`). No local, ela abre só com ele, e "Incluir os locais de dentro" põe `dentro=true` no endereço. "Novo ativo" leva a origem ao cadastro, que vem com o campo dela preenchido.

## Escolhas

Toda escolha mostra as opções antes de qualquer tecla (spec componentes-base, "Escolha com as opções à vista"; design do escolhas-a-vista, decisão 7). O controle sai do número de opções e de onde elas vêm:

| Opções | Controle |
|---|---|
| Até 5 | Rádios (`GrupoDeRadios`), ou o `ControleSegmentado` para modos de vista |
| Várias de até cerca de 15 | Checkboxes (`GrupoDeCheckboxes`) |
| De 6 a 15, com um padrão claro e pouco espaço | A seleção fechada (`Selecao`) |
| Até cerca de 300, na memória | A `BuscaComSugestoes`, que abre pelo clique |
| Mais que isso, ou na API | A `BuscaComSugestoes` com `sugestoesDeFora`, as sugestões do contexto e o `total` |
| Locais | A escolha em árvore (`SeletorDeLocal`, sobre a `EscolhaEmArvore`) |

**A busca com sugestões.** Ela abre pelo clique, pelo botão "Mostrar as opções de <rótulo>" e pela seta para baixo, e se estreita enquanto se digita, sem diferenciar acento e maiúsculas. As opções do contexto vão em `sugeridas`, com a origem em texto, como "Do mesmo local do ativo", e aparecem primeiro, sob o cabeçalho "Sugeridos"; as outras vêm em ordem alfabética, salvo com `manterOrdem`. Com as opções da API, a tela busca as primeiras sem o texto e passa o `total` que a API devolve: com mais do que as mostradas, o painel diz "Digite para buscar entre N". O `SeletorDeConta` já faz isso para quem busca contas ou pessoas na API. O campo do tipo fornecedor usa o mesmo seletor, com a busca dos fornecedores ativos (`useBuscarFornecedores`, em `apps/web/src/modulos/administracao/fornecedores/escolha.ts`), que acha pelo nome e pelo começo do CNPJ (change p4a-fornecedores).

**A escolha em árvore.** O `SeletorDeLocal` mostra no campo o caminho do escolhido, e o painel traz o filtro pelo caminho, o local sugerido pela tela (`sugerido`, com a origem, como "local de trabalho de Bruno") e a árvore. Os locais que não podem ser escolhidos (`excluir`) ficam à vista e apagados, para o que está dentro deles ser alcançado.

**Escolhas que dão acesso.** A escolha que muda o que alguém pode fazer, como incluir num grupo ou atribuir um perfil, diz o efeito em texto antes de confirmar, pela própria tela: o que a conta passa a ter, deixa de ter ou já tem por outro caminho. A API confere tudo de novo ao gravar.

## Cursor

O cursor suavizado abraça sozinho botões, links, abas e segmentos compactos (até 320 × 128 px), e dá lugar ao cursor do sistema nos campos de texto. Dois atributos cobrem os outros casos:
- **`data-cursor-abracar`:** pede o abraço num elemento interativo sem um desses papéis. O segmento do controle segmentado, um rótulo com o rádio escondido, usa assim:

```tsx
// packages/ui/src/componentes/escolhas/ControleSegmentado.tsx (trecho)
export function Segmento({ children, className, ...resto }: PropsDoSegmento) {
  return (
    <RadioDoReactAria
      {...resto}
      // O segmento é um rótulo com o rádio escondido: pede o abraço do cursor suavizado.
      data-cursor-abracar=""
      className={[estilos.segmento, className].filter(Boolean).join(' ')}
    >
      {children}
    </RadioDoReactAria>
  );
}
```

- **`data-cursor-nativo`:** dentro do elemento marcado, o ponto e o anel somem, e vale o cursor do sistema que o CSS pedir. É para onde o cursor diz algo que o anel não diz, como a alça de redimensionar coluna do P1 (ilustrativo):

```tsx
<div data-cursor-nativo className={estilos.alcaDeRedimensionar} />
```

Itens de menu, opções de lista, elementos desabilitados e áreas grandes, como linhas de tabela, nunca são abraçados.

## Barra de rolagem

A área que rola de um módulo não declara barra nenhuma: a folha base do `@grafite/ui` dá a mesma barra a toda área com `overflow` (spec componentes-base, "Barra de rolagem própria"). Ela é fina, e o polegar aparece com o ponteiro sobre a área, com o foco do teclado nela e enquanto ela rola, ou sempre, pela preferência `aparencia.barraDeRolagem`. Onde o sistema já sobrepõe a barra ao conteúdo, como no celular, vale a dele. O módulo:
- não usa `scrollbar-width`, `scrollbar-color` nem os pseudo-elementos da barra; a exceção é `scrollbar-width: none`, na área que esconde a barra de propósito, como uma barra de abas;
- conta com os 12 px da barra na largura da área que rola para baixo: o espaço fica reservado, e o conteúdo não muda de lugar quando o polegar aparece;
- não marca a rolagem: a casca acompanha a de qualquer área (`data-rolando`), também a que o módulo faz pelo código.

Nos testes de ponta a ponta o navegador esconde as barras, como o celular, e vale a do sistema; as histórias do catálogo rodam com as barras à vista.

## Permissões

O que cada conta pode fazer vem dos perfis dela, num local e no que está dentro dele ou na organização inteira (design do F2b, decisões 2 e 4). O módulo declara as permissões dele no catálogo, mostra só o que a conta pode usar e deixa a API decidir cada registro.

### O catálogo

As permissões são do sistema, e não da organização: cada módulo acrescenta as suas ao `PERMISSOES`, do `@grafite/domain`, que a API e a web leem. Cada uma diz a área, a descrição, se vale num local ou só na organização inteira e o que traz junto:

```ts
// packages/domain/src/acesso/permissoes.ts (trecho)
export interface DefinicaoDePermissao {
  /** "area.acao", em minúsculas e sem acento, como `pessoas.editar`. */
  chave: string;
  /** O grupo da permissão na ficha do perfil, como "Pessoas". */
  area: string;
  /** Escrita para caber depois de "Você não tem permissão para…". */
  descricao: string;
  escopo: EscopoDaPermissao;
  /** As permissões que ela traz junto, como ver quem se edita. */
  inclui: readonly string[];
}
```

Como a de ver pessoas:

```ts
// packages/domain/src/acesso/permissoes.ts (trecho)
  {
    chave: 'pessoas.ver',
    area: 'Pessoas',
    descricao: 'Ver pessoas e contas',
    escopo: 'local',
    inclui: [],
  },
```

O perfil Administrador tem todas, inclusive as que um módulo acrescentar depois, sem nenhuma mudança nele.

### No registro

O módulo, os itens de menu, as entradas de busca, os provedores e a fonte de ocorrências podem exigir permissões:

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/**
 * O que exige permissões aparece só para a conta que tem ao menos uma delas, em qualquer escopo
 * (spec estrutura-da-casca). Sem a lista, aparece para todos.
 */
export interface ExigePermissoes {
  permissoes?: readonly Permissao[];
}
```

A casca, a busca e a tela inicial leem o registro como a conta o vê, sem os módulos que a organização desligou (veja Módulo opcional):

```ts
// apps/web/src/modulos/registroDaConta.ts (trecho)
/** O id do módulo opcional que liga e desliga o módulo: o do dono, para o que é parte de outro. */
export const interruptorDe = (modulo: Pick<ModuloRegistrado, 'id' | 'parteDe'>): string =>
  modulo.parteDe ?? modulo.id;

/** Só o que a conta pode usar, sem os módulos desligados e sem mudar o registro dado. */
export function registroDaConta(
  registro: readonly ModuloRegistrado[],
  pode: Pode,
  desligados: readonly string[] = [],
): ModuloRegistrado[] {
  return registro
    .filter((modulo) => !desligados.includes(interruptorDe(modulo)) && permite(pode, modulo))
    .map((modulo) => moduloDaConta(modulo, pode));
}
```

As rotas continuam todas: a tela diz quando falta permissão. A Administração aparece para quem tem a permissão de ao menos uma seção, com o menu e a busca de cada uma só para quem a pode usar. A permissão `backup.administrar` só vale na organização que opera o servidor: nas outras, o `useAcesso()` não a dá, então a seção Backup some do menu e da lista, e o endereço dela leva à primeira seção:

```ts
// apps/web/src/modulos/administracao/modulo.ts
import { UserCog } from 'lucide-react';
import { CHAVE_DOS_RESUMOS } from '../../relacoes/resumos.ts';
import { definirModulo } from '../tipos.ts';
import { CHAVE_DO_BACKUP } from './backup/Backup.tsx';
import { ENTRADAS_DA_ADMINISTRACAO, provedorDePessoas } from './busca.ts';
import { CHAVE_DOS_COLETORES } from './coletores/consultas.ts';
import { CHAVE_DO_DIRETORIO } from './diretorio/consultas.ts';
import { CHAVE_DO_FORNECEDOR, CHAVE_DOS_FORNECEDORES } from './fornecedores/consultas.ts';
import { NovoFornecedorNaAba } from './fornecedores/NovoFornecedorNaAba.tsx';
import { NovoLocalNaAba } from './locais/NovoLocalNaAba.tsx';
import { CHAVE_DOS_MODULOS } from './modulos/Modulos.tsx';
import { NovaPessoa } from './pessoas/NovaPessoa.tsx';
import { rotasDaAdministracao } from './rotas.tsx';
import { SECOES } from './secoes.ts';
import { CHAVE_DAS_TAREFAS } from './tarefas/Tarefas.tsx';

/**
 * A Administração no registro (spec modulo-administracao): para quem tem ao menos a permissão de
 * uma das seções, com o menu de cada seção só para quem a pode usar. No celular, fica em "Mais".
 * Na busca, as pessoas e as ações de cadastro, cada uma com a permissão dela. Os eventos atualizam
 * as listas e as fichas abertas (spec eventos-em-tempo-real).
 */
export const administracao = definirModulo({
  id: 'administracao',
  nome: 'Administração',
  icone: UserCog,
  endereco: '/administracao',
  prioridadeNoCelular: 'mais',
  rotas: rotasDaAdministracao,
  permissoes: [...new Set(SECOES.map((secao) => secao.permissao))],
  menu: SECOES.map((secao) => ({
    rotulo: secao.nome,
    destino: secao.endereco,
    permissoes: [secao.permissao],
  })),
  busca: { entradas: ENTRADAS_DA_ADMINISTRACAO, provedores: [provedorDePessoas] },
  // Os cadastros que os campos dos outros módulos abrem numa aba (change cadastro-em-abas).
  cadastros: [
    {
      alvo: 'local',
      titulo: 'Novo local',
      link: 'Cadastrar novo local',
      permissoes: ['locais.editar'],
      componente: NovoLocalNaAba,
    },
    {
      alvo: 'pessoa',
      titulo: 'Nova pessoa',
      link: 'Cadastrar nova pessoa',
      permissoes: ['pessoas.editar'],
      componente: NovaPessoa,
    },
    {
      alvo: 'fornecedor',
      titulo: 'Novo fornecedor',
      link: 'Cadastrar novo fornecedor',
      permissoes: ['fornecedores.editar'],
      componente: NovoFornecedorNaAba,
    },
  ],
  eventos: {
    // Uma pessoa, a conta ou a foto dela: as listas e a ficha, o acesso e as sessões da conta, e os
    // resumos dos cartões, que mostram a pessoa e as pessoas de cada local.
    'pessoas.mudaram': ({ alvo }) => [
      ['pessoas'],
      CHAVE_DOS_RESUMOS,
      alvo?.tipo === 'pessoa' ? ['pessoa', alvo.id] : ['pessoa'],
      ['acesso-da-conta'],
      ['sessoes-da-conta'],
    ],
    // O caminho de um local aparece nas pessoas e nos escopos do acesso.
    'locais.mudaram': () => [
      ['locais'],
      ['pessoas'],
      ['pessoa'],
      ['acesso-da-conta'],
      CHAVE_DOS_RESUMOS,
    ],
    'acessos.mudaram': () => [
      ['perfis'],
      ['perfil'],
      ['grupos'],
      ['grupo'],
      ['acesso-da-conta'],
      ['acesso'],
    ],
    // Uma tarefa entrou na lista das tarefas com falha ou saiu dela.
    'tarefas.mudaram': () => [CHAVE_DAS_TAREFAS],
    // Um backup ou um teste de restauração terminou, ou o horário deles mudou.
    'operacao.mudou': () => [CHAVE_DO_BACKUP],
    // Um módulo opcional foi ligado ou desligado.
    'modulos.mudaram': () => [CHAVE_DOS_MODULOS],
    // Um coletor foi cadastrado, alterado, inativado ou reativado, ou trocou o token.
    'coletores.mudaram': () => [CHAVE_DOS_COLETORES],
    // O diretório ou um mapeamento mudou.
    'diretorio.mudou': () => [CHAVE_DO_DIRETORIO],
    // Um fornecedor foi cadastrado, editado, inativado ou reativado: as listas, as fichas e a origem
    // da tabela dos ativos, que mostra o nome dele.
    'fornecedores.mudaram': () => [CHAVE_DOS_FORNECEDORES, CHAVE_DO_FORNECEDOR, CHAVE_DOS_RESUMOS],
  },
});
```

### Na tela

`useAcesso()` diz o que a conta da sessão pode, já com as permissões incluídas, e acompanha as mudanças da sessão:

```ts
// apps/web/src/sessao/useAcesso.ts (trecho)
export interface Acesso {
  /** A conta tem a permissão em algum escopo: na organização ou em algum local. */
  pode(chave: Permissao): boolean;
  /** As permissões como a API as dá, com o escopo de cada uma. */
  permissoes: readonly PermissaoDaSessao[];
}
```

```ts
// apps/web/src/sessao/useAcesso.ts (trecho)
/**
 * Só a sessão que vale tem permissões; a desconhecida e a pendente não têm nenhuma, e as da
 * operadora só valem na organização que opera o servidor. O acesso muda só quando as permissões
 * ou a organização mudam: a loja mantém os mesmos objetos entre as validações.
 */
export function useAcesso(): Acesso {
  const sessao = useSessao();
  const operaOServidor = useServidor()?.operaOServidor ?? false;
  const acesso = sessao.tipo === 'ativa' ? sessao.acesso : null;
  return useMemo(
    () => (acesso ? acessoDe(acesso, operaOServidor) : SEM_ACESSO),
    [acesso, operaOServidor],
  );
}
```

O `pode` serve para mostrar uma tela ou uma ação geral, como "Nova pessoa". O que a conta pode fazer num registro, a API diz: a ficha traz o `permite` de cada ação, conferido no local do registro, e a tela oferece só o que ele permite, como o `pessoa.permite.editar` na ficha da pessoa.

### A tela sem permissão

O endereço de uma tela sem a permissão dela mostra o título, "Você não tem acesso a…" e a quem pedir, sem pedir os dados da tela:

```tsx
// apps/web/src/modulos/administracao/SemPermissao.tsx (trecho)
export function SemPermissao({ a }: { a: string }) {
  const api = useApi();
  const administradores = useQuery({
    queryKey: ['acesso', 'administradores'],
    queryFn: () =>
      consultar(() => api.GET('/acesso/administradores'), 'buscar quem administra os acessos'),
  });
  const nomes = administradores.data?.administradores ?? (administradores.isError ? [] : null);
  return (
    <EstadoVazio
      icone={Lock}
      titulo={`Você não tem acesso ${a}.`}
      descricao={nomes ? pedirAcessoA(nomes) : undefined}
    />
  );
}
```

A Administração guarda cada seção assim:

```tsx
// apps/web/src/modulos/administracao/Secao.tsx (trecho)
export function Secao({ id, children }: { id: IdDaSecao; children: ReactNode }) {
  const secao = SECOES.find((candidata) => candidata.id === id);
  const { pode } = useAcesso();
  if (!secao) return null;
  if (!pode(secao.permissao)) {
    return (
      <>
        <CabecalhoDaPagina titulo={secao.nome} />
        <SemPermissao a={secao.semAcesso} />
      </>
    );
  }
  return children;
}
```

### Na API

Toda rota declara a permissão que exige, ou a exceção que só pede a sessão, e a rota que não declara nem é registrada. A guarda confere a permissão em algum escopo antes de validar o pedido, e a recusa responde 403 `sem-permissao` e entra na auditoria:

```ts
// apps/api/src/acesso/escopo.ts (trecho)
  interface FastifyContextConfig {
    /** A permissão que a rota exige, em algum escopo: a guarda confere antes de validar o pedido. */
    permissao?: Permissao;
    /** A rota que exige só a sessão. */
    semPermissao?: ExcecaoDePermissao;
    /** A rota que nunca conta como uso da sessão, como a conexão de eventos. */
    naoContaComoUso?: true;
  }
```

Depois de ler o registro, a rota confere o local dele:

```ts
// apps/api/src/acesso/escopo.ts (trecho)
/**
 * O registro está no alcance da permissão: a rota confere depois de ler o registro, com o local
 * dele. O registro sem local (`null`) só é alcançado pela permissão da organização inteira.
 */
export function exigirEm(
  requisicao: FastifyRequest,
  permissao: Permissao,
  localId: string | null,
  arvore: Pick<ArvoreDeLocais, 'ancestrais'>,
) {
  const { sessao } = requisicao;
  if (!sessao) throw semSessao();
  if (!podeEm(sessao.acesso, permissao, localId, arvore)) throw new RecusaDePermissao(permissao);
}
```

Uma lista filtra pelo alcance, que é a organização inteira, os ramos dos locais da conta ou nada:

```ts
// packages/domain/src/acesso/acesso.ts (trecho)
/**
 * Até onde a permissão vale, para filtrar uma consulta: a organização inteira, os locais de todos
 * os ramos juntos, ou nada.
 */
export function alcance(
  acesso: Acesso,
  chave: Permissao,
  arvore: Pick<ArvoreDeLocais, 'ramo'>,
): 'organizacao' | Set<string> | null {
  const alcanceDela = acesso.permissoes.get(chave);
  if (!alcanceDela) return null;
  if (alcanceDela.organizacao) return 'organizacao';
  if (alcanceDela.locais.size === 0) return null;
  const locais = new Set<string>();
  for (const raiz of alcanceDela.locais) for (const id of arvore.ramo(raiz)) locais.add(id);
  return locais;
}
```

Como a lista de pessoas:

```ts
// apps/api/src/rotas/pessoas.ts (trecho)
  app.get(
    '/pessoas',
    {
      config: { permissao: 'pessoas.ver' },
      schema: {
        summary: 'As pessoas que a conta pode ver, em ordem alfabética',
        querystring: FiltrosDePessoas,
        response: { 200: ListaDePessoas, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const filtros = requisicao.query;
      const depoisDe = filtros.cursor ? decodificarCursor(filtros.cursor, ChaveDaPessoa) : null;
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const condicoes = condicoesDaLista(
          filtros,
          alcance(sessao.acesso, 'pessoas.ver', arvore),
```

## Módulo opcional

Cada organização pode desligar um módulo opcional, para usar só o que precisa (spec modulos-da-organizacao). Quem tem `organizacao.editar` liga e desliga cada um na seção Módulos da Administração. O Início, a Administração e os Ajustes não são opcionais. Um módulo do dock que faz parte de outro, como a Gestão de ativos, declara `parteDe` com o id do dono e segue o interruptor dele: some com o dono desligado, e o endereço das telas dele diz que o dono está desligado. O módulo opcional entra nos `MODULOS_OPCIONAIS`, do `@grafite/domain`, com o mesmo id do registro, o nome e a descrição que a seção mostra:

```ts
// packages/domain/src/modulos/modulos.ts (trecho)
export const MODULOS_OPCIONAIS = [
  { id: 'ativos', nome: 'Ativos', descricao: 'O catálogo, o cadastro e a lista dos ativos.' },
  {
    id: 'cofre',
    nome: 'Cofre',
    descricao: 'Os segredos da organização, com o acesso por segredo.',
  },
  {
    id: 'alertas',
    nome: 'Alertas',
    descricao: 'As regras de alerta e os alertas dos ativos e dos coletores.',
  },
  {
    id: 'operacao',
    nome: 'Operação',
    descricao:
      'Os consumíveis, os modelos em que eles servem, o estoque por local, as solicitações, as ordens de serviço e os indicadores da operação.',
  },
  {
    id: 'salas',
    nome: 'Salas',
    descricao: 'As salas de reunião, a agenda, os pedidos de reserva e os convites.',
  },
  {
    id: 'paineis',
    nome: 'Painéis',
    descricao: 'Os painéis das VMs, a verificação de cada um e a grade que os mostra lado a lado.',
  },
] as const satisfies readonly ModuloOpcional[];
```

Um módulo opcional começa ligado em toda organização. Desligá-lo não apaga nada: ligado de novo, ele volta com os dados que havia. Com ele desligado:
- **Na casca:** o estado da sessão traz os `modulosDesligados` da organização, e o `registroDaConta` os tira, como tira o que a conta não pode ver. O módulo some do dock, da barra de abas, da busca e do Início, com os menus, as entradas, os provedores e a fonte de ocorrências dele.
- **No endereço:** as rotas continuam no registro. No lugar das telas do módulo, a casca mostra "O módulo Ativos está desligado nesta organização." e a quem pedir para ligá-lo, e as telas dele não abrem nem pedem nada à API.
- **Nas sessões abertas:** ligar e desligar gravam o evento `modulos.mudaram`, e cada sessão valida o estado de novo em até 1 s. A recusa `modulo-desligado` de uma leitura também valida a sessão, e a tela aberta passa a dizer que o módulo está desligado, sem recarregar.
- **Na API:** as rotas do módulo ficam num escopo com a guarda do módulo, que as recusa com 403 (`modulo-desligado`). Uma rota nova do módulo entra no escopo e já nasce guardada:

```ts
// apps/api/src/app.ts (trecho)
    // O módulo Ativos, opcional: o catálogo e os ativos são recusados com ele desligado.
    await escopo.register(async (doAtivos) => {
      exigirModuloLigado(doAtivos, { banco, modulo: 'ativos' });
      await doAtivos.register(rotasDosTiposDeAtivo, { banco, agora });
      await doAtivos.register(rotasDosCampos, { banco, agora });
      await doAtivos.register(rotasDosModelos, { banco, agora });
      await doAtivos.register(rotasDaImagemDoModelo, { banco, agora, armazenamento });
      await doAtivos.register(rotasDosAtivos, { banco, agora });
      await doAtivos.register(rotasDoRascunhoDoAtivo, { banco, agora });
      await doAtivos.register(rotasDaImagemDoAtivo, { banco, agora, armazenamento });
      await doAtivos.register(rotasDosArquivosDosCampos, { banco, agora, armazenamento });
      await doAtivos.register(rotasDasImportacoes, { banco, agora, fila });
      await doAtivos.register(rotasDoEnvioDaPlanilha, { banco, agora });
      await doAtivos.register(rotasDoControlId, {
        banco,
        agora,
        armazenamento,
        chaveDoisPassos,
      });
      await doAtivos.register(rotasDoAcessoRemoto, { banco, agora, prazo: prazoDoAcessoRemoto });
      await doAtivos.register(rotasDosSoftwares, { banco });
      await doAtivos.register(rotasDaBaseDeSoftware, { banco, agora, armazenamento });
      await doAtivos.register(rotasDasDistribuicoes, { banco, agora, acordar: acordarAgente });
    });
```

O `modulo.ts` não muda para o módulo ser opcional: bastam o id nos `MODULOS_OPCIONAIS` e as rotas da API no escopo guardado. Um módulo opcional novo entra pela sessão orquestradora (regra 7 do `CLAUDE.md`), porque muda o `@grafite/domain` e a API.

## Sessão e API

A casca cuida da entrada e da sessão (design do F2a, decisões 12 e 13). O módulo só aparece com a sessão valendo, ou com a casca aberta sem servidor, e não trata a entrada nem a sessão que termina.

### Quem está na sessão

`useSessao()` diz o estado da sessão e acompanha as mudanças:

```tsx
// apps/web/src/sessao/useSessao.tsx (trecho)
export function useSessao(): EstadoDaSessao {
  const loja = useLojaDaSessao();
  return useSyncExternalStore(loja.assinar, loja.ler);
}
```

Dentro da casca, o estado é `ativa`, com a conta, ou `desconhecida`, quando o servidor não respondeu na chegada. Os outros estados são da tela de entrada:

```ts
// apps/web/src/sessao/loja.ts (trecho)
interface DadosDaSessao {
  organizacao: string;
  conta: ContaDaSessao;
  csrf: string;
  expiraEm: string;
  acesso: AcessoDaSessao;
}

export type EstadoDaSessao =
  /** A primeira validação da página ainda não terminou. */
  | { tipo: 'validando' }
  /** O servidor não respondeu: a casca abre, e a loja valida de novo quando ele voltar. */
  | { tipo: 'desconhecida' }
  /** O endereço não pertence a nenhuma organização. */
  | { tipo: 'endereco-desconhecido' }
  | {
      tipo: 'sem-sessao';
      organizacao: string;
      /** Uma sessão valeu nesta página e terminou: a tela de entrada cobre a casca dela. */
      terminou: boolean;
      /** O usuário da sessão que terminou, que a tela traz preenchido. */
      usuarioAnterior?: string;
      /** Por que a entrada voltou ao usuário e senha, como nos códigos errados demais. */
      mensagem?: string;
    }
  | (DadosDaSessao & {
      tipo: 'pendente';
      pendencia: Pendencia;
      /** Por que o passo apareceu, quando ele surge com a casca aberta. */
      mensagem?: string;
    })
  /** Os dois passos acabaram de ser ativados na entrada: os códigos aparecem antes da casca. */
  | (DadosDaSessao & { tipo: 'pendente'; pendencia: 'guardar-codigos'; codigos: string[] })
  | (DadosDaSessao & { tipo: 'ativa' });
```

Com a sessão desconhecida, o módulo não inventa a conta: mostra o que não depende do servidor e diz que o resto aparece quando a conexão voltar, como faz a seção Conta.

### O cliente da API

`useApi()` entrega o cliente tipado do `@grafite/api-client`, pelo prefixo `/api`:

```tsx
// apps/web/src/api/useApi.tsx (trecho)
export function useApi(): ClienteDaApi {
  const cliente = useContext(Contexto);
  if (!cliente) throw new Error('useApi() precisa do ProvedorDaApi');
  return cliente;
}
```

O cliente põe o token CSRF da sessão nas escritas, e o módulo não monta cabeçalho nenhum. Sem o usuário interagir com a página há 5 min ou mais, a requisição sai com `x-grafite-segundo-plano: 1`, e a API não a conta como uso da sessão: uma tela que se atualiza sozinha não segura a sessão aberta. Uma resposta 401 `sem-sessao` avisa a sessão, e uma 403 `pendencia` ou `sem-permissao` a faz validar de novo, porque o acesso dela mudou:

```ts
// apps/web/src/api/cliente.ts (trecho)
export function criarCliente({
  csrf,
  aoPerderASessao,
  aoMudarOAcesso,
  emSegundoPlano = () => false,
  buscar,
  transportarEnvio = buscar ? transportarPeloFetch(buscar) : transportarPeloNavegador,
}: OpcoesDoCliente) {
  /** A resposta que diz que a sessão terminou ou que o acesso mudou avisa a sessão. */
  async function conferir(response: Response) {
    if (response.status === 401) {
      const problema = await lerProblema(response.clone());
      if (codigoDoProblema(problema) === 'sem-sessao') aoPerderASessao();
    }
    if (response.status === 403) {
      const codigo = codigoDoProblema(await lerProblema(response.clone()));
      if (codigo !== null && ACESSO_MUDOU.has(codigo)) aoMudarOAcesso();
    }
  }

  const cliente = criarClienteDaApi('/api', { fetch: buscar });
  cliente.use({
    onRequest({ request }) {
      const token = csrf();
      if (!LEITURAS.has(request.method) && token) request.headers.set('x-grafite-csrf', token);
      if (emSegundoPlano()) request.headers.set(CABECALHO_DO_SEGUNDO_PLANO, '1');
      return request;
    },
    async onResponse({ response }) {
      await conferir(response);
      return response;
    },
  });

  /**
   * Envia um arquivo num PUT, como a foto de uma pessoa (`/pessoas/<id>/foto`), ou num POST, como a
   * planilha que cria uma importação, com o progresso do envio. A resposta vem como a das outras
   * requisições, para o `pedir()`.
   */
  async function enviarArquivo<T>(
    caminho: string,
    arquivo: Blob,
    aoProgredir: (percentual: number) => void,
    metodo: 'PUT' | 'POST' = 'PUT',
  ): Promise<RespostaDaApi<T>> {
    const token = csrf();
    const response = await transportarEnvio({
      metodo,
      endereco: `/api${caminho}`,
      corpo: arquivo,
      // O formato é conferido pelo conteúdo, e não pelo tipo que o navegador informa.
      cabecalhos: {
        'content-type': 'application/octet-stream',
        ...(token && { 'x-grafite-csrf': token }),
      },
      aoProgredir,
    });
    await conferir(response);
    const corpo: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    return response.ok ? { data: corpo as T, response } : { error: corpo, response };
  }

  return Object.assign(cliente, { enviarArquivo });
}
```

### Falhas em texto

`pedir()` faz o pedido e devolve os dados, ou a falha em texto para a tela:
- **sem resposta do servidor:** "Sem conexão com o servidor. Tente de novo.";
- **num erro do servidor:** "Não foi possível <ação>. Informe à TI o código <código de rastreio>.";
- **numa recusa:** o detalhe que a API escreveu, em pt-BR.

```ts
// apps/web/src/api/pedir.ts (trecho)
/**
 * Faz o pedido e traduz a falha: sem resposta da API (ou com a de um proxy), "Sem conexão…"; num
 * erro do servidor, "Não foi possível <acao>." com o código de rastreio; numa recusa ou na falha de
 * um serviço de fora, o detalhe que a API escreveu.
 */
export async function pedir<T>(
  fazer: () => Promise<RespostaDaApi<T>>,
  acao: string,
): Promise<{ dados: T } | FalhaDoPedido> {
```

A seção Conta lê a conta assim:

```tsx
// apps/web/src/modulos/ajustes/secoes/Conta.tsx (trecho)
  const api = useApi();
  const lerConta = useCallback(() => pedir(() => api.GET('/conta'), 'carregar a conta'), [api]);
```

### Consultas ao servidor

Os dados do servidor nas telas passam pelo TanStack Query (design do F2b, decisão 14). O `App` tem um cliente de consultas que relê ao voltar o foco e tenta de novo só sem conexão. O `consultar()` usa o `pedir()` por baixo, para a falha chegar à tela em texto, como a mensagem do erro da consulta:

```ts
// apps/web/src/api/consultas.ts (trecho)
/** Para o `queryFn`: os dados, ou a falha lançada com o texto para a tela. */
export async function consultar<T>(
  fazer: () => Promise<RespostaDaApi<T>>,
  acao: string,
): Promise<T> {
  const resultado = await pedir(fazer, acao);
  if ('dados' in resultado) return resultado.dados;
  throw new FalhaDaConsulta(resultado);
}
```

A ficha da pessoa lê assim:

```tsx
// apps/web/src/modulos/administracao/pessoas/FichaDaPessoa.tsx (trecho)
  const ficha = useQuery({
    queryKey: chaveDaFicha(id),
    queryFn: () =>
      consultar(() => api.GET('/pessoas/{id}', { params: { path: { id } } }), 'carregar a pessoa'),
  });
```

As listas paginadas usam o `useInfiniteQuery` com o `paginar`, que segue o `proximo` da API, e o `itensDasPaginas` junta as páginas para a tabela, com "Carregar mais":

```ts
// apps/web/src/api/consultas.ts (trecho)
/** As opções de uma lista paginada pelo `proximo`, para o `useInfiniteQuery`. */
export function paginar<P extends PaginaDaApi<unknown>>(
  pedirPagina: (cursor: string | undefined) => Promise<RespostaDaApi<P>>,
  acao: string,
) {
  return {
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      consultar(() => pedirPagina(pageParam), acao),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (ultima: P) => ultima.proximo,
  };
}

/** Os itens de todas as páginas já carregadas, na ordem. */
export function itensDasPaginas<T>(dados: InfiniteData<PaginaDaApi<T>> | undefined): T[] {
  return dados?.pages.flatMap((pagina) => pagina.itens) ?? [];
}
```

Como a lista de pessoas:

```tsx
// apps/web/src/modulos/administracao/pessoas/Pessoas.tsx (trecho)
  const pessoas = useInfiniteQuery({
    queryKey: ['pessoas', parametros],
    ...paginar(
      (cursor) =>
        api.GET('/pessoas', {
          params: { query: { ...parametros, cursor, limite: POR_PAGINA } },
        }),
      'carregar as pessoas',
    ),
  });
  const lista = itensDasPaginas(pessoas.data);
```

As chaves vão por área, como `['pessoas', filtros]` e `['pessoa', id]`. Depois de uma mudança, a tela põe na consulta o que a API devolveu e invalida a área, para as outras telas lerem de novo.

### A sessão que termina

A sessão termina no meio do uso quando expira, quando é encerrada em outro dispositivo ou pela administração e quando o comando no servidor a redefine. O evento `sessao.encerrada`, ou a primeira resposta 401 `sem-sessao`, põe a tela de entrada por cima da casca, que continua montada, inerte e escondida. O módulo não escreve código para isso: o pedido dele volta com a falha, e a entrada já cobre a casca. Quem entra de novo com a mesma conta encontra o módulo no mesmo endereço e no mesmo estado. Outra conta recarrega a página, sem nada da anterior.

## Camada no mapa da planta

Um módulo põe os registros dele no mapa da planta (spec mapa-da-planta; change p7-mapa-da-planta) registrando um fornecedor de marcadores na API, em `FORNECEDORES_DO_MAPA` (`apps/api/src/mapa/mapa.ts`), sem mudar o mapa:

- o `alvoTipo`, como `sala` ou `dashboard`, que a posição guarda junto com o id do registro;
- a `camada`, como "Salas", que o mapa mostra na lista das camadas e deixa ligar e desligar;
- os `marcadores` das posições, só com o que a conta vê, cada um com o rótulo, o detalhe, a situação `{ texto, tom }` e as ações, como "Abrir ficha" ou "Abrir o dashboard";
- o `ve`, que diz se a conta vê o registro, para posicioná-lo.

A situação vai sempre por extenso, e a cor do marcador vem do tom. A tela do módulo relê os marcadores pela chave `['mapa', 'marcadores']` quando o estado dos registros muda.

## Confirmação pelo código do app

Uma ação sensível pode pedir o código do app autenticador de novo, mesmo com a sessão aberta, como revelar e copiar um segredo do Cofre (spec cofre-de-segredos; design do P6, decisões 4, 5 e 12). O módulo não guarda o código nem decide se a confirmação vale: a API decide, a cada pedido.

- A rota da ação recusa com um código próprio quando a confirmação falta ou acabou, como o `cofre-fechado` (403). A recusa já está na auditoria quando a resposta chega.
- A tela abre o pedido do código num diálogo, que diz o que ele libera e por quanto tempo, como "Revelar e copiar ficam liberados por 5 minutos nesta sessão.", e manda o código à rota de liberação do módulo, como `POST /api/cofre/liberacao`. O código de recuperação não serve: a API recusa, e o texto dela aparece no diálogo.
- Com o código certo, a ação pedida continua sozinha, sem outro clique. A resposta da liberação diz até quando ela vale: a tela guarda o horário numa consulta, como a `['cofre', 'liberacao']`, diz "Cofre liberado até 14:32" e deixa de dizer quando a hora passa.
- O que a ação devolve de sensível, como o valor revelado, fica só no estado do componente, nunca no cache das consultas, no armazenamento do navegador ou no log: a ação é uma mutação, não uma consulta. O valor revelado some da tela depois de 30 segundos e ao sair dela.

A conta sem a verificação em dois passos ativa recebe a recusa `cofre-sem-dois-passos` em todas as rotas do Cofre, e a tela mostra a frase da API com o caminho até Ajustes › Conta. O exemplo inteiro é o `apps/web/src/modulos/cofre/RevelarECopiar.tsx`.

## Eventos do servidor

Quando um registro muda, a API avisa as telas abertas (design do F2c, decisões 9 a 12). Com a sessão valendo, a casca mantém uma conexão de eventos com o servidor. Cada evento traz só o tipo, o momento e o alvo, sem os dados do registro:

```ts
// apps/web/src/eventos/canal.ts (trecho)
export interface EventoRecebido {
  id: string;
  tipo: TipoDeEvento;
  momento: string;
  alvo: { tipo: string; id: string | null } | null;
}
```

Os tipos de evento são do sistema, como as permissões, e ficam no `@grafite/domain`:

```ts
// packages/domain/src/eventos/eventos.ts (trecho)
/** Os tipos de evento, na ordem da tabela da spec eventos-em-tempo-real. */
export const TIPOS_DE_EVENTO = [
  'pessoas.mudaram',
  'locais.mudaram',
  'acessos.mudaram',
  'padroes.mudaram',
  'preferencias.mudaram',
  'sessao.encerrada',
  'tarefas.mudaram',
  'operacao.mudou',
  'catalogo.mudou',
  'ativos.mudaram',
  'modulos.mudaram',
  'visoes.mudaram',
  'importacoes.mudaram',
  'disponibilidade.mudou',
  'coletores.mudaram',
  'cofre.mudou',
  'alertas.mudaram',
  'notificacoes.mudaram',
  'fornecedores.mudaram',
  'consumiveis.mudaram',
  'estoque.mudou',
  'solicitacoes.mudaram',
  'ordens.mudaram',
  'metas.mudaram',
  'controlid.mudaram',
  'mapa.mudou',
  'salas.mudaram',
  'paineis.mudaram',
  'diretorio.mudou',
  'software.mudou',
] as const;
```

### No registro

O módulo declara, para cada tipo de evento, as consultas dele que o evento atualiza. Quando o evento chega, a casca invalida essas chaves: as consultas das telas abertas são relidas na hora, e as outras, quando uma tela as usar de novo.

```ts
// apps/web/src/modulos/tipos.ts (trecho)
/**
 * Para cada tipo de evento, as consultas do módulo que ele atualiza (design do F2c, decisão 12),
 * pelo começo da chave, como `['pessoas']`, ou com o alvo do evento, como `['pessoa', alvo.id]`.
 */
export type EventosDoModulo = {
  [T in TipoDeEvento]?: (evento: EventoRecebido) => readonly QueryKey[];
};
```

A tela de tarefas com falha exporta a chave da lista:

```tsx
// apps/web/src/modulos/administracao/tarefas/Tarefas.tsx (trecho)
/** A chave da lista nas consultas, que o evento `tarefas.mudaram` invalida. */
export const CHAVE_DAS_TAREFAS = ['tarefas-com-falha'] as const;
```

E a Administração, no registro (inteiro em Permissões › No registro), liga a chave ao evento:

```ts
// apps/web/src/modulos/administracao/modulo.ts (trecho)
    // Uma tarefa entrou na lista das tarefas com falha ou saiu dela.
    'tarefas.mudaram': () => [CHAVE_DAS_TAREFAS],
```

As regras:
- **Pelo começo da chave:** `['pessoas']` invalida todas as listas de pessoas, com quaisquer filtros, e `['pessoa', alvo.id]`, só a ficha do alvo.
- **Sem dados no evento:** a tela relê pela API, que confere a permissão de cada registro. O módulo nunca monta o registro a partir do evento.
- **Rajada de eventos:** cada chave é relida uma vez por vez. O evento que chega durante a releitura dela marca a chave, e a próxima releitura começa quando a em andamento termina, depois do último evento. Uma importação com milhares de ativos não deixa a lista aberta relendo sem parar.
- **Quem recebe:** a API entrega cada evento só às sessões que podem ver a mudança, pela permissão e pelo escopo de local, e o módulo não filtra nada.
- **O dado de outra capacidade:** a tela que mostra o que outra capacidade guarda é relida também pelo evento dela, que o módulo liga à chave da tela. No Operação, `ordens.mudaram` relê as OS e as solicitações, porque a ficha e a lista do conserto mostram a situação da OS que ele segue (change p4e-ordens-de-servico). Quando a mudança muda as duas, como a OS resolvida que conclui a solicitação de origem, a API grava os dois eventos, cada um com o público dele.
- **Formulários:** começam dos dados do registro ao abrir e guardam o próprio estado. Assim, a releitura atualiza o que é só leitura e não apaga o que foi digitado.
- **Diálogos:** um diálogo aberto fica fora do trecho da tela que a releitura troca. O evento da própria ação relê o registro enquanto o diálogo ainda mostra o resultado dela, como a senha temporária da conta criada, que não aparece de novo.
- **Da casca:** a sessão e as preferências se atualizam sozinhas. `acessos.mudaram`, `modulos.mudaram`, `sessao.encerrada` e a mudança na pessoa ou na conta da própria sessão validam a sessão, e `preferencias.mudaram` e `padroes.mudaram` aplicam as preferências de novo. Quando a conexão pode ter perdido eventos, todas as consultas são invalidadas.
- **Aba escondida:** depois de 5 min escondida, a aba fecha a conexão e, ao voltar, a reabre de onde parou, e os eventos perdidos chegam nessa hora.

### Na API

O evento é gravado na transação da mudança: se ela for desfeita, o evento também é. Cada ação da auditoria diz no `EVENTO_DA_ACAO`, do `@grafite/domain`, o evento que grava, ou `null` quando não muda o que alguma tela mostra, e o `registrarNaAuditoria` grava os dois juntos. Um tipo novo de evento entra no `TIPOS_DE_EVENTO`, com o público dele, pela sessão orquestradora (regra 7 do `CLAUDE.md`).

## Valores coletados

Um valor que o coletor lê, como a disponibilidade de um ativo na rede, aparece com a situação em texto, com o ícone, nunca só pela cor, e com a idade da última leitura, como "há 2 min", com o momento exato ao parar o mouse. A leitura mais antiga que 3 intervalos da métrica ganha "Desatualizado" ao lado, sem trocar a situação mostrada (specs leituras-e-estado e disponibilidade-de-rede, do P2a).

- **A idade anda sozinha:** o `useAgora()` dá o momento de agora, que anda na virada do minuto, como o relógio da barra. Numa tabela, ponha-o nas `dependencias` do `CorpoDaTabela`: as linhas ficam guardadas, e sem isso a idade não anda.
- **Os dados são relidos:** a consulta que mostra valores coletados relê a cada minuto com a aba visível (`refetchInterval: 60_000`; o TanStack Query não relê com a aba escondida), só quando a tela mostra um valor coletado, como a tabela com a coluna Disponibilidade. O evento da mudança, como o `disponibilidade.mudou`, relê a lista e a ficha na hora. Assim, a idade fica no máximo 1 minuto atrás da última leitura.
- **O domínio decide:** quando a leitura está desatualizada (`desatualizada(momento, agora, metrica)`, depois de 3 intervalos da métrica: 6 minutos no ping, 15 na sondagem do Control iD e 30 no SNMP) e os rótulos das situações vêm do `@grafite/domain`, os mesmos da API.

```ts
// apps/web/src/casca/status/useAgora.ts
import { useEffect, useState } from 'react';
import { vigiarOMinuto } from './relogio.ts';

/**
 * O momento de agora para as idades da tela, como "Há 3 min": anda na virada do minuto, como o
 * relógio da barra, sem recarregar os dados.
 */
export function useAgora(): Date {
  const [agora, definirAgora] = useState(() => new Date());
  useEffect(() => vigiarOMinuto(() => definirAgora(new Date())), []);
  return agora;
}
```

A célula da disponibilidade junta a situação, a idade e o "Desatualizado". Na tabela, a linha tem sempre uma linha só (spec componentes-base, "Célula numa linha só"): a célula com mais de uma parte usa o `ValorComposto` do `@grafite/ui`, em que o fixo, com os rótulos de situação, nunca encolhe, e o resto, o texto que os acompanha, encolhe e termina em reticências. A classe que quebra a linha quando falta largura fica só para a ficha. A coluna de um valor assim declara a largura que o conteúdo dela pede (`larguraMinima`, na coluna do domínio e na `Coluna` da tabela): sem largura guardada na visão, ela divide a sobra da área com as outras sem ficar mais estreita que isso, e a tabela rola de lado; as colunas da coleta declaram a largura de fábrica delas, que comporta a leitura em dia e o cabeçalho. O `LeituraNaCelula` monta isso para qualquer valor coletado, com o "Desatualizado" no fixo e a idade no resto:

```tsx
// apps/web/src/modulos/ativos/disponibilidade.tsx (trecho)
/**
 * O valor de uma leitura na célula da tabela (spec componentes-base, "Célula numa linha só"): os
 * rótulos na parte que não encolhe, com o "Desatualizado" ao lado, e a idade na parte que encolhe,
 * depois do texto que a tela puser antes dela.
 */
export function LeituraNaCelula({
  fixo,
  momento,
  agora,
  metrica,
  children,
}: {
  fixo: ReactNode;
  momento: string | null;
  agora: Date;
  metrica?: MetricaDaColeta;
  /** O texto antes da idade, como a descrição do suprimento. */
  children?: ReactNode;
}) {
  return (
    <ValorComposto
      fixo={
        <>
          {fixo}
          {leituraVelha(momento, agora, metrica) && (
            <Desatualizado momento={momento} agora={agora} metrica={metrica} />
          )}
        </>
      }
    >
      {children}
      {momento && <IdadeDaLeitura momento={momento} agora={agora} />}
    </ValorComposto>
  );
}

/** A disponibilidade na célula da tabela: a situação, a idade e o "Desatualizado". */
export function DisponibilidadeNaCelula({
  disponibilidade,
  agora,
}: {
  disponibilidade: Disponibilidade;
  agora: Date;
}) {
  return (
    <LeituraNaCelula
      fixo={<SituacaoNaTela disponibilidade={disponibilidade} />}
      momento={disponibilidade.momento}
      agora={agora}
    />
  );
}
```

### Coluna de situação de outra capacidade

Uma capacidade nova que mostra uma situação, como a saúde do Control iD (spec saude-do-control-id, do P2c), segue a disponibilidade, sem uma via própria:

- **No domínio:** a capacidade declara a coluna coletada com `tipo: 'situacao'` e as opções, na ordem em que o filtro as mostra. A situação, os rótulos, a ordem da coluna e os motivos do "Não verificado" são funções e constantes do `@grafite/domain`, que a API e a tela usam.
- **Na API:** a situação no banco é uma expressão SQL que serve ao filtro "é qualquer de", à contagem das opções e à ordem, com o que pede atenção primeiro. O que depende de outras tabelas, como os logins do cofre, é lido uma vez por pedido no contexto da tabela, e a expressão de cada linha só lê o estado atual: a lista de 10 mil ativos com a coluna fica abaixo de 300 ms.
- **Na tela:** a célula junta a situação, a idade e o "Desatualizado" pela métrica; a coluna entra nas que contam as opções (`contaAsOpcoes`) e nas coletadas que relêem a lista a cada minuto. Cada situação que pede uma ação diferente tem um ícone próprio, além do texto.

```tsx
// apps/web/src/modulos/ativos/control-id.tsx (trecho)
/** A saúde na célula da tabela: a situação, a idade e o "Desatualizado". */
export function ControlIdNaCelula({ saude, agora }: { saude: SaudeDoControlId; agora: Date }) {
  return (
    <LeituraNaCelula
      fixo={<SituacaoNaTela saude={saude} />}
      momento={saude.momento}
      agora={agora}
      metrica="controlid.sondagem"
    />
  );
}
```

### Vários itens

Um ativo pode ter vários valores da mesma métrica, um por item, como cada suprimento e cada contador de uma impressora (spec impressoras-por-snmp, do P2b). Cada item tem a leitura e a idade dele:

- **Na ficha:** os itens numa tabela, na ordem do equipamento, com o nome, o valor em texto e a idade de cada um. O nível tem uma barra só ao lado, na cor de destaque: ela não diz se o valor é bom ou ruim, e um valor que o equipamento não mediu nunca vira número. Quando o equipamento deixa de responder, os itens continuam os da última resposta, com a idade deles.
- **Na tabela:** a coluna mostra um valor só, como o menor nível medido, com o item ao lado e a idade, e filtra "de e até" pelo número. A unidade, como o "%", vai na coluna (`unidade`), no editor do filtro e no filtro ativo.
- **A idade:** o `LeituraNaCelula`, na tabela, e o `IdadeEDesatualizado`, na ficha, recebem a métrica, porque cada uma tem o intervalo dela.
- **O corte:** na célula, o medidor e o número ficam no fixo, e o nome do item e a idade, no resto, que encolhe.

```tsx
// apps/web/src/modulos/ativos/suprimentos.tsx (trecho)
/** O menor nível na célula: o medidor compacto na tinta, o número em mono, o suprimento e a idade. */
export function SuprimentosNaCelula({
  menor,
  agora,
}: {
  menor: NonNullable<NaLista['menor']>;
  agora: Date;
}) {
  return (
    <LeituraNaCelula
      fixo={
        <>
          <span className={estilos.medidorNaCelula}>
            <Medidor
              rotulo={`Menor nível: ${menor.descricao}`}
              valor={menor.nivel}
              tinta={tintaDoSuprimento(menor.descricao) ?? 'neutra'}
              tamanho="compacto"
              marcas={[]}
              semNumero
            />
          </span>
          <span className="mono">{`${menor.nivel}%`}</span>
        </>
      }
      momento={menor.momento}
      agora={agora}
      metrica="impressora.suprimento"
    >
      <span>{menor.descricao}</span>
    </LeituraNaCelula>
  );
}
```

## Preferências

As preferências da interface valem campo a campo: a escolha da conta, senão o padrão da organização, senão o de fábrica (design do F2c, decisões 4 e 5). A casca as aplica sozinha: o tema, o destaque, a densidade e o resto vão para o `<html>`, as tabelas seguem Ajustes › Tabelas, e as datas, o fuso, pelo `useDataHora()`. O módulo lê o `usePreferencias()` só quando uma preferência muda o comportamento dele:

```tsx
// apps/web/src/preferencias/usePreferencias.tsx (trecho)
export interface ControleDasPreferencias {
  preferencias: PreferenciasDaInterface;
  /**
   * Muda campos de uma seção; vale na hora e é gravado na conta. Valores fora do intervalo são
   * presos, e os desconhecidos, como um fuso que o navegador não reconhece, saem da conta, e vale o
   * padrão da organização.
   */
  mudar: <S extends SecaoDePreferencias>(
    secao: S,
    mudanca: Partial<PreferenciasDaInterface[S]>,
  ) => void;
  /** Volta uma seção inteira aos padrões da organização, sem mexer nas outras. */
  restaurar: (secao: SecaoDePreferencias) => void;
}
```

Por trás do mesmo gancho:
- **Servidor:** a camada da organização e a da conta chegam com a sessão, antes de a casca aparecer. O `mudar` vale na hora e vai para a conta 400 ms depois da última mudança, então arrastar um controle grava uma vez.
- **Sem servidor:** a mudança fica no navegador, com a conta, e vai quando a sessão volta a valer para a mesma conta. Outra conta não a herda.
- **Outro dispositivo e padrões:** a mudança feita em outro dispositivo ou nos padrões da organização chega pelos eventos e vale sem recarregar.

O módulo não grava preferência por conta própria. Uma ação que muda uma preferência, como "Usar o tema Névoa" na busca, chama o `mudarPreferencias` que recebe, como no exemplo de Ajustes, mais abaixo.

### Seções de preferências

As seções dos Ajustes leem o alvo das preferências, e não o `usePreferencias()`. Por padrão, o alvo é a conta. Em Administração › Padrões, é o rascunho dos padrões da organização, e as mesmas seções editam os padrões sem mudar a casca de quem edita:

```tsx
// apps/web/src/preferencias/alvo.tsx (trecho)
export interface AlvoDasPreferencias {
  /** As preferências que as seções mostram. */
  preferencias: PreferenciasDaInterface;
  mudar: <S extends SecaoDePreferencias>(
    secao: S,
    mudanca: Partial<PreferenciasDaInterface[S]>,
  ) => void;
  restaurar: (secao: SecaoDePreferencias) => void;
  /** O nome do botão que restaura a seção; sem ele, "Restaurar padrões". */
  rotuloDeRestaurar?: string;
  /** As seções numa aba de outra tela, como a de padrões: a aba já as nomeia, sem o título. */
  numaAba?: boolean;
}
```

A seção Dock lê o alvo e põe o título pelo `TituloDaSecao`:

```tsx
// apps/web/src/modulos/ajustes/secoes/Dock.tsx (trecho)
export function SecaoDock() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { posicao, tamanho, ampliar, ocultar } = preferencias.dock;
  // No tablet, o dock fica embaixo qualquer que seja a posição salva.
  const tablet = usePostura() === 'tablet';
  return (
    <>
      <TituloDaSecao>Dock</TituloDaSecao>
```

E restaura pelo `RestaurarPadroes`:

```tsx
// apps/web/src/modulos/ajustes/secoes/Dock.tsx (trecho)
          <RestaurarPadroes secao="dock" />
```

As regras:
- **Título:** o `TituloDaSecao`, que põe o título no `CabecalhoDaPagina`, e não o cabeçalho direto, porque numa aba dos padrões a aba já nomeia a seção.
- **Restaurar:** o `RestaurarPadroes` diz "Restaurar padrões" na conta e "Restaurar padrões de fábrica" nos padrões.
- **Prévias:** a tabela de exemplo, o aviso de exemplo e a hora no fuso leem o alvo, e não a casca. Nos padrões, mostram o rascunho, e não as preferências de quem edita.
- **O que é da conta:** o que não é uma preferência, como o e-mail da pessoa, os aparelhos inscritos e os testes dos canais, aparece só com o alvo na conta, pelo `useAlvoEhAConta()`. Nos padrões, a seção Notificações mostra só as escolhas do e-mail e do push.
- **Preferência nova:** entra no modelo do `@grafite/domain`, com o padrão de fábrica, e no esquema que a API confere ao gravar, pela sessão orquestradora (regra 7 do `CLAUDE.md`).

## Foto da pessoa

O `Avatar`, do `@grafite/ui`, mostra a foto da pessoa recortada no círculo. Sem foto, ou se ela não carregar, mostra as iniciais do nome (design do F2c, decisão 8). A API gera miniaturas de 64, 128, 256 e 512 px de cada foto, e a pessoa e a sessão trazem só o id da foto. O `api/fotos.ts` monta os endereços:

```ts
// apps/web/src/api/fotos.ts (trecho)
/** As miniaturas da foto de uma pessoa, para quem pode ver a pessoa. */
export const miniaturasDaPessoa = (pessoaId: string, foto: { id: string } | null) =>
  miniaturas(`/api/pessoas/${pessoaId}/foto`, foto);

/** As miniaturas da foto da pessoa da própria conta, que ela vê sem permissão. */
export const miniaturasDaConta = (foto: { id: string } | null) =>
  miniaturas('/api/conta/foto', foto);
```

O avatar recebe as miniaturas em `imagens`, e o tamanho diz onde ele aparece:

```tsx
// packages/ui/src/componentes/avatar/Avatar.tsx (trecho)
/**
 * Onde o avatar aparece: na barra e nos menus, na linha das tabelas (segue a densidade, como a
 * miniatura) ou no título das fichas.
 */
export type TamanhoDoAvatar = 'barra' | 'linha' | 'ficha';
```

A lista de pessoas mostra a foto na coluna da miniatura:

```tsx
// apps/web/src/modulos/administracao/pessoas/Pessoas.tsx (trecho)
                  <CelulaDaMiniatura>
                    <Avatar
                      nome={pessoa.nome}
                      imagens={miniaturasDaPessoa(pessoa.id, pessoa.foto)}
                      tamanho="linha"
                      decorativo
                    />
                  </CelulaDaMiniatura>
```

As regras:
- **A menor que basta:** as miniaturas viram o `srcSet`, com carga preguiçosa, e o navegador baixa a menor que serve ao tamanho e à densidade de pixels da tela.
- **Foto nova, endereço novo:** cada foto tem o seu id, e o navegador guarda cada uma sem servir a antiga depois da troca. Para mostrar a foto nova, a tela só relê a pessoa, o que o evento `pessoas.mudaram` já faz.
- **Decorativo:** com o nome ao lado, o avatar é só desenho (`decorativo`). Sozinho, ele é uma imagem com o nome da pessoa.
- **Quem vê:** a foto da pessoa pede a permissão de ver a pessoa, e a da própria conta (`miniaturasDaConta`) aparece sem permissão nenhuma.

A troca da foto usa a `EscolhaDeImagem`, do `@grafite/ui`, e o `enviarArquivo` do cliente da API, que dá o progresso do envio. A ficha da pessoa faz assim:

```tsx
// apps/web/src/modulos/administracao/pessoas/FotoDaPessoa.tsx (trecho)
        const resultado = await pedir(
          () => api.enviarArquivo<Ficha>(`/pessoas/${pessoa.id}/foto`, arquivo, definirProgresso),
          'trocar a foto',
        );
```

## Etapas da chegada

Se a abertura passar de 500 ms, a chegada mostra o carregamento, com a etapa atual em texto e uma barra que avança quando uma etapa termina, e nunca por tempo. Desde o P3b, as etapas são "Carregando o Grafite", "Carregando suas preferências", "Validando sessão", "Conectando alertas", só com a sessão valendo, e "Pronto". Outra parte do app, como a sessão no F2a e os alertas no P3b, põe a sua espera como uma etapa:

```ts
// apps/web/src/chegada/etapas.ts (trecho)
export interface EtapaDaChegada {
  /** O que a chegada espera, em texto, como "Validando sessão". */
  rotulo: string;
  /**
   * Termina quando a espera termina de verdade, e nunca por tempo. Não falha: uma etapa que depende
   * do servidor termina também sem ele, porque a chegada não espera o servidor.
   */
  pronta: () => Promise<void>;
  /**
   * Se a etapa vale nesta chegada, perguntado na vez dela; sem valer, ela termina na hora e o
   * carregamento não a mostra. Sem isto, ela sempre vale.
   */
  vale?: () => boolean;
}
```

As etapas entram pela opção `etapas` da chegada, no `main.tsx`, e aparecem na ordem da lista, depois das do F1c e antes de "Pronto":

```tsx
// apps/web/src/chegada/chegar.tsx (trecho)
  /** As etapas de outras partes do app, como "Validando sessão" no F2, antes de "Pronto". */
  etapas?: readonly EtapaDaChegada[];
```

As etapas que dependem do servidor dividem um prazo: somadas, elas não esperam mais de 5 s. A primeira a esperar marca o começo, e cada espera termina, no máximo, 5 s depois dele:

```ts
// apps/web/src/chegada/prazo.ts (trecho)
export interface PrazoDoServidor {
  /** Marca o começo da espera pelo servidor, se ele ainda não foi marcado. */
  comecar(): void;
  /** Espera a resposta até o fim do prazo, contado do começo. Não falha. */
  esperar(resposta: Promise<unknown>): Promise<void>;
}
```

A etapa "Validando sessão" é a da sessão. Ela espera no máximo 5 s, e sem resposta a casca abre com a sessão desconhecida. É ela que marca o começo do prazo:

```ts
// apps/web/src/sessao/etapa.ts
// A etapa "Validando sessão" da chegada (spec chegada): consulta a sessão no servidor e termina em
// até 5 s, com ou sem resposta. A primeira tela, a casca ou a entrada, segue o estado da loja. Com o
// prazo do servidor, ela marca o começo da espera, e as etapas seguintes dividem os mesmos 5 s.
import type { EtapaDaChegada } from '../chegada/etapas.ts';
import type { PrazoDoServidor } from '../chegada/prazo.ts';
import type { LojaDaSessao } from './loja.ts';

export function etapaDaSessao(loja: LojaDaSessao, prazo?: PrazoDoServidor): EtapaDaChegada {
  return {
    rotulo: 'Validando sessão',
    pronta: () => {
      prazo?.comecar();
      return loja.validar();
    },
  };
}
```

A etapa "Conectando alertas" é a das notificações. Ela só vale com a sessão valendo e espera, no que resta do prazo, as notificações recentes, as da contagem do sino, e a conexão de eventos aberta:

```ts
// apps/web/src/notificacoes/etapa.ts
// A etapa "Conectando alertas" da chegada (spec chegada, "Carregamento com etapas reais"; change
// p3b-notificacoes-no-servidor, design, decisão 11): com a sessão valendo, a chegada espera as
// notificações recentes, as da contagem do sino, e a conexão de eventos aberta, dentro do prazo
// que divide com a sessão. Sem a sessão valendo, a etapa não vale, e o carregamento não a mostra.
// A leitura não tenta de novo: sem ela, a casca abre com o sino sem número, e o sino lê depois.
import type { QueryClient } from '@tanstack/react-query';
import type { EtapaDaChegada } from '../chegada/etapas.ts';
import type { PrazoDoServidor } from '../chegada/prazo.ts';
import type { ConexaoDeEventos } from '../eventos/conexao.ts';
import type { LojaDaSessao } from '../sessao/loja.ts';
import { opcoesDasRecentes } from './useNotificacoes.tsx';

export interface OpcoesDaEtapaDosAlertas {
  loja: LojaDaSessao;
  /** O cliente das consultas do app, onde as recentes ficam para o sino. */
  consultas: QueryClient;
  conexao: Pick<ConexaoDeEventos, 'aberta'>;
  prazo: PrazoDoServidor;
}

export function etapaDosAlertas({
  loja,
  consultas,
  conexao,
  prazo,
}: OpcoesDaEtapaDosAlertas): EtapaDaChegada {
  return {
    rotulo: 'Conectando alertas',
    vale: () => loja.ler().tipo === 'ativa',
    pronta: () =>
      prazo.esperar(
        Promise.all([
          consultas.prefetchQuery({ ...opcoesDasRecentes(loja.cliente), retry: false }),
          conexao.aberta(),
        ]),
      ),
  };
}
```

As duas entram assim no `main.tsx`:

```tsx
// apps/web/src/main.tsx (trecho)
    etapas: [
      etapaDaSessao(sessao, prazo),
      etapaDosAlertas({ loja: sessao, consultas, conexao, prazo }),
    ],
```

As regras:
- **Espera real:** a promessa termina quando a espera termina. Nenhuma etapa usa um temporizador para a barra andar.
- **Sem falha:** sem resposta do servidor, a etapa termina do mesmo jeito, e o item de rede avisa. A chegada nunca prende a casca esperando a API.
- **Prazo do servidor:** a etapa que espera a API usa o prazo, para a chegada inteira não esperar o servidor mais de 5 s.
- **Só quando vale:** a etapa que depende de um estado, como a dos alertas, que depende da sessão, diz quando vale. Sem valer, ela não aparece, e a barra conta a etapa como concluída.
- **Rótulo:** a espera em texto de operação, como "Validando sessão".
- **Limite de 500 ms:** vale para a chegada inteira, qualquer que seja o número de etapas. Numa abertura rápida, nenhuma etapa aparece.

## Exemplos

### Início

Um módulo com uma tela e sem menus.

```tsx
// apps/web/src/modulos/inicio/rotas.tsx
import { createRoute } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { Inicio } from './Inicio.tsx';

export const rotasDoInicio = createRoute({
  getParentRoute: () => raiz,
  path: '/',
  component: Inicio,
});
```

```ts
// apps/web/src/modulos/inicio/modulo.ts
import { House } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { rotasDoInicio } from './rotas.tsx';

export const inicio = definirModulo({
  id: 'inicio',
  nome: 'Início',
  icone: House,
  endereco: '/',
  prioridadeNoCelular: 1,
  rotas: rotasDoInicio,
});
```

### Ajustes

Um módulo com uma rota por seção e com a busca. O menu em árvore do dock e as entradas de busca saem da mesma lista que monta a lista de seções da tela. Cada seção declara os seus ajustes, com o `foco` do controle de cada um. A Conta vem primeiro, separada das seções de preferências, e as partes dela (a foto, a senha, a verificação em dois passos, os códigos de recuperação e as sessões) entram na busca do mesmo jeito:

```ts
// apps/web/src/modulos/ajustes/secoes.ts (trecho)
/**
 * Um ajuste de uma seção, como a busca o encontra: o `foco` é o `data-foco` do controle dele na
 * seção, e as palavras-chave o acham por outros nomes.
 */
export interface AjusteDaSecao {
  foco: string;
  rotulo: string;
  palavrasChave?: readonly string[];
}
```

```ts
// apps/web/src/modulos/ajustes/secoes.ts (trecho)
  {
    id: 'dock',
    nome: 'Dock',
    icone: PanelBottom,
    endereco: '/ajustes/dock',
    ajustes: [
      {
        foco: 'posicao-do-dock',
        rotulo: 'Posição do dock',
        palavrasChave: ['esquerda', 'direita'],
      },
      { foco: 'tamanho-do-dock', rotulo: 'Tamanho do dock', palavrasChave: ['ícones', 'itens'] },
      {
        foco: 'ampliar-o-dock',
        rotulo: 'Ampliar o dock ao passar o mouse',
        palavrasChave: ['ampliação', 'zoom'],
      },
      {
        foco: 'ocultar-o-dock',
        rotulo: 'Ocultar o dock automaticamente',
        palavrasChave: ['esconder'],
      },
    ] as readonly AjusteDaSecao[],
  },
```

```tsx
// apps/web/src/modulos/ajustes/rotas.tsx
import { createRoute } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { AjustesDoSistema } from './AjustesDoSistema.tsx';
import { SecaoAcessibilidade } from './secoes/Acessibilidade.tsx';
import { SecaoAparencia } from './secoes/Aparencia.tsx';
import { SecaoConta } from './secoes/Conta.tsx';
import { SecaoCursor } from './secoes/Cursor.tsx';
import { SecaoDock } from './secoes/Dock.tsx';
import { SecaoIdiomaERegiao } from './secoes/IdiomaERegiao.tsx';
import { SecaoNotificacoes } from './secoes/Notificacoes.tsx';
import { SecaoTabelas } from './secoes/Tabelas.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const ajustes = createRoute({
  getParentRoute: () => raiz,
  path: '/ajustes',
  component: AjustesDoSistema,
});

/**
 * Em /ajustes, o computador mostra a primeira seção de preferências, e o celular só a lista
 * (AjustesDoSistema).
 */
const inicio = createRoute({ getParentRoute: () => ajustes, path: '/', component: SecaoAparencia });

const conta = createRoute({ getParentRoute: () => ajustes, path: 'conta', component: SecaoConta });

const aparencia = createRoute({
  getParentRoute: () => ajustes,
  path: 'aparencia',
  component: SecaoAparencia,
});

const dock = createRoute({ getParentRoute: () => ajustes, path: 'dock', component: SecaoDock });

const cursor = createRoute({
  getParentRoute: () => ajustes,
  path: 'cursor',
  component: SecaoCursor,
});

const notificacoes = createRoute({
  getParentRoute: () => ajustes,
  path: 'notificacoes',
  component: SecaoNotificacoes,
});

const tabelas = createRoute({
  getParentRoute: () => ajustes,
  path: 'tabelas',
  component: SecaoTabelas,
});

const idiomaERegiao = createRoute({
  getParentRoute: () => ajustes,
  path: 'idioma-e-regiao',
  component: SecaoIdiomaERegiao,
});

const acessibilidade = createRoute({
  getParentRoute: () => ajustes,
  path: 'acessibilidade',
  component: SecaoAcessibilidade,
});

export const rotasDeAjustes = ajustes.addChildren([
  inicio,
  conta,
  aparencia,
  dock,
  cursor,
  notificacoes,
  tabelas,
  idiomaERegiao,
  acessibilidade,
]);
```

```ts
// apps/web/src/modulos/ajustes/modulo.ts
import { type IdDoTema, temas } from '@grafite/ui';
import { Palette, Settings } from 'lucide-react';
import { definirModulo, type EnderecosDe, type EntradaDeBuscaDoModulo } from '../tipos.ts';
import { rotasDeAjustes } from './rotas.tsx';
import { SECOES } from './secoes.ts';

type EntradaDosAjustes = EntradaDeBuscaDoModulo<EnderecosDe<typeof rotasDeAjustes>>;

/** Na busca, cada seção e cada ajuste dela, que abre a seção com o foco no controle do ajuste. */
const entradasDasSecoes = SECOES.flatMap((secao): EntradaDosAjustes[] => [
  {
    id: secao.id,
    rotulo: secao.nome,
    grupo: 'ajustes',
    caminho: 'Ajustes',
    icone: secao.icone,
    destino: secao.endereco,
  },
  ...secao.ajustes.map(
    (ajuste): EntradaDosAjustes => ({
      id: `${secao.id}:${ajuste.foco}`,
      rotulo: ajuste.rotulo,
      grupo: 'ajustes',
      caminho: `Ajustes › ${secao.nome}`,
      palavrasChave: ajuste.palavrasChave,
      icone: secao.icone,
      destino: secao.endereco,
      foco: ajuste.foco,
    }),
  ),
]);

/** Na busca, uma ação por tema, como "Usar o tema Névoa", que troca o tema na hora. */
const acoesDeTema = (Object.keys(temas) as IdDoTema[]).map(
  (id): EntradaDosAjustes => ({
    id: `usar-o-tema-${id}`,
    rotulo: `Usar o tema ${temas[id].nome}`,
    grupo: 'acoes',
    palavrasChave: ['cores', temas[id].tom],
    icone: Palette,
    executar: ({ mudarPreferencias }) => mudarPreferencias('aparencia', { tema: id }),
  }),
);

export const ajustes = definirModulo({
  id: 'ajustes',
  nome: 'Ajustes',
  icone: Settings,
  endereco: '/ajustes',
  prioridadeNoCelular: 9,
  rotas: rotasDeAjustes,
  menu: SECOES.map((secao) => ({ rotulo: secao.nome, destino: secao.endereco })),
  busca: { entradas: [...entradasDasSecoes, ...acoesDeTema] },
  // A seção Conta: a conta e as sessões dela mudam com a pessoa ou a conta (a senha trocada, os
  // dois passos, as sessões encerradas pela administração).
  eventos: { 'pessoas.mudaram': () => [['conta']] },
});
```

### Registro

```ts
// apps/web/src/modulos/registro.ts
import { administracao } from './administracao/modulo.ts';
import { ajustes } from './ajustes/modulo.ts';
import { alertas } from './alertas/modulo.ts';
import { ativos } from './ativos/modulo.ts';
import { cofre } from './cofre/modulo.ts';
import { gestao } from './gestao/modulo.ts';
import { inicio } from './inicio/modulo.ts';
import { mapa } from './mapa/modulo.ts';
import { operacao } from './operacao/modulo.ts';
import { paineis } from './paineis/modulo.ts';
import { salas } from './salas/modulo.ts';

/**
 * Registro de módulos, na ordem do dock. A casca monta o dock, a barra de abas e as rotas a partir
 * dele. Um módulo novo entra com uma linha aqui, antes de Ajustes, que fica sempre no fim, depois
 * do separador do dock.
 */
export const REGISTRO = [
  inicio,
  ativos,
  gestao,
  alertas,
  operacao,
  mapa,
  salas,
  paineis,
  cofre,
  administracao,
  ajustes,
] as const;
```

## Conferência

- `apps/web/src/modulos/registro.test.ts` reprova ids repetidos, menus e entradas de busca com destinos que não existem nas rotas e Ajustes fora do fim. Ele também confere, na compilação, que um destino fora das rotas do módulo não compila, no menu e na busca.
- `apps/web/src/modulos/ajustes/AjustesDoSistema.test.tsx` confere que cada ajuste declarado na busca leva a um controle marcado com `data-foco` na seção dele.
- `apps/web/src/modulos/documentacao.test.ts` confere que os exemplos deste documento são iguais ao código. Um bloco cuja primeira linha é o caminho de um arquivo reproduz o arquivo inteiro; com "(trecho)" depois do caminho, reproduz uma parte dele, sem cortes. Os blocos marcados como ilustrativos não têm caminho.

## Fora do contrato

- **Padrões por perfil:** o nível do perfil, entre os padrões da organização e a escolha da conta, entra no A1, atrás do mesmo `usePreferencias()`.
- **Uma conexão de eventos para todas as abas:** cada aba abre a sua. Com o HTTP/2 do Caddy, elas não esbarram no limite de conexões do navegador, e o aviso de uma notificação aparece numa aba só sem a conexão única.
- **Idiomas além do português do Brasil:** a seção Idioma e região mostra o idioma só como informação.
- **Mudanças na casca:** a casca (`packages/ui/src/casca` e `apps/web/src/casca`) não muda para um módulo entrar. Se um módulo precisar de algo que a casca não oferece, o pedido vai à sessão orquestradora (regra 7 do `CLAUDE.md`).
