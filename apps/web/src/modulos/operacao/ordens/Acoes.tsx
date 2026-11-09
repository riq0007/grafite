import {
  lerQuantidade,
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  type SituacaoDeAtendimento,
  validarCorrecaoDaOrdem,
  validarEncerramentoDaOrdem,
  validarMudancaDaOrdem,
  validarPecaDaOrdem,
  validarReaberturaDaOrdem,
  validarResolucaoDaOrdem,
} from '@grafite/domain';
import {
  AreaDeTexto,
  avisar,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  LinkDeCadastro,
  MensagemDoPasso,
  Radio,
  Selecao,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useBuscarFornecedores } from '../../administracao/fornecedores/escolha.ts';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { useCadastro } from '../../cadastros.tsx';
import estilosDaOperacao from '../Operacao.module.css';
import { CHAVE_DAS_SOLICITACOES } from '../solicitacoes/consultas.ts';
import { opcoesDosSaldosParaEntrega } from '../solicitacoes/escolhas.ts';
import { type AcaoDaOrdem, resumoDaOrdem, situacoesPossiveisDaOrdem } from './acoes.ts';
import { CHAVE_DAS_ORDENS, type OrdemDeServico } from './consultas.ts';
import { useBuscarPecas } from './escolhas.ts';

/** A gaveta da ação escolhida na linha da lista ou na ficha. */
export function GavetaDaAcaoDaOrdem({
  acao,
  ordem,
  aoFechar,
}: {
  acao: AcaoDaOrdem;
  ordem: OrdemDeServico;
  aoFechar: () => void;
}) {
  switch (acao) {
    case 'situacao':
      return <GavetaDaSituacao ordem={ordem} aoFechar={aoFechar} />;
    case 'peca':
      return <GavetaDaPeca ordem={ordem} aoFechar={aoFechar} />;
    case 'resolver':
      return <GavetaDaResolucao ordem={ordem} aoFechar={aoFechar} />;
    case 'corrigir':
      return <GavetaDaCorrecao ordem={ordem} aoFechar={aoFechar} />;
    case 'encerrar-sem-resolver':
      return <GavetaDoEncerramento ordem={ordem} semResolver aoFechar={aoFechar} />;
    case 'reabrir':
      return <GavetaDaReabertura ordem={ordem} aoFechar={aoFechar} />;
    case 'encerrar':
      return <GavetaDoEncerramento ordem={ordem} semResolver={false} aoFechar={aoFechar} />;
  }
}

/**
 * O envio de uma ação: o pedido à API, a recusa no campo que ela aponta, com o foco nele, ou junto à
 * ação, e, depois dela, as OS e as solicitações relidas, o retorno e a gaveta fechada.
 */
export function useEnvioDaAcaoDaOrdem<TCampo extends string>({
  acao,
  retorno,
  aoFechar,
}: {
  acao: string;
  retorno: string;
  aoFechar: () => void;
}) {
  const consultas = useQueryClient();
  const [erros, definirErros] = useState<Partial<Record<TCampo, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current
      ?.querySelector<HTMLElement>('input[aria-invalid="true"], textarea[aria-invalid="true"]')
      ?.focus();
  }, [pedidoDeFoco]);
  const recusar = (motivos: Partial<Record<TCampo, string>>) => {
    definirErros(motivos);
    definirPedidoDeFoco((atual) => atual + 1);
  };
  const enviar = async (
    conferidos: Partial<Record<TCampo, string>>,
    fazer: Parameters<typeof pedir>[0],
  ) => {
    if (enviando) return;
    definirFalha(null);
    if (Object.keys(conferidos).length > 0) return recusar(conferidos);
    definirEnviando(true);
    try {
      const resultado = await pedir(fazer, acao);
      if ('erro' in resultado) {
        const { campos, erro } = recusaDe<TCampo>(resultado);
        if (campos && Object.keys(campos).length > 0) return recusar(campos);
        definirFalha(erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      // A ficha da solicitação de conserto mostra a situação da OS dela.
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CHAVE_DAS_ORDENS }),
        consultas.invalidateQueries({ queryKey: CHAVE_DAS_SOLICITACOES }),
      ]);
      avisar({ situacao: 'sucesso', titulo: retorno });
      aoFechar();
    } finally {
      definirEnviando(false);
    }
  };
  const tirarErro = (campo: TCampo) =>
    definirErros(({ [campo]: _, ...outros }) => outros as Partial<Record<TCampo, string>>);
  return { area, erros, tirarErro, falha, tentativa, enviando, enviar };
}

