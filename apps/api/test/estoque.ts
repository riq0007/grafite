// O estoque dos testes de integração (P4c): uma organização com a administradora, a almoxarife que
// movimenta só em Jundiaí, quem só vê o estoque e quem vê só os consumíveis, as impressoras para a
// saída, e os atalhos que preparam o banco sem as rotas: os consumíveis, os fornecedores e os saldos.

import {
  consumiveis,
  fornecedores,
  movimentosDoEstoque,
  naOrganizacao,
  saldosDoEstoque,
} from '@grafite/db';
import { codigoNormalizado, normalizarTexto } from '@grafite/domain';
import { asc } from 'drizzle-orm';
import { criarAtivoDoTipo, criarColetor, criarModelo, criarTipo } from './alertas.ts';
import {
  type ApiDeTeste,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from './integracao.ts';

/**
 * - `ana`: a administradora, com todas as permissões;
 * - `carla`: movimenta o estoque e vê os ativos só em Jundiaí, sem ver os consumíveis nem os
 *   fornecedores;
 * - `bruno`: só vê o estoque, na organização inteira;
 * - `davi`: vê os consumíveis, e não o estoque.
 */
export const USUARIOS_DO_ESTOQUE = ['ana', 'carla', 'bruno', 'davi'] as const;
export type UsuarioDoEstoque = (typeof USUARIOS_DO_ESTOQUE)[number];

const NOMES: Record<UsuarioDoEstoque, string> = {
  ana: 'Ana Souza',
  carla: 'Carla Dias',
  bruno: 'Bruno Lima',
  davi: 'Davi Rocha',
};

export type EstoqueDeTeste = Awaited<ReturnType<typeof montarEstoque>>;

export async function montarEstoque(api: ApiDeTeste, host: string) {
  const org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const cliente = clienteDaApi(api, host);
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const locais = {
    jundiai,
    campinas,
    almoxarifado: await criarLocal(api, org, {
      nome: 'Almoxarifado',
      paiId: jundiai,
      tipo: 'sala',
    }),
    expedicao: await criarLocal(api, org, { nome: 'Expedição', paiId: jundiai }),
    deposito: await criarLocal(api, org, {
      nome: 'Depósito antigo',
      paiId: jundiai,
      tipo: 'sala',
      situacao: 'inativo',
    }),
    almoxarifadoDeCampinas: await criarLocal(api, org, {
      nome: 'Almoxarifado',
      paiId: campinas,
      tipo: 'sala',
    }),
  };
  const perfis = {
    administrador: await criarPerfil(api, org, { nome: 'Administrador', administrador: true }),
    almoxarife: await criarPerfil(api, org, {
      nome: 'Almoxarife',
      permissoes: ['estoque.movimentar', 'ativos.ver'],
    }),
    leitura: await criarPerfil(api, org, {
      nome: 'Leitura do estoque',
      permissoes: ['estoque.ver'],
    }),
    consumiveis: await criarPerfil(api, org, {
      nome: 'Consumíveis',
      permissoes: ['consumiveis.ver'],
    }),
  };
  const contas = {} as Record<UsuarioDoEstoque, string>;
  for (const usuario of USUARIOS_DO_ESTOQUE) {
    contas[usuario] = (await criarConta(api, org, { usuario, nome: NOMES[usuario] })).id;
  }
  await atribuir(api, org, { perfilId: perfis.administrador, contaId: contas.ana });
  await atribuir(api, org, {
    perfilId: perfis.almoxarife,
    contaId: contas.carla,
    localId: jundiai,
  });
  await atribuir(api, org, { perfilId: perfis.leitura, contaId: contas.bruno });
  await atribuir(api, org, { perfilId: perfis.consumiveis, contaId: contas.davi });
  const entradas = {} as Record<UsuarioDoEstoque, Entrada>;
  for (const usuario of USUARIOS_DO_ESTOQUE) {
    entradas[usuario] = await cliente.entrar(usuario);
  }
  const consumiveisDoTeste = {
    cf258a: await criarConsumivel(api, org, { codigo: 'CF258A', nome: 'HP 58A' }),
    cf280a: await criarConsumivel(api, org, { codigo: 'CF280A', situacao: 'inativo' }),
  };
  const fornecedoresDoTeste = {
    hp: await criarFornecedor(api, org, { nome: 'HP Brasil' }),
    locadora: await criarFornecedor(api, org, { nome: 'Locadora Norte', situacao: 'inativo' }),
  };
  // As impressoras: a PAT-00412, monitorada, na Expedição; uma em Campinas; uma inativa.
  const impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['consumiveis.compatibilidade'],
  });
  const m404 = await criarModelo(api, org, { tipoId: impressora, nome: 'LaserJet M404' });
  const ativosDoTeste = {
    pat00412: await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      modeloId: m404,
      patrimonio: 'PAT-00412',
      localId: locais.expedicao,
    }),
    deCampinas: await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      modeloId: m404,
      patrimonio: 'PAT-00977',
      localId: locais.almoxarifadoDeCampinas,
    }),
    inativa: await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      modeloId: m404,
      patrimonio: 'PAT-00101',
      localId: locais.expedicao,
      situacao: 'inativo',
    }),
  };
  return {
    org,
    cliente,
    locais,
    contas,
    entradas,
    consumiveis: consumiveisDoTeste,
    fornecedores: fornecedoresDoTeste,
    tipos: { impressora },
    modelos: { m404 },
    ativos: ativosDoTeste,
    coletor: await criarColetor(api, org),
  };
}

