// O lado do coletor e o conteúdo do backup do Control iD (spec backup-do-control-id e
// coletor-local, "Pedidos ao coletor"; change p5a-backup-do-control-id, design, decisões 3, 6, 7 e
// 8): a entrega dos backups na fila ao coletor que alcança o controle, o ZIP recebido, com o
// resultado lido do `metadata.json`, a retenção na mesma transação e o conteúdo do ZIP guardado,
// pelas abas da tela, sem falar com o controle.
import { ativos, backupsDoControlId, operacoesDoControlId, type Transacao } from '@grafite/db';
import {
  backupsQueSaem,
  CATEGORIA_DAS_FOTOS,
  MENSAGENS_DO_BACKUP,
  normalizarTexto,
  resultadoDoBackup,
} from '@grafite/domain';
import { entradasDoZip } from '@grafite/operacao';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Armazenamento } from '../arquivos/armazenamento.ts';
import { chaveDoBackupDoControlId } from '../arquivos/armazenamento.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { AlvoDaColeta } from '../coleta/alvos.ts';
import { conflito, naoEncontrado } from '../problemas.ts';
import { concluirComFalha, controlesComBackup, publicoDoBackup } from './backups.ts';
import type { ABAS_DO_CONTEUDO } from './esquemas.ts';
import { concluirOperacao, concluirOperacaoComFalha } from './operacoes.ts';

/** Quantos backups o coletor leva de uma vez. */
const POR_BUSCA = 2;

/** Os backups na fila, dos mais antigos para os mais novos. */
export async function backupsNaFila(tx: Transacao) {
  return tx
    .select({ id: backupsDoControlId.id, ativoId: backupsDoControlId.ativoId })
    .from(backupsDoControlId)
    .where(eq(backupsDoControlId.situacao, 'na-fila'))
    .orderBy(asc(backupsDoControlId.pedidoEm))
    .limit(50);
}

/**
 * Entrega ao coletor até 2 backups na fila dos controles que são dele, marcados em andamento. O que
 * é dele mas não tem um login que o cofre abre vira Falha.
 */
export async function entregarBackups(
  tx: Transacao,
  {
    coletor,
    candidatos,
    alvos,
    logins,
    momento,
  }: {
    coletor: { id: string; nome: string };
    candidatos: readonly { id: string; ativoId: string }[];
    /** Os alvos do Control iD destes controles que são do coletor. */
    alvos: readonly AlvoDaColeta[];
    /** O login aberto de cada controle, pelo id do ativo. */
    logins: ReadonlyMap<string, { porta: number; usuario: string; senha: string }>;
    momento: Date;
  },
) {
  const doColetor = new Map(alvos.map((alvo) => [alvo.ativoId, alvo]));
  const controles = new Map(
    (
      await controlesComBackup(tx, {
        ativoIds: [...new Set(candidatos.map((candidato) => candidato.ativoId))],
      })
    ).map((controle) => [controle.id, controle]),
  );
  const entregues: {
    id: string;
    tipo: 'backup';
    ativoId: string;
    rotulo: string;
    ip: string;
    porta: number;
    usuario: string;
    senha: string;
  }[] = [];
  for (const candidato of candidatos) {
    if (entregues.length >= POR_BUSCA) break;
    const alvo = doColetor.get(candidato.ativoId);
    if (!alvo) continue;
    const controle = controles.get(candidato.ativoId);
    const login = logins.get(candidato.ativoId);
    if (!login || !controle) {
      await concluirComFalha(tx, {
        id: candidato.id,
        localId: controle?.localId ?? null,
        erro: MENSAGENS_DO_BACKUP.semLogin,
        momento,
      });
      continue;
    }
    const marcados = await tx
      .update(backupsDoControlId)
      .set({ situacao: 'em-andamento', iniciadoEm: momento, coletorId: coletor.id })
      .where(
        and(eq(backupsDoControlId.id, candidato.id), eq(backupsDoControlId.situacao, 'na-fila')),
      )
      .returning({ id: backupsDoControlId.id });
    if (marcados.length === 0) continue;
    entregues.push({
      id: candidato.id,
      tipo: 'backup',
      ativoId: candidato.ativoId,
      rotulo: controle.rotulo,
      ip: alvo.ip,
      ...login,
    });
  }
  return entregues;
}

