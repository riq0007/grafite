// "Virar OS" do chamado aberto (spec ordens-de-servico, "OS pelo chamado"; change chamados-da-ti,
// design, "O Virar OS com os campos da OS (tarefa 5.31)"): a gaveta, como a do "Pedir toner", com o
// ativo, que se troca só para a OS, o problema com as respostas do formulário, a situação em que a
// OS nasce e, na Aguardando fornecedor, o fornecedor, com o cadastro numa aba, e o número da OS nele.
// As recusas ficam no campo delas, com o foco no primeiro; as outras, junto aos botões.
import {
  partesDoResumo,
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  SITUACOES_DE_ATENDIMENTO,
  type SituacaoDeAtendimento,
  validarAberturaDaOrdem,
  validarMudancaDaOrdem,
} from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  MensagemDoPasso,
  Radio,
} from '@grafite/ui';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import type { ContaDoSeletor } from '../../administracao/seletores/SeletorDeConta.tsx';
import { useFornecedorDaGaveta } from '../../operacao/ordens/Acoes.tsx';
import type { FichaDoChamado } from '../consultas.ts';
import { rotuloDoAtivoCitado } from '../formulario/estado.ts';
import { type CampoDoVirarOs, useAcoesDoChamadoAberto } from './acoes.ts';
import { contextoDaFicha } from './conversa.ts';
import { EscolhaDoAtivo } from './EscolhaDoAtivo.tsx';
import { problemaDaOs } from './os.ts';
import estilos from './VirarOs.module.css';

type SituacaoInicial = 'aberta' | SituacaoDeAtendimento;

/** A Aberta, a de sempre, e as do atendimento, em que a OS também pode nascer. */
const SITUACOES_INICIAIS: readonly SituacaoInicial[] = ['aberta', ...SITUACOES_DE_ATENDIMENTO];

type Erros = Partial<Record<CampoDoVirarOs, string>>;

