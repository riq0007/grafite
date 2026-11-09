// Evidência da tarefa 12.1: percorre as 72 combinações de tema × destaque × densidade na casca
// servida pelo `pnpm dev`, pelos seletores do painel de aparência, e confere contra o DTCG.
// Grava uma captura da casca por tema nesta pasta.
// Uso, com o `pnpm dev` rodando: node openspec/changes/archive/2026-09-26-f0-identidade-design-system-esqueleto/evidencias/combinacoes.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(pasta, '../../../../..');
const exigir = createRequire(resolve(raiz, 'apps/web/package.json'));
const { chromium } = exigir('@playwright/test');

const dtcg = JSON.parse(
  readFileSync(resolve(raiz, 'packages/ui/src/tokens/gerado/tokens.dtcg.json'), 'utf8'),
);
const modos = dtcg.$extensions['grafite.modos'];
const temas = Object.keys(modos.tema);
const destaques = Object.keys(modos.destaque);
const densidades = Object.keys(modos.densidade);
const tomDe = (tema) =>
  dtcg.cor.destaque.$extensions['grafite.modos'].tema[tema].includes('escuro') ? 'escuro' : 'claro';
const rgb = (h) =>
  `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1366, height: 768 } });
const errosDeConsole = [];
pagina.on('console', (m) => m.type() === 'error' && errosDeConsole.push(m.text()));
pagina.on('pageerror', (e) => errosDeConsole.push(e.message));
await pagina.goto('http://localhost:5173/');

const falhas = [];
let total = 0;
for (const tema of temas) {
  for (const destaque of destaques) {
    for (const densidade of densidades) {
      await pagina.getByLabel('Tema', { exact: true }).selectOption(tema);
      await pagina.getByLabel('Destaque', { exact: true }).selectOption(destaque);
      await pagina.getByLabel('Densidade', { exact: true }).selectOption(densidade);
      await pagina.waitForFunction(
        ([t, a, d]) => {
          const h = document.documentElement;
          return h.dataset.theme === t && h.dataset.accent === a && h.dataset.density === d;
        },
        [tema, destaque, densidade],
      );
      total++;
      const obtido = await pagina.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return {
          fundo: getComputedStyle(document.body).backgroundColor,
          destaque: css.getPropertyValue('--cor-destaque').trim(),
          linha: css.getPropertyValue('--altura-linha').trim(),
        };
      });
      const esperado = {
        fundo: rgb(dtcg.cor.fundo.$extensions['grafite.modos'].tema[tema]),
        destaque:
          dtcg.destaque[`destaque-${tomDe(tema)}`].$extensions['grafite.modos'].destaque[destaque],
        linha: dtcg.densidade.linha.$extensions['grafite.modos'].densidade[densidade],
      };
      for (const chave of Object.keys(esperado)) {
        if (obtido[chave] !== esperado[chave]) {
          falhas.push(
            `${tema}/${destaque}/${densidade} ${chave}: ${obtido[chave]} ≠ ${esperado[chave]}`,
          );
        }
      }
      if (destaque === 'azul' && densidade === 'compacta') {
        await pagina.screenshot({ path: `${pasta}/casca-${tema}.png` });
      }
    }
  }
}
const saude = await pagina.evaluate(async () => {
  const resposta = await fetch('/api/health');
  return { status: resposta.status, corpo: await resposta.json() };
});
// Volta ao padrão de fábrica, para não deixar a preferência salva no navegador de teste.
await pagina.getByLabel('Tema', { exact: true }).selectOption('grafite');
await pagina.getByLabel('Destaque', { exact: true }).selectOption('azul');
await pagina.getByLabel('Densidade', { exact: true }).selectOption('compacta');
await navegador.close();
console.log(JSON.stringify({ combinacoes: total, falhas, errosDeConsole, saude }, null, 2));
