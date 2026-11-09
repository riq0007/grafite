// O diretório pela API (spec diretorio-ad; change integracao-ad-ldap, design, decisões 2 e 6): a
// configuração com a conta de serviço do Cofre, o teste da conexão com a configuração da tela e os
// mapeamentos dos grupos do AD, tudo com `diretorio.administrar` e na auditoria, sem a senha.
import {
  type Banco,
  diretorios,
  grupos,
  mapeamentosDoDiretorio,
  naOrganizacao,
  segredos,
  type Transacao,
} from '@grafite/db';
import {
  conferirConfiguracaoDoDiretorio,
  LIMITE_DA_BUSCA_NO_DIRETORIO,
  LIMITE_DA_CONTAGEM_NO_DIRETORIO,
  MENSAGENS_DO_DIRETORIO,
  nomeDoDn,
  normalizarDn,
  textoDaContagem,
} from '@grafite/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { type ChavesDoCofre, SegredoQueNaoAbre } from '../cofre/cifra.ts';
import {
  type ClienteDoDiretorio,
  type ConectarDiretorio,
  FalhaDoDiretorio,
  type GrupoDoDiretorio,
  type UsuarioDoDiretorio,
} from '../diretorio/cliente.ts';
import {
  abrirContaDeServico,
  acessoAoDiretorio,
  certificadoQueAbre,
  lerDiretorio,
  lerMapeamentos,
  serveDeContaDeServico,
} from '../diretorio/diretorio.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  RespostaDeProblema,
} from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Diretorio = z
  .object({
    servidor: z.string(),
    baseDn: z.string(),
    /** A conta de serviço no Cofre, pelo nome; o valor nunca sai da API. */
    conta: z.object({ id: z.uuid(), nome: z.string() }),
    atributoDoUsuario: z.string(),
    filtroDasPessoas: z.string(),
    conferirCertificado: z.boolean(),
    /** A AC da empresa que emite o certificado do LDAPS, em PEM; não é segredo. */
    acDoServidor: z.string().nullable(),
    ligado: z.boolean(),
  })
  .meta({ id: 'Diretorio' });

const MapeamentoDoDiretorio = z
  .object({
    id: z.uuid(),
    grupoDn: z.string(),
    /** O nome do grupo no AD, a primeira parte do DN. */
    nomeNoAd: z.string(),
    grupo: z.object({ id: z.uuid(), nome: z.string() }),
  })
  .meta({ id: 'MapeamentoDoDiretorio' });

const EstadoDoDiretorio = z
  .object({
    diretorio: Diretorio.nullable(),
    mapeamentos: z.array(MapeamentoDoDiretorio),
    /** Os grupos ativos do Grafite, as escolhas do mapeamento, sem exigir `acessos.ver`. */
    grupos: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  })
  .meta({ id: 'EstadoDoDiretorio' });

const PedidoDoDiretorio = z
  .object({
    servidor: z.string(),
    baseDn: z.string(),
    segredoId: z.string().nullable(),
    atributoDoUsuario: z.string().optional(),
    filtroDasPessoas: z.string().optional(),
    conferirCertificado: z.boolean().default(true),
    acDoServidor: z.string().nullable().optional(),
    ligado: z.boolean().default(false),
  })
  .meta({ id: 'PedidoDoDiretorio' });

const ResultadoDoTesteDoDiretorio = z
  .object({ ok: z.boolean(), mensagem: z.string() })
  .meta({ id: 'ResultadoDoTesteDoDiretorio' });

const LoginsDoDiretorio = z
  .object({
    logins: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    motivo: z.string().nullable(),
  })
  .meta({ id: 'LoginsDoDiretorio' });

const PedidoDeMapeamento = z
  .object({
    grupoDn: z.string({ error: 'Escolha o grupo do AD.' }),
    grupoId: z.uuid({ error: 'Escolha o grupo do Grafite.' }),
  })
  .meta({ id: 'PedidoDeMapeamento' });

const ParametrosDoMapeamento = z.object({ id: z.uuid({ error: 'Mapeamento não encontrado.' }) });

