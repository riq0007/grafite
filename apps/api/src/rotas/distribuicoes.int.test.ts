// As distribuições pela API (spec distribuicao-de-software; change distribuicao-de-software): a
// distribuição para três máquinas, as recusas (sem máquinas, sem agente, outro local e o pacote
// inativo), a lista e a ficha com o progresso, o pedir agora e as distribuições na ficha do ativo.
import {
  agentes,
  ativos,
  auditoria,
  naOrganizacao,
  pacotesDeSoftware,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.distribuicoes.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const ids: Record<string, string> = {};
const acordados: string[] = [];
let distribuicao = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

beforeAll(async () => {
  api = await abrirApi({
    acordarAgente: async (ip) => {
      acordados.push(ip);
      return ip !== '10.0.0.4';
    },
  });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const administra = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar', 'ativos.ver'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: distribui, contaId: bruno.id, localId: campinas });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
  await naOrg(async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    for (const [chave, ip, localId] of [
      ['pc1', '10.0.0.1', jundiai],
      ['pc2', '10.0.0.2', jundiai],
      ['pc3', null, jundiai],
      ['pc4', '10.0.0.4', jundiai],
      ['pc5', '10.0.0.5', campinas],
    ] as const) {
      const [linha] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: normalizarTexto(`Computador ${chave} PAT-${chave}`),
          nome: `Computador ${chave}`,
          patrimonio: `PAT-${chave}`,
          localId,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      ids[chave] = linha?.id ?? '';
      if (ip) {
        await tx
          .insert(agentes)
          .values({ orgId: org, deviceid: `${chave}-2024`, nome: chave, ip, ativoId: linha?.id });
      }
    }
    const [pacote] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: '7-Zip 23.01',
        nomeNormalizado: normalizarTexto('7-Zip 23.01'),
        versao: '23.01',
        comando: 'msiexec /i "7z.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    ids.pacote = pacote?.id ?? '';
    const [inativo] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: 'Antigo',
        nomeNormalizado: 'antigo',
        comando: 'x',
        situacao: 'inativo',
      })
      .returning({ id: pacotesDeSoftware.id });
    ids.inativo = inativo?.id ?? '';
  });
});

afterAll(async () => {
  await api?.fechar();
});

const distribuir = (usuario: string, pacoteId: string, ativoIds: (string | undefined)[]) =>
  cliente.enviar('POST', '/software/distribuicoes', como(usuario), { pacoteId, ativoIds });

describe('a distribuição', () => {
  it('Distribuição para três máquinas: todas aguardando o agente, com o progresso', async () => {
    const r = await distribuir('ana', ids.pacote ?? '', [ids.pc1, ids.pc2, ids.pc4]);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      pacote: { nome: '7-Zip 23.01', versao: '23.01' },
      criadaPor: 'Ana Souza',
      maquinas: 3,
      progresso: '0 de 3 concluídas',
    });
    expect(
      r
        .json()
        .maquinasDaDistribuicao.map(
          (maquina: { situacao: { texto: string } }) => maquina.situacao.texto,
        ),
    ).toEqual(['Aguardando o agente', 'Aguardando o agente', 'Aguardando o agente']);
    distribuicao = r.json().id;
    const registros = await naOrg((tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'distribuicao.criada')),
    );
    expect(registros[0]?.dados).toMatchObject({ pacote: '7-Zip 23.01', maquinas: 3 });
  });

  it('recusa sem máquinas, o ativo sem agente, o local sem a permissão e o pacote inativo', async () => {
    expect((await distribuir('ana', ids.pacote ?? '', [])).json().campos).toEqual({
      ativoIds: 'Escolha pelo menos uma máquina.',
    });
    expect((await distribuir('ana', ids.pacote ?? '', [ids.pc3])).json().campos).toEqual({
      ativoIds: 'O ativo PAT-pc3 não tem o agente do GLPI ligado.',
    });
    expect((await distribuir('bruno', ids.pacote ?? '', [ids.pc1])).statusCode).toBe(403);
    const inativo = await distribuir('ana', ids.inativo ?? '', [ids.pc1]);
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().detail).toBe('O pacote está inativo.');
  });

  it('a lista e a ficha trazem o progresso e as máquinas', async () => {
    const lista = await cliente.consultar('/software/distribuicoes', como('ana'));
    expect(lista.json().distribuicoes).toEqual([
      expect.objectContaining({ id: distribuicao, progresso: '0 de 3 concluídas' }),
    ]);
    const ficha = await cliente.consultar(`/software/distribuicoes/${distribuicao}`, como('ana'));
    expect(ficha.json().maquinasDaDistribuicao[0]).toMatchObject({
      ativo: { patrimonio: 'PAT-pc1' },
      situacao: { chave: 'aguardando', tipo: 'neutra' },
      etapa: null,
      log: [],
    });
  });

  it('Agente acordado: diz quantos responderam', async () => {
    const r = await cliente.enviar(
      'POST',
      `/software/distribuicoes/${distribuicao}/agora`,
      como('ana'),
    );
    expect(r.json()).toEqual({
      acordados: 2,
      total: 3,
      mensagem: '2 de 3 agentes acordados; os outros recebem a tarefa no próximo contato.',
    });
    expect(acordados.sort()).toEqual(['10.0.0.1', '10.0.0.2', '10.0.0.4']);
  });

  it('a busca das máquinas traz os ativos com o agente, nos locais em que a conta distribui', async () => {
    const todas = await cliente.consultar('/software/maquinas', como('ana'));
    expect(todas.statusCode, todas.body).toBe(200);
    expect(
      todas.json().maquinas.map((maquina: { patrimonio: string }) => maquina.patrimonio),
    ).toEqual(['PAT-pc1', 'PAT-pc2', 'PAT-pc4', 'PAT-pc5']);
    expect(todas.json().maquinas[0]).toMatchObject({
      local: 'Jundiaí',
      agente: { nome: 'pc1' },
    });
    const buscada = await cliente.consultar('/software/maquinas?busca=pc2', como('ana'));
    expect(buscada.json().maquinas).toEqual([expect.objectContaining({ patrimonio: 'PAT-pc2' })]);
    const doBruno = await cliente.consultar('/software/maquinas', como('bruno'));
    expect(doBruno.json().maquinas).toEqual([
      expect.objectContaining({ patrimonio: 'PAT-pc5', local: 'Campinas' }),
    ]);
  });

  it('a ficha do ativo mostra as distribuições dele', async () => {
    const r = await cliente.consultar(`/ativos/${ids.pc1}/distribuicoes`, como('ana'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().distribuicoes).toEqual([
      expect.objectContaining({
        distribuicaoId: distribuicao,
        pacote: { nome: '7-Zip 23.01', versao: '23.01' },
        situacao: { chave: 'aguardando', texto: 'Aguardando o agente', tipo: 'neutra' },
      }),
    ]);
  });
});
