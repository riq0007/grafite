import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { criarLojaDaSessao, type EstadoDaSessao } from '../../../sessao/loja.ts';
import { CONTA_DE_EXEMPLO } from '../../../teste/sessao.ts';

const ATIVA: EstadoDaSessao = {
  tipo: 'ativa',
  organizacao: 'Empresa de exemplo',
  conta: CONTA_DE_EXEMPLO,
  csrf: 'csrf-de-teste',
  expiraEm: '2099-01-01T00:00:00.000Z',
  acesso: { permissoes: [] },
};

const CONTA = {
  usuario: 'ana.souza',
  nome: 'Ana Souza',
  email: 'ana.souza@exemplo.com.br',
  doisPassos: {
    situacao: 'ativa',
    exigida: true,
    exigidaPor: { conta: true, perfis: [] },
    codigosRestantes: 10,
  },
};

const ESTA_SESSAO = {
  id: '0199a6e0-0000-7000-8000-000000000001',
  dispositivo: 'Chrome no Windows',
  ip: '10.0.0.5',
  criadaEm: '2026-10-01T12:00:00.000Z',
  ultimoUsoEm: '2026-10-01T13:30:00.000Z',
  atual: true,
};
const NO_CELULAR = {
  id: '0199a6e0-0000-7000-8000-000000000002',
  dispositivo: 'Safari no iPhone',
  ip: null,
  criadaEm: '2026-09-30T22:15:00.000Z',
  ultimoUsoEm: '2026-10-01T11:05:00.000Z',
  atual: false,
};

/** Os aparelhos confiáveis de Ana: o computador, deste navegador, e o notebook. */
const COMPUTADOR = {
  id: '0199a6e0-0000-7000-8000-000000000011',
  dispositivo: 'Chrome no Windows',
  criadoEm: '2026-10-01T12:00:00.000Z',
  usadoEm: '2026-10-01T13:30:00.000Z',
  valeAte: '2026-10-31T12:00:00.000Z',
  esteAparelho: true,
};
const NOTEBOOK = {
  id: '0199a6e0-0000-7000-8000-000000000012',
  dispositivo: 'Edge no Windows',
  criadoEm: '2026-09-28T09:00:00.000Z',
  usadoEm: '2026-09-30T18:45:00.000Z',
  valeAte: '2026-10-28T09:00:00.000Z',
  esteAparelho: false,
};
const PRAZO_DA_ORGANIZACAO = { dias: 30, origem: { tipo: 'organizacao' } };

type Resposta = () => Response | Promise<Response>;

const json = (corpo: unknown) => () => Response.json(corpo);
const conta = (corpo: unknown = CONTA) => json(corpo);
const vazia = () => new Response(null, { status: 204 });
const recusa =
  (status: number, codigo: string, detalhe: string, campos?: Record<string, string>) => () =>
    Response.json(
      {
        type: `urn:grafite:problema:${codigo}`,
        title: 'Título',
        status,
        detail: detalhe,
        codigoDeRastreio: 'R7K2-9QXM',
        ...(campos && { campos }),
      },
      { status, headers: { 'content-type': 'application/problem+json' } },
    );
const erroDoServidor = recusa(500, 'erro-interno', 'Erro interno.');

let pedidos: Request[] = [];

/**
 * Abre o app na seção Conta. O servidor responde cada pedido ("GET /api/conta") com as respostas
 * dele, na ordem; sem outras, a conta de exemplo e as duas sessões dela.
 */
function abrir({
  servidor = {},
  estado = ATIVA,
  endereco = '/ajustes/conta',
  canal,
}: {
  servidor?: Record<string, Resposta[]>;
  estado?: EstadoDaSessao;
  endereco?: string;
  /** O canal dos eventos, para o teste mandar os que a conexão mandaria. */
  canal?: CanalDeEventos;
} = {}) {
  const respostas = new Map<string, Resposta[]>(
    Object.entries({
      'GET /api/conta': [conta()],
      'GET /api/conta/sessoes': [json([ESTA_SESSAO, NO_CELULAR])],
      'GET /api/conta/aparelhos': [json({ prazo: PRAZO_DA_ORGANIZACAO, aparelhos: [] })],
      ...servidor,
    }),
  );
  const loja = criarLojaDaSessao({
    estado,
    buscar: async (pedido) => {
      pedidos.push(pedido);
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      const resposta = respostas.get(caminho)?.shift();
      if (!resposta) throw new Error(`Sem resposta para ${caminho}.`);
      return resposta();
    },
  });
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(<App roteador={roteador} sessao={loja} canal={canal} />);
  return roteador;
}

