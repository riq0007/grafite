// O corte de quem tem a permissão, na consulta das outras contas (change chat-com-chamados, tarefa
// 3.1, nota da revisão): o mesmo do `resolverAcesso`. A permissão da organização inteira não vale
// numa atribuição com local, nem pelo que ela inclui: o `operacao.administrar` inclui o `ordens.ver`,
// que é de local, e dá o ver das OS só na atribuição sem local.
import { contas, naOrganizacao } from '@grafite/db';
import type { Permissao } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
} from '../../test/integracao.ts';
import { contaTemAPermissao } from './quem-usa.ts';

let api: ApiDeTeste;
let org: string;
let jundiai: string;

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: ['grafite.quem-usa.local'] });
  jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  return () => api.fechar();
});

const tem = async (contaId: string, chave: Permissao) => {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ tem: sql<boolean>`${contaTemAPermissao(contaId, chave)}` })
      .from(contas)
      .where(eq(contas.id, contaId)),
  );
  return linha?.tem;
};

const contaCom = async (usuario: string, permissoes: Permissao[], localId: string | null) => {
  const conta = await criarConta(api, org, { usuario });
  const perfilId = await criarPerfil(api, org, { nome: `Perfil de ${usuario}`, permissoes });
  await atribuir(api, org, { perfilId, contaId: conta.id, localId });
  return conta.id;
};

describe('a permissão na consulta', () => {
  it('a permissão da organização que inclui uma de local só a dá sem local', async () => {
    expect(
      await tem(await contaCom('operacao-local', ['operacao.administrar'], jundiai), 'ordens.ver'),
    ).toBe(false);
    expect(
      await tem(await contaCom('operacao-org', ['operacao.administrar'], null), 'ordens.ver'),
    ).toBe(true);
  });

  it('a permissão de local vale no local, e a da organização, só sem local', async () => {
    expect(await tem(await contaCom('ordens-local', ['ordens.ver'], jundiai), 'ordens.ver')).toBe(
      true,
    );
    expect(
      await tem(await contaCom('atender-local', ['ordens.atender'], jundiai), 'ordens.ver'),
    ).toBe(true);
    expect(await tem(await contaCom('chat-local', ['chat.usar'], jundiai), 'chat.usar')).toBe(
      false,
    );
    expect(await tem(await contaCom('chat-org', ['chat.usar'], null), 'chat.usar')).toBe(true);
  });
});
