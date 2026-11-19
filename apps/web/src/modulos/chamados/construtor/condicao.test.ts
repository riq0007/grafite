// A condição de um campo no construtor (change chamados-da-ti, design, "A condição (tarefa 5.23)";
// m10): os campos que ela pode usar, a parte nova, a troca do campo, a parte tirada, o que cada
// resposta faz, a marca na prévia e os avisos.
import type { CampoDoFormulario, ClausulaDaCondicao, TipoDeCampoDoChamado } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  avisoDaCondicao,
  camposDaCondicao,
  chaveDoValor,
  efeitoDasRespostas,
  marcaDaCondicao,
  novaClausula,
  palavraDaClausula,
  tirarClausula,
  trocarCampoDaClausula,
  trocarValorDaClausula,
  valoresDaClausula,
} from './condicao.ts';

const campo = (
  id: string,
  rotulo: string,
  tipo: TipoDeCampoDoChamado = 'texto-curto',
  outros: Partial<CampoDoFormulario> = {},
): CampoDoFormulario => ({
  id,
  tipo,
  rotulo,
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: false,
  apagarSeSumir: true,
  opcoes: [],
  tiposDeAtivo: [],
  condicao: [],
  ...outros,
});

/** As opções com o id tirado do texto, sem acento: "Não imprime" é `nao-imprime`. */
const opcoes = (...textos: string[]) =>
  textos.map((texto) => ({
    id: texto
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-'),
    texto,
  }));

const PROBLEMA = campo('problema', 'O que está acontecendo?', 'escolha-unica', {
  obrigatorio: true,
  opcoes: opcoes('Manchando', 'Não puxa o papel', 'Atolando', 'Não imprime'),
});
const ONDE = campo('onde', 'Onde as manchas aparecem?', 'escolha-unica', {
  opcoes: opcoes('Na borda', 'No meio'),
  condicao: [{ campoId: 'problema', juncao: null, opcaoId: 'manchando' }],
});
const SINTOMAS = campo('sintomas', 'O que mais você notou?', 'varias-opcoes', {
  opcoes: opcoes('Barulho', 'Cheiro', 'Fumaça'),
});
const CONTRATO = campo('contrato', 'Contrato de manutenção', 'sim-ou-nao', { soDaTi: true });

/** A Impressora, com as Várias opções e o Sim ou não para as condições dos testes. */
const CAMPOS: CampoDoFormulario[] = [
  campo('impressora', 'Qual impressora?', 'ativo', { obrigatorio: true }),
  PROBLEMA,
  ONDE,
  SINTOMAS,
  campo('foto', 'Uma foto ajuda', 'anexo'),
  CONTRATO,
  campo('contador', 'Contador de páginas', 'numero', { soDaTi: true }),
  campo('pecas', 'Peças trocadas', 'texto-longo', { soDaTi: true }),
];

const ids = (campos: readonly CampoDoFormulario[]) => campos.map(({ id }) => id);
const porId = (id: string) => CAMPOS.find((cada) => cada.id === id) as CampoDoFormulario;
/** O campo com a condição trocada, no lugar dele. */
const comCondicao = (id: string, condicao: ClausulaDaCondicao[]) => {
  const campos = CAMPOS.map((cada) => (cada.id === id ? { ...cada, condicao } : cada));
  return { campo: campos.find((cada) => cada.id === id) as CampoDoFormulario, campos };
};

describe('os campos que a condição pode usar', () => {
  it('são os anteriores de Escolha única, Várias opções ou Sim ou não', () => {
    expect(ids(camposDaCondicao(porId('onde'), CAMPOS))).toEqual(['problema']);
    expect(ids(camposDaCondicao(porId('foto'), CAMPOS))).toEqual(['problema', 'onde', 'sintomas']);
    expect(ids(camposDaCondicao(porId('impressora'), CAMPOS))).toEqual([]);
  });

  it('no campo que a pessoa vê, só os que ela também vê', () => {
    const fim = campo('fim', 'Algo mais?', 'texto-longo');
    expect(ids(camposDaCondicao(fim, [...CAMPOS, fim]))).toEqual(['problema', 'onde', 'sintomas']);
    expect(ids(camposDaCondicao(porId('pecas'), CAMPOS))).toEqual([
      'problema',
      'onde',
      'sintomas',
      'contrato',
    ]);
  });
});

