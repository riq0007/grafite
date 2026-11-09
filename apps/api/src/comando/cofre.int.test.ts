// O comando no servidor que troca a chave mestra do cofre (spec cofre-de-segredos, "Troca da chave
// mestra"; design do P6, decisão 9): em todas as organizações, recifra com a chave nova só a chave
// de cada segredo que ainda está na anterior, diz quantos passaram e quais não abrem, registra a
// troca na auditoria de cada organização e, rodado de novo, não muda nada.
import { auditoria, naOrganizacao, segredos } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { cifrarSegredo, decifrarSegredo, impressaoDaChaveMestra } from '../cofre/cifra.ts';
import { AJUDA, executarComando } from './executar.ts';

// Chaves só deste teste: os segredos das outras organizações do banco de teste, cifrados com a
// chave de teste, não abrem com nenhuma delas e ficam como estão.
const ANTERIOR = Buffer.alloc(32, 21);
const NOVA = Buffer.alloc(32, 22);
const OUTRA = Buffer.alloc(32, 23);
const base64 = (chave: Buffer) => chave.toString('base64');
const NA_TROCA = {
  GRAFITE_CHAVE_DO_COFRE: base64(NOVA),
  GRAFITE_CHAVE_DO_COFRE_ANTERIOR: base64(ANTERIOR),
};

let api: ApiDeTeste;
let orgA = '';
let orgB = '';
let saida: string[] = [];
let erros: string[] = [];

const executar = (argumentos: string[], variaveis: Record<string, string> = NA_TROCA) =>
  executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
    variavel: (nome) => variaveis[nome],
  });

/** Um segredo cifrado com a chave dada, direto no banco. */
async function segredoCifrado(org: string, nome: string, valor: string, chave: Buffer) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
    const id = rows[0]?.id ?? '';
    await tx.insert(segredos).values({
      id,
      orgId: org,
      nome,
      nomeNormalizado: normalizarTexto(nome),
      tipo: 'conta-administrativa',
      classificacao: 'equipamento',
      ...cifrarSegredo({ valor }, { atual: chave }, { orgId: org, segredoId: id }),
    });
    return id;
  });
}

const linhaDo = async (org: string, id: string) => {
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(segredos).where(eq(segredos.id, id)),
  );
  if (!linha) throw new Error('O segredo sumiu.');
  return linha;
};

const trocasNaAuditoria = (org: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, 'chave-do-cofre.trocada')),
  );

beforeAll(async () => {
  api = await abrirApi();
  orgA = await criarOrganizacao(api, { nome: 'Empresa A', enderecos: ['grafite.troca-a.local'] });
  orgB = await criarOrganizacao(api, { nome: 'Empresa B', enderecos: ['grafite.troca-b.local'] });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  saida = [];
  erros = [];
});

