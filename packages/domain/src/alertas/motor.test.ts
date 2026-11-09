import { describe, expect, it } from 'vitest';
import {
  type AlertaNaDecisao,
  decidirAlerta,
  type LeituraDoEstado,
  observarColetaAtrasada,
  observarColetor,
  observarLeitura,
  textoDoAlerta,
} from './motor.ts';
import type { DadosDaRegra } from './regras.ts';

const ORGANIZACAO = { tipo: 'organizacao', id: null } as const;
const regra = <T extends DadosDaRegra>(dados: Omit<T, 'nome' | 'escopo' | 'excecoes'>): T =>
  ({ nome: 'Regra', escopo: ORGANIZACAO, excecoes: [], ...dados }) as unknown as T;

const OFFLINE = regra({
  condicao: 'rede.offline',
  parametros: {},
  duracao: 5,
  severidade: 'atencao',
});
const TONER = regra({
  condicao: 'toner.nivel',
  parametros: { limite: 10, folga: 5 },
  duracao: 0,
  severidade: 'critico',
});
const PARADA = regra({
  condicao: 'impressora.condicao',
  parametros: { condicoes: ['sem-papel', 'tampa-aberta'] },
  duracao: 0,
  severidade: 'critico',
});
const CONTROLE = regra({
  condicao: 'controlid.situacao',
  parametros: { situacoes: ['sem-resposta'] },
  duracao: 10,
  severidade: 'critico',
});

const valida = (mudancas: Partial<LeituraDoEstado> = {}): LeituraDoEstado => ({
  situacao: 'valida',
  valorNumero: null,
  valorTexto: null,
  detalhes: null,
  ...mudancas,
});
const doToner = (nivel: number | null, descricao = 'Toner preto') =>
  valida({ valorNumero: nivel, detalhes: { descricao, capacidade: 100, nivel: nivel ?? -2 } });

describe('texto do alerta', () => {
  it('diz o problema com o valor atual', () => {
    expect(textoDoAlerta('rede.offline', { item: '' })).toBe('Offline');
    expect(
      textoDoAlerta('toner.nivel', {
        item: '1',
        valorNumero: 8,
        detalhes: { descricao: ' Toner preto ' },
      }),
    ).toBe('Toner preto em 8%');
    // Sem a descrição, o tipo do suprimento.
    expect(textoDoAlerta('toner.nivel', { item: '2', valorNumero: 3, detalhes: {} })).toBe(
      'Toner em 3%',
    );
    expect(textoDoAlerta('impressora.condicao', { item: 'sem-papel' })).toBe('Sem papel');
    expect(textoDoAlerta('controlid.situacao', { item: '', valorTexto: 'sem-resposta' })).toBe(
      'Control iD sem resposta',
    );
    expect(textoDoAlerta('controlid.situacao', { item: '', valorTexto: 'login-recusado' })).toBe(
      'Control iD com login recusado',
    );
    expect(
      textoDoAlerta('controlid.situacao', { item: '', valorTexto: 'resposta-inesperada' }),
    ).toBe('Control iD com resposta inesperada');
    expect(textoDoAlerta('coleta.atrasada', { item: 'rede.disponibilidade' })).toBe(
      'Coleta atrasada: Disponibilidade na rede',
    );
    expect(textoDoAlerta('coleta.atrasada', { item: 'snmp.suprimentos' })).toBe(
      'Coleta atrasada: Suprimentos e contadores',
    );
    expect(textoDoAlerta('coletor.sem-contato', { item: '' })).toBe('Coletor sem contato');
  });

  it('cabe em 200 caracteres', () => {
    const longa = 'T'.repeat(300);
    expect(
      textoDoAlerta('toner.nivel', { item: '1', valorNumero: 5, detalhes: { descricao: longa } })
        .length,
    ).toBe(200);
  });
});

