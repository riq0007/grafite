// As peças comuns das telas dos chamados (spec modulo-chamados, "Selos, prazo em texto e
// movimento"; change chamados-da-ti, design, decisão 20): o selo de cada palavra, com a marca e o
// ícone dela, e o prazo em texto, curto no quadrado e inteiro na linha, que anda a cada minuto
// pelo contador do prazo (prazo.ts).
import {
  HORARIO_DA_TI_PADRAO,
  type ModoDoPrazo,
  prazoEmMinutos,
  type RelogioDoChamado,
  SITUACOES_DO_CHAMADO,
  SITUACOES_DO_TIPO_DE_CHAMADO,
  situacaoDoPrazo,
  type ValorDoPrazo,
} from '@grafite/domain';
import { ProvedorDaRegiao } from '@grafite/ui';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import {
  Circle,
  CircleAlert,
  CircleCheck,
  Clock,
  Headset,
  Hourglass,
  Inbox,
  Lock,
  type LucideIcon,
  SquarePen,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrazoEmTexto, type QualSelo, Selo } from './Pecas.tsx';
import { type RelogioDaApi, relogioDaApi, useContarOPrazo } from './prazo.ts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** O instante no relógio de São Paulo (UTC−3). Nos mockups, hoje é 17/11/2026, e são 09:40. */
const sp = (dataHora: string) => new Date(`${dataHora}-03:00`);

const AGORA = sp('2026-11-17T09:40:00');
const FUSO = 'America/Sao_Paulo';
const HORARIO = HORARIO_DA_TI_PADRAO;
const HORA = 3600;
const MINUTO = 60;

const min = (valor: number): ValorDoPrazo => ({ valor, unidade: 'min' });
const h = (valor: number): ValorDoPrazo => ({ valor, unidade: 'h' });
const doTipo = (resposta: ValorDoPrazo, resolucao: ValorDoPrazo, modo: ModoDoPrazo) =>
  prazoEmMinutos({ modo, resposta, resolucao }, HORARIO);

// Os prazos dos tipos de fábrica (spec tipos-de-chamado, "Tipos de fábrica").
const REDE = doTipo(min(30), h(8), 'corridas');
const COMPUTADOR = doTipo(min(30), h(5), 'corridas');
const TELEFONE = doTipo(h(1), h(10), 'corridas');
const ACESSO = doTipo(min(30), h(4), 'horario');

// Quatro dos 12 chamados abertos às 09:40 dos mockups (m01 e m05).
const N1033: RelogioDoChamado = {
  prazo: REDE,
  contadoS: 0,
  relogioDesde: sp('2026-11-17T01:20:00'),
  primeiraRespostaEm: sp('2026-11-17T01:45:00'),
};
const N1039: RelogioDoChamado = {
  prazo: COMPUTADOR,
  contadoS: 0,
  relogioDesde: sp('2026-11-17T05:40:00'),
  primeiraRespostaEm: sp('2026-11-17T06:40:00'),
};
const N1037: RelogioDoChamado = {
  prazo: TELEFONE,
  contadoS: 0,
  relogioDesde: sp('2026-11-17T03:40:00'),
  primeiraRespostaEm: sp('2026-11-17T04:05:00'),
};
const N1041: RelogioDoChamado = {
  prazo: ACESSO,
  contadoS: 2 * HORA + 16 * MINUTO,
  relogioDesde: null,
  primeiraRespostaEm: sp('2026-11-16T17:22:00'),
};
/** Um de Software, de 24 h corridas, aberto às 09:00, que vence amanhã às 09:00. */
const AMANHA: RelogioDoChamado = {
  prazo: doTipo(h(1), h(24), 'corridas'),
  contadoS: 0,
  relogioDesde: sp('2026-11-17T09:00:00'),
  primeiraRespostaEm: sp('2026-11-17T09:10:00'),
};

/** O relógio como a API o manda, com as datas em texto. */
const naApi = (relogio: RelogioDoChamado): RelogioDaApi => ({
  prazo: relogio.prazo,
  contadoS: relogio.contadoS,
  relogioDesde: relogio.relogioDesde?.toISOString() ?? null,
  primeiraRespostaEm: relogio.primeiraRespostaEm?.toISOString() ?? null,
});

