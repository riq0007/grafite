// A pessoa da aba pelo SID (spec aba-dos-colaboradores, "Pessoa pelo usuário do Windows"; design,
// decisão 4), com o AD em memória: a pessoa do grupo mapeado é aceita com o usuário do atributo; o
// SID fora do diretório, o usuário que não serve, a conta local, a conta e a pessoa inativas, a falta
// de grupo, a conta desativada no AD e o diretório desligado ou fora do ar são recusados, sem conta.
import { atribuicoes, contas, diretorios, grupos, naOrganizacao, pessoas } from '@grafite/db';
import { FRASES_SEM_CONEXAO } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVES_DO_COFRE_DE_TESTE } from '../../test/dependencias.ts';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
import {
  type ApiDeTeste,
  abrirApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
} from '../../test/integracao.ts';
import { conferirPessoaPeloSid } from './aba.ts';
import { contaPeloDiretorio } from './entrada.ts';
import { criarDiretorioSimulado } from './simulado.ts';

const host = 'grafite.aba-sid.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let grupoId = '';
const avisar = vi.fn();

const SID = {
  fernanda: 'S-1-5-21-1004336348-1177238915-682003330-1105',
  sergio: 'S-1-5-21-1004336348-1177238915-682003330-1106',
  admin: 'S-1-5-21-1004336348-1177238915-682003330-500',
  semGrupo: 'S-1-5-21-1004336348-1177238915-682003330-1107',
  desativada: 'S-1-5-21-1004336348-1177238915-682003330-1108',
  invalido: 'S-1-5-21-1004336348-1177238915-682003330-1109',
  // O usuário local "suporte" do computador: o SID dele não está no AD.
  local: 'S-1-5-21-3623811015-3361044348-30300820-1013',
};

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const conferir = (sid: string) =>
  conferirPessoaPeloSid(api.banco, {
    orgId: org,
    busca: { sid },
    chaves: CHAVES_DO_COFRE_DE_TESTE,
    conectar: ad.conectar,
    avisar,
  });

const quantasContas = async () => (await naOrg((tx) => tx.select().from(contas))).length;

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await criarConta(api, org, { usuario: 'admin', nome: 'Administração' });
  const perfil = await criarPerfil(api, org, {
    nome: 'Colaborador',
    permissoes: ['chat.usar', 'chamados.pedir'],
  });
  const financeiro = ad.usuario({
    usuario: 'Fernanda.Lima',
    nome: 'Fernanda Lima',
    email: 'fernanda@empresa.com',
    senha: 'senha-da-fernanda',
    sid: SID.fernanda,
  });
  const sergio = ad.usuario({
    usuario: 'sergio.prado',
    nome: 'Sérgio Prado',
    senha: 'senha-do-sergio',
    sid: SID.sergio,
  });
  const admin = ad.usuario({ usuario: 'admin', nome: 'Admin', senha: 'x', sid: SID.admin });
  ad.usuario({ usuario: 'joao.sem', nome: 'João Sem', senha: 'x', sid: SID.semGrupo });
  const desativada = ad.usuario({
    usuario: 'carla.dias',
    nome: 'Carla Dias',
    senha: 'x',
    ativa: false,
    sid: SID.desativada,
  });
  const invalido = ad.usuario({
    usuario: 'conta com espaço',
    nome: 'Conta Com Espaço',
    senha: 'x',
    sid: SID.invalido,
  });
  const dnDoGrupo = ad.grupo('Colaboradores-Financeiro', [
    financeiro,
    sergio,
    admin,
    desativada,
    invalido,
  ]);

  await naOrg(async (tx) => {
    const [grupo] = await tx
      .insert(grupos)
      .values({ orgId: org, nome: 'Colaboradores', nomeNormalizado: 'colaboradores' })
      .returning({ id: grupos.id });
    grupoId = grupo?.id ?? '';
    await tx.insert(atribuicoes).values({ orgId: org, perfilId: perfil, grupoId });
  });
  await ligarDiretorioSimulado(api, org, [[dnDoGrupo, grupoId]]);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  ad.estado.foraDoAr = false;
});

describe('a pessoa aceita', () => {
  it('Fernanda na aba pela primeira vez: o usuário do atributo, normalizado, com o grupo mapeado', async () => {
    const r = await conferir(SID.fernanda);
    expect(r).toMatchObject({
      tipo: 'aceita',
      usuario: 'fernanda.lima',
      aceita: { tipo: 'aceita', grupos: [grupoId], usuario: { nome: 'Fernanda Lima' } },
    });
    // A conferência não cria nada: a conta nasce na transação da sessão.
    expect(await quantasContas()).toBe(1);
  });
});

