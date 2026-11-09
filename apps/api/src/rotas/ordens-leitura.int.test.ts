// As leituras das OS pela API (spec ordens-de-servico, "Quem vê e quem atende as OS"; modulo-operacao,
// "Tela das ordens de serviço" e "Ficha da ordem de serviço"; cadastro-de-ativos, "Ordens de serviço
// na ficha do ativo"; solicitacoes, "Conserto com a ordem de serviço"; auditoria, "Eventos das
// ordens de serviço registrados"; change p4e-ordens-de-servico, design, decisão 7): a lista com os
// filtros, a busca e o cursor, a ficha, as OS do ativo, a OS da solicitação e o nome do alvo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi } from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';
import type { UsuarioDasSolicitacoes } from '../../test/solicitacoes.ts';

const host = 'grafite.ordens-leitura.local';

let api: ApiDeTeste;
let s: OrdensDeTeste;

interface OrdemLida {
  numero: number;
  situacao: string;
  problema: string;
}

/** As OS abertas antes dos testes: duas no NB-0031, uma resolvida, e uma em Campinas. */
const os = { teclado: 0, tela: 0, resolvida: 0, deCampinas: 0, comFornecedor: 0 };

const enviar = (caminho: string, corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', caminho, s.entradas[usuario], corpo);

const consultar = (caminho: string, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.consultar(caminho, s.entradas[usuario]);

async function abrir(ativo: string, problema: string, usuario: UsuarioDasSolicitacoes = 'carla') {
  return (await enviar('/ordens', { ativo, problema }, usuario)).json().numero as number;
}

const numerosDa = async (caminho: string, usuario: UsuarioDasSolicitacoes = 'carla') =>
  ((await consultar(caminho, usuario)).json().itens as OrdemLida[]).map(({ numero }) => numero);

beforeAll(async () => {
  api = await abrirApi();
  s = await montarOrdens(api, host);
  os.resolvida = await abrir(s.ativos.nb0031, 'Não liga');
  await enviar(`/ordens/${os.resolvida}/resolucao`, { solucao: 'Fonte trocada' });
  os.teclado = await abrir(s.ativos.nb0031, 'Teclado falhando');
  os.tela = await abrir(s.ativos.nb0031, 'Tela piscando');
  os.comFornecedor = await abrir(s.ativos.pat00412, 'Não puxa o papel');
  await enviar(`/ordens/${os.comFornecedor}/situacao`, {
    situacao: 'aguardando-fornecedor',
    fornecedor: s.fornecedores.dell,
    os: 'DL-5521',
  });
  os.deCampinas = await abrir(s.ativos.deCampinas, 'Atolando o papel', 'ana');
});

afterAll(async () => {
  await api?.fechar();
});

describe('lista e ficha das OS', () => {
  it('Atendente de Jundiaí: vê e atende as OS de Jundiaí, e não vê as de Campinas', async () => {
    const lista = await consultar('/ordens?situacao=todas');
    expect(lista.statusCode).toBe(200);
    const numeros = (lista.json().itens as OrdemLida[]).map(({ numero }) => numero);
    expect(numeros).toEqual(expect.arrayContaining([os.teclado, os.tela, os.resolvida]));
    expect(numeros).not.toContain(os.deCampinas);
    const deCampinas = await consultar(`/ordens/${os.deCampinas}`);
    expect(deCampinas.statusCode).toBe(404);
    expect(deCampinas.json().detail).toBe('Ordem de serviço não encontrada.');
    expect(await numerosDa('/ordens?situacao=todas', 'ana')).toContain(os.deCampinas);
  });

  it('Quem só vê: Bruno abre a ficha com o histórico e as peças, sem atender', async () => {
    const r = await consultar(`/ordens/${os.resolvida}`, 'bruno');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      numero: os.resolvida,
      situacao: 'resolvida',
      solucao: 'Fonte trocada',
      historico: [{ situacao: 'resolvida' }, { situacao: 'aberta' }],
      pecas: [],
      permite: { atender: false },
    });
    expect(await numerosDa('/ordens', 'bruno')).toContain(os.teclado);
    expect((await consultar('/ordens', 'eva')).statusCode).toBe(403);
  });

  it('Em aberto por padrão, das mais novas para as mais antigas; cada situação e todas', async () => {
    const lista = await consultar('/ordens');
    const itens = lista.json().itens as OrdemLida[];
    expect(itens.every(({ situacao }) => situacao !== 'resolvida')).toBe(true);
    expect(itens.map(({ numero }) => numero)).toEqual([os.comFornecedor, os.tela, os.teclado]);
    expect(lista.json().total).toBe(3);
    expect(await numerosDa('/ordens?situacao=resolvida')).toEqual([os.resolvida]);
    expect(await numerosDa('/ordens?situacao=aguardando-fornecedor')).toEqual([os.comFornecedor]);
    expect(await numerosDa('/ordens?situacao=todas')).toEqual([
      os.comFornecedor,
      os.tela,
      os.teclado,
      os.resolvida,
    ]);
    expect((await consultar('/ordens?situacao=pausada')).statusCode).toBe(400);
  });

  it('Busca pelo patrimônio, pelo número, pelo problema e pela OS do fornecedor; e o filtro do local', async () => {
    expect(await numerosDa('/ordens?busca=nb-0031')).toEqual([os.tela, os.teclado]);
    // O número acha a OS, e também o que o contém, como o patrimônio NB-0031.
    expect(await numerosDa(`/ordens?busca=${os.comFornecedor}`)).toContain(os.comFornecedor);
    expect(await numerosDa('/ordens?busca=TECLADO')).toEqual([os.teclado]);
    expect(await numerosDa('/ordens?busca=dl-5521')).toEqual([os.comFornecedor]);
    expect(await numerosDa(`/ordens?local=${s.locais.campinas}&situacao=todas`, 'ana')).toEqual([
      os.deCampinas,
    ]);
    expect(await numerosDa(`/ordens?local=${s.locais.expedicao}`)).toEqual([
      os.comFornecedor,
      os.tela,
      os.teclado,
    ]);
  });

  it('traz a página pelo cursor, sem pular nem repetir, com o total', async () => {
    const primeira = (await consultar('/ordens?limite=2')).json();
    expect(primeira.itens.map(({ numero }: OrdemLida) => numero)).toEqual([
      os.comFornecedor,
      os.tela,
    ]);
    expect(primeira.total).toBe(3);
    const segunda = (await consultar(`/ordens?limite=2&cursor=${primeira.proximo}`)).json();
    expect(segunda.itens.map(({ numero }: OrdemLida) => numero)).toEqual([os.teclado]);
    expect(segunda.proximo).toBeNull();
  });
});

