// A senha do ambiente de desenvolvimento (spec plataforma-base; change
// senha-do-admin-no-desenvolvimento): a conta `admin` da organização de desenvolvimento entra com
// `admin123`, sem troca, garantida a cada execução do `pnpm dev`, e nunca fora dele. Os testes
// seguem em ordem, sobre a mesma organização, como execuções seguidas do `pnpm dev`.
import {
  auditoria,
  contas,
  enderecosDeAcesso,
  naOrganizacao,
  tentativasDeEntrada,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, clienteDaApi, novoIp } from '../../test/integracao.ts';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { conferirSenha, gerarHashDaSenha } from '../acesso/senhas.ts';
import { garantirSenhaDeDesenvolvimento } from './desenvolvimento.ts';
import { ErroDoComando } from './erros.ts';
import { criarOrganizacao } from './organizacao.ts';

let api: ApiDeTeste;
let orgId = '';

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

const garantir = () =>
  garantirSenhaDeDesenvolvimento({
    banco: () => api.banco,
    agora: api.relogio.agora,
    nodeEnv: 'development',
  });

/** A conta `admin` e as ações da auditoria da organização de desenvolvimento, em ordem. */
const situacao = () =>
  naOrganizacao(api.banco, orgId, async (tx) => ({
    conta: (await tx.select().from(contas).where(eq(contas.usuario, 'admin')))[0],
    acoes: await tx
      .select({ acao: auditoria.acao, atorDescricao: auditoria.atorDescricao })
      .from(auditoria)
      .orderBy(auditoria.id),
  }));

const pelaTela = () => clienteDaApi(api, 'localhost');

async function trocarOUsuario(de: string, para: string) {
  await naOrganizacao(api.banco, orgId, (tx) =>
    tx.update(contas).set({ usuario: para }).where(eq(contas.usuario, de)),
  );
}

describe('a senha de desenvolvimento', () => {
  it('em produção, recusa antes de abrir o banco', async () => {
    const recusa = garantirSenhaDeDesenvolvimento({
      banco: () => {
        throw new Error('O banco não devia ser aberto em produção.');
      },
      agora: api.relogio.agora,
      nodeEnv: 'production',
    });
    await expect(recusa).rejects.toBeInstanceOf(ErroDoComando);
    await expect(recusa).rejects.toThrow(/produção/);
  });

  it('sem a organização de desenvolvimento, diz o que falta', async () => {
    await expect(garantir()).rejects.toThrow(/Nenhuma organização tem o endereço localhost/);
  });

  it('a conta admin recém-criada passa a entrar com admin123, sem troca', async () => {
    await criarOrganizacao(api.banco, api.relogio.agora, {
      nome: 'Desenvolvimento',
      enderecos: ['localhost', '127.0.0.1'],
      pessoa: 'Administrador',
      usuario: 'admin',
      exigirDoisPassos: false,
      seNaoExistir: true,
    });
    orgId = (await organizacaoDoEndereco(api.banco, 'localhost')) ?? '';
    // Uma senha errada antes: a recusa conta para o bloqueio da entrada.
    const recusada = await api.app.inject({
      method: 'POST',
      url: '/sessao',
      remoteAddress: novoIp(),
      headers: { host: 'localhost', 'sec-fetch-site': 'same-origin' },
      payload: { usuario: 'admin', senha: 'senha errada de propósito' },
    });
    expect(recusada.statusCode).toBe(401);

    expect(await garantir()).toBe('gravada');

    const { conta, acoes } = await situacao();
    expect(conta?.senhaTemporaria).toBe(false);
    expect(await conferirSenha('admin123', conta?.hashSenha ?? '')).toBe(true);
    expect(acoes.at(-1)).toEqual({
      acao: 'senha.trocada',
      atorDescricao: 'comando de desenvolvimento',
    });
    const [tentativas] = await naOrganizacao(api.banco, orgId, (tx) =>
      tx.select().from(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, 'admin')),
    );
    expect(tentativas?.falhasSeguidas).toBe(0);

    // A entrada com admin e admin123 abre a casca: a sessão vale, sem nenhuma pendência.
    const entrada = await pelaTela().entrar('admin', 'admin123');
    const estado = await pelaTela().consultar('/sessao', entrada);
    expect(estado.json().sessao).toMatchObject({ pendencia: null });
  });

  it('com a senha já admin123, nada é gravado', async () => {
    const antes = await situacao();
    expect(await garantir()).toBe('mantida');
    const depois = await situacao();
    expect(depois.conta).toEqual(antes.conta);
    expect(depois.acoes).toHaveLength(antes.acoes.length);
  });

  it('com outra senha, ela volta a admin123, e as sessões abertas da conta são encerradas', async () => {
    const aberta = await pelaTela().entrar('admin', 'admin123');
    await naOrganizacao(api.banco, orgId, async (tx) =>
      tx
        .update(contas)
        .set({ hashSenha: await gerarHashDaSenha('cavalo bateria grampo correto') })
        .where(eq(contas.usuario, 'admin')),
    );

    expect(await garantir()).toBe('gravada');

    const { conta } = await situacao();
    expect(await conferirSenha('admin123', conta?.hashSenha ?? '')).toBe(true);
    expect((await pelaTela().consultar('/sessao', aberta)).json().sessao).toBeNull();
  });

  it('sem a conta admin, diz o que falta', async () => {
    await trocarOUsuario('admin', 'administrador');
    try {
      await expect(garantir()).rejects.toThrow(/Nenhuma conta com o usuário admin/);
    } finally {
      await trocarOUsuario('administrador', 'admin');
    }
  });

  it('a organização com um endereço que não é local é recusada, e a conta não muda', async () => {
    // Um endereço só deste teste: o banco da integração é o mesmo para todos os arquivos.
    const deVerdade = 'grafite.desenvolvimento.example';
    await naOrganizacao(api.banco, orgId, async (tx) => {
      await tx.insert(enderecosDeAcesso).values({ orgId, endereco: deVerdade });
      // Temporária, a senha seria gravada de novo, se não fosse a recusa.
      await tx.update(contas).set({ senhaTemporaria: true }).where(eq(contas.usuario, 'admin'));
    });
    const antes = await situacao();
    await expect(garantir()).rejects.toThrow(deVerdade);
    expect(await situacao()).toEqual(antes);
  });
});
