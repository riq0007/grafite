// O console do painel (change painel-da-operacao, design, decisão 3): o escrever vira o andamento,
// as perguntas e as confirmações viram eventos que a página responde, o segredo não volta em evento
// e o cancelar responde como o Ctrl+C. O canal guarda os eventos da tarefa para quem conecta depois
// e os entrega pelo SSE.
import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { canalDeEventos, consoleDoPainel, type EventoDoPainel } from './console.ts';
import { abrirServidorDoPainel, type ServidorDoPainel } from './servidor.ts';

function comEventos() {
  const eventos: EventoDoPainel[] = [];
  const console = consoleDoPainel({
    tarefa: 'Atualizar',
    emitir: (evento) => eventos.push(evento),
  });
  const pergunta = (indice = -1) => {
    const evento = eventos.filter(({ tipo }) => tipo === 'pergunta').at(indice);
    if (evento?.tipo !== 'pergunta') throw new Error('Nenhuma pergunta foi feita.');
    return evento;
  };
  return { eventos, console, pergunta };
}

describe('o console do painel', () => {
  it('o escrever vira o andamento da tarefa', () => {
    const { eventos, console } = comEventos();
    console.escrever('Backup 2026-10-28T0500Z feito e conferido.');
    expect(eventos).toEqual([
      {
        tipo: 'andamento',
        tarefa: 'Atualizar',
        texto: 'Backup 2026-10-28T0500Z feito e conferido.',
      },
    ]);
  });

  it('a pergunta espera a resposta da página, e a resposta em branco fica com o padrão', async () => {
    const { console, pergunta } = comEventos();
    const resposta = console.perguntar('Endereço do teste', 'grafite-teste.empresa.com.br');
    expect(pergunta()).toMatchObject({
      modo: 'texto',
      texto: 'Endereço do teste',
      padrao: 'grafite-teste.empresa.com.br',
    });
    expect(console.responder(pergunta().id, '  ')).toBe(true);
    await expect(resposta).resolves.toBe('grafite-teste.empresa.com.br');
  });

  it('uma confirmação digitada que confere passa, e a que não confere recusa sem fazer nada', async () => {
    const { console, pergunta } = comEventos();
    const pedido = 'Para atualizar a produção para a 0.5.0, digite o nome do banco da produção';
    const certa = console.confirmarDigitado(pedido, 'grafite');
    expect(pergunta()).toMatchObject({ modo: 'confirmacao', texto: pedido, esperado: 'grafite' });
    console.responder(pergunta().id, 'grafite');
    await expect(certa).resolves.toBeUndefined();

    const errada = console.confirmarDigitado(pedido, 'grafite');
    console.responder(pergunta().id, 'grafite_teste');
    await expect(errada).rejects.toThrow(
      'O texto digitado não confere com grafite. Nada foi feito.',
    );
  });

  it('uma senha é respondida sem aparecer nos eventos', async () => {
    const { eventos, console, pergunta } = comEventos();
    const senha = console.perguntarSegredo('Senha do SMTP');
    expect(pergunta()).toEqual({
      tipo: 'pergunta',
      tarefa: 'Atualizar',
      id: pergunta().id,
      modo: 'segredo',
      texto: 'Senha do SMTP',
    });
    console.responder(pergunta().id, 'S3nh@-do-smtp');
    await expect(senha).resolves.toBe('S3nh@-do-smtp');
    expect(JSON.stringify(eventos)).not.toContain('S3nh@-do-smtp');
  });

  it('cancelar responde como o Ctrl+C: a pergunta e as seguintes param com "Cancelado."', async () => {
    const { console } = comEventos();
    const resposta = console.perguntar('Zip da versão');
    console.cancelar();
    await expect(resposta).rejects.toThrow('Cancelado.');
    await expect(console.perguntar('Ambiente')).rejects.toThrow('Cancelado.');
  });

  it('a resposta a uma pergunta que não existe não faz nada', () => {
    const { console } = comEventos();
    expect(console.responder('outra', 'sim')).toBe(false);
  });
});

describe('o canal de eventos', () => {
  let servidor: ServidorDoPainel | undefined;

  afterEach(async () => {
    await servidor?.fechar();
    servidor = undefined;
  });

  it('guarda os eventos da tarefa e os entrega pelo SSE, também a quem conecta depois', async () => {
    const canal = canalDeEventos();
    canal.emitir({ tipo: 'andamento', tarefa: 'Backup', texto: 'Fazendo o backup.' });
    servidor = await abrirServidorDoPainel({
      pagina: new Map(),
      api: async (pedido) => (pedido.caminho === '/eventos' ? canal.entregar(pedido) : undefined),
    });
    const { porta } = servidor;
    const recebidos = await new Promise<string>((resolver, recusar) => {
      const pedido = request(
        {
          host: '127.0.0.1',
          port: porta,
          path: '/api/eventos',
          headers: { host: `127.0.0.1:${porta}` },
        },
        (resposta) => {
          expect(resposta.headers['content-type']).toBe('text/event-stream; charset=utf-8');
          let texto = '';
          resposta.on('data', (parte: Buffer) => {
            texto += parte.toString('utf8');
            if (texto.includes('Backup feito.')) {
              pedido.destroy();
              resolver(texto);
            }
          });
          canal.emitir({ tipo: 'andamento', tarefa: 'Backup', texto: 'Backup feito.' });
        },
      );
      pedido.on('error', (erro) => {
        if (!erro.message.includes('aborted')) recusar(erro);
      });
      pedido.end();
    });
    const dados = recebidos
      .split('\n\n')
      .filter((bloco) => bloco.startsWith('data: '))
      .map((bloco) => JSON.parse(bloco.slice('data: '.length)) as EventoDoPainel);
    expect(dados).toEqual([
      { tipo: 'andamento', tarefa: 'Backup', texto: 'Fazendo o backup.' },
      { tipo: 'andamento', tarefa: 'Backup', texto: 'Backup feito.' },
    ]);
  });

  it('uma tarefa nova começa a história do zero', () => {
    const canal = canalDeEventos();
    canal.emitir({ tipo: 'andamento', tarefa: 'Backup', texto: 'Fazendo o backup.' });
    canal.comecar('Atualizar');
    canal.emitir({ tipo: 'andamento', tarefa: 'Atualizar', texto: 'Conferindo o pacote.' });
    expect(canal.historia()).toEqual([
      { tipo: 'inicio', tarefa: 'Atualizar' },
      { tipo: 'andamento', tarefa: 'Atualizar', texto: 'Conferindo o pacote.' },
    ]);
  });
});
