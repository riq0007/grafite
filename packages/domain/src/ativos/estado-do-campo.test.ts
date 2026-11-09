import { describe, expect, it } from 'vitest';
import {
  aplicarTravas,
  ORIGENS_DO_VALOR,
  podeGravar,
  ROTULOS_DAS_ORIGENS,
  registrarGravacao,
} from './estado-do-campo.ts';

const ANA = '0199a6e0-0000-7000-8000-0000000000c1';
const BRUNO = '0199a6e0-0000-7000-8000-0000000000c2';

describe('o estado de cada campo', () => {
  it('as origens são manual, planilha, coleta, API e o agente do GLPI, com o rótulo em pt-BR', () => {
    expect(ORIGENS_DO_VALOR).toEqual(['manual', 'planilha', 'coleta', 'api', 'agente']);
    expect(ROTULOS_DAS_ORIGENS).toEqual({
      manual: 'Manual',
      planilha: 'Planilha',
      coleta: 'Coleta',
      api: 'API',
      agente: 'Agente do GLPI',
    });
  });

  it('a gravação registra a origem, o momento e o autor, e mantém a trava de cada campo', () => {
    const antes = {
      'ativo.local': {
        origem: 'manual' as const,
        momento: '2026-10-01T10:00:00.000Z',
        autorId: BRUNO,
        trava: true,
      },
      'ativo.serie': {
        origem: 'planilha' as const,
        momento: '2026-10-01T10:00:00.000Z',
        autorId: BRUNO,
        trava: false,
      },
    };
    const depois = registrarGravacao(antes, ['ativo.local', 'ativo.hostname'], {
      origem: 'manual',
      momento: '2026-10-09T14:32:00.000Z',
      autorId: ANA,
    });
    expect(depois).toEqual({
      'ativo.local': {
        origem: 'manual',
        momento: '2026-10-09T14:32:00.000Z',
        autorId: ANA,
        trava: true,
      },
      'ativo.hostname': {
        origem: 'manual',
        momento: '2026-10-09T14:32:00.000Z',
        autorId: ANA,
        trava: false,
      },
      'ativo.serie': antes['ativo.serie'],
    });
    // O estado recebido não muda.
    expect(antes['ativo.local'].autorId).toBe(BRUNO);
  });

  it('a gravação pela coleta guarda o coletor, sem autor, e mantém a trava', () => {
    const COLETOR = '0199a6e0-0000-7000-8000-0000000000d1';
    const depois = registrarGravacao(
      { 'ativo.serie': { origem: null, momento: null, autorId: null, trava: false } },
      ['ativo.serie'],
      { origem: 'coleta', momento: '2026-10-14T10:22:00.000Z', autorId: null, coletorId: COLETOR },
    );
    expect(depois['ativo.serie']).toEqual({
      origem: 'coleta',
      momento: '2026-10-14T10:22:00.000Z',
      autorId: null,
      coletorId: COLETOR,
      trava: false,
    });
    // A gravação seguinte, de outra origem, não carrega o coletor de antes.
    const manual = registrarGravacao(depois, ['ativo.serie'], {
      origem: 'manual',
      momento: '2026-10-14T11:00:00.000Z',
      autorId: ANA,
    });
    expect(manual['ativo.serie']).toEqual({
      origem: 'manual',
      momento: '2026-10-14T11:00:00.000Z',
      autorId: ANA,
      trava: false,
    });
  });

  it('travar e destravar não mudam o momento nem o autor, e trava também um campo sem valor', () => {
    const gravado = registrarGravacao({}, ['ativo.local'], {
      origem: 'manual',
      momento: '2026-10-09T14:32:00.000Z',
      autorId: ANA,
    });
    const travado = aplicarTravas(gravado, { 'ativo.local': true, 'c-ip': true });
    expect(travado).toEqual({
      'ativo.local': {
        origem: 'manual',
        momento: '2026-10-09T14:32:00.000Z',
        autorId: ANA,
        trava: true,
      },
      'c-ip': { origem: null, momento: null, autorId: null, trava: true },
    });
    // Destravar o campo que nunca foi gravado tira o estado dele.
    expect(aplicarTravas(travado, { 'ativo.local': false, 'c-ip': false })).toEqual({
      'ativo.local': {
        origem: 'manual',
        momento: '2026-10-09T14:32:00.000Z',
        autorId: ANA,
        trava: false,
      },
    });
  });
});

describe('podeGravar', () => {
  const automatico = { escrita: 'automatica' as const };
  const soManual = { escrita: 'manual' as const };
  const travado = { origem: 'manual' as const, momento: null, autorId: null, trava: true };

  it('a gravação manual sempre pode', () => {
    expect(podeGravar(automatico, travado, 'manual')).toBe(true);
    expect(podeGravar(soManual, undefined, 'manual')).toBe(true);
  });

  it('a importação e a coleta não mudam um campo travado nem um campo só manual', () => {
    expect(podeGravar(automatico, undefined, 'planilha')).toBe(true);
    expect(podeGravar(automatico, { ...travado, trava: false }, 'coleta')).toBe(true);
    expect(podeGravar(automatico, travado, 'planilha')).toBe(false);
    expect(podeGravar(soManual, undefined, 'coleta')).toBe(false);
    expect(podeGravar(soManual, undefined, 'api')).toBe(false);
  });
});
