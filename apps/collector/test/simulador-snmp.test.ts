// O simulador de agente SNMP, conferido pelo próprio net-snmp (change p2b-impressoras-por-snmp,
// design, decisão 6): GET, GETNEXT e GETBULK no v1 e no v2c, a subárvore lida como o coletor a lê, e a
// comunidade errada sem resposta.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import snmp from 'net-snmp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { iniciarSimuladorSnmp, lerGravacao, type SimuladorSnmp } from './simulador-snmp.ts';

const GRAVACOES = join(import.meta.dirname, 'gravacoes');
const COMUNIDADE = 'comunidade-de-teste';
const DESCRICAO = '1.3.6.1.2.1.1.1.0';
const SUPRIMENTOS = '1.3.6.1.2.1.43.11.1.1';

let simulador: SimuladorSnmp;

beforeAll(async () => {
  simulador = await iniciarSimuladorSnmp({
    gravacao: { arquivo: join(GRAVACOES, 'multifuncional-colorida.snmprec') },
    comunidade: COMUNIDADE,
  });
});

afterAll(async () => {
  await simulador?.fechar();
});

type Versao = typeof snmp.Version1 | typeof snmp.Version2c;

function sessao(versao: Versao, comunidade = COMUNIDADE) {
  return snmp.createSession('127.0.0.1', comunidade, {
    port: simulador.porta,
    version: versao,
    timeout: 400,
    retries: 0,
  });
}

/** O pedido do net-snmp como promessa, e a sessão fechada no fim. */
function pedir<T>(
  versao: Versao,
  fazer: (s: snmp.Session, pronto: (erro: Error | null, dado?: T) => void) => void,
  comunidade?: string,
) {
  const s = sessao(versao, comunidade);
  return new Promise<T>((resolver, rejeitar) => {
    fazer(s, (erro, dado) => {
      s.close();
      if (erro) rejeitar(erro);
      else resolver(dado as T);
    });
  });
}

const texto = (ligacao: snmp.Varbind) => (ligacao.value as Buffer).toString('utf8');

describe('o simulador de agente SNMP', () => {
  for (const [nome, versao] of [
    ['v1', snmp.Version1],
    ['v2c', snmp.Version2c],
  ] as const) {
    it(`responde GET e GETNEXT no ${nome}`, async () => {
      const [descricao] = await pedir<snmp.Varbind[]>(versao, (s, pronto) =>
        s.get([DESCRICAO], pronto),
      );
      expect(descricao && texto(descricao)).toBe('Ricoh IM C3000');
      const [seguinte] = await pedir<snmp.Varbind[]>(versao, (s, pronto) =>
        s.getNext([`${SUPRIMENTOS}.6`], pronto),
      );
      expect(seguinte?.oid).toBe(`${SUPRIMENTOS}.6.1.1`);
      expect(seguinte && texto(seguinte)).toBe('Black');
    });

    it(`anda pela subárvore dos suprimentos no ${nome}, com os níveis negativos`, async () => {
      const lidas: snmp.Varbind[] = [];
      await pedir<void>(versao, (s, pronto) =>
        s.subtree(
          `${SUPRIMENTOS}.9`,
          10,
          (ligacoes: snmp.Varbind[]) => {
            lidas.push(...ligacoes);
          },
          (erro: Error | null) => pronto(erro),
        ),
      );
      expect(lidas.map((ligacao) => [ligacao.oid, ligacao.value])).toEqual([
        [`${SUPRIMENTOS}.9.1.1`, 45],
        [`${SUPRIMENTOS}.9.1.2`, -3],
        [`${SUPRIMENTOS}.9.1.3`, -2],
        [`${SUPRIMENTOS}.9.1.4`, 20],
        [`${SUPRIMENTOS}.9.1.5`, 70],
        [`${SUPRIMENTOS}.9.1.6`, 150000],
      ]);
    });
  }

  it('responde GETBULK no v2c, com o fim da MIB depois do último', async () => {
    // O net-snmp devolve as repetições de cada OID pedido numa lista.
    type Repeticoes = (snmp.Varbind | snmp.Varbind[])[];
    const ligacoes = (
      await pedir<Repeticoes>(snmp.Version2c, (s, pronto) =>
        s.getBulk([`${SUPRIMENTOS}.8`], 0, 3, pronto),
      )
    ).flat();
    expect(ligacoes.map((ligacao) => [ligacao.oid, ligacao.value])).toEqual([
      [`${SUPRIMENTOS}.8.1.1`, 100],
      [`${SUPRIMENTOS}.8.1.2`, -2],
      [`${SUPRIMENTOS}.8.1.3`, 100],
    ]);
    const noFim = (
      await pedir<Repeticoes>(snmp.Version2c, (s, pronto) =>
        s.getBulk(['1.3.6.1.2.1.43.18.1.1.8.1.1'], 0, 2, pronto),
      )
    ).flat();
    expect(noFim.map((ligacao) => ligacao.type)).toEqual([snmp.ObjectType.EndOfMibView]);
  });

  it('o objeto que não existe vem como sem objeto no v2c e como erro no v1', async () => {
    const [ausente] = await pedir<snmp.Varbind[]>(snmp.Version2c, (s, pronto) =>
      s.get(['1.3.6.1.2.1.1.2.0'], pronto),
    );
    expect(ausente && snmp.isVarbindError(ausente)).toBe(true);
    await expect(
      pedir<snmp.Varbind[]>(snmp.Version1, (s, pronto) => s.get(['1.3.6.1.2.1.1.2.0'], pronto)),
    ).rejects.toThrow();
  });

  it('não responde à comunidade errada, como uma impressora', async () => {
    const antes = simulador.respondidos();
    await expect(
      pedir<snmp.Varbind[]>(snmp.Version2c, (s, pronto) => s.get([DESCRICAO], pronto), 'public'),
    ).rejects.toThrow(/timed out/i);
    expect(simulador.respondidos()).toBe(antes);
  });
});

describe('as gravações', () => {
  it('as três gravações se leem, em ordem de OID, com o número de série', () => {
    for (const arquivo of [
      'laser-de-uma-cor.snmprec',
      'multifuncional-colorida.snmprec',
      'termica.snmprec',
    ]) {
      const entradas = lerGravacao(readFileSync(join(GRAVACOES, arquivo), 'utf8'));
      expect(entradas.length, arquivo).toBeGreaterThan(5);
      expect(
        entradas.map((entrada) => entrada.oid.join('.')),
        arquivo,
      ).toContain('1.3.6.1.2.1.43.5.1.1.17.1');
    }
  });
});
