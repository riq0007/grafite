// O que a tela das equipes e dos canais decide sem a API (spec modulo-chat, "Equipes e canais na
// tela"; spec chat, "Equipes e canais"; change chat-com-chamados, design, decisão 15): os textos da
// linha, a gaveta da nova e da gravada, o que mudou nela, os grupos da escolha, com o gravado
// inativo, o aviso de cada mudança e as recusas que valem.
import type { components } from '@grafite/api-client';
import { recusaDoTeto } from '@grafite/domain';
import type { OpcaoDeSelecao } from '@grafite/ui';

export type EquipeOuCanal = components['schemas']['EquipeOuCanal'];

/** A equipe ou o canal como a gaveta o escreve e a gravação o pede. */
export type EdicaoDaEquipeOuCanal = components['schemas']['PedidoDaEquipeOuCanal'];

type GrupoGravado = components['schemas']['GrupoDaEquipeOuCanal'];

export type TipoDaConversa = EquipeOuCanal['tipo'];

/** Um grupo ativo da escolha, como o `GET /chat/grupos` o dá. */
export interface GrupoParaEscolher {
  id: string;
  nome: string;
}

export const nomeDoTipo = (tipo: TipoDaConversa) => (tipo === 'equipe' ? 'Equipe' : 'Canal');

/** O grupo gravado pelo nome, com a situação em texto quando ele está inativo. */
export const nomeDoGrupo = (grupo: GrupoGravado) =>
  grupo.ativo ? grupo.nome : `${grupo.nome} (inativo)`;

/** Quem participa, na linha: o grupo da equipe, ou todos que usam o chat, no canal. */
export const grupoNaLinha = (item: EquipeOuCanal) => {
  if (item.tipo === 'canal') return 'Todos que usam o chat';
  return item.grupo ? nomeDoGrupo(item.grupo) : '—';
};

export const quemEscreveNaLinha = (item: EquipeOuCanal) =>
  item.escreve ? nomeDoGrupo(item.escreve) : 'Todos que participam';

export const avisarEmTexto = (avisar: boolean) => (avisar ? 'Ligado' : 'Desligado');

/** A nova, do tipo do botão que a abriu: vazia, com todos escrevendo e sem avisar a cada mensagem. */
export const edicaoNova = (tipo: TipoDaConversa): EdicaoDaEquipeOuCanal => ({
  nome: '',
  tipo,
  grupoId: null,
  quemEscreve: 'todos',
  escreveGrupoId: null,
  avisar: false,
});

/** A gravada, como a gaveta a mostra. */
export const edicaoDa = (item: EquipeOuCanal): EdicaoDaEquipeOuCanal => ({
  nome: item.nome,
  tipo: item.tipo,
  grupoId: item.grupo?.id ?? null,
  quemEscreve: item.escreve ? 'grupo' : 'todos',
  escreveGrupoId: item.escreve?.id ?? null,
  avisar: item.avisar,
});

/**
 * O pedido da gravação: o grupo só na equipe, e o grupo que escreve só com "Um grupo". A gaveta
 * guarda a escolha de antes enquanto "Todos que participam" está marcado, para ela voltar.
 */
export const pedidoDa = (edicao: EdicaoDaEquipeOuCanal): EdicaoDaEquipeOuCanal => ({
  ...edicao,
  grupoId: edicao.tipo === 'equipe' ? edicao.grupoId : null,
  escreveGrupoId: edicao.quemEscreve === 'grupo' ? edicao.escreveGrupoId : null,
});

/** Se a gaveta difere da gravada, ou, na nova, se algo foi escrito ou escolhido. */
export function mudouAEquipeOuCanal(
  edicao: EdicaoDaEquipeOuCanal,
  gravada: EquipeOuCanal | null,
): boolean {
  const agora = pedidoDa(edicao);
  const antes = pedidoDa(gravada ? edicaoDa(gravada) : edicaoNova(edicao.tipo));
  return (
    agora.nome !== antes.nome ||
    agora.grupoId !== antes.grupoId ||
    agora.quemEscreve !== antes.quemEscreve ||
    agora.escreveGrupoId !== antes.escreveGrupoId ||
    agora.avisar !== antes.avisar
  );
}

