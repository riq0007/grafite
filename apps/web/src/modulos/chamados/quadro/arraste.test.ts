// O arrastar para passar (spec modulo-chamados, "Arrastar para passar"; change chamados-da-ti,
// design, decisão 22, "O arraste"): quem recebe o quadrado, com a frase de soltar ou o motivo da
// recusa, e o aviso no lugar de origem.
import {
  type GrupoDoPrazo,
  type LocalDaArvore,
  montarArvore,
  type SituacaoDoPrazo,
} from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  BRUNO,
  CHAMADOS_DOS_MOCKUPS,
  coluna,
  QUADRO_DOS_MOCKUPS,
  RENATO,
} from '../../../teste/chamados.ts';
import type { ColunaDoQuadro } from '../consultas.ts';
import { avisoDaOrigem, type ChamadoArrastado, chamadoArrastado, naColuna } from './arraste.ts';

const [colunaDaAna, colunaDoBruno, , colunaDoRenato] = QUADRO_DOS_MOCKUPS.colunas;

/**
 * O chamado dos mockups no ar, a partir da coluna em que o quadro o pôs, ou da coluna dada; na
 * triagem, sem coluna.
 */
function noAr(numero: number, daColuna?: ColunaDoQuadro): ChamadoArrastado {
  const chamado = CHAMADOS_DOS_MOCKUPS.find((candidato) => candidato.numero === numero);
  if (!chamado) throw new Error(`O #${numero} não está nos mockups.`);
  const doQuadro = QUADRO_DOS_MOCKUPS.colunas.find(({ abertos }) => abertos.includes(numero));
  return chamadoArrastado(chamado, daColuna ?? doQuadro ?? null);
}

// Jundiaí › Expedição › Doca e São Paulo › Diretoria.
const local = (id: string, paiId: string | null, nome: string): LocalDaArvore => ({
  id,
  paiId,
  nome,
  tipo: 'unidade',
  situacao: 'ativo',
});
const JUNDIAI = '0199a6e0-0000-7000-8000-0000000000e1';
const EXPEDICAO = '0199a6e0-0000-7000-8000-0000000000e2';
const DOCA = '0199a6e0-0000-7000-8000-0000000000e3';
const SAO_PAULO = '0199a6e0-0000-7000-8000-0000000000e4';
const DIRETORIA = '0199a6e0-0000-7000-8000-0000000000e5';
const ARVORE = montarArvore([
  local(JUNDIAI, null, 'Jundiaí'),
  local(EXPEDICAO, JUNDIAI, 'Expedição'),
  local(DOCA, EXPEDICAO, 'Doca'),
  local(SAO_PAULO, null, 'São Paulo'),
  local(DIRETORIA, SAO_PAULO, 'Diretoria'),
]);

/** Renato, que atende só os chamados de Jundiaí. */
const SO_JUNDIAI = coluna(RENATO, [1033, 1037], null, {
  atende: { organizacao: false, locais: [JUNDIAI] },
});

