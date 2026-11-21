import { describe, expect, it } from 'vitest';
import { caminhoDaSituacao, type EtapaDoChamado, etapasDoChamado } from './caminho.ts';

// Hoje é 19/11, e ontem, 18/11, no fuso de São Paulo.
const ontem = (hora: string) => new Date(`2026-11-18T${hora}:00-03:00`);
const hoje = (hora: string) => new Date(`2026-11-19T${hora}:00-03:00`);

const ev = (evento: string, em: Date, para: string | null = null) => ({ evento, em, para });

const resumo = (etapas: EtapaDoChamado[]) =>
  etapas.map((etapa) => [
    etapa.situacao,
    etapa.estado === 'chegou' ? etapa.em.toISOString() : etapa.estado,
    ...(etapa.agora ? ['agora'] : []),
  ]);

describe('o caminho do chamado pelas situações', () => {
  it('cada evento que vale dá o passo, com a situação de antes e a de depois', () => {
    const passos = caminhoDaSituacao([
      ev('abertura', ontem('17:05')),
      ev('assumiu', ontem('17:20')),
      ev('aguardando', hoje('09:21')),
      ev('resolveu', hoje('10:00')),
    ]);
    expect(passos.map(({ evento, estava, situacao }) => [evento.evento, estava, situacao])).toEqual(
      [
        ['abertura', 'triagem', 'triagem'],
        ['assumiu', 'triagem', 'em-atendimento'],
        ['aguardando', 'em-atendimento', 'aguardando'],
        ['resolveu', 'aguardando', 'resolvido'],
      ],
    );
  });

  it('a abertura com quem atende, pelo "Fica comigo" ou pelo tipo, nasce Em atendimento', () => {
    const passos = caminhoDaSituacao([
      ev('abertura', hoje('10:32'), 'conta-diego'),
      ev('assumiu', hoje('10:40')),
      ev('aguardando', hoje('10:50')),
    ]);
    expect(passos.map(({ evento, estava, situacao }) => [evento.evento, estava, situacao])).toEqual(
      [
        ['abertura', 'triagem', 'em-atendimento'],
        ['assumiu', 'em-atendimento', 'em-atendimento'],
        ['aguardando', 'em-atendimento', 'aguardando'],
      ],
    );
  });

  it('o assumir e o passar no aguardando continuam nele, e o reabrir sem ninguém volta à triagem', () => {
    const passos = caminhoDaSituacao([
      ev('abertura', ontem('17:05')),
      ev('assumiu', ontem('17:20')),
      ev('aguardando', hoje('09:21')),
      ev('passou', hoje('09:30'), 'conta-bruno'),
      ev('assumiu', hoje('09:40')),
      ev('resolveu', hoje('10:00')),
      ev('reabriu', hoje('10:10'), 'conta-bruno'),
      ev('resolveu', hoje('10:20')),
      ev('reabriu', hoje('10:30')),
    ]);
    expect(passos.map(({ situacao }) => situacao)).toEqual([
      'triagem',
      'em-atendimento',
      'aguardando',
      'aguardando',
      'aguardando',
      'resolvido',
      'em-atendimento',
      'resolvido',
      'triagem',
    ]);
  });

  it('o desfazer tira o assumir de logo antes, também depois da OS e da solicitação', () => {
    const passos = caminhoDaSituacao([
      ev('abertura', ontem('17:05')),
      ev('assumiu', ontem('17:20')),
      ev('os', ontem('17:25')),
      ev('solicitacao', ontem('17:26')),
      ev('desfez', ontem('17:30')),
      ev('assumiu', hoje('08:00')),
    ]);
    expect(passos.map(({ evento, situacao }) => [evento.evento, situacao])).toEqual([
      ['abertura', 'triagem'],
      ['assumiu', 'em-atendimento'],
    ]);
    expect(passos[1]?.evento.em).toEqual(hoje('08:00'));
  });

  it('o desfazer sem o assumir logo antes não tira nada', () => {
    const passos = caminhoDaSituacao([
      ev('abertura', ontem('17:05')),
      ev('assumiu', ontem('17:20')),
      ev('aguardando', ontem('17:30')),
      ev('desfez', ontem('17:40')),
    ]);
    expect(passos.map(({ situacao }) => situacao)).toEqual([
      'triagem',
      'em-atendimento',
      'aguardando',
    ]);
  });

  it('os eventos que não mudam a situação nem quem atende ficam de fora', () => {
    const passos = caminhoDaSituacao(
      ['ativo', 'os', 'solicitacao', 'solicitacao-nao-gerada', 'escolheu', 'avaliou', 'fechou'].map(
        (evento) => ev(evento, hoje('10:00')),
      ),
    );
    expect(passos).toEqual([]);
  });
});

