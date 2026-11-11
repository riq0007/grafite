// A auditoria na mesma transação do dado (spec auditoria): se um dos dois falha, nenhum fica, e o
// registro nunca leva senha, hash, token, chave ou código de verificação.
import { auditoria, naOrganizacao, pessoas } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../test/integracao.ts';
import { registrarNaAuditoria, visaoDaConta, visaoDaPessoa } from './auditoria.ts';

let api: ApiDeTeste;
let org = '';

/** O público do evento das ações das pessoas, que estes testes não conferem. */
const SAIDA = { publico: { permissao: 'pessoas.ver' as const, locais: [null] } };

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, {
    nome: 'Organização A',
    enderecos: ['grafite.auditoria.local'],
  });
});

afterAll(async () => {
  await api?.fechar();
});

const registros = (acao: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, acao)),
  );

const nomes = () =>
  naOrganizacao(api.banco, org, async (tx) =>
    (await tx.select({ nome: pessoas.nome }).from(pessoas)).map((p) => p.nome),
  );

describe('registrarNaAuditoria', () => {
  it('grava o ator, o alvo, o antes e o depois, o IP, o código de rastreio e o momento do relógio', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      registrarNaAuditoria(tx, {
        acao: 'pessoa.criada',
        ator: { tipo: 'sistema', descricao: 'comando no servidor: organizacao criar' },
        alvo: { tipo: 'pessoa', id: '0199a3f0-0000-7000-8000-000000000001' },
        depois: { nome: 'Ana Souza', email: null, situacao: 'ativa' },
        origem: { ip: '10.0.0.7', codigoDeRastreio: 'R7K2-9QXM' },
        momento: api.relogio.agora(),
        saida: SAIDA,
      }),
    );
    expect(await registros('pessoa.criada')).toMatchObject([
      {
        orgId: org,
        momento: api.relogio.agora(),
        atorTipo: 'sistema',
        atorContaId: null,
        atorDescricao: 'comando no servidor: organizacao criar',
        alvoTipo: 'pessoa',
        alvoId: '0199a3f0-0000-7000-8000-000000000001',
        antes: null,
        depois: { nome: 'Ana Souza', email: null, situacao: 'ativa' },
        ip: '10.0.0.7',
        codigoDeRastreio: 'R7K2-9QXM',
      },
    ]);
  });

  it('uma falha no dado depois do registro desfaz o registro', async () => {
    await expect(
      naOrganizacao(api.banco, org, async (tx) => {
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.criada',
          ator: { tipo: 'anonimo' },
          alvo: { tipo: 'pessoa' },
          dados: { caso: 'falha no dado' },
          momento: api.relogio.agora(),
          saida: SAIDA,
        });
        await tx.insert(pessoas).values({ orgId: org, nome: '   ' });
      }),
    ).rejects.toThrow();
    const desfeitos = (await registros('pessoa.criada')).filter(
      (r) => (r.dados as { caso?: string } | null)?.caso === 'falha no dado',
    );
    expect(desfeitos).toEqual([]);
  });

  it('uma falha no registro desfaz o dado', async () => {
    await expect(
      naOrganizacao(api.banco, org, async (tx) => {
        await tx.insert(pessoas).values({ orgId: org, nome: 'Bruno Lima' });
        await registrarNaAuditoria(tx, {
          // @ts-expect-error a ação sem rótulo não compila, e a gravação a recusa.
          acao: 'Pessoa criada',
          ator: { tipo: 'anonimo' },
          alvo: { tipo: 'pessoa' },
          momento: api.relogio.agora(),
        });
      }),
    ).rejects.toThrow();
    expect(await nomes()).not.toContain('Bruno Lima');
  });

  it('recusa a ação que não tem rótulo, sem gravar nada', async () => {
    await expect(
      naOrganizacao(api.banco, org, (tx) =>
        registrarNaAuditoria(tx, {
          // @ts-expect-error a ação sem rótulo não compila.
          acao: 'ativo.excluido',
          ator: { tipo: 'anonimo' },
          alvo: { tipo: 'ativo' },
          momento: api.relogio.agora(),
        }),
      ),
    ).rejects.toThrow('A ação ativo.excluido não tem rótulo em ACOES_DA_AUDITORIA.');
    expect(await registros('ativo.excluido')).toEqual([]);
  });

  it.each([
    ['a senha', { senha: 'cavalo bateria' }],
    ['o hash', { conta: { hashSenha: '$argon2id$...' } }],
    ['um token', { tokenCsrf: 'abc' }],
    ['a chave do app', { segredo: 'GEZD' }],
    ['o código digitado', { codigo: '123456' }],
  ])('recusa gravar %s, sem gravar nada', async (_caso, dados) => {
    await expect(
      naOrganizacao(api.banco, org, (tx) =>
        registrarNaAuditoria(tx, {
          acao: 'conta.alterada',
          ator: { tipo: 'anonimo' },
          alvo: { tipo: 'conta' },
          dados,
          momento: api.relogio.agora(),
          saida: SAIDA,
        }),
      ),
    ).rejects.toThrow(/não pode ir para a auditoria/);
    expect(await registros('conta.alterada')).toEqual([]);
  });
});

describe('visões auditáveis', () => {
  const conta = {
    id: '0199a3f0-0000-7000-8000-000000000002',
    orgId: '0199a3f0-0000-7000-8000-000000000003',
    pessoaId: '0199a3f0-0000-7000-8000-000000000004',
    usuario: 'ana.souza',
    hashSenha: '$argon2id$v=19$m=19456,t=2,p=1$c2Fs$aGFzaA',
    senhaTemporaria: true,
    exigeDoisPassos: false,
    situacao: 'ativa' as const,
    origem: 'local' as const,
    senhaTrocadaEm: null,
    ultimaEntradaEm: null,
    criadaEm: new Date('2026-10-02T12:00:00Z'),
    atualizadaEm: new Date('2026-10-02T12:00:00Z'),
    preferencias: { dock: { posicao: 'esquerda' } },
    diasDeConfianca: null,
  };

  it('a visão da conta traz o que muda nela, sem o hash da senha nem as preferências', () => {
    const visao = visaoDaConta(conta);
    expect(visao).toEqual({
      usuario: 'ana.souza',
      pessoaId: '0199a3f0-0000-7000-8000-000000000004',
      senhaTemporaria: true,
      exigeDoisPassos: false,
      situacao: 'ativa',
    });
    expect(JSON.stringify(visao)).not.toContain('argon2id');
  });

  it('a visão da pessoa traz os dados dela, o caminho do local e a situação, sem o texto de busca', () => {
    const pessoa: typeof pessoas.$inferSelect = {
      id: '0199a3f0-0000-7000-8000-000000000004',
      orgId: '0199a3f0-0000-7000-8000-000000000003',
      nome: 'Ana Souza',
      email: 'ana@empresa.com',
      matricula: '004512',
      localId: '0199a3f0-0000-7000-8000-000000000005',
      telefone: '2040',
      fotoId: null,
      busca: 'ana souza 004512 ana@empresa.com',
      situacao: 'ativa',
      anonimizadaEm: null,
      criadaEm: new Date('2026-10-02T12:00:00Z'),
      atualizadaEm: new Date('2026-10-02T12:00:00Z'),
    };
    expect(visaoDaPessoa(pessoa, 'Jundiaí › Expedição')).toEqual({
      nome: 'Ana Souza',
      email: 'ana@empresa.com',
      matricula: '004512',
      localId: '0199a3f0-0000-7000-8000-000000000005',
      local: 'Jundiaí › Expedição',
      telefone: '2040',
      situacao: 'ativa',
    });
  });
});
