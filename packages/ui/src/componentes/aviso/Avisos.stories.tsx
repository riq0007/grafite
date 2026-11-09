import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { comTelaPorTras } from '../../teste/tela.tsx';
import { Botao } from '../botao/Botao.tsx';
import { avisar, criarFilaDeAvisos } from './avisos.ts';
import { RegiaoDeAvisos } from './RegiaoDeAvisos.tsx';

interface Args {
  aoReconhecer: () => void;
  aoAdiar: () => void;
  aoAbrir: () => void;
  aoAtualizar: () => void;
}

const meta: Meta<Args> = {
  title: 'Componentes/Aviso',
  args: { aoReconhecer: fn(), aoAdiar: fn(), aoAbrir: fn(), aoAtualizar: fn() },
};
export default meta;

type Historia = StoryObj<Args>;

/** Nas histórias o temporário some em 800 ms; os 6 s reais são cobertos pelo teste unitário. */
const DURACAO_NA_DEMONSTRACAO = 800;

function Demonstracao({ aoReconhecer, aoAdiar, aoAbrir, aoAtualizar }: Args) {
  const [fila] = useState(() =>
    criarFilaDeAvisos({ duracaoDoTemporario: DURACAO_NA_DEMONSTRACAO }),
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--esp-2)' }}>
      <Botao
        onPress={() =>
          avisar(
            { situacao: 'sucesso', titulo: 'Ativo salvo', descricao: 'PAT-00412 atualizado.' },
            fila,
          )
        }
      >
        Sucesso
      </Botao>
      <Botao onPress={() => avisar({ situacao: 'info', titulo: 'Sincronização concluída' }, fila)}>
        Informação
      </Botao>
      <Botao
        onPress={() =>
          avisar(
            {
              situacao: 'atencao',
              titulo: 'Toner baixo na HP M404',
              descricao: 'Restam 8% no cartucho preto.',
            },
            fila,
          )
        }
      >
        Atenção
      </Botao>
      <Botao
        onPress={() =>
          avisar(
            {
              situacao: 'critico',
              titulo: 'Switch do CPD sem resposta',
              descricao: 'Aruba 2930F · Rack A · desde 14:02',
              aoReconhecer,
              aoAdiar,
            },
            fila,
          )
        }
      >
        Crítico
      </Botao>
      <Botao
        onPress={() =>
          avisar(
            {
              situacao: 'info',
              titulo: 'Contrato vence em 30 dias',
              descricao: 'Impressoras · Almoxarifado',
              aoAbrir,
            },
            fila,
          )
        }
      >
        Informação com endereço
      </Botao>
      <Botao
        onPress={() =>
          avisar({ situacao: 'critico', titulo: 'Coletor sem contato há 10 min' }, fila)
        }
      >
        Crítico sem ações
      </Botao>
      <Botao
        onPress={() =>
          avisar(
            {
              situacao: 'info',
              titulo: 'Nova versão do Grafite',
              persistente: true,
              acao: { rotulo: 'Atualizar', aoEscolher: aoAtualizar },
            },
            fila,
          )
        }
      >
        Versão nova
      </Botao>
      <RegiaoDeAvisos fila={fila} />
    </div>
  );
}

const corpoDe = (elemento: HTMLElement) => within(elemento.ownerDocument.body);
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** Tira o ponteiro e o foco da região: com eles lá, a contagem dos temporários fica pausada. */
async function tirarDaRegiao() {
  await userEvent.unhover(within(document.body).getByRole('region', { name: 'Avisos' }));
  (document.activeElement as HTMLElement | null)?.blur();
}

export const Demonstracao_: Historia = {
  name: 'Demonstração',
  render: (args) => <Demonstracao {...args} />,
};

/** O aviso da versão nova como o app o mostra, já na tela desde a abertura da história. */
function AvisoDaVersaoNova({ aoAtualizar }: Args) {
  const [fila] = useState(() => {
    const nova = criarFilaDeAvisos();
    avisar(
      {
        situacao: 'info',
        titulo: 'Nova versão do Grafite',
        descricao: 'Atualizar recarrega a página na versão nova.',
        persistente: true,
        acao: { rotulo: 'Atualizar', aoEscolher: aoAtualizar },
      },
      nova,
    );
    return nova;
  });
  return <RegiaoDeAvisos fila={fila} />;
}

/** A versão nova, persistente, com "Atualizar" antes de "Fechar": a referência da regressão visual. */
export const VersaoNova: Historia = {
  parameters: { layout: 'fullscreen' },
  decorators: [comTelaPorTras],
  render: (args) => <AvisoDaVersaoNova {...args} />,
};

