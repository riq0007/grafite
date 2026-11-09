import { criarDataHora, filaDeAvisos } from '@grafite/ui';
import { createMemoryHistory } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../App.tsx';
import { criarClienteDeConsultas } from '../../../api/consultas.ts';
import { type CanalDeEventos, criarCanalDeEventos } from '../../../eventos/canal.ts';
import { criarRoteador } from '../../../rotas/arvore.ts';
import type { PermissaoDaSessao } from '../../../sessao/useAcesso.ts';
import { noComputador } from '../../../teste/postura.ts';
import { naOrganizacao, type ServidorDeTeste, sessaoAtiva } from '../../../teste/sessao.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
  localStorage.clear();
});

const DESTINO = 'D:\\Backups\\Grafite';
const NAS = '\\\\nas\\Backups Grafite\\Produção';

const FEITO = {
  id: '0199a6e0-0000-7000-8000-0000000000b1',
  iniciadoEm: '2026-10-07T05:00:00.000Z',
  terminadoEm: '2026-10-07T05:04:00.000Z',
  situacao: 'feito',
  pedidoPor: 'agenda',
  tamanho: 52428800,
  destinos: [
    { destino: DESTINO, situacao: 'gravado', erro: null },
    { destino: NAS, situacao: 'gravado', erro: null },
  ],
  erro: null,
};

const FALHOU = {
  id: '0199a6e0-0000-7000-8000-0000000000b2',
  iniciadoEm: '2026-10-06T05:00:00.000Z',
  terminadoEm: '2026-10-06T05:01:00.000Z',
  situacao: 'falhou',
  pedidoPor: 'tela',
  tamanho: null,
  destinos: [
    { destino: DESTINO, situacao: 'gravado', erro: null },
    { destino: NAS, situacao: 'falhou', erro: 'O disco ficou sem espaço.' },
  ],
  erro: `O backup não chegou a todos os destinos. ${NAS}: O disco ficou sem espaço.`,
};

const ESTADO = {
  configurado: true,
  agenda: {
    horario: '02:00',
    diaDoTeste: 0,
    janela: { inicio: '00:00', fim: '06:00' },
    teste: 'semanal',
  },
  proximoBackup: '2026-10-08T05:00:00.000Z',
  backups: [FEITO, FALHOU],
  ultimoTeste: {
    id: '0199a6e0-0000-7000-8000-0000000000c1',
    iniciadoEm: '2026-10-04T06:00:00.000Z',
    terminadoEm: '2026-10-04T06:09:00.000Z',
    situacao: 'falhou',
    erro: 'A parte banco.dump não confere com o hash do manifesto.',
    backup: { id: FEITO.id, pasta: '2026-10-04T0500Z', iniciadoEm: '2026-10-04T05:00:00.000Z' },
    detalhes: {},
  },
};

const problema = (status: number, codigo: string, detalhe: string, campos?: object) =>
  Response.json(
    {
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: detalhe,
      codigoDeRastreio: 'R7K2-9QXM',
      ...(campos ? { campos } : {}),
    },
    { status },
  );

function abrir(
  servidor: ServidorDeTeste,
  {
    permissoes = naOrganizacao('backup.administrar', 'tarefas.administrar'),
    operaOServidor = true,
    endereco = '/administracao/backup',
    canal = criarCanalDeEventos(),
  }: {
    permissoes?: PermissaoDaSessao[];
    operaOServidor?: boolean;
    endereco?: string;
    canal?: CanalDeEventos;
  } = {},
) {
  noComputador();
  const roteador = criarRoteador(createMemoryHistory({ initialEntries: [endereco] }));
  render(
    <App
      roteador={roteador}
      sessao={sessaoAtiva(
        permissoes,
        {
          'GET /api/acesso/administradores': () =>
            Response.json({ administradores: ['Ana Souza'] }),
          'GET /api/tarefas-com-falha': () => Response.json({ itens: [], proximo: null }),
          ...servidor,
        },
        {},
        {},
        { ambiente: 'producao', operaOServidor },
      )}
      consultas={criarClienteDeConsultas({ esperaEntreTentativas: 0 })}
      canal={canal}
    />,
  );
  return roteador;
}

const secoes = () => screen.getByRole('navigation', { name: 'Seções da Administração' });
const nomesDasSecoes = () =>
  within(secoes())
    .getAllByRole('link')
    .map((link) => link.textContent);
const avisos = () => filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo);
const lista = () => screen.findByRole('list', { name: 'Backups' });

describe('a seção Backup', () => {
  it('é a última da Administração, na organização que opera o servidor', async () => {
    abrir({ 'GET /api/operacao/backups': () => Response.json(ESTADO) });
    await screen.findByRole('heading', { level: 1, name: 'Backup' });
    expect(nomesDasSecoes()).toEqual(['Tarefas', 'Backup']);
  });

  it('noutra organização, não aparece, e o endereço leva à primeira seção', async () => {
    const roteador = abrir({}, { operaOServidor: false });
    await screen.findByRole('heading', { level: 1, name: 'Tarefas' });
    expect(nomesDasSecoes()).toEqual(['Tarefas']);
    expect(roteador.state.location.pathname).toBe('/administracao/tarefas');
  });

  it('sem backup.administrar, a tela diz a quem pedir acesso', async () => {
    abrir({}, { permissoes: naOrganizacao('tarefas.administrar') });
    expect(await screen.findByText('Você não tem acesso a Backup.')).toBeTruthy();
  });
});

