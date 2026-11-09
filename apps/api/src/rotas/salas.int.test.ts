// As salas de reunião pela API (spec salas-de-reuniao; change salas-de-reuniao, design, decisões 2,
// 4 e 5): o cadastro por quem administra, o pedido com o conflito de horário, a aprovação com as
// notificações, a recusa com o motivo, o cancelamento e a resposta ao convite, e o que cada conta vê.
import { naOrganizacao, notificacoes } from '@grafite/db';
import { diaEmSaoPaulo } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.salas.local';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const contasDe: Record<string, string> = {};
const entradas: Record<string, Entrada> = {};
let sala = '';
let projetor = '';

/** Amanhã, na hora dada, em São Paulo. */
const amanha = (hora: string) => {
  const dia = diaEmSaoPaulo(new Date(api.relogio.agora().getTime() + 24 * 60 * 60 * 1000));
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
};

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const administra = await criarPerfil(api, org, {
    nome: 'TI das salas',
    permissoes: ['salas.administrar'],
  });
  const pede = await criarPerfil(api, org, { nome: 'Salas', permissoes: ['salas.ver'] });
  for (const [usuario, nome, perfil] of [
    ['ana', 'Ana Souza', administra],
    ['paula', 'Paula Reis', pede],
    ['rui', 'Rui Lima', pede],
    ['sem', 'Sem Acesso', null],
  ] as const) {
    const conta = await criarConta(api, org, { usuario, nome });
    contasDe[usuario] = conta.id;
    if (perfil) await atribuir(api, org, { perfilId: perfil, contaId: conta.id });
    entradas[usuario] = await cliente.entrar(usuario);
  }
});

afterAll(async () => {
  await api?.fechar();
});

const como = (usuario: string) => entradas[usuario] as Entrada;
const pedir = (corpo: object, usuario = 'paula') =>
  cliente.enviar('POST', '/salas/reservas', como(usuario), corpo);
const notificacoesDe = (usuario: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ titulo: notificacoes.titulo, descricao: notificacoes.descricao })
      .from(notificacoes)
      .where(eq(notificacoes.contaId, contasDe[usuario] as string)),
  );

