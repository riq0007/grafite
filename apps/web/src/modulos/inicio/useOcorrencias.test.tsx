import type { OcorrenciaAberta } from '@grafite/ui';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClienteDaApi } from '../../api/cliente.ts';
import { criarCanalDeEventos } from '../../eventos/canal.ts';
import type { ContextoDaFonte, FonteDeOcorrencias } from '../tipos.ts';
import { type ModuloComOcorrencias, useOcorrencias } from './useOcorrencias.ts';

afterEach(cleanup);

/** O contexto que a tela inicial dá às fontes; as do teste não o usam. */
const CONTEXTO: ContextoDaFonte = { api: {} as ClienteDaApi, canal: criarCanalDeEventos() };

const ocorrencia = (id: string): OcorrenciaAberta => ({
  id,
  severidade: 'atencao',
  texto: `Ocorrência ${id}`,
  ativo: { nome: `Ativo ${id}`, tipo: 'impressora' },
  desde: new Date('2026-09-24T17:00:00Z'),
  destino: `/ativos/${id}`,
});

/** Uma fonte cujas buscas o teste resolve ou recusa quando quer, guardando o sinal de cada uma. */
function fonteControlada(comAvisos = false) {
  const buscas: Array<{
    sinal: AbortSignal;
    responder: (lista: OcorrenciaAberta[]) => Promise<void>;
    falhar: () => Promise<void>;
  }> = [];
  let avisar = () => {};
  const pararDeAvisar = vi.fn();
  const fonte: FonteDeOcorrencias = {
    buscar: vi.fn(
      (sinal: AbortSignal) =>
        new Promise<OcorrenciaAberta[]>((resolver, recusar) => {
          buscas.push({
            sinal,
            responder: (lista) => act(async () => resolver(lista)),
            falhar: () => act(async () => recusar(new Error('Serviço indisponível'))),
          });
        }),
    ),
    ...(comAvisos
      ? {
          assinar: (aoMudar: () => void) => {
            avisar = aoMudar;
            return pararDeAvisar;
          },
        }
      : {}),
  };
  return { fonte, buscas, avisar: () => act(() => avisar()), pararDeAvisar };
}

const estados = (fontes: ReturnType<typeof useOcorrencias>['fontes']) =>
  fontes.map((fonte) => [fonte.id, fonte.estado.tipo]);

