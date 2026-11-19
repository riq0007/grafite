// O construtor do formulário do tipo (spec modulo-chamados, "Construtor do formulário"; change
// chamados-da-ti, design, decisão 15, "O construtor, a paleta (tarefa 5.21)" e "O construtor, os
// campos (tarefa 5.22)"; m09): a janela inteira, em três colunas que rolam sozinhas. À esquerda, a
// paleta "Campos", que acrescenta o campo no fim pelo clique e na linha de encaixe pelo arraste; no
// meio, o "Título do chamado" e os campos, que abrem no lugar e mudam de ordem pela alça e pelo menu;
// à direita, a prévia do colaborador, que muda junto. O salvar fica no cabeçalho, como no m09.
import {
  type CampoDoFormulario,
  conferirFormulario,
  type Formulario,
  MAXIMO_DE_CAMPOS_DO_FORMULARIO,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  TIPOS_DE_CAMPO_DO_CHAMADO,
  type TipoDeCampoDoChamado,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  Carimbo,
  Dialogo,
  EstadoVazio,
  Icone,
  type ItemDoMenuDeContexto,
  MenuDeContexto,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useParams } from '@tanstack/react-router';
import { Check, ChevronRight, Eye, GripVertical, Plus } from 'lucide-react';
import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useTipos } from '../../ativos/consultas.ts';
import {
  CHAVE_DOS_TIPOS_DE_CHAMADO,
  chaveDoFormularioDoTipo,
  type FormularioDoTipoDeChamado,
  useFormularioDoTipo,
  useTiposDeChamado,
} from '../consultas.ts';
import { ESTADO_VAZIO, type EstadoDoFormulario } from '../formulario/estado.ts';
import { FormularioQueSePreenche } from '../formulario/FormularioQueSePreenche.tsx';
import { ICONES_DOS_TIPOS_DE_CAMPO } from '../icones.ts';
import { IconeDoTipo, Selo } from '../Pecas.tsx';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDaAba } from '../previa/TelaDaAba.tsx';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import { fraseDosAbertosDoTipo, movimentosNaOrdem, type TipoDeChamado } from '../tipos/edicao.ts';
import { useArrastar } from '../useArrastar.ts';
import { CampoAberto, Erro } from './CampoAberto.tsx';
import estilos from './Construtor.module.css';
import {
  conferirMudanca,
  detalheDoCampo,
  type ErrosDoCampo,
  errosNoFormulario,
  errosQueValemNoFormulario,
  LUGAR,
  type MudancaConferida,
  moverCampo,
  mudancasDoFormulario,
  opcoesDosTiposDeAtivo,
  type RecusaNaHora,
  removerCampo,
  resumoDaRecusa,
  seloDoCampo,
  sortearId,
  subirOuDescer,
  textoDasMudancas,
  tirarOpcao,
  trocarCampo,
} from './campos.ts';
import { marcaDaCondicao } from './condicao.ts';
import {
  ALVO_DA_LINHA,
  ALVO_DO_FIM,
  acrescentarCampo,
  avisoDaPaleta,
  avisoDoAcrescentado,
  campoNovo,
  posicaoDoEncaixe,
  textoDoEncaixe,
  textoDoEncaixeDoCampo,
} from './construtor.ts';
import { TituloDoChamado } from './TituloDoChamado.tsx';

/** O que se arrasta no construtor: um tipo de campo da paleta, ou um campo da lista, pela alça. */
type ItemNoAr = { de: 'paleta'; tipo: TipoDeCampoDoChamado } | { de: 'lista'; id: string };

/** O "Título do chamado" aberto; os ids dos campos não têm os dois-pontos. */
const O_TITULO = ':titulo';

/** O que recebe o foco no que foi recusado: o campo de texto, a chave ou o botão. */
const FOCAVEL = 'input:not([type="hidden"]), button, textarea';

const ROTULO_DO_MOVIMENTO = { subir: 'Subir', descer: 'Descer' } as const;

export function ConstrutorDoFormulario() {
  return (
    <TelaDosChamados
      titulo="Campos do tipo"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="aos tipos de chamado"
    >
      <TelaDoConstrutor />
    </TelaDosChamados>
  );
}

