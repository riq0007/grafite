import { describe, expect, it } from 'vitest';
import {
  haQuantoTempo,
  idadeRelativa,
  type OcorrenciaAberta,
  type OrdenacaoDasOcorrencias,
  ordenarOcorrencias,
} from './ocorrencias.ts';

const agora = new Date('2026-09-24T17:32:00Z');
const MINUTO = 60_000;
const haMinutos = (minutos: number) => new Date(agora.getTime() - minutos * MINUTO);

const ocorrencia = (
  id: string,
  severidade: OcorrenciaAberta['severidade'],
  minutos: number,
  nome: string,
  texto: string,
): OcorrenciaAberta => ({
  id,
  severidade,
  texto,
  ativo: { nome, tipo: 'impressora' },
  desde: haMinutos(minutos),
  destino: `/ativos/${id}`,
});

const coleta = ocorrencia('coleta', 'critico', 32, 'Aruba 2930F 48p', 'Coleta atrasada · 3 ciclos');
const toner = ocorrencia('toner', 'atencao', 60, 'HP LaserJet M404dn', 'Toner preto em 8%');
const backup = ocorrencia(
  'backup',
  'atencao',
  7 * 60,
  'Control iD iDFace',
  'Backup da noite falhou',
);
const garantia = ocorrencia(
  'garantia',
  'info',
  24 * 60,
  'Dell OptiPlex 7010',
  'Garantia vence em 12 dias',
);
const LISTA = [toner, garantia, coleta, backup];

const ids = (lista: readonly OcorrenciaAberta[]) => lista.map((item) => item.id);
const ordenar = (ordenacao: OrdenacaoDasOcorrencias, lista = LISTA) =>
  ids(ordenarOcorrencias(lista, ordenacao));

describe('ordenarOcorrencias', () => {
  it('na ordem de fábrica, vem a severidade e, dentro dela, a mais antiga primeiro', () => {
    // Cenário da spec: Atenção de 7 h, Atenção de 1 h e Crítica de 32 min.
    expect(ordenar({ coluna: 'severidade', direcao: 'decrescente' })).toEqual([
      'coleta',
      'backup',
      'toner',
      'garantia',
    ]);
  });

  it('invertida, começa pela Informação, e a mais antiga continua primeiro no empate', () => {
    expect(ordenar({ coluna: 'severidade', direcao: 'crescente' })).toEqual([
      'garantia',
      'backup',
      'toner',
      'coleta',
    ]);
  });

  it('pelo tempo aberta: a mais antiga primeiro no decrescente, a mais nova no crescente', () => {
    expect(ordenar({ coluna: 'ha', direcao: 'decrescente' })).toEqual([
      'garantia',
      'backup',
      'toner',
      'coleta',
    ]);
    expect(ordenar({ coluna: 'ha', direcao: 'crescente' })).toEqual([
      'coleta',
      'toner',
      'backup',
      'garantia',
    ]);
  });

  it('pelo nome do ativo e pelo texto da ocorrência, nas duas direções', () => {
    expect(ordenar({ coluna: 'ativo', direcao: 'crescente' })).toEqual([
      'coleta',
      'backup',
      'garantia',
      'toner',
    ]);
    expect(ordenar({ coluna: 'ativo', direcao: 'decrescente' })).toEqual([
      'toner',
      'garantia',
      'backup',
      'coleta',
    ]);
    expect(ordenar({ coluna: 'ocorrencia', direcao: 'crescente' })).toEqual([
      'backup',
      'coleta',
      'garantia',
      'toner',
    ]);
    expect(ordenar({ coluna: 'ocorrencia', direcao: 'decrescente' })).toEqual([
      'toner',
      'garantia',
      'coleta',
      'backup',
    ]);
  });

  it('no empate de uma coluna, desempata pela ordem de fábrica, em qualquer direção', () => {
    const papel = ocorrencia('papel', 'critico', 5, 'HP LaserJet M404dn', 'Sem papel na bandeja 2');
    const lista = [toner, papel, garantia];
    expect(ordenar({ coluna: 'ativo', direcao: 'crescente' }, lista)).toEqual([
      'garantia',
      'papel',
      'toner',
    ]);
    expect(ordenar({ coluna: 'ativo', direcao: 'decrescente' }, lista)).toEqual([
      'papel',
      'toner',
      'garantia',
    ]);
    const mesmaHora = { ...papel, id: 'mesma-hora', severidade: 'info' as const };
    expect(ordenar({ coluna: 'ha', direcao: 'crescente' }, [mesmaHora, papel])).toEqual([
      'papel',
      'mesma-hora',
    ]);
  });

  it('devolve uma lista nova, sem mexer na recebida', () => {
    const recebida = [...LISTA];
    ordenarOcorrencias(recebida, { coluna: 'ativo', direcao: 'crescente' });
    expect(recebida).toEqual(LISTA);
  });
});

describe('idadeRelativa', () => {
  const idade = (milissegundos: number) =>
    idadeRelativa(new Date(agora.getTime() - milissegundos), agora);

  it('abaixo de um minuto, diz "agora", também para um momento no futuro', () => {
    expect(idade(0)).toBe('agora');
    expect(idade(59_999)).toBe('agora');
    expect(idade(-5 * MINUTO)).toBe('agora');
  });

  it('conta minutos, horas e dias, sempre arredondando para baixo', () => {
    expect(idade(MINUTO)).toBe('1 min');
    expect(idade(32 * MINUTO)).toBe('32 min');
    expect(idade(60 * MINUTO - 1)).toBe('59 min');
    expect(idade(60 * MINUTO)).toBe('1 h');
    expect(idade(90 * MINUTO)).toBe('1 h');
    expect(idade(120 * MINUTO)).toBe('2 h');
    expect(idade(24 * 60 * MINUTO - 1)).toBe('23 h');
    expect(idade(24 * 60 * MINUTO)).toBe('1 d');
    expect(idade((2 * 24 + 23) * 60 * MINUTO)).toBe('2 d');
  });
});

// O tempo nas tabelas (spec componentes-base, "Situação, tempo e contagem nas tabelas"; change
// tabelas-consistentes, design, decisão 3).
describe('haQuantoTempo', () => {
  it('último contato do coletor: a mesma escrita em toda tabela', () => {
    expect(haQuantoTempo(haMinutos(0.5), agora)).toBe('Agora');
    expect(haQuantoTempo(haMinutos(32), agora)).toBe('Há 32 min');
    expect(haQuantoTempo(haMinutos(3 * 60), agora)).toBe('Há 3 h');
    expect(haQuantoTempo(haMinutos(2 * 24 * 60), agora)).toBe('Há 2 d');
  });
});