describe('useOcorrencias', () => {
  it('busca todas as fontes do registro juntas e guarda as ocorrências de cada uma', async () => {
    const ativos = fonteControlada();
    const rede = fonteControlada();
    const registro: ModuloComOcorrencias[] = [
      { id: 'ativos', nome: 'Ativos', ocorrencias: ativos.fonte },
      { id: 'ajustes', nome: 'Ajustes' },
      { id: 'rede', nome: 'Rede', ocorrencias: rede.fonte },
    ];
    const { result } = renderHook(() => useOcorrencias(registro, CONTEXTO));
    expect(estados(result.current.fontes)).toEqual([
      ['ativos', 'carregando'],
      ['rede', 'carregando'],
    ]);
    await ativos.buscas[0]?.responder([ocorrencia('a1'), ocorrencia('a2')]);
    await rede.buscas[0]?.responder([ocorrencia('r1')]);
    expect(result.current.fontes).toEqual([
      {
        id: 'ativos',
        modulo: 'Ativos',
        estado: { tipo: 'pronta', ocorrencias: [ocorrencia('a1'), ocorrencia('a2')] },
      },
      { id: 'rede', modulo: 'Rede', estado: { tipo: 'pronta', ocorrencias: [ocorrencia('r1')] } },
    ]);
  });

  it('a falha de uma fonte não esconde as outras, e tentar de novo busca só ela', async () => {
    const ativos = fonteControlada();
    const rede = fonteControlada();
    const registro: ModuloComOcorrencias[] = [
      { id: 'ativos', nome: 'Ativos', ocorrencias: ativos.fonte },
      { id: 'rede', nome: 'Rede', ocorrencias: rede.fonte },
    ];
    const { result } = renderHook(() => useOcorrencias(registro, CONTEXTO));
    await ativos.buscas[0]?.responder([ocorrencia('a1')]);
    await rede.buscas[0]?.falhar();
    expect(estados(result.current.fontes)).toEqual([
      ['ativos', 'pronta'],
      ['rede', 'erro'],
    ]);
    act(() => result.current.tentarDeNovo('rede'));
    expect(estados(result.current.fontes)).toEqual([
      ['ativos', 'pronta'],
      ['rede', 'carregando'],
    ]);
    expect(rede.fonte.buscar).toHaveBeenCalledTimes(2);
    expect(ativos.fonte.buscar).toHaveBeenCalledTimes(1);
    await rede.buscas[1]?.responder([ocorrencia('r1')]);
    expect(estados(result.current.fontes)).toEqual([
      ['ativos', 'pronta'],
      ['rede', 'pronta'],
    ]);
  });

  it('quando uma fonte avisa que mudou, busca de novo só ela, sem voltar ao carregando', async () => {
    const ativos = fonteControlada(true);
    const rede = fonteControlada();
    const registro: ModuloComOcorrencias[] = [
      { id: 'ativos', nome: 'Ativos', ocorrencias: ativos.fonte },
      { id: 'rede', nome: 'Rede', ocorrencias: rede.fonte },
    ];
    const { result } = renderHook(() => useOcorrencias(registro, CONTEXTO));
    await ativos.buscas[0]?.responder([ocorrencia('a1'), ocorrencia('a2')]);
    await rede.buscas[0]?.responder([]);
    await ativos.avisar();
    expect(ativos.fonte.buscar).toHaveBeenCalledTimes(2);
    expect(rede.fonte.buscar).toHaveBeenCalledTimes(1);
    expect(result.current.fontes[0]?.estado).toEqual({
      tipo: 'pronta',
      ocorrencias: [ocorrencia('a1'), ocorrencia('a2')],
    });
    // A ocorrência a2 foi resolvida: sai da lista, sem recarregar a página.
    await ativos.buscas[1]?.responder([ocorrencia('a1')]);
    expect(result.current.fontes[0]?.estado).toEqual({
      tipo: 'pronta',
      ocorrencias: [ocorrencia('a1')],
    });
  });

  it('uma busca nova cancela a anterior, e a resposta antiga não muda nada', async () => {
    const rede = fonteControlada();
    const registro: ModuloComOcorrencias[] = [
      { id: 'rede', nome: 'Rede', ocorrencias: rede.fonte },
    ];
    const { result } = renderHook(() => useOcorrencias(registro, CONTEXTO));
    act(() => result.current.tentarDeNovo('rede'));
    expect(rede.buscas[0]?.sinal.aborted).toBe(true);
    await rede.buscas[1]?.responder([ocorrencia('nova')]);
    await rede.buscas[0]?.responder([ocorrencia('antiga')]);
    expect(result.current.fontes[0]?.estado).toEqual({
      tipo: 'pronta',
      ocorrencias: [ocorrencia('nova')],
    });
  });

  it('ao sair da tela, cancela as buscas e para os avisos', async () => {
    const ativos = fonteControlada(true);
    const rede = fonteControlada();
    const registro: ModuloComOcorrencias[] = [
      { id: 'ativos', nome: 'Ativos', ocorrencias: ativos.fonte },
      { id: 'rede', nome: 'Rede', ocorrencias: rede.fonte },
    ];
    const { unmount } = renderHook(() => useOcorrencias(registro, CONTEXTO));
    unmount();
    expect(ativos.buscas[0]?.sinal.aborted).toBe(true);
    expect(rede.buscas[0]?.sinal.aborted).toBe(true);
    expect(ativos.pararDeAvisar).toHaveBeenCalledOnce();
  });

  it('sem nenhuma fonte no registro, não há o que buscar', () => {
    const { result } = renderHook(() =>
      useOcorrencias([{ id: 'ajustes', nome: 'Ajustes' }], CONTEXTO),
    );
    expect(result.current.fontes).toEqual([]);
  });
});
