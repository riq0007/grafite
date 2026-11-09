import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos, type EventoRecebido } from './canal.ts';
import { ligarEventosDosModulos } from './modulos.ts';

const JOAO = '0199a6e0-0000-7000-8000-0000000000a1';

const evento = (tipo: EventoRecebido['tipo']): EventoRecebido => ({
  id: '0199a6e0-0000-7000-8000-000000000001',
  tipo,
  momento: '2026-10-07T12:00:00.000Z',
  alvo: { tipo: 'pessoa', id: JOAO },
});

/** Um registro com um módulo que declara as consultas de pessoas para `pessoas.mudaram`. */
const REGISTRO = [
  {
    id: 'pessoas',
    eventos: {
      'pessoas.mudaram': ({ alvo }: EventoRecebido) => [['pessoas'], ['pessoa', alvo?.id]],
    },
  },
  { id: 'sem-eventos' },
];

function preparar() {
  const consultas = new QueryClient();
  const canal = criarCanalDeEventos();
  const parar = ligarEventosDosModulos({ registro: REGISTRO, canal, consultas });
  return { consultas, canal, parar };
}

describe('eventos dos módulos', () => {
  it('invalida as consultas que o módulo declara para o tipo do evento', () => {
    const { consultas, canal } = preparar();
    consultas.setQueryData(['pessoas', { busca: 'joão' }], []);
    consultas.setQueryData(['pessoa', JOAO], {});
    canal.publicar(evento('pessoas.mudaram'));
    expect(consultas.getQueryState(['pessoas', { busca: 'joão' }])?.isInvalidated).toBe(true);
    expect(consultas.getQueryState(['pessoa', JOAO])?.isInvalidated).toBe(true);
  });

  it('as consultas que nenhum módulo declara para o evento ficam intactas', () => {
    const { consultas, canal } = preparar();
    consultas.setQueryData(['locais'], []);
    consultas.setQueryData(['pessoa', 'outra'], {});
    consultas.setQueryData(['pessoas'], []);
    canal.publicar(evento('pessoas.mudaram'));
    canal.publicar(evento('locais.mudaram'));
    expect(consultas.getQueryState(['locais'])?.isInvalidated).toBe(false);
    expect(consultas.getQueryState(['pessoa', 'outra'])?.isInvalidated).toBe(false);
  });

  it('relê só as consultas ativas: a que nenhuma tela usa espera ser usada de novo', async () => {
    const { consultas, canal } = preparar();
    const lerALista = vi.fn(async () => ['João']);
    const lerAFicha = vi.fn(async () => ({ nome: 'João' }));
    const lista = new QueryObserver(consultas, { queryKey: ['pessoas'], queryFn: lerALista });
    const pararDeOuvir = lista.subscribe(() => {});
    await vi.waitFor(() => expect(lerALista).toHaveBeenCalledOnce());
    await consultas.prefetchQuery({ queryKey: ['pessoa', JOAO], queryFn: lerAFicha });

    canal.publicar(evento('pessoas.mudaram'));
    await vi.waitFor(() => expect(lerALista).toHaveBeenCalledTimes(2));
    expect(lerAFicha).toHaveBeenCalledOnce();
    expect(consultas.getQueryState(['pessoa', JOAO])?.isInvalidated).toBe(true);
    pararDeOuvir();
  });

  it('numa rajada, relê cada consulta uma vez por vez, e a última começa depois do último evento', async () => {
    const { consultas, canal } = preparar();
    let emAndamento = 0;
    let maximo = 0;
    const terminar: (() => void)[] = [];
    const lerALista = vi.fn(
      () =>
        new Promise<string[]>((resolver) => {
          emAndamento += 1;
          maximo = Math.max(maximo, emAndamento);
          terminar.push(() => {
            emAndamento -= 1;
            resolver(['João']);
          });
        }),
    );
    const lista = new QueryObserver(consultas, { queryKey: ['pessoas'], queryFn: lerALista });
    const pararDeOuvir = lista.subscribe(() => {});
    await vi.waitFor(() => expect(lerALista).toHaveBeenCalledOnce());
    terminar.shift()?.();
    await vi.waitFor(() => expect(lista.getCurrentResult().isSuccess).toBe(true));

    // Uma importação: dezenas de eventos seguidos.
    for (let i = 0; i < 50; i += 1) canal.publicar(evento('pessoas.mudaram'));
    await vi.waitFor(() => expect(lerALista).toHaveBeenCalledTimes(2));
    await new Promise((pronto) => setTimeout(pronto, 20));
    expect(lerALista).toHaveBeenCalledTimes(2);

    // A releitura em andamento termina, e só então começa a última, que vê o último evento.
    terminar.shift()?.();
    await vi.waitFor(() => expect(lerALista).toHaveBeenCalledTimes(3));
    terminar.shift()?.();
    await new Promise((pronto) => setTimeout(pronto, 20));
    expect(lerALista).toHaveBeenCalledTimes(3);
    expect(maximo).toBe(1);
    pararDeOuvir();
  });

  it('depois de parar, os eventos não invalidam mais nada', () => {
    const { consultas, canal, parar } = preparar();
    consultas.setQueryData(['pessoas'], []);
    parar();
    canal.publicar(evento('pessoas.mudaram'));
    expect(consultas.getQueryState(['pessoas'])?.isInvalidated).toBe(false);
  });
});
