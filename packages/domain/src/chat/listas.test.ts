import { describe, expect, it } from 'vitest';
import {
  type ChamadoNaLista,
  chamadosComRespostaNova,
  contadorDoChat,
  gruposDaVistaChamados,
  type LinhaParaARespostaNova,
  linhasPorVer,
  ordemDasEquipesECanais,
  ordemDasRecentes,
  respostaNova,
  respostaPorVer,
  secoesDoChat,
  totalDoChat,
} from './listas.ts';

const as = (hora: string) => new Date(`2026-11-11T${hora}:00-03:00`);

const chamado = (
  numero: number,
  situacao: ChamadoNaLista['situacao'],
  abertoEm: string,
  extra: Partial<ChamadoNaLista> = {},
): ChamadoNaLista => ({
  numero,
  situacao,
  fechado: false,
  abertoEm: as(abertoEm),
  resolvidoEm: situacao === 'resolvido' ? as('18:00') : null,
  pelaTi: false,
  ...extra,
});

const numeros = (lista: readonly ChamadoNaLista[]) => lista.map(({ numero }) => numero);

describe('as seções da lista do Chat', () => {
  it('CHAMADOS: os que aguardam a conta primeiro, depois os outros, o aberto mais novo primeiro', () => {
    const { chamados } = secoesDoChat([
      chamado(1044, 'em-atendimento', '09:10'),
      chamado(1041, 'aguardando', '08:00'),
      chamado(1045, 'triagem', '10:32'),
      chamado(1039, 'aguardando', '09:30'),
    ]);
    expect(numeros(chamados)).toEqual([1039, 1041, 1045, 1044]);
  });

  it('Chamado novo no alto: o que a conta acaba de abrir fica antes dos que aguardam', () => {
    const lista = [
      chamado(1041, 'aguardando', '08:00'),
      chamado(1044, 'em-atendimento', '09:10'),
      chamado(1045, 'triagem', '10:32'),
    ];
    expect(numeros(secoesDoChat(lista, 1045).chamados)).toEqual([1045, 1041, 1044]);
    expect(numeros(secoesDoChat(lista).chamados)).toEqual([1041, 1045, 1044]);
  });

  it('quem participa pela TI: o que aguarda a pessoa fica com os outros, pelo aberto mais novo', () => {
    const { chamados } = secoesDoChat([
      chamado(1041, 'aguardando', '08:00'),
      chamado(1050, 'aguardando', '09:40', { pelaTi: true }),
      chamado(1044, 'em-atendimento', '09:10'),
      chamado(1045, 'triagem', '10:32'),
    ]);
    expect(numeros(chamados)).toEqual([1041, 1045, 1050, 1044]);
  });

  it('a mesma hora de abertura desempata pelo número mais alto', () => {
    const { chamados } = secoesDoChat([
      chamado(1050, 'triagem', '10:00'),
      chamado(1051, 'triagem', '10:00'),
    ]);
    expect(numeros(chamados)).toEqual([1051, 1050]);
  });

  it('Fechados recolhidos: FECHADOS com os resolvidos que ainda se reabrem, o resolvido mais novo primeiro', () => {
    const { chamados, fechados } = secoesDoChat([
      chamado(1030, 'resolvido', '08:00', { resolvidoEm: as('17:00') }),
      chamado(1031, 'resolvido', '08:10', { resolvidoEm: as('18:30') }),
      chamado(1020, 'resolvido', '07:00', { resolvidoEm: as('19:00'), fechado: true }),
      chamado(1045, 'triagem', '10:32'),
    ]);
    expect(numeros(chamados)).toEqual([1045]);
    expect(numeros(fechados)).toEqual([1031, 1030]);
  });
});

