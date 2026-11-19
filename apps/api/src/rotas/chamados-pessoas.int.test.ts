// A busca da pessoa da gaveta e do "Ver como" da prévia (spec chamados, "Abrir um chamado pela
// TI"; change chamados-da-ti, design, decisão 18, "A busca da pessoa (tarefa 4.22)"): as pessoas
// ativas pelas palavras do nome, sem acento, até 10, com o total das que casam, com o nome e o
// caminho do local de trabalho, sem os contatos, também a quem não tem `pessoas.ver`; uma rota de
// quem atende e outra de quem configura.
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChamadosDeTeste, montarChamados } from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarPerfil,
  criarPessoa,
  criarRelogio,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-pessoas.local';
const DA_GAVETA = '/chamados/pessoas';
const DA_PREVIA = '/chamados/tipos/pessoas';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** Gabriel só configura os chamados, sem atender nem ver as pessoas. */
let gabriel: Entrada;
const ids: Record<string, string> = {};

type Usuario = Parameters<ChamadosDeTeste['como']>[0];

interface PessoaAchada {
  id: string;
  nome: string;
  local: string | null;
}

/** A busca, como o usuário, pela rota da gaveta ou da prévia. */
const buscar = (busca: string, usuario: Usuario | Entrada = 'diego', endereco = DA_GAVETA) =>
  c.cliente.consultar(
    `${endereco}?busca=${encodeURIComponent(busca)}`,
    typeof usuario === 'string' ? c.como(usuario) : usuario,
  );

/** A resposta da busca: as pessoas achadas, na ordem, e o total das que casam. */
async function resposta(busca: string, usuario: Usuario | Entrada = 'diego', endereco = DA_GAVETA) {
  const r = await buscar(busca, usuario, endereco);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { itens: PessoaAchada[]; total: number };
}

/** As pessoas achadas, na ordem da resposta. */
const achadas = async (busca: string, usuario: Usuario | Entrada = 'diego', endereco = DA_GAVETA) =>
  (await resposta(busca, usuario, endereco)).itens;

/** Os nomes achados, na ordem da resposta. */
const nomes = async (busca: string) => (await achadas(busca)).map(({ nome }) => nome);

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T12:00:00.000Z')) });
  c = await montarChamados(api, host);
  await c.entrar();

  ids.sergio = await criarPessoa(api, c.org, {
    nome: 'Sérgio Lopes',
    localId: c.locais.reunioes,
    email: 'financeiro.sergio@empresa.com.br',
    matricula: 'M-4521',
  });
  ids.gustavo = await criarPessoa(api, c.org, { nome: 'Gustavo Reis' });
  // Criadas fora da ordem do nome, para a ordem da resposta não ser a da criação.
  for (const nome of [
    'Zélia Silva',
    'Yara Silva',
    'Xavier Silva',
    'Wagner Silva',
    'Vânia Silva',
    'Úrsula Silva',
    'Tânia Silva',
    'Sara Silva',
    'Rui Silva',
    'Álvaro Silva',
    'Bruna Silva',
  ]) {
    await criarPessoa(api, c.org, { nome });
  }

  const configura = await criarPerfil(api, c.org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const conta = await criarConta(api, c.org, { usuario: 'gabriel', nome: 'Gabriel Torres' });
  await atribuir(api, c.org, { perfilId: configura, contaId: conta.id });
  gabriel = await c.cliente.entrar('gabriel');
});

