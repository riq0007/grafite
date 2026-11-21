import { describe, expect, it } from 'vitest';
import type { EtapaDoChamado } from './caminho.ts';
import {
  type EventoParaQuemParticipa,
  fraseDoEventoParaQuemParticipa,
  previsaoDaResposta,
  situacaoNoChat,
  situacaoParaQuemParticipa,
  textoDaEtapa,
} from './palavras-do-colaborador.ts';

const FERNANDA = { conta: 'conta-fernanda', nome: 'Fernanda Rocha' };
const ANA = { conta: 'conta-ana', nome: 'Ana Souza' };
const BRUNO = { conta: 'conta-bruno', nome: 'Bruno Lima' };

describe('a previsão da resposta', () => {
  it('pelo prazo de resposta do tipo, como "responde em ~1 h", na triagem e em atendimento', () => {
    const umaHora = { modo: 'corridas' as const, resposta: { valor: 1, unidade: 'h' as const } };
    expect(previsaoDaResposta({ situacao: 'triagem', prazo: umaHora })).toBe('responde em ~1 h');
    expect(previsaoDaResposta({ situacao: 'em-atendimento', prazo: umaHora })).toBe(
      'responde em ~1 h',
    );
  });

  it('com a unidade do tipo, também os dias úteis do horário da TI', () => {
    expect(
      previsaoDaResposta({
        situacao: 'triagem',
        prazo: { modo: 'horario', resposta: { valor: 30, unidade: 'min' } },
      }),
    ).toBe('responde em ~30 min');
    expect(
      previsaoDaResposta({
        situacao: 'triagem',
        prazo: { modo: 'horario', resposta: { valor: 2, unidade: 'd' } },
      }),
    ).toBe('responde em ~2 dias úteis');
    expect(
      previsaoDaResposta({
        situacao: 'triagem',
        prazo: { modo: 'corridas', resposta: { valor: 1, unidade: 'd' } },
      }),
    ).toBe('responde em ~1 dia');
  });

  it('nenhuma no aguardando, em que a TI espera a pessoa, e no resolvido', () => {
    const prazo = { modo: 'corridas' as const, resposta: { valor: 1, unidade: 'h' as const } };
    expect(previsaoDaResposta({ situacao: 'aguardando', prazo })).toBeNull();
    expect(previsaoDaResposta({ situacao: 'resolvido', prazo })).toBeNull();
  });
});

describe('a situação nas palavras do colaborador', () => {
  it('a tabela da spec: Aberto, Em andamento, Aguardando você, Resolvido e Fechado', () => {
    expect(situacaoParaQuemParticipa('triagem', false)).toBe('Aberto');
    expect(situacaoParaQuemParticipa('em-atendimento', false)).toBe('Em andamento');
    expect(situacaoParaQuemParticipa('aguardando', false)).toBe('Aguardando você');
    expect(situacaoParaQuemParticipa('resolvido', false)).toBe('Resolvido');
    expect(situacaoParaQuemParticipa('resolvido', true)).toBe('Fechado');
  });

  it('no chat, a espera é "Aguardando você" só a quem participa do chamado', () => {
    expect(situacaoNoChat('aguardando', false, true)).toBe('Aguardando você');
    expect(situacaoNoChat('aguardando', false, false)).toBe('Aguardando o colaborador');
    expect(situacaoNoChat('em-atendimento', false, false)).toBe('Em andamento');
    expect(situacaoNoChat('resolvido', true, false)).toBe('Fechado');
  });
});

describe('as etapas em texto', () => {
  const hora = (em: Date) => `ontem ${em.toISOString().slice(11, 16)}`;
  const etapa = (extra: Partial<EtapaDoChamado> & Pick<EtapaDoChamado, 'estado'>) =>
    ({ situacao: 'triagem', agora: false, ...extra }) as EtapaDoChamado;

  it('a hora da chegada, a pulada só com o nome e "ainda não" depois da de agora', () => {
    expect(
      textoDaEtapa(etapa({ estado: 'chegou', em: new Date('2026-11-18T17:05:00Z') }), hora),
    ).toBe('Aberto · ontem 17:05');
    expect(textoDaEtapa(etapa({ situacao: 'aguardando', estado: 'pulada' }), hora)).toBe(
      'Aguardando você',
    );
    expect(textoDaEtapa(etapa({ situacao: 'resolvido', estado: 'ainda-nao' }), hora)).toBe(
      'Resolvido · ainda não',
    );
  });
});

