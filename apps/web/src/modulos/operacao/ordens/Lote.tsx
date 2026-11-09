import {
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  SITUACOES_DO_LOTE_DAS_ORDENS,
  type SituacaoDoLoteDasOrdens,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  MensagemDoPasso,
  Radio,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilosDaOperacao from '../Operacao.module.css';
import { CHAVE_DAS_ORDENS } from './consultas.ts';

const selecionadas = (quantas: number) =>
  quantas === 1 ? '1 ordem de serviço selecionada' : `${quantas} ordens de serviço selecionadas`;

/**
 * A mudança da situação em lote, numa gaveta aberta pela barra da tabela (spec ordens-de-servico,
 * "Mudança da situação das OS em lote"): Em atendimento, Aguardando peça ou Encerrada, que no lote
 * vale só para a Resolvida. A API muda cada uma pelas regras dela, e o retorno diz quantas mudaram
 * e quais não.
 */
export function GavetaDoLoteDasOrdens({
  numeros,
  aoFechar,
  aoMudar,
}: {
  numeros: readonly number[];
  aoFechar: () => void;
  /** Depois da mudança: a tela limpa a seleção e fecha a gaveta. */
  aoMudar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [situacao, definirSituacao] = useState<SituacaoDoLoteDasOrdens | null>(null);
  const [erro, definirErro] = useState<string | undefined>();
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    if (situacao === null) {
      definirErro('Escolha a situação.');
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/ordens/situacao', {
            body: { numeros: [...numeros].sort((a, b) => a - b), situacao },
          }),
        'mudar a situação',
      );
      if ('erro' in resultado) {
        const { campos, erro: mensagem } = recusaDe<'situacao'>(resultado);
        if (campos?.situacao) {
          definirErro(campos.situacao);
          return;
        }
        definirFalha(mensagem);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_ORDENS });
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
        <p className={estilosDaOperacao.informacao}>{selecionadas(numeros.length)}</p>
        <GrupoDeRadios
          rotulo="Situação nova"
          descricao="Encerrada vale só para as resolvidas."
          value={situacao}
          onChange={(valor) => {
            definirSituacao(valor as SituacaoDoLoteDasOrdens);
            definirErro(undefined);
          }}
          erro={erro}
        >
          {SITUACOES_DO_LOTE_DAS_ORDENS.map((opcao) => (
            <Radio key={opcao} value={opcao}>
              {ROTULOS_DAS_SITUACOES_DA_ORDEM[opcao]}
            </Radio>
          ))}
        </GrupoDeRadios>
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
