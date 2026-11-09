import type { Meta, StoryObj } from '@storybook/react-vite';
import { type CSSProperties, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { arranjoDe } from '../../teste/arranjo.ts';
import { Botao } from '../botao/Botao.tsx';
import { BuscaComSugestoes } from '../busca/BuscaComSugestoes.tsx';
import { Gaveta } from '../modal/Gaveta.tsx';
import { type OpcaoDeSelecao, Selecao } from '../selecao/Selecao.tsx';
import { AreaDeTexto } from './AreaDeTexto.tsx';
import { CampoDeTexto } from './CampoDeTexto.tsx';
import { Formulario } from './Formulario.tsx';
import { LinhaDeCampos } from './LinhaDeCampos.tsx';

interface Args {
  aoEnviar: (dados: Record<string, FormDataEntryValue>) => void;
}

const meta: Meta<Args> = {
  title: 'Componentes/Campos',
  args: { aoEnviar: fn() },
};
export default meta;

type Historia = StoryObj<Args>;

const situacoes = [
  { id: 'em-uso', rotulo: 'Em uso' },
  { id: 'em-estoque', rotulo: 'Em estoque' },
  { id: 'em-manutencao', rotulo: 'Em manutenção' },
  { id: 'baixado', rotulo: 'Baixado' },
];

const grade = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 'var(--esp-4)',
  maxWidth: 'var(--largura-formulario)',
} as const;

/** Cada campo nos estados estáticos; hover e foco aparecem na interação. */
export const Estados: Historia = {
  render: () => (
    <div style={grade}>
      <CampoDeTexto rotulo="Patrimônio" placeholder="Ex.: PAT-0001" />
      <CampoDeTexto
        rotulo="Número de série"
        obrigatorio
        descricao="Como aparece na etiqueta do fabricante."
      />
      <CampoDeTexto rotulo="Hostname" defaultValue="pop-ti-042" isDisabled />
      <CampoDeTexto
        rotulo="Endereço IP"
        defaultValue="10.0.0.300"
        erro="Endereço IP fora do formato."
      />
      <Selecao rotulo="Situação" opcoes={situacoes} obrigatorio />
      <Selecao rotulo="Situação anterior" opcoes={situacoes} defaultSelectedKey="em-estoque" />
      <BuscaComSugestoes rotulo="Local" sugestoes={situacoes} placeholder="Buscar local" />
      <AreaDeTexto rotulo="Observações" placeholder="Detalhes para a equipe de TI" />
    </div>
  ),
};

/** Cenário da spec: enviar com obrigatório vazio mostra o erro em texto e leva o foco ao campo. */
export const EnvioComObrigatorioVazio: Historia = {
  render: ({ aoEnviar }) => (
    <Formulario
      onSubmit={(evento) => {
        evento.preventDefault();
        aoEnviar(Object.fromEntries(new FormData(evento.currentTarget)));
      }}
    >
      <CampoDeTexto name="patrimonio" rotulo="Patrimônio" obrigatorio />
      <Selecao name="situacao" rotulo="Situação" opcoes={situacoes} obrigatorio />
      <AreaDeTexto name="observacoes" rotulo="Observações" />
      <div>
        <Botao nivel="primario" type="submit">
          Salvar
        </Botao>
      </div>
    </Formulario>
  ),
  play: async ({ args, canvasElement }) => {
    const tela = within(canvasElement);
    const salvar = tela.getByRole('button', { name: 'Salvar' });
    await userEvent.click(salvar);

    const patrimonio = tela.getByRole('textbox', { name: 'Patrimônio' });
    await expect(patrimonio).toHaveFocus();
    await expect(patrimonio).toHaveAttribute('aria-invalid', 'true');
    await expect(patrimonio).toHaveAccessibleDescription('Preencha este campo.');
    await expect(tela.getByText('Escolha uma opção.')).toBeVisible();
    await expect(args.aoEnviar).not.toHaveBeenCalled();

    await userEvent.type(patrimonio, 'PAT-0001');
    await userEvent.click(tela.getByRole('button', { name: /Situação/ }));
    const corpo = within(canvasElement.ownerDocument.body);
    await userEvent.click(await corpo.findByRole('option', { name: 'Em uso' }));
    await userEvent.click(salvar);
    await waitFor(() =>
      expect(args.aoEnviar).toHaveBeenCalledWith(
        expect.objectContaining({ patrimonio: 'PAT-0001', situacao: 'em-uso' }),
      ),
    );
  },
};

