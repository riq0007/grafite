import {
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  type SituacaoDeDestino,
  validarCancelamento,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  MensagemDoPasso,
  Radio,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilosDaOperacao from '../Operacao.module.css';
import { SITUACOES_DE_DESTINO } from './acoes.ts';
import { CHAVE_DAS_SOLICITACOES } from './consultas.ts';

const selecionadas = (quantas: number) =>
  quantas === 1 ? '1 solicitação selecionada' : `${quantas} solicitações selecionadas`;

/**
 * A mudança da situação em lote, numa gaveta aberta pela barra da tabela (spec solicitacoes,
 * "Mudança da situação em lote"): a situação nova e, no cancelamento, o motivo, um só para todas.
 * A API muda cada uma pelas regras dela, e o retorno diz quantas mudaram e quais não. A ficha e a
 * linha a abrem para uma solicitação só, com o resumo dela e só as situações a que ela pode passar.
 */
export function GavetaDoLote({
  numeros,
  resumo,
  situacoes = SITUACOES_DE_DESTINO,
  aoFechar,
  aoMudar,
}: {
  numeros: readonly number[];
  /** O resumo da solicitação, no lugar de quantas estão selecionadas. */
  resumo?: string;
  situacoes?: readonly SituacaoDeDestino[];
  aoFechar: () => void;
  /** Depois da mudança: a tela limpa a seleção e fecha a gaveta. */
  aoMudar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [situacao, definirSituacao] = useState<SituacaoDeDestino | null>(null);
  const [motivo, definirMotivo] = useState('');
  const [erros, definirErros] = useState<{ situacao?: string; motivo?: string }>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const campoDoMotivo = useRef<HTMLInputElement>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    if (situacao === null) {
      definirErros({ situacao: 'Escolha a situação.' });
      return;
    }
    const cancelamento = situacao === 'cancelada';
    const recusaDoMotivo = cancelamento ? validarCancelamento(motivo) : null;
    if (recusaDoMotivo) {
      definirErros({ motivo: recusaDoMotivo });
      campoDoMotivo.current?.focus();
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/solicitacoes/situacao', {
            body: {
              numeros: [...numeros].sort((a, b) => a - b),
              situacao,
              ...(cancelamento ? { motivo: motivo.trim() } : {}),
            },
          }),
        'mudar a situação',
      );
      if ('erro' in resultado) {
        const { campos, erro } = recusaDe<'situacao' | 'motivo'>(resultado);
        if (campos?.situacao || campos?.motivo) {
          definirErros({ situacao: campos.situacao, motivo: campos.motivo });
          return;
        }
        definirFalha(erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SOLICITACOES });
      const { recusadas, texto } = resultado.dados;
      avisar({ situacao: recusadas.length > 0 ? 'atencao' : 'sucesso', titulo: texto });
      aoMudar();
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Mudar a situação"
    >
      <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
        <p className={estilosDaOperacao.informacao}>{resumo ?? selecionadas(numeros.length)}</p>
        <GrupoDeRadios
          rotulo="Situação nova"
          value={situacao}
          onChange={(valor) => {
            definirSituacao(valor as SituacaoDeDestino);
            definirErros({});
          }}
          erro={erros.situacao}
        >
          {situacoes.map((opcao) => (
            <Radio key={opcao} value={opcao}>
              {ROTULOS_DAS_SITUACOES_DA_SOLICITACAO[opcao]}
            </Radio>
          ))}
        </GrupoDeRadios>
        {situacao === 'cancelada' && (
          <CampoDeTexto
            ref={campoDoMotivo}
            rotulo="Motivo do cancelamento"
            descricao="Vale para todas as selecionadas."
            value={motivo}
            onChange={(valor) => {
              definirMotivo(valor);
              definirErros({});
            }}
            erro={erros.motivo}
          />
        )}
        <MensagemDoPasso texto={falha} chave={tentativa} />
        <div className={estilosDaOperacao.acoes}>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Mudando">
            Mudar
          </Botao>
          <Botao nivel="terciario" onPress={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </Formulario>
    </Gaveta>
  );
}
