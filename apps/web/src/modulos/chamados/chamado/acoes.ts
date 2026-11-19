// O resolver, o virar OS, a troca do ativo e o pedir toner do chamado aberto (spec
// modulo-chamados, "Chamado aberto"; change chamados-da-ti, design, "O chamado aberto, o cabeçalho"
// e "A coluna da direita, a pessoa e o ativo"): o resolver e a troca pedem num diálogo, e o virar
// OS, numa gaveta (tarefa 5.31), e a recusa volta a eles, no campo quando é de um campo; o retorno
// vai num aviso. Aceita ou recusada, a tela relê os chamados, como nas ações do atendimento.
import { retornoDoRegistro, type SituacaoDeAtendimento } from '@grafite/domain';
import { avisar } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { type RecusaDoFormulario, recusaDe } from '../../administracao/recusa.ts';
import type { RegistroDoTonerDoChamado } from '../../operacao/solicitacoes/Formulario.tsx';
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

/** O pedido do "Virar OS": os campos da OS, com o ativo, que pode não ser o do chamado. */
export interface PedidoDoVirarOs {
  ativo: string;
  problema: string;
  situacao: 'aberta' | SituacaoDeAtendimento;
  /** Na Aguardando fornecedor, o fornecedor e o número da OS nele. */
  fornecedor: string | null;
  os: string | null;
}

/** Os campos da gaveta do "Virar OS", em que as recusas da API ficam. */
export type CampoDoVirarOs = 'ativo' | 'problema' | 'situacao' | 'fornecedor' | 'os';

export interface AcoesDoChamadoAberto {
  /** Nulo quando resolveu; senão, a recusa. */
  resolver: (numero: number, versao: number, feito: string) => Promise<RecusaNoDialogo | null>;
  /** Nulo quando a OS abriu; senão, a recusa, com a de cada campo. */
  virarOs: (
    numero: number,
    pedido: PedidoDoVirarOs,
  ) => Promise<RecusaDoFormulario<CampoDoVirarOs> | null>;
  /** Liga, troca ou tira (`null`) o ativo; nulo quando mudou, senão, a recusa. */
  trocarAtivo: (
    numero: number,
    versao: number,
    ativo: string | null,
    tinha: boolean,
  ) => Promise<RecusaNoDialogo | null>;
  /**
   * O primeiro passo do "Pedir toner": junta o chamado à pendente, com o aviso, ou dá o registro
   * do Toner para a gaveta. A recusa vai num aviso, e nada volta.
   */
  pedirToner: (numero: number) => Promise<RegistroDoTonerDoChamado | null>;
  /** O aviso da solicitação que a gaveta do toner do chamado registrou. */
  tonerPedido: (solicitacao: number) => void;
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
      async virarOs(numero, pedido) {
        const resultado = await pedir(
          () => api.POST('/chamados/{numero}/os', { ...doChamado(numero), body: pedido }),
          'abrir a OS do chamado',
        );
        reler();
        if ('erro' in resultado) return recusaDe<CampoDoVirarOs>(resultado);
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
      async trocarAtivo(numero, versao, ativo, tinha) {
        const resultado = await pedir(
          () =>
            api.PUT('/chamados/{numero}/ativo', { ...doChamado(numero), body: { ativo, versao } }),
          'trocar o ativo do chamado',
        );
        reler();
        if ('erro' in resultado) return recusaNoDialogo(resultado, 'ativo');
        let titulo = `Você trocou o ativo do #${numero}.`;
        if (ativo === null) titulo = `Você tirou o ativo do #${numero}.`;
        else if (!tinha) titulo = `Você ligou um ativo ao #${numero}.`;
        avisar({ situacao: 'sucesso', titulo });
        return null;
      },
      async pedirToner(numero) {
        const resultado = await pedir(
          () => api.POST('/chamados/{numero}/toner', { ...doChamado(numero), body: {} }),
          'pedir o toner do chamado',
        );
        if ('erro' in resultado) {
          reler();
          avisar({ situacao: 'critico', titulo: resultado.erro });
          return null;
        }
        const dados = resultado.dados;
        if (dados.resultado === 'registro') return dados.registro;
        reler();
        avisar({
          situacao: 'sucesso',
          titulo: `O #${numero} se juntou à solicitação ${dados.solicitacao.numero}.`,
        });
        return null;
      },
      tonerPedido(solicitacao) {
        reler();
        avisar({
          situacao: 'sucesso',
          titulo: retornoDoRegistro(solicitacao),
          acao: {
            rotulo: 'Abrir',
            aoEscolher: () =>
              void navegar({
                to: '/operacao/solicitacoes/$numero',
                params: { numero: String(solicitacao) },
              }),
          },
        });
      },
    };
  }, [api, consultas, navegar]);
}
