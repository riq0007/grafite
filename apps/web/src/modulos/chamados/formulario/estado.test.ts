// O estado do formulário que se preenche (spec modulo-chamados, "Formulário que se preenche";
// change chamados-da-ti, design, decisão 21): as respostas pelo `responder` do domínio e o nome do
// que elas citam, os campos que aparecem para cada um que preenche, o número como se digita e a
// resposta para ler.
import {
  type AtivoDasRespostas,
  type CampoDoFormulario,
  type Formulario,
  resumoDasRespostas,
  TIPOS_DE_CHAMADO_DE_FABRICA,
  tituloDasRespostas,
} from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  avisoSemOsAtivos,
  type CitadosDoFormulario,
  camposQueAparecem,
  contextoDoEstado,
  continuacoesDasPerguntas,
  descricaoDoCampo,
  ESTADO_VAZIO,
  lerNumero,
  numerosDasPerguntas,
  origemDasSugestoes,
  responderNoEstado,
  respostaDoCampo,
  textoDaResposta,
} from './estado.ts';

function formularioDe(nome: string): Formulario {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((deFabrica) => deFabrica.nome === nome);
  if (!tipo) throw new Error(`Sem o tipo de fábrica ${nome}.`);
  return tipo.formulario;
}

const IMPRESSORA = formularioDe('Impressora');

const campo = (
  id: string,
  tipo: CampoDoFormulario['tipo'],
  rotulo: string,
  parte: Partial<CampoDoFormulario> = {},
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
  ...parte,
});

const PAT_00139: AtivoDasRespostas = {
  patrimonio: 'PAT-00139',
  rotulo: 'Impressora Recepção 2º andar',
};

const CITADOS: CitadosDoFormulario = {
  ativos: new Map<string, AtivoDasRespostas>([
    ['a-139', PAT_00139],
    ['a-sem', { patrimonio: null, rotulo: 'Impressora do RH' }],
  ]),
  locais: new Map([['l-recepcao', 'Jundiaí › Recepção']]),
  pessoas: new Map([['p-marina', 'Marina Lopes']]),
  anexos: new Map(),
};

const ids = (aparecem: ReturnType<typeof camposQueAparecem>) =>
  aparecem.map(({ campo: { id }, editavel }) => [id, editavel]);

describe('responderNoEstado', () => {
  it('grava a resposta e guarda o nome do que ela cita, sem mudar o estado anterior', () => {
    const estado = responderNoEstado(IMPRESSORA, ESTADO_VAZIO, 'impressora', 'a-139', [
      { tipo: 'ativo', id: 'a-139', ativo: PAT_00139 },
    ]);
    expect(estado.respostas).toEqual({ impressora: 'a-139' });
    expect(estado.citados.ativos.get('a-139')).toEqual(PAT_00139);
    expect(ESTADO_VAZIO.respostas).toEqual({});
    expect(ESTADO_VAZIO.citados.ativos.size).toBe(0);
  });

  it('guarda o local, a pessoa e o anexo, cada um no seu lugar', () => {
    const formulario: Formulario = {
      titulo: { comecaPeloTipo: true, campoId: null },
      campos: [
        campo('onde', 'local', 'Onde você está?'),
        campo('quem', 'pessoa', 'Quem usa?'),
        campo('print', 'anexo', 'Um print ajuda'),
      ],
    };
    let estado = responderNoEstado(formulario, ESTADO_VAZIO, 'onde', 'l-recepcao', [
      { tipo: 'local', id: 'l-recepcao', caminho: 'Jundiaí › Recepção' },
    ]);
    estado = responderNoEstado(formulario, estado, 'quem', 'p-marina', [
      { tipo: 'pessoa', id: 'p-marina', nome: 'Marina Lopes' },
    ]);
    const anexo = { nome: 'erro-vpn.png', bytes: 48_213, onde: 'sem-dono' } as const;
    estado = responderNoEstado(
      formulario,
      estado,
      'print',
      ['f-1'],
      [{ tipo: 'anexo', id: 'f-1', anexo }],
    );
    expect(estado.respostas).toEqual({ onde: 'l-recepcao', quem: 'p-marina', print: ['f-1'] });
    expect(estado.citados.locais.get('l-recepcao')).toBe('Jundiaí › Recepção');
    expect(estado.citados.pessoas.get('p-marina')).toBe('Marina Lopes');
    expect(estado.citados.anexos.get('f-1')).toEqual(anexo);
    expect(estado.citados.ativos.size).toBe(0);
  });

  it('o campo que some pela condição perde a resposta com o "Apagar a resposta se o campo sumir"', () => {
    let estado = responderNoEstado(IMPRESSORA, ESTADO_VAZIO, 'problema', 'manchando');
    estado = responderNoEstado(IMPRESSORA, estado, 'manchas', 'borda');
    expect(estado.respostas).toEqual({ problema: 'manchando', manchas: 'borda' });
    estado = responderNoEstado(IMPRESSORA, estado, 'problema', 'atolando');
    expect(estado.respostas).toEqual({ problema: 'atolando' });
  });

  it('desligado, o campo que some guarda a resposta para quando voltar', () => {
    const guarda: Formulario = {
      ...IMPRESSORA,
      campos: IMPRESSORA.campos.map((deFabrica) =>
        deFabrica.id === 'manchas' ? { ...deFabrica, apagarSeSumir: false } : deFabrica,
      ),
    };
    let estado = responderNoEstado(guarda, ESTADO_VAZIO, 'problema', 'manchando');
    estado = responderNoEstado(guarda, estado, 'manchas', 'borda');
    estado = responderNoEstado(guarda, estado, 'problema', 'atolando');
    expect(estado.respostas).toEqual({ problema: 'atolando', manchas: 'borda' });
  });

  it('a resposta vazia ou nula tira a chave', () => {
    const estado = responderNoEstado(IMPRESSORA, ESTADO_VAZIO, 'problema', 'manchando');
    expect(responderNoEstado(IMPRESSORA, estado, 'problema', null).respostas).toEqual({});
    const comFoto = responderNoEstado(IMPRESSORA, ESTADO_VAZIO, 'foto', ['f-1']);
    expect(responderNoEstado(IMPRESSORA, comFoto, 'foto', []).respostas).toEqual({});
  });
});

