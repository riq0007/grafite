import { describe, expect, it } from 'vitest';
import { codigoMudou } from './mudancas.ts';

describe('codigoMudou', () => {
  it('um PR só de documentação e specs não muda o código', () => {
    expect(
      codigoMudou('pull_request', [
        'docs/mapa.md',
        'docs/operacao/runbook.md',
        'openspec/changes/ci-paralelo/tasks.md',
        'openspec/specs/plataforma-base/spec.md',
      ]),
    ).toBe(false);
  });

  it('um arquivo fora de docs/ e de openspec/ muda o código', () => {
    expect(codigoMudou('pull_request', ['docs/mapa.md', 'apps/web/src/main.tsx'])).toBe(true);
    expect(codigoMudou('pull_request', ['CLAUDE.md'])).toBe(true);
    expect(codigoMudou('pull_request', ['.github/workflows/ci.yml'])).toBe(true);
  });

  it('um nome que só começa como as pastas não conta como documentação', () => {
    expect(codigoMudou('pull_request', ['docs.ts'])).toBe(true);
    expect(codigoMudou('pull_request', ['openspec-extra/a.md'])).toBe(true);
  });

  it('na dúvida, roda tudo: a lista vazia muda o código', () => {
    expect(codigoMudou('pull_request', [])).toBe(true);
  });

  it('no push, roda tudo', () => {
    expect(codigoMudou('push', ['docs/mapa.md'])).toBe(true);
  });
});
