// O horário da TI pela API (spec chamados, "Horário da TI"; change chamados-da-ti, design, decisão
// 3, tarefa 4.5), para quem configura os chamados: a leitura, com o padrão enquanto a organização
// não grava o dela; a gravação pela conferência do domínio, com o formato no esquema da rota; e o
// fechamento dos relógios que contam no horário, na mesma transação, sem subir a versão: o tempo
// contado até a troca fica pelo horário antigo, e uma espera que cruza a troca não conta o tempo
// duas vezes. Tudo com a auditoria e o evento dos ajustes.
import { chamados, eventos, horarioDaTi, naOrganizacao, tiposDeChamado } from '@grafite/db';
import { TIPOS_DE_CHAMADO_DE_FABRICA } from '@grafite/domain';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  criarRelogio,
  type Entrada,
  esperarNaTrava,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';
import { travar } from '../travas.ts';

const host = 'grafite.chamados-horario.local';
const ATOR = { tipo: 'sistema', descricao: 'teste do horário da TI' } as const;
const AJUSTES = {
  tipo: 'ajustes-dos-chamados.mudaram',
  permissoes: ['chamados.ver', 'chamados.atender', 'chamados.configurar'],
};
/** A sexta-feira, 2 de outubro de 2026, às 11:00 em São Paulo. */
const AGORA = new Date('2026-10-02T14:00:00.000Z');
const AS_0700 = new Date('2026-10-02T10:00:00.000Z');
const AS_0830 = new Date('2026-10-02T11:30:00.000Z');

interface Pedido {
  dias: number[];
  inicio: number;
  fim: number;
  fuso: string;
  cargaCheia: number;
}

/** O padrão do domínio: de segunda a sexta, das 08:00 às 18:00, em São Paulo, com a carga de 5. */
const PADRAO: Pedido = {
  dias: [1, 2, 3, 4, 5],
  inicio: 8 * 60,
  fim: 18 * 60,
  fuso: 'America/Sao_Paulo',
  cargaCheia: 5,
};
/** O fim das 18:00 passa para as 17:00. */
const ATE_AS_17: Pedido = { ...PADRAO, fim: 17 * 60 };

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
let tipo = '';
let ana = '';
let renato = '';
let pessoa = '';
let numero = 1000;

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const ler = (usuario = 'ana') => cliente.consultar('/chamados/horario-da-ti', como(usuario));
const salvar = (pedido: object, usuario = 'ana') =>
  cliente.enviar('PUT', '/chamados/horario-da-ti', como(usuario), pedido);

/**
 * Um chamado direto no banco, com o relógio pedido: na triagem e em atendimento ele conta desde
 * `relogioDesde`; aguardando, ele está parado com o contado.
 */
function chamado({
  modo,
  situacao,
  relogioDesde,
  contadoS,
}: {
  modo: 'corridas' | 'horario';
  situacao: 'triagem' | 'em-atendimento' | 'aguardando';
  relogioDesde: Date | null;
  contadoS: number;
}) {
  numero += 1;
  const formulario = TIPOS_DE_CHAMADO_DE_FABRICA.find(({ nome }) => nome === 'Outro')?.formulario;
  return naOrganizacao(api.banco, org, async (tx) => {
    const [gravado] = await tx
      .insert(chamados)
      .values({
        orgId: org,
        numero,
        tipoId: tipo,
        titulo: 'Impressora manchando',
        tituloNormalizado: 'impressora manchando',
        pessoaId: pessoa,
        origem: 'ti',
        abertoPor: renato,
        abertoEm: AS_0700,
        formulario: { ...formulario },
        situacao,
        responsavelId: situacao === 'triagem' ? null : renato,
        responsavelDesde: situacao === 'triagem' ? null : AS_0700,
        prazo: {
          modo,
          respostaMin: 60,
          resolucaoMin: 1800,
          resposta: { valor: 1, unidade: 'h' },
          resolucao: { valor: 3, unidade: 'd' },
        },
        contadoS,
        relogioDesde,
        primeiraRespostaEm: AS_0700,
      })
      .returning({ id: chamados.id });
    return gravado?.id ?? '';
  });
}

const relogioDo = (id: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({
        situacao: chamados.situacao,
        contadoS: chamados.contadoS,
        relogioDesde: chamados.relogioDesde,
        versao: chamados.versao,
      })
      .from(chamados)
      .where(eq(chamados.id, id));
    return linha;
  });

const linhasDoHorario = () =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [contagem] = await tx.select({ total: count() }).from(horarioDaTi);
    return contagem?.total ?? 0;
  });

/** O que a requisição registrou na auditoria. */
const acoesDa = async (resposta: { headers: Record<string, unknown> }) =>
  (await auditoriaDaRequisicao(api, org, resposta)).map(
    ({ acao, alvoTipo, alvoId, atorContaId, antes, depois, dados }) => ({
      acao,
      alvoTipo,
      alvoId,
      atorContaId,
      antes,
      depois,
      dados,
    }),
  );

