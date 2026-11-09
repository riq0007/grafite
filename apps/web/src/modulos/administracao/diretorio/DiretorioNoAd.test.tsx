// As abas Usuários e Grupos do Diretório (spec diretorio-ad, "Gerência dos usuários do AD",
// "Gerência dos grupos do AD" e "Tela do diretório"; change integracao-ad-ldap): o diretório não
// configurado, a busca, o liberar o acesso, a conta desativada, a senha pelo LDAPS e os membros de
// um grupo, com o "Tirar" e o "Incluir membro".
import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });
  localStorage.clear();
});

type Estado = components['schemas']['EstadoDoDiretorio'];
type Usuario = components['schemas']['UsuarioNoDiretorio'];

const TECNICOS = { id: '0199d3a0-0000-7000-8000-00000000a001', nome: 'Técnicos' };
const SUPORTE = 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local';
const JOAO_DN = 'CN=João Lima,OU=Usuarios,DC=empresa,DC=local';
const MARIANA_DN = 'CN=Mariana Alves,OU=Usuarios,DC=empresa,DC=local';
const ANA_DN = 'CN=Ana Souza,OU=Usuarios,DC=empresa,DC=local';

const CONFIGURADO: Estado = {
  diretorio: {
    servidor: 'ldaps://dc01.empresa.local',
    baseDn: 'DC=empresa,DC=local',
    conta: { id: '0199d3a0-0000-7000-8000-00000000d001', nome: 'Conta do Grafite no AD' },
    atributoDoUsuario: 'sAMAccountName',
    filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
    conferirCertificado: true,
    acDoServidor: null,
    ligado: true,
  },
  mapeamentos: [
    {
      id: '0199d3a0-0000-7000-8000-00000000b001',
      grupoDn: SUPORTE,
      nomeNoAd: 'TI-Suporte',
      grupo: TECNICOS,
    },
  ],
  grupos: [TECNICOS],
};

const usuario = (dn: string, nome: string, login: string, mudancas: Partial<Usuario> = {}) => ({
  dn,
  usuario: login,
  nome,
  email: null,
  ativa: true,
  grupos: [],
  ...mudancas,
});

const JOAO = usuario(JOAO_DN, 'João Lima', 'joao.lima');
const MARIANA = usuario(MARIANA_DN, 'Mariana Alves', 'mariana.alves', {
  grupos: [{ dn: SUPORTE, nome: 'TI-Suporte', mapeadoPara: TECNICOS }],
});

function abrir(servidor: ServidorDeTeste) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/diretorio'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(naOrganizacao('diretorio.administrar'), {
        'GET /api/diretorio/logins': () => Response.json({ logins: [], motivo: null }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

async function abrirAba(nome: string) {
  fireEvent.click(await screen.findByRole('tab', { name: nome }));
}

async function buscar(rotulo: RegExp, termo: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: rotulo }), {
    target: { value: termo },
  });
  const formulario = screen.getByRole('textbox', { name: rotulo }).closest('form');
  if (!formulario) throw new Error('A busca não está num formulário.');
  fireEvent.click(within(formulario).getByRole('button', { name: 'Buscar no AD' }));
}

