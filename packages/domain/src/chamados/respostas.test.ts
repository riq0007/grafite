import { describe, expect, it } from 'vitest';
import {
  type CampoDoFormulario,
  conferirFormulario,
  type Formulario,
  RECUSA_DO_FORMULARIO,
} from './formulario.ts';
import {
  camposDaTiQueFaltam,
  camposVisiveis,
  conferirRespostas,
  contagemDasRespostas,
  mudarCamposDaTi,
  responder,
} from './respostas.ts';

const ATIVO = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c3d';
const FOTO = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c40';

/** Confere o pedido pelo `conferirFormulario`, para os testes usarem o formulário como a API o grava. */
function conferido(pedido: unknown): Formulario {
  const conferencia = conferirFormulario(pedido, { pedeOAtivo: false });
  if (!conferencia.ok) throw new Error(JSON.stringify(conferencia.erros));
  return conferencia.formulario;
}

type CampoPedido = Record<string, unknown>;

/** O formulário da Impressora da spec (tipos-de-chamado, "Tipos de fábrica"). */
const camposDaImpressora = (): CampoPedido[] => [
  { id: 'impressora', tipo: 'ativo', rotulo: 'Qual impressora?', obrigatorio: true },
  {
    id: 'problema',
    tipo: 'escolha-unica',
    rotulo: 'O que está acontecendo?',
    obrigatorio: true,
    opcoes: [
      { id: 'manchando', texto: 'Manchando' },
      { id: 'papel', texto: 'Não puxa o papel' },
      { id: 'atolando', texto: 'Atolando' },
      { id: 'nao-imprime', texto: 'Não imprime' },
    ],
  },
  {
    id: 'manchas',
    tipo: 'escolha-unica',
    rotulo: 'Onde as manchas aparecem?',
    obrigatorio: true,
    opcoes: [
      { id: 'borda', texto: 'Na borda' },
      { id: 'pagina', texto: 'Na página toda' },
    ],
    condicao: [{ campoId: 'problema', opcaoId: 'manchando' }],
  },
  { id: 'foto', tipo: 'anexo', rotulo: 'Uma foto ajuda' },
  { id: 'contador', tipo: 'numero', rotulo: 'Contador de páginas', soDaTi: true },
  { id: 'contrato', tipo: 'sim-ou-nao', rotulo: 'Contrato de manutenção', soDaTi: true },
];

const formularioCom = (campos: CampoPedido[]) =>
  conferido({ titulo: { comecaPeloTipo: true, campoId: null }, campos });

const impressora = () => formularioCom(camposDaImpressora());

/** A Impressora com o campo `id` mudado. */
const impressoraCom = (id: string, mudanca: CampoPedido) =>
  formularioCom(
    camposDaImpressora().map((campo) => (campo.id === id ? { ...campo, ...mudanca } : campo)),
  );

const visiveis = (formulario: Formulario, respostas: Record<string, unknown>) => [
  ...camposVisiveis(formulario, respostas),
];

/** O formulário das três condições: A e B de Escolha única, C de Sim ou não, e X depois deles. */
const comCondicao = (condicao: unknown[]) =>
  formularioCom([
    {
      id: 'a',
      tipo: 'escolha-unica',
      rotulo: 'A',
      opcoes: [
        { id: 'a1', texto: 'A1' },
        { id: 'a2', texto: 'A2' },
      ],
    },
    {
      id: 'b',
      tipo: 'escolha-unica',
      rotulo: 'B',
      opcoes: [
        { id: 'b1', texto: 'B1' },
        { id: 'b2', texto: 'B2' },
      ],
    },
    { id: 'c', tipo: 'sim-ou-nao', rotulo: 'C' },
    { id: 'x', tipo: 'texto-curto', rotulo: 'X', condicao },
  ]);

const xVisivel = (formulario: Formulario, respostas: Record<string, unknown>) =>
  camposVisiveis(formulario, respostas).has('x');

