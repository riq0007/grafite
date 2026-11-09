// O registro e a alteração das solicitações (spec solicitacoes, "Solicitação", "Itens do toner",
// "Contador congelado na solicitação" e "Alteração da solicitação"; change p4d-solicitacoes, design,
// decisões 2, 3 e 6), numa transação: os campos pelo domínio, as referências e os inativos, os
// locais em que a conta atende, o contador de cada impressora que entra, a sugestão do consumível de
// cada item, o número da organização, e a solicitação, a auditoria e o evento para quem vê as
// solicitações dos locais dela.
import {
  ativos,
  impressorasDasSolicitacoes,
  itensDasSolicitacoes,
  locais,
  modelos,
  numeracaoDasSolicitacoes,
  ordensDeServico,
  pessoas,
  solicitacoes,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  alcance,
  type DadosDaSolicitacao,
  limparSolicitacao,
  locaisDaSolicitacao,
  MENSAGEM_DA_PESSOA_INATIVA,
  MENSAGEM_DO_ATIVO_INATIVO,
  MENSAGEM_DO_CONSUMIVEL_FORA_DA_COR,
  MENSAGEM_DO_LOCAL_INATIVO,
  MENSAGEM_DO_TIPO_INATIVO,
  mensagemDaImpressoraComEntrega,
  mensagemDaRecusa,
  mensagemDoAtivoSemConsumiveis,
  podeEm,
  resumoDoPedido,
  rotuloDoAtivo,
  SITUACOES_EM_ABERTO,
  situacaoPendente,
  sugestaoDoConsumivel,
  validarSolicitacao,
  veASolicitacao,
} from '@grafite/domain';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { lerContador } from '../coleta/contador.ts';
import {
  CAPACIDADE_DOS_CONSUMIVEIS,
  type ConsumivelCompativel,
  compativeisDoModelo,
} from '../consumiveis/compativeis.ts';
import { conflito, dadosInvalidos, naoEncontrado } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import type { Solicitacao } from './esquemas.ts';
import { type LeitorDasSolicitacoes, lerSolicitacao } from './leitura.ts';

type SolicitacaoLida = z.infer<typeof Solicitacao>;

/** Um ativo conferido: o que a conta vê, ativo, com o tipo, o modelo e o local. */
interface AtivoConferido {
  id: string;
  rotulo: string;
  patrimonio: string | null;
  localId: string | null;
  modeloId: string | null;
  usaConsumiveis: boolean;
}

/** O nome do ativo nas recusas: o patrimônio, ou o rótulo sem ele. */
const identificacao = (ativo: { rotulo: string; patrimonio: string | null }) =>
  ativo.patrimonio ?? ativo.rotulo;

function conferido<T>(valor: T | null): T {
  if (valor === null) throw new Error('A solicitação não foi conferida.');
  return valor;
}

/**
 * O ativo: o que a conta não vê é como o que não existe, e o inativo é recusado. A linha fica
 * travada para leitura até o fim da transação, como no lançamento do estoque.
 */
export async function conferirAtivo(
  tx: Transacao,
  ativoId: string,
  { acesso, arvore }: LeitorDasSolicitacoes,
): Promise<{ ativo: AtivoConferido } | { recusa: 'nao-encontrado' | 'inativo' }> {
  const [linha] = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      modeloId: ativos.modeloId,
      situacao: ativos.situacao,
      tipo: { nome: tiposDeAtivo.nome, capacidades: tiposDeAtivo.capacidades },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(eq(ativos.id, ativoId))
    .for('share', { of: ativos });
  if (!linha || !podeEm(acesso, 'ativos.ver', linha.localId, arvore)) {
    return { recusa: 'nao-encontrado' };
  }
  if (linha.situacao !== 'ativo') return { recusa: 'inativo' };
  return {
    ativo: {
      id: linha.id,
      rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
      patrimonio: linha.patrimonio,
      localId: linha.localId,
      modeloId: linha.modeloId,
      usaConsumiveis: linha.tipo.capacidades.includes(CAPACIDADE_DOS_CONSUMIVEIS),
    },
  };
}

/** As referências conferidas de cada tipo. */
interface Referencias {
  impressoras: AtivoConferido[];
  ativo: AtivoConferido | null;
}

/**
 * Quem pediu, as impressoras ou o ativo, o tipo de ativo e o local: os que não existem são
 * recusados juntos (400), e depois os inativos e a impressora que não usa consumíveis (409).
 */
