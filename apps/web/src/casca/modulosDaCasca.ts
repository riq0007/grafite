// Do registro para a casca (design, decisão 2): a casca do packages/ui só conhece dados de
// apresentação, e o app traduz para eles cada módulo registrado.
import type { ItemDoMenuDaCasca, MenuDaBarra, ModuloDaCasca } from '@grafite/ui';
import type { ItemDoMenuDoModulo, ModuloRegistrado } from '../modulos/tipos.ts';

/** Ajustes fica sempre no fim do dock, isolado pelo separador. */
const ID_DOS_AJUSTES = 'ajustes';

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

/** Os módulos do dock na ordem do registro, com Ajustes à parte, para o fim. */
export function modulosDaCasca(registro: readonly ModuloRegistrado[]): {
  modulos: ModuloDaCasca[];
  modulosDoFim: ModuloDaCasca[];
} {
  return {
    modulos: registro.filter((modulo) => modulo.id !== ID_DOS_AJUSTES).map(paraACasca),
    modulosDoFim: registro.filter((modulo) => modulo.id === ID_DOS_AJUSTES).map(paraACasca),
  };
}

/** O módulo dono do endereço atual: o que tem a sua rota entre as rotas em que o endereço caiu. */
export function moduloAtual(
  registro: readonly ModuloRegistrado[],
  idsDasRotas: readonly string[],
): ModuloRegistrado | undefined {
  return registro.find((modulo) => idsDasRotas.includes(modulo.rotas.id));
}