/** O grupo do Grafite que o grupo do AD dá, quando ele tem um mapeamento. */
const MapeadoPara = z.object({ id: z.uuid(), nome: z.string() }).nullable();

const GrupoNoDiretorio = z
  .object({ dn: z.string(), nome: z.string(), membros: z.number(), mapeadoPara: MapeadoPara })
  .meta({ id: 'GrupoNoDiretorio' });

const UsuarioNoDiretorio = z
  .object({
    dn: z.string(),
    usuario: z.string(),
    nome: z.string(),
    email: z.string().nullable(),
    ativa: z.boolean(),
    grupos: z.array(z.object({ dn: z.string(), nome: z.string(), mapeadoPara: MapeadoPara })),
  })
  .meta({ id: 'UsuarioNoDiretorio' });

const BuscaNoDiretorio = z.object({
  busca: z.string().max(100, { error: 'Use até 100 caracteres.' }).default(''),
});

const PedidoDeMembro = z
  .object({ usuarioDn: z.string().min(1), grupoDn: z.string().min(1) })
  .meta({ id: 'PedidoDeMembroNoDiretorio' });

const PedidoDeSituacaoNoDiretorio = z
  .object({ dn: z.string().min(1), ativa: z.boolean() })
  .meta({ id: 'PedidoDeSituacaoNoDiretorio' });

const PedidoDeSenhaNoDiretorio = z
  .object({ dn: z.string().min(1), senha: z.string() })
  .meta({ id: 'PedidoDeSenhaNoDiretorio' });

/** A falha do AD na resposta: o que sumiu, 404; o resto, 502, com o motivo em texto. */
function problemaDoDiretorio(falha: FalhaDoDiretorio) {
  if (falha.motivo === 'nao-encontrado') return naoEncontrado(falha.message);
  return new ProblemaDaApi({
    codigo: 'diretorio-falhou',
    status: 502,
    titulo: 'Falha no diretório',
    detalhe: falha.message,
  });
}

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** O diretório e os mapeamentos, como a tela lê. */
export async function estadoDoDiretorio(tx: Transacao) {
  const lido = await lerDiretorio(tx);
  return {
    diretorio: lido
      ? {
          servidor: lido.diretorio.servidor,
          baseDn: lido.diretorio.baseDn,
          conta: { id: lido.diretorio.segredoId, nome: lido.conta?.nome ?? 'Segredo removido' },
          atributoDoUsuario: lido.diretorio.atributoDoUsuario,
          filtroDasPessoas: lido.diretorio.filtroDasPessoas,
          conferirCertificado: lido.diretorio.conferirCertificado,
          acDoServidor: lido.diretorio.acDoServidor,
          ligado: lido.diretorio.ligado,
        }
      : null,
    mapeamentos: await lerMapeamentos(tx),
    grupos: await tx
      .select({ id: grupos.id, nome: grupos.nome })
      .from(grupos)
      .where(eq(grupos.situacao, 'ativo'))
      .orderBy(asc(grupos.nomeNormalizado)),
  };
}

/**
 * O que a auditoria guarda da configuração: a conta de serviço pelo nome, nunca a senha, e só se a
 * AC do servidor foi informada, sem o certificado (change guia-do-diretorio, design, decisão 3).
 */
const visaoDaConfiguracao = (
  diretorio: z.infer<typeof Diretorio> | null,
): Record<string, unknown> | undefined =>
  diretorio
    ? {
        servidor: diretorio.servidor,
        baseDn: diretorio.baseDn,
        contaDeServico: diretorio.conta.nome,
        atributoDoUsuario: diretorio.atributoDoUsuario,
        filtroDasPessoas: diretorio.filtroDasPessoas,
        conferirCertificado: diretorio.conferirCertificado,
        acDoServidor: diretorio.acDoServidor ? 'informada' : 'sem a AC',
        ligado: diretorio.ligado,
      }
    : undefined;

/** A configuração da tela conferida, com o certificado da AC aberto como X.509; senão, o 400. */
function conferirPedido(pedido: z.infer<typeof PedidoDoDiretorio>) {
  const conferida = conferirConfiguracaoDoDiretorio(pedido);
  if (!conferida.ok) throw dadosInvalidos(conferida.campos);
  const { acDoServidor } = conferida.configuracao;
  if (acDoServidor && !certificadoQueAbre(acDoServidor)) {
    throw dadosInvalidos({ acDoServidor: MENSAGENS_DO_DIRETORIO.acDoServidor });
  }
  return conferida.configuracao;
}

