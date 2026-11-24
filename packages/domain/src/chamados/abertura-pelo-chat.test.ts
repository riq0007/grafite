// A abertura pelo chat (spec chamados, "Abrir um chamado pelo chat"; change chat-com-chamados,
// design, decisão 8): o tipo que o chat oferece, o título, a pessoa de "No nome de" e o ativo entre
// os sugeridos, com as recusas da spec por campo.
import { describe, expect, it } from 'vitest';
import { MENSAGEM_DA_PESSOA_INATIVA } from '../solicitacoes/solicitacoes.ts';
import {
  conferirAberturaPeloChat,
  conferirMensagensATransformar,
  jaVirouChamado,
  MENSAGENS_DA_ABERTURA_PELO_CHAT as M,
  tipoAbrePeloChat,
} from './abertura-pelo-chat.ts';

const IMPRESSORA = {
  situacao: 'em-uso' as const,
  apareceParaOColaborador: true,
  soATiAbre: false,
  pedeOAtivo: true,
};
const OUTRO = { ...IMPRESSORA, pedeOAtivo: false };
const FERNANDA = { nome: 'Fernanda Rocha', ativa: true };

const pedido = (dados: Partial<Parameters<typeof conferirAberturaPeloChat>[0]> = {}) => ({
  tipo: 'tipo-impressora',
  titulo: 'Impressora manchando',
  pessoa: 'pessoa-fernanda',
  ativo: 'pat-00137',
  ...dados,
});

describe('o tipo que o chat oferece', () => {
  it('em uso, com "Aparece para o colaborador" e sem "Só a TI abre"', () => {
    expect(tipoAbrePeloChat(IMPRESSORA)).toBe(true);
    expect(tipoAbrePeloChat({ ...IMPRESSORA, situacao: 'inativo' })).toBe(false);
    expect(tipoAbrePeloChat({ ...IMPRESSORA, apareceParaOColaborador: false })).toBe(false);
    expect(tipoAbrePeloChat({ ...IMPRESSORA, soATiAbre: true })).toBe(false);
  });
});

describe('a conferência da abertura pelo chat', () => {
  it('aceita o título sem os espaços das pontas e o ativo entre os sugeridos', () => {
    expect(
      conferirAberturaPeloChat(pedido({ titulo: '  Impressora manchando ' }), {
        tipo: IMPRESSORA,
        pessoa: FERNANDA,
        sugeridos: ['pat-00137', 'pat-00140'],
      }),
    ).toEqual({ ok: true, titulo: 'Impressora manchando', ativo: 'pat-00137' });
  });

  it('o tipo que não pede o ativo não leva ativo, mesmo pedido', () => {
    expect(
      conferirAberturaPeloChat(pedido(), { tipo: OUTRO, pessoa: FERNANDA, sugeridos: [] }),
    ).toEqual({ ok: true, titulo: 'Impressora manchando', ativo: null });
  });

  it('as recusas do tipo, do título e da pessoa ficam juntas, cada uma no campo', () => {
    expect(
      conferirAberturaPeloChat(pedido({ tipo: null, titulo: '  ', pessoa: null }), {
        tipo: null,
        pessoa: null,
        sugeridos: null,
      }),
    ).toEqual({
      ok: false,
      erros: { tipo: M.semTipo, titulo: 'Escreva o título.', pessoa: M.semPessoa },
    });
    expect(
      conferirAberturaPeloChat(pedido({ titulo: 'x'.repeat(121) }), {
        tipo: { ...IMPRESSORA, soATiAbre: true },
        pessoa: { nome: 'Carla Dias', ativa: false },
        sugeridos: null,
      }),
    ).toEqual({
      ok: false,
      erros: {
        tipo: M.tipoIndisponivel,
        titulo: 'Use até 120 caracteres.',
        pessoa: MENSAGEM_DA_PESSOA_INATIVA,
      },
    });
    expect(
      conferirAberturaPeloChat(pedido(), { tipo: null, pessoa: null, sugeridos: null }),
    ).toEqual({
      ok: false,
      erros: { tipo: M.tipoIndisponivel, pessoa: M.pessoaNaoEncontrada },
    });
  });

  it('o ativo: escolhido, da lista e, sem nenhum sugerido, a frase com a pessoa', () => {
    const lido = { tipo: IMPRESSORA, pessoa: FERNANDA, sugeridos: ['pat-00137'] };
    expect(conferirAberturaPeloChat(pedido({ ativo: null }), lido)).toEqual({
      ok: false,
      erros: { ativo: M.semAtivo },
    });
    expect(conferirAberturaPeloChat(pedido({ ativo: 'pat-99999' }), lido)).toEqual({
      ok: false,
      erros: { ativo: M.ativoForaDaLista },
    });
    expect(conferirAberturaPeloChat(pedido(), { ...lido, sugeridos: [] })).toEqual({
      ok: false,
      erros: {
        ativo:
          'Nenhum ativo desse tipo está com Fernanda Rocha ou no local dela. Escolha outro tipo ou escreva à TI.',
      },
    });
  });

  it('a mensagem que já virou chamado diz o número', () => {
    expect(jaVirouChamado(1045)).toBe('Esta mensagem já virou o chamado #1045.');
  });
});

describe('as mensagens a transformar', () => {
  /** O id da mensagem, na ordem da conversa. */
  const id = (i: number) => `01a20b21-1d19-7941-8b47-${String(i).padStart(12, '0')}`;
  const vinteEUma = Array.from({ length: 21 }, (_, i) => id(i));

  it('tira os ids repetidos, também em maiúsculas, e põe na ordem dos ids, que é a da conversa', () => {
    expect(conferirMensagensATransformar([id(2), id(0), id(2).toUpperCase(), id(1)])).toEqual({
      ok: true,
      ids: [id(0), id(1), id(2)],
    });
  });

  it('recusa sem nenhuma e com mais de 20, depois de tirar os repetidos', () => {
    expect(conferirMensagensATransformar([])).toEqual({ ok: false, recusa: M.semMensagens });
    expect(conferirMensagensATransformar(vinteEUma)).toEqual({
      ok: false,
      recusa: M.mensagensDemais,
    });
    expect(conferirMensagensATransformar([...vinteEUma.slice(0, 20), id(0)])).toMatchObject({
      ok: true,
    });
    expect(M.semMensagens).toBe('Escolha as mensagens.');
    expect(M.mensagensDemais).toBe('Escolha até 20 mensagens.');
  });

  it('a que já virou chamado, com uma e com várias', () => {
    expect(jaVirouChamado(1045, 1)).toBe('Esta mensagem já virou o chamado #1045.');
    expect(jaVirouChamado(1045, 3)).toBe('Uma das mensagens já virou o chamado #1045.');
  });
});
