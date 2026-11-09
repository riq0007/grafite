// O comparador de backups do Control iD (spec comparacao-e-restauracao-do-control-id, "Comparador
// de backups"; change p5b-comparacao-e-restauracao, design, decisão 6): os dois lados, cada um um
// backup do histórico ou um arquivo enviado, o ZIP do Grafite ou do PMG ou o CSV do controle. O
// arquivo enviado fica só na memória, por 30 minutos, com as pessoas e os cartões dele.
import { randomUUID } from 'node:crypto';
import type { Transacao } from '@grafite/db';
import {
  compararTabelas,
  type ItemDoControle,
  lerCsvDoControlId,
  MENSAGENS_DAS_OPERACOES,
  ROTULOS_DAS_CATEGORIAS,
} from '@grafite/domain';
import { entradasDoZip } from '@grafite/operacao';
import type { Armazenamento } from '../arquivos/armazenamento.ts';
import { dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { chaveParaLer, type LeitorDosBackups, lerBackup } from './backups.ts';

/** As tabelas que o comparador cruza. */
const TABELAS = ['users', 'cards'] as const;

type Tabelas = Record<(typeof TABELAS)[number], ItemDoControle[]>;

interface Guardado {
  orgId: string;
  nome: string;
  tabelas: Tabelas;
  vence: number;
}

/** Os arquivos enviados, na memória da API, pelo id. */
const GUARDADOS = new Map<string, Guardado>();

/** Quanto tempo o arquivo enviado fica guardado. */
const VALIDADE = 30 * 60_000;

const soAsTabelas = (lidas: Record<string, unknown>): Tabelas => ({
  users: Array.isArray(lidas.users) ? (lidas.users as ItemDoControle[]) : [],
  cards: Array.isArray(lidas.cards) ? (lidas.cards as ItemDoControle[]) : [],
});

/** As pessoas e os cartões de um ZIP: os JSON da raiz, um por tabela. */
async function tabelasDoZip(conteudo: Buffer): Promise<Tabelas> {
  const lidas = await entradasDoZip(
    conteudo,
    (nome) => nome === 'users.json' || nome === 'cards.json',
  );
  const tabelas: Record<string, unknown> = {};
  for (const [nome, bytes] of lidas) {
    try {
      tabelas[nome.replace(/\.json$/, '')] = JSON.parse(bytes.toString('utf8'));
    } catch {
      // O JSON que não se lê fica de fora, sem parar a comparação.
    }
  }
  return soAsTabelas(tabelas);
}

/** Guarda o arquivo enviado, depois de ler as pessoas e os cartões dele. */
export async function guardarArquivo({
  orgId,
  nome,
  tipo,
  conteudo,
  agora,
}: {
  orgId: string;
  nome: string;
  tipo: string;
  conteudo: Buffer;
  agora: Date;
}) {
  for (const [id, guardado] of GUARDADOS) {
    if (guardado.vence <= agora.getTime()) GUARDADOS.delete(id);
  }
  let tabelas: Tabelas;
  try {
    // O ZIP pela assinatura PK; o CSV do controle pelo bloco cid_data.
    const ehZip = conteudo.length > 2 && conteudo[0] === 0x50 && conteudo[1] === 0x4b;
    if (ehZip) {
      tabelas = await tabelasDoZip(conteudo);
    } else if (
      tipo === 'text/csv' ||
      nome.toLowerCase().endsWith('.csv') ||
      conteudo.toString('utf8', 0, 4096).includes('cid_data')
    ) {
      tabelas = soAsTabelas(lerCsvDoControlId(conteudo.toString('utf8')));
    } else {
      throw dadosInvalidos({ arquivo: MENSAGENS_DAS_OPERACOES.formato });
    }
  } catch (erro) {
    if ((erro as { status?: number }).status === 400) throw erro;
    throw dadosInvalidos({ arquivo: MENSAGENS_DAS_OPERACOES.formato });
  }
  const id = randomUUID();
  GUARDADOS.set(id, { orgId, nome, tabelas, vence: agora.getTime() + VALIDADE });
  return { id, nome, pessoas: tabelas.users.length, cartoes: tabelas.cards.length };
}

export type LadoDoComparador = { backup: string } | { arquivo: string };

/** O nome e as tabelas de um lado: o backup que a conta vê, ou o arquivo guardado. */
async function lerLado(
  lado: LadoDoComparador,
  {
    tx,
    leitor,
    armazenamento,
    orgId,
    agora,
  }: {
    tx: Transacao;
    leitor: LeitorDosBackups;
    armazenamento: Armazenamento;
    orgId: string;
    agora: Date;
  },
): Promise<{ nome: string; tabelas: Tabelas }> {
  if ('arquivo' in lado) {
    const guardado = GUARDADOS.get(lado.arquivo);
    if (!guardado || guardado.orgId !== orgId || guardado.vence <= agora.getTime()) {
      throw naoEncontrado(MENSAGENS_DAS_OPERACOES.arquivoVencido);
    }
    return { nome: guardado.nome, tabelas: guardado.tabelas };
  }
  const backup = await lerBackup(tx, leitor, lado.backup);
  const chave = await chaveParaLer(tx, leitor, lado.backup);
  const conteudo = await armazenamento.abrir(chave);
  if (!conteudo) throw naoEncontrado('Este backup não tem arquivo.');
  const quando = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(backup.pedidoEm));
  return {
    nome: `${backup.controle.patrimonio ?? backup.controle.rotulo} · ${quando}`,
    tabelas: await tabelasDoZip(conteudo),
  };
}

/** Compara os dois lados, nas pessoas e nos cartões. */
export async function compararLados(
  a: LadoDoComparador,
  b: LadoDoComparador,
  contexto: {
    tx: Transacao;
    leitor: LeitorDosBackups;
    armazenamento: Armazenamento;
    orgId: string;
    agora: Date;
  },
) {
  const ladoA = await lerLado(a, contexto);
  const ladoB = await lerLado(b, contexto);
  return {
    a: ladoA.nome,
    b: ladoB.nome,
    tabelas: TABELAS.map((tabela) => ({
      ...compararTabelas(tabela, ladoA.tabelas[tabela], ladoB.tabelas[tabela]),
      rotulo: tabela === 'users' ? 'Pessoas' : ROTULOS_DAS_CATEGORIAS.cards,
    })),
  };
}
