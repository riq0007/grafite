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

type Perfil = components['schemas']['Perfil'];
type FichaDoPerfil = components['schemas']['FichaDoPerfil'];

const ADMINISTRA = {
  editar: true,
  inativar: true,
  reativar: false,
  atribuir: true,
  mudarPrazo: true,
};
const SO_VE = {
  editar: false,
  inativar: false,
  reativar: false,
  atribuir: false,
  mudarPrazo: false,
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
  permite: ADMINISTRA,
  ...extras,
});

const ADMINISTRADOR = perfil('admin', 'Administrador', {
  todasAsPermissoes: true,
  protegido: true,
  exigeDoisPassos: true,
  atribuicoes: 1,
  permite: { ...SO_VE, atribuir: true, mudarPrazo: true },
});
const TECNICO = perfil('tecnico', 'Técnico', {
  descricao: 'Atendimento nos locais',
  permissoes: ['pessoas.editar', 'auditoria.ver'],
  atribuicoes: 2,
});
const ANTIGO = perfil('antigo', 'Antigo', {
  situacao: 'inativo',
  permite: { ...ADMINISTRA, inativar: false, reativar: true, atribuir: false },
});

const fichaDe = (base: Perfil, extras: Partial<FichaDoPerfil> = {}): FichaDoPerfil => ({
  ...base,
  quemTem: [],
  ...extras,
});

const QUEM_TEM: FichaDoPerfil['quemTem'] = [
  {
    atribuicaoId: 'a1',
    conta: {
      id: 'c-bruno',
      pessoaId: 'bruno',
      nome: 'Bruno Costa',
      usuario: 'bruno.costa',
      situacao: 'ativa',
    },
    grupo: null,
    local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
  },
  {
    atribuicaoId: 'a2',
    conta: null,
    grupo: { id: 'suporte', nome: 'Suporte', situacao: 'ativo' },
    local: null,
  },
];

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

const lista =
  (cadastrar = true) =>
  () =>
    Response.json({ itens: [ADMINISTRADOR, ANTIGO, TECNICO], permite: { cadastrar } });

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
const permissao = (inicio: string) =>
  screen.getByRole('checkbox', { name: new RegExp(`^${inicio}`) }) as HTMLInputElement;

describe('lista de perfis', () => {
  it('mostra cada perfil com as permissões, a exigência, as atribuições e a situação', async () => {
    const roteador = abrir('/administracao/perfis', { 'GET /api/perfis': lista() });
    const tabela = await screen.findByRole('grid', { name: 'Perfis' });
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((coluna) => coluna.textContent),
    ).toEqual(['Nome', 'Permissões', 'Dois passos', 'Confiança', 'Atribuições', 'Situação']);
    const [administrador, antigo, tecnico] = within(tabela).getAllByRole('row').slice(1);
    expect(administrador?.textContent).toBe('AdministradorTodasExige—1Ativo');
    expect(antigo?.textContent).toContain('Inativo');
    expect(tecnico?.textContent).toBe('Técnico3 permissõesNão exige—2Ativo');
    fireEvent.click(within(tecnico as HTMLElement).getByText('3 permissões'));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/perfis/tecnico'),
    );
  });

  // Spec componentes-base, "Situação, tempo e contagem nas tabelas" (change tabelas-consistentes).
  it('lista dos perfis: diz quantos perfis há, acima da tabela, e a atribuição como número', async () => {
    abrir('/administracao/perfis', { 'GET /api/perfis': lista() });
    const tabela = await screen.findByRole('grid', { name: 'Perfis' });
    expect(screen.getByText('3 perfis')).toBeTruthy();
    const atribuicoes = within(tabela).getByRole('columnheader', { name: 'Atribuições' });
    expect(atribuicoes.getAttribute('data-especie')).toBe('numero');
  });

  it('"Novo perfil" aparece só para quem administra os acessos e leva ao cadastro', async () => {
    abrir(
      '/administracao/perfis',
      { 'GET /api/perfis': lista(false) },
      naOrganizacao('acessos.ver'),
    );
    await screen.findByRole('grid', { name: 'Perfis' });
    expect(screen.queryByRole('button', { name: 'Novo perfil' })).toBeNull();
    cleanup();

    const roteador = abrir('/administracao/perfis', { 'GET /api/perfis': lista() });
    fireEvent.click(await screen.findByRole('button', { name: 'Novo perfil' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/perfis/novo'),
    );
  });
});