describe('os grupos da vista Chamados', () => {
  it('Grupos dos chamados: pela vez de quem age, só os que têm chamados, nesta ordem', () => {
    const grupos = gruposDaVistaChamados([
      chamado(1044, 'em-atendimento', '09:10'),
      chamado(1045, 'em-atendimento', '10:32'),
      chamado(1041, 'aguardando', '08:00'),
      chamado(1030, 'resolvido', '08:00'),
    ]);
    expect(grupos.map(({ grupo, chamados }) => [grupo, numeros(chamados)])).toEqual([
      ['aguardando-voce', [1041]],
      ['em-andamento', [1045, 1044]],
      ['fechados', [1030]],
    ]);
  });

  it('ABERTOS tem os da triagem, e FECHADOS os resolvidos e os fechados, o resolvido mais novo primeiro', () => {
    const grupos = gruposDaVistaChamados([
      chamado(1020, 'resolvido', '07:00', { resolvidoEm: as('19:00'), fechado: true }),
      chamado(1046, 'triagem', '10:40'),
      chamado(1030, 'resolvido', '08:00', { resolvidoEm: as('17:00') }),
    ]);
    expect(grupos.map(({ grupo, chamados }) => [grupo, numeros(chamados)])).toEqual([
      ['abertos', [1046]],
      ['fechados', [1020, 1030]],
    ]);
  });

  it('quem participa pela TI: o que aguarda a pessoa fica em EM ANDAMENTO', () => {
    const grupos = gruposDaVistaChamados([
      chamado(1041, 'aguardando', '08:00'),
      chamado(1050, 'aguardando', '09:40', { pelaTi: true }),
      chamado(1044, 'em-atendimento', '09:10'),
      chamado(1046, 'triagem', '10:40', { pelaTi: true }),
    ]);
    expect(grupos.map(({ grupo, chamados }) => [grupo, numeros(chamados)])).toEqual([
      ['aguardando-voce', [1041]],
      ['em-andamento', [1050, 1044]],
      ['abertos', [1046]],
    ]);
  });

  it('sem chamados, nenhum grupo', () => {
    expect(gruposDaVistaChamados([])).toEqual([]);
  });
});

describe('as equipes, os canais e as recentes', () => {
  it('EQUIPES E CANAIS em ordem de nome, sem diferenciar acentos e maiúsculas', () => {
    const lista = ordemDasEquipesECanais([
      { id: 'c', nome: 'Manutenção' },
      { id: 'a', nome: 'avisos da TI' },
      { id: 'b', nome: 'Equipe Financeiro' },
      { id: 'd', nome: 'Ética' },
    ]);
    expect(lista.map(({ nome }) => nome)).toEqual([
      'avisos da TI',
      'Equipe Financeiro',
      'Ética',
      'Manutenção',
    ]);
  });

  it('RECENTES: a conversa da mensagem mais nova primeiro', () => {
    const lista = ordemDasRecentes([
      { id: 'paulo', ultimaMensagemEm: as('09:00') },
      { id: 'tatiana', ultimaMensagemEm: as('10:19') },
      { id: 'ana', ultimaMensagemEm: as('08:30') },
    ]);
    expect(lista.map(({ id }) => id)).toEqual(['tatiana', 'paulo', 'ana']);
  });
});

describe('as não lidas', () => {
  it('o contador some no zero e passa de 99 como "99+"', () => {
    expect(contadorDoChat(0)).toBeNull();
    expect(contadorDoChat(1)).toBe('1');
    expect(contadorDoChat(99)).toBe('99');
    expect(contadorDoChat(100)).toBe('99+');
    expect(contadorDoChat(250)).toBe('99+');
  });

  it('Contadores da trilha: o total soma as conversas, fora as silenciadas', () => {
    expect(
      totalDoChat([
        { naoLidas: 3, silenciada: false },
        { naoLidas: 1, silenciada: false },
        { naoLidas: 7, silenciada: true },
        { naoLidas: 0, silenciada: false },
      ]),
    ).toBe(4);
  });
});

