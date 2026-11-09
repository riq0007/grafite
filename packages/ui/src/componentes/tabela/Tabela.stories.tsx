import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { esvaziarOAnunciador } from '../../teste/anunciador.ts';
import { Botao } from '../botao/Botao.tsx';
import { EstadoVazio } from '../exibicao/EstadoVazio.tsx';
import { MiniaturaDeAtivo } from '../miniatura/MiniaturaDeAtivo.tsx';
import { QuickLook } from '../previa/QuickLook.tsx';
import { usePrevia } from '../previa/usePrevia.ts';
import { RotuloDeSituacao } from '../situacao/RotuloDeSituacao.tsx';
import { ATIVOS, type Ativo } from './exemplos.ts';
import {
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  Linha,
  type Ordenacao,
  ProvedorDaTabela,
  Tabela,
} from './Tabela.tsx';

const meta: Meta = { title: 'Componentes/Tabela' };
export default meta;

type Historia = StoryObj<{
  aoAbrirLinha?: (chave: string) => void;
  aoPreverLinha?: (chave: string) => void;
  aoEditar?: (chave: string) => void;
  aoCarregar?: () => void;
}>;

interface PropsDaTabelaDeAtivos {
  itens?: Ativo[];
  carregando?: boolean;
  aoAbrirLinha?: (chave: string) => void;
  aoPreverLinha?: (chave: string) => void;
  aoEditar?: (chave: string) => void;
}

function TabelaDeAtivos({
  itens = ATIVOS,
  carregando,
  aoAbrirLinha,
  aoPreverLinha,
  aoEditar,
}: PropsDaTabelaDeAtivos) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao>();
  const ordenados = useMemo(() => {
    if (!ordenacao) return itens;
    const campo = ordenacao.coluna as 'nome' | 'patrimonio';
    const sinal = ordenacao.direcao === 'crescente' ? 1 : -1;
    return [...itens].sort((a, b) => a[campo].localeCompare(b[campo], 'pt-BR') * sinal);
  }, [itens, ordenacao]);
  return (
    <div
      style={{
        padding: 'var(--esp-4)',
        borderRadius: 'var(--raio-janela)',
        background: 'var(--cor-superficie)',
      }}
    >
      <Tabela
        rotulo="Ativos"
        carregando={carregando}
        ordenacao={ordenacao}
        aoOrdenar={setOrdenacao}
        alturaMaxima="220px"
        aoAbrirLinha={aoAbrirLinha}
        aoPreverLinha={aoPreverLinha}
      >
        <CabecalhoDaTabela>
          <ColunaDaMiniatura />
          <Coluna id="nome" principal ordenavel>
            Equipamento
          </Coluna>
          <Coluna id="patrimonio" ordenavel>
            Patrimônio
          </Coluna>
          <Coluna id="local">Local</Coluna>
          <Coluna id="situacao">Situação</Coluna>
          {aoEditar ? <Coluna id="acoes">Ações</Coluna> : null}
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={ordenados}
          vazio={
            <EstadoVazio
              titulo="Nenhum ativo encontrado"
              descricao="Ajuste os filtros ou cadastre um ativo."
              acao={<Botao nivel="primario">Cadastrar ativo</Botao>}
            />
          }
        >
          {(ativo) => (
            <Linha id={ativo.id}>
              <CelulaDaMiniatura>
                <MiniaturaDeAtivo tipo={ativo.tipo} />
              </CelulaDaMiniatura>
              <Celula>{ativo.nome}</Celula>
              <Celula>{ativo.patrimonio}</Celula>
              <Celula>{ativo.local}</Celula>
              <Celula>
                <RotuloDeSituacao situacao={ativo.situacao.tipo}>
                  {ativo.situacao.texto}
                </RotuloDeSituacao>
              </Celula>
              {aoEditar ? (
                <Celula>
                  <Botao nivel="terciario" onPress={() => aoEditar(ativo.id)}>
                    Editar
                  </Botao>
                </Celula>
              ) : null}
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}

export const Padrao: Historia = { render: () => <TabelaDeAtivos /> };

/** A ordenação aplicada fica indicada no cabeçalho (e anunciada) e reordena as linhas. */
export const OrdenacaoIndicada: Historia = {
  render: () => <TabelaDeAtivos />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const patrimonio = tela.getByRole('columnheader', { name: /Patrimônio/ });
    await userEvent.click(patrimonio);
    await waitFor(() => expect(patrimonio).toHaveAttribute('aria-sort', 'ascending'));
    const primeira = () => tela.getAllByRole('row')[1];
    await expect(primeira()).toHaveTextContent('PAT-00077');
    await userEvent.click(patrimonio);
    await waitFor(() => expect(patrimonio).toHaveAttribute('aria-sort', 'descending'));
    await expect(primeira()).toHaveTextContent('PAT-00619');
  },
};

/** Cabeçalho fixo durante a rolagem; linhas alternadas. */
export const CabecalhoFixoELinhasAlternadas: Historia = {
  render: () => <TabelaDeAtivos />,
  play: async ({ canvasElement }) => {
    const rolagem = canvasElement.querySelector('[data-rolagem]') as HTMLElement;
    await expect(rolagem.scrollHeight).toBeGreaterThan(rolagem.clientHeight);
    rolagem.scrollTop = 120;
    await waitFor(() => expect(rolagem.scrollTop).toBeGreaterThan(0));
    const cabecalho = within(canvasElement).getByRole('columnheader', { name: /Equipamento/ });
    const topoDaArea = rolagem.getBoundingClientRect().top + rolagem.clientTop;
    await expect(Math.abs(cabecalho.getBoundingClientRect().top - topoDaArea)).toBeLessThan(1);

    const [, primeira, segunda] = within(canvasElement).getAllByRole('row');
    await expect(getComputedStyle(primeira as Element).backgroundColor).not.toBe(
      getComputedStyle(segunda as Element).backgroundColor,
    );
  },
};

/** Sem registros: o estado vazio, com mensagem objetiva e a ação relevante. */
export const SemRegistros: Historia = {
  render: () => <TabelaDeAtivos itens={[]} />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(tela.getByText('Nenhum ativo encontrado')).toBeVisible();
    await expect(tela.getByRole('button', { name: 'Cadastrar ativo' })).toBeVisible();
  },
};