describe('perfil novo', () => {
  it('confere o nome, envia as permissões escolhidas e abre a ficha', async () => {
    const corpos: unknown[] = [];
    const roteador = abrir('/administracao/perfis/novo', {
      'POST /api/perfis': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(fichaDe(TECNICO), { status: 201 });
      },
      'GET /api/perfis/tecnico': () => Response.json(fichaDe(TECNICO)),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo perfil' });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome do perfil.')).toBeTruthy();
    expect(corpos).toEqual([]);

    fireEvent.change(campo('Nome'), { target: { value: '  Técnico ' } });
    fireEvent.change(campo('Descrição'), { target: { value: 'Atendimento nos locais' } });
    fireEvent.click(permissao('Cadastrar e editar pessoas'));
    const ver = permissao('Ver pessoas e contas');
    expect(ver.checked).toBe(true);
    expect(ver.disabled).toBe(true);
    expect(ver.closest('label')?.textContent).toContain(
      'Incluída por “Cadastrar e editar pessoas, inativar e reativar”',
    );
    fireEvent.click(permissao('Consultar a auditoria'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Exige verificação em dois passos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/perfis/tecnico'),
    );
    expect(corpos).toEqual([
      {
        nome: 'Técnico',
        descricao: 'Atendimento nos locais',
        permissoes: ['pessoas.editar', 'auditoria.ver'],
        exigeDoisPassos: true,
      },
    ]);
    expect(avisos()).toContain('Perfil cadastrado.');
  });

  it('o nome repetido aparece no campo, e o formulário continua preenchido', async () => {
    abrir('/administracao/perfis/novo', {
      'POST /api/perfis': () =>
        problema(409, 'conflito', 'Já existe um perfil com este nome.', {
          nome: 'Já existe um perfil com este nome.',
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo perfil' });
    fireEvent.change(campo('Nome'), { target: { value: 'tecnico' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Já existe um perfil com este nome.')).toBeTruthy();
    expect(campo('Nome').getAttribute('aria-invalid')).toBe('true');
    expect(campo('Nome').value).toBe('tecnico');
  });

  it('sem acessos.administrar, o cadastro diz a quem pedir acesso', async () => {
    abrir(
      '/administracao/perfis/novo',
      {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
      },
      naOrganizacao('acessos.ver'),
    );
    expect(await screen.findByText('Você não tem acesso ao cadastro de perfis.')).toBeTruthy();
  });
});

describe('ficha do perfil', () => {
  it('mostra as permissões por área, marca as só da organização e as incluídas, e quem tem', async () => {
    abrir('/administracao/perfis/tecnico', {
      'GET /api/perfis/tecnico': () => Response.json(fichaDe(TECNICO, { quemTem: QUEM_TEM })),
    });
    const titulo = await screen.findByRole('heading', { level: 1, name: /Técnico/ });
    expect(titulo.textContent).toContain('Ativo');
    await waitFor(() => expect(campo('Nome').value).toBe('Técnico'));
    for (const area of ['Pessoas', 'Acessos', 'Locais', 'Auditoria']) {
      expect(screen.getByRole('group', { name: area }), area).toBeTruthy();
    }
    const ver = permissao('Ver pessoas e contas');
    expect(ver.checked).toBe(true);
    expect(ver.disabled).toBe(true);
    expect(permissao('Consultar a auditoria').closest('label')?.textContent).toContain(
      'Só na organização inteira',
    );
    expect(permissao('Cadastrar e editar pessoas').checked).toBe(true);
    expect(permissao('Cadastrar, renomear').checked).toBe(false);

    const quem = within(screen.getByRole('list', { name: 'Quem tem o perfil' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(quem[0]).toContain('Bruno Costa');
    expect(quem[0]).toContain('bruno.costa');
    expect(quem[0]).toContain('Jundiaí');
    expect(quem[1]).toContain('Grupo Suporte');
    expect(quem[1]).toContain('Organização inteira');
    expect(screen.getByRole('link', { name: 'Bruno Costa' }).getAttribute('href')).toBe(
      '/administracao/pessoas/bruno',
    );
  });

  it('salva as permissões e a exigência, e avisa', async () => {
    const corpos: unknown[] = [];
    abrir('/administracao/perfis/tecnico', {
      'GET /api/perfis/tecnico': () => Response.json(fichaDe(TECNICO)),
      'PATCH /api/perfis/tecnico': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(fichaDe({ ...TECNICO, permissoes: ['pessoas.editar'] }));
      },
    });
    await waitFor(() => expect(campo('Nome').value).toBe('Técnico'));
    fireEvent.click(permissao('Consultar a auditoria'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Perfil salvo.'));
    expect(corpos).toEqual([
      {
        nome: 'Técnico',
        descricao: 'Atendimento nos locais',
        permissoes: ['pessoas.editar'],
        exigeDoisPassos: false,
      },
    ]);
  });

  it('o Administrador é protegido: a ficha diz isso e não oferece alteração', async () => {
    abrir('/administracao/perfis/admin', {
      'GET /api/perfis/admin': () => Response.json(fichaDe(ADMINISTRADOR)),
    });
    expect(
      await screen.findByText(
        'Perfil protegido: tem todas as permissões, e só o prazo da confiança nos aparelhos muda.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(campo('Nome').value).toBe('Administrador'));
    expect(campo('Nome').readOnly).toBe(true);
    const caixas = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(caixas.length).toBeGreaterThan(8);
    expect(caixas.every((caixa) => caixa.checked)).toBe(true);
    for (const nome of ['Salvar alterações', 'Inativar', 'Reativar']) {
      expect(screen.queryByRole('button', { name: nome }), nome).toBeNull();
    }
  });

  it('inativar pede confirmação e mostra a recusa; reativar volta o perfil', async () => {
    let recusar = true;
    let atual = fichaDe(TECNICO);
    abrir('/administracao/perfis/tecnico', {
      'GET /api/perfis/tecnico': () => Response.json(atual),
      'POST /api/perfis/tecnico/inativacao': () => {
        if (recusar) {
          return problema(
            409,
            'ultimo-administrador',
            'A organização ficaria sem ninguém para administrar os acessos.',
          );
        }
        atual = fichaDe({
          ...TECNICO,
          situacao: 'inativo',
          permite: { ...ADMINISTRA, inativar: false, reativar: true, atribuir: false },
        });
        return Response.json(atual);
      },
      'POST /api/perfis/tecnico/reativacao': () => {
        atual = fichaDe(TECNICO);
        return Response.json(atual);
      },
    });
    const titulo = await screen.findByRole('heading', { level: 1, name: /Técnico/ });
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar o perfil Técnico?',
    });
    expect(confirmacao.textContent).toContain(
      'O perfil deixa de conceder permissões e de exigir a verificação em dois passos.',
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o perfil' }));
    expect(
      await within(confirmacao).findByText(
        'A organização ficaria sem ninguém para administrar os acessos.',
      ),
    ).toBeTruthy();

    recusar = false;
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar o perfil' }));
    await waitFor(() => expect(avisos()).toContain('Perfil inativado.'));
    await waitFor(() => expect(titulo.textContent).toContain('Inativo'));
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(avisos()).toContain('Perfil reativado.'));
    await waitFor(() => expect(titulo.textContent).toContain('Ativo'));
  });

  it('só com acessos.ver, a ficha mostra o perfil sem alteração', async () => {
    abrir(
      '/administracao/perfis/tecnico',
      { 'GET /api/perfis/tecnico': () => Response.json(fichaDe({ ...TECNICO, permite: SO_VE })) },
      naOrganizacao('acessos.ver'),
    );
    await waitFor(() => expect(campo('Nome').value).toBe('Técnico'));
    expect(campo('Nome').readOnly).toBe(true);
    expect(permissao('Consultar a auditoria').getAttribute('aria-readonly')).toBe('true');
    for (const nome of ['Salvar alterações', 'Inativar']) {
      expect(screen.queryByRole('button', { name: nome }), nome).toBeNull();
    }
  });

  it('com auditoria.ver, a ficha leva à auditoria filtrada pelo perfil', async () => {
    const roteador = abrir(
      '/administracao/perfis/tecnico',
      { 'GET /api/perfis/tecnico': () => Response.json(fichaDe(TECNICO)) },
      naOrganizacao('acessos.ver', 'auditoria.ver'),
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Ver na auditoria' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/administracao/auditoria'));
    expect(roteador.state.location.search).toEqual({
      alvo: ['perfil:tecnico'],
      nomeDoAlvo: 'Técnico',
    });
    cleanup();

    abrir('/administracao/perfis/tecnico', {
      'GET /api/perfis/tecnico': () => Response.json(fichaDe(TECNICO)),
    });
    await screen.findByRole('heading', { level: 1, name: /Técnico/ });
    expect(screen.queryByRole('link', { name: 'Ver na auditoria' })).toBeNull();
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

describe('ficha do perfil relida com outros dados', () => {
  it('o título mostra o nome novo, e o que foi digitado continua no formulário', async () => {
    const canal = criarCanalDeEventos();
    let atual = fichaDe(TECNICO);
    abrir(
      '/administracao/perfis/tecnico',
      { 'GET /api/perfis/tecnico': () => Response.json(atual) },
      undefined,
      canal,
    );
    await waitFor(() => expect(campo('Nome').value).toBe('Técnico'));
    fireEvent.change(campo('Descrição'), { target: { value: 'Atende nos locais' } });

    // Em outro lugar, o perfil é renomeado.
    atual = fichaDe({ ...TECNICO, nome: 'Técnico de campo' });
    canal.publicar(eventoDe('acessos.mudaram'));
    expect(await screen.findByRole('heading', { level: 1, name: /Técnico de campo/ })).toBeTruthy();
    expect(campo('Descrição').value).toBe('Atende nos locais');
    expect(campo('Nome').value).toBe('Técnico');
  });
});

// Spec perfis-e-grupos, "Prazo da confiança no perfil e na organização" (change aparelho-confiavel,
// design, decisão 6).
describe('o prazo da confiança', () => {
  const EFEITO =
    'Reduzir o prazo, ou pedir o código sempre, vale já na entrada seguinte de cada conta.';
  const politica =
    (dias = 30) =>
    () =>
      Response.json({ diasDeConfianca: dias });

  it('Prazo da organização: "Mudar…" passa a 7 dias, com o efeito dito antes de salvar', async () => {
    let gravado: unknown = null;
    abrir('/administracao/perfis', {
      'GET /api/perfis': lista(),
      'GET /api/politica-de-entrada': () =>
        Response.json({ diasDeConfianca: gravado === null ? 30 : 7 }),
      'PUT /api/politica-de-entrada': async (pedido) => {
        gravado = await pedido.json();
        return Response.json({ diasDeConfianca: 7 });
      },
    });
    expect(await screen.findByText('Confiança nos aparelhos: 30 dias')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mudar…' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Prazo da confiança da organização',
    });
    expect(within(dialogo).getByText(EFEITO)).toBeTruthy();
    // A organização é o nível de cima: não tem o que seguir.
    expect(within(dialogo).queryByRole('radio', { name: /Seguir/ })).toBeNull();
    expect(
      (within(dialogo).getByRole('radio', { name: 'Um número de dias' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Dias' }), {
      target: { value: '7' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(gravado).toEqual({ diasDeConfianca: 7 }));
    expect(await screen.findByText('Confiança nos aparelhos: 7 dias')).toBeTruthy();
    expect(avisos()).toContain('Prazo da confiança alterado.');
  });

  it('o prazo fora de 0 a 90 é recusado no campo, sem salvar', async () => {
    abrir('/administracao/perfis', {
      'GET /api/perfis': lista(),
      'GET /api/politica-de-entrada': politica(),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar…' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Prazo da confiança da organização',
    });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Dias' }), {
      target: { value: '120' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialogo).findByText('Informe um prazo de 0 a 90 dias.')).toBeTruthy();
  });

  it('Quem só vê os acessos: vê o prazo da organização, sem "Mudar…"', async () => {
    abrir(
      '/administracao/perfis',
      { 'GET /api/perfis': lista(false), 'GET /api/politica-de-entrada': politica() },
      naOrganizacao('acessos.ver'),
    );
    expect(await screen.findByText('Confiança nos aparelhos: 30 dias')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mudar…' })).toBeNull();
  });

  it('a lista mostra o prazo de cada perfil que tem um', async () => {
    abrir('/administracao/perfis', {
      'GET /api/perfis': () =>
        Response.json({
          itens: [
            { ...ADMINISTRADOR, diasDeConfianca: 0 },
            { ...TECNICO, diasDeConfianca: 7 },
            ANTIGO,
          ],
          permite: { cadastrar: true },
        }),
      'GET /api/politica-de-entrada': politica(),
    });
    expect(await screen.findByRole('columnheader', { name: 'Confiança' })).toBeTruthy();
    const linhaDe = (nome: string) => screen.getByText(nome).closest('[role="row"]') as HTMLElement;
    expect(within(linhaDe('Administrador')).getByText('Em toda entrada')).toBeTruthy();
    expect(within(linhaDe('Técnico')).getByText('7 dias')).toBeTruthy();
    expect(within(linhaDe('Antigo')).getByText('—')).toBeTruthy();
  });

  it('Perfil mais exigente: o Administrador, protegido, passa a pedir o código em toda entrada', async () => {
    let gravado: unknown = null;
    abrir('/administracao/perfis/admin', {
      'GET /api/perfis/admin': () =>
        Response.json(fichaDe({ ...ADMINISTRADOR, diasDeConfianca: gravado === null ? null : 0 })),
      'PUT /api/perfis/admin/prazo-da-confianca': async (pedido) => {
        gravado = await pedido.json();
        return Response.json(fichaDe({ ...ADMINISTRADOR, diasDeConfianca: 0 }));
      },
    });
    expect(await screen.findByText('Confiança nos aparelhos: segue a organização')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mudar…' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Prazo da confiança do perfil Administrador',
    });
    expect(
      (within(dialogo).getByRole('radio', { name: 'Seguir a organização' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Pedir o código em toda entrada' }));
    expect(within(dialogo).queryByRole('textbox', { name: 'Dias' })).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(() => expect(gravado).toEqual({ dias: 0 }));
    expect(await screen.findByText('Confiança nos aparelhos: em toda entrada')).toBeTruthy();
    expect(avisos()).toContain('Prazo da confiança alterado.');
  });

  it('sem "mudarPrazo", a ficha mostra o prazo sem "Mudar…"', async () => {
    abrir(
      '/administracao/perfis/tecnico',
      { 'GET /api/perfis/tecnico': () => Response.json(fichaDe({ ...TECNICO, permite: SO_VE })) },
      naOrganizacao('acessos.ver'),
    );
    expect(await screen.findByText('Confiança nos aparelhos: segue a organização')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mudar…' })).toBeNull();
  });
});