describe('a resposta nova', () => {
  const FERNANDA = 'conta-fernanda';
  const ANA = 'conta-ana';
  const BRUNO = 'conta-bruno';

  // Os ids são o uuidv7 das linhas, que ordena a conversa.
  const id = (n: number) => `019a7f00-0000-7000-8000-${String(n).padStart(12, '0')}`;
  const daTi = (n: number, autorConta = BRUNO): LinhaParaARespostaNova => ({
    id: id(n),
    especie: 'mensagem',
    autorConta,
  });
  const daPessoa = (n: number): LinhaParaARespostaNova => ({
    id: id(n),
    especie: 'mensagem',
    autorConta: null,
  });
  const nota = (n: number): LinhaParaARespostaNova => ({
    id: id(n),
    especie: 'nota',
    autorConta: BRUNO,
  });
  const evento = (n: number): LinhaParaARespostaNova => ({
    id: id(n),
    especie: 'evento',
    autorConta: BRUNO,
  });

  const nova = (
    linhas: LinhaParaARespostaNova[],
    vistaAte: string | null,
    extra: { situacao?: ChamadoNaLista['situacao']; contaId?: string; pelaTi?: boolean } = {},
  ) =>
    respostaNova({
      situacao: extra.situacao ?? 'em-atendimento',
      linhas,
      contaId: extra.contaId ?? FERNANDA,
      vistaAte,
      pelaTi: extra.pelaTi ?? false,
    });

  it('Resposta que fica: as mensagens da TI depois da vista_ate contam, e abrir não muda nada', () => {
    expect(nova([daPessoa(1), daTi(2), daTi(3)], id(1))).toBe(2);
    expect(nova([daPessoa(1), daTi(2), daTi(3)], id(2))).toBe(1);
  });

  it('sem a vista_ate, todas as mensagens da TI contam', () => {
    expect(nova([daTi(1), daPessoa(2), daTi(3)], null)).toBe(2);
  });

  it('Marcar como vista: a vista_ate na última linha tira a resposta, e a mensagem seguinte a traz', () => {
    const conversa = [daTi(1), daTi(2)];
    expect(nova(conversa, id(2))).toBe(0);
    expect(nova([...conversa, daTi(3)], id(2))).toBe(1);
  });

  it('a vista_ate na mensagem ou no evento de quem participa conta só o que vem depois', () => {
    // A vista_ate é a última linha da conversa na hora da ação: a mensagem dele, ou o evento da
    // escolha, do reabrir ou da avaliação.
    expect(nova([daTi(1), daPessoa(2), daTi(3)], id(2))).toBe(1);
    expect(nova([daTi(1), evento(2), daTi(3), daTi(4)], id(2))).toBe(2);
  });

  it('só as mensagens da TI contam: as de quem participa, as notas e os eventos, não', () => {
    expect(nova([daPessoa(2), nota(3), evento(4)], id(1))).toBe(0);
  });

  it('A própria mensagem: a da conta da TI que é a pessoa do chamado não conta para ela', () => {
    expect(nova([daTi(2, ANA)], id(1), { contaId: ANA })).toBe(0);
    expect(nova([daTi(2, ANA), daTi(3, BRUNO)], id(1), { contaId: ANA })).toBe(1);
  });

  it('Quem participa pela TI: nenhuma resposta nova, também com as mensagens de outra conta da TI', () => {
    expect(nova([daPessoa(1), daTi(2, BRUNO), daTi(3, BRUNO)], id(1), { pelaTi: true })).toBe(0);
    expect(nova([daTi(1, BRUNO)], null, { contaId: ANA, pelaTi: true })).toBe(0);
    for (const situacao of ['triagem', 'em-atendimento', 'aguardando'] as const) {
      expect(nova([daTi(2)], id(1), { situacao, pelaTi: true })).toBe(0);
    }
  });

  it('Resolvido sem resposta nova: o resolvido e o fechado não têm resposta nova', () => {
    expect(nova([daTi(2), daTi(3)], id(1), { situacao: 'resolvido' })).toBe(0);
    for (const situacao of ['triagem', 'em-atendimento', 'aguardando'] as const) {
      expect(nova([daTi(2)], id(1), { situacao })).toBe(1);
    }
  });

  it('o id compara pela ordem do uuidv7, também com as letras maiúsculas', () => {
    const linha = { id: id(10).toUpperCase(), especie: 'mensagem' as const, autorConta: BRUNO };
    expect(nova([linha], id(9))).toBe(1);
    expect(nova([linha], id(10))).toBe(0);
  });

  it('a trilha conta os chamados com resposta nova, e não as mensagens', () => {
    expect(
      chamadosComRespostaNova([{ respostaNova: 3 }, { respostaNova: 0 }, { respostaNova: 1 }]),
    ).toBe(2);
  });
});

