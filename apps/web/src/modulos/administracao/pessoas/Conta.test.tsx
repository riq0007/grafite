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

type Conta = components['schemas']['ContaDaFicha'];
type Sessao = components['schemas']['SessaoAdministrada'];

const PERMITE_NA_CONTA: Conta['permite'] = {
  editar: true,
  redefinir: true,
  removerDoisPassos: true,
  desbloquear: false,
  inativar: true,
  reativar: false,
  encerrarSessoes: true,
};

const NADA_NA_CONTA: Conta['permite'] = {
  editar: false,
  redefinir: false,
  removerDoisPassos: false,
  desbloquear: false,
  inativar: false,
  reativar: false,
  encerrarSessoes: false,
};

const contaDe = (extras: Partial<Conta> = {}): Conta => ({
  id: 'c-joao',
  usuario: 'joao.silva',
  situacao: 'ativa',
  exigeDoisPassos: false,
  doisPassos: 'ativa',
  senhaTemporaria: false,
  entradaBloqueadaAte: null,
  ultimaEntradaEm: '2026-10-06T12:30:00.000Z',
  permite: PERMITE_NA_CONTA,
  ...extras,
});

const fichaDe = (conta: Conta | null, extras: Record<string, unknown> = {}) => ({
  id: 'joao',
  nome: 'João da Silva',
  email: 'joao@empresa.com.br',
  matricula: '004512',
  telefone: null,
  situacao: 'ativa',
  local: { id: 'jundiai', caminho: 'Jundiaí', situacao: 'ativo' },
  conta,
  permite: {
    editar: true,
    inativar: true,
    reativar: false,
    anonimizar: false,
    criarConta: conta === null,
    administrarConta: conta?.permite.editar ?? false,
  },
  ...extras,
});

const SESSOES: Sessao[] = [
  {
    id: 's1',
    dispositivo: 'Chrome no Windows',
    ip: '10.0.0.12',
    criadaEm: '2026-10-07T11:00:00.000Z',
    ultimoUsoEm: '2026-10-07T12:10:00.000Z',
  },
  {
    id: 's2',
    dispositivo: 'Safari no iPhone',
    ip: null,
    criadaEm: '2026-10-06T18:00:00.000Z',
    ultimoUsoEm: '2026-10-06T18:40:00.000Z',
  },
];

/** O prazo de João: o da organização, sem prazo próprio. */
const DA_ORGANIZACAO = { prazo: { dias: 30, origem: { tipo: 'organizacao' } }, diasDaConta: null };

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

/**
 * A pessoa no servidor do teste: o GET devolve a conta como ela está, e as ações preparadas pelo
 * teste mudam a conta e as sessões. Os corpos dos pedidos ficam guardados por caminho.
 */
function servidorDaConta(inicial: Conta | null, sessoes: Sessao[] = []) {
  const estado = { conta: inicial, sessoes, extras: {} as Record<string, unknown> };
  const corpos: Record<string, unknown[]> = {};
  const guardar = async (pedido: Request) => {
    const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
    const texto = await pedido.text();
    corpos[caminho] = [...(corpos[caminho] ?? []), texto ? JSON.parse(texto) : null];
  };
  const servidor: ServidorDeTeste = {
    'GET /api/locais': () => Response.json({ locais: [], permite: { cadastrarNaRaiz: true } }),
    'GET /api/pessoas/joao': () => Response.json(fichaDe(estado.conta, estado.extras)),
    'GET /api/contas/c-joao/sessoes': () => Response.json(estado.sessoes),
    'GET /api/contas/c-joao/aparelhos': () => Response.json({ ...DA_ORGANIZACAO, aparelhos: [] }),
  };
  /** Uma ação da conta: guarda o corpo, muda a conta e devolve a ficha dela. */
  const acao =
    (mudar: Partial<Conta>, { encerrar = false } = {}) =>
    async (pedido: Request) => {
      await guardar(pedido);
      estado.conta = { ...(estado.conta as Conta), ...mudar };
      if (encerrar) estado.sessoes = [];
      return Response.json(estado.conta);
    };
  return { servidor, estado, corpos, guardar, acao };
}