describe('camposVisiveis', () => {
  it('esconde o campo condicional até a resposta de que ele depende', () => {
    const formulario = impressora();
    expect(visiveis(formulario, {})).toEqual([
      'impressora',
      'problema',
      'foto',
      'contador',
      'contrato',
    ]);
    expect(visiveis(formulario, { problema: 'atolando' })).not.toContain('manchas');
    expect(visiveis(formulario, { problema: 'manchando' })).toEqual([
      'impressora',
      'problema',
      'manchas',
      'foto',
      'contador',
      'contrato',
    ]);
  });

  it('junta as partes com "e" antes das com "ou"', () => {
    // (A for A1 e B for B2) ou C for sim
    const eAntes = comCondicao([
      { campoId: 'a', opcaoId: 'a1' },
      { campoId: 'b', opcaoId: 'b2', juncao: 'e' },
      { campoId: 'c', valor: true, juncao: 'ou' },
    ]);
    expect(xVisivel(eAntes, { a: 'a1', b: 'b2', c: false })).toBe(true);
    expect(xVisivel(eAntes, { a: 'a1', b: 'b1', c: false })).toBe(false);
    expect(xVisivel(eAntes, { a: 'a2', b: 'b1', c: true })).toBe(true);
    expect(xVisivel(eAntes, { a: 'a2', b: 'b2' })).toBe(false);

    // A for A1 ou (B for B1 e C for sim)
    const ouAntes = comCondicao([
      { campoId: 'a', opcaoId: 'a1' },
      { campoId: 'b', opcaoId: 'b1', juncao: 'ou' },
      { campoId: 'c', valor: true, juncao: 'e' },
    ]);
    expect(xVisivel(ouAntes, { a: 'a1', b: 'b2', c: false })).toBe(true);
    expect(xVisivel(ouAntes, { a: 'a2', b: 'b1', c: false })).toBe(false);
    expect(xVisivel(ouAntes, { a: 'a2', b: 'b1', c: true })).toBe(true);
  });

  it('nas Várias opções, "for" vale "tiver"', () => {
    const formulario = formularioCom([
      {
        id: 'sintomas',
        tipo: 'varias-opcoes',
        rotulo: 'O que você notou?',
        opcoes: [
          { id: 'ruido', texto: 'Ruído' },
          { id: 'cheiro', texto: 'Cheiro de queimado' },
        ],
      },
      {
        id: 'onde',
        tipo: 'texto-curto',
        rotulo: 'De onde vem o cheiro?',
        condicao: [{ campoId: 'sintomas', opcaoId: 'cheiro' }],
      },
    ]);
    expect(camposVisiveis(formulario, { sintomas: ['ruido', 'cheiro'] }).has('onde')).toBe(true);
    expect(camposVisiveis(formulario, { sintomas: ['ruido'] }).has('onde')).toBe(false);
    expect(camposVisiveis(formulario, { sintomas: 'cheiro' }).has('onde')).toBe(false);
  });

  it('o Sim ou não sem resposta não é o "não"', () => {
    const formulario = comCondicao([{ campoId: 'c', valor: false }]);
    expect(xVisivel(formulario, { c: false })).toBe(true);
    expect(xVisivel(formulario, { c: true })).toBe(false);
    expect(xVisivel(formulario, {})).toBe(false);
  });

  it('a condição só vê os campos visíveis', () => {
    const formulario = formularioCom([
      ...camposDaImpressora().slice(0, 3),
      {
        id: 'quanto',
        tipo: 'texto-curto',
        rotulo: 'Quanto da página?',
        condicao: [{ campoId: 'manchas', opcaoId: 'pagina' }],
      },
    ]);
    expect(
      camposVisiveis(formulario, { problema: 'manchando', manchas: 'pagina' }).has('quanto'),
    ).toBe(true);
    // A resposta guardada de "Onde as manchas aparecem?", escondido, não mostra o que depende dele.
    expect(
      camposVisiveis(formulario, { problema: 'atolando', manchas: 'pagina' }).has('quanto'),
    ).toBe(false);
  });
});

