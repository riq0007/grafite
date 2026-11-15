// O alvo da distribuição (spec distribuicao-de-software, "Distribuição às máquinas" e "Assistente da
// distribuição"; change software-por-pacote, design, decisões 9 e 10): as máquinas da conta, que são
// os ativos ativos com o agente ligado nos locais em que ela distribui; a união dos locais, das
// visões, dos ativos escolhidos e da lista colada, sem as tiradas da lista, com a visão e a lista no
// escopo do `ativos.ver`; a classe de cada máquina frente ao pacote e à fila dele, com o sem contato
// pelo prazo da organização, a outra distribuição em que ela já aguarda o pacote e a outra instalação
// em andamento; e as contagens da árvore e das visões.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  modelos,
  pacotesDeSoftware,
  type Transacao,
  tiposDeAtivo,
  visoes,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  type ClasseNoAssistente,
  classeNoAssistente,
  contaDoAssistente,
  itensDaListaColada,
  LIMITE_DA_LISTA_COLADA,
  lerDefinicaoDaVisao,
  MENSAGEM_DA_LISTA_COLADA,
  MENSAGENS_DO_SOFTWARE,
  normalizarTexto,
  paraQuem,
  podeEm,
  semContato,
  situacaoFrenteAoPacote,
  textoDoSemContato,
} from '@grafite/domain';
import { and, asc, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { RecusaDePermissao } from '../acesso/escopo.ts';
import type { SessaoDaRequisicao } from '../acesso/sessoes.ts';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { condicoesDosFiltros, lerContextoDaTabela, rotuloNoBanco } from '../ativos/colunas.ts';
import { doModelo, doTipo } from '../ativos/leitura.ts';
import { dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { versoesDoPacoteNasMaquinas } from './base.ts';
import { naFilaDe, type OutraDistribuicao, ondeJaAguardam } from './ja-aguarda.ts';

/** O que o passo Máquinas escolheu. */
export interface AlvoPedido {
  locais: readonly string[];
  visoes: readonly string[];
  ativoIds: readonly string[];
  /** A lista colada, como veio: um por linha ou separados por vírgula. */
  lista: string;
  /** As máquinas tiradas da lista, que ficam de fora da união. */
  fora: readonly string[];
  /** O fuso dos filtros de data das visões; sem ele, UTC. */
  fuso?: string | undefined;
}

/** Uma máquina da conta: o ativo ativo com o agente ligado, num local em que ela distribui. */
export interface MaquinaDaConta {
  id: string;
  rotulo: string;
  nome: string | null;
  patrimonio: string | null;
  hostname: string | null;
  localId: string | null;
  /** O agente do último contato, quando o ativo tem mais de um. */
  agente: { id: string; nome: string; ultimoContato: Date };
}

/** O alcance da permissão como condição sobre `ativos`: o ativo sem local só pela organização. */
function noAlcance(escopo: 'organizacao' | Set<string> | null): SQL {
  if (escopo === 'organizacao') return sql`true`;
  return escopo && escopo.size > 0 ? inArray(ativos.localId, [...escopo]) : sql`false`;
}

/** Se o local da máquina está no alcance de uma permissão. */
const dentro = (escopo: 'organizacao' | Set<string> | null, localId: string | null) =>
  escopo === 'organizacao' || (escopo !== null && localId !== null && escopo.has(localId));

/** As máquinas da conta, pelo rótulo. */
export async function lerMaquinasDaConta(
  tx: Transacao,
  acesso: Acesso,
  arvore: ArvoreDeLocais,
): Promise<MaquinaDaConta[]> {
  const doDistribuir = alcance(acesso, 'software.distribuir', arvore);
  if (doDistribuir === null) return [];
  const linhas = await tx
    .select({
      id: ativos.id,
      rotulo: sql<string>`${rotuloNoBanco}`,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      hostname: ativos.hostname,
      localId: ativos.localId,
      agente: { id: agentes.id, nome: agentes.nome, ultimoContato: agentes.ultimoContato },
    })
    .from(agentes)
    .innerJoin(ativos, and(eq(ativos.orgId, agentes.orgId), eq(ativos.id, agentes.ativoId)))
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .where(and(eq(ativos.situacao, 'ativo'), noAlcance(doDistribuir)))
    .orderBy(desc(agentes.ultimoContato), desc(agentes.id));
  const porAtivo = new Map<string, MaquinaDaConta>();
  for (const linha of linhas) if (!porAtivo.has(linha.id)) porAtivo.set(linha.id, linha);
  return [...porAtivo.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** As visões da tabela do Ativos que a conta usa: as da organização e as dela, pelo nome. */
async function visoesDaConta(tx: Transacao, contaId: string, ids?: readonly string[]) {
  return tx
    .select({
      id: visoes.id,
      nome: visoes.nome,
      contaId: visoes.contaId,
      definicao: visoes.definicao,
    })
    .from(visoes)
    .where(
      and(
        eq(visoes.tabela, 'ativos'),
        or(isNull(visoes.contaId), eq(visoes.contaId, contaId)),
        ids ? inArray(visoes.id, [...ids]) : undefined,
      ),
    )
    .orderBy(asc(visoes.nomeNormalizado), asc(visoes.id));
}

/** Os ativos que os filtros da visão acham, no escopo do `ativos.ver`. */
async function achadosPelaVisao(
  tx: Transacao,
  definicao: Record<string, unknown>,
  doVer: SQL,
  contexto: Awaited<ReturnType<typeof lerContextoDaTabela>>,
): Promise<Set<string>> {
  const lida = lerDefinicaoDaVisao(definicao);
  if (!lida.ok) throw new Error('A definição guardada da visão não é válida.');
  const linhas = await tx
    .select({ id: ativos.id })
    .from(ativos)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo)
    .where(
      and(
        eq(ativos.situacao, 'ativo'),
        doVer,
        ...condicoesDosFiltros(lida.definicao.filtros, contexto),
      ),
    );
  return new Set(linhas.map(({ id }) => id));
}

/** As chaves pelas quais a lista colada acha a máquina: o nome, o patrimônio e o hostname. */
const chavesDaMaquina = (maquina: MaquinaDaConta) =>
  [maquina.nome, maquina.patrimonio, maquina.hostname, maquina.agente.nome]
    .filter((valor): valor is string => !!valor)
    .map(normalizarTexto);

/**
 * A união das escolhas, sem as tiradas da lista, pelo rótulo. O local e o ativo mandados pelo id,
 * fora dos locais em que a conta distribui, dão 403; a visão de outra conta, 404. As máquinas que a
 * visão e a lista acham fora desses locais, ou fora do escopo do `ativos.ver`, ficam de fora, e as
 * da lista vão para os não achados.
 */
export async function resolverAlvo(
  tx: Transacao,
  {
    sessao,
    arvore,
    alvo,
  }: { sessao: SessaoDaRequisicao; arvore: ArvoreDeLocais; alvo: AlvoPedido },
): Promise<{ maquinas: MaquinaDaConta[]; naoAchados: string[] }> {
  const { acesso } = sessao;
  const itens = itensDaListaColada(alvo.lista);
  if (itens.length > LIMITE_DA_LISTA_COLADA) {
    throw dadosInvalidos({ lista: MENSAGEM_DA_LISTA_COLADA });
  }
  for (const localId of alvo.locais) {
    if (!arvore.local(localId)) {
      throw dadosInvalidos({ locais: 'Escolha só locais desta organização.' });
    }
    if (!podeEm(acesso, 'software.distribuir', localId, arvore)) {
      throw new RecusaDePermissao('software.distribuir');
    }
  }
  const daConta = await lerMaquinasDaConta(tx, acesso, arvore);
  const porId = new Map(daConta.map((maquina) => [maquina.id, maquina]));
  const escolhidas = new Set<string>();

  for (const localId of alvo.locais) {
    const ramo = arvore.ramo(localId);
    for (const maquina of daConta) {
      if (maquina.localId && ramo.has(maquina.localId)) escolhidas.add(maquina.id);
    }
  }

  const ativoIds = [...new Set(alvo.ativoIds)];
  if (ativoIds.length > 0) {
    const pedidos = await tx
      .select({
        id: ativos.id,
        localId: ativos.localId,
        situacao: ativos.situacao,
        patrimonio: ativos.patrimonio,
        rotulo: sql<string>`${rotuloNoBanco}`,
      })
      .from(ativos)
      .innerJoin(tiposDeAtivo, doTipo)
      .leftJoin(modelos, doModelo)
      .where(inArray(ativos.id, ativoIds));
    for (const ativoId of ativoIds) {
      const ativo = pedidos.find((linha) => linha.id === ativoId);
      if (ativo?.situacao !== 'ativo') {
        throw dadosInvalidos({ ativoIds: 'Escolha só ativos ativos.' });
      }
      if (!podeEm(acesso, 'software.distribuir', ativo.localId, arvore)) {
        throw new RecusaDePermissao('software.distribuir');
      }
      if (!porId.has(ativoId)) {
        throw dadosInvalidos({
          ativoIds: MENSAGENS_DO_SOFTWARE.semAgente(ativo.patrimonio ?? ativo.rotulo),
        });
      }
      escolhidas.add(ativoId);
    }
  }

  const doVer = alcance(acesso, 'ativos.ver', arvore);
  const visoesPedidas = [...new Set(alvo.visoes)];
  if (visoesPedidas.length > 0) {
    if (doVer === null) throw new RecusaDePermissao('ativos.ver');
    const linhas = await visoesDaConta(tx, sessao.contaId, visoesPedidas);
    if (linhas.length !== visoesPedidas.length) throw naoEncontrado('Visão não encontrada.');
    const contexto = await lerContextoDaTabela(tx, sessao, arvore, alvo.fuso ?? 'UTC');
    for (const visao of linhas) {
      for (const id of await achadosPelaVisao(tx, visao.definicao, noAlcance(doVer), contexto)) {
        if (porId.has(id)) escolhidas.add(id);
      }
    }
  }

  const naoAchados: string[] = [];
  if (itens.length > 0) {
    const porChave = new Map<string, string[]>();
    for (const maquina of daConta) {
      if (!dentro(doVer, maquina.localId)) continue;
      for (const chave of new Set(chavesDaMaquina(maquina))) {
        porChave.set(chave, [...(porChave.get(chave) ?? []), maquina.id]);
      }
    }
    for (const item of itens) {
      const achadas = porChave.get(normalizarTexto(item));
      if (!achadas) naoAchados.push(item);
      for (const id of achadas ?? []) escolhidas.add(id);
    }
  }

  for (const id of alvo.fora) escolhidas.delete(id);
  return { maquinas: daConta.filter(({ id }) => escolhidas.has(id)), naoAchados };
}

/** A máquina na prévia, com a classe frente ao pacote. */
export interface MaquinaNoAlvo {
  id: string;
  rotulo: string;
  patrimonio: string | null;
  hostname: string | null;
  local: string | null;
  localId: string | null;
  agenteId: string;
  classe: ClasseNoAssistente;
  /** A versão mais alta do programa na máquina. */
  versao: string | null;
  semContato: { dias: number; texto: string } | null;
  /** A outra instalação que o agente faz agora na máquina. */
  emAndamento: { pacote: string } | null;
  /** Na que já aguarda, a outra distribuição em que ela aguarda ou instala o pacote. */
  outra: OutraDistribuicao | null;
}

/** O caminho do local, da raiz até ele, para o "Para quem". */
const caminhoDe = (arvore: ArvoreDeLocais, localId: string | null) =>
  localId
    ? [...arvore.ancestrais(localId), localId].map((id) => ({
        id,
        nome: arvore.local(id)?.nome ?? '',
      }))
    : [];

/**
 * A classe de cada máquina frente ao pacote, na ordem pulada, já aguarda, na fila e vai instalar;
 * a conta do "Até agora" e do "Conferir"; o "Para quem" das que entram na distribuição; e o de
 * todas as escolhidas, o do assistente.
 */
export async function classificarOAlvo(
  tx: Transacao,
  {
    arvore,
    pacote,
    maquinas,
    momento,
  }: {
    arvore: ArvoreDeLocais;
    pacote: { id: string; versao: string | null };
    maquinas: readonly MaquinaDaConta[];
    momento: Date;
  },
) {
  const ids = maquinas.map(({ id }) => id);
  const { diasSemContato } = await lerCadastroDosAgentes(tx);
  const versoes = await versoesDoPacoteNasMaquinas(tx, pacote.id, ids);
  const emAndamento = new Map<string, string>();
  if (ids.length > 0) {
    const linhas = await tx
      .select({ ativoId: maquinasDasDistribuicoes.ativoId, pacote: pacotesDeSoftware.nome })
      .from(maquinasDasDistribuicoes)
      .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
      .innerJoin(pacotesDeSoftware, eq(pacotesDeSoftware.id, distribuicoes.pacoteId))
      .where(
        and(
          inArray(maquinasDasDistribuicoes.ativoId, ids),
          eq(maquinasDasDistribuicoes.situacao, 'em-andamento'),
        ),
      )
      .orderBy(desc(distribuicoes.criadaEm));
    for (const { ativoId, pacote: nome } of linhas) {
      if (!emAndamento.has(ativoId)) emAndamento.set(ativoId, nome);
    }
  }
  // A que aguarda ou instala o mesmo pacote noutra distribuição é pulada com esse motivo (decisão 10).
  const jaAguardam = await ondeJaAguardam(tx, { ativoIds: ids, pacoteIds: [pacote.id] });
  const lidas = maquinas.map((maquina) => {
    const frente = situacaoFrenteAoPacote(versoes.get(maquina.id) ?? [], pacote.versao);
    const contato = semContato(maquina.agente.ultimoContato, momento, diasSemContato);
    const outra = jaAguardam.get(naFilaDe(maquina.id, pacote.id)) ?? null;
    return { maquina, frente, contato, outra };
  });
  const conta = contaDoAssistente(
    lidas.map(({ frente, contato, outra }) => ({
      situacao: frente.situacao,
      versao: frente.versao,
      semContato: contato.semContato,
      jaAguarda: outra !== null,
    })),
    pacote.versao,
  );
  const noAlvo: MaquinaNoAlvo[] = lidas.map(({ maquina, frente, contato, outra }, posicao) => {
    const instalando = emAndamento.get(maquina.id);
    const classe =
      conta.classes[posicao] ??
      classeNoAssistente({
        situacao: frente.situacao,
        semContato: contato.semContato,
        jaAguarda: outra !== null,
      });
    return {
      id: maquina.id,
      rotulo: maquina.rotulo,
      patrimonio: maquina.patrimonio,
      hostname: maquina.hostname,
      local: maquina.localId ? arvore.caminho(maquina.localId) : null,
      localId: maquina.localId,
      agenteId: maquina.agente.id,
      classe,
      versao: frente.versao,
      semContato: contato.semContato
        ? { dias: contato.dias, texto: textoDoSemContato(contato.dias) }
        : null,
      emAndamento: instalando ? { pacote: instalando } : null,
      outra: classe === 'ja-aguarda' ? outra : null,
    };
  });
  const entram = noAlvo.filter(({ classe }) => classe === 'vai-instalar' || classe === 'na-fila');
  const deQuem = (doAlvo: readonly MaquinaNoAlvo[]) =>
    paraQuem(
      doAlvo.map((maquina) => ({
        nome: maquina.rotulo,
        locais: caminhoDe(arvore, maquina.localId),
      })),
    );
  return {
    maquinas: noAlvo,
    conta: {
      vaoInstalar: conta.vaoInstalar,
      puladas: conta.puladas,
      jaAguardam: conta.jaAguardam,
      naFila: conta.naFila,
      primeiraVez: conta.primeiraVez,
      porVersao: conta.porVersao,
    },
    /** O "Para quem" da distribuição, só das que entram nela. */
    paraQuem: deQuem(entram),
    /** De onde vêm todas as escolhidas, com as puladas: o do assistente (m03 e m05). */
    paraQuemDasEscolhidas: deQuem(noAlvo),
  };
}

/**
 * Os alvos do passo Máquinas: os locais ativos em que a conta distribui, na ordem da árvore, com as
 * máquinas do ramo e quantas estão sem contato; e as visões da organização e da conta, com as
 * máquinas que os filtros delas acham.
 */
export async function alvosDaConta(
  tx: Transacao,
  {
    sessao,
    arvore,
    momento,
    fuso,
  }: {
    sessao: SessaoDaRequisicao;
    arvore: ArvoreDeLocais;
    momento: Date;
    fuso?: string | undefined;
  },
) {
  const { acesso } = sessao;
  const doDistribuir = alcance(acesso, 'software.distribuir', arvore);
  const daConta = await lerMaquinasDaConta(tx, acesso, arvore);
  const { diasSemContato } = await lerCadastroDosAgentes(tx);
  const contagens = new Map<string, { maquinas: number; semContato: number }>();
  for (const maquina of daConta) {
    if (!maquina.localId) continue;
    const longe = semContato(maquina.agente.ultimoContato, momento, diasSemContato).semContato;
    for (const id of [...arvore.ancestrais(maquina.localId), maquina.localId]) {
      const contagem = contagens.get(id) ?? { maquinas: 0, semContato: 0 };
      contagem.maquinas++;
      if (longe) contagem.semContato++;
      contagens.set(id, contagem);
    }
  }
  const locais: {
    id: string;
    nome: string;
    paiId: string | null;
    maquinas: number;
    semContato: number;
  }[] = [];
  const percorrer = (paiId: string | null) => {
    for (const local of arvore.filhos(paiId)) {
      if (local.situacao === 'ativo' && dentro(doDistribuir, local.id)) {
        locais.push({
          id: local.id,
          nome: local.nome,
          paiId: local.paiId,
          ...(contagens.get(local.id) ?? { maquinas: 0, semContato: 0 }),
        });
      }
      percorrer(local.id);
    }
  };
  percorrer(null);

  const doVer = alcance(acesso, 'ativos.ver', arvore);
  const daVisao: { id: string; nome: string; compartilhada: boolean; maquinas: number }[] = [];
  if (doVer !== null) {
    const ids = new Set(daConta.map(({ id }) => id));
    const contexto = await lerContextoDaTabela(tx, sessao, arvore, fuso ?? 'UTC');
    for (const visao of await visoesDaConta(tx, sessao.contaId)) {
      const achados = await achadosPelaVisao(tx, visao.definicao, noAlcance(doVer), contexto);
      daVisao.push({
        id: visao.id,
        nome: visao.nome,
        compartilhada: visao.contaId === null,
        maquinas: [...achados].filter((id) => ids.has(id)).length,
      });
    }
    daVisao.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  return { locais, visoes: daVisao };
}