/** A seleção funciona só com o teclado, e o foco volta ao gatilho depois da escolha. */
export const SelecaoPeloTeclado: Historia = {
  render: () => <Selecao rotulo="Situação" opcoes={situacoes} />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await userEvent.tab();
    const gatilho = tela.getByRole('button', { name: /Situação/ });
    await expect(gatilho).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    const corpo = within(canvasElement.ownerDocument.body);
    await corpo.findByRole('listbox');
    // Só aperta as setas quando o foco já entrou na lista (o painel pode ainda estar abrindo).
    await waitFor(() => expect(corpo.getByRole('option', { name: 'Em uso' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(gatilho).toHaveTextContent('Em estoque'));
    // O foco volta ao gatilho quando o painel termina de esmaecer.
    await waitFor(() => expect(gatilho).toHaveFocus());
    await expect(gatilho.querySelector('svg.lucide-check')).toBeNull();
  },
};

/**
 * Espera a página ficar ociosa: o React terminou o trabalho pendente. A caixa de combinação do
 * React Stately assenta a última letra digitada numa renderização de prioridade normal, e uma
 * tecla que chega antes dela (sob carga, o navegador atende a entrada primeiro) tem o efeito
 * desfeito: a seta foca a opção, mas o Enter grava o texto digitado.
 */
const ociosa = () => new Promise<void>((resolver) => requestIdleCallback(() => resolver()));

/** A busca sugere enquanto se digita e ignora acentos e maiúsculas. */
export const BuscaSemAcentos: Historia = {
  render: () => (
    <BuscaComSugestoes rotulo="Situação do ativo" sugestoes={situacoes} placeholder="Buscar" />
  ),
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Situação do ativo' });
    await userEvent.type(busca, 'manutencao');
    const sugestao = await within(canvasElement.ownerDocument.body).findByRole('option', {
      name: 'Em manutenção',
    });
    await expect(sugestao).toBeVisible();
    await ociosa();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(busca).toHaveValue('Em manutenção'));
  },
};

/**
 * Sem texto livre, a busca só aceita uma sugestão: um texto que não é de nenhuma volta, ao sair do
 * campo, à que estava escolhida.
 */
export const BuscaSoDasSugestoes: Historia = {
  render: () => (
    <BuscaComSugestoes
      rotulo="Situação do ativo"
      sugestoes={situacoes}
      aceitaTextoLivre={false}
      defaultSelectedKey="em-uso"
    />
  ),
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Situação do ativo' });
    await expect(busca).toHaveValue('Em uso');
    await userEvent.type(busca, ' e sucata');
    await ociosa();
    await userEvent.tab();
    await waitFor(() => expect(busca).toHaveValue('Em uso'));
  },
};

/** As contas que a API de mentira conhece: ela acha pelo nome, pelo usuário e pelo e-mail. */
const CONTAS = [
  { id: 'ana', nome: 'Ana Souza', email: 'ana.souza@empresa.com.br' },
  { id: 'anabela', nome: 'Anabela Reis', email: 'anabela.reis@empresa.com.br' },
  { id: 'bruno', nome: 'Bruno Costa', email: 'bruno.costa@empresa.com.br' },
];

/** Quanto a API de mentira demora: mais que a saída do painel, como numa rede de verdade. */
const ATRASO_DA_API = 400;

