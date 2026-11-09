// A seção Diretório da Administração (spec diretorio-ad, "Tela do diretório"; change
// integracao-ad-ldap): a configuração com o teste da conexão antes de salvar, as recusas nos campos,
// os mapeamentos com a busca do grupo do AD e o "Remover", e a seção sem permissão.
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

const SEGREDO = '0199d3a0-0000-7000-8000-00000000d001';
const TECNICOS = '0199d3a0-0000-7000-8000-00000000a001';
const SUPORTE = 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local';
const AC = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBmTCCAT+gAwIBAgIU',
  '-----END CERTIFICATE-----',
].join('\n');

const DIRETORIO = {
  servidor: 'ldaps://dc01.empresa.local',
  baseDn: 'DC=empresa,DC=local',
  conta: { id: SEGREDO, nome: 'Conta do Grafite no AD' },
  atributoDoUsuario: 'sAMAccountName',
  filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
  conferirCertificado: true,
  acDoServidor: null,
  ligado: true,
};

const estado = (mudancas: Partial<Estado> = {}): Estado => ({
  diretorio: null,
  mapeamentos: [],
  grupos: [{ id: TECNICOS, nome: 'Técnicos' }],
  ...mudancas,
});

const problema = (status: number, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: 'urn:grafite:problema:dados-invalidos',
      title: 'Dados inválidos',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

function abrir(servidor: ServidorDeTeste, permissoes = naOrganizacao('diretorio.administrar')) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/diretorio'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
        'GET /api/diretorio/logins': () =>
          Response.json({
            logins: [{ id: SEGREDO, nome: 'Conta do Grafite no AD' }],
            motivo: null,
          }),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
  return roteador;
}

const campo = (rotulo: string) => screen.getByRole('textbox', { name: new RegExp(`^${rotulo}`) });
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

async function escolher(rotulo: RegExp, opcao: string) {
  fireEvent.click(await screen.findByRole('button', { name: rotulo }));
  fireEvent.click(await screen.findByRole('option', { name: opcao }));
}

