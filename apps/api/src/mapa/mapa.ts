// O mapa da planta na API (spec mapa-da-planta; change p7-mapa-da-planta, design, decisões 1 a 4):
// a planta nasce do envio do DXF, convertido na própria requisição, ou do modelo do PMG; o modelo
// fica no armazenamento, e a planta guarda as medidas e as contagens. Os marcadores vêm dos
// fornecedores registrados, um por tipo de alvo, e os ativos são o primeiro. A posição é uma por
// planta e alvo. As mudanças gravam a auditoria e o evento `mapa.mudou`.
import {
  alertas,
  ativos,
  estadoDosAtivos,
  modelos,
  plantas,
  posicoesNaPlanta,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  contagensDoModelo,
  converterDxf,
  lerModeloDoPmg,
  MENSAGEM_DO_FORMATO_DA_PLANTA,
  type ModeloDaPlanta,
  normalizarTexto,
  type Permissao,
  pode,
  podeEm,
  situacaoNoMapa,
  type TomNoMapa,
} from '@grafite/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sessaoDa } from '../acesso/escopo.ts';
import { type Armazenamento, chaveDoModeloDaPlanta } from '../arquivos/armazenamento.ts';
import { lerArvore } from '../arvore.ts';
import { rotuloNoBanco } from '../ativos/colunas.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { fornecedorDosPaineis } from '../paineis/paineis.ts';
import { dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { fornecedorDasSalas } from '../salas/salas.ts';

/** Quem lê o mapa: o acesso da conta e a árvore dos locais. */
export interface LeitorDoMapa {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

export interface MarcadorNaTela {
  alvo: { tipo: string; id: string };
  camada: string;
  rotulo: string;
  detalhe: string | null;
  x: number;
  z: number;
  situacao: { texto: string; tom: TomNoMapa };
  acoes: { rotulo: string; destino: string }[];
}

/**
 * Um fornecedor de marcadores (design, decisão 4): o tipo de alvo, a camada e como montar os
 * marcadores das posições, só com o que a conta vê. Um módulo novo, como as salas, acrescenta o
 * dele em `FORNECEDORES_DO_MAPA`, sem mudar o mapa.
 */
export interface FornecedorDoMapa {
  alvoTipo: string;
  camada: string;
  /** A permissão que mostra a camada; sem ela, a camada é de quem vê o mapa. */
  permissao?: Permissao;
  marcadores(
    tx: Transacao,
    posicoes: readonly { alvoId: string; x: number; z: number }[],
    leitor: LeitorDoMapa,
  ): Promise<MarcadorNaTela[]>;
  /** Se a conta vê o alvo, para posicioná-lo. */
  ve(tx: Transacao, alvoId: string, leitor: LeitorDoMapa): Promise<boolean>;
}

const doTipo = and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId));
const doModelo = and(eq(modelos.orgId, ativos.orgId), eq(modelos.id, ativos.modeloId));

/**
 * Os ativos no mapa, com a pior situação de cada um, e o acesso remoto da máquina para quem pode no
 * local dela (change acesso-remoto-vnc, design, decisão 4).
 */
