import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { abrirEscolhaDeLocal, escolherLocal } from '../../../teste/escolhas.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type AcessoDaConta = components['schemas']['AcessoDaConta'];
type Perfil = components['schemas']['Perfil'];
type Grupo = components['schemas']['Grupo'];

const CONTA = {
  id: 'c-bruno',
  usuario: 'bruno.costa',
  situacao: 'ativa',
  exigeDoisPassos: false,
  doisPassos: 'ativa',
  senhaTemporaria: false,
  entradaBloqueadaAte: null,
  ultimaEntradaEm: '2026-10-06T12:30:00.000Z',
  permite: {
    editar: false,
    redefinir: false,
    removerDoisPassos: false,
    desbloquear: false,
    inativar: false,
    reativar: false,
    encerrarSessoes: false,
  },
};

const fichaDe = (conta: object = CONTA) => ({
  id: 'bruno',
  nome: 'Bruno Costa',
  email: null,
  matricula: null,
  telefone: null,
  situacao: 'ativa',
  local: null,
  conta,
  permite: {
    editar: false,
    inativar: false,
    reativar: false,
    anonimizar: false,
    criarConta: false,
    administrarConta: false,
  },
});

const JUNDIAI = { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' } as const;
const TECNICO = { id: 'tecnico', nome: 'Técnico', situacao: 'ativo' } as const;
const LEITOR = { id: 'leitor', nome: 'Leitor', situacao: 'ativo' } as const;
const SUPORTE = { id: 'suporte', nome: 'Suporte', situacao: 'ativo' } as const;

const ACESSO: AcessoDaConta = {
  atribuicoes: [
    {
      id: 'a1',
      perfil: TECNICO,
      local: JUNDIAI,
      grupo: null,
      criadaEm: '2026-10-01T12:00:00.000Z',
      permite: { encerrar: true },
    },
    {
      id: 'a2',
      perfil: LEITOR,
      local: null,
      grupo: SUPORTE,
      criadaEm: '2026-09-20T12:00:00.000Z',
      permite: { encerrar: false },
    },
  ],
  grupos: [{ ...SUPORTE, incluidaEm: '2026-09-21T12:00:00.000Z' }],
  permissoes: [
    {
      chave: 'pessoas.ver',
      organizacao: true,
      locais: [],
      origens: [
        {
          atribuicaoId: 'a2',
          perfil: { id: 'leitor', nome: 'Leitor' },
          grupo: { id: 'suporte', nome: 'Suporte' },
          local: null,
        },
        {
          atribuicaoId: 'a1',
          perfil: { id: 'tecnico', nome: 'Técnico' },
          grupo: null,
          local: { id: 'jundiai', caminho: 'Jundiaí' },
        },
      ],
    },
    {
      chave: 'locais.editar',
      organizacao: false,
      locais: [{ id: 'jundiai', caminho: 'Jundiaí' }],
      origens: [
        {
          atribuicaoId: 'a1',
          perfil: { id: 'tecnico', nome: 'Técnico' },
          grupo: null,
          local: { id: 'jundiai', caminho: 'Jundiaí' },
        },
      ],
    },
  ],
  exigeDoisPassos: { conta: false, perfis: [] },
  permite: { atribuir: true },
};

const perfil = (id: string, nome: string, extras: Partial<Perfil> = {}): Perfil => ({
  id,
  nome,
  descricao: null,
  permissoes: [],
  todasAsPermissoes: false,
  protegido: false,
  exigeDoisPassos: false,
  diasDeConfianca: null,
  situacao: 'ativo',
  atribuicoes: 0,
  permite: { editar: true, inativar: true, reativar: false, atribuir: true, mudarPrazo: true },
  ...extras,
});

const grupo = (id: string, nome: string, extras: Partial<Grupo> = {}): Grupo => ({
  id,
  nome,
  descricao: null,
  situacao: 'ativo',
  membros: 0,
  perfis: 0,
  perfisEmVigor: [],
  permite: { editar: true, inativar: true, reativar: false, incluirMembros: true, atribuir: true },
  ...extras,
});

const ARVORE = {
  locais: [
    {
      id: 'jundiai',
      paiId: null,
      nome: 'Jundiaí',
      tipo: 'unidade',
      situacao: 'ativo',
      permite: { editar: true },
    },
  ],
  permite: { cadastrarNaRaiz: true },
};

const problema = (status: number, codigo: string, detalhe: string) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
    },
    { status },
  );