async function conferirReferencias(
  tx: Transacao,
  dados: DadosDaSolicitacao,
  leitor: LeitorDasSolicitacoes,
): Promise<Referencias> {
  const naoEncontrados: Record<string, string> = {};
  const inativos: Record<string, string> = {};
  const [pessoa] = await tx
    .select({ situacao: pessoas.situacao })
    .from(pessoas)
    .where(eq(pessoas.id, conferido(dados.pessoa)))
    .for('share');
  if (!pessoa) naoEncontrados.pessoa = 'Pessoa não encontrada.';
  else if (pessoa.situacao !== 'ativa') inativos.pessoa = MENSAGEM_DA_PESSOA_INATIVA;

  const impressoras: AtivoConferido[] = [];
  let ativo: AtivoConferido | null = null;
  switch (dados.tipo) {
    case 'toner':
      for (const [indice, id] of dados.impressoras.entries()) {
        const campo = `impressoras.${indice}`;
        const conferencia = await conferirAtivo(tx, id, leitor);
        if ('recusa' in conferencia) {
          if (conferencia.recusa === 'inativo') inativos[campo] = MENSAGEM_DO_ATIVO_INATIVO;
          else naoEncontrados[campo] = 'Impressora não encontrada.';
        } else if (!conferencia.ativo.usaConsumiveis) {
          inativos[campo] = mensagemDoAtivoSemConsumiveis(identificacao(conferencia.ativo));
        } else {
          impressoras.push(conferencia.ativo);
        }
      }
      break;
    case 'conserto': {
      const conferencia = await conferirAtivo(tx, conferido(dados.ativo), leitor);
      if ('ativo' in conferencia) ativo = conferencia.ativo;
      else if (conferencia.recusa === 'inativo') inativos.ativo = MENSAGEM_DO_ATIVO_INATIVO;
      else naoEncontrados.ativo = 'Ativo não encontrado.';
      break;
    }
    case 'equipamento': {
      const [tipo] = await tx
        .select({ situacao: tiposDeAtivo.situacao })
        .from(tiposDeAtivo)
        .where(eq(tiposDeAtivo.id, conferido(dados.tipoDeAtivo)))
        .for('share');
      if (!tipo) naoEncontrados.tipoDeAtivo = 'Tipo de ativo não encontrado.';
      else if (tipo.situacao !== 'ativo') inativos.tipoDeAtivo = MENSAGEM_DO_TIPO_INATIVO;
      const localId = conferido(dados.local);
      const [local] = leitor.arvore.local(localId)
        ? await tx
            .select({ situacao: locais.situacao })
            .from(locais)
            .where(eq(locais.id, localId))
            .for('share')
        : [];
      if (!local) naoEncontrados.local = 'Local não encontrado.';
      else if (local.situacao !== 'ativo') inativos.local = MENSAGEM_DO_LOCAL_INATIVO;
      break;
    }
  }
  if (Object.keys(naoEncontrados).length > 0) throw dadosInvalidos(naoEncontrados);
  const [primeira, ...outras] = Object.values(inativos);
  if (primeira !== undefined) {
    throw conflito(outras.length === 0 ? primeira : 'Confira os campos indicados.', inativos);
  }
  return { impressoras, ativo };
}

/** Os locais da solicitação pelas referências conferidas. */
function locaisDas(dados: DadosDaSolicitacao, referencias: Referencias) {
  switch (dados.tipo) {
    case 'toner':
      return locaisDaSolicitacao(referencias.impressoras.map(({ localId }) => localId));
    case 'conserto':
      return locaisDaSolicitacao([conferido(referencias.ativo).localId]);
    case 'equipamento':
      return locaisDaSolicitacao([conferido(dados.local)]);
  }
}

/** Atende quem tem `solicitacoes.atender` em todos os locais; o sem local pede a organização. */
export function exigirAtender(
  requisicao: FastifyRequest,
  { locais: daSolicitacao, semLocal }: { locais: readonly string[]; semLocal: boolean },
  arvore: ArvoreDeLocais,
) {
  for (const local of daSolicitacao) exigirEm(requisicao, 'solicitacoes.atender', local, arvore);
  if (semLocal) exigirEm(requisicao, 'solicitacoes.atender', null, arvore);
}

/** O público do evento: os locais da solicitação e, sem local, a organização inteira. */
export const publicoDosLocais = (
  ...todos: { locais: readonly string[]; semLocal: boolean }[]
): (string | null)[] => [
  ...new Set(todos.flatMap(({ locais: daSolicitacao }) => daSolicitacao)),
  ...(todos.some(({ semLocal }) => semLocal) ? [null] : []),
];

