// A busca dos chamados (spec modulo-chamados, "Busca dos chamados"; change chamados-da-ti, design,
// decisão 17, "A rota da busca (tarefa 4.20)"): pelo número e pelas palavras do título, até 8, o
// número primeiro e os abertos antes dos resolvidos, só com os chamados que a conta vê, e nada com o
// módulo desligado. O que cada termo pede (o "#", a faixa do número, o acento) é do domínio
// (`termoDaBusca`); aqui fica um caso de cada ligação.
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChamadosDeTeste, montarChamados } from '../../test/chamados.ts';
import { type ApiDeTeste, abrirApi, criarConta, criarRelogio } from '../../test/integracao.ts';

const host = 'grafite.chamados-busca.local';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** Os chamados abertos no começo, pelo apelido. */
const n = {} as Record<
  'manchando' | 'financeiro' | 'semLocal' | 'resolvido' | 'comONumero',
  number
>;

type Usuario = Parameters<ChamadosDeTeste['como']>[0];

/** A busca, como o usuário. */
const buscar = (termo: string, usuario: Usuario = 'ana') =>
  c.cliente.consultar(`/chamados/busca?termo=${encodeURIComponent(termo)}`, c.como(usuario));

/** Os números achados, na ordem da resposta. */
const numeros = async (termo: string, usuario: Usuario = 'ana') => {
  const r = await buscar(termo, usuario);
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { itens: { numero: number }[] }).itens.map(({ numero }) => numero);
};

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  c = await montarChamados(api, host);
  await c.entrar();
  const abrir = (
    pessoa: Parameters<ChamadosDeTeste['relato']>[0],
    texto: string,
    ficaComigo = true,
  ) => c.abrir(c.relato(pessoa, { texto, ficaComigo }));
  n.manchando = await abrir('marina', 'Impressora manchando na recepção');
  n.financeiro = await abrir('fernanda', 'Impressora do administrativo sem toner', false);
  n.semLocal = await abrir('rita', 'Impressora M404 travando');
  n.resolvido = await abrir('otavio', 'Impressora antiga da recepção');
  const resolvido = await c.cliente.enviar(
    'POST',
    `/chamados/${n.resolvido}/resolver`,
    c.como('ana'),
    { feito: 'Troquei a impressora.' },
  );
  expect(resolvido.statusCode, resolvido.body).toBe(200);
  n.comONumero = await abrir('otavio', `O sistema mostra o erro ${n.manchando} ao imprimir`);
});

describe('a busca dos chamados', () => {
  it('pelo número, com ou sem o "#", com o título, quem pediu e a situação', async () => {
    expect(n.manchando).toBe(1042);
    const comOJogoDaVelha = await buscar('#1042');
    expect(comOJogoDaVelha.statusCode, comOJogoDaVelha.body).toBe(200);
    expect(comOJogoDaVelha.json()).toEqual({
      itens: [
        {
          numero: 1042,
          titulo: 'Impressora manchando na recepção',
          pessoa: 'Marina Rocha',
          situacao: 'em-atendimento',
        },
      ],
    });
    // Só os algarismos acham o chamado do número primeiro, e depois o título que os tem.
    expect(await numeros('1042')).toEqual([1042, n.comONumero]);
  });

  it('pelas palavras do título, sem acento e em qualquer ordem, os abertos primeiro', async () => {
    expect(await numeros('RECEPÇÃO  manchando')).toEqual([n.manchando]);
    // Os abertos do mais novo ao mais velho, e o resolvido depois deles.
    expect(await numeros('impressora')).toEqual([
      n.semLocal,
      n.financeiro,
      n.manchando,
      n.resolvido,
    ]);
    // O termo que não pede nem número nem palavra, como o número além do inteiro do banco, não
    // acha nada, sem recusa.
    expect(await numeros('#99999999999')).toEqual([]);
  });

  it('só os chamados que a conta vê', async () => {
    // Bruno vê os chamados de Campinas: nem os de Jundiaí, nem o sem local.
    expect(await numeros('impressora', 'bruno')).toEqual([n.financeiro]);
    expect(await numeros('#1042', 'bruno')).toEqual([]);
    // Carla vê a organização inteira, com o sem local.
    expect(await numeros('impressora', 'carla')).toEqual([
      n.semLocal,
      n.financeiro,
      n.manchando,
      n.resolvido,
    ]);
  });

  it('até 8, os mais novos', async () => {
    const teclados: number[] = [];
    for (let tecla = 1; tecla <= 9; tecla++) {
      teclados.push(await c.abrir(c.relato('marina', { texto: `Teclado sem a tecla ${tecla}` })));
    }
    expect(await numeros('teclado')).toEqual(teclados.slice(1).reverse());
  });

  it('pede o termo, de 1 a 100 caracteres, e a permissão de ver os chamados', async () => {
    for (const termo of ['', '   ', 'a'.repeat(101)]) {
      expect((await buscar(termo)).statusCode).toBe(400);
    }
    expect((await buscar('impressora', 'ninguem')).statusCode).toBe(401);
    await criarConta(api, c.org, { usuario: 'gilda', nome: 'Gilda Prates' });
    const gilda = await c.cliente.entrar('gilda');
    const semPermissao = await c.cliente.consultar('/chamados/busca?termo=impressora', gilda);
    expect(semPermissao.statusCode).toBe(403);
  });

  it('com o módulo desligado, nada vem', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    try {
      const r = await buscar('impressora');
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({
        type: 'urn:grafite:problema:modulo-desligado',
        detail: 'O módulo Chamados está desligado nesta organização.',
      });
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});