const ALMOXARIFADO = { id: 'almox', caminho: 'Jundiaí › Almoxarifado', situacao: 'ativo' } as const;
const OPERADOR = { id: 'operador', nome: 'Operador', situacao: 'ativo' } as const;

/** O Suporte, de que Bruno participa, o Almoxarifado, ativo, e o Antigo, inativo. */
const GRUPOS: Grupo[] = [
  grupo('almox', 'Almoxarifado', {
    perfisEmVigor: [{ atribuicaoId: 'g1', perfil: OPERADOR, local: ALMOXARIFADO }],
  }),
  grupo('antigo', 'Antigo', { situacao: 'inativo' }),
  grupo('suporte', 'Suporte', {
    perfisEmVigor: [{ atribuicaoId: 'a2', perfil: LEITOR, local: null }],
  }),
];

/** O acesso da conta no servidor do teste: o GET devolve como ele está, e as ações o mudam. */
function servidorDoAcesso(inicial: AcessoDaConta = ACESSO) {
  const estado = { acesso: inicial };
  const corpos: Record<string, unknown[]> = {};
  const guardar = async (pedido: Request) => {
    const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
    const texto = await pedido.text();
    corpos[caminho] = [...(corpos[caminho] ?? []), texto ? JSON.parse(texto) : null];
  };
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json(ARVORE),
    'GET /api/pessoas/bruno': () => Response.json(fichaDe()),
    'GET /api/contas/c-bruno/acesso': () => Response.json(estado.acesso),
    'GET /api/grupos': () => Response.json({ itens: GRUPOS, permite: { cadastrar: true } }),
  };
  return { servidor, estado, corpos, guardar };
}

function abrir(
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('pessoas.ver', 'acessos.administrar', 'acessos.ver'),
) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/pessoas/bruno'] }),
  );
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
    />,
  );
}

async function abaAcesso() {
  const abas = await screen.findByRole('tablist', { name: 'Ficha da pessoa' });
  fireEvent.click(within(abas).getByRole('tab', { name: 'Acesso' }));
  await screen.findByRole('heading', { level: 2, name: 'Conta' });
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso);

