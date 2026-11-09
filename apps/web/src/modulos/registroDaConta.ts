// O registro como a conta da sessão o vê (spec estrutura-da-casca): o que exige permissões aparece
// só para a conta que tem ao menos uma delas, em qualquer escopo, e o módulo que a organização
// desligou não aparece (spec modulos-da-organizacao). A casca, a busca e a tela inicial leem este
// registro; as rotas continuam todas, e a tela diz quando falta permissão ou o módulo está desligado.
import type { Permissao } from '@grafite/domain';
import type { ExigePermissoes, ItemDoMenuDoModulo, ModuloRegistrado } from './tipos.ts';

/** Se a conta tem a permissão em algum escopo, como o `pode` do `useAcesso()`. */
export type Pode = (chave: Permissao) => boolean;

const permite = (pode: Pode, { permissoes }: ExigePermissoes) =>
  !permissoes || permissoes.length === 0 || permissoes.some(pode);

/** Os itens que a conta pode usar; o submenu que fica sem itens some também. */
export function itensPermitidos<TEndereco extends string>(
  itens: readonly ItemDoMenuDoModulo<TEndereco>[],
  pode: Pode,
): ItemDoMenuDoModulo<TEndereco>[] {
  return itens.flatMap((item): ItemDoMenuDoModulo<TEndereco>[] => {
    if (!permite(pode, item)) return [];
    if (!('filhos' in item)) return [item];
    const filhos = itensPermitidos(item.filhos, pode);
    return filhos.length > 0 ? [{ ...item, filhos }] : [];
  });
}

function moduloDaConta(modulo: ModuloRegistrado, pode: Pode): ModuloRegistrado {
  const {
    menu,
    menuDinamico,
    menusDaBarra,
    busca,
    ocorrencias,
    relacoes,
    cadastros,
    blocosDoInicio,
  } = modulo;
  if (
    !menu &&
    !menuDinamico &&
    !menusDaBarra &&
    !busca &&
    !ocorrencias &&
    !relacoes &&
    !cadastros &&
    !blocosDoInicio
  ) {
    return modulo;
  }
  return {
    ...modulo,
    menu: menu && itensPermitidos(menu, pode),
    menuDinamico: menuDinamico && permite(pode, menuDinamico) ? menuDinamico : undefined,
    menusDaBarra: menusDaBarra
      ?.map((barra) => ({ ...barra, itens: itensPermitidos(barra.itens, pode) }))
      .filter((barra) => barra.itens.length > 0),
    busca: busca && {
      entradas: busca.entradas?.filter((entrada) => permite(pode, entrada)),
      provedores: busca.provedores?.filter((provedor) => permite(pode, provedor)),
    },
    ocorrencias: ocorrencias && permite(pode, ocorrencias) ? ocorrencias : undefined,
    relacoes: relacoes?.filter((relacao) => permite(pode, relacao)),
    cadastros: cadastros?.filter((cadastro) => permite(pode, cadastro)),
    blocosDoInicio: blocosDoInicio?.filter((bloco) => permite(pode, bloco)),
  };
}

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
