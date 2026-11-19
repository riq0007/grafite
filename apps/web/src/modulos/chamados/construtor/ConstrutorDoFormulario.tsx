// O construtor do formulário do tipo (spec modulo-chamados, "Construtor do formulário"; change
// chamados-da-ti, design, decisão 15 e "O construtor, a paleta (tarefa 5.21)"; m09): a janela
// inteira, em três colunas que rolam sozinhas: à esquerda, a paleta "Campos", que acrescenta o campo
// no fim pelo clique e na linha de encaixe pelo arraste; no meio, os campos; à direita, a prévia do
// colaborador, que muda junto. A ordem dos campos, o campo aberto e o salvar vêm na 5.22.
import {
  type CampoDoFormulario,
  type Formulario,
  idDoFormulario,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  TIPOS_DE_CAMPO_DO_CHAMADO,
  type TipoDeCampoDoChamado,
} from '@grafite/domain';
import { Botao, CabecalhoDaPagina, Carimbo, EstadoVazio, Icone } from '@grafite/ui';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronRight, Eye, Plus } from 'lucide-react';
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useFormularioDoTipo, useTiposDeChamado } from '../consultas.ts';
import { ESTADO_VAZIO, type EstadoDoFormulario } from '../formulario/estado.ts';
import { FormularioQueSePreenche } from '../formulario/FormularioQueSePreenche.tsx';
import { ICONES_DOS_TIPOS_DE_CAMPO } from '../icones.ts';
import { IconeDoTipo } from '../Pecas.tsx';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDaAba } from '../previa/TelaDaAba.tsx';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import type { TipoDeChamado } from '../tipos/edicao.ts';
import { useArrastar } from '../useArrastar.ts';
import estilos from './Construtor.module.css';
import {
  ALVO_DA_LINHA,
  ALVO_DO_FIM,
  acrescentarCampo,
  avisoDaPaleta,
  avisoDoAcrescentado,
  campoNovo,
  posicaoDoEncaixe,
  textoDoEncaixe,
} from './construtor.ts';

/** O que se arrasta no construtor: por ora, um tipo de campo da paleta; a ordem dos campos, na 5.22. */
type ItemNoAr = { de: 'paleta'; tipo: TipoDeCampoDoChamado };

