// O resolver e o virar OS do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "O chamado aberto, o cabeçalho"): os dois pedem um texto num diálogo, e a
// recusa volta a ele, no campo quando é do campo; o retorno vai num aviso. Aceita ou recusada, a
// tela relê os chamados, como nas ações do atendimento.
import { avisar } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { CHAVE_DOS_CHAMADOS } from '../consultas.ts';

/** A recusa que volta ao diálogo: a frase, e se ela é do campo do diálogo. */
export interface RecusaNoDialogo {
  erro: string;
  doCampo: boolean;
}

/** A frase do campo do diálogo, quando a recusa é dele; senão, a frase da recusa. */
export function recusaNoDialogo(falha: FalhaDoPedido, campo: string): RecusaNoDialogo {
  const doCampo = falha.problema?.campos?.[campo];
  return doCampo ? { erro: doCampo, doCampo: true } : { erro: falha.erro, doCampo: false };
}

export interface AcoesDoChamadoAberto {
  /** Nulo quando resolveu; senão, a recusa. */
  resolver: (numero: number, versao: number, feito: string) => Promise<RecusaNoDialogo | null>;
  /** Nulo quando a OS abriu; senão, a recusa. */
  virarOs: (numero: number, problema: string) => Promise<RecusaNoDialogo | null>;
}

export function useAcoesDoChamadoAberto(): AcoesDoChamadoAberto {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  return useMemo(() => {
    const reler = () => void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
    const doChamado = (numero: number) => ({ params: { path: { numero } } });
    return {
      async resolver(numero, versao, feito) {
        const resultado = await pedir(
          () =>
            api.POST('/chamados/{numero}/resolver', {
              ...doChamado(numero),
              body: { feito, versao },
            }),
          'resolver o chamado',
        );
        reler();
        if ('erro' in resultado) return recusaNoDialogo(resultado, 'feito');
        avisar({ situacao: 'sucesso', titulo: `Você resolveu o #${numero}.` });
        return null;
      },
      async virarOs(numero, problema) {
        const resultado = await pedir(
          () => api.POST('/chamados/{numero}/os', { ...doChamado(numero), body: { problema } }),
          'abrir a OS do chamado',
        );
        reler();
        if ('erro' in resultado) return recusaNoDialogo(resultado, 'problema');
        const os = String(resultado.dados.numero);
        avisar({
          situacao: 'sucesso',
          titulo: `OS ${os} aberta.`,
          acao: {
            rotulo: 'Abrir',
            aoEscolher: () =>
              void navegar({ to: '/operacao/ordens/$numero', params: { numero: os } }),
          },
        });
        return null;
      },
    };
  }, [api, consultas, navegar]);
}
