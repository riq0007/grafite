import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

type Grupo = components['schemas']['Grupo'];
type FichaDoGrupo = components['schemas']['FichaDoGrupo'];

const ADMINISTRA = {
  editar: true,
  inativar: true,
  reativar: false,
  incluirMembros: true,
  atribuir: true,
};
const SO_VE = {
  editar: false,
  inativar: false,
  reativar: false,
  incluirMembros: false,
  atribuir: false,
};

const grupo = (id: string, nome: string, extras: Partial<Grupo> = {}): Grupo => ({
  id,
  nome,
  descricao: null,
  situacao: 'ativo',
  membros: 0,
  perfis: 0,
  perfisEmVigor: [],
  permite: ADMINISTRA,
  ...extras,
});

const SUPORTE = grupo('suporte', 'Suporte', {
  descricao: 'Atendimento aos usuários',
  membros: 1,
  perfis: 1,
});
const ANTIGO = grupo('antigo', 'Antigo', {
  situacao: 'inativo',
  permite: { ...ADMINISTRA, inativar: false, reativar: true, atribuir: false },
});

const BRUNO: FichaDoGrupo['membros'][number] = {
  contaId: 'c-bruno',
  pessoaId: 'bruno',
  nome: 'Bruno Costa',
  usuario: 'bruno.costa',
  situacao: 'ativa',
  incluidaEm: '2026-09-21T12:00:00.000Z',
};
const CARLA: FichaDoGrupo['membros'][number] = {
  contaId: 'c-carla',
  pessoaId: 'carla',
  nome: 'Carla Dias',
  usuario: 'carla.dias',
  situacao: 'ativa',
  incluidaEm: '2026-10-07T12:00:00.000Z',
};
const TECNICO_EM_JUNDIAI: FichaDoGrupo['perfis'][number] = {
  atribuicaoId: 'a5',
  perfil: { id: 'tecnico', nome: 'Técnico', situacao: 'ativo' },
  local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
};

const fichaDe = (base: Grupo, extras: Partial<FichaDoGrupo> = {}): FichaDoGrupo => ({
  id: base.id,
  nome: base.nome,
  descricao: base.descricao,
  situacao: base.situacao,
  permite: base.permite,
  membros: [BRUNO],
  perfis: [TECNICO_EM_JUNDIAI],
  ...extras,
});

const pessoaComConta = (id: string, nome: string, usuario: string) => ({
  id,
  nome,
  email: null,
  matricula: null,
  telefone: null,
  situacao: 'ativa',
  local: null,
  conta: { id: `c-${id}`, usuario, situacao: 'ativa' },
  permite: {
    editar: false,
    inativar: false,
    reativar: false,
    anonimizar: false,
    criarConta: false,
    administrarConta: false,
  },
});

const problema = (status: number, codigo: string, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos && { campos }),
    },
    { status },
  );