/** As linhas da tabela dos grupos, sem o cabeçalho. */
async function linhasDosGrupos() {
  const tabela = await screen.findByRole('grid', { name: 'Grupos da conta' });
  return within(tabela).getAllByRole('row').slice(1);
}
const textosDosGrupos = async () => (await linhasDosGrupos()).map((linha) => linha.textContent);
const lista = (nome: string) => screen.findByRole('list', { name: nome });
const itens = async (nome: string) =>
  within(await lista(nome))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('aba Acesso: perfis e grupos', () => {
  it('mostra os perfis, diretos e por grupo, com o escopo, e os grupos da conta', async () => {
    abrir(servidorDoAcesso().servidor);
    await abaAcesso();
    const [tecnico, leitor] = await itens('Perfis da conta');
    expect(tecnico).toContain('Técnico');
    expect(tecnico).toContain('Jundiaí');
    expect(tecnico).toContain('Atribuído direto à conta');
    expect(leitor).toContain('Leitor');
    expect(leitor).toContain('Organização inteira');
    expect(leitor).toContain('Pelo grupo Suporte');
    const perfis = await lista('Perfis da conta');
    expect(
      within(perfis)
        .getAllByRole('button')
        .map((botao) => botao.textContent),
    ).toEqual(['Encerrar']);
    await waitFor(async () => expect(await textosDosGrupos()).toHaveLength(2));
  });

  it('o local de cada perfil é uma referência a ele, para quem abre a tela de locais', async () => {
    abrir(
      servidorDoAcesso().servidor,
      naOrganizacao('pessoas.ver', 'acessos.administrar', 'acessos.ver', 'locais.editar'),
    );
    await abaAcesso();
    const perfis = await lista('Perfis da conta');
    expect(within(perfis).getByRole('link', { name: 'Jundiaí' }).getAttribute('href')).toBe(
      '/administracao/locais?local=jundiai',
    );
  });

  it('os grupos ativos à vista, com o que cada um dá e se a conta participa', async () => {
    abrir(servidorDoAcesso().servidor);
    await abaAcesso();
    await waitFor(async () =>
      expect(await textosDosGrupos()).toEqual([
        expect.stringContaining('Almoxarifado'),
        expect.stringContaining('Suporte'),
      ]),
    );
    const [almoxarifado, suporte] = await linhasDosGrupos();
    expect(almoxarifado?.textContent).toContain('Operador · Jundiaí › Almoxarifado');
    expect(almoxarifado?.textContent).toContain('Não participa');
    expect(within(almoxarifado as HTMLElement).getByRole('button').textContent).toBe('Incluir');
    expect(suporte?.textContent).toContain('Leitor · Organização inteira');
    expect(suporte?.textContent).toContain('Participa desde 21/09/2026');
    expect(within(suporte as HTMLElement).getByRole('button').textContent).toBe('Retirar');
    // O Antigo é inativo, e a conta não participa dele: fica de fora.
    expect(await textosDosGrupos()).not.toContainEqual(expect.stringContaining('Antigo'));
  });

  it('"O que esta conta pode fazer" mostra cada permissão com o escopo e de onde ela vem', async () => {
    const { servidor } = servidorDoAcesso({
      ...ACESSO,
      permissoes: [
        {
          chave: 'pessoas.ver',
          organizacao: false,
          locais: [{ id: 'jundiai', caminho: 'Jundiaí' }],
          origens: [
            {
              atribuicaoId: 'a3',
              perfil: { id: 'tecnico', nome: 'Técnico' },
              grupo: { id: 'suporte', nome: 'Suporte' },
              local: { id: 'jundiai', caminho: 'Jundiaí' },
            },
          ],
        },
      ],
    });
    abrir(servidor);
    await abaAcesso();
    const [permissao] = within(await lista('O que esta conta pode fazer'))
      .getAllByRole('listitem')
      .filter((item) => item.parentElement?.getAttribute('aria-label'));
    expect(
      within(permissao as HTMLElement).getByText('Ver pessoas e contas — Jundiaí'),
    ).toBeTruthy();
    expect(
      within(permissao as HTMLElement).getByText(
        'Vem do perfil Técnico em Jundiaí, pelo grupo Suporte.',
      ),
    ).toBeTruthy();
  });

  it('atribuir um perfil num local pela gaveta, com o resultado antes de confirmar', async () => {
    const { servidor, estado, corpos, guardar } = servidorDoAcesso();
    servidor['GET /api/perfis'] = () =>
      Response.json({
        itens: [
          perfil('auditor', 'Auditor', {
            descricao: 'Consulta a auditoria e edita os locais.',
            permissoes: ['auditoria.ver', 'locais.editar'],
          }),
          perfil('antigo', 'Antigo', {
            situacao: 'inativo',
            permite: {
              editar: true,
              inativar: false,
              reativar: true,
              atribuir: false,
              mudarPrazo: true,
            },
          }),
          perfil('tecnico', 'Técnico', { permissoes: ['pessoas.ver'] }),
        ],
        permite: { cadastrar: true },
      });
    servidor['POST /api/atribuicoes'] = async (pedido) => {
      await guardar(pedido);
      estado.acesso = {
        ...ACESSO,
        atribuicoes: [
          ...ACESSO.atribuicoes,
          {
            id: 'a9',
            perfil: { id: 'auditor', nome: 'Auditor', situacao: 'ativo' },
            local: JUNDIAI,
            grupo: null,
            criadaEm: '2026-10-07T12:00:00.000Z',
            permite: { encerrar: true },
          },
        ],
      };
      return Response.json(
        {
          atribuicao: {
            id: 'a9',
            perfil: { id: 'auditor', nome: 'Auditor', situacao: 'ativo' },
            conta: {
              id: 'c-bruno',
              pessoaId: 'bruno',
              nome: 'Bruno Costa',
              usuario: 'bruno.costa',
            },
            grupo: null,
            local: JUNDIAI,
            criadaEm: '2026-10-07T12:00:00.000Z',
          },
          ignoradas: ['auditoria.ver'],
        },
        { status: 201 },
      );
    };
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(await screen.findByRole('button', { name: 'Atribuir perfil' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Atribuir um perfil a Bruno Costa' });
    const resultado = () => within(gaveta).getByRole('region', { name: 'Resultado' });
    expect(resultado().textContent).toContain('Escolha o perfil.');

    // Os perfis que dá para atribuir, em rádios, com a descrição e quantas permissões têm.
    const auditor = await within(gaveta).findByRole('radio', { name: /^Auditor/ });
    expect(
      within(gaveta)
        .getAllByRole('radio', { name: /permiss/ })
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual([
      'AuditorConsulta a auditoria e edita os locais. · 2 permissões',
      'Técnico1 permissão',
    ]);
    fireEvent.click(auditor);
    expect(resultado().textContent).toContain(
      'Bruno Costa passa a ter Auditor na organização inteira.',
    );

    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Num local' }));
    expect(resultado().textContent).toContain('Escolha o local.');
    await escolherLocal('Local', 'Jundiaí', gaveta);
    expect(resultado().textContent).toContain(
      'Bruno Costa passa a ter Auditor em Jundiaí e no que está dentro.',
    );
    expect(resultado().textContent).toContain(
      'Estas permissões do Auditor não valem num local: Consultar a auditoria.',
    );

    fireEvent.click(within(gaveta).getByRole('button', { name: 'Atribuir perfil' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(corpos['POST /api/atribuicoes']).toEqual([
      { perfilId: 'auditor', contaId: 'c-bruno', localId: 'jundiai' },
    ]);
    expect(avisos()).toContainEqual(
      expect.objectContaining({
        titulo: 'Perfil atribuído.',
        descricao: 'Não vale em Jundiaí: Consultar a auditoria.',
      }),
    );
    await waitFor(async () =>
      expect(await itens('Perfis da conta')).toContainEqual(expect.stringContaining('Auditor')),
    );
  });

  it('a atribuição igual que já vale desabilita "Atribuir perfil", com o motivo', async () => {
    const { servidor } = servidorDoAcesso();
    servidor['GET /api/perfis'] = () =>
      Response.json({
        itens: [perfil('tecnico', 'Técnico'), perfil('leitor', 'Leitor')],
        permite: { cadastrar: true },
      });
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(await screen.findByRole('button', { name: 'Atribuir perfil' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Atribuir um perfil a Bruno Costa' });
    fireEvent.click(await within(gaveta).findByRole('radio', { name: /^Técnico/ }));
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Num local' }));
    await escolherLocal('Local', 'Jundiaí', gaveta);
    const resultado = within(gaveta).getByRole('region', { name: 'Resultado' });
    expect(resultado.textContent).toContain('Bruno Costa já tem Técnico em Jundiaí.');
    const atribuir = within(gaveta).getByRole('button', { name: 'Atribuir perfil' });
    expect(atribuir.hasAttribute('disabled')).toBe(true);
    expect(atribuir.getAttribute('aria-describedby')).toBe(resultado.id);

    // Trocar o perfil mantém o escopo e o local, e o resultado passa ao perfil novo.
    fireEvent.click(within(gaveta).getByRole('radio', { name: /^Leitor/ }));
    expect(within(gaveta).getByRole('radio', { name: 'Num local' })).toHaveProperty(
      'checked',
      true,
    );
    expect(resultado.textContent).toContain(
      'Bruno Costa passa a ter Leitor em Jundiaí e no que está dentro.',
    );
    expect(atribuir.hasAttribute('disabled')).toBe(false);
  });

  it('o local de trabalho da pessoa é o sugerido', async () => {
    const { servidor } = servidorDoAcesso();
    servidor['GET /api/pessoas/bruno'] = () =>
      Response.json({
        ...fichaDe(),
        local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
      });
    servidor['GET /api/perfis'] = () =>
      Response.json({ itens: [perfil('leitor', 'Leitor')], permite: { cadastrar: true } });
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(await screen.findByRole('button', { name: 'Atribuir perfil' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Atribuir um perfil a Bruno Costa' });
    fireEvent.click(within(gaveta).getByRole('radio', { name: 'Num local' }));
    const painel = await abrirEscolhaDeLocal('Local', gaveta);
    const sugerido = within(painel).getByRole('button', { name: /Jundiaí/ });
    expect(sugerido.textContent).toContain('Sugerido: local de trabalho de Bruno Costa');
  });

  it('a recusa da atribuição aparece na gaveta, que continua aberta', async () => {
    const { servidor } = servidorDoAcesso();
    servidor['GET /api/perfis'] = () =>
      Response.json({ itens: [perfil('auditor', 'Auditor')], permite: { cadastrar: true } });
    servidor['POST /api/atribuicoes'] = () =>
      problema(409, 'conflito', 'Esta atribuição já existe.');
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(await screen.findByRole('button', { name: 'Atribuir perfil' }));
    const gaveta = await screen.findByRole('dialog', { name: 'Atribuir um perfil a Bruno Costa' });
    fireEvent.click(await within(gaveta).findByRole('radio', { name: /^Auditor/ }));
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Atribuir perfil' }));
    expect(await within(gaveta).findByText('Esta atribuição já existe.')).toBeTruthy();
  });

  it('encerrar uma atribuição direta pede confirmação, e a recusa aparece nela', async () => {
    const { servidor, estado, guardar, corpos } = servidorDoAcesso();
    let recusar = true;
    servidor['DELETE /api/atribuicoes/a1'] = async (pedido) => {
      await guardar(pedido);
      if (recusar) {
        return problema(
          409,
          'ultimo-administrador',
          'A organização ficaria sem ninguém para administrar os acessos.',
        );
      }
      estado.acesso = { ...ACESSO, atribuicoes: ACESSO.atribuicoes.slice(1) };
      return new Response(null, { status: 204 });
    };
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar a atribuição de Técnico em Jundiaí' }),
    );
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Encerrar a atribuição de Técnico?',
    });
    expect(confirmacao.textContent).toContain(
      'A conta perde as permissões que vêm deste perfil em Jundiaí.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Encerrar a atribuição' }));
    expect(
      await within(confirmacao).findByText(
        'A organização ficaria sem ninguém para administrar os acessos.',
      ),
    ).toBeTruthy();

    recusar = false;
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Encerrar a atribuição' }));
    await waitFor(() =>
      expect(avisos().map((aviso) => aviso.titulo)).toContain('Atribuição encerrada.'),
    );
    expect(corpos['DELETE /api/atribuicoes/a1']).toHaveLength(2);
    await waitFor(async () =>
      expect(await itens('Perfis da conta')).toEqual([expect.stringContaining('Leitor')]),
    );
    const titulo = screen.getByRole('heading', { level: 2, name: 'Perfis' });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('inclui a conta num grupo pela linha, com o efeito antes de confirmar, e a retira', async () => {
    const { servidor, estado, corpos, guardar } = servidorDoAcesso();
    servidor['POST /api/grupos/almox/membros'] = async (pedido) => {
      await guardar(pedido);
      estado.acesso = {
        ...ACESSO,
        atribuicoes: [
          ...ACESSO.atribuicoes,
          {
            id: 'g1',
            perfil: OPERADOR,
            local: ALMOXARIFADO,
            grupo: { id: 'almox', nome: 'Almoxarifado', situacao: 'ativo' },
            criadaEm: '2026-10-07T12:00:00.000Z',
            permite: { encerrar: false },
          },
        ],
        grupos: [
          {
            id: 'almox',
            nome: 'Almoxarifado',
            situacao: 'ativo',
            incluidaEm: '2026-10-07T12:00:00.000Z',
          },
          ...ACESSO.grupos,
        ],
      };
      return Response.json({});
    };
    servidor['DELETE /api/grupos/almox/membros/c-bruno'] = async (pedido) => {
      await guardar(pedido);
      estado.acesso = ACESSO;
      return Response.json({});
    };
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(await screen.findByRole('button', { name: 'Incluir no grupo Almoxarifado' }));
    const incluir = await screen.findByRole('dialog', {
      name: 'Incluir Bruno Costa no grupo Almoxarifado?',
    });
    expect(
      within(incluir).getByText('Bruno Costa passa a ter Operador em Jundiaí › Almoxarifado.'),
    ).toBeTruthy();
    fireEvent.click(within(incluir).getByRole('button', { name: 'Incluir no grupo' }));
    await waitFor(() =>
      expect(avisos().map((aviso) => aviso.titulo)).toContain(
        'Conta incluída no grupo Almoxarifado.',
      ),
    );
    expect(corpos['POST /api/grupos/almox/membros']).toEqual([{ contaId: 'c-bruno' }]);
    await waitFor(async () =>
      expect((await textosDosGrupos())[0]).toContain('Participa desde 07/10/2026'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retirar do grupo Almoxarifado' }));
    const retirar = await screen.findByRole('alertdialog', {
      name: 'Retirar a conta do grupo Almoxarifado?',
    });
    expect(
      within(retirar).getByText('Bruno Costa deixa de ter Operador em Jundiaí › Almoxarifado.'),
    ).toBeTruthy();
    fireEvent.click(within(retirar).getByRole('button', { name: 'Retirar do grupo' }));
    await waitFor(() =>
      expect(avisos().map((aviso) => aviso.titulo)).toContain(
        'Conta retirada do grupo Almoxarifado.',
      ),
    );
    expect(corpos['DELETE /api/grupos/almox/membros/c-bruno']).toHaveLength(1);
    await waitFor(async () => expect((await textosDosGrupos())[0]).toContain('Não participa'));
  });

  it('com mais de 10 grupos, o filtro pelo nome diz quantos mostra', async () => {
    const { servidor } = servidorDoAcesso();
    const muitos = Array.from({ length: 12 }, (_, i) =>
      grupo(`g${i}`, `Grupo ${String(i + 1).padStart(2, '0')}`),
    );
    servidor['GET /api/grupos'] = () =>
      Response.json({ itens: [...muitos, ...GRUPOS], permite: { cadastrar: true } });
    abrir(servidor);
    await abaAcesso();
    const filtro = await screen.findByRole('searchbox', { name: 'Filtrar os grupos' });
    expect(screen.getByText('14 grupos.')).toBeTruthy();
    fireEvent.change(filtro, { target: { value: 'almox' } });
    await waitFor(async () =>
      expect(await textosDosGrupos()).toEqual([expect.stringContaining('Almoxarifado')]),
    );
    expect(screen.getByText('Mostrando 1 de 14 grupos.')).toBeTruthy();
  });

  it('a conta inativa não pode fazer nada, e os perfis continuam registrados', async () => {
    const { servidor } = servidorDoAcesso({ ...ACESSO, permissoes: [] });
    servidor['GET /api/pessoas/bruno'] = () =>
      Response.json(fichaDe({ ...CONTA, situacao: 'inativa' }));
    abrir(servidor);
    await abaAcesso();
    expect(await screen.findByText('Nada, enquanto a conta estiver inativa.')).toBeTruthy();
    expect(await itens('Perfis da conta')).toHaveLength(2);
  });

  it('só com acessos.ver, mostra o acesso sem as ações; sem ela, nem pede o acesso', async () => {
    const { servidor } = servidorDoAcesso({
      ...ACESSO,
      atribuicoes: ACESSO.atribuicoes.map((atribuicao) => ({
        ...atribuicao,
        permite: { encerrar: false },
      })),
      permite: { atribuir: false },
    });
    abrir(servidor, naOrganizacao('pessoas.ver', 'acessos.ver'));
    await abaAcesso();
    expect(await itens('Perfis da conta')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Atribuir perfil' })).toBeNull();
    await waitFor(async () => expect(await textosDosGrupos()).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /^Encerrar|^Retirar|^Incluir/ })).toBeNull();
    cleanup();

    const acesso = vi.fn(() => Response.json(ACESSO));
    abrir(
      { ...servidorDoAcesso().servidor, 'GET /api/contas/c-bruno/acesso': acesso },
      naOrganizacao('pessoas.ver'),
    );
    await abaAcesso();
    expect(screen.queryByRole('heading', { name: 'Perfis' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'O que esta conta pode fazer' })).toBeNull();
    expect(acesso).not.toHaveBeenCalled();
  });
});