export const fornecedorDosAtivos: FornecedorDoMapa = {
  alvoTipo: 'ativo',
  camada: 'Ativos',
  async marcadores(tx, posicoes, { acesso, arvore }) {
    if (posicoes.length === 0) return [];
    const ids = posicoes.map((posicao) => posicao.alvoId);
    const linhas = await tx
      .select({
        id: ativos.id,
        rotulo: sql<string>`${rotuloNoBanco}`,
        patrimonio: ativos.patrimonio,
        localId: ativos.localId,
        situacao: ativos.situacao,
        capacidades: tiposDeAtivo.capacidades,
      })
      .from(ativos)
      .innerJoin(tiposDeAtivo, doTipo)
      .leftJoin(modelos, doModelo)
      .where(inArray(ativos.id, ids));
    const vistos = new Map(
      linhas
        .filter(
          (linha) =>
            linha.situacao === 'ativo' && podeEm(acesso, 'ativos.ver', linha.localId, arvore),
        )
        .map((linha) => [linha.id, linha]),
    );
    if (vistos.size === 0) return [];
    const disponibilidade = new Map(
      (
        await tx
          .select({ ativoId: estadoDosAtivos.ativoId, valor: estadoDosAtivos.valorTexto })
          .from(estadoDosAtivos)
          .where(
            and(
              inArray(estadoDosAtivos.ativoId, [...vistos.keys()]),
              eq(estadoDosAtivos.metrica, 'rede.disponibilidade'),
            ),
          )
      ).map(({ ativoId, valor }) => [ativoId, valor]),
    );
    const abertos = await tx
      .select({ ativoId: alertas.ativoId, severidade: alertas.severidade })
      .from(alertas)
      .where(and(inArray(alertas.ativoId, [...vistos.keys()]), eq(alertas.situacao, 'aberto')));
    const severidades = new Map<string, string[]>();
    for (const { ativoId, severidade } of abertos) {
      if (!ativoId) continue;
      severidades.set(ativoId, [...(severidades.get(ativoId) ?? []), severidade]);
    }
    return posicoes.flatMap((posicao) => {
      const ativo = vistos.get(posicao.alvoId);
      if (!ativo) return [];
      const estado = disponibilidade.get(ativo.id);
      return [
        {
          alvo: { tipo: 'ativo', id: ativo.id },
          camada: 'Ativos',
          rotulo: ativo.rotulo,
          detalhe: ativo.patrimonio,
          x: posicao.x,
          z: posicao.z,
          situacao: situacaoNoMapa({
            alertas: severidades.get(ativo.id) ?? [],
            disponibilidade: estado === 'online' || estado === 'offline' ? estado : null,
          }),
          acoes: [
            { rotulo: 'Abrir ficha', destino: `/ativos/${ativo.id}` },
            ...(ativo.capacidades.includes('acesso.vnc') &&
            podeEm(acesso, 'ativos.acesso-remoto', ativo.localId, arvore)
              ? [{ rotulo: 'Acesso remoto', destino: `/ativos/${ativo.id}/remoto` }]
              : []),
          ],
        },
      ];
    });
  },
  async ve(tx, alvoId, { acesso, arvore }) {
    const [linha] = await tx
      .select({ localId: ativos.localId, situacao: ativos.situacao })
      .from(ativos)
      .where(eq(ativos.id, alvoId));
    return (
      !!linha && linha.situacao === 'ativo' && podeEm(acesso, 'ativos.ver', linha.localId, arvore)
    );
  },
};

/** Os fornecedores dos marcadores, na ordem das camadas. */
export const FORNECEDORES_DO_MAPA: FornecedorDoMapa[] = [
  fornecedorDosAtivos,
  fornecedorDasSalas,
  fornecedorDosPaineis,
];

const fornecedorDo = (alvoTipo: string) =>
  FORNECEDORES_DO_MAPA.find((fornecedor) => fornecedor.alvoTipo === alvoTipo);

/** O modelo pelo conteúdo do arquivo: o JSON do PMG ou do próprio Grafite, ou o DXF. */
export function modeloDoArquivo(conteudo: Buffer): ModeloDaPlanta {
  const inicio = conteudo.toString('utf8', 0, 64).trimStart();
  if (inicio.startsWith('{')) {
    let dados: unknown;
    try {
      dados = JSON.parse(conteudo.toString('utf8'));
    } catch {
      throw dadosInvalidos({ arquivo: MENSAGEM_DO_FORMATO_DA_PLANTA });
    }
    const proprio = dados as Partial<ModeloDaPlanta>;
    if (Array.isArray(proprio.camadas) && typeof proprio.largura === 'number') {
      return proprio as ModeloDaPlanta;
    }
    try {
      return lerModeloDoPmg(dados);
    } catch {
      throw dadosInvalidos({ arquivo: MENSAGEM_DO_FORMATO_DA_PLANTA });
    }
  }
  try {
    return converterDxf(conteudo.toString('utf8'));
  } catch {
    throw dadosInvalidos({ arquivo: MENSAGEM_DO_FORMATO_DA_PLANTA });
  }
}