describe('responder', () => {
  it('grava a resposta, e o campo que some perde a dele', () => {
    const formulario = impressora();
    const antes = { problema: 'manchando', manchas: 'borda' };
    expect(responder(formulario, antes, 'problema', 'atolando')).toEqual({ problema: 'atolando' });
    expect(antes).toEqual({ problema: 'manchando', manchas: 'borda' });
  });

  it('com o "Apagar a resposta se o campo sumir" desligado, guarda a resposta para quando voltar', () => {
    const formulario = impressoraCom('manchas', { apagarSeSumir: false });
    const escondido = responder(
      formulario,
      { problema: 'manchando', manchas: 'borda' },
      'problema',
      'atolando',
    );
    expect(escondido).toEqual({ problema: 'atolando', manchas: 'borda' });
    expect(camposVisiveis(formulario, escondido).has('manchas')).toBe(false);
    const devolta = responder(formulario, escondido, 'problema', 'manchando');
    expect(devolta).toEqual({ problema: 'manchando', manchas: 'borda' });
    expect(camposVisiveis(formulario, devolta).has('manchas')).toBe(true);
  });

  it('o campo que some leva junto o que depende dele', () => {
    const formulario = formularioCom([
      ...camposDaImpressora().slice(0, 2),
      { ...camposDaImpressora()[2], apagarSeSumir: false },
      {
        id: 'quanto',
        tipo: 'texto-curto',
        rotulo: 'Quanto da página?',
        condicao: [{ campoId: 'manchas', opcaoId: 'pagina' }],
      },
    ]);
    const respostas = { problema: 'manchando', manchas: 'pagina', quanto: 'Metade' };
    expect(responder(formulario, respostas, 'problema', 'papel')).toEqual({
      problema: 'papel',
      manchas: 'pagina',
    });
  });

  it('a resposta vazia tira a chave', () => {
    const formulario = impressora();
    expect(responder(formulario, { problema: 'papel' }, 'problema', null)).toEqual({});
    expect(responder(formulario, { contrato: true }, 'contrato', false)).toEqual({
      contrato: false,
    });
  });
});

