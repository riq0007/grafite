// Do registro para a casca (design, decisão 2): a casca do packages/ui só conhece dados de
// apresentação, e o app traduz para eles cada módulo registrado.
import { MODULO_DOS_AJUSTES, type ModuloDoDockSalvo } from '@grafite/domain';
import type { ItemDoMenuDaCasca, MenuDaBarra, ModuloDaCasca } from '@grafite/ui';
import type { ItemDoMenuDoModulo, ModuloRegistrado } from '../modulos/tipos.ts';
import { ordenarItens } from '../preferencias/listaOrdenada.ts';

/**
 * Itens de um menu do registro na forma da casca. Um item que navega usa o próprio destino como
 * id, e a casca devolve esse id na escolha. Um submenu leva o caminho de rótulos até ele, que
 * nunca coincide com um endereço, porque endereços começam com "/".
 */
function itensDaCasca(
  itens: readonly ItemDoMenuDoModulo<string>[],
  caminho: string,
): ItemDoMenuDaCasca[] {
  return itens.map((item) =>
    'filhos' in item
      ? {
          id: `${caminho} › ${item.rotulo}`,
          rotulo: item.rotulo,
          separadoAntes: item.separadoAntes,
          filhos: itensDaCasca(item.filhos, `${caminho} › ${item.rotulo}`),
        }
      : {
          id: item.destino,
          rotulo: item.rotulo,
          separadoAntes: item.separadoAntes,
          icone: item.icone,
        },
  );
}

function paraACasca(modulo: ModuloRegistrado): ModuloDaCasca {
  const menusDaBarra = modulo.menusDaBarra?.map<MenuDaBarra>((menu) => ({
    id: menu.rotulo,
    rotulo: menu.rotulo,
    itens: itensDaCasca(menu.itens, `${modulo.id} › ${menu.rotulo}`),
  }));
  return {
    id: modulo.id,
    nome: modulo.nome,
    icone: modulo.icone,
    prioridadeNoCelular: modulo.prioridadeNoCelular,
    menu: modulo.menu && itensDaCasca(modulo.menu, modulo.id),
    menusDaBarra,
  };
}

/**
 * Os módulos da casca na ordem que vale para a conta (spec dock, "Ordem dos módulos e módulos fora
 * do dock"; change dock-personalizavel, design, decisão 2):
 * - `modulos`: os do dock, na ordem escolhida, e depois os que a escolha não traz, na do registro;
 * - `modulosNoMais`: os que a conta tirou do dock, que ficam no menu Mais;
 * - `modulosDoFim`: Ajustes, sempre no fim, isolado pelo separador e fora da escolha.
 *
 * O id da escolha que o registro da conta não traz fica de fora, sem sair da lista guardada. Sem a
 * escolha, vale a ordem do registro, com todos no dock.
 *
 * Com a escolha, a ordem das abas do celular é a dela (design, decisão 5): os módulos do dock
 * recebem a prioridade 1, 2, 3… na ordem, Ajustes vem depois deles, e os tirados ficam em "Mais".
 * O módulo que declara "Mais" continua lá. Sem a escolha, vale a prioridade que cada um declara.
 */
export function modulosDaCasca(
  registro: readonly ModuloRegistrado[],
  escolha: readonly ModuloDoDockSalvo[] = [],
): {
  modulos: ModuloDaCasca[];
  modulosNoMais: ModuloDaCasca[];
  modulosDoFim: ModuloDaCasca[];
} {
  const { visiveis, ocultos } = ordenarItens(
    registro.filter((modulo) => modulo.id !== MODULO_DOS_AJUSTES),
    escolha,
  );
  const modulos = visiveis.map(paraACasca);
  const modulosNoMais = ocultos.map(paraACasca);
  const modulosDoFim = registro
    .filter((modulo) => modulo.id === MODULO_DOS_AJUSTES)
    .map(paraACasca);
  if (escolha.length === 0) return { modulos, modulosNoMais, modulosDoFim };
  /** A prioridade pela posição, menos para quem declara que fica sempre em "Mais". */
  const naPosicao =
    (posicao: number) =>
    (modulo: ModuloDaCasca): ModuloDaCasca => ({
      ...modulo,
      prioridadeNoCelular: modulo.prioridadeNoCelular === 'mais' ? 'mais' : posicao,
    });
  return {
    modulos: modulos.map((modulo, indice) => naPosicao(indice + 1)(modulo)),
    modulosNoMais: modulosNoMais.map((modulo) => ({ ...modulo, prioridadeNoCelular: 'mais' })),
    modulosDoFim: modulosDoFim.map(naPosicao(modulos.length + 1)),
  };
}

/** O módulo dono do endereço atual: o que tem a sua rota entre as rotas em que o endereço caiu. */
export function moduloAtual(
  registro: readonly ModuloRegistrado[],
  idsDasRotas: readonly string[],
): ModuloRegistrado | undefined {
  return registro.find((modulo) => idsDasRotas.includes(modulo.rotas.id));
}
