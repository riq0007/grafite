// O comando no servidor que cria um coletor (spec coletor-local, "Coletor pelo comando no servidor";
// design do P2a, decisão 9): na organização do endereço, com o nome e as faixas, mostrando o token uma
// vez ou ligando o token do ambiente sem mostrá-lo, e sem repetir com --se-nao-existir.
import { createHash } from 'node:crypto';
import { auditoria, coletores, eventos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { AJUDA, executarComando } from './executar.ts';

let api: ApiDeTeste;
let org = '';
let saida: string[] = [];
let erros: string[] = [];
const endereco = 'grafite.comando-coletor.local';
const TOKEN_DO_AMBIENTE = `token-do-ambiente-${'y'.repeat(40)}`;

const executar = (argumentos: string[], variaveis: Record<string, string> = {}) =>
  executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
    variavel: (nome) => variaveis[nome],
  });

const hash = (token: string) => createHash('sha256').update(token).digest();
const coletorDoNome = async (nome: string) =>
  (
    await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(coletores).where(eq(coletores.nome, nome)),
    )
  )[0];

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [endereco] });
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  saida = [];
  erros = [];
});

describe('coletor criar', () => {
  it('cria o coletor com as faixas e mostra o token uma vez, com a auditoria e o evento', async () => {
    const codigo = await executar([
      'coletor',
      'criar',
      '--endereco',
      endereco,
      '--nome',
      'Servidor',
      '--faixa',
      '10.0.0.77/24',
      '--faixa',
      '192.168.1.0/24',
    ]);
    expect(codigo).toBe(0);
    const token = /Token do coletor: (\S+)/.exec(saida.join('\n'))?.[1] ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(saida.join('\n')).toContain('Guarde este token agora: ele não aparece de novo.');
    const coletor = await coletorDoNome('Servidor');
    expect(coletor).toMatchObject({
      faixas: ['10.0.0.0/24', '192.168.1.0/24'],
      situacao: 'ativo',
      criadoPor: null,
    });
    expect(coletor?.tokenHash).toEqual(hash(token));
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(eq(auditoria.alvoId, coletor?.id ?? '')),
    );
    expect(registros).toMatchObject([
      {
        acao: 'coletor.criado',
        atorTipo: 'sistema',
        atorDescricao: 'comando no servidor: coletor criar',
      },
    ]);
    const evento = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ tipo: eventos.tipo })
        .from(eventos)
        .where(eq(eventos.alvoId, coletor?.id ?? '')),
    );
    expect(evento).toEqual([{ tipo: 'coletores.mudaram' }]);
  });

  it('liga o token do ambiente sem mostrá-lo, sem faixas, e não repete com --se-nao-existir', async () => {
    const argumentos = [
      'coletor',
      'criar',
      '--endereco',
      endereco,
      '--nome',
      'Coletor da produção',
      '--token-do-ambiente',
      '--se-nao-existir',
    ];
    const variaveis = { GRAFITE_COLETOR_TOKEN: TOKEN_DO_AMBIENTE };
    expect(await executar(argumentos, variaveis)).toBe(0);
    expect(saida.join('\n')).not.toContain(TOKEN_DO_AMBIENTE);
    expect(saida.join('\n')).toContain(
      'Sem faixas, o coletor não coleta: cadastre as faixas na tela dos coletores.',
    );
    expect((await coletorDoNome('Coletor da produção'))?.tokenHash).toEqual(
      hash(TOKEN_DO_AMBIENTE),
    );

    saida = [];
    expect(await executar(argumentos, variaveis)).toBe(0);
    expect(saida).toEqual([
      'O coletor "Coletor da produção" já existe nesta organização; nada foi criado.',
    ]);
    const todos = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ id: coletores.id })
        .from(coletores)
        .where(eq(coletores.tokenHash, hash(TOKEN_DO_AMBIENTE))),
    );
    expect(todos).toHaveLength(1);
  });

  it('recusa a faixa inválida, o endereço desconhecido, o nome repetido e o token do ambiente ausente', async () => {
    const criar = (...extras: string[]) => [
      'coletor',
      'criar',
      '--endereco',
      endereco,
      '--nome',
      'Servidor',
      ...extras,
    ];
    expect(await executar(criar('--faixa', '10.0.0.300/24'))).toBe(2);
    expect(erros.join('\n')).toContain('--faixa: Use uma faixa como 10.0.0.0/24.');
    erros = [];
    expect(await executar(['coletor', 'criar', '--endereco', 'outro.local', '--nome', 'X'])).toBe(
      1,
    );
    expect(erros.join('\n')).toContain('Nenhuma organização tem o endereço outro.local.');
    erros = [];
    expect(await executar(criar())).toBe(1);
    expect(erros.join('\n')).toContain(
      'Já existe um coletor com o nome Servidor nesta organização.',
    );
    erros = [];
    expect(await executar(criar('--token-do-ambiente'))).toBe(2);
    expect(erros.join('\n')).toContain(
      'GRAFITE_COLETOR_TOKEN: obrigatório com --token-do-ambiente, com pelo menos 32 caracteres.',
    );
  });

  it('a ajuda explica o comando dos coletores', () => {
    expect(AJUDA).toContain('coletor criar');
    expect(AJUDA).toContain('--token-do-ambiente');
  });
});