describe('observação de uma leitura', () => {
  it('a disponibilidade: offline dispara, online é normal, o resto é sem dado', () => {
    expect(observarLeitura(OFFLINE, valida({ valorTexto: 'offline' }), '')).toEqual({
      tipo: 'dispara',
      texto: 'Offline',
    });
    expect(observarLeitura(OFFLINE, valida({ valorTexto: 'online' }), '')).toEqual({
      tipo: 'normal',
    });
    expect(observarLeitura(OFFLINE, { ...valida(), situacao: 'sem-dado' }, '')).toEqual({
      tipo: 'sem-dado',
    });
    expect(observarLeitura(OFFLINE, null, '')).toEqual({ tipo: 'sem-dado' });
  });

  it('o toner: no limite dispara, na folga mantém, além dela é normal', () => {
    expect(observarLeitura(TONER, doToner(10), '1')).toEqual({
      tipo: 'dispara',
      texto: 'Toner preto em 10%',
    });
    expect(observarLeitura(TONER, doToner(12), '1')).toEqual({
      tipo: 'na-folga',
      texto: 'Toner preto em 12%',
    });
    expect(observarLeitura(TONER, doToner(15), '1')).toEqual({
      tipo: 'na-folga',
      texto: 'Toner preto em 15%',
    });
    expect(observarLeitura(TONER, doToner(16), '1')).toEqual({ tipo: 'normal' });
    // O nível que a impressora não mede não diz nada.
    expect(observarLeitura(TONER, doToner(null), '1')).toEqual({ tipo: 'sem-dado' });
    expect(observarLeitura(TONER, { ...doToner(8), situacao: 'inconsistente' }, '1')).toEqual({
      tipo: 'sem-dado',
    });
  });

  it('o suprimento que não é toner fica fora da regra', () => {
    expect(observarLeitura(TONER, doToner(5, 'Cilindro preto'), '2')).toEqual({
      tipo: 'fora-da-regra',
    });
  });

  it('as condições da impressora, uma por item', () => {
    const condicoes = (lista: string[]) => valida({ valorTexto: JSON.stringify(lista) });
    expect(observarLeitura(PARADA, condicoes(['sem-papel']), 'sem-papel')).toEqual({
      tipo: 'dispara',
      texto: 'Sem papel',
    });
    expect(observarLeitura(PARADA, condicoes([]), 'sem-papel')).toEqual({ tipo: 'normal' });
    // A condição que a regra deixou de escolher.
    expect(observarLeitura(PARADA, condicoes(['atolamento']), 'atolamento')).toEqual({
      tipo: 'fora-da-regra',
    });
    expect(observarLeitura(PARADA, valida({ valorTexto: 'quebrado' }), 'sem-papel')).toEqual({
      tipo: 'sem-dado',
    });
  });

  it('o item do alerta vale mesmo com a linha do estado trazendo o item dela', () => {
    // A linha das condições é do item vazio, e o alerta, de cada condição.
    const linha = { ...valida({ valorTexto: JSON.stringify(['sem-papel']) }), item: '' };
    expect(observarLeitura(PARADA, linha, 'sem-papel')).toEqual({
      tipo: 'dispara',
      texto: 'Sem papel',
    });
  });

  it('a saúde do Control iD, pelas situações escolhidas', () => {
    expect(observarLeitura(CONTROLE, valida({ valorTexto: 'sem-resposta' }), '')).toEqual({
      tipo: 'dispara',
      texto: 'Control iD sem resposta',
    });
    expect(observarLeitura(CONTROLE, valida({ valorTexto: 'respondendo' }), '')).toEqual({
      tipo: 'normal',
    });
    // Outra situação que pede atenção, mas que esta regra não escolheu, encerra a condição dela.
    expect(observarLeitura(CONTROLE, valida({ valorTexto: 'login-recusado' }), '')).toEqual({
      tipo: 'normal',
    });
    expect(observarLeitura(CONTROLE, valida({ valorTexto: 'outra' }), '')).toEqual({
      tipo: 'sem-dado',
    });
  });
});