describe('a configuração do diretório', () => {
  it('Diretório configurado: testa a conexão com o que está na tela e salva', async () => {
    const corpos: unknown[] = [];
    let atual = estado();
    abrir({
      'GET /api/diretorio': () => Response.json(atual),
      'POST /api/diretorio/teste': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json({ ok: true, mensagem: 'Conectado: 238 usuários na base.' });
      },
      'PUT /api/diretorio': async (pedido) => {
        corpos.push(await pedido.json());
        atual = estado({ diretorio: DIRETORIO });
        return Response.json(atual);
      },
    });
    await screen.findByRole('heading', { level: 2, name: 'Configuração' });
    expect(campo('Atributo do usuário')).toHaveProperty('value', 'sAMAccountName');
    fireEvent.change(campo('Servidor'), { target: { value: 'ldaps://dc01.empresa.local' } });
    fireEvent.change(campo('Base DN'), { target: { value: 'DC=empresa,DC=local' } });
    await escolher(/Conta de serviço/, 'Conta do Grafite no AD');
    fireEvent.click(screen.getByRole('checkbox', { name: /^Entrada pelo AD/ }));
    fireEvent.change(campo('Certificado da AC'), { target: { value: `${AC}\n` } });
    fireEvent.click(screen.getByRole('button', { name: 'Testar a conexão' }));
    expect(await screen.findByText(/Conectado: 238 usuários na base\./)).toBeTruthy();
    expect(corpos[0]).toEqual({
      servidor: 'ldaps://dc01.empresa.local',
      baseDn: 'DC=empresa,DC=local',
      segredoId: SEGREDO,
      atributoDoUsuario: 'sAMAccountName',
      filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
      conferirCertificado: true,
      acDoServidor: AC,
      ligado: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(avisos()).toContain('Diretório salvo.'));
    expect(await screen.findByRole('heading', { level: 2, name: 'Mapeamentos' })).toBeTruthy();
  });

  it('a falha do teste aparece em texto, e a recusa da gravação, nos campos', async () => {
    abrir({
      'GET /api/diretorio': () => Response.json(estado()),
      'POST /api/diretorio/teste': () =>
        Response.json({ ok: false, mensagem: 'A conta de serviço foi recusada.' }),
      'PUT /api/diretorio': () =>
        problema(400, 'Confira os campos indicados.', {
          servidor: 'Informe o servidor como ldap://servidor ou ldaps://servidor.',
          acDoServidor:
            'Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.',
        }),
    });
    await screen.findByRole('heading', { level: 2, name: 'Configuração' });
    fireEvent.click(screen.getByRole('button', { name: 'Testar a conexão' }));
    expect(await screen.findByText(/A conta de serviço foi recusada\./)).toBeTruthy();
    expect(screen.getByText('Falha na conexão')).toBeTruthy();
    fireEvent.change(campo('Certificado da AC'), { target: { value: 'a raiz da AC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Informe o servidor como ldap://servidor ou ldaps://servidor.'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.',
      ),
    ).toBeTruthy();
  });

  it('sem diretorio.administrar, a seção diz que não tem acesso', async () => {
    abrir({}, naOrganizacao('pessoas.ver'));
    expect(await screen.findByText('Você não tem acesso ao Diretório.')).toBeTruthy();
  });
});

// O guia da primeira configuração (change guia-do-diretorio): os sete passos, com o que preencher,
// onde achar e os comandos para copiar; aberto sem o diretório e fechado depois dele.
describe('o guia da primeira configuração', () => {
  function areaDeTransferencia() {
    const escrever = vi.fn(async (_texto: string) => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escrever },
      configurable: true,
    });
    return escrever;
  }

  it('Primeira configuração guiada: aberto, com os sete passos e os comandos para copiar', async () => {
    const escrever = areaDeTransferencia();
    abrir({ 'GET /api/diretorio': () => Response.json(estado()) });
    const guia = await screen.findByRole('region', { name: 'Guia da primeira configuração' });
    const passos = within(guia).getAllByRole('heading', { level: 3 });
    expect(passos.map((passo) => passo.textContent)).toEqual([
      'A conta de serviço no AD',
      'A conta de serviço no Cofre',
      'O servidor',
      'A base DN',
      'O certificado da AC',
      'O atributo do usuário e o filtro das pessoas',
      'O teste, os mapeamentos e a entrada',
    ]);
    expect(within(guia).getAllByText('O que preencher')).toHaveLength(7);
    expect(within(guia).getAllByText('Onde achar')).toHaveLength(7);
    expect(within(guia).getByText('nltest /dclist:empresa.local')).toBeTruthy();
    const base = within(guia).getByRole('group', { name: 'A base DN do domínio' });
    fireEvent.click(within(base).getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(escrever).toHaveBeenCalledWith('(Get-ADDomain).DistinguishedName'));
    expect(await within(base).findByRole('button', { name: 'Copiado' })).toBeTruthy();
    const esconder = within(guia).getByRole('button', { name: 'Esconder o guia' });
    expect(esconder.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(esconder);
    expect(within(guia).queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(within(guia).getByRole('button', { name: 'Mostrar o guia' })).toBeTruthy();
  });

  it('Guia depois da configuração: fechado, e "Mostrar o guia" o abre', async () => {
    abrir({ 'GET /api/diretorio': () => Response.json(estado({ diretorio: DIRETORIO })) });
    const guia = await screen.findByRole('region', { name: 'Guia da primeira configuração' });
    expect(within(guia).queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    const mostrar = within(guia).getByRole('button', { name: 'Mostrar o guia' });
    expect(mostrar.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(mostrar);
    expect(within(guia).getAllByRole('heading', { level: 3 })).toHaveLength(7);
    expect(
      within(guia).getByRole('button', { name: 'Esconder o guia' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});

describe('os mapeamentos', () => {
  it('Grupo mapeado: busca o grupo do AD, liga ao grupo do Grafite e remove', async () => {
    const pedidos: string[] = [];
    const corpos: unknown[] = [];
    const mapeado = {
      id: '0199d3a0-0000-7000-8000-00000000b001',
      grupoDn: SUPORTE,
      nomeNoAd: 'TI-Suporte',
      grupo: { id: TECNICOS, nome: 'Técnicos' },
    };
    let atual = estado({ diretorio: DIRETORIO });
    abrir({
      'GET /api/diretorio': () => Response.json(atual),
      'GET /api/diretorio/grupos': (pedido) => {
        pedidos.push(new URL(pedido.url).search);
        return Response.json({
          grupos: [{ dn: SUPORTE, nome: 'TI-Suporte', membros: 12, mapeadoPara: null }],
        });
      },
      'POST /api/diretorio/mapeamentos': async (pedido) => {
        corpos.push(await pedido.json());
        atual = estado({ diretorio: DIRETORIO, mapeamentos: [mapeado] });
        return Response.json(mapeado, { status: 201 });
      },
      [`DELETE /api/diretorio/mapeamentos/${mapeado.id}`]: () => {
        atual = estado({ diretorio: DIRETORIO });
        return new Response(null, { status: 204 });
      },
    });
    expect(await screen.findByText('Nenhum grupo do AD mapeado.')).toBeTruthy();
    fireEvent.change(campo('Buscar o grupo do AD'), { target: { value: 'TI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar no AD' }));
    await escolher(/Grupo do AD/, 'TI-Suporte');
    expect(pedidos).toEqual(['?busca=TI']);
    await escolher(/Grupo do Grafite/, 'Técnicos');
    fireEvent.click(screen.getByRole('button', { name: 'Mapear' }));
    await waitFor(() => expect(avisos()).toContain('TI-Suporte mapeado.'));
    expect(corpos).toEqual([{ grupoDn: SUPORTE, grupoId: TECNICOS }]);
    const tabela = await screen.findByRole('grid', { name: 'Mapeamentos' });
    await within(tabela).findByText('Técnicos');
    fireEvent.click(
      within(tabela).getByRole('button', { name: 'Remover o mapeamento de TI-Suporte' }),
    );
    await waitFor(() => expect(avisos()).toContain('Mapeamento de TI-Suporte removido.'));
  });
});
