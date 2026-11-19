// A ficha do chamado (spec chamados, "Quem vê e quem atende os chamados", "Prazo do chamado",
// "Conversa do chamado" e "Respostas prontas"; change chamados-da-ti, design, decisões 5, 8 e 9, e
// tarefas 4.11, 4.15 e 4.25): o chamado inteiro numa resposta, a quem o vê, com o resumo do ativo
// ligado (`resumo-do-ativo.ts`). O resumo das respostas sai na
// leitura, dos nomes de agora dos ativos, dos locais e das pessoas; a pessoa vai pelo alcance das
// pessoas; a conversa leva os anexos de cada mensagem e nota e os alertas do ativo a quem os vê; a
// OS e a solicitação vão a quem as vê; e o módulo desligado vale como o que a conta não vê. O
// evento do ativo vai com o ativo de antes e o de depois, a toda conta que vê o chamado, como o
// ativo ligado. O evento de um código que esta versão não lê fica de fora, em vez de derrubar a
// ficha.
import {
  alertas,
  anexosDosChamados,
  arquivos,
  ativos,
  chamados,
  contas,
  mensagensDosChamados,
  modelos,
  ordensDeServico,
  organizacoes,
  pessoas,
  respostasProntas,
  solicitacoes,
  type Transacao,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  type AtivoDasRespostas,
  alcance,
  atendeOChamado,
  COMO_O_CHAMADO_TEM_A_SOLICITACAO,
  type ComoOChamadoTemASolicitacao,
  type DiaDaSemana,
  type EventoDaAcao,
  type Formulario,
  type HorarioDaTi,
  lerPrazoDoChamado,
  momentoLido,
  motivoDoEventoNaoGerado,
  type OrigemDoChamado,
  type PrazoDoChamado,
  podeEm,
  resumoDasRespostas,
  rotuloDoAtivo,
  type SeveridadeDoAlerta,
  type SituacaoDaOrdem,
  type SituacaoDaSolicitacao,
  type SituacaoDoChamado,
  textoDaRespostaPronta,
  veASolicitacao,
  veOChamado,
} from '@grafite/domain';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { CAPACIDADE_DOS_CONSUMIVEIS } from '../consumiveis/compativeis.ts';
import { chamadoNaoEncontrado } from './alcance.ts';
import { formularioDa } from './formulario.ts';
import { lerHorarioDaTi } from './horario.ts';
import { lerContaQueAtende } from './quem-atende.ts';
import { type ResumoDoAtivo, resumoDoAtivo } from './resumo-do-ativo.ts';

/** Os códigos que esta versão grava na conversa: a abertura e os eventos das ações do domínio. */
type EventoGravado = 'abertura' | EventoDaAcao['evento'];

/**
 * Os eventos que a ficha lê (decisão 8): a abertura, as ações do atendimento, a troca do ativo, o
 * Virar OS (4.16) e a solicitação, pelo "Pedir toner" (4.17) e pelo tipo na abertura, gerada ou não
 * (4.18).
 */
export const EVENTOS_DA_FICHA = [
  'abertura',
  'assumiu',
  'passou',
  'devolveu',
  'desfez',
  'aguardando',
  'retomou',
  'resolveu',
  'reabriu',
  'ativo',
  'os',
  'solicitacao',
  'solicitacao-nao-gerada',
] as const satisfies readonly EventoGravado[];
export type EventoDaFicha = (typeof EVENTOS_DA_FICHA)[number];

/** Aceita só o `never`: o tipo que sobra reprova o typecheck onde o guarda o pede. */
type SemNenhum<Sobra extends never> = Sobra;

/**
 * O guarda dos eventos: o código que o domínio grava e a ficha não lê reprova o typecheck aqui, em
 * vez de sumir da conversa em silêncio, como o código desconhecido de uma versão mais nova.
 */
export type EventosForaDaFicha = SemNenhum<Exclude<EventoGravado, EventoDaFicha>>;

