import { validarCancelamento, validarConclusao, validarPedidoAoFornecedor } from '@grafite/domain';
import {
  AreaDeTexto,
  avisar,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  LinkDeCadastro,
  MensagemDoPasso,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
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
import { type AcaoDaSolicitacao, resumoDaSolicitacao, situacoesPossiveis } from './acoes.ts';
import { CHAVE_DAS_SOLICITACOES, type Solicitacao } from './consultas.ts';
import { GavetaDaEntrega } from './Entrega.tsx';
import { GavetaDaAlteracao } from './Formulario.tsx';
import { GavetaDoLote } from './Lote.tsx';

/** A gaveta da ação escolhida na linha da lista ou na ficha. */
export function GavetaDaAcao({
  acao,
  solicitacao,
  aoFechar,
}: {
  acao: AcaoDaSolicitacao;
  solicitacao: Solicitacao;
  aoFechar: () => void;
}) {
  switch (acao) {
    case 'abrir-os':
      return null;
    case 'alterar':
      return <GavetaDaAlteracao solicitacao={solicitacao} aoFechar={aoFechar} />;
    case 'situacao':
      return (
        <GavetaDoLote
          numeros={[solicitacao.numero]}
          resumo={resumoDaSolicitacao(solicitacao)}
          situacoes={situacoesPossiveis(solicitacao)}
          aoFechar={aoFechar}
          aoMudar={aoFechar}
        />
      );
    case 'pedido':
      return <GavetaDoPedido solicitacao={solicitacao} aoFechar={aoFechar} />;
    case 'entrega':
      return <GavetaDaEntrega solicitacao={solicitacao} aoFechar={aoFechar} />;
    case 'conclusao':
      return <GavetaDaConclusao solicitacao={solicitacao} aoFechar={aoFechar} />;
    case 'cancelamento':
      return <GavetaDoCancelamento solicitacao={solicitacao} aoFechar={aoFechar} />;
  }
}

/**
 * O envio de uma ação: o pedido à API, a recusa no campo que ela aponta ou junto à ação, e, depois
 * dela, a lista e as fichas relidas, o retorno e a gaveta fechada.
 */
function useEnvioDaAcao<TCampo extends string>({
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
  const enviar = async (
    conferidos: Partial<Record<TCampo, string>>,
    fazer: Parameters<typeof pedir>[0],
  ) => {
    if (enviando) return;
    definirFalha(null);
    if (Object.keys(conferidos).length > 0) {
      definirErros(conferidos);
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await pedir(fazer, acao);
      if ('erro' in resultado) {
        const { campos, erro } = recusaDe<TCampo>(resultado);
        if (campos && Object.keys(campos).length > 0) {
          definirErros(campos);
          return;
        }
        definirFalha(erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SOLICITACOES });
      avisar({ situacao: 'sucesso', titulo: retorno });
      aoFechar();
    } finally {
      definirEnviando(false);
    }
  };
  const tirarErro = (campo: TCampo) =>
    definirErros(({ [campo]: _, ...outros }) => outros as Partial<Record<TCampo, string>>);
  return { erros, tirarErro, falha, tentativa, enviando, enviar };
}

/** A gaveta de uma ação: o resumo da solicitação, os campos, a falha e os botões. */
function GavetaDeAcao({
  titulo,
  solicitacao,
  aberta = true,
  aoFechar,
  aoEnviar,
  falha,
  tentativa,
  enviando,
  botao,
  rotuloEnviando,
  voltar = 'Cancelar',
  destrutiva = false,
  children,
}: {
  titulo: string;
  solicitacao: Solicitacao;
  aberta?: boolean;
  aoFechar: () => void;
  aoEnviar: () => void;
  falha: string | null;
  tentativa: number;
  enviando: boolean;
  botao: string;
  rotuloEnviando: string;
  voltar?: string;
  destrutiva?: boolean;
  children: ReactNode;
}) {
  return (
    <Gaveta
      aberta={aberta}
      aoMudarAberta={(abrir) => {
        if (!abrir && aberta) aoFechar();
      }}
      titulo={titulo}
    >
      <Formulario
        validationBehavior="aria"
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault();
          aoEnviar();
        }}
      >
        <p className={estilosDaOperacao.informacao}>{resumoDaSolicitacao(solicitacao)}</p>
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
            {voltar}
          </Botao>
        </div>
      </Formulario>
    </Gaveta>
  );
}

/**
 * O pedido ao fornecedor (spec solicitacoes, "Pedido ao fornecedor"): o fornecedor, com "Cadastrar
 * novo fornecedor" numa aba para quem cadastra, e o número da OS nele, a "OS digital" do PMG. Com
 * o pedido já registrado, a gaveta o corrige.
 */