/** A busca de contas pela API: as sugestões chegam um pouco depois de cada letra. */
function BuscaDeContas() {
  const [sugestoes, definirSugestoes] = useState<OpcaoDeSelecao[]>([]);
  return (
    <BuscaComSugestoes
      rotulo="Quem fez"
      sugestoes={sugestoes}
      sugestoesDeFora
      onInputChange={(texto) => {
        const busca = texto.trim().toLowerCase();
        setTimeout(() => {
          definirSugestoes(
            busca
              ? CONTAS.filter((conta) =>
                  [conta.id, conta.nome.toLowerCase(), conta.email].some((campo) =>
                    campo.includes(busca),
                  ),
                ).map((conta) => ({ id: conta.id, rotulo: conta.nome }))
              : [],
          );
        }, ATRASO_DA_API);
      }}
    />
  );
}

/**
 * Com as sugestões vindas de fora, a busca mostra as que chegam, sem filtrar de novo: "ana.s"
 * acha Ana Souza pelo e-mail, embora o nome não tenha "ana.s".
 */
export const BuscaComSugestoesDeFora: Historia = {
  render: () => <BuscaDeContas />,
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Quem fez' });
    await userEvent.type(busca, 'ana.s');
    const tela = within(canvasElement.ownerDocument.body);
    // A lista abre quando as sugestões chegam, e o painel entra com uma transição curta.
    const ana = await tela.findByRole('option', { name: 'Ana Souza' });
    await waitFor(() => expect(ana).toBeVisible());
    // Cada tecla tem a sua resposta, e as de "a", "an" e "ana" também trazem Anabela: com a
    // digitação lenta, uma delas chega antes da de "ana.s", e a lista do meio aparece.
    await waitFor(() => expect(tela.queryByRole('option', { name: 'Anabela Reis' })).toBeNull());
    await ociosa();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(busca).toHaveValue('Ana Souza'));
    // A escolha muda o texto, e a API responde a ele depois: a lista não reabre.
    await new Promise((resolver) => setTimeout(resolver, ATRASO_DA_API + 300));
    await expect(tela.queryByRole('listbox')).toBeNull();
  },
};

/** Quem sai do campo antes de as sugestões chegarem não vê a lista abrir sozinha. */
export const SugestoesDeForaDepoisDeSair: Historia = {
  render: () => <BuscaDeContas />,
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Quem fez' });
    await userEvent.type(busca, 'ana');
    await userEvent.tab();
    await new Promise((resolver) => setTimeout(resolver, ATRASO_DA_API + 300));
    await expect(within(canvasElement.ownerDocument.body).queryByRole('listbox')).toBeNull();
  },
};

/**
 * A busca de contas que guarda a escolhida entre as sugestões, para o campo mostrar o rótulo dela,
 * como o seletor de contas da Administração: a lista nova chega a cada renderização.
 */
function BuscaDeContasComAEscolhida() {
  const [encontradas, definirEncontradas] = useState<OpcaoDeSelecao[]>([]);
  const [escolhida, definirEscolhida] = useState<OpcaoDeSelecao | null>(null);
  const sugestoes =
    escolhida && !encontradas.some((conta) => conta.id === escolhida.id)
      ? [escolhida, ...encontradas]
      : [...encontradas];
  return (
    <BuscaComSugestoes
      rotulo="Conta"
      sugestoes={sugestoes}
      sugestoesDeFora
      aceitaTextoLivre={false}
      selectedKey={escolhida?.id ?? null}
      onSelectionChange={(chave) =>
        definirEscolhida(sugestoes.find((conta) => conta.id === chave) ?? null)
      }
      onInputChange={(texto) => {
        const busca = texto.trim().toLowerCase();
        definirEncontradas(
          busca && busca !== escolhida?.rotulo.toLowerCase()
            ? CONTAS.filter((conta) => conta.nome.toLowerCase().includes(busca)).map((conta) => ({
                id: conta.id,
                rotulo: conta.nome,
              }))
            : [],
        );
      }}
    />
  );
}