function TelaDoConstrutor() {
  const { id } = useParams({ from: '/chamados/tipos/$id/formulario' });
  const tipos = useTiposDeChamado();
  const formulario = useFormularioDoTipo(id);
  const tipo = tipos.data?.tipos.find((cada) => cada.id === id) ?? null;

  if (formulario.data !== undefined && tipo !== null) {
    return <Construtor key={id} tipo={tipo} dados={formulario.data} />;
  }

  let conteudo: ReactNode;
  if (formulario.isError || tipos.isError) {
    const falha = formulario.isError ? formulario.error : tipos.error;
    conteudo = (
      <EstadoVazio
        titulo={falha?.message ?? 'O formulário não carregou.'}
        acao={
          <Botao
            carregando={formulario.isFetching || tipos.isFetching}
            rotuloCarregando="Tentando de novo"
            onPress={() => {
              if (formulario.isError) void formulario.refetch();
              if (tipos.isError) void tipos.refetch();
            }}
          >
            Tentar de novo
          </Botao>
        }
      />
    );
  } else if (tipos.data && !tipo) {
    conteudo = <EstadoVazio titulo="Este tipo de chamado não existe mais." />;
  } else {
    conteudo = (
      <p role="status" className={estilos.estado}>
        Carregando o formulário…
      </p>
    );
  }

  return (
    <div className={estilos.tela} data-janela-inteira="">
      <Cabecalho tipo={tipo} />
      {conteudo}
    </div>
  );
}

/** O cabeçalho da página, com a trilha em cima e o tipo num selo, e, pronto, o salvar. */
function Cabecalho({
  tipo,
  detalhe,
  acoes,
}: {
  tipo: TipoDeChamado | null;
  detalhe?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <CabecalhoDaPagina
      trilha={<Trilha tipo={tipo} />}
      titulo="Campos do tipo"
      selos={
        tipo && (
          <span className={estilos.tipo}>
            <IconeDoTipo icone={tipo.icone} nome={tipo.nome} decorativo />
            {tipo.nome}
          </span>
        )
      }
      detalhe={detalhe}
      acoes={acoes}
    />
  );
}

/** "Tipos de chamado › Impressora › Formulário": os dois primeiros voltam à tabela e ao tipo. */
function Trilha({ tipo }: { tipo: TipoDeChamado | null }) {
  const seta = <Icone icone={ChevronRight} tamanho={12} />;
  return (
    <nav aria-label="Trilha" className={estilos.trilha}>
      <ol>
        <li>
          <Link to="/chamados/tipos">Tipos de chamado</Link>
        </li>
        {tipo && (
          <li>
            {seta}
            <Link to="/chamados/tipos" search={{ tipo: tipo.id }}>
              {tipo.nome}
            </Link>
          </li>
        )}
        <li>
          {seta}
          <span aria-current="page">Formulário</span>
        </li>
      </ol>
    </nav>
  );
}

/** O campo a pôr à vista, com o foco no rótulo dele (o vigésimo) ou no cartão (o vizinho do tirado). */
interface AMostrar {
  id: string;
  focar: 'rotulo' | 'cartao' | null;
}