const eventosGravados = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.select({ tipo: eventos.tipo, permissoes: eventos.permissoes }).from(eventos),
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(AGORA) });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, (tx) =>
    criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
  );
  tipo = await naOrganizacao(
    api.banco,
    org,
    async (tx) =>
      (
        await tx
          .select({ id: tiposDeChamado.id })
          .from(tiposDeChamado)
          .where(eq(tiposDeChamado.nome, 'Outro'))
      )[0]?.id ?? '',
  );

  cliente = clienteDaApi(api, host);
  // Ana configura os chamados; Renato os atende, sem configurar. Os chamados são de Fernanda.
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  ana = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  renato = (await criarConta(api, org, { usuario: 'renato', nome: 'Renato Alves' })).id;
  pessoa = (await criarConta(api, org, { usuario: 'fernanda', nome: 'Fernanda Rocha' })).pessoaId;
  await atribuir(api, org, { perfilId: configura, contaId: ana });
  await atribuir(api, org, { perfilId: atende, contaId: renato });
  for (const usuario of ['ana', 'renato']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  // Cada teste começa do padrão, sem eventos e com os chamados dos outros resolvidos, porque o
  // papel da aplicação não apaga chamados e a troca do horário fecha todos os que contam.
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(horarioDaTi);
    await tx.delete(eventos);
    await tx
      .update(chamados)
      .set({ situacao: 'resolvido', relogioDesde: null, resolvidoEm: AGORA, resolvidoPor: renato });
  });
});

describe('a leitura do horário', () => {
  it('sem a linha, vale o padrão: de segunda a sexta, das 08:00 às 18:00, em São Paulo', async () => {
    const r = await ler();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual(PADRAO);
  });
});