async function escolher(rotulo: RegExp, opcao: string) {
  fireEvent.click(await screen.findByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('a aba Usuários', () => {
  it('Diretório não configurado: diz isso e leva à Configuração', async () => {
    abrir({
      'GET /api/diretorio': () =>
        Response.json({ diretorio: null, mapeamentos: [], grupos: [TECNICOS] }),
    });
    await abrirAba('Usuários');
    expect(await screen.findByText('O diretório ainda não foi configurado.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar o diretório' }));
    expect(screen.getByRole('tab', { name: 'Configuração' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('Acesso liberado pelo Grafite: busca o João e o inclui no grupo mapeado', async () => {
    const pedidos: string[] = [];
    const corpos: unknown[] = [];
    abrir({
      'GET /api/diretorio': () => Response.json(CONFIGURADO),
      'GET /api/diretorio/usuarios': (pedido) => {
        pedidos.push(new URL(pedido.url).search);
        return Response.json({ usuarios: [JOAO] });
      },
      'POST /api/diretorio/membros': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json({ ...JOAO, grupos: MARIANA.grupos });
      },
    });
    await abrirAba('Usuários');
    await buscar(/^Buscar pelo usuário/, 'joao');
    const tabela = await screen.findByRole('grid', { name: 'Usuários do AD' });
    expect(pedidos).toEqual(['?busca=joao']);
    expect(within(tabela).getByText('Ativa')).toBeTruthy();
    expect(within(tabela).getByText('Nenhum grupo')).toBeTruthy();
    fireEvent.click(within(tabela).getByRole('button', { name: 'Liberar acesso de João Lima' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Liberar acesso de João Lima' });
    await escolher(/Grupo do AD/, 'TI-Suporte (entra como Técnicos)');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Liberar acesso' }));
    await waitFor(() =>
      expect(avisos()).toContain('João Lima agora é de TI-Suporte e entra como Técnicos.'),
    );
    expect(corpos).toEqual([{ usuarioDn: JOAO_DN, grupoDn: SUPORTE }]);
  });

  it('Conta desativada no AD: pede a confirmação e desativa', async () => {
    const corpos: unknown[] = [];
    abrir({
      'GET /api/diretorio': () => Response.json(CONFIGURADO),
      'GET /api/diretorio/usuarios': () => Response.json({ usuarios: [MARIANA] }),
      'POST /api/diretorio/usuarios/situacao': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json({ ...MARIANA, ativa: false });
      },
    });
    await abrirAba('Usuários');
    await buscar(/^Buscar pelo usuário/, 'mariana');
    const tabela = await screen.findByRole('grid', { name: 'Usuários do AD' });
    expect(within(tabela).getByText('TI-Suporte (Técnicos)')).toBeTruthy();
    expect(within(tabela).queryByRole('button', { name: /Liberar acesso/ })).toBeNull();
    fireEvent.click(
      within(tabela).getByRole('button', { name: 'Desativar a conta de Mariana Alves no AD' }),
    );
    const confirmacao = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Desativar no AD' }));
    await waitFor(() => expect(avisos()).toContain('Conta de Mariana Alves desativada no AD.'));
    expect(corpos).toEqual([{ dn: MARIANA_DN, ativa: false }]);
  });

  it('a senha vai pelo diálogo, e a recusa do ldap:// aparece no campo', async () => {
    let tentativas = 0;
    abrir({
      'GET /api/diretorio': () => Response.json(CONFIGURADO),
      'GET /api/diretorio/usuarios': () => Response.json({ usuarios: [JOAO] }),
      'POST /api/diretorio/usuarios/senha': () => {
        tentativas += 1;
        return Response.json(
          {
            type: 'urn:grafite:problema:conflito',
            title: 'Conflito',
            status: 409,
            detail: 'A redefinição da senha exige o ldaps://.',
            codigoDeRastreio: 'R7K2-9QXM',
          },
          { status: 409 },
        );
      },
    });
    await abrirAba('Usuários');
    await buscar(/^Buscar pelo usuário/, 'joao');
    const tabela = await screen.findByRole('grid', { name: 'Usuários do AD' });
    fireEvent.click(within(tabela).getByRole('button', { name: 'Redefinir a senha de João Lima' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Redefinir a senha de João Lima' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Redefinir' }));
    expect(await within(dialogo).findByText('Informe a senha nova.')).toBeTruthy();
    fireEvent.change(within(dialogo).getByLabelText('Senha nova'), {
      target: { value: 'Nova@2026' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Redefinir' }));
    expect(
      await within(dialogo).findByText('A redefinição da senha exige o ldaps://.'),
    ).toBeTruthy();
    expect(tentativas).toBe(1);
  });
});

describe('a aba Grupos', () => {
  it('Membro incluído pelo grupo: os membros, o "Tirar" e o "Incluir membro"', async () => {
    const corpos: { caminho: string; corpo: unknown }[] = [];
    abrir({
      'GET /api/diretorio': () => Response.json(CONFIGURADO),
      'GET /api/diretorio/grupos': () =>
        Response.json({
          grupos: [{ dn: SUPORTE, nome: 'TI-Suporte', membros: 1, mapeadoPara: TECNICOS }],
        }),
      'GET /api/diretorio/membros': () =>
        Response.json({
          grupo: { dn: SUPORTE, nome: 'TI-Suporte', membros: 1, mapeadoPara: TECNICOS },
          membros: [MARIANA],
        }),
      'GET /api/diretorio/usuarios': () =>
        Response.json({ usuarios: [usuario(ANA_DN, 'Ana Souza', 'ana.souza'), MARIANA] }),
      'POST /api/diretorio/membros/retirada': async (pedido) => {
        corpos.push({ caminho: 'retirada', corpo: await pedido.json() });
        return Response.json({ ...MARIANA, grupos: [] });
      },
      'POST /api/diretorio/membros': async (pedido) => {
        corpos.push({ caminho: 'inclusao', corpo: await pedido.json() });
        return Response.json(usuario(ANA_DN, 'Ana Souza', 'ana.souza'));
      },
    });
    await abrirAba('Grupos');
    await buscar(/^Buscar o grupo pelo nome/, 'TI');
    const grupos = await screen.findByRole('grid', { name: 'Grupos do AD' });
    expect(within(grupos).getByText('Técnicos')).toBeTruthy();
    fireEvent.click(within(grupos).getByRole('button', { name: 'Ver os membros de TI-Suporte' }));
    const membros = await screen.findByRole('grid', { name: 'Membros de TI-Suporte' });
    expect(screen.getByText('Quem está neste grupo entra no Grafite como Técnicos.')).toBeTruthy();
    fireEvent.click(
      within(membros).getByRole('button', { name: 'Tirar Mariana Alves de TI-Suporte' }),
    );
    await waitFor(() => expect(avisos()).toContain('Mariana Alves saiu de TI-Suporte.'));
    await buscar(/^Buscar a pessoa para incluir/, 'ana');
    await escolher(/Pessoa para incluir/, 'Ana Souza (ana.souza)');
    fireEvent.click(screen.getByRole('button', { name: 'Incluir membro' }));
    await waitFor(() => expect(avisos()).toContain('Ana Souza agora é de TI-Suporte.'));
    expect(corpos).toEqual([
      { caminho: 'retirada', corpo: { usuarioDn: MARIANA_DN, grupoDn: SUPORTE } },
      { caminho: 'inclusao', corpo: { usuarioDn: ANA_DN, grupoDn: SUPORTE } },
    ]);
  });
});