function Construtor({ tipo, dados }: { tipo: TipoDeChamado; dados: FormularioDoTipoDeChamado }) {
  const id = useId();
  const api = useApi();
  const consultas = useQueryClient();
  const sessao = useSessao();
  const tiposDeAtivo = useTipos();
  const gravado: Formulario = dados.formulario;
  const { pedeOAtivo, abertos } = dados;
  // O que se escreveu; sem nada, o formulário gravado, que o evento relê.
  const [escrito, definirEscrito] = useState<Formulario | null>(null);
  const formulario = escrito ?? gravado;
  const { campos } = formulario;
  const mudancas = mudancasDoFormulario(gravado, formulario);
  const mudou = mudancas > 0;
  const [aberto, definirAberto] = useState<string | null>(null);
  const [recusa, definirRecusa] = useState<{
    erros: Record<string, string>;
    naRecusa: Formulario;
  } | null>(null);
  const erros = recusa ? errosQueValemNoFormulario(recusa.erros, recusa.naRecusa, formulario) : {};
  const { porCampo, geral } = errosNoFormulario(erros, campos);
  // A marca tracejada de cada campo condicional na prévia, que só o editor mostra.
  const marcas: Record<string, string> = {};
  for (const campo of campos) {
    const marca = marcaDaCondicao(campo, campos);
    if (marca) marcas[campo.id] = marca;
  }
  const [naHora, definirNaHora] = useState<RecusaNaHora | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  // As respostas da prévia, que responde ao clique como a aba.
  const [estado, definirEstado] = useState<EstadoDoFormulario>(ESTADO_VAZIO);
  const [aviso, definirAviso] = useState('');
  const [aMostrar, definirAMostrar] = useState<AMostrar | null>(null);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const [menu, definirMenu] = useState<{
    id: string;
    posicao: { x: number; y: number };
    origem: HTMLElement;
  } | null>(null);
  const lista = useRef<HTMLElement>(null);
  const paleta = useRef<HTMLElement>(null);

  const listaDosTipos = tiposDeAtivo.data?.tipos;
  const nomesDosTipos = useMemo(
    () => new Map((listaDosTipos ?? []).map((cada) => [cada.id, cada.nome])),
    [listaDosTipos],
  );

  /** A mudança, que entra com o lugar só se não trouxer recusa nova; sem o lugar, sempre. */
  const aplicar = (resultado: MudancaConferida, lugar?: string): boolean => {
    if ('recusa' in resultado) {
      if (lugar !== undefined) definirNaHora({ lugar, mensagem: resultado.recusa });
      return false;
    }
    definirNaHora(null);
    definirEscrito(resultado.formulario);
    return true;
  };
  const mudar = (depois: Formulario, lugar?: string) =>
    aplicar(
      lugar === undefined
        ? { formulario: depois }
        : conferirMudanca(formulario, depois, pedeOAtivo),
      lugar,
    );

  const acrescentar = (tipoDoCampo: TipoDeCampoDoChamado, posicao: number) => {
    const novo = campoNovo(tipoDoCampo, campos, sortearId);
    const juntos = acrescentarCampo(campos, novo, posicao);
    if (!juntos) return;
    mudar({ ...formulario, campos: juntos });
    definirAberto(novo.id);
    definirAviso(avisoDoAcrescentado(novo.rotulo, campos, posicao));
    // No vigésimo, a paleta desliga, e o foco, que estava nela, vai ao rótulo do campo novo.
    const cheio = juntos.length >= MAXIMO_DE_CAMPOS_DO_FORMULARIO;
    definirAMostrar({ id: novo.id, focar: cheio ? 'rotulo' : null });
  };

  /** A ordem nova, se não trouxer recusa, com o aviso da posição para o leitor de tela. */
  const reordenar = (campoId: string, movidos: CampoDoFormulario[]) => {
    if (!mudar({ ...formulario, campos: movidos }, LUGAR.mover(campoId))) return;
    const indice = movidos.findIndex((campo) => campo.id === campoId);
    const rotulo = movidos[indice]?.rotulo ?? '';
    definirAviso(`Campo “${rotulo}” na posição ${indice + 1} de ${movidos.length}.`);
  };

  const remover = (campoId: string) => {
    const indice = campos.findIndex((campo) => campo.id === campoId);
    const removido = campos[indice];
    const vizinho = campos[indice + 1] ?? campos[indice - 1];
    if (!aplicar(removerCampo(formulario, campoId, pedeOAtivo), LUGAR.remover(campoId))) return;
    definirAberto(null);
    definirAviso(`Campo “${removido?.rotulo ?? ''}” removido.`);
    if (vizinho) definirAMostrar({ id: vizinho.id, focar: 'cartao' });
    else paleta.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  };

  // O campo acrescentado ou o vizinho do tirado vem à vista na lista que rola.
  useEffect(() => {
    if (aMostrar === null) return;
    const lugar = lista.current?.querySelector(`[data-campo="${CSS.escape(aMostrar.id)}"]`);
    lugar?.scrollIntoView({ block: 'nearest' });
    if (aMostrar.focar === 'rotulo') lugar?.querySelector<HTMLElement>('input')?.focus();
    if (aMostrar.focar === 'cartao') {
      lugar?.querySelector<HTMLElement>('button[aria-expanded]')?.focus();
    }
  }, [aMostrar]);

  // A recusa do salvar leva o foco ao primeiro que recusou, no campo aberto ou no alto da lista.
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    const recusado = lista.current?.querySelector<HTMLElement>('[data-recusado]');
    (recusado?.querySelector<HTMLElement>(FOCAVEL) ?? recusado)?.focus();
    recusado?.scrollIntoView({ block: 'nearest' });
  }, [pedidoDeFoco]);

  const recusar = (errosDaRecusa: Record<string, string>, naRecusa: Formulario) => {
    definirRecusa({ erros: errosDaRecusa, naRecusa });
    definirFalha(null);
    const recusados = errosNoFormulario(errosDaRecusa, naRecusa.campos).porCampo;
    const primeiro = naRecusa.campos.find((campo) => Object.hasOwn(recusados, campo.id));
    if (primeiro) definirAberto(primeiro.id);
    definirPedidoDeFoco((vez) => vez + 1);
  };

  async function salvar() {
    if (salvando || !mudou) return;
    const pedido = formulario;
    // A conferência da tela vem antes: o que a gravação recusaria não sai daqui.
    const conferido = conferirFormulario(pedido, { pedeOAtivo });
    if (!conferido.ok) {
      recusar(conferido.erros, pedido);
      return;
    }
    definirSalvando(true);
    try {
      const resultado = await pedir(
        () =>
          api.PUT('/chamados/tipos/{id}/formulario', {
            params: { path: { id: tipo.id } },
            body: conferido.formulario,
          }),
        'salvar o formulário',
      );
      if ('erro' in resultado) {
        const recusados = resultado.problema?.campos;
        if (recusados && Object.keys(recusados).length > 0) recusar(recusados, pedido);
        else {
          definirRecusa(null);
          definirFalha(resultado.erro);
        }
        return;
      }
      consultas.setQueryData(chaveDoFormularioDoTipo(tipo.id), resultado.dados);
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_TIPOS_DE_CHAMADO, exact: true });
      // O que se escreveu durante o salvar fica, sobre o gravado novo.
      definirEscrito((atual) => (atual === pedido ? null : atual));
      definirRecusa(null);
      definirFalha(null);
      avisar({ situacao: 'sucesso', titulo: 'Formulário salvo.' });
    } finally {
      definirSalvando(false);
    }
  }

  const descartar = () => {
    definirEscrito(null);
    definirRecusa(null);
    definirNaHora(null);
    definirFalha(null);
    definirAviso('Mudanças descartadas.');
  };

  // Sair com mudanças pede a confirmação, como no editor do tipo.
  const bloqueio = useBlocker({
    shouldBlockFn: () => mudou,
    enableBeforeUnload: () => mudou,
    withResolver: true,
  });

  // A posição da linha na última pintura: com o ponteiro sobre a própria linha, ela fica onde está.
  const ultimaPosicao = useRef<number | null>(null);
  const { arraste, alca, alvo } = useArrastar<ItemNoAr>({
    aoSoltar: (item, solto) => {
      const posicao = posicaoDoEncaixe(campos, solto, ultimaPosicao.current);
      if (posicao === null) return;
      if (item.de === 'paleta') {
        acrescentar(item.tipo, posicao);
        return;
      }
      const movidos = moverCampo(campos, item.id, posicao);
      if (movidos) reordenar(item.id, movidos);
    },
  });
  const noAr = arraste?.item ?? null;
  const posicaoNoAr = arraste
    ? posicaoDoEncaixe(campos, arraste.alvo, ultimaPosicao.current)
    : null;
  // Ao mover um campo, os dois lugares em volta dele não mudam nada, e a linha não aparece.
  const posicao =
    noAr?.de === 'lista' && posicaoNoAr !== null && !moverCampo(campos, noAr.id, posicaoNoAr)
      ? null
      : posicaoNoAr;
  useLayoutEffect(() => {
    ultimaPosicao.current = posicao;
  });

  /** Só o mouse arrasta, como no quadro: no toque, a paleta acrescenta no fim e o menu move. */
  const soOMouse = (item: ItemNoAr) => {
    const { onPointerDown, onDragStart } = alca(item);
    return {
      onPointerDown(evento: PointerEvent<HTMLElement>) {
        if (evento.pointerType === 'mouse') onPointerDown(evento);
      },
      onDragStart,
    };
  };

  const itensDoMenu = (campoId: string): ItemDoMenuDeContexto[] =>
    movimentosNaOrdem(
      campos.map((campo) => campo.id),
      campoId,
    ).map((movimento) => ({
      id: movimento,
      rotulo: ROTULO_DO_MOVIMENTO[movimento],
      aoEscolher: () => reordenar(campoId, subirOuDescer(campos, campoId, movimento)),
    }));
  const abrirOMenu = (campoId: string, ponto: { x: number; y: number }, origem: HTMLElement) => {
    if (itensDoMenu(campoId).length === 0) return false;
    definirMenu({ id: campoId, posicao: ponto, origem });
    return true;
  };
  const doMenu = menu ? campos.find((campo) => campo.id === menu.id) : undefined;

  const desligada = avisoDaPaleta(campos);
  const rotuloNoAr =
    noAr?.de === 'lista' ? (campos.find((campo) => campo.id === noAr.id)?.rotulo ?? '') : '';
  const linha = noAr && posicao !== null && (
    <li aria-hidden="true" className={estilos.lugar} {...alvo(ALVO_DA_LINHA)}>
      <span className={estilos.linhaDeEncaixe}>
        <Icone icone={Plus} tamanho={14} />
        {noAr.de === 'paleta' ? textoDoEncaixe(noAr.tipo) : textoDoEncaixeDoCampo(rotuloNoAr)}
      </span>
    </li>
  );
  const nomeDaConta = sessao.tipo === 'ativa' ? sessao.conta.nome : '';
  const pessoa =
    sessao.tipo === 'ativa' && sessao.conta.pessoaId
      ? { id: sessao.conta.pessoaId, nome: sessao.conta.nome }
      : null;
  const abertoAgora =
    aberto === O_TITULO || campos.some((campo) => campo.id === aberto) ? aberto : null;
  const alternar = (qual: string) => {
    definirNaHora(null);
    definirAberto((atual) => (atual === qual ? null : qual));
  };

  return (
    <div className={estilos.tela} data-janela-inteira="rola-por-dentro">
      <Cabecalho
        tipo={tipo}
        detalhe={fraseDosAbertosDoTipo(abertos)}
        acoes={
          <>
            {mudou && (
              <RotuloDeSituacao situacao="atencao">{textoDasMudancas(mudancas)}</RotuloDeSituacao>
            )}
            <Botao isDisabled={!mudou || salvando} onPress={descartar}>
              Descartar
            </Botao>
            <Botao
              nivel="primario"
              icone={Check}
              isDisabled={!mudou}
              carregando={salvando}
              rotuloCarregando="Salvando o formulário"
              onPress={() => void salvar()}
            >
              Salvar o formulário
            </Botao>
          </>
        }
      />
      <div
        className={estilos.corpo}
        data-arrastando={arraste ? '' : undefined}
        data-cursor-nativo={arraste ? '' : undefined}
      >
        <section ref={paleta} className={estilos.paleta} aria-labelledby={`${id}-paleta`}>
          <Carimbo nivel={2} id={`${id}-paleta`}>
            Campos
          </Carimbo>
          <p id={`${id}-dica`} className={estilos.somenteLeitor}>
            O clique acrescenta o campo no fim do formulário.
          </p>
          {TIPOS_DE_CAMPO_DO_CHAMADO.map((tipoDoCampo) => (
            <button
              key={tipoDoCampo}
              type="button"
              className={estilos.botaoDaPaleta}
              aria-describedby={`${id}-dica`}
              // O cursor de segurar do sistema diz que o botão se arrasta, como a alça da tabela.
              data-cursor-nativo=""
              disabled={desligada !== null}
              data-no-ar={(noAr?.de === 'paleta' && noAr.tipo === tipoDoCampo) || undefined}
              onClick={() => acrescentar(tipoDoCampo, campos.length)}
              {...(desligada === null && soOMouse({ de: 'paleta', tipo: tipoDoCampo }))}
            >
              <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[tipoDoCampo]} tamanho={16} />
              {ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[tipoDoCampo]}
            </button>
          ))}
          {/* Sempre na página, para o leitor de tela anunciar a frase quando ela aparece. */}
          <p role="status" className={estilos.avisoDaPaleta}>
            {desligada}
          </p>
        </section>

        <section ref={lista} className={estilos.campos} aria-label="Campos do formulário">
          {(falha || geral.length > 0) && (
            <div className={estilos.recusasGerais} data-recusado="" tabIndex={-1}>
              {falha && <Erro alerta>{falha}</Erro>}
              {geral.map((erro) => (
                <Erro key={erro}>{erro}</Erro>
              ))}
            </div>
          )}
          <ol className={estilos.listaDosCampos}>
            <TituloDoChamado
              formulario={formulario}
              nomeDoTipo={tipo.nome}
              aberto={abertoAgora === O_TITULO}
              aoAbrir={() => alternar(O_TITULO)}
              aoMudar={(titulo) => mudar({ ...formulario, titulo })}
            />
            {campos.map((campo, indice) => (
              <CampoDaLista
                key={campo.id}
                idDoAberto={`${id}-campo-${campo.id}`}
                campo={campo}
                detalhe={detalheDoCampo(campo, nomesDosTipos)}
                antes={posicao === indice ? linha : null}
                alvo={alvo(campo.id)}
                alca={soOMouse({ de: 'lista', id: campo.id })}
                noAr={noAr?.de === 'lista' && noAr.id === campo.id}
                aberto={abertoAgora === campo.id}
                erros={porCampo[campo.id]}
                naHora={naHora}
                aoAbrir={() => alternar(campo.id)}
                aoPedirOMenu={(ponto, origem) => abrirOMenu(campo.id, ponto, origem)}
              >
                <CampoAberto
                  id={`${id}-campo-${campo.id}`}
                  campo={campo}
                  campos={campos}
                  erros={porCampo[campo.id]}
                  naHora={naHora}
                  tiposDeAtivo={opcoesDosTiposDeAtivo(
                    listaDosTipos ?? [],
                    gravado.campos.find((cada) => cada.id === campo.id)?.tiposDeAtivo ?? [],
                  )}
                  aoMudar={(novo, lugar) => mudar(trocarCampo(formulario, novo), lugar)}
                  aoTirarOpcao={(opcaoId) =>
                    aplicar(
                      tirarOpcao(formulario, campo.id, opcaoId, pedeOAtivo),
                      LUGAR.opcao(campo.id, opcaoId),
                    )
                  }
                  aoRemover={() => remover(campo.id)}
                />
              </CampoDaLista>
            ))}
            {posicao === campos.length && linha}
          </ol>
          <div className={estilos.fim} {...alvo(ALVO_DO_FIM)}>
            {campos.length === 0 && !linha && (
              <p className={estilos.vazio}>
                Nenhum campo ainda. Clique num tipo de campo ou arraste-o para cá.
              </p>
            )}
          </div>
          <p role="status" className={estilos.somenteLeitor}>
            {aviso}
          </p>
        </section>

        <aside className={estilos.previa} aria-labelledby={`${id}-previa`}>
          <div className={estilos.cabecalhoDaPrevia}>
            <Icone icone={Eye} tamanho={16} />
            <h2 id={`${id}-previa`}>Prévia do colaborador</h2>
            <span className={estilos.notaDaPrevia}>
              {Object.keys(marcas).length > 0
                ? 'menor que a real; a marca tracejada é só do editor'
                : 'menor que a real'}
            </span>
          </div>
          <TelaDaAba
            rotulo="A aba do colaborador"
            trilha={['Aba', 'Abrir chamado', tipo.nome]}
            passo="2 de 3"
            quem={nomeDaConta ? { nome: nomeDaConta, voce: true } : undefined}
          >
            <FormularioQueSePreenche
              formulario={formulario}
              estado={estado}
              aoMudar={definirEstado}
              quem="pessoa"
              pessoa={pessoa}
              visual="aba"
              marcas={marcas}
            />
          </TelaDaAba>
        </aside>

        {noAr && arraste && (
          <div
            aria-hidden="true"
            className={estilos.noAr}
            style={{ left: arraste.x, top: arraste.y }}
          >
            {noAr.de === 'paleta' ? (
              <>
                <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[noAr.tipo]} tamanho={16} />
                {ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[noAr.tipo]}
              </>
            ) : (
              <NoArDoCampo campo={campos.find((campo) => campo.id === noAr.id)} />
            )}
          </div>
        )}
      </div>

      <MenuDeContexto
        rotulo={doMenu ? `Ações de ${doMenu.rotulo}` : 'Ações do campo'}
        posicao={doMenu ? (menu?.posicao ?? null) : null}
        itens={doMenu ? itensDoMenu(doMenu.id) : []}
        aoFechar={() => definirMenu(null)}
        origem={menu?.origem}
      />

      <Dialogo
        alerta
        titulo="Descartar as mudanças no formulário?"
        aberto={bloqueio.status === 'blocked'}
        aoMudarAberto={(abertoAinda) => {
          if (!abertoAinda && bloqueio.status === 'blocked') bloqueio.reset();
        }}
        acoes={() => (
          <>
            <Botao
              onPress={() => {
                if (bloqueio.status === 'blocked') bloqueio.reset();
              }}
            >
              Continuar editando
            </Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => {
                if (bloqueio.status === 'blocked') bloqueio.proceed();
              }}
            >
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          As mudanças que não foram salvas saem, e o formulário continua como está gravado.
        </p>
      </Dialogo>
    </div>
  );
}