/** O temporário some sozinho depois do tempo definido. */
export const TemporarioSomeSozinho: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Atenção' }));
    await corpo.findByText('Toner baixo na HP M404');
    await waitFor(() => expect(corpo.queryByText('Toner baixo na HP M404')).toBeNull(), {
      timeout: 2000,
    });
  },
};

/** Cenário da spec: com o ponteiro sobre o aviso, a contagem pausa até o ponteiro sair. */
export const PausaNoHover: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Atenção' }));
    const titulo = await corpo.findByText('Toner baixo na HP M404');
    await userEvent.hover(titulo);
    await esperar(DURACAO_NA_DEMONSTRACAO + 500);
    await expect(corpo.queryByText('Toner baixo na HP M404')).not.toBeNull();
    await userEvent.unhover(titulo);
    await waitFor(() => expect(corpo.queryByText('Toner baixo na HP M404')).toBeNull(), {
      timeout: 2000,
    });
  },
};

/** Cenário da spec: o crítico fica até alguém reconhecer, adiar ou fechar. */
export const CriticoFicaAteAlguemAgir: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ args, canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const disparar = () =>
      userEvent.click(within(canvasElement).getByRole('button', { name: 'Crítico' }));
    const sumiu = () =>
      waitFor(() => expect(corpo.queryByText('Switch do CPD sem resposta')).toBeNull());

    await disparar();
    await corpo.findByText('Switch do CPD sem resposta');
    await esperar(DURACAO_NA_DEMONSTRACAO + 500);
    const aviso = corpo.getByRole('alertdialog', { name: /Switch do CPD sem resposta/ });
    await expect(within(aviso).getByText('Crítico')).toBeVisible();
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reconhecer' }));
    await sumiu();
    await expect(args.aoReconhecer).toHaveBeenCalledTimes(1);

    await disparar();
    await userEvent.click(await corpo.findByRole('button', { name: 'Adiar' }));
    await sumiu();
    await expect(args.aoAdiar).toHaveBeenCalledTimes(1);

    await disparar();
    const deNovo = await corpo.findByRole('alertdialog', { name: /Switch do CPD sem resposta/ });
    await userEvent.click(within(deNovo).getByRole('button', { name: 'Fechar' }));
    await sumiu();
  },
};

/** O adiar com o tempo no rótulo, como "Adiar 15 min" nas notificações dos alertas. */
function AvisoComAdiar({ aoAdiar }: Args) {
  const [fila] = useState(() => {
    const nova = criarFilaDeAvisos();
    avisar(
      {
        situacao: 'critico',
        titulo: 'Black Toner Cartridge em 8%',
        aoAdiar,
        rotuloDoAdiar: 'Adiar 15 min',
      },
      nova,
    );
    return nova;
  });
  return <RegiaoDeAvisos fila={fila} />;
}

export const AdiarComRotulo: Historia = {
  render: (args) => <AvisoComAdiar {...args} />,
  play: async ({ args, canvasElement }) => {
    const aviso = await corpoDe(canvasElement).findByRole('alertdialog', {
      name: /Black Toner Cartridge em 8%/,
    });
    await userEvent.click(within(aviso).getByRole('button', { name: 'Adiar 15 min' }));
    await expect(args.aoAdiar).toHaveBeenCalledOnce();
  },
};

/** No máximo três avisos na tela; os demais esperam a vez. */
export const NoMaximoTres: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const botao = within(canvasElement).getByRole('button', { name: 'Informação' });
    for (let i = 0; i < 5; i++) await userEvent.click(botao);
    await waitFor(() => expect(corpo.getAllByText('Sincronização concluída')).toHaveLength(3));
    await expect(corpo.getByRole('region', { name: 'Avisos' })).toBeVisible();
  },
};

/** Um crítico nunca sai da tela por causa de outro aviso: saem os temporários mais antigos. */
export const CriticoFicaEntreOsTres: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const tela = within(canvasElement);
    await userEvent.click(tela.getByRole('button', { name: 'Crítico' }));
    await userEvent.click(tela.getByRole('button', { name: 'Atenção' }));
    for (let i = 0; i < 3; i++) {
      await userEvent.click(tela.getByRole('button', { name: 'Informação' }));
    }
    await waitFor(() => expect(corpo.getAllByText('Sincronização concluída')).toHaveLength(2));
    await expect(corpo.getByText('Switch do CPD sem resposta')).toBeInTheDocument();
    await expect(corpo.queryByText('Toner baixo na HP M404')).toBeNull();
  },
};