/** O número da OS do evento `os`; o ilegível vem nulo, como a conta sem o nome. */
const osDoEvento = (dados: Record<string, unknown> | null) =>
  Number.isInteger(dados?.numero) ? { numero: dados?.numero as number } : null;

const COMOS: ReadonlySet<unknown> = new Set(COMO_O_CHAMADO_TEM_A_SOLICITACAO);

/** A solicitação do evento `solicitacao`, com o `como`; o ilegível vem nulo. */
function solicitacaoDoEvento(
  dados: Record<string, unknown> | null,
): { numero: number; como: ComoOChamadoTemASolicitacao } | null {
  const numero = dados?.numero;
  const como = dados?.como;
  if (!Number.isInteger(numero) || !COMOS.has(como)) return null;
  return { numero: numero as number, como: como as ComoOChamadoTemASolicitacao };
}

const eventoLido = (evento: string | null): evento is EventoDaFicha =>
  (EVENTOS_DA_FICHA as readonly (string | null)[]).includes(evento);

/** O relógio volta a contar na abertura, na retomada e na reabertura, e para na espera e na resolução. */
const VOLTAS_DO_RELOGIO: ReadonlySet<string> = new Set(['abertura', 'retomou', 'reabriu']);
const PARADAS_DO_RELOGIO: ReadonlySet<string> = new Set(['aguardando', 'resolveu']);

export interface AnexoNaFicha {
  id: string;
  nome: string;
  tipo: string;
  bytes: number;
}

/** Quem escreveu ou agiu: uma conta, ou a pessoa que pediu, com o nome de agora. */
export interface AutorNaFicha {
  tipo: 'conta' | 'pessoa';
  id: string;
  nome: string;
}

/** Uma conta dos dados do evento, com o nome de agora. */
export interface ContaNaFicha {
  conta: string;
  nome: string;
}

/** Um ativo dos dados do evento do ativo, com o rótulo e o patrimônio de agora. */
export interface AtivoNaFicha {
  id: string;
  rotulo: string;
  patrimonio: string | null;
}

export type ItemDaConversa =
  | {
      especie: 'mensagem' | 'nota';
      id: string;
      em: string;
      autor: AutorNaFicha;
      texto: string;
      anexos: AnexoNaFicha[];
    }
  | {
      especie: 'evento';
      id: string;
      em: string;
      autor: AutorNaFicha;
      evento: EventoDaFicha;
      de: ContaNaFicha | null;
      para: ContaNaFicha | null;
      /** O `desde` do `assumiu` e do `desfez`; nulo nos outros. */
      desde: string | null;
      /** No `ativo`, o ativo de antes e o de depois, cada um nulo sem ativo; nulo nos outros. */
      ativo: { antes: AtivoNaFicha | null; depois: AtivoNaFicha | null } | null;
      /** No `os`, o número da OS, a toda conta que vê o chamado; nulo nos outros. */
      os: { numero: number } | null;
      /** No `solicitacao`, o número e o `como`, a toda conta que vê o chamado; nulo nos outros. */
      solicitacao: { numero: number; como: ComoOChamadoTemASolicitacao } | null;
      /** No `solicitacao-nao-gerada`, o motivo escrito na abertura; nulo nos outros. */
      motivo: string | null;
    }
  | { especie: 'alerta'; id: string; em: string; texto: string; severidade: SeveridadeDoAlerta };

