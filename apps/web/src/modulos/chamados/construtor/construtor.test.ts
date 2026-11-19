// A paleta do construtor do formulário (change chamados-da-ti, design, "O construtor, a paleta
// (tarefa 5.21)"; m09): o campo novo, acrescentar na posição com o limite e a posição da linha de
// encaixe pelo alvo sob o ponteiro.
import {
  type CampoDoFormulario,
  conferirFormulario,
  MAXIMO_DE_CAMPOS_DO_FORMULARIO,
  TIPOS_DE_CAMPO_DO_CHAMADO,
  type TipoDeCampoDoChamado,
} from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  ALVO_DA_LINHA,
  ALVO_DO_FIM,
  acrescentarCampo,
  avisoDaPaleta,
  avisoDoAcrescentado,
  campoNovo,
  posicaoDoEncaixe,
  rotuloDoCampoNovo,
  textoDoEncaixe,
  textoDoEncaixeDoCampo,
} from './construtor.ts';

const campo = (
  id: string,
  rotulo: string,
  tipo: TipoDeCampoDoChamado = 'texto-curto',
  opcoes: CampoDoFormulario['opcoes'] = [],
): CampoDoFormulario => ({
  id,
  tipo,
  rotulo,
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: false,
  apagarSeSumir: true,
  opcoes,
  tiposDeAtivo: [],
  condicao: [],
});

/** Os ids em sequência, como o sorteio, para o teste saber quais saem. */
const emSequencia = (...ids: string[]) => {
  const fila = [...ids];
  return () => {
    const proximo = fila.shift();
    if (proximo === undefined) throw new Error('Acabaram os ids do teste.');
    return proximo;
  };
};

const IMPRESSORA = [
  campo('impressora', 'Qual impressora?', 'ativo'),
  campo('problema', 'O que está acontecendo?', 'escolha-unica', [
    { id: 'manchando', texto: 'Manchando' },
    { id: 'atolando', texto: 'Atolando' },
  ]),
  campo('foto', 'Uma foto ajuda', 'anexo'),
  campo('contador-de-paginas', 'Contador de páginas', 'numero'),
];

describe('o rótulo do campo novo', () => {
  it('é o nome do tipo de campo', () => {
    expect(rotuloDoCampoNovo('numero', IMPRESSORA)).toBe('Número');
    expect(rotuloDoCampoNovo('sim-ou-nao', [])).toBe('Sim ou não');
  });

  it('ganha o número seguinte quando o nome já existe, sem acento nem maiúscula', () => {
    expect(rotuloDoCampoNovo('numero', [campo('a', 'numero')])).toBe('Número 2');
    expect(rotuloDoCampoNovo('numero', [campo('a', 'Número'), campo('b', 'Número 2')])).toBe(
      'Número 3',
    );
    expect(rotuloDoCampoNovo('data', [campo('a', 'Data 2')])).toBe('Data');
  });
});

describe('o campo novo', () => {
  it('nasce opcional, que a pessoa vê, sem condição e com o apagar ligado', () => {
    expect(campoNovo('numero', IMPRESSORA, emSequencia('n1'))).toEqual({
      id: 'n1',
      tipo: 'numero',
      rotulo: 'Número',
      nomeNoResumo: null,
      obrigatorio: false,
      soDaTi: false,
      apagarSeSumir: true,
      opcoes: [],
      tiposDeAtivo: [],
      condicao: [],
    });
  });

  it('nasce com duas opções na Escolha única e nas Várias opções', () => {
    for (const tipo of ['escolha-unica', 'varias-opcoes'] as const) {
      const novo = campoNovo(tipo, [], emSequencia('c', 'o1', 'o2'));
      expect(novo.opcoes).toEqual([
        { id: 'o1', texto: 'Opção 1' },
        { id: 'o2', texto: 'Opção 2' },
      ]);
    }
  });

  it('sorteia de novo o id que já está no formulário, num campo ou numa opção', () => {
    const novo = campoNovo(
      'escolha-unica',
      IMPRESSORA,
      emSequencia('foto', 'c', 'manchando', 'c', 'o1', 'o1', 'o2'),
    );
    expect(novo.id).toBe('c');
    expect(novo.opcoes.map(({ id }) => id)).toEqual(['o1', 'o2']);
  });

  it('de cada tipo, entra num formulário que a gravação aceita', () => {
    let campos: CampoDoFormulario[] = [];
    let numero = 0;
    const gerar = () => `id${++numero}`;
    for (const tipo of TIPOS_DE_CAMPO_DO_CHAMADO) {
      campos = acrescentarCampo(campos, campoNovo(tipo, campos, gerar), campos.length) ?? campos;
    }
    // Dois de cada um também, com o rótulo numerado.
    for (const tipo of TIPOS_DE_CAMPO_DO_CHAMADO.slice(0, 5)) {
      campos = acrescentarCampo(campos, campoNovo(tipo, campos, gerar), campos.length) ?? campos;
    }
    const conferido = conferirFormulario(
      { titulo: { comecaPeloTipo: true, campoId: null }, campos },
      { pedeOAtivo: false },
    );
    expect(conferido).toMatchObject({ ok: true });
    expect(campos.map(({ rotulo }) => rotulo).slice(-2)).toEqual(['Várias opções 2', 'Ativo 2']);
  });
});