/**
 * O consumível de cada item: o escolhido, que precisa ser um compatível ativo da cor, ou o
 * sugerido. A sugestão olha o saldo nos locais em que a conta vê o estoque.
 */
async function consumiveisDosItens(
  tx: Transacao,
  dados: Extract<DadosDaSolicitacao, { tipo: 'toner' }>,
  impressoras: AtivoConferido[],
  { acesso, arvore }: LeitorDasSolicitacoes,
): Promise<(string | null)[]> {
  const estoque = alcance(acesso, 'estoque.ver', arvore);
  const porModelo = new Map<string, ConsumivelCompativel[]>();
  const compativeis = async (impressoraId: string | null) => {
    const modeloId = impressoras.find(({ id }) => id === impressoraId)?.modeloId ?? null;
    if (modeloId === null) return [];
    const lidos = porModelo.get(modeloId) ?? (await compativeisDoModelo(tx, modeloId, estoque));
    porModelo.set(modeloId, lidos);
    return lidos;
  };
  const fora: Record<string, string> = {};
  const escolhidos: (string | null)[] = [];
  for (const [indice, item] of dados.itens.entries()) {
    const daImpressora = await compativeis(item.impressora);
    const cor = conferido(item.cor);
    if (item.consumivel !== null) {
      const compativel = daImpressora.find(({ id }) => id === item.consumivel);
      if (compativel?.cor !== cor)
        fora[`itens.${indice}.consumivel`] = MENSAGEM_DO_CONSUMIVEL_FORA_DA_COR;
      escolhidos.push(item.consumivel);
    } else {
      escolhidos.push(
        sugestaoDoConsumivel(
          daImpressora.map((compativel) => ({ ...compativel, ativo: true })),
          cor,
        ),
      );
    }
  }
  const [primeira, ...outras] = Object.values(fora);
  if (primeira !== undefined) {
    throw conflito(outras.length === 0 ? primeira : 'Confira os campos indicados.', fora);
  }
  return escolhidos;
}

/** O próximo número da organização, na transação do registro (design, decisão 2). */
async function proximoNumero(tx: Transacao): Promise<number> {
  const [linha] = await tx
    .insert(numeracaoDasSolicitacoes)
    .values({ orgId: sql`app.current_org()`, ultimo: 1 })
    .onConflictDoUpdate({
      target: numeracaoDasSolicitacoes.orgId,
      set: { ultimo: sql`${numeracaoDasSolicitacoes.ultimo} + 1` },
    })
    .returning({ ultimo: numeracaoDasSolicitacoes.ultimo });
  if (!linha) throw new Error('O número da solicitação não foi gerado.');
  return linha.ultimo;
}

/** As colunas do tipo na solicitação: o ativo e o defeito, ou o tipo, a quantidade, o motivo e o local. */
function colunasDoTipo(dados: DadosDaSolicitacao) {
  switch (dados.tipo) {
    case 'toner':
      return {};
    case 'conserto':
      return { ativoId: dados.ativo, defeito: dados.defeito };
    case 'equipamento':
      return {
        tipoDeAtivoId: dados.tipoDeAtivo,
        quantidade: dados.quantidade,
        motivo: dados.motivo,
        localId: dados.local,
      };
  }
}

/** A impressora que entra na solicitação, com o contador daquele momento. */
async function incluirImpressora(
  tx: Transacao,
  { solicitacaoId, ativoId, momento }: { solicitacaoId: string; ativoId: string; momento: Date },
) {
  const contador = await lerContador(tx, ativoId);
  await tx.insert(impressorasDasSolicitacoes).values({
    orgId: sql`app.current_org()`,
    solicitacaoId,
    ativoId,
    contadorPaginas: contador?.paginas ?? null,
    contadorLidoEm: contador?.lidoEm ?? null,
    incluidaEm: momento,
  });
}