describe('a resposta por ver', () => {
  const FERNANDA = 'conta-fernanda';
  const ANA = 'conta-ana';
  const id = (n: number) => `019a7f00-0000-7000-8000-${String(n).padStart(12, '0')}`;
  const linha = (
    n: number,
    hora: string,
    autorConta: string | null,
    especie: LinhaParaARespostaNova['especie'] = 'mensagem',
  ) => ({ id: id(n), especie, autorConta, criadaEm: as(hora) });

  const porVer = (
    linhas: ReturnType<typeof linha>[],
    abertaEm: Date | null,
    extra: { vistaAte?: string | null; situacao?: ChamadoNaLista['situacao'] } = {},
  ) =>
    respostaPorVer({
      situacao: extra.situacao ?? 'em-atendimento',
      linhas,
      contaId: FERNANDA,
      vistaAte: extra.vistaAte ?? null,
      pelaTi: false,
      abertaEm,
    });

  it('Vista sem responder: abrir a conversa tira a resposta por ver, e a resposta nova fica', () => {
    const conversa = [linha(1, '09:00', null), linha(2, '09:21', ANA)];
    expect(porVer(conversa, null)).toBe(1);
    expect(porVer(conversa, as('10:12'))).toBe(0);
    expect(
      respostaNova({
        situacao: 'em-atendimento',
        linhas: conversa,
        contaId: FERNANDA,
        vistaAte: null,
        pelaTi: false,
      }),
    ).toBe(1);
  });

  it('Outra resposta depois de vista: a mensagem das 10:20 volta a estar por ver', () => {
    const conversa = [linha(1, '09:21', ANA), linha(2, '10:20', ANA)];
    expect(porVer(conversa, as('10:12'))).toBe(1);
  });

  it('o que tira a resposta nova tira também a resposta por ver', () => {
    const conversa = [linha(1, '09:21', ANA), linha(2, '09:30', ANA)];
    expect(porVer(conversa, null, { vistaAte: id(2) })).toBe(0);
    expect(porVer(conversa, null, { situacao: 'resolvido' })).toBe(0);
  });

  it('a mensagem do mesmo instante da abertura conta como vista', () => {
    expect(porVer([linha(1, '10:12', ANA)], as('10:12'))).toBe(0);
  });

  it('quem atende pela TI não tem resposta por ver', () => {
    expect(
      respostaPorVer({
        situacao: 'em-atendimento',
        linhas: [linha(1, '09:21', ANA)],
        contaId: FERNANDA,
        vistaAte: null,
        pelaTi: true,
        abertaEm: null,
      }),
    ).toBe(0);
  });

  it('as linhas por ver vêm na ordem da conversa, com a última no fim', () => {
    const conversa = [
      linha(1, '09:21', ANA),
      linha(2, '09:00', null),
      linha(3, '10:20', 'conta-bruno'),
    ];
    expect(
      linhasPorVer({
        situacao: 'em-atendimento',
        linhas: conversa,
        contaId: FERNANDA,
        vistaAte: null,
        pelaTi: false,
        abertaEm: null,
      }).map(({ autorConta }) => autorConta),
    ).toEqual([ANA, 'conta-bruno']);
  });

  it('a nota e o evento da TI não ficam por ver', () => {
    expect(porVer([linha(1, '09:21', ANA, 'nota'), linha(2, '09:22', ANA, 'evento')], null)).toBe(
      0,
    );
  });
});
