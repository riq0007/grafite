// O menu de contexto da tabela dos ativos (spec cadastro-de-ativos): "Abrir" e "Copiar link" com
// uma linha, "Prévia" e "Copiar linhas" sempre, "Copiar patrimônio" com uma linha que tem
// patrimônio, com os retornos, e "Imprimir etiqueta" ou "Imprimir etiquetas" (spec
// etiquetas-de-ativos).
import { avisar, copiarParaAreaDeTransferencia, type ItemDoMenuDeContexto } from '@grafite/ui';

export interface PropsDoMenuDosAtivos {
  /** As linhas do menu, na ordem da tabela: a seleção, ou a linha onde ele abriu. */
  chaves: readonly string[];
  /** Os ativos carregados, pelo id. */
  ativos: ReadonlyMap<string, { id: string; patrimonio: string | null }>;
  abrir: (id: string) => void;
  prever: (id: string) => void;
  copiarLinhas: (chaves: string[]) => void;
  /** Abre a tela das etiquetas com as linhas, na ordem da tabela. */
  imprimirEtiquetas: (chaves: string[]) => void;
  copiar?: (texto: string) => Promise<void>;
  /** O começo do endereço da ficha: o do sistema aberto. */
  origem?: string;
}

/** Copia o texto e confirma com o retorno, ou diz que o navegador não deixou. */
async function copiarComRetorno(
  copiar: (texto: string) => Promise<void>,
  texto: string,
  retorno: string,
): Promise<void> {
  try {
    await copiar(texto);
    avisar({ situacao: 'sucesso', titulo: retorno });
  } catch {
    avisar({ situacao: 'atencao', titulo: 'Não foi possível copiar.' });
  }
}

export function itensDoMenuDosAtivos({
  chaves,
  ativos,
  abrir,
  prever,
  copiarLinhas,
  imprimirEtiquetas,
  copiar = copiarParaAreaDeTransferencia,
  origem = window.location.origin,
}: PropsDoMenuDosAtivos): ItemDoMenuDeContexto[] {
  const [primeira] = chaves;
  if (primeira === undefined) return [];
  const umaSo = chaves.length === 1 ? ativos.get(primeira) : undefined;
  return [
    ...(umaSo ? [{ id: 'abrir', rotulo: 'Abrir', aoEscolher: () => abrir(umaSo.id) }] : []),
    { id: 'previa', rotulo: 'Prévia', aoEscolher: () => prever(primeira) },
    { id: 'copiar-linhas', rotulo: 'Copiar linhas', aoEscolher: () => copiarLinhas([...chaves]) },
    ...(umaSo?.patrimonio
      ? [
          {
            id: 'copiar-patrimonio',
            rotulo: 'Copiar patrimônio',
            aoEscolher: () =>
              void copiarComRetorno(copiar, umaSo.patrimonio ?? '', 'Patrimônio copiado.'),
          },
        ]
      : []),
    ...(umaSo
      ? [
          {
            id: 'copiar-link',
            rotulo: 'Copiar link',
            aoEscolher: () =>
              void copiarComRetorno(copiar, `${origem}/ativos/${umaSo.id}`, 'Link copiado.'),
          },
        ]
      : []),
    {
      id: 'imprimir-etiquetas',
      rotulo: chaves.length === 1 ? 'Imprimir etiqueta' : 'Imprimir etiquetas',
      aoEscolher: () => imprimirEtiquetas([...chaves]),
    },
  ];
}
