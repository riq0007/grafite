import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CartaoDoRegistro } from '../referencia/CartaoDoRegistro.tsx';
import { ReferenciaComCartao } from '../referencia/ReferenciaComCartao.tsx';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import { ATIVOS, type Ativo } from './exemplos.ts';
import { type ItemDoResumo, type PosicaoDoResumo, ResumoDaLinha } from './ResumoDaLinha.tsx';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  Linha,
  ProvedorDaTabela,
  Tabela,
} from './Tabela.tsx';
import { ValorComposto } from './ValorComposto.tsx';

const meta: Meta = { title: 'Componentes/Tabela com resumo da linha' };
export default meta;

type Historia = StoryObj;

/** Os dados das colunas além das quatro primeiras, por ativo; o responsável fica vazio no Aruba. */
const DETALHES: Record<string, { serie: string; hostname: string; responsavel: string }> = {
  '1': { serie: 'VNB3K12345', hostname: 'IMP-ALMOX-01', responsavel: 'Ana Souza' },
  '2': { serie: '7XK9J52', hostname: 'ENG-PC-02', responsavel: 'Bruno Lima' },
  '3': { serie: 'CN0HKKP0L3', hostname: 'SW-CPD-A1', responsavel: '' },
  '4': { serie: '0E2F71', hostname: 'ACESSO-PORTARIA', responsavel: 'Carla Dias' },
  '5': { serie: 'NB3K-0091', hostname: 'NOBREAK-CPD', responsavel: 'Bruno Lima' },
  '6': { serie: 'VIP-3230-77', hostname: 'CAM-ESTAC-03', responsavel: 'Carla Dias' },
  '7': { serie: 'FTX2231A0BC', hostname: 'RT-BORDA-01', responsavel: 'Ana Souza' },
  '8': { serie: 'MT-77-0412', hostname: 'NB-COMERCIAL-08', responsavel: 'Diego Ramos' },
};

interface DefinicaoDaColuna {
  id: string;
  rotulo: string;
  largura: number;
  valor: (ativo: Ativo) => ReactNode;
  /** O valor em texto, para o resumo, quando a célula o desenha de outro jeito. */
  noResumo?: (ativo: Ativo) => ReactNode;
  mono?: boolean;
}

/**
 * Sete colunas: as três primeiras cabem na área de 384 px, ao lado da barra de rolagem, e as quatro
 * últimas ficam além dela.
 */
const COLUNAS: DefinicaoDaColuna[] = [
  { id: 'nome', rotulo: 'Equipamento', largura: 150, valor: (ativo) => ativo.nome },
  {
    id: 'patrimonio',
    rotulo: 'Patrimônio',
    largura: 110,
    valor: (ativo) => ativo.patrimonio,
    mono: true,
  },
  {
    id: 'situacao',
    rotulo: 'Situação',
    largura: 120,
    valor: (ativo) => (
      <RotuloDeSituacao situacao={ativo.situacao.tipo}>{ativo.situacao.texto}</RotuloDeSituacao>
    ),
  },
  { id: 'local', rotulo: 'Local', largura: 180, valor: (ativo) => ativo.local },
  {
    id: 'serie',
    rotulo: 'Série',
    largura: 130,
    valor: (ativo) => DETALHES[ativo.id]?.serie,
    mono: true,
  },
  {
    id: 'hostname',
    rotulo: 'Hostname',
    largura: 150,
    valor: (ativo) => DETALHES[ativo.id]?.hostname,
    mono: true,
  },
  {
    id: 'responsavel',
    rotulo: 'Responsável',
    largura: 150,
    valor: (ativo) => DETALHES[ativo.id]?.responsavel,
  },
];

const porId = new Map(ATIVOS.map((ativo) => [ativo.id, ativo]));

/** O resumo que a tela dá à tabela: todas as colunas à vista, com o valor na linha. */
const resumoDe =
  (colunas: DefinicaoDaColuna[]) =>
  (chave: string): ItemDoResumo[] => {
    const ativo = porId.get(chave);
    return ativo
      ? colunas.map((coluna) => ({
          coluna: coluna.id,
          rotulo: coluna.rotulo,
          valor: (coluna.noResumo ?? coluna.valor)(ativo),
        }))
      : [];
  };

