// As contas pela administração (spec administracao-de-pessoas; design do F2b, decisão 11): criar a
// conta de uma pessoa ativa, com a senha temporária mostrada uma vez, mudar o usuário e a exigência
// dos dois passos e cuidar da conta de outra pessoa. A própria conta se cuida nos Ajustes.
import {
  type Banco,
  contas,
  naOrganizacao,
  pessoas,
  type Transacao,
  tentativasDeEntrada,
} from '@grafite/db';
import {
  type ArvoreDeLocais,
  descreverDispositivo,
  normalizarUsuario,
  validarUsuario,
} from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { mudarAcessos } from '../acesso/administradores.ts';
import { gerarSenhaTemporaria } from '../acesso/codigos.ts';
import { ContaDaFicha, lerContaDaFicha } from '../acesso/conta-administrada.ts';
import { comCredenciais } from '../acesso/credenciais.ts';
import { apagarDoisPassos } from '../acesso/dois-passos.ts';
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { exigirEm, sessaoDa } from '../acesso/escopo.ts';
import { inativarConta } from '../acesso/inativacao.ts';
import { redefinirConta, zerarTentativas } from '../acesso/redefinicao.ts';
import { gerarHashDaSenha } from '../acesso/senhas.ts';
import { lerSessoesAbertas } from '../acesso/sessoes.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria, visaoDaConta } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  propriaConta,
  RespostaDeProblema,
} from '../problemas.ts';
import { COLUNAS_DA_PESSOA, contaDaPessoa, lerPessoa } from './pessoas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PedidoDeConta = z
  .object({
    usuario: z.string({ error: 'Informe o usuário.' }),
    exigeDoisPassos: z.boolean().default(false),
  })
  .meta({ id: 'PedidoDeConta' });

const PedidoDeAlteracaoDaConta = z
  .object({ usuario: z.string().optional(), exigeDoisPassos: z.boolean().optional() })
  .meta({ id: 'PedidoDeAlteracaoDaConta' });

const ContaComSenhaTemporaria = z
  .object({
    conta: ContaDaFicha,
    /** Mostrada uma vez só: a API guarda só o hash dela. */
    senhaTemporaria: z.string(),
  })
  .meta({ id: 'ContaComSenhaTemporaria' });

const PedidoDeRedefinicao = z
  .object({
    /** Remove também a verificação em dois passos, como quando a pessoa perde o celular. */
    removerDoisPassos: z.boolean().default(false),
  })
  .meta({ id: 'PedidoDeRedefinicao' });

const SessaoAdministrada = z
  .object({
    id: z.uuid(),
    /** O navegador e o sistema, como "Chrome no Windows". */
    dispositivo: z.string(),
    ip: z.string().nullable(),
    criadaEm: z.iso.datetime(),
    ultimoUsoEm: z.iso.datetime(),
  })
  .meta({ id: 'SessaoAdministrada' });

const SessoesEncerradas = z
  .object({ encerradas: z.number().int().min(0) })
  .meta({ id: 'SessoesEncerradas' });

const ParametrosDaPessoa = z.object({ id: z.uuid({ error: 'Pessoa não encontrada.' }) });
const ParametrosDaConta = z.object({ id: z.uuid({ error: 'Conta não encontrada.' }) });

const USUARIO_REPETIDO = 'Este usuário já é de outra conta.';
const JA_TEM_CONTA = 'Esta pessoa já tem uma conta.';
export const CUIDE_DA_SUA = 'Cuide da sua conta na seção Conta dos Ajustes.';
const INATIVE_COM_OUTRA = 'Use outra conta para inativar a sua.';

const PROBLEMAS_DA_CONTA = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

const RESPOSTAS_DA_CONTA = { 200: ContaDaFicha, ...PROBLEMAS_DA_CONTA };

/** O usuário pela regra, como o banco o guarda. */
function usuarioPelaRegra(digitado: string): string {
  const motivo = validarUsuario(digitado);
  if (motivo) throw dadosInvalidos({ usuario: motivo });
  return normalizarUsuario(digitado);
}

/** Grava a conta; o usuário de outra conta vira a recusa no campo, mesmo numa corrida. */
async function semUsuarioRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'contas_usuario_unico')) {
      throw conflito(USUARIO_REPETIDO, { usuario: USUARIO_REPETIDO });
    }
    if (violouUnicidade(erro, 'contas_pessoa_unica')) throw conflito(JA_TEM_CONTA);
    throw erro;
  }
}

