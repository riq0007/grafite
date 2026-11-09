// A API dos testes de integração: montada como em produção, sobre o PostgreSQL de teste e com o
// papel grafite_app, com um relógio que o teste adianta sem esperar e com o armazenamento numa
// pasta temporária, apagada no fim.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  atribuicoes,
  auditoria,
  type Banco,
  codigosDeRecuperacao,
  contas,
  criarBanco,
  doisPassos,
  enderecosDeAcesso,
  grupos,
  locais,
  membrosDoGrupo,
  naOrganizacao,
  organizacoes,
  perfis,
  pessoas,
} from '@grafite/db';
import { normalizarTexto, type Permissao, type TipoDeLocal, textoDeBusca } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { inject } from 'vitest';
import { cifrarChaveDoApp } from '../src/acesso/cifra.ts';
import { gerarCodigosDeRecuperacao, hashDoCodigo } from '../src/acesso/codigos.ts';
import { gerarHashDaSenha } from '../src/acesso/senhas.ts';
import { gerarChaveDoApp, gerarCodigoTotp } from '../src/acesso/totp.ts';
import { criarApp, type Dependencias } from '../src/app.ts';
import { ArmazenamentoEmDisco } from '../src/arquivos/armazenamento.ts';
import { CHAVE_DOIS_PASSOS_DE_TESTE, CHAVES_DO_COFRE_DE_TESTE } from './dependencias.ts';

export interface Relogio {
  agora: () => Date;
  avancar: (ms: number) => void;
}

export function criarRelogio(inicio = new Date('2026-10-02T12:00:00.000Z')): Relogio {
  let momento = inicio.getTime();
  return {
    agora: () => new Date(momento),
    avancar: (ms) => {
      momento += ms;
    },
  };
}

export interface ApiDeTeste {
  app: FastifyInstance;
  banco: Banco;
  relogio: Relogio;
  /** O papel dono das tabelas, para preparar dados que a aplicação não cria. */
  dono: pg.Pool;
  /** O armazenamento dos arquivos, numa pasta temporária só desta API. */
  armazenamento: ArmazenamentoEmDisco;
  fechar: () => Promise<void>;
}

export async function abrirApi({
  relogio = criarRelogio(),
  intervalosDosEventos,
  tarefas,
  intervaloDaFila,
  agendarAlertas = false,
  ambiente = 'desenvolvimento',
  organizacaoOperadora,
  operacao,
  chavesDoCofre = CHAVES_DO_COFRE_DE_TESTE,
  canais,
  prazoDoAcessoRemoto,
  conectarDiretorio,
  acordarAgente,
}: {
  /** Quem acorda o agente, nos testes da distribuição. */
  acordarAgente?: Dependencias['acordarAgente'];
  /** O prazo da primeira resposta da máquina no acesso remoto, nos testes que esperam por ele. */
  prazoDoAcessoRemoto?: number;
  /** O AD dos testes do diretório. */
  conectarDiretorio?: Dependencias['conectarDiretorio'];
  /** Os canais de fora, nos testes que tratam do e-mail e do push. */
  canais?: Dependencias['canais'];
  relogio?: Relogio;
  /** As chaves mestras do cofre (padrão: a de teste, sem a anterior). */
  chavesDoCofre?: Dependencias['chavesDoCofre'];
  /** O ambiente da configuração (padrão: desenvolvimento). */
  ambiente?: Dependencias['ambiente'];
  /** O endereço de acesso da organização que opera o servidor. */
  organizacaoOperadora?: string;
  /** As tarefas do servidor, nos testes que tratam delas. */
  operacao?: Dependencias['operacao'];
  /** Intervalos menores para a conexão de eventos, nos testes que esperam por eles. */
  intervalosDosEventos?: Dependencias['intervalosDosEventos'];
  /** O catálogo da fila, nos testes que tratam dela; sem ele, a API não liga a fila. */
  tarefas?: NonNullable<Dependencias['fila']>['tarefas'];
  /** De quanto em quanto tempo a fila procura tarefas, em segundos, nos testes que esperam por elas. */
  intervaloDaFila?: number;
  /** Agenda a avaliação dos alertas a cada minuto, como a partida do servidor. */
  agendarAlertas?: boolean;
} = {}) {
  const pool = new pg.Pool({ connectionString: inject('urlApp') });
  const dono = new pg.Pool({ connectionString: inject('urlDono') });
  const banco = criarBanco(pool);
  const armazenamento = new ArmazenamentoEmDisco(
    await mkdtemp(join(tmpdir(), 'grafite-arquivos-')),
  );
  const app = await criarApp({
    ambiente,
    organizacaoOperadora,
    operacao,
    versao: '1.2.3',
    verificarBanco: async () => {
      await pool.query('select 1');
    },
    banco,
    chaveDoisPassos: CHAVE_DOIS_PASSOS_DE_TESTE,
    chavesDoCofre,
    armazenamento,
    canais,
    conectarOuvinte: () => new pg.Client({ connectionString: inject('urlApp') }),
    intervalosDosEventos,
    prazoDoAcessoRemoto,
    ...(conectarDiretorio ? { conectarDiretorio } : {}),
    ...(acordarAgente ? { acordarAgente } : {}),
    ...(tarefas
      ? {
          fila: {
            conexao: inject('urlApp'),
            tarefas,
            intervaloDeConsulta: intervaloDaFila,
            agendarAlertas,
          },
        }
      : {}),
    agora: relogio.agora,
  });
  const api: ApiDeTeste = {
    app,
    banco,
    relogio,
    dono,
    armazenamento,
    fechar: async () => {
      await app.close();
      await pool.end();
      await dono.end();
      await rm(armazenamento.pasta, { recursive: true, force: true });
    },
  };
  return api;
}

