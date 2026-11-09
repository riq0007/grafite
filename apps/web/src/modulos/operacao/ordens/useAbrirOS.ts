// "Abrir OS" na solicitação de conserto (spec modulo-operacao, "Formulários das ordens de serviço";
// change p4e-ordens-de-servico, design, decisão 8): sem gaveta, a OS nasce com o ativo e o defeito
// do conserto, e a tela leva à ficha dela, com o retorno "OS 12 aberta.". A recusa da API fica no
// aviso.
import { retornoDaAbertura } from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { CHAVE_DAS_SOLICITACOES } from '../solicitacoes/consultas.ts';
import { CHAVE_DAS_ORDENS } from './consultas.ts';

export function useAbrirOS() {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  return useCallback(
    async (solicitacao: number) => {
      const resultado = await pedir(
        () =>
          api.POST('/solicitacoes/{numero}/ordem', {
            params: { path: { numero: solicitacao } },
          }),
        'abrir a ordem de serviço',
      );
      if ('erro' in resultado) {
        avisar({ situacao: 'atencao', titulo: recusaDe(resultado).erro });
        return;
      }
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CHAVE_DAS_ORDENS }),
        consultas.invalidateQueries({ queryKey: CHAVE_DAS_SOLICITACOES }),
      ]);
      const { numero } = resultado.dados;
      avisar({ situacao: 'sucesso', titulo: retornoDaAbertura(numero) });
      void navegar({ to: '/operacao/ordens/$numero', params: { numero: String(numero) } });
    },
    [api, consultas, navegar],
  );
}