/** O backup em andamento com este coletor, travado para a resposta, ou a recusa. */
async function emAndamentoCom(tx: Transacao, id: string, coletorId: string) {
  const [backup] = await tx
    .select({
      id: backupsDoControlId.id,
      ativoId: backupsDoControlId.ativoId,
      situacao: backupsDoControlId.situacao,
      coletorId: backupsDoControlId.coletorId,
      localId: ativos.localId,
    })
    .from(backupsDoControlId)
    .innerJoin(
      ativos,
      and(eq(ativos.orgId, backupsDoControlId.orgId), eq(ativos.id, backupsDoControlId.ativoId)),
    )
    .where(eq(backupsDoControlId.id, id))
    .for('update', { of: backupsDoControlId });
  if (!backup) throw naoEncontrado('Pedido não encontrado.');
  if (backup.situacao !== 'em-andamento' || backup.coletorId !== coletorId) {
    throw conflito('Este pedido não está em andamento com este coletor.');
  }
  return backup;
}

/** O coletor diz que o backup falhou, com a mensagem. */
export async function receberFalha(
  tx: Transacao,
  {
    id,
    coletor,
    mensagem,
    momento,
  }: {
    id: string;
    coletor: { id: string; nome: string };
    mensagem: string;
    momento: Date;
  },
) {
  // O pedido pode ser uma operação no controle (change p5b-comparacao-e-restauracao).
  const daOperacao = await receberFalhaDaOperacao(tx, { id, coletor, mensagem, momento });
  if (daOperacao) return daOperacao;
  const backup = await emAndamentoCom(tx, id, coletor.id);
  await concluirComFalha(tx, {
    id,
    localId: backup.localId,
    erro: mensagem.trim().slice(0, 2000) || MENSAGENS_DO_BACKUP.danificado,
    momento,
    ator: { tipo: 'sistema', descricao: `Coletor ${coletor.nome}` },
  });
  return { situacao: 'falha' as const };
}

/** O `metadata.json` do ZIP, no formato do PMG. */
const Metadados = z.object({
  system_info: z
    .object({
      serial: z.string().nullish(),
      firmware: z.string().nullish(),
      product_name: z.string().nullish(),
    })
    .partial()
    .nullish(),
  categories: z.array(
    z.object({
      category: z.string(),
      status: z.string(),
      count: z.number().int().min(0),
      error: z.string().nullish(),
    }),
  ),
});

const curto = (texto: string | null | undefined, limite: number) => {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo.slice(0, limite);
};

/**
 * O ZIP do backup que o coletor terminou: o resultado vem do `metadata.json`; o arquivo é guardado
 * no armazenamento quando o backup é Sucesso ou Parcial; e a retenção sai na mesma transação. Volta
 * a situação e as chaves dos ZIP que a retenção tirou, para apagar depois do commit.
 */