describe('respostaDoCampo', () => {
  it('lê só a resposta do próprio campo, também com o id que é um nome do JavaScript', () => {
    expect(respostaDoCampo({ problema: 'manchando' }, 'problema')).toBe('manchando');
    expect(respostaDoCampo({}, 'constructor')).toBeUndefined();
    expect(respostaDoCampo({}, '__proto__')).toBeUndefined();
    expect(respostaDoCampo({}, 'toString')).toBeUndefined();
  });
});

describe('contextoDoEstado', () => {
  it('monta o título e o resumo com o nome do tipo e os citados, sem pedir à API', () => {
    let estado = responderNoEstado(IMPRESSORA, ESTADO_VAZIO, 'impressora', 'a-139', [
      { tipo: 'ativo', id: 'a-139', ativo: PAT_00139 },
    ]);
    estado = responderNoEstado(IMPRESSORA, estado, 'problema', 'manchando');
    estado = responderNoEstado(IMPRESSORA, estado, 'manchas', 'borda');
    const contexto = contextoDoEstado(estado, 'Impressora');
    expect(tituloDasRespostas(IMPRESSORA, estado.respostas, contexto)).toBe('Impressora manchando');
    expect(resumoDasRespostas(IMPRESSORA, estado.respostas, contexto)).toBe(
      'Problema: Manchando, na borda · Ativo: PAT-00139',
    );
  });
});

describe('camposQueAparecem', () => {
  const MANCHANDO = { problema: 'manchando' };

  it('na abertura, todos os que a condição mostra, também os só da TI, para preencher', () => {
    expect(ids(camposQueAparecem(IMPRESSORA, {}, 'abertura'))).toEqual([
      ['impressora', true],
      ['problema', true],
      ['foto', true],
      ['contador-de-paginas', true],
      ['contrato-de-manutencao', true],
    ]);
    expect(
      camposQueAparecem(IMPRESSORA, MANCHANDO, 'abertura').map(({ campo: { id } }) => id),
    ).toEqual([
      'impressora',
      'problema',
      'manchas',
      'foto',
      'contador-de-paginas',
      'contrato-de-manutencao',
    ]);
  });

  it('para a pessoa, na prévia, sem os só da TI', () => {
    expect(ids(camposQueAparecem(IMPRESSORA, MANCHANDO, 'pessoa'))).toEqual([
      ['impressora', true],
      ['problema', true],
      ['manchas', true],
      ['foto', true],
    ]);
  });

  it('no chamado, as respostas da pessoa só para ler, e os só da TI para preencher', () => {
    expect(ids(camposQueAparecem(IMPRESSORA, MANCHANDO, 'chamado'))).toEqual([
      ['impressora', false],
      ['problema', false],
      ['manchas', false],
      ['foto', false],
      ['contador-de-paginas', true],
      ['contrato-de-manutencao', true],
    ]);
  });

  it('só para ler, nenhum muda', () => {
    for (const quem of ['abertura', 'chamado', 'pessoa'] as const) {
      expect(
        camposQueAparecem(IMPRESSORA, MANCHANDO, quem, true).every(({ editavel }) => !editavel),
      ).toBe(true);
    }
    expect(camposQueAparecem(IMPRESSORA, MANCHANDO, 'chamado', true)).toHaveLength(6);
  });
});

