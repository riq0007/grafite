// A conversa do chamado aberto com o que vem do chat (spec modulo-chamados, "Conversa com a pessoa
// no chamado aberto"; change chat-com-chamados, tarefa 4.13): a linha da avaliação, a do
// fechamento e o nome de quem abriu pelo chat no nome de outra pessoa.
import { criarDataHora } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import {
  type EscritoDaConversa,
  type EventoDaConversa,
  linhaDoEvento,
  nomeNaConversa,
  tituloDaOrigem,
} from './conversa.ts';

const FERNANDA = {
  tipo: 'pessoa',
  id: '0190a000-0000-7000-8000-0000000000f1',
  nome: 'Fernanda Rocha',
} as const;
const PAULO = {
  tipo: 'pessoa',
  id: '0190a000-0000-7000-8000-0000000000a1',
  nome: 'Paulo Nunes',
} as const;

// Hoje é 18/11, ao meio-dia de São Paulo.
const AGORA = new Date('2026-11-18T15:00:00Z');
const dataHora = criarDataHora('America/Sao_Paulo');

const evento = (dados: Partial<EventoDaConversa>): EventoDaConversa => ({
  especie: 'evento',
  id: '0190a000-0000-7000-8000-000000000001',
  em: '2026-11-18T13:52:00Z',
  autor: FERNANDA,
  evento: 'avaliou',
  de: null,
  para: null,
  desde: null,
  ativo: null,
  os: null,
  solicitacao: null,
  motivo: null,
  avaliacao: null,
  resumo: null,
  ...dados,
});

const linha = (dados: Partial<EventoDaConversa>) =>
  linhaDoEvento(evento(dados), { pessoa: 'Fernanda Rocha', agora: AGORA, dataHora });

describe('as linhas do que vem do chat', () => {
  it('a avaliação, com o nível e o que ele diz', () => {
    expect(linha({ avaliacao: { nivel: 'otimo', comentario: 'Rápido.' } })).toEqual({
      texto: 'Fernanda Rocha avaliou: Ótimo · Resolveu muito bem · 10:52',
      aguardando: false,
    });
    expect(linha({ avaliacao: { nivel: 'ruim', comentario: null } })?.texto).toBe(
      'Fernanda Rocha avaliou: Ruim · Não resolveu · 10:52',
    );
    // Sem a avaliação, a linha fica de fora.
    expect(linha({ avaliacao: null })).toBeNull();
  });

  it('o fechamento, sem autor', () => {
    expect(linha({ evento: 'fechou', autor: null, em: '2026-11-18T03:00:00Z' })).toEqual({
      texto: 'O chamado fechou · 00:00',
      aguardando: false,
    });
  });
});

describe('nomeNaConversa: quem escreveu', () => {
  const escrito = (autor: EscritoDaConversa['autor']) => autor;

  it('quem abriu pelo chat no nome de outra pessoa ganha "· abriu o chamado"', () => {
    expect(nomeNaConversa(escrito(FERNANDA), PAULO.id)).toBe('Fernanda Rocha · abriu o chamado');
  });

  it('a pessoa do chamado e a TI ficam com o nome', () => {
    expect(nomeNaConversa(escrito(PAULO), PAULO.id)).toBe('Paulo Nunes');
    expect(
      nomeNaConversa(
        escrito({ tipo: 'conta', id: '0190a000-0000-7000-8000-0000000000b1', nome: 'Bruno Lima' }),
        PAULO.id,
      ),
    ).toBe('Bruno Lima');
  });
});

describe('tituloDaOrigem: de onde o chamado veio', () => {
  it('a equipe e o canal pelo nome, e a direta por quem escreveu e com quem', () => {
    expect(tituloDaOrigem({ tipo: 'equipe', nome: 'Equipe Financeiro' })).toBe(
      'Aberto a partir da conversa Equipe Financeiro',
    );
    expect(tituloDaOrigem({ tipo: 'canal', nome: 'Avisos da TI' })).toBe(
      'Aberto a partir da conversa Avisos da TI',
    );
    expect(tituloDaOrigem({ tipo: 'direta', nome: 'Paulo Nunes com Ana Souza' })).toBe(
      'Aberto a partir da conversa de Paulo Nunes com Ana Souza',
    );
  });
});