/** O campo no ar, ao mover pela alça: o ícone e o rótulo. */
function NoArDoCampo({ campo }: { campo: CampoDoFormulario | undefined }) {
  if (!campo) return null;
  return (
    <>
      <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[campo.tipo]} tamanho={16} />
      {campo.rotulo || ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[campo.tipo]}
    </>
  );
}

/**
 * O campo na lista: a alça, que arrasta com o mouse, e o botão que o abre no lugar, com o ícone, o
 * rótulo, o detalhe e o selo. O clique direito, a tecla de menu e o Shift+F10 abrem o "Subir" e o
 * "Descer". Fechado, ele mostra embaixo a primeira recusa; a recusa da ordem fica embaixo também.
 */
function CampoDaLista({
  idDoAberto,
  campo,
  detalhe,
  antes,
  alvo,
  alca,
  noAr,
  aberto,
  erros,
  naHora,
  aoAbrir,
  aoPedirOMenu,
  children,
}: {
  idDoAberto: string;
  campo: CampoDoFormulario;
  detalhe: string;
  /** A linha de encaixe, quando o campo entra logo antes deste. */
  antes: ReactNode;
  alvo: Record<string, string>;
  alca: {
    onPointerDown: (evento: PointerEvent<HTMLElement>) => void;
    onDragStart: (evento: DragEvent<HTMLElement>) => void;
  };
  noAr: boolean;
  aberto: boolean;
  erros: ErrosDoCampo | undefined;
  naHora: RecusaNaHora | null;
  aoAbrir: () => void;
  aoPedirOMenu: (ponto: { x: number; y: number }, origem: HTMLElement) => boolean;
  /** O campo aberto, que só aparece com ele aberto. */
  children: ReactNode;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const recusa = aberto ? null : resumoDaRecusa(campo, erros);
  const recusaDaOrdem = naHora?.lugar === LUGAR.mover(campo.id) ? naHora.mensagem : null;
  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>) => {
    const pedeMenu = evento.key === 'ContextMenu' || (evento.shiftKey && evento.key === 'F10');
    if (!pedeMenu) return;
    const caixa = evento.currentTarget.getBoundingClientRect();
    if (aoPedirOMenu({ x: caixa.left + 16, y: caixa.bottom }, evento.currentTarget)) {
      evento.preventDefault();
    }
  };
  return (
    <>
      {antes}
      <li
        className={estilos.lugar}
        data-campo={campo.id}
        {...alvo}
        onContextMenu={(evento) => {
          // No campo aberto, o botão direito é o do navegador, com o colar e a correção.
          const doAberto = document.getElementById(idDoAberto);
          if (evento.target instanceof Node && doAberto?.contains(evento.target)) return;
          const origem = botao.current;
          if (!origem || !aoPedirOMenu({ x: evento.clientX, y: evento.clientY }, origem)) return;
          evento.preventDefault();
          origem.focus();
        }}
      >
        <div
          className={estilos.cartao}
          data-aberto={aberto || undefined}
          data-condicional={campo.condicao.length > 0 || undefined}
          data-no-ar={noAr || undefined}
          data-com-recusa={recusa ? '' : undefined}
        >
          <div className={estilos.linhaDoCampo}>
            <span className={estilos.alca} aria-hidden="true" data-cursor-nativo="" {...alca}>
              <Icone icone={GripVertical} tamanho={14} />
            </span>
            <button
              ref={botao}
              type="button"
              className={estilos.abrir}
              aria-expanded={aberto}
              aria-controls={aberto ? idDoAberto : undefined}
              onClick={aoAbrir}
              onKeyDown={aoTeclar}
            >
              <span className={estilos.iconeDoCampo}>
                <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[campo.tipo]} tamanho={18} />
              </span>
              <span className={estilos.textosDoCampo}>
                <b>{campo.rotulo || 'Sem rótulo'}</b>
                <small>{detalhe}</small>
              </span>
              <Selo selo={seloDoCampo(campo)} />
            </button>
          </div>
          {aberto && children}
        </div>
        {recusa && <Erro>{recusa}</Erro>}
        {recusaDaOrdem && <Erro alerta>{recusaDaOrdem}</Erro>}
      </li>
    </>
  );
}
