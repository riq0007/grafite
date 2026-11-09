import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { type OrdemDeTeste, ordem, servidorDasOrdens } from '../../../teste/ordens.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';
import { EXPEDICAO, NB0031 } from '../../../teste/solicitacoes.ts';

// A nova OS e a correção na gaveta (spec modulo-operacao, "Formulários das ordens de serviço";
// spec ordens-de-servico, "Ordem de serviço" e "Fornecedor da OS"; change p4e-ordens-de-servico,
// design, decisão 8).

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const ATENDE = naOrganizacao('ordens.ver', 'ordens.atender', 'ativos.ver');
const DELL = { id: 'dell', nome: 'Dell Assistência', abrir: false };

/** O servidor das OS com o que as gavetas pedem; a abertura e a correção guardam o corpo. */
function servidorDaGaveta(
  inicial: OrdemDeTeste[] = [],
  {
    abrirOrdem,
    corrigir,
  }: {
    abrirOrdem?: (corpo: unknown) => Response;
    corrigir?: (corpo: unknown) => Response;
  } = {},
) {
  const base = servidorDasOrdens(inicial);
  const corpos: { aberturas: unknown[]; correcoes: unknown[] } = { aberturas: [], correcoes: [] };
  const servidor: ServidorDeTeste = {
    ...base.servidor,
    'GET /api/ativos': () =>
      Response.json({ itens: [{ ...NB0031, local: EXPEDICAO }], total: 1, proximo: null }),
    'GET /api/ativos/nb0031/resumo': () => Response.json({ ...NB0031, local: EXPEDICAO }),
    'GET /api/fornecedores/escolha': () =>
      Response.json({ fornecedores: [{ id: 'dell', nome: 'Dell Assistência', cnpj: null }] }),
    'POST /api/ordens': async (pedido) => {
      const corpo = await pedido.json();
      corpos.aberturas.push(corpo);
      return abrirOrdem ? abrirOrdem(corpo) : Response.json(ordem(12), { status: 201 });
    },
    'PATCH /api/ordens/12': async (pedido) => {
      const corpo = await pedido.json();
      corpos.correcoes.push(corpo);
      return corrigir ? corrigir(corpo) : Response.json(ordem(12, corpo as Partial<OrdemDeTeste>));
    },
  };
  return { ...base, servidor, corpos };
}

function abrir(endereco: string, servidor: ServidorDeTeste, permissoes: PermissaoDaSessao[]) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
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
const texto = (dentro: HTMLElement, rotulo: string) =>
  within(dentro).getByRole('textbox', { name: rotulo }) as HTMLInputElement;