const naRegiao = (fuso: string) =>
  function Regiao({ children }: { children: ReactNode }) {
    return <ProvedorDaRegiao fuso={fuso}>{children}</ProvedorDaRegiao>;
  };

/** Os traços do ícone, para comparar o desenho sem depender do nome da classe. */
const desenho = (Svg: LucideIcon) => {
  const { container, unmount } = render(<Svg />);
  const tracos = container.querySelector('svg')?.innerHTML;
  unmount();
  return tracos;
};

/** O selo ou o prazo que tem o texto, com a marca e o desenho do ícone. */
const marcado = (texto: string, atributo: 'data-situacao' | 'data-grupo') => {
  const elemento = screen.getByText(texto).closest(`[${atributo}]`);
  const icones = elemento?.querySelectorAll('svg') ?? [];
  expect(icones).toHaveLength(1);
  return { marca: elemento?.getAttribute(atributo), icone: icones[0]?.innerHTML };
};

describe('Selo', () => {
  it('cada palavra tem sempre a mesma marca e o mesmo ícone', () => {
    const tabela: [QualSelo, string, string, LucideIcon][] = [
      ['estourado', 'Estourado', 'critico', CircleAlert],
      ['ate-2-horas', 'Vencem em até 2 h', 'atencao', Clock],
      ['parado', 'Relógio parado', 'neutra', Hourglass],
      ['triagem', 'Na triagem', 'neutra', Inbox],
      ['em-atendimento', 'Em atendimento', 'info', Headset],
      ['aguardando', 'Aguardando o colaborador', 'info', Hourglass],
      ['resolvido', 'Resolvido', 'sucesso', CircleCheck],
      ['em-uso', 'Em uso', 'sucesso', CircleCheck],
      ['inativo', 'Inativo', 'neutra', Circle],
      ['so-a-ti-abre', 'Só a TI abre', 'info', Lock],
      ['rascunho', 'Rascunho', 'atencao', SquarePen],
      ['ainda-nao-criado', 'Ainda não criado', 'atencao', SquarePen],
      ['toner-critico', 'Toner crítico', 'critico', CircleAlert],
    ];
    for (const [selo, texto, marca, icone] of tabela) {
      const { unmount } = render(<Selo selo={selo} />);
      expect(marcado(texto, 'data-situacao')).toEqual({ marca, icone: desenho(icone) });
      unmount();
    }
  });

  it('a contagem vai no lugar da palavra, na marca e com o ícone dela', () => {
    render(
      <>
        <Selo selo="estourado">1 estourado</Selo>
        <Selo selo="parado">3 com o relógio parado</Selo>
      </>,
    );
    expect(marcado('1 estourado', 'data-situacao')).toEqual({
      marca: 'critico',
      icone: desenho(CircleAlert),
    });
    expect(marcado('3 com o relógio parado', 'data-situacao')).toEqual({
      marca: 'neutra',
      icone: desenho(Hourglass),
    });
  });

  it('a situação do chamado e a do tipo são o próprio selo', () => {
    const textos = [...SITUACOES_DO_CHAMADO, ...SITUACOES_DO_TIPO_DE_CHAMADO].map((situacao) => {
      const { container, unmount } = render(<Selo selo={situacao} />);
      const texto = container.textContent;
      unmount();
      return texto;
    });
    expect(textos).toEqual([
      'Na triagem',
      'Em atendimento',
      'Aguardando o colaborador',
      'Resolvido',
      'Rascunho',
      'Em uso',
      'Inativo',
    ]);
  });
});

