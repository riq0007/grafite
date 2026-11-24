// O comando da aba no servidor (spec aba-dos-colaboradores, "Comando da aba no servidor"; design,
// decisão 11): a chave mostrada uma vez, só com o hash no banco, a configuração com a versão, a lista
// dos aparelhos e as mudanças de um aparelho pelo nome ou pelo identificador curto, com a auditoria.
import { createHash, randomBytes } from 'node:crypto';
import {
  aparelhosDaAba,
  auditoria,
  chavesDaAba,
  configuracoesDaAba,
  naOrganizacao,
} from '@grafite/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { executarComando } from './executar.ts';

let api: ApiDeTeste;
let org = '';
let saida: string[] = [];
let erros: string[] = [];
const endereco = 'grafite.comando-aba.local';
const outroEndereco = 'grafite.comando-aba-outra.local';
let outraOrg = '';

const executar = (...argumentos: string[]) =>
  executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
  });

const hash = (token: string) => createHash('sha256').update(token).digest();
const HORA = 60 * 60 * 1000;

async function aparelho(
  orgId: string,
  dados: {
    curto: string;
    nome: string;
    registradoHaHoras?: number;
    trocadoHaHoras?: number;
    maquina?: string;
  },
) {
  const haHoras = (horas: number) => new Date(api.relogio.agora().getTime() - horas * HORA);
  const registrado = haHoras(dados.registradoHaHoras ?? 48);
  const trocado = haHoras(dados.trocadoHaHoras ?? dados.registradoHaHoras ?? 48);
  const [linha] = await naOrganizacao(api.banco, orgId, (tx) =>
    tx
      .insert(aparelhosDaAba)
      .values({
        orgId: sql`app.current_org()`,
        identificadorDaMaquina: dados.maquina ?? randomBytes(8).toString('hex'),
        identificadorCurto: dados.curto,
        nome: dados.nome,
        tokenHash: hash(randomBytes(16).toString('hex')),
        registradoEm: registrado,
        tokenTrocadoEm: trocado,
      })
      .returning(),
  );
  if (!linha) throw new Error('aparelho não gravado');
  return linha;
}

const doAparelho = async (id: string) =>
  (
    await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(aparelhosDaAba).where(eq(aparelhosDaAba.id, id)),
    )
  )[0];

const auditoriaDo = (alvoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.alvoId, alvoId)).orderBy(auditoria.momento),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [endereco] });
  outraOrg = await criarOrganizacao(api, { nome: 'Outra', enderecos: [outroEndereco] });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  saida = [];
  erros = [];
});

describe('aba chave', () => {
  it('trocar sem chave manda criar', async () => {
    expect(await executar('aba', 'chave', 'trocar', '--endereco', endereco)).toBe(1);
    expect(erros).toEqual([
      'Esta organização ainda não tem a chave da aba. Crie com: grafite aba chave criar.',
    ]);
  });

  it('criar mostra a chave uma vez, com o exemplo do MSI, e só o hash fica no banco', async () => {
    expect(await executar('aba', 'chave', 'criar', '--endereco', endereco)).toBe(0);
    const texto = saida.join('\n');
    const chave = /Chave da aba: (\S+)/.exec(texto)?.[1] ?? '';
    expect(chave).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(texto).toContain('Guarde esta chave agora: ela não aparece de novo.');
    expect(texto).toContain(
      `msiexec /i Grafite-Aba.msi GRAFITE_SERVIDOR=https://${endereco} GRAFITE_CHAVE=${chave} GRAFITE_ENTRADA=windows /qn`,
    );
    const [linha] = await naOrganizacao(api.banco, org, (tx) => tx.select().from(chavesDaAba));
    expect(linha?.hash).toEqual(hash(chave));
    const registros = await auditoriaDo(linha?.id ?? '');
    expect(registros).toMatchObject([
      {
        acao: 'chave-da-aba.criada',
        atorTipo: 'sistema',
        atorDescricao: 'comando no servidor: aba chave criar',
      },
    ]);
    expect(JSON.stringify(registros)).not.toContain(chave);
  });

  it('criar de novo recusa e manda trocar', async () => {
    expect(await executar('aba', 'chave', 'criar', '--endereco', endereco)).toBe(1);
    expect(erros).toEqual([
      'Esta organização já tem a chave da aba. Para outra, use: grafite aba chave trocar.',
    ]);
  });

  it('trocar grava outro hash na mesma linha, com a auditoria', async () => {
    const [antes] = await naOrganizacao(api.banco, org, (tx) => tx.select().from(chavesDaAba));
    expect(await executar('aba', 'chave', 'trocar', '--endereco', endereco)).toBe(0);
    const chave = /Chave da aba: (\S+)/.exec(saida.join('\n'))?.[1] ?? '';
    const [depois] = await naOrganizacao(api.banco, org, (tx) => tx.select().from(chavesDaAba));
    expect(depois?.id).toBe(antes?.id);
    expect(depois?.hash).toEqual(hash(chave));
    expect(depois?.trocadaEm).not.toBeNull();
    expect((await auditoriaDo(depois?.id ?? '')).map((r) => r.acao)).toEqual([
      'chave-da-aba.criada',
      'chave-da-aba.trocada',
    ]);
  });

  it('o endereço sem organização é recusado', async () => {
    expect(await executar('aba', 'chave', 'criar', '--endereco', 'ninguem.local')).toBe(1);
    expect(erros).toEqual(['Nenhuma organização tem o endereço ninguem.local.']);
  });
});