/** Escolhe a opção de uma busca com sugestões. */
async function escolherNaBusca(dentro: HTMLElement, rotulo: string, busca: string, opcao: string) {
  const campo = within(dentro).getByRole('combobox', { name: rotulo });
  campo.focus();
  fireEvent.change(campo, { target: { value: busca } });
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

/** Abre a ação da linha da OS pelo menu "Ações". */
async function agir(numero: number, acao: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da OS ${numero}` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: acao }));
}

describe('a nova ordem de serviço', () => {
  it('Nova OS pela busca: a gaveta abre pelo endereço, e a OS aberta volta com "OS 12 aberta."', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    const roteador = abrir('/operacao/ordens?nova=1', servidor, ATENDE);
    const formulario = await gaveta('Nova ordem de serviço');
    await escolherNaBusca(formulario, 'Ativo', 'nb-0031', 'Dell Latitude 5440 · NB-0031');
    fireEvent.change(texto(formulario, 'Problema'), { target: { value: ' Teclado falhando ' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Abrir a OS' }));
    await waitFor(() => expect(avisos()).toContain('OS 12 aberta.'));
    expect(corpos.aberturas).toEqual([{ ativo: 'nb0031', problema: 'Teclado falhando' }]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nova ordem de serviço' })).toBeNull(),
    );
    expect(roteador.state.location.search).toEqual({});
  });

  it('Nova OS pela ficha do ativo: o endereço traz o ativo no campo', async () => {
    const { servidor } = servidorDaGaveta();
    abrir('/operacao/ordens?nova=1&ativo=nb0031', servidor, ATENDE);
    const formulario = await gaveta('Nova ordem de serviço');
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Ativo' }) as HTMLInputElement).value,
      ).toBe('Dell Latitude 5440 · NB-0031'),
    );
  });

  it('OS sem o problema: a recusa fica no campo, com o foco nele, e nada é enviado', async () => {
    const { servidor, corpos } = servidorDaGaveta();
    abrir('/operacao/ordens?nova=1&ativo=nb0031', servidor, ATENDE);
    const formulario = await gaveta('Nova ordem de serviço');
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Ativo' }) as HTMLInputElement).value,
      ).not.toBe(''),
    );
    fireEvent.click(within(formulario).getByRole('button', { name: 'Abrir a OS' }));
    expect(await within(formulario).findByText('Descreva o problema.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(texto(formulario, 'Problema')));
    expect(corpos.aberturas).toEqual([]);
  });

  it('a recusa da API fica no campo dela', async () => {
    const { servidor } = servidorDaGaveta([], {
      abrirOrdem: () =>
        Response.json(
          {
            type: 'urn:grafite:problema:conflito',
            title: 'Conflito',
            status: 409,
            detail: 'O ativo escolhido está inativo.',
            codigoDeRastreio: 'R7K2-9QXM',
            campos: { ativo: 'O ativo escolhido está inativo.' },
          },
          { status: 409 },
        ),
    });
    abrir('/operacao/ordens?nova=1&ativo=nb0031', servidor, ATENDE);
    const formulario = await gaveta('Nova ordem de serviço');
    await waitFor(() =>
      expect(
        (within(formulario).getByRole('combobox', { name: 'Ativo' }) as HTMLInputElement).value,
      ).not.toBe(''),
    );
    fireEvent.change(texto(formulario, 'Problema'), { target: { value: 'Não liga' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Abrir a OS' }));
    expect(await within(formulario).findByText('O ativo escolhido está inativo.')).toBeTruthy();
  });

  it('a "Nova ordem de serviço" da tela abre a gaveta', async () => {
    const { servidor } = servidorDaGaveta([ordem(11)]);
    abrir('/operacao/ordens', servidor, ATENDE);
    fireEvent.click(await screen.findByRole('button', { name: 'Nova ordem de serviço' }));
    expect(await gaveta('Nova ordem de serviço')).toBeTruthy();
  });
});

describe('a correção da OS', () => {
  it('Problema corrigido: a gaveta traz o problema, e a correção volta com "OS corrigida."', async () => {
    const { servidor, corpos } = servidorDaGaveta([ordem(12, { problema: 'Teclado falhando' })]);
    abrir('/operacao/ordens', servidor, ATENDE);
    await agir(12, 'Corrigir');
    const formulario = await gaveta('Corrigir a OS 12');
    expect(within(formulario).getByText('OS 12 · NB-0031 · Dell Latitude 5440')).toBeTruthy();
    expect(texto(formulario, 'Problema').value).toBe('Teclado falhando');
    expect(within(formulario).queryByRole('combobox', { name: 'Fornecedor' })).toBeNull();
    fireEvent.change(texto(formulario, 'Problema'), {
      target: { value: 'Teclado e touchpad falhando' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Corrigir' }));
    await waitFor(() => expect(avisos()).toContain('OS corrigida.'));
    expect(corpos.correcoes).toEqual([{ problema: 'Teclado e touchpad falhando' }]);
  });

  it('Número da assistência informado depois: na OS com o fornecedor, a correção leva o número', async () => {
    const { servidor, corpos } = servidorDaGaveta([
      ordem(12, { situacao: 'aguardando-fornecedor', fornecedor: DELL }),
    ]);
    abrir('/operacao/ordens', servidor, ATENDE);
    await agir(12, 'Corrigir');
    const formulario = await gaveta('Corrigir a OS 12');
    expect(
      (within(formulario).getByRole('combobox', { name: 'Fornecedor' }) as HTMLInputElement).value,
    ).toBe('Dell Assistência');
    fireEvent.change(texto(formulario, 'Número da OS no fornecedor'), {
      target: { value: 'DL-5521' },
    });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Corrigir' }));
    await waitFor(() => expect(avisos()).toContain('OS corrigida.'));
    expect(corpos.correcoes).toEqual([{ problema: 'Não liga', fornecedor: 'dell', os: 'DL-5521' }]);
  });

  it('a correção recusa o problema vazio no campo', async () => {
    const { servidor, corpos } = servidorDaGaveta([ordem(12)]);
    abrir('/operacao/ordens', servidor, ATENDE);
    await agir(12, 'Corrigir');
    const formulario = await gaveta('Corrigir a OS 12');
    fireEvent.change(texto(formulario, 'Problema'), { target: { value: '  ' } });
    fireEvent.click(within(formulario).getByRole('button', { name: 'Corrigir' }));
    expect(await within(formulario).findByText('Descreva o problema.')).toBeTruthy();
    expect(corpos.correcoes).toEqual([]);
  });
});
