// A declaração única dos serviços (change painel-da-operacao, design, decisão 5; spec
// painel-da-operacao, "Estado do servidor no painel"): o servicos estado, o Compose do Linux e o
// painel a leem, e um serviço novo nela aparece em todos, sem mudar a página.
import { describe, expect, it } from 'vitest';
import { servicosDaInstalacao } from './layout.ts';
import { servicoDoCompose } from './linux/servicos.ts';
import { linhasDoEstado } from './servicos.ts';
import type { EstadoDoServico, Servicos } from './windows/servicos.ts';

/** Os serviços simulados, com o estado de cada um. */
function servicosCom(estados: Record<string, EstadoDoServico>): Servicos {
  return {
    registrar: async () => {},
    iniciar: async () => {},
    parar: async () => {},
    estado: async (id) => estados[id] ?? 'ausente',
  };
}

describe('a declaração dos serviços da instalação', () => {
  it('diz cada serviço, com o nome, o ambiente que ele serve e o serviço do Compose', () => {
    expect(servicosDaInstalacao()).toEqual([
      {
        id: 'grafite',
        noCompose: 'app-producao',
        nome: 'Grafite',
        ambiente: 'producao',
        ligadoPeloAmbiente: true,
      },
      {
        id: 'grafite-teste',
        noCompose: 'app-teste',
        nome: 'Grafite Teste',
        ambiente: 'teste',
        ligadoPeloAmbiente: true,
      },
      {
        id: 'grafite-coletor',
        noCompose: 'coletor',
        nome: 'Grafite Coletor',
        ambiente: 'producao',
        ligadoPeloAmbiente: true,
      },
      {
        id: 'grafite-proxy',
        noCompose: 'proxy',
        nome: 'Grafite Proxy',
        ambiente: null,
        ligadoPeloAmbiente: false,
      },
      {
        id: 'grafite-postgresql-teste',
        noCompose: 'banco-teste',
        nome: 'Grafite PostgreSQL Teste',
        ambiente: 'teste',
        ligadoPeloAmbiente: false,
      },
      {
        id: 'postgresql-x64-18',
        noCompose: 'banco-producao',
        nome: 'PostgreSQL da produção',
        ambiente: 'producao',
        ligadoPeloAmbiente: false,
      },
    ]);
  });

  it('o Compose do Linux sai da mesma declaração', () => {
    for (const { id, noCompose } of servicosDaInstalacao()) {
      expect(servicoDoCompose(id)).toBe(noCompose);
    }
  });

  it('Serviço novo na instalação: aparece no servicos estado, com o estado dele', async () => {
    const linhas = await linhasDoEstado(
      servicosCom({ grafite: 'rodando', 'grafite-chat': 'parado' }),
      (id) => id,
      [
        ...servicosDaInstalacao(),
        {
          id: 'grafite-chat',
          noCompose: 'chat',
          nome: 'Grafite Chat',
          ambiente: 'producao',
          ligadoPeloAmbiente: true,
        },
      ],
    );
    expect(linhas[0]).toBe('Grafite (grafite): rodando');
    expect(linhas.at(-1)).toBe('Grafite Chat (grafite-chat): parado');
  });
});