describe('as etapas para quem participa', () => {
  it('Etapas com as horas: o #1041, aberto ontem às 17:05, assumido às 17:20 e aguardando desde as 09:21', () => {
    const etapas = etapasDoChamado(
      [
        ev('abertura', ontem('17:05')),
        ev('assumiu', ontem('17:20')),
        ev('aguardando', hoje('09:21')),
      ],
      'aguardando',
    );
    expect(resumo(etapas)).toEqual([
      ['triagem', ontem('17:05').toISOString()],
      ['em-atendimento', ontem('17:20').toISOString()],
      ['aguardando', hoje('09:21').toISOString(), 'agora'],
      ['resolvido', 'ainda-nao'],
    ]);
  });

  it('a etapa que o chamado pulou fica sem hora', () => {
    const etapas = etapasDoChamado(
      [ev('abertura', hoje('10:32')), ev('assumiu', hoje('10:40')), ev('resolveu', hoje('11:20'))],
      'resolvido',
    );
    expect(resumo(etapas)).toEqual([
      ['triagem', hoje('10:32').toISOString()],
      ['em-atendimento', hoje('10:40').toISOString()],
      ['aguardando', 'pulada'],
      ['resolvido', hoje('11:20').toISOString(), 'agora'],
    ]);
  });

  it('o chamado que nasce Em atendimento chega na abertura ao Aberto e ao Em andamento', () => {
    expect(
      resumo(etapasDoChamado([ev('abertura', hoje('10:32'), 'conta-diego')], 'em-atendimento')),
    ).toEqual([
      ['triagem', hoje('10:32').toISOString()],
      ['em-atendimento', hoje('10:32').toISOString(), 'agora'],
      ['aguardando', 'ainda-nao'],
      ['resolvido', 'ainda-nao'],
    ]);
    // Resolvido sem outro passo, o Em andamento tem a hora da abertura, e não fica como pulado.
    expect(
      resumo(
        etapasDoChamado(
          [ev('abertura', hoje('10:32'), 'conta-ana'), ev('resolveu', hoje('11:20'))],
          'resolvido',
        ),
      ),
    ).toEqual([
      ['triagem', hoje('10:32').toISOString()],
      ['em-atendimento', hoje('10:32').toISOString()],
      ['aguardando', 'pulada'],
      ['resolvido', hoje('11:20').toISOString(), 'agora'],
    ]);
  });

  it('cada etapa tem a hora da última chegada a ela, e o passar e o assumir no aguardando não chegam de novo', () => {
    const etapas = etapasDoChamado(
      [
        ev('abertura', ontem('17:05')),
        ev('assumiu', ontem('17:20')),
        ev('aguardando', hoje('09:21')),
        ev('retomou', hoje('10:00')),
        ev('passou', hoje('10:05'), 'conta-bruno'),
        ev('aguardando', hoje('10:30')),
        ev('assumiu', hoje('10:35')),
      ],
      'aguardando',
    );
    expect(resumo(etapas)).toEqual([
      ['triagem', ontem('17:05').toISOString()],
      ['em-atendimento', hoje('10:00').toISOString()],
      ['aguardando', hoje('10:30').toISOString(), 'agora'],
      ['resolvido', 'ainda-nao'],
    ]);
  });

  it('as etapas depois da de agora dizem "ainda não", também a que o chamado já passou antes', () => {
    const etapas = etapasDoChamado(
      [
        ev('abertura', ontem('17:05')),
        ev('assumiu', ontem('17:20')),
        ev('aguardando', hoje('09:21')),
        ev('resolveu', hoje('09:50')),
        ev('reabriu', hoje('10:10'), 'conta-ana'),
      ],
      'em-atendimento',
    );
    expect(resumo(etapas)).toEqual([
      ['triagem', ontem('17:05').toISOString()],
      ['em-atendimento', hoje('10:10').toISOString(), 'agora'],
      ['aguardando', 'ainda-nao'],
      ['resolvido', 'ainda-nao'],
    ]);
  });

  it('o reabrir sem ninguém chega de novo à triagem', () => {
    const etapas = etapasDoChamado(
      [
        ev('abertura', ontem('17:05')),
        ev('assumiu', ontem('17:20')),
        ev('resolveu', ontem('18:00')),
        ev('reabriu', hoje('10:10')),
      ],
      'triagem',
    );
    expect(resumo(etapas)).toEqual([
      ['triagem', hoje('10:10').toISOString(), 'agora'],
      ['em-atendimento', 'ainda-nao'],
      ['aguardando', 'ainda-nao'],
      ['resolvido', 'ainda-nao'],
    ]);
  });

  it('o desfazer, que a pessoa não lê, tira a chegada do assumir e devolve a de antes', () => {
    const naTriagem = etapasDoChamado(
      [
        ev('abertura', ontem('17:05')),
        ev('assumiu', ontem('17:10')),
        ev('devolveu', ontem('17:15')),
        ev('assumiu', ontem('17:20')),
        ev('desfez', ontem('17:21')),
      ],
      'triagem',
    );
    // A chegada à triagem é a do devolver, de antes do assumir desfeito, e não a do desfazer.
    expect(resumo(naTriagem)).toEqual([
      ['triagem', ontem('17:15').toISOString(), 'agora'],
      ['em-atendimento', 'ainda-nao'],
      ['aguardando', 'ainda-nao'],
      ['resolvido', 'ainda-nao'],
    ]);

    const comAna = etapasDoChamado(
      [
        ev('abertura', ontem('17:05')),
        ev('assumiu', ontem('17:20')),
        ev('assumiu', hoje('09:00')),
        ev('desfez', hoje('09:01')),
      ],
      'em-atendimento',
    );
    expect(resumo(comAna)).toEqual([
      ['triagem', ontem('17:05').toISOString()],
      ['em-atendimento', ontem('17:20').toISOString(), 'agora'],
      ['aguardando', 'ainda-nao'],
      ['resolvido', 'ainda-nao'],
    ]);
  });

  it('o fechado tem o Resolvido como a etapa de agora', () => {
    const etapas = etapasDoChamado(
      [
        ev('abertura', ontem('10:32')),
        ev('assumiu', ontem('10:40')),
        ev('resolveu', ontem('11:20')),
        ev('fechou', hoje('00:00')),
      ],
      'resolvido',
    );
    expect(etapas.at(-1)).toEqual({
      situacao: 'resolvido',
      agora: true,
      estado: 'chegou',
      em: ontem('11:20'),
    });
  });
});
