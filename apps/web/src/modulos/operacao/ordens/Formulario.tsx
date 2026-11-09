import { retornoDaAbertura, validarAberturaDaOrdem } from '@grafite/domain';
import { AreaDeTexto, avisar, Botao, Formulario, Gaveta, MensagemDoPasso } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import estilosDaOperacao from '../Operacao.module.css';
import { useAtivoDoEndereco, useBuscarAtivos } from '../solicitacoes/escolhas.ts';
import { CHAVE_DAS_ORDENS } from './consultas.ts';

type CampoDaAbertura = 'ativo' | 'problema';

/**
 * A gaveta da nova OS (spec modulo-operacao, "Formulários das ordens de serviço"): o ativo, entre os
 * ativos ativos que a conta vê, pelo nome, pelo patrimônio ou pela série, e o problema, com as
 * regras do domínio, as mesmas da API, o motivo em cada campo e o foco no primeiro recusado. Pela
 * ficha do ativo, o endereço traz o ativo. A OS aberta volta com "OS 12 aberta.".
 */
export function GavetaDaNovaOrdem({
  ativo: doEndereco,
  aoFechar,
}: {
  /** O ativo que o endereço traz, pela ficha dele. */
  ativo?: string;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const ativos = useBuscarAtivos();
  const [ativo, definirAtivo] = useState<ContaDoSeletor | null>(null);
  const [problema, definirProblema] = useState('');
  const [erros, definirErros] = useState<Partial<Record<CampoDaAbertura, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);

  // O ativo que o endereço traz chega só pelo id: o rótulo vem da API.
  const doEnderecoLido = useAtivoDoEndereco(doEndereco);
  const [doEnderecoNoCampo, definirDoEnderecoNoCampo] = useState(false);
  if (doEnderecoLido.data && !doEnderecoNoCampo) {
    definirDoEnderecoNoCampo(true);
    definirAtivo(doEnderecoLido.data.conta);
  }

  // O foco vai ao primeiro campo recusado, depois de a tela mostrar as recusas.
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current
      ?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"]')
      ?.focus();
  }, [pedidoDeFoco]);

  const recusar = (motivos: Partial<Record<CampoDaAbertura, string>>) => {
    definirErros(motivos);
    definirPedidoDeFoco((atual) => atual + 1);
  };
  const tirarErro = (campo: CampoDaAbertura) => definirErros(({ [campo]: _, ...outros }) => outros);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const pedido = { ativo: ativo?.id ?? null, problema: problema.trim() };
    const conferidos = validarAberturaDaOrdem(pedido);
    if (Object.keys(conferidos).length > 0) return recusar(conferidos);
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () => api.POST('/ordens', { body: pedido }),
        'abrir a ordem de serviço',
      );
      if ('erro' in resultado) {
        const recusa = recusaDe<CampoDaAbertura>(resultado);
        if (recusa.campos && Object.keys(recusa.campos).length > 0) return recusar(recusa.campos);
        definirFalha(recusa.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_ORDENS });
      avisar({ situacao: 'sucesso', titulo: retornoDaAbertura(resultado.dados.numero) });
      aoFechar();
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
      titulo="Nova ordem de serviço"
    >
      <div ref={area} className={estilosDaOperacao.tela}>
        <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
          <SeletorDeConta
            rotulo="Ativo"
            obrigatorio
            valor={ativo}
            aoMudar={(escolhido) => {
              definirAtivo(escolhido);
              tirarErro('ativo');
            }}
            buscar={ativos.buscar}
            descricao="Os ativos ativos que você vê, pelo nome, pelo patrimônio ou pela série."
            erro={erros.ativo}
          />
          <AreaDeTexto
            rotulo="Problema"
            obrigatorio
            value={problema}
            onChange={(valor) => {
              definirProblema(valor);
              tirarErro('problema');
            }}
            erro={erros.problema}
          />
          <MensagemDoPasso texto={falha} chave={tentativa} />
          <div className={estilosDaOperacao.acoes}>
            <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Abrindo">
              Abrir a OS
            </Botao>
            <Botao nivel="terciario" onPress={aoFechar}>
              Cancelar
            </Botao>
          </div>
        </Formulario>
      </div>
    </Gaveta>
  );
}