/** O que a auditoria guarda da solicitação: os nomes de agora, sem os ids, e sem o que é vazio. */
export function visaoDaSolicitacao(solicitacao: SolicitacaoLida): Record<string, unknown> {
  const referencia = (ativo: { rotulo: string; patrimonio: string | null } | null) =>
    ativo ? [ativo.rotulo, ativo.patrimonio].filter(Boolean).join(' · ') : null;
  const toner = solicitacao.tipo === 'toner';
  const visao: Record<string, unknown> = {
    numero: solicitacao.numero,
    tipo: solicitacao.tipo,
    pessoa: solicitacao.pessoa.nome,
    impressoras: toner ? solicitacao.impressoras.map(({ ativo }) => referencia(ativo)) : null,
    itens: toner
      ? resumoDoPedido({
          tipo: 'toner',
          impressoras: solicitacao.impressoras.map(({ ativo, itens }) => ({
            rotulo: identificacao(ativo),
            itens,
          })),
        })
      : null,
    ativo: referencia(solicitacao.ativo),
    defeito: solicitacao.defeito,
    tipoDeAtivo: solicitacao.tipoDeAtivo?.nome ?? null,
    quantidade: solicitacao.quantidade,
    motivo: solicitacao.motivo,
    local: solicitacao.local?.caminho ?? null,
    fornecedor: solicitacao.fornecedor?.nome ?? null,
    osDoFornecedor: solicitacao.osDoFornecedor,
    observacao: solicitacao.observacao,
  };
  return Object.fromEntries(Object.entries(visao).filter(([, valor]) => valor !== null));
}

/** Registra a solicitação e a devolve lida. */
export async function registrar(
  tx: Transacao,
  pedido: DadosDaSolicitacao,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
): Promise<SolicitacaoLida> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const dados = limparSolicitacao(pedido);
  const erros = validarSolicitacao(dados);
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);

  const arvore = await lerArvore(tx);
  const leitor: LeitorDasSolicitacoes = { acesso, arvore };
  const referencias = await conferirReferencias(tx, dados, leitor);
  const daSolicitacao = locaisDas(dados, referencias);
  exigirAtender(requisicao, daSolicitacao, arvore);
  const consumiveis =
    dados.tipo === 'toner'
      ? await consumiveisDosItens(tx, dados, referencias.impressoras, leitor)
      : [];

  const numero = await proximoNumero(tx);
  const [registrada] = await tx
    .insert(solicitacoes)
    .values({
      orgId: sql`app.current_org()`,
      numero,
      tipo: dados.tipo,
      situacao: 'aberta',
      pessoaId: conferido(dados.pessoa),
      observacao: dados.observacao,
      ...colunasDoTipo(dados),
      locais: daSolicitacao.locais,
      semLocal: daSolicitacao.semLocal,
      registradaPor: contaId,
      registradaEm: momento,
    })
    .returning({ id: solicitacoes.id });
  if (!registrada) throw new Error('A solicitação não foi registrada.');
  if (dados.tipo === 'toner') {
    for (const ativoId of dados.impressoras) {
      await incluirImpressora(tx, { solicitacaoId: registrada.id, ativoId, momento });
    }
    if (dados.itens.length > 0) {
      await tx.insert(itensDasSolicitacoes).values(
        dados.itens.map((item, indice) => ({
          orgId: sql`app.current_org()`,
          solicitacaoId: registrada.id,
          impressoraId: conferido(item.impressora),
          cor: conferido(item.cor),
          quantidade: conferido(item.quantidade),
          consumivelId: consumiveis[indice] ?? null,
        })),
      );
    }
  }

  const lida = await lerSolicitacao(tx, leitor, registrada.id);
  await registrarNaAuditoria(tx, {
    acao: 'solicitacao.registrada',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'solicitacao', id: registrada.id },
    depois: visaoDaSolicitacao(lida),
    origem: origemDa(requisicao),
    momento,
    saida: {
      publico: { permissao: 'solicitacoes.ver', locais: publicoDosLocais(daSolicitacao) },
    },
  });
  return lida;
}

/**
 * A solicitação pelo número, travada para alterar até o fim da transação: a que não existe e a que
 * a conta não vê são a mesma recusa.
 */
export async function solicitacaoParaMudar(
  tx: Transacao,
  numero: number,
  { acesso, arvore }: LeitorDasSolicitacoes,
) {
  const [linha] = await tx
    .select()
    .from(solicitacoes)
    .where(eq(solicitacoes.numero, numero))
    .for('update');
  if (!linha || !veASolicitacao(alcance(acesso, 'solicitacoes.ver', arvore), linha)) {
    throw naoEncontrado('Solicitação não encontrada.');
  }
  return linha;
}

/** A recusa da solicitação concluída ou cancelada, que não muda mais. */
export function exigirPendente(linha: { numero: number; situacao: SolicitacaoLida['situacao'] }) {
  if (!situacaoPendente(linha.situacao)) {
    throw conflito(mensagemDaRecusa(linha.numero, { motivo: 'ja-esta', situacao: linha.situacao }));
  }
}