describe('a parte da condição', () => {
  it('diz "for", e "tiver" nas Várias opções', () => {
    expect(palavraDaClausula(PROBLEMA)).toBe('for');
    expect(palavraDaClausula(CONTRATO)).toBe('for');
    expect(palavraDaClausula(SINTOMAS)).toBe('tiver');
  });

  it('escolhe entre as opções do campo, ou entre o Sim e o Não', () => {
    expect(
      valoresDaClausula({ ...SINTOMAS, opcoes: [...SINTOMAS.opcoes, { id: 'x', texto: '' }] }),
    ).toEqual([
      { id: 'barulho', rotulo: 'Barulho' },
      { id: 'cheiro', rotulo: 'Cheiro' },
      { id: 'fumaca', rotulo: 'Fumaça' },
      { id: 'x', rotulo: 'Opção 4' },
    ]);
    expect(valoresDaClausula(CONTRATO)).toEqual([
      { id: 'sim', rotulo: 'Sim' },
      { id: 'nao', rotulo: 'Não' },
    ]);
  });

  it('guarda a opção ou o sim ou não pela chave do seletor', () => {
    const doProblema: ClausulaDaCondicao = {
      campoId: 'problema',
      juncao: null,
      opcaoId: 'manchando',
    };
    expect(chaveDoValor(doProblema)).toBe('manchando');
    expect(trocarValorDaClausula(doProblema, 'atolando')).toEqual({
      campoId: 'problema',
      juncao: null,
      opcaoId: 'atolando',
    });
    const doContrato: ClausulaDaCondicao = { campoId: 'contrato', juncao: 'e', valor: true };
    expect(chaveDoValor(doContrato)).toBe('sim');
    expect(trocarValorDaClausula(doContrato, 'nao')).toEqual({
      campoId: 'contrato',
      juncao: 'e',
      valor: false,
    });
  });

  it('trocar o campo põe o primeiro valor dele e guarda a junção', () => {
    const parte: ClausulaDaCondicao = { campoId: 'problema', juncao: 'ou', opcaoId: 'atolando' };
    expect(trocarCampoDaClausula(parte, SINTOMAS)).toEqual({
      campoId: 'sintomas',
      juncao: 'ou',
      opcaoId: 'barulho',
    });
    expect(trocarCampoDaClausula(parte, CONTRATO)).toEqual({
      campoId: 'contrato',
      juncao: 'ou',
      valor: true,
    });
  });
});

describe('a parte nova', () => {
  it('a primeira usa o campo que serve mais perto, acima', () => {
    expect(novaClausula(porId('foto'), CAMPOS, null)).toEqual({
      campoId: 'sintomas',
      juncao: null,
      opcaoId: 'barulho',
    });
    expect(novaClausula({ ...ONDE, condicao: [] }, CAMPOS, null)).toEqual({
      campoId: 'problema',
      juncao: null,
      opcaoId: 'manchando',
    });
  });

  it('o "ou quando…" usa o campo da parte anterior, com o valor que ela não usa', () => {
    expect(novaClausula(ONDE, CAMPOS, 'ou')).toEqual({
      campoId: 'problema',
      juncao: 'ou',
      opcaoId: 'nao-puxa-o-papel',
    });
  });

  it('o "e quando…" usa um campo que a condição ainda não usa', () => {
    const { campo: foto, campos } = comCondicao('foto', [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
    ]);
    expect(novaClausula(foto, campos, 'e')).toEqual({
      campoId: 'sintomas',
      juncao: 'e',
      opcaoId: 'barulho',
    });
    // Sem outro campo, o da parte anterior.
    expect(novaClausula(ONDE, CAMPOS, 'e')).toEqual({
      campoId: 'problema',
      juncao: 'e',
      opcaoId: 'nao-puxa-o-papel',
    });
  });

  it('no Sim ou não, o Sim e depois o Não', () => {
    const { campo: pecas, campos } = comCondicao('pecas', [
      { campoId: 'contrato', juncao: null, valor: true },
    ]);
    expect(novaClausula(pecas, campos, 'ou')).toEqual({
      campoId: 'contrato',
      juncao: 'ou',
      valor: false,
    });
  });

  it('não há com 5 partes, nem sem campo que sirva', () => {
    const cinco: ClausulaDaCondicao[] = [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
      { campoId: 'problema', juncao: 'ou', opcaoId: 'atolando' },
      { campoId: 'problema', juncao: 'ou', opcaoId: 'nao-imprime' },
      { campoId: 'sintomas', juncao: 'e', opcaoId: 'barulho' },
      { campoId: 'sintomas', juncao: 'ou', opcaoId: 'cheiro' },
    ];
    const { campo: foto, campos } = comCondicao('foto', cinco);
    expect(novaClausula(foto, campos, 'ou')).toBeNull();
    expect(novaClausula(porId('impressora'), CAMPOS, null)).toBeNull();
  });
});

