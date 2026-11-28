// O chat na aba (change aba-dos-colaboradores, design, decisão 8): a página do chat dentro da tela
// maior da aba fala com ela só pela navegação, sem permissão nenhuma. A aba navega para
// `/chat/entrar#<bilhete>`, e a página troca o bilhete pela sessão do chat na aba, tira o bilhete do
// endereço e vai ao destino. A recusa pede outro bilhete uma vez, navegando para `/chat/entrar` sem
// o fragmento, que a aba intercepta, e na segunda mostra o erro. A página de entrada do chat aberta
// pela aba leva a marca dela (`/chat/entrar?aba=<id curto>`), que a entrada manda junto. Depois, na
// sessão do chat na aba, a sessão que termina navega para `/chat/entrar`, e o Esc que ninguém
// consumiu, para `/chat/fechar-a-aba`.
import type { DestinoDoBilhete, LojaDaSessao } from '../sessao/loja.ts';

/** Onde a aba entrega o bilhete, e para onde a página navega quando a sessão falta. */
export const ENTRAR_PELA_ABA = '/chat/entrar';
/** Para onde a página navega no Esc que o chat não usou: a aba fecha a tela maior. */
export const FECHAR_A_ABA = '/chat/fechar-a-aba';
/** A marca, na aba da página, de que o bilhete recusado já pediu outro. */
export const PEDIU_OUTRO_BILHETE = 'grafite:chat-da-aba:pediu-outro-bilhete';

export type EntradaPelaAba =
  | { tipo: 'bilhete'; bilhete: string }
  | { tipo: 'marca'; marca: string };

/** O bilhete do fragmento ou a marca da busca, em `/chat/entrar`; em outro endereço, nada. */
export function lerEntradaPelaAba({
  pathname,
  hash,
  search,
}: Pick<Location, 'pathname' | 'hash' | 'search'>): EntradaPelaAba | null {
  if (pathname.replace(/\/+$/, '') !== ENTRAR_PELA_ABA) return null;
  const bilhete = hash.replace(/^#/, '');
  if (bilhete) return { tipo: 'bilhete', bilhete };
  const marca = new URLSearchParams(search).get('aba')?.trim();
  return marca ? { tipo: 'marca', marca } : null;
}

/** O endereço do chat aonde o bilhete leva. */
export const enderecoDoDestino = (destino: DestinoDoBilhete): string =>
  destino.destino === 'chamado' ? `/chat/chamados/${destino.numero}` : '/chat';

interface Navegacao {
  /** Troca o endereço sem carregar a página. */
  trocarOEndereco: (endereco: string) => void;
  /** Navega de verdade: na aba, ela intercepta, e o endereço nem carrega. */
  ir: (endereco: string) => void;
  /** Onde fica a marca do bilhete pedido de novo, que vale só nesta aba do navegador. */
  guardado: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

/**
 * Troca o bilhete pela sessão do chat na aba. O bilhete sai do endereço antes do pedido. Aceito, o
 * endereço passa a ser o do destino; recusado pela primeira vez, a página pede outro à aba; pela
 * segunda, devolve o erro, para a página o mostrar.
 */
export async function entrarPeloBilhete(
  loja: Pick<LojaDaSessao, 'entrarPeloBilhete'>,
  bilhete: string,
  { trocarOEndereco, ir, guardado }: Navegacao,
): Promise<{ tipo: 'entrou' } | { tipo: 'pediu-outro' } | { tipo: 'falhou'; erro: string }> {
  trocarOEndereco(ENTRAR_PELA_ABA);
  const resultado = await loja.entrarPeloBilhete(bilhete);
  if ('ok' in resultado) {
    guardado.removeItem(PEDIU_OUTRO_BILHETE);
    trocarOEndereco(enderecoDoDestino(resultado.destino));
    return { tipo: 'entrou' };
  }
  if (guardado.getItem(PEDIU_OUTRO_BILHETE) === null) {
    guardado.setItem(PEDIU_OUTRO_BILHETE, '1');
    ir(ENTRAR_PELA_ABA);
    return { tipo: 'pediu-outro' };
  }
  guardado.removeItem(PEDIU_OUTRO_BILHETE);
  return { tipo: 'falhou', erro: resultado.erro };
}

/**
 * Na sessão do chat na aba: a sessão que termina navega para `/chat/entrar`, e a aba pede o
 * bilhete; o Esc que nenhum menu, diálogo ou seleção consumiu navega para `/chat/fechar-a-aba`. O
 * Esc é conferido depois do despacho inteiro, porque a seleção das mensagens também o ouve na
 * janela e liga o ouvinte dela depois deste. Devolve o desligamento.
 */
export function ligarCanalDaAba({
  loja,
  ir,
  janela,
}: {
  loja: Pick<LojaDaSessao, 'ler' | 'assinar'>;
  ir: (endereco: string) => void;
  janela: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout'>;
}): () => void {
  let naAba = false;
  const conferir = () => {
    const estado = loja.ler();
    if ('naAba' in estado) {
      naAba = estado.naAba;
    } else if (estado.tipo === 'sem-sessao' && naAba) {
      naAba = false;
      ir(ENTRAR_PELA_ABA);
    }
  };
  const aoTeclar = (evento: KeyboardEvent) => {
    if (!naAba || evento.key !== 'Escape' || evento.isComposing) return;
    if (evento.ctrlKey || evento.shiftKey || evento.altKey || evento.metaKey) return;
    janela.setTimeout(() => {
      if (!evento.defaultPrevented && naAba) ir(FECHAR_A_ABA);
    }, 0);
  };
  const desligarALoja = loja.assinar(conferir);
  janela.addEventListener('keydown', aoTeclar);
  conferir();
  return () => {
    desligarALoja();
    janela.removeEventListener('keydown', aoTeclar);
  };
}