const linhaDe = (canvas: HTMLElement, nome: string) =>
  within(canvas).getByRole('row', { name: new RegExp(nome) });

/** Clicar na linha abre o registro; Enter na linha em foco também. */
export const AbrirLinha: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaDeAtivos aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(linhaDe(canvasElement, 'Aruba')).getByText('CPD · Rack A'));
    await expect(args.aoAbrirLinha).toHaveBeenLastCalledWith('3');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.aoAbrirLinha).toHaveBeenLastCalledWith('4');
  },
};

/** Um controle dentro da linha faz só a ação dele: o registro não abre. */
export const ControleNaLinha: Historia = {
  args: { aoAbrirLinha: fn(), aoEditar: fn() },
  render: (args) => <TabelaDeAtivos aoAbrirLinha={args.aoAbrirLinha} aoEditar={args.aoEditar} />,
  play: async ({ args, canvasElement }) => {
    const linha = linhaDe(canvasElement, 'Dell OptiPlex');
    await userEvent.click(within(linha).getByRole('button', { name: 'Editar' }));
    await expect(args.aoEditar).toHaveBeenCalledWith('2');
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
  },
};

/** A linha em foco fica marcada, e as setas movem o foco entre as linhas. */
export const LinhaEmFoco: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => <TabelaDeAtivos aoAbrirLinha={args.aoAbrirLinha} />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await waitFor(() => expect(document.activeElement).toBe(linhaDe(canvasElement, 'HP LaserJet')));
    await expect(document.activeElement).toHaveAttribute('data-focus-visible');
    await expect(getComputedStyle(document.activeElement as Element).outlineStyle).toBe('solid');
    await userEvent.keyboard('{ArrowDown}');
    await expect(document.activeElement).toBe(linhaDe(canvasElement, 'Dell OptiPlex'));
  },
};

