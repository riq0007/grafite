// As visões na tela de uma tabela (spec visoes-de-tabela; design do P1c, decisões 6 e 10; design do
// visoes-da-conta, decisão 4): a escolha da visão com "Personalizada" ou "Do link", a linha de
// estado sob a barra, e salvar como nova, com "Compartilhar com a organização" só para quem pode,
// duplicar, restaurar, voltar à tabela da conta, salvar na visão da organização, renomear, remover
// com a confirmação, usar como padrão da organização e fixar no menu (change visoes-no-dock), com as
// recusas do nome no diálogo e os retornos.
import {
  type IdDaTabelaComVisoes,
  lerNomeDaVisao,
  partesQueMudaram,
  tabelaComVisoes,
  VISAO_DE_FABRICA,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeTexto,
  Checkbox,
  Dialogo,
  EscolhaDaVisao,
  LinhaDaVisao,
  MensagemDoPasso,
  type VisaoDaEscolha,
} from '@grafite/ui';
import { type ReactNode, useState } from 'react';
import { useAcesso } from '../sessao/useAcesso.ts';
import type { EstadoDaTabela } from './useEstadoDaTabela.ts';
import {
  type RecusaDaVisao,
  useAcoesDasVisoes,
  useFixadas,
  useGravarEscolhaDaVisao,
  useVisaoPadraoDaOrganizacao,
  type VisaoDaTabela,
} from './visoes.ts';

/** O diálogo aberto: salvar como nova, duplicar, renomear ou remover a visão aberta. */
type DialogoAberto = 'salvar-como' | 'duplicar' | 'renomear' | 'remover' | null;

/** A falha de um diálogo: a do nome no campo, a outra embaixo dele. */
interface Falha {
  nome?: string;
  texto?: string;
  vez: number;
}

const falhaDa = (recusa: RecusaDaVisao, anterior: Falha | null): Falha => {
  const nome = recusa.campos?.nome;
  return nome
    ? { nome, vez: (anterior?.vez ?? 0) + 1 }
    : { texto: recusa.erro, vez: (anterior?.vez ?? 0) + 1 };
};

export interface PropsDasVisoesDaTabela {
  tabela: IdDaTabelaComVisoes;
  estado: EstadoDaTabela;
  /** As visões da API, com o que a conta pode compartilhar; ausentes enquanto carregam. */
  visoes: readonly VisaoDaTabela[] | undefined;
  podeCompartilhar: boolean;
  /** Grava na hora as mudanças que esperam, antes de publicá-las na visão da organização. */
  descarregar: () => Promise<void>;
}

/** As partes das visões na tela, cada uma no seu lugar. */
export interface VisoesNaTela {
  /** A escolha da visão, na barra da tabela. */
  escolha: ReactNode;
  /** A linha de estado, sob a barra. */
  linha: ReactNode;
  /** Os diálogos, em qualquer lugar da tela. */
  dialogos: ReactNode;
}