export interface FichaDoChamado {
  numero: number;
  titulo: string;
  situacao: SituacaoDoChamado;
  versao: number;
  origem: OrigemDoChamado;
  abertoEm: string;
  /** O tipo, com o `podeVirarOs`, que a tela pede para mostrar o "Virar OS" (revisão da 5.31). */
  tipo: { id: string; nome: string; icone: string; podeVirarOs: boolean };
  pessoa: {
    id: string;
    nome: string;
    local: string | null;
    abrir: boolean;
    contatos: { email: string | null; telefone: string | null } | null;
  };
  responsavel: { conta: string; nome: string; desde: string; naoAtendeMais: boolean } | null;
  ativo: {
    id: string;
    rotulo: string;
    patrimonio: string | null;
    local: string | null;
    abrir: boolean;
    /** O tipo do ativo, para a miniatura da seção "Ativo ligado". */
    tipo: { nome: string; icone: string };
    /** Se o tipo usa consumíveis, para o "Pedir toner" (spec solicitacoes, "Solicitação pelo chamado"). */
    usaConsumiveis: boolean;
    /** O resumo da seção "Ativo ligado"; nulo com o Ativos desligado. */
    resumo: ResumoDoAtivo | null;
  } | null;
  locais: string[];
  semLocal: boolean;
  permite: { atender: boolean };
  relogio: {
    prazo: PrazoDoChamado;
    contadoS: number;
    relogioDesde: string | null;
    primeiraRespostaEm: string | null;
  } | null;
  parouEm: string | null;
  horario: Omit<HorarioDaTi, 'dias'> & { dias: DiaDaSemana[] };
  /** A OS, com o ativo dela, que pode não ser o do chamado (tarefa 5.31). */
  os: {
    id: string;
    numero: number;
    situacao: SituacaoDaOrdem;
    ativo: { id: string; rotulo: string; patrimonio: string | null };
  } | null;
  solicitacao: { id: string; numero: number; situacao: SituacaoDaSolicitacao } | null;
  formulario: Formulario;
  respostas: Record<string, unknown>;
  citados: {
    ativos: { id: string; rotulo: string; patrimonio: string | null }[];
    locais: { id: string; caminho: string }[];
    pessoas: { id: string; nome: string }[];
  };
  anexosDosCampos: (AnexoNaFicha & { campo: string })[];
  resumo: string;
  conversa: ItemDaConversa[];
  respostasProntas: { id: string; rotulo: string; texto: string; esperaAResposta: boolean }[];
}

const caminhoDo = (arvore: ArvoreDeLocais, localId: string | null) =>
  localId === null ? null : arvore.caminho(localId);

/** Os ids que as respostas citam, de todos os campos, na ordem do formulário: a TI vê os só dela. */
function citadosPelasRespostas(
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
) {
  const ids = { ativo: new Set<string>(), local: new Set<string>(), pessoa: new Set<string>() };
  for (const campo of formulario.campos) {
    const resposta = respostas[campo.id];
    if (typeof resposta !== 'string') continue;
    if (campo.tipo === 'ativo' || campo.tipo === 'local' || campo.tipo === 'pessoa') {
      ids[campo.tipo].add(resposta);
    }
  }
  return ids;
}

/**
 * O momento em que o relógio parou: o do primeiro `aguardando` ou `resolveu` depois da última volta
 * dele, porque o resolvido que veio do aguardando parou na espera. Com o relógio contando, é nulo.
 */
function momentoEmQueParou(
  relogioDesde: Date | null,
  conversa: readonly { evento: string | null; criadaEm: Date }[],
): Date | null {
  if (relogioDesde !== null) return null;
  let parou: Date | null = null;
  for (const { evento, criadaEm } of conversa) {
    if (evento === null) continue;
    if (VOLTAS_DO_RELOGIO.has(evento)) parou = null;
    else if (PARADAS_DO_RELOGIO.has(evento) && parou === null) parou = criadaEm;
  }
  return parou;
}