describe('os eventos nas palavras do colaborador', () => {
  const frase = (evento: EventoParaQuemParticipa, quemLe = FERNANDA.conta) =>
    fraseDoEventoParaQuemParticipa(evento, quemLe);

  it('a abertura pela própria conta e pela TI ou por outra pessoa', () => {
    expect(frase({ evento: 'abertura', autor: FERNANDA })).toBe('Recebemos o seu chamado');
    expect(frase({ evento: 'abertura', autor: ANA })).toBe(
      'Ana Souza abriu este chamado para você',
    );
  });

  it('o assumir e o passar dizem quem atende agora, com o "Você" a quem atende', () => {
    expect(frase({ evento: 'assumiu', autor: BRUNO })).toBe('Bruno Lima está atendendo o chamado');
    expect(frase({ evento: 'passou', autor: ANA, para: BRUNO })).toBe(
      'Bruno Lima está atendendo o chamado',
    );
    expect(frase({ evento: 'passou', autor: BRUNO, para: ANA }, ANA.conta)).toBe(
      'Você está atendendo o chamado',
    );
    expect(frase({ evento: 'assumiu', autor: ANA }, ANA.conta)).toBe(
      'Você está atendendo o chamado',
    );
  });

  it('o devolver, a espera, a retomada e o fechamento, sem nome', () => {
    expect(frase({ evento: 'devolveu', autor: BRUNO })).toBe('O chamado voltou para a fila da TI');
    expect(frase({ evento: 'aguardando', autor: ANA })).toBe('Aguardando você');
    expect(frase({ evento: 'retomou', autor: ANA })).toBe('O atendimento continua');
    expect(frase({ evento: 'retomou', autor: FERNANDA })).toBe('O atendimento continua');
    expect(frase({ evento: 'fechou', autor: null })).toBe('O chamado fechou');
  });

  it('o resolver e o reabrir, com o "Você" pela própria conta', () => {
    expect(frase({ evento: 'resolveu', autor: BRUNO })).toBe('Bruno Lima resolveu o chamado');
    expect(frase({ evento: 'resolveu', autor: ANA }, ANA.conta)).toBe('Você resolveu o chamado');
    expect(frase({ evento: 'reabriu', autor: BRUNO })).toBe('Bruno Lima reabriu o chamado');
    expect(frase({ evento: 'reabriu', autor: FERNANDA })).toBe('Você reabriu o chamado');
  });

  it('a avaliação, com o nível inteiro, e a de outra pessoa pelo nome', () => {
    expect(frase({ evento: 'avaliou', autor: FERNANDA, nivel: 'otimo' })).toBe(
      'Você avaliou: Ótimo · Resolveu muito bem',
    );
    expect(frase({ evento: 'avaliou', autor: FERNANDA, nivel: 'regular' }, 'conta-paulo')).toBe(
      'Fernanda Rocha avaliou: Regular · Resolveu em parte',
    );
  });

  it('o que a pessoa não lê fica de fora: o desfazer, a OS, a solicitação, a troca do ativo e a escolha', () => {
    for (const evento of [
      'desfez',
      'os',
      'solicitacao',
      'solicitacao-nao-gerada',
      'ativo',
      'escolheu',
    ]) {
      expect(frase({ evento, autor: BRUNO })).toBeNull();
    }
  });

  it('o evento sem o dado da frase fica de fora, como o de uma versão mais nova', () => {
    expect(frase({ evento: 'passou', autor: ANA, para: null })).toBeNull();
    expect(frase({ evento: 'resolveu', autor: null })).toBeNull();
    expect(frase({ evento: 'avaliou', autor: FERNANDA })).toBeNull();
    expect(frase({ evento: 'novo-de-outra-versao', autor: ANA })).toBeNull();
  });
});