/**
 * Com três críticos na tela, o aviso que chega espera; ele aparece quando um crítico sai, e só
 * então começa a contar o tempo.
 */
export const TempoComecaAoAparecer: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    const tela = within(canvasElement);
    for (let i = 0; i < 3; i++)
      await userEvent.click(tela.getByRole('button', { name: 'Crítico' }));
    await userEvent.click(tela.getByRole('button', { name: 'Atenção' }));
    await esperar(DURACAO_NA_DEMONSTRACAO + 400);
    await expect(corpo.queryByText('Toner baixo na HP M404')).toBeNull();
    const [primeiro] = corpo.getAllByRole('alertdialog', { name: /Switch do CPD sem resposta/ });
    await userEvent.click(within(primeiro as HTMLElement).getByRole('button', { name: 'Fechar' }));
    await corpo.findByText('Toner baixo na HP M404');
    await tirarDaRegiao();
    await esperar(DURACAO_NA_DEMONSTRACAO / 2);
    await expect(corpo.queryByText('Toner baixo na HP M404')).not.toBeNull();
    await waitFor(() => expect(corpo.queryByText('Toner baixo na HP M404')).toBeNull(), {
      timeout: 2000,
    });
  },
};

/** "Abrir" leva ao registro e fecha o aviso. */
export const AbrirLevaAoRegistro: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ args, canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Informação com endereço' }),
    );
    await userEvent.click(await corpo.findByRole('button', { name: 'Abrir' }));
    await expect(args.aoAbrir).toHaveBeenCalledOnce();
    await waitFor(() => expect(corpo.queryByText('Contrato vence em 30 dias')).toBeNull());
  },
};

/** Um crítico sem as ações de reconhecer e adiar mostra só o fechar, sem botões que não fazem nada. */
export const CriticoSemAcoes: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Crítico sem ações' }));
    const aviso = await corpo.findByRole('alertdialog', { name: /Coletor sem contato/ });
    await expect(within(aviso).queryByRole('button', { name: 'Reconhecer' })).toBeNull();
    await expect(within(aviso).queryByRole('button', { name: 'Adiar' })).toBeNull();
    // Espera o fim da animação de entrada, que começa na opacidade zero.
    await waitFor(() =>
      expect(within(aviso).getByRole('button', { name: 'Fechar' })).toBeVisible(),
    );
  },
};

/** A região fica acima das camadas modais (busca, gaveta e prévia). */
export const AcimaDasCamadasModais: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Informação' }));
    const regiao = await corpoDe(canvasElement).findByRole('region', { name: 'Avisos' });
    await expect(Number(getComputedStyle(regiao).zIndex)).toBeGreaterThanOrEqual(60);
  },
};

/** Cenário da spec: o persistente de Informação fica além do tempo, até alguém agir ou fechar. */
export const PersistenteDeInformacao: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Versão nova' }));
    await corpo.findByText('Nova versão do Grafite');
    await tirarDaRegiao();
    await esperar(DURACAO_NA_DEMONSTRACAO + 500);
    const aviso = corpo.getByRole('alertdialog', { name: /Nova versão do Grafite/ });
    await expect(within(aviso).getByText('Informação')).toBeVisible();
    await userEvent.click(within(aviso).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(corpo.queryByText('Nova versão do Grafite')).toBeNull());
  },
};

/**
 * Cenário da spec: a ação com nome próprio é o botão primário, antes de "Fechar"; escolhida, ela
 * acontece e o aviso sai da tela.
 */
export const AcaoComNomeProprio: Historia = {
  render: (args) => <Demonstracao {...args} />,
  play: async ({ args, canvasElement }) => {
    const corpo = corpoDe(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Versão nova' }));
    const aviso = await corpo.findByRole('alertdialog', { name: /Nova versão do Grafite/ });
    const atualizar = within(aviso).getByRole('button', { name: 'Atualizar' });
    const fechar = within(aviso).getByRole('button', { name: 'Fechar' });
    await expect(atualizar).toHaveAttribute('data-nivel', 'primario');
    await expect(
      atualizar.compareDocumentPosition(fechar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(within(aviso).queryByRole('button', { name: 'Abrir' })).toBeNull();
    await userEvent.click(atualizar);
    await expect(args.aoAtualizar).toHaveBeenCalledOnce();
    await waitFor(() => expect(corpo.queryByText('Nova versão do Grafite')).toBeNull());
  },
};