/** A gaveta de uma ação: o resumo da OS, os campos, a falha e os botões. */
export function GavetaDeAcaoDaOrdem({
  titulo,
  ordem,
  area,
  aberta = true,
  aoFechar,
  aoEnviar,
  falha,
  tentativa,
  enviando,
  botao,
  rotuloEnviando,
  destrutiva = false,
  children,
}: {
  titulo: string;
  ordem: OrdemDeServico;
  area: React.RefObject<HTMLDivElement | null>;
  aberta?: boolean;
  aoFechar: () => void;
  aoEnviar: () => void;
  falha: string | null;
  tentativa: number;
  enviando: boolean;
  botao: string;
  rotuloEnviando: string;
  destrutiva?: boolean;
  children?: ReactNode;
}) {
  return (
    <Gaveta
      aberta={aberta}
      aoMudarAberta={(abrir) => {
        if (!abrir && aberta) aoFechar();
      }}
      titulo={titulo}
    >
      <div ref={area} className={estilosDaOperacao.tela}>
        <Formulario
          validationBehavior="aria"
          onSubmit={(evento: FormEvent) => {
            evento.preventDefault();
            aoEnviar();
          }}
        >
          <p className={estilosDaOperacao.informacao}>{resumoDaOrdem(ordem)}</p>
          {children}
          <MensagemDoPasso texto={falha} chave={tentativa} />
          <div className={estilosDaOperacao.acoes}>
            <Botao
              type="submit"
              nivel={destrutiva ? 'destrutivo' : 'primario'}
              carregando={enviando}
              rotuloCarregando={rotuloEnviando}
            >
              {botao}
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

/** O fornecedor numa gaveta, com "Cadastrar novo fornecedor" numa aba para quem cadastra. */
export function useFornecedorDaGaveta(inicial: ContaDoSeletor | null, aoEscolher: () => void) {
  const buscar = useBuscarFornecedores();
  const cadastro = useCadastro('fornecedor');
  const [pedindo, definirPedindo] = useState(false);
  const [fornecedor, definirFornecedor] = useState<ContaDoSeletor | null>(inicial);
  const pedirCadastro = async () => {
    if (!cadastro) return;
    definirPedindo(true);
    const criado = await cadastro.pedir('ordem-fornecedor', { aoVoltar: () => true });
    definirPedindo(false);
    if (criado) {
      definirFornecedor({ id: criado.id, rotulo: criado.nome });
      aoEscolher();
    }
  };
  const campo = (erro: string | undefined) => (
    <div className={estilosDaOperacao.lista}>
      <SeletorDeConta
        rotulo="Fornecedor"
        obrigatorio
        valor={fornecedor}
        aoMudar={(escolhido) => {
          definirFornecedor(escolhido);
          aoEscolher();
        }}
        buscar={buscar}
        erro={erro}
      />
      {cadastro && (
        <LinkDeCadastro texto={cadastro.link} campo="Fornecedor" aoPressionar={pedirCadastro} />
      )}
    </div>
  );
  return { fornecedor, pedindo, campo };
}

/**
 * A correção da OS em aberto (spec ordens-de-servico, "Ordem de serviço" e "Fornecedor da OS"): o
 * problema e, na OS com o fornecedor, o fornecedor e o número da OS nele, como na mudança da
 * situação.
 */
function GavetaDaCorrecao({ ordem, aoFechar }: { ordem: OrdemDeServico; aoFechar: () => void }) {
  const api = useApi();
  const [problema, definirProblema] = useState(ordem.problema);
  const [os, definirOs] = useState(ordem.osDoFornecedor ?? '');
  const envio = useEnvioDaAcaoDaOrdem<'problema' | 'fornecedor' | 'os'>({
    acao: 'corrigir a OS',
    retorno: 'OS corrigida.',
    aoFechar,
  });
  const comFornecedor = ordem.fornecedor !== null;
  const fornecedor = useFornecedorDaGaveta(
    ordem.fornecedor ? { id: ordem.fornecedor.id, rotulo: ordem.fornecedor.nome } : null,
    () => envio.tirarErro('fornecedor'),
  );
  return (
    <GavetaDeAcaoDaOrdem
      titulo={`Corrigir a OS ${ordem.numero}`}
      ordem={ordem}
      area={envio.area}
      aberta={!fornecedor.pedindo}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const limpo = problema.trim();
        const doFornecedor = {
          fornecedor: fornecedor.fornecedor?.id ?? null,
          os: os.trim() === '' ? null : os.trim(),
        };
        void envio.enviar(
          validarCorrecaoDaOrdem({
            problema: limpo,
            ...(comFornecedor ? { fornecedor: doFornecedor } : {}),
          }),
          () =>
            api.PATCH('/ordens/{numero}', {
              params: { path: { numero: ordem.numero } },
              body: { problema: limpo, ...(comFornecedor ? doFornecedor : {}) },
            }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Corrigir"
      rotuloEnviando="Corrigindo"
    >
      <AreaDeTexto
        rotulo="Problema"
        obrigatorio
        value={problema}
        onChange={(valor) => {
          definirProblema(valor);
          envio.tirarErro('problema');
        }}
        erro={envio.erros.problema}
      />
      {comFornecedor && (
        <>
          {fornecedor.campo(envio.erros.fornecedor)}
          <CampoDeTexto
            rotulo="Número da OS no fornecedor"
            autoComplete="off"
            descricao="O número que o fornecedor deu ao pedido, quando ele dá."
            value={os}
            onChange={(valor) => {
              definirOs(valor);
              envio.tirarErro('os');
            }}
            erro={envio.erros.os}
          />
        </>
      )}
    </GavetaDeAcaoDaOrdem>
  );
}

/**
 * A mudança da situação da OS em aberto (spec ordens-de-servico, "Situação e histórico da OS" e
 * "Fornecedor da OS"): Em atendimento, Aguardando peça ou Aguardando fornecedor, menos a em que ela
 * está, com a observação; a Aguardando fornecedor pede o fornecedor, com "Cadastrar novo
 * fornecedor" numa aba, e o número da OS nele.
 */
function GavetaDaSituacao({ ordem, aoFechar }: { ordem: OrdemDeServico; aoFechar: () => void }) {
  const api = useApi();
  const [situacao, definirSituacao] = useState<SituacaoDeAtendimento | null>(null);
  const [observacao, definirObservacao] = useState('');
  const [os, definirOs] = useState(ordem.osDoFornecedor ?? '');
  const envio = useEnvioDaAcaoDaOrdem<'situacao' | 'observacao' | 'fornecedor' | 'os'>({
    acao: 'mudar a situação',
    retorno: 'Situação mudada.',
    aoFechar,
  });
  const fornecedor = useFornecedorDaGaveta(
    ordem.fornecedor ? { id: ordem.fornecedor.id, rotulo: ordem.fornecedor.nome } : null,
    () => envio.tirarErro('fornecedor'),
  );
  const doFornecedor = situacao === 'aguardando-fornecedor';
  return (
    <GavetaDeAcaoDaOrdem
      titulo={`Mudar a situação da OS ${ordem.numero}`}
      ordem={ordem}
      area={envio.area}
      aberta={!fornecedor.pedindo}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const limpa = observacao.trim() === '' ? null : observacao.trim();
        const doPedido = {
          fornecedor: fornecedor.fornecedor?.id ?? null,
          os: os.trim() === '' ? null : os.trim(),
        };
        void envio.enviar(
          validarMudancaDaOrdem({
            situacao,
            observacao: limpa,
            ...(doFornecedor ? { fornecedor: doPedido } : {}),
          }),
          () =>
            api.POST('/ordens/{numero}/situacao', {
              params: { path: { numero: ordem.numero } },
              body: {
                situacao: situacao ?? 'em-atendimento',
                observacao: limpa,
                ...(doFornecedor ? doPedido : {}),
              },
            }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Mudar"
      rotuloEnviando="Mudando"
    >
      <GrupoDeRadios
        rotulo="Situação nova"
        value={situacao}
        onChange={(valor) => {
          definirSituacao(valor as SituacaoDeAtendimento);
          envio.tirarErro('situacao');
        }}
        erro={envio.erros.situacao}
      >
        {situacoesPossiveisDaOrdem(ordem).map((opcao) => (
          <Radio key={opcao} value={opcao}>
            {ROTULOS_DAS_SITUACOES_DA_ORDEM[opcao]}
          </Radio>
        ))}
      </GrupoDeRadios>
      {doFornecedor && (
        <>
          {fornecedor.campo(envio.erros.fornecedor)}
          <CampoDeTexto
            rotulo="Número da OS no fornecedor"
            autoComplete="off"
            descricao="O número que o fornecedor deu ao pedido, quando ele dá."
            value={os}
            onChange={(valor) => {
              definirOs(valor);
              envio.tirarErro('os');
            }}
            erro={envio.erros.os}
          />
        </>
      )}
      <AreaDeTexto
        rotulo="Observação"
        value={observacao}
        onChange={(valor) => {
          definirObservacao(valor);
          envio.tirarErro('observacao');
        }}
        erro={envio.erros.observacao}
      />
    </GavetaDeAcaoDaOrdem>
  );
}

/**
 * A peça da OS (spec ordens-de-servico, "Peças da OS"): o consumível, com as Peças primeiro, o local
 * de origem entre os locais em que a conta movimenta o estoque, com o saldo e o de maior saldo já
 * escolhido, e a quantidade. A saída do estoque leva "OS <número>"; a recusa dela fica no campo.
 */
function GavetaDaPeca({ ordem, aoFechar }: { ordem: OrdemDeServico; aoFechar: () => void }) {
  const api = useApi();
  const buscarPecas = useBuscarPecas();
  const [consumivel, definirConsumivel] = useState<ContaDoSeletor | null>(null);
  const [local, definirLocal] = useState<string | null | undefined>(undefined);
  const [quantidade, definirQuantidade] = useState('');
  const envio = useEnvioDaAcaoDaOrdem<'consumivel' | 'local' | 'quantidade'>({
    acao: 'lançar a peça',
    retorno: 'Peça lançada.',
    aoFechar,
  });
  const saldos = useQuery({
    ...opcoesDosSaldosParaEntrega(api, consumivel?.id ?? ''),
    enabled: consumivel !== null,
  });
  // Sem escolha, o local de maior saldo.
  const origem = local !== undefined ? local : (saldos.data?.[0]?.local.id ?? null);
  const semSaldo = consumivel !== null && saldos.data?.length === 0;
  return (
    <GavetaDeAcaoDaOrdem
      titulo={`Lançar peça na OS ${ordem.numero}`}
      ordem={ordem}
      area={envio.area}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const pedido = {
          consumivel: consumivel?.id ?? null,
          local: origem,
          quantidade: lerQuantidade(quantidade),
        };
        void envio.enviar(validarPecaDaOrdem(pedido), () =>
          api.POST('/ordens/{numero}/pecas', {
            params: { path: { numero: ordem.numero } },
            body: pedido,
          }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Lançar"
      rotuloEnviando="Lançando"
    >
      <SeletorDeConta
        rotulo="Consumível"
        obrigatorio
        valor={consumivel}
        aoMudar={(escolhido) => {
          definirConsumivel(escolhido);
          definirLocal(undefined);
          envio.tirarErro('consumivel');
          envio.tirarErro('local');
        }}
        buscar={buscarPecas}
        descricao="Os consumíveis ativos, com as peças primeiro, pelo código ou pelo nome."
        erro={envio.erros.consumivel}
      />
      {semSaldo ? (
        <p className={estilosDaOperacao.informacao}>
          Sem saldo nos locais em que você movimenta o estoque.
        </p>
      ) : (
        consumivel !== null && (
          <Selecao
            rotulo="Local de origem"
            obrigatorio
            opcoes={(saldos.data ?? []).map(({ local: doSaldo, saldo }) => ({
              id: doSaldo.id,
              rotulo: `${doSaldo.caminho} · saldo ${saldo.toLocaleString('pt-BR')}`,
            }))}
            selectedKey={origem}
            onSelectionChange={(chave) => {
              definirLocal(chave === null ? null : String(chave));
              envio.tirarErro('local');
            }}
            erro={envio.erros.local}
          />
        )
      )}
      <CampoDeTexto
        rotulo="Quantidade"
        obrigatorio
        inputMode="numeric"
        autoComplete="off"
        value={quantidade}
        onChange={(valor) => {
          definirQuantidade(valor);
          envio.tirarErro('quantidade');
        }}
        erro={envio.erros.quantidade}
      />
    </GavetaDeAcaoDaOrdem>
  );
}

/** A resolução da OS em aberto, com o que foi feito, que conclui a solicitação de origem. */
function GavetaDaResolucao({ ordem, aoFechar }: { ordem: OrdemDeServico; aoFechar: () => void }) {
  const api = useApi();
  const [solucao, definirSolucao] = useState('');
  const envio = useEnvioDaAcaoDaOrdem<'solucao'>({
    acao: 'resolver a OS',
    retorno: 'OS resolvida.',
    aoFechar,
  });
  return (
    <GavetaDeAcaoDaOrdem
      titulo={`Resolver a OS ${ordem.numero}`}
      ordem={ordem}
      area={envio.area}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const erro = validarResolucaoDaOrdem(solucao);
        void envio.enviar(erro ? { solucao: erro } : {}, () =>
          api.POST('/ordens/{numero}/resolucao', {
            params: { path: { numero: ordem.numero } },
            body: { solucao: solucao.trim() },
          }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Resolver"
      rotuloEnviando="Resolvendo"
    >
      <AreaDeTexto
        rotulo="O que foi feito"
        obrigatorio
        value={solucao}
        onChange={(valor) => {
          definirSolucao(valor);
          envio.tirarErro('solucao');
        }}
        erro={envio.erros.solucao}
      />
    </GavetaDeAcaoDaOrdem>
  );
}

/** A reabertura da OS resolvida, que volta a Em atendimento, com o motivo. */
function GavetaDaReabertura({ ordem, aoFechar }: { ordem: OrdemDeServico; aoFechar: () => void }) {
  const api = useApi();
  const [motivo, definirMotivo] = useState('');
  const envio = useEnvioDaAcaoDaOrdem<'motivo'>({
    acao: 'reabrir a OS',
    retorno: 'OS reaberta.',
    aoFechar,
  });
  return (
    <GavetaDeAcaoDaOrdem
      titulo={`Reabrir a OS ${ordem.numero}`}
      ordem={ordem}
      area={envio.area}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const erro = validarReaberturaDaOrdem(motivo);
        void envio.enviar(erro ? { motivo: erro } : {}, () =>
          api.POST('/ordens/{numero}/reabertura', {
            params: { path: { numero: ordem.numero } },
            body: { motivo: motivo.trim() },
          }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Reabrir"
      rotuloEnviando="Reabrindo"
    >
      <CampoDeTexto
        rotulo="Motivo da reabertura"
        obrigatorio
        value={motivo}
        onChange={(valor) => {
          definirMotivo(valor);
          envio.tirarErro('motivo');
        }}
        erro={envio.erros.motivo}
      />
    </GavetaDeAcaoDaOrdem>
  );
}

/**
 * O encerramento: o da Resolvida, com a confirmação, e o da em aberto sem resolver, com o motivo,
 * que cancela a solicitação de origem. A Encerrada não muda mais.
 */
function GavetaDoEncerramento({
  ordem,
  semResolver,
  aoFechar,
}: {
  ordem: OrdemDeServico;
  semResolver: boolean;
  aoFechar: () => void;
}) {
  const api = useApi();
  const [motivo, definirMotivo] = useState('');
  const envio = useEnvioDaAcaoDaOrdem<'motivo'>({
    acao: 'encerrar a OS',
    retorno: 'OS encerrada.',
    aoFechar,
  });
  return (
    <GavetaDeAcaoDaOrdem
      titulo={
        semResolver ? `Encerrar sem resolver a OS ${ordem.numero}` : `Encerrar a OS ${ordem.numero}`
      }
      ordem={ordem}
      area={envio.area}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const erro = semResolver ? validarEncerramentoDaOrdem(motivo) : null;
        void envio.enviar(erro ? { motivo: erro } : {}, () =>
          api.POST('/ordens/{numero}/encerramento', {
            params: { path: { numero: ordem.numero } },
            body: semResolver
              ? { semResolver: true, motivo: motivo.trim() }
              : { semResolver: false },
          }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Encerrar"
      rotuloEnviando="Encerrando"
      destrutiva={semResolver}
    >
      {semResolver ? (
        <CampoDeTexto
          rotulo="Motivo do encerramento"
          obrigatorio
          value={motivo}
          onChange={(valor) => {
            definirMotivo(valor);
            envio.tirarErro('motivo');
          }}
          erro={envio.erros.motivo}
        />
      ) : (
        <p className={estilosDaOperacao.informacao}>
          A OS encerrada não muda mais. Se o problema voltar, abra outra OS.
        </p>
      )}
    </GavetaDeAcaoDaOrdem>
  );
}