function abrir(
  servidor: ServidorDeTeste,
  permissoes = naOrganizacao('pessoas.ver', 'contas.administrar'),
  canal?: CanalDeEventos,
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
      canal={canal}
    />,
  );
  return roteador;
}

/** Abre a aba Acesso da ficha e espera a parte da conta. */
async function abaAcesso() {
  const abas = await screen.findByRole('tablist', { name: 'Ficha da pessoa' });
  fireEvent.click(within(abas).getByRole('tab', { name: 'Acesso' }));
  return screen.findByRole('heading', { level: 2, name: 'Conta' });
}

const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
/** A confirmação aberta com o título dado; os avisos também são `alertdialog`. */
const dialogoAberto = (titulo: string) => screen.queryByRole('alertdialog', { name: titulo });
const botao = (nome: string) => screen.queryByRole('button', { name: nome });
/** O valor ao lado de um rótulo dos dados da conta. */
const valorDe = (rotulo: string) =>
  screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling?.textContent;

describe('aba Acesso: criar a conta', () => {
  it('confere o usuário, cria a conta e mostra a senha temporária uma vez só', async () => {
    const { servidor, estado, corpos, guardar } = servidorDaConta(null);
    servidor['POST /api/pessoas/joao/conta'] = async (pedido) => {
      await guardar(pedido);
      estado.conta = contaDe({
        senhaTemporaria: true,
        exigeDoisPassos: true,
        doisPassos: 'desativada',
        ultimaEntradaEm: null,
      });
      return Response.json(
        { conta: estado.conta, senhaTemporaria: 'K7m2-Qx9p-Ra4T' },
        { status: 201 },
      );
    };
    abrir(servidor);
    const titulo = await abaAcesso();
    expect(screen.getByText('Esta pessoa não tem conta.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Criar a conta de João da Silva' });
    const usuario = within(dialogo).getByRole('textbox', { name: 'Usuário' });
    fireEvent.change(usuario, { target: { value: 'jo' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar conta' }));
    expect(await within(dialogo).findByText('Use de 3 a 64 caracteres.')).toBeTruthy();
    expect(corpos['POST /api/pessoas/joao/conta']).toBeUndefined();

    fireEvent.change(usuario, { target: { value: '  Joao.Silva ' } });
    fireEvent.click(
      within(dialogo).getByRole('checkbox', { name: 'Exigir a verificação em dois passos' }),
    );
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar conta' }));
    const criada = await screen.findByRole('dialog', { name: 'Conta criada' });
    expect(corpos['POST /api/pessoas/joao/conta']).toEqual([
      { usuario: 'joao.silva', exigeDoisPassos: true },
    ]);
    const senha = within(criada).getByRole('group', { name: 'Senha temporária' });
    expect(senha.textContent).toContain('K7m2-Qx9p-Ra4T');
    expect(within(senha).getByRole('button', { name: 'Copiar' })).toBeTruthy();
    expect(within(criada).getByText(/Esta senha não aparece de novo\./)).toBeTruthy();
    expect(avisos()).toContain('Conta criada.');
    // A senha fica à vista até o diálogo fechar, mesmo depois que a ficha teria tempo de mudar.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('dialog', { name: 'Conta criada' })).toBe(criada);

    fireEvent.click(within(criada).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(valorDe('Usuário')).toBe('joao.silva'));
    expect(screen.queryByText(/K7m2-Qx9p-Ra4T/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('a senha temporária continua à vista quando o evento da criação relê a ficha', async () => {
    const canal = criarCanalDeEventos();
    const { servidor, estado } = servidorDaConta(null);
    servidor['POST /api/pessoas/joao/conta'] = () => {
      estado.conta = contaDe({ senhaTemporaria: true, ultimaEntradaEm: null });
      return Response.json(
        { conta: estado.conta, senhaTemporaria: 'K7m2-Qx9p-Ra4T' },
        { status: 201 },
      );
    };
    abrir(servidor, undefined, canal);
    const titulo = await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Criar a conta de João da Silva' });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Usuário' }), {
      target: { value: 'joao.silva' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar conta' }));
    const criada = await screen.findByRole('dialog', { name: 'Conta criada' });

    // A API avisa a criação às telas abertas, inclusive à de quem criou: a ficha relida já traz a
    // conta, e a senha, que não aparece de novo, continua no diálogo até ele fechar.
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000001',
      tipo: 'pessoas.mudaram',
      momento: '2026-10-07T12:00:00.000Z',
      alvo: { tipo: 'pessoa', id: 'joao' },
    });
    await waitFor(() => expect(valorDe('Usuário')).toBe('joao.silva'));
    expect(screen.getByRole('dialog', { name: 'Conta criada' })).toBe(criada);
    expect(within(criada).getByRole('group', { name: 'Senha temporária' }).textContent).toContain(
      'K7m2-Qx9p-Ra4T',
    );

    fireEvent.click(within(criada).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/K7m2-Qx9p-Ra4T/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('a recusa da API aparece no campo do usuário, com o diálogo aberto', async () => {
    const { servidor } = servidorDaConta(null);
    servidor['POST /api/pessoas/joao/conta'] = () =>
      problema(409, 'conflito', 'Este usuário já é de outra conta.', {
        usuario: 'Este usuário já é de outra conta.',
      });
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Criar a conta de João da Silva' });
    const usuario = within(dialogo).getByRole('textbox', { name: 'Usuário' });
    fireEvent.change(usuario, { target: { value: 'joao.silva' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar conta' }));
    expect(await within(dialogo).findByText('Este usuário já é de outra conta.')).toBeTruthy();
    expect(usuario.getAttribute('aria-invalid')).toBe('true');
    expect((usuario as HTMLInputElement).value).toBe('joao.silva');
  });

  it('sem permissão de criar, não oferece a criação; a pessoa inativa precisa ser reativada', async () => {
    const { servidor, estado } = servidorDaConta(null);
    estado.extras = {
      situacao: 'inativa',
      permite: {
        editar: true,
        inativar: false,
        reativar: true,
        anonimizar: false,
        criarConta: false,
        administrarConta: false,
      },
    };
    abrir(servidor);
    await abaAcesso();
    expect(screen.getByText('Esta pessoa não tem conta.')).toBeTruthy();
    expect(screen.getByText('Reative a pessoa para criar a conta dela.')).toBeTruthy();
    expect(botao('Criar conta')).toBeNull();
  });
});

describe('aba Acesso: a conta', () => {
  it('mostra o usuário, a situação, a senha, os dois passos, o bloqueio e a última entrada', async () => {
    const { servidor } = servidorDaConta(
      contaDe({
        senhaTemporaria: true,
        exigeDoisPassos: true,
        doisPassos: 'desativada',
        entradaBloqueadaAte: '2026-10-07T15:00:00.000Z',
        permite: { ...PERMITE_NA_CONTA, desbloquear: true },
      }),
    );
    abrir(servidor);
    await abaAcesso();
    expect(valorDe('Usuário')).toBe('joao.silva');
    expect(valorDe('Situação')).toBe('Ativa');
    expect(valorDe('Senha')).toBe('Temporária: a próxima entrada pede uma senha nova.');
    expect(valorDe('Verificação em dois passos')).toBe('Desativada, exigida para esta conta');
    expect(valorDe('Entrada')).toMatch(/^Bloqueada pelas tentativas erradas até .+ \d{2}:\d{2}$/);
    expect(valorDe('Última entrada')).toMatch(/ \d{2}:\d{2}$/);
  });

  it('sem o permite, a conta aparece sem nenhuma ação e sem as sessões', async () => {
    const { servidor } = servidorDaConta(
      contaDe({ ultimaEntradaEm: null, permite: NADA_NA_CONTA }),
    );
    const sessoes = vi.fn(() => Response.json(SESSOES));
    servidor['GET /api/contas/c-joao/sessoes'] = sessoes;
    abrir(servidor, naOrganizacao('pessoas.ver'));
    await abaAcesso();
    expect(valorDe('Usuário')).toBe('joao.silva');
    expect(valorDe('Última entrada')).toBe('Nunca entrou');
    for (const nome of [
      'Alterar a conta',
      'Desbloquear a entrada',
      'Reativar a conta',
      'Redefinir a senha',
      'Remover a verificação em dois passos',
      'Inativar a conta',
      'Encerrar todas as sessões',
    ]) {
      expect(botao(nome), nome).toBeNull();
    }
    expect(screen.queryByRole('heading', { name: 'Sessões' })).toBeNull();
    expect(sessoes).not.toHaveBeenCalled();
  });

  it('a própria conta aponta a seção Conta dos Ajustes', async () => {
    const { servidor } = servidorDaConta(
      contaDe({ id: 'c-ana', usuario: 'ana.souza', permite: NADA_NA_CONTA }),
    );
    abrir(servidor);
    await abaAcesso();
    const ajustes = screen.getByRole('link', { name: 'seção Conta dos Ajustes' });
    expect(ajustes.getAttribute('href')).toBe('/ajustes/conta');
    expect(ajustes.parentElement?.textContent).toBe(
      'Esta é a sua conta. Cuide dela na seção Conta dos Ajustes.',
    );
  });

  it('muda o usuário e a exigência dos dois passos, com a recusa no campo', async () => {
    const { servidor, corpos, guardar, estado } = servidorDaConta(contaDe());
    let recusar = true;
    servidor['PATCH /api/contas/c-joao'] = async (pedido) => {
      await guardar(pedido);
      if (recusar) {
        return problema(409, 'conflito', 'Este usuário já é de outra conta.', {
          usuario: 'Este usuário já é de outra conta.',
        });
      }
      estado.conta = contaDe({ usuario: 'j.silva', exigeDoisPassos: true });
      return Response.json(estado.conta);
    };
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Alterar a conta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Alterar a conta de João da Silva' });
    const usuario = within(dialogo).getByRole('textbox', { name: 'Usuário' }) as HTMLInputElement;
    expect(usuario.value).toBe('joao.silva');
    const exige = within(dialogo).getByRole('checkbox', {
      name: 'Exigir a verificação em dois passos',
    }) as HTMLInputElement;
    expect(exige.checked).toBe(false);
    fireEvent.change(usuario, { target: { value: 'maria.lima' } });
    fireEvent.click(exige);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    expect(await within(dialogo).findByText('Este usuário já é de outra conta.')).toBeTruthy();

    recusar = false;
    fireEvent.change(usuario, { target: { value: 'j.silva' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(corpos['PATCH /api/contas/c-joao']).toEqual([
      { usuario: 'maria.lima', exigeDoisPassos: true },
      { usuario: 'j.silva', exigeDoisPassos: true },
    ]);
    expect(avisos()).toContain('Conta alterada.');
    await waitFor(() => expect(valorDe('Usuário')).toBe('j.silva'));
    expect(valorDe('Verificação em dois passos')).toBe('Ativa, exigida para esta conta');
  });

  it('desbloqueia a entrada na hora, sem confirmação', async () => {
    const { servidor, acao, corpos } = servidorDaConta(
      contaDe({
        entradaBloqueadaAte: '2026-10-07T15:00:00.000Z',
        permite: { ...PERMITE_NA_CONTA, desbloquear: true },
      }),
    );
    servidor['POST /api/contas/c-joao/desbloqueio'] = acao({
      entradaBloqueadaAte: null,
      permite: PERMITE_NA_CONTA,
    });
    abrir(servidor);
    const titulo = await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear a entrada' }));
    await waitFor(() => expect(avisos()).toContain('Entrada desbloqueada.'));
    expect(corpos['POST /api/contas/c-joao/desbloqueio']).toHaveLength(1);
    await waitFor(() => expect(botao('Desbloquear a entrada')).toBeNull());
    expect(screen.queryByText('Entrada', { selector: 'dt' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('redefinir a senha pede confirmação e mostra a senha nova uma vez só', async () => {
    const { servidor, estado, corpos, guardar } = servidorDaConta(contaDe(), SESSOES);
    servidor['POST /api/contas/c-joao/redefinicao'] = async (pedido) => {
      await guardar(pedido);
      estado.conta = contaDe({ senhaTemporaria: true, doisPassos: 'desativada' });
      estado.sessoes = [];
      return Response.json({ conta: estado.conta, senhaTemporaria: 'P3nq-W8vd-Lc2Z' });
    };
    abrir(servidor);
    await abaAcesso();
    await screen.findByText('Chrome no Windows');
    const redefinir = screen.getByRole('button', { name: 'Redefinir a senha' });

    fireEvent.click(redefinir);
    let confirmacao = await screen.findByRole('alertdialog', {
      name: 'Redefinir a senha de João da Silva?',
    });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(dialogoAberto('Redefinir a senha de João da Silva?')).toBeNull());
    expect(corpos['POST /api/contas/c-joao/redefinicao']).toBeUndefined();

    fireEvent.click(redefinir);
    confirmacao = await screen.findByRole('alertdialog', {
      name: 'Redefinir a senha de João da Silva?',
    });
    expect(confirmacao.textContent).toContain('as sessões abertas da conta terminam');
    fireEvent.click(
      within(confirmacao).getByRole('checkbox', {
        name: 'Remover também a verificação em dois passos',
      }),
    );
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Redefinir a senha' }));
    const redefinida = await screen.findByRole('alertdialog', { name: 'Senha redefinida' });
    expect(corpos['POST /api/contas/c-joao/redefinicao']).toEqual([{ removerDoisPassos: true }]);
    expect(
      within(redefinida).getByRole('group', { name: 'Senha temporária' }).textContent,
    ).toContain('P3nq-W8vd-Lc2Z');
    expect(within(redefinida).getByText(/Esta senha não aparece de novo\./)).toBeTruthy();
    expect(avisos()).toContain('Senha redefinida.');

    fireEvent.click(within(redefinida).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(dialogoAberto('Senha redefinida')).toBeNull());
    expect(screen.queryByText(/P3nq-W8vd-Lc2Z/)).toBeNull();
    expect(await screen.findByText('Nenhuma sessão aberta.')).toBeTruthy();
    expect(valorDe('Senha')).toBe('Temporária: a próxima entrada pede uma senha nova.');
  });

  it('remover a verificação em dois passos pede confirmação', async () => {
    const { servidor, acao, corpos } = servidorDaConta(contaDe(), SESSOES);
    servidor['POST /api/contas/c-joao/remocao-dos-dois-passos'] = acao(
      { doisPassos: 'desativada', permite: { ...PERMITE_NA_CONTA, removerDoisPassos: false } },
      { encerrar: true },
    );
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Remover a verificação em dois passos' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Remover a verificação em dois passos de João da Silva?',
    });
    expect(corpos['POST /api/contas/c-joao/remocao-dos-dois-passos']).toBeUndefined();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover a verificação' }));
    await waitFor(() => expect(avisos()).toContain('Verificação em dois passos removida.'));
    await waitFor(() => expect(valorDe('Verificação em dois passos')).toBe('Desativada'));
    expect(botao('Remover a verificação em dois passos')).toBeNull();
    expect(await screen.findByText('Nenhuma sessão aberta.')).toBeTruthy();
  });

  it('inativar pede confirmação, e reativar volta a conta', async () => {
    const { servidor, acao } = servidorDaConta(contaDe(), SESSOES);
    servidor['POST /api/contas/c-joao/inativacao'] = acao(
      {
        situacao: 'inativa',
        permite: { ...PERMITE_NA_CONTA, inativar: false, reativar: true, encerrarSessoes: false },
      },
      { encerrar: true },
    );
    servidor['POST /api/contas/c-joao/reativacao'] = acao({
      situacao: 'ativa',
      permite: PERMITE_NA_CONTA,
    });
    abrir(servidor);
    const titulo = await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar a conta' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar a conta de João da Silva?',
    });
    expect(confirmacao.textContent).toContain('a entrada passa a ser recusada');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar a conta' }));
    await waitFor(() => expect(avisos()).toContain('Conta inativada.'));
    await waitFor(() => expect(valorDe('Situação')).toBe('Inativa'));
    expect(dialogoAberto('Inativar a conta de João da Silva?')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(titulo));

    fireEvent.click(screen.getByRole('button', { name: 'Reativar a conta' }));
    await waitFor(() => expect(avisos()).toContain('Conta reativada.'));
    await waitFor(() => expect(valorDe('Situação')).toBe('Ativa'));
    expect(botao('Reativar a conta')).toBeNull();
  });

  it('a recusa da inativação aparece na confirmação, e a conta continua como estava', async () => {
    const { servidor } = servidorDaConta(contaDe());
    servidor['POST /api/contas/c-joao/inativacao'] = () =>
      problema(
        409,
        'ultimo-administrador',
        'João da Silva é a única conta que administra os acessos.',
      );
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar a conta' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Inativar a conta de João da Silva?',
    });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Inativar a conta' }));
    expect(
      await within(confirmacao).findByText(
        'João da Silva é a única conta que administra os acessos.',
      ),
    ).toBeTruthy();
    expect(valorDe('Situação')).toBe('Ativa');
  });

  it('a recusa da reativação aparece junto às ações', async () => {
    const { servidor } = servidorDaConta(
      contaDe({
        situacao: 'inativa',
        permite: { ...PERMITE_NA_CONTA, inativar: false, reativar: true, encerrarSessoes: false },
      }),
    );
    servidor['POST /api/contas/c-joao/reativacao'] = () =>
      problema(409, 'conflito', 'Reative a pessoa antes de reativar a conta dela.');
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar a conta' }));
    expect(
      await screen.findByText('Reative a pessoa antes de reativar a conta dela.'),
    ).toBeTruthy();
    expect(valorDe('Situação')).toBe('Inativa');
  });
});

describe('aba Acesso: as sessões', () => {
  it('mostra o dispositivo, o IP e os horários, e encerra todas com confirmação', async () => {
    const { servidor, estado, guardar, corpos } = servidorDaConta(contaDe(), SESSOES);
    servidor['DELETE /api/contas/c-joao/sessoes'] = async (pedido) => {
      await guardar(pedido);
      estado.sessoes = [];
      return Response.json({ encerradas: 2 });
    };
    abrir(servidor);
    await abaAcesso();
    const lista = await screen.findByRole('list', { name: 'Sessões abertas' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]?.textContent).toContain('Chrome no Windows');
    expect(itens[0]?.textContent).toContain('10.0.0.12');
    expect(itens[1]?.textContent).toContain('Safari no iPhone');
    expect(itens[1]?.textContent).toContain('Desconhecido');

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar todas as sessões' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Encerrar todas as sessões de João da Silva?',
    });
    expect(corpos['DELETE /api/contas/c-joao/sessoes']).toBeUndefined();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Encerrar as sessões' }));
    await waitFor(() => expect(avisos()).toContain('2 sessões encerradas.'));
    expect(await screen.findByText('Nenhuma sessão aberta.')).toBeTruthy();
    expect(botao('Encerrar todas as sessões')).toBeNull();
    const titulo = screen.getByRole('heading', { level: 2, name: 'Sessões' });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
  });

  it('a falha ao carregar as sessões aparece em texto, com "Tentar de novo"', async () => {
    const { servidor } = servidorDaConta(contaDe());
    let falhar = true;
    servidor['GET /api/contas/c-joao/sessoes'] = () =>
      falhar ? problema(500, 'erro-interno', 'Erro interno.') : Response.json(SESSOES);
    abrir(servidor);
    await abaAcesso();
    expect(
      await screen.findByText(
        'Não foi possível carregar as sessões. Informe à TI o código R7K2-9QXM.',
      ),
    ).toBeTruthy();
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Chrome no Windows')).toBeTruthy();
  });
});

// Spec administracao-de-pessoas, "Aparelhos confiáveis pela administração" (change
// aparelho-confiavel, design, decisão 6).
describe('aba Acesso: os aparelhos confiáveis', () => {
  const NOTEBOOK = {
    id: '0199a6e0-0000-7000-8000-000000000021',
    dispositivo: 'Edge no Windows',
    ip: '10.0.0.40',
    criadoEm: '2026-10-01T12:00:00.000Z',
    usadoEm: '2026-10-05T09:00:00.000Z',
    valeAte: '2026-10-31T12:00:00.000Z',
  };

  it('De onde vem o prazo: "30 dias, pela organização", com os aparelhos e o IP', async () => {
    const { servidor } = servidorDaConta(contaDe());
    servidor['GET /api/contas/c-joao/aparelhos'] = () =>
      Response.json({ ...DA_ORGANIZACAO, aparelhos: [NOTEBOOK] });
    abrir(servidor);
    await abaAcesso();
    expect(await screen.findByText('30 dias, pela organização')).toBeTruthy();
    const lista = screen.getByRole('list', { name: 'Aparelhos confiáveis' });
    const [notebook] = within(lista).getAllByRole('listitem');
    expect(notebook?.textContent).toContain('Edge no Windows');
    expect(notebook?.textContent).toContain('10.0.0.40');
    for (const rotulo of ['Confiável desde', 'Último uso', 'Vale até']) {
      expect(within(notebook as HTMLElement).getByText(rotulo), rotulo).toBeTruthy();
    }
  });

  it('Notebook roubado: "Esquecer todos os aparelhos", com confirmação, e as sessões continuam', async () => {
    const { servidor, guardar, corpos } = servidorDaConta(contaDe(), SESSOES);
    let aparelhos = [NOTEBOOK];
    servidor['GET /api/contas/c-joao/aparelhos'] = () =>
      Response.json({ ...DA_ORGANIZACAO, aparelhos });
    servidor['DELETE /api/contas/c-joao/aparelhos'] = async (pedido) => {
      await guardar(pedido);
      aparelhos = [];
      return new Response(null, { status: 204 });
    };
    abrir(servidor);
    await abaAcesso();
    fireEvent.click(await screen.findByRole('button', { name: 'Esquecer todos os aparelhos' }));
    const confirmacao = await screen.findByRole('alertdialog', {
      name: 'Esquecer todos os aparelhos de João da Silva?',
    });
    expect(
      within(confirmacao).getByText(
        'As entradas seguintes da pessoa pedem o código em qualquer navegador. As sessões abertas continuam.',
      ),
    ).toBeTruthy();
    expect(corpos['DELETE /api/contas/c-joao/aparelhos']).toBeUndefined();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Esquecer os aparelhos' }));
    await waitFor(() => expect(avisos()).toContain('Aparelhos esquecidos.'));
    expect(await screen.findByText('Nenhum aparelho confiável.')).toBeTruthy();
    expect(botao('Esquecer todos os aparelhos')).toBeNull();
    // As sessões abertas continuam.
    expect(screen.getByRole('list', { name: 'Sessões abertas' })).toBeTruthy();
  });

  it('Prazo de uma conta: "Pedir o código em toda entrada", e a tela diz "Em toda entrada, pela conta"', async () => {
    const { servidor, guardar, corpos } = servidorDaConta(contaDe());
    let prazo: object = DA_ORGANIZACAO;
    servidor['GET /api/contas/c-joao/aparelhos'] = () => Response.json({ ...prazo, aparelhos: [] });
    servidor['PUT /api/contas/c-joao/prazo-da-confianca'] = async (pedido) => {
      await guardar(pedido);
      prazo = { prazo: { dias: 0, origem: { tipo: 'conta' } }, diasDaConta: 0 };
      return Response.json(prazo);
    };
    abrir(servidor);
    await abaAcesso();
    expect(await screen.findByText('30 dias, pela organização')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mudar…' }));
    const dialogo = await screen.findByRole('dialog', {
      name: 'Prazo da confiança da conta de João da Silva',
    });
    expect(
      (
        within(dialogo).getByRole('radio', {
          name: 'Seguir o perfil ou a organização',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Pedir o código em toda entrada' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(corpos['PUT /api/contas/c-joao/prazo-da-confianca']).toEqual([{ dias: 0 }]),
    );
    expect(await screen.findByText('Em toda entrada, pela conta')).toBeTruthy();
    expect(avisos()).toContain('Prazo da confiança alterado.');
  });

  it('sem administrar a conta, a parte não aparece', async () => {
    const { servidor } = servidorDaConta(contaDe({ permite: NADA_NA_CONTA }));
    abrir(servidor, naOrganizacao('pessoas.ver'));
    await abaAcesso();
    expect(screen.queryByRole('heading', { level: 2, name: 'Aparelhos confiáveis' })).toBeNull();
  });
});