/** Escolhida a conta, a lista fecha e não reabre só porque a escolhida continua entre as sugestões. */
export const EscolhaFechaAsSugestoesDeFora: Historia = {
  render: () => <BuscaDeContasComAEscolhida />,
  play: async ({ canvasElement }) => {
    const busca = within(canvasElement).getByRole('combobox', { name: 'Conta' });
    const tela = within(canvasElement.ownerDocument.body);
    await userEvent.type(busca, 'bru');
    await userEvent.click(await tela.findByRole('option', { name: 'Bruno Costa' }));
    await waitFor(() => expect(busca).toHaveValue('Bruno Costa'));
    await new Promise((resolver) => setTimeout(resolver, 300));
    await expect(tela.queryByRole('listbox')).toBeNull();
    await expect(busca).toHaveFocus();
    // Digitar de novo volta a sugerir.
    await userEvent.type(busca, '{Backspace}');
    await expect(await tela.findByRole('option', { name: 'Bruno Costa' })).toBeTruthy();
  },
};

/** Linha com dois campos, para os cenários da linha de campos. */
function LinhaDeIdentificacao() {
  return (
    <LinhaDeCampos>
      <CampoDeTexto rotulo="Patrimônio" defaultValue="PAT-00412" />
      <CampoDeTexto rotulo="Número de série" />
    </LinhaDeCampos>
  );
}

const camposDaLinha = (tela: ReturnType<typeof within>) => ({
  patrimonio: tela.getByRole('textbox', { name: 'Patrimônio' }),
  serie: tela.getByRole('textbox', { name: 'Número de série' }),
});

/** Cenário da spec: num formulário de 960 px, os campos da linha ficam lado a lado, iguais. */
export const LinhaNumFormularioLargo: Historia = {
  globals: { viewport: { value: 'notebook1366', isRotated: false } },
  render: () => (
    <Formulario aria-label="Identificação">
      <LinhaDeIdentificacao />
    </Formulario>
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    const formulario = tela.getByRole('form', { name: 'Identificação' });
    await expect(formulario.getBoundingClientRect().width).toBe(960);
    const { patrimonio, serie } = camposDaLinha(tela);
    await expect(arranjoDe(patrimonio, serie)).toBe('lado a lado');
    await expect(serie.getBoundingClientRect().width).toBeCloseTo(
      patrimonio.getBoundingClientRect().width,
      1,
    );
  },
};

/**
 * O formulário com a lista das etapas e a imagem ao lado dos campos tira o limite dele pela
 * variável, e o limite fica na área dos campos (change janela-rolavel-e-campos-em-colunas).
 */
export const FormularioSemLimite: Historia = {
  globals: { viewport: { value: 'notebook1366', isRotated: false } },
  render: () => (
    <Formulario
      aria-label="Identificação"
      style={{ '--largura-maxima-do-formulario': 'none' } as CSSProperties}
    >
      <LinhaDeIdentificacao />
    </Formulario>
  ),
  play: async ({ canvasElement }) => {
    const formulario = within(canvasElement).getByRole('form', { name: 'Identificação' });
    await expect(formulario.getBoundingClientRect().width).toBeGreaterThan(960);
  },
};

/** Cenário da spec: na gaveta, numa tela de 1920 px, a mesma linha põe um campo abaixo do outro. */
export const LinhaNumaGaveta: Historia = {
  globals: { viewport: { value: 'tela1920', isRotated: false } },
  render: () => (
    <Gaveta titulo="PAT-00412 · HP LaserJet M404dn" gatilho={<Botao>Editar</Botao>}>
      <Formulario aria-label="Identificação">
        <LinhaDeIdentificacao />
      </Formulario>
    </Gaveta>
  ),
  play: async ({ canvasElement }) => {
    await expect(window.innerWidth).toBe(1920);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Editar' }));
    const gaveta = await within(document.body).findByRole('dialog', {
      name: 'PAT-00412 · HP LaserJet M404dn',
    });
    const { patrimonio, serie } = camposDaLinha(within(gaveta));
    await expect(arranjoDe(patrimonio, serie)).toBe('um abaixo do outro');
  },
};
