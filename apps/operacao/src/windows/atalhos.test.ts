// O atalho do menu da operação (change instalador-e-menu-da-operacao, design, decisão 6): o
// Grafite.cmd e o ícone na raiz da instalação e o atalho "Grafite" na área de trabalho de todos os
// usuários, criado pelo WScript.Shell só quando falta.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Atalhos, atalhosDoWindows, instalarAtalhoDoMenu } from './atalhos.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-atalhos-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe('Atalhos do Windows', () => {
  it('cria o .lnk pelo WScript.Shell, com o alvo, o ícone e a pasta', async () => {
    const chamadas: { arquivo: string; argumentos: string[] }[] = [];
    const executar: ExecutarProcesso = async (arquivo, argumentos) => {
      chamadas.push({ arquivo, argumentos });
      return { codigo: 0, saida: '', erro: '' };
    };

    await atalhosDoWindows(executar).criar({
      caminho: 'C:\\Users\\Public\\Desktop\\Grafite.lnk',
      alvo: "D:\\O'Grafite\\Grafite.cmd",
      icone: "D:\\O'Grafite\\grafite.ico",
      pasta: "D:\\O'Grafite",
      descricao: 'Menu da operação do Grafite',
    });

    expect(chamadas).toEqual([
      {
        arquivo: 'powershell.exe',
        argumentos: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut('C:\\Users\\Public\\Desktop\\Grafite.lnk'); $atalho.TargetPath = 'D:\\O''Grafite\\Grafite.cmd'; $atalho.IconLocation = 'D:\\O''Grafite\\grafite.ico,0'; $atalho.WorkingDirectory = 'D:\\O''Grafite'; $atalho.Description = 'Menu da operação do Grafite'; $atalho.Save()",
        ],
      },
    ]);
  });

  it('diz o motivo quando o Windows não cria o atalho', async () => {
    const executar: ExecutarProcesso = async () => ({
      codigo: 1,
      saida: '',
      erro: 'Acesso negado.\r\n',
    });
    await expect(
      atalhosDoWindows(executar).criar({
        caminho: 'Grafite.lnk',
        alvo: 'Grafite.cmd',
        icone: 'grafite.ico',
        pasta: '.',
        descricao: 'Menu da operação do Grafite',
      }),
    ).rejects.toThrow('Não foi possível criar o atalho Grafite.lnk: Acesso negado.');
  });

  it('confere se o atalho existe pelo arquivo', async () => {
    const atalhos = atalhosDoWindows(async () => ({ codigo: 0, saida: '', erro: '' }));
    const lnk = join(pasta, 'Grafite.lnk');
    await expect(atalhos.existe(lnk)).resolves.toBe(false);
    await writeFile(lnk, 'atalho');
    await expect(atalhos.existe(lnk)).resolves.toBe(true);
  });
});

// O atalho abre o painel (change painel-da-operacao, spec operacao-servicos, "Menu da operação"):
// o Grafite.cmd se eleva e roda o painel, e o menu fica no grafite.ps1 menu, para o terminal.
describe('Grafite.cmd', () => {
  it('se eleva e abre o painel, e não o menu (Atalho do painel na área de trabalho)', async () => {
    const cmd = await readFile(
      join(import.meta.dirname, '..', '..', 'lancadores', 'Grafite.cmd'),
      'utf8',
    );

    expect(cmd).toContain('-Verb RunAs');
    expect(cmd).toContain('-File "%~dp0grafite.ps1" painel\n');
    expect(cmd).not.toMatch(/grafite\.ps1" menu/);
    expect(cmd).toContain(
      'O painel do Grafite precisa da elevação de administrador: abra o atalho de novo e aceite o pedido do Windows.',
    );
  });
});

describe('instalarAtalhoDoMenu', () => {
  /** Uma versão com o Grafite.cmd e o ícone, a raiz e a área de trabalho, e atalhos em memória. */
  async function cenario({ atalhoExiste = false } = {}) {
    const versao = join(pasta, 'Grafite', 'versoes', '0.1.1');
    const raiz = join(pasta, 'Grafite');
    const areaDeTrabalho = join(pasta, 'Desktop');
    await mkdir(versao, { recursive: true });
    await writeFile(join(versao, 'Grafite.cmd'), '@echo off\r\nrem 0.1.1\r\n');
    await writeFile(join(versao, 'grafite.ico'), 'ícone 0.1.1');
    const criados: string[] = [];
    const atalhos: Atalhos = {
      existe: async () => atalhoExiste,
      criar: async ({ caminho, alvo, icone, pasta: daPasta }) => {
        criados.push(`${caminho} → ${alvo} (${icone}, em ${daPasta})`);
      },
    };
    return { versao, raiz, areaDeTrabalho, atalhos, criados };
  }

  it('copia o Grafite.cmd e o ícone da versão para a raiz e cria o atalho que falta', async () => {
    const { versao, raiz, areaDeTrabalho, atalhos, criados } = await cenario();

    await expect(
      instalarAtalhoDoMenu({
        raiz,
        pastaDaVersao: versao,
        atalhoDoMenu: { atalhos, areaDeTrabalho },
      }),
    ).resolves.toBe('criado');

    expect(await readFile(join(raiz, 'Grafite.cmd'), 'utf8')).toBe('@echo off\r\nrem 0.1.1\r\n');
    expect(await readFile(join(raiz, 'grafite.ico'), 'utf8')).toBe('ícone 0.1.1');
    expect(criados).toEqual([
      `${join(areaDeTrabalho, 'Grafite.lnk')} → ${join(raiz, 'Grafite.cmd')} (${join(raiz, 'grafite.ico')}, em ${raiz})`,
    ]);
  });

  it('com o atalho já na área de trabalho, troca o Grafite.cmd e o ícone e não cria outro', async () => {
    const { versao, raiz, areaDeTrabalho, atalhos, criados } = await cenario({
      atalhoExiste: true,
    });
    await writeFile(join(raiz, 'Grafite.cmd'), 'o de antes');

    await expect(
      instalarAtalhoDoMenu({
        raiz,
        pastaDaVersao: versao,
        atalhoDoMenu: { atalhos, areaDeTrabalho },
      }),
    ).resolves.toBe('existia');

    expect(await readFile(join(raiz, 'Grafite.cmd'), 'utf8')).toBe('@echo off\r\nrem 0.1.1\r\n');
    expect(criados).toEqual([]);
  });
});