const dePlanta = {
  id: plantas.id,
  nome: plantas.nome,
  localId: plantas.localId,
  largura: plantas.largura,
  profundidade: plantas.profundidade,
  situacao: plantas.situacao,
  erro: plantas.erro,
  fonte: plantas.fonte,
  contagens: plantas.contagens,
  criadaEm: plantas.criadaEm,
};

type LinhaDaPlanta = { [C in keyof typeof dePlanta]: unknown } & {
  id: string;
  nome: string;
  localId: string | null;
  largura: number | null;
  profundidade: number | null;
  situacao: 'convertendo' | 'ativa' | 'falhou' | 'inativa';
  erro: string | null;
  fonte: string;
  contagens: Record<string, number> | null;
  criadaEm: Date;
};

function plantaLida(linha: LinhaDaPlanta, arvore: ArvoreDeLocais) {
  const caminho = linha.localId ? arvore.caminho(linha.localId) : null;
  return {
    id: linha.id,
    nome: linha.nome,
    local: linha.localId && caminho ? { id: linha.localId, caminho } : null,
    largura: linha.largura,
    profundidade: linha.profundidade,
    situacao: linha.situacao,
    erro: linha.erro,
    fonte: linha.fonte,
    contagens: linha.contagens
      ? {
          segmentos: linha.contagens.segmentos ?? 0,
          rotulos: linha.contagens.rotulos ?? 0,
          camadas: linha.contagens.camadas ?? 0,
          maquinas: linha.contagens.maquinas ?? 0,
        }
      : null,
    criadaEm: linha.criadaEm.toISOString(),
  };
}

/** As plantas: as ativas, para quem vê, e todas, para quem edita. */
export async function lerPlantas(tx: Transacao, { acesso, arvore }: LeitorDoMapa) {
  const podeEditar = pode(acesso, 'mapa.editar');
  const linhas = await tx.select(dePlanta).from(plantas).orderBy(asc(plantas.nomeNormalizado));
  return {
    plantas: linhas
      .filter((linha) => podeEditar || linha.situacao === 'ativa')
      .map((linha) => plantaLida(linha as LinhaDaPlanta, arvore)),
    podeEditar,
  };
}

/** Cadastra a planta pelo arquivo: o modelo vai ao armazenamento, e a planta, ativa. */
export async function cadastrarPlanta(
  tx: Transacao,
  {
    nome,
    fonte,
    conteudo,
    armazenamento,
    orgId,
    requisicao,
    momento,
  }: {
    nome: string;
    fonte: string;
    conteudo: Buffer;
    armazenamento: Armazenamento;
    orgId: string;
    requisicao: FastifyRequest;
    momento: Date;
  },
) {
  const { contaId } = sessaoDa(requisicao);
  const limpo = nome.trim();
  if (!limpo) throw dadosInvalidos({ nome: 'Dê um nome à planta.' });
  const modelo = modeloDoArquivo(conteudo);
  const contagens = contagensDoModelo(modelo);
  const [criada] = await tx
    .insert(plantas)
    .values({
      orgId: sql`app.current_org()`,
      nome: limpo,
      nomeNormalizado: normalizarTexto(limpo),
      largura: modelo.largura,
      profundidade: modelo.profundidade,
      contagens,
      situacao: 'ativa',
      fonte: fonte.slice(0, 200) || 'arquivo',
      criadaPor: contaId,
      criadaEm: momento,
      atualizadaEm: momento,
    })
    .returning({ id: plantas.id });
  if (!criada) throw new Error('A planta não foi cadastrada.');
  const chave = chaveDoModeloDaPlanta(orgId, criada.id);
  await armazenamento.gravar(chave, Buffer.from(JSON.stringify(modelo)));
  await tx.update(plantas).set({ modelo: chave }).where(eq(plantas.id, criada.id));
  await registrarNaAuditoria(tx, {
    acao: 'planta.cadastrada',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'planta', id: criada.id },
    depois: {
      nome: limpo,
      fonte,
      ...contagens,
      largura: modelo.largura,
      profundidade: modelo.profundidade,
    },
    origem: origemDa(requisicao),
    momento,
  });
  const arvore = await lerArvore(tx);
  const [linha] = await tx.select(dePlanta).from(plantas).where(eq(plantas.id, criada.id));
  return plantaLida(linha as LinhaDaPlanta, arvore);
}