describe('numerosDasPerguntas', () => {
  it('numera as que aparecem, na ordem, e o campo com condição fica sem número', () => {
    expect(
      numerosDasPerguntas(camposQueAparecem(IMPRESSORA, { problema: 'manchando' }, 'pessoa')),
    ).toEqual([1, 2, null, 3]);
  });

  it('o campo da condição que some não muda a numeração', () => {
    expect(numerosDasPerguntas(camposQueAparecem(IMPRESSORA, {}, 'pessoa'))).toEqual([1, 2, 3]);
  });

  it('o campo com condição no fim, ou dois seguidos, também ficam sem número', () => {
    const formulario: Formulario = {
      titulo: { comecaPeloTipo: true, campoId: null },
      campos: [
        campo('a', 'sim-ou-nao', 'A?'),
        campo('b', 'texto-curto', 'B?', {
          condicao: [{ campoId: 'a', juncao: null, valor: true }],
        }),
        campo('c', 'texto-curto', 'C?', {
          condicao: [{ campoId: 'a', juncao: null, valor: true }],
        }),
        campo('d', 'sim-ou-nao', 'D?'),
        campo('e', 'texto-curto', 'E?', {
          condicao: [{ campoId: 'd', juncao: null, valor: false }],
        }),
      ],
    };
    const aparecem = formulario.campos.map((deles) => ({ campo: deles, editavel: true }));
    expect(numerosDasPerguntas(aparecem)).toEqual([1, null, null, 2, null]);
  });

  it('sem campos, nenhum número', () => {
    expect(numerosDasPerguntas([])).toEqual([]);
  });
});

describe('continuacoesDasPerguntas', () => {
  const aparecem = (...campos: CampoDoFormulario[]) =>
    campos.map((deles) => ({ campo: deles, editavel: true }));
  const quando = (campoId: string) => [{ campoId, juncao: null, valor: true }];

  it('o campo da condição que vem logo depois da base se cola a ela, como no m05', () => {
    expect(
      continuacoesDasPerguntas(camposQueAparecem(IMPRESSORA, { problema: 'manchando' }, 'pessoa')),
    ).toEqual([false, false, true, false]);
  });

  it('com a base mais acima, o campo não se cola à pergunta de cima', () => {
    expect(
      continuacoesDasPerguntas(
        aparecem(
          campo('a', 'sim-ou-nao', 'A?'),
          campo('b', 'texto-curto', 'B?'),
          campo('c', 'texto-curto', 'C?', { condicao: quando('a') }),
        ),
      ),
    ).toEqual([false, false, false]);
  });

  it('as continuações da mesma pergunta, em cadeia ou lado a lado, ficam coladas', () => {
    expect(
      continuacoesDasPerguntas(
        aparecem(
          campo('a', 'sim-ou-nao', 'A?'),
          campo('b', 'sim-ou-nao', 'B?', { condicao: quando('a') }),
          campo('c', 'texto-curto', 'C?', { condicao: quando('a') }),
          campo('d', 'texto-curto', 'D?', { condicao: quando('b') }),
          campo('e', 'sim-ou-nao', 'E?'),
          campo('f', 'texto-curto', 'F?', { condicao: quando('e') }),
        ),
      ),
    ).toEqual([false, true, true, true, false, true]);
  });

  it('o campo que não se cola começa a própria continuação', () => {
    // O c depende do a, longe dele; o d depende do c, logo depois.
    expect(
      continuacoesDasPerguntas(
        aparecem(
          campo('a', 'sim-ou-nao', 'A?'),
          campo('b', 'texto-curto', 'B?'),
          campo('c', 'sim-ou-nao', 'C?', { condicao: quando('a') }),
          campo('d', 'texto-curto', 'D?', { condicao: quando('c') }),
        ),
      ),
    ).toEqual([false, false, false, true]);
  });

  it('na condição com "ou quando", basta uma das bases logo acima', () => {
    expect(
      continuacoesDasPerguntas(
        aparecem(
          campo('a', 'sim-ou-nao', 'A?'),
          campo('b', 'sim-ou-nao', 'B?'),
          campo('c', 'texto-curto', 'C?', {
            condicao: [
              { campoId: 'a', juncao: null, valor: true },
              { campoId: 'b', juncao: 'ou', valor: true },
            ],
          }),
        ),
      ),
    ).toEqual([false, false, true]);
  });

  it('o primeiro campo, mesmo com condição, não se cola a nada', () => {
    expect(
      continuacoesDasPerguntas(
        aparecem(
          campo('b', 'texto-curto', 'B?', { condicao: quando('a') }),
          campo('c', 'texto-curto', 'C?'),
        ),
      ),
    ).toEqual([false, false]);
  });

  it('sem campos, nenhuma', () => {
    expect(continuacoesDasPerguntas([])).toEqual([]);
  });
});

