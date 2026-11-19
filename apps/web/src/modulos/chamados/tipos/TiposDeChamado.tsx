// Os tipos de chamado (spec tipos-de-chamado; change chamados-da-ti, design, "A tela dos tipos
// (tarefa 5.19)" e "O rascunho, o duplicar e a situação (tarefa 5.20)"; m07 e m08): a tabela com a
// ordem por arraste, o editor do tipo escolhido e a prévia do colaborador, em três colunas que rolam
// sozinhas, para quem configura os chamados. O Rascunho abre na gaveta, sobre o editor e a prévia.
import {
  avisar,
  Botao,
  Dialogo,
  EstadoVazio,
  GavetaNaJanela,
  Icone,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate, useSearch } from '@tanstack/react-router';
import { Copy, EyeOff, Plus, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useTiposDeAtivo } from '../../operacao/solicitacoes/escolhas.ts';
import {
  CHAVE_DOS_AJUSTES_DOS_CHAMADOS,
  CHAVE_DOS_TIPOS_DE_CHAMADO,
  useContasQueAtendem,
  useFormularioDoTipo,
  useTiposDeChamado,
} from '../consultas.ts';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { GradeDosTipos } from '../previa/GradeDosTipos.tsx';
import { TelaDaAba } from '../previa/TelaDaAba.tsx';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import { EditorDoTipo, type FalhaDoEditor, PeDoTipo, SecaoDaSituacao } from './EditorDoTipo.tsx';
import {
  contagemDaLista,
  type EdicaoDoTipo,
  edicaoDoTipo,
  errosDoTipo,
  errosQueValem,
  fraseDosAbertos,
  mudouOTipo,
  notasDaPrevia,
  origensDosRascunhos,
  pedidoDoTipo,
  type TipoDeChamado,
  tipoAoFecharORascunho,
  tipoPadrao,
  tiposNaPrevia,
} from './edicao.ts';
import {
  AvisoDoDuplicado,
  type FormularioLido,
  PeDoRascunho,
  PreviaDoRascunho,
  SecaoDoFormulario,
} from './Rascunho.tsx';
import { TabelaDosTipos } from './TabelaDosTipos.tsx';
import estilos from './Tipos.module.css';

const ENDERECO = '/chamados/tipos';

/** O primeiro campo recusado, onde o foco vai depois da gravação recusada. */
const FOCAVEL = 'input:not([type="hidden"]), button, textarea';

const SEM_FALHA: FalhaDoEditor = { texto: null, chave: 0 };

export function TiposDeChamado() {
  return (
    <TelaDosChamados
      titulo="Tipos de chamado"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="aos tipos de chamado"
    >
      <TelaDosTipos />
    </TelaDosChamados>
  );
}

function TelaDosTipos() {
  const idDoTitulo = useId();
  const consulta = useTiposDeChamado();
  const tipos = consulta.data?.tipos ?? null;
  // A tela é onde a gaveta do Rascunho abre, com o véu sobre ela.
  const [tela, definirTela] = useState<HTMLDivElement | null>(null);

  let lista: ReactNode;
  if (consulta.isPending) {
    lista = <p className={estilos.carregando}>Carregando os tipos…</p>;
  } else if (consulta.isError && !tipos) {
    lista = (
      <EstadoVazio
        titulo={consulta.error.message}
        acao={
          <Botao
            carregando={consulta.isFetching}
            rotuloCarregando="Tentando de novo"
            onPress={() => void consulta.refetch()}
          >
            Tentar de novo
          </Botao>
        }
      />
    );
  } else if (tipos && tipos.length === 0) {
    lista = <p className={estilos.carregando}>Nenhum tipo de chamado.</p>;
  }

  return (
    <div ref={definirTela} className={estilos.tela} data-janela-inteira="rola-por-dentro">
      {tipos && tipos.length > 0 ? (
        <TiposCarregados tipos={tipos} idDoTitulo={idDoTitulo} tela={tela} />
      ) : (
        <section className={estilos.lista} aria-labelledby={idDoTitulo}>
          <CabecalhoDaLista idDoTitulo={idDoTitulo} contagem={null} />
          <div className={estilos.rolagemDaLista}>{lista}</div>
        </section>
      )}
    </div>
  );
}

