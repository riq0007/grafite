import { describe, expect, it } from 'vitest';
import { argumentosDoDocker } from './visual.ts';

describe('argumentosDoDocker', () => {
  const base = { pasta: 'D:\\grafite\\packages\\ui', versao: '1.63.0', atualizar: false };

  it('usa a imagem oficial na mesma versão do Playwright do projeto', () => {
    const args = argumentosDoDocker(base);
    expect(args).toContain('mcr.microsoft.com/playwright:v1.63.0-noble');
    expect(args.join(' ')).toContain('@playwright/test@1.63.0');
  });

  it('monta o pacote de UI em /work e guarda o cache do npm entre execuções', () => {
    const args = argumentosDoDocker(base);
    expect(args).toContain('D:\\grafite\\packages\\ui:/work');
    expect(args).toContain('grafite-npm:/root/.npm');
  });

  it('só regrava as referências quando pedido', () => {
    expect(argumentosDoDocker(base).join(' ')).not.toContain('--update-snapshots');
    expect(argumentosDoDocker({ ...base, atualizar: true }).join(' ')).toContain(
      '--update-snapshots',
    );
  });
});