describe('naColuna', () => {
  it('a coluna de quem atende recebe, e o prazo continua contando', () => {
    expect(naColuna(noAr(1038), colunaDoRenato ?? null)).toEqual({
      recebe: true,
      frase: 'Soltar para passar a Renato · o prazo continua contando',
    });
  });

  it('no chamado aguardando, o relógio continua parado', () => {
    expect(naColuna(noAr(1041), colunaDoBruno ?? null)).toEqual({
      recebe: true,
      frase: 'Soltar para passar a Bruno · o relógio continua parado',
    });
  });

  it('a coluna de origem não recebe, e não diz nada', () => {
    expect(naColuna(noAr(1038), null)).toEqual({ recebe: false, motivo: null });
    expect(naColuna(noAr(1033), colunaDoRenato ?? null)).toEqual({ recebe: false, motivo: null });
  });

  it('a triagem recebe o chamado em atendimento e recusa o aguardando', () => {
    expect(naColuna(noAr(1033), null)).toEqual({
      recebe: true,
      frase: 'Soltar para devolver à triagem · o prazo continua contando',
    });
    expect(naColuna(noAr(1041), null)).toEqual({
      recebe: false,
      motivo: 'O #1041 está aguardando Fernanda',
    });
  });

  it('a coluna de quem não atende mais os chamados não recebe', () => {
    const naoAtendeMais = coluna(BRUNO, [1032], null, { naoAtendeMais: true });
    expect(naColuna(noAr(1038), naoAtendeMais)).toEqual({
      recebe: false,
      motivo: 'Bruno não atende mais os chamados',
    });
  });

  it('a outra coluna de quem já está com o chamado não recebe', () => {
    // O #1033 na coluna de Renato que não atende mais; a coluna de Renato que atende recusa.
    const naoAtendeMais = coluna(RENATO, [1033], null, { naoAtendeMais: true });
    const doRenato = noAr(1033, naoAtendeMais);
    expect(naColuna(doRenato, naoAtendeMais)).toEqual({ recebe: false, motivo: null });
    expect(naColuna(doRenato, coluna(RENATO, [1037], null))).toEqual({
      recebe: false,
      motivo: 'O #1033 já está com Renato',
    });
  });

  it('quem atende uns locais recebe o chamado que fica todo nos ramos deles', () => {
    const naDoca = { ...noAr(1038), locais: [DOCA], semLocal: false };
    expect(naColuna(naDoca, SO_JUNDIAI, ARVORE)).toEqual({
      recebe: true,
      frase: 'Soltar para passar a Renato · o prazo continua contando',
    });
  });

  it('o motivo leva o caminho do primeiro local fora do alcance', () => {
    const emDois = { ...noAr(1038), locais: [DOCA, DIRETORIA], semLocal: false };
    expect(naColuna(emDois, SO_JUNDIAI, ARVORE)).toEqual({
      recebe: false,
      motivo: 'Renato não atende São Paulo › Diretoria',
    });
  });

  it('o chamado sem local, só quem atende a organização inteira recebe', () => {
    // Os chamados dos mockups não têm local.
    expect(naColuna(noAr(1038), SO_JUNDIAI, ARVORE)).toEqual({
      recebe: false,
      motivo: 'Renato não atende os chamados sem local',
    });
    // O de um ativo sem local, com os outros dentro do alcance.
    const umSemLocal = { ...noAr(1038), locais: [DOCA], semLocal: true };
    expect(naColuna(umSemLocal, SO_JUNDIAI, ARVORE)).toEqual({
      recebe: false,
      motivo: 'Renato não atende os chamados sem local',
    });
    expect(naColuna(noAr(1038), colunaDaAna ?? null, ARVORE)).toMatchObject({ recebe: true });
  });

  it('sem a árvore ainda, só o chamado sem local fica de fora, e a API confere o resto', () => {
    const naDiretoria = { ...noAr(1038), locais: [DIRETORIA], semLocal: false };
    expect(naColuna(naDiretoria, SO_JUNDIAI)).toMatchObject({ recebe: true });
    expect(naColuna(noAr(1038), SO_JUNDIAI)).toEqual({
      recebe: false,
      motivo: 'Renato não atende os chamados sem local',
    });
  });

  it('o local que a árvore não conhece não vira um caminho vazio', () => {
    const outro = {
      ...noAr(1038),
      locais: ['0199a6e0-0000-7000-8000-0000000000ef'],
      semLocal: false,
    };
    expect(naColuna(outro, SO_JUNDIAI, ARVORE)).toEqual({
      recebe: false,
      motivo: 'Renato não atende os locais do chamado',
    });
  });

  it('a conta da sessão entra como as outras', () => {
    expect(naColuna(noAr(1038), colunaDaAna ?? null)).toEqual({
      recebe: true,
      frase: 'Soltar para passar a Ana · o prazo continua contando',
    });
  });
});

/** A situação do prazo, só com o grupo e o texto que o aviso lê. */
const comTexto = (grupo: GrupoDoPrazo, texto: string): SituacaoDoPrazo => ({
  contadoS: 0,
  prazoS: 0,
  restaS: 0,
  vencimento: null,
  grupo,
  texto,
  primeiraResposta: null,
});

describe('avisoDaOrigem', () => {
  it('diz o número e o prazo, como no m02', () => {
    expect(avisoDaOrigem(1038, comTexto('ate-2-horas', 'vence em 2 h'))).toBe(
      'O #1038 está sendo movido. O prazo dele vence em 2 h.',
    );
    expect(avisoDaOrigem(1039, comTexto('depois-de-hoje', 'vence em 3 dias'))).toBe(
      'O #1039 está sendo movido. O prazo dele vence em 3 dias.',
    );
  });

  it('o estourado, o parado e o ilegível', () => {
    expect(avisoDaOrigem(1033, comTexto('estourado', 'estourado há 20 min'))).toBe(
      'O #1033 está sendo movido. O prazo dele está estourado há 20 min.',
    );
    expect(avisoDaOrigem(1041, comTexto('parado', 'relógio parado'))).toBe(
      'O #1041 está sendo movido. O relógio dele está parado.',
    );
    expect(avisoDaOrigem(1040, null)).toBe(
      'O #1040 está sendo movido. O prazo dele está ilegível.',
    );
  });
});
