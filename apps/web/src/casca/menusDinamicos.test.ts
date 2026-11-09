import { resolverPreferencias } from '@grafite/domain';
import { createRoute } from '@tanstack/react-router';
import { Box } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { criarCliente } from '../api/cliente.ts';
import { type ConsultaDoMenu, definirModulo } from '../modulos/tipos.ts';
import { raiz } from '../rotas/raiz.tsx';
import { comOsMenusDinamicos } from './menusDinamicos.ts';

const api = criarCliente({
  csrf: () => null,
  aoPerderASessao: () => {},
  aoMudarOAcesso: () => {},
});
const preferencias = resolverPreferencias();

/** As coisas que o menu do exemplo mostra, como as visões fixadas. */
const COISAS: ConsultaDoMenu<string[]> = { queryKey: ['coisas'], queryFn: async () => [] };

const rotas = createRoute({ getParentRoute: () => raiz, path: '/exemplo' });
const exemplo = definirModulo({
  id: 'exemplo',
  nome: 'Exemplo',
  icone: Box,
  endereco: '/exemplo',
  prioridadeNoCelular: 5,
  rotas,
  menu: [{ rotulo: 'Tudo', destino: '/exemplo' }],
  menuDinamico: {
    consultas: () => [COISAS],
    montar: ({ menu, ler }) => [
      ...menu,
      ...(ler(COISAS) ?? []).map((coisa) => ({
        rotulo: coisa,
        destino: `/exemplo?coisa=${coisa}` as const,
      })),
      { rotulo: 'Restritas', destino: '/exemplo?restritas=sim', permissoes: ['auditoria.ver'] },
    ],
  },
});

/** O `ler` com os dados de cada consulta, pelo começo da chave; a que falta ainda carrega. */
const lerDe =
  (dados: Record<string, unknown>) =>
  <TDado>(consulta: ConsultaDoMenu<TDado>) =>
    dados[String(consulta.queryKey[0])] as TDado | undefined;

const rotulosDe = (itens: readonly { rotulo: string }[] | undefined) =>
  itens?.map((item) => item.rotulo);

// Os itens de menu que vêm dos dados (change visoes-no-dock, design, decisão 2).
describe('comOsMenusDinamicos', () => {
  it('o módulo monta o menu com os itens fixos e os dos dados, na ordem dele', () => {
    const [comDados] = comOsMenusDinamicos([exemplo], {
      ler: lerDe({ coisas: ['Impressoras'] }),
      api,
      preferencias,
      pode: () => true,
    });
    expect(comDados?.menu).toEqual([
      { rotulo: 'Tudo', destino: '/exemplo' },
      { rotulo: 'Impressoras', destino: '/exemplo?coisa=Impressoras' },
      { rotulo: 'Restritas', destino: '/exemplo?restritas=sim', permissoes: ['auditoria.ver'] },
    ]);
  });

  it('o item dos dados que a conta não pode usar some, como os fixos', () => {
    const [comDados] = comOsMenusDinamicos([exemplo], {
      ler: lerDe({ coisas: ['Impressoras'] }),
      api,
      preferencias,
      pode: () => false,
    });
    expect(rotulosDe(comDados?.menu)).toEqual(['Tudo', 'Impressoras']);
  });

  it('enquanto a consulta carrega, o menu sai sem os itens dela', () => {
    const [semDados] = comOsMenusDinamicos([exemplo], {
      ler: lerDe({}),
      api,
      preferencias,
      pode: () => false,
    });
    expect(rotulosDe(semDados?.menu)).toEqual(['Tudo']);
  });

  it('o módulo sem menu dos dados passa como está', () => {
    const { menuDinamico: _, ...semDados } = exemplo;
    const [visto] = comOsMenusDinamicos([semDados], {
      ler: lerDe({}),
      api,
      preferencias,
      pode: () => true,
    });
    expect(visto).toBe(semDados);
  });
});
