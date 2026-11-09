// A entrada pelo diretório (spec diretorio-ad, "Entrada pelo diretório"; change integracao-ad-ldap,
// design, decisão 3), com o AD em memória: a primeira entrada cria a conta e dá os grupos mapeados;
// o usuário sem grupo mapeado, a senha errada e a conta desativada no AD são recusados; a saída de
// um grupo no AD tira a conta só do grupo mapeado; o AD fora do ar e o diretório desligado deixam a
// conta local entrar; e a senha do AD nunca vira o hash da conta.
import {
  atribuicoes,
  auditoria,
  contas,
  diretorios,
  grupos,
  mapeamentosDoDiretorio,
  membrosDoGrupo,
  naOrganizacao,
  pessoas,
  segredos,
  tentativasDeEntrada,
} from '@grafite/db';
import { normalizarDn, normalizarTexto } from '@grafite/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CHAVES_DO_COFRE_DE_TESTE } from '../../test/dependencias.ts';
import { CONTA_DE_SERVICO_DE_TESTE, criarAdDeTeste } from '../../test/diretorio.ts';
import {
  type ApiDeTeste,
  abrirApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  novoIp,
} from '../../test/integracao.ts';
import { conferirSenha } from '../acesso/senhas.ts';
import { cifrarSegredo } from '../cofre/cifra.ts';

const host = 'grafite.entrada-ad.local';
const ad = criarAdDeTeste();
let api: ApiDeTeste;
let org = '';
const ids: Record<string, string> = {};
const dns: Record<string, string> = {};

const entrar = (usuario: string, senha: string) =>
  api.app.inject({
    method: 'POST',
    url: '/sessao',
    remoteAddress: novoIp(),
    headers: { host, 'sec-fetch-site': 'same-origin' },
    payload: { usuario, senha },
  });

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

async function grupoComPerfil(nome: string, perfilId: string | null) {
  return naOrg(async (tx) => {
    const [grupo] = await tx
      .insert(grupos)
      .values({ orgId: org, nome, nomeNormalizado: normalizarTexto(nome) })
      .returning({ id: grupos.id });
    if (perfilId) {
      await tx.insert(atribuicoes).values({ orgId: org, perfilId, grupoId: grupo?.id ?? '' });
    }
    return grupo?.id ?? '';
  });
}

/** Os grupos do Grafite em que a conta está agora, pelo nome. */
const gruposDaConta = (usuario: string) =>
  naOrg((tx) =>
    tx
      .select({ nome: grupos.nome })
      .from(membrosDoGrupo)
      .innerJoin(contas, eq(contas.id, membrosDoGrupo.contaId))
      .innerJoin(grupos, eq(grupos.id, membrosDoGrupo.grupoId))
      .where(and(eq(contas.usuario, usuario), isNull(membrosDoGrupo.encerradaEm)))
      .orderBy(grupos.nome),
  ).then((linhas) => linhas.map(({ nome }) => nome));

const ligarDiretorio = (ligado: boolean) => naOrg((tx) => tx.update(diretorios).set({ ligado }));

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  const tecnico = await criarPerfil(api, org, { nome: 'Técnico', permissoes: ['ativos.ver'] });
  const gestor = await criarPerfil(api, org, { nome: 'Gestor', permissoes: ['auditoria.ver'] });
  ids.tecnicos = await grupoComPerfil('Técnicos', tecnico);
  ids.gestores = await grupoComPerfil('Gestores', gestor);
  ids.manual = await grupoComPerfil('Plantão', null);

  dns.mariana = ad.usuario({
    usuario: 'mariana.alves',
    nome: 'Mariana Alves',
    email: 'mariana@empresa.com',
    senha: 'senha-do-ad',
  });
  dns.joao = ad.usuario({ usuario: 'joao.lima', nome: 'João Lima', senha: 'senha-do-joao' });
  dns.desativada = ad.usuario({
    usuario: 'carla.dias',
    nome: 'Carla Dias',
    senha: 'senha-da-carla',
    ativa: false,
  });
  dns.suporte = ad.grupo('TI-Suporte', [dns.mariana, dns.desativada]);
  dns.gestao = ad.grupo('TI-Gestao', [dns.mariana]);

  await naOrg(async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
    const segredoId = rows[0]?.id ?? '';
    await tx.insert(segredos).values({
      id: segredoId,
      orgId: org,
      nome: 'Conta do Grafite no AD',
      nomeNormalizado: normalizarTexto('Conta do Grafite no AD'),
      tipo: 'conta-administrativa',
      classificacao: 'equipamento',
      identificador: CONTA_DE_SERVICO_DE_TESTE.usuario,
      ...cifrarSegredo({ valor: CONTA_DE_SERVICO_DE_TESTE.senha }, CHAVES_DO_COFRE_DE_TESTE, {
        orgId: org,
        segredoId,
      }),
    });
    await tx.insert(diretorios).values({
      orgId: org,
      servidor: 'ldaps://dc01.empresa.local',
      baseDn: 'DC=empresa,DC=local',
      segredoId,
      atributoDoUsuario: 'sAMAccountName',
      filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
      ligado: true,
    });
    const pares: [string, string][] = [
      [dns.suporte ?? '', ids.tecnicos ?? ''],
      [dns.gestao ?? '', ids.gestores ?? ''],
    ];
    for (const [dn, grupoId] of pares) {
      await tx.insert(mapeamentosDoDiretorio).values({
        orgId: org,
        grupoDn: dn,
        grupoDnNormalizado: normalizarDn(dn),
        grupoId,
      });
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  ad.estado.foraDoAr = false;
});

