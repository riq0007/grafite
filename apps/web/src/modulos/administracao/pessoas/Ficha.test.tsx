import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import { noComputador } from '../../../teste/postura.ts';
import {
  estadoDaSessaoAtiva,
  naOrganizacao,
  type ServidorDeTeste,
  sessaoAtiva,
} from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const PERMITE_TUDO = {
  editar: true,
  inativar: true,
  reativar: false,
  anonimizar: false,
  criarConta: true,
  administrarConta: true,
};

const fichaDe = (extras: Record<string, unknown> = {}) => ({
  id: 'joao',
  nome: 'João da Silva',
  email: 'joao@empresa.com.br',
  matricula: '004512',
  telefone: null,
  situacao: 'ativa',
  local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
  conta: null,
  permite: PERMITE_TUDO,
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

function abrir(
  endereco: string,
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('pessoas.ver', 'pessoas.editar'),
  canal: CanalDeEventos = criarCanalDeEventos(),
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(permissoes, {
        'GET /api/locais': () => Response.json(ARVORE),
        ...servidor,
      })}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const campo = (rotulo: string) => screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;

// Os ativos sob responsabilidade (spec modulo-administracao, "Ativos da pessoa na ficha"): a relação
// que o módulo Ativos registra para a ficha da pessoa (change relacoes-vivas, decisão 4).
describe('os ativos sob responsabilidade na ficha da pessoa', () => {
  const RESUMO = {
    id: 'joao',
    nome: 'João da Silva',
    situacao: 'ativa',
    foto: null,
    local: { id: 'jundiai', caminho: 'Jundiaí' },
    temConta: false,
    ativos: { quantos: 3, recortada: false },
  };

  it('a aba Dados mostra quantos, com "Ver na tabela", e a linha some com o módulo desligado', async () => {
    noComputador();
    let desligados: string[] = [];
    const permissoes = naOrganizacao('pessoas.ver', 'ativos.ver');
    const sessao = sessaoAtiva(permissoes, {
      'GET /api/locais': () => Response.json(ARVORE),
      'GET /api/pessoas/joao': () => Response.json(fichaDe()),
      'GET /api/pessoas/joao/resumo': () => Response.json(RESUMO),
      'GET /api/sessao': () => estadoDaSessaoAtiva(permissoes, { modulosDesligados: desligados }),
    });
    render(
      <App
        roteador={criarRoteador(
          createMemoryHistory({ initialEntries: ['/administracao/pessoas/joao'] }),
        )}
        sessao={sessao}
        consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
        canal={criarCanalDeEventos()}
      />,
    );
    expect(await screen.findByText('Ativos sob responsabilidade: 3')).toBeTruthy();
    const ver = new URL(
      screen.getByRole('link', { name: 'Ver na tabela' }).getAttribute('href') ?? '',
      'http://grafite.local',
    );
    expect(ver.pathname).toBe('/ativos');
    expect(ver.searchParams.get('origem')).toBe('pessoa:joao');

    desligados = ['ativos'];
    await act(() => sessao.validar());
    await waitFor(() => expect(screen.queryByText('Ativos sob responsabilidade: 3')).toBeNull());
  });

  it('para quem não vê ativos, a aba Dados não tem a linha', async () => {
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(fichaDe()),
      'GET /api/pessoas/joao/resumo': () => Response.json({ ...RESUMO, ativos: null }),
    });
    await screen.findByRole('textbox', { name: 'Nome' });
    expect(screen.queryByText(/Ativos sob responsabilidade/)).toBeNull();
  });
});
const preencher = (rotulo: string, valor: string) =>
  fireEvent.change(campo(rotulo), { target: { value: valor } });
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);

