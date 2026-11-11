import { MODULO_DOS_AJUSTES, TIPOS_DE_EVENTO, type TipoDeEvento } from '@grafite/domain';
import { createMemoryHistory, createRoute } from '@tanstack/react-router';
import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { ClienteDaApi } from '../api/cliente.ts';
import { criarCanalDeEventos } from '../eventos/canal.ts';
import { criarRoteador } from '../rotas/arvore.ts';
import { raiz } from '../rotas/raiz.tsx';
import { REGISTRO } from './registro.ts';
import { definirModulo, type ItemDoMenuDoModulo } from './tipos.ts';

const roteador = criarRoteador(createMemoryHistory());
const enderecosDasRotas = Object.keys(roteador.routesByPath);

/** Os destinos de um menu em árvore, com os dos submenus. */
const destinosDe = (itens: readonly ItemDoMenuDoModulo<string>[]): string[] =>
  itens.flatMap((item) => ('filhos' in item ? destinosDe(item.filhos) : [item.destino]));

describe('registro de módulos', () => {
  it('não repete o id de nenhum módulo', () => {
    const ids = REGISTRO.map((modulo) => modulo.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leva cada módulo e cada item dos menus a um endereço que existe nas rotas', () => {
    for (const modulo of REGISTRO) {
      const destinos = [
        modulo.endereco,
        ...destinosDe(modulo.menu ?? []),
        ...(modulo.menusDaBarra ?? []).flatMap((menu) => destinosDe(menu.itens)),
      ];
      for (const destino of destinos) {
        expect(enderecosDasRotas, `${modulo.id} → ${destino}`).toContain(destino);
      }
    }
  });

  it('leva cada entrada de busca declarada a um endereço que existe nas rotas', () => {
    for (const modulo of REGISTRO) {
      for (const entrada of modulo.busca?.entradas ?? []) {
        if (!('destino' in entrada) || entrada.destino === undefined) continue;
        expect(enderecosDasRotas, `${modulo.id} → ${entrada.id}`).toContain(entrada.destino);
      }
    }
  });

  it('não compila uma entrada de busca que leva a um endereço fora das rotas do módulo', () => {
    const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
    const modulo = definirModulo({
      id: 'exemplo',
      nome: 'Exemplo',
      icone: Box,
      endereco: '/exemplo',
      prioridadeNoCelular: 9,
      rotas,
      busca: {
        entradas: [
          { id: 'visao', rotulo: 'Visão geral', grupo: 'ir-para', destino: '/exemplo' },
          // @ts-expect-error: o endereço não existe nas rotas do módulo
          { id: 'fora', rotulo: 'Inexistente', grupo: 'ir-para', destino: '/exemplo/inexistente' },
        ],
      },
    });
    expect(modulo.busca?.entradas).toHaveLength(2);
  });

  it('confere os destinos e as permissões também no que exige permissão', () => {
    const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
    const modulo = definirModulo({
      id: 'exemplo',
      nome: 'Exemplo',
      icone: Box,
      endereco: '/exemplo',
      prioridadeNoCelular: 9,
      rotas,
      permissoes: ['pessoas.ver'],
      menu: [
        { rotulo: 'Visão geral', destino: '/exemplo', permissoes: ['pessoas.ver'] },
        // @ts-expect-error: o endereço não existe nas rotas do módulo
        { rotulo: 'Inexistente', destino: '/exemplo/inexistente', permissoes: ['pessoas.ver'] },
        // @ts-expect-error: a permissão não existe no catálogo
        { rotulo: 'Voar', destino: '/exemplo', permissoes: ['pessoas.voar'] },
      ],
    });
    expect(modulo.menu).toHaveLength(3);
  });

  it('aceita a fonte de ocorrências de um módulo, que a tela inicial reúne pelo registro', async () => {
    const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
    const aoMudar = () => () => {};
    const modulo = definirModulo({
      id: 'exemplo',
      nome: 'Exemplo',
      icone: Box,
      endereco: '/exemplo',
      prioridadeNoCelular: 9,
      rotas,
      ocorrencias: { buscar: async () => [], assinar: aoMudar },
    });
    const contexto = { api: {} as ClienteDaApi, canal: criarCanalDeEventos() };
    await expect(
      modulo.ocorrencias?.buscar(new AbortController().signal, contexto),
    ).resolves.toEqual([]);
    expect(modulo.ocorrencias?.assinar).toBe(aoMudar);
  });

  it('aceita os eventos de um módulo, com as consultas que cada tipo atualiza', () => {
    const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
    const modulo = definirModulo({
      id: 'exemplo',
      nome: 'Exemplo',
      icone: Box,
      endereco: '/exemplo',
      prioridadeNoCelular: 9,
      rotas,
      eventos: {
        'pessoas.mudaram': ({ alvo }) => [['exemplo'], ['exemplo', alvo?.id]],
        // @ts-expect-error: o tipo de evento não existe no catálogo
        'ativos.excluidos': () => [['ativos']],
      },
    });
    const evento = {
      id: '1',
      tipo: 'pessoas.mudaram' as const,
      momento: '2026-10-07T12:00:00.000Z',
      alvo: { tipo: 'pessoa', id: 'joao' },
    };
    expect(modulo.eventos?.['pessoas.mudaram']?.(evento)).toEqual([
      ['exemplo'],
      ['exemplo', 'joao'],
    ]);
  });

  it('cada módulo declara eventos do catálogo, cada um com ao menos uma consulta', () => {
    const evento = { id: '1', momento: '2026-10-07T12:00:00.000Z', alvo: null };
    for (const modulo of REGISTRO) {
      for (const [tipo, consultas] of Object.entries(modulo.eventos ?? {})) {
        expect(TIPOS_DE_EVENTO, `${modulo.id} → ${tipo}`).toContain(tipo);
        expect(consultas?.({ ...evento, tipo: tipo as TipoDeEvento }).length).toBeGreaterThan(0);
      }
    }
  });

  it('a Administração atualiza pessoas, locais, perfis e grupos pelos eventos deles', () => {
    const administracao = REGISTRO.find((modulo) => modulo.id === 'administracao');
    expect(Object.keys(administracao?.eventos ?? {})).toEqual(
      expect.arrayContaining(['pessoas.mudaram', 'locais.mudaram', 'acessos.mudaram']),
    );
  });

  it('Ajustes relê a conta e as sessões dela quando a pessoa ou a conta mudam', () => {
    const ajustes = REGISTRO.find((modulo) => modulo.id === 'ajustes');
    const evento = {
      id: '1',
      tipo: 'pessoas.mudaram' as const,
      momento: '2026-10-07T12:00:00.000Z',
      alvo: null,
    };
    expect(ajustes?.eventos?.['pessoas.mudaram']?.(evento)).toEqual([['conta']]);
  });

  it('deixa Ajustes por último, depois dos outros módulos', () => {
    expect(REGISTRO.at(-1)?.id).toBe('ajustes');
  });

  it('o id de Ajustes é o que o domínio deixa fora da ordem do dock', () => {
    expect(REGISTRO.at(-1)?.id).toBe(MODULO_DOS_AJUSTES);
  });

  it('põe os módulos de negócio antes da Administração, e Ajustes no fim', () => {
    expect(REGISTRO.map((modulo) => modulo.id)).toEqual([
      'inicio',
      'ativos',
      'gestao',
      'alertas',
      'operacao',
      'mapa',
      'salas',
      'paineis',
      'cofre',
      'administracao',
      'ajustes',
    ]);
  });

  it('não compila um item de menu que leva a um endereço fora das rotas do módulo', () => {
    const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
    const modulo = definirModulo({
      id: 'exemplo',
      nome: 'Exemplo',
      icone: Box,
      endereco: '/exemplo',
      prioridadeNoCelular: 9,
      rotas,
      menu: [
        { rotulo: 'Visão geral', destino: '/exemplo' },
        // @ts-expect-error: o endereço não existe nas rotas do módulo
        { rotulo: 'Inexistente', destino: '/exemplo/inexistente' },
      ],
    });
    expect(modulo.menu).toHaveLength(2);
  });

  it('também não compila um destino fora das rotas filhas do módulo', () => {
    const lista = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
    const racks = createRoute({ getParentRoute: () => lista, path: 'racks' });
    const rotas = lista.addChildren([racks]);
    const modulo = definirModulo({
      id: 'exemplo',
      nome: 'Exemplo',
      icone: Box,
      endereco: '/exemplo',
      prioridadeNoCelular: 9,
      rotas,
      menu: [
        { rotulo: 'Racks', destino: '/exemplo/racks' },
        // @ts-expect-error: o endereço não existe nas rotas do módulo
        { rotulo: 'Inexistente', destino: '/exemplo/inexistente' },
      ],
    });
    expect(modulo.menu).toHaveLength(2);
  });
});
