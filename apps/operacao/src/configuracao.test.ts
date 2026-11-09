import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-config-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const DIFICEIS = {
  GRAFITE_AMBIENTE: 'producao',
  GRAFITE_ARQUIVOS_PASTA: 'C:\\Grafite\\producao\\arquivos',
  GRAFITE_PG_BIN: 'C:\\Program Files\\PostgreSQL\\18\\bin',
  GRAFITE_BACKUP_DESTINOS: 'D:\\Backups\\novos;\\\\nas\\Backups Grafite\\Produção',
  COM_ASPAS_SIMPLES: 'd\'Ávila #1 = "dois"',
  COM_CRASES_E_ASPAS: 'a\'b"c',
  COM_CERQUILHA: 'antes # depois',
  COM_IGUAL: 'chave=valor',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: o texto cru é o caso testado.
  COM_DOLAR: 'sem $EXPANSAO nem ${OUTRA}',
};

describe('gerarConfigEnv', () => {
  it('grava cada valor de modo que o Node lê exatamente o mesmo, com --env-file', () => {
    expect(parseEnv(gerarConfigEnv(DIFICEIS))).toEqual(DIFICEIS);
  });

  it('começa dizendo que o arquivo tem segredos e é gerado, e mantém a ordem', () => {
    const texto = gerarConfigEnv({ B: '2', A: '1' });
    expect(texto.split('\n')).toEqual([
      '# Gerado pelo comando de operação do Grafite. Tem segredos: nunca versionar nem copiar.',
      "B='2'",
      "A='1'",
      '',
    ]);
  });

  it('recusa o valor com quebra de linha e o nome fora do formato', () => {
    expect(() => gerarConfigEnv({ A: 'duas\nlinhas' })).toThrow(
      'O valor de A tem uma quebra de linha, que o config.env não guarda.',
    );
    expect(() => gerarConfigEnv({ 'nome errado': 'x' })).toThrow(
      'O nome nome errado não serve para uma variável de ambiente.',
    );
  });

  it('recusa o valor com os três tipos de aspas, que não cabe em nenhuma', () => {
    expect(() => gerarConfigEnv({ A: 'a\'b"c`d' })).toThrow(
      'O valor de A tem aspas simples, duplas e crases, e não cabe no config.env.',
    );
  });
});

describe('lerConfigEnv', () => {
  it('lê o config.env como o Node lê', async () => {
    const caminho = join(pasta, 'config.env');
    await writeFile(caminho, gerarConfigEnv(DIFICEIS));
    await expect(lerConfigEnv(caminho)).resolves.toEqual(DIFICEIS);
    expect(await readFile(caminho, 'utf8')).not.toContain('\r');
  });

  it('diz qual arquivo falta', async () => {
    const caminho = join(pasta, 'nao-existe.env');
    await expect(lerConfigEnv(caminho)).rejects.toThrow(
      `Falta o arquivo de configuração ${caminho}.`,
    );
  });
});