/**
 * Cria uma organização com os endereços dela, como o comando no servidor faz: pelo papel da
 * aplicação, com a própria organização no contexto, que o WITH CHECK de `organizacoes` exige.
 */
export async function criarOrganizacao(
  api: ApiDeTeste,
  { nome, enderecos }: { nome: string; enderecos: string[] },
): Promise<string> {
  const { rows } = await api.dono.query<{ id: string }>('select uuidv7() as id');
  const id = rows[0]?.id ?? '';
  await naOrganizacao(api.banco, id, async (tx) => {
    await tx.insert(organizacoes).values({ id, nome });
    for (const endereco of enderecos) {
      await tx.insert(enderecosDeAcesso).values({ orgId: id, endereco });
    }
  });
  return id;
}

/** Uma pessoa e a conta dela, direto no banco, com a senha dada já em hash. */
export async function criarConta(
  api: ApiDeTeste,
  orgId: string,
  {
    usuario,
    nome = usuario,
    senha = 'cavalo bateria grampo correto',
    senhaTemporaria = false,
    exigeDoisPassos = false,
    localId = null,
    email = null,
    matricula = null,
  }: {
    usuario: string;
    /** O nome da pessoa (padrão: o próprio usuário). */
    nome?: string;
    senha?: string;
    senhaTemporaria?: boolean;
    exigeDoisPassos?: boolean;
    localId?: string | null;
    email?: string | null;
    matricula?: string | null;
  },
) {
  const hashSenha = await gerarHashDaSenha(senha);
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [pessoa] = await tx
      .insert(pessoas)
      .values({
        orgId,
        nome,
        localId,
        email,
        matricula,
        busca: textoDeBusca({ nome, email, matricula }),
      })
      .returning();
    const [conta] = await tx
      .insert(contas)
      .values({
        orgId,
        pessoaId: pessoa?.id ?? '',
        usuario,
        hashSenha,
        senhaTemporaria,
        exigeDoisPassos,
      })
      .returning();
    if (!conta) throw new Error('A conta de teste não foi criada.');
    return conta;
  });
}

/**
 * A verificação em dois passos já ativa numa conta, com uma chave do app conhecida e os 10 códigos
 * de recuperação, para o teste gerar os códigos que o app mostraria.
 */
export async function ativarDoisPassos(api: ApiDeTeste, orgId: string, contaId: string) {
  const chaveDoApp = gerarChaveDoApp();
  const codigos = gerarCodigosDeRecuperacao();
  await naOrganizacao(api.banco, orgId, async (tx) => {
    await tx.insert(doisPassos).values({
      orgId,
      contaId,
      segredoCifrado: cifrarChaveDoApp(chaveDoApp, CHAVE_DOIS_PASSOS_DE_TESTE, contaId),
      ativadoEm: api.relogio.agora(),
    });
    for (const codigo of codigos) {
      await tx.insert(codigosDeRecuperacao).values({ orgId, contaId, hash: hashDoCodigo(codigo) });
    }
  });
  return { chaveDoApp, codigos };
}