describe('pessoa nova', () => {
  it('confere as regras do domínio antes de enviar', async () => {
    const cadastrar = vi.fn(() => Response.json(fichaDe(), { status: 201 }));
    abrir('/administracao/pessoas/nova', { 'POST /api/pessoas': cadastrar });
    await screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
    preencher('E-mail', 'joao@');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Informe o nome.')).toBeTruthy();
    expect(screen.getByText('Informe um e-mail válido, como nome@empresa.com.br.')).toBeTruthy();
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it('cadastra com os dados limpos, avisa "Pessoa cadastrada." e abre a ficha', async () => {
    const corpos: unknown[] = [];
    const roteador = abrir('/administracao/pessoas/nova', {
      'POST /api/pessoas': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(fichaDe(), { status: 201 });
      },
      'GET /api/pessoas/joao': () => Response.json(fichaDe()),
    });
    await screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
    preencher('Nome', '  João   da Silva ');
    preencher('Matrícula', '004512');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/administracao/pessoas/joao'),
    );
    expect(corpos).toEqual([
      { nome: 'João da Silva', email: null, matricula: '004512', telefone: null, localId: null },
    ]);
    expect(avisos()).toContain('Pessoa cadastrada.');
  });

  it('a recusa da API aparece no campo, e o formulário continua preenchido', async () => {
    abrir('/administracao/pessoas/nova', {
      'POST /api/pessoas': () =>
        problema(409, 'conflito', 'Esta matrícula já é de outra pessoa.', {
          matricula: 'Esta matrícula já é de outra pessoa.',
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Nova pessoa' });
    preencher('Nome', 'João da Silva');
    preencher('Matrícula', '004512');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('Esta matrícula já é de outra pessoa.')).toBeTruthy();
    expect(campo('Matrícula').getAttribute('aria-invalid')).toBe('true');
    expect(campo('Nome').value).toBe('João da Silva');
  });

  it('sem pessoas.editar, o cadastro diz a quem pedir acesso', async () => {
    abrir(
      '/administracao/pessoas/nova',
      {
        'GET /api/acesso/administradores': () => Response.json({ administradores: ['Ana Souza'] }),
      },
      naOrganizacao('pessoas.ver'),
    );
    expect(await screen.findByText('Você não tem acesso ao cadastro de pessoas.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cadastrar' })).toBeNull();
  });
});

describe('ficha da pessoa, aba Dados', () => {
  it('mostra o nome e a situação no título e os dados no formulário', async () => {
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(fichaDe()),
    });
    const titulo = await screen.findByRole('heading', { level: 1, name: /João da Silva/ });
    expect(titulo.textContent).toContain('Ativa');
    const abas = screen.getByRole('tablist', { name: 'Ficha da pessoa' });
    expect(within(abas).getByRole('tab', { name: 'Dados' })).toBeTruthy();
    await waitFor(() => expect(campo('Nome').value).toBe('João da Silva'));
    expect(campo('Matrícula').value).toBe('004512');
  });

  it('salva as alterações e avisa', async () => {
    const corpos: unknown[] = [];
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(fichaDe()),
      'PATCH /api/pessoas/joao': async (pedido) => {
        corpos.push(await pedido.json());
        return Response.json(fichaDe({ telefone: '(11) 4000-0000' }));
      },
    });
    await waitFor(() => expect(campo('Nome').value).toBe('João da Silva'));
    preencher('Telefone', '(11) 4000-0000');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(avisos()).toContain('Dados da pessoa salvos.'));
    expect(corpos).toEqual([
      {
        nome: 'João da Silva',
        email: 'joao@empresa.com.br',
        matricula: '004512',
        telefone: '(11) 4000-0000',
        localId: 'jundiai',
      },
    ]);
  });

  it('sem permissão de editar, os dados aparecem só para leitura, sem ação', async () => {
    abrir(
      '/administracao/pessoas/joao',
      {
        'GET /api/pessoas/joao': () =>
          Response.json(fichaDe({ permite: { ...PERMITE_TUDO, editar: false } })),
      },
      naOrganizacao('pessoas.ver'),
    );
    await waitFor(() => expect(campo('Nome').value).toBe('João da Silva'));
    expect(campo('Nome').readOnly).toBe(true);
    expect(campo('Matrícula').readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
  });

  it('uma pessoa que não existe diz isso', async () => {
    abrir('/administracao/pessoas/ninguem', {
      'GET /api/pessoas/ninguem': () => problema(404, 'nao-encontrado', 'Pessoa não encontrada.'),
    });
    expect(await screen.findByText('Pessoa não encontrada.')).toBeTruthy();
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

describe('ficha da pessoa relida com outros dados', () => {
  it('o título mostra o que mudou, e o que foi digitado continua no formulário', async () => {
    const canal = criarCanalDeEventos();
    let ficha = fichaDe();
    let leituras = 0;
    abrir(
      '/administracao/pessoas/joao',
      {
        'GET /api/pessoas/joao': () => {
          leituras++;
          return Response.json(ficha);
        },
      },
      undefined,
      canal,
    );
    await waitFor(() => expect(campo('Nome').value).toBe('João da Silva'));
    preencher('Nome', 'João Pedro da Silva');

    // Em outro lugar, o telefone de João muda, e ele é inativado.
    ficha = fichaDe({ telefone: '(11) 4000-0000', situacao: 'inativa' });
    canal.publicar(eventoDe('pessoas.mudaram', { tipo: 'pessoa', id: 'joao' }));
    await waitFor(() => expect(leituras).toBe(2));
    const titulo = await screen.findByRole('heading', { level: 1, name: /João da Silva/ });
    await waitFor(() => expect(titulo.textContent).toContain('Inativa'));
    expect(campo('Nome').value).toBe('João Pedro da Silva');
  });
});

describe('foto da pessoa na ficha', () => {
  const FOTO = { id: '0199a6e0-0000-7000-8000-0000000000f1' };
  const NOVA = { id: '0199a6e0-0000-7000-8000-0000000000f2' };
  const fotoDoTitulo = async () =>
    (await screen.findByRole('heading', { level: 1, name: /João da Silva/ })).querySelector('img');
  const escolha = () => screen.findByRole('group', { name: 'Foto de João da Silva' });
  const PNG = () => new File(['png'], 'foto.png', { type: 'image/png' });

  /** Escolhe o arquivo no campo de "Trocar foto", como a escolha de arquivos do sistema. */
  async function escolherArquivo(arquivo: File) {
    const campoDeArquivo = (await escolha()).querySelector('input[type="file"]') as HTMLElement;
    fireEvent.change(campoDeArquivo, { target: { files: [arquivo] } });
  }

  it('mostra a foto no título e na aba Dados, com "Trocar foto" e "Remover foto"', async () => {
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(fichaDe({ foto: FOTO })),
    });
    expect((await fotoDoTitulo())?.getAttribute('srcset')).toContain(
      `/api/pessoas/joao/foto/${FOTO.id}/64 64w`,
    );
    const parte = await escolha();
    expect(parte.querySelector('img')?.getAttribute('srcset')).toContain(FOTO.id);
    expect(within(parte).getByRole('button', { name: 'Trocar foto' })).toBeTruthy();
    expect(within(parte).getByRole('button', { name: 'Remover foto' })).toBeTruthy();
  });

  it('sem foto, o título mostra as iniciais, e não há "Remover foto"', async () => {
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(fichaDe()),
    });
    const titulo = await screen.findByRole('heading', { level: 1, name: /João da Silva/ });
    expect(titulo.querySelector('img')).toBeNull();
    expect(titulo.textContent).toContain('JS');
    expect(within(await escolha()).queryByRole('button', { name: 'Remover foto' })).toBeNull();
  });

  it('"Trocar foto" envia a imagem e mostra a nova, com o aviso "Foto trocada."', async () => {
    let ficha = fichaDe({ foto: FOTO });
    const enviados: Request[] = [];
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(ficha),
      'PUT /api/pessoas/joao/foto': (pedido) => {
        enviados.push(pedido);
        ficha = fichaDe({ foto: NOVA });
        return Response.json(ficha);
      },
    });
    await fotoDoTitulo();
    await escolherArquivo(PNG());
    await waitFor(() => expect(avisos()).toContain('Foto trocada.'));
    expect(enviados[0]?.headers.get('x-grafite-csrf')).toBe('csrf-de-teste');
    await waitFor(async () =>
      expect((await fotoDoTitulo())?.getAttribute('srcset')).toContain(NOVA.id),
    );
  });

  it('"Remover foto" pede confirmação, mostra as iniciais e avisa "Foto removida."', async () => {
    let ficha = fichaDe({ foto: FOTO });
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(ficha),
      'DELETE /api/pessoas/joao/foto': () => {
        ficha = fichaDe();
        return Response.json(ficha);
      },
    });
    fireEvent.click(within(await escolha()).getByRole('button', { name: 'Remover foto' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Remover foto?' });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover foto' }));
    await waitFor(() => expect(avisos()).toContain('Foto removida.'));
    await waitFor(async () => expect(await fotoDoTitulo()).toBeNull());
  });

  it('a recusa aparece junto da escolha, e a foto anterior continua', async () => {
    abrir('/administracao/pessoas/joao', {
      'GET /api/pessoas/joao': () => Response.json(fichaDe({ foto: FOTO })),
      'PUT /api/pessoas/joao/foto': () =>
        problema(413, 'imagem-grande-demais', 'A imagem passa de 10 MB.'),
    });
    await fotoDoTitulo();
    await escolherArquivo(PNG());
    expect(await within(await escolha()).findByRole('alert')).toHaveProperty(
      'textContent',
      'A imagem passa de 10 MB.',
    );
    expect((await fotoDoTitulo())?.getAttribute('srcset')).toContain(FOTO.id);
  });

  it('sem pessoas.editar, a foto aparece sem "Trocar foto" nem "Remover foto"', async () => {
    abrir(
      '/administracao/pessoas/joao',
      {
        'GET /api/pessoas/joao': () =>
          Response.json(fichaDe({ foto: FOTO, permite: { ...PERMITE_TUDO, editar: false } })),
      },
      naOrganizacao('pessoas.ver'),
    );
    expect((await fotoDoTitulo())?.getAttribute('srcset')).toContain(FOTO.id);
    expect(screen.queryByRole('group', { name: 'Foto de João da Silva' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trocar foto' })).toBeNull();
    expect(await screen.findByRole('img', { name: 'Foto de João da Silva' })).toBeTruthy();
  });
});