/**
 * Três colunas que cabem na área de 384 px, com os suprimentos numa coluna estreita demais para o
 * valor composto dela: a célula corta a descrição do suprimento.
 */
const COLUNAS_COM_O_CONTEUDO_CORTADO: DefinicaoDaColuna[] = [
  ...COLUNAS.slice(0, 2),
  {
    id: 'suprimentos',
    rotulo: 'Suprimentos',
    largura: 110,
    valor: () => (
      <ValorComposto fixo={<span className="mono">8%</span>}>Black Toner Cartridge</ValorComposto>
    ),
    noResumo: () => '8% · Black Toner Cartridge',
  },
];

function TabelaComResumo({
  colunas = COLUNAS,
  virtualizada = false,
  comMenu = false,
}: {
  colunas?: DefinicaoDaColuna[];
  virtualizada?: boolean;
  comMenu?: boolean;
}) {
  return (
    <div
      style={{
        // Os 384 px das colunas e os 12 px da barra de rolagem da tabela, que rola para baixo.
        width: 'calc(384px + var(--esp-3))',
        ...(virtualizada ? { height: '280px', display: 'flex', flexDirection: 'column' } : {}),
      }}
    >
      <Tabela
        rotulo="Ativos"
        redimensionavel
        virtualizada={virtualizada}
        alturaMaxima={virtualizada ? undefined : '320px'}
        aoAbrirLinha={() => {}}
        resumoDaLinha={resumoDe(colunas)}
        menuDeContexto={
          comMenu ? () => [{ id: 'abrir', rotulo: 'Abrir', aoEscolher: () => {} }] : undefined
        }
      >
        <CabecalhoDaTabela>
          {colunas.map((coluna) => (
            <Coluna
              key={coluna.id}
              id={coluna.id}
              principal={coluna.id === 'nome'}
              largura={coluna.largura}
            >
              {coluna.rotulo}
            </Coluna>
          ))}
        </CabecalhoDaTabela>
        <CorpoDaTabela itens={ATIVOS} dependencias={[colunas]}>
          {(ativo) => (
            <Linha id={ativo.id}>
              {colunas.map((coluna) => (
                <Celula key={coluna.id} mono={coluna.mono}>
                  {coluna.valor(ativo)}
                </Celula>
              ))}
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

const celula = (canvas: HTMLElement, texto: string) => within(canvas).getByText(texto);

const resumo = () => within(document.body).queryByRole('tooltip');

const esperarResumo = () => within(document.body).findByRole('tooltip', {}, { timeout: 3000 });

const pausa = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Os pares de rótulo e valor do resumo, como texto. */
const pares = (elemento: HTMLElement) =>
  [...elemento.querySelectorAll('dt')].map((rotulo) => [
    rotulo.textContent,
    rotulo.nextElementSibling?.textContent,
  ]);

/**
 * O mouse parado 1,5 s sobre a linha mostra as quatro colunas além da área visível, com o valor
 * daquela linha e "—" no vazio, sem tirar o foco de onde estava.
 */
export const ColunasForaDaArea: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    const emFoco = document.activeElement;
    const inicio = performance.now();
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    const aberto = await esperarResumo();
    await expect(performance.now() - inicio).toBeGreaterThanOrEqual(1450);
    await expect(pares(aberto)).toEqual([
      ['Local', 'CPD · Rack A'],
      ['Série', 'CN0HKKP0L3'],
      ['Hostname', 'SW-CPD-A1'],
      ['Responsável', '—'],
    ]);
    await expect(document.activeElement).toBe(emFoco);
    // O resumo fica abaixo da linha, sem cobri-la.
    const linha = within(canvasElement).getByRole('row', { name: /Aruba/ });
    await expect(aberto.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      linha.getBoundingClientRect().bottom,
    );
  },
};

/** Com todas as colunas na área visível, nenhum resumo aparece. */
export const TodasAVista: Historia = {
  render: () => <TabelaComResumo colunas={COLUNAS.slice(0, 3)} />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    await pausa(2000);
    await expect(resumo()).toBeNull();
  },
};

/**
 * Com todas as colunas na área visível e o conteúdo de uma delas cortado na célula, o resumo traz
 * só essa coluna, com o valor inteiro (spec tabelas-configuraveis, "Resumo da linha").
 */
export const ConteudoCortadoNaCelula: Historia = {
  render: () => <TabelaComResumo colunas={COLUNAS_COM_O_CONTEUDO_CORTADO} />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    const aberto = await esperarResumo();
    await expect(pares(aberto)).toEqual([['Suprimentos', '8% · Black Toner Cartridge']]);
  },
};

