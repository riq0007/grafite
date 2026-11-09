// Fontes locais da busca (design do F1b, decisão 12): o registro de módulos entra sozinho em
// Ir para (o módulo e as folhas dos menus), e cada módulo acrescenta as entradas que declarou.
import type { ItemDoMenuDoModulo, ModuloRegistrado } from '../modulos/tipos.ts';
import type { EntradaDeBusca } from './tipos.ts';

/** As folhas de um menu em árvore, cada uma com o caminho de rótulos até ela. */
function folhas(
  itens: readonly ItemDoMenuDoModulo<string>[],
  caminho: string,
): Array<{ rotulo: string; destino: string; caminho: string }> {
  return itens.flatMap((item) =>
    'filhos' in item
      ? folhas(item.filhos, `${caminho} › ${item.rotulo}`)
      : [{ rotulo: item.rotulo, destino: item.destino, caminho }],
  );
}

function entradasDoModulo(modulo: ModuloRegistrado): EntradaDeBusca[] {
  const doMenu = folhas(modulo.menu ?? [], modulo.nome);
  const daBarra = (modulo.menusDaBarra ?? []).flatMap((menu) =>
    folhas(menu.itens, `${modulo.nome} › ${menu.rotulo}`),
  );
  return [
    {
      id: `${modulo.id}:modulo`,
      rotulo: modulo.nome,
      grupo: 'ir-para',
      origem: 'modulo',
      icone: modulo.icone,
      destino: modulo.endereco,
    },
    ...[...doMenu, ...daBarra].map(
      (folha): EntradaDeBusca => ({
        id: `${modulo.id}:menu:${folha.caminho} › ${folha.rotulo}`,
        rotulo: folha.rotulo,
        grupo: 'ir-para',
        origem: 'menu',
        caminho: folha.caminho,
        icone: modulo.icone,
        destino: folha.destino,
      }),
    ),
    ...(modulo.busca?.entradas ?? []).map(
      (entrada): EntradaDeBusca => ({
        ...entrada,
        id: `${modulo.id}:${entrada.id}`,
        origem: 'declarada',
      }),
    ),
  ];
}

/** As entradas locais de todos os módulos, na ordem do registro. */
export function entradasDoRegistro(registro: readonly ModuloRegistrado[]): EntradaDeBusca[] {
  return registro.flatMap(entradasDoModulo);
}
