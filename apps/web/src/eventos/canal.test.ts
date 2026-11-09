import { describe, expect, it, vi } from 'vitest';
import { criarCanalDeEventos, type EventoRecebido } from './canal.ts';

const evento = (tipo: EventoRecebido['tipo'], id = '0199a6e0-0000-7000-8000-000000000001') => ({
  id,
  tipo,
  momento: '2026-10-07T12:00:00.000Z',
  alvo: null,
});

describe('canal de eventos', () => {
  it('entrega cada evento a quem ouve o tipo dele, e só a eles', () => {
    const canal = criarCanalDeEventos();
    const preferencias = vi.fn();
    const pessoas = vi.fn();
    canal.ouvir('preferencias.mudaram', preferencias);
    canal.ouvir('pessoas.mudaram', pessoas);
    canal.publicar(evento('preferencias.mudaram'));
    expect(preferencias).toHaveBeenCalledWith(evento('preferencias.mudaram'));
    expect(pessoas).not.toHaveBeenCalled();
  });

  it('quem deixa de ouvir não recebe mais', () => {
    const canal = criarCanalDeEventos();
    const ouvinte = vi.fn();
    const parar = canal.ouvir('padroes.mudaram', ouvinte);
    parar();
    canal.publicar(evento('padroes.mudaram'));
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('um ouvinte que falha não impede os outros', () => {
    const canal = criarCanalDeEventos();
    const depois = vi.fn();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    canal.ouvir('locais.mudaram', () => {
      throw new Error('falhou');
    });
    canal.ouvir('locais.mudaram', depois);
    canal.publicar(evento('locais.mudaram'));
    expect(depois).toHaveBeenCalledOnce();
    expect(erro).toHaveBeenCalledOnce();
    erro.mockRestore();
  });
});