describe('conferirRespostas', () => {
  const recusas = (formulario: Formulario, pedido: unknown) => {
    const conferencia = conferirRespostas(formulario, pedido);
    return conferencia.ok ? {} : conferencia.erros;
  };

  it('aceita a Impressora respondida, só com os campos visíveis e no tipo de cada um', () => {
    const conferencia = conferirRespostas(impressora(), {
      impressora: ATIVO.toUpperCase(),
      problema: 'manchando',
      manchas: 'borda',
      foto: [FOTO],
      contador: 18_450,
      contrato: false,
      outro: 'fica de fora',
    });
    expect(conferencia).toEqual({
      ok: true,
      respostas: {
        impressora: ATIVO,
        problema: 'manchando',
        manchas: 'borda',
        foto: [FOTO],
        contador: 18_450,
        contrato: false,
      },
    });
  });

  it('pede o obrigatório visível, e não o escondido', () => {
    expect(recusas(impressora(), {})).toEqual({
      'campos.impressora': 'Responda esta pergunta.',
      'campos.problema': 'Responda esta pergunta.',
    });
    expect(recusas(impressora(), { impressora: ATIVO, problema: 'manchando' })).toEqual({
      'campos.manchas': 'Responda esta pergunta.',
    });
    expect(conferirRespostas(impressora(), { impressora: ATIVO, problema: 'atolando' }).ok).toBe(
      true,
    );
  });

  it('deixa de fora a resposta do campo escondido, também a guardada', () => {
    const formulario = impressoraCom('manchas', { apagarSeSumir: false });
    expect(
      conferirRespostas(formulario, { impressora: ATIVO, problema: 'atolando', manchas: 'borda' }),
    ).toEqual({ ok: true, respostas: { impressora: ATIVO, problema: 'atolando' } });
  });

  it('o campo só da TI é opcional na abertura', () => {
    const formulario = impressoraCom('contador', { obrigatorio: true });
    expect(conferirRespostas(formulario, { impressora: ATIVO, problema: 'papel' }).ok).toBe(true);
  });

  it('recusa a opção que não é do campo', () => {
    expect(recusas(impressora(), { impressora: ATIVO, problema: 'Fumaçando' })).toEqual({
      'campos.problema': 'Escolha uma das opções.',
    });
  });

  it('confere o tamanho dos textos, sem os espaços nas pontas', () => {
    const formulario = formularioCom([
      { id: 'curto', tipo: 'texto-curto', rotulo: 'Curto', obrigatorio: true },
      { id: 'longo', tipo: 'texto-longo', rotulo: 'Longo' },
    ]);
    expect(recusas(formulario, { curto: 'a'.repeat(201), longo: 'b'.repeat(4001) })).toEqual({
      'campos.curto': 'Use até 200 caracteres.',
      'campos.longo': 'Use até 4.000 caracteres.',
    });
    expect(recusas(formulario, { curto: '   ' })).toEqual({
      'campos.curto': 'Responda esta pergunta.',
    });
    expect(conferirRespostas(formulario, { curto: `  ${'a'.repeat(200)}  `, longo: '' })).toEqual({
      ok: true,
      respostas: { curto: 'a'.repeat(200) },
    });
  });

  it('o número é inteiro, de 0 a 999.999.999', () => {
    const formulario = formularioCom([{ id: 'n', tipo: 'numero', rotulo: 'Quantos?' }]);
    for (const numero of [-1, 1.5, 1_000_000_000]) {
      expect(recusas(formulario, { n: numero })).toEqual({
        'campos.n': 'Use um número inteiro de 0 a 999.999.999.',
      });
    }
    for (const numero of [0, 999_999_999]) {
      expect(conferirRespostas(formulario, { n: numero })).toEqual({
        ok: true,
        respostas: { n: numero },
      });
    }
  });

  it('as Várias opções guardam as opções na ordem do campo, sem repetir', () => {
    const formulario = formularioCom([
      {
        id: 'v',
        tipo: 'varias-opcoes',
        rotulo: 'O que você notou?',
        obrigatorio: true,
        opcoes: [
          { id: 'ruido', texto: 'Ruído' },
          { id: 'cheiro', texto: 'Cheiro de queimado' },
          { id: 'luz', texto: 'Luz piscando' },
        ],
      },
    ]);
    expect(conferirRespostas(formulario, { v: ['luz', 'ruido', 'luz'] })).toEqual({
      ok: true,
      respostas: { v: ['ruido', 'luz'] },
    });
    expect(recusas(formulario, { v: ['ruido', 'fumaca'] })).toEqual({
      'campos.v': 'Escolha uma das opções.',
    });
    expect(recusas(formulario, { v: [] })).toEqual({ 'campos.v': 'Responda esta pergunta.' });
  });

  it('o anexo tem até 5 arquivos, sem repetir', () => {
    const arquivo = (n: number) =>
      `0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c${String(n).padStart(2, '0')}`;
    const formulario = impressora();
    const base = { impressora: ATIVO, problema: 'papel' };
    expect(recusas(formulario, { ...base, foto: [1, 2, 3, 4, 5, 6].map(arquivo) })).toEqual({
      'campos.foto': 'Anexe até 5 arquivos.',
    });
    expect(conferirRespostas(formulario, { ...base, foto: [arquivo(1), arquivo(1)] })).toEqual({
      ok: true,
      respostas: { ...base, foto: [arquivo(1)] },
    });
  });

  it('a Data é um dia que existe, em aaaa-mm-dd', () => {
    const formulario = formularioCom([{ id: 'quando', tipo: 'data', rotulo: 'Desde quando?' }]);
    expect(conferirRespostas(formulario, { quando: '2026-11-16' })).toEqual({
      ok: true,
      respostas: { quando: '2026-11-16' },
    });
    for (const quando of ['2026-02-30', '16/11/2026', 20261116]) {
      expect(recusas(formulario, { quando })).toEqual({ formulario: RECUSA_DO_FORMULARIO });
    }
  });

  it('o "não" responde o Sim ou não obrigatório', () => {
    const formulario = impressoraCom('contrato', { soDaTi: false, obrigatorio: true });
    expect(
      conferirRespostas(formulario, { impressora: ATIVO, problema: 'papel', contrato: false }).ok,
    ).toBe(true);
  });

  it.each([
    ['o pedido que não é um mapa', null],
    ['a lista no lugar do mapa', []],
    ['o ativo fora do formato', { impressora: 'PAT-00139', problema: 'papel' }],
    ['a opção que não é texto', { impressora: ATIVO, problema: 3 }],
    ['o anexo fora da lista', { impressora: ATIVO, problema: 'papel', foto: FOTO }],
    ['o arquivo fora do formato', { impressora: ATIVO, problema: 'papel', foto: ['foto.png'] }],
    ['o número em texto', { impressora: ATIVO, problema: 'papel', contador: '12' }],
    ['o Sim ou não em texto', { impressora: ATIVO, problema: 'papel', contrato: 'sim' }],
  ])('%s é a recusa geral', (_, pedido) => {
    expect(recusas(impressora(), pedido)).toEqual({ formulario: RECUSA_DO_FORMULARIO });
  });

  it('lê só as respostas do próprio pedido, mesmo com os ids dos nomes do JavaScript', () => {
    // O `conferirFormulario` recusa esses ids; o formulário montado à mão é a segunda camada.
    const campo = (id: string, tipo: CampoDoFormulario['tipo']): CampoDoFormulario => ({
      id,
      tipo,
      rotulo: id,
      nomeNoResumo: null,
      obrigatorio: false,
      soDaTi: false,
      apagarSeSumir: true,
      opcoes:
        tipo === 'varias-opcoes'
          ? [
              { id: 'a', texto: 'A' },
              { id: 'b', texto: 'B' },
            ]
          : [],
      tiposDeAtivo: [],
      condicao: [],
    });
    const formulario: Formulario = {
      titulo: { comecaPeloTipo: true, campoId: null },
      campos: [campo('constructor', 'texto-curto'), campo('__proto__', 'varias-opcoes')],
    };
    expect(conferirRespostas(formulario, {})).toEqual({ ok: true, respostas: {} });
    const pedido = JSON.parse('{"__proto__": ["b"]}');
    const conferencia = conferirRespostas(formulario, pedido);
    expect(conferencia.ok && Object.hasOwn(conferencia.respostas, '__proto__')).toBe(true);
    expect(conferencia.ok && JSON.stringify(conferencia.respostas)).toBe('{"__proto__":["b"]}');
    const respondido = responder(formulario, {}, '__proto__', ['a']);
    expect(JSON.stringify(respondido)).toBe('{"__proto__":["a"]}');
    expect(Object.getPrototypeOf(respondido)).toBe(Object.prototype);
  });
});