/** Na tabela que desenha só as linhas visíveis, o conteúdo cortado entra no resumo do mesmo jeito. */
export const ConteudoCortadoNaCelulaVirtualizada: Historia = {
  render: () => <TabelaComResumo colunas={COLUNAS_COM_O_CONTEUDO_CORTADO} virtualizada />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(await within(canvasElement).findByText('PAT-00102'));
    const aberto = await esperarResumo();
    await expect(pares(aberto)).toEqual([['Suprimentos', '8% · Black Toner Cartridge']]);
  },
};

/** O mouse que passa pelas linhas sem parar 1,5 s em nenhuma não abre o resumo. */
export const MouseEmMovimento: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    for (const patrimonio of ['PAT-00412', 'PAT-00388', 'PAT-00102', 'PAT-00251', 'PAT-00412']) {
      await userEvent.hover(celula(canvasElement, patrimonio));
      await pausa(600);
    }
    await expect(resumo()).toBeNull();
  },
};

/** O mouse que vai para outra linha fecha o resumo, e o tempo recomeça nela. */
export const OutraLinha: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    await esperarResumo();
    await userEvent.hover(celula(canvasElement, 'PAT-00251'));
    await expect(resumo()).toBeNull();
    const novo = await esperarResumo();
    // O resumo é o da linha nova. Nela, o rótulo "Em manutenção" não cabe na coluna de 120 px e
    // entra no resumo também, antes das colunas além da área.
    await expect(pares(novo).slice(0, 2)).toEqual([
      ['Situação', 'Em manutenção'],
      ['Local', 'Portaria principal'],
    ]);
  },
};

/** A rolagem da tabela fecha o resumo. */
export const RolagemFecha: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    await esperarResumo();
    const rolagem = canvasElement.querySelector<HTMLElement>('[data-rolagem]');
    rolagem?.scrollBy({ left: 60 });
    await waitFor(() => expect(resumo()).toBeNull());
  },
};

/** Uma tecla fecha o resumo. */
export const TeclaFecha: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    await esperarResumo();
    await userEvent.keyboard('{Shift}');
    await expect(resumo()).toBeNull();
  },
};

/** O mouse que sai da tabela fecha o resumo. */
export const SaidaFecha: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    await esperarResumo();
    await userEvent.unhover(celula(canvasElement, 'PAT-00102'));
    await expect(resumo()).toBeNull();
  },
};

/** Com o botão do mouse apertado, como ao selecionar um trecho, o resumo não aparece. */
export const BotaoApertado: Historia = {
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: celula(canvasElement, 'PAT-00102') },
      { target: celula(canvasElement, 'CPD · Rack A') },
    ]);
    await pausa(2000);
    await expect(resumo()).toBeNull();
    await userEvent.pointer({ keys: '[/MouseLeft]' });
  },
};

/** No toque, segurar a linha abre o menu de contexto, e o resumo não aparece. */
export const Toque: Historia = {
  render: () => <TabelaComResumo comMenu />,
  play: async ({ canvasElement }) => {
    const alvo = within(canvasElement).getByRole('row', { name: /Aruba/ });
    const caixa = alvo.getBoundingClientRect();
    const toque = (tipo: string) =>
      new PointerEvent(tipo, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: tipo === 'pointerup' ? 0 : 1,
        clientX: caixa.left + 40,
        clientY: caixa.top + caixa.height / 2,
      });
    alvo.dispatchEvent(toque('pointerdown'));
    alvo.dispatchEvent(toque('pointermove'));
    await within(document.body).findByRole('menu', { name: 'Ações das linhas' });
    await pausa(1600);
    await expect(resumo()).toBeNull();
    alvo.dispatchEvent(toque('pointerup'));
  },
};

/** Desligado nos Ajustes › Tabelas, o resumo não aparece. */
export const Desligado: Historia = {
  render: () => (
    <ProvedorDaTabela resumoDaLinha={false}>
      <TabelaComResumo />
    </ProvedorDaTabela>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    await pausa(2000);
    await expect(resumo()).toBeNull();
  },
};

