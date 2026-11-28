// Relatório de contraste dos tokens (tarefa 5.5): mede as 24 combinações de tema × destaque
// em todos os pares de uso, conferindo o mínimo do WCAG 2.2 AA que o gerador garante.
// Uso: node packages/ui/src/tokens/relatorio-contraste.ts  (grava docs/identidade/contraste.md)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AREA_DO_WINDOWS,
  avaliarAbaFlutuante,
  avaliarTudo,
  CORES_DO_SISTEMA_DE_REFERENCIA,
  NOMES_DOS_TEMAS_DO_WINDOWS,
  PARES_DA_ABA_FLUTUANTE,
} from './contraste-pares.ts';
import type { TemaDoWindows } from './gerador.ts';

const decimal = (n: number) => n.toFixed(2).replace('.', ',');

export function relatorioDeContraste(): { markdown: string; reprovadas: number } {
  const resultados = avaliarTudo();
  const reprovadas = resultados.filter((r) => !r.passou);
  const daAba = avaliarAbaFlutuante();
  const reprovadasDaAba = daAba.filter((r) => !r.passou);
  const temasDoWindows = Object.keys(AREA_DO_WINDOWS) as TemaDoWindows[];
  const razaoDaAba = (uso: string, tema: TemaDoWindows) => {
    const r = daAba.find((d) => d.uso === uso && d.tema === tema);
    return r ? `${decimal(r.razao)}:1` : '—';
  };
  const sistema = Object.entries(CORES_DO_SISTEMA_DE_REFERENCIA)
    .filter(([nome]) => nome !== 'transparent')
    .map(([nome, cor]) => `\`${nome}\` ${cor}`)
    .join(', ');
  const piorPorUso = new Map<string, (typeof resultados)[number]>();
  for (const r of resultados) {
    const atual = piorPorUso.get(r.uso);
    if (!atual || r.razao < atual.razao) piorPorUso.set(r.uso, r);
  }
  const linhas = [
    '# Relatório de contraste dos tokens',
    '',
    'Gerado por `pnpm tokens:contraste` (`packages/ui/src/tokens/relatorio-contraste.ts`). Não edite à mão.',
    '',
    '| | |',
    '|---|---|',
    '| Combinações | 6 temas × 4 destaques = 24 |',
    `| Pares de uso | ${piorPorUso.size} |`,
    `| Medições | ${resultados.length} |`,
    `| Reprovadas | ${reprovadas.length} |`,
    '',
    '## Menor razão de cada uso',
    '',
    'Entre as 24 combinações. Texto exige 4,5:1, e o texto secundário sobre a afundada, onde fica o texto de exemplo dos campos, 7:1; componentes e bordas exigem 3:1.',
    '',
    '| Uso | Mínimo | Menor razão | Onde |',
    '|---|---|---|---|',
    ...[...piorPorUso.values()].map(
      (r) =>
        `| ${r.uso} | ${decimal(r.minimo)}:1 | ${decimal(r.razao)}:1 | ${r.tema} / ${r.destaque} |`,
    ),
    '',
    '## Como o contraste é garantido',
    '',
    'Desde o D1 (change fundamentos-v3), as cores saem do gerador em OKLCH (`gerador.ts`). Ele move a luminosidade de cada papel, sem mudar a matiz, até o mínimo contra as superfícies em que o papel aparece.',
    '',
    'Este relatório confere os pares de uso nas 24 combinações. Os testes do gerador conferem também a varredura de entradas: as matizes de 0 a 360, o croma da base de 0 a 0,06 e o contraste de 0 a 100. Os ajustes feitos à mão no F0 ficam no histórico do repositório.',
    '',
    '## A aba do Windows',
    '',
    'A aba dos colaboradores segue o tema do Windows, e não o do Grafite, e fica fora das 24 combinações. A área é o fundo das janelas do Windows 11 no tema: ' +
      temasDoWindows
        .map((tema) => `${NOMES_DOS_TEMAS_DO_WINDOWS[tema].toLowerCase()} ${AREA_DO_WINDOWS[tema]}`)
        .join(', ') +
      `. No alto contraste, a aba usa só as cores do sistema, aqui as do Alto Contraste Preto: ${sistema}.`,
    '',
    'No escuro, o fio claro e o anel do foco separam a forma da área; no claro, o azul, com o fio escuro por fora. O azul sozinho sobre a área escura e o fio claro sobre a área clara não precisam passar, e não entram. O travessão marca o par que não existe naquele tema.',
    '',
    `| Uso | Mínimo | ${temasDoWindows.map((tema) => NOMES_DOS_TEMAS_DO_WINDOWS[tema]).join(' | ')} |`,
    `|---|---|${temasDoWindows.map(() => '---').join('|')}|`,
    ...PARES_DA_ABA_FLUTUANTE.map(
      (par) =>
        `| ${par.uso} | ${decimal(par.minimo)}:1 | ${temasDoWindows.map((tema) => razaoDaAba(par.uso, tema)).join(' | ')} |`,
    ),
  ];
  if (reprovadasDaAba.length > 0) {
    linhas.push(
      '',
      '## Reprovações da aba do Windows',
      '',
      '| Tema do Windows | Uso | Razão | Mínimo |',
      '|---|---|---|---|',
    );
    for (const r of reprovadasDaAba) {
      linhas.push(
        `| ${NOMES_DOS_TEMAS_DO_WINDOWS[r.tema]} | ${r.uso} | ${decimal(r.razao)}:1 | ${decimal(r.minimo)}:1 |`,
      );
    }
  }
  if (reprovadas.length > 0) {
    linhas.push(
      '',
      '## Reprovações',
      '',
      '| Combinação | Uso | Razão | Mínimo |',
      '|---|---|---|---|',
    );
    for (const r of reprovadas) {
      linhas.push(
        `| ${r.tema} / ${r.destaque} | ${r.uso} | ${decimal(r.razao)}:1 | ${decimal(r.minimo)}:1 |`,
      );
    }
  }
  return {
    markdown: `${linhas.join('\n')}\n`,
    reprovadas: reprovadas.length + reprovadasDaAba.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destino = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../docs/identidade/contraste.md',
  );
  const { markdown, reprovadas } = relatorioDeContraste();
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, markdown);
  if (reprovadas > 0) {
    console.error(
      `${reprovadas} medição(ões) abaixo do mínimo. Veja docs/identidade/contraste.md.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      'Contraste AA em todas as combinações e nos três temas do Windows. Relatório: docs/identidade/contraste.md',
    );
  }
}
