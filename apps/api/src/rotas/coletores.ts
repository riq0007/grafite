// Os coletores da organização (spec coletor-local, "Coletor da organização", e modulo-administracao,
// "Tela de coletores"; design do P2a, decisão 2): quem administra os coletores vê a lista, cadastra,
// edita o nome e as faixas, troca o token, inativa e reativa. O token só sai na resposta do cadastro
// e da troca; o banco guarda o hash. Cada mudança vai para a auditoria, com o evento dos coletores.
import {
  type Banco,
  coletores,
  naOrganizacao,
  SITUACOES_DO_COLETOR,
  type Transacao,
} from '@grafite/db';
import { lerFaixas, normalizarTexto } from '@grafite/domain';
import { asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import {
  criarColetor,
  type LinhaDoColetor,
  novoTokenDoColetor,
  semNomeDeColetorRepetido,
  visaoDoColetor,
} from '../coleta/coletores.ts';
import { dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Coletor = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    /** As faixas de rede que ele alcança, na forma canônica. */
    faixas: z.array(z.string()),
    situacao: z.enum(SITUACOES_DO_COLETOR),
    /** O momento do último pedido aceito, ou nenhum. */
    ultimoContatoEm: z.string().nullable(),
    /** A versão informada no último contato. */
    versao: z.string().nullable(),
    criadoEm: z.string(),
  })
  .meta({ id: 'Coletor' });

const ListaDeColetores = z
  .object({
    coletores: z.array(Coletor),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDeColetores' });

/** O coletor com o token, que aparece só no cadastro e na troca. */
const ColetorComToken = z
  .object({ coletor: Coletor, token: z.string() })
  .meta({ id: 'ColetorComToken' });

const NomeDoColetor = z
  .string({ error: 'Informe o nome do coletor.' })
  .trim()
  .min(1, { error: 'Informe o nome do coletor.' })
  .max(60, { error: 'Use até 60 caracteres.' });

/** As faixas como texto: a forma, o limite e a repetição são do domínio. */
const FaixasPedidas = z.array(z.string()).max(1000, { error: 'Use até 50 faixas.' });

const PedidoDeColetor = z
  .object({ nome: NomeDoColetor, faixas: FaixasPedidas.default([]) })
  .meta({ id: 'PedidoDeColetor' });

const PedidoDeAlteracaoDoColetor = z
  .object({ nome: NomeDoColetor.optional(), faixas: FaixasPedidas.optional() })
  .meta({ id: 'PedidoDeAlteracaoDoColetor' });

const ParametrosDoColetor = z.object({ id: z.uuid({ error: 'Coletor não encontrado.' }) });

const coletorNaoEncontrado = () => naoEncontrado('Coletor não encontrado.');

const iso = (momento: Date | null) => (momento ? momento.toISOString() : null);

const comoResposta = (coletor: LinhaDoColetor): z.infer<typeof Coletor> => ({
  id: coletor.id,
  nome: coletor.nome,
  faixas: coletor.faixas,
  situacao: coletor.situacao,
  ultimoContatoEm: iso(coletor.ultimoContatoEm),
  versao: coletor.versao,
  criadoEm: coletor.criadoEm.toISOString(),
});

/** As faixas conferidas pelo domínio, com a recusa no campo das faixas. */
function faixasConferidas(pedidas: readonly string[]): string[] {
  const lidas = lerFaixas(pedidas);
  if (!lidas.ok) throw dadosInvalidos({ faixas: lidas.erro });
  return lidas.faixas;
}

async function lerColetor(tx: Transacao, id: string): Promise<LinhaDoColetor> {
  const [coletor] = await tx.select().from(coletores).where(eq(coletores.id, id)).for('update');
  if (!coletor) throw coletorNaoEncontrado();
  return coletor;
}

const PROBLEMAS_DO_COLETOR = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

export const rotasDosColetores: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.get(
    '/coletores',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Os coletores da organização, pelo nome, com as faixas e o último contato',
        response: { 200: ListaDeColetores, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const linhas = await tx.select().from(coletores).orderBy(asc(coletores.nomeNormalizado));
        return { coletores: linhas.map(comoResposta), permite: { cadastrar: true } };
      }),
  );

  app.post(
    '/coletores',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Cadastrar um coletor, com o token mostrado uma vez',
        body: PedidoDeColetor,
        response: { 201: ColetorComToken, ...PROBLEMAS_DO_COLETOR },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const faixas = faixasConferidas(requisicao.body.faixas);
      const token = novoTokenDoColetor();
      const coletor = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        criarColetor(tx, {
          nome: requisicao.body.nome,
          faixas,
          token,
          ator: { tipo: 'conta', contaId },
          origem: origemDa(requisicao),
          momento: agora(),
        }),
      );
      return resposta.code(201).send({ coletor: comoResposta(coletor), token });
    },
  );

  app.patch(
    '/coletores/:id',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Editar o nome e as faixas de um coletor',
        params: ParametrosDoColetor,
        body: PedidoDeAlteracaoDoColetor,
        response: { 200: Coletor, ...PROBLEMAS_DO_COLETOR },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerColetor(tx, requisicao.params.id);
        const nome = pedido.nome ?? antes.nome;
        const faixas = pedido.faixas ? faixasConferidas(pedido.faixas) : antes.faixas;
        if (nome === antes.nome && faixas.join() === antes.faixas.join()) {
          return comoResposta(antes);
        }
        const [depois] = await semNomeDeColetorRepetido(() =>
          tx
            .update(coletores)
            .set({ nome, nomeNormalizado: normalizarTexto(nome), faixas, atualizadoEm: momento })
            .where(eq(coletores.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O coletor não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'coletor.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'coletor', id: antes.id },
          antes: visaoDoColetor(antes),
          depois: visaoDoColetor(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return comoResposta(depois);
      });
    },
  );

  app.post(
    '/coletores/:id/token',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Trocar o token de um coletor: o anterior para de valer na hora',
        params: ParametrosDoColetor,
        response: { 200: ColetorComToken, ...PROBLEMAS_DO_COLETOR },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      const token = novoTokenDoColetor();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerColetor(tx, requisicao.params.id);
        const [depois] = await tx
          .update(coletores)
          .set({ tokenHash: hashDoToken(token), atualizadoEm: momento })
          .where(eq(coletores.id, antes.id))
          .returning();
        if (!depois) throw new Error('O token do coletor não foi trocado.');
        await registrarNaAuditoria(tx, {
          acao: 'token-do-coletor.trocado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'coletor', id: antes.id },
          origem: origemDa(requisicao),
          momento,
        });
        return { coletor: comoResposta(depois), token };
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'coletor.inativado'],
    ['reativacao', 'ativo', 'coletor.reativado'],
  ] as const) {
    app.post(
      `/coletores/:id/${caminho}`,
      {
        config: { permissao: 'coletores.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um coletor' : 'Reativar um coletor',
          params: ParametrosDoColetor,
          response: { 200: Coletor, ...PROBLEMAS_DO_COLETOR },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerColetor(tx, requisicao.params.id);
          if (antes.situacao === situacao) return comoResposta(antes);
          const [depois] = await tx
            .update(coletores)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(coletores.id, antes.id))
            .returning();
          if (!depois) throw new Error('O coletor não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'coletor', id: antes.id },
            antes: visaoDoColetor(antes),
            depois: visaoDoColetor(depois),
            origem: origemDa(requisicao),
            momento,
          });
          return comoResposta(depois);
        });
      },
    );
  }
};