describe('acrescentar o campo', () => {
  const novo = campo('novo', 'Número', 'numero');

  it('põe o campo na posição, e no fim depois do último', () => {
    expect(acrescentarCampo(IMPRESSORA, novo, 3)?.map(({ id }) => id)).toEqual([
      'impressora',
      'problema',
      'foto',
      'novo',
      'contador-de-paginas',
    ]);
    expect(acrescentarCampo(IMPRESSORA, novo, 0)?.[0]?.id).toBe('novo');
    expect(acrescentarCampo(IMPRESSORA, novo, 4)?.at(-1)?.id).toBe('novo');
    expect(acrescentarCampo([], novo, 0)).toEqual([novo]);
  });

  it('não acrescenta com 20 campos', () => {
    const cheio = Array.from({ length: MAXIMO_DE_CAMPOS_DO_FORMULARIO }, (_, indice) =>
      campo(`c${indice}`, `Campo ${indice}`),
    );
    expect(acrescentarCampo(cheio, novo, 0)).toBeNull();
    expect(acrescentarCampo(cheio.slice(1), novo, 19)).toHaveLength(20);
  });

  it('desliga a paleta com 20 campos, com a frase', () => {
    const cheio = Array.from({ length: MAXIMO_DE_CAMPOS_DO_FORMULARIO }, (_, indice) =>
      campo(`c${indice}`, `Campo ${indice}`),
    );
    expect(avisoDaPaleta(cheio)).toBe('O formulário tem no máximo 20 campos.');
    expect(avisoDaPaleta(cheio.slice(1))).toBeNull();
  });
});

describe('a posição da linha de encaixe', () => {
  it('é antes do campo na metade de cima e depois dele na de baixo', () => {
    expect(posicaoDoEncaixe(IMPRESSORA, { chave: 'foto', metade: 'antes' }, null)).toBe(2);
    expect(posicaoDoEncaixe(IMPRESSORA, { chave: 'foto', metade: 'depois' }, null)).toBe(3);
    expect(posicaoDoEncaixe(IMPRESSORA, { chave: 'impressora', metade: 'antes' }, null)).toBe(0);
    expect(
      posicaoDoEncaixe(IMPRESSORA, { chave: 'contador-de-paginas', metade: 'depois' }, null),
    ).toBe(4);
  });

  it('é o fim no espaço depois do último campo, também sem campos', () => {
    expect(posicaoDoEncaixe(IMPRESSORA, { chave: ALVO_DO_FIM, metade: 'antes' }, 1)).toBe(4);
    expect(posicaoDoEncaixe([], { chave: ALVO_DO_FIM, metade: 'depois' }, null)).toBe(0);
  });

  it('fica onde está com o ponteiro na própria linha', () => {
    expect(posicaoDoEncaixe(IMPRESSORA, { chave: ALVO_DA_LINHA, metade: 'depois' }, 2)).toBe(2);
    expect(
      posicaoDoEncaixe(IMPRESSORA, { chave: ALVO_DA_LINHA, metade: 'antes' }, null),
    ).toBeNull();
  });

  it('não existe fora da lista, nem num campo que saiu', () => {
    expect(posicaoDoEncaixe(IMPRESSORA, null, 2)).toBeNull();
    expect(posicaoDoEncaixe(IMPRESSORA, { chave: 'sumiu', metade: 'antes' }, 2)).toBeNull();
  });
});

describe('os textos', () => {
  it('a linha diz o campo que vai entrar', () => {
    expect(textoDoEncaixe('numero')).toBe('Solte o campo “Número” aqui');
    expect(textoDoEncaixeDoCampo('Qual impressora?')).toBe('Solte o campo “Qual impressora?” aqui');
  });

  it('o aviso diz onde o campo entrou', () => {
    expect(avisoDoAcrescentado('Número', IMPRESSORA, 3)).toBe(
      'Campo “Número” acrescentado antes de “Contador de páginas”.',
    );
    expect(avisoDoAcrescentado('Número', IMPRESSORA, 4)).toBe(
      'Campo “Número” acrescentado no fim.',
    );
    expect(avisoDoAcrescentado('Data', [], 0)).toBe('Campo “Data” acrescentado.');
  });
});