/**
 * Os grupos da escolha: os ativos e, na alteração, o gravado, mesmo inativo, com a situação em
 * texto, como "Financeiro (inativo)", no lugar dele pela ordem do nome. Sem ele, a escolha abriria
 * vazia, e salvar voltaria "Escolha o grupo da equipe.".
 */
export function opcoesDosGrupos(
  ativos: readonly GrupoParaEscolher[],
  gravado: GrupoGravado | null,
): OpcaoDeSelecao[] {
  const opcoes = ativos.map(({ id, nome }) => ({ id, rotulo: nome }));
  if (!gravado || ativos.some(({ id }) => id === gravado.id)) return opcoes;
  const depois = ativos.findIndex(
    ({ nome }) => nome.localeCompare(gravado.nome, 'pt-BR', { sensitivity: 'base' }) > 0,
  );
  const lugar = depois === -1 ? opcoes.length : depois;
  return [
    ...opcoes.slice(0, lugar),
    { id: gravado.id, rotulo: nomeDoGrupo(gravado) },
    ...opcoes.slice(lugar),
  ];
}

export type MudancaDaEquipeOuCanal = 'criacao' | 'alteracao' | 'arquivamento' | 'reativacao';

const PARTICIPIO: Record<MudancaDaEquipeOuCanal, string> = {
  criacao: 'criad',
  alteracao: 'salv',
  arquivamento: 'arquivad',
  reativacao: 'reativad',
};

/** O aviso da mudança, pelo nome, como "Equipe Financeiro criada." ou "Avisos da TI arquivado.". */
export const avisoDaMudanca = (
  mudanca: MudancaDaEquipeOuCanal,
  { nome, tipo }: Pick<EquipeOuCanal, 'nome' | 'tipo'>,
) => `${nome} ${PARTICIPIO[mudanca]}${tipo === 'equipe' ? 'a' : 'o'}.`;

/** A recusa do teto, já na lista: com 100 ativas, a nova não chega a ser escrita. */
export const tetoDaLista = (itens: readonly EquipeOuCanal[]) =>
  recusaDoTeto(itens.filter(({ arquivada }) => !arquivada).length);

export type CampoDaGaveta = 'nome' | 'grupoId' | 'escreveGrupoId';
export type ErrosDaEquipeOuCanal = Partial<Record<CampoDaGaveta, string>>;

const CAMPOS_DA_GAVETA: readonly CampoDaGaveta[] = ['nome', 'grupoId', 'escreveGrupoId'];

/** As recusas da API nos campos da gaveta; o resto a tela mostra no pé, pela frase do pedido. */
export function errosDaEquipeOuCanal(
  campos: Readonly<Record<string, string>>,
): ErrosDaEquipeOuCanal {
  const erros: ErrosDaEquipeOuCanal = {};
  for (const campo of CAMPOS_DA_GAVETA) {
    const erro = campos[campo];
    if (erro) erros[campo] = erro;
  }
  return erros;
}

/** As recusas que ainda valem: cada uma, enquanto o campo dela não muda. */
export function recusasQueValem(
  erros: ErrosDaEquipeOuCanal,
  naRecusa: EdicaoDaEquipeOuCanal,
  agora: EdicaoDaEquipeOuCanal,
): ErrosDaEquipeOuCanal {
  const valem: ErrosDaEquipeOuCanal = {};
  if (erros.nome && naRecusa.nome === agora.nome) valem.nome = erros.nome;
  if (erros.grupoId && naRecusa.grupoId === agora.grupoId) valem.grupoId = erros.grupoId;
  if (
    erros.escreveGrupoId &&
    naRecusa.quemEscreve === agora.quemEscreve &&
    naRecusa.escreveGrupoId === agora.escreveGrupoId
  ) {
    valem.escreveGrupoId = erros.escreveGrupoId;
  }
  return valem;
}