describe('as recusas, sem conta criada', () => {
  it('Usuário local do Windows: o SID fora do diretório', async () => {
    expect(await conferir(SID.local)).toMatchObject({
      tipo: 'recusada',
      motivo: 'usuario-de-fora',
      detalhe: 'sid-fora-do-diretorio',
    });
    expect(FRASES_SEM_CONEXAO['usuario-de-fora']).toBe(
      'Entre no Windows com o seu usuário da empresa para usar a aba.',
    );
  });

  it('o SID fora da forma não chega ao AD', async () => {
    const antes = ad.estado.acessos.length;
    expect(await conferir('S-1-5-21-1)(objectClass=*')).toMatchObject({
      tipo: 'recusada',
      motivo: 'usuario-de-fora',
      detalhe: 'sid-fora-da-forma',
    });
    expect(ad.estado.acessos.length).toBe(antes);
  });

  it('o usuário do AD que não serve de usuário do Grafite tem a mesma frase', async () => {
    expect(await conferir(SID.invalido)).toMatchObject({
      tipo: 'recusada',
      motivo: 'usuario-de-fora',
      detalhe: 'usuario-nao-serve',
    });
    expect(await quantasContas()).toBe(1);
  });

  it('Conta local com o mesmo usuário: recusada, e a conta local não muda', async () => {
    const [antes] = await naOrg((tx) =>
      tx.select().from(contas).where(eq(contas.usuario, 'admin')),
    );
    expect(await conferir(SID.admin)).toMatchObject({ tipo: 'recusada', motivo: 'conta-local' });
    expect(FRASES_SEM_CONEXAO['conta-local']).toBe(
      'A conta deste usuário é local do Grafite e não entra pela aba.',
    );
    const [depois] = await naOrg((tx) =>
      tx.select().from(contas).where(eq(contas.usuario, 'admin')),
    );
    expect(depois).toEqual(antes);
  });

  it('a conta inativa e a da pessoa inativa no Grafite', async () => {
    const r = await conferir(SID.sergio);
    if (r.tipo !== 'aceita') throw new Error('Sérgio devia ser aceito');
    const contaId = await naOrg((tx) =>
      contaPeloDiretorio(tx, {
        orgId: org,
        usuario: r.usuario,
        aceita: r.aceita,
        momento: api.relogio.agora(),
      }),
    );
    await naOrg((tx) =>
      tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, contaId)),
    );
    expect(await conferir(SID.sergio)).toMatchObject({ tipo: 'recusada', motivo: 'conta-inativa' });
    await naOrg(async (tx) => {
      await tx.update(contas).set({ situacao: 'ativa' }).where(eq(contas.id, contaId));
      const [conta] = await tx.select().from(contas).where(eq(contas.id, contaId));
      await tx
        .update(pessoas)
        .set({ situacao: 'inativa' })
        .where(eq(pessoas.id, conta?.pessoaId ?? ''));
    });
    expect(await conferir(SID.sergio)).toMatchObject({ tipo: 'recusada', motivo: 'conta-inativa' });
    expect(FRASES_SEM_CONEXAO['conta-inativa']).toBe(
      'Sua conta está inativa no Grafite. Fale com a TI.',
    );
  });

  it('sem grupo mapeado, e a conta desativada no AD, com a frase da entrada pelo diretório', async () => {
    expect(await conferir(SID.semGrupo)).toMatchObject({
      tipo: 'recusada',
      motivo: 'sem-grupo',
      detalhe: 'sem-grupo-mapeado',
    });
    expect(await conferir(SID.desativada)).toMatchObject({
      tipo: 'recusada',
      motivo: 'sem-grupo',
      detalhe: 'desativada-no-ad',
      quem: { usuario: 'carla.dias', nome: 'Carla Dias' },
    });
    expect(FRASES_SEM_CONEXAO['sem-grupo']).toBe(
      'Seu usuário do AD não tem acesso ao Grafite. Peça a liberação a quem administra os acessos.',
    );
  });

  it('o AD fora do ar e o diretório desligado: a TI fora do alcance', async () => {
    ad.estado.foraDoAr = true;
    expect(await conferir(SID.fernanda)).toMatchObject({
      tipo: 'recusada',
      motivo: 'ti-fora-do-alcance',
    });
    expect(avisar).toHaveBeenCalledWith(
      { motivo: 'nao-respondeu' },
      'o diretório não atendeu a pessoa da aba',
    );
    ad.estado.foraDoAr = false;
    await naOrg((tx) => tx.update(diretorios).set({ ligado: false }));
    expect(await conferir(SID.fernanda)).toMatchObject({
      tipo: 'recusada',
      motivo: 'ti-fora-do-alcance',
    });
    await naOrg((tx) => tx.update(diretorios).set({ ligado: true }));
    expect(FRASES_SEM_CONEXAO['ti-fora-do-alcance']).toBe('A TI não está ao alcance agora.');
    expect(await conferir(SID.fernanda)).toMatchObject({ tipo: 'aceita' });
  });
});