describe('mudarCamposDaTi', () => {
  const PECA = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c41';

  /** A Impressora com a Foto da peça, só da TI, que aparece sem o Contrato de manutenção. */
  const comAFotoDaPeca = () =>
    formularioCom([
      ...camposDaImpressora(),
      {
        id: 'peca',
        tipo: 'anexo',
        rotulo: 'Foto da peça',
        soDaTi: true,
        condicao: [{ campoId: 'contrato', valor: false }],
      },
    ]);

  const campoDe = (formulario: Formulario, id: string) =>
    formulario.campos.find((campo) => campo.id === id);

  /** As respostas guardadas do #1042: a impressora manchando na borda, com a foto da pessoa. */
  const DO_1042 = { impressora: ATIVO, problema: 'manchando', manchas: 'borda', foto: [FOTO] };

  it('Campo da TI preenchido: o Contador fica com 48210, e só ele muda', () => {
    const formulario = comAFotoDaPeca();
    expect(mudarCamposDaTi(formulario, DO_1042, { contador: 48_210 })).toEqual({
      ok: true,
      respostas: { ...DO_1042, contador: 48_210 },
      mudados: [{ campo: campoDe(formulario, 'contador'), antes: null, depois: 48_210 }],
    });
  });

  it('o vazio e o nulo apagam a resposta', () => {
    const formulario = comAFotoDaPeca();
    const guardadas = { ...DO_1042, contador: 48_210, contrato: true };
    expect(mudarCamposDaTi(formulario, guardadas, { contador: null, contrato: '' })).toEqual({
      ok: true,
      respostas: DO_1042,
      mudados: [
        { campo: campoDe(formulario, 'contador'), antes: 48_210, depois: null },
        { campo: campoDe(formulario, 'contrato'), antes: true, depois: null },
      ],
    });
  });

  it('Anexo tirado de um campo da TI: a foto sai das respostas', () => {
    const formulario = comAFotoDaPeca();
    const guardadas = { ...DO_1042, contrato: false, peca: [PECA] };
    expect(mudarCamposDaTi(formulario, guardadas, { peca: [] })).toEqual({
      ok: true,
      respostas: { ...DO_1042, contrato: false },
      mudados: [{ campo: campoDe(formulario, 'peca'), antes: [PECA], depois: null }],
    });
  });

  it('o campo que some pela condição perde a resposta, como na abertura', () => {
    const formulario = comAFotoDaPeca();
    const guardadas = { ...DO_1042, contrato: false, peca: [PECA] };
    expect(mudarCamposDaTi(formulario, guardadas, { contrato: true })).toEqual({
      ok: true,
      respostas: { ...DO_1042, contrato: true },
      mudados: [
        { campo: campoDe(formulario, 'contrato'), antes: false, depois: true },
        { campo: campoDe(formulario, 'peca'), antes: [PECA], depois: null },
      ],
    });
    // O campo escondido não guarda a resposta pedida.
    expect(mudarCamposDaTi(formulario, DO_1042, { peca: [PECA] })).toEqual({
      ok: true,
      respostas: DO_1042,
      mudados: [],
    });
  });

  it('as mesmas respostas, no tipo de cada campo, não mudam nada', () => {
    const formulario = comAFotoDaPeca();
    const guardadas = { ...DO_1042, contador: 48_210, contrato: false, peca: [PECA] };
    expect(
      mudarCamposDaTi(formulario, guardadas, {
        contador: 48_210,
        contrato: false,
        peca: [PECA.toUpperCase(), PECA],
      }),
    ).toEqual({ ok: true, respostas: guardadas, mudados: [] });
    expect(mudarCamposDaTi(formulario, guardadas, {})).toEqual({
      ok: true,
      respostas: guardadas,
      mudados: [],
    });
  });

  it('o só da TI obrigatório pode ficar vazio: quem o pede é o resolver', () => {
    const formulario = impressoraCom('contador', { obrigatorio: true });
    expect(
      mudarCamposDaTi(formulario, { ...DO_1042, contador: 5 }, { contador: null }),
    ).toMatchObject({ ok: true, respostas: DO_1042 });
  });

  it('as recusas de cada campo vão na chave dele', () => {
    expect(mudarCamposDaTi(impressora(), DO_1042, { contador: -1, contrato: true })).toEqual({
      ok: false,
      erros: { 'campos.contador': 'Use um número inteiro de 0 a 999.999.999.' },
    });
  });

  it.each([
    ['o campo que a pessoa vê', { problema: 'atolando' }],
    ['o campo que não é do formulário', { outro: 1 }],
    ['o id dos nomes do JavaScript', JSON.parse('{"__proto__": 1}')],
    ['o número em texto', { contador: '12' }],
    ['as respostas que não são um objeto', [48_210]],
    ['o nulo no lugar das respostas', null],
  ])('%s é a recusa geral', (_, pedido) => {
    expect(mudarCamposDaTi(impressora(), DO_1042, pedido)).toEqual({
      ok: false,
      erros: { formulario: RECUSA_DO_FORMULARIO },
    });
  });
});