/** O nome de agora de cada conta, pela pessoa dela. */
async function nomesDasContas(tx: Transacao, ids: ReadonlySet<string>) {
  if (ids.size === 0) return new Map<string, string>();
  const lidas = await tx
    .select({ id: contas.id, nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(inArray(contas.id, [...ids]));
  return new Map(lidas.map(({ id, nome }) => [id, nome]));
}

/** O nome de agora de cada pessoa; a auditoria dos campos da TI também o usa (`edicao.ts`). */
export async function nomesDasPessoas(tx: Transacao, ids: ReadonlySet<string>) {
  if (ids.size === 0) return new Map<string, string>();
  const lidas = await tx
    .select({ id: pessoas.id, nome: pessoas.nome })
    .from(pessoas)
    .where(inArray(pessoas.id, [...ids]));
  return new Map(lidas.map(({ id, nome }) => [id, nome]));
}

/**
 * Os ativos pelo id, com o rótulo das telas e o local, sem a permissão de ver os ativos, como o ativo
 * ligado; a troca do ativo e a auditoria dos campos da TI também o usam (`edicao.ts`).
 */
export async function ativosPorId(tx: Transacao, ids: ReadonlySet<string>) {
  if (ids.size === 0)
    return new Map<string, AtivoDasRespostas & { id: string; localId: string | null }>();
  const lidos = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      tipo: { nome: tiposDeAtivo.nome },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(inArray(ativos.id, [...ids]));
  return new Map(
    lidos.map((ativo) => [
      ativo.id,
      {
        id: ativo.id,
        rotulo: rotuloDoAtivo({ nome: ativo.nome, modelo: ativo.modelo, tipo: ativo.tipo }),
        patrimonio: ativo.patrimonio,
        localId: ativo.localId,
      },
    ]),
  );
}

/**
 * O tipo do ativo ligado, com o ícone da miniatura e se usa consumíveis, a toda conta que vê o
 * chamado, como o rótulo (change chamados-da-ti, design, "A coluna da direita, a pessoa e o ativo").
 */
async function tipoDoLigado(tx: Transacao, ativoId: string) {
  const [lido] = await tx
    .select({
      nome: tiposDeAtivo.nome,
      icone: tiposDeAtivo.icone,
      usaConsumiveis: sql<boolean>`${CAPACIDADE_DOS_CONSUMIVEIS} = any(${tiposDeAtivo.capacidades})`,
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .where(eq(ativos.id, ativoId));
  if (!lido) throw new Error(`O ativo ${ativoId} do chamado não existe.`);
  return { tipo: { nome: lido.nome, icone: lido.icone }, usaConsumiveis: lido.usaConsumiveis };
}

/** O anexo como a ficha o mostra; o do chamado sempre tem o nome, que o envio dá. */
const anexoNaFicha = (arquivo: {
  id: string;
  nome: string | null;
  tipo: string;
  bytes: number;
}): AnexoNaFicha => ({
  id: arquivo.id,
  nome: arquivo.nome ?? 'arquivo',
  tipo: arquivo.tipo,
  bytes: arquivo.bytes,
});

/** A ficha do chamado pelo número, a quem o vê; o que a conta não vê responde como o que não existe. */
export async function fichaDoChamado(
  tx: Transacao,
  numero: number,
  { acesso, arvore, agora }: { acesso: Acesso; arvore: ArvoreDeLocais; agora: Date },
): Promise<FichaDoChamado> {
  const [lida] = await tx
    .select({
      chamado: chamados,
      tipo: {
        id: tiposDeChamado.id,
        nome: tiposDeChamado.nome,
        icone: tiposDeChamado.icone,
        podeVirarOs: tiposDeChamado.podeVirarOs,
      },
      pessoa: {
        id: pessoas.id,
        nome: pessoas.nome,
        localId: pessoas.localId,
        email: pessoas.email,
        telefone: pessoas.telefone,
        situacao: pessoas.situacao,
      },
    })
    .from(chamados)
    .innerJoin(tiposDeChamado, eq(tiposDeChamado.id, chamados.tipoId))
    .innerJoin(pessoas, eq(pessoas.id, chamados.pessoaId))
    .where(eq(chamados.numero, numero));
  if (!lida || !veOChamado(alcance(acesso, 'chamados.ver', arvore), lida.chamado)) {
    throw chamadoNaoEncontrado();
  }
  const { chamado, tipo, pessoa } = lida;
  const [organizacao] = await tx
    .select({ desligados: organizacoes.modulosDesligados })
    .from(organizacoes)
    .where(eq(organizacoes.id, sql`app.current_org()`));
  // O módulo desligado vale como o que a conta não vê, como nos outros cartões de outro módulo.
  const ligado = (modulo: string) => !organizacao?.desligados.includes(modulo);
  const formulario = formularioDa(chamado);
  const respostas = chamado.respostas;
  const citados = citadosPelasRespostas(formulario, respostas);

  const conversaLida = await tx
    .select({
      id: mensagensDosChamados.id,
      especie: mensagensDosChamados.especie,
      autorConta: mensagensDosChamados.autorConta,
      autorPessoa: mensagensDosChamados.autorPessoa,
      texto: mensagensDosChamados.texto,
      evento: mensagensDosChamados.evento,
      dados: mensagensDosChamados.dados,
      criadaEm: mensagensDosChamados.criadaEm,
    })
    .from(mensagensDosChamados)
    .where(eq(mensagensDosChamados.chamadoId, chamado.id))
    .orderBy(asc(mensagensDosChamados.criadaEm), asc(mensagensDosChamados.id));
  /** O id dos dados do evento: a conta do `de` e do `para`, ou o ativo do `antes` e do `depois`. */
  const doEvento = (
    dados: Record<string, unknown> | null,
    chave: 'de' | 'para' | 'antes' | 'depois',
  ) => {
    const id = dados?.[chave];
    return typeof id === 'string' ? id : null;
  };

  const idsDasContas = new Set<string>();
  if (chamado.responsavelId !== null) idsDasContas.add(chamado.responsavelId);
  const idsDasPessoas = new Set(citados.pessoa);
  const idsDosAtivos = new Set(chamado.ativoId === null ? [] : [chamado.ativoId]);
  for (const id of citados.ativo) idsDosAtivos.add(id);
  for (const linha of conversaLida) {
    if (linha.especie === 'evento' && !eventoLido(linha.evento)) continue;
    if (linha.autorConta !== null) idsDasContas.add(linha.autorConta);
    if (linha.autorPessoa !== null) idsDasPessoas.add(linha.autorPessoa);
    for (const chave of ['de', 'para'] as const) {
      const conta = doEvento(linha.dados, chave);
      if (conta !== null) idsDasContas.add(conta);
    }
    if (linha.evento !== 'ativo') continue;
    for (const chave of ['antes', 'depois'] as const) {
      const ativo = doEvento(linha.dados, chave);
      if (ativo !== null) idsDosAtivos.add(ativo);
    }
  }
  const nomeDaConta = await nomesDasContas(tx, idsDasContas);
  const nomeDaPessoa = await nomesDasPessoas(tx, idsDasPessoas);
  const contaNoEvento = (conta: string | null): ContaNaFicha | null =>
    conta === null ? null : { conta, nome: nomeDaConta.get(conta) ?? '' };
  const autor = (linha: { autorConta: string | null; autorPessoa: string | null }): AutorNaFicha =>
    linha.autorConta !== null
      ? { tipo: 'conta', id: linha.autorConta, nome: nomeDaConta.get(linha.autorConta) ?? '' }
      : {
          tipo: 'pessoa',
          id: linha.autorPessoa ?? '',
          nome: nomeDaPessoa.get(linha.autorPessoa ?? '') ?? '',
        };

  const ativoDe = await ativosPorId(tx, idsDosAtivos);
  /** O ativo do evento; o que não se acha vem sem o rótulo, como a conta sem o nome. */
  const ativoNoEvento = (id: string | null): AtivoNaFicha | null => {
    if (id === null) return null;
    const ativo = ativoDe.get(id);
    return { id, rotulo: ativo?.rotulo ?? '', patrimonio: ativo?.patrimonio ?? null };
  };
  const ligadoAoChamado = chamado.ativoId === null ? undefined : ativoDe.get(chamado.ativoId);

  // Os anexos que ainda existem, de cada mensagem e nota e dos campos, na ordem do envio.
  const anexosLidos = await tx
    .select({
      id: arquivos.id,
      nome: arquivos.nome,
      tipo: arquivos.tipo,
      bytes: arquivos.bytes,
      mensagemId: anexosDosChamados.mensagemId,
    })
    .from(anexosDosChamados)
    .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
    .where(and(eq(anexosDosChamados.chamadoId, chamado.id), isNull(arquivos.removidoEm)))
    .orderBy(asc(arquivos.enviadoEm), asc(arquivos.id));
  const anexosDaMensagem = new Map<string, AnexoNaFicha[]>();
  const anexoDoCampo = new Map<string, AnexoNaFicha>();
  for (const linha of anexosLidos) {
    // A linha com o chamado tem a mensagem ou o campo (anexos_dos_chamados_dono_valido).
    if (linha.mensagemId === null) {
      anexoDoCampo.set(linha.id, anexoNaFicha(linha));
      continue;
    }
    const daMensagem = anexosDaMensagem.get(linha.mensagemId) ?? [];
    daMensagem.push(anexoNaFicha(linha));
    anexosDaMensagem.set(linha.mensagemId, daMensagem);
  }
  // Os dos campos, na ordem do formulário e das respostas, que guardam os ids tomados.
  const anexosDosCampos: FichaDoChamado['anexosDosCampos'] = [];
  for (const campo of formulario.campos) {
    const ids = respostas[campo.id];
    if (campo.tipo !== 'anexo' || !Array.isArray(ids)) continue;
    for (const id of ids) {
      const anexo = anexoDoCampo.get(id);
      if (anexo) anexosDosCampos.push({ campo: campo.id, ...anexo });
    }
  }

  const conversa: { item: ItemDaConversa; momento: Date }[] = [];
  for (const linha of conversaLida) {
    const em = linha.criadaEm.toISOString();
    if (linha.especie === 'evento') {
      if (!eventoLido(linha.evento)) continue;
      conversa.push({
        momento: linha.criadaEm,
        item: {
          especie: 'evento',
          id: linha.id,
          em,
          autor: autor(linha),
          evento: linha.evento,
          de: contaNoEvento(doEvento(linha.dados, 'de')),
          para: contaNoEvento(doEvento(linha.dados, 'para')),
          desde: momentoLido(linha.dados?.desde)?.toISOString() ?? null,
          ativo:
            linha.evento === 'ativo'
              ? {
                  antes: ativoNoEvento(doEvento(linha.dados, 'antes')),
                  depois: ativoNoEvento(doEvento(linha.dados, 'depois')),
                }
              : null,
          os: linha.evento === 'os' ? osDoEvento(linha.dados) : null,
          solicitacao: linha.evento === 'solicitacao' ? solicitacaoDoEvento(linha.dados) : null,
          motivo:
            linha.evento === 'solicitacao-nao-gerada'
              ? motivoDoEventoNaoGerado(linha.dados, pessoa.nome)
              : null,
        },
      });
      continue;
    }
    conversa.push({
      momento: linha.criadaEm,
      item: {
        especie: linha.especie,
        id: linha.id,
        em,
        autor: autor(linha),
        texto: linha.texto ?? '',
        anexos: anexosDaMensagem.get(linha.id) ?? [],
      },
    });
  }
  // Os alertas do ativo ligado abertos entre a abertura e a resolução, ou agora (decisão 9).
  if (
    ligadoAoChamado &&
    ligado('alertas') &&
    podeEm(acesso, 'alertas.ver', ligadoAoChamado.localId, arvore)
  ) {
    const doAtivo = await tx
      .select({
        id: alertas.id,
        texto: alertas.texto,
        severidade: alertas.severidade,
        abertoEm: alertas.abertoEm,
      })
      .from(alertas)
      .where(
        and(
          eq(alertas.ativoId, ligadoAoChamado.id),
          gte(alertas.abertoEm, chamado.abertoEm),
          lte(alertas.abertoEm, chamado.resolvidoEm ?? agora),
        ),
      )
      .orderBy(asc(alertas.abertoEm), asc(alertas.id));
    for (const alerta of doAtivo) {
      if (alerta.abertoEm === null) continue;
      conversa.push({
        momento: alerta.abertoEm,
        item: {
          especie: 'alerta',
          id: alerta.id,
          em: alerta.abertoEm.toISOString(),
          texto: alerta.texto,
          severidade: alerta.severidade,
        },
      });
    }
  }
  // O sort é estável: no mesmo momento, a conversa vem antes do alerta, cada um na própria ordem.
  conversa.sort((a, b) => a.momento.getTime() - b.momento.getTime());

  let responsavel: FichaDoChamado['responsavel'] = null;
  if (chamado.responsavelId !== null && chamado.responsavelDesde !== null) {
    // A conta inativa, ou de pessoa inativa, vem sem alcance (`lerContaQueAtende`).
    const conta = await lerContaQueAtende(tx, chamado.responsavelId, arvore);
    const atende = conta !== null && atendeOChamado(conta.alcance, chamado);
    responsavel = {
      conta: chamado.responsavelId,
      nome: nomeDaConta.get(chamado.responsavelId) ?? '',
      desde: chamado.responsavelDesde.toISOString(),
      naoAtendeMais: !atende,
    };
  }

  let os: FichaDoChamado['os'] = null;
  if (chamado.osId !== null && ligado('operacao')) {
    const [daOrdem] = await tx
      .select({
        id: ordensDeServico.id,
        numero: ordensDeServico.numero,
        situacao: ordensDeServico.situacao,
        localId: ordensDeServico.localId,
        ativoId: ordensDeServico.ativoId,
      })
      .from(ordensDeServico)
      .where(eq(ordensDeServico.id, chamado.osId));
    if (daOrdem && podeEm(acesso, 'ordens.ver', daOrdem.localId, arvore)) {
      const ativo =
        ativoDe.get(daOrdem.ativoId) ??
        (await ativosPorId(tx, new Set([daOrdem.ativoId]))).get(daOrdem.ativoId);
      if (!ativo) throw new Error('O ativo da OS não foi lido.');
      os = {
        id: daOrdem.id,
        numero: daOrdem.numero,
        situacao: daOrdem.situacao,
        ativo: { id: ativo.id, rotulo: ativo.rotulo, patrimonio: ativo.patrimonio },
      };
    }
  }
  let solicitacao: FichaDoChamado['solicitacao'] = null;
  if (chamado.solicitacaoId !== null && ligado('operacao')) {
    const [daSolicitacao] = await tx
      .select({
        id: solicitacoes.id,
        numero: solicitacoes.numero,
        situacao: solicitacoes.situacao,
        locais: solicitacoes.locais,
        semLocal: solicitacoes.semLocal,
      })
      .from(solicitacoes)
      .where(eq(solicitacoes.id, chamado.solicitacaoId));
    if (
      daSolicitacao &&
      veASolicitacao(alcance(acesso, 'solicitacoes.ver', arvore), daSolicitacao)
    ) {
      solicitacao = {
        id: daSolicitacao.id,
        numero: daSolicitacao.numero,
        situacao: daSolicitacao.situacao,
      };
    }
  }

  // As respostas prontas das sem tipos e das do tipo, na ordem da lista delas.
  const prontas = await tx
    .select({
      id: respostasProntas.id,
      rotulo: respostasProntas.rotulo,
      texto: respostasProntas.texto,
      esperaAResposta: respostasProntas.esperaAResposta,
    })
    .from(respostasProntas)
    .where(
      sql`(cardinality(${respostasProntas.tipos}) = 0 or ${tipo.id}::uuid = any(${respostasProntas.tipos}))`,
    )
    .orderBy(asc(respostasProntas.ordem), asc(respostasProntas.rotuloNormalizado));

  const prazo = lerPrazoDoChamado(chamado.prazo);
  const horario = await lerHorarioDaTi(tx);
  const tipoDoAtivo = ligadoAoChamado ? await tipoDoLigado(tx, ligadoAoChamado.id) : null;
  const resumoDoLigado =
    ligadoAoChamado && ligado('ativos')
      ? await resumoDoAtivo(tx, ligadoAoChamado.id, {
          acesso,
          arvore,
          agora,
          fuso: horario.fuso,
          ligado,
        })
      : null;
  const parouEm = momentoEmQueParou(chamado.relogioDesde, conversaLida);
  const anonimizada = pessoa.situacao === 'anonimizada';
  const vePessoa = !anonimizada && podeEm(acesso, 'pessoas.ver', pessoa.localId, arvore);
  const caminhos = new Map([...citados.local].map((id) => [id, arvore.caminho(id)]));
  return {
    numero: chamado.numero,
    titulo: chamado.titulo,
    situacao: chamado.situacao,
    versao: chamado.versao,
    origem: chamado.origem,
    abertoEm: chamado.abertoEm.toISOString(),
    tipo,
    pessoa: {
      id: pessoa.id,
      nome: pessoa.nome,
      local: caminhoDo(arvore, pessoa.localId),
      abrir: vePessoa,
      contatos: vePessoa ? { email: pessoa.email, telefone: pessoa.telefone } : null,
    },
    responsavel,
    ativo: ligadoAoChamado
      ? {
          id: ligadoAoChamado.id,
          rotulo: ligadoAoChamado.rotulo,
          patrimonio: ligadoAoChamado.patrimonio,
          local: caminhoDo(arvore, ligadoAoChamado.localId),
          abrir: ligado('ativos') && podeEm(acesso, 'ativos.ver', ligadoAoChamado.localId, arvore),
          tipo: tipoDoAtivo?.tipo ?? { nome: '', icone: 'generico' },
          usaConsumiveis: tipoDoAtivo?.usaConsumiveis ?? false,
          resumo: resumoDoLigado,
        }
      : null,
    locais: chamado.locais,
    semLocal: chamado.semLocal,
    permite: { atender: atendeOChamado(alcance(acesso, 'chamados.atender', arvore), chamado) },
    relogio: prazo && {
      prazo,
      contadoS: chamado.contadoS,
      relogioDesde: chamado.relogioDesde?.toISOString() ?? null,
      primeiraRespostaEm: chamado.primeiraRespostaEm?.toISOString() ?? null,
    },
    parouEm: parouEm?.toISOString() ?? null,
    horario: { ...horario, dias: [...horario.dias] },
    os,
    solicitacao,
    formulario,
    respostas,
    citados: {
      ativos: [...citados.ativo].flatMap((id) => {
        const ativo = ativoDe.get(id);
        return ativo ? [{ id, rotulo: ativo.rotulo, patrimonio: ativo.patrimonio }] : [];
      }),
      locais: [...caminhos].map(([id, caminho]) => ({ id, caminho })),
      pessoas: [...citados.pessoa].flatMap((id) => {
        const nome = nomeDaPessoa.get(id);
        return nome === undefined ? [] : [{ id, nome }];
      }),
    },
    anexosDosCampos,
    resumo: resumoDasRespostas(formulario, respostas, {
      nomeDoTipo: tipo.nome,
      ativos: ativoDe,
      locais: caminhos,
      pessoas: nomeDaPessoa,
    }),
    conversa: conversa.map(({ item }) => item),
    respostasProntas: prontas.map((pronta) => ({
      ...pronta,
      texto: textoDaRespostaPronta(pronta.texto, pessoa.nome),
    })),
  };
}
