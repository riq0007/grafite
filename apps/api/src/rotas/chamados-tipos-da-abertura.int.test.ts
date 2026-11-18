// Os tipos que a gaveta da abertura oferece (spec chamados, "Abrir um chamado pela TI"; change
// chamados-da-ti, design, decisão 18, "Os tipos da gaveta (tarefa 5.18)"): a quem atende, também
// sem configurar os tipos, só os Em uso, na ordem dos tipos, também os que só a TI abre, com o
// ícone, o nome, a frase e o formulário de agora, sem o que só quem configura vê.
import { beforeAll, describe, expect, it } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import { type ChamadosDeTeste, montarChamados } from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  criarConta,
  criarPerfil,
  criarRelogio,
  type Entrada,
} from '../../test/integracao.ts';

const host = 'grafite.chamados-tipos-da-abertura.local';
const DA_ABERTURA = '/chamados/abertura';

/** A ordem dos tipos de fábrica. */
const DE_FABRICA = [
  'Toner',
  'Computador',
  'Impressora',
  'Acesso e senha',
  'Software',
  'Rede e internet',
  'Telefone',
  'Outro',
  'Troca de equipamento',
];

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** Gabriel só configura os chamados, sem os atender. */
let gabriel: Entrada;

type Usuario = Parameters<ChamadosDeTeste['como']>[0];

interface TipoDaAbertura {
  id: string;
  nome: string;
  icone: string;
  frase: string | null;
  formulario: { campos: { id: string }[] };
}

const ler = (usuario: Usuario | Entrada = 'diego') =>
  c.cliente.consultar(DA_ABERTURA, typeof usuario === 'string' ? c.como(usuario) : usuario);

/** Os tipos que a gaveta oferece, como o usuário os lê. */
async function tipos(usuario: Usuario | Entrada = 'diego'): Promise<TipoDaAbertura[]> {
  const r = await ler(usuario);
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { tipos: TipoDaAbertura[] }).tipos;
}

const nomes = async () => (await tipos()).map(({ nome }) => nome);

/** Uma ação de quem administra nos tipos, que precisa dar certo. */
async function comoLivia(metodo: 'POST' | 'PUT', endereco: string, corpo?: object) {
  const r = await c.cliente.enviar(metodo, endereco, c.como('livia'), corpo);
  expect(r.statusCode, r.body).toBeLessThan(300);
  return r.json();
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-18T12:00:00.000Z')) });
  c = await montarChamados(api, host);
  await c.entrar();

  const configura = await criarPerfil(api, c.org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const conta = await criarConta(api, c.org, { usuario: 'gabriel', nome: 'Gabriel Torres' });
  await atribuir(api, c.org, { perfilId: configura, contaId: conta.id });
  gabriel = await c.cliente.entrar('gabriel');
});

describe('os tipos da gaveta da abertura', () => {
  it('Diego, que atende sem configurar, lê os tipos em uso na ordem, com o formulário de cada um', async () => {
    expect((await c.cliente.consultar('/chamados/tipos', c.como('diego'))).statusCode).toBe(403);
    const lidos = await tipos();
    expect(lidos.map(({ nome }) => nome)).toEqual(DE_FABRICA);
    // Só o que a gaveta mostra: nada do prazo, de quem atende por padrão, das chaves e das contagens.
    for (const tipo of lidos) {
      expect(Object.keys(tipo).sort(), tipo.nome).toEqual(
        ['formulario', 'frase', 'icone', 'id', 'nome'].sort(),
      );
    }
    const impressora = lidos.find(({ nome }) => nome === 'Impressora');
    expect(impressora).toMatchObject({
      id: c.tipos.Impressora,
      icone: 'impressora',
      frase: 'Mancha, atola ou não imprime',
    });
    // O formulário é o de agora, o mesmo que quem configura lê e que a abertura confere.
    const doEditor = await c.cliente.consultar(
      `/chamados/tipos/${c.tipos.Impressora}/formulario`,
      c.como('livia'),
    );
    expect(impressora?.formulario).toEqual(doEditor.json().formulario);
    // O tipo que só a TI abre também vem: a gaveta é da TI.
    expect(lidos.at(-1)).toMatchObject({ nome: 'Troca de equipamento', icone: 'setas' });
  });

  it('o Rascunho e o Inativo ficam de fora, e o reativado volta', async () => {
    const rascunho = await comoLivia('POST', '/chamados/tipos');
    expect(rascunho).toMatchObject({ situacao: 'rascunho' });
    expect(await nomes()).toEqual(DE_FABRICA);

    await comoLivia('POST', `/chamados/tipos/${c.tipos.Telefone}/inativacao`);
    expect(await nomes()).toEqual(DE_FABRICA.filter((nome) => nome !== 'Telefone'));

    await comoLivia('POST', `/chamados/tipos/${c.tipos.Telefone}/reativacao`);
    expect(await nomes()).toEqual(DE_FABRICA);
  });

  it('segue a ordem dos tipos', async () => {
    const lista = (await c.cliente.consultar('/chamados/tipos', c.como('livia'))).json() as {
      tipos: { id: string; nome: string }[];
    };
    const ids = lista.tipos.map(({ id }) => id);
    const outro = c.tipos.Outro as string;
    await comoLivia('PUT', '/chamados/tipos/ordem', {
      ids: [outro, ...ids.filter((id) => id !== outro)],
    });
    expect((await nomes()).slice(0, 2)).toEqual(['Outro', 'Toner']);
    await comoLivia('PUT', '/chamados/tipos/ordem', { ids });
    expect(await nomes()).toEqual(DE_FABRICA);
  });

  it('pede chamados.atender: quem só vê e quem só configura são recusados', async () => {
    expect(await nomes()).toEqual(DE_FABRICA);
    expect((await tipos('ana')).map(({ nome }) => nome)).toEqual(DE_FABRICA);
    expect((await ler('carla')).statusCode).toBe(403);
    expect((await ler(gabriel)).statusCode).toBe(403);
    expect((await ler('ninguem')).statusCode).toBe(401);
  });

  it('com o módulo desligado, a leitura recusa', async () => {
    await desligarModulos(api, c.org, ['chamados']);
    try {
      const r = await ler();
      expect(r.statusCode).toBe(403);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
    } finally {
      await desligarModulos(api, c.org, []);
    }
  });
});
