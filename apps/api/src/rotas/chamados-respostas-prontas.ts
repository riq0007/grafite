// As respostas prontas pela API (spec chamados, "Respostas prontas"; change chamados-da-ti, tarefa
// 4.4), para quem configura os chamados: a lista na ordem, com os tipos pelo nome; a criação, no fim
// da ordem, com o limite de 100 contado depois da trava das respostas prontas; a gravação e a
// remoção, com a resposta travada; e a ordem, com todas, uma vez cada. Os tipos da resposta, a
// conferência do domínio os confere com os Em uso e os Inativos lidos na mesma transação. Tudo com
// a auditoria e o evento dos ajustes.
import { isDeepStrictEqual } from 'node:util';
import {
  type Banco,
  naOrganizacao,
  respostasProntas,
  type Transacao,
  tiposDeChamado,
} from '@grafite/db';
import {
  conferirRespostaPronta,
  MAXIMO_DE_RESPOSTAS_PRONTAS,
  MENSAGENS_DA_RESPOSTA_PRONTA,
  type PedidoDaRespostaPronta,
  type RespostaProntaConferida,
} from '@grafite/domain';
import { asc, count, eq, max, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { naOrdem } from '../chamados/tipos.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { travar } from '../travas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const M = MENSAGENS_DA_RESPOSTA_PRONTA;

const RespostaPronta = z
  .object({
    id: z.uuid(),
    rotulo: z.string(),
    /** O `{nome}` vira o primeiro nome da pessoa do chamado. */
    texto: z.string(),
    /** Ligado, mandar a resposta põe o chamado em Aguardando o colaborador. */
    esperaAResposta: z.boolean(),
    /** Os tipos em que a resposta aparece, na ordem dos tipos; nenhum, ela aparece em todos. */
    tipos: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  })
  .meta({ id: 'RespostaPronta' });

const ListaDasRespostasProntas = z
  .object({ respostas: z.array(RespostaPronta) })
  .meta({ id: 'ListaDasRespostasProntas' });

/** A resposta como a tela a grava; as recusas da spec são da conferência do domínio, por campo. */
const PedidoDaResposta = z
  .object({
    rotulo: z.string(),
    texto: z.string(),
    esperaAResposta: z.boolean(),
    /** Os tipos em que ela aparece, entre os Em uso e os Inativos; nenhum, ela aparece em todos. */
    tipos: z.array(z.uuid()),
  })
  .meta({ id: 'PedidoDaRespostaPronta' });

const ParametrosDaResposta = z.object({ id: z.uuid() });

const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };
const PROBLEMAS_DA_GRAVACAO = { ...PROBLEMAS, 409: RespostaDeProblema };

type LinhaDaResposta = typeof respostasProntas.$inferSelect;
type ConteudoDaResposta = Pick<LinhaDaResposta, 'rotulo' | 'texto' | 'esperaAResposta' | 'tipos'>;

/** Os tipos de chamado na ordem, para os nomes da resposta e para a lista da conferência. */
function lerTipos(tx: Transacao) {
  return tx
    .select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome, situacao: tiposDeChamado.situacao })
    .from(tiposDeChamado)
    .orderBy(...naOrdem);
}

type TiposLidos = Awaited<ReturnType<typeof lerTipos>>;

/** Os tipos da resposta, na ordem dos tipos. */
const tiposDa = (resposta: ConteudoDaResposta, tipos: TiposLidos) => {
  const daResposta = new Set(resposta.tipos);
  return tipos.filter(({ id }) => daResposta.has(id));
};

/** A resposta no formato da API. */
const respostaLida = (linha: LinhaDaResposta, tipos: TiposLidos) => ({
  id: linha.id,
  rotulo: linha.rotulo,
  texto: linha.texto,
  esperaAResposta: linha.esperaAResposta,
  tipos: tiposDa(linha, tipos).map(({ id, nome }) => ({ id, nome })),
});

/** O que a auditoria guarda da resposta, com os tipos pelo nome de então. */
const visaoDaResposta = (resposta: ConteudoDaResposta, tipos: TiposLidos) => ({
  rotulo: resposta.rotulo,
  texto: resposta.texto,
  esperaAResposta: resposta.esperaAResposta,
  tipos: tiposDa(resposta, tipos).map(({ nome }) => nome),
});