describe('cofre trocar-chave', () => {
  const segredosDeA: Record<string, string> = {};
  let deB = '';

  it('recifra a chave dos segredos das duas organizações, com os valores iguais depois', async () => {
    segredosDeA['Switch do CPD'] = await segredoCifrado(orgA, 'Switch do CPD', 'S3nh@', ANTERIOR);
    segredosDeA['Banco do ERP'] = await segredoCifrado(orgA, 'Banco do ERP', 'erp-123', ANTERIOR);
    deB = await segredoCifrado(orgB, 'Wi-Fi visitantes', 'convidado', ANTERIOR);
    const antes = await linhaDo(orgA, segredosDeA['Switch do CPD'] ?? '');

    expect(await executar(['cofre', 'trocar-chave'])).toBe(0);
    expect(erros).toEqual([]);
    expect(saida).toContain('Organização "Empresa A": 2 segredos passaram para a chave nova.');
    expect(saida).toContain('Organização "Empresa B": 1 segredo passou para a chave nova.');

    for (const [nome, id] of Object.entries(segredosDeA)) {
      const linha = await linhaDo(orgA, id);
      expect(linha.impressaoDaChaveMestra, nome).toBe(impressaoDaChaveMestra(NOVA));
    }
    const depois = await linhaDo(orgA, segredosDeA['Switch do CPD'] ?? '');
    // Só a chave do segredo muda: o conteúdo não é decifrado nem cifrado de novo.
    expect(depois.conteudoCifrado).toEqual(antes.conteudoCifrado);
    expect(depois.chaveCifrada).not.toEqual(antes.chaveCifrada);
    expect(
      decifrarSegredo(depois, { atual: NOVA }, { orgId: orgA, segredoId: depois.id }).valor,
    ).toBe('S3nh@');
    const deBDepois = await linhaDo(orgB, deB);
    expect(decifrarSegredo(deBDepois, { atual: NOVA }, { orgId: orgB, segredoId: deB }).valor).toBe(
      'convidado',
    );

    const registros = await trocasNaAuditoria(orgA);
    expect(registros).toMatchObject([
      {
        acao: 'chave-do-cofre.trocada',
        atorTipo: 'sistema',
        alvoTipo: 'cofre',
        dados: { recifrados: 2 },
      },
    ]);
    expect(JSON.stringify(registros)).not.toContain(base64(NOVA));
    expect(JSON.stringify(registros)).not.toContain(base64(ANTERIOR));
    expect(await trocasNaAuditoria(orgB)).toMatchObject([{ dados: { recifrados: 1 } }]);
  });

  it('rodado de novo, diz que não havia segredo na anterior e não muda nada', async () => {
    const antes = await linhaDo(orgA, segredosDeA['Banco do ERP'] ?? '');
    expect(await executar(['cofre', 'trocar-chave'])).toBe(0);
    expect(saida).toContain('Nenhum segredo estava na chave anterior; nada mudou.');
    expect((await linhaDo(orgA, segredosDeA['Banco do ERP'] ?? '')).chaveCifrada).toEqual(
      antes.chaveCifrada,
    );
    expect(await trocasNaAuditoria(orgA)).toHaveLength(1);
  });

  it('lista o segredo que não abre com nenhuma das duas e o deixa como está', async () => {
    const deOutraChave = await segredoCifrado(orgA, 'Cofre antigo', 'x', OUTRA);
    const estragado = await segredoCifrado(orgA, 'Chave estragada', 'y', ANTERIOR);
    await naOrganizacao(api.banco, orgA, (tx) =>
      tx
        .update(segredos)
        .set({ chaveCifrada: Buffer.alloc(61, 1) })
        .where(eq(segredos.id, estragado)),
    );
    const vaiPassar = await segredoCifrado(orgA, 'Roteador', 'z', ANTERIOR);
    const antes = await linhaDo(orgA, deOutraChave);

    expect(await executar(['cofre', 'trocar-chave'])).toBe(0);
    expect(saida).toContain('Organização "Empresa A": 1 segredo passou para a chave nova.');
    expect(saida).toContain(
      `Organização "Empresa A": o segredo "Cofre antigo" (${deOutraChave}) não abre com nenhuma das duas chaves e ficou como estava.`,
    );
    expect(saida).toContain(
      `Organização "Empresa A": o segredo "Chave estragada" (${estragado}) não abre com nenhuma das duas chaves e ficou como estava.`,
    );
    expect(await linhaDo(orgA, deOutraChave)).toEqual(antes);
    expect((await linhaDo(orgA, estragado)).impressaoDaChaveMestra).toBe(
      impressaoDaChaveMestra(ANTERIOR),
    );
    expect((await linhaDo(orgA, vaiPassar)).impressaoDaChaveMestra).toBe(
      impressaoDaChaveMestra(NOVA),
    );
  });

  it.each([
    [
      'sem a anterior',
      { GRAFITE_CHAVE_DO_COFRE: base64(NOVA) },
      'GRAFITE_CHAVE_DO_COFRE_ANTERIOR: obrigatória na troca (a chave que cifrou os segredos até agora).',
    ],
    [
      'sem a nova',
      { GRAFITE_CHAVE_DO_COFRE_ANTERIOR: base64(ANTERIOR) },
      'GRAFITE_CHAVE_DO_COFRE: obrigatória na troca (a chave nova do cofre).',
    ],
    [
      'com a nova fora do formato',
      { ...NA_TROCA, GRAFITE_CHAVE_DO_COFRE: 'curta' },
      'GRAFITE_CHAVE_DO_COFRE: deve ter 32 bytes em base64.',
    ],
    [
      'com as duas iguais',
      { ...NA_TROCA, GRAFITE_CHAVE_DO_COFRE_ANTERIOR: base64(NOVA) },
      'GRAFITE_CHAVE_DO_COFRE_ANTERIOR: deve ser diferente de GRAFITE_CHAVE_DO_COFRE.',
    ],
  ])('recusa começar %s, sem mostrar as chaves', async (_caso, variaveis, mensagem) => {
    expect(await executar(['cofre', 'trocar-chave'], variaveis)).toBe(2);
    expect(erros).toEqual([mensagem]);
    expect(saida).toEqual([]);
    expect(erros.join('\n')).not.toContain(base64(NOVA));
  });

  it('a ajuda explica a troca', () => {
    expect(AJUDA).toContain('cofre trocar-chave');
  });
});