/**
 * O número da OS em aberto que cada solicitação dada segue (spec solicitacoes, "Conserto com a
 * ordem de serviço"); a que não está no mapa não segue nenhuma.
 */
export async function ordensQueSeguem(
  tx: Transacao,
  ids: readonly string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const linhas = await tx
    .select({ solicitacaoId: ordensDeServico.solicitacaoId, numero: ordensDeServico.numero })
    .from(ordensDeServico)
    .where(
      and(
        inArray(ordensDeServico.solicitacaoId, [...ids]),
        inArray(ordensDeServico.situacao, [...SITUACOES_EM_ABERTO]),
      ),
    );
  return new Map(
    linhas.flatMap(({ solicitacaoId, numero }) =>
      solicitacaoId === null ? [] : [[solicitacaoId, numero] as const],
    ),
  );
}

/**
 * A recusa da solicitação pendente que segue uma OS em aberto: ela muda só pela OS, e não por si.
 * A concluída e a cancelada ficam com a recusa delas, de `exigirPendente`.
 */
export async function exigirQueNaoSigaAOrdem(
  tx: Transacao,
  linha: { id: string; numero: number; situacao: SolicitacaoLida['situacao'] },
) {
  if (!situacaoPendente(linha.situacao)) return;
  const ordem = (await ordensQueSeguem(tx, [linha.id])).get(linha.id);
  if (ordem !== undefined) {
    throw conflito(mensagemDaRecusa(linha.numero, { motivo: 'segue-a-ordem', ordem }));
  }
}

/** Os itens do toner, das impressoras e dos itens novos, contra o que já foi entregue. */
async function alterarToner(
  tx: Transacao,
  {
    solicitacaoId,
    dados,
    impressoras,
    consumiveis,
    momento,
  }: {
    solicitacaoId: string;
    dados: Extract<DadosDaSolicitacao, { tipo: 'toner' }>;
    impressoras: AtivoConferido[];
    consumiveis: (string | null)[];
    momento: Date;
  },
) {
  const atuais = await tx
    .select()
    .from(itensDasSolicitacoes)
    .where(eq(itensDasSolicitacoes.solicitacaoId, solicitacaoId));
  const entregues = atuais.filter(({ entregueEm }) => entregueEm !== null);
  const naSolicitacao = await tx
    .select({ ativoId: impressorasDasSolicitacoes.ativoId })
    .from(impressorasDasSolicitacoes)
    .where(eq(impressorasDasSolicitacoes.solicitacaoId, solicitacaoId));
  const ficam = new Set(dados.impressoras);

  // A impressora com item entregue fica, e a cor entregue não volta como item pendente.
  const comEntrega = [...new Set(entregues.map(({ impressoraId }) => impressoraId))].filter(
    (id) => !ficam.has(id),
  );
  if (comEntrega.length > 0) {
    const [rotulo] = await tx
      .select({ patrimonio: ativos.patrimonio, nome: ativos.nome })
      .from(ativos)
      .where(eq(ativos.id, comEntrega[0] ?? ''));
    const mensagem = mensagemDaImpressoraComEntrega(rotulo?.patrimonio ?? rotulo?.nome ?? '');
    throw conflito(mensagem, { impressoras: mensagem });
  }
  const repetidas = Object.fromEntries(
    dados.itens.flatMap((item, indice) =>
      entregues.some(
        ({ impressoraId, cor }) => impressoraId === item.impressora && cor === item.cor,
      )
        ? [[`itens.${indice}.cor`, 'Essa cor já está pedida para essa impressora.']]
        : [],
    ),
  );
  if (Object.keys(repetidas).length > 0) throw dadosInvalidos(repetidas);

  const pendentes = atuais.filter(({ entregueEm }) => entregueEm === null);
  const fica = (item: (typeof atuais)[number]) =>
    dados.itens.some(({ impressora, cor }) => impressora === item.impressoraId && cor === item.cor);
  const saem = pendentes.filter((item) => !fica(item)).map(({ id }) => id);
  if (saem.length > 0) {
    await tx.delete(itensDasSolicitacoes).where(inArray(itensDasSolicitacoes.id, saem));
  }
  const saiDaSolicitacao = naSolicitacao
    .map(({ ativoId }) => ativoId)
    .filter((id) => !ficam.has(id));
  if (saiDaSolicitacao.length > 0) {
    await tx
      .delete(impressorasDasSolicitacoes)
      .where(
        and(
          eq(impressorasDasSolicitacoes.solicitacaoId, solicitacaoId),
          inArray(impressorasDasSolicitacoes.ativoId, saiDaSolicitacao),
        ),
      );
  }
  const jaEstavam = new Set(naSolicitacao.map(({ ativoId }) => ativoId));
  for (const { id } of impressoras) {
    if (!jaEstavam.has(id)) await incluirImpressora(tx, { solicitacaoId, ativoId: id, momento });
  }
  for (const [indice, item] of dados.itens.entries()) {
    const existente = pendentes.find(
      ({ impressoraId, cor }) => impressoraId === item.impressora && cor === item.cor,
    );
    const consumivelId = consumiveis[indice] ?? null;
    if (existente) {
      if (existente.quantidade !== item.quantidade || existente.consumivelId !== consumivelId) {
        await tx
          .update(itensDasSolicitacoes)
          .set({ quantidade: conferido(item.quantidade), consumivelId })
          .where(
            and(eq(itensDasSolicitacoes.id, existente.id), isNull(itensDasSolicitacoes.entregueEm)),
          );
      }
    } else {
      await tx.insert(itensDasSolicitacoes).values({
        orgId: sql`app.current_org()`,
        solicitacaoId,
        impressoraId: conferido(item.impressora),
        cor: conferido(item.cor),
        quantidade: conferido(item.quantidade),
        consumivelId,
      });
    }
  }
}

