// O atalho do menu da operação (change instalador-e-menu-da-operacao, design, decisão 6): o
// Grafite.cmd e o ícone da versão vão para a raiz da instalação, e o atalho "Grafite" da área de
// trabalho de todos os usuários aponta para o Grafite.cmd. O atalho é criado pelo WScript.Shell só
// quando falta, para não desfazer o que quem opera mudou nele.
import { access, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';

export interface DefinicaoDoAtalho {
  /** O .lnk, como C:\Users\Public\Desktop\Grafite.lnk. */
  caminho: string;
  alvo: string;
  icone: string;
  /** A pasta em que o alvo roda. */
  pasta: string;
  descricao: string;
}

export interface Atalhos {
  existe(caminho: string): Promise<boolean>;
  criar(definicao: DefinicaoDoAtalho): Promise<void>;
}

export interface AtalhoDoMenu {
  atalhos: Atalhos;
  /** A área de trabalho de todos os usuários do servidor, como C:\Users\Public\Desktop. */
  areaDeTrabalho: string;
}

/** Um texto entre aspas simples do PowerShell. */
const entreAspas = (texto: string) => `'${texto.replaceAll("'", "''")}'`;

export function atalhosDoWindows(executar: ExecutarProcesso): Atalhos {
  return {
    existe: (caminho) =>
      access(caminho).then(
        () => true,
        () => false,
      ),
    async criar({ caminho, alvo, icone, pasta, descricao }) {
      const comando = [
        `$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut(${entreAspas(caminho)});`,
        `$atalho.TargetPath = ${entreAspas(alvo)};`,
        `$atalho.IconLocation = ${entreAspas(`${icone},0`)};`,
        `$atalho.WorkingDirectory = ${entreAspas(pasta)};`,
        `$atalho.Description = ${entreAspas(descricao)};`,
        '$atalho.Save()',
      ].join(' ');
      const { codigo, saida, erro } = await executar(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', comando],
        { env: process.env },
      );
      if (codigo !== 0) {
        throw new Error(`Não foi possível criar o atalho ${caminho}: ${(erro || saida).trim()}`);
      }
    },
  };
}

/** O Grafite.cmd e o ícone da versão na raiz da instalação, e o atalho "Grafite" quando ele falta. */
export async function instalarAtalhoDoMenu({
  raiz,
  pastaDaVersao,
  atalhoDoMenu,
}: {
  raiz: string;
  pastaDaVersao: string;
  atalhoDoMenu: AtalhoDoMenu;
}): Promise<'criado' | 'existia'> {
  const alvo = join(raiz, 'Grafite.cmd');
  const icone = join(raiz, 'grafite.ico');
  await copyFile(join(pastaDaVersao, 'Grafite.cmd'), alvo);
  await copyFile(join(pastaDaVersao, 'grafite.ico'), icone);
  const caminho = join(atalhoDoMenu.areaDeTrabalho, 'Grafite.lnk');
  if (await atalhoDoMenu.atalhos.existe(caminho)) return 'existia';
  await atalhoDoMenu.atalhos.criar({
    caminho,
    alvo,
    icone,
    pasta: raiz,
    descricao: 'Menu da operação do Grafite',
  });
  return 'criado';
}
