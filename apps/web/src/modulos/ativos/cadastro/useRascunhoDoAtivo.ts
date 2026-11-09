// O rascunho do cadastro do ativo na tela (spec cadastro-de-ativos, "Rascunho do cadastro do
// ativo"; change cadastro-em-etapas, design, decisão 8): a leitura ao abrir o Novo ativo e a
// gravação enquanto a pessoa preenche, 1 s depois da última mudança, um envio de cada vez, com a
// situação em texto.
import { useDataHora } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { type ConteudoDoRascunho, conteudoDoRascunho, type EstadoDoCadastro } from './rascunho.ts';

export const CHAVE_DO_RASCUNHO = ['ativos', 'rascunho'] as const;

/** Quanto a gravação espera depois da última mudança. */
const ESPERA = 1_000;
/** Até quando o rascunho guardado é "agora". */
const AGORA = 60_000;

type Situacao =
  | { tipo: 'nada' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado'; em: Date }
  | { tipo: 'falhou' };

/**
 * O rascunho da conta, lido a cada abertura do Novo ativo: outro aparelho pode tê-lo mudado, então
 * ele não fica no cache depois que a tela sai. Com a tela aberta, ele não é relido: quem guarda é
 * ela mesma.
 */
export function useLeituraDoRascunho() {
  const api = useApi();
  return useQuery({
    queryKey: CHAVE_DO_RASCUNHO,
    queryFn: async () =>
      (await consultar(() => api.GET('/ativos/rascunho'), 'carregar o rascunho')).rascunho,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
}

/**
 * A gravação do rascunho enquanto a pessoa preenche. O cadastro sem o tipo não é guardado. A
 * mudança durante um envio vai quando ele termina, para um envio antigo nunca chegar depois de um
 * novo. Ao sair da tela, o que esperava vai na hora. Antes de cadastrar e de descartar, a espera é
 * cancelada e o envio em curso, aguardado.
 */
export function useRascunhoDoAtivo({ guardadoEm }: { guardadoEm: string | null }) {
  const api = useApi();
  const { formatarHora } = useDataHora();
  const [situacao, definirSituacao] = useState<Situacao>(() =>
    guardadoEm ? { tipo: 'guardado', em: new Date(guardadoEm) } : { tipo: 'nada' },
  );
  const [agora, definirAgora] = useState(() => Date.now());
  const pendente = useRef<ConteudoDoRascunho | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = useRef<Promise<void> | null>(null);

  const enviarPendente = useCallback((): Promise<void> => {
    if (emVoo.current) return emVoo.current;
    const enviar = async () => {
      while (pendente.current) {
        const conteudo = pendente.current;
        pendente.current = null;
        definirSituacao({ tipo: 'guardando' });
        const resultado = await pedir(
          () => api.PUT('/ativos/rascunho', { body: conteudo }),
          'guardar o rascunho',
        );
        if ('erro' in resultado) {
          // O que não foi guardado fica para o "Tentar de novo", se nada mais novo chegou.
          pendente.current ??= conteudo;
          definirSituacao({ tipo: 'falhou' });
          return;
        }
        if (!pendente.current) {
          const momento = Date.now();
          definirAgora(momento);
          definirSituacao({ tipo: 'guardado', em: new Date(momento) });
        }
      }
    };
    const envio = enviar().finally(() => {
      emVoo.current = null;
    });
    emVoo.current = envio;
    return envio;
  }, [api]);

  const cancelarEspera = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
  }, []);

  const guardar = useCallback(
    (estado: EstadoDoCadastro) => {
      if (estado.tipoId === null) return;
      pendente.current = conteudoDoRascunho(estado);
      definirSituacao({ tipo: 'guardando' });
      cancelarEspera();
      espera.current = setTimeout(() => {
        espera.current = null;
        void enviarPendente();
      }, ESPERA);
    },
    [cancelarEspera, enviarPendente],
  );

  const tentarDeNovo = useCallback(() => {
    cancelarEspera();
    void enviarPendente();
  }, [cancelarEspera, enviarPendente]);

  /** Para o que está esperando e aguarda o envio em curso: o cadastro apaga o rascunho. */
  const antesDeCadastrar = useCallback(async () => {
    cancelarEspera();
    pendente.current = null;
    await emVoo.current;
  }, [cancelarEspera]);

  const descartar = useCallback(async (): Promise<{ ok: true } | { erro: string }> => {
    await antesDeCadastrar();
    const resultado = await pedir(() => api.DELETE('/ativos/rascunho'), 'descartar o rascunho');
    if ('erro' in resultado) return { erro: resultado.erro };
    definirSituacao({ tipo: 'nada' });
    return { ok: true };
  }, [api, antesDeCadastrar]);

  // Ao sair da tela, ou da página, o que estava esperando vai na hora, sem esperar a resposta.
  useEffect(() => {
    const aoSair = () => {
      if (!espera.current) return;
      cancelarEspera();
      void enviarPendente();
    };
    window.addEventListener('pagehide', aoSair);
    return () => {
      window.removeEventListener('pagehide', aoSair);
      aoSair();
    };
  }, [cancelarEspera, enviarPendente]);

  // "Agora" vira a hora 1 min depois da gravação.
  useEffect(() => {
    if (situacao.tipo !== 'guardado') return;
    const falta = situacao.em.getTime() + AGORA - Date.now();
    if (falta <= 0) {
      definirAgora(Date.now());
      return;
    }
    const relogio = setTimeout(() => definirAgora(Date.now()), falta);
    return () => clearTimeout(relogio);
  }, [situacao]);

  const texto =
    situacao.tipo === 'guardando'
      ? 'Guardando o rascunho…'
      : situacao.tipo === 'falhou'
        ? 'O rascunho não foi guardado.'
        : situacao.tipo === 'guardado'
          ? agora - situacao.em.getTime() < AGORA
            ? 'Rascunho guardado agora'
            : `Rascunho guardado às ${formatarHora(situacao.em)}`
          : null;

  return {
    texto,
    falhou: situacao.tipo === 'falhou',
    guardar,
    tentarDeNovo,
    antesDeCadastrar,
    descartar,
  };
}