/** O grupo no servidor do teste: o GET devolve a ficha como ela está, e as ações a mudam. */
function servidorDoGrupo(inicial: FichaDoGrupo = fichaDe(SUPORTE)) {
  const estado = { ficha: inicial };
  const corpos: Record<string, unknown[]> = {};
  const guardar = async (pedido: Request) => {
    const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
    const texto = await pedido.text();
    corpos[caminho] = [...(corpos[caminho] ?? []), texto ? JSON.parse(texto) : null];
  };
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json({ locais: [], permite: { cadastrarNaRaiz: true } }),
    'GET /api/grupos/suporte': () => Response.json(estado.ficha),
  };
  return { servidor, estado, corpos, guardar };
}

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('acessos.ver', 'acessos.administrar'),
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, servidor)}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const campo = (rotulo: string) => screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;
const itens = async (nome: string) =>
  within(await screen.findByRole('list', { name: nome }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('lista de grupos', () => {
  it('mostra cada grupo com os membros, os perfis e a situação, e a linha abre a ficha', async () => {
    const roteador = abrir('/administracao/grupos', {
      'GET /api/grupos': () =>
        Response.json({ itens: [ANTIGO, SUPORTE], permite: { cadastrar: true } }),
    });
    const tabela = await screen.findByRole('grid', { name: 'Grupos' });
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Nome', 'Membros', 'Perfis', 'Situação']);
    const [antigo, suporte] = within(tabela).getAllByRole('row').slice(1);
    expect(antigo?.textContent).toBe('Antigo00Inativo');
    expect(suporte?.textContent).toBe('Suporte11Ativo');
    fireEvent.click(within(suporte as HTMLElement).getByText('Suporte'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/grupos/suporte'),
    );
  });

  it('"Novo grupo" só para quem administra; o cadastro confere o nome e abre a ficha', async () => {
    abrir(
      '/administracao/grupos',
      {
        'GET /api/grupos': () => Response.json({ itens: [SUPORTE], permite: { cadastrar: false } }),
      },
      naOrganizacao('acessos.ver'),
    );
    await screen.findByRole('grid', { name: 'Grupos' });
    expect(screen.queryByRole('button', { name: 'Novo grupo' })).toBeNull();
    cleanup();

    const corpos: unknown[] = [];
    const { servidor } = servidorDoGrupo();
    let repetido = true;
    const roteador = abrir('/administracao/grupos', {
      ...servidor,
      'GET /api/grupos': () => Response.json({ itens: [SUPORTE], permite: { cadastrar: true } }),
      'POST /api/grupos': async (pedido) => {
        corpos.push(await pedido.json());
        if (repetido) {
          return problema(409, 'conflito', 'Já existe um grupo com este nome.', {
            nome: 'Já existe um grupo com este nome.',
          });
        }
        return Response.json(fichaDe(SUPORTE, { membros: [], perfis: [] }), { status: 201 });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Novo grupo' }));
    await screen.findByRole('heading', { level: 1, name: 'Novo grupo' });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome do grupo.')).toBeTruthy();
    expect(corpos).toEqual([]);

    fireEvent.change(campo('Nome'), { target: { value: ' Suporte ' } });
    fireEvent.change(campo('Descrição'), { target: { value: 'Atendimento aos usuários' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um grupo com este nome.')).toBeTruthy();
    expect(campo('Nome').getAttribute('aria-invalid')).toBe('true');

    repetido = false;
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/grupos/suporte'),
    );
    expect(corpos.at(-1)).toEqual({ nome: 'Suporte', descricao: 'Atendimento aos usuários' });
    expect(avisos()).toContain('Grupo cadastrado.');
  });
});

describe('ficha do grupo', () => {
  it('mostra os membros e os perfis, com o escopo, e salva os dados', async () => {
    const { servidor, estado, corpos, guardar } = servidorDoGrupo();
    servidor['PATCH /api/grupos/suporte'] = async (pedido) => {
      await guardar(pedido);
      estado.ficha = { ...estado.ficha, descricao: 'Suporte aos usuários' };
      return Response.json(estado.ficha);
    };
    abrir('/administracao/grupos/suporte', servidor);
    const titulo = await screen.findByRole('heading', { level: 1, name: /Suporte/ });
    expect(titulo.textContent).toContain('Ativo');
    const [bruno] = await itens('Membros do grupo');
    expect(bruno).toContain('Bruno Costa');
    expect(bruno).toContain('bruno.costa');
    const [tecnico] = await itens('Perfis do grupo');
    expect(tecnico).toContain('Técnico');
    expect(tecnico).toContain('Jundiaí');
    expect(screen.getByRole('link', { name: 'Bruno Costa' }).getAttribute('href')).toBe(
      '/administracao/pessoas/bruno',
    );
    expect(screen.getByRole('link', { name: 'Técnico' }).getAttribute('href')).toBe(
      '/administracao/perfis/tecnico',
    );

    await waitFor(() => expect(campo('Nome').value).toBe('Suporte'));
    fireEvent.change(campo('Descrição'), { target: { value: 'Suporte aos usuários' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Grupo salvo.'));
    expect(corpos['PATCH /api/grupos/suporte']).toEqual([
      { nome: 'Suporte', descricao: 'Suporte aos usuários' },
    ]);
  });

  it('inclui uma conta pela busca e retira um membro, com confirmação', async () => {
    const { servidor, estado, corpos, guardar } = servidorDoGrupo();
    const buscas: URLSearchParams[] = [];
    servidor['GET /api/pessoas'] = (pedido) => {
      buscas.push(new URL(pedido.url).searchParams);
      return Response.json({
        itens: [
          pessoaComConta('bruno', 'Bruno Costa', 'bruno.costa'),
          pessoaComConta('carla', 'Carla Dias', 'carla.dias'),
        ],
        proximo: null,
        total: 2,
      });
    };
    servidor['POST /api/grupos/suporte/membros'] = async (pedido) => {
      await guardar(pedido);
      estado.ficha = { ...estado.ficha, membros: [BRUNO, CARLA] };
      return Response.json(estado.ficha);
    };
    servidor['DELETE /api/grupos/suporte/membros/c-bruno'] = async (pedido) => {
      await guardar(pedido);
      estado.ficha = { ...estado.ficha, membros: [CARLA] };
      return Response.json(estado.ficha);
    };
    abrir('/administracao/grupos/suporte', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Incluir conta' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Incluir uma conta no grupo Suporte',
    });
    const conta = within(dialogo).getByRole('combobox', { name: 'Conta' });
    conta.focus();
    fireEvent.change(conta, { target: { value: 'dias' } });
    const opcoes = (await screen.findAllByRole('option')).map((opcao) => opcao.textContent);
    expect(opcoes).toEqual(['Carla Dias (carla.dias)']);
    expect(buscas.at(-1)?.get('busca')).toBe('dias');
    expect(buscas.at(-1)?.get('conta')).toBe('com');
    fireEvent.click(screen.getByRole('option', { name: 'Carla Dias (carla.dias)' }));
    // A escolha fecha as sugestões, e o resto do diálogo volta a aparecer para o leitor de tela.
    fireEvent.click(await within(dialogo).findByRole('button', { name: 'Incluir' }));
    await waitFor(() => expect(avisos()).toContain('Conta incluída no grupo Suporte.'));
    expect(corpos['POST /api/grupos/suporte/membros']).toEqual([{ contaId: 'c-carla' }]);
    await waitFor(async () => expect(await itens('Membros do grupo')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: 'Retirar Bruno Costa do grupo' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Retirar Bruno Costa do grupo Suporte?',
    });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Retirar do grupo' }));
    await waitFor(() => expect(avisos()).toContain('Conta retirada do grupo Suporte.'));
    await waitFor(async () =>
      expect(await itens('Membros do grupo')).toEqual([expect.stringContaining('Carla Dias')]),
    );
    const membros = screen.getByRole('heading', { level: 2, name: 'Membros' });
    await waitFor(() => expect(document.activeElement).toBe(membros));
  });

  it('atribui um perfil ao grupo e encerra uma atribuição dele', async () => {
    const { servidor, estado, corpos, guardar } = servidorDoGrupo();
    servidor['GET /api/perfis'] = () =>
      Response.json({
        itens: [
          {
            id: 'leitor',
            nome: 'Leitor',
            descricao: null,
            permissoes: ['pessoas.ver'],
            todasAsPermissoes: false,
            protegido: false,
            exigeDoisPassos: false,
            situacao: 'ativo',
            atribuicoes: 0,
            permite: { editar: true, inativar: true, reativar: false, atribuir: true },
          },
        ],
        permite: { cadastrar: true },
      });
    servidor['POST /api/atribuicoes'] = async (pedido) => {
      await guardar(pedido);
      const leitor = {
        atribuicaoId: 'a6',
        perfil: { id: 'leitor', nome: 'Leitor', situacao: 'ativo' as const },
        local: null,
      };
      estado.ficha = { ...estado.ficha, perfis: [...estado.ficha.perfis, leitor] };
      return Response.json(
        {
          atribuicao: {
            id: 'a6',
            perfil: leitor.perfil,
            conta: null,
            grupo: { id: 'suporte', nome: 'Suporte', situacao: 'ativo' },
            local: null,
            criadaEm: '2026-10-07T12:00:00.000Z',
          },
          ignoradas: [],
        },
        { status: 201 },
      );
    };
    servidor['DELETE /api/atribuicoes/a5'] = async (pedido) => {
      await guardar(pedido);
      estado.ficha = {
        ...estado.ficha,
        perfis: estado.ficha.perfis.filter((perfil) => perfil.atribuicaoId !== 'a5'),
      };
      return new Response(null, { status: 204 });
    };
    abrir('/administracao/grupos/suporte', servidor);
    fireEvent.click(await screen.findByRole('button', { name: 'Atribuir perfil' }));
    const gaveta = await screen.findByRole('dialog', {
      name: 'Atribuir um perfil ao grupo Suporte',
    });
    fireEvent.click(await within(gaveta).findByRole('radio', { name: /^Leitor/ }));
    expect(within(gaveta).getByRole('region', { name: 'Resultado' }).textContent).toContain(
      'O grupo Suporte passa a ter Leitor na organização inteira.',
    );
    fireEvent.click(within(gaveta).getByRole('button', { name: 'Atribuir perfil' }));
    await waitFor(() => expect(avisos()).toContain('Perfil atribuído.'));
    expect(corpos['POST /api/atribuicoes']).toEqual([
      { perfilId: 'leitor', grupoId: 'suporte', localId: null },
    ]);
    await waitFor(async () => expect(await itens('Perfis do grupo')).toHaveLength(2));

    fireEvent.click(
      screen.getByRole('button', { name: 'Encerrar a atribuição de Técnico em Jundiaí' }),
    );
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Encerrar a atribuição de Técnico?',
    });
    expect(confirmacao.textContent).toContain(
      'Os membros perdem as permissões que vêm deste perfil em Jundiaí.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Encerrar a atribuição' }));
    await waitFor(() => expect(avisos()).toContain('Atribuição encerrada.'));
    await waitFor(async () =>
      expect(await itens('Perfis do grupo')).toEqual([expect.stringContaining('Leitor')]),
    );
  });

  it('inativar pede confirmação e mostra a recusa; reativar volta o grupo', async () => {
    const { servidor, estado } = servidorDoGrupo();
    let recusar = true;
    servidor['POST /api/grupos/suporte/inativacao'] = () => {
      if (recusar) {
        return problema(
          409,
          'ultimo-administrador',
          'A organização ficaria sem ninguém para administrar os acessos.',
        );
      }
      estado.ficha = fichaDe({
        ...SUPORTE,
        situacao: 'inativo',
        permite: { ...ADMINISTRA, inativar: false, reativar: true, atribuir: false },
      });
      return Response.json(estado.ficha);
    };
    servidor['POST /api/grupos/suporte/reativacao'] = () => {
      estado.ficha = fichaDe(SUPORTE);
      return Response.json(estado.ficha);
    };
    abrir('/administracao/grupos/suporte', servidor);
    const titulo = await screen.findByRole('heading', { level: 1, name: /Suporte/ });
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o grupo Suporte?',
    });
    expect(confirmacao.textContent).toContain('Os membros deixam de receber os perfis do grupo.');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o grupo' }));
    expect(
      await within(confirmacao).findByText(
        'A organização ficaria sem ninguém para administrar os acessos.',
      ),
    ).toBeTruthy();

    recusar = false;
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o grupo' }));
    await waitFor(() => expect(avisos()).toContain('Grupo inativado.'));
    await waitFor(() => expect(titulo.textContent).toContain('Inativo'));
    expect(screen.queryByRole('button', { name: 'Atribuir perfil' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Grupo reativado.'));
    await waitFor(() => expect(titulo.textContent).toContain('Ativo'));
  });

  it('só com acessos.ver, a ficha mostra o grupo sem nenhuma ação', async () => {
    const { servidor } = servidorDoGrupo(fichaDe({ ...SUPORTE, permite: SO_VE }));
    abrir('/administracao/grupos/suporte', servidor, naOrganizacao('acessos.ver'));
    await waitFor(() => expect(campo('Nome').value).toBe('Suporte'));
    expect(campo('Nome').readOnly).toBe(true);
    await itens('Membros do grupo');
    for (const nome of [
      'Salvar alterações',
      'Inativar',
      'Incluir conta',
      'Atribuir perfil',
      'Retirar Bruno Costa do grupo',
      'Encerrar a atribuição de Técnico em Jundiaí',
    ]) {
      expect(screen.queryByRole('button', { name: nome }), nome).toBeNull();
    }
  });

  it('com auditoria.ver, a ficha leva à auditoria filtrada pelo grupo', async () => {
    const roteador = abrir(
      '/administracao/grupos/suporte',
      servidorDoGrupo().servidor,
      naOrganizacao('acessos.ver', 'auditoria.ver'),
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Ver na auditoria' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/administracao/auditoria'));
    expect(roteador.state.location.search).toEqual({
      alvo: ['grupo:suporte'],
      nomeDoAlvo: 'Suporte',
    });
  });
});

/** Um evento como a conexão o publicaria, avisando que um registro mudou em outro lugar. */
const eventoDe = (
  tipo: 'pessoas.mudaram' | 'acessos.mudaram' | 'locais.mudaram',
  alvo = null as null | { tipo: string; id: string },
) => ({
  id: `${tipo}-${Math.random()}`,
  tipo,
  momento: '2026-10-07T12:00:00.000Z',
  alvo,
});

describe('ficha do grupo relida com outros dados', () => {
  it('o título mostra o nome novo, e o que foi digitado continua no formulário', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDoGrupo();
    abrir('/administracao/grupos/suporte', servidor, undefined, canal);
    await waitFor(() => expect(campo('Nome').value).toBe('Suporte'));
    fireEvent.change(campo('Descrição'), { target: { value: 'Atende os usuários' } });

    // Em outro lugar, o grupo é renomeado.
    estado.ficha = { ...estado.ficha, nome: 'Suporte N1' };
    canal.publicar(eventoDe('acessos.mudaram'));
    expect(await screen.findByRole('heading', { level: 1, name: /Suporte N1/ })).toBeTruthy();
    expect(campo('Descrição').value).toBe('Atende os usuários');
    expect(campo('Nome').value).toBe('Suporte');
  });
});
