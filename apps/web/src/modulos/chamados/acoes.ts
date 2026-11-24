// As ações do atendimento nas telas dos chamados (spec modulo-chamados, "Quem está com o quê"; spec
// chamados, "Ações do atendimento"; change chamados-da-ti, design, decisão 22, "As ações"): assumir,
// passar, devolver à triagem, desfazer o assumir e reabrir, cada uma com a versão do chamado que a tela
// mostra. O retorno vai num aviso; a recusa, no aviso crítico, com a frase da API. Aceita ou
// recusada, a tela relê os chamados (o quadro, os prazos e a ficha) sem esperar o
// `chamados.mudaram`: depois do `chamado-mudou`, ela mostra o chamado como ele está. O quadro, a
// ficha (5.10), o painel dos prazos (5.16) e o "Andamento" do chamado no chat agem por aqui; o chat
// passa o `aoMudar`, que relê as consultas dele (change andamento-e-varias-mensagens, decisão 2).
import type { components } from '@grafite/api-client';
import { nomeCurto } from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { pedir, type RespostaDaApi } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { CHAVE_DOS_CHAMADOS } from './consultas.ts';

export type ChamadoDepoisDaAcao = components['schemas']['ChamadoDepoisDaAcao'];
export type AcaoDoAtendimento = 'assumir' | 'passar' | 'devolver' | 'desfazer' | 'reabrir';

/**
 * A frase do aviso de cada ação, com o primeiro nome de quem ficou com o chamado: "Você assumiu o
 * #1033.", "Você passou o #1033 a Bruno.", "Você devolveu o #1033 à triagem." e, no desfazer, "O
 * #1033 voltou a Renato." ou "O #1042 voltou à triagem."; e "Você reabriu o #1042.".
 */
export function retornoDaAcao(
  acao: AcaoDoAtendimento,
  { numero, responsavel }: Pick<ChamadoDepoisDaAcao, 'numero' | 'responsavel'>,
): string {
  switch (acao) {
    case 'assumir':
      return `Você assumiu o #${numero}.`;
    case 'passar':
      return responsavel
        ? `Você passou o #${numero} a ${nomeCurto(responsavel.nome)}.`
        : `Você passou o #${numero}.`;
    case 'devolver':
      return `Você devolveu o #${numero} à triagem.`;
    case 'desfazer':
      return responsavel
        ? `O #${numero} voltou a ${nomeCurto(responsavel.nome)}.`
        : `O #${numero} voltou à triagem.`;
    case 'reabrir':
      return `Você reabriu o #${numero}.`;
  }
}

/** O que a ação tentava, para a frase do erro do servidor ("Não foi possível …"). */
const NO_ERRO: Readonly<Record<AcaoDoAtendimento, string>> = {
  assumir: 'assumir o chamado',
  passar: 'passar o chamado',
  devolver: 'devolver o chamado à triagem',
  desfazer: 'desfazer o assumir',
  reabrir: 'reabrir o chamado',
};

export interface AcoesDoAtendimento {
  /** Cada uma devolve o chamado depois dela, ou nulo, na recusa e na falha. */
  assumir: (numero: number, versao: number) => Promise<ChamadoDepoisDaAcao | null>;
  passar: (numero: number, versao: number, para: string) => Promise<ChamadoDepoisDaAcao | null>;
  devolver: (numero: number, versao: number) => Promise<ChamadoDepoisDaAcao | null>;
  desfazer: (numero: number, versao: number) => Promise<ChamadoDepoisDaAcao | null>;
  reabrir: (numero: number, versao: number) => Promise<ChamadoDepoisDaAcao | null>;
}

/**
 * As ações do atendimento, que avisam o retorno e releem os chamados. O `aoMudar` roda depois de
 * cada uma, aceita ou recusada, também do "Desfazer" do aviso, para quem lê o chamado por outras
 * consultas, como o chat, relê-las.
 */
export function useAcoesDoAtendimento({
  aoMudar,
}: {
  aoMudar?: () => void;
} = {}): AcoesDoAtendimento {
  const api = useApi();
  const consultas = useQueryClient();
  // Pela referência: o "Desfazer" do aviso chama o de agora, e as ações não mudam a cada desenho.
  const depoisDaAcao = useRef(aoMudar);
  useEffect(() => {
    depoisDaAcao.current = aoMudar;
  }, [aoMudar]);
  return useMemo(() => {
    const agir = async (
      acao: AcaoDoAtendimento,
      fazer: () => Promise<RespostaDaApi<ChamadoDepoisDaAcao>>,
    ): Promise<ChamadoDepoisDaAcao | null> => {
      const resultado = await pedir(fazer, NO_ERRO[acao]);
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
      depoisDaAcao.current?.();
      if ('erro' in resultado) {
        avisar({ situacao: 'critico', titulo: resultado.erro });
        return null;
      }
      const depois = resultado.dados;
      avisar({
        situacao: 'sucesso',
        titulo: retornoDaAcao(acao, depois),
        // O desfazer manda a versão que o assumir devolveu.
        ...(acao === 'assumir' && {
          acao: {
            rotulo: 'Desfazer',
            aoEscolher: () => void desfazer(depois.numero, depois.versao),
          },
        }),
      });
      return depois;
    };
    const doChamado = (numero: number) => ({ params: { path: { numero } } });
    const desfazer = (numero: number, versao: number) =>
      agir('desfazer', () =>
        api.POST('/chamados/{numero}/desfazer', { ...doChamado(numero), body: { versao } }),
      );
    return {
      assumir: (numero, versao) =>
        agir('assumir', () =>
          api.POST('/chamados/{numero}/assumir', { ...doChamado(numero), body: { versao } }),
        ),
      passar: (numero, versao, para) =>
        agir('passar', () =>
          api.POST('/chamados/{numero}/passar', { ...doChamado(numero), body: { para, versao } }),
        ),
      devolver: (numero, versao) =>
        agir('devolver', () =>
          api.POST('/chamados/{numero}/devolver', { ...doChamado(numero), body: { versao } }),
        ),
      desfazer,
      reabrir: (numero, versao) =>
        agir('reabrir', () =>
          api.POST('/chamados/{numero}/reabrir', { ...doChamado(numero), body: { versao } }),
        ),
    };
  }, [api, consultas]);
}
