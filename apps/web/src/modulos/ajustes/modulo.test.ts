import { type IdDoTema, temas } from '@grafite/ui';
import { describe, expect, it, vi } from 'vitest';
import type { ContextoDaAcao } from '../../busca/tipos.ts';
import { ajustes } from './modulo.ts';
import { SECOES } from './secoes.ts';

const entradas = ajustes.busca?.entradas ?? [];

function contexto(): ContextoDaAcao {
  return { navegar: vi.fn(), mudarPreferencias: vi.fn(), abrirNotificacoes: vi.fn() };
}

describe('busca dos Ajustes', () => {
  it('cada seção entra no grupo Ajustes e leva ao endereço dela', () => {
    for (const secao of SECOES) {
      expect(entradas.find((entrada) => entrada.id === secao.id)).toMatchObject({
        rotulo: secao.nome,
        grupo: 'ajustes',
        caminho: 'Ajustes',
        destino: secao.endereco,
      });
    }
  });

  it('cada ajuste entra com o caminho da seção e o foco no controle dele', () => {
    expect(entradas.find((entrada) => entrada.rotulo === 'Tamanho do dock')).toMatchObject({
      grupo: 'ajustes',
      caminho: 'Ajustes › Dock',
      destino: '/ajustes/dock',
      foco: 'tamanho-do-dock',
    });
  });

  // Spec ajustes-do-sistema, "Seção Aparência": Barra de rolagem pela busca.
  it('Barra de rolagem pela busca: a entrada leva à Aparência, com o foco na escolha', () => {
    expect(entradas.find((entrada) => entrada.rotulo === 'Barra de rolagem')).toMatchObject({
      grupo: 'ajustes',
      caminho: 'Ajustes › Aparência',
      destino: '/ajustes/aparencia',
      foco: 'barra-de-rolagem',
    });
  });

  it('a Conta entra com as partes dela, cada uma com o foco na parte', () => {
    expect(entradas.find((entrada) => entrada.id === 'conta')).toMatchObject({
      rotulo: 'Conta',
      destino: '/ajustes/conta',
    });
    const partes = entradas.filter((entrada) => entrada.caminho === 'Ajustes › Conta');
    expect(partes.map((parte) => [parte.rotulo, parte.destino, parte.foco])).toEqual([
      ['Foto', '/ajustes/conta', 'foto'],
      ['Trocar senha', '/ajustes/conta', 'senha'],
      ['Verificação em dois passos', '/ajustes/conta', 'dois-passos'],
      ['Códigos de recuperação', '/ajustes/conta', 'codigos-de-recuperacao'],
      ['Sessões', '/ajustes/conta', 'sessoes'],
    ]);
  });

  it('cada tema tem a ação "Usar o tema <tema>", que troca o tema na hora', () => {
    const acoes = entradas.filter((entrada) => entrada.grupo === 'acoes');
    for (const id of Object.keys(temas) as IdDoTema[]) {
      const acao = acoes.find((entrada) => entrada.rotulo === `Usar o tema ${temas[id].nome}`);
      expect(acao, id).toBeDefined();
      const oQueACascaOferece = contexto();
      acao?.executar?.(oQueACascaOferece);
      expect(oQueACascaOferece.mudarPreferencias).toHaveBeenCalledWith('aparencia', { tema: id });
      expect(oQueACascaOferece.navegar).not.toHaveBeenCalled();
    }
  });
});