function CabecalhoDaLista({
  idDoTitulo,
  contagem,
  acoes,
}: {
  idDoTitulo: string;
  contagem: string | null;
  acoes?: ReactNode;
}) {
  return (
    <div className={estilos.cabecalhoDaLista}>
      <div className={estilos.tituloDaLista}>
        <h1 id={idDoTitulo}>Tipos de chamado</h1>
        {contagem !== null && (
          <RotuloDeSituacao situacao="neutra" semIcone>
            {contagem}
          </RotuloDeSituacao>
        )}
      </div>
      <p>
        Cada tipo tem um formulário, um prazo e quem atende. Arraste as linhas para mudar a ordem na
        aba.
      </p>
      {acoes && <div className={estilos.acoesDaLista}>{acoes}</div>}
    </div>
  );
}

/** A recusa da gravação: as recusas nas chaves da tela e o tipo como estava quando foi recusado. */
interface RecusaDoTipo {
  id: string;
  erros: Record<string, string>;
  naRecusa: EdicaoDoTipo;
}

/** O que espera a confirmação de descartar as mudanças: trocar de tipo, criar, duplicar ou fechar. */
type AcaoDaTela =
  | { acao: 'escolher'; id: string }
  | { acao: 'novo' }
  | { acao: 'duplicar' }
  | { acao: 'fechar' };

/** O pedido em andamento, um por vez. */
type Andamento = 'salvar' | 'criar' | 'reativar' | 'novo' | 'duplicar';

type ListaDosTipos = { tipos: TipoDeChamado[] };