describe('observação da coleta atrasada', () => {
  const agora = new Date('2026-10-14T10:00:00Z');
  const antes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000);
  const base = { intervalo: 120_000, ciclos: 3, agora, item: 'rede.disponibilidade' };

  it('a leitura dentro do prazo é normal', () => {
    expect(observarColetaAtrasada({ ...base, momento: antes(5), ultimoContato: antes(0) })).toEqual(
      { tipo: 'normal' },
    );
  });

  it('a leitura que não chega, com o coletor falando, dispara', () => {
    expect(observarColetaAtrasada({ ...base, momento: antes(7), ultimoContato: antes(0) })).toEqual(
      { tipo: 'dispara', texto: 'Coleta atrasada: Disponibilidade na rede' },
    );
  });

  it('com o coletor sem contato depois do prazo, não conclui', () => {
    expect(
      observarColetaAtrasada({ ...base, momento: antes(12), ultimoContato: antes(11) }),
    ).toEqual({ tipo: 'sem-dado' });
    expect(observarColetaAtrasada({ ...base, momento: antes(12), ultimoContato: null })).toEqual({
      tipo: 'sem-dado',
    });
  });
});

describe('observação do coletor', () => {
  const agora = new Date('2026-10-14T10:00:00Z');
  const antes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000);

  it('sem contato pelos minutos da regra dispara; o contato recente é normal', () => {
    expect(observarColetor({ ultimoContato: antes(10), minutos: 10, agora })).toEqual({
      tipo: 'dispara',
      texto: 'Coletor sem contato',
    });
    expect(observarColetor({ ultimoContato: antes(9), minutos: 10, agora })).toEqual({
      tipo: 'normal',
    });
  });

  it('o coletor que nunca falou com a API fica fora da regra', () => {
    expect(observarColetor({ ultimoContato: null, minutos: 10, agora })).toEqual({
      tipo: 'fora-da-regra',
    });
  });
});