describe('descricaoDoCampo', () => {
  it('explica o campo só da TI, que é opcional na abertura e, obrigatório, exigido para resolver', () => {
    expect(descricaoDoCampo(campo('a', 'texto-curto', 'A'))).toBeUndefined();
    expect(descricaoDoCampo(campo('a', 'texto-curto', 'A', { obrigatorio: true }))).toBe(undefined);
    expect(descricaoDoCampo(campo('a', 'numero', 'A', { soDaTi: true }))).toBe('Só a TI vê.');
    expect(descricaoDoCampo(campo('a', 'numero', 'A', { soDaTi: true, obrigatorio: true }))).toBe(
      'Só a TI vê. A resposta é exigida para resolver.',
    );
  });
});

describe('lerNumero', () => {
  it('aceita só os algarismos, com os pontos de milhar, que saem', () => {
    expect(lerNumero('48210')).toEqual({ ok: true, valor: 48_210 });
    expect(lerNumero('48.210')).toEqual({ ok: true, valor: 48_210 });
    expect(lerNumero('1.234.567')).toEqual({ ok: true, valor: 1_234_567 });
    expect(lerNumero('0')).toEqual({ ok: true, valor: 0 });
  });

  it('os espaços do número colado também saem', () => {
    expect(lerNumero('48 210')).toEqual({ ok: true, valor: 48_210 });
    expect(lerNumero(' 12 ')).toEqual({ ok: true, valor: 12 });
    expect(lerNumero('48 210')).toEqual({ ok: true, valor: 48_210 });
    expect(lerNumero(' ')).toEqual({ ok: true, valor: null });
  });

  it('o vazio tira a resposta, e outro caractere não entra', () => {
    expect(lerNumero('')).toEqual({ ok: true, valor: null });
    for (const texto of ['12,5', 'abc', '-3', '1e3', '12a']) {
      expect(lerNumero(texto)).toEqual({ ok: false });
    }
  });
});

describe('avisoSemOsAtivos', () => {
  const ativo = (parte: Partial<CampoDoFormulario> = {}) =>
    campo('impressora', 'ativo', 'Qual impressora?', parte);

  it('diz a falta e, na resposta exigida, quem pode responder', () => {
    expect(avisoSemOsAtivos(ativo({ obrigatorio: true }), 'abertura')).toBe(
      'Você não vê os ativos. Quem vê os ativos pode abrir este chamado.',
    );
    expect(avisoSemOsAtivos(ativo({ obrigatorio: true, soDaTi: true }), 'chamado')).toBe(
      'Você não vê os ativos. Quem vê os ativos pode responder este campo.',
    );
  });

  it('sem a resposta exigida, só a falta', () => {
    expect(avisoSemOsAtivos(ativo(), 'abertura')).toBe('Você não vê os ativos.');
    // O só da TI é opcional na abertura.
    expect(avisoSemOsAtivos(ativo({ obrigatorio: true, soDaTi: true }), 'abertura')).toBe(
      'Você não vê os ativos.',
    );
    expect(avisoSemOsAtivos(ativo({ soDaTi: true }), 'chamado')).toBe('Você não vê os ativos.');
    // Na prévia, quem configura vê como a pessoa, que não abre o chamado por outra conta.
    expect(avisoSemOsAtivos(ativo({ obrigatorio: true }), 'pessoa')).toBe('Você não vê os ativos.');
  });
});