describe('contagemDasRespostas e camposDaTiQueFaltam', () => {
  /**
   * A Impressora com o Laudo, só da TI e obrigatório, e a Nota fiscal, só da TI e obrigatória, que
   * aparece com o Contrato de manutenção.
   */
  const comOLaudo = () =>
    formularioCom([
      ...camposDaImpressora(),
      { id: 'laudo', tipo: 'texto-longo', rotulo: 'Laudo', soDaTi: true, obrigatorio: true },
      {
        id: 'nota',
        tipo: 'texto-curto',
        rotulo: 'Nota fiscal',
        soDaTi: true,
        obrigatorio: true,
        condicao: [{ campoId: 'contrato', valor: true }],
      },
    ]);

  const DO_1042 = { impressora: ATIVO, problema: 'manchando', manchas: 'borda', foto: [FOTO] };

  it('os campos que a condição mostra, com resposta, e os só da TI obrigatórios e vazios', () => {
    expect(contagemDasRespostas(comOLaudo(), DO_1042)).toEqual({ respondidos: 4, pendentes: 1 });
    expect(
      contagemDasRespostas(comOLaudo(), { ...DO_1042, contrato: true, contador: 48_210 }),
    ).toEqual({ respondidos: 6, pendentes: 2 });
  });

  it('o campo escondido não conta, nem com a resposta guardada', () => {
    expect(contagemDasRespostas(comOLaudo(), { ...DO_1042, problema: 'atolando' })).toEqual({
      respondidos: 3,
      pendentes: 1,
    });
  });

  it('o vazio não é respondido, o Não é, e o opcional vazio não fica pendente', () => {
    expect(
      contagemDasRespostas(comOLaudo(), { ...DO_1042, foto: [], laudo: '  ', contrato: false }),
    ).toEqual({ respondidos: 4, pendentes: 1 });
  });

  it('os pendentes são os que o resolver pede, na ordem do formulário', () => {
    const faltam = (respostas: Record<string, unknown>) =>
      camposDaTiQueFaltam(comOLaudo(), respostas).map((campo) => campo.id);
    expect(faltam({ ...DO_1042, contrato: true })).toEqual(['laudo', 'nota']);
    expect(faltam({ ...DO_1042, laudo: 'Trocado o fusor.' })).toEqual([]);
  });
});
