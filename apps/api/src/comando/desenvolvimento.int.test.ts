// A senha do ambiente de desenvolvimento (spec plataforma-base; change
// senha-do-admin-no-desenvolvimento): a conta `admin` da organização de desenvolvimento entra com
// `admin123`, sem troca, garantida a cada execução do `pnpm dev`, e nunca fora dele. Os testes
// seguem em ordem, sobre a mesma organização, como execuções seguidas do `pnpm dev`.
import {
  auditoria,
  chavesDaAba,
  contas,
  diretorios,
  enderecosDeAcesso,
  grupos,
  mapeamentosDoDiretorio,
  naOrganizacao,
  perfis,
  tentativasDeEntrada,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHAVES_DO_COFRE_DE_TESTE } from '../../test/dependencias.ts';
import { type ApiDeTeste, abrirApi, clienteDaApi, novoIp } from '../../test/integracao.ts';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { conferirSenha, gerarHashDaSenha } from '../acesso/senhas.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import {
  conectarDiretorioDeDesenvolvimento,
  GRUPO_DO_AD_DE_DESENVOLVIMENTO,
  SENHA_DA_ABA_DE_DESENVOLVIMENTO,
  SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO,
} from '../diretorio/desenvolvimento.ts';
import {
  garantirDiretorioDeDesenvolvimento,
  garantirSenhaDeDesenvolvimento,
} from './desenvolvimento.ts';
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

// O diretório de desenvolvimento (change aba-dos-colaboradores, design, decisão 13): o `pnpm dev`
// liga na mesma organização o AD simulado, com o grupo mapeado ao chat e a chave da aba do .env.
describe('o diretório de desenvolvimento', () => {
  const CHAVE_DA_ABA = 'chave-da-aba-de-desenvolvimento-de-teste';
  const QUEM = { usuario: 'fernanda.lima', sid: 'S-1-5-21-1004336348-1177238915-682003330-1001' };

  const garantirODiretorio = (nodeEnv = 'development') =>
    garantirDiretorioDeDesenvolvimento({
      banco: () => api.banco,
      agora: api.relogio.agora,
      nodeEnv,
      chavesDoCofre: CHAVES_DO_COFRE_DE_TESTE,
      chaveDaAba: CHAVE_DA_ABA,
    });

  const oQueTem = () =>
    naOrganizacao(api.banco, orgId, async (tx) => ({
      diretorios: await tx.select().from(diretorios),
      mapeamentos: await tx
        .select({ grupoDn: mapeamentosDoDiretorio.grupoDn, grupo: grupos.nome })
        .from(mapeamentosDoDiretorio)
        .innerJoin(grupos, eq(grupos.id, mapeamentosDoDiretorio.grupoId)),
      chaves: await tx.select({ hash: chavesDaAba.hash }).from(chavesDaAba),
      perfis: await tx
        .select({ nome: perfis.nome, permissoes: perfis.permissoes })
        .from(perfis)
        .where(eq(perfis.nome, 'Colaborador da aba')),
    }));

  it('em produção, recusa antes de abrir o banco', async () => {
    const recusa = garantirDiretorioDeDesenvolvimento({
      banco: () => {
        throw new Error('O banco não devia ser aberto em produção.');
      },
      agora: api.relogio.agora,
      nodeEnv: 'production',
      chavesDoCofre: CHAVES_DO_COFRE_DE_TESTE,
      chaveDaAba: CHAVE_DA_ABA,
    });
    await expect(recusa).rejects.toThrow(/produção/);
  });

  it('a organização com um endereço que não é local é recusada, sem nada gravado', async () => {
    await expect(garantirODiretorio()).rejects.toThrow('grafite.desenvolvimento.example');
    expect(await oQueTem()).toEqual({ diretorios: [], mapeamentos: [], chaves: [], perfis: [] });
    await naOrganizacao(api.banco, orgId, (tx) =>
      tx
        .delete(enderecosDeAcesso)
        .where(eq(enderecosDeAcesso.endereco, 'grafite.desenvolvimento.example')),
    );
  });

  it('liga o diretório simulado, o grupo com o chat e a chave da aba', async () => {
    expect(await garantirODiretorio()).toBe('gravado');
    const tem = await oQueTem();
    expect(tem.diretorios).toMatchObject([
      {
        servidor: SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO,
        ligado: true,
        conferirCertificado: false,
      },
    ]);
    expect(tem.mapeamentos).toEqual([
      { grupoDn: GRUPO_DO_AD_DE_DESENVOLVIMENTO, grupo: 'Colaboradores' },
    ]);
    expect(tem.perfis).toEqual([{ nome: 'Colaborador da aba', permissoes: ['chat.usar'] }]);
    expect(tem.chaves).toEqual([{ hash: hashDoToken(CHAVE_DA_ABA) }]);
  });

  it('na segunda vez, nada é gravado de novo', async () => {
    const antes = await oQueTem();
    expect(await garantirODiretorio()).toBe('mantido');
    expect(await oQueTem()).toEqual(antes);
  });

  it('quem desenvolve entra pelo diretório com a senha da aba, e ganha o grupo do chat', async () => {
    const comODiretorio = await abrirApi({
      conectarDiretorio: conectarDiretorioDeDesenvolvimento({
        quem: QUEM,
        enderecosDa: async () => ['localhost', '127.0.0.1'],
        outro: () => {
          throw new Error('Só o diretório simulado devia atender.');
        },
        avisar: () => {},
      }),
    });
    try {
      const entrada = await comODiretorio.app.inject({
        method: 'POST',
        url: '/sessao',
        remoteAddress: novoIp(),
        headers: { host: 'localhost', 'sec-fetch-site': 'same-origin' },
        payload: { usuario: 'fernanda.lima', senha: SENHA_DA_ABA_DE_DESENVOLVIMENTO },
      });
      expect(entrada.statusCode).toBe(200);
    } finally {
      await comODiretorio.fechar();
    }
  });

  it('com outro diretório ligado, ele fica como está; desligado, dá lugar ao simulado', async () => {
    await naOrganizacao(api.banco, orgId, (tx) =>
      tx.update(diretorios).set({ servidor: 'ldaps://dc01.empresa.local' }),
    );
    expect(await garantirODiretorio()).toBe('outro-diretorio');
    expect((await oQueTem()).diretorios[0]?.servidor).toBe('ldaps://dc01.empresa.local');

    await naOrganizacao(api.banco, orgId, (tx) => tx.update(diretorios).set({ ligado: false }));
    expect(await garantirODiretorio()).toBe('gravado');
    expect((await oQueTem()).diretorios).toMatchObject([
      { servidor: SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO, ligado: true },
    ]);
  });
});
