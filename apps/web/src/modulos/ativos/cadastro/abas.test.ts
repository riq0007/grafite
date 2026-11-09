import { describe, expect, it } from 'vitest';
import { buscaDaAba, buscaDoCartao, lerAbaDaFicha } from './abas.ts';

describe('a busca da ficha', () => {
  it('a aba Dados fica fora do endereço, e um valor desconhecido abre a Dados', () => {
    expect(lerAbaDaFicha({ aba: 'ligados' })).toEqual({ aba: 'ligados' });
    expect(lerAbaDaFicha({ aba: 'historico' })).toEqual({ aba: 'historico' });
    expect(lerAbaDaFicha({ aba: 'softwares' })).toEqual({ aba: 'softwares' });
    expect(lerAbaDaFicha({ aba: 'dados' })).toEqual({});
    expect(lerAbaDaFicha({ aba: 'outra' })).toEqual({});
    expect(buscaDaAba('dados')).toEqual({});
    expect(buscaDaAba('historico')).toEqual({ aba: 'historico' });
  });

  // O primeiro cartão fica fora do endereço, e a Visão geral entra nele quando não é a primeira
  // (change primeiro-cartao-da-ficha, design, decisão 4).
  it('o cartão aberto vai no endereço, com o primeiro fora dele, e o valor estranho cai', () => {
    expect(lerAbaDaFicha({ grupo: 'organizacao:Rede' })).toEqual({ grupo: 'organizacao:Rede' });
    expect(lerAbaDaFicha({ aba: 'ligados', grupo: 'uso' })).toEqual({
      aba: 'ligados',
      grupo: 'uso',
    });
    expect(lerAbaDaFicha({ grupo: 'visao-geral' })).toEqual({ grupo: 'visao-geral' });
    expect(lerAbaDaFicha({ grupo: '' })).toEqual({});
    expect(lerAbaDaFicha({ grupo: 5 })).toEqual({});
    expect(lerAbaDaFicha({ grupo: 'x'.repeat(301) })).toEqual({});
    expect(buscaDoCartao('visao-geral', true)).toEqual({});
    expect(buscaDoCartao('visao-geral', false)).toEqual({ grupo: 'visao-geral' });
    expect(buscaDoCartao('capacidade:snmp.suprimentos', true)).toEqual({});
    expect(buscaDoCartao('capacidade:snmp.suprimentos', false)).toEqual({
      grupo: 'capacidade:snmp.suprimentos',
    });
  });
});
