// O push deste aparelho (spec notificacoes, "Aparelhos do push"; change p3c-email-e-push, design,
// decisão 8; change chat-com-chamados, tarefa 4.7): os canais da conta, a inscrição deste aparelho e
// o motivo, em texto, de ele não receber os avisos, nos Ajustes e nos Avisos do app do chat.
import type { components } from '@grafite/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { consultar } from '../api/consultas.ts';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import { useAmbienteDoPush } from './ambienteDoPush.tsx';
import {
  enderecoDesteAparelho,
  inscreverEsteAparelho,
  type SuporteAoPush,
  suporteAoPush,
} from './push.ts';

export type CanaisDaConta = components['schemas']['CanaisDaConta'];

export const CHAVE_DOS_CANAIS = ['conta', 'canais'] as const;

export const NO_TESTE = 'O ambiente de teste não envia e-mail nem avisos no celular.';

export const TEXTOS_DO_PUSH: Record<
  Exclude<CanaisDaConta['push']['situacao'], 'ligado'>,
  string
> = {
  'sem-configuracao': 'Os avisos no celular não estão configurados neste servidor.',
  'ambiente-de-teste': NO_TESTE,
};

export const TEXTOS_DO_SUPORTE: Record<Exclude<SuporteAoPush, 'ok'>, string> = {
  'sem-push': 'Este navegador não recebe avisos fora da aplicação.',
  'iphone-fora-do-app':
    'No iPhone e no iPad, os avisos chegam com o Grafite ou o app do chat instalado na tela de início.',
  bloqueado:
    'Os avisos estão bloqueados neste navegador. Libere as notificações do Grafite nas configurações do site.',
};

/**
 * Os canais da conta e este aparelho: o endereço da inscrição dele, que marca "Este aparelho", lido
 * de novo a cada leitura dos canais, o que o navegador oferece e a inscrição. `textoDoPush` diz, em
 * texto, se este aparelho recebe os avisos ou por que não, depois de os canais chegarem; a tela o põe
 * na `frase`, que recebe o foco quando "Receber neste aparelho" sai depois de escolhido.
 */
export function useEsteAparelho() {
  const api = useApi();
  const consultas = useQueryClient();
  const ambiente = useAmbienteDoPush();
  const canais = useQuery({
    queryKey: CHAVE_DOS_CANAIS,
    queryFn: ({ signal }) =>
      consultar(() => api.GET('/conta/canais', { signal }), 'carregar o e-mail e os avisos'),
  });
  const [suporte, definirSuporte] = useState(() => suporteAoPush(ambiente));
  const deste =
    useQuery({
      queryKey: [...CHAVE_DOS_CANAIS, 'deste-aparelho', canais.dataUpdatedAt],
      queryFn: () => enderecoDesteAparelho(ambiente),
    }).data ?? null;

  const reler = () => consultas.invalidateQueries({ queryKey: CHAVE_DOS_CANAIS });

  const push = canais.data?.push;
  const pushLigado = push?.situacao === 'ligado';
  const aparelhos = pushLigado ? (push?.aparelhos ?? []) : [];
  const esteInscrito = deste !== null && aparelhos.some(({ endpoint }) => endpoint === deste);
  const podeReceber = pushLigado && suporte === 'ok' && !esteInscrito;

  const frase = useRef<HTMLParagraphElement>(null);
  /** "Receber neste aparelho" foi escolhido: o botão sai, e o foco, que estava nele, vai à frase. */
  const recebeuAqui = useRef(false);
  useEffect(() => {
    if (podeReceber || !recebeuAqui.current) return;
    recebeuAqui.current = false;
    frase.current?.focus();
  }, [podeReceber]);

  /**
   * Inscreve este aparelho. Sem a permissão, o motivo diz que os avisos estão bloqueados; sem o
   * service worker, que o navegador não os recebe, em vez de o botão ficar sem efeito.
   */
  const receber = async () => {
    if (!push?.chavePublica) return;
    recebeuAqui.current = true;
    let resultado: Awaited<ReturnType<typeof inscreverEsteAparelho>>;
    try {
      resultado = await inscreverEsteAparelho(ambiente, push.chavePublica, async (corpo) => {
        const gravado = await pedir(
          () => api.POST('/conta/push', { body: corpo }),
          'inscrever o aparelho',
        );
        if ('erro' in gravado) throw new Error(gravado.erro);
      });
    } catch (erro) {
      // A falha vai ao aviso, e o botão, com o foco, continua.
      recebeuAqui.current = false;
      throw erro;
    }
    definirSuporte(resultado === 'sem-push' ? 'sem-push' : suporteAoPush(ambiente));
    if (resultado === 'inscrito') await reler();
  };

  const textoDoPush = !pushLigado
    ? TEXTOS_DO_PUSH[
        push?.situacao === 'ambiente-de-teste' ? 'ambiente-de-teste' : 'sem-configuracao'
      ]
    : suporte !== 'ok'
      ? TEXTOS_DO_SUPORTE[suporte]
      : esteInscrito
        ? 'Este aparelho recebe os avisos.'
        : 'Este aparelho ainda não recebe os avisos.';

  return {
    ambiente,
    canais,
    pushLigado,
    aparelhos,
    deste,
    esteInscrito,
    /** O aparelho pode se inscrever: o servidor manda o push, o navegador o recebe, e falta ele. */
    podeReceber,
    receber,
    reler,
    textoDoPush,
    /** O parágrafo do `textoDoPush`, com o `tabIndex` -1. */
    frase,
  };
}
