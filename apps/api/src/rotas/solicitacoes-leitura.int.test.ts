// As leituras das solicitações pela API (spec solicitacoes, "Quem vê e quem atende as solicitações"
// e "Itens do toner"; spec modulo-operacao, "Tela das solicitações" e "Ficha da solicitação"; spec
// cadastro-de-ativos, "Solicitações na ficha do ativo"; spec administracao-de-pessoas, "Nomes das
// pessoas para a escolha"; change p4d-solicitacoes, design, decisões 6 e 7).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo } from '../../test/alertas.ts';
import { definirSaldo } from '../../test/estoque.ts';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import {
  montarSolicitacoes,
  type SolicitacoesDeTeste,
  type UsuarioDasSolicitacoes,
} from '../../test/solicitacoes.ts';

const host = 'grafite.solicitacoes-leitura.local';

let api: ApiDeTeste;
let s: SolicitacoesDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  s = await montarSolicitacoes(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

const enviar = (caminho: string, corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', caminho, s.entradas[usuario], corpo);

const ler = (caminho: string, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.consultar(caminho, s.entradas[usuario]);

async function toner(impressoras: string[], usuario: UsuarioDasSolicitacoes = 'carla') {
  const r = await enviar(
    '/solicitacoes',
    {
      tipo: 'toner',
      pessoa: s.pessoas.joana,
      impressoras,
      itens: impressoras.map((impressora) => ({ impressora, cor: 'preto', quantidade: 1 })),
    },
    usuario,
  );
  expect(r.statusCode).toBe(201);
  return r.json().numero as number;
}

async function conserto(ativo = s.ativos.nb0031) {
  const r = await enviar('/solicitacoes', {
    tipo: 'conserto',
    pessoa: s.pessoas.joana,
    ativo,
    defeito: 'Não liga',
  });
  return r.json().numero as number;
}

/** Os números da lista, só entre os dados. */
async function numerosDaLista(
  consulta: string,
  dentre: number[],
  usuario: UsuarioDasSolicitacoes = 'carla',
) {
  const r = await ler(`/solicitacoes${consulta}`, usuario);
  expect(r.statusCode).toBe(200);
  return (r.json().itens as { numero: number }[])
    .map(({ numero }) => numero)
    .filter((numero) => dentre.includes(numero));
}

describe('quem vê e quem atende', () => {
  it('Atendente de Jundiaí: vê e abre só as de Jundiaí', async () => {
    const deJundiai = await toner([s.ativos.pat00412]);
    const deCampinas = await toner([s.ativos.deCampinas], 'ana');
    expect(await numerosDaLista('?situacao=todas', [deJundiai, deCampinas])).toEqual([deJundiai]);
    expect((await ler(`/solicitacoes/${deCampinas}`)).statusCode).toBe(404);
    expect((await ler(`/solicitacoes/${deCampinas}`, 'ana')).statusCode).toBe(200);
  });

  it('Solicitação de dois locais: Carla a vê sem atender, e Ana atende', async () => {
    const duas = await toner([s.ativos.pat00412, s.ativos.deCampinas], 'ana');
    expect(await numerosDaLista('', [duas])).toEqual([duas]);
    const daCarla = await ler(`/solicitacoes/${duas}`);
    expect(daCarla.statusCode).toBe(200);
    expect(daCarla.json().permite).toEqual({ atender: false });
    expect((await ler(`/solicitacoes/${duas}`, 'ana')).json().permite).toEqual({ atender: true });
  });

  it('Quem só vê: abre a ficha sem atender, e não registra', async () => {
    const numero = await toner([s.ativos.pat00412]);
    const r = await ler(`/solicitacoes/${numero}`, 'bruno');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      numero,
      pessoa: { nome: 'Joana Prado' },
      permite: { atender: false },
    });
    const registro = await enviar(
      '/solicitacoes',
      { tipo: 'conserto', pessoa: s.pessoas.joana, ativo: s.ativos.nb0031, defeito: 'Não liga' },
      'bruno',
    );
    expect(registro.statusCode).toBe(403);
    expect((await ler('/solicitacoes', 'davi')).statusCode).toBe(403);
  });
});

describe('lista das solicitações', () => {
  it('Pendentes por padrão, das mais novas para as mais antigas; e cada situação e todas', async () => {
    const aberta = await conserto();
    const concluida = await conserto();
    await enviar(`/solicitacoes/${concluida}/conclusao`, {});
    const atendendo = await conserto();
    await enviar(`/solicitacoes/${atendendo}/situacao`, { situacao: 'em-atendimento' });
    const criadas = [aberta, concluida, atendendo];
    expect(await numerosDaLista('', criadas)).toEqual([atendendo, aberta]);
    expect(await numerosDaLista('?situacao=todas', criadas)).toEqual([
      atendendo,
      concluida,
      aberta,
    ]);
    expect(await numerosDaLista('?situacao=concluida', criadas)).toEqual([concluida]);
    expect(await numerosDaLista('?situacao=em-atendimento', criadas)).toEqual([atendendo]);
  });

  it('Busca pelo patrimônio, pela pessoa, pelo número e pela OS; e os filtros do tipo e do local', async () => {
    const daImpressora = await toner([s.ativos.pat00412]);
    const doNotebook = await conserto();
    const doAlmoxarifado = await toner([s.ativos.pat00415]);
    await enviar(`/solicitacoes/${doAlmoxarifado}/pedido`, {
      fornecedor: s.fornecedores.hp,
      os: 'OS-5555',
    });
    const criadas = [daImpressora, doNotebook, doAlmoxarifado];
    expect(await numerosDaLista('?busca=00412', criadas)).toEqual([daImpressora]);
    expect(await numerosDaLista('?busca=nb-0031', criadas)).toEqual([doNotebook]);
    expect(await numerosDaLista('?busca=JOANA', criadas)).toEqual([...criadas].reverse());
    // O número acha a solicitação dele; o mesmo texto pode estar num patrimônio, como "PAT-00412".
    expect(await numerosDaLista(`?busca=${doNotebook}`, criadas)).toContain(doNotebook);
    expect(await numerosDaLista('?busca=os-5555', criadas)).toEqual([doAlmoxarifado]);
    expect(await numerosDaLista('?tipo=conserto', criadas)).toEqual([doNotebook]);
    expect(await numerosDaLista(`?local=${s.locais.almoxarifado}`, criadas)).toEqual([
      doAlmoxarifado,
    ]);
    expect(await numerosDaLista(`?local=${s.locais.jundiai}`, criadas)).toEqual(
      [...criadas].reverse(),
    );
  });

  it('traz a página pelo cursor, sem pular nem repetir, com o total', async () => {
    const criadas = [await conserto(), await conserto(), await conserto()];
    const primeira = (await ler('/solicitacoes?tipo=conserto&limite=2')).json();
    expect(primeira.itens).toHaveLength(2);
    expect(primeira.proximo).not.toBeNull();
    const segunda = (
      await ler(`/solicitacoes?tipo=conserto&limite=2&cursor=${primeira.proximo}`)
    ).json();
    const todos = [...primeira.itens, ...segunda.itens].map(({ numero }) => numero);
    expect(new Set(todos).size).toBe(todos.length);
    expect(todos.slice(0, 3)).toEqual([...criadas].reverse());
    expect(primeira.total).toBeGreaterThanOrEqual(3);
  });
});

describe('escolha das impressoras', () => {
  it('Toner sugerido: o contador e as cores da impressora, com os compatíveis e o sugerido', async () => {
    await definirSaldo(api, s.org, {
      consumivelId: s.consumiveis.cf258a,
      localId: s.locais.almoxarifado,
      saldo: 6,
    });
    const r = await ler(`/solicitacoes/impressoras/${s.ativos.pat00412}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      ativo: { id: s.ativos.pat00412, patrimonio: 'PAT-00412' },
      cores: [
        {
          cor: 'preto',
          sugerido: s.consumiveis.cf258a,
          compativeis: [{ id: s.consumiveis.cf258a, codigo: 'CF258A', saldo: 6 }],
        },
        { cor: 'ciano', sugerido: null, compativeis: [] },
        { cor: 'magenta', sugerido: null, compativeis: [] },
        { cor: 'amarelo', sugerido: null, compativeis: [] },
        { cor: 'colorido', sugerido: null, compativeis: [] },
      ],
    });
    const notebook = await ler(`/solicitacoes/impressoras/${s.ativos.nb0031}`);
    expect(notebook.statusCode).toBe(409);
    expect(notebook.json().detail).toBe('NB-0031 não usa consumíveis.');
    expect((await ler(`/solicitacoes/impressoras/${s.ativos.deCampinas}`)).statusCode).toBe(404);
  });

  it('busca as impressoras ativas que a conta vê e que usam consumíveis', async () => {
    const todas = (await ler('/solicitacoes/impressoras')).json();
    const patrimonios = todas.itens.map(({ patrimonio }: { patrimonio: string }) => patrimonio);
    expect(patrimonios).toEqual(expect.arrayContaining(['PAT-00412', 'PAT-00415']));
    expect(patrimonios).not.toContain('NB-0031');
    expect(patrimonios).not.toContain('PAT-00977');
    expect(patrimonios).not.toContain('PAT-00101');
    const busca = (await ler('/solicitacoes/impressoras?busca=00412')).json();
    expect(busca.itens).toMatchObject([
      {
        id: s.ativos.pat00412,
        patrimonio: 'PAT-00412',
        local: { caminho: 'Jundiaí › Expedição' },
      },
    ]);
  });
});

describe('solicitações na ficha do ativo', () => {
  it('Ativo sem solicitações, e depois as pendentes e as 5 encerradas mais novas', async () => {
    const nova = await criarAtivoDoTipo(api, s.org, {
      tipoId: s.tipos.impressora,
      modeloId: s.modelos.m404,
      patrimonio: 'PAT-00500',
      localId: s.locais.expedicao,
    });
    const vazia = await ler(`/ativos/${nova}/solicitacoes`);
    expect(vazia.statusCode).toBe(200);
    // O tipo da impressora usa consumíveis: "Nova solicitação" abre o Toner; o do notebook, o Conserto.
    expect(vazia.json()).toEqual({ pendentes: [], encerradas: [], usaConsumiveis: true });
    expect((await ler(`/ativos/${s.ativos.nb0031}/solicitacoes`)).json().usaConsumiveis).toBe(
      false,
    );
    const canceladas: number[] = [];
    for (let vez = 0; vez < 6; vez += 1) {
      const numero = await toner([nova]);
      await enviar(`/solicitacoes/${numero}/cancelamento`, { motivo: 'Teste' });
      canceladas.push(numero);
    }
    const pendente = await conserto(nova);
    const r = (await ler(`/ativos/${nova}/solicitacoes`)).json();
    expect(r.pendentes.map(({ numero }: { numero: number }) => numero)).toEqual([pendente]);
    expect(r.encerradas.map(({ numero }: { numero: number }) => numero)).toEqual(
      canceladas.slice(1).reverse(),
    );
  });
});

describe('quem pediu', () => {
  it('Quem pediu escolhido por quem atende: o nome, sem os outros dados', async () => {
    const r = await ler('/pessoas/nomes?busca=joana');
    expect(r.statusCode).toBe(200);
    expect(r.json().pessoas).toEqual([
      expect.objectContaining({ id: s.pessoas.joana, nome: 'Joana Prado' }),
    ]);
    expect(r.json().pessoas[0]).not.toHaveProperty('email');
  });
});