describe('aba configurar', () => {
  it('sem nada a mudar é uso errado', async () => {
    expect(await executar('aba', 'configurar', '--endereco', endereco)).toBe(2);
  });

  it('cria a configuração e soma a versão a cada mudança, com a auditoria', async () => {
    expect(
      await executar(
        'aba',
        'configurar',
        '--endereco',
        endereco,
        '--contato',
        'Ramal 2000, das 8h às 18h',
      ),
    ).toBe(0);
    expect(saida).toEqual([
      'Aba configurada (versão 1): forma pilula, contato "Ramal 2000, das 8h às 18h". As abas abertas mudam em até 30 s.',
    ]);
    expect(await executar('aba', 'configurar', '--endereco', endereco, '--forma', 'Entalhe')).toBe(
      0,
    );
    expect(await executar('aba', 'configurar', '--endereco', endereco, '--sem-contato')).toBe(0);
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(configuracoesDaAba),
    );
    expect(linha).toMatchObject({ forma: 'entalhe', contato: null, versao: 3 });
    const registros = await auditoriaDo(linha?.id ?? '');
    expect(registros.map((r) => [r.acao, r.depois])).toEqual([
      ['aba.configurada', { forma: 'pilula', contato: 'Ramal 2000, das 8h às 18h' }],
      ['aba.configurada', { forma: 'entalhe', contato: 'Ramal 2000, das 8h às 18h' }],
      ['aba.configurada', { forma: 'entalhe', contato: null }],
    ]);
  });

  it('a mesma configuração não sobe a versão nem audita', async () => {
    expect(await executar('aba', 'configurar', '--endereco', endereco, '--forma', 'entalhe')).toBe(
      0,
    );
    expect(saida).toEqual([
      'A aba já está com a forma entalhe e sem contato de reserva; nada mudou.',
    ]);
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(configuracoesDaAba),
    );
    expect(linha?.versao).toBe(3);
    expect(await auditoriaDo(linha?.id ?? '')).toHaveLength(3);
  });

  it('recusa a forma desconhecida e o contato com o sem-contato', async () => {
    expect(await executar('aba', 'configurar', '--endereco', endereco, '--forma', 'bola')).toBe(2);
    expect(erros).toEqual(['--forma: use pilula ou entalhe.']);
    expect(
      await executar(
        'aba',
        'configurar',
        '--endereco',
        endereco,
        '--contato',
        'x',
        '--sem-contato',
      ),
    ).toBe(2);
  });
});