/** Uma pessoa sem conta, direto no banco. */
export async function criarPessoa(
  api: ApiDeTeste,
  orgId: string,
  {
    nome,
    localId = null,
    situacao = 'ativa',
    email = null,
    matricula = null,
    telefone = null,
  }: {
    nome: string;
    localId?: string | null;
    situacao?: 'ativa' | 'inativa';
    email?: string | null;
    matricula?: string | null;
    telefone?: string | null;
  },
): Promise<string> {
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [pessoa] = await tx
      .insert(pessoas)
      .values({
        orgId,
        nome,
        localId,
        situacao,
        email,
        matricula,
        telefone,
        busca: textoDeBusca({ nome, email, matricula }),
      })
      .returning({ id: pessoas.id });
    return pessoa?.id ?? '';
  });
}

/** Um local, direto no banco. */
export async function criarLocal(
  api: ApiDeTeste,
  orgId: string,
  {
    nome,
    paiId = null,
    tipo = 'setor',
    situacao = 'ativo',
  }: { nome: string; paiId?: string | null; tipo?: TipoDeLocal; situacao?: 'ativo' | 'inativo' },
): Promise<string> {
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [local] = await tx
      .insert(locais)
      .values({ orgId, paiId, nome, nomeNormalizado: normalizarTexto(nome), tipo, situacao })
      .returning({ id: locais.id });
    return local?.id ?? '';
  });
}

/** Um perfil, direto no banco. */
export async function criarPerfil(
  api: ApiDeTeste,
  orgId: string,
  {
    nome,
    permissoes = [],
    exigeDoisPassos = false,
    situacao = 'ativo',
    administrador = false,
  }: {
    nome: string;
    permissoes?: Permissao[];
    exigeDoisPassos?: boolean;
    situacao?: 'ativo' | 'inativo';
    /** O Administrador: protegido e com todas as permissões. */
    administrador?: boolean;
  },
): Promise<string> {
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [perfil] = await tx
      .insert(perfis)
      .values({
        orgId,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        permissoes,
        exigeDoisPassos,
        situacao,
        todasAsPermissoes: administrador,
        protegido: administrador,
      })
      .returning({ id: perfis.id });
    return perfil?.id ?? '';
  });
}

/** Um grupo, direto no banco. */
export async function criarGrupo(
  api: ApiDeTeste,
  orgId: string,
  { nome, situacao = 'ativo' }: { nome: string; situacao?: 'ativo' | 'inativo' },
): Promise<string> {
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [grupo] = await tx
      .insert(grupos)
      .values({ orgId, nome, nomeNormalizado: normalizarTexto(nome), situacao })
      .returning({ id: grupos.id });
    return grupo?.id ?? '';
  });
}

/** A conta no grupo, em vigor. */
export async function incluirNoGrupo(
  api: ApiDeTeste,
  orgId: string,
  { grupoId, contaId }: { grupoId: string; contaId: string },
): Promise<string> {
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [membro] = await tx
      .insert(membrosDoGrupo)
      .values({ orgId, grupoId, contaId })
      .returning({ id: membrosDoGrupo.id });
    return membro?.id ?? '';
  });
}

/** O perfil atribuído a uma conta ou a um grupo, na organização inteira ou num local. */
export async function atribuir(
  api: ApiDeTeste,
  orgId: string,
  {
    perfilId,
    contaId = null,
    grupoId = null,
    localId = null,
  }: {
    perfilId: string;
    contaId?: string | null;
    grupoId?: string | null;
    localId?: string | null;
  },
): Promise<string> {
  return naOrganizacao(api.banco, orgId, async (tx) => {
    const [atribuicao] = await tx
      .insert(atribuicoes)
      .values({ orgId, perfilId, contaId, grupoId, localId })
      .returning({ id: atribuicoes.id });
    return atribuicao?.id ?? '';
  });
}

/** A senha das contas de teste criadas sem outra. */
export const SENHA_DE_TESTE = 'cavalo bateria grampo correto';

let requisicoes = 0;

/** Um IP novo a cada requisição, para os limites por IP não interferirem nos testes. */
export function novoIp(): string {
  requisicoes += 1;
  return `10.9.${Math.floor(requisicoes / 250) % 250}.${requisicoes % 250}`;
}

/** O cookie e o token CSRF de quem entrou. */
export interface Entrada {
  cookie: string;
  csrf: string;
}