/** A barra de espaço na linha em foco pede a prévia do registro dela. */
export const EspacoPedeAPrevia: Historia = {
  args: { aoAbrirLinha: fn(), aoPreverLinha: fn() },
  render: (args) => (
    <TabelaDeAtivos aoAbrirLinha={args.aoAbrirLinha} aoPreverLinha={args.aoPreverLinha} />
  ),
  play: async ({ args }) => {
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown} ');
    await expect(args.aoPreverLinha).toHaveBeenCalledWith('3');
    await expect(args.aoAbrirLinha).not.toHaveBeenCalled();
  },
};

/** Sem linhas alternadas, todas as linhas têm o mesmo fundo, ainda separadas pelas divisórias. */
export const SemLinhasAlternadas: Historia = {
  render: () => (
    <ProvedorDaTabela linhasAlternadas={false}>
      <TabelaDeAtivos />
    </ProvedorDaTabela>
  ),
  play: async ({ canvasElement }) => {
    const [, primeira, segunda] = within(canvasElement).getAllByRole('row');
    await expect(getComputedStyle(primeira as Element).backgroundColor).toBe(
      getComputedStyle(segunda as Element).backgroundColor,
    );
    const celula = within(primeira as HTMLElement).getAllByRole('gridcell')[0] as Element;
    await expect(getComputedStyle(celula).borderBottomStyle).toBe('solid');
  },
};

/** Sem miniaturas, a coluna e as células dela saem juntas, e as setas continuam navegando. */
export const SemMiniaturas: Historia = {
  args: { aoAbrirLinha: fn() },
  render: (args) => (
    <ProvedorDaTabela miniaturas={false}>
      <TabelaDeAtivos aoAbrirLinha={args.aoAbrirLinha} />
    </ProvedorDaTabela>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const cabecalhos = tela.getAllByRole('columnheader').map((coluna) => coluna.textContent);
    await expect(cabecalhos[0]).toMatch(/^Equipamento/);
    await expect(cabecalhos).not.toContain('Imagem');
    await expect(canvasElement.querySelector('img, svg[data-miniatura]')).toBeNull();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    await expect(document.activeElement).toHaveTextContent('Dell OptiPlex 7010');
  },
};

/** Sem linhas alternadas e sem miniaturas, como o usuário pode deixar, para a captura de referência. */
export const SemLinhasAlternadasNemMiniaturas: Historia = {
  render: () => (
    <ProvedorDaTabela linhasAlternadas={false} miniaturas={false}>
      <TabelaDeAtivos />
    </ProvedorDaTabela>
  ),
};

/** Com os padrões, a miniatura abre cada linha. */
export const ComMiniaturas: Historia = {
  render: () => <TabelaDeAtivos />,
  play: async ({ canvasElement }) => {
    const cabecalhos = within(canvasElement).getAllByRole('columnheader');
    await expect(cabecalhos[0]).toHaveTextContent('Imagem');
  },
};

/** A tabela de exemplo com a prévia ligada pelo `usePrevia`, como o P1 fará com a de ativos. */
function TabelaComPrevia() {
  const previa = usePrevia(ATIVOS, (ativo) => ativo.id);
  const ativo = previa.item;
  return (
    <>
      <TabelaDeAtivos aoAbrirLinha={() => {}} aoPreverLinha={previa.aoPreverLinha} />
      {ativo && (
        <QuickLook
          aberta={previa.aberta}
          aoFechar={previa.aoFechar}
          titulo={ativo.nome}
          subtitulo={ativo.local}
          posicao={previa.posicao}
          total={previa.total}
          visual={{ tipo: ativo.tipo }}
          campos={[
            { rotulo: 'Patrimônio', valor: ativo.patrimonio, mono: true },
            { rotulo: 'Situação', valor: ativo.situacao.texto },
          ]}
          aoAnterior={previa.aoAnterior}
          aoSeguinte={previa.aoSeguinte}
        />
      )}
    </>
  );
}

/**
 * Espaço na linha em foco abre a prévia; as setas trocam de registro; Esc fecha, com o foco na
 * linha do registro que estava na prévia.
 */
export const ComPrevia: Historia = {
  render: () => <TabelaComPrevia />,
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown} ');
    const dialogo = await within(document.body).findByRole('dialog', {
      name: 'Prévia: Aruba 2930F 48p',
    });
    await expect(within(dialogo).getByText('3 de 8')).toBeInTheDocument();
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await within(document.body).findByRole('dialog', { name: 'Prévia: Nobreak 3 kVA' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(linhaDe(canvasElement, 'Nobreak 3 kVA')),
    );
  },
};