/** Altera a solicitação pendente e a devolve lida; sem nenhuma mudança, nada vai para a auditoria. */
export async function alterar(
  tx: Transacao,
  numero: number,
  pedido: DadosDaSolicitacao,
  { requisicao, momento }: { requisicao: FastifyRequest; momento: Date },
): Promise<SolicitacaoLida> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const leitor: LeitorDasSolicitacoes = { acesso, arvore };
  const linha = await solicitacaoParaMudar(tx, numero, leitor);
  exigirAtender(requisicao, linha, arvore);
  await exigirQueNaoSigaAOrdem(tx, linha);
  exigirPendente(linha);
  if (pedido.tipo !== linha.tipo) throw dadosInvalidos({ tipo: 'O tipo da solicitação não muda.' });

  const dados = limparSolicitacao(pedido);
  // A impressora com item entregue tem o item dela, mesmo sem item pendente no pedido.
  const comEntrega = new Set(
    (
      await tx
        .selectDistinct({ impressoraId: itensDasSolicitacoes.impressoraId })
        .from(itensDasSolicitacoes)
        .where(
          and(
            eq(itensDasSolicitacoes.solicitacaoId, linha.id),
            isNotNull(itensDasSolicitacoes.entregueEm),
          ),
        )
    ).map(({ impressoraId }) => impressoraId),
  );
  const erros = validarSolicitacao(dados, { comEntrega });
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
  const referencias = await conferirReferencias(tx, dados, leitor);
  const daSolicitacao = locaisDas(dados, referencias);
  exigirAtender(requisicao, daSolicitacao, arvore);
  const consumiveis =
    dados.tipo === 'toner'
      ? await consumiveisDosItens(tx, dados, referencias.impressoras, leitor)
      : [];

  const antes = await lerSolicitacao(tx, leitor, linha.id);
  await tx
    .update(solicitacoes)
    .set({
      pessoaId: conferido(dados.pessoa),
      observacao: dados.observacao,
      ...colunasDoTipo(dados),
      locais: daSolicitacao.locais,
      semLocal: daSolicitacao.semLocal,
    })
    .where(eq(solicitacoes.id, linha.id));
  if (dados.tipo === 'toner') {
    await alterarToner(tx, {
      solicitacaoId: linha.id,
      dados,
      impressoras: referencias.impressoras,
      consumiveis,
      momento,
    });
  }
  const depois = await lerSolicitacao(tx, leitor, linha.id);
  const visaoDeAntes = visaoDaSolicitacao(antes);
  const visaoDeDepois = visaoDaSolicitacao(depois);
  if (JSON.stringify(visaoDeAntes) !== JSON.stringify(visaoDeDepois)) {
    await registrarNaAuditoria(tx, {
      acao: 'solicitacao.alterada',
      ator: { tipo: 'conta', contaId },
      alvo: { tipo: 'solicitacao', id: linha.id },
      antes: visaoDeAntes,
      depois: visaoDeDepois,
      origem: origemDa(requisicao),
      momento,
      saida: {
        publico: {
          permissao: 'solicitacoes.ver',
          locais: publicoDosLocais(linha, daSolicitacao),
        },
      },
    });
  }
  return depois;
}