export const SEM_ENTRADA: Entrada = { cookie: '', csrf: '' };

type MetodoDeEscrita = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** As requisições de um teste a um endereço, como a web faz: mesma origem e com o token CSRF. */
export function clienteDaApi(api: ApiDeTeste, host: string) {
  async function entrar(usuario: string, senha = SENHA_DE_TESTE): Promise<Entrada> {
    const r = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: { host, 'sec-fetch-site': 'same-origin' },
      payload: { usuario, senha },
    });
    if (r.statusCode !== 200) throw new Error(`A entrada de ${usuario} falhou: ${r.body}`);
    return {
      cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
      csrf: r.json().sessao?.csrf ?? '',
    };
  }
  return {
    entrar,
    /**
     * A entrada da conta com a verificação em dois passos ativa: a senha e o código do app no
     * momento do relógio, que fica usado (o código seguinte pede o relógio adiantado).
     */
    async entrarComCodigo(
      usuario: string,
      chaveDoApp: Buffer,
      senha = SENHA_DE_TESTE,
    ): Promise<Entrada> {
      const pendente = await entrar(usuario, senha);
      const r = await api.app.inject({
        method: 'POST',
        url: '/sessao/segundo-passo',
        remoteAddress: novoIp(),
        headers: {
          host,
          cookie: pendente.cookie,
          'x-grafite-csrf': pendente.csrf,
          'sec-fetch-site': 'same-origin',
        },
        payload: { codigo: gerarCodigoTotp(chaveDoApp, api.relogio.agora().getTime()) },
      });
      if (r.statusCode !== 200) throw new Error(`O segundo passo de ${usuario} falhou: ${r.body}`);
      return {
        cookie: String(r.headers['set-cookie']).split(';')[0] ?? '',
        csrf: r.json().sessao?.csrf ?? '',
      };
    },
    consultar(url: string, { cookie }: Entrada) {
      return api.app.inject({
        method: 'GET',
        url,
        remoteAddress: novoIp(),
        headers: { host, cookie },
      });
    },
    enviar(metodo: MetodoDeEscrita, url: string, { cookie, csrf }: Entrada, payload?: object) {
      return api.app.inject({
        method: metodo,
        url,
        remoteAddress: novoIp(),
        headers: { host, cookie, 'x-grafite-csrf': csrf, 'sec-fetch-site': 'same-origin' },
        ...(payload === undefined ? {} : { payload }),
      });
    },
    /** Uma escrita com o corpo em bytes, como o envio de uma imagem. */
    enviarBytes(
      metodo: MetodoDeEscrita,
      url: string,
      { cookie, csrf }: Entrada,
      conteudo: Buffer,
      tipo = 'application/octet-stream',
    ) {
      return api.app.inject({
        method: metodo,
        url,
        remoteAddress: novoIp(),
        headers: {
          host,
          cookie,
          'x-grafite-csrf': csrf,
          'sec-fetch-site': 'same-origin',
          'content-type': tipo,
        },
        payload: conteudo,
      });
    },
  };
}

/**
 * Os pedidos de um coletor a um endereço, como o coletor faz: o token no cabeçalho Authorization e a
 * versão dele, sem cookie nem o token CSRF das telas.
 */
export function clienteDoColetor(api: ApiDeTeste, host: string, token: string, versao = '0.3.0') {
  const headers = {
    host,
    authorization: `Bearer ${token}`,
    'x-grafite-versao-do-coletor': versao,
  };
  return {
    configuracao: (extras: Record<string, string> = {}) =>
      api.app.inject({
        method: 'GET',
        url: '/coleta/configuracao',
        remoteAddress: novoIp(),
        headers: { ...headers, ...extras },
      }),
    lote: (corpo: object) =>
      api.app.inject({
        method: 'POST',
        url: '/coleta/lotes',
        remoteAddress: novoIp(),
        headers,
        payload: corpo,
      }),
  };
}

/** Os registros de auditoria de uma requisição, pelo código de rastreio da resposta. */
export function auditoriaDaRequisicao(
  api: ApiDeTeste,
  orgId: string,
  resposta: { headers: Record<string, unknown> },
) {
  const codigo = String(resposta.headers['x-codigo-de-rastreio']);
  return naOrganizacao(api.banco, orgId, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.codigoDeRastreio, codigo)),
  );
}