/** O que a gravação compara para saber se muda algo: o que a tela grava, sem o rótulo normalizado. */
const conteudoDa = (resposta: ConteudoDaResposta): ConteudoDaResposta => ({
  rotulo: resposta.rotulo,
  texto: resposta.texto,
  esperaAResposta: resposta.esperaAResposta,
  tipos: resposta.tipos,
});

const naOrdemDasRespostas = [asc(respostasProntas.ordem), asc(respostasProntas.rotuloNormalizado)];

async function lerRespostas(tx: Transacao) {
  const tipos = await lerTipos(tx);
  const linhas = await tx
    .select()
    .from(respostasProntas)
    .orderBy(...naOrdemDasRespostas);
  return linhas.map((linha) => respostaLida(linha, tipos));
}

/** A resposta travada para a gravação e a remoção; a de outra organização não existe. */
async function lerLinhaDaResposta(tx: Transacao, id: string): Promise<LinhaDaResposta> {
  const [linha] = await tx
    .select()
    .from(respostasProntas)
    .where(eq(respostasProntas.id, id))
    .for('update');
  if (!linha) throw naoEncontrado(M.naoEncontrada);
  return linha;
}

/** A conferência do domínio, com os tipos Em uso e Inativos lidos na transação. */
function conferir(pedido: PedidoDaRespostaPronta, tipos: TiposLidos): RespostaProntaConferida {
  const tiposDaLista = new Set(
    tipos.filter(({ situacao }) => situacao !== 'rascunho').map(({ id }) => id),
  );
  const conferida = conferirRespostaPronta(pedido, { tiposDaLista });
  if (!conferida.ok) throw dadosInvalidos(conferida.erros);
  return conferida.resposta;
}

/** A gravação que bate no rótulo único volta com a recusa no rótulo. */
async function noRotuloUnico<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'respostas_prontas_rotulo_unico')) {
      throw conflito(M.rotuloRepetido, { rotulo: M.rotuloRepetido });
    }
    throw erro;
  }
}