const comMovimentoReduzido: Decorator = (Historia) => {
  document.documentElement.setAttribute('data-motion', 'reduzido');
  return <Historia />;
};

/** O resumo aparece como o menu, com leve escala; com movimento reduzido, a escala some. */
export const SemEscalaComMovimentoReduzido: Historia = {
  decorators: [comMovimentoReduzido],
  render: () => <TabelaComResumo />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    const aberto = await esperarResumo();
    await expect(getComputedStyle(aberto).animationDuration).toBe('0.17s, 0s');
    document.documentElement.removeAttribute('data-motion');
  },
};

/**
 * Na tabela virtualizada, as colunas longe da área visível nem são desenhadas, e o resumo as
 * mostra do mesmo jeito.
 */
export const Virtualizada: Historia = {
  render: () => <TabelaComResumo virtualizada />,
  play: async ({ canvasElement }) => {
    const grade = within(canvasElement).getByRole('grid', { name: 'Ativos' });
    await waitFor(() =>
      expect(within(grade).queryByRole('columnheader', { name: /Responsável/ })).toBeNull(),
    );
    await userEvent.hover(celula(canvasElement, 'PAT-00102'));
    const aberto = await esperarResumo();
    await expect(pares(aberto).map(([rotulo]) => rotulo)).toEqual([
      'Local',
      'Série',
      'Hostname',
      'Responsável',
    ]);
  },
};

/** O resumo aberto sob a segunda linha, para a captura de referência. */
function ResumoAberto() {
  const area = useRef<HTMLDivElement>(null);
  const [posicao, definirPosicao] = useState<PosicaoDoResumo | null>(null);
  // A tabela desenha as linhas depois de montar a coleção: mede quando a segunda linha existe.
  useEffect(() => {
    let quadro = 0;
    const medir = () => {
      const linha = area.current?.querySelector('[role="row"][data-key="2"]');
      if (!linha) {
        quadro = requestAnimationFrame(medir);
        return;
      }
      const caixa = linha.getBoundingClientRect();
      definirPosicao({ x: caixa.left + 120, topo: caixa.top, base: caixa.bottom });
    };
    medir();
    return () => cancelAnimationFrame(quadro);
  }, []);
  return (
    <div ref={area}>
      <TabelaComResumo />
      {posicao && <ResumoDaLinha itens={resumoDe(COLUNAS)('2').slice(3)} posicao={posicao} />}
    </div>
  );
}

/** O resumo como aparece: as colunas fora da área visível, com o rótulo e o valor. */
export const Resumo: Historia = {
  tags: ['captura'],
  render: () => <ResumoAberto />,
  play: async () => {
    const aberto = await esperarResumo();
    await expect(pares(aberto)).toEqual([
      ['Local', 'Engenharia · Sala 2'],
      ['Série', '7XK9J52'],
      ['Hostname', 'ENG-PC-02'],
      ['Responsável', 'Bruno Lima'],
    ]);
  },
};

/** Quarenta colunas de exemplo, para o resumo que não cabe numa parte só. */
const MUITAS: ItemDoResumo[] = Array.from({ length: 40 }, (_, indice) => ({
  coluna: `campo-${indice + 1}`,
  rotulo: `Campo ${indice + 1}`,
  valor: indice % 7 === 0 ? '' : `Valor ${indice + 1}`,
}));

/**
 * Com mais colunas do que cabem na altura da janela, o resumo se divide em partes lado a lado, e o
 * valor mais largo que o resumo continua na linha de baixo, inteiro.
 */