/**
 * A conta de outra pessoa, com a permissão conferida no local da pessoa. A própria conta e a
 * anonimizada são recusadas.
 */
export async function contaDeOutraPessoa(
  tx: Transacao,
  requisicao: FastifyRequest,
  contaId: string,
  arvore: ArvoreDeLocais,
  mensagemDaPropria: string,
) {
  const [linha] = await tx
    .select(COLUNAS_DA_PESSOA)
    .from(pessoas)
    .innerJoin(contas, contaDaPessoa)
    .where(eq(contas.id, contaId));
  if (!linha) throw naoEncontrado('Conta não encontrada.');
  exigirEm(requisicao, 'contas.administrar', linha.pessoa.localId, arvore);
  if (linha.conta.id === sessaoDa(requisicao).contaId) throw propriaConta(mensagemDaPropria);
  if (linha.conta.situacao === 'anonimizada') {
    throw conflito('Esta conta foi anonimizada e não muda mais.');
  }
  return linha;
}

export const rotasDasContas: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.post(
    '/pessoas/:id/conta',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Criar a conta de uma pessoa, com uma senha temporária',
        params: ParametrosDaPessoa,
        body: PedidoDeConta,
        response: { 201: ContaComSenhaTemporaria, ...PROBLEMAS_DA_CONTA },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const usuario = usuarioPelaRegra(requisicao.body.usuario);
      const senhaTemporaria = gerarSenhaTemporaria();
      const hashSenha = await gerarHashDaSenha(senhaTemporaria);
      const momento = agora();
      const conta = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await lerPessoa(tx, requisicao.params.id);
        exigirEm(requisicao, 'contas.administrar', linha.pessoa.localId, arvore);
        if (linha.pessoa.situacao === 'anonimizada') {
          throw conflito('Esta pessoa foi anonimizada e não muda mais.');
        }
        if (linha.pessoa.situacao !== 'ativa') {
          throw conflito('Reative a pessoa antes de criar a conta dela.');
        }
        if (linha.conta) throw conflito(JA_TEM_CONTA);
        const [criada] = await semUsuarioRepetido(() =>
          tx
            .insert(contas)
            .values({
              orgId: sql`app.current_org()`,
              pessoaId: linha.pessoa.id,
              usuario,
              hashSenha,
              senhaTemporaria: true,
              exigeDoisPassos: requisicao.body.exigeDoisPassos,
              criadaEm: momento,
              atualizadaEm: momento,
            })
            .returning(),
        );
        if (!criada) throw new Error('A conta não foi criada.');
        await registrarNaAuditoria(tx, {
          acao: 'conta.criada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'conta', id: criada.id },
          depois: visaoDaConta(criada),
          origem: origemDa(requisicao),
          momento,
          saida: await saidaDaConta(tx, criada.id),
        });
        return lerContaDaFicha(tx, criada.id, { sessao, pessoaAtiva: true, momento });
      });
      return resposta.code(201).send({ conta, senhaTemporaria });
    },
  );

  app.patch(
    '/contas/:id',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Mudar o usuário de uma conta ou a exigência dos dois passos',
        params: ParametrosDaConta,
        body: PedidoDeAlteracaoDaConta,
        response: RESPOSTAS_DA_CONTA,
      },
    },
    async (requisicao) => {
      const sessao = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const usuario = pedido.usuario === undefined ? undefined : usuarioPelaRegra(pedido.usuario);
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const arvore = await lerArvore(tx);
        const linha = await contaDeOutraPessoa(
          tx,
          requisicao,
          requisicao.params.id,
          arvore,
          CUIDE_DA_SUA,
        );
        const ficha = () =>
          lerContaDaFicha(tx, linha.conta.id, {
            sessao,
            pessoaAtiva: linha.pessoa.situacao === 'ativa',
            momento,
          });
        const [antes] = await tx.select().from(contas).where(eq(contas.id, linha.conta.id));
        if (!antes) throw new Error('A conta sumiu.');
        const novos = {
          usuario: usuario ?? antes.usuario,
          exigeDoisPassos: pedido.exigeDoisPassos ?? antes.exigeDoisPassos,
        };
        if (novos.usuario === antes.usuario && novos.exigeDoisPassos === antes.exigeDoisPassos) {
          return ficha();
        }
        const [depois] = await semUsuarioRepetido(() =>
          tx
            .update(contas)
            .set({ ...novos, atualizadaEm: momento })
            .where(eq(contas.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('A conta não foi alterada.');
        await registrarNaAuditoria(tx, {
          acao: 'conta.alterada',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          alvo: { tipo: 'conta', id: antes.id },
          antes: visaoDaConta(antes),
          depois: visaoDaConta(depois),
          origem: origemDa(requisicao),
          momento,
          saida: await saidaDaConta(tx, antes.id),
        });
        return ficha();
      });
    },
  );

  /**
   * Um cuidado com a conta de outra pessoa: a conta é lida e conferida, `fazer` grava o que muda e
   * a resposta é a conta como ficou.
   */
  function cuidarDaConta<T>(
    requisicao: FastifyRequest,
    contaId: string,
    fazer: (contexto: {
      tx: Transacao;
      conta: typeof contas.$inferSelect;
      pessoaAtiva: boolean;
      momento: Date;
      ator: { tipo: 'conta'; contaId: string };
    }) => Promise<T>,
    {
      mensagemDaPropria = CUIDE_DA_SUA,
      protegerAdministradores = false,
    }: {
      mensagemDaPropria?: string;
      /** A mudança pode tirar alguém da administração dos acessos: roda na trava `acessos`. */
      protegerAdministradores?: boolean;
    } = {},
  ) {
    const sessao = sessaoDa(requisicao);
    const momento = agora();
    const rodar = protegerAdministradores ? mudarAcessos : naOrganizacao;
    return rodar(banco, requisicao.organizacao?.id ?? '', async (tx) => {
      const arvore = await lerArvore(tx);
      const linha = await contaDeOutraPessoa(tx, requisicao, contaId, arvore, mensagemDaPropria);
      const [conta] = await tx.select().from(contas).where(eq(contas.id, linha.conta.id));
      if (!conta) throw new Error('A conta sumiu.');
      const resultado = await fazer({
        tx,
        conta,
        pessoaAtiva: linha.pessoa.situacao === 'ativa',
        momento,
        ator: { tipo: 'conta', contaId: sessao.contaId },
      });
      const ficha = await lerContaDaFicha(tx, conta.id, {
        sessao,
        pessoaAtiva: linha.pessoa.situacao === 'ativa',
        momento,
      });
      return { ficha, resultado };
    });
  }

  app.post(
    '/contas/:id/redefinicao',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Redefinir a senha de uma conta, com uma senha temporária nova',
        params: ParametrosDaConta,
        body: PedidoDeRedefinicao,
        response: { ...RESPOSTAS_DA_CONTA, 200: ContaComSenhaTemporaria },
      },
    },
    async (requisicao) => {
      const senhaTemporaria = gerarSenhaTemporaria();
      const hashSenha = await gerarHashDaSenha(senhaTemporaria);
      const { ficha } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        ({ tx, conta, momento, ator }) =>
          redefinirConta(tx, {
            conta: comCredenciais(conta),
            hashSenha,
            removerDoisPassos: requisicao.body.removerDoisPassos,
            ator,
            origem: origemDa(requisicao),
            momento,
          }),
      );
      return { conta: ficha, senhaTemporaria };
    },
  );

  app.post(
    '/contas/:id/remocao-dos-dois-passos',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Remover a verificação em dois passos de uma conta, encerrando as sessões',
        params: ParametrosDaConta,
        response: RESPOSTAS_DA_CONTA,
      },
    },
    async (requisicao) => {
      const origem = origemDa(requisicao);
      const { ficha } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        async ({ tx, conta, momento, ator }) => {
          if (!(await apagarDoisPassos(tx, conta.id))) return;
          const sessoesEncerradas = await encerrarSessoesDaConta(tx, {
            contaId: conta.id,
            motivo: 'dois-passos-removidos',
            momento,
            ator,
            origem,
          });
          await registrarNaAuditoria(tx, {
            acao: 'dois-passos.removidos',
            ator,
            alvo: { tipo: 'conta', id: conta.id },
            dados: { sessoesEncerradas },
            origem,
            momento,
            saida: await saidaDaConta(tx, conta.id),
          });
        },
      );
      return ficha;
    },
  );

  app.post(
    '/contas/:id/desbloqueio',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Desbloquear a entrada de uma conta, zerando as tentativas erradas',
        params: ParametrosDaConta,
        response: RESPOSTAS_DA_CONTA,
      },
    },
    async (requisicao) => {
      const { ficha } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        async ({ tx, conta, momento, ator }) => {
          const usuario = comCredenciais(conta).usuario;
          const [tentativa] = await tx
            .select()
            .from(tentativasDeEntrada)
            .where(eq(tentativasDeEntrada.usuario, usuario));
          if (!tentativa || (tentativa.falhasSeguidas === 0 && tentativa.bloqueadaAte === null)) {
            return;
          }
          await zerarTentativas(tx, usuario, momento);
          await registrarNaAuditoria(tx, {
            acao: 'entrada.desbloqueada',
            ator,
            alvo: { tipo: 'conta', id: conta.id },
            dados: {
              falhasSeguidas: tentativa.falhasSeguidas,
              bloqueadaAte: tentativa.bloqueadaAte?.toISOString() ?? null,
            },
            origem: origemDa(requisicao),
            momento,
            saida: await saidaDaConta(tx, conta.id),
          });
        },
      );
      return ficha;
    },
  );

  app.post(
    '/contas/:id/inativacao',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Inativar a conta de outra pessoa, encerrando as sessões',
        params: ParametrosDaConta,
        response: RESPOSTAS_DA_CONTA,
      },
    },
    async (requisicao) => {
      const { ficha } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        async ({ tx, conta, momento, ator }) => {
          if (conta.situacao !== 'ativa') return;
          await inativarConta(tx, {
            contaId: conta.id,
            ator,
            origem: origemDa(requisicao),
            momento,
          });
        },
        { mensagemDaPropria: INATIVE_COM_OUTRA, protegerAdministradores: true },
      );
      return ficha;
    },
  );

  app.post(
    '/contas/:id/reativacao',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Reativar a conta de uma pessoa ativa',
        params: ParametrosDaConta,
        response: RESPOSTAS_DA_CONTA,
      },
    },
    async (requisicao) => {
      const { ficha } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        async ({ tx, conta, pessoaAtiva, momento, ator }) => {
          if (conta.situacao === 'ativa') return;
          if (!pessoaAtiva) throw conflito('Reative a pessoa antes de reativar a conta dela.');
          const [depois] = await tx
            .update(contas)
            .set({ situacao: 'ativa', atualizadaEm: momento })
            .where(eq(contas.id, conta.id))
            .returning();
          if (!depois) throw new Error('A conta não foi reativada.');
          await registrarNaAuditoria(tx, {
            acao: 'conta.reativada',
            ator,
            alvo: { tipo: 'conta', id: conta.id },
            antes: visaoDaConta(conta),
            depois: visaoDaConta(depois),
            origem: origemDa(requisicao),
            momento,
            saida: await saidaDaConta(tx, conta.id),
          });
        },
      );
      return ficha;
    },
  );

  app.get(
    '/contas/:id/sessoes',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'As sessões abertas da conta de outra pessoa',
        params: ParametrosDaConta,
        response: {
          ...RESPOSTAS_DA_CONTA,
          200: z.array(SessaoAdministrada),
        },
      },
    },
    async (requisicao) => {
      const { resultado } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        ({ tx, conta, momento }) => lerSessoesAbertas(tx, conta.id, momento),
      );
      return resultado.map((sessao) => ({
        id: sessao.id,
        dispositivo: descreverDispositivo(sessao.agente),
        ip: sessao.ip,
        criadaEm: sessao.criadaEm.toISOString(),
        ultimoUsoEm: sessao.ultimoUsoEm.toISOString(),
      }));
    },
  );

  app.delete(
    '/contas/:id/sessoes',
    {
      config: { permissao: 'contas.administrar' },
      schema: {
        summary: 'Encerrar todas as sessões da conta de outra pessoa',
        params: ParametrosDaConta,
        response: { ...RESPOSTAS_DA_CONTA, 200: SessoesEncerradas },
      },
    },
    async (requisicao) => {
      const origem = origemDa(requisicao);
      const { resultado } = await cuidarDaConta(
        requisicao,
        requisicao.params.id,
        async ({ tx, conta, momento, ator }) => {
          const encerradas = await encerrarSessoesDaConta(tx, {
            contaId: conta.id,
            motivo: 'encerrada-pela-administracao',
            momento,
            ator,
            origem,
          });
          await registrarNaAuditoria(tx, {
            acao: 'sessoes.encerradas',
            ator,
            alvo: { tipo: 'conta', id: conta.id },
            dados: { encerradas },
            origem,
            momento,
            saida: await saidaDaConta(tx, conta.id),
          });
          return encerradas;
        },
      );
      return { encerradas: resultado };
    },
  );
};