describe('a parte tirada', () => {
  const tres: ClausulaDaCondicao[] = [
    { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
    { campoId: 'problema', juncao: 'ou', opcaoId: 'atolando' },
    { campoId: 'sintomas', juncao: 'e', opcaoId: 'barulho' },
  ];

  it('a do meio sai, e as outras ficam como estão', () => {
    expect(tirarClausula(tres, 1)).toEqual([tres[0], tres[2]]);
  });

  it('sem a primeira, a seguinte começa a frase, sem junção', () => {
    expect(tirarClausula(tres, 0)).toEqual([
      { campoId: 'problema', juncao: null, opcaoId: 'atolando' },
      tres[2],
    ]);
  });
});

describe('o que cada resposta faz', () => {
  it('com uma parte, a opção dela mostra o campo, e as outras o escondem', () => {
    expect(efeitoDasRespostas(ONDE, CAMPOS)).toEqual([
      {
        campo: PROBLEMA,
        linhas: [
          { chave: 'manchando', rotulo: 'Manchando', efeito: 'aparece' },
          { chave: 'nao-puxa-o-papel', rotulo: 'Não puxa o papel', efeito: 'some' },
          { chave: 'atolando', rotulo: 'Atolando', efeito: 'some' },
          { chave: 'nao-imprime', rotulo: 'Não imprime', efeito: 'some' },
        ],
      },
    ]);
  });

  it('com "ou" no mesmo campo, as duas opções mostram o campo', () => {
    const { campo: onde, campos } = comCondicao('onde', [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
      { campoId: 'problema', juncao: 'ou', opcaoId: 'atolando' },
    ]);
    const efeitos = efeitoDasRespostas(onde, campos)[0]?.linhas.map(({ efeito }) => efeito);
    expect(efeitos).toEqual(['aparece', 'some', 'aparece', 'some']);
  });

  it('com dois campos, a resposta pode depender da outra', () => {
    const comE = comCondicao('pecas', [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
      { campoId: 'contrato', juncao: 'e', valor: true },
    ]);
    expect(
      efeitoDasRespostas(comE.campo, comE.campos).map(({ campo: base, linhas }) => [
        base.id,
        linhas.map(({ chave, efeito }) => `${chave}: ${efeito}`),
      ]),
    ).toEqual([
      [
        'problema',
        ['manchando: depende', 'nao-puxa-o-papel: some', 'atolando: some', 'nao-imprime: some'],
      ],
      ['contrato', ['sim: depende', 'nao: some']],
    ]);
    const comOu = comCondicao('pecas', [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
      { campoId: 'contrato', juncao: 'ou', valor: true },
    ]);
    expect(
      efeitoDasRespostas(comOu.campo, comOu.campos).map(({ linhas }) =>
        linhas.map(({ efeito }) => efeito),
      ),
    ).toEqual([
      ['aparece', 'depende', 'depende', 'depende'],
      ['aparece', 'depende'],
    ]);
  });

  it('nas Várias opções, a opção marcada sozinha; a citada junto com outra depende dela', () => {
    const tiver = comCondicao('foto', [{ campoId: 'sintomas', juncao: null, opcaoId: 'barulho' }]);
    expect(efeitoDasRespostas(tiver.campo, tiver.campos)[0]?.linhas.map((l) => l.efeito)).toEqual([
      'aparece',
      'some',
      'some',
    ]);
    const asDuas = comCondicao('foto', [
      { campoId: 'sintomas', juncao: null, opcaoId: 'barulho' },
      { campoId: 'sintomas', juncao: 'e', opcaoId: 'cheiro' },
    ]);
    expect(efeitoDasRespostas(asDuas.campo, asDuas.campos)[0]?.linhas.map((l) => l.efeito)).toEqual(
      ['depende', 'depende', 'some'],
    );
  });

  it('o campo da condição que tem a dele só vale quando aparece, como no formulário', () => {
    // "Na borda" só se responde com "Manchando": o "e" com o "Manchando" não muda nada nela.
    const encadeada = comCondicao('foto', [
      { campoId: 'onde', juncao: null, opcaoId: 'na-borda' },
      { campoId: 'problema', juncao: 'e', opcaoId: 'manchando' },
    ]);
    expect(
      efeitoDasRespostas(encadeada.campo, encadeada.campos).map(({ campo: base, linhas }) => [
        base.id,
        linhas.map(({ chave, efeito }) => `${chave}: ${efeito}`),
      ]),
    ).toEqual([
      ['onde', ['na-borda: aparece', 'no-meio: some']],
      [
        'problema',
        ['manchando: depende', 'nao-puxa-o-papel: some', 'atolando: some', 'nao-imprime: some'],
      ],
    ]);
    // Só pelo "Onde": a cadeia não muda o que cada resposta dele faz.
    const soPeloOnde = comCondicao('foto', [
      { campoId: 'onde', juncao: null, opcaoId: 'na-borda' },
    ]);
    expect(
      efeitoDasRespostas(soPeloOnde.campo, soPeloOnde.campos)[0]?.linhas.map((l) => l.efeito),
    ).toEqual(['aparece', 'some']);
  });

  it('sem condição, nenhuma tabela', () => {
    expect(efeitoDasRespostas(porId('foto'), CAMPOS)).toEqual([]);
  });
});

describe('a marca na prévia', () => {
  it('diz a opção, e a junção entre as partes do mesmo campo', () => {
    expect(marcaDaCondicao(ONDE, CAMPOS)).toBe('aparece só quando for Manchando');
    const ou = comCondicao('onde', [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
      { campoId: 'problema', juncao: 'ou', opcaoId: 'atolando' },
    ]);
    expect(marcaDaCondicao(ou.campo, ou.campos)).toBe(
      'aparece só quando for Manchando ou for Atolando',
    );
    const tiver = comCondicao('foto', [{ campoId: 'sintomas', juncao: null, opcaoId: 'barulho' }]);
    expect(marcaDaCondicao(tiver.campo, tiver.campos)).toBe('aparece só quando tiver Barulho');
  });

  it('com mais de um campo, cada parte diz o campo', () => {
    const { campo: pecas, campos } = comCondicao('pecas', [
      { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
      { campoId: 'contrato', juncao: 'e', valor: true },
    ]);
    expect(marcaDaCondicao(pecas, campos)).toBe(
      'aparece só quando “O que está acontecendo?” for Manchando e “Contrato de manutenção” for Sim',
    );
  });

  it('sem condição, nenhuma', () => {
    expect(marcaDaCondicao(porId('foto'), CAMPOS)).toBeNull();
  });
});

describe('os avisos da condição', () => {
  it('sem campo anterior que sirva, diz por quê', () => {
    expect(avisoDaCondicao(porId('impressora'), CAMPOS)).toBe(
      'Nenhum campo antes deste serve à condição: ela usa um campo de Escolha única, Várias opções ou Sim ou não que a pessoa também vê.',
    );
    const daTi = campo('nota', 'Nota da TI', 'texto-longo', { soDaTi: true });
    expect(avisoDaCondicao(daTi, [daTi, ...CAMPOS])).toBe(
      'Nenhum campo antes deste serve à condição: ela usa um campo de Escolha única, Várias opções ou Sim ou não.',
    );
  });

  it('com 5 partes, o limite', () => {
    const cinco = Array.from({ length: 5 }, (_, indice) => ({
      campoId: 'problema',
      juncao: indice === 0 ? null : ('ou' as const),
      opcaoId: 'manchando',
    }));
    const { campo: foto, campos } = comCondicao('foto', cinco);
    expect(avisoDaCondicao(foto, campos)).toBe('A condição tem no máximo 5 partes.');
  });

  it('fora disso, nenhum', () => {
    expect(avisoDaCondicao(ONDE, CAMPOS)).toBeNull();
    expect(avisoDaCondicao(porId('foto'), CAMPOS)).toBeNull();
  });
});
