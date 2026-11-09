import { describe, expect, it } from 'vitest';
import { mudancasDoAtivo, type VisaoDoAtivoNaAuditoria } from './historico.ts';

const antes: VisaoDoAtivoNaAuditoria = {
  tipo: 'Impressora',
  modelo: 'HP LaserJet M404',
  situacao: 'ativo',
  campos: {
    Local: 'Almoxarifado',
    Hostname: 'IMP-01',
    'Valor de compra': 'R$ 1.000,00',
    Contrato: 'CT-12',
  },
  travados: ['Hostname'],
  restritos: ['Valor de compra'],
};

const depois: VisaoDoAtivoNaAuditoria = {
  tipo: 'Impressora',
  modelo: 'HP LaserJet M404',
  situacao: 'ativo',
  campos: {
    Local: 'Expedição',
    Hostname: 'IMP-01',
    'Valor de compra': 'R$ 1.200,00',
    IP: '10.0.0.5',
  },
  travados: ['Local'],
  restritos: ['Valor de compra'],
};

const semRestritos = { restritos: new Set<string>(), verRestritos: false };
const comRestritos = { restritos: new Set<string>(), verRestritos: true };

describe('mudancasDoAtivo', () => {
  it('a edição: cada campo que mudou, antes → depois, e as travas ligadas e desligadas', () => {
    expect(mudancasDoAtivo(antes, depois, comRestritos)).toEqual({
      mudancas: [
        { campo: 'Local', antes: 'Almoxarifado', depois: 'Expedição' },
        { campo: 'Valor de compra', antes: 'R$ 1.000,00', depois: 'R$ 1.200,00' },
        { campo: 'IP', antes: null, depois: '10.0.0.5' },
        { campo: 'Contrato', antes: 'CT-12', depois: null },
      ],
      travas: { ligadas: ['Local'], desligadas: ['Hostname'] },
    });
  });

  it('sem os restritos, a mudança e a trava de um campo restrito saem', () => {
    const travadoRestrito = { ...depois, travados: ['Local', 'Valor de compra'] };
    expect(mudancasDoAtivo(antes, travadoRestrito, semRestritos)).toEqual({
      mudancas: [
        { campo: 'Local', antes: 'Almoxarifado', depois: 'Expedição' },
        { campo: 'IP', antes: null, depois: '10.0.0.5' },
        { campo: 'Contrato', antes: 'CT-12', depois: null },
      ],
      travas: { ligadas: ['Local'], desligadas: ['Hostname'] },
    });
  });

  it('a edição que só mudou um restrito fica vazia para quem não vê os restritos', () => {
    const soORestrito = {
      ...antes,
      campos: { ...antes.campos, 'Valor de compra': 'R$ 9,00' },
    };
    expect(mudancasDoAtivo(antes, soORestrito, semRestritos)).toEqual({
      mudancas: [],
      travas: { ligadas: [], desligadas: [] },
    });
  });

  it('os registros antigos, sem a lista dos restritos, usam os rótulos dados', () => {
    const { restritos: _a, ...antigoAntes } = antes;
    const { restritos: _d, ...antigoDepois } = depois;
    const mudancas = mudancasDoAtivo(antigoAntes, antigoDepois, {
      restritos: new Set(['Valor de compra']),
      verRestritos: false,
    }).mudancas.map((mudanca) => mudanca.campo);
    expect(mudancas).toEqual(['Local', 'IP', 'Contrato']);
  });

  it('o cadastro mostra o modelo e os campos preenchidos', () => {
    expect(mudancasDoAtivo(null, depois, semRestritos).mudancas).toEqual([
      { campo: 'Modelo', antes: null, depois: 'HP LaserJet M404' },
      { campo: 'Local', antes: null, depois: 'Expedição' },
      { campo: 'Hostname', antes: null, depois: 'IMP-01' },
      { campo: 'IP', antes: null, depois: '10.0.0.5' },
    ]);
  });

  it('o modelo e a situação também são mudanças', () => {
    const inativado = { ...antes, modelo: null, situacao: 'inativo' as const };
    expect(mudancasDoAtivo(antes, inativado, comRestritos).mudancas).toEqual([
      { campo: 'Modelo', antes: 'HP LaserJet M404', depois: null },
      { campo: 'Situação', antes: 'Ativo', depois: 'Inativo' },
    ]);
  });
});
