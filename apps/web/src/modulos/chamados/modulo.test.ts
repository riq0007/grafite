// O módulo Chamados no registro (spec modulo-chamados, "Chamados no dock" e "Telas atualizadas e
// módulo desligado"; change chamados-da-ti, design, decisão 14, "O módulo na casca"): o primeiro
// do dock, antes do Início, com a boia, para quem vê, atende ou configura os chamados, com o menu
// de cada permissão, a ação de abrir um chamado na busca e as consultas que cada evento relê.
import { fechamento, type Permissao, TIPOS_DE_EVENTO, type TipoDeEvento } from '@grafite/domain';
import { QueryClient } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { buscarNasEntradas } from '../../busca/casamento.ts';
import { entradasDoRegistro } from '../../busca/fontes.ts';
import { modulosDaCasca } from '../../casca/modulosDaCasca.ts';
import { criarCanalDeEventos, type EventoRecebido } from '../../eventos/canal.ts';
import { ligarEventosDosModulos } from '../../eventos/modulos.ts';
import { REGISTRO } from '../registro.ts';
import { itensPermitidos, registroDaConta } from '../registroDaConta.ts';
import {
  CHAVE_DA_FICHA_DO_CHAMADO,
  CHAVE_DOS_AJUSTES_DOS_CHAMADOS,
  CHAVE_DOS_CHAMADOS,
} from './consultas.ts';
import { chamados } from './modulo.ts';

/** As permissões dadas e as que elas incluem, como no acesso da sessão. */
const com = (...permissoes: Permissao[]) => {
  const todas = fechamento(permissoes);
  return (chave: Permissao) => todas.has(chave);
};

const rotulos = (pode: (chave: Permissao) => boolean) =>
  itensPermitidos(chamados.menu ?? [], pode).map((item) => item.rotulo);

const evento = (tipo: TipoDeEvento): EventoRecebido => ({
  id: 'evento-1',
  tipo,
  momento: '2026-11-17T10:40:00.000Z',
  alvo: null,
});

/** Os eventos dos dados que as telas dos chamados mostram, que relêem os chamados inteiros. */
const RELEEM_OS_CHAMADOS = [
  'pessoas.mudaram',
  'locais.mudaram',
  'acessos.mudaram',
  'ativos.mudaram',
] as const;

/** Os eventos do que só a ficha do chamado mostra. */
const RELEEM_A_FICHA = [
  'alertas.mudaram',
  'ordens.mudaram',
  'solicitacoes.mudaram',
  'estoque.mudou',
  'consumiveis.mudaram',
  'disponibilidade.mudou',
  'catalogo.mudou',
  'modulos.mudaram',
] as const;

/**
 * O que o evento relê, com o Chamados ligado aos eventos como na casca: uma lista dos chamados, a
 * ficha de um chamado e os tipos, dos ajustes.
 */
function relidasPor(tipo: TipoDeEvento) {
  const consultas = new QueryClient();
  const canal = criarCanalDeEventos();
  const parar = ligarEventosDosModulos({ registro: [chamados], canal, consultas });
  const lista = [...CHAVE_DOS_CHAMADOS, 'lista'];
  const ficha = [...CHAVE_DA_FICHA_DO_CHAMADO, '1042'];
  const tipos = [...CHAVE_DOS_AJUSTES_DOS_CHAMADOS, 'tipos'];
  for (const chave of [lista, ficha, tipos]) consultas.setQueryData(chave, []);
  canal.publicar(evento(tipo));
  parar();
  const relida = (chave: readonly string[]) => consultas.getQueryState(chave)?.isInvalidated;
  return { lista: relida(lista), ficha: relida(ficha), tipos: relida(tipos) };
}

