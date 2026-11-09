import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { type OrdemDeTeste, ordem, resolvida, servidorDasOrdens } from '../../../teste/ordens.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { ALMOXARIFADO } from '../../../teste/solicitacoes.ts';

// As ações de cada OS na gaveta, pela linha da lista (spec modulo-operacao, "Tela das ordens de
// serviço" e "Formulários das ordens de serviço"; spec ordens-de-servico, "Situação e histórico da
// OS", "Fornecedor da OS" e "Peças da OS"; change p4e-ordens-de-servico, design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const FONTE = { id: 'fnt65w', codigo: 'FNT-65W', nome: 'Fonte 65W', tipo: 'peca', cor: null };
const TONER = { id: 'cf258a', codigo: 'CF258A', nome: 'HP 58A', tipo: 'toner', cor: 'preto' };

const saldo = (quantidade: number) => ({
  id: 'saldo-almoxarifado',
  consumivel: { ...FONTE, situacao: 'ativo', abrir: true },
  local: ALMOXARIFADO,
  saldo: quantidade,
  minimo: 0,
  situacao: quantidade > 0 ? 'em-estoque' : 'sem-estoque',
  abaixoDesde: null,
  permite: { movimentar: true },
});

const conflito = (campos: Record<string, string>) =>
  Response.json(
    {
      type: 'urn:grafite:problema:conflito',
      title: 'Conflito',
      status: 409,
      detail: Object.values(campos)[0],
      codigoDeRastreio: 'R7K2-9QXM',
      campos,
    },
    { status: 409 },
  );

/** As OS e as ações delas no servidor do teste, que guarda os pedidos. */
function servidorDasAcoes(
  ordens: OrdemDeTeste[],
  { saldos = [saldo(3)], semSaldoNaPeca = false } = {},
) {
  const { servidor: daLista, estado } = servidorDasOrdens(ordens);
  const corpos: Record<string, unknown[]> = {};
  const acao =
    (nome: string, depois: (o: OrdemDeTeste) => Partial<OrdemDeTeste>) =>
    async (pedido: Request) => {
      const numero = Number(new URL(pedido.url).pathname.split('/')[3]);
      const corpo = await pedido.json();
      corpos[`${nome} ${numero}`] = [...(corpos[`${nome} ${numero}`] ?? []), corpo];
      if (nome === 'peca' && semSaldoNaPeca) {
        return conflito({ quantidade: 'O saldo do FNT-65W em Jundiaí › Almoxarifado é 0.' });
      }
      const atual = estado.ordens.find((o) => o.numero === numero);
      if (!atual) throw new Error(`A OS ${numero} não está no servidor.`);
      const nova = { ...atual, ...depois(atual) };
      estado.ordens = estado.ordens.map((o) => (o.numero === numero ? nova : o));
      return Response.json(nova);
    };
  const servidor: ServidorDeTeste = {
    ...daLista,
    'GET /api/estoque/saldos': () =>
      Response.json({
        itens: saldos,
        total: saldos.length,
        proximo: null,
        permite: { movimentar: true },
      }),
    'GET /api/consumiveis/escolha': () => Response.json({ consumiveis: [TONER, FONTE] }),
    'GET /api/fornecedores/escolha': () =>
      Response.json({ fornecedores: [{ id: 'dell', nome: 'Dell Assistência', cnpj: null }] }),
  };
  for (const o of ordens) {
    servidor[`POST /api/ordens/${o.numero}/situacao`] = acao('situacao', () => ({}));
    servidor[`POST /api/ordens/${o.numero}/pecas`] = acao('peca', () => ({}));
    servidor[`POST /api/ordens/${o.numero}/resolucao`] = acao('resolucao', () => ({
      situacao: 'resolvida',
    }));
    servidor[`POST /api/ordens/${o.numero}/reabertura`] = acao('reabertura', () => ({
      situacao: 'em-atendimento',
    }));
    servidor[`POST /api/ordens/${o.numero}/encerramento`] = acao('encerramento', () => ({
      situacao: 'encerrada',
    }));
  }
  return { servidor, corpos, estado };
}

const ATENDE_E_MOVIMENTA = naOrganizacao(
  'ordens.ver',
  'ordens.atender',
  'estoque.ver',
  'estoque.movimentar',
);

function abrir(servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[] = ATENDE_E_MOVIMENTA) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/operacao/ordens?situacao=todas'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const gaveta = (titulo: string) => screen.findByRole('dialog', { name: titulo });

