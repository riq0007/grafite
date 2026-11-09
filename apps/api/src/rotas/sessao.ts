// As rotas da sessão (design do F2a, decisão 8): o estado da sessão neste endereço e a entrada com
// usuário e senha. A recusa é a mesma para usuário inexistente, senha errada e conta inativa, e a
// auditoria guarda o motivo real; o bloqueio progressivo conta por usuário digitado.
import {
  type Banco,
  contas,
  doisPassos,
  naOrganizacao,
  organizacoes,
  pessoas,
  type Transacao,
  tentativasDeEntrada,
} from '@grafite/db';
import {
  type AjustesDasPreferencias as Ajustes,
  AMBIENTES,
  bloqueioDepois,
  lerAjustes,
  listarPermissoes,
  MENSAGENS_DO_DIRETORIO,
  mensagemDoBloqueio,
  normalizarUsuario,
  PERMISSOES,
  type Permissao,
} from '@grafite/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carregarAcesso, exigeDoisPassos } from '../acesso/acesso.ts';
import { comCredenciais } from '../acesso/credenciais.ts';
import { encerrarSessao } from '../acesso/encerramento.ts';
import { concluirEntrada } from '../acesso/entrada.ts';
import { exigirSessao } from '../acesso/escopo.ts';
import { pendenciaDa } from '../acesso/pendencia.ts';
import { conferirSenha, gerarHashDaSenha, precisaRegravar } from '../acesso/senhas.ts';
import {
  apagarCookieDaSessao,
  criarSessao,
  gravarCookieDaSessao,
  type SessaoDaRequisicao,
} from '../acesso/sessoes.ts';
import { FotoDaPessoa } from '../arquivos/esquemas.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { ChavesDoCofre } from '../cofre/cifra.ts';
import type { ConectarDiretorio } from '../diretorio/cliente.ts';
import { conferirNoDiretorio, contaPeloDiretorio } from '../diretorio/entrada.ts';
import { AjustesDasPreferencias } from '../preferencias/esquemas.ts';
import { enviarProblema, ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { LIMITE_DA_ENTRADA } from '../protecao.ts';

export const PENDENCIAS = ['segundo-passo', 'trocar-senha', 'cadastrar-dois-passos'] as const;

const CHAVES = PERMISSOES.map((p) => p.chave) as [Permissao, ...Permissao[]];

/** O acesso efetivo da conta: cada permissão com o escopo, a organização inteira ou os ramos. */
export const AcessoDaSessao = z
  .object({
    permissoes: z.array(
      z.object({
        chave: z.enum(CHAVES),
        organizacao: z.boolean(),
        /** As raízes dos ramos em que a permissão vale. */
        locais: z.array(z.uuid()),
      }),
    ),
  })
  .meta({ id: 'AcessoDaSessao' });

/**
 * O estado da sessão neste endereço, que a web consulta na chegada e recebe depois de cada passo:
 * os padrões da organização sempre, e a conta, a pessoa, a foto e as preferências dela só com a
 * sessão que vale.
 */
export const EstadoDaSessao = z
  .object({
    /** O ambiente da configuração: no teste, a tela de entrada e a barra avisam. */
    ambiente: z.enum(AMBIENTES),
    organizacao: z.object({
      nome: z.string(),
      preferencias: AjustesDasPreferencias,
      /** A organização opera o servidor: só nela existe a tela de backup. */
      operaOServidor: z.boolean(),
      /** Os módulos opcionais que a organização desligou: a casca não os mostra. */
      modulosDesligados: z.array(z.string()),
    }),
    sessao: z
      .object({
        conta: z.object({
          /** Nulos enquanto a sessão está pendente. */
          id: z.uuid().nullable(),
          usuario: z.string(),
          nome: z.string(),
          pessoaId: z.uuid().nullable(),
          foto: FotoDaPessoa.nullable(),
          /** Só os campos que a conta mudou, por cima dos padrões da organização. */
          preferencias: AjustesDasPreferencias.nullable(),
        }),
        pendencia: z.enum(PENDENCIAS).nullable(),
        /** O token das escritas, no cabeçalho x-grafite-csrf. */
        csrf: z.string(),
        expiraEm: z.iso.datetime(),
        /** Vazio enquanto a sessão está pendente. */
        acesso: AcessoDaSessao,
      })
      .nullable(),
  })
  .meta({ id: 'EstadoDaSessao' });

const PedidoDeEntrada = z
  .object({
    usuario: z
      .string({ error: 'Informe o usuário.' })
      .trim()
      .min(1, { error: 'Informe o usuário.' })
      .max(64, { error: 'Use até 64 caracteres.' }),
    senha: z
      .string({ error: 'Informe a senha.' })
      .min(1, { error: 'Informe a senha.' })
      .max(1024, { error: 'Use até 1024 caracteres.' }),
  })
  .meta({ id: 'PedidoDeEntrada' });

/** Os problemas que toda rota de acesso pode responder, além dos dela. */
export const PROBLEMAS_DO_ACESSO = {
  400: RespostaDeProblema,
  403: RespostaDeProblema,
  404: RespostaDeProblema,
  429: RespostaDeProblema,
} as const;

export interface DependenciasDaSessao {
  banco: Banco;
  agora: () => Date;
  conferirDeEngano: (senha: string) => Promise<false>;
  /** O diretório da organização (change integracao-ad-ldap): sem ele, só a entrada local. */
  diretorio?: { chavesDoCofre: ChavesDoCofre; conectar: ConectarDiretorio };
}

export async function nomeDaOrganizacao(tx: Transacao): Promise<string> {
  const [organizacao] = await tx.select({ nome: organizacoes.nome }).from(organizacoes);
  return organizacao?.nome ?? '';
}

/** O que o estado da sessão lê do banco: a organização e, se houver sessão, a conta dela. */
export interface DadosDoEstado {
  organizacao: { nome: string; preferencias: Ajustes; modulosDesligados: string[] };
  conta: { id: string; pessoaId: string; fotoId: string | null; preferencias: Ajustes } | null;
}

/**
 * Lê a organização com os padrões dela e, com `contaId`, a conta, a pessoa, a foto e as
 * preferências dela. As camadas passam por `lerAjustes`, então um valor salvo que deixou de valer fica de fora.
 */
export async function lerDadosDoEstado(
  tx: Transacao,
  contaId: string | null,
): Promise<DadosDoEstado> {
  const [organizacao] = await tx
    .select({
      nome: organizacoes.nome,
      preferencias: organizacoes.preferencias,
      modulosDesligados: organizacoes.modulosDesligados,
    })
    .from(organizacoes);
  const [conta] = contaId
    ? await tx
        .select({
          id: contas.id,
          pessoaId: contas.pessoaId,
          fotoId: pessoas.fotoId,
          preferencias: contas.preferencias,
        })
        .from(contas)
        .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
        .where(eq(contas.id, contaId))
    : [];
  return {
    organizacao: {
      nome: organizacao?.nome ?? '',
      preferencias: lerAjustes(organizacao?.preferencias),
      modulosDesligados: organizacao?.modulosDesligados ?? [],
    },
    conta: conta ? { ...conta, preferencias: lerAjustes(conta.preferencias) } : null,
  };
}

/** O estado da sessão; a conta, a pessoa, a foto e as preferências só vão com a sessão que vale. */
export function estadoDaSessao(
  requisicao: Pick<FastifyRequest, 'server' | 'organizacao'>,
  dados: DadosDoEstado,
  sessao: Pick<
    SessaoDaRequisicao,
    'usuario' | 'nome' | 'pendencia' | 'tokenCsrf' | 'expiraEm' | 'acesso'
  > | null,
) {
  const conta = sessao?.pendencia === null ? dados.conta : null;
  return {
    ambiente: requisicao.server.ambiente,
    organizacao: {
      ...dados.organizacao,
      operaOServidor: requisicao.organizacao?.operaOServidor ?? false,
    },
    sessao: sessao && {
      conta: {
        id: conta?.id ?? null,
        usuario: sessao.usuario,
        nome: sessao.nome,
        pessoaId: conta?.pessoaId ?? null,
        foto: conta?.fotoId ? { id: conta.fotoId } : null,
        preferencias: conta?.preferencias ?? null,
      },
      pendencia: sessao.pendencia,
      csrf: sessao.tokenCsrf,
      expiraEm: sessao.expiraEm.toISOString(),
      acesso: { permissoes: sessao.pendencia === null ? listarPermissoes(sessao.acesso) : [] },
    },
  };
}

export const origemDa = (requisicao: FastifyRequest) => ({
  ip: requisicao.ip,
  codigoDeRastreio: requisicao.id,
});

const credenciaisInvalidas = () =>
  new ProblemaDaApi({
    codigo: 'credenciais-invalidas',
    status: 401,
    titulo: 'Credenciais inválidas',
    detalhe: 'Usuário ou senha incorretos.',
  });

/**
 * Soma uma recusa seguida ao usuário digitado, de uma vez no banco, e começa o bloqueio quando a
 * conta chega lá. Devolve até quando ele vale, se começou.
 */
export async function registrarRecusa(
  tx: Transacao,
  { usuario, momento }: { usuario: string; momento: Date },
): Promise<Date | null> {
  const [tentativa] = await tx
    .insert(tentativasDeEntrada)
    .values({ orgId: sql`app.current_org()`, usuario, falhasSeguidas: 1, atualizadaEm: momento })
    .onConflictDoUpdate({
      target: [tentativasDeEntrada.orgId, tentativasDeEntrada.usuario],
      set: {
        falhasSeguidas: sql`${tentativasDeEntrada.falhasSeguidas} + 1`,
        atualizadaEm: momento,
      },
    })
    .returning({ falhas: tentativasDeEntrada.falhasSeguidas });
  const duracao = bloqueioDepois(tentativa?.falhas ?? 1);
  if (duracao === 0) return null;
  const ate = new Date(momento.getTime() + duracao);
  await tx
    .update(tentativasDeEntrada)
    .set({ bloqueadaAte: ate })
    .where(eq(tentativasDeEntrada.usuario, usuario));
  return ate;
}

/** Quanto falta do bloqueio do usuário digitado, em ms, ou 0. */
export async function restanteDoBloqueio(
  tx: Transacao,
  { usuario, momento }: { usuario: string; momento: Date },
): Promise<number> {
  const [tentativa] = await tx
    .select({ ate: tentativasDeEntrada.bloqueadaAte })
    .from(tentativasDeEntrada)
    .where(eq(tentativasDeEntrada.usuario, usuario));
  const restante = (tentativa?.ate?.getTime() ?? 0) - momento.getTime();
  return Math.max(0, restante);
}

export const rotasDeSessao: FastifyPluginAsyncZod<DependenciasDaSessao> = async (
  app,
  { banco, agora, conferirDeEngano, diretorio },
) => {
  app.get(
    '/sessao',
    {
      config: { semPermissao: 'entrada' },
      schema: {
        summary: 'Estado da sessão neste endereço',
        response: { 200: EstadoDaSessao, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const orgId = requisicao.organizacao?.id ?? '';
      const sessao = requisicao.sessao;
      const dados = await naOrganizacao(banco, orgId, (tx) =>
        lerDadosDoEstado(tx, sessao?.contaId ?? null),
      );
      return estadoDaSessao(requisicao, dados, sessao);
    },
  );

  app.post(
    '/sessao',
    {
      config: { rateLimit: LIMITE_DA_ENTRADA, semPermissao: 'entrada' },
      schema: {
        summary: 'Entrar com usuário e senha, a do Grafite ou a do diretório',
        body: PedidoDeEntrada,
        response: {
          200: EstadoDaSessao,
          401: RespostaDeProblema,
          503: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const orgId = requisicao.organizacao?.id ?? '';
      const usuario = normalizarUsuario(requisicao.body.usuario);
      const { senha } = requisicao.body;
      const momento = agora();
      const origem = origemDa(requisicao);
      // Com o diretório ligado, a conta do diretório e o usuário sem conta entram pelo AD, antes
      // da transação (change integracao-ad-ldap, design, decisão 3).
      const peloDiretorio = diretorio
        ? await conferirNoDiretorio(banco, {
            orgId,
            usuario,
            senha,
            chaves: diretorio.chavesDoCofre,
            conectar: diretorio.conectar,
            avisar: (dados, mensagem) => requisicao.log.warn(dados, mensagem),
          })
        : null;
      const resultado = await naOrganizacao(banco, orgId, async (tx) => {
        const restante = await restanteDoBloqueio(tx, { usuario, momento });
        if (restante > 0) {
          await registrarNaAuditoria(tx, {
            acao: 'entrada.recusada',
            ator: { tipo: 'anonimo' },
            alvo: { tipo: 'conta' },
            dados: { usuario, motivo: 'bloqueio' },
            origem,
            momento,
          });
          return { tipo: 'bloqueada', restante } as const;
        }
        if (peloDiretorio?.tipo === 'fora-do-ar') {
          // O AD fora do ar não conta para o bloqueio: a senha nem foi conferida.
          await registrarNaAuditoria(tx, {
            acao: 'entrada.recusada',
            ator: { tipo: 'anonimo' },
            alvo: { tipo: 'conta' },
            dados: { usuario, motivo: 'diretorio-fora-do-ar' },
            origem,
            momento,
          });
          return { tipo: 'fora-do-ar' } as const;
        }
        // A primeira entrada pelo AD cria a conta, e cada uma sincroniza os grupos mapeados.
        const contaDoDiretorio =
          peloDiretorio?.tipo === 'aceita'
            ? await contaPeloDiretorio(tx, { orgId, usuario, aceita: peloDiretorio, momento })
            : null;
        const [linha] = await tx
          .select({ conta: contas, nome: pessoas.nome, doisPassosAtivadoEm: doisPassos.ativadoEm })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .leftJoin(doisPassos, eq(doisPassos.contaId, contas.id))
          .where(contaDoDiretorio ? eq(contas.id, contaDoDiretorio) : eq(contas.usuario, usuario));
        // Lida pelo usuário, a conta nunca é uma anonimizada, que não tem usuário.
        const conta = linha ? comCredenciais(linha.conta) : undefined;
        // Pelo diretório, a senha foi conferida no AD; a senha local da conta do diretório nunca
        // confere.
        const confere = peloDiretorio
          ? peloDiretorio.tipo === 'aceita'
          : conta
            ? await conferirSenha(senha, conta.hashSenha)
            : await conferirDeEngano(senha);
        if (!conta || !confere || conta.situacao !== 'ativa') {
          const motivo =
            peloDiretorio?.tipo === 'sem-acesso'
              ? 'sem-acesso-no-diretorio'
              : conta && confere
                ? 'conta-inativa'
                : 'credenciais';
          await registrarNaAuditoria(tx, {
            acao: 'entrada.recusada',
            ator: { tipo: 'anonimo' },
            alvo: { tipo: 'conta', id: conta?.id ?? null },
            dados: { usuario, motivo },
            origem,
            momento,
          });
          const ate = await registrarRecusa(tx, { usuario, momento });
          if (ate) {
            await registrarNaAuditoria(tx, {
              acao: 'entrada.bloqueada',
              ator: { tipo: 'anonimo' },
              alvo: { tipo: 'conta', id: conta?.id ?? null },
              dados: { usuario, ate: ate.toISOString() },
              origem,
              momento,
            });
          }
          return peloDiretorio?.tipo === 'sem-acesso'
            ? ({ tipo: 'sem-acesso' } as const)
            : ({ tipo: 'recusada' } as const);
        }
        await tx
          .update(tentativasDeEntrada)
          .set({ falhasSeguidas: 0, bloqueadaAte: null, atualizadaEm: momento })
          .where(eq(tentativasDeEntrada.usuario, usuario));
        // A senha do AD nunca vira o hash da conta.
        if (!peloDiretorio && precisaRegravar(conta.hashSenha)) {
          await tx
            .update(contas)
            .set({ hashSenha: await gerarHashDaSenha(senha) })
            .where(eq(contas.id, conta.id));
        }
        const acesso = await carregarAcesso(tx, conta.id);
        const pendencia = pendenciaDa({
          conta: { ...conta, exigeDoisPassos: exigeDoisPassos(conta, acesso) },
          doisPassosAtivos: (linha?.doisPassosAtivadoEm ?? null) !== null,
          segundoPassoEm: null,
        });
        const sessao = await criarSessao(tx, {
          contaId: conta.id,
          momento,
          ip: requisicao.ip,
          agente: requisicao.headers['user-agent'] ?? null,
          pendente: pendencia !== null,
        });
        await registrarNaAuditoria(tx, {
          acao: 'sessao.iniciada',
          ator: { tipo: 'conta', contaId: conta.id },
          alvo: { tipo: 'sessao', id: sessao.id },
          dados: { pendencia },
          origem,
          momento,
        });
        if (pendencia === null) {
          await concluirEntrada(tx, { sessaoId: sessao.id, contaId: conta.id, momento, origem });
        }
        return {
          tipo: 'entrou',
          token: sessao.token,
          dados: await lerDadosDoEstado(tx, conta.id),
          sessao: {
            usuario: conta.usuario,
            nome: linha?.nome ?? '',
            pendencia,
            tokenCsrf: sessao.tokenCsrf,
            expiraEm: sessao.expiraEm,
            acesso,
          },
        } as const;
      });
      if (resultado.tipo === 'bloqueada') {
        resposta.header('retry-after', String(Math.ceil(resultado.restante / 1000)));
        return enviarProblema(requisicao, resposta, {
          codigo: 'entrada-bloqueada',
          status: 429,
          titulo: 'Entrada bloqueada',
          detalhe: mensagemDoBloqueio(resultado.restante),
        });
      }
      if (resultado.tipo === 'fora-do-ar') {
        return enviarProblema(requisicao, resposta, {
          codigo: 'diretorio-fora-do-ar',
          status: 503,
          titulo: 'Diretório fora do ar',
          detalhe: MENSAGENS_DO_DIRETORIO.foraDoAr,
        });
      }
      if (resultado.tipo === 'sem-acesso') {
        return enviarProblema(requisicao, resposta, {
          codigo: 'sem-acesso-no-diretorio',
          status: 403,
          titulo: 'Sem acesso',
          detalhe: MENSAGENS_DO_DIRETORIO.semAcesso,
        });
      }
      if (resultado.tipo === 'recusada') throw credenciaisInvalidas();
      gravarCookieDaSessao(resposta, resultado.token, resultado.sessao.expiraEm, momento);
      return estadoDaSessao(requisicao, resultado.dados, resultado.sessao);
    },
  );

  app.delete(
    '/sessao',
    {
      config: { semPermissao: 'entrada' },
      preHandler: exigirSessao,
      schema: {
        summary: 'Sair: encerra a sessão e apaga o cookie',
        response: { 204: z.null(), 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao, resposta) => {
      const sessao = requisicao.sessao;
      if (!sessao) throw new Error('A guarda deixou passar uma requisição sem sessão.');
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', (tx) =>
        encerrarSessao(tx, {
          sessaoId: sessao.id,
          contaId: sessao.contaId,
          motivo: 'saida',
          momento: agora(),
          ator: { tipo: 'conta', contaId: sessao.contaId },
          origem: origemDa(requisicao),
        }),
      );
      apagarCookieDaSessao(resposta);
      return resposta.code(204).send(null);
    },
  );
};
