// O distribuidor dos eventos (spec eventos-em-tempo-real; design do F2c, decisão 10): na memória,
// as conexões de cada organização; cada evento vai a quem `podeReceber`, com a árvore de locais
// guardada até `locais.mudaram` e o acesso relido uma vez por conta em `acessos.mudaram`.
import {
  type Acesso,
  type ArvoreDeLocais,
  type EventoDeSaida,
  type LocalDaArvore,
  montarArvore,
  type Permissao,
} from '@grafite/domain';
import { describe, expect, it, vi } from 'vitest';
import { type ConexaoDeEventos, criarDistribuidor } from './distribuidor.ts';

const local = (id: string, paiId: string | null, nome: string): LocalDaArvore => ({
  id,
  paiId,
  nome,
  tipo: 'outro',
  situacao: 'ativo',
});

/** Jundiaí › Expedição, e Campinas. */
const ARVORE = montarArvore([
  local('jun', null, 'Jundiaí'),
  local('exp', 'jun', 'Expedição'),
  local('cam', null, 'Campinas'),
]);

/** O acesso com cada permissão na organização inteira (`true`) ou nos ramos dados. */
function acessoCom(permissoes: Partial<Record<Permissao, true | string[]>> = {}): Acesso {
  return {
    permissoes: new Map(
      Object.entries(permissoes).map(([chave, alcance]) => [
        chave as Permissao,
        alcance === true
          ? { organizacao: true, locais: new Set<string>() }
          : { organizacao: false, locais: new Set(alcance) },
      ]),
    ),
    exigeDoisPassos: false,
    perfisQueExigem: [],
    origens: new Map(),
    prazosDosPerfis: [],
  };
}

let sessoes = 0;

/** Uma conexão simulada, que guarda o que recebeu. */
function conexao(contaId: string, acesso: Acesso, orgId = 'org-a') {
  sessoes += 1;
  const recebidos: string[] = [];
  const nova: ConexaoDeEventos & { recebidos: string[] } = {
    orgId,
    contaId,
    sessaoId: `sessao-${sessoes}`,
    acesso,
    recebidos,
    enviar: (evento) => recebidos.push(evento.id),
    reiniciar: () => recebidos.push('reiniciar'),
  };
  return nova;
}

let eventos = 0;

function evento(
  tipo: EventoDeSaida['tipo'],
  publico: EventoDeSaida['publico'],
  orgId = 'org-a',
): EventoDeSaida {
  eventos += 1;
  return {
    id: `evento-${eventos}`,
    orgId,
    momento: '2026-10-07T12:00:00.000Z',
    tipo,
    alvo: null,
    publico,
  };
}

function fontes({
  arvore = async () => ARVORE,
  acesso = async () => acessoCom(),
}: {
  arvore?: (orgId: string) => Promise<ArvoreDeLocais>;
  acesso?: (orgId: string, contaId: string) => Promise<Acesso>;
} = {}) {
  return { lerArvore: vi.fn(arvore), lerAcesso: vi.fn(acesso), avisar: vi.fn() };
}