describe('a gravação do horário', () => {
  it('grava o horário conferido, com a auditoria e o evento', async () => {
    const r = await salvar({
      dias: [5, 1, 3, 1],
      inicio: 9 * 60,
      fim: 17 * 60,
      fuso: ' America/Recife ',
      cargaCheia: 8,
    });
    expect(r.statusCode, r.body).toBe(200);
    const novo = { dias: [1, 3, 5], inicio: 540, fim: 1020, fuso: 'America/Recife', cargaCheia: 8 };
    expect(r.json()).toEqual(novo);
    expect((await ler()).json()).toEqual(novo);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'horario-da-ti.alterado',
        alvoTipo: 'horario-da-ti',
        alvoId: null,
        atorContaId: ana,
        antes: PADRAO,
        depois: novo,
        dados: { relogiosFechados: 0 },
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);

    // A segunda gravação muda a linha que a primeira criou.
    const outra = await salvar({ ...novo, cargaCheia: 6 });
    expect(outra.statusCode, outra.body).toBe(200);
    expect((await ler()).json()).toEqual({ ...novo, cargaCheia: 6 });
    expect(await linhasDoHorario()).toBe(1);
  });

  it('o horário igual ao de agora não grava nada, nem a linha do padrão', async () => {
    const r = await salvar({ ...PADRAO, dias: [5, 4, 3, 2, 1], fuso: 'America/Sao_Paulo ' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual(PADRAO);
    expect(await acoesDa(r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
    expect(await linhasDoHorario()).toBe(0);
  });

  it('as recusas da spec ficam no campo, e nada é gravado', async () => {
    const r = await salvar({
      dias: [],
      inicio: 600,
      fim: 600,
      fuso: 'Marte/Olimpo',
      cargaCheia: 21,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({
      dias: 'Escolha ao menos um dia.',
      fim: 'O fim vem depois do início.',
      fuso: 'Escolha um fuso da lista.',
      cargaCheia: 'Use um número inteiro de 1 a 20.',
    });
    for (const cargaCheia of [0, 1.5]) {
      const carga = await salvar({ ...PADRAO, cargaCheia });
      expect(carga.statusCode).toBe(400);
      expect(carga.json().campos).toEqual({ cargaCheia: 'Use um número inteiro de 1 a 20.' });
    }
    const antes = await salvar({ ...PADRAO, inicio: 18 * 60, fim: 8 * 60 });
    expect(antes.json().campos).toEqual({ fim: 'O fim vem depois do início.' });
    expect((await ler()).json()).toEqual(PADRAO);
    expect(await linhasDoHorario()).toBe(0);
  });

  it('o esquema recusa o dia 0 e o 8, o minuto com fração, o −1 e o 1.440', async () => {
    for (const pedido of [
      { ...PADRAO, dias: [0, 1] },
      { ...PADRAO, dias: [1, 8] },
      { ...PADRAO, inicio: 480.5 },
      { ...PADRAO, inicio: -1 },
      { ...PADRAO, fim: 1440 },
    ]) {
      const r = await salvar(pedido);
      expect(r.statusCode, JSON.stringify(pedido)).toBe(400);
    }
    expect((await ler()).json()).toEqual(PADRAO);
    expect(await linhasDoHorario()).toBe(0);
  });
});

describe('os relógios dos chamados abertos', () => {
  it('Horário mudado com chamados abertos: o contado até a troca fica, e o relógio recomeça nela', async () => {
    // Às 11:00, o #1 conta no horário desde as 08:30, com 10 min de antes; o #2 é de horas
    // corridas; o #3 espera o colaborador, parado; o #4 está na triagem desde as 07:00, antes do
    // horário, e só conta das 08:00 em diante.
    const noHorario = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 600,
    });
    const corridas = await chamado({
      modo: 'corridas',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 600,
    });
    const parado = await chamado({
      modo: 'horario',
      situacao: 'aguardando',
      relogioDesde: null,
      contadoS: 1200,
    });
    const naTriagem = await chamado({
      modo: 'horario',
      situacao: 'triagem',
      relogioDesde: AS_0700,
      contadoS: 0,
    });

    const r = await salvar(ATE_AS_17);
    expect(r.statusCode, r.body).toBe(200);
    // Das 08:30 às 11:00, pelo horário antigo: 2 h 30 min.
    expect(await relogioDo(noHorario)).toEqual({
      situacao: 'em-atendimento',
      contadoS: 600 + 9000,
      relogioDesde: AGORA,
      versao: 1,
    });
    expect(await relogioDo(corridas)).toEqual({
      situacao: 'em-atendimento',
      contadoS: 600,
      relogioDesde: AS_0830,
      versao: 1,
    });
    expect(await relogioDo(parado)).toEqual({
      situacao: 'aguardando',
      contadoS: 1200,
      relogioDesde: null,
      versao: 1,
    });
    // Das 08:00 às 11:00: 3 h.
    expect(await relogioDo(naTriagem)).toMatchObject({ contadoS: 10800, relogioDesde: AGORA });
    expect((await acoesDa(r))[0]?.dados).toEqual({ relogiosFechados: 2 });
  });

  it('o trecho até a troca conta pelo horário antigo, e não pelo novo', async () => {
    // O início passa das 08:00 para as 10:00 às 11:00. Pelo horário antigo, o trecho desde as
    // 08:30 tem 2 h 30 min; pelo novo, teria 1 h.
    const noHorario = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 0,
    });
    const r = await salvar({ ...PADRAO, inicio: 10 * 60 });
    expect(r.statusCode, r.body).toBe(200);
    expect(await relogioDo(noHorario)).toMatchObject({ contadoS: 9000, relogioDesde: AGORA });
  });

  it('duas trocas ao mesmo tempo: a segunda espera a primeira e parte do horário dela', async () => {
    // As duas param na trava de outra transação. Sem a trava na troca, as duas leriam o padrão
    // como o horário de antes, e a segunda fecharia os relógios pelo horário errado.
    let soltar = () => {};
    let presa = () => {};
    const travada = new Promise<void>((resolve) => {
      presa = resolve;
    });
    const segurando = naOrganizacao(api.banco, org, async (tx) => {
      await travar(tx, 'horario-da-ti');
      presa();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await travada;
    let primeira: ReturnType<typeof salvar> | undefined;
    let segunda: ReturnType<typeof salvar> | undefined;
    try {
      primeira = salvar(ATE_AS_17);
      await esperarNaTrava(api, 1);
      segunda = salvar({ ...PADRAO, fim: 16 * 60 });
      await esperarNaTrava(api, 2);
    } finally {
      soltar();
      await segurando;
    }
    const [rPrimeira, rSegunda] = await Promise.all([primeira, segunda]);
    expect(rPrimeira?.statusCode, rPrimeira?.body).toBe(200);
    expect(rSegunda?.statusCode, rSegunda?.body).toBe(200);
    expect(rSegunda ? (await acoesDa(rSegunda))[0] : undefined).toMatchObject({
      antes: ATE_AS_17,
      depois: { ...PADRAO, fim: 16 * 60 },
    });
    expect((await ler()).json()).toEqual({ ...PADRAO, fim: 16 * 60 });
  });

  it('só a carga cheia não fecha os relógios', async () => {
    const noHorario = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 600,
    });
    const r = await salvar({ ...PADRAO, cargaCheia: 8 });
    expect(r.statusCode, r.body).toBe(200);
    expect(await relogioDo(noHorario)).toMatchObject({ contadoS: 600, relogioDesde: AS_0830 });
    expect((await acoesDa(r))[0]?.dados).toEqual({ relogiosFechados: 0 });
  });

  it('o relógio que voltou a contar depois do momento da troca não volta no tempo', async () => {
    // A troca é das 11:00, e uma ação confirmada enquanto ela esperava pôs o relógio a contar às
    // 11:00:05. Fechar esse relógio às 11:00 contaria cinco segundos em que ele estava parado.
    const depois = new Date(AGORA.getTime() + 5000);
    const noHorario = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 0,
    });
    const retomado = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: depois,
      contadoS: 300,
    });
    const r = await salvar(ATE_AS_17);
    expect(r.statusCode, r.body).toBe(200);
    expect(await relogioDo(noHorario)).toMatchObject({ contadoS: 9000, relogioDesde: AGORA });
    expect(await relogioDo(retomado)).toMatchObject({ contadoS: 300, relogioDesde: depois });
    expect((await acoesDa(r))[0]?.dados).toEqual({ relogiosFechados: 1 });
  });

  it('o chamado que passa a contar enquanto a troca espera a trava fica fora do fechamento', async () => {
    // Outra conexão segura um chamado, e a troca espera por ele. Nesse meio, outro chamado é
    // gravado já contando. A troca só fecha os chamados que travou: o novo fica como foi gravado.
    const travado = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 0,
    });
    let soltar = () => {};
    let preso = () => {};
    const linhaPresa = new Promise<void>((resolve) => {
      preso = resolve;
    });
    const segurando = naOrganizacao(api.banco, org, async (tx) => {
      await tx
        .select({ id: chamados.id })
        .from(chamados)
        .where(eq(chamados.id, travado))
        .for('update');
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await linhaPresa;
    let troca: ReturnType<typeof salvar> | undefined;
    let novo = '';
    try {
      troca = salvar(ATE_AS_17);
      await esperarNaTrava(api, 1);
      novo = await chamado({
        modo: 'horario',
        situacao: 'em-atendimento',
        relogioDesde: AS_0830,
        contadoS: 0,
      });
    } finally {
      soltar();
      await segurando;
    }
    const r = await troca;
    expect(r?.statusCode, r?.body).toBe(200);
    expect(await relogioDo(travado)).toMatchObject({ contadoS: 9000, relogioDesde: AGORA });
    expect(await relogioDo(novo)).toMatchObject({ contadoS: 0, relogioDesde: AS_0830 });
    expect(r ? (await acoesDa(r))[0]?.dados : undefined).toEqual({ relogiosFechados: 1 });
  });

  it('a espera que cruza a troca do horário, em duas conexões, não conta o tempo duas vezes', async () => {
    // Outra conexão faz a espera: trava o chamado, conta o trecho das 08:30 às 11:00 pelo horário
    // de antes e para o relógio. A troca do horário chega no meio e espera a trava. Depois, ela
    // relê o chamado, já parado, e não o fecha: sem a trava, ela somaria o mesmo trecho de novo e
    // poria o relógio para contar outra vez.
    const id = await chamado({
      modo: 'horario',
      situacao: 'em-atendimento',
      relogioDesde: AS_0830,
      contadoS: 0,
    });
    let esperar = () => {};
    let travado = () => {};
    const chamadoTravado = new Promise<void>((resolve) => {
      travado = resolve;
    });
    const espera = naOrganizacao(api.banco, org, async (tx) => {
      await tx.select({ id: chamados.id }).from(chamados).where(eq(chamados.id, id)).for('update');
      travado();
      await new Promise<void>((resolve) => {
        esperar = resolve;
      });
      await tx
        .update(chamados)
        .set({ situacao: 'aguardando', contadoS: 9000, relogioDesde: null })
        .where(eq(chamados.id, id));
    });
    await chamadoTravado;
    let troca: ReturnType<typeof salvar> | undefined;
    try {
      troca = salvar(ATE_AS_17);
      await esperarNaTrava(api, 1);
    } finally {
      esperar();
      await espera;
    }
    const r = await troca;
    expect(r?.statusCode, r?.body).toBe(200);
    expect(await relogioDo(id)).toEqual({
      situacao: 'aguardando',
      contadoS: 9000,
      relogioDesde: null,
      versao: 1,
    });
    expect((await ler()).json()).toEqual(ATE_AS_17);
  });
});

describe('quem pode e o módulo', () => {
  it('Conta sem chamados.configurar: o horário responde 403', async () => {
    for (const r of [await ler('renato'), await salvar(ATE_AS_17, 'renato')]) {
      expect(r.statusCode).toBe(403);
    }
    expect(await linhasDoHorario()).toBe(0);
  });

  it('recusa as rotas com o módulo Chamados desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    try {
      for (const r of [await ler(), await salvar(ATE_AS_17)]) {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({
          type: 'urn:grafite:problema:modulo-desligado',
          detail: 'O módulo Chamados está desligado nesta organização.',
        });
      }
    } finally {
      await desligarModulos(api, org, []);
    }
  });
});