describe('OS fora da lista', () => {
  it('Ativo sem OS, e o Problema que voltou: as em aberto e as resolvidas ou encerradas', async () => {
    const semOS = await consultar(`/ativos/${s.ativos.pat00415}/ordens`);
    expect(semOS.statusCode).toBe(200);
    expect(semOS.json()).toEqual({ emAberto: [], resolvidasOuEncerradas: [] });
    const doNotebook = (await consultar(`/ativos/${s.ativos.nb0031}/ordens`)).json();
    expect(
      doNotebook.emAberto.map(({ numero, problema }: OrdemLida) => [numero, problema]),
    ).toEqual([
      [os.tela, 'Tela piscando'],
      [os.teclado, 'Teclado falhando'],
    ]);
    expect(
      doNotebook.resolvidasOuEncerradas.map(({ numero, problema }: OrdemLida) => [
        numero,
        problema,
      ]),
    ).toEqual([[os.resolvida, 'Não liga']]);
  });

  it('a solicitação traz a OS que ela segue, na ficha e na lista', async () => {
    const conserto = (
      await enviar('/solicitacoes', {
        tipo: 'conserto',
        pessoa: s.pessoas.joana,
        ativo: s.ativos.nb0031,
        defeito: 'Bateria estufada',
      })
    ).json().numero;
    const sem = (await consultar(`/solicitacoes/${conserto}`)).json();
    expect(sem.ordem).toBeNull();
    const ordem = (await enviar(`/solicitacoes/${conserto}/ordem`, {})).json().numero;
    expect((await consultar(`/solicitacoes/${conserto}`)).json().ordem).toEqual({
      numero: ordem,
      situacao: 'aberta',
      abrir: true,
    });
    const lista = (await consultar(`/solicitacoes?busca=${conserto}`)).json();
    expect(lista.itens[0].ordem).toEqual({ numero: ordem, situacao: 'aberta', abrir: true });
    // Eva atende as solicitações e não vê as OS: a solicitação mostra a OS, sem o caminho.
    expect((await consultar(`/solicitacoes/${conserto}`, 'eva')).json().ordem).toEqual({
      numero: ordem,
      situacao: 'aberta',
      abrir: false,
    });
  });

  it('OS aberta: a auditoria dá o nome da OS como ela está agora', async () => {
    const ficha = (await consultar(`/ordens/${os.teclado}`)).json();
    const r = await consultar(`/auditoria?alvo=ordem:${ficha.id}`, 'ana');
    expect(r.statusCode).toBe(200);
    expect(r.json().itens[0].alvo).toMatchObject({
      tipo: 'ordem',
      nome: `${os.teclado} · NB-0031 · Teclado falhando`,
    });
  });
});