describe('criarDistribuidor', () => {
  it('entrega cada evento só às conexões da organização que podem recebê-lo', async () => {
    const distribuidor = criarDistribuidor(fontes());
    const daOrganizacao = conexao('conta-ana', acessoCom({ 'pessoas.ver': true }));
    const deCampinas = conexao('conta-bruno', acessoCom({ 'pessoas.ver': ['cam'] }));
    const daPessoa = conexao('conta-carla', acessoCom());
    const deOutra = conexao('conta-zeca', acessoCom({ 'pessoas.ver': true }), 'org-b');
    for (const c of [daOrganizacao, deCampinas, daPessoa, deOutra]) distribuidor.entrar(c);

    const mudou = evento('pessoas.mudaram', {
      permissao: 'pessoas.ver',
      locais: ['exp'],
      contas: ['conta-carla'],
    });
    await distribuidor.distribuir(mudou);
    expect(daOrganizacao.recebidos).toEqual([mudou.id]);
    expect(deCampinas.recebidos).toEqual([]);
    expect(daPessoa.recebidos).toEqual([mudou.id]);
    expect(deOutra.recebidos).toEqual([]);
  });

  it('a conexão que sai não recebe mais nada', async () => {
    const distribuidor = criarDistribuidor(fontes());
    const ana = conexao('conta-ana', acessoCom());
    const sair = distribuidor.entrar(ana);
    sair();
    await distribuidor.distribuir(evento('padroes.mudaram', { todas: true }));
    expect(ana.recebidos).toEqual([]);
  });

  it('guarda a árvore de locais até o próximo locais.mudaram', async () => {
    let arvore = ARVORE;
    const lidas = fontes({ arvore: async () => arvore });
    const distribuidor = criarDistribuidor(lidas);
    const deJundiai = conexao('conta-bruno', acessoCom({ 'pessoas.ver': ['jun'] }));
    distribuidor.entrar(deJundiai);

    const emCampinas = () =>
      evento('pessoas.mudaram', { permissao: 'pessoas.ver', locais: ['cam'] });
    await distribuidor.distribuir(emCampinas());
    await distribuidor.distribuir(emCampinas());
    expect(lidas.lerArvore).toHaveBeenCalledTimes(1);
    expect(deJundiai.recebidos).toEqual([]);

    // Campinas passa a ficar dentro de Jundiaí; o evento dos locais avisa da mudança.
    arvore = montarArvore([
      local('jun', null, 'Jundiaí'),
      local('exp', 'jun', 'Expedição'),
      local('cam', 'jun', 'Campinas'),
    ]);
    const moveu = evento('locais.mudaram', { todas: true });
    await distribuidor.distribuir(moveu);
    const depois = emCampinas();
    await distribuidor.distribuir(depois);
    expect(lidas.lerArvore).toHaveBeenCalledTimes(2);
    expect(deJundiai.recebidos).toEqual([moveu.id, depois.id]);
  });

  it('em acessos.mudaram, relê o acesso uma vez por conta, antes dos eventos seguintes', async () => {
    const lidas = fontes({ acesso: async () => acessoCom({ 'pessoas.ver': true }) });
    const distribuidor = criarDistribuidor(lidas);
    const noComputador = conexao('conta-bruno', acessoCom());
    const noCelular = conexao('conta-bruno', acessoCom());
    const carla = conexao('conta-carla', acessoCom());
    for (const c of [noComputador, noCelular, carla]) distribuidor.entrar(c);

    const pessoa = () => evento('pessoas.mudaram', { permissao: 'pessoas.ver' });
    const antes = pessoa();
    await distribuidor.distribuir(antes);
    const mudaram = evento('acessos.mudaram', { todas: true });
    await distribuidor.distribuir(mudaram);
    const depois = pessoa();
    await distribuidor.distribuir(depois);

    expect(lidas.lerAcesso).toHaveBeenCalledTimes(2);
    expect(lidas.lerAcesso).toHaveBeenCalledWith('org-a', 'conta-bruno');
    expect(lidas.lerAcesso).toHaveBeenCalledWith('org-a', 'conta-carla');
    expect(noComputador.recebidos).toEqual([mudaram.id, depois.id]);
    expect(noCelular.recebidos).toEqual([mudaram.id, depois.id]);
  });

  it('entrega na ordem em que os eventos chegaram, mesmo esperando a árvore', async () => {
    let soltarArvore = () => {};
    const lidas = fontes({
      arvore: () =>
        new Promise((resolve) => {
          soltarArvore = () => resolve(ARVORE);
        }),
    });
    const distribuidor = criarDistribuidor(lidas);
    const ana = conexao('conta-ana', acessoCom({ 'pessoas.ver': true }));
    distribuidor.entrar(ana);
    const primeiro = evento('pessoas.mudaram', { permissao: 'pessoas.ver', locais: ['exp'] });
    const segundo = evento('padroes.mudaram', { todas: true });
    const entregas = [distribuidor.distribuir(primeiro), distribuidor.distribuir(segundo)];
    await new Promise((resolve) => setImmediate(resolve));
    expect(ana.recebidos).toEqual([]);
    soltarArvore();
    await Promise.all(entregas);
    expect(ana.recebidos).toEqual([primeiro.id, segundo.id]);
  });

  it('sem conseguir ler a árvore, manda reiniciar às conexões da organização e segue', async () => {
    const lidas = fontes({
      arvore: async () => {
        throw new Error('banco fora do ar');
      },
    });
    const distribuidor = criarDistribuidor(lidas);
    const ana = conexao('conta-ana', acessoCom({ 'pessoas.ver': true }));
    distribuidor.entrar(ana);
    await distribuidor.distribuir(
      evento('pessoas.mudaram', { permissao: 'pessoas.ver', locais: ['exp'] }),
    );
    expect(ana.recebidos).toEqual(['reiniciar']);
    expect(lidas.avisar).toHaveBeenCalledTimes(1);
    const depois = evento('padroes.mudaram', { todas: true });
    await distribuidor.distribuir(depois);
    expect(ana.recebidos).toEqual(['reiniciar', depois.id]);
  });

  it('reiniciar vai a todas as conexões, relê os acessos e esquece as árvores', async () => {
    const lidas = fontes({ acesso: async () => acessoCom({ 'pessoas.ver': true }) });
    const distribuidor = criarDistribuidor(lidas);
    const ana = conexao('conta-ana', acessoCom());
    const zeca = conexao('conta-zeca', acessoCom(), 'org-b');
    distribuidor.entrar(ana);
    distribuidor.entrar(zeca);
    await distribuidor.distribuir(
      evento('pessoas.mudaram', { permissao: 'pessoas.ver', locais: ['exp'] }),
    );
    expect(lidas.lerArvore).toHaveBeenCalledTimes(1);

    await distribuidor.reiniciar();
    expect(ana.recebidos).toEqual(['reiniciar']);
    expect(zeca.recebidos).toEqual(['reiniciar']);
    expect(lidas.lerAcesso).toHaveBeenCalledTimes(2);

    const depois = evento('pessoas.mudaram', { permissao: 'pessoas.ver', locais: ['exp'] });
    await distribuidor.distribuir(depois);
    expect(lidas.lerArvore).toHaveBeenCalledTimes(2);
    expect(ana.recebidos).toEqual(['reiniciar', depois.id]);
  });
});
