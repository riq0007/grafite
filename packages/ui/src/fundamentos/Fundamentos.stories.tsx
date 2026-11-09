// Páginas de Fundamentos do catálogo (fundamentos-v3, tarefa 5.1): a cor, a elevação, as
// situações, os dados e a tipografia, como as seções de fundamentos dos sistemas de referência.
// Tudo vem das variáveis do tema aplicado, e cada valor é lido do próprio CSS.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useEffect, useState } from 'react';
import { type IdDaTinta, NOMES_DAS_TINTAS } from '../tokens/gerador.ts';
import estilos from './Fundamentos.module.css';

const meta: Meta = { title: 'Fundamentos' };
export default meta;

type Historia = StoryObj;

/** O valor de uma variável no tema aplicado ao <html>. */
function useValor(variavel: string): string {
  const [valor, setValor] = useState('');
  useEffect(() => {
    const ler = () =>
      setValor(getComputedStyle(document.documentElement).getPropertyValue(variavel).trim());
    ler();
    const observador = new MutationObserver(ler);
    observador.observe(document.documentElement, { attributes: true });
    return () => observador.disconnect();
  }, [variavel]);
  return valor;
}

function Carimbo({ children }: { children: string }) {
  return <h2 className={estilos.carimbo}>{children}</h2>;
}

function Amostra({ nome, variavel }: { nome: string; variavel: string }) {
  const valor = useValor(variavel);
  return (
    <div className={estilos.amostra}>
      <div className={estilos.cor} style={{ background: `var(${variavel})` }} />
      <div className={estilos.legenda}>
        <span className={estilos.nome}>{nome}</span>
        <span className={estilos.variavel}>{variavel}</span>
        <span className={estilos.valor}>{valor}</span>
      </div>
    </div>
  );
}

const GRUPOS_DE_COR: Array<{ titulo: string; nota: string; cores: Array<[string, string]> }> = [
  {
    titulo: 'Superfícies',
    nota: 'Do fundo atrás da janela à camada sobreposta. Nos temas escuros, subir de nível é clarear.',
    cores: [
      ['Fundo', '--cor-fundo'],
      ['Superfície afundada', '--cor-superficie-afundada'],
      ['Superfície', '--cor-superficie'],
      ['Superfície 2', '--cor-superficie-2'],
      ['Superfície elevada', '--cor-superficie-elevada'],
      ['Material sólido', '--cor-material-solido'],
    ],
  },
  {
    titulo: 'Texto e linhas',
    nota: 'O texto principal passa de 7:1, o secundário de 4,5:1 e a borda de controle de 3:1, em qualquer tema.',
    cores: [
      ['Texto', '--cor-texto'],
      ['Texto secundário', '--cor-texto-2'],
      ['Borda de controle', '--cor-borda-controle'],
      ['Linha', '--cor-linha'],
      ['Linha forte', '--cor-linha-forte'],
    ],
  },
  {
    titulo: 'Destaque',
    nota: 'Um destaque só por tela: a ação principal, a seleção e o foco. O Grafite, de fábrica, é monocromático.',
    cores: [
      ['Preenchimento', '--cor-destaque'],
      ['Texto do destaque', '--cor-destaque-texto'],
      ['Texto sobre o preenchimento', '--cor-sobre-destaque'],
    ],
  },
];