/** Com movimento reduzido, a prévia sai sem animação, e o foco também volta à linha certa. */
export const ComPreviaEMovimentoReduzido: Historia = {
  render: () => <TabelaComPrevia />,
  play: async (contexto) => {
    document.documentElement.setAttribute('data-motion', 'reduzido');
    try {
      await ComPrevia.play?.(contexto);
    } finally {
      document.documentElement.removeAttribute('data-motion');
    }
  },
};

interface Pessoa {
  id: string;
  nome: string;
  matricula: string;
}

/** Doze pessoas, que chegam de cinco em cinco, como uma lista paginada pela API. */
const PESSOAS: Pessoa[] = [
  'Ana Souza',
  'Bruno Costa',
  'Carla Dias',
  'Davi Rocha',
  'Elisa Prado',
  'Fábio Lima',
  'Gabriela Nunes',
  'Heitor Ramos',
  'Íris Matos',
  'João Pires',
  'Karina Lopes',
  'Lucas Melo',
].map((nome, indice) => ({ id: String(indice + 1), nome, matricula: String(1001 + indice) }));

interface PropsDaListaPaginada {
  aoCarregar?: () => void;
  /** Quanto o "carregando" demora a chegar à tabela, como uma consulta que só avisa depois. */
  atrasoDoCarregando?: number;
}