/** Um consumível, direto no banco. */
export function criarConsumivel(
  api: ApiDeTeste,
  org: string,
  {
    codigo,
    nome = null,
    situacao = 'ativo',
  }: { codigo: string; nome?: string | null; situacao?: 'ativo' | 'inativo' },
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [consumivel] = await tx
      .insert(consumiveis)
      .values({
        orgId: org,
        codigo,
        codigoNormalizado: codigoNormalizado(codigo),
        nome,
        nomeNormalizado: nome === null ? null : normalizarTexto(nome),
        tipo: 'toner',
        cor: 'preto',
        situacao,
      })
      .returning({ id: consumiveis.id });
    return consumivel?.id ?? '';
  });
}

/** Um fornecedor, direto no banco. */
export function criarFornecedor(
  api: ApiDeTeste,
  org: string,
  { nome, situacao = 'ativo' }: { nome: string; situacao?: 'ativo' | 'inativo' },
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [fornecedor] = await tx
      .insert(fornecedores)
      .values({ orgId: org, nome, nomeNormalizado: normalizarTexto(nome), situacao })
      .returning({ id: fornecedores.id });
    return fornecedor?.id ?? '';
  });
}

/** O saldo e o mínimo de um consumível num local, direto no banco, sem a movimentação. */
export function definirSaldo(
  api: ApiDeTeste,
  org: string,
  {
    consumivelId,
    localId,
    saldo,
    minimo = 0,
    abaixoDesde = null,
  }: {
    consumivelId: string;
    localId: string;
    saldo: number;
    minimo?: number;
    abaixoDesde?: Date | null;
  },
) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx
      .insert(saldosDoEstoque)
      .values({ orgId: org, consumivelId, localId, saldo, minimo, abaixoDesde })
      .onConflictDoUpdate({
        target: [saldosDoEstoque.orgId, saldosDoEstoque.consumivelId, saldosDoEstoque.localId],
        set: { saldo, minimo, abaixoDesde },
      }),
  );
}

/** Os saldos da organização, direto do banco. */
export function saldosDa(api: ApiDeTeste, org: string) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({
        consumivelId: saldosDoEstoque.consumivelId,
        localId: saldosDoEstoque.localId,
        saldo: saldosDoEstoque.saldo,
        minimo: saldosDoEstoque.minimo,
        abaixoDesde: saldosDoEstoque.abaixoDesde,
      })
      .from(saldosDoEstoque),
  );
}

/** As movimentações da organização, direto do banco, na ordem do lançamento. */
export function movimentosDa(api: ApiDeTeste, org: string) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(movimentosDoEstoque)
      .orderBy(asc(movimentosDoEstoque.momento), asc(movimentosDoEstoque.id)),
  );
}