describe('salas de reunião pela API', () => {
  it('Sala nova: quem administra cadastra a sala e o item, e quem só pede não', async () => {
    const r = await cliente.enviar('POST', '/salas', como('ana'), {
      nome: 'Sala Paraty',
      capacidade: 8,
      recursos: 'TV de 65 polegadas',
    });
    expect(r.statusCode).toBe(201);
    sala = r.json().id;
    expect(r.json()).toMatchObject({ nome: 'Sala Paraty', capacidade: 8, situacao: 'ativo' });
    const item = await cliente.enviar('POST', '/salas/itens', como('ana'), { nome: 'Projetor' });
    expect(item.statusCode).toBe(201);
    projetor = item.json().id;
    const repetida = await cliente.enviar('POST', '/salas', como('ana'), { nome: 'SALA PARATY' });
    expect(repetida.statusCode).toBe(409);
    expect(repetida.json().campos).toEqual({ nome: 'Já existe uma sala com esse nome.' });
    expect((await cliente.enviar('POST', '/salas', como('paula'), { nome: 'X' })).statusCode).toBe(
      403,
    );
    const cadastro = await cliente.consultar('/salas', como('paula'));
    expect(cadastro.json()).toMatchObject({ permite: { administrar: false } });
    expect(cadastro.json().itens.map((um: { nome: string }) => um.nome)).toEqual(['Projetor']);
  });

  it('Pedido de Paula: aguarda aprovação e avisa quem administra as salas', async () => {
    const r = await pedir({
      salaId: sala,
      inicio: amanha('14:00'),
      fim: amanha('15:00'),
      assunto: 'Revisão do orçamento',
      comentario: 'Trazer os números de setembro.',
      participantes: [contasDe.rui],
      itens: [projetor],
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      situacao: 'pendente',
      assunto: 'Revisão do orçamento',
      pedidaPor: { nome: 'Paula Reis' },
      participantes: [{ conta: { nome: 'Rui Lima' }, resposta: 'sem-resposta' }],
      itens: [{ nome: 'Projetor' }],
      permite: { cancelar: true, aprovar: false },
    });
    const daAna = await notificacoesDe('ana');
    expect(daAna.map((uma) => uma.titulo)).toEqual([
      expect.stringMatching(/^Pedido de reserva: Sala Paraty, \d\d\/\d\d das 14:00 às 15:00$/),
    ]);
  });

  it('Horário ocupado: recusa o que cruza e aceita o que se encosta', async () => {
    const cruzada = await pedir({
      salaId: sala,
      inicio: amanha('14:30'),
      fim: amanha('15:30'),
      assunto: 'Outra reunião',
    });
    expect(cruzada.statusCode).toBe(409);
    expect(cruzada.json().detail).toBe('A sala já está reservada nesse horário.');
    const encostada = await pedir({
      salaId: sala,
      inicio: amanha('15:00'),
      fim: amanha('16:00'),
      assunto: 'Reunião seguinte',
    });
    expect(encostada.statusCode).toBe(201);
  });

  it('Aprovação com convites: avisa quem pediu e os participantes, e não aprova duas vezes', async () => {
    const pendentes = await cliente.consultar('/salas/reservas/pendentes', como('ana'));
    const daPaula = pendentes
      .json()
      .reservas.find((uma: { assunto: string }) => uma.assunto === 'Revisão do orçamento');
    expect(daPaula.permite.aprovar).toBe(true);
    const r = await cliente.enviar('POST', `/salas/reservas/${daPaula.id}/aprovacao`, como('ana'));
    expect(r.statusCode).toBe(200);
    expect(r.json().situacao).toBe('aprovada');
    for (const usuario of ['paula', 'rui']) {
      expect((await notificacoesDe(usuario)).map((uma) => uma.titulo)).toContainEqual(
        expect.stringMatching(/^Reserva aprovada: Revisão do orçamento, Sala Paraty/),
      );
    }
    const deNovo = await cliente.enviar(
      'POST',
      `/salas/reservas/${daPaula.id}/aprovacao`,
      como('ana'),
    );
    expect(deNovo.statusCode).toBe(409);
    expect(deNovo.json().detail).toBe('Esta reserva já foi aprovada.');
  });

  it('Participante aceita: a resposta aparece para Paula', async () => {
    const convites = await cliente.consultar('/salas/reservas/minhas', como('rui'));
    const [convite] = convites.json().reservas;
    expect(convite).toMatchObject({ minhaResposta: 'sem-resposta', permite: { responder: true } });
    const r = await cliente.enviar('POST', `/salas/reservas/${convite.id}/resposta`, como('rui'), {
      resposta: 'aceitou',
    });
    expect(r.json().minhaResposta).toBe('aceitou');
    const daPaula = await cliente.consultar('/salas/reservas/minhas', como('paula'));
    expect(
      daPaula.json().reservas.find((uma: { id: string }) => uma.id === convite.id).participantes,
    ).toEqual([{ conta: { id: contasDe.rui, nome: 'Rui Lima' }, resposta: 'aceitou' }]);
  });

  it('Recusa com motivo: libera o horário e avisa quem pediu', async () => {
    const pendentes = await cliente.consultar('/salas/reservas/pendentes', como('ana'));
    const [seguinte] = pendentes.json().reservas;
    const r = await cliente.enviar('POST', `/salas/reservas/${seguinte.id}/recusa`, como('ana'), {
      motivo: 'A sala estará em manutenção',
    });
    expect(r.json()).toMatchObject({
      situacao: 'recusada',
      motivo: 'A sala estará em manutenção',
    });
    expect(await notificacoesDe('paula')).toContainEqual({
      titulo: 'Reserva recusada: Reunião seguinte',
      descricao: 'A sala estará em manutenção',
    });
    const deNovo = await pedir({
      salaId: sala,
      inicio: amanha('15:00'),
      fim: amanha('16:00'),
      assunto: 'No horário liberado',
    });
    expect(deNovo.statusCode).toBe(201);
  });

  it('a Agenda mostra a todos com salas.ver o horário e quem pediu, sem o comentário de fora', async () => {
    const r = await cliente.consultar(
      `/salas/agenda?de=${encodeURIComponent(amanha('00:00'))}&ate=${encodeURIComponent(amanha('23:59'))}`,
      como('rui'),
    );
    expect(r.statusCode).toBe(200);
    const assuntos = r.json().reservas.map((uma: { assunto: string }) => uma.assunto);
    expect(assuntos).toEqual(['Revisão do orçamento', 'No horário liberado']);
    const deFora = r.json().reservas[1];
    expect(deFora).toMatchObject({ comentario: null, participantes: null });
    expect((await cliente.consultar('/salas/agenda?de=x&ate=y', como('sem'))).statusCode).toBe(403);
  });

  it('Conta sem a permissão: a API recusa o pedido com 403', async () => {
    const r = await pedir(
      { salaId: sala, inicio: amanha('18:00'), fim: amanha('19:00'), assunto: 'Sem acesso' },
      'sem',
    );
    expect(r.statusCode).toBe(403);
  });
});
