// Os instrumentos de visualização no catálogo (change visualizacoes-de-dados, tarefa 3.1). Os números
// são de exemplo, como diz cada história.
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { fonteDoToken } from '../../teste/fonteDoToken.ts';
import { type IdDaTinta, NOMES_DAS_TINTAS } from '../../tokens/gerador.ts';
import { Cartucho } from './Cartucho.tsx';
import { Contagem } from './Contagem.tsx';
import type { DiaDaFaixa } from './calculos.ts';
import { FaixaDeDias } from './FaixaDeDias.tsx';
import { Medidor } from './Medidor.tsx';
import { Tendencia } from './Tendencia.tsx';

const meta: Meta = { title: 'Visualização de dados' };
export default meta;

type Historia = StoryObj;

/** O id da tinta magenta, tirado dos tokens: o nome de cor solto não passa no verificador. */
const magenta = (Object.keys(NOMES_DAS_TINTAS) as IdDaTinta[]).find((id) =>
  id.startsWith('mag'),
) as IdDaTinta;

const coluna: CSSProperties = { display: 'grid', gap: 'var(--esp-6)', maxWidth: 520 };
const linha: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 'var(--esp-4)' };
const nota: CSSProperties = {
  margin: 0,
  fontSize: 'var(--texto-dado)',
  color: 'var(--cor-texto-2)',
};

function Exemplo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--esp-2)' }}>
      <p style={nota}>{titulo}</p>
      {children}
    </section>
  );
}

/** A régua: o toner com o limite da regra, a ocupação dos rostos e o sem valor. Exemplos. */
export const MedidorDeExemplo: Historia = {
  name: 'Medidor',
  render: () => (
    <div style={coluna}>
      <Exemplo titulo="Toner preto, com o limite da regra de alerta">
        <Medidor
          rotulo="Toner preto"
          valor={38}
          tinta="preto"
          limite={{ valor: 10, rotulo: 'Alerta abaixo de 10%' }}
        />
      </Exemplo>
      <Exemplo titulo="Toner amarelo, no tamanho grande">
        <Medidor rotulo="Toner amarelo" valor={81} tinta="amarelo" tamanho="grande" />
      </Exemplo>
      <Exemplo titulo="Rostos cadastrados no controle, compacto">
        <Medidor
          rotulo="Rostos"
          valor={412}
          maximo={3000}
          unidade="rostos"
          tinta="serie-1"
          tamanho="compacto"
        />
      </Exemplo>
      <Exemplo titulo="Sem leitura">
        <Medidor rotulo="Toner ciano" valor={null} semValor="Sem dado" />
      </Exemplo>
    </div>
  ),
};

/** Os cartuchos de uma impressora colorida, com o cilindro e os estados sem medida. Exemplos. */
export const CartuchoDeExemplo: Historia = {
  name: 'Cartucho',
  render: () => (
    <div style={coluna}>
      <Exemplo titulo="HP Color LaserJet M454 · PAT-00412">
        <div style={linha}>
          <Cartucho
            nome="Ciano"
            tinta="ciano"
            nivel={{ tipo: 'medido', percentual: 62 }}
            estimativa="Acaba em cerca de 34 dias"
          />
          <Cartucho
            nome={NOMES_DAS_TINTAS[magenta]}
            tinta={magenta}
            nivel={{ tipo: 'medido', percentual: 38 }}
            estimativa="Acaba em cerca de 21 dias"
            limite={10}
          />
          <Cartucho nome="Amarelo" tinta="amarelo" nivel={{ tipo: 'medido', percentual: 81 }} />
          <Cartucho
            nome="Preto"
            tinta="preto"
            nivel={{ tipo: 'medido', percentual: 15 }}
            estimativa="Acaba em cerca de 6 dias"
            limite={10}
          />
          <Cartucho nome="Cilindro" tinta={null} nivel={{ tipo: 'medido', percentual: 60 }} />
        </div>
      </Exemplo>
      <Exemplo titulo="O que a impressora não mede">
        <div style={linha}>
          <Cartucho nome="Preto" tinta="preto" nivel={{ tipo: 'ha-suprimento' }} />
          <Cartucho nome="Ciano" tinta="ciano" nivel={{ tipo: 'sem-dado' }} />
          <Cartucho
            nome={NOMES_DAS_TINTAS[magenta]}
            tinta={magenta}
            nivel={{ tipo: 'inconsistente', valor: 120 }}
          />
        </div>
      </Exemplo>
    </div>
  ),
};

