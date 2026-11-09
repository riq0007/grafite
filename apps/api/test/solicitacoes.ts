// As solicitações dos testes de integração (P4d), sobre o estoque dos testes (P4c): quem atende as
// solicitações de Jundiaí movimentando o estoque, quem atende sem movimentar, quem só vê, as pessoas
// que pedem, o notebook, a segunda impressora e o CF258A compatível com a M404.

import { consumiveis, consumiveisDosModelos, naOrganizacao } from '@grafite/db';
import { codigoNormalizado } from '@grafite/domain';
import { criarAtivoDoTipo, criarModelo, criarTipo } from './alertas.ts';
import { montarEstoque, USUARIOS_DO_ESTOQUE } from './estoque.ts';
import {
  type ApiDeTeste,
  atribuir,
  criarConta,
  criarPerfil,
  criarPessoa,
  type Entrada,
} from './integracao.ts';

/**
 * Os do estoque, com as solicitações:
 * - `ana`: a administradora, com todas as permissões;
 * - `carla`: atende as solicitações, movimenta o estoque e vê os ativos só em Jundiaí;
 * - `bruno`: só vê as solicitações de Jundiaí;
 * - `davi`: vê os consumíveis, e não as solicitações;
 * - `eva`: atende as solicitações e vê os ativos de Jundiaí, sem movimentar o estoque.
 */
export const USUARIOS_DAS_SOLICITACOES = [...USUARIOS_DO_ESTOQUE, 'eva'] as const;
export type UsuarioDasSolicitacoes = (typeof USUARIOS_DAS_SOLICITACOES)[number];

export type SolicitacoesDeTeste = Awaited<ReturnType<typeof montarSolicitacoes>>;

export async function montarSolicitacoes(api: ApiDeTeste, host: string) {
  const e = await montarEstoque(api, host);
  const { org, locais } = e;
  const perfis = {
    atendente: await criarPerfil(api, org, {
      nome: 'Atendente',
      permissoes: ['solicitacoes.atender'],
    }),
    leitura: await criarPerfil(api, org, {
      nome: 'Leitura das solicitações',
      permissoes: ['solicitacoes.ver'],
    }),
    atendenteSemEstoque: await criarPerfil(api, org, {
      nome: 'Atendente sem estoque',
      permissoes: ['solicitacoes.atender', 'ativos.ver'],
    }),
  };
  await atribuir(api, org, {
    perfilId: perfis.atendente,
    contaId: e.contas.carla,
    localId: locais.jundiai,
  });
  await atribuir(api, org, {
    perfilId: perfis.leitura,
    contaId: e.contas.bruno,
    localId: locais.jundiai,
  });
  const eva = (await criarConta(api, org, { usuario: 'eva', nome: 'Eva Martins' })).id;
  await atribuir(api, org, {
    perfilId: perfis.atendenteSemEstoque,
    contaId: eva,
    localId: locais.jundiai,
  });
  const entradas: Record<UsuarioDasSolicitacoes, Entrada> = {
    ...e.entradas,
    eva: await e.cliente.entrar('eva'),
  };
  const pessoas = {
    joana: await criarPessoa(api, org, { nome: 'Joana Prado', localId: locais.expedicao }),
    marcos: await criarPessoa(api, org, { nome: 'Marcos Lima', situacao: 'inativa' }),
  };
  const notebook = await criarTipo(api, org, { nome: 'Notebook' });
  const latitude = await criarModelo(api, org, {
    tipoId: notebook,
    fabricante: 'Dell',
    nome: 'Latitude 5440',
  });
  const ativos = {
    ...e.ativos,
    pat00415: await criarAtivoDoTipo(api, org, {
      tipoId: e.tipos.impressora,
      modeloId: e.modelos.m404,
      patrimonio: 'PAT-00415',
      localId: locais.almoxarifado,
    }),
    nb0031: await criarAtivoDoTipo(api, org, {
      tipoId: notebook,
      modeloId: latitude,
      patrimonio: 'NB-0031',
      localId: locais.expedicao,
    }),
  };
  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(consumiveisDosModelos).values({
      orgId: org,
      consumivelId: e.consumiveis.cf258a,
      modeloId: e.modelos.m404,
    }),
  );
  return {
    ...e,
    contas: { ...e.contas, eva },
    entradas,
    pessoas,
    tipos: { ...e.tipos, notebook },
    ativos,
  };
}

/** Um consumível de uma cor, compatível com o modelo, direto no banco. */
export function criarCompativel(
  api: ApiDeTeste,
  org: string,
  { codigo, cor, modeloId }: { codigo: string; cor: 'preto' | 'ciano'; modeloId: string },
): Promise<string> {
  return naOrganizacao(api.banco, org, async (tx) => {
    const [consumivel] = await tx
      .insert(consumiveis)
      .values({
        orgId: org,
        codigo,
        codigoNormalizado: codigoNormalizado(codigo),
        tipo: 'toner',
        cor,
        situacao: 'ativo',
      })
      .returning({ id: consumiveis.id });
    const id = consumivel?.id ?? '';
    await tx.insert(consumiveisDosModelos).values({ orgId: org, consumivelId: id, modeloId });
    return id;
  });
}