/** Os papéis de cor do tema aplicado, gerados a partir da base, do contraste e do destaque. */
export const Cor: Historia = {
  render: () => (
    <div className={estilos.pagina}>
      {GRUPOS_DE_COR.map((grupo) => (
        <section key={grupo.titulo} className={estilos.secao}>
          <Carimbo>{grupo.titulo}</Carimbo>
          <p className={estilos.nota}>{grupo.nota}</p>
          <div className={estilos.grade}>
            {grupo.cores.map(([nome, variavel]) => (
              <Amostra key={variavel} nome={nome} variavel={variavel} />
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};

const PLANOS = [
  ['afundada', 'Afundada', 'Poços: a trilha de um medidor, a faixa de filtros. Sem sombra.'],
  ['padrao', 'Padrão', 'O conteúdo da janela. Sem sombra.'],
  ['elevada', 'Elevada', 'Blocos sobre o conteúdo, como os do Início. Sombra curta.'],
  ['sobreposta', 'Sobreposta', 'Menus, avisos, diálogos e a busca. A sombra do material.'],
] as const;

/** As quatro superfícies, cada uma com a sua sombra de uma camada só. */
export const Elevacao: Historia = {
  name: 'Elevação',
  render: () => (
    <div className={estilos.pagina}>
      <section className={estilos.secao}>
        <Carimbo>Elevação</Carimbo>
        <div className={estilos.planos}>
          {PLANOS.map(([id, nome, uso]) => (
            <div key={id} className={estilos.plano} data-plano={id}>
              <span className={estilos.nome}>{nome}</span>
              <span className={estilos.nota}>{uso}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};

const SITUACOES = [
  ['ok', 'Ok', 'Em dia', '12'],
  ['atencao', 'Atenção', 'Em manutenção', '3'],
  ['critico', 'Crítico', 'Sem sinal', '1'],
  ['info', 'Informação', 'Atualizado', '8'],
] as const;

/** Cada situação com o texto, o selo e o preenchimento forte, sempre com o nome escrito. */
export const Situacoes: Historia = {
  name: 'Situações',
  render: () => (
    <div className={estilos.pagina}>
      <section className={estilos.secao}>
        <Carimbo>Situações</Carimbo>
        <p className={estilos.nota}>
          A cor acompanha o nome, nunca o substitui. O preenchimento forte fica para o que precisa
          chamar a atenção de longe, como uma contagem. Os números são de exemplo.
        </p>
        <div className={estilos.situacoes}>
          {SITUACOES.map(([id, nome, rotulo, contagem]) => (
            <div key={id} className={estilos.situacao} data-situacao={id}>
              <span className={estilos.nome}>{nome}</span>
              <span className={estilos.texto}>Texto e ícone da situação</span>
              <span className={estilos.selo}>{rotulo}</span>
              <span className={estilos.forte}>{contagem}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Níveis de exemplo, na ordem das tintas. */
const NIVEIS_DE_EXEMPLO = [62, 38, 81, 15];
const TINTAS = (Object.entries(NOMES_DAS_TINTAS) as Array<[IdDaTinta, string]>).map(
  ([id, nome], indice) => [id, nome, NIVEIS_DE_EXEMPLO[indice] ?? 0] as const,
);

/** As séries de dados e as tintas dos suprimentos, cada uma com o nome em texto. */
export const Dados: Historia = {
  render: () => (
    <div className={estilos.pagina}>
      <section className={estilos.secao}>
        <Carimbo>Séries</Carimbo>
        <p className={estilos.nota}>
          Oito cores de luminosidade parecida, numa ordem que alterna o quente e o frio. Cada uma
          passa de 3:1 contra a superfície.
        </p>
        <div className={estilos.grade}>
          {SERIES.map((n) => (
            <Amostra key={n} nome={`Série ${n}`} variavel={`--cor-serie-${n}`} />
          ))}
        </div>
      </section>
      <section className={estilos.secao}>
        <Carimbo>Tintas dos suprimentos</Carimbo>
        <p className={estilos.nota}>
          O preto é um neutro, para continuar visível nos temas escuros. Níveis de exemplo.
        </p>
        <div className={estilos.reguas}>
          {TINTAS.map(([id, nome, nivel]) => (
            <div key={id} className={estilos.regua}>
              <span className={estilos.nome}>{nome}</span>
              <div className={estilos.trilha}>
                <div
                  className={estilos.nivel}
                  style={
                    { width: `${nivel}%`, background: `var(--cor-tinta-${id})` } as CSSProperties
                  }
                />
              </div>
              <span className={estilos.numero}>{nivel} %</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  ),
};

const ESCALA = [
  ['Legenda', '--texto-legenda', 'Marcas da escala · 25 50 75'],
  ['Rótulo', '--texto-rotulo', 'Patrimônio'],
  ['Dado', '--texto-dado', 'PAT-00412 · 10.0.5.21'],
  ['Corpo', '--texto-corpo', 'A impressora da recepção respondeu há 3 minutos.'],
  ['Subtítulo', '--texto-subtitulo', 'Suprimentos'],
  ['Título', '--texto-titulo', 'Impressora da recepção'],
  ['Título grande', '--texto-titulo-grande', 'O que resolver agora'],
] as const;

/** A escala de texto, com a legenda e o numeral, o número de instrumento. */
export const Tipografia: Historia = {
  render: () => (
    <div className={estilos.pagina}>
      <section className={estilos.secao}>
        <Carimbo>Escala</Carimbo>
        <div className={estilos.escala}>
          {ESCALA.map(([nome, variavel, exemplo]) => (
            <div key={variavel} className={estilos.linhaDaEscala}>
              <span className={estilos.variavel}>
                {nome} · {variavel}
              </span>
              <span style={{ fontSize: `var(${variavel})` }}>{exemplo}</span>
            </div>
          ))}
          <div className={estilos.linhaDaEscala}>
            <span className={estilos.variavel}>Numeral · --texto-numeral</span>
            <span
              className={estilos.mono}
              style={{ fontSize: 'var(--texto-numeral)', fontWeight: 'var(--peso-forte)' }}
            >
              38<span className={estilos.unidade}>%</span>
            </span>
          </div>
        </div>
      </section>
    </div>
  ),
};