describe('textoDaResposta', () => {
  const OPCOES = [
    { id: 'teclado', texto: 'Teclado' },
    { id: 'mouse', texto: 'Mouse' },
    { id: 'monitor', texto: 'Monitor' },
  ];

  it('sem resposta, nada', () => {
    expect(textoDaResposta(campo('a', 'texto-curto', 'A'), undefined, CITADOS)).toBeNull();
  });

  it('o texto como está, e as opções pelo texto, na ordem delas', () => {
    expect(textoDaResposta(campo('a', 'texto-longo', 'A'), 'Já troquei o papel.', CITADOS)).toBe(
      'Já troquei o papel.',
    );
    const unica = campo('a', 'escolha-unica', 'A', { opcoes: OPCOES });
    expect(textoDaResposta(unica, 'mouse', CITADOS)).toBe('Mouse');
    expect(textoDaResposta(unica, 'outra', CITADOS)).toBeNull();
    const varias = campo('a', 'varias-opcoes', 'A', { opcoes: OPCOES });
    expect(textoDaResposta(varias, ['monitor', 'teclado'], CITADOS)).toBe('Teclado, Monitor');
    expect(textoDaResposta(varias, ['outra'], CITADOS)).toBeNull();
  });

  it('o ativo com o patrimônio, o local pelo caminho e a pessoa pelo nome', () => {
    const ativo = campo('a', 'ativo', 'A');
    expect(textoDaResposta(ativo, 'a-139', CITADOS)).toBe(
      'Impressora Recepção 2º andar · PAT-00139',
    );
    expect(textoDaResposta(ativo, 'a-sem', CITADOS)).toBe('Impressora do RH');
    expect(textoDaResposta(ativo, 'a-outro', CITADOS)).toBeNull();
    expect(textoDaResposta(campo('a', 'local', 'A'), 'l-recepcao', CITADOS)).toBe(
      'Jundiaí › Recepção',
    );
    expect(textoDaResposta(campo('a', 'local', 'A'), 'l-outro', CITADOS)).toBeNull();
    expect(textoDaResposta(campo('a', 'pessoa', 'A'), 'p-marina', CITADOS)).toBe('Marina Lopes');
    expect(textoDaResposta(campo('a', 'pessoa', 'A'), 'p-outra', CITADOS)).toBeNull();
  });

  it('a data, o número e o sim ou não como as telas os mostram', () => {
    expect(textoDaResposta(campo('a', 'data', 'A'), '2026-11-17', CITADOS)).toBe('17/11/2026');
    expect(textoDaResposta(campo('a', 'numero', 'A'), 48_210, CITADOS)).toBe('48.210');
    expect(textoDaResposta(campo('a', 'sim-ou-nao', 'A'), true, CITADOS)).toBe('Sim');
    expect(textoDaResposta(campo('a', 'sim-ou-nao', 'A'), false, CITADOS)).toBe('Não');
  });

  it('a resposta fora do tipo do campo fica de fora, e o anexo aparece como a lista dos arquivos', () => {
    expect(textoDaResposta(campo('a', 'texto-curto', 'A'), 3, CITADOS)).toBeNull();
    expect(textoDaResposta(campo('a', 'numero', 'A'), '3', CITADOS)).toBeNull();
    expect(textoDaResposta(campo('a', 'sim-ou-nao', 'A'), 'sim', CITADOS)).toBeNull();
    expect(textoDaResposta(campo('a', 'data', 'A'), 17, CITADOS)).toBeNull();
    expect(textoDaResposta(campo('a', 'anexo', 'A'), ['f-1'], CITADOS)).toBeNull();
  });
});

describe('origemDasSugestoes', () => {
  it('diz de onde vêm os ativos sugeridos: da pessoa, do local de trabalho dela ou dos dois', () => {
    expect(origemDasSugestoes(['responsavel', 'responsavel'], 'Marina Lopes')).toBe(
      'de Marina Lopes',
    );
    expect(origemDasSugestoes(['local'], 'Marina Lopes')).toBe(
      'do local de trabalho de Marina Lopes',
    );
    expect(origemDasSugestoes(['responsavel', 'local', 'local'], 'Marina Lopes')).toBe(
      'de Marina Lopes e do local de trabalho',
    );
    expect(origemDasSugestoes([], 'Marina Lopes')).toBeUndefined();
  });
});
