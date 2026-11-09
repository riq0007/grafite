// A saúde do Control iD (spec saude-do-control-id, "Login de cada controle" e "Situação do Control
// iD"; change p2c-saude-do-control-id, design, decisões 3 e 7): o login de cada controle, a situação
// com o motivo do "Não verificado", os rótulos e a ordem da coluna.
import { describe, expect, it } from 'vitest';
import {
  type LoginDoControle,
  loginDoControle,
  ORDEM_DAS_SITUACOES_DO_CONTROL_ID,
  ROTULOS_DAS_SITUACOES_DO_CONTROL_ID,
  type SegredoDoLogin,
  SITUACOES_DO_CONTROL_ID,
  situacaoDoControlId,
} from './control-id.ts';

const segredo = (id: string, extras: Partial<SegredoDoLogin> = {}): SegredoDoLogin => ({
  id,
  tipo: 'conta-administrativa',
  situacao: 'ativo',
  identificador: 'admin',
  ...extras,
});

const DO_TIPO = segredo('do-tipo');
const PORTARIA_NORTE = segredo('portaria-norte', { tipo: 'usuario-e-senha' });

describe('o login de cada controle', () => {
  it('sem login ligado ao controle, vale o do tipo', () => {
    expect(loginDoControle({ doTipo: DO_TIPO, ligados: [] })).toEqual({
      ok: true,
      origem: 'tipo',
      segredoId: 'do-tipo',
    });
  });

  it('o login ligado ao próprio controle vale no lugar do do tipo, mesmo com o do tipo inativo', () => {
    const esperado = { ok: true, origem: 'controle', segredoId: 'portaria-norte' };
    expect(loginDoControle({ doTipo: DO_TIPO, ligados: [PORTARIA_NORTE] })).toEqual(esperado);
    expect(
      loginDoControle({
        doTipo: { ...DO_TIPO, situacao: 'inativo' },
        ligados: [PORTARIA_NORTE],
      }),
    ).toEqual(esperado);
  });

  it('só servem os ligados ativos, de Usuário e senha ou Conta administrativa, com o usuário', () => {
    const ligados = [
      segredo('inativo', { situacao: 'inativo' }),
      segredo('wi-fi', { tipo: 'wi-fi' }),
      segredo('sem-usuario', { identificador: null }),
      segredo('usuario-em-branco', { identificador: '   ' }),
    ];
    expect(loginDoControle({ doTipo: DO_TIPO, ligados })).toEqual({
      ok: true,
      origem: 'tipo',
      segredoId: 'do-tipo',
    });
  });

  it('com dois logins ligados ao controle, ele não é sondado', () => {
    expect(
      loginDoControle({
        doTipo: DO_TIPO,
        ligados: [PORTARIA_NORTE, segredo('outro-admin')],
      }),
    ).toEqual({ ok: false, motivo: 'Há mais de um login ligado a este controle no cofre.' });
  });

  it('com o login do tipo inativo e nenhum ligado, ele não é sondado', () => {
    const inativo = { ok: false, motivo: 'O login escolhido no tipo está inativo.' };
    expect(loginDoControle({ doTipo: { ...DO_TIPO, situacao: 'inativo' }, ligados: [] })).toEqual(
      inativo,
    );
    expect(loginDoControle({ doTipo: null, ligados: [] })).toEqual(inativo);
  });

  // O tipo sem login (change login-de-cada-controle, design, decisão 2).
  it('com o tipo sem login e nenhum ligado, ele não é sondado, com o motivo sem login', () => {
    expect(loginDoControle({ doTipo: null, escolhidoNoTipo: false, ligados: [] })).toEqual({
      ok: false,
      motivo: 'Sem login: escolha o login deste controle ou o do tipo.',
    });
  });

  it('com o tipo sem login, vale o login ligado ao controle', () => {
    expect(
      loginDoControle({ doTipo: null, escolhidoNoTipo: false, ligados: [PORTARIA_NORTE] }),
    ).toEqual({ ok: true, origem: 'controle', segredoId: 'portaria-norte' });
  });
});

describe('a situação do Control iD', () => {
  const AGORA = new Date('2026-10-14T13:00:00.000Z');
  const minutosAtras = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);
  const DO_TIPO_OK: LoginDoControle = { ok: true, origem: 'tipo', segredoId: 'do-tipo' };
  const sondagem = (valorTexto: string | null, minutos = 2) => ({
    momento: minutosAtras(minutos),
    valorTexto,
    situacao: valorTexto === null ? ('sem-dado' as const) : ('valida' as const),
    desde: minutosAtras(minutos + 30),
  });
  const situacao = (extras: Partial<Parameters<typeof situacaoDoControlId>[0]> = {}) =>
    situacaoDoControlId({
      ip: '10.0.7.7',
      login: DO_TIPO_OK,
      estado: null,
      alcancado: true,
      agora: AGORA,
      ...extras,
    });

  it('a última sondagem dá a situação, com desde quando ela vale', () => {
    expect(situacao({ estado: sondagem('login-recusado') })).toEqual({
      situacao: 'login-recusado',
      momento: minutosAtras(2),
      desde: minutosAtras(32),
      desatualizado: false,
    });
    expect(situacao({ estado: sondagem(null) })).toMatchObject({ situacao: 'sem-dado' });
  });

  it('a sondagem de mais de 15 minutos, 3 intervalos, está desatualizada', () => {
    expect(situacao({ estado: sondagem('respondendo', 15) })).toMatchObject({
      desatualizado: false,
    });
    expect(situacao({ estado: sondagem('respondendo', 16) })).toMatchObject({
      situacao: 'respondendo',
      desatualizado: true,
    });
  });

  it('sem sondagem, aguarda a primeira ou diz que nenhum coletor alcança o IP', () => {
    expect(situacao()).toEqual({
      situacao: 'nao-verificado',
      motivo: 'Aguardando a primeira sondagem.',
    });
    expect(situacao({ ip: '10.9.0.5', alcancado: false })).toEqual({
      situacao: 'nao-verificado',
      motivo: 'Nenhum coletor alcança o IP 10.9.0.5.',
    });
  });

  it('sem IP, ou sem um login que sirva, não é verificado, mesmo com uma sondagem de antes', () => {
    expect(situacao({ ip: null, estado: sondagem('respondendo') })).toEqual({
      situacao: 'nao-verificado',
      motivo: 'Sem IP',
    });
    expect(
      situacao({
        login: { ok: false, motivo: 'Há mais de um login ligado a este controle no cofre.' },
        estado: sondagem('respondendo'),
      }),
    ).toEqual({
      situacao: 'nao-verificado',
      motivo: 'Há mais de um login ligado a este controle no cofre.',
    });
  });

  it('cada situação tem o rótulo em texto, e a ordem da coluna põe primeiro o que pede atenção', () => {
    expect(SITUACOES_DO_CONTROL_ID.map((uma) => ROTULOS_DAS_SITUACOES_DO_CONTROL_ID[uma])).toEqual([
      'Respondendo',
      'Login recusado',
      'Sem resposta',
      'Resposta inesperada',
      'Sem dado',
      'Não verificado',
    ]);
    expect(ORDEM_DAS_SITUACOES_DO_CONTROL_ID).toEqual([
      'sem-resposta',
      'login-recusado',
      'resposta-inesperada',
      'sem-dado',
      'respondendo',
      'nao-verificado',
    ]);
  });
});
