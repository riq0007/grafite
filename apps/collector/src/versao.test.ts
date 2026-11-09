import { expect, it } from 'vitest';
import api from '../../api/package.json' with { type: 'json' };
import coletor from '../package.json' with { type: 'json' };

// O coletor informa a versão dele à API e na saúde, e a tela dos coletores a mostra: ela tem de ser a
// versão do Grafite, que é a da API (o versao.yml confere a da API).
it('a versão do coletor é a do Grafite, a da API', () => {
  expect(coletor.version).toBe(api.version);
});