describe('a entrada pelo AD', () => {
  it('Primeira entrada pelo AD: cria a conta, dá os grupos mapeados e começa a sessão', async () => {
    const r = await entrar('Mariana.Alves', 'senha-do-ad');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().sessao.pendencia).toBeNull();
    expect(
      r.json().sessao.acesso.permissoes.map((permissao: { chave: string }) => permissao.chave),
    ).toEqual(expect.arrayContaining(['ativos.ver', 'auditoria.ver']));
    const [conta] = await naOrg((tx) =>
      tx
        .select({ conta: contas, pessoa: pessoas })
        .from(contas)
        .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
        .where(eq(contas.usuario, 'mariana.alves')),
    );
    expect(conta?.conta).toMatchObject({ origem: 'diretorio', senhaTemporaria: false });
    expect(conta?.pessoa).toMatchObject({ nome: 'Mariana Alves', email: 'mariana@empresa.com' });
    // A senha do AD nunca vira o hash da conta.
    expect(await conferirSenha('senha-do-ad', conta?.conta.hashSenha ?? '')).toBe(false);
    expect(await gruposDaConta('mariana.alves')).toEqual(['Gestores', 'Técnicos']);
    const acoes = await naOrg((tx) =>
      tx.select({ acao: auditoria.acao, dados: auditoria.dados }).from(auditoria),
    );
    expect(acoes.map(({ acao }) => acao)).toEqual(
      expect.arrayContaining(['diretorio.conta-criada', 'membro.incluido', 'sessao.iniciada']),
    );
    expect(JSON.stringify(acoes)).not.toContain('senha-do-ad');
  });

  it('Usuário sem grupo mapeado: recusa com o motivo, sem criar a conta', async () => {
    const r = await entrar('joao.lima', 'senha-do-joao');
    expect(r.statusCode).toBe(403);
    expect(r.json().detail).toBe(
      'Seu usuário do AD não tem acesso ao Grafite. Peça a liberação a quem administra os acessos.',
    );
    const criadas = await naOrg((tx) =>
      tx.select({ id: contas.id }).from(contas).where(eq(contas.usuario, 'joao.lima')),
    );
    expect(criadas).toEqual([]);
  });

  it('a senha errada e a conta desativada no AD são recusadas como credencial, contando para o bloqueio', async () => {
    const errada = await entrar('mariana.alves', 'errada');
    expect(errada.statusCode).toBe(401);
    const desativada = await entrar('carla.dias', 'senha-da-carla');
    expect(desativada.statusCode).toBe(401);
    const [tentativa] = await naOrg((tx) =>
      tx
        .select({ falhas: tentativasDeEntrada.falhasSeguidas })
        .from(tentativasDeEntrada)
        .where(eq(tentativasDeEntrada.usuario, 'carla.dias')),
    );
    expect(tentativa?.falhas).toBe(1);
  });

  it('Saiu do grupo no AD: sai só do grupo mapeado, e o nome novo do AD chega à pessoa', async () => {
    const [conta] = await naOrg((tx) =>
      tx.select({ id: contas.id }).from(contas).where(eq(contas.usuario, 'mariana.alves')),
    );
    await naOrg((tx) =>
      tx
        .insert(membrosDoGrupo)
        .values({ orgId: org, grupoId: ids.manual ?? '', contaId: conta?.id ?? '' }),
    );
    ad.tirar(dns.mariana ?? '', dns.gestao ?? '');
    const r = await entrar('mariana.alves', 'senha-do-ad');
    expect(r.statusCode, r.body).toBe(200);
    expect(await gruposDaConta('mariana.alves')).toEqual(['Plantão', 'Técnicos']);
  });

  it('com o AD fora do ar, a conta do diretório é recusada com o motivo, e a local entra', async () => {
    ad.estado.foraDoAr = true;
    const r = await entrar('mariana.alves', 'senha-do-ad');
    expect(r.statusCode).toBe(503);
    expect(r.json().detail).toBe('O AD não respondeu. Tente de novo ou use uma conta local.');
    expect((await entrar('ana', 'cavalo bateria grampo correto')).statusCode).toBe(200);
  });

  it('com o diretório desligado, a conta do diretório não entra, nem com a senha do AD', async () => {
    await ligarDiretorio(false);
    try {
      expect((await entrar('mariana.alves', 'senha-do-ad')).statusCode).toBe(401);
      expect((await entrar('ana', 'cavalo bateria grampo correto')).statusCode).toBe(200);
    } finally {
      await ligarDiretorio(true);
    }
  });
});