export const MuitasColunas: Historia = {
  render: () => {
    const topo = Math.round(window.innerHeight * 0.3);
    const itens = MUITAS.map((item, indice) =>
      indice === 1
        ? { ...item, valor: 'Um valor bem mais longo do que cabe na largura do resumo' }
        : item,
    );
    return <ResumoDaLinha itens={itens} posicao={{ x: 40, topo, base: topo + 34 }} />;
  },
  play: async () => {
    const aberto = await esperarResumo();
    const lista = aberto.querySelector('dl') as HTMLElement;
    await waitFor(() =>
      expect(getComputedStyle(lista).gridTemplateColumns.split(' ').length).toBeGreaterThan(2),
    );
    await expect(aberto.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
    const longo = within(aberto).getByText(/Um valor bem mais longo/);
    await expect(longo.scrollWidth).toBeLessThanOrEqual(longo.clientWidth);
    await expect(longo.getBoundingClientRect().height).toBeGreaterThan(
      within(aberto).getByText('Valor 3').getBoundingClientRect().height,
    );
    await expect(within(aberto).getAllByText('—')).toHaveLength(6);
  },
};

/** Dois valores compostos, como as células da coleta os desenham; o primeiro passa da largura. */
const COMPOSTOS: ItemDoResumo[] = [
  {
    coluna: 'suprimentos',
    rotulo: 'Suprimentos',
    valor: (
      <ValorComposto
        fixo={
          <>
            <span className="mono">8%</span>
            <RotuloDeSituacao situacao="atencao">Desatualizado</RotuloDeSituacao>
          </>
        }
      >
        <span>Black Toner Cartridge de alto rendimento</span>
        <span>há 12 dias</span>
      </ValorComposto>
    ),
  },
  {
    coluna: 'paginas',
    rotulo: 'Total de páginas',
    valor: <ValorComposto fixo={<span className="mono">12.500</span>}>há 12 dias</ValorComposto>,
  },
];

/**
 * No resumo, o valor composto aparece inteiro (spec tabelas-configuraveis, "Resumo da linha"): o
 * texto que a célula cortaria continua na linha de baixo, sem reticências, dentro do resumo.
 */
export const ValorCompostoInteiro: Historia = {
  tags: ['captura'],
  render: () => (
    <div style={{ width: '480px', height: '140px' }}>
      <ResumoDaLinha itens={COMPOSTOS} posicao={{ x: 16, topo: 8, base: 8 }} />
    </div>
  ),
  play: async () => {
    const aberto = await esperarResumo();
    await waitFor(() => expect(aberto).not.toHaveAttribute('data-medindo'));
    const caixa = aberto.getBoundingClientRect();
    const restos = [...aberto.querySelectorAll<HTMLElement>('[data-parte="resto"]')];
    await expect(restos).toHaveLength(2);
    for (const parte of [...restos, ...aberto.querySelectorAll<HTMLElement>('dd')]) {
      await expect(parte.scrollWidth).toBeLessThanOrEqual(parte.clientWidth + 1);
      const lugar = parte.getBoundingClientRect();
      await expect(lugar.right).toBeLessThanOrEqual(caixa.right);
      await expect(lugar.bottom).toBeLessThanOrEqual(caixa.bottom);
    }
    // O rótulo de situação fica inteiro, e o que passa da largura vai para a linha de baixo.
    const fixo = aberto.querySelector<HTMLElement>('[data-parte="fixo"]') as HTMLElement;
    await expect(fixo.scrollWidth).toBeLessThanOrEqual(fixo.clientWidth + 1);
    await expect((restos[0] as HTMLElement).getBoundingClientRect().top).toBeGreaterThanOrEqual(
      fixo.getBoundingClientRect().bottom,
    );
  },
};

/** O patrimônio como referência com cartão: o ponteiro sobre ela abre o cartão, não o resumo. */
const COLUNAS_COM_REFERENCIA = COLUNAS.map((coluna) =>
  coluna.id === 'patrimonio'
    ? {
        ...coluna,
        valor: (ativo: Ativo) => (
          <ReferenciaComCartao
            titulo={`Resumo de ${ativo.patrimonio}`}
            cartao={() => (
              <CartaoDoRegistro
                nome={ativo.nome}
                tipo={ativo.patrimonio}
                acoes={<a href="#ativo">Abrir</a>}
              />
            )}
          >
            <a href={`#ativo-${ativo.id}`}>{ativo.patrimonio}</a>
          </ReferenciaComCartao>
        ),
      }
    : coluna,
);

/** Sobre uma referência, o ponteiro parado abre o cartão dela, e o resumo da linha não aparece. */
export const ReferenciaSemResumo: Historia = {
  render: () => <TabelaComResumo colunas={COLUNAS_COM_REFERENCIA} />,
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('link', { name: 'PAT-00102' }));
    await within(document.body).findByRole('dialog', { name: 'Resumo de PAT-00102' });
    await pausa(2000);
    await expect(resumo()).toBeNull();
  },
};
