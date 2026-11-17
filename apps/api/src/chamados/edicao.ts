// O ativo, o título e os campos da TI do chamado (spec chamados, "Ativo ligado e campos da TI";
// change chamados-da-ti, design, "O ativo, o título e os campos da TI", "O ativo ligado e as
// respostas" e "O local da pessoa na abertura", tarefa 4.15): três mudanças fora do
// `agirNoChamado`, porque não mudam a situação nem quem atende, cada uma numa transação:
// - o chamado, travado como nas ações (`travarOChamado`), se a conta o vê; senão, o que não existe;
// - as recusas do domínio de quem não atende os locais do chamado e do chamado resolvido, no 409,
//   antes das do campo, fora a do ativo, que é lido antes, como na abertura;
// - a mudança, que o mesmo ativo, o mesmo título e as mesmas respostas não fazem: a rota responde o
//   chamado como está, sem a auditoria;
// - a auditoria, com o antes e o depois, e o `chamados.mudaram` pela saída dela. Só a troca do ativo
//   sobe a versão e grava o evento na conversa, e nenhuma das três notifica: quem atende não muda, e
//   nada cai na triagem.
import {
  anexosDosChamados,
  arquivos,
  chamados,
  mensagensDosChamados,
  type Transacao,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  type AtivoDasRespostas,
  alcance,
  type CampoMudado,
  camposNaAuditoria,
  conferirTituloDoChamado,
  decidirTrocaDoAtivo,
  type LocalDoChamado,
  mensagemDaRecusaDaAcao,
  mensagemDaRecusaDaTrocaDoAtivo,
  mudarCamposDaTi,
  normalizarTexto,
  type QuemAge,
  recusaDaEdicao,
} from '@grafite/domain';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { chamadoMudou, conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { type AtivoDaResposta, conferirAtivo, conferirReferencias } from './abertura.ts';
import { type ChamadoDepoisDaAcao, formularioDoChamado, travarOChamado } from './acoes.ts';
import { publicoDoChamado } from './alcance.ts';
import { tomarAnexos } from './anexos.ts';
import { ativosPorId, nomesDasPessoas } from './ficha.ts';
import { lerContaQueAtende, nomeDaConta } from './quem-atende.ts';

/** O que as três recebem da rota: a requisição, com a sessão, e o momento. */
interface Contexto {
  requisicao: FastifyRequest;
  momento: Date;
}

/** O pedido da troca do ativo, depois do schema: o id do ativo, ou nulo, e a versão da tela. */
export interface PedidoDaTrocaDoAtivo {
  ativo: string | null;
  versao?: number | undefined;
}

type ChamadoTravado = Awaited<ReturnType<typeof travarOChamado>>;

/** O chamado travado, a árvore e quem age, que as três leem do mesmo jeito. */
async function travarParaMudar(tx: Transacao, numero: number, requisicao: FastifyRequest) {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const lido = await travarOChamado(tx, numero, acesso, arvore);
  const quemAge: QuemAge = { id: contaId, alcance: alcance(acesso, 'chamados.atender', arvore) };
  return { acesso, contaId, arvore, lido, quemAge };
}

/** O local pelo caminho, como as recusas do domínio o escrevem. */
const comNome = (arvore: ArvoreDeLocais, id: string): LocalDoChamado => ({
  id,
  nome: arvore.caminho(id),
});

/** Quem age precisa atender os locais do chamado, e o resolvido não muda: as duas no 409. */
function exigirAEdicao(lido: ChamadoTravado, quemAge: QuemAge, arvore: ArvoreDeLocais) {
  const recusa = recusaDaEdicao(
    {
      numero: lido.numero,
      situacao: lido.situacao,
      locais: lido.locais.map((id) => comNome(arvore, id)),
      semLocal: lido.semLocal,
    },
    quemAge,
  );
  if (recusa) throw conflito(mensagemDaRecusaDaAcao(lido.numero, recusa));
}

/** O chamado depois da mudança, como as ações o devolvem. */
async function comoFicou(
  tx: Transacao,
  lido: ChamadoTravado,
  versao = lido.versao,
): Promise<ChamadoDepoisDaAcao> {
  return {
    numero: lido.numero,
    versao,
    situacao: lido.situacao,
    responsavel:
      lido.responsavel === null
        ? null
        : { id: lido.responsavel, nome: await nomeDaConta(tx, lido.responsavel) },
  };
}

/** O ativo como a auditoria o mostra, pelo rótulo e o patrimônio, como na abertura; sem ele, nulo. */
const ativoNaAuditoria = (ativo: AtivoDasRespostas | null | undefined) =>
  ativo ? [ativo.rotulo, ativo.patrimonio].filter(Boolean).join(' · ') : null;

/**
 * Liga, troca ou tira o ativo do chamado. O ativo novo é conferido antes da decisão, como na
 * abertura, sem os tipos aceitos do campo Ativo, porque o ativo ligado é do chamado, e não da
 * resposta; a recusa vai no campo `ativo`. A decisão é do domínio (`decidirTrocaDoAtivo`), com os
 * locais refeitos pelo local da pessoa na abertura e o do ativo novo, e quem está com o chamado como
 * a conta está agora. A troca sobe a versão, grava o evento `ativo` na conversa e registra o
 * `chamado.ativo-trocado`, com o evento a quem vê os locais de antes e os de depois.
 */
export async function trocarOAtivo(
  tx: Transacao,
  numero: number,
  pedido: PedidoDaTrocaDoAtivo,
  { requisicao, momento }: Contexto,
): Promise<ChamadoDepoisDaAcao> {
  const { acesso, contaId, arvore, lido, quemAge } = await travarParaMudar(tx, numero, requisicao);
  let novo: AtivoDaResposta | null = null;
  if (pedido.ativo !== null) {
    const conferido = await conferirAtivo(tx, pedido.ativo, [], { acesso, arvore });
    if ('recusa' in conferido) throw dadosInvalidos({ ativo: conferido.recusa });
    novo = conferido.ativo;
  }
  const local = (id: string | null) => (id === null ? null : comNome(arvore, id));
  const decisao = decidirTrocaDoAtivo(
    {
      numero: lido.numero,
      situacao: lido.situacao,
      locais: lido.locais.map((id) => comNome(arvore, id)),
      semLocal: lido.semLocal,
      versao: lido.versao,
      ativo: lido.ativo,
      localDaPessoa: local(lido.localDaPessoa),
    },
    quemAge,
    lido.responsavel === null ? null : await lerContaQueAtende(tx, lido.responsavel, arvore),
    { ativo: novo && { id: novo.id, local: local(novo.localId) }, versao: pedido.versao },
  );
  if (!decisao.aceita) {
    const frase = mensagemDaRecusaDaTrocaDoAtivo(lido.numero, decisao.recusa);
    throw decisao.recusa.motivo === 'versao' ? chamadoMudou(frase) : conflito(frase);
  }
  if (!decisao.muda) return comoFicou(tx, lido);

  const versao = lido.versao + 1;
  const depois = { locais: decisao.locais.map(({ id }) => id), semLocal: decisao.semLocal };
  await tx
    .update(chamados)
    .set({ ativoId: novo?.id ?? null, ...depois, versao })
    .where(eq(chamados.id, lido.id));
  await tx.insert(mensagensDosChamados).values({
    orgId: sql`app.current_org()`,
    chamadoId: lido.id,
    especie: 'evento',
    autorConta: contaId,
    criadaEm: momento,
    ...decisao.evento,
  });
  const antes =
    lido.ativo === null ? null : (await ativosPorId(tx, new Set([lido.ativo]))).get(lido.ativo);
  await registrarNaAuditoria(tx, {
    acao: 'chamado.ativo-trocado',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: lido.id },
    antes: { ativo: ativoNaAuditoria(antes) },
    depois: { ativo: ativoNaAuditoria(novo) },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(lido, depois) },
  });
  return comoFicou(tx, lido, versao);
}

