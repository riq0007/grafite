import { filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
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

const NADA = {
  editar: false,
  inativar: false,
  reativar: false,
  anonimizar: false,
  criarConta: false,
  administrarConta: false,
};

const contaDe = (situacao: 'ativa' | 'inativa' | 'anonimizada') => ({
  id: 'c-joao',
  usuario: situacao === 'anonimizada' ? null : 'joao.silva',
  situacao,
  exigeDoisPassos: false,
  doisPassos: 'desativada',
  senhaTemporaria: false,
  entradaBloqueadaAte: null,
  ultimaEntradaEm: null,
  permite: {
    editar: false,
    redefinir: false,
    removerDoisPassos: false,
    desbloquear: false,
    inativar: false,
    reativar: false,
    encerrarSessoes: false,
  },
});

const ATIVO = {
  id: 'joao',
  nome: 'João da Silva',
  email: 'joao@empresa.com.br',
  matricula: '004512',
  telefone: null,
  situacao: 'ativa',
  local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
  conta: contaDe('ativa'),
  permite: { ...NADA, editar: true, inativar: true },
};

const INATIVO = {
  ...ATIVO,
  situacao: 'inativa',
  conta: contaDe('inativa'),
  permite: { ...NADA, editar: true, reativar: true, anonimizar: true },
};

const ANONIMIZADO = {
  ...ATIVO,
  nome: 'Pessoa anonimizada 7F3K',
  email: null,
  matricula: null,
  local: null,
  situacao: 'anonimizada',
  conta: contaDe('anonimizada'),
  permite: NADA,
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

/** A pessoa no servidor do teste: o GET devolve como ela está, e as ações a mudam. */
function servidorDaPessoa(inicial: object) {
  const estado = { ficha: inicial };
  const pedidos: string[] = [];
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json({ locais: [], permite: { cadastrarNaRaiz: true } }),
    'GET /api/pessoas/joao': () => Response.json(estado.ficha),
  };
  /** Uma ação que muda a pessoa e devolve a ficha dela. */
  const acao = (depois: object) => (pedido: Request) => {
    pedidos.push(`${pedido.method} ${new URL(pedido.url).pathname}`);
    estado.ficha = depois;
    return Response.json(depois);
  };
  return { servidor, estado, pedidos, acao };
}

function abrir(
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('pessoas.ver', 'pessoas.editar', 'pessoas.anonimizar'),
) {
  noComputador();
  const roteador = criarRoteador(
    createMemoryHistory({ initialEntries: ['/administracao/pessoas/joao'] }),
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

const titulo = () => screen.findByRole('heading', { level: 1, name: /João da Silva/ });
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso);
const titulos = () => avisos().map((aviso) => aviso.titulo);
const confirmacao = (nome: string) => screen.findByRole('alertdialog', { name: nome });

describe('ficha da pessoa: inativar, reativar e anonimizar', () => {
  it('inativar pede confirmação, diz que a conta e as sessões terminam, e inativa', async () => {
    const { servidor, acao, pedidos } = servidorDaPessoa(ATIVO);
    servidor['POST /api/pessoas/joao/inativacao'] = acao(INATIVO);
    abrir(servidor);
    const cabecalho = await titulo();
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = await confirmacao('Inativar João da Silva?');
    expect(dialogo.textContent).toContain(
      'A conta da pessoa também fica inativa, e as sessões abertas terminam.',
    );
    expect(pedidos).toEqual([]);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar a pessoa' }));
    await waitFor(() => expect(titulos()).toContain('Pessoa inativada.'));
    expect(pedidos).toEqual(['POST /api/pessoas/joao/inativacao']);
    await waitFor(() => expect(cabecalho.textContent).toContain('Inativa'));
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(cabecalho));
  });

  it('a recusa do último administrador aparece na confirmação, e nada muda', async () => {
    const { servidor } = servidorDaPessoa(ATIVO);
    servidor['POST /api/pessoas/joao/inativacao'] = () =>
      problema(
        409,
        'ultimo-administrador',
        'A organização ficaria sem ninguém para administrar os acessos.',
      );
    abrir(servidor);
    const cabecalho = await titulo();
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = await confirmacao('Inativar João da Silva?');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar a pessoa' }));
    expect(
      await within(dialogo).findByText(
        'A organização ficaria sem ninguém para administrar os acessos.',
      ),
    ).toBeTruthy();
    expect(cabecalho.textContent).toContain('Ativa');
  });

  it('reativar volta a pessoa e avisa que a conta continua inativa', async () => {
    const { servidor, acao } = servidorDaPessoa(INATIVO);
    servidor['POST /api/pessoas/joao/reativacao'] = acao({
      ...ATIVO,
      conta: contaDe('inativa'),
    });
    abrir(servidor);
    const cabecalho = await titulo();
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    await waitFor(() =>
      expect(avisos()).toContainEqual(
        expect.objectContaining({
          titulo: 'Pessoa reativada.',
          descricao: 'A conta continua inativa até ser reativada na aba Acesso.',
        }),
      ),
    );
    await waitFor(() => expect(cabecalho.textContent).toContain('Ativa'));
  });

  it('anonimizar diz o que é apagado e o que fica, e só libera com o nome digitado', async () => {
    const { servidor, acao, pedidos } = servidorDaPessoa(INATIVO);
    servidor['POST /api/pessoas/joao/anonimizacao'] = acao(ANONIMIZADO);
    abrir(servidor);
    await titulo();
    fireEvent.click(await screen.findByRole('button', { name: 'Anonimizar' }));
    const dialogo = await confirmacao('Anonimizar João da Silva?');
    for (const trecho of [
      'Não dá para desfazer.',
      'o nome, trocado por “Pessoa anonimizada” e um código;',
      'o e-mail, a matrícula, o local de trabalho e o telefone;',
      'o usuário e a senha da conta, e o usuário fica livre para outra pessoa;',
      'a verificação em dois passos e os códigos de recuperação;',
      'o IP e o dispositivo das sessões e as tentativas de entrada;',
      'os perfis e os grupos da conta, que se encerram.',
      'os registros da auditoria que citam a pessoa, com o nome anonimizado.',
    ]) {
      expect(dialogo.textContent, trecho).toContain(trecho);
    }
    const anonimizar = within(dialogo).getByRole('button', { name: 'Anonimizar' });
    const nome = within(dialogo).getByRole('textbox', {
      name: 'Para confirmar, digite o nome da pessoa',
    });
    expect(anonimizar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(nome, { target: { value: 'joao da silva' } });
    expect(anonimizar.hasAttribute('disabled')).toBe(true);
    fireEvent.click(anonimizar);
    expect(pedidos).toEqual([]);
    fireEvent.change(nome, { target: { value: 'João da Silva' } });
    expect(anonimizar.hasAttribute('disabled')).toBe(false);
    fireEvent.click(anonimizar);
    await waitFor(() => expect(titulos()).toContain('Pessoa anonimizada.'));
    expect(pedidos).toEqual(['POST /api/pessoas/joao/anonimizacao']);
    const cabecalho = await screen.findByRole('heading', {
      level: 1,
      name: /Pessoa anonimizada 7F3K/,
    });
    expect(cabecalho.textContent).toContain('Anonimizada');
    expect(screen.queryByRole('button', { name: 'Anonimizar' })).toBeNull();
    // A aba Dados, que estava aberta, não mostra mais os dados apagados.
    const campo = (rotulo: string) =>
      screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement;
    await waitFor(() => expect(campo('Nome').value).toBe('Pessoa anonimizada 7F3K'));
    expect(campo('E-mail').value).toBe('');
    expect(campo('Matrícula').value).toBe('');
  });

  it('sem permissão, a ficha não oferece nenhuma ação sobre a pessoa', async () => {
    const { servidor } = servidorDaPessoa({ ...INATIVO, permite: NADA });
    abrir(servidor, naOrganizacao('pessoas.ver'));
    await titulo();
    await screen.findByRole('tablist', { name: 'Ficha da pessoa' });
    for (const nome of ['Inativar', 'Reativar', 'Anonimizar']) {
      expect(screen.queryByRole('button', { name: nome }), nome).toBeNull();
    }
  });
});

describe('ficha da pessoa: aba Histórico', () => {
  const registro = (id: string, rotulo: string, momento: string, ator: object) => ({
    id,
    momento,
    acao: 'x',
    rotulo,
    ator,
    alvo: { tipo: 'pessoa', id: 'joao', nome: 'João da Silva', usuario: null },
    antes: null,
    depois: null,
    dados: null,
    ip: null,
    codigoDeRastreio: null,
  });
  const ANA = { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' };

  it('mostra os registros recentes da pessoa e da conta, com "Ver na auditoria"', async () => {
    const { servidor } = servidorDaPessoa(ATIVO);
    const pedidos: URLSearchParams[] = [];
    servidor['GET /api/auditoria'] = (pedido) => {
      pedidos.push(new URL(pedido.url).searchParams);
      return Response.json({
        itens: [
          registro('r2', 'Conta criada', '2026-10-06T13:00:00.000Z', ANA),
          registro('r1', 'Pessoa cadastrada', '2026-10-06T12:00:00.000Z', {
            tipo: 'sistema',
            descricao: 'Comando no servidor',
          }),
        ],
        proximo: 'c2',
        total: 14,
        maisDe: false,
      });
    };
    const roteador = abrir(
      servidor,
      naOrganizacao('pessoas.ver', 'pessoas.editar', 'auditoria.ver'),
    );
    const abas = await screen.findByRole('tablist', { name: 'Ficha da pessoa' });
    expect(
      within(abas)
        .getAllByRole('tab')
        .map((aba) => aba.textContent),
    ).toEqual(['Dados', 'Acesso', 'Histórico']);
    fireEvent.click(within(abas).getByRole('tab', { name: 'Histórico' }));
    const lista = await screen.findByRole('list', { name: 'Registros recentes' });
    const itens = within(lista)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(itens[0]).toContain('Conta criada');
    expect(itens[0]).toContain('Ana Souza');
    expect(itens[1]).toContain('Pessoa cadastrada');
    expect(itens[1]).toContain('Comando no servidor');
    expect(screen.getByText('Os 2 registros mais recentes, de 14.')).toBeTruthy();
    expect(pedidos[0]?.getAll('alvo')).toEqual(['pessoa:joao', 'conta:c-joao']);
    expect(pedidos[0]?.get('limite')).toBe('10');

    fireEvent.click(screen.getByRole('link', { name: 'Ver na auditoria' }));
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/administracao/auditoria'));
    expect(roteador.state.location.search).toEqual({
      alvo: ['pessoa:joao', 'conta:c-joao'],
      nomeDoAlvo: 'João da Silva',
    });
  });

  it('sem registros diz isso; sem auditoria.ver, não há a aba', async () => {
    const { servidor } = servidorDaPessoa({ ...ATIVO, conta: null });
    servidor['GET /api/auditoria'] = () =>
      Response.json({ itens: [], proximo: null, total: 0, maisDe: false });
    abrir(servidor, naOrganizacao('pessoas.ver', 'auditoria.ver'));
    const abas = await screen.findByRole('tablist', { name: 'Ficha da pessoa' });
    fireEvent.click(within(abas).getByRole('tab', { name: 'Histórico' }));
    expect(await screen.findByText('Nenhum registro desta pessoa.')).toBeTruthy();
    cleanup();

    abrir(servidorDaPessoa(ATIVO).servidor, naOrganizacao('pessoas.ver'));
    const semHistorico = await screen.findByRole('tablist', { name: 'Ficha da pessoa' });
    expect(
      within(semHistorico)
        .getAllByRole('tab')
        .map((aba) => aba.textContent),
    ).toEqual(['Dados', 'Acesso']);
  });
});