function ListaPaginada({ aoCarregar, atrasoDoCarregando = 0 }: PropsDaListaPaginada) {
  const [quantas, definirQuantas] = useState(5);
  const [carregando, definirCarregando] = useState(false);
  return (
    <Tabela
      rotulo="Pessoas"
      carregarMais={{
        haMais: quantas < PESSOAS.length,
        carregando,
        aoCarregar: () => {
          aoCarregar?.();
          if (atrasoDoCarregando) setTimeout(() => definirCarregando(true), atrasoDoCarregando);
          else definirCarregando(true);
          setTimeout(() => {
            definirQuantas((atual) => Math.min(atual + 5, PESSOAS.length));
            definirCarregando(false);
          }, atrasoDoCarregando + 150);
        },
      }}
    >
      <CabecalhoDaTabela>
        <Coluna id="nome" principal>
          Nome
        </Coluna>
        <Coluna id="matricula">Matrícula</Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={PESSOAS.slice(0, quantas)}>
        {(pessoa) => (
          <Linha id={pessoa.id}>
            <Celula>{pessoa.nome}</Celula>
            <Celula>{pessoa.matricula}</Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  );
}

const nomesNaTabela = (canvas: HTMLElement) =>
  within(canvas)
    .getAllByRole('rowheader')
    .map((celula) => celula.textContent);

const nomes = (quantas: number) => PESSOAS.slice(0, quantas).map((pessoa) => pessoa.nome);

/** A tabela termina com "Carregar mais" enquanto houver mais registros. */
export const CarregarMais: Historia = { render: () => <ListaPaginada /> };

/** As próximas cinco entram ao fim, e "Carregar mais" continua até a última. */
export const CarregarMaisAteAUltima: Historia = {
  render: () => <ListaPaginada />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await expect(nomesNaTabela(canvasElement)).toEqual(nomes(5));
    await userEvent.click(tela.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(nomesNaTabela(canvasElement)).toEqual(nomes(10)));
    await expect(tela.getByRole('button', { name: 'Carregar mais' })).toBeVisible();
    await userEvent.click(tela.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(nomesNaTabela(canvasElement)).toEqual(nomes(12)));
    await expect(tela.queryByRole('button', { name: /Carregar mais/ })).toBeNull();
    // O botão saiu com o foco: os avisos do carregando apontam para ele.
    esvaziarOAnunciador();
  },
};

/** Durante a carga, o botão mostra o carregando e não aceita um segundo pedido. */
export const CarregandoSemPedidoDuplo: Historia = {
  args: { aoCarregar: fn() },
  render: (args) => <ListaPaginada aoCarregar={args.aoCarregar} />,
  play: async ({ args, canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Carregar mais' });
    await userEvent.click(botao);
    await expect(botao).toHaveAttribute('aria-disabled', 'true');
    await expect(botao).toHaveAccessibleName(/Carregando/);
    await userEvent.click(botao);
    await waitFor(() => expect(nomesNaTabela(canvasElement)).toEqual(nomes(10)));
    await expect(args.aoCarregar).toHaveBeenCalledOnce();
  },
};

/** Nem o segundo clique que chega antes de o "carregando" chegar à tabela vira outro pedido. */
export const SegundoCliqueAntesDoCarregando: Historia = {
  args: { aoCarregar: fn() },
  render: (args) => <ListaPaginada aoCarregar={args.aoCarregar} atrasoDoCarregando={300} />,
  play: async ({ args, canvasElement }) => {
    const botao = within(canvasElement).getByRole('button', { name: 'Carregar mais' });
    await userEvent.click(botao);
    await userEvent.click(botao);
    await expect(args.aoCarregar).toHaveBeenCalledOnce();
    await waitFor(() => expect(nomesNaTabela(canvasElement)).toEqual(nomes(10)));
    await expect(args.aoCarregar).toHaveBeenCalledOnce();
  },
};

/**
 * O foco do teclado fica no botão enquanto houver mais; quando acabam os registros, ele passa à
 * primeira linha nova, e as setas seguem dali.
 */
export const FocoQuandoAcabam: Historia = {
  render: () => <ListaPaginada />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(nomesNaTabela(canvasElement)).toEqual(nomes(10)));
    await expect(tela.getByRole('button', { name: 'Carregar mais' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(nomesNaTabela(canvasElement)).toEqual(nomes(12)));
    await waitFor(() => expect(tela.getByRole('row', { name: /Karina Lopes/ })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await expect(tela.getByRole('row', { name: /Lucas Melo/ })).toHaveFocus();
    // O botão saiu com o foco: os avisos do carregando apontam para ele.
    esvaziarOAnunciador();
  },
};

/** Na primeira carga, o esqueleto das linhas sob as colunas, sem texto solto, e a tabela ocupada. */
export const PrimeiraCarga: Historia = {
  render: () => <TabelaDeAtivos itens={[]} carregando />,
  play: async ({ canvasElement }) => {
    const tabela = within(canvasElement).getByRole('grid', { name: 'Ativos' });
    await expect(tabela).toHaveAttribute('aria-busy', 'true');
    await expect(within(tabela).getAllByRole('columnheader').length).toBeGreaterThan(1);
    await expect(canvasElement.querySelectorAll('[data-esqueleto-da-linha]')).toHaveLength(6);
    await expect(within(canvasElement).queryByText('Nenhum ativo encontrado')).toBeNull();
    await expect(within(tabela).getByText('Carregando as linhas.')).toBeInTheDocument();
  },
};

/**
 * Trocando a busca ou um filtro, as linhas de antes ficam, marcadas como carregando, com a linha de
 * progresso no alto e o texto no contraste de sempre.
 */
export const CarregandoComLinhas: Historia = {
  render: () => <TabelaDeAtivos carregando />,
  play: async ({ canvasElement }) => {
    const tabela = within(canvasElement).getByRole('grid', { name: 'Ativos' });
    await expect(tabela).toHaveAttribute('aria-busy', 'true');
    await expect(tabela).toHaveAttribute('data-carregando');
    await expect(canvasElement.querySelector('[data-progresso-da-tabela]')).not.toBeNull();
    await expect(within(tabela).getAllByRole('row').length).toBeGreaterThan(2);
    await expect(canvasElement.querySelector('[data-esqueleto-da-linha]')).toBeNull();
  },
};

/** Carregada, a tabela não fica ocupada. */
export const Carregada: Historia = {
  render: () => <TabelaDeAtivos />,
  play: async ({ canvasElement }) => {
    const tabela = within(canvasElement).getByRole('grid', { name: 'Ativos' });
    await expect(tabela).not.toHaveAttribute('aria-busy', 'true');
    await expect(tabela).not.toHaveAttribute('data-carregando');
    await expect(canvasElement.querySelector('[data-progresso-da-tabela]')).toBeNull();
  },
};
