// Os alertas dos testes de integração (P3a): uma organização com quem administra os alertas, quem
// os trata só em Campinas, quem só os vê e quem não os vê, e os atalhos que preparam o banco sem as
// rotas: os tipos com as capacidades, os modelos, os ativos, os coletores, o estado atual da coleta
// e as regras.

import { createHash } from 'node:crypto';
import {
  alertas,
  ativos,
  campos,
  coletores,
  estadoDosAtivos,
  modelos,
  naOrganizacao,
  organizacoes,
  regrasDeAlerta,
  tiposDeAtivo,
} from '@grafite/db';
import { type DadosDaRegra, normalizarTexto } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import {
  type ApiDeTeste,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from './integracao.ts';

/**
 * - `ana`: administra os alertas e os trata na organização inteira;
 * - `bruno`: trata os alertas só em Campinas;
 * - `carla`: vê os ativos, mas não os alertas;
 * - `davi`: só vê os alertas, na organização inteira.
 */
export const USUARIOS_DOS_ALERTAS = ['ana', 'bruno', 'carla', 'davi'] as const;
export type UsuarioDosAlertas = (typeof USUARIOS_DOS_ALERTAS)[number];

const NOMES: Record<UsuarioDosAlertas, string> = {
  ana: 'Ana Souza',
  bruno: 'Bruno Lima',
  carla: 'Carla Dias',
  davi: 'Davi Rocha',
};

export type AlertasDeTeste = Awaited<ReturnType<typeof montarAlertas>>;

export async function montarAlertas(api: ApiDeTeste, host: string) {
  const org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const cliente = clienteDaApi(api, host);
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const perfis = {
    administra: await criarPerfil(api, org, {
      nome: 'Alertas',
      permissoes: ['alertas.administrar', 'alertas.tratar', 'ativos.ver'],
    }),
    trata: await criarPerfil(api, org, {
      nome: 'Plantão',
      permissoes: ['alertas.tratar', 'ativos.ver'],
    }),
    ativos: await criarPerfil(api, org, { nome: 'Ativos', permissoes: ['ativos.ver'] }),
    ve: await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['alertas.ver'] }),
  };
  const contas = {} as Record<UsuarioDosAlertas, { id: string; nome: string }>;
  for (const usuario of USUARIOS_DOS_ALERTAS) {
    const conta = await criarConta(api, org, { usuario, nome: NOMES[usuario] });
    contas[usuario] = { id: conta.id, nome: NOMES[usuario] };
  }
  await atribuir(api, org, { perfilId: perfis.administra, contaId: contas.ana.id });
  await atribuir(api, org, {
    perfilId: perfis.trata,
    contaId: contas.bruno.id,
    localId: campinas,
  });
  await atribuir(api, org, { perfilId: perfis.ativos, contaId: contas.carla.id });
  await atribuir(api, org, { perfilId: perfis.ve, contaId: contas.davi.id });

  const entradas = {} as Record<UsuarioDosAlertas, Entrada>;
  for (const usuario of USUARIOS_DOS_ALERTAS) entradas[usuario] = await cliente.entrar(usuario);

  return {
    org,
    cliente,
    contas,
    jundiai,
    campinas,
    entradas,
    como: (usuario: UsuarioDosAlertas) => entradas[usuario] ?? SEM_ENTRADA,
  };
}

let criados = 0;
const unico = (prefixo: string) => `${prefixo} ${++criados}`;

/** Um tipo de ativo, direto no banco, com as capacidades e a configuração delas. */
export function criarTipo(
  api: ApiDeTeste,
  org: string,
  {
    nome = unico('Tipo'),
    capacidades = [],
    configuracao = {},
    situacao = 'ativo',
  }: {
    nome?: string;
    capacidades?: string[];
    configuracao?: Record<string, unknown>;
    situacao?: 'ativo' | 'inativo';
  } = {},
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        icone: 'impressora',
        capacidades,
        configuracaoDasCapacidades: configuracao,
        situacao,
      })
      .returning({ id: tiposDeAtivo.id });
    return tipo?.id ?? '';
  });
}

/** Um modelo do tipo, direto no banco. */
export function criarModelo(
  api: ApiDeTeste,
  org: string,
  {
    tipoId,
    fabricante = 'HP',
    nome = unico('Modelo'),
    situacao = 'ativo',
  }: { tipoId: string; fabricante?: string; nome?: string; situacao?: 'ativo' | 'inativo' },
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [modelo] = await tx
      .insert(modelos)
      .values({
        orgId: org,
        tipoId,
        fabricante,
        fabricanteNormalizado: normalizarTexto(fabricante),
        nome,
        nomeNormalizado: normalizarTexto(nome),
        busca: normalizarTexto(`${fabricante} ${nome}`),
        situacao,
      })
      .returning({ id: modelos.id });
    return modelo?.id ?? '';
  });
}

/** Um ativo do tipo, direto no banco, com o nome, o patrimônio, o local e os valores dados. */
export function criarAtivoDoTipo(
  api: ApiDeTeste,
  org: string,
  {
    tipoId,
    nome = null,
    patrimonio = unico('PAT'),
    localId = null,
    modeloId = null,
    situacao = 'ativo',
    valores = {},
  }: {
    tipoId: string;
    nome?: string | null;
    patrimonio?: string;
    localId?: string | null;
    modeloId?: string | null;
    situacao?: 'ativo' | 'inativo';
    valores?: Record<string, unknown>;
  },
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [ativo] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId,
        modeloId,
        nome,
        patrimonio,
        patrimonioNormalizado: normalizarTexto(patrimonio),
        localId,
        situacao,
        valores,
        busca: normalizarTexto(`${patrimonio} ${nome ?? ''}`),
      })
      .returning({ id: ativos.id });
    return ativo?.id ?? '';
  });
}