describe('decisão do motor', () => {
  const agora = new Date('2026-10-14T10:15:00Z');
  const minutosAntes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000);
  const dispara = { tipo: 'dispara', texto: 'Toner preto em 8%' } as const;
  const aberto = (mudancas: Partial<AlertaNaDecisao> = {}): AlertaNaDecisao => ({
    situacao: 'aberto',
    observadoEm: minutosAntes(30),
    texto: 'Toner preto em 8%',
    severidade: 'critico',
    ...mudancas,
  });
  const decidir = (
    alerta: AlertaNaDecisao | null,
    observacao: Parameters<typeof decidirAlerta>[0]['observacao'],
    mudancas: Partial<Parameters<typeof decidirAlerta>[0]> = {},
  ) =>
    decidirAlerta({
      alerta,
      observacao,
      regra: { duracao: 0, severidade: 'critico' },
      silenciado: false,
      agora,
      ...mudancas,
    });

  it('sem alerta, a condição sem duração cria o aberto', () => {
    expect(decidir(null, dispara)).toEqual({
      acao: 'criar',
      abrir: true,
      texto: 'Toner preto em 8%',
      severidade: 'critico',
      abertoNoSilencio: false,
    });
  });

  it('sem alerta, a condição com duração cria o pendente', () => {
    expect(
      decidir(
        null,
        { tipo: 'dispara', texto: 'Offline' },
        {
          regra: { duracao: 5, severidade: 'atencao' },
        },
      ),
    ).toEqual({
      acao: 'criar',
      abrir: false,
      texto: 'Offline',
      severidade: 'atencao',
      abertoNoSilencio: false,
    });
  });

  it('sem alerta, o que não dispara não faz nada', () => {
    for (const tipo of ['normal', 'sem-dado', 'fora-da-regra'] as const) {
      expect(decidir(null, { tipo })).toEqual({ acao: 'nada' });
    }
    expect(decidir(null, { tipo: 'na-folga', texto: 'Toner preto em 12%' })).toEqual({
      acao: 'nada',
    });
  });

  it('o pendente abre quando a duração passa, e não antes', () => {
    const pendente = (minutos: number) =>
      aberto({ situacao: 'pendente', observadoEm: minutosAntes(minutos), texto: 'Offline' });
    const offline = { tipo: 'dispara', texto: 'Offline' } as const;
    const regraDe5 = { regra: { duracao: 5, severidade: 'atencao' } as const };
    expect(decidir(pendente(4), offline, regraDe5)).toEqual({ acao: 'nada' });
    expect(decidir(pendente(5), offline, regraDe5)).toEqual({
      acao: 'atualizar',
      abrir: true,
      texto: 'Offline',
      severidade: 'atencao',
      abertoNoSilencio: false,
      naTela: true,
    });
  });

  it('o pendente some quando a condição some, e espera com a leitura sem dado', () => {
    const pendente = aberto({ situacao: 'pendente' });
    expect(decidir(pendente, { tipo: 'normal' })).toEqual({ acao: 'descartar' });
    expect(decidir(pendente, { tipo: 'na-folga', texto: 'Toner preto em 12%' })).toEqual({
      acao: 'descartar',
    });
    expect(decidir(pendente, { tipo: 'fora-da-regra' })).toEqual({ acao: 'descartar' });
    expect(decidir(pendente, { tipo: 'sem-dado' })).toEqual({ acao: 'nada' });
  });

  it('o aberto atualiza o texto e a severidade, só quando mudam', () => {
    expect(decidir(aberto(), dispara)).toEqual({ acao: 'nada' });
    expect(decidir(aberto(), { tipo: 'dispara', texto: 'Toner preto em 7%' })).toEqual({
      acao: 'atualizar',
      abrir: false,
      texto: 'Toner preto em 7%',
      severidade: 'critico',
      abertoNoSilencio: false,
      naTela: true,
    });
    expect(decidir(aberto(), dispara, { regra: { duracao: 0, severidade: 'atencao' } })).toEqual({
      acao: 'atualizar',
      abrir: false,
      texto: 'Toner preto em 8%',
      severidade: 'atencao',
      abertoNoSilencio: false,
      naTela: true,
    });
  });

  it('o aberto continua aberto na folga, com o valor atual, e com a leitura sem dado', () => {
    expect(decidir(aberto(), { tipo: 'na-folga', texto: 'Toner preto em 12%' })).toEqual({
      acao: 'atualizar',
      abrir: false,
      texto: 'Toner preto em 12%',
      severidade: 'critico',
      abertoNoSilencio: false,
      naTela: true,
    });
    expect(decidir(aberto(), { tipo: 'sem-dado' })).toEqual({ acao: 'nada' });
  });

  it('o aberto se resolve ao voltar ao normal e é encerrado fora da regra', () => {
    expect(decidir(aberto(), { tipo: 'normal' })).toEqual({
      acao: 'resolver',
      como: 'voltou-ao-normal',
    });
    expect(decidir(aberto(), { tipo: 'fora-da-regra' })).toEqual({
      acao: 'resolver',
      como: 'regra-deixou-de-valer',
    });
  });

  it('o alerta que abre com o ativo silenciado fica marcado', () => {
    expect(decidir(null, dispara, { silenciado: true })).toMatchObject({
      acao: 'criar',
      abrir: true,
      abertoNoSilencio: true,
    });
    // O pendente guarda a marca só quando abre.
    expect(
      decidir(null, dispara, { silenciado: true, regra: { duracao: 5, severidade: 'critico' } }),
    ).toMatchObject({ acao: 'criar', abrir: false, abertoNoSilencio: false });
    expect(
      decidir(aberto({ situacao: 'pendente', observadoEm: minutosAntes(6) }), dispara, {
        silenciado: true,
        regra: { duracao: 5, severidade: 'critico' },
      }),
    ).toMatchObject({ acao: 'atualizar', abrir: true, abertoNoSilencio: true });
  });
});