/** Renomeia, liga a um local ou inativa a planta. */
export async function alterarPlanta(
  tx: Transacao,
  id: string,
  pedido: { nome?: string; local?: string | null; situacao?: 'ativa' | 'inativa' },
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
) {
  const { contaId } = sessaoDa(requisicao);
  const [antes] = await tx.select(dePlanta).from(plantas).where(eq(plantas.id, id));
  if (!antes) throw naoEncontrado('Planta não encontrada.');
  const mudanca: Partial<typeof plantas.$inferInsert> = { atualizadaEm: momento };
  if (pedido.nome !== undefined) {
    const limpo = pedido.nome.trim();
    if (!limpo) throw dadosInvalidos({ nome: 'Dê um nome à planta.' });
    mudanca.nome = limpo;
    mudanca.nomeNormalizado = normalizarTexto(limpo);
  }
  if (pedido.local !== undefined) mudanca.localId = pedido.local;
  if (pedido.situacao !== undefined && antes.situacao !== 'falhou')
    mudanca.situacao = pedido.situacao;
  await tx.update(plantas).set(mudanca).where(eq(plantas.id, id));
  await registrarNaAuditoria(tx, {
    acao: 'planta.alterada',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'planta', id },
    antes: { nome: antes.nome, situacao: antes.situacao },
    depois: {
      ...(mudanca.nome ? { nome: mudanca.nome } : {}),
      ...(mudanca.situacao ? { situacao: mudanca.situacao } : {}),
    },
    origem: origemDa(requisicao),
    momento,
  });
  const [linha] = await tx.select(dePlanta).from(plantas).where(eq(plantas.id, id));
  return plantaLida(linha as LinhaDaPlanta, await lerArvore(tx));
}

/**
 * Exclui a planta (spec mapa-da-planta, "Exclusão da planta"): as posições saem com ela, pela chave
 * estrangeira, o que estava posicionado continua, e a auditoria guarda o nome, as medidas e quantas
 * posições foram apagadas. Devolve a chave do modelo, que a rota apaga do armazenamento depois do
 * commit.
 */
export async function excluirPlanta(
  tx: Transacao,
  id: string,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
) {
  const { contaId } = sessaoDa(requisicao);
  const [antes] = await tx
    .select({
      nome: plantas.nome,
      largura: plantas.largura,
      profundidade: plantas.profundidade,
      modelo: plantas.modelo,
    })
    .from(plantas)
    .where(eq(plantas.id, id));
  if (!antes) throw naoEncontrado('Planta não encontrada.');
  const [contagem] = await tx
    .select({ posicoes: sql<number>`count(*)::int` })
    .from(posicoesNaPlanta)
    .where(eq(posicoesNaPlanta.plantaId, id));
  await tx.delete(plantas).where(eq(plantas.id, id));
  await registrarNaAuditoria(tx, {
    acao: 'planta.excluida',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'planta', id },
    antes: {
      nome: antes.nome,
      largura: antes.largura,
      profundidade: antes.profundidade,
      posicoes: contagem?.posicoes ?? 0,
    },
    origem: origemDa(requisicao),
    momento,
  });
  return { modelo: antes.modelo };
}

/** A planta ativa que a conta vê, ou o 404. */
export async function plantaAtiva(tx: Transacao, id: string, leitor: LeitorDoMapa) {
  const [linha] = await tx
    .select({ id: plantas.id, situacao: plantas.situacao, modelo: plantas.modelo })
    .from(plantas)
    .where(eq(plantas.id, id));
  if (!linha || (linha.situacao !== 'ativa' && !pode(leitor.acesso, 'mapa.editar'))) {
    throw naoEncontrado('Planta não encontrada.');
  }
  return linha;
}