export function useVisoesDaTabela({
  tabela,
  estado,
  visoes,
  podeCompartilhar,
  descarregar,
}: PropsDasVisoesDaTabela): VisoesNaTela {
  const { pode } = useAcesso();
  const acoes = useAcoesDasVisoes(tabela);
  const gravarEscolha = useGravarEscolhaDaVisao(tabela);
  const padraoDaOrganizacao = useVisaoPadraoDaOrganizacao(tabela);
  const fixadas = useFixadas(tabela, visoes);
  const [dialogo, definirDialogo] = useState<DialogoAberto>(null);
  const [nome, definirNome] = useState('');
  const [compartilhada, definirCompartilhada] = useState(false);
  const [falha, definirFalha] = useState<Falha | null>(null);
  const [enviando, definirEnviando] = useState(false);

  const fabrica = tabelaComVisoes(tabela)?.fabrica;
  const daEscolha: VisaoDaEscolha[] = [
    { id: VISAO_DE_FABRICA, nome: fabrica?.nome ?? '', origem: 'fabrica' },
    ...(visoes ?? []).map((visao) => ({
      id: visao.id,
      nome: visao.nome,
      origem: visao.compartilhada ? ('organizacao' as const) : ('conta' as const),
    })),
  ];
  const aberta = daEscolha.find((visao) => visao.id === estado.visao);

  const abrirDialogo = (qual: DialogoAberto) => {
    definirDialogo(qual);
    definirFalha(null);
    definirCompartilhada(false);
    // A cópia leva o nome da origem primeiro, para ficar ao lado dela no menu.
    definirNome(
      qual === 'renomear'
        ? (aberta?.nome ?? '')
        : qual === 'duplicar' && aberta
          ? `${aberta.nome} (cópia)`
          : '',
    );
  };
  const escolher = (id: string) => {
    estado.escolher(id);
    gravarEscolha(id);
  };
  const restaurar = () => {
    estado.restaurar();
    avisar({ situacao: 'sucesso', titulo: 'Visão restaurada.' });
  };

  /** O nome do diálogo, conferido aqui antes de ir à API. */
  const nomeLido = () => {
    const lido = lerNomeDaVisao(nome);
    if (!lido.ok) definirFalha((anterior) => ({ nome: lido.erro, vez: (anterior?.vez ?? 0) + 1 }));
    return lido.ok ? lido.nome : null;
  };

  async function enviar(fazer: () => Promise<boolean>, fechar: () => void) {
    definirEnviando(true);
    try {
      if (await fazer()) fechar();
    } finally {
      definirEnviando(false);
    }
  }

  const salvarComoNova = async () => {
    const lido = nomeLido();
    if (lido === null || !estado.paraSalvar) return false;
    const resultado = await acoes.criar({
      nome: lido,
      compartilhada: podeCompartilhar && compartilhada,
      definicao: estado.paraSalvar,
    });
    if (!resultado.ok) {
      definirFalha((anterior) => falhaDa(resultado, anterior));
      return false;
    }
    // A visão de onde a nova saiu volta a ser como era: as mudanças da conta foram para a nova.
    if (estado.estado === 'personalizada') estado.restaurar();
    escolher(resultado.visao.id);
    return true;
  };
  const duplicar = async () => {
    const lido = nomeLido();
    if (lido === null || !estado.paraSalvar) return false;
    const resultado = await acoes.duplicar({ nome: lido, definicao: estado.paraSalvar });
    if (!resultado.ok) {
      definirFalha((anterior) => falhaDa(resultado, anterior));
      return false;
    }
    escolher(resultado.visao.id);
    return true;
  };
  const renomear = async () => {
    const lido = nomeLido();
    if (lido === null) return false;
    const resultado = await acoes.renomear(estado.visao, lido);
    if (!resultado.ok) definirFalha((anterior) => falhaDa(resultado, anterior));
    return resultado.ok;
  };
  const remover = async () => {
    const resultado = await acoes.remover(estado.visao);
    if (!resultado.ok) {
      definirFalha((anterior) => falhaDa(resultado, anterior));
      return false;
    }
    // A tabela passa à visão que abre, sem o aviso de visão removida: quem removeu já sabe.
    estado.escolher();
    return true;
  };
  const salvarNaOrganizacao = async () => {
    // A última mudança pode estar esperando: a publicação grava o que a API tem.
    await descarregar();
    await acoes.publicar(estado.visao);
  };

  // Enter no nome confirma, como o botão principal do diálogo.
  const confirmarONome = () =>
    void enviar(
      dialogo === 'renomear' ? renomear : dialogo === 'duplicar' ? duplicar : salvarComoNova,
      () => definirDialogo(null),
    );
  const fecharDialogo = (aberto: boolean) => {
    if (!aberto) definirDialogo(null);
  };
  const campoDoNome = (
    <CampoDeTexto
      rotulo="Nome"
      value={nome}
      onChange={(texto) => {
        definirNome(texto);
        definirFalha((anterior) => (anterior?.nome ? null : anterior));
      }}
      erro={falha?.nome}
      autoFocus
      onKeyDown={(evento) => {
        if (evento.key !== 'Enter' || enviando) return;
        evento.preventDefault();
        confirmarONome();
      }}
    />
  );
  const daOrganizacao = aberta?.origem === 'organizacao';

  const escolha = (
    <EscolhaDaVisao
      visoes={daEscolha}
      aberta={estado.visao}
      estado={estado.estado}
      padraoDaOrganizacao={padraoDaOrganizacao}
      podeEditarAOrganizacao={pode('organizacao.editar')}
      aoEscolher={escolher}
      aoSalvarNaOrganizacao={() => void salvarNaOrganizacao()}
      aoSalvarComoNova={() => abrirDialogo('salvar-como')}
      aoDuplicar={() => abrirDialogo('duplicar')}
      aoRestaurar={restaurar}
      aoVoltar={estado.descartar}
      aoRenomear={() => abrirDialogo('renomear')}
      aoRemover={() => abrirDialogo('remover')}
      aoUsarComoPadrao={() => void acoes.usarComoPadrao(estado.visao)}
      fixadas={{ daConta: fixadas.daConta, daOrganizacao: fixadas.daOrganizacao }}
      aoFixar={() => fixadas.fixar(estado.visao)}
      aoDesafixar={() => fixadas.desafixar(estado.visao)}
      aoFixarParaTodos={() => void fixadas.fixarParaTodos(estado.visao)}
      aoDesafixarParaTodos={() => void fixadas.desafixarParaTodos(estado.visao)}
    />
  );
  const linha = (
    <LinhaDaVisao
      estado={estado.estado}
      mudou={
        estado.salva && estado.paraSalvar
          ? partesQueMudaram(estado.salva, estado.paraSalvar)
          : undefined
      }
      aoRestaurar={restaurar}
      aoSalvarComoNova={() => abrirDialogo('salvar-como')}
      aoVoltar={estado.descartar}
    />
  );
  const dialogos = (
    <>
      <Dialogo
        titulo="Salvar como nova visão"
        aberto={dialogo === 'salvar-como'}
        aoMudarAberto={fecharDialogo}
        acoes={(fechar) => (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              nivel="primario"
              carregando={enviando}
              rotuloCarregando="Salvando"
              onPress={() => void enviar(salvarComoNova, fechar)}
            >
              Salvar visão
            </Botao>
          </>
        )}
      >
        {campoDoNome}
        {podeCompartilhar && (
          <Checkbox isSelected={compartilhada} onChange={definirCompartilhada}>
            Compartilhar com a organização
          </Checkbox>
        )}
        <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
      </Dialogo>
      <Dialogo
        titulo="Duplicar visão"
        aberto={dialogo === 'duplicar'}
        aoMudarAberto={fecharDialogo}
        acoes={(fechar) => (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              nivel="primario"
              carregando={enviando}
              rotuloCarregando="Duplicando"
              onPress={() => void enviar(duplicar, fechar)}
            >
              Duplicar
            </Botao>
          </>
        )}
      >
        <p>A cópia fica em "Minhas visões", com a tabela como está.</p>
        {campoDoNome}
        <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
      </Dialogo>
      <Dialogo
        titulo="Renomear visão"
        aberto={dialogo === 'renomear'}
        aoMudarAberto={fecharDialogo}
        acoes={(fechar) => (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              nivel="primario"
              carregando={enviando}
              rotuloCarregando="Renomeando"
              onPress={() => void enviar(renomear, fechar)}
            >
              Renomear
            </Botao>
          </>
        )}
      >
        {campoDoNome}
        <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
      </Dialogo>
      <Dialogo
        alerta
        titulo={`Remover a visão ${aberta?.nome ?? ''}?`}
        aberto={dialogo === 'remover'}
        aoMudarAberto={fecharDialogo}
        acoes={(fechar) => (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              nivel="destrutivo"
              carregando={enviando}
              rotuloCarregando="Removendo"
              onPress={() => void enviar(remover, fechar)}
            >
              Remover visão
            </Botao>
          </>
        )}
      >
        <p>
          {daOrganizacao
            ? 'A visão sai do menu de todos na organização.'
            : 'A visão sai do seu menu.'}
        </p>
        <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
      </Dialogo>
    </>
  );
  return { escolha, linha, dialogos };
}
