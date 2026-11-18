import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { BuscaComResultados, type ResultadoDaBuscaComResultados } from './BuscaComResultados.tsx';

// A busca com resultados (change chamados-da-ti, design, "O chamado aberto, o cabeçalho"): o
// "Buscar nos chamados" dos cabeçalhos, com a busca feita por fora.

const meta: Meta = {
  title: 'Componentes/Busca com resultados',
};
export default meta;

type Historia = StoryObj;

/** O número do chamado, montado no texto: "#1042" escrito direto parece uma cor ao verificador. */
const numero = (valor: number | string) => `#${valor}`;

const CHAMADOS: ResultadoDaBuscaComResultados[] = [
  {
    id: '1042',
    rotulo: `${numero(1042)} Impressora da Recepção manchando`,
    detalhe: 'Marina Rocha · Em atendimento',
  },
  {
    id: '1041',
    rotulo: `${numero(1041)} Sem acesso à pasta do Financeiro`,
    detalhe: 'Fernanda Rocha · Aguardando o colaborador',
  },
];

/** A busca de mentira: "10" acha os dois; "impressora", o primeiro; o resto, nenhum. */
function achar(termo: string): ResultadoDaBuscaComResultados[] {
  const texto = termo.trim().toLowerCase();
  if (texto.length < 2) return [];
  return CHAMADOS.filter((chamado) => chamado.rotulo.toLowerCase().includes(texto));
}

function Busca({ aoEscolher }: { aoEscolher: (id: string) => void }) {
  const [termo, definirTermo] = useState('');
  const resultados = achar(termo);
  const aviso =
    termo.trim().length >= 2 && resultados.length === 0 ? `Nenhum chamado com “${termo}”.` : null;
  return (
    <div style={{ width: 260 }}>
      <BuscaComResultados
        rotulo="Buscar nos chamados"
        termo={termo}
        aoMudarTermo={definirTermo}
        resultados={resultados}
        aviso={aviso}
        aoEscolher={aoEscolher}
      />
    </div>
  );
}

const corpo = (elemento: HTMLElement) => within(elemento.ownerDocument.body);

/** O primeiro resultado já vem escolhido: Enter o abre, e o campo se limpa. */
export const EnterAbreOPrimeiro: Historia = {
  render: () => {
    const Historia = () => {
      const [aberto, definirAberto] = useState<string | null>(null);
      return (
        <>
          <Busca aoEscolher={definirAberto} />
          <p>{aberto ? `Abriu o ${numero(aberto)}.` : 'Nenhum aberto.'}</p>
        </>
      );
    };
    return <Historia />;
  },
  play: async ({ canvasElement }) => {
    const campo = within(canvasElement).getByRole('combobox', { name: 'Buscar nos chamados' });
    await userEvent.type(campo, '10');
    const lista = await corpo(canvasElement).findByRole('listbox');
    await expect(within(lista).getAllByRole('option')).toHaveLength(2);
    await waitFor(() =>
      expect(campo).toHaveAttribute(
        'aria-activedescendant',
        within(lista).getAllByRole('option')[0]?.id,
      ),
    );
    await userEvent.keyboard('{Enter}');
    await expect(await within(canvasElement).findByText(`Abriu o ${numero(1042)}.`)).toBeVisible();
    await expect(campo).toHaveValue('');
  },
};

/** Sem resultado, a lista diz o termo. */
export const SemResultado: Historia = {
  render: () => <Busca aoEscolher={() => {}} />,
  play: async ({ canvasElement }) => {
    const campo = within(canvasElement).getByRole('combobox', { name: 'Buscar nos chamados' });
    await userEvent.type(campo, 'toner');
    await expect(
      await corpo(canvasElement).findByText('Nenhum chamado com “toner”.'),
    ).toBeVisible();
  },
};