export const rotasDoDiretorio: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  chavesDoCofre: ChavesDoCofre;
  conectar: ConectarDiretorio;
}> = async (app, { banco, agora, chavesDoCofre, conectar }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';
  const cofreLigado = async (orgId: string) =>
    !(await modulosDesligados(banco, orgId)).includes('cofre');

  app.get(
    '/diretorio',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'O diretório da organização e os mapeamentos dos grupos',
        response: { 200: EstadoDoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => naOrganizacao(banco, orgDa(requisicao), estadoDoDiretorio),
  );

  // Os logins do Cofre que servem de conta de serviço: o id e o nome, nunca o valor.
  app.get(
    '/diretorio/logins',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Os logins do Cofre que servem de conta de serviço do diretório',
        response: { 200: LoginsDoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const orgId = orgDa(requisicao);
      if (!(await cofreLigado(orgId))) {
        return { logins: [], motivo: MENSAGENS_DO_DIRETORIO.cofreDesligado };
      }
      const logins = await naOrganizacao(banco, orgId, (tx) =>
        tx
          .select({ id: segredos.id, nome: segredos.nome })
          .from(segredos)
          .where(serveDeContaDeServico)
          .orderBy(asc(segredos.nomeNormalizado)),
      );
      return { logins, motivo: null };
    },
  );

  app.put(
    '/diretorio',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Gravar o diretório da organização',
        body: PedidoDoDiretorio,
        response: { 200: EstadoDoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const orgId = orgDa(requisicao);
      const configuracao = conferirPedido(requisicao.body);
      const momento = agora();
      const ligado = await cofreLigado(orgId);
      return naOrganizacao(banco, orgId, async (tx) => {
        const antes = await estadoDoDiretorio(tx);
        if (antes.diretorio?.conta.id !== configuracao.segredoId) {
          if (!ligado) throw dadosInvalidos({ segredoId: MENSAGENS_DO_DIRETORIO.cofreDesligado });
          const [segredo] = await tx
            .select({ id: segredos.id })
            .from(segredos)
            .where(and(eq(segredos.id, configuracao.segredoId), serveDeContaDeServico));
          if (!segredo) throw dadosInvalidos({ segredoId: MENSAGENS_DO_DIRETORIO.contaDeServico });
        }
        const [gravado] = antes.diretorio
          ? await tx
              .update(diretorios)
              .set({ ...configuracao, atualizadoEm: momento })
              .returning({ id: diretorios.id })
          : await tx
              .insert(diretorios)
              .values({ orgId, ...configuracao, criadoEm: momento, atualizadoEm: momento })
              .returning({ id: diretorios.id });
        const depois = await estadoDoDiretorio(tx);
        await registrarNaAuditoria(tx, {
          acao: 'diretorio.configurado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'diretorio', id: gravado?.id ?? null },
          antes: visaoDaConfiguracao(antes.diretorio),
          depois: visaoDaConfiguracao(depois.diretorio),
          origem: origemDa(requisicao),
          momento,
        });
        return depois;
      });
    },
  );

  // O teste usa a configuração da tela, mesmo antes de gravada; nada vai para a auditoria.
  app.post(
    '/diretorio/teste',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Testar a conexão com o diretório, com a configuração da tela',
        body: PedidoDoDiretorio,
        response: { 200: ResultadoDoTesteDoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const orgId = orgDa(requisicao);
      const configuracao = conferirPedido(requisicao.body);
      let conta: { usuario: string; senha: string } | null;
      try {
        conta = await naOrganizacao(banco, orgId, (tx) =>
          abrirContaDeServico(tx, {
            orgId,
            segredoId: configuracao.segredoId,
            chaves: chavesDoCofre,
          }),
        );
      } catch (erro) {
        if (erro instanceof SegredoQueNaoAbre) return { ok: false, mensagem: erro.message };
        throw erro;
      }
      if (!conta) throw dadosInvalidos({ segredoId: MENSAGENS_DO_DIRETORIO.contaDeServico });
      try {
        const quantos = await conectar(acessoAoDiretorio(configuracao, conta)).contarUsuarios(
          LIMITE_DA_CONTAGEM_NO_DIRETORIO,
        );
        return { ok: true, mensagem: textoDaContagem(quantos) };
      } catch (erro) {
        if (erro instanceof FalhaDoDiretorio) return { ok: false, mensagem: erro.message };
        throw erro;
      }
    },
  );

  app.post(
    '/diretorio/mapeamentos',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Ligar um grupo do AD a um grupo do Grafite',
        body: PedidoDeMapeamento,
        response: { 201: MapeamentoDoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const orgId = orgDa(requisicao);
      const grupoDn = requisicao.body.grupoDn.trim();
      if (!grupoDn.includes('=')) throw dadosInvalidos({ grupoDn: 'Escolha o grupo do AD.' });
      const momento = agora();
      const criado = await naOrganizacao(banco, orgId, async (tx) => {
        const [grupo] = await tx
          .select({ id: grupos.id, nome: grupos.nome })
          .from(grupos)
          .where(and(eq(grupos.id, requisicao.body.grupoId), eq(grupos.situacao, 'ativo')));
        if (!grupo) throw dadosInvalidos({ grupoId: 'Escolha um grupo ativo do Grafite.' });
        let id: string | undefined;
        try {
          [{ id } = { id: undefined }] = await tx
            .insert(mapeamentosDoDiretorio)
            .values({
              orgId,
              grupoDn,
              grupoDnNormalizado: normalizarDn(grupoDn),
              grupoId: grupo.id,
              criadoEm: momento,
            })
            .returning({ id: mapeamentosDoDiretorio.id });
        } catch (erro) {
          if (violouUnicidade(erro, 'mapeamentos_do_diretorio_grupo_unico')) {
            throw conflito('Este grupo do AD já tem um mapeamento.', {
              grupoDn: 'Este grupo do AD já tem um mapeamento.',
            });
          }
          throw erro;
        }
        await registrarNaAuditoria(tx, {
          acao: 'diretorio.mapeamento-criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'mapeamento-do-diretorio', id: id ?? null },
          dados: { grupoDn, grupo: grupo.nome },
          origem: origemDa(requisicao),
          momento,
        });
        const mapeamento = (await lerMapeamentos(tx)).find((lido) => lido.id === id);
        if (!mapeamento) throw new Error('O mapeamento gravado sumiu.');
        return mapeamento;
      });
      return resposta.code(201).send(criado);
    },
  );

  app.delete(
    '/diretorio/mapeamentos/:id',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Remover o mapeamento de um grupo do AD',
        params: ParametrosDoMapeamento,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const [removido] = await tx
          .delete(mapeamentosDoDiretorio)
          .where(eq(mapeamentosDoDiretorio.id, requisicao.params.id))
          .returning();
        if (!removido) throw naoEncontrado('Mapeamento não encontrado.');
        const [grupo] = await tx
          .select({ nome: grupos.nome })
          .from(grupos)
          .where(eq(grupos.id, removido.grupoId));
        await registrarNaAuditoria(tx, {
          acao: 'diretorio.mapeamento-removido',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'mapeamento-do-diretorio', id: removido.id },
          dados: { grupoDn: removido.grupoDn, grupo: grupo?.nome ?? null },
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(204).send(null);
    },
  );

  /**
   * Abre o cliente do diretório gravado, com a conta de serviço do Cofre, e faz o pedido: sem o
   * diretório, 409; a falha do AD, com o motivo. Os mapeamentos vêm junto, para dizer o grupo do
   * Grafite de cada grupo do AD.
   */
  async function noDiretorio<T>(
    requisicao: FastifyRequest,
    fazer: (
      cliente: ClienteDoDiretorio,
      contexto: {
        servidor: string;
        mapeadoPara: (dn: string) => { id: string; nome: string } | null;
      },
    ) => Promise<T>,
  ): Promise<T> {
    const orgId = orgDa(requisicao);
    const preparo = await naOrganizacao(banco, orgId, async (tx) => {
      const lido = await lerDiretorio(tx);
      if (!lido) {
        throw new ProblemaDaApi({
          codigo: 'diretorio-nao-configurado',
          status: 409,
          titulo: 'Diretório não configurado',
          detalhe: MENSAGENS_DO_DIRETORIO.naoConfigurado,
        });
      }
      let conta: { usuario: string; senha: string } | null;
      try {
        conta = await abrirContaDeServico(tx, {
          orgId,
          segredoId: lido.diretorio.segredoId,
          chaves: chavesDoCofre,
        });
      } catch (erro) {
        if (erro instanceof SegredoQueNaoAbre) throw conflito(erro.message);
        throw erro;
      }
      if (!conta) throw conflito(MENSAGENS_DO_DIRETORIO.contaDeServico);
      return {
        acesso: acessoAoDiretorio(lido.diretorio, conta),
        mapeamentos: await lerMapeamentos(tx),
      };
    });
    const porDn = new Map(
      preparo.mapeamentos.map((mapeamento) => [normalizarDn(mapeamento.grupoDn), mapeamento.grupo]),
    );
    try {
      return await fazer(conectar(preparo.acesso), {
        servidor: preparo.acesso.servidor,
        mapeadoPara: (dn) => porDn.get(normalizarDn(dn)) ?? null,
      });
    } catch (erro) {
      if (erro instanceof FalhaDoDiretorio) throw problemaDoDiretorio(erro);
      throw erro;
    }
  }

  type MapeadoParaO = (dn: string) => { id: string; nome: string } | null;

  const usuarioNaTela = (usuario: UsuarioDoDiretorio, mapeadoPara: MapeadoParaO) => ({
    ...usuario,
    grupos: usuario.grupos.map((dn) => ({ dn, nome: nomeDoDn(dn), mapeadoPara: mapeadoPara(dn) })),
  });

  const grupoNaTela = (grupo: GrupoDoDiretorio, mapeadoPara: MapeadoParaO) => ({
    ...grupo,
    mapeadoPara: mapeadoPara(grupo.dn),
  });

  /** Uma mudança no AD na auditoria, depois de feita, com os DNs e sem senha. */
  async function auditarNoAd(
    requisicao: FastifyRequest,
    acao:
      | 'diretorio.membro-incluido'
      | 'diretorio.membro-retirado'
      | 'diretorio.conta-ativada'
      | 'diretorio.conta-desativada'
      | 'diretorio.senha-redefinida',
    dados: Record<string, string>,
  ) {
    const { contaId } = sessaoDa(requisicao);
    await naOrganizacao(banco, orgDa(requisicao), (tx) =>
      registrarNaAuditoria(tx, {
        acao,
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'diretorio' },
        dados,
        origem: origemDa(requisicao),
        momento: agora(),
      }),
    );
  }

  /** O usuário como ficou depois da mudança. */
  async function usuarioDepois(cliente: ClienteDoDiretorio, dn: string, mapeadoPara: MapeadoParaO) {
    const usuario = await cliente.usuario(dn);
    if (!usuario) throw new FalhaDoDiretorio('nao-encontrado');
    return usuarioNaTela(usuario, mapeadoPara);
  }

  app.get(
    '/diretorio/usuarios',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Buscar os usuários do AD pelo usuário, pelo nome ou pelo e-mail',
        querystring: BuscaNoDiretorio,
        response: { 200: z.object({ usuarios: z.array(UsuarioNoDiretorio) }), ...PROBLEMAS },
      },
    },
    (requisicao) =>
      noDiretorio(requisicao, async (cliente, { mapeadoPara }) => ({
        usuarios: (
          await cliente.buscarUsuarios(requisicao.query.busca, LIMITE_DA_BUSCA_NO_DIRETORIO)
        ).map((usuario) => usuarioNaTela(usuario, mapeadoPara)),
      })),
  );

  app.get(
    '/diretorio/grupos',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Buscar os grupos do AD pelo nome',
        querystring: BuscaNoDiretorio,
        response: { 200: z.object({ grupos: z.array(GrupoNoDiretorio) }), ...PROBLEMAS },
      },
    },
    (requisicao) =>
      noDiretorio(requisicao, async (cliente, { mapeadoPara }) => ({
        grupos: (
          await cliente.buscarGrupos(requisicao.query.busca, LIMITE_DA_BUSCA_NO_DIRETORIO)
        ).map((grupo) => grupoNaTela(grupo, mapeadoPara)),
      })),
  );

  app.get(
    '/diretorio/membros',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'O grupo do AD e os membros dele',
        querystring: z.object({ grupo: z.string().min(1, { error: 'Escolha o grupo do AD.' }) }),
        response: {
          200: z.object({ grupo: GrupoNoDiretorio, membros: z.array(UsuarioNoDiretorio) }),
          ...PROBLEMAS,
        },
      },
    },
    (requisicao) =>
      noDiretorio(requisicao, async (cliente, { mapeadoPara }) => {
        const grupo = await cliente.grupo(requisicao.query.grupo);
        if (!grupo) throw new FalhaDoDiretorio('nao-encontrado');
        const membros = await cliente.membros(grupo.dn, 500);
        return {
          grupo: grupoNaTela(grupo, mapeadoPara),
          membros: membros.map((usuario) => usuarioNaTela(usuario, mapeadoPara)),
        };
      }),
  );

  app.post(
    '/diretorio/membros',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Incluir um usuário num grupo do AD, como liberar o acesso',
        body: PedidoDeMembro,
        response: { 200: UsuarioNoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { usuarioDn, grupoDn } = requisicao.body;
      const usuario = await noDiretorio(requisicao, async (cliente, { mapeadoPara }) => {
        await cliente.incluirNoGrupo(usuarioDn, grupoDn);
        return usuarioDepois(cliente, usuarioDn, mapeadoPara);
      });
      await auditarNoAd(requisicao, 'diretorio.membro-incluido', { usuarioDn, grupoDn });
      return usuario;
    },
  );

  app.post(
    '/diretorio/membros/retirada',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Tirar um usuário de um grupo do AD',
        body: PedidoDeMembro,
        response: { 200: UsuarioNoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { usuarioDn, grupoDn } = requisicao.body;
      const usuario = await noDiretorio(requisicao, async (cliente, { mapeadoPara }) => {
        await cliente.tirarDoGrupo(usuarioDn, grupoDn);
        return usuarioDepois(cliente, usuarioDn, mapeadoPara);
      });
      await auditarNoAd(requisicao, 'diretorio.membro-retirado', { usuarioDn, grupoDn });
      return usuario;
    },
  );

  app.post(
    '/diretorio/usuarios/situacao',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Ativar ou desativar a conta de um usuário no AD',
        body: PedidoDeSituacaoNoDiretorio,
        response: { 200: UsuarioNoDiretorio, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { dn, ativa } = requisicao.body;
      const usuario = await noDiretorio(requisicao, async (cliente, { mapeadoPara }) => {
        await cliente.mudarSituacao(dn, ativa);
        return usuarioDepois(cliente, dn, mapeadoPara);
      });
      await auditarNoAd(
        requisicao,
        ativa ? 'diretorio.conta-ativada' : 'diretorio.conta-desativada',
        { dn },
      );
      return usuario;
    },
  );

  // A senha nova vai só para o AD, pelo LDAPS, e não fica guardada em lugar nenhum.
  app.post(
    '/diretorio/usuarios/senha',
    {
      config: { permissao: 'diretorio.administrar' },
      schema: {
        summary: 'Redefinir a senha de um usuário no AD, pelo LDAPS',
        body: PedidoDeSenhaNoDiretorio,
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { dn, senha } = requisicao.body;
      if (senha === '') throw dadosInvalidos({ senha: 'Informe a senha nova.' });
      await noDiretorio(requisicao, async (cliente, { servidor }) => {
        if (!servidor.toLowerCase().startsWith('ldaps://')) {
          throw conflito(MENSAGENS_DO_DIRETORIO.senhaSoComLdaps);
        }
        await cliente.redefinirSenha(dn, senha);
      });
      await auditarNoAd(requisicao, 'diretorio.senha-redefinida', { dn });
      return resposta.code(204).send(null);
    },
  );
};