describe('a busca da pessoa dos chamados', () => {
  it('Diego, sem pessoas.ver, acha a pessoa pelo nome, com o local de trabalho e sem os contatos', async () => {
    expect((await c.cliente.consultar('/pessoas?busca=marina', c.como('diego'))).statusCode).toBe(
      403,
    );
    expect(await resposta('MARINA')).toEqual({
      itens: [{ id: c.pessoas.marina, nome: 'Marina Rocha', local: 'Jundiaí › Recepção' }],
      total: 1,
    });
    // Fora dos locais que Diego atende: a abertura é que recusa, com o local na frase.
    expect(await achadas('fernanda')).toEqual([
      { id: c.pessoas.fernanda, nome: 'Fernanda Lima', local: 'Campinas › Administrativo' },
    ]);
    expect(await achadas('rita')).toEqual([
      { id: c.pessoas.rita, nome: 'Rita Moraes', local: null },
    ]);
  });

  it('pelas palavras do nome, sem acento e em qualquer ordem, e não pela matrícula nem pelo e-mail', async () => {
    expect(await nomes('nunes  OTÁVIO')).toEqual(['Otávio Nunes']);
    expect(await nomes('lopes sergio')).toEqual(['Sérgio Lopes']);
    expect(await resposta('sergio rocha')).toEqual({ itens: [], total: 0 });
    for (const deUmContato of ['4521', 'financeiro', 'empresa.com']) {
      expect(await nomes(deUmContato), deUmContato).toEqual([]);
    }
    // Só o acento não sobra palavra nenhuma, e nada vem.
    expect(await resposta('́')).toEqual({ itens: [], total: 0 });
  });

  it('só as pessoas ativas: a inativa e a anonimizada ficam de fora', async () => {
    expect(await nomes('gustavo')).toEqual(['Gustavo Reis']);
    const inativada = await c.cliente.enviar(
      'POST',
      `/pessoas/${ids.gustavo}/inativacao`,
      c.como('livia'),
    );
    expect(inativada.statusCode, inativada.body).toBe(200);
    expect(await resposta('gustavo')).toEqual({ itens: [], total: 0 });
    const anonimizada = await c.cliente.enviar(
      'POST',
      `/pessoas/${ids.gustavo}/anonimizacao`,
      c.como('livia'),
    );
    expect(anonimizada.statusCode, anonimizada.body).toBe(200);
    expect(await nomes('pessoa anonimizada')).toEqual([]);
  });

  it('até 10, pela ordem do nome sem acento, com o total das que casam', async () => {
    const { itens, total } = await resposta('silva');
    expect(total).toBe(11);
    expect(itens.map(({ nome }) => nome)).toEqual([
      'Álvaro Silva',
      'Bruna Silva',
      'Rui Silva',
      'Sara Silva',
      'Tânia Silva',
      'Úrsula Silva',
      'Vânia Silva',
      'Wagner Silva',
      'Xavier Silva',
      'Yara Silva',
    ]);
  });

  it('a gaveta pede chamados.atender, e a prévia, chamados.configurar, sem pessoas.ver', async () => {
    const marina = [{ id: c.pessoas.marina, nome: 'Marina Rocha', local: 'Jundiaí › Recepção' }];
    expect(await achadas('marina', 'ana')).toEqual(marina);
    expect((await buscar('marina', 'carla')).statusCode).toBe(403);
    expect((await buscar('marina', gabriel)).statusCode).toBe(403);
    expect((await buscar('marina', 'ninguem')).statusCode).toBe(401);

    expect(await achadas('marina', gabriel, DA_PREVIA)).toEqual(marina);
    expect((await c.cliente.consultar('/pessoas?busca=marina', gabriel)).statusCode).toBe(403);
    expect((await buscar('marina', 'diego', DA_PREVIA)).statusCode).toBe(403);
  });

  it('pede o termo, de 1 a 100 caracteres', async () => {
    for (const endereco of [DA_GAVETA, DA_PREVIA]) {
      const usuario = endereco === DA_GAVETA ? 'diego' : gabriel;
      for (const termo of ['', '   ', 'a'.repeat(101)]) {
        const r = await buscar(termo, usuario, endereco);
        expect(r.statusCode, `${endereco} "${termo.slice(0, 5)}"`).toBe(400);
      }
      expect(await achadas(` ${'a'.repeat(100)} `, usuario, endereco)).toEqual([]);
    }
  });

  it('com o módulo desligado, as duas rotas recusam', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    try {
      for (const [endereco, usuario] of [
        [DA_GAVETA, 'diego'],
        [DA_PREVIA, gabriel],
      ] as const) {
        const r = await buscar('marina', usuario, endereco);
        expect(r.statusCode, endereco).toBe(403);
        expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
      }
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});