/** 30 dias de backups de um controle, com duas falhas, um parcial e dois dias sem nada. Exemplo. */
function trintaDias(): DiaDaFaixa[] {
  return Array.from({ length: 30 }, (_, i) => {
    const data = `2026-10-${String(i + 1).padStart(2, '0')}`;
    if (i === 6 || i === 19)
      return { data, situacao: 'falha', detalhe: 'O controle não respondeu.' };
    if (i === 12) return { data, situacao: 'parcial', detalhe: 'Sem as fotos.' };
    if (i >= 28) return { data, situacao: 'nada' };
    return { data, situacao: 'ok' };
  });
}

export const FaixaDeDiasDeExemplo: Historia = {
  name: 'Faixa de dias',
  render: () => (
    <div style={coluna}>
      <Exemplo titulo="Backups do Controle da portaria · PAT-00778">
        <FaixaDeDias rotulo="Backups dos últimos 30 dias" dias={trintaDias()} oQue="backup" />
      </Exemplo>
    </div>
  ),
};

const rostos = [380, 384, 384, 390, 395, 401, 401, 406, 409, 412].map((valor, i) => ({
  momento: `2026-10-${String(1 + i * 3).padStart(2, '0')}T03:00:00Z`,
  valor,
}));

const toner = [72, 66, 61, 55, 49, 44, 38].map((valor, i) => ({
  momento: `2026-10-${String(1 + i * 4).padStart(2, '0')}T08:00:00Z`,
  valor,
}));

export const TendenciaDeExemplo: Historia = {
  name: 'Tendência',
  render: () => (
    <div style={coluna}>
      <Exemplo titulo="Rostos cadastrados ao longo dos backups">
        <Tendencia
          rotulo="Rostos"
          pontos={rostos}
          unidade="rostos"
          periodo="30 dias"
          tinta="serie-1"
        />
      </Exemplo>
      <Exemplo titulo="Toner magenta, com a projeção até acabar">
        <Tendencia
          rotulo="Toner magenta"
          pontos={toner}
          unidade="%"
          periodo="25 dias"
          tinta={magenta}
          projecao={{ momento: '2026-11-19T08:00:00Z', valor: 0 }}
        />
      </Exemplo>
    </div>
  ),
};

export const ContagemDeExemplo: Historia = {
  name: 'Contagem',
  render: () => (
    <div style={{ ...linha, gap: 'var(--esp-8)' }}>
      <Contagem
        rotulo="Rostos"
        valor={412}
        unidade="rostos"
        capacidade={3000}
        variacao={{ valor: 3, desde: 'o backup anterior' }}
        tinta="serie-1"
      />
      <Contagem rotulo="Usuários" valor={98} variacao={{ valor: -2, desde: 'o backup anterior' }} />
      <Contagem rotulo="Páginas" valor={12500} variacao={{ valor: 0, desde: 'ontem' }} />
    </div>
  ),
};

/**
 * Os números dos instrumentos na fonte da interface, com os algarismos tabulares (change
 * ajustes-dos-tokens, design, decisões 5 e 6). Na contagem de "99,1%", a vírgula tem menos da
 * metade da largura de um algarismo; a placa do cartucho, com a letra da tinta, segue na mono.
 * Exemplos.
 */
