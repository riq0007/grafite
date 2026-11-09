// O runbook da operação (spec operacao-servicos, "Runbook da operação") e o comando andam juntos:
// cada comando que o runbook manda rodar existe na ajuda do grafite.ps1, e cada seção que as
// mensagens do comando citam existe no runbook.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { AJUDA, ajudaDe } from './comando.ts';

const RUNBOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'operacao',
  'runbook.md',
);

/** Os comandos com uma ação depois do nome, como `backup agora`. */
const COM_ACAO = new Set([
  'backup',
  'proxy',
  'servicos',
  'certificado',
  'enderecos',
  'organizacao',
  'conta',
  'cofre',
  'email',
]);

/**
 * Os comandos do grafite.ps1 nos blocos de código do runbook, sem os argumentos. O instalar.ps1 é o
 * `instalar` do comando.
 */
async function comandosDoRunbook(): Promise<string[]> {
  const texto = await readFile(RUNBOOK, 'utf8');
  const blocos = [...texto.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(([, bloco]) => bloco ?? '');
  const comandos = new Set<string>();
  for (const linha of blocos.join('\n').split('\n')) {
    if (/instalar\.ps1\s/.test(linha)) {
      comandos.add('instalar');
      continue;
    }
    const depois = /grafite\.ps1\s+(.+)$/.exec(linha)?.[1];
    if (depois === undefined) continue;
    const [primeiro = '', segundo = ''] = depois.trim().split(/\s+/);
    if (primeiro.startsWith('-')) continue;
    const comAcao = COM_ACAO.has(primeiro) && segundo !== '' && !segundo.startsWith('-');
    comandos.add(comAcao ? `${primeiro} ${segundo}` : primeiro);
  }
  return [...comandos].sort();
}

it('cada comando do runbook existe na ajuda do grafite.ps1', async () => {
  const comandos = await comandosDoRunbook();
  expect(comandos.length).toBeGreaterThan(10);
  for (const comando of comandos) expect(AJUDA, comando).toContain(`  ${comando}`);
});

it('o runbook cobre cada comando da ajuda', async () => {
  const comandos = await comandosDoRunbook();
  for (const comando of [
    'painel',
    'menu',
    'instalar',
    'atualizar',
    'voltar',
    'preparar-teste',
    'backup agora',
    'backup listar',
    'backup testar',
    'backup configurar',
    'restaurar',
    'proxy configurar',
    'proxy raiz',
    'servicos estado',
    'servicos reiniciar',
    'servicos iniciar',
    'servicos parar',
    'certificado configurar',
    'enderecos acrescentar',
    'enderecos tirar',
    'conta redefinir',
    'cofre trocar-chave',
    'email configurar',
    'email testar',
  ]) {
    expect(comandos, comando).toContain(comando);
  }
});

it('as seções que as mensagens do comando citam existem no runbook', async () => {
  const titulos = (await readFile(RUNBOOK, 'utf8'))
    .split('\n')
    .filter((linha) => /^#{2,3} /.test(linha))
    .map((linha) => linha.replace(/^#+ /, ''));
  for (const secao of [
    'Troca da chave do cofre',
    'Atualização que falhou',
    'Preparação do teste que falhou',
    'Restauração que falhou',
    'Depois da restauração',
    'Serviços',
    'E-mail e push',
  ]) {
    expect(titulos, secao).toContain(secao);
  }
});

it('cada comando do Linux no runbook existe na ajuda do grafite do Linux', async () => {
  const texto = await readFile(RUNBOOK, 'utf8');
  const blocos = [...texto.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(([, bloco]) => bloco ?? '');
  const comandos = new Set<string>();
  for (const linha of blocos.join('\n').split('\n')) {
    const depois = /^sudo grafite\s+(.+)$/.exec(linha.trim())?.[1];
    if (depois === undefined) continue;
    const [primeiro = '', segundo = ''] = depois.trim().split(/\s+/);
    if (primeiro.startsWith('-')) continue;
    const comAcao = COM_ACAO.has(primeiro) && segundo !== '' && !segundo.startsWith('-');
    comandos.add(comAcao ? `${primeiro} ${segundo}` : primeiro);
  }
  expect(comandos.size).toBeGreaterThan(8);
  const ajuda = ajudaDe('linux');
  for (const comando of comandos) expect(ajuda, comando).toContain(`  ${comando}`);
});
