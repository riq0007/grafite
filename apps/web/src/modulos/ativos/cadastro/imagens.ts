// Os endereços da imagem própria do ativo (spec cadastro-de-ativos): o ativo traz só o id dela,
// como o modelo, e a web monta o da miniatura. Ela vale no lugar da imagem do modelo, na ficha, na
// tabela, na prévia e nos ligados; sem nenhuma das duas, a tela mostra o ícone do tipo.
import type { AtivoNaLista } from '../consultas.ts';
import { imagemDoModelo, type LadoDaMiniatura } from '../modelos/imagens.ts';

/** O endereço da miniatura da imagem do ativo; sem imagem própria, nenhum. */
export const imagemDoAtivo = (
  ativo: Pick<AtivoNaLista, 'id' | 'imagem'>,
  lado: LadoDaMiniatura,
): string | undefined =>
  ativo.imagem ? `/api/ativos/${ativo.id}/imagem/${ativo.imagem.id}/${lado}` : undefined;

/** As imagens do ativo e do modelo dele, como a miniatura e a prévia as recebem, nessa ordem. */
export const imagensDoAtivo = (
  ativo: Pick<AtivoNaLista, 'id' | 'imagem' | 'modelo'>,
  lado: LadoDaMiniatura,
) => ({
  imagemDoAtivo: imagemDoAtivo(ativo, lado),
  imagemDoModelo: ativo.modelo ? imagemDoModelo(ativo.modelo, lado) : undefined,
});