/** Postura computador: ponteiro fino, na largura padrão da janela de teste. */
function noComputador() {
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (consulta: string) => {
    const lista = original(consulta);
    if (consulta === '(pointer: fine)') Object.defineProperty(lista, 'matches', { value: true });
    return lista;
  });
}

const titulo = (nome: string) => screen.findByRole('heading', { level: 1, name: nome });
const secoes = () => screen.getByRole('navigation', { name: 'Seções dos Ajustes' });
const caminhos = () => pedidos.map((pedido) => `${pedido.method} ${new URL(pedido.url).pathname}`);
const pedidoDe = (caminho: string) =>
  pedidos.find((pedido) => `${pedido.method} ${new URL(pedido.url).pathname}` === caminho);
const preencher = (rotulo: string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pedidos = [];
  localStorage.clear();
});

describe('seção Conta', () => {
  it('é a primeira da lista, separada das seções de preferências', async () => {
    noComputador();
    abrir();
    await titulo('Conta');
    const [daConta, dasPreferencias] = within(secoes()).getAllByRole('list');
    expect(
      within(daConta as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Conta']);
    expect(
      within(dasPreferencias as HTMLElement)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'Aparência',
      'Dock',
      'Cursor',
      'Notificações',
      'Tabelas',
      'Idioma e região',
      'Acessibilidade',
    ]);
    expect(within(secoes()).getByRole('link', { name: 'Conta' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('mostra o nome, o usuário e o e-mail, sem edição, e sem "Restaurar padrões"', async () => {
    abrir();
    const dados = await screen.findByRole('region', { name: 'Dados da conta' });
    expect(within(dados).getByText('Ana Souza')).toBeTruthy();
    expect(within(dados).getByText('ana.souza')).toBeTruthy();
    expect(within(dados).getByText('ana.souza@exemplo.com.br')).toBeTruthy();
    expect(within(dados).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restaurar padrões' })).toBeNull();
  });

  // Spec componentes-base, "Lista de dados" e "Carimbo de seção" (change cabecalho-em-toda-tela,
  // design, decisão 3).
  it('os dados da conta na lista de dados, e as partes com o título de seção', async () => {
    abrir();
    const dados = await screen.findByRole('region', { name: 'Dados da conta' });
    const termos = within(dados).getAllByRole('term');
    expect(termos.map((termo) => termo.textContent)).toEqual(['Nome', 'Usuário', 'E-mail']);
    for (const termo of termos) expect(termo.closest('[data-lista-de-dados]')).toBeTruthy();
    // O título da parte é o carimbo: o texto e a linha que segue até a borda.
    const tituloDaParte = within(dados).getByRole('heading', { level: 2, name: 'Dados da conta' });
    expect(tituloDaParte.querySelector('[data-parte="linha"]')).toBeTruthy();
  });

  it('sem e-mail na conta, não mostra a linha do e-mail', async () => {
    abrir({ servidor: { 'GET /api/conta': [conta({ ...CONTA, email: null })] } });
    const dados = await screen.findByRole('region', { name: 'Dados da conta' });
    expect(within(dados).queryByText('E-mail')).toBeNull();
  });

  it('enquanto a conta carrega, diz que está carregando', async () => {
    abrir({ servidor: { 'GET /api/conta': [() => new Promise<Response>(() => {})] } });
    expect((await screen.findByText('Carregando a conta…')).getAttribute('role')).toBe('status');
  });

  it('num erro, diz o motivo e deixa tentar de novo', async () => {
    abrir({ servidor: { 'GET /api/conta': [erroDoServidor, conta()] } });
    expect(
      await screen.findByText(
        'Não foi possível carregar a conta. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('region', { name: 'Dados da conta' })).toBeTruthy();
    expect(caminhos().filter((caminho) => caminho === 'GET /api/conta')).toHaveLength(2);
  });

  it('com a sessão desconhecida, diz que a conta aparece quando a conexão voltar', async () => {
    abrir({ estado: { tipo: 'desconhecida' } });
    await titulo('Conta');
    expect(
      screen.getByText('Sem conexão com o servidor. A sua conta aparece quando a conexão voltar.'),
    ).toBeTruthy();
    expect(pedidos).toEqual([]);
  });

  it('cada parte tem o seu data-foco', async () => {
    abrir();
    await screen.findByRole('region', { name: 'Dados da conta' });
    for (const foco of [
      'foto',
      'dados-da-conta',
      'senha',
      'dois-passos',
      'codigos-de-recuperacao',
      'aparelhos-confiaveis',
      'sessoes',
    ]) {
      expect(document.querySelector(`[data-foco="${foco}"]`), foco).not.toBeNull();
    }
  });
});

describe('troca da senha', () => {
  const senha = () => screen.findByRole('region', { name: 'Senha' });
  const trocar = () => fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));

  it('mostra a regra da senha e, fora dela, o motivo antes de enviar', async () => {
    abrir();
    const parte = await senha();
    expect(
      within(parte).getByText('Use pelo menos 12 caracteres. Uma frase longa é uma boa senha.'),
    ).toBeTruthy();
    preencher('Senha atual', 'senha atual da Ana');
    preencher('Senha nova', 'curta');
    preencher('Confirmar a senha nova', 'curta');
    trocar();
    expect(await within(parte).findByText('Use pelo menos 12 caracteres.')).toBeTruthy();
    expect(caminhos()).not.toContain('PUT /api/conta/senha');
  });

  it('as senhas novas diferentes não saem', async () => {
    abrir();
    const parte = await senha();
    preencher('Senha atual', 'senha atual da Ana');
    preencher('Senha nova', 'cavalo bateria grampo correto');
    preencher('Confirmar a senha nova', 'cavalo bateria grampo errado');
    trocar();
    expect(await within(parte).findByText('As senhas não são iguais.')).toBeTruthy();
    expect(caminhos()).not.toContain('PUT /api/conta/senha');
  });

  it('a senha atual errada aparece no campo dela', async () => {
    abrir({
      servidor: {
        'PUT /api/conta/senha': [
          recusa(400, 'senha-atual-incorreta', 'A senha atual está incorreta.', {
            senhaAtual: 'A senha atual está incorreta.',
          }),
        ],
      },
    });
    const parte = await senha();
    preencher('Senha atual', 'senha errada');
    preencher('Senha nova', 'cavalo bateria grampo correto');
    preencher('Confirmar a senha nova', 'cavalo bateria grampo correto');
    trocar();
    expect(await within(parte).findByText('A senha atual está incorreta.')).toBeTruthy();
    expect(screen.getByLabelText('Senha atual').getAttribute('aria-invalid')).toBe('true');
  });

  it('com sucesso, diz que as outras sessões foram encerradas e limpa os campos', async () => {
    abrir({
      servidor: {
        'PUT /api/conta/senha': [
          json({
            organizacao: { nome: 'Empresa de exemplo' },
            sessao: {
              conta: CONTA_DE_EXEMPLO,
              pendencia: null,
              csrf: 'csrf-novo',
              expiraEm: '2099-01-01T00:00:00.000Z',
              acesso: { permissoes: [] },
            },
            sessoesEncerradas: 2,
          }),
        ],
      },
    });
    const parte = await senha();
    preencher('Senha atual', 'senha atual da Ana');
    preencher('Senha nova', 'cavalo bateria grampo correto');
    preencher('Confirmar a senha nova', 'cavalo bateria grampo correto');
    trocar();
    expect(
      await within(parte).findByText(
        'Senha trocada. As outras sessões foram encerradas e os aparelhos confiáveis, esquecidos.',
      ),
    ).toBeTruthy();
    const troca = pedidoDe('PUT /api/conta/senha');
    expect(await troca?.json()).toEqual({
      senhaAtual: 'senha atual da Ana',
      senhaNova: 'cavalo bateria grampo correto',
    });
    expect(troca?.headers.get('x-grafite-csrf')).toBe('csrf-de-teste');
    expect(screen.getByLabelText('Senha atual')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Senha nova')).toHaveProperty('value', '');
  });

  it('pelo endereço com o foco na senha, o foco vai à senha atual quando a conta carrega', async () => {
    abrir({ endereco: '/ajustes/conta?foco=senha' });
    await senha();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Senha atual')),
    );
  });
});

describe('verificação em dois passos', () => {
  const doisPassos = () => screen.findByRole('region', { name: 'Verificação em dois passos' });
  /** A verificação da conta, exigida pela própria conta e pelos perfis dados. */
  const comDoisPassos = (
    situacao: 'ativa' | 'desativada',
    exigidaPelaConta = false,
    codigosRestantes = 10,
    perfis: string[] = [],
  ) =>
    conta({
      ...CONTA,
      doisPassos: {
        situacao,
        exigida: exigidaPelaConta || perfis.length > 0,
        exigidaPor: { conta: exigidaPelaConta, perfis },
        codigosRestantes,
      },
    });
  const DEZ_CODIGOS = Array.from({ length: 10 }, (_, i) => `a7k2m-9qx${i}t`);

  it.each([
    ['ativa', false, [], 'Ativa', null],
    ['desativada', false, [], 'Desativada', null],
    ['ativa', true, [], 'Ativa', 'Exigida para a sua conta'],
    ['ativa', false, ['Administrador'], 'Ativa', 'Exigida pelo perfil Administrador'],
    [
      'desativada',
      false,
      ['Administrador', 'Técnico'],
      'Desativada',
      'Exigida pelos perfis Administrador e Técnico',
    ],
    [
      'ativa',
      true,
      ['Administrador'],
      'Ativa',
      'Exigida para a sua conta e pelo perfil Administrador',
    ],
  ] as const)(
    'a situação %s, exigida pela conta (%s) e pelos perfis %j, aparece em texto',
    async (situacao, pelaConta, perfis, texto, exigencia) => {
      abrir({
        servidor: { 'GET /api/conta': [comDoisPassos(situacao, pelaConta, 10, [...perfis])] },
      });
      const parte = await doisPassos();
      const valorDe = (rotulo: string) =>
        within(parte).queryByText(rotulo, { selector: 'dt' })?.nextElementSibling?.textContent;
      expect(valorDe('Situação')).toBe(texto);
      expect(valorDe('Exigência') ?? null).toBe(exigencia);
    },
  );

  it('exigida pelo perfil, a verificação diz quem exige e não oferece "Desativar"', async () => {
    abrir({
      servidor: { 'GET /api/conta': [comDoisPassos('ativa', false, 10, ['Administrador'])] },
    });
    const parte = await doisPassos();
    expect(within(parte).getByText('Exigida pelo perfil Administrador')).toBeTruthy();
    expect(within(parte).queryByRole('button', { name: 'Desativar' })).toBeNull();
  });

  it('"Ativar" mostra o cadastro, os códigos uma vez e, depois, a situação Ativa', async () => {
    abrir({
      servidor: {
        'GET /api/conta': [comDoisPassos('desativada', false, 0)],
        'POST /api/conta/dois-passos/cadastro': [
          json({ chave: 'GEZD GNBV GY3T QOJQ', uri: 'otpauth://totp/Grafite' }),
        ],
        'POST /api/conta/dois-passos/confirmacao': [
          json({
            organizacao: { nome: 'Empresa de exemplo' },
            sessao: {
              conta: CONTA_DE_EXEMPLO,
              pendencia: null,
              csrf: 'csrf-novo',
              expiraEm: '2099-01-01T00:00:00.000Z',
              acesso: { permissoes: [] },
            },
            codigosDeRecuperacao: DEZ_CODIGOS,
            sessoesEncerradas: 0,
          }),
        ],
      },
    });
    const parte = await doisPassos();
    fireEvent.click(within(parte).getByRole('button', { name: 'Ativar' }));
    expect(
      await within(parte).findByRole('heading', {
        level: 3,
        name: 'Cadastre a verificação em dois passos',
      }),
    ).toBeTruthy();
    expect(within(parte).getByText('GEZD GNBV GY3T QOJQ')).toBeTruthy();
    preencher('Código do app', '287082');
    fireEvent.click(within(parte).getByRole('button', { name: 'Ativar' }));
    const lista = await within(parte).findByRole('list', { name: 'Códigos de recuperação' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(10);
    fireEvent.click(within(parte).getByRole('button', { name: 'Continuar' }));
    expect(await within(parte).findByText('Ativa')).toBeTruthy();
    expect(within(parte).getByText('Restam 10 códigos de recuperação.')).toBeTruthy();
    expect(within(parte).queryByRole('list', { name: 'Códigos de recuperação' })).toBeNull();
    expect(await pedidoDe('POST /api/conta/dois-passos/confirmacao')?.json()).toEqual({
      codigo: '287082',
    });
  });

  it('"Cancelar" no cadastro volta à situação, sem ativar', async () => {
    abrir({
      servidor: {
        'GET /api/conta': [comDoisPassos('desativada', false, 0)],
        'POST /api/conta/dois-passos/cadastro': [
          json({ chave: 'GEZD GNBV GY3T QOJQ', uri: 'otpauth://totp/Grafite' }),
        ],
      },
    });
    const parte = await doisPassos();
    fireEvent.click(within(parte).getByRole('button', { name: 'Ativar' }));
    await within(parte).findByText('GEZD GNBV GY3T QOJQ');
    fireEvent.click(within(parte).getByRole('button', { name: 'Cancelar' }));
    expect(await within(parte).findByText('Desativada')).toBeTruthy();
    expect(caminhos()).not.toContain('POST /api/conta/dois-passos/confirmacao');
  });

  it('"Desativar" pede um código e, aceito, deixa a verificação desativada', async () => {
    abrir({
      servidor: {
        'GET /api/conta': [comDoisPassos('ativa')],
        'POST /api/conta/dois-passos/desativacao': [vazia],
      },
    });
    const parte = await doisPassos();
    fireEvent.click(within(parte).getByRole('button', { name: 'Desativar' }));
    preencher('Código do app ou de recuperação', '287082');
    // A confirmação tira uma proteção da conta: o botão é o de ação destrutiva.
    const confirmar = within(parte).getByRole('button', { name: 'Desativar' });
    expect(confirmar.getAttribute('data-nivel')).toBe('destrutivo');
    fireEvent.click(confirmar);
    expect(await within(parte).findByText('Desativada')).toBeTruthy();
    // Um destaque por tela: o "Trocar senha" da parte da senha é a ação primária da Conta (change
    // um-destaque-por-tela, design, decisão 2).
    expect(
      within(parte).getByRole('button', { name: 'Ativar' }).getAttribute('data-nivel'),
    ).not.toBe('primario');
    expect(await pedidoDe('POST /api/conta/dois-passos/desativacao')?.json()).toEqual({
      codigo: '287082',
    });
  });

  it('o código recusado ao desativar aparece, e a verificação continua ativa', async () => {
    abrir({
      servidor: {
        'GET /api/conta': [comDoisPassos('ativa')],
        'POST /api/conta/dois-passos/desativacao': [
          recusa(400, 'codigo-invalido', 'Código incorreto.'),
        ],
      },
    });
    const parte = await doisPassos();
    fireEvent.click(within(parte).getByRole('button', { name: 'Desativar' }));
    preencher('Código do app ou de recuperação', '000000');
    fireEvent.click(within(parte).getByRole('button', { name: 'Desativar' }));
    expect(await within(parte).findByText('Código incorreto.')).toBeTruthy();
    fireEvent.click(within(parte).getByRole('button', { name: 'Cancelar' }));
    expect(await within(parte).findByText('Ativa')).toBeTruthy();
  });

  it('exigida para a conta, a verificação não oferece "Desativar"', async () => {
    abrir({ servidor: { 'GET /api/conta': [comDoisPassos('ativa', true)] } });
    const parte = await doisPassos();
    expect(within(parte).queryByRole('button', { name: 'Desativar' })).toBeNull();
  });

  it('"Gerar novos códigos de recuperação" pede um código e mostra os novos uma vez', async () => {
    abrir({
      servidor: {
        'GET /api/conta': [comDoisPassos('ativa', true, 2)],
        'POST /api/conta/dois-passos/codigos-de-recuperacao': [
          json({ codigosDeRecuperacao: DEZ_CODIGOS }),
        ],
      },
    });
    const parte = await doisPassos();
    expect(within(parte).getByText('Restam 2 códigos de recuperação.')).toBeTruthy();
    fireEvent.click(
      within(parte).getByRole('button', { name: 'Gerar novos códigos de recuperação' }),
    );
    preencher('Código do app ou de recuperação', '287082');
    fireEvent.click(within(parte).getByRole('button', { name: 'Gerar códigos' }));
    const lista = await within(parte).findByRole('list', { name: 'Códigos de recuperação' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(10);
    fireEvent.click(within(parte).getByRole('button', { name: 'Continuar' }));
    expect(await within(parte).findByText('Restam 10 códigos de recuperação.')).toBeTruthy();
  });

  it.each([
    [1, 'Resta 1 código de recuperação.'],
    [0, 'Não resta nenhum código de recuperação. Gere novos.'],
  ])('com %i códigos, diz quantos restam', async (restantes, texto) => {
    abrir({ servidor: { 'GET /api/conta': [comDoisPassos('ativa', false, restantes)] } });
    const parte = await doisPassos();
    expect(within(parte).getByText(texto)).toBeTruthy();
  });
});

describe('sessões', () => {
  const sessoes = () => screen.findByRole('region', { name: 'Sessões' });
  const itemDe = async (dispositivo: string) =>
    (await within(await sessoes()).findByText(dispositivo)).closest('li') as HTMLElement;

  it('mostra o dispositivo, o IP e os horários no fuso escolhido', async () => {
    abrir({
      estado: {
        ...ATIVA,
        conta: { ...CONTA_DE_EXEMPLO, preferencias: { regiao: { fuso: 'America/Manaus' } } },
      },
    });
    const esta = await itemDe('Chrome no Windows');
    expect(within(esta).getByText('10.0.0.5')).toBeTruthy();
    expect(within(esta).getByText('qui 1 out 08:00')).toBeTruthy();
    expect(within(esta).getByText('qui 1 out 09:30')).toBeTruthy();
    const celular = await itemDe('Safari no iPhone');
    expect(within(celular).getByText('Desconhecido')).toBeTruthy();
    expect(within(celular).getByText('qua 30 set 18:15')).toBeTruthy();
  });

  it('marca "Esta sessão" na atual, que não oferece "Encerrar"', async () => {
    abrir();
    const esta = await itemDe('Chrome no Windows');
    expect(within(esta).getByText('Esta sessão')).toBeTruthy();
    expect(within(esta).queryByRole('button', { name: /Encerrar/ })).toBeNull();
    const celular = await itemDe('Safari no iPhone');
    expect(within(celular).queryByText('Esta sessão')).toBeNull();
  });

  it('"Encerrar" encerra a sessão e a tira da lista', async () => {
    abrir({ servidor: { [`DELETE /api/conta/sessoes/${NO_CELULAR.id}`]: [vazia] } });
    const celular = await itemDe('Safari no iPhone');
    fireEvent.click(within(celular).getByRole('button', { name: 'Encerrar' }));
    const parte = await sessoes();
    await vi.waitFor(() => expect(within(parte).queryByText('Safari no iPhone')).toBeNull());
    expect(within(parte).getByText('Chrome no Windows')).toBeTruthy();
    expect(
      pedidoDe(`DELETE /api/conta/sessoes/${NO_CELULAR.id}`)?.headers.get('x-grafite-csrf'),
    ).toBe('csrf-de-teste');
  });

  it('"Encerrar as outras sessões" deixa só esta sessão', async () => {
    abrir({ servidor: { 'DELETE /api/conta/sessoes': [json({ encerradas: 1 })] } });
    const parte = await sessoes();
    const encerrarAsOutras = await within(parte).findByRole('button', {
      name: 'Encerrar as outras sessões',
    });
    expect(encerrarAsOutras.getAttribute('data-nivel')).toBe('destrutivo');
    fireEvent.click(encerrarAsOutras);
    expect(await within(parte).findByText('As outras sessões foram encerradas.')).toBeTruthy();
    expect(within(parte).queryByText('Safari no iPhone')).toBeNull();
    expect(within(parte).getByText('Chrome no Windows')).toBeTruthy();
    expect(within(parte).queryByRole('button', { name: 'Encerrar as outras sessões' })).toBeNull();
  });

  it('a falha ao encerrar aparece, e a sessão continua na lista', async () => {
    abrir({ servidor: { [`DELETE /api/conta/sessoes/${NO_CELULAR.id}`]: [erroDoServidor] } });
    const celular = await itemDe('Safari no iPhone');
    fireEvent.click(within(celular).getByRole('button', { name: 'Encerrar' }));
    expect(
      await screen.findByText(
        'Não foi possível encerrar a sessão. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    expect(within(await sessoes()).getByText('Safari no iPhone')).toBeTruthy();
  });
});

// Spec ajustes-do-sistema, "Seção Conta" (change aparelho-confiavel, design, decisão 6).
describe('aparelhos confiáveis', () => {
  const parteDosAparelhos = () => screen.findByRole('region', { name: 'Aparelhos confiáveis' });
  const comAparelhos = (aparelhos = [COMPUTADOR, NOTEBOOK], prazo = PRAZO_DA_ORGANIZACAO) => ({
    'GET /api/conta/aparelhos': [json({ prazo, aparelhos })],
  });
  const itemDoAparelho = async (dispositivo: string) =>
    (await within(await parteDosAparelhos()).findByText(dispositivo)).closest('li') as HTMLElement;

  it('Aparelhos confiáveis nos Ajustes: os dois, com "Este aparelho" e o prazo em texto', async () => {
    abrir({ servidor: comAparelhos() });
    const parte = await parteDosAparelhos();
    expect(
      await within(parte).findByText(
        'O código é pedido de novo a cada 30 dias em cada aparelho confiável.',
      ),
    ).toBeTruthy();
    expect(within(parte).getByRole('list', { name: 'Aparelhos confiáveis' })).toBeTruthy();
    const computador = await itemDoAparelho('Chrome no Windows');
    expect(within(computador).getByText('Este aparelho')).toBeTruthy();
    for (const rotulo of ['Confiável desde', 'Último uso', 'Vale até']) {
      expect(within(computador).getByText(rotulo), rotulo).toBeTruthy();
    }
    const notebook = await itemDoAparelho('Edge no Windows');
    expect(within(notebook).queryByText('Este aparelho')).toBeNull();
    expect(within(notebook).getByRole('button', { name: 'Esquecer' })).toBeTruthy();
    expect(within(parte).getByRole('button', { name: 'Esquecer todos' })).toBeTruthy();
  });

  it('Esquecer o notebook: o aparelho some da lista, com "Aparelho esquecido."', async () => {
    abrir({
      servidor: { ...comAparelhos(), [`DELETE /api/conta/aparelhos/${NOTEBOOK.id}`]: [vazia] },
    });
    const notebook = await itemDoAparelho('Edge no Windows');
    fireEvent.click(within(notebook).getByRole('button', { name: 'Esquecer' }));
    const parte = await parteDosAparelhos();
    expect(await within(parte).findByText('Aparelho esquecido.')).toBeTruthy();
    expect(within(parte).queryByText('Edge no Windows')).toBeNull();
    expect(within(parte).getByText('Chrome no Windows')).toBeTruthy();
    expect(
      pedidoDe(`DELETE /api/conta/aparelhos/${NOTEBOOK.id}`)?.headers.get('x-grafite-csrf'),
    ).toBe('csrf-de-teste');
  });

  it('"Esquecer todos" deixa a lista vazia, com "Aparelhos esquecidos."', async () => {
    abrir({ servidor: { ...comAparelhos(), 'DELETE /api/conta/aparelhos': [vazia] } });
    const parte = await parteDosAparelhos();
    const todos = await within(parte).findByRole('button', { name: 'Esquecer todos' });
    expect(todos.getAttribute('data-nivel')).toBe('destrutivo');
    fireEvent.click(todos);
    expect(await within(parte).findByText('Aparelhos esquecidos.')).toBeTruthy();
    expect(within(parte).getByText('Nenhum aparelho confiável.')).toBeTruthy();
    expect(within(parte).queryByRole('button', { name: 'Esquecer todos' })).toBeNull();
  });

  it('sem aparelhos, diz "Nenhum aparelho confiável."; com o prazo zero, que o código é pedido sempre', async () => {
    abrir({ servidor: comAparelhos([], { dias: 0, origem: { tipo: 'organizacao' } }) });
    const parte = await parteDosAparelhos();
    expect(await within(parte).findByText('O código é pedido em toda entrada.')).toBeTruthy();
    expect(within(parte).getByText('Nenhum aparelho confiável.')).toBeTruthy();
  });

  it('a falha ao esquecer aparece, e o aparelho continua na lista', async () => {
    abrir({
      servidor: {
        ...comAparelhos(),
        [`DELETE /api/conta/aparelhos/${NOTEBOOK.id}`]: [erroDoServidor],
      },
    });
    const notebook = await itemDoAparelho('Edge no Windows');
    fireEvent.click(within(notebook).getByRole('button', { name: 'Esquecer' }));
    expect(
      await screen.findByText(
        'Não foi possível esquecer o aparelho. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    expect(within(await parteDosAparelhos()).getByText('Edge no Windows')).toBeTruthy();
  });

  it('sem a verificação em dois passos, a parte não aparece', async () => {
    abrir({
      servidor: {
        'GET /api/conta': [
          conta({
            ...CONTA,
            doisPassos: { ...CONTA.doisPassos, situacao: 'desativada', exigida: false },
          }),
        ],
      },
    });
    await screen.findByRole('region', { name: 'Dados da conta' });
    expect(screen.queryByRole('region', { name: 'Aparelhos confiáveis' })).toBeNull();
    expect(caminhos()).not.toContain('GET /api/conta/aparelhos');
  });
});

describe('o foco pelo endereço', () => {
  it('nas sessões, vai ao primeiro "Encerrar" quando a lista carrega', async () => {
    abrir({ endereco: '/ajustes/conta?foco=sessoes' });
    const parte = await screen.findByRole('region', { name: 'Sessões' });
    await within(parte).findByText('Safari no iPhone');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(within(parte).getByRole('button', { name: 'Encerrar' })),
    );
  });
});

describe('os eventos', () => {
  const doisPassos = () => screen.findByRole('region', { name: 'Verificação em dois passos' });
  const sessoes = () => screen.findByRole('region', { name: 'Sessões' });

  it('a mudança na pessoa ou na conta, feita em outro lugar, relê a conta e as sessões abertas', async () => {
    const canal = criarCanalDeEventos();
    abrir({
      canal,
      servidor: {
        'GET /api/conta': [
          conta(),
          conta({ ...CONTA, doisPassos: { ...CONTA.doisPassos, codigosRestantes: 3 } }),
        ],
        'GET /api/conta/sessoes': [json([ESTA_SESSAO, NO_CELULAR]), json([ESTA_SESSAO])],
      },
    });
    const parte = await doisPassos();
    expect(within(parte).getByText('Restam 10 códigos de recuperação.')).toBeTruthy();
    expect(await within(await sessoes()).findByText('Safari no iPhone')).toBeTruthy();

    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000009',
      tipo: 'pessoas.mudaram',
      momento: '2026-10-07T12:00:00.000Z',
      alvo: { tipo: 'conta', id: CONTA_DE_EXEMPLO.id as string },
    });
    expect(await within(parte).findByText('Restam 3 códigos de recuperação.')).toBeTruthy();
    await vi.waitFor(async () =>
      expect(within(await sessoes()).queryByText('Safari no iPhone')).toBeNull(),
    );
  });
});

describe('a foto da conta', () => {
  afterEach(() => {
    for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  });

  const foto = () => screen.findByRole('region', { name: 'Foto' });
  const escolha = () => screen.findByRole('group', { name: 'Foto de Ana Souza' });
  const doUsuario = () =>
    within(screen.getByRole('banner')).getByRole('button', { name: 'Ana Souza' });
  const estadoCom = (fotoDaConta: { id: string } | null) =>
    json({
      organizacao: { nome: 'Empresa de exemplo', preferencias: {} },
      sessao: {
        conta: { ...CONTA_DE_EXEMPLO, foto: fotoDaConta },
        pendencia: null,
        csrf: 'csrf-de-teste',
        expiraEm: '2099-01-01T00:00:00.000Z',
        acesso: { permissoes: [] },
      },
    });

  it('sem foto, mostra as iniciais e "Trocar foto", sem "Remover foto"', async () => {
    abrir();
    const parte = await foto();
    expect(parte.getAttribute('data-foco')).toBe('foto');
    expect(within(parte).getByText('AS')).toBeTruthy();
    expect(within(parte).getByRole('button', { name: 'Trocar foto' })).toBeTruthy();
    expect(within(parte).queryByRole('button', { name: 'Remover foto' })).toBeNull();
  });

  it('trocar a foto: a seção e o menu do usuário passam a mostrar a nova', async () => {
    abrir({
      servidor: {
        'PUT /api/conta/foto': [json({ foto: { id: '0199a6e0-0000-7000-8000-0000000000f2' } })],
        'GET /api/sessao': [estadoCom({ id: '0199a6e0-0000-7000-8000-0000000000f2' })],
      },
    });
    const campoDeArquivo = (await escolha()).querySelector('input[type="file"]') as HTMLElement;
    fireEvent.change(campoDeArquivo, {
      target: { files: [new File(['jpg'], 'eu.jpg', { type: 'image/jpeg' })] },
    });
    await vi.waitFor(() =>
      expect(doUsuario().querySelector('img')?.getAttribute('srcset')).toContain(
        '0199a6e0-0000-7000-8000-0000000000f2',
      ),
    );
    expect((await escolha()).querySelector('img')?.getAttribute('srcset')).toContain(
      '/api/conta/foto/0199a6e0-0000-7000-8000-0000000000f2/64 64w',
    );
    expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain('Foto trocada.');
    expect(pedidoDe('PUT /api/conta/foto')?.headers.get('x-grafite-csrf')).toBe('csrf-de-teste');
  });

  it('remover a foto, com confirmação: a seção e o menu passam a mostrar as iniciais', async () => {
    abrir({
      estado: {
        ...ATIVA,
        conta: { ...CONTA_DE_EXEMPLO, foto: { id: '0199a6e0-0000-7000-8000-0000000000f1' } },
      },
      servidor: {
        'DELETE /api/conta/foto': [json({ foto: null })],
        'GET /api/sessao': [estadoCom(null)],
      },
    });
    fireEvent.click(within(await escolha()).getByRole('button', { name: 'Remover foto' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover foto?' });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover foto' }));
    await vi.waitFor(() => expect(doUsuario().querySelector('img')).toBeNull());
    expect(doUsuario().textContent).toBe('AS');
    expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain('Foto removida.');
  });
});