export async function receberArquivo(
  tx: Transacao,
  {
    id,
    coletor,
    conteudo,
    armazenamento,
    orgId,
    momento,
  }: {
    id: string;
    coletor: { id: string; nome: string };
    conteudo: Buffer;
    armazenamento: Armazenamento;
    orgId: string;
    momento: Date;
  },
) {
  const backup = await emAndamentoCom(tx, id, coletor.id);
  const ator = { tipo: 'sistema' as const, descricao: `Coletor ${coletor.nome}` };
  let metadados: z.infer<typeof Metadados>;
  try {
    const lidos = await entradasDoZip(conteudo, (nome) => nome === 'metadata.json');
    metadados = Metadados.parse(JSON.parse(lidos.get('metadata.json')?.toString('utf8') ?? ''));
  } catch {
    await concluirComFalha(tx, {
      id,
      localId: backup.localId,
      erro: MENSAGENS_DO_BACKUP.danificado,
      momento,
      ator,
    });
    return { situacao: 'falha' as const, apagar: [] as string[] };
  }
  const categorias = metadados.categories.map((categoria) => ({
    categoria: categoria.category,
    situacao: categoria.status.toUpperCase() === 'OK' ? ('ok' as const) : ('erro' as const),
    quantidade: categoria.count,
    ...(categoria.error ? { erro: categoria.error.slice(0, 500) } : {}),
  }));
  const resultado = resultadoDoBackup(categorias);
  if (resultado.situacao === 'falha') {
    await concluirComFalha(tx, {
      id,
      localId: backup.localId,
      erro: resultado.erro ?? MENSAGENS_DO_BACKUP.danificado,
      momento,
      ator,
    });
    return { situacao: 'falha' as const, apagar: [] as string[] };
  }

  const chave = chaveDoBackupDoControlId(orgId, id);
  await armazenamento.gravar(chave, conteudo);
  const sistema = metadados.system_info ?? {};
  await tx
    .update(backupsDoControlId)
    .set({
      situacao: resultado.situacao,
      concluidoEm: momento,
      arquivo: chave,
      tamanho: conteudo.length,
      registros: resultado.registros,
      fotos: resultado.fotos,
      serie: curto(sistema.serial, 100),
      firmware: curto(sistema.firmware, 100),
      modelo: curto(sistema.product_name, 100),
      categorias,
      erro: resultado.erro,
    })
    .where(eq(backupsDoControlId.id, id));
  await registrarNaAuditoria(tx, {
    acao: 'backup-do-control-id.concluido',
    ator,
    alvo: { tipo: 'backup-do-control-id', id },
    depois: {
      situacao: resultado.situacao,
      registros: resultado.registros,
      fotos: resultado.fotos,
      ...(resultado.erro ? { erro: resultado.erro } : {}),
    },
    momento,
    saida: { publico: publicoDoBackup(backup.localId) },
  });

  // A retenção (design, decisão 6), com os do mesmo controle.
  const doControle = await tx
    .select({
      id: backupsDoControlId.id,
      situacao: backupsDoControlId.situacao,
      pedidoEm: backupsDoControlId.pedidoEm,
      concluidoEm: backupsDoControlId.concluidoEm,
    })
    .from(backupsDoControlId)
    .where(eq(backupsDoControlId.ativoId, backup.ativoId));
  const saem = backupsQueSaem(doControle, momento);
  let apagar: string[] = [];
  if (saem.length > 0) {
    const tirados = await tx
      .delete(backupsDoControlId)
      .where(inArray(backupsDoControlId.id, saem))
      .returning({ arquivo: backupsDoControlId.arquivo });
    apagar = tirados.flatMap((tirado) => (tirado.arquivo ? [tirado.arquivo] : []));
    await registrarNaAuditoria(tx, {
      acao: 'backups-do-control-id.retidos',
      ator: { tipo: 'sistema', descricao: 'Backup do Control iD' },
      alvo: { tipo: 'ativo', id: backup.ativoId },
      dados: { quantidade: tirados.length },
      momento,
      saida: { publico: publicoDoBackup(backup.localId) },
    });
  }
  return { situacao: resultado.situacao, apagar };
}

// O conteúdo na tela (design, decisão 8).

type Linha = Record<string, unknown>;

const lista = (valor: unknown): Linha[] =>
  Array.isArray(valor)
    ? valor.filter((item): item is Linha => item !== null && typeof item === 'object')
    : [];

const texto = (valor: unknown) => (valor === null || valor === undefined ? '' : String(valor));

const DIAS = [
  ['sun', 'Dom'],
  ['mon', 'Seg'],
  ['tue', 'Ter'],
  ['wed', 'Qua'],
  ['thu', 'Qui'],
  ['fri', 'Sex'],
  ['sat', 'Sáb'],
] as const;