/**
 * Troca o título do chamado pelo que quem atende escreveu, conferido pelo domínio como na abertura,
 * com as recusas no campo `titulo`, e registra o `chamado.titulo-trocado`. A versão não sobe, e a
 * conversa não muda.
 */
export async function trocarOTitulo(
  tx: Transacao,
  numero: number,
  pedido: { titulo: string },
  { requisicao, momento }: Contexto,
): Promise<ChamadoDepoisDaAcao> {
  const { contaId, arvore, lido, quemAge } = await travarParaMudar(tx, numero, requisicao);
  exigirAEdicao(lido, quemAge, arvore);
  const conferido = conferirTituloDoChamado(pedido.titulo);
  if (!conferido.ok) throw dadosInvalidos({ titulo: conferido.erro });
  if (conferido.titulo === lido.titulo) return comoFicou(tx, lido);
  await tx
    .update(chamados)
    .set({ titulo: conferido.titulo, tituloNormalizado: normalizarTexto(conferido.titulo) })
    .where(eq(chamados.id, lido.id));
  await registrarNaAuditoria(tx, {
    acao: 'chamado.titulo-trocado',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: lido.id },
    antes: { titulo: lido.titulo },
    depois: { titulo: conferido.titulo },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(lido) },
  });
  return comoFicou(tx, lido);
}