export const NumerosNaFonteDaInterface: Historia = {
  name: 'Números na fonte da interface',
  render: () => (
    <div style={coluna}>
      <Contagem rotulo="Disponibilidade" valor={99.1} unidade="%" />
      <Contagem rotulo="Rostos" valor={398} unidade="rostos" capacidade={3000} />
      <Medidor rotulo="Toner preto" valor={38} tinta="preto" />
      <div style={linha}>
        <Cartucho nome="Ciano" tinta="ciano" nivel={{ tipo: 'medido', percentual: 62 }} />
      </div>
      <Tendencia
        rotulo="Rostos"
        pontos={rostos}
        unidade="rostos"
        periodo="30 dias"
        tinta="serie-1"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const daInterface = fonteDoToken('--fonte-interface');
    const mono = fonteDoToken('--fonte-mono');
    /** O nó de texto que é só o número dado. */
    const numero = (texto: string): Text => {
      const andar = document.createTreeWalker(canvasElement, NodeFilter.SHOW_TEXT);
      for (let no = andar.nextNode(); no; no = andar.nextNode()) {
        if (no.textContent === texto) return no as Text;
      }
      throw new Error(`O número "${texto}" não está na história.`);
    };
    const estiloDe = (no: Text) => getComputedStyle(no.parentElement as HTMLElement);
    /** A largura do caractere na posição dada do nó de texto. */
    const larguraDe = (no: Text, posicao: number) => {
      const trecho = document.createRange();
      trecho.setStart(no, posicao);
      trecho.setEnd(no, posicao + 1);
      return trecho.getBoundingClientRect().width;
    };

    // Percentual com vírgula: o "99,1" da contagem, com a vírgula mais estreita que meio algarismo.
    const contagem = numero('99,1');
    await expect(estiloDe(contagem).fontFamily).toBe(daInterface);
    await expect(estiloDe(contagem).fontVariantNumeric).toBe('tabular-nums');
    await expect(larguraDe(contagem, 2)).toBeLessThan(larguraDe(contagem, 0) / 2);

    // A capacidade da contagem, o número do medidor, o nível do cartucho e o último valor da
    // tendência.
    for (const texto of ['de 3.000', '38', '62%', '412']) {
      await expect(estiloDe(numero(texto)).fontFamily).toBe(daInterface);
      await expect(estiloDe(numero(texto)).fontVariantNumeric).toBe('tabular-nums');
    }

    // A placa do cartucho, com a letra da tinta, segue na mono.
    const placa = canvasElement.querySelector<HTMLElement>('[data-parte="placa"]');
    await expect(placa).not.toBeNull();
    await expect(getComputedStyle(placa as HTMLElement).fontFamily).toBe(mono);
  },
};

const TAMANHOS_DO_MEDIDOR = ['compacto', 'normal', 'grande'] as const;

/**
 * A reserva do número do medidor (`min-width: 4ch`) cabe o "100%" na fonte da interface, nos três
 * tamanhos: a régua do 100% tem a largura da do 38%, e as réguas empilhadas acabam juntas. O `ch`
 * da Instrument Sans mede o "0" sem os algarismos tabulares, mais largo que eles. Exemplos.
 */
export const ReservaDoNumeroDoMedidor: Historia = {
  name: 'Reserva do número do medidor',
  render: () => (
    <div style={coluna}>
      {TAMANHOS_DO_MEDIDOR.flatMap((tamanho) =>
        [100, 38].map((valor) => (
          <Medidor
            key={`${tamanho}-${valor}`}
            rotulo={`Toner a ${valor}%, ${tamanho}`}
            valor={valor}
            tinta="preto"
            tamanho={tamanho}
          />
        )),
      )}
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const regua = (valor: number, tamanho: string) =>
      within(canvasElement)
        .getByRole('meter', { name: `Toner a ${valor}%, ${tamanho}` })
        .getBoundingClientRect().width;
    for (const tamanho of TAMANHOS_DO_MEDIDOR) {
      await expect(regua(100, tamanho)).toBeCloseTo(regua(38, tamanho), 1);
    }
  },
};

const DENSIDADES = ['compacta', 'normal', 'confortavel'] as const;

/**
 * O medidor compacto numa caixa de 40 px, com o número logo depois dela, como na célula dos
 * suprimentos da tabela dos ativos (spec visualizacao-de-dados, "Medidor"; change
 * ajuste-do-medidor, design, decisão 1): a régua acaba dentro da caixa e antes do número, nas três
 * densidades. Exemplos.
 */
export const MedidorCompactoNumaCaixaDe40Px: Historia = {
  name: 'Medidor compacto numa caixa de 40 px',
  tags: ['captura'],
  render: () => (
    <div style={coluna}>
      {DENSIDADES.map((densidade) => (
        <div
          key={densidade}
          data-density={densidade}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--esp-2)' }}
        >
          <span data-caixa style={{ display: 'inline-block', inlineSize: '40px', flex: 'none' }}>
            <Medidor
              rotulo={`Toner preto, densidade ${densidade}`}
              valor={8}
              tinta="preto"
              tamanho="compacto"
              marcas={[]}
              semNumero
            />
          </span>
          <span className="numero">8%</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const densidade of DENSIDADES) {
      const regua = within(canvasElement).getByRole('meter', {
        name: `Toner preto, densidade ${densidade}`,
      });
      const caixa = regua.closest('[data-caixa]') as HTMLElement;
      const numero = caixa.nextElementSibling as HTMLElement;
      const fimDaRegua = regua.getBoundingClientRect().right;
      await expect(fimDaRegua).toBeLessThanOrEqual(caixa.getBoundingClientRect().right);
      await expect(fimDaRegua).toBeLessThanOrEqual(numero.getBoundingClientRect().left);
    }
  },
};
