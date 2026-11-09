// A escolha da visão (spec componentes-base e visoes-de-tabela): o botão com o nome da visão aberta
// e, em texto, "Personalizada" ou "Do link", e o menu com a visão de fábrica, "Da organização",
// "Minhas visões" e as ações que a conta pode fazer na visão aberta, com fixar no menu do módulo e
// "No menu" em texto na fixada. Os diálogos são da tela.
import { ChevronDown } from 'lucide-react';
import type { Selection } from 'react-aria-components';
import { Icone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { ItemDeMenu, Menu, SecaoDeMenu, Separador } from '../menu/Menu.tsx';
import estilos from './EscolhaDaVisao.module.css';

export interface VisaoDaEscolha {
  id: string;
  nome: string;
  /** A visão de fábrica da tabela, uma compartilhada da organização ou uma da própria conta. */
  origem: 'fabrica' | 'organizacao' | 'conta';
}

/** A tabela aberta: a visão como está salva, personalizada pela conta ou vinda de um link. */
export type EstadoDaEscolhaDaVisao = 'salva' | 'personalizada' | 'do-link';

/** O estado em texto, ao lado do nome; a visão salva mostra só o nome. */
export const ROTULOS_DO_ESTADO_DA_VISAO = {
  salva: null,
  personalizada: 'Personalizada',
  'do-link': 'Do link',
} as const satisfies Record<EstadoDaEscolhaDaVisao, string | null>;

export interface PropsDaEscolhaDaVisao {
  /** As visões que a conta pode usar, com a de fábrica. */
  visoes: readonly VisaoDaEscolha[];
  /** O id da visão aberta. */
  aberta: string;
  estado: EstadoDaEscolhaDaVisao;
  /** O id da visão padrão da organização, quando ela tem uma. */
  padraoDaOrganizacao?: string | null;
  /** A conta tem `organizacao.editar`: edita as visões da organização e escolhe a padrão. */
  podeEditarAOrganizacao: boolean;
  aoEscolher: (id: string) => void;
  /** "Salvar na visão da organização": grava as mudanças da conta na visão, para todos. */
  aoSalvarNaOrganizacao: () => void;
  /** "Salvar como nova visão…": a tela pede o nome. */
  aoSalvarComoNova: () => void;
  /** "Duplicar…": a tela pede o nome da cópia. */
  aoDuplicar: () => void;
  /** "Restaurar a visão": apaga as mudanças da conta, e a tabela volta à visão salva. */
  aoRestaurar: () => void;
  /** "Voltar à minha tabela": tira o que veio do link. */
  aoVoltar: () => void;
  aoRenomear: () => void;
  aoRemover: () => void;
  aoUsarComoPadrao: () => void;
  /**
   * As visões fixadas no menu do módulo (spec visoes-de-tabela, "Visões fixadas no menu"): as da
   * conta e as da organização. Com elas, a fixada mostra "No menu", e a aberta se fixa.
   */
  fixadas?: { daConta: readonly string[]; daOrganizacao: readonly string[] };
  /** "Fixar no menu" e "Desafixar do menu", só para a conta. */
  aoFixar?: () => void;
  aoDesafixar?: () => void;
  /** "Fixar no menu de todos" e "Desafixar do menu de todos", com `organizacao.editar`. */
  aoFixarParaTodos?: () => void;
  aoDesafixarParaTodos?: () => void;
}

interface Acao {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
  destrutivo?: boolean;
}

/**
 * Fixar e desafixar a visão aberta. A de fábrica já está no menu, como o primeiro item. A conta
 * desafixa só as dela, e a fixada pela organização já está no menu dela; a da organização se fixa
 * para todos com `organizacao.editar`.
 */
function acoesDaFixacao(
  atual: VisaoDaEscolha,
  {
    fixadas,
    podeEditarAOrganizacao,
    aoFixar,
    aoDesafixar,
    aoFixarParaTodos,
    aoDesafixarParaTodos,
  }: Pick<
    PropsDaEscolhaDaVisao,
    | 'fixadas'
    | 'podeEditarAOrganizacao'
    | 'aoFixar'
    | 'aoDesafixar'
    | 'aoFixarParaTodos'
    | 'aoDesafixarParaTodos'
  >,
): Acao[] {
  if (!fixadas || atual.origem === 'fabrica') return [];
  const pelaConta = fixadas.daConta.includes(atual.id);
  const pelaOrganizacao = fixadas.daOrganizacao.includes(atual.id);
  const acoes: Acao[] = [];
  if (pelaConta && aoDesafixar) {
    acoes.push({ id: 'desafixar', rotulo: 'Desafixar do menu', aoEscolher: aoDesafixar });
  } else if (!pelaConta && !pelaOrganizacao && aoFixar) {
    acoes.push({ id: 'fixar', rotulo: 'Fixar no menu', aoEscolher: aoFixar });
  }
  if (podeEditarAOrganizacao && atual.origem === 'organizacao') {
    if (pelaOrganizacao && aoDesafixarParaTodos) {
      acoes.push({
        id: 'desafixar-de-todos',
        rotulo: 'Desafixar do menu de todos',
        aoEscolher: aoDesafixarParaTodos,
      });
    } else if (!pelaOrganizacao && aoFixarParaTodos) {
      acoes.push({
        id: 'fixar-para-todos',
        rotulo: 'Fixar no menu de todos',
        aoEscolher: aoFixarParaTodos,
      });
    }
  }
  return acoes;
}

export function EscolhaDaVisao({
  visoes,
  aberta,
  estado,
  padraoDaOrganizacao,
  podeEditarAOrganizacao,
  aoEscolher,
  aoSalvarNaOrganizacao,
  aoSalvarComoNova,
  aoDuplicar,
  aoRestaurar,
  aoVoltar,
  aoRenomear,
  aoRemover,
  aoUsarComoPadrao,
  fixadas,
  aoFixar,
  aoDesafixar,
  aoFixarParaTodos,
  aoDesafixarParaTodos,
}: PropsDaEscolhaDaVisao) {
  const fabrica = visoes.find((visao) => visao.origem === 'fabrica');
  const atual = visoes.find((visao) => visao.id === aberta) ?? fabrica ?? visoes[0];
  if (!atual) return null;
  // A visão da conta se edita sempre; a da organização, com `organizacao.editar`; a de fábrica, nunca.
  const podeEditar =
    atual.origem === 'conta' || (atual.origem === 'organizacao' && podeEditarAOrganizacao);
  const padrao = padraoDaOrganizacao ?? fabrica?.id;
  const personalizada = estado === 'personalizada';
  const acoes: Acao[] = [
    // A visão da conta guarda as mudanças nela mesma; a da organização, só com a permissão.
    ...(personalizada && atual.origem === 'organizacao' && podeEditarAOrganizacao
      ? [
          {
            id: 'salvar-na-organizacao',
            rotulo: 'Salvar na visão da organização',
            aoEscolher: aoSalvarNaOrganizacao,
          },
        ]
      : []),
    { id: 'salvar-como', rotulo: 'Salvar como nova visão…', aoEscolher: aoSalvarComoNova },
    { id: 'duplicar', rotulo: 'Duplicar…', aoEscolher: aoDuplicar },
    ...(personalizada
      ? [{ id: 'restaurar', rotulo: 'Restaurar a visão', aoEscolher: aoRestaurar }]
      : []),
    ...(estado === 'do-link'
      ? [{ id: 'voltar', rotulo: 'Voltar à minha tabela', aoEscolher: aoVoltar }]
      : []),
    ...acoesDaFixacao(atual, {
      fixadas,
      podeEditarAOrganizacao,
      aoFixar,
      aoDesafixar,
      aoFixarParaTodos,
      aoDesafixarParaTodos,
    }),
    ...(podeEditar
      ? [
          { id: 'renomear', rotulo: 'Renomear…', aoEscolher: aoRenomear },
          { id: 'remover', rotulo: 'Remover…', aoEscolher: aoRemover, destrutivo: true },
        ]
      : []),
    ...(podeEditarAOrganizacao && atual.origem !== 'conta' && atual.id !== padrao
      ? [
          {
            id: 'padrao',
            rotulo: 'Usar como padrão da organização',
            aoEscolher: aoUsarComoPadrao,
          },
        ]
      : []),
  ];
  /** O texto de apoio de cada visão: a padrão da organização e a fixada no menu. */
  const descricao = (visao: VisaoDaEscolha) => {
    const partes = [
      visao.origem === 'organizacao' && visao.id === padraoDaOrganizacao
        ? 'Padrão da organização'
        : null,
      fixadas?.daConta.includes(visao.id) || fixadas?.daOrganizacao.includes(visao.id)
        ? 'No menu'
        : null,
    ].filter((parte) => parte !== null);
    return partes.length > 0 ? partes.join(' · ') : undefined;
  };
  const escolher = (chaves: Selection) => {
    if (chaves === 'all') return;
    const [id] = [...chaves];
    if (id !== undefined && String(id) !== aberta) aoEscolher(String(id));
  };
  const secao = (origem: VisaoDaEscolha['origem'], titulo?: string, rotulo?: string) => {
    const daOrigem = visoes.filter((visao) => visao.origem === origem);
    if (daOrigem.length === 0) return null;
    return (
      <SecaoDeMenu
        titulo={titulo}
        aria-label={rotulo}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[atual.id]}
        onSelectionChange={escolher}
      >
        {daOrigem.map((visao) => (
          <ItemDeMenu key={visao.id} id={visao.id} descricao={descricao(visao)}>
            {visao.nome}
          </ItemDeMenu>
        ))}
      </SecaoDeMenu>
    );
  };
  const rotuloDoEstado = ROTULOS_DO_ESTADO_DA_VISAO[estado];
  return (
    <Menu
      rotulo="Visões"
      gatilho={
        <Botao
          aria-label={`Visão ${atual.nome}${rotuloDoEstado ? `, ${rotuloDoEstado.toLowerCase()}` : ''}`}
          className={estilos.gatilho}
        >
          <span className={estilos.nome}>{atual.nome}</span>
          {rotuloDoEstado && <span className={estilos.estado}>{rotuloDoEstado}</span>}
          <Icone icone={ChevronDown} />
        </Botao>
      }
    >
      {secao('fabrica', undefined, 'Visão de fábrica')}
      {secao('organizacao', 'Da organização')}
      {secao('conta', 'Minhas visões')}
      <Separador />
      <SecaoDeMenu aria-label="Ações da visão">
        {acoes.map((acao) => (
          <ItemDeMenu
            key={acao.id}
            id={acao.id}
            destrutivo={acao.destrutivo}
            onAction={acao.aoEscolher}
          >
            {acao.rotulo}
          </ItemDeMenu>
        ))}
      </SecaoDeMenu>
    </Menu>
  );
}