/** Os segundos desde a meia-noite como "08:00". */
const hora = (segundos: unknown) => {
  const total = Number(segundos);
  if (!Number.isFinite(total)) return '';
  const minutos = Math.floor(total / 60);
  return `${String(Math.floor(minutos / 60) % 24).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
};

/** O momento Unix do controle como data em pt-BR, ou vazio. */
const data = (segundos: unknown) => {
  const total = Number(segundos);
  if (!Number.isFinite(total) || total <= 0) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(total * 1000),
  );
};

/** As tabelas do ZIP que o conteúdo usa, pelo nome sem o `.json`. */
async function tabelasDoZip(conteudo: Buffer) {
  const lidas = await entradasDoZip(
    conteudo,
    (nome) => nome.endsWith('.json') && !nome.includes('/'),
  );
  const tabelas = new Map<string, Linha[]>();
  for (const [nome, bytes] of lidas) {
    try {
      tabelas.set(nome.replace(/\.json$/, ''), lista(JSON.parse(bytes.toString('utf8'))));
    } catch {
      // A tabela que não se lê fica vazia, sem parar as outras.
    }
  }
  const fotos = new Set(
    [
      ...(
        await entradasDoZip(conteudo, (nome) => /^face_images\/user_\d+\.jpg$/.test(nome))
      ).keys(),
    ].map((nome) => nome.replace(/^face_images\/user_(\d+)\.jpg$/, '$1')),
  );
  return { tabela: (nome: string) => tabelas.get(nome) ?? [], fotos };
}

type LinhaDoConteudo = {
  id: string;
  titulo: string;
  detalhes: { rotulo: string; valor: string }[];
  foto: boolean;
};

const ROTULOS_DAS_ABAS = {
  pessoas: 'Pessoas',
  grupos: 'Grupos',
  regras: 'Regras de acesso',
  horarios: 'Horários',
} as const;

/** As linhas de cada aba, montadas das tabelas do controle; nunca a senha nem o sal. */
function abasDoBackup({ tabela, fotos }: Awaited<ReturnType<typeof tabelasDoZip>>) {
  const nomeDoGrupo = new Map(tabela('groups').map((g) => [texto(g.id), texto(g.name)]));
  const gruposDoUsuario = new Map<string, string[]>();
  for (const ligacao of tabela('user_groups')) {
    const usuario = texto(ligacao.user_id);
    const nome = nomeDoGrupo.get(texto(ligacao.group_id));
    if (!nome) continue;
    gruposDoUsuario.set(usuario, [...(gruposDoUsuario.get(usuario) ?? []), nome]);
  }
  const cartoesDoUsuario = new Map<string, string[]>();
  for (const cartao of tabela('cards')) {
    const usuario = texto(cartao.user_id);
    cartoesDoUsuario.set(usuario, [...(cartoesDoUsuario.get(usuario) ?? []), texto(cartao.value)]);
  }
  const biometria = new Map<string, number>();
  for (const digital of tabela('templates')) {
    const usuario = texto(digital.user_id);
    biometria.set(usuario, (biometria.get(usuario) ?? 0) + 1);
  }
  const pessoas: LinhaDoConteudo[] = tabela('users').map((usuario) => {
    const id = texto(usuario.id);
    const detalhes = [
      { rotulo: 'Matrícula', valor: texto(usuario.registration) },
      { rotulo: 'Cartões', valor: (cartoesDoUsuario.get(id) ?? []).join(', ') },
      { rotulo: 'Grupos', valor: (gruposDoUsuario.get(id) ?? []).join(', ') },
      { rotulo: 'Digitais', valor: String(biometria.get(id) ?? 0) },
      { rotulo: 'Válido de', valor: data(usuario.begin_time) },
      { rotulo: 'Válido até', valor: data(usuario.end_time) },
    ].filter((detalhe) => detalhe.valor !== '');
    return { id, titulo: texto(usuario.name) || `Usuário ${id}`, detalhes, foto: fotos.has(id) };
  });

  const pessoasNoGrupo = new Map<string, number>();
  for (const ligacao of tabela('user_groups')) {
    const grupo = texto(ligacao.group_id);
    pessoasNoGrupo.set(grupo, (pessoasNoGrupo.get(grupo) ?? 0) + 1);
  }
  const nomeDaRegra = new Map(tabela('access_rules').map((r) => [texto(r.id), texto(r.name)]));
  const regrasDoGrupo = new Map<string, string[]>();
  const gruposDaRegra = new Map<string, string[]>();
  for (const ligacao of tabela('group_access_rules')) {
    const grupo = texto(ligacao.group_id);
    const regra = texto(ligacao.access_rule_id);
    regrasDoGrupo.set(grupo, [
      ...(regrasDoGrupo.get(grupo) ?? []),
      nomeDaRegra.get(regra) ?? regra,
    ]);
    gruposDaRegra.set(regra, [
      ...(gruposDaRegra.get(regra) ?? []),
      nomeDoGrupo.get(grupo) ?? grupo,
    ]);
  }
  const grupos: LinhaDoConteudo[] = tabela('groups').map((grupo) => {
    const id = texto(grupo.id);
    return {
      id,
      titulo: texto(grupo.name) || `Grupo ${id}`,
      detalhes: [
        { rotulo: 'Pessoas', valor: String(pessoasNoGrupo.get(id) ?? 0) },
        { rotulo: 'Regras de acesso', valor: (regrasDoGrupo.get(id) ?? []).join(', ') },
      ].filter((detalhe) => detalhe.valor !== ''),
      foto: false,
    };
  });

  const nomeDoHorario = new Map(tabela('time_zones').map((h) => [texto(h.id), texto(h.name)]));
  const horariosDaRegra = new Map<string, string[]>();
  for (const ligacao of tabela('access_rule_time_zones')) {
    const regra = texto(ligacao.access_rule_id);
    const horario = texto(ligacao.time_zone_id);
    horariosDaRegra.set(regra, [
      ...(horariosDaRegra.get(regra) ?? []),
      nomeDoHorario.get(horario) ?? horario,
    ]);
  }
  const regras: LinhaDoConteudo[] = tabela('access_rules').map((regra) => {
    const id = texto(regra.id);
    return {
      id,
      titulo: texto(regra.name) || `Regra ${id}`,
      detalhes: [
        { rotulo: 'Tipo', valor: Number(regra.type) === 0 ? 'Bloqueio' : 'Liberação' },
        { rotulo: 'Prioridade', valor: texto(regra.priority) },
        { rotulo: 'Grupos', valor: (gruposDaRegra.get(id) ?? []).join(', ') },
        { rotulo: 'Horários', valor: (horariosDaRegra.get(id) ?? []).join(', ') },
      ].filter((detalhe) => detalhe.valor !== ''),
      foto: false,
    };
  });

  const intervalosDoHorario = new Map<string, string[]>();
  for (const intervalo of tabela('time_spans')) {
    const horario = texto(intervalo.time_zone_id);
    const dias = DIAS.filter(([chave]) => Number(intervalo[chave]) === 1).map(
      ([, rotulo]) => rotulo,
    );
    const descricao = `${dias.join(', ') || 'Nenhum dia'} · ${hora(intervalo.start)} às ${hora(intervalo.end)}`;
    intervalosDoHorario.set(horario, [...(intervalosDoHorario.get(horario) ?? []), descricao]);
  }
  const horarios: LinhaDoConteudo[] = tabela('time_zones').map((horario) => {
    const id = texto(horario.id);
    return {
      id,
      titulo: texto(horario.name) || `Horário ${id}`,
      detalhes: (intervalosDoHorario.get(id) ?? []).map((valor) => ({
        rotulo: 'Intervalo',
        valor,
      })),
      foto: false,
    };
  });
  return { pessoas, grupos, regras, horarios };
}

/** Quantas linhas cada página do conteúdo tem. */
const POR_PAGINA_DO_CONTEUDO = 100;

/** O conteúdo do ZIP pela aba, com a busca sem acento e a página pelo deslocamento. */
export async function conteudoDoBackup(
  conteudo: Buffer,
  {
    aba,
    busca,
    cursor = 0,
  }: { aba: (typeof ABAS_DO_CONTEUDO)[number]; busca?: string; cursor?: number },
) {
  const abas = abasDoBackup(await tabelasDoZip(conteudo));
  const procurado = normalizarTexto(busca ?? '');
  const achadas = abas[aba].filter(
    (linha) =>
      procurado === '' ||
      normalizarTexto(
        [linha.titulo, ...linha.detalhes.map((detalhe) => detalhe.valor)].join(' '),
      ).includes(procurado),
  );
  const linhas = achadas.slice(cursor, cursor + POR_PAGINA_DO_CONTEUDO);
  const fim = cursor + linhas.length;
  return {
    abas: (Object.keys(ROTULOS_DAS_ABAS) as (keyof typeof ROTULOS_DAS_ABAS)[]).map((chave) => ({
      aba: chave,
      rotulo: ROTULOS_DAS_ABAS[chave],
      total: abas[chave].length,
    })),
    aba,
    total: achadas.length,
    linhas,
    proximo: fim < achadas.length ? fim : null,
  };
}

/** A foto JPEG do usuário no ZIP, ou `null`. */
export async function fotoDoBackup(conteudo: Buffer, usuario: number): Promise<Buffer | null> {
  const nome = `face_images/user_${usuario}.jpg`;
  const lidas = await entradasDoZip(conteudo, (entrada) => entrada === nome);
  return lidas.get(nome) ?? null;
}

export { CATEGORIA_DAS_FOTOS };

// As operações no controle (change p5b-comparacao-e-restauracao, design, decisão 2): entregues ao
// coletor depois dos backups, com o ZIP do backup baixado por ele e o resultado por categoria.

/** As operações na fila, das mais antigas para as mais novas. */
export async function operacoesNaFila(tx: Transacao) {
  return tx
    .select({
      id: operacoesDoControlId.id,
      ativoId: operacoesDoControlId.ativoId,
      backupId: operacoesDoControlId.backupId,
      tipo: operacoesDoControlId.tipo,
      categorias: operacoesDoControlId.categorias,
    })
    .from(operacoesDoControlId)
    .where(eq(operacoesDoControlId.situacao, 'na-fila'))
    .orderBy(asc(operacoesDoControlId.pedidoEm))
    .limit(50);
}

/** Entrega ao coletor as operações dos controles que são dele, até o limite, em andamento. */
export async function entregarOperacoes(
  tx: Transacao,
  {
    coletor,
    candidatos,
    alvos,
    logins,
    momento,
    limite,
  }: {
    coletor: { id: string; nome: string };
    candidatos: Awaited<ReturnType<typeof operacoesNaFila>>;
    alvos: readonly AlvoDaColeta[];
    logins: ReadonlyMap<string, { porta: number; usuario: string; senha: string }>;
    momento: Date;
    limite: number;
  },
) {
  const doColetor = new Map(alvos.map((alvo) => [alvo.ativoId, alvo]));
  const controles = new Map(
    (
      await controlesComBackup(tx, {
        ativoIds: [...new Set(candidatos.map((candidato) => candidato.ativoId))],
      })
    ).map((controle) => [controle.id, controle]),
  );
  const entregues = [];
  for (const candidato of candidatos) {
    if (entregues.length >= limite) break;
    const alvo = doColetor.get(candidato.ativoId);
    if (!alvo) continue;
    const controle = controles.get(candidato.ativoId);
    const login = logins.get(candidato.ativoId);
    if (!login || !controle) {
      await concluirOperacaoComFalha(tx, {
        id: candidato.id,
        localId: controle?.localId ?? null,
        erro: MENSAGENS_DO_BACKUP.semLogin,
        momento,
      });
      continue;
    }
    const marcadas = await tx
      .update(operacoesDoControlId)
      .set({ situacao: 'em-andamento', iniciadoEm: momento, coletorId: coletor.id })
      .where(
        and(
          eq(operacoesDoControlId.id, candidato.id),
          eq(operacoesDoControlId.situacao, 'na-fila'),
        ),
      )
      .returning({ id: operacoesDoControlId.id });
    if (marcadas.length === 0) continue;
    entregues.push({
      id: candidato.id,
      tipo: candidato.tipo,
      backupId: candidato.backupId,
      categorias: candidato.categorias,
      ativoId: candidato.ativoId,
      rotulo: controle.rotulo,
      ip: alvo.ip,
      ...login,
    });
  }
  return entregues;
}

/** A operação em andamento com este coletor, travada, ou `null` quando não é uma operação. */
async function operacaoEmAndamentoCom(tx: Transacao, id: string, coletorId: string) {
  const [operacao] = await tx
    .select({
      id: operacoesDoControlId.id,
      backupId: operacoesDoControlId.backupId,
      situacao: operacoesDoControlId.situacao,
      coletorId: operacoesDoControlId.coletorId,
      localId: ativos.localId,
    })
    .from(operacoesDoControlId)
    .innerJoin(
      ativos,
      and(
        eq(ativos.orgId, operacoesDoControlId.orgId),
        eq(ativos.id, operacoesDoControlId.ativoId),
      ),
    )
    .where(eq(operacoesDoControlId.id, id))
    .for('update', { of: operacoesDoControlId });
  if (!operacao) return null;
  if (operacao.situacao !== 'em-andamento' || operacao.coletorId !== coletorId) {
    throw conflito('Este pedido não está em andamento com este coletor.');
  }
  return operacao;
}

/** A chave do ZIP do backup de uma operação em andamento com o coletor. */
export async function chaveDoZipDaOperacao(tx: Transacao, id: string, coletorId: string) {
  const operacao = await operacaoEmAndamentoCom(tx, id, coletorId);
  if (!operacao) throw naoEncontrado('Pedido não encontrado.');
  const [backup] = await tx
    .select({ arquivo: backupsDoControlId.arquivo })
    .from(backupsDoControlId)
    .where(eq(backupsDoControlId.id, operacao.backupId));
  if (!backup?.arquivo) throw naoEncontrado(MENSAGENS_DO_BACKUP.semArquivo);
  return backup.arquivo;
}

/** O resultado de uma operação que o coletor terminou, pelas categorias. */
export async function receberResultado(
  tx: Transacao,
  {
    id,
    coletor,
    categorias,
    momento,
  }: {
    id: string;
    coletor: { id: string; nome: string };
    categorias: { categoria: string; situacao: 'ok' | 'erro' | 'pulado' }[];
    momento: Date;
  },
) {
  const operacao = await operacaoEmAndamentoCom(tx, id, coletor.id);
  if (!operacao) throw naoEncontrado('Pedido não encontrado.');
  return concluirOperacao(tx, {
    id,
    localId: operacao.localId,
    categorias,
    momento,
    ator: { tipo: 'sistema', descricao: `Coletor ${coletor.nome}` },
  });
}

/** A falha de uma operação, quando o pedido não é um backup. */
export async function receberFalhaDaOperacao(
  tx: Transacao,
  {
    id,
    coletor,
    mensagem,
    momento,
  }: { id: string; coletor: { id: string; nome: string }; mensagem: string; momento: Date },
) {
  const operacao = await operacaoEmAndamentoCom(tx, id, coletor.id);
  if (!operacao) return null;
  await concluirOperacaoComFalha(tx, {
    id,
    localId: operacao.localId,
    erro: mensagem.trim().slice(0, 2000) || MENSAGENS_DO_BACKUP.danificado,
    momento,
    ator: { tipo: 'sistema', descricao: `Coletor ${coletor.nome}` },
  });
  return { situacao: 'falha' as const };
}