/** O id de um campo ou de uma opção novos, com os bytes sorteados pelo navegador. */
const sortearId = () => idDoFormulario(crypto.getRandomValues(new Uint8Array(10)));

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
  const pronto = formulario.data !== undefined && tipo !== null;

  let conteudo: ReactNode;
  if (pronto) {
    conteudo = <Construtor key={id} tipo={tipo} gravado={formulario.data.formulario} />;
  } else if (formulario.isError || tipos.isError) {
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
    <div className={estilos.tela} data-janela-inteira={pronto ? 'rola-por-dentro' : ''}>
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
      />
      {conteudo}
    </div>
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

function Construtor({ tipo, gravado }: { tipo: TipoDeChamado; gravado: Formulario }) {
  const id = useId();
  const sessao = useSessao();
  // O que a paleta acrescentou; sem nada, o formulário gravado, que o evento relê.
  const [escritos, definirEscritos] = useState<CampoDoFormulario[] | null>(null);
  const campos = escritos ?? gravado.campos;
  const formulario: Formulario = { titulo: gravado.titulo, campos };
  // As respostas da prévia, que responde ao clique como a aba.
  const [estado, definirEstado] = useState<EstadoDoFormulario>(ESTADO_VAZIO);
  const [aviso, definirAviso] = useState('');
  const [aMostrar, definirAMostrar] = useState<string | null>(null);
  const lista = useRef<HTMLElement>(null);

  const acrescentar = (tipoDoCampo: TipoDeCampoDoChamado, posicao: number) => {
    const novo = campoNovo(tipoDoCampo, campos, sortearId);
    const juntos = acrescentarCampo(campos, novo, posicao);
    if (!juntos) return;
    definirEscritos(juntos);
    definirAviso(avisoDoAcrescentado(novo.rotulo, campos, posicao));
    definirAMostrar(novo.id);
  };

  // O campo acrescentado vem à vista na lista que rola; o foco fica na paleta, para o próximo.
  useEffect(() => {
    if (aMostrar === null) return;
    lista.current
      ?.querySelector(`[data-campo="${CSS.escape(aMostrar)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [aMostrar]);

  // A posição da linha na última pintura: com o ponteiro sobre a própria linha, ela fica onde está.
  const ultimaPosicao = useRef<number | null>(null);
  const { arraste, alca, alvo } = useArrastar<ItemNoAr>({
    aoSoltar: (item, solto) => {
      const posicao = posicaoDoEncaixe(campos, solto, ultimaPosicao.current);
      if (posicao !== null) acrescentar(item.tipo, posicao);
    },
  });
  const posicao = arraste ? posicaoDoEncaixe(campos, arraste.alvo, ultimaPosicao.current) : null;
  useLayoutEffect(() => {
    ultimaPosicao.current = posicao;
  });

  const desligada = avisoDaPaleta(campos);
  /** Só o mouse arrasta, como no quadro: no toque, o toque acrescenta no fim. */
  const alcaDaPaleta = (tipoDoCampo: TipoDeCampoDoChamado) => {
    const { onPointerDown, onDragStart } = alca({ de: 'paleta', tipo: tipoDoCampo });
    return {
      onPointerDown(evento: PointerEvent<HTMLElement>) {
        if (evento.pointerType === 'mouse') onPointerDown(evento);
      },
      onDragStart,
    };
  };

  const linha = arraste && posicao !== null && (
    <li aria-hidden="true" className={estilos.lugar} {...alvo(ALVO_DA_LINHA)}>
      <span className={estilos.linhaDeEncaixe}>
        <Icone icone={Plus} tamanho={14} />
        {textoDoEncaixe(arraste.item.tipo)}
      </span>
    </li>
  );
  const nomeDaConta = sessao.tipo === 'ativa' ? sessao.conta.nome : '';
  const pessoa =
    sessao.tipo === 'ativa' && sessao.conta.pessoaId
      ? { id: sessao.conta.pessoaId, nome: sessao.conta.nome }
      : null;

  return (
    <div
      className={estilos.corpo}
      data-arrastando={arraste ? '' : undefined}
      data-cursor-nativo={arraste ? '' : undefined}
    >
      <section className={estilos.paleta} aria-labelledby={`${id}-paleta`}>
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
            data-no-ar={arraste?.item.tipo === tipoDoCampo || undefined}
            onClick={() => acrescentar(tipoDoCampo, campos.length)}
            {...(desligada === null && alcaDaPaleta(tipoDoCampo))}
          >
            <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[tipoDoCampo]} tamanho={16} />
            {ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[tipoDoCampo]}
          </button>
        ))}
        {desligada && <p className={estilos.avisoDaPaleta}>{desligada}</p>}
      </section>

      <section ref={lista} className={estilos.campos} aria-label="Campos do formulário">
        {(campos.length > 0 || linha) && (
          <ol className={estilos.listaDosCampos}>
            {campos.map((campo, indice) => (
              <CampoDaLista
                key={campo.id}
                campo={campo}
                antes={posicao === indice ? linha : null}
                alvo={alvo(campo.id)}
              />
            ))}
            {posicao === campos.length && linha}
          </ol>
        )}
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
          <span className={estilos.notaDaPrevia}>menor que a real</span>
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
          />
        </TelaDaAba>
      </aside>

      {arraste && (
        <div
          aria-hidden="true"
          className={estilos.noAr}
          style={{ left: arraste.x, top: arraste.y }}
        >
          <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[arraste.item.tipo]} tamanho={16} />
          {ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[arraste.item.tipo]}
        </div>
      )}
    </div>
  );
}

/** O campo na lista: o ícone, o rótulo em peso forte e o tipo de campo embaixo. */
function CampoDaLista({
  campo,
  antes,
  alvo,
}: {
  campo: CampoDoFormulario;
  /** A linha de encaixe, quando o campo novo entra logo antes deste. */
  antes: ReactNode;
  alvo: Record<string, string>;
}) {
  return (
    <>
      {antes}
      <li className={estilos.lugar} data-campo={campo.id} {...alvo}>
        <div className={estilos.campo}>
          <span className={estilos.iconeDoCampo}>
            <Icone icone={ICONES_DOS_TIPOS_DE_CAMPO[campo.tipo]} tamanho={18} />
          </span>
          <span className={estilos.textosDoCampo}>
            <b>{campo.rotulo}</b>
            <small>{ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[campo.tipo]}</small>
          </span>
        </div>
      </li>
    </>
  );
}