/** Um coletor, direto no banco, com o último contato dado. */
export function criarColetor(
  api: ApiDeTeste,
  org: string,
  {
    nome = unico('Coletor'),
    faixas = ['10.0.0.0/8'],
    ultimoContatoEm = null,
    situacao = 'ativo',
  }: {
    nome?: string;
    faixas?: string[];
    ultimoContatoEm?: Date | null;
    situacao?: 'ativo' | 'inativo';
  } = {},
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [coletor] = await tx
      .insert(coletores)
      .values({
        orgId: org,
        nome,
        nomeNormalizado: normalizarTexto(nome),
        tokenHash: createHash('sha256').update(nome).digest(),
        faixas,
        ultimoContatoEm,
        situacao,
      })
      .returning({ id: coletores.id });
    return coletor?.id ?? '';
  });
}

/** Muda o último contato de um coletor, como um pedido aceito dele. */
export function contatoDoColetor(
  api: ApiDeTeste,
  org: string,
  coletorId: string,
  ultimoContatoEm: Date | null,
) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx.update(coletores).set({ ultimoContatoEm }).where(eq(coletores.id, coletorId)),
  );
}

/** Grava o estado atual de um ativo, métrica e item, como o lote do coletor. */
export function gravarEstado(
  api: ApiDeTeste,
  org: string,
  {
    ativoId,
    coletorId,
    metrica,
    item = '',
    momento,
    valorNumero = null,
    valorTexto = null,
    situacao = 'valida',
    detalhes = null,
  }: {
    ativoId: string;
    coletorId: string;
    metrica: string;
    item?: string;
    momento: Date;
    valorNumero?: number | null;
    valorTexto?: string | null;
    situacao?: 'valida' | 'sem-dado' | 'inconsistente';
    detalhes?: Record<string, unknown> | null;
  },
) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx
      .insert(estadoDosAtivos)
      .values({
        orgId: org,
        ativoId,
        coletorId,
        metrica,
        item,
        momento,
        valorNumero,
        valorTexto,
        situacao,
        detalhes,
        desde: momento,
      })
      .onConflictDoUpdate({
        target: [
          estadoDosAtivos.orgId,
          estadoDosAtivos.ativoId,
          estadoDosAtivos.metrica,
          estadoDosAtivos.item,
        ],
        set: {
          momento: sql`excluded.momento`,
          valorNumero: sql`excluded.valor_numero`,
          valorTexto: sql`excluded.valor_texto`,
          situacao: sql`excluded.situacao`,
          detalhes: sql`excluded.detalhes`,
          coletorId: sql`excluded.coletor_id`,
        },
      }),
  );
}

/** Uma regra, direto no banco, com a situação e a chave de fábrica dadas. */
export function criarRegra(
  api: ApiDeTeste,
  org: string,
  dados: DadosDaRegra,
  {
    situacao = 'ativa',
    fabrica = null,
  }: { situacao?: 'ativa' | 'inativa'; fabrica?: string | null } = {},
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [regra] = await tx
      .insert(regrasDeAlerta)
      .values({
        orgId: org,
        nome: dados.nome,
        nomeNormalizado: normalizarTexto(dados.nome),
        condicao: dados.condicao,
        parametros: dados.parametros,
        duracao: dados.duracao,
        severidade: dados.severidade,
        escopo: dados.escopo.tipo,
        escopoId: dados.escopo.id,
        situacao,
        fabrica,
      })
      .returning({ id: regrasDeAlerta.id });
    return regra?.id ?? '';
  });
}

/** Os alertas da organização, os mais antigos primeiro. */
export function alertasDa(api: ApiDeTeste, org: string) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(alertas).orderBy(alertas.observadoEm, alertas.id),
  );
}

/** Liga ou desliga um módulo opcional na organização, direto no banco. */
export function desligarModulos(api: ApiDeTeste, org: string, desligados: string[]) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx.update(organizacoes).set({ modulosDesligados: desligados }).where(eq(organizacoes.id, org)),
  );
}

/** O campo de IP da organização, direto no banco. */
export function criarCampoDeIp(api: ApiDeTeste, org: string): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [campo] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip' })
      .returning({ id: campos.id });
    return campo?.id ?? '';
  });
}

/** Um alerta, direto no banco, aberto há tantos minutos, ou com as colunas dadas. */
export function criarAlerta(
  api: ApiDeTeste,
  org: string,
  {
    regraId,
    ativoId = null,
    coletorId = null,
    item = '',
    texto = 'Toner preto em 8%',
    severidade = 'critico',
    abertoHa = 30,
    ...colunas
  }: {
    regraId: string;
    ativoId?: string | null;
    coletorId?: string | null;
    item?: string;
    texto?: string;
    severidade?: 'critico' | 'atencao' | 'info';
    /** Há quantos minutos o alerta abriu. */
    abertoHa?: number;
  } & Partial<typeof alertas.$inferInsert>,
): Promise<string> {
  const abertoEm = new Date(api.relogio.agora().getTime() - abertoHa * 60_000);
  return naOrganizacao(api.banco, org, async (tx) => {
    const [alerta] = await tx
      .insert(alertas)
      .values({
        orgId: org,
        regraId,
        ativoId,
        coletorId,
        item,
        situacao: 'aberto',
        severidade,
        texto,
        observadoEm: abertoEm,
        abertoEm,
        ...colunas,
      })
      .returning({ id: alertas.id });
    return alerta?.id ?? '';
  });
}