describe('a tela de backup', () => {
  it('mostra os backups com quando, o tamanho, os destinos e o resultado em texto', async () => {
    abrir({ 'GET /api/operacao/backups': () => Response.json(ESTADO) });
    const itens = within(await lista()).getAllByRole('listitem', { name: /Backup de/ });
    const { formatarDataEHora } = criarDataHora();
    expect(itens).toHaveLength(2);
    const [feito, falhou] = itens;
    expect(feito?.textContent).toContain(formatarDataEHora(new Date(FEITO.iniciadoEm)));
    expect(feito?.textContent).toContain('Feito');
    expect(feito?.textContent).toContain('50 MB');
    expect(feito?.textContent).toContain(`${DESTINO}: gravado`);
    expect(feito?.textContent).toContain(`${NAS}: gravado`);
    expect(falhou?.textContent).toContain('Falhou');
    expect(falhou?.textContent).toContain(`${NAS}: falhou, O disco ficou sem espaço.`);
  });

  it('mostra o próximo backup e o último teste de restauração, com o motivo da falha', async () => {
    abrir({ 'GET /api/operacao/backups': () => Response.json(ESTADO) });
    const { formatarDataEHora } = criarDataHora();
    const proximo = await screen.findByRole('region', { name: 'Próximo backup' });
    expect(proximo.textContent).toContain(formatarDataEHora(new Date(ESTADO.proximoBackup)));
    const teste = screen.getByRole('region', { name: 'Último teste de restauração' });
    expect(teste.textContent).toContain('Falhou');
    expect(teste.textContent).toContain('A parte banco.dump não confere com o hash do manifesto.');
    expect(teste.textContent).toContain(
      formatarDataEHora(new Date(ESTADO.ultimoTeste.backup.iniciadoEm)),
    );
  });

  it('"Fazer backup agora" põe o backup na fila e avisa', async () => {
    const pedidos: Request[] = [];
    abrir({
      'GET /api/operacao/backups': () => Response.json(ESTADO),
      'POST /api/operacao/backups/pedidos': (pedido) => {
        pedidos.push(pedido);
        return Response.json({ jaNaFila: false }, { status: 202 });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Fazer backup agora' }));
    await waitFor(() => expect(avisos()).toContain('Backup na fila.'));
    expect(pedidos).toHaveLength(1);
  });

  it('salva o horário e o dia do teste e avisa', async () => {
    let corpo: unknown;
    abrir({
      'GET /api/operacao/backups': () => Response.json(ESTADO),
      'PUT /api/operacao/agenda': async (pedido) => {
        corpo = await pedido.json();
        return Response.json({
          ...ESTADO,
          agenda: { ...ESTADO.agenda, horario: '03:30', diaDoTeste: 6 },
        });
      },
    });
    const horario = await screen.findByLabelText('Horário do backup');
    fireEvent.change(horario, { target: { value: '03:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Dia do teste de restauração/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sábado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar horário' }));
    await waitFor(() => expect(avisos()).toContain('Horário do backup salvo.'));
    expect(corpo).toEqual({ horario: '03:30', diaDoTeste: 6 });
  });

  it('mostra no campo a recusa do horário fora da janela', async () => {
    abrir({
      'GET /api/operacao/backups': () => Response.json(ESTADO),
      'PUT /api/operacao/agenda': () =>
        problema(400, 'dados-invalidos', 'Confira os campos indicados.', {
          horario: 'Escolha um horário entre 00:00 e 06:00.',
        }),
    });
    const horario = await screen.findByLabelText('Horário do backup');
    fireEvent.change(horario, { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar horário' }));
    expect(await screen.findByText('Escolha um horário entre 00:00 e 06:00.')).toBeTruthy();
    expect(avisos()).not.toContain('Horário do backup salvo.');
  });

  it('no servidor sem backup configurado, diz isso, sem as ações', async () => {
    abrir({
      'GET /api/operacao/backups': () =>
        Response.json({ ...ESTADO, configurado: false, proximoBackup: null, backups: [] }),
    });
    expect(await screen.findByText('O backup não está configurado neste servidor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fazer backup agora' })).toBeNull();
  });

  it('se atualiza sozinha quando um backup termina', async () => {
    const canal = criarCanalDeEventos();
    let backups: object[] = [FALHOU];
    abrir({ 'GET /api/operacao/backups': () => Response.json({ ...ESTADO, backups }) }, { canal });
    expect(within(await lista()).getAllByRole('listitem', { name: /Backup de/ })).toHaveLength(1);
    backups = [FEITO, FALHOU];
    canal.publicar({
      id: '0199a6e0-0000-7000-8000-000000000009',
      tipo: 'operacao.mudou',
      momento: '2026-10-07T05:04:00.000Z',
      alvo: { tipo: 'backup', id: FEITO.id },
    });
    await waitFor(async () =>
      expect(within(await lista()).getAllByRole('listitem', { name: /Backup de/ })).toHaveLength(2),
    );
  });
});