describe('PrazoEmTexto', () => {
  const naTela = (relogio: RelogioDoChamado, forma: 'curta' | 'inteira') =>
    render(
      <PrazoEmTexto situacao={situacaoDoPrazo(relogio, HORARIO, AGORA, FUSO)} forma={forma} />,
    );

  it('inteiro, na linha: o texto do domínio, com o ícone e o estado de cada grupo', () => {
    const casos: [RelogioDoChamado, string, string, LucideIcon][] = [
      [N1033, 'estourado há 20 min', 'estourado', CircleAlert],
      [N1039, 'vence em 1 h', 'ate-2-horas', Clock],
      [N1037, 'vence em 4 h', 'hoje', Clock],
      [AMANHA, 'vence em 23 h', 'depois-de-hoje', Clock],
      [N1041, 'relógio parado', 'parado', Hourglass],
    ];
    for (const [relogio, texto, grupo, icone] of casos) {
      const { container, unmount } = naTela(relogio, 'inteira');
      expect(marcado(texto, 'data-grupo')).toEqual({ marca: grupo, icone: desenho(icone) });
      expect(container.firstElementChild?.getAttribute('data-forma')).toBe('inteira');
      expect(container.querySelector('svg')?.getAttribute('width')).toBe('14');
      unmount();
    }
  });

  it('curto, no quadrado: "estourado" e "parado", e o "vence em" inteiro, com o ícone menor', () => {
    const casos: [RelogioDoChamado, string, string][] = [
      [N1033, 'estourado', 'estourado'],
      [N1039, 'vence em 1 h', 'ate-2-horas'],
      [N1037, 'vence em 4 h', 'hoje'],
      [N1041, 'parado', 'parado'],
    ];
    for (const [relogio, texto, grupo] of casos) {
      const { container, unmount } = naTela(relogio, 'curta');
      expect(container.textContent).toBe(texto);
      expect(marcado(texto, 'data-grupo').marca).toBe(grupo);
      expect(container.firstElementChild?.getAttribute('data-forma')).toBe('curta');
      expect(container.querySelector('svg')?.getAttribute('width')).toBe('12');
      unmount();
    }
  });
});

describe('o contador do prazo', () => {
  /** O relógio de 8 h corridas que vence às 10:40:30, como o #1039 do cenário. */
  const VENCE_AS_10_40_30 = naApi({
    prazo: REDE,
    contadoS: 0,
    relogioDesde: sp('2026-11-17T02:40:30'),
    primeiraRespostaEm: sp('2026-11-17T02:50:00'),
  });

  /** A lista dos prazos, que chama o contador uma vez e conta cada chamado com ele. */
  function NaLista() {
    const contar = useContarOPrazo();
    return (
      <>
        <PrazoEmTexto situacao={contar(VENCE_AS_10_40_30, HORARIO)} forma="inteira" />
        <PrazoEmTexto situacao={contar(naApi(N1041), HORARIO)} forma="inteira" />
      </>
    );
  }

  it('anda sozinho, sem recarregar, e passa pelo "menos de 1 min" dos dois lados', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(sp('2026-11-17T10:39:00'));
    render(<NaLista />, { wrapper: naRegiao(FUSO) });
    expect(marcado('vence em 1 min', 'data-grupo')).toEqual({
      marca: 'ate-2-horas',
      icone: desenho(Clock),
    });
    expect(marcado('relógio parado', 'data-grupo').marca).toBe('parado');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(marcado('vence em menos de 1 min', 'data-grupo').marca).toBe('ate-2-horas');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(marcado('estourado há menos de 1 min', 'data-grupo')).toEqual({
      marca: 'estourado',
      icone: desenho(CircleAlert),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('estourado há 1 min')).toBeTruthy();
    expect(screen.getByText('relógio parado')).toBeTruthy();
  });

  it('o grupo sai no fuso das preferências, e não no do horário da TI', () => {
    // Às 20:00 de São Paulo, vence às 23:30 dali, 02:30 do dia seguinte em Lisboa.
    const venceAsOnzeEMeia = naApi({
      prazo: REDE,
      contadoS: 0,
      relogioDesde: sp('2026-11-17T15:30:00'),
      primeiraRespostaEm: sp('2026-11-17T15:40:00'),
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(sp('2026-11-17T20:00:00'));
    const grupoEm = (fuso: string) =>
      renderHook(() => useContarOPrazo(), { wrapper: naRegiao(fuso) }).result.current(
        venceAsOnzeEMeia,
        HORARIO,
      ).grupo;
    expect(grupoEm('America/Sao_Paulo')).toBe('hoje');
    expect(grupoEm('Europe/Lisbon')).toBe('depois-de-hoje');
  });

  it('as datas da resposta viram instantes, e o relógio parado fica sem o "desde"', () => {
    expect(relogioDaApi(naApi(N1033))).toEqual(N1033);
    expect(relogioDaApi(naApi(N1041))).toEqual(N1041);
  });
});