export function GavetaDoVirarOs({
  ficha,
  aoFechar,
}: {
  ficha: FichaDoChamado;
  aoFechar: () => void;
}) {
  const { pode } = useAcesso();
  const acoes = useAcoesDoChamadoAberto();
  const { numero, pessoa } = ficha;
  const [ativo, definirAtivo] = useState<ContaDoSeletor | null>(() =>
    ficha.ativo ? { id: ficha.ativo.id, rotulo: rotuloDoAtivoCitado(ficha.ativo) } : null,
  );
  const [problema, definirProblema] = useState(() =>
    problemaDaOs(
      ficha.titulo,
      partesDoResumo(ficha.formulario, ficha.respostas, contextoDaFicha(ficha)),
    ),
  );
  const [situacao, definirSituacao] = useState<SituacaoInicial>('aberta');
  const [os, definirOs] = useState('');
  const [erros, definirErros] = useState<Erros>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const tirarErro = (campo: CampoDoVirarOs) =>
    definirErros(({ [campo]: _, ...outros }) => outros as Erros);
  const fornecedor = useFornecedorDaGaveta(null, () => tirarErro('fornecedor'));
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current
      ?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"]')
      ?.focus();
  }, [pedidoDeFoco]);

  // Sem ver os ativos, o campo não aparece, e a OS abre no ativo do chamado.
  const veOsAtivos = pode('ativos.ver');
  const doFornecedor = situacao === 'aguardando-fornecedor';
  const naVista = (campo: string) =>
    campo === 'problema' ||
    campo === 'situacao' ||
    (campo === 'ativo' && veOsAtivos) ||
    ((campo === 'fornecedor' || campo === 'os') && doFornecedor);
  const recusar = (motivos: Erros) => {
    definirErros(motivos);
    definirPedidoDeFoco((atual) => atual + 1);
  };

  const enviar = async () => {
    if (enviando) return;
    definirFalha(null);
    const limpo = problema.trim();
    const doPedido = {
      fornecedor: fornecedor.fornecedor?.id ?? null,
      os: os.trim() === '' ? null : os.trim(),
    };
    const conferidos: Erros = {
      ...validarAberturaDaOrdem({ ativo: ativo?.id ?? null, problema: limpo || null }),
      ...(situacao === 'aberta'
        ? {}
        : validarMudancaDaOrdem({
            situacao,
            observacao: null,
            ...(doFornecedor ? { fornecedor: doPedido } : {}),
          })),
    };
    if (Object.keys(conferidos).length > 0 || ativo === null) return recusar(conferidos);
    definirEnviando(true);
    const recusa = await acoes.virarOs(numero, {
      ativo: ativo.id,
      problema: limpo,
      situacao,
      ...(doFornecedor ? doPedido : { fornecedor: null, os: null }),
    });
    definirEnviando(false);
    if (!recusa) {
      aoFechar();
      return;
    }
    const campos = Object.entries(recusa.campos ?? {});
    const foraDaVista = campos.find(([campo]) => !naVista(campo));
    if (campos.length > 0 && !foraDaVista) return recusar(recusa.campos ?? {});
    definirFalha(foraDaVista?.[1] ?? recusa.erro);
    definirTentativa((atual) => atual + 1);
  };

  return (
    <Gaveta
      aberta={!fornecedor.pedindo}
      aoMudarAberta={(abrir) => {
        if (!abrir && !fornecedor.pedindo && !enviando) aoFechar();
      }}
      titulo={`Virar o #${numero} em OS`}
    >
      <div ref={area} className={estilos.gaveta}>
        <Formulario
          validationBehavior="aria"
          onSubmit={(evento: FormEvent) => {
            evento.preventDefault();
            void enviar();
          }}
        >
          {veOsAtivos ? (
            <EscolhaDoAtivo
              valor={ativo}
              aoMudar={(novo) => {
                definirAtivo(novo);
                tirarErro('ativo');
              }}
              pessoa={{ id: pessoa.id, nome: pessoa.nome }}
              descricao={`Trocar o ativo aqui muda só a OS: o #${numero} continua com o dele.`}
              erro={erros.ativo}
            />
          ) : (
            <p
              className={estilos.informacao}
            >{`A OS abre no ativo do chamado, ${ativo?.rotulo}.`}</p>
          )}
          <AreaDeTexto
            rotulo="Problema"
            obrigatorio
            descricao="Com o título e as respostas do chamado, para corrigir antes de abrir."
            value={problema}
            onChange={(valor) => {
              definirProblema(valor);
              tirarErro('problema');
            }}
            erro={erros.problema}
          />
          <GrupoDeRadios
            rotulo="Situação"
            value={situacao}
            onChange={(valor) => {
              definirSituacao(valor as SituacaoInicial);
              tirarErro('situacao');
            }}
            erro={erros.situacao}
          >
            {SITUACOES_INICIAIS.map((opcao) => (
              <Radio key={opcao} value={opcao}>
                {ROTULOS_DAS_SITUACOES_DA_ORDEM[opcao]}
              </Radio>
            ))}
          </GrupoDeRadios>
          {doFornecedor && (
            <>
              {fornecedor.campo(erros.fornecedor)}
              <CampoDeTexto
                rotulo="Número da OS no fornecedor"
                autoComplete="off"
                descricao="O número que o fornecedor deu ao pedido, quando ele dá."
                value={os}
                onChange={(valor) => {
                  definirOs(valor);
                  tirarErro('os');
                }}
                erro={erros.os}
              />
            </>
          )}
          <MensagemDoPasso texto={falha} chave={tentativa} />
          <div className={estilos.acoes}>
            <Botao
              type="submit"
              nivel="primario"
              carregando={enviando}
              rotuloCarregando="Abrindo a OS"
            >
              Abrir a OS
            </Botao>
            <Botao nivel="terciario" isDisabled={enviando} onPress={aoFechar}>
              Cancelar
            </Botao>
          </div>
        </Formulario>
      </div>
    </Gaveta>
  );
}