async function opcoesDoMenu(numero: number) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da OS ${numero}` }));
  return (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
}

async function agir(numero: number, acao: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da OS ${numero}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: acao }));
}

/** Escolhe a opção de uma busca com sugestões. */
async function escolherNaBusca(dentro: HTMLElement, rotulo: string, busca: string, opcao: string) {
  const campo = within(dentro).getByRole('combobox', { name: rotulo });
  campo.focus();
  fireEvent.change(campo, { target: { value: busca } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('as ações da OS na linha', () => {
  it('a em aberto oferece mudar, lançar peça, resolver, corrigir e encerrar sem resolver; a resolvida, reabrir e encerrar', async () => {
    const { servidor } = servidorDasAcoes([
      ordem(12, { situacao: 'em-atendimento' }),
      resolvida(11),
      ordem(10, { situacao: 'encerrada', encerradaPor: { id: 'carla', nome: 'Carla Dias' } }),
    ]);
    abrir(servidor);
    expect(await opcoesDoMenu(12)).toEqual([
      'Mudar a situação',
      'Lançar peça',
      'Resolver',
      'Corrigir',
      'Encerrar sem resolver',
    ]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(await opcoesDoMenu(11)).toEqual(['Reabrir', 'Encerrar']);
    expect(screen.queryByRole('button', { name: 'Ações da OS 10' })).toBeNull();
  });

  it('Aguardando a peça: a mudança vai com a observação e volta com "Situação mudada."', async () => {
    const { servidor, corpos } = servidorDasAcoes([ordem(12, { situacao: 'em-atendimento' })]);
    abrir(servidor);
    await agir(12, 'Mudar a situação');
    const formulario = await gaveta('Mudar a situação da OS 12');
    expect(
      within(formulario)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Aguardando peça', 'Aguardando fornecedor']);
    fireEvent.click(within(formulario).getByRole('radio', { name: 'Aguardando peça' }));
    fireEvent.change(within(formulario).getByRole('textbox', { name: 'Observação' }), {
      target: { value: 'Fonte pedida ao almoxarifado' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Mudar' }));
    await waitFor(() => expect(avisos()).toContain('Situação mudada.'));
    expect(corpos['situacao 12']).toEqual([
      { situacao: 'aguardando-peca', observacao: 'Fonte pedida ao almoxarifado' },
    ]);
  });

  it('Notebook na assistência: a Aguardando fornecedor pede o fornecedor e leva o número da OS dele', async () => {
    const { servidor, corpos } = servidorDasAcoes([ordem(12)]);
    abrir(servidor);
    await agir(12, 'Mudar a situação');
    const formulario = await gaveta('Mudar a situação da OS 12');
    fireEvent.click(within(formulario).getByRole('button', { name: 'Mudar' }));
    expect(await within(formulario).findByText('Escolha a situação.')).toBeTruthy();
    fireEvent.click(within(formulario).getByRole('radio', { name: 'Aguardando fornecedor' }));
    fireEvent.click(within(formulario).getByRole('button', { name: 'Mudar' }));
    expect(await within(formulario).findByText('Escolha o fornecedor.')).toBeTruthy();
    await escolherNaBusca(formulario, 'Fornecedor', 'dell', 'Dell Assistência');
    fireEvent.change(
      within(formulario).getByRole('textbox', { name: 'Número da OS no fornecedor' }),
      {
        target: { value: 'DL-5521' },
      },
    );
    fireEvent.click(within(formulario).getByRole('button', { name: 'Mudar' }));
    await waitFor(() => expect(avisos()).toContain('Situação mudada.'));
    expect(corpos['situacao 12']).toEqual([
      { situacao: 'aguardando-fornecedor', observacao: null, fornecedor: 'dell', os: 'DL-5521' },
    ]);
  });

  it('Peça pela gaveta: as Peças vêm primeiro, a origem de maior saldo já escolhida, e volta com "Peça lançada."', async () => {
    const { servidor, corpos } = servidorDasAcoes([ordem(12, { situacao: 'em-atendimento' })]);
    abrir(servidor);
    await agir(12, 'Lançar peça');
    const formulario = await gaveta('Lançar peça na OS 12');
    const campo = within(formulario).getByRole('combobox', { name: 'Consumível' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'f' } });
    const opcoes = (await screen.findAllByRole('option')).map((opcao) => opcao.textContent);
    expect(opcoes[0]).toContain('FNT-65W · Fonte 65W');
    fireEvent.click(await screen.findByRole('option', { name: 'FNT-65W · Fonte 65W' }));
    const origem = await within(formulario).findByRole('button', { name: /Local de origem/ });
    await waitFor(() => expect(origem.textContent).toContain('Jundiaí › Almoxarifado · saldo 3'));
    fireEvent.change(within(formulario).getByRole('textbox', { name: 'Quantidade' }), {
      target: { value: '1' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    await waitFor(() => expect(avisos()).toContain('Peça lançada.'));
    expect(corpos['peca 12']).toEqual([
      { consumivel: 'fnt65w', local: 'almoxarifado', quantidade: 1 },
    ]);
  });

  it('Peça sem saldo: a recusa da saída fica na quantidade, e sem saldo nenhum a gaveta avisa', async () => {
    const { servidor } = servidorDasAcoes([ordem(12)], { semSaldoNaPeca: true });
    abrir(servidor);
    await agir(12, 'Lançar peça');
    const formulario = await gaveta('Lançar peça na OS 12');
    await escolherNaBusca(formulario, 'Consumível', 'fnt', 'FNT-65W · Fonte 65W');
    await within(formulario).findByRole('button', { name: /Local de origem/ });
    fireEvent.change(within(formulario).getByRole('textbox', { name: 'Quantidade' }), {
      target: { value: '1' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Lançar' }));
    expect(
      await within(formulario).findByText('O saldo do FNT-65W em Jundiaí › Almoxarifado é 0.'),
    ).toBeTruthy();

    cleanup();
    const { servidor: semSaldo } = servidorDasAcoes([ordem(12)], { saldos: [] });
    abrir(semSaldo);
    await agir(12, 'Lançar peça');
    const outra = await gaveta('Lançar peça na OS 12');
    await escolherNaBusca(outra, 'Consumível', 'fnt', 'FNT-65W · Fonte 65W');
    expect(
      await within(outra).findByText('Sem saldo nos locais em que você movimenta o estoque.'),
    ).toBeTruthy();
  });

  it('Resolvida reaberta: a resolução pede o que foi feito, e a reabertura, o motivo', async () => {
    const { servidor, corpos } = servidorDasAcoes([
      ordem(12, { situacao: 'em-atendimento' }),
      resolvida(11),
    ]);
    abrir(servidor);
    await agir(12, 'Resolver');
    const resolucao = await gaveta('Resolver a OS 12');
    fireEvent.click(within(resolucao).getByRole('button', { name: 'Resolver' }));
    expect(await within(resolucao).findByText('Descreva o que foi feito.')).toBeTruthy();
    fireEvent.change(within(resolucao).getByRole('textbox', { name: 'O que foi feito' }), {
      target: { value: 'Fonte trocada' },
    });
    fireEvent.click(within(resolucao).getByRole('button', { name: 'Resolver' }));
    await waitFor(() => expect(avisos()).toContain('OS resolvida.'));
    expect(corpos['resolucao 12']).toEqual([{ solucao: 'Fonte trocada' }]);

    await agir(11, 'Reabrir');
    const reabertura = await gaveta('Reabrir a OS 11');
    fireEvent.click(within(reabertura).getByRole('button', { name: 'Reabrir' }));
    expect(await within(reabertura).findByText('Informe o motivo da reabertura.')).toBeTruthy();
    fireEvent.change(within(reabertura).getByRole('textbox', { name: 'Motivo da reabertura' }), {
      target: { value: 'Voltou a desligar sozinho' },
    });
    fireEvent.click(within(reabertura).getByRole('button', { name: 'Reabrir' }));
    await waitFor(() => expect(avisos()).toContain('OS reaberta.'));
    expect(corpos['reabertura 11']).toEqual([{ motivo: 'Voltou a desligar sozinho' }]);
  });

  it('OS aberta por engano: o encerramento sem resolver pede o motivo, e o da resolvida, a confirmação', async () => {
    const { servidor, corpos } = servidorDasAcoes([ordem(15), resolvida(11)]);
    abrir(servidor);
    await agir(15, 'Encerrar sem resolver');
    const semResolver = await gaveta('Encerrar sem resolver a OS 15');
    fireEvent.click(within(semResolver).getByRole('button', { name: 'Encerrar' }));
    expect(await within(semResolver).findByText('Informe o motivo do encerramento.')).toBeTruthy();
    fireEvent.change(within(semResolver).getByRole('textbox', { name: 'Motivo do encerramento' }), {
      target: { value: 'Aberta no ativo errado' },
    });
    fireEvent.click(within(semResolver).getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(avisos()).toContain('OS encerrada.'));
    expect(corpos['encerramento 15']).toEqual([
      { semResolver: true, motivo: 'Aberta no ativo errado' },
    ]);

    await agir(11, 'Encerrar');
    const encerramento = await gaveta('Encerrar a OS 11');
    expect(within(encerramento).getByText(/não muda mais/)).toBeTruthy();
    fireEvent.click(within(encerramento).getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(corpos['encerramento 11']).toEqual([{ semResolver: false }]));
  });
});