describe('o módulo Chamados no registro', () => {
  it('Conta que nunca arrumou o dock: o dock começa por Chamados, com a boia, seguido do Início', () => {
    // Entre o Chamados e o Início fica só o Chat, que aparece a quem usa o chat (change
    // chat-com-chamados).
    expect(REGISTRO.slice(0, 3).map(({ id }) => id)).toEqual(['chamados', 'chat', 'inicio']);
    expect(chamados).toMatchObject({ nome: 'Chamados', icone: LifeBuoy, endereco: '/chamados' });
    const { modulos } = modulosDaCasca(registroDaConta(REGISTRO, com('chamados.atender')));
    expect(modulos.slice(0, 2).map(({ nome }) => nome)).toEqual(['Chamados', 'Início']);
  });

  it('Conta que já arrumou o dock: o Chamados aparece depois dos arrumados, antes dos Ajustes', () => {
    const { modulos, modulosDoFim } = modulosDaCasca(
      registroDaConta(REGISTRO, com('chamados.atender', 'ativos.ver')),
      [
        { id: 'inicio', visivel: true },
        { id: 'ativos', visivel: true },
      ],
    );
    expect(modulos.map(({ id }) => id)).toEqual(['inicio', 'ativos', 'chamados']);
    expect(modulosDoFim.map(({ id }) => id)).toEqual(['ajustes']);
  });

  it('aparece para quem vê, atende ou configura os chamados, e some com o módulo desligado', () => {
    const comChamados = (pode: (chave: Permissao) => boolean, desligados: string[] = []) =>
      registroDaConta(REGISTRO, pode, desligados).some((modulo) => modulo.id === 'chamados');
    expect(comChamados(com('chamados.ver'))).toBe(true);
    expect(comChamados(com('chamados.atender'))).toBe(true);
    expect(comChamados(com('chamados.configurar'))).toBe(true);
    expect(comChamados(com('ativos.ver', 'pessoas.ver', 'ordens.atender'))).toBe(false);
    expect(comChamados(com('chamados.atender'), ['chamados'])).toBe(false);
  });

  it('o menu de quem vê ou atende tem Início, Quem está com o quê e Prazos', () => {
    expect(rotulos(com('chamados.ver'))).toEqual(['Início', 'Quem está com o quê', 'Prazos']);
    expect(rotulos(com('chamados.atender'))).toEqual(['Início', 'Quem está com o quê', 'Prazos']);
  });

  it('Quem só configura: o menu mostra só Tipos de chamado, Respostas prontas e Horário da TI', () => {
    expect(rotulos(com('chamados.configurar'))).toEqual([
      'Tipos de chamado',
      'Respostas prontas',
      'Horário da TI',
    ]);
  });

  it('com as três, as telas de configurar vêm depois de uma linha, cada uma no endereço dela', () => {
    const menu = itensPermitidos(
      chamados.menu ?? [],
      com('chamados.atender', 'chamados.configurar'),
    );
    expect(menu).toEqual([
      expect.objectContaining({ rotulo: 'Início', destino: '/chamados' }),
      expect.objectContaining({
        rotulo: 'Quem está com o quê',
        destino: '/chamados/quem-esta-com-o-que',
      }),
      expect.objectContaining({ rotulo: 'Prazos', destino: '/chamados/prazos' }),
      expect.objectContaining({
        rotulo: 'Tipos de chamado',
        destino: '/chamados/tipos',
        separadoAntes: true,
      }),
      expect.objectContaining({
        rotulo: 'Respostas prontas',
        destino: '/chamados/respostas-prontas',
      }),
      expect.objectContaining({ rotulo: 'Horário da TI', destino: '/chamados/horario' }),
    ]);
  });

  it('Abrir um chamado pela busca: a ação, no caminho "Chamados", leva ao Início com a gaveta, a quem atende', () => {
    const abrir = (chamados.busca?.entradas ?? []).find(
      (entrada) => entrada.rotulo === 'Abrir um chamado',
    );
    expect(abrir).toMatchObject({
      grupo: 'acoes',
      caminho: 'Chamados',
      permissoes: ['chamados.atender'],
    });
    const navegar = vi.fn();
    abrir?.executar?.({ navegar, mudarPreferencias: vi.fn(), abrirNotificacoes: vi.fn() });
    expect(navegar).toHaveBeenCalledWith('/chamados?abrir=1');
    for (const termo of ['abrir chamado', 'novo chamado']) {
      const acoes = buscarNasEntradas(termo, entradasDoRegistro([chamados])).find(
        (grupo) => grupo.id === 'acoes',
      );
      expect(acoes?.resultados[0]?.rotulo).toBe('Abrir um chamado');
    }
    // Quem só vê os chamados não tem a ação.
    const doQueVe = registroDaConta(REGISTRO, com('chamados.ver')).find(
      (modulo) => modulo.id === 'chamados',
    );
    expect(doQueVe?.busca?.entradas ?? []).toEqual([]);
  });

  it('as telas do menu entram na busca, no caminho "Chamados", cada uma a quem a vê', () => {
    const telas = (pode: (chave: Permissao) => boolean) =>
      entradasDoRegistro(registroDaConta(REGISTRO, pode))
        .filter((entrada) => entrada.caminho === 'Chamados' && entrada.grupo === 'ir-para')
        .map(({ rotulo }) => rotulo);
    expect(telas(com('chamados.ver'))).toEqual(
      expect.arrayContaining(['Início', 'Quem está com o quê', 'Prazos']),
    );
    expect(telas(com('chamados.ver'))).not.toContain('Tipos de chamado');
    expect(telas(com('chamados.configurar'))).toEqual(
      expect.arrayContaining(['Tipos de chamado', 'Respostas prontas', 'Horário da TI']),
    );
    expect(telas(com('chamados.configurar'))).not.toContain('Prazos');
  });

  it('o chamados.mudaram relê as listas e a ficha dos chamados, e não os ajustes', () => {
    expect(relidasPor('chamados.mudaram')).toEqual({ lista: true, ficha: true, tipos: false });
  });

  it('o ajustes-dos-chamados.mudaram relê os ajustes e os chamados, porque o horário fecha os relógios', () => {
    expect(relidasPor('ajustes-dos-chamados.mudaram')).toEqual({
      lista: true,
      ficha: true,
      tipos: true,
    });
  });

  it('os eventos das pessoas, dos locais, dos acessos e dos ativos relêem os chamados, e não os ajustes', () => {
    for (const tipo of RELEEM_OS_CHAMADOS) {
      expect(relidasPor(tipo), tipo).toEqual({ lista: true, ficha: true, tipos: false });
    }
  });

  it('os eventos do que só a ficha mostra relêem só a ficha', () => {
    for (const tipo of RELEEM_A_FICHA) {
      expect(relidasPor(tipo), tipo).toEqual({ lista: false, ficha: true, tipos: false });
    }
  });

  it('os outros eventos não relêem nada dos chamados', () => {
    const declarados = new Set<TipoDeEvento>([
      'chamados.mudaram',
      'ajustes-dos-chamados.mudaram',
      ...RELEEM_OS_CHAMADOS,
      ...RELEEM_A_FICHA,
    ]);
    const outros = TIPOS_DE_EVENTO.filter((tipo) => !declarados.has(tipo));
    expect(outros.length).toBeGreaterThan(0);
    for (const tipo of outros) {
      expect(relidasPor(tipo), tipo).toEqual({ lista: false, ficha: false, tipos: false });
    }
  });
});
