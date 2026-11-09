// Os endereços da imagem do modelo (spec catalogo-de-ativos): o modelo traz só o id da imagem, e a
// web monta o da miniatura. Imagem nova é endereço novo, e a antiga deixa de ser pedida.
import type { Modelo } from '../consultas.ts';

/** As miniaturas que a API gera da imagem, pelo lado do quadrado em px. */
export type LadoDaMiniatura = 64 | 128 | 256 | 512;

/** O endereço da miniatura da imagem do modelo; sem imagem, nenhum, e a tela mostra o ícone. */
export const imagemDoModelo = (
  modelo: Pick<Modelo, 'id' | 'imagem'>,
  lado: LadoDaMiniatura,
): string | undefined =>
  modelo.imagem ? `/api/modelos/${modelo.id}/imagem/${modelo.imagem.id}/${lado}` : undefined;
