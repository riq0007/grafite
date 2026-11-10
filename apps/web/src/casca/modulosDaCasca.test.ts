import { resolverPreferencias } from '@grafite/domain';
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Box, Settings } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { definirModulo } from '../modulos/tipos.ts';
import { moduloAtual, modulosDaCasca } from './modulosDaCasca.ts';

// Rotas de exemplo numa raiz própria, fora da árvore do app. Cada uma numa constante, como no
// contrato de módulo: criadas dentro do addChildren, as filhas perdem os tipos dos endereços.
const raiz = createRootRoute();
const lista = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
const switches = createRoute({ getParentRoute: () => lista, path: 'switches' });
const racks = createRoute({ getParentRoute: () => lista, path: 'racks' });
const importar = createRoute({ getParentRoute: () => lista, path: 'importar' });
const rotasDoExemplo = lista.addChildren([switches, racks, importar]);
const rotasDeAjustes = createRoute({ getParentRoute: () => raiz, path: '/ajustes' });
const rotasDaOperacao = createRoute({ getParentRoute: () => raiz, path: '/operacao' });
const rotasDasSalas = createRoute({ getParentRoute: () => raiz, path: '/salas' });
const rotasDoCofre = createRoute({ getParentRoute: () => raiz, path: '/cofre' });
const rotasDaAdministracao = createRoute({
  getParentRoute: () => raiz,
  path: '/administracao',
});
// Como no app, as rotas só ganham id quando um roteador monta a árvore.
createRouter({
  routeTree: raiz.addChildren([
    rotasDoExemplo,
    rotasDeAjustes,
    rotasDaOperacao,
    rotasDasSalas,
    rotasDoCofre,
    rotasDaAdministracao,
  ]),
});

const exemplo = definirModulo({
  id: 'exemplo',
  nome: 'Exemplo',
  icone: Box,
  endereco: '/exemplo',
  prioridadeNoCelular: 2,
  rotas: rotasDoExemplo,
  menu: [
    { rotulo: 'Todos', destino: '/exemplo' },
    {
      rotulo: 'Rede',
      filhos: [
        { rotulo: 'Switches', destino: '/exemplo/switches' },
        { rotulo: 'Racks', destino: '/exemplo/racks' },
      ],
    },
    { rotulo: 'Importar planilha', destino: '/exemplo/importar', separadoAntes: true },
  ],
  menusDaBarra: [{ rotulo: 'Visualizar', itens: [{ rotulo: 'Racks', destino: '/exemplo/racks' }] }],
});

const ajustes = definirModulo({
  id: 'ajustes',
  nome: 'Ajustes',
  icone: Settings,
  endereco: '/ajustes',
  prioridadeNoCelular: 9,
  rotas: rotasDeAjustes,
});

const operacao = definirModulo({
  id: 'operacao',
  nome: 'Operação',
  icone: Box,
  endereco: '/operacao',
  prioridadeNoCelular: 3,
  rotas: rotasDaOperacao,
});

const salas = definirModulo({
  id: 'salas',
  nome: 'Salas',
  icone: Box,
  endereco: '/salas',
  prioridadeNoCelular: 4,
  rotas: rotasDasSalas,
  menu: [{ rotulo: 'Agenda', destino: '/salas' }],
});

const cofre = definirModulo({
  id: 'cofre',
  nome: 'Cofre',
  icone: Box,
  endereco: '/cofre',
  prioridadeNoCelular: 5,
  rotas: rotasDoCofre,
});

// Fica sempre em "Mais" no celular, como a Administração do app.
const administracao = definirModulo({
  id: 'administracao',
  nome: 'Administração',
  icone: Box,
  endereco: '/administracao',
  prioridadeNoCelular: 'mais',
  rotas: rotasDaAdministracao,
});