function TiposCarregados({
  tipos,
  idDoTitulo,
  tela,
}: {
  tipos: readonly TipoDeChamado[];
  idDoTitulo: string;
  tela: HTMLElement | null;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const busca: { tipo?: string } = useSearch({ strict: false });
  const sessao = useSessao();
  const contas = useContasQueAtendem();
  const tiposDeAtivo = useTiposDeAtivo();

  // O tipo do endereço; sem ele, ou quando ele não existe mais, o primeiro que não é Rascunho.
  const tipo = tipos.find(({ id }) => id === busca.tipo) ?? (tipoPadrao(tipos) as TipoDeChamado);
  // O Rascunho escolhido abre na gaveta; embaixo dela, o editor mostra o tipo para onde ela volta.
  const rascunho = tipo.situacao === 'rascunho' ? tipo : null;
  const [anterior, definirAnterior] = useState<string | null>(null);
  const idDoFundo = rascunho ? tipoAoFecharORascunho(tipos, rascunho, anterior) : tipo.id;
  const fundo = tipos.find(({ id }) => id === idDoFundo) ?? null;
  const origens = useMemo(() => origensDosRascunhos(tipos), [tipos]);

  // O que se escreve no tipo escolhido; sem nada escrito, o editor mostra o gravado.
  const [escrito, definirEscrito] = useState<{ id: string; edicao: EdicaoDoTipo } | null>(null);
  const edicao = escrito?.id === tipo.id ? escrito.edicao : edicaoDoTipo(tipo);
  const mudou = mudouOTipo(edicao, tipo);
  const [recusa, definirRecusa] = useState<RecusaDoTipo | null>(null);
  const erros = recusa?.id === tipo.id ? errosQueValem(recusa.erros, recusa.naRecusa, edicao) : {};
  const [andamento, definirAndamento] = useState<Andamento | null>(null);
  const [falha, definirFalha] = useState<FalhaDoEditor>(SEM_FALHA);
  // O Rascunho recém-duplicado com o "Gera uma Solicitação" desligado, que a resposta avisou.
  const [solicitacaoDesligada, definirSolicitacaoDesligada] = useState<string | null>(null);
  // A ação pedida com mudanças no editor, à espera da confirmação.
  const [pendente, definirPendente] = useState<AcaoDaTela | null>(null);
  // A recusa leva o foco ao primeiro campo recusado, no editor do tipo ou no da gaveta. As áreas são
  // duas: a cópia da gaveta que sai na animação, ao desmontar, zeraria a área que fosse comum.
  const [pedidoDeFoco, definirPedidoDeFoco] = useState({ vez: 0, naGaveta: false });
  const areaDoTipo = useRef<HTMLDivElement>(null);
  const areaDoRascunho = useRef<HTMLDivElement>(null);
  // O que a gaveta mostrava, para ela sair com ele enquanto fecha.
  const ultimaGaveta = useRef<ReactNode>(null);
  const formulario = useFormularioDoTipo(rascunho?.id ?? null);

  useEffect(() => {
    if (pedidoDeFoco.vez === 0) return;
    const area = pedidoDeFoco.naGaveta ? areaDoRascunho.current : areaDoTipo.current;
    area?.querySelector('[data-recusado]')?.querySelector<HTMLElement>(FOCAVEL)?.focus();
  }, [pedidoDeFoco]);

  // Sair da tela com mudanças pede confirmação; trocar de tipo pede pela tabela.
  const bloqueio = useBlocker({
    shouldBlockFn: ({ next }) => mudou && next.pathname !== ENDERECO,
    enableBeforeUnload: () => mudou,
    withResolver: true,
  });

  /** Escolhe o tipo, sem nada escrito nem recusado; sem o id, o primeiro que não é Rascunho. */
  const irPara = (id: string | null) => {
    definirEscrito(null);
    definirRecusa(null);
    definirFalha((atual) => ({ texto: null, chave: atual.chave }));
    definirSolicitacaoDesligada(null);
    void navegar({ to: '.', search: id === null ? {} : { tipo: id }, replace: true });
  };

  /** Abre o Rascunho na gaveta, guardando o tipo de onde se veio, para onde ela volta. */
  const abrirORascunho = (id: string) => {
    definirAnterior(rascunho ? anterior : tipo.id);
    irPara(id);
  };

  const fazer = (pedido: AcaoDaTela) => {
    if (pedido.acao === 'escolher') {
      const escolhido = tipos.find(({ id }) => id === pedido.id);
      if (escolhido?.situacao === 'rascunho') abrirORascunho(pedido.id);
      else irPara(pedido.id);
    } else if (pedido.acao === 'novo') {
      void criarORascunho();
    } else if (pedido.acao === 'duplicar') {
      void duplicar();
    } else if (rascunho) {
      // Fechar volta ao tipo de antes, ou ao de onde se duplicou, ou ao primeiro.
      const volta = tipoAoFecharORascunho(tipos, rascunho, anterior);
      definirAnterior(null);
      irPara(volta);
    }
  };

  /** Com mudanças no editor, a ação espera a confirmação de descartá-las. */
  const pedirAcao = (pedido: AcaoDaTela) => {
    if (mudou) definirPendente(pedido);
    else fazer(pedido);
  };

  /** Põe o tipo que a API devolveu na lista: no lugar dele, ou no fim, quando é novo. */
  const guardarNaLista = (gravado: TipoDeChamado) =>
    consultas.setQueryData<ListaDosTipos>(CHAVE_DOS_TIPOS_DE_CHAMADO, (atual) => {
      if (!atual) return atual;
      const existe = atual.tipos.some(({ id }) => id === gravado.id);
      return {
        ...atual,
        tipos: existe
          ? atual.tipos.map((cada) => (cada.id === gravado.id ? gravado : cada))
          : [...atual.tipos, gravado],
      };
    });

  /** O tipo gravado: na lista, os ajustes relidos e o editor mostrando o gravado. */
  const aposGravar = (gravado: TipoDeChamado) => {
    guardarNaLista(gravado);
    // A gaveta da abertura e o resto dos ajustes leem o tipo novo.
    void consultas.invalidateQueries({ queryKey: CHAVE_DOS_AJUSTES_DOS_CHAMADOS });
    definirEscrito(null);
    definirRecusa(null);
    definirFalha((atual) => ({ texto: null, chave: atual.chave }));
  };

  /** A recusa da API: nos campos, com o foco no primeiro, ou, sem campo, no pé. */
  const recusar = (id: string, naRecusa: EdicaoDoTipo, falhou: FalhaDoPedido) => {
    const campos = falhou.problema?.campos;
    if (campos && Object.keys(campos).length > 0) {
      definirRecusa({ id, erros: errosDoTipo(campos), naRecusa });
      definirFalha((atual) => ({ texto: null, chave: atual.chave + 1 }));
      definirPedidoDeFoco((atual) => ({ vez: atual.vez + 1, naGaveta: rascunho !== null }));
    } else {
      definirRecusa(null);
      definirFalha((atual) => ({ texto: falhou.erro, chave: atual.chave + 1 }));
    }
  };

  async function reordenarOsTipos(ids: string[]) {
    const atual = consultas.getQueryData<ListaDosTipos>(CHAVE_DOS_TIPOS_DE_CHAMADO);
    // A ordem nova aparece na hora; a resposta da API fica no lugar dela.
    if (atual) {
      const porId = new Map(atual.tipos.map((cada) => [cada.id, cada]));
      consultas.setQueryData(CHAVE_DOS_TIPOS_DE_CHAMADO, {
        ...atual,
        tipos: ids.flatMap((id) => porId.get(id) ?? []),
      });
    }
    const resultado = await pedir(
      () => api.PUT('/chamados/tipos/ordem', { body: { ids } }),
      'mudar a ordem dos tipos',
    );
    if ('erro' in resultado) {
      await consultas.invalidateQueries({ queryKey: CHAVE_DOS_TIPOS_DE_CHAMADO });
      avisar({
        situacao: 'critico',
        titulo: 'A ordem não mudou.',
        descricao: resultado.problema?.campos?.ids ?? resultado.erro,
      });
      return;
    }
    consultas.setQueryData(CHAVE_DOS_TIPOS_DE_CHAMADO, resultado.dados);
  }

  /** "Novo tipo": o Rascunho vazio entra no fim da lista e abre na gaveta. */
  async function criarORascunho() {
    if (andamento) return;
    definirAndamento('novo');
    try {
      const resultado = await pedir(() => api.POST('/chamados/tipos'), 'criar o rascunho');
      if ('erro' in resultado) {
        avisar({
          situacao: 'critico',
          titulo: 'O rascunho não foi criado.',
          descricao: resultado.erro,
        });
        return;
      }
      guardarNaLista(resultado.dados);
      abrirORascunho(resultado.dados.id);
    } finally {
      definirAndamento(null);
    }
  }

  /** "Duplicar": o Rascunho com o prazo, o responsável e o formulário do tipo escolhido. */
  async function duplicar() {
    if (andamento) return;
    const origem = tipo;
    definirAndamento('duplicar');
    try {
      const resultado = await pedir(
        () => api.POST('/chamados/tipos/{id}/duplicacao', { params: { path: { id: origem.id } } }),
        'duplicar o tipo',
      );
      if ('erro' in resultado) {
        avisar({
          situacao: 'critico',
          titulo: 'O rascunho não foi criado.',
          descricao: resultado.erro,
        });
        return;
      }
      const { tipo: duplicado, solicitacaoDesligada: desligada } = resultado.dados;
      guardarNaLista(duplicado);
      abrirORascunho(duplicado.id);
      if (desligada) definirSolicitacaoDesligada(duplicado.id);
    } finally {
      definirAndamento(null);
    }
  }

  /** Grava o que se escreveu, na situação do tipo: o Rascunho continua Rascunho. */
  async function salvar() {
    if (andamento) return;
    const gravando = edicao;
    const doTipo = tipo;
    const ehRascunho = doTipo.situacao === 'rascunho';
    definirAndamento('salvar');
    try {
      const resultado = await pedir(
        () =>
          api.PUT('/chamados/tipos/{id}', {
            params: { path: { id: doTipo.id } },
            body: pedidoDoTipo(gravando),
          }),
        ehRascunho ? 'salvar o rascunho' : 'salvar o tipo',
      );
      if ('erro' in resultado) {
        recusar(doTipo.id, gravando, resultado);
        return;
      }
      aposGravar(resultado.dados);
      avisar({ situacao: 'sucesso', titulo: ehRascunho ? 'Rascunho salvo.' : 'Tipo salvo.' });
    } finally {
      definirAndamento(null);
    }
  }

  /** "Criar o tipo": o Rascunho passa a Em uso, e a gaveta fecha com ele escolhido. */
  async function criar() {
    if (andamento || !rascunho) return;
    const gravando = edicao;
    const doRascunho = rascunho;
    definirAndamento('criar');
    try {
      const resultado = await pedir(
        () =>
          api.POST('/chamados/tipos/{id}/criacao', {
            params: { path: { id: doRascunho.id } },
            body: pedidoDoTipo(gravando),
          }),
        'criar o tipo',
      );
      if ('erro' in resultado) {
        recusar(doRascunho.id, gravando, resultado);
        return;
      }
      aposGravar(resultado.dados);
      definirAnterior(null);
      definirSolicitacaoDesligada(null);
      avisar({ situacao: 'sucesso', titulo: 'Tipo criado.' });
    } finally {
      definirAndamento(null);
    }
  }

  /** "Descartar rascunho", confirmado: o Rascunho sai da lista, e a tela volta ao tipo de antes. */
  async function descartarORascunho(): Promise<{ ok: true } | { erro: string }> {
    if (!rascunho) return { ok: true };
    const doRascunho = rascunho;
    const resultado = await pedir(
      () => api.DELETE('/chamados/tipos/{id}', { params: { path: { id: doRascunho.id } } }),
      'descartar o rascunho',
    );
    if ('erro' in resultado) return { erro: resultado.erro };
    const volta = tipoAoFecharORascunho(tipos, doRascunho, anterior);
    definirAnterior(null);
    irPara(volta);
    consultas.setQueryData<ListaDosTipos>(CHAVE_DOS_TIPOS_DE_CHAMADO, (atual) =>
      atual ? { ...atual, tipos: atual.tipos.filter(({ id }) => id !== doRascunho.id) } : atual,
    );
    avisar({ situacao: 'sucesso', titulo: 'Rascunho descartado.' });
    return { ok: true };
  }

  /** "Inativar o tipo", confirmado: o tipo sai da escolha, e os abertos seguem. */
  async function inativar(): Promise<{ ok: true } | { erro: string }> {
    const doTipo = tipo;
    const resultado = await pedir(
      () => api.POST('/chamados/tipos/{id}/inativacao', { params: { path: { id: doTipo.id } } }),
      'inativar o tipo',
    );
    if ('erro' in resultado) return { erro: resultado.erro };
    aposGravar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: 'Tipo inativado.' });
    return { ok: true };
  }

  /** "Reativar o tipo": confere o tipo gravado; as recusas ficam nos campos, com o foco no primeiro. */
  async function reativar() {
    if (andamento) return;
    const doTipo = tipo;
    const gravado = edicao;
    definirAndamento('reativar');
    try {
      const resultado = await pedir(
        () => api.POST('/chamados/tipos/{id}/reativacao', { params: { path: { id: doTipo.id } } }),
        'reativar o tipo',
      );
      if ('erro' in resultado) {
        recusar(doTipo.id, gravado, resultado);
        return;
      }
      aposGravar(resultado.dados);
      avisar({ situacao: 'sucesso', titulo: 'Tipo reativado.' });
    } finally {
      definirAndamento(null);
    }
  }

  const descartar = () => {
    definirEscrito(null);
    definirRecusa(null);
    definirFalha((atual) => ({ texto: null, chave: atual.chave }));
  };

  const opcoesDasContas = {
    lista: contas.data?.contas ?? [],
    falha: contas.isError ? contas.error.message : null,
  };
  const opcoesDosTiposDeAtivo = {
    lista: tiposDeAtivo.data ?? [],
    falha: tiposDeAtivo.isError ? tiposDeAtivo.error.message : null,
  };

  // A gaveta do Rascunho: o editor, com o aviso do duplicado, o formulário e o pé dele, e a prévia.
  let gaveta: ReactNode = null;
  if (rascunho) {
    const origem = tipos.find(({ id }) => id === rascunho.duplicadoDe) ?? null;
    const lido: FormularioLido = formulario.data
      ? { estado: 'lido', campos: formulario.data.formulario.campos }
      : formulario.isError
        ? { estado: 'falha', texto: formulario.error.message }
        : { estado: 'carregando' };
    gaveta = (
      <div className={estilos.conteudoDaGaveta}>
        <EditorDoTipo
          tipo={rascunho}
          edicao={edicao}
          aoMudar={(nova) => definirEscrito({ id: rascunho.id, edicao: nova })}
          erros={erros}
          contas={opcoesDasContas}
          tiposDeAtivo={opcoesDosTiposDeAtivo}
          area={areaDoRascunho}
          idDoTitulo={`${idDoTitulo}-rascunho`}
          antes={
            origem && (
              <AvisoDoDuplicado
                origem={origem.nome}
                solicitacaoDesligada={solicitacaoDesligada === rascunho.id}
              />
            )
          }
          depois={<SecaoDoFormulario formulario={lido} origem={origem?.nome ?? null} />}
          pe={
            <PeDoRascunho
              nome={edicao.nome.trim() || rascunho.nome}
              erros={erros}
              falha={falha}
              mudou={mudou}
              salvando={andamento === 'salvar'}
              criando={andamento === 'criar'}
              aoSalvar={() => void salvar()}
              aoCriar={() => void criar()}
              aoDescartar={descartarORascunho}
            />
          }
        />
        <PreviaDoRascunho tipos={tipos} editado={{ id: rascunho.id, edicao }} formulario={lido} />
      </div>
    );
    ultimaGaveta.current = gaveta;
  }

  // Embaixo da gaveta, o editor mostra, parado, o tipo para onde ela volta, como está gravado.
  const noEditor = rascunho
    ? { edicao: fundo && edicaoDoTipo(fundo), erros: {}, mudou: false, falha: SEM_FALHA }
    : { edicao, erros, mudou, falha };
  const editado = fundo && noEditor.edicao ? { id: fundo.id, edicao: noEditor.edicao } : null;
  const notas = editado ? notasDaPrevia(tipos, editado) : null;
  const nomeDaConta = sessao.tipo === 'ativa' ? sessao.conta.nome : '';
  const confirmando = pendente !== null || bloqueio.status === 'blocked';
  const continuar = () => {
    definirPendente(null);
    if (bloqueio.status === 'blocked') bloqueio.reset();
  };
  const descartarESeguir = () => {
    if (pendente !== null) {
      const pedido = pendente;
      definirPendente(null);
      descartar();
      fazer(pedido);
      return;
    }
    if (bloqueio.status === 'blocked') bloqueio.proceed();
  };
  const ocupado = andamento !== null;

  return (
    <>
      <section className={estilos.lista} aria-labelledby={idDoTitulo}>
        <CabecalhoDaLista
          idDoTitulo={idDoTitulo}
          contagem={contagemDaLista(tipos)}
          acoes={
            <>
              <Botao
                nivel="primario"
                icone={Plus}
                onPress={() => pedirAcao({ acao: 'novo' })}
                isDisabled={ocupado && andamento !== 'novo'}
                carregando={andamento === 'novo'}
                rotuloCarregando="Criando o rascunho"
              >
                Novo tipo
              </Botao>
              <Botao
                icone={Copy}
                aria-label={`Duplicar ${tipo.nome}`}
                onPress={() => pedirAcao({ acao: 'duplicar' })}
                isDisabled={ocupado && andamento !== 'duplicar'}
                carregando={andamento === 'duplicar'}
                rotuloCarregando="Duplicando o tipo"
              >
                Duplicar
              </Botao>
            </>
          }
        />
        <div className={estilos.rolagemDaLista}>
          <TabelaDosTipos
            tipos={tipos}
            idDoTitulo={idDoTitulo}
            escolhido={tipo.id}
            aoEscolher={(id) => pedirAcao({ acao: 'escolher', id })}
            aoReordenar={(ids) => void reordenarOsTipos(ids)}
            origens={origens}
          />
        </div>
        <div className={estilos.peDaLista}>
          <span>{fraseDosAbertos(tipos)}</span>
          <span>Sem responsável por padrão, o chamado cai na triagem.</span>
        </div>
      </section>

      {fundo && editado && notas && (
        <>
          <EditorDoTipo
            tipo={fundo}
            edicao={editado.edicao}
            aoMudar={(nova) => definirEscrito({ id: fundo.id, edicao: nova })}
            erros={noEditor.erros}
            contas={opcoesDasContas}
            tiposDeAtivo={opcoesDosTiposDeAtivo}
            area={areaDoTipo}
            idDoTitulo={`${idDoTitulo}-tipo`}
            depois={
              <SecaoDaSituacao
                tipo={fundo}
                mudou={noEditor.mudou}
                reativando={andamento === 'reativar'}
                aoInativar={inativar}
                aoReativar={() => void reativar()}
              />
            }
            pe={
              <PeDoTipo
                tipo={fundo}
                erros={noEditor.erros}
                falha={noEditor.falha}
                mudou={noEditor.mudou}
                salvando={andamento === 'salvar'}
                aoDescartar={descartar}
                aoSalvar={() => void salvar()}
              />
            }
          />

          <aside className={estilos.previa} aria-labelledby={`${idDoTitulo}-previa`}>
            <h2 id={`${idDoTitulo}-previa`}>Como o colaborador vê</h2>
            <p>Na aba, em Abrir chamado. Mudou o nome, o ícone ou a frase, a prévia muda junto.</p>
            <TelaDaAba
              rotulo="A aba do colaborador"
              trilha={['Aba', 'Abrir chamado']}
              passo="1 de 3"
              quem={nomeDaConta ? { nome: nomeDaConta, voce: true } : undefined}
            >
              <GradeDosTipos tipos={tiposNaPrevia(tipos, editado)} escolhido={fundo.id} />
            </TelaDaAba>
            {notas.soDaTi && (
              <p className={estilos.nota}>
                <Icone icone={EyeOff} tamanho={14} />
                <span>{notas.soDaTi}</span>
              </p>
            )}
            {notas.abertos && (
              <p className={estilos.nota}>
                <Icone icone={TriangleAlert} tamanho={14} />
                <span>{notas.abertos}</span>
              </p>
            )}
          </aside>
        </>
      )}

      <GavetaNaJanela
        aberta={rascunho !== null}
        aoMudarAberta={(aberta) => {
          if (!aberta) pedirAcao({ acao: 'fechar' });
        }}
        dentroDe={tela}
        idDoTitulo={`${idDoTitulo}-rascunho`}
        className={estilos.gaveta}
      >
        {gaveta ?? ultimaGaveta.current}
      </GavetaNaJanela>

      <Dialogo
        alerta
        titulo={rascunho ? 'Descartar as mudanças no rascunho?' : 'Descartar as mudanças no tipo?'}
        aberto={confirmando}
        aoMudarAberto={(aberto) => {
          if (!aberto) continuar();
        }}
        acoes={() => (
          <>
            <Botao onPress={continuar}>Continuar editando</Botao>
            <Botao nivel="destrutivo" onPress={descartarESeguir}>
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          {rascunho
            ? 'As mudanças que não foram salvas saem, e o rascunho continua como está gravado.'
            : 'As mudanças que não foram salvas saem, e o tipo continua como está gravado.'}
        </p>
      </Dialogo>
    </>
  );
}