export const rotasDasRespostasProntas: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';
  const autorDa = (requisicao: FastifyRequest) =>
    ({ tipo: 'conta', contaId: sessaoDa(requisicao).contaId }) as const;

  app.get(
    '/chamados/respostas-prontas',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'As respostas prontas, na ordem',
        response: { 200: ListaDasRespostasProntas, ...PROBLEMAS },
      },
    },
    async (requisicao) => ({
      respostas: await naOrganizacao(banco, orgDa(requisicao), lerRespostas),
    }),
  );

  app.put(
    '/chamados/respostas-prontas/ordem',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Ordenar as respostas prontas, com todas, uma vez cada',
        body: z.object({ ids: z.array(z.uuid()) }),
        response: { 200: ListaDasRespostasProntas, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { ids } = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // Travadas, como na ordem dos tipos: a segunda ordem, a gravação e a remoção esperam a
        // primeira, e a leitura vem depois da trava, num comando à parte, para ver o que a outra
        // deixou. A criação não espera por elas: a ordem dá às respostas as posições de 1 até o
        // total, e a nova vai para depois da maior ordem; a nova gravada antes da leitura deixa
        // a ordem sem ela, que é recusada.
        await tx.select({ id: respostasProntas.id }).from(respostasProntas).for('update');
        const atuais = await tx
          .select({
            id: respostasProntas.id,
            rotulo: respostasProntas.rotulo,
            ordem: respostasProntas.ordem,
          })
          .from(respostasProntas)
          .orderBy(...naOrdemDasRespostas);
        const pelaId = new Map(atuais.map((resposta) => [resposta.id, resposta]));
        if (
          ids.length !== atuais.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !pelaId.has(id))
        ) {
          throw dadosInvalidos({ ids: M.ordem });
        }
        if (ids.every((id, posicao) => atuais[posicao]?.id === id)) {
          return { respostas: await lerRespostas(tx) };
        }
        for (const [posicao, id] of ids.entries()) {
          if (pelaId.get(id)?.ordem === posicao + 1) continue;
          await tx
            .update(respostasProntas)
            .set({ ordem: posicao + 1 })
            .where(eq(respostasProntas.id, id));
        }
        await registrarNaAuditoria(tx, {
          acao: 'respostas-prontas.ordenadas',
          ator: autorDa(requisicao),
          alvo: { tipo: 'respostas-prontas' },
          antes: { ordem: atuais.map(({ rotulo }) => rotulo) },
          depois: { ordem: ids.map((id) => pelaId.get(id)?.rotulo ?? id) },
          origem: origemDa(requisicao),
          momento,
        });
        return { respostas: await lerRespostas(tx) };
      });
    },
  );

  app.post(
    '/chamados/respostas-prontas',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Criar uma resposta pronta, no fim da ordem',
        body: PedidoDaResposta,
        response: { 201: RespostaPronta, ...PROBLEMAS_DA_GRAVACAO },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const criada = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // Uma criação de cada vez na organização: a contagem e a maior ordem vêm depois da trava,
        // e das duas que chegam juntas com 99 respostas, a segunda conta a da primeira.
        await travar(tx, 'respostas-prontas');
        const [gravadas] = await tx
          .select({ total: count(), maiorOrdem: max(respostasProntas.ordem) })
          .from(respostasProntas);
        if ((gravadas?.total ?? 0) >= MAXIMO_DE_RESPOSTAS_PRONTAS) throw conflito(M.limite);
        const tipos = await lerTipos(tx);
        const conferida = conferir(requisicao.body, tipos);
        const [linha] = await noRotuloUnico(() =>
          tx
            .insert(respostasProntas)
            .values({
              orgId: sql`app.current_org()`,
              ...conferida,
              ordem: (gravadas?.maiorOrdem ?? 0) + 1,
            })
            .returning(),
        );
        if (!linha) throw new Error('A resposta pronta não voltou da gravação.');
        await registrarNaAuditoria(tx, {
          acao: 'resposta-pronta.criada',
          ator: autorDa(requisicao),
          alvo: { tipo: 'resposta-pronta', id: linha.id },
          depois: visaoDaResposta(linha, tipos),
          origem: origemDa(requisicao),
          momento,
        });
        return respostaLida(linha, tipos);
      });
      return resposta.code(201).send(criada);
    },
  );

  app.put(
    '/chamados/respostas-prontas/:id',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Gravar uma resposta pronta',
        params: ParametrosDaResposta,
        body: PedidoDaResposta,
        response: { 200: RespostaPronta, ...PROBLEMAS_DA_GRAVACAO },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDaResposta(tx, requisicao.params.id);
        const tipos = await lerTipos(tx);
        const conferida = conferir(requisicao.body, tipos);
        // A resposta igual à gravada não grava nada.
        if (isDeepStrictEqual(conteudoDa(conferida), conteudoDa(linha))) {
          return respostaLida(linha, tipos);
        }
        const [gravada] = await noRotuloUnico(() =>
          tx
            .update(respostasProntas)
            .set(conferida)
            .where(eq(respostasProntas.id, linha.id))
            .returning(),
        );
        if (!gravada) throw new Error('A resposta pronta não voltou da gravação.');
        await registrarNaAuditoria(tx, {
          acao: 'resposta-pronta.alterada',
          ator: autorDa(requisicao),
          alvo: { tipo: 'resposta-pronta', id: linha.id },
          antes: visaoDaResposta(linha, tipos),
          depois: visaoDaResposta(gravada, tipos),
          origem: origemDa(requisicao),
          momento,
        });
        return respostaLida(gravada, tipos);
      });
    },
  );

  app.delete(
    '/chamados/respostas-prontas/:id',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Remover uma resposta pronta',
        params: ParametrosDaResposta,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDaResposta(tx, requisicao.params.id);
        const tipos = await lerTipos(tx);
        await tx.delete(respostasProntas).where(eq(respostasProntas.id, linha.id));
        await registrarNaAuditoria(tx, {
          acao: 'resposta-pronta.removida',
          ator: autorDa(requisicao),
          alvo: { tipo: 'resposta-pronta', id: linha.id },
          antes: visaoDaResposta(linha, tipos),
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(204).send(null);
    },
  );
};