describe('módulos da casca', () => {
  it('põe Ajustes no fim do dock, depois do separador, e os outros na ordem do registro', () => {
    const { modulos, modulosDoFim } = modulosDaCasca([ajustes, exemplo]);
    expect(modulos.map((modulo) => modulo.id)).toEqual(['exemplo']);
    expect(modulosDoFim.map((modulo) => modulo.id)).toEqual(['ajustes']);
  });

  it('leva nome, ícone e prioridade no celular', () => {
    const [modulo] = modulosDaCasca([exemplo]).modulos;
    expect(modulo).toMatchObject({ id: 'exemplo', nome: 'Exemplo', prioridadeNoCelular: 2 });
    expect(modulo?.icone).toBe(Box);
  });

  it('dá a cada item que navega o próprio destino como id, com submenus e linhas', () => {
    const [modulo] = modulosDaCasca([exemplo]).modulos;
    expect(modulo?.menu).toEqual([
      { id: '/exemplo', rotulo: 'Todos', separadoAntes: undefined },
      {
        id: 'exemplo › Rede',
        rotulo: 'Rede',
        separadoAntes: undefined,
        filhos: [
          { id: '/exemplo/switches', rotulo: 'Switches', separadoAntes: undefined },
          { id: '/exemplo/racks', rotulo: 'Racks', separadoAntes: undefined },
        ],
      },
      { id: '/exemplo/importar', rotulo: 'Importar planilha', separadoAntes: true },
    ]);
  });

  it('leva os menus da barra, identificados pelo rótulo', () => {
    const [modulo] = modulosDaCasca([exemplo]).modulos;
    expect(modulo?.menusDaBarra).toEqual([
      {
        id: 'Visualizar',
        rotulo: 'Visualizar',
        itens: [{ id: '/exemplo/racks', rotulo: 'Racks', separadoAntes: undefined }],
      },
    ]);
  });

  it('deixa sem menu o módulo que não registrou nenhum', () => {
    const [modulo] = modulosDaCasca([ajustes]).modulosDoFim;
    expect(modulo?.menu).toBeUndefined();
    expect(modulo?.menusDaBarra).toBeUndefined();
  });

  it('acha o módulo atual pelas rotas em que o endereço caiu, inclusive as de dentro dele', () => {
    const registro = [exemplo, ajustes];
    expect(moduloAtual(registro, ['__root__', '/ajustes'])?.id).toBe('ajustes');
    expect(moduloAtual(registro, ['__root__', '/exemplo', '/exemplo/racks'])?.id).toBe('exemplo');
  });

  it('não tem módulo atual num endereço que não leva a nenhum módulo', () => {
    expect(moduloAtual([exemplo, ajustes], ['__root__'])).toBeUndefined();
  });
});

// A ordem que vale (spec dock, "Ordem dos módulos e módulos fora do dock"; change
// dock-personalizavel, design, decisão 2).
describe('a ordem dos módulos no dock', () => {
  const ids = (modulos: ReadonlyArray<{ id: string }>) => modulos.map((modulo) => modulo.id);
  const noDock = (id: string) => ({ id, visivel: true });
  const tirado = (id: string) => ({ id, visivel: false });
  const registro = [exemplo, operacao, salas, cofre, ajustes];

  it('sem a escolha, vale a ordem do registro, com todos no dock', () => {
    const { modulos, modulosNoMais, modulosDoFim } = modulosDaCasca(registro, []);
    expect(ids(modulos)).toEqual(['exemplo', 'operacao', 'salas', 'cofre']);
    expect(modulosNoMais).toEqual([]);
    expect(ids(modulosDoFim)).toEqual(['ajustes']);
  });

  it('Ordem escolhida: os módulos seguem a lista da conta, e Ajustes continua no fim', () => {
    const { modulos, modulosNoMais, modulosDoFim } = modulosDaCasca(registro, [
      noDock('operacao'),
      noDock('exemplo'),
      noDock('cofre'),
      noDock('salas'),
    ]);
    expect(ids(modulos)).toEqual(['operacao', 'exemplo', 'cofre', 'salas']);
    expect(modulosNoMais).toEqual([]);
    expect(ids(modulosDoFim)).toEqual(['ajustes']);
  });

  it('o módulo tirado do dock vai para o Mais, com o menu dele', () => {
    const { modulos, modulosNoMais } = modulosDaCasca(registro, [
      noDock('exemplo'),
      tirado('salas'),
      noDock('operacao'),
      tirado('cofre'),
    ]);
    expect(ids(modulos)).toEqual(['exemplo', 'operacao']);
    expect(ids(modulosNoMais)).toEqual(['salas', 'cofre']);
    expect(modulosNoMais[0]?.menu).toEqual([{ id: '/salas', rotulo: 'Agenda' }]);
  });

  it('Módulo ligado depois: entra no dock depois dos que a conta arrumou, antes de Ajustes', () => {
    const escolha = [noDock('operacao'), tirado('cofre'), noDock('exemplo')];
    const { modulos, modulosNoMais, modulosDoFim } = modulosDaCasca(registro, escolha);
    expect(ids(modulos)).toEqual(['operacao', 'exemplo', 'salas']);
    expect(ids(modulosNoMais)).toEqual(['cofre']);
    expect(ids(modulosDoFim)).toEqual(['ajustes']);
  });

  it('Módulo sem acesso na ordem: fica de fora, e volta ao lugar dele com o acesso de volta', () => {
    const escolha = [noDock('exemplo'), noDock('cofre'), noDock('operacao'), noDock('salas')];
    const semOCofre = modulosDaCasca([exemplo, operacao, salas, ajustes], escolha);
    expect(ids(semOCofre.modulos)).toEqual(['exemplo', 'operacao', 'salas']);
    expect(semOCofre.modulosNoMais).toEqual([]);
    const comOCofre = modulosDaCasca(registro, escolha);
    expect(ids(comOCofre.modulos)).toEqual(['exemplo', 'cofre', 'operacao', 'salas']);
  });

  it('Padrão da organização: a conta que nunca arrumou o dock abre com a ordem dela', () => {
    const padroes = { dock: { modulos: [noDock('operacao'), tirado('salas')] } };
    const daConta = resolverPreferencias(padroes, {}).dock.modulos;
    const { modulos, modulosNoMais } = modulosDaCasca(registro, daConta);
    expect(ids(modulos)).toEqual(['operacao', 'exemplo', 'cofre']);
    expect(ids(modulosNoMais)).toEqual(['salas']);
    // A conta que arrumou o dock dela fica com a lista dela, inteira.
    const arrumada = resolverPreferencias(padroes, { dock: { modulos: [noDock('cofre')] } });
    expect(ids(modulosDaCasca(registro, arrumada.dock.modulos).modulos)).toEqual([
      'cofre',
      'exemplo',
      'operacao',
      'salas',
    ]);
  });

  it('Ajustes numa lista salva não sai do fim nem vai para o Mais', () => {
    const { modulos, modulosNoMais, modulosDoFim } = modulosDaCasca(registro, [
      tirado('ajustes'),
      noDock('salas'),
    ]);
    expect(ids(modulos)).toEqual(['salas', 'exemplo', 'operacao', 'cofre']);
    expect(modulosNoMais).toEqual([]);
    expect(ids(modulosDoFim)).toEqual(['ajustes']);
  });
});