function GavetaDoPedido({
  solicitacao,
  aoFechar,
}: {
  solicitacao: Solicitacao;
  aoFechar: () => void;
}) {
  const api = useApi();
  const buscarFornecedores = useBuscarFornecedores();
  const cadastro = useCadastro('fornecedor');
  const [pedindo, definirPedindo] = useState(false);
  const [fornecedor, definirFornecedor] = useState<ContaDoSeletor | null>(
    solicitacao.fornecedor
      ? { id: solicitacao.fornecedor.id, rotulo: solicitacao.fornecedor.nome }
      : null,
  );
  const [os, definirOs] = useState(solicitacao.osDoFornecedor ?? '');
  const envio = useEnvioDaAcao<'fornecedor' | 'os'>({
    acao: 'registrar o pedido ao fornecedor',
    retorno: 'Pedido ao fornecedor registrado.',
    aoFechar,
  });
  const pedirCadastro = async () => {
    if (!cadastro) return;
    definirPedindo(true);
    const criado = await cadastro.pedir('solicitacao-fornecedor', { aoVoltar: () => true });
    definirPedindo(false);
    if (criado) {
      definirFornecedor({ id: criado.id, rotulo: criado.nome });
      envio.tirarErro('fornecedor');
    }
  };
  return (
    <GavetaDeAcao
      titulo="Pedido ao fornecedor"
      solicitacao={solicitacao}
      aberta={!pedindo}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const limpa = os.trim() === '' ? null : os.trim();
        void envio.enviar(
          validarPedidoAoFornecedor({ fornecedor: fornecedor?.id ?? null, os: limpa }),
          () =>
            api.POST('/solicitacoes/{numero}/pedido', {
              params: { path: { numero: solicitacao.numero } },
              body: { fornecedor: fornecedor?.id ?? null, os: limpa },
            }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Registrar o pedido"
      rotuloEnviando="Registrando"
    >
      <div className={estilosDaOperacao.lista}>
        <SeletorDeConta
          rotulo="Fornecedor"
          obrigatorio
          valor={fornecedor}
          aoMudar={(escolhido) => {
            definirFornecedor(escolhido);
            envio.tirarErro('fornecedor');
          }}
          buscar={buscarFornecedores}
          erro={envio.erros.fornecedor}
        />
        {cadastro && (
          <LinkDeCadastro texto={cadastro.link} campo="Fornecedor" aoPressionar={pedirCadastro} />
        )}
      </div>
      <CampoDeTexto
        rotulo="Número da OS"
        autoComplete="off"
        descricao="O número que o fornecedor deu ao pedido, quando ele dá."
        value={os}
        onChange={(valor) => {
          definirOs(valor);
          envio.tirarErro('os');
        }}
        erro={envio.erros.os}
      />
    </GavetaDeAcao>
  );
}

/** A conclusão do conserto e do equipamento, com o que foi feito, opcional. */
function GavetaDaConclusao({
  solicitacao,
  aoFechar,
}: {
  solicitacao: Solicitacao;
  aoFechar: () => void;
}) {
  const api = useApi();
  const [oQueFoiFeito, definirOQueFoiFeito] = useState('');
  const envio = useEnvioDaAcao<'oQueFoiFeito'>({
    acao: 'concluir a solicitação',
    retorno: 'Solicitação concluída.',
    aoFechar,
  });
  return (
    <GavetaDeAcao
      titulo="Conclusão"
      solicitacao={solicitacao}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const limpo = oQueFoiFeito.trim() === '' ? null : oQueFoiFeito.trim();
        const recusa = validarConclusao(limpo);
        void envio.enviar(recusa ? { oQueFoiFeito: recusa } : {}, () =>
          api.POST('/solicitacoes/{numero}/conclusao', {
            params: { path: { numero: solicitacao.numero } },
            body: { oQueFoiFeito: limpo },
          }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Concluir"
      rotuloEnviando="Concluindo"
    >
      <AreaDeTexto
        rotulo="O que foi feito"
        value={oQueFoiFeito}
        onChange={(valor) => {
          definirOQueFoiFeito(valor);
          envio.tirarErro('oQueFoiFeito');
        }}
        erro={envio.erros.oQueFoiFeito}
      />
    </GavetaDeAcao>
  );
}

/** O cancelamento da solicitação pendente, com o motivo; a cancelada não muda mais. */
function GavetaDoCancelamento({
  solicitacao,
  aoFechar,
}: {
  solicitacao: Solicitacao;
  aoFechar: () => void;
}) {
  const api = useApi();
  const [motivo, definirMotivo] = useState('');
  const envio = useEnvioDaAcao<'motivo'>({
    acao: 'cancelar a solicitação',
    retorno: 'Solicitação cancelada.',
    aoFechar,
  });
  return (
    <GavetaDeAcao
      titulo="Cancelamento"
      solicitacao={solicitacao}
      aoFechar={aoFechar}
      aoEnviar={() => {
        const recusa = validarCancelamento(motivo);
        void envio.enviar(recusa ? { motivo: recusa } : {}, () =>
          api.POST('/solicitacoes/{numero}/cancelamento', {
            params: { path: { numero: solicitacao.numero } },
            body: { motivo: motivo.trim() },
          }),
        );
      }}
      falha={envio.falha}
      tentativa={envio.tentativa}
      enviando={envio.enviando}
      botao="Cancelar a solicitação"
      rotuloEnviando="Cancelando"
      voltar="Voltar"
      destrutiva
    >
      <CampoDeTexto
        rotulo="Motivo"
        obrigatorio
        autoComplete="off"
        descricao="A cancelada não muda mais; o pedido de novo é outra solicitação."
        value={motivo}
        onChange={(valor) => {
          definirMotivo(valor);
          envio.tirarErro('motivo');
        }}
        erro={envio.erros.motivo}
      />
    </GavetaDeAcao>
  );
}