/** Os marcadores da planta, pelos fornecedores, só com o que a conta vê. */
export async function marcadoresDaPlanta(tx: Transacao, id: string, leitor: LeitorDoMapa) {
  await plantaAtiva(tx, id, leitor);
  const posicoes = await tx
    .select({
      alvoTipo: posicoesNaPlanta.alvoTipo,
      alvoId: posicoesNaPlanta.alvoId,
      x: posicoesNaPlanta.x,
      z: posicoesNaPlanta.z,
    })
    .from(posicoesNaPlanta)
    .where(eq(posicoesNaPlanta.plantaId, id));
  const marcadores: MarcadorNaTela[] = [];
  for (const fornecedor of FORNECEDORES_DO_MAPA) {
    const dele = posicoes.filter((posicao) => posicao.alvoTipo === fornecedor.alvoTipo);
    marcadores.push(...(await fornecedor.marcadores(tx, dele, leitor)));
  }
  const visiveis = FORNECEDORES_DO_MAPA.filter(
    (fornecedor) => !fornecedor.permissao || pode(leitor.acesso, fornecedor.permissao),
  );
  return {
    marcadores,
    camadas: visiveis.map((fornecedor) => fornecedor.camada),
    posicionaveis: visiveis.map(({ alvoTipo, camada }) => ({ tipo: alvoTipo, camada })),
    podeEditar: pode(leitor.acesso, 'mapa.editar'),
  };
}

/** Salva a posição do alvo na planta, nova ou movida. */
export async function salvarPosicao(
  tx: Transacao,
  plantaId: string,
  pedido: { alvo: { tipo: string; id: string }; x: number; z: number },
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
) {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const leitor = { acesso, arvore };
  await plantaAtiva(tx, plantaId, leitor);
  const fornecedor = fornecedorDo(pedido.alvo.tipo);
  if (!fornecedor || !(await fornecedor.ve(tx, pedido.alvo.id, leitor))) {
    throw dadosInvalidos({ alvo: 'Escolha o que posicionar.' });
  }
  if (!Number.isFinite(pedido.x) || !Number.isFinite(pedido.z)) {
    throw dadosInvalidos({ x: 'Escolha o ponto no mapa.' });
  }
  await tx
    .insert(posicoesNaPlanta)
    .values({
      orgId: sql`app.current_org()`,
      plantaId,
      alvoTipo: pedido.alvo.tipo,
      alvoId: pedido.alvo.id,
      x: pedido.x,
      z: pedido.z,
      mudadaPor: contaId,
      mudadaEm: momento,
    })
    .onConflictDoUpdate({
      target: [
        posicoesNaPlanta.orgId,
        posicoesNaPlanta.plantaId,
        posicoesNaPlanta.alvoTipo,
        posicoesNaPlanta.alvoId,
      ],
      set: { x: pedido.x, z: pedido.z, mudadaPor: contaId, mudadaEm: momento },
    });
  await registrarNaAuditoria(tx, {
    acao: 'posicao-no-mapa.salva',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: pedido.alvo.tipo, id: pedido.alvo.id },
    depois: { planta: plantaId, x: pedido.x, z: pedido.z },
    origem: origemDa(requisicao),
    momento,
  });
}

/** Tira o alvo do mapa: só a posição sai. */
export async function tirarPosicao(
  tx: Transacao,
  plantaId: string,
  alvo: { tipo: string; id: string },
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
) {
  const { contaId } = sessaoDa(requisicao);
  const tiradas = await tx
    .delete(posicoesNaPlanta)
    .where(
      and(
        eq(posicoesNaPlanta.plantaId, plantaId),
        eq(posicoesNaPlanta.alvoTipo, alvo.tipo),
        eq(posicoesNaPlanta.alvoId, alvo.id),
      ),
    )
    .returning({ id: posicoesNaPlanta.id });
  if (tiradas.length === 0) throw naoEncontrado('Posição não encontrada.');
  await registrarNaAuditoria(tx, {
    acao: 'posicao-no-mapa.tirada',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: alvo.tipo, id: alvo.id },
    antes: { planta: plantaId },
    origem: origemDa(requisicao),
    momento,
  });
}