// As abas do celular (spec posturas-da-casca, "Postura celular"; change dock-personalizavel, design,
// decisão 5): com a escolha, a prioridade é a ordem dela.
describe('a ordem das abas do celular', () => {
  const noDock = (id: string) => ({ id, visivel: true });
  const tirado = (id: string) => ({ id, visivel: false });
  const registro = [exemplo, operacao, salas, cofre, administracao, ajustes];
  const prioridades = (modulos: ReadonlyArray<{ id: string; prioridadeNoCelular?: unknown }>) =>
    Object.fromEntries(modulos.map((modulo) => [modulo.id, modulo.prioridadeNoCelular]));

  it('sem a escolha, vale a prioridade que cada módulo declara', () => {
    const { modulos, modulosDoFim } = modulosDaCasca(registro, []);
    expect(prioridades([...modulos, ...modulosDoFim])).toEqual({
      exemplo: 2,
      operacao: 3,
      salas: 4,
      cofre: 5,
      administracao: 'mais',
      ajustes: 9,
    });
  });

  it('Ordem escolhida no celular: a prioridade é a ordem da lista, com Ajustes depois dela', () => {
    const { modulos, modulosDoFim } = modulosDaCasca(registro, [
      noDock('cofre'),
      noDock('salas'),
      noDock('exemplo'),
      noDock('operacao'),
    ]);
    expect(prioridades(modulos)).toMatchObject({ cofre: 1, salas: 2, exemplo: 3, operacao: 4 });
    expect(prioridades(modulosDoFim)).toEqual({ ajustes: 6 });
  });

  it('Módulo tirado do dock no celular: fica em "Mais", e não numa aba', () => {
    const { modulos, modulosNoMais } = modulosDaCasca(registro, [
      noDock('operacao'),
      tirado('salas'),
    ]);
    expect(prioridades(modulosNoMais)).toEqual({ salas: 'mais' });
    expect(prioridades(modulos)).toMatchObject({ operacao: 1, exemplo: 2, cofre: 3 });
  });

  it('o módulo que declara "Mais" continua em "Mais", em qualquer lugar da lista', () => {
    const { modulos } = modulosDaCasca(registro, [noDock('administracao'), noDock('operacao')]);
    expect(prioridades(modulos)).toMatchObject({ administracao: 'mais', operacao: 2 });
  });
});