/** Os ids dos arquivos de uma resposta do campo Anexo, guardada ou nova; sem ela, nenhum. */
const arquivosDa = (resposta: unknown): string[] =>
  Array.isArray(resposta) ? resposta.filter((id): id is string => typeof id === 'string') : [];

/**
 * Os nomes do que os campos que mudaram citam, antes e depois, para a auditoria: os ativos pelo
 * rótulo e o patrimônio de agora, os locais pelo caminho e as pessoas pelo nome.
 */
async function nomesDosCitados(
  tx: Transacao,
  mudados: readonly CampoMudado[],
  arvore: ArvoreDeLocais,
) {
  const ids = { ativo: new Set<string>(), local: new Set<string>(), pessoa: new Set<string>() };
  for (const { campo, antes, depois } of mudados) {
    if (campo.tipo !== 'ativo' && campo.tipo !== 'local' && campo.tipo !== 'pessoa') continue;
    for (const id of [antes, depois]) if (typeof id === 'string') ids[campo.tipo].add(id);
  }
  return {
    ativos: await ativosPorId(tx, ids.ativo),
    locais: new Map(
      [...ids.local].filter((id) => arvore.local(id)).map((id) => [id, arvore.caminho(id)]),
    ),
    pessoas: await nomesDasPessoas(tx, ids.pessoa),
  };
}

/**
 * Muda os campos só da TI do chamado pelo formulário da abertura (`mudarCamposDaTi`): o pedido traz
 * só as respostas que mudam. O ativo, o local e a pessoa são conferidos como na abertura, só nos
 * campos que mudaram e ficaram com resposta: o ativo da resposta da pessoa que ficou inativo depois
 * não recusa a mudança de outro campo. O anexo novo é tomado pelo campo, e o que sai dele, trocado,
 * tirado ou do campo que sumiu pela condição, é removido na hora. A rota registra o
 * `chamado.campos-trocados`, com cada campo que mudou, antes e depois, como o resumo o mostra.
 */
export async function mudarOsCamposDaTi(
  tx: Transacao,
  numero: number,
  pedido: { respostas: Record<string, unknown> },
  { requisicao, momento }: Contexto,
): Promise<ChamadoDepoisDaAcao> {
  const { acesso, contaId, arvore, lido, quemAge } = await travarParaMudar(tx, numero, requisicao);
  exigirAEdicao(lido, quemAge, arvore);
  const { formulario, respostas: guardadas } = await formularioDoChamado(tx, lido.id);
  const mudanca = mudarCamposDaTi(formulario, guardadas, pedido.respostas);
  if (!mudanca.ok) throw dadosInvalidos(mudanca.erros);
  const { mudados } = mudanca;
  if (mudados.length === 0) return comoFicou(tx, lido);

  const novas = Object.fromEntries(
    mudados.flatMap(({ campo, depois }) => (depois === null ? [] : [[campo.id, depois]])),
  );
  const referencias = await conferirReferencias(tx, formulario, novas, { acesso, arvore });
  if (Object.keys(referencias.recusas).length > 0) throw dadosInvalidos(referencias.recusas);

  const removidos: string[] = [];
  for (const { campo, antes, depois } of mudados) {
    if (campo.tipo !== 'anexo') continue;
    const deAntes = arquivosDa(antes);
    const deDepois = arquivosDa(depois);
    await tomarAnexos(tx, {
      arquivos: deDepois.filter((id) => !deAntes.includes(id)),
      contaId,
      dono: { chamadoId: lido.id, campoId: campo.id },
      chave: `campos.${campo.id}`,
    });
    removidos.push(...deAntes.filter((id) => !deDepois.includes(id)));
  }
  // O arquivo que sai do campo deixa de ser entregue na hora, e o conteúdo sai com os outros
  // removidos; só os anexos dos campos deste chamado, que as respostas guardadas citam.
  if (removidos.length > 0) {
    await tx
      .update(arquivos)
      .set({ removidoEm: momento })
      .where(
        and(
          inArray(arquivos.id, removidos),
          isNull(arquivos.removidoEm),
          sql`exists (select 1 from ${anexosDosChamados}
            where ${anexosDosChamados.arquivoId} = ${arquivos.id}
              and ${anexosDosChamados.chamadoId} = ${lido.id}
              and ${anexosDosChamados.campoId} is not null)`,
        ),
      );
  }
  await tx.update(chamados).set({ respostas: mudanca.respostas }).where(eq(chamados.id, lido.id));

  const { antes, depois } = camposNaAuditoria(mudados, await nomesDosCitados(tx, mudados, arvore));
  await registrarNaAuditoria(tx, {
    acao: 'chamado.campos-trocados',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: lido.id },
    antes: { campos: antes },
    depois: { campos: depois },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(lido) },
  });
  return comoFicou(tx, lido);
}
