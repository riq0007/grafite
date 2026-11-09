// O cofre dos testes de integração (P6): uma organização com quem administra o cofre, quem o usa,
// pela conta, pelo grupo ou pelo perfil, todos com a verificação em dois passos ativa, quem usa sem
// ela e quem não usa, e os atalhos que preparam o banco sem as rotas: liberar um segredo a um
// titular e cadastrar um ativo.
import {
  acessosAosSegredos,
  ativos,
  naOrganizacao,
  organizacoes,
  segredos,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import {
  type ApiDeTeste,
  ativarDoisPassos,
  atribuir,
  clienteDaApi,
  criarConta,
  criarGrupo,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from './integracao.ts';

/**
 * - `ana`: administra o cofre;
 * - `bruno`: usa o cofre;
 * - `carla`: usa o cofre e tem o perfil Técnico só em Jundiaí;
 * - `davi`: usa o cofre, sem a verificação em dois passos;
 * - `eva`: não usa o cofre.
 */
export const USUARIOS_DO_COFRE = ['ana', 'bruno', 'carla', 'davi', 'eva'] as const;
export type UsuarioDoCofre = (typeof USUARIOS_DO_COFRE)[number];

const NOMES: Record<UsuarioDoCofre, string> = {
  ana: 'Ana Souza',
  bruno: 'Bruno Lima',
  carla: 'Carla Dias',
  davi: 'Davi Rocha',
  eva: 'Eva Martins',
};

export interface ContaDoCofre {
  id: string;
  nome: string;
  /** A chave do app autenticador, para gerar o código; nula na conta sem os dois passos. */
  chaveDoApp: Buffer | null;
  /** Os códigos de recuperação, ainda sem uso. */
  codigos: string[];
}

export type CofreDeTeste = Awaited<ReturnType<typeof montarCofre>>;

export async function montarCofre(api: ApiDeTeste, host: string) {
  const org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const cliente = clienteDaApi(api, host);
  const perfis = {
    administra: await criarPerfil(api, org, {
      nome: 'Cofre',
      permissoes: ['cofre.administrar', 'ativos.ver'],
    }),
    usa: await criarPerfil(api, org, { nome: 'Uso do cofre', permissoes: ['cofre.usar'] }),
    tecnico: await criarPerfil(api, org, { nome: 'Técnico', permissoes: ['ativos.ver'] }),
  };
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const suporte = await criarGrupo(api, org, { nome: 'Suporte' });

  const contas = {} as Record<UsuarioDoCofre, ContaDoCofre>;
  for (const usuario of USUARIOS_DO_COFRE) {
    const conta = await criarConta(api, org, { usuario, nome: NOMES[usuario] });
    const doisPassos = usuario === 'davi' ? null : await ativarDoisPassos(api, org, conta.id);
    contas[usuario] = {
      id: conta.id,
      nome: NOMES[usuario],
      chaveDoApp: doisPassos?.chaveDoApp ?? null,
      codigos: doisPassos?.codigos ?? [],
    };
  }
  await atribuir(api, org, { perfilId: perfis.administra, contaId: contas.ana.id });
  for (const usuario of ['bruno', 'carla', 'davi'] as const) {
    await atribuir(api, org, { perfilId: perfis.usa, contaId: contas[usuario].id });
  }
  await atribuir(api, org, {
    perfilId: perfis.tecnico,
    contaId: contas.carla.id,
    localId: jundiai,
  });

  const entradas = {} as Record<UsuarioDoCofre, Entrada>;
  for (const usuario of USUARIOS_DO_COFRE) {
    const { chaveDoApp } = contas[usuario];
    entradas[usuario] = chaveDoApp
      ? await cliente.entrarComCodigo(usuario, chaveDoApp)
      : await cliente.entrar(usuario);
  }

  return {
    org,
    cliente,
    contas,
    perfis,
    jundiai,
    suporte,
    /** A entrada de cada conta, que o teste troca quando entra de novo. */
    entradas,
    como: (usuario: UsuarioDoCofre) => entradas[usuario] ?? SEM_ENTRADA,
  };
}

/** Libera o segredo a um titular direto no banco, como o acesso salvo pela ficha. */
export function liberar(
  api: ApiDeTeste,
  org: string,
  segredoId: string,
  titular: { contaId: string } | { grupoId: string } | { perfilId: string },
) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx.insert(acessosAosSegredos).values({ orgId: org, segredoId, ...titular }),
  );
}

/** Muda a situação do segredo direto no banco. */
export function mudarSituacaoDoSegredo(
  api: ApiDeTeste,
  org: string,
  segredoId: string,
  situacao: 'ativo' | 'inativo',
) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx.update(segredos).set({ situacao }).where(eq(segredos.id, segredoId)),
  );
}

/** Liga ou desliga o Cofre na organização, direto no banco. */
export function ligarOCofre(api: ApiDeTeste, org: string, ligado: boolean) {
  return naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(organizacoes)
      .set({ modulosDesligados: ligado ? [] : ['cofre'] })
      .where(eq(organizacoes.id, org)),
  );
}

let ativosCriados = 0;

/** Um ativo de um tipo novo, direto no banco, com o patrimônio e o nome dados. */
export async function criarAtivo(
  api: ApiDeTeste,
  org: string,
  {
    patrimonio,
    nome = null,
    situacao = 'ativo',
  }: { patrimonio: string; nome?: string | null; situacao?: 'ativo' | 'inativo' },
): Promise<string> {
  ativosCriados += 1;
  return naOrganizacao(api.banco, org, async (tx) => {
    const nomeDoTipo = `Switch ${ativosCriados}`;
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: nomeDoTipo,
        nomeNormalizado: normalizarTexto(nomeDoTipo),
        icone: 'switch',
      })
      .returning({ id: tiposDeAtivo.id });
    const [ativo] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId: tipo?.id ?? '',
        nome,
        patrimonio,
        patrimonioNormalizado: normalizarTexto(patrimonio),
        situacao,
        busca: normalizarTexto(`${patrimonio} ${nome ?? ''}`),
      })
      .returning({ id: ativos.id });
    return ativo?.id ?? '';
  });
}
