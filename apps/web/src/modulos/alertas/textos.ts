// Os textos e os endereços de um alerta na tela (spec modulo-alertas): a situação, como terminou, o
// endereço do alvo e as imagens da miniatura.
import { imagemDoAtivo } from '../ativos/cadastro/imagens.ts';
import { imagemDoModelo } from '../ativos/modelos/imagens.ts';
import type { AlertaNaLista } from './consultas.ts';

export const COMO_TERMINOU: Record<NonNullable<AlertaNaLista['comoTerminou']>, string> = {
  'voltou-ao-normal': 'Voltou ao normal',
  'regra-deixou-de-valer': 'A regra deixou de valer',
};

/** O endereço que a linha abre: a ficha do ativo, ou a tela do coletor. */
export const destinoDoAlvo = (alvo: AlertaNaLista['alvo']) =>
  alvo.tipo === 'ativo' ? `/ativos/${alvo.id}` : `/administracao/coletores/${alvo.id}`;

/** O que a miniatura recebe: a imagem do ativo, a do modelo e o ícone do tipo; o coletor, o genérico. */
export function miniaturaDoAlvo(alvo: AlertaNaLista['alvo']) {
  if (alvo.tipo === 'coletor') return { tipo: 'generico' };
  return {
    tipo: alvo.tipoDoAtivo.icone,
    imagemDoAtivo: imagemDoAtivo(alvo, 64),
    imagemDoModelo: alvo.modelo ? imagemDoModelo(alvo.modelo, 64) : undefined,
  };
}