describe('os aparelhos', () => {
  let fin: Awaited<ReturnType<typeof aparelho>>;
  let prodAntigo: Awaited<ReturnType<typeof aparelho>>;
  let prodNovo: Awaited<ReturnType<typeof aparelho>>;

  beforeAll(async () => {
    fin = await aparelho(org, { curto: '7K3Q9P', nome: 'PC-FIN-09' });
    prodAntigo = await aparelho(org, {
      curto: 'A1B2C3',
      nome: 'PC-PROD-03',
      registradoHaHoras: 200,
    });
    prodNovo = await aparelho(org, { curto: 'D4E5F6', nome: 'PC-PROD-03', registradoHaHoras: 2 });
    await aparelho(org, {
      curto: 'H7J8K9',
      nome: 'PC-RH-02',
      registradoHaHoras: 300,
      trocadoHaHoras: 1,
    });
    await aparelho(outraOrg, { curto: 'ZZZZZZ', nome: 'PC-OUTRA-01' });
  });

  it('aba aparelhos lista só os da organização, pelo nome, e marca os das últimas 24 h', async () => {
    expect(await executar('aba', 'aparelhos', '--endereco', endereco)).toBe(0);
    expect(saida).toEqual([
      '7K3Q9P · PC-FIN-09 · entrada pelo Windows · teto 5 por dia · sem contato ainda · versão desconhecida · liberado',
      'A1B2C3 · PC-PROD-03 · entrada pelo Windows · teto 5 por dia · sem contato ainda · versão desconhecida · liberado',
      'D4E5F6 · PC-PROD-03 · entrada pelo Windows · teto 5 por dia · sem contato ainda · versão desconhecida · liberado · registrado nas últimas 24 h',
      'H7J8K9 · PC-RH-02 · entrada pelo Windows · teto 5 por dia · sem contato ainda · versão desconhecida · liberado · registrado de novo nas últimas 24 h',
    ]);
  });

  it('o nome repetido é recusado com os identificadores', async () => {
    expect(await executar('aba', 'entrada', 'PC-PROD-03', 'senha', '--endereco', endereco)).toBe(1);
    expect(erros[0]).toContain(
      'Há 2 computadores com o nome PC-PROD-03. Escolha pelo identificador:',
    );
    expect(erros[0]).toMatch(/A1B2C3 {2}registrado em .+, sem contato ainda/);
    expect(erros[0]).toContain('D4E5F6');
    expect((await doAparelho(prodNovo.id))?.entrada).toBe('windows');
  });

  it('a entrada pelo identificador curto, digitado em minúsculas, com a auditoria', async () => {
    expect(await executar('aba', 'entrada', 'd4e5f6', 'senha', '--endereco', endereco)).toBe(0);
    expect(saida).toEqual(['O computador PC-PROD-03 (D4E5F6) agora entra pela senha.']);
    expect((await doAparelho(prodNovo.id))?.entrada).toBe('senha');
    expect((await doAparelho(prodAntigo.id))?.entrada).toBe('windows');
    expect(await auditoriaDo(prodNovo.id)).toMatchObject([
      {
        acao: 'entrada-do-aparelho.trocada',
        antes: { entrada: 'windows' },
        depois: { entrada: 'senha' },
        atorDescricao: 'comando no servidor: aba entrada',
        dados: { computador: 'PC-PROD-03', identificador: 'D4E5F6' },
      },
    ]);
  });

  it('a mesma entrada não muda nada nem audita', async () => {
    expect(await executar('aba', 'entrada', 'D4E5F6', 'senha', '--endereco', endereco)).toBe(0);
    expect(saida).toEqual(['O computador PC-PROD-03 (D4E5F6) já entra pela senha; nada mudou.']);
    expect(await auditoriaDo(prodNovo.id)).toHaveLength(1);
  });

  it('o teto pelo nome, e o teto fora de 1 a 500 é uso errado', async () => {
    expect(await executar('aba', 'teto', 'pc-fin-09', '12', '--endereco', endereco)).toBe(0);
    expect(saida).toEqual([
      'O computador PC-FIN-09 (7K3Q9P) agora tem o teto de 12 contas por dia.',
    ]);
    expect((await doAparelho(fin.id))?.tetoDeContas).toBe(12);
    expect(await executar('aba', 'teto', 'PC-FIN-09', '0', '--endereco', endereco)).toBe(2);
    expect(await executar('aba', 'teto', 'PC-FIN-09', '2.5', '--endereco', endereco)).toBe(2);
    expect(await executar('aba', 'teto', 'PC-FIN-09', '501', '--endereco', endereco)).toBe(2);
  });

  it('bloquear e desbloquear, com a auditoria de cada um', async () => {
    expect(await executar('aba', 'bloquear', '7K3Q9P', '--endereco', endereco)).toBe(0);
    expect((await doAparelho(fin.id))?.bloqueadoEm).toEqual(api.relogio.agora());
    expect(await executar('aba', 'bloquear', '7K3Q9P', '--endereco', endereco)).toBe(0);
    expect(await executar('aba', 'desbloquear', '7K3Q9P', '--endereco', endereco)).toBe(0);
    expect(saida).toEqual([
      'O computador PC-FIN-09 (7K3Q9P) agora está bloqueado.',
      'O computador PC-FIN-09 (7K3Q9P) já está bloqueado; nada mudou.',
      'O computador PC-FIN-09 (7K3Q9P) agora está desbloqueado.',
    ]);
    expect((await doAparelho(fin.id))?.bloqueadoEm).toBeNull();
    expect((await auditoriaDo(fin.id)).map((r) => r.acao)).toEqual([
      'teto-do-aparelho.trocado',
      'aparelho-da-aba.bloqueado',
      'aparelho-da-aba.desbloqueado',
    ]);
  });

  it('o aparelho de outra organização não é achado', async () => {
    expect(await executar('aba', 'bloquear', 'ZZZZZZ', '--endereco', endereco)).toBe(1);
    expect(erros).toEqual(['Nenhum computador com a aba tem o nome ou o identificador ZZZZZZ.']);
  });

  it('sem o computador, ou com sobra, é uso errado', async () => {
    expect(await executar('aba', 'bloquear', '--endereco', endereco)).toBe(2);
    expect(await executar('aba', 'bloquear', '7K3Q9P', 'x', '--endereco', endereco)).toBe(2);
    expect(await executar('aba', 'entrada', '7K3Q9P', 'outra', '--endereco', endereco)).toBe(2);
  });
});
