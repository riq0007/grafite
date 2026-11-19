// A prévia em tamanho real (change chamados-da-ti, design, "A prévia em tamanho real (tarefa
// 5.24)"; m11): o que a pessoa vê, campo a campo, o aviso dos campos escondidos, o que chegaria
// para a TI, o detalhe do "Ver como" e o "Enviar para a TI", que só confere.
import {
  type CampoDoFormulario,
  type Formulario,
  TIPOS_DE_CHAMADO_DE_FABRICA,
} from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import type { SugestoesDoChamado } from '../formulario/buscas.ts';
import { ESTADO_VAZIO, type EstadoDoFormulario, responderNoEstado } from '../formulario/estado.ts';
import {
  avisoDosEscondidos,
  detalheDoVerComo,
  envioDaPrevia,
  oQueChegaria,
  oQueElaVe,
  previaVazia,
  recusasQueValem,
} from './previa.ts';

function formularioDe(nome: string): Formulario {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((deFabrica) => deFabrica.nome === nome);
  if (!tipo) throw new Error(`Sem o tipo ${nome}.`);
  return tipo.formulario;
}

const IMPRESSORA = formularioDe('Impressora');

const comCampos = (formulario: Formulario, campos: CampoDoFormulario[]): Formulario => ({
  ...formulario,
  campos,
});

/** O campo da Impressora pelo id, para os formulários mudados dos testes. */
function daImpressora(id: string): CampoDoFormulario {
  const campo = IMPRESSORA.campos.find((cada) => cada.id === id);
  if (!campo) throw new Error(`Sem o campo ${id}.`);
  return campo;
}

const ID_DA_IMPRESSORA = '0190a0a0-0000-7000-8000-000000000137';
const IMPRESSORA_DO_FINANCEIRO = { patrimonio: 'PAT-00137', rotulo: 'Impressora Financeiro' };

/** As respostas do m11: a Impressora Financeiro, "Manchando" e "Na borda". */
function respostasDoM11(formulario: Formulario = IMPRESSORA): EstadoDoFormulario {
  let estado = responderNoEstado(formulario, ESTADO_VAZIO, 'impressora', ID_DA_IMPRESSORA, [
    { tipo: 'ativo', id: ID_DA_IMPRESSORA, ativo: IMPRESSORA_DO_FINANCEIRO },
  ]);
  estado = responderNoEstado(formulario, estado, 'problema', 'manchando');
  return responderNoEstado(formulario, estado, 'manchas', 'borda');
}

describe('oQueElaVe', () => {
  it('cada campo, como no m11: o olho, o obrigatório, o opcional, a condição e os só da TI', () => {
    expect(oQueElaVe(IMPRESSORA.campos)).toEqual([
      { id: 'impressora', nome: 'Qual impressora?', ve: true, nota: 'obrigatório', condicao: null },
      {
        id: 'problema',
        nome: 'O que está acontecendo?',
        ve: true,
        nota: 'obrigatório',
        condicao: null,
      },
      {
        id: 'manchas',
        nome: 'Onde as manchas aparecem?',
        ve: true,
        nota: 'obrigatório',
        condicao: 'se for Manchando',
      },
      { id: 'foto', nome: 'Uma foto ajuda', ve: true, nota: 'opcional', condicao: null },
      {
        id: 'contador-de-paginas',
        nome: 'Contador de páginas',
        ve: false,
        nota: 'só a TI',
        condicao: null,
      },
      {
        id: 'contrato-de-manutencao',
        nome: 'Contrato de manutenção',
        ve: false,
        nota: 'só a TI',
        condicao: null,
      },
    ]);
  });

  it('a condição de dois campos diz cada campo, como a marca do editor', () => {
    const foto = {
      ...daImpressora('foto'),
      condicao: [
        { campoId: 'problema', juncao: null, opcaoId: 'manchando' },
        { campoId: 'manchas', juncao: 'e', opcaoId: 'borda' },
      ],
    } satisfies CampoDoFormulario;
    const campos = IMPRESSORA.campos.map((campo) => (campo.id === 'foto' ? foto : campo));
    expect(oQueElaVe(campos).find((linha) => linha.id === 'foto')?.condicao).toBe(
      'se “O que está acontecendo?” for Manchando e “Onde as manchas aparecem?” for Na borda',
    );
  });

  it('o campo só da TI com condição fica só com o "só a TI": a pessoa não o vê', () => {
    const contador = {
      ...daImpressora('contador-de-paginas'),
      condicao: [{ campoId: 'problema', juncao: null, opcaoId: 'atolando' }],
    } satisfies CampoDoFormulario;
    const campos = IMPRESSORA.campos.map((campo) => (campo.id === contador.id ? contador : campo));
    expect(oQueElaVe(campos).find((linha) => linha.id === contador.id)).toEqual({
      id: 'contador-de-paginas',
      nome: 'Contador de páginas',
      ve: false,
      nota: 'só a TI',
      condicao: null,
    });
  });

  it('o campo ainda sem rótulo usa o nome do tipo de campo', () => {
    const semRotulo = { ...daImpressora('contador-de-paginas'), rotulo: '', soDaTi: false };
    expect(oQueElaVe([semRotulo])).toEqual([
      { id: 'contador-de-paginas', nome: 'Número', ve: true, nota: 'opcional', condicao: null },
    ]);
  });
});

describe('previaVazia', () => {
  it('sem campos, a frase do formulário vazio, no lugar da faixa vazia', () => {
    expect(previaVazia([])).toBe('O formulário ainda não tem campos.');
  });

  it('só com os campos da TI, a pessoa não vê nenhum', () => {
    const daTi = IMPRESSORA.campos.filter((campo) => campo.soDaTi);
    expect(previaVazia(daTi)).toBe('A pessoa não vê nenhum campo: só a TI vê os deste formulário.');
  });

  it('com um campo que a pessoa vê, nenhuma', () => {
    expect(previaVazia(IMPRESSORA.campos)).toBeNull();
  });
});

describe('avisoDosEscondidos', () => {
  it('os dois só da TI da Impressora, pelo nome entre aspas', () => {
    expect(avisoDosEscondidos(IMPRESSORA.campos)).toEqual({
      titulo: '2 campos ficaram escondidos.',
      texto:
        'Só a TI vê “Contador de páginas” e “Contrato de manutenção”, depois que o chamado chega.',
    });
  });

  it('um só, no singular', () => {
    const campos = IMPRESSORA.campos.filter((campo) => campo.id !== 'contrato-de-manutencao');
    expect(avisoDosEscondidos(campos)).toEqual({
      titulo: '1 campo ficou escondido.',
      texto: 'Só a TI vê “Contador de páginas”, depois que o chamado chega.',
    });
  });

  it('três, com a vírgula e o "e"', () => {
    const garantia = {
      ...daImpressora('contrato-de-manutencao'),
      id: 'garantia',
      rotulo: 'Está na garantia?',
    };
    expect(avisoDosEscondidos([...IMPRESSORA.campos, garantia])?.texto).toBe(
      'Só a TI vê “Contador de páginas”, “Contrato de manutenção” e “Está na garantia?”, depois que o chamado chega.',
    );
  });

  it('sem campo só da TI, nenhum', () => {
    expect(avisoDosEscondidos(formularioDe('Computador').campos)).toBeNull();
  });
});

describe('oQueChegaria', () => {
  it('o do m11: o título, o tipo, o ativo, o problema e os campos da TI', () => {
    expect(oQueChegaria(IMPRESSORA, respostasDoM11(), 'Impressora')).toEqual({
      titulo: 'Impressora manchando',
      tipo: 'Impressora',
      temAtivo: true,
      ativo: IMPRESSORA_DO_FINANCEIRO,
      respostas: [{ nome: 'Problema', resposta: 'Manchando, na borda', mono: false }],
      camposDaTi: true,
    });
  });

  it('com "Atolando", o campo condicional some, e o título passa a "Impressora atolando"', () => {
    const estado = responderNoEstado(IMPRESSORA, respostasDoM11(), 'problema', 'atolando');
    const chegaria = oQueChegaria(IMPRESSORA, estado, 'Impressora');
    expect(chegaria.titulo).toBe('Impressora atolando');
    expect(chegaria.respostas).toEqual([{ nome: 'Problema', resposta: 'Atolando', mono: false }]);
  });

  it('sem resposta: o nome do tipo, o ativo vazio e nenhuma resposta', () => {
    expect(oQueChegaria(IMPRESSORA, ESTADO_VAZIO, 'Impressora')).toEqual({
      titulo: 'Impressora',
      tipo: 'Impressora',
      temAtivo: true,
      ativo: null,
      respostas: [],
      camposDaTi: true,
    });
  });

  it('o ativo é o do primeiro campo Ativo; o segundo fica nas respostas, em mono', () => {
    const monitor: CampoDoFormulario = {
      ...daImpressora('impressora'),
      id: 'monitor',
      rotulo: 'E o monitor?',
      nomeNoResumo: 'Monitor',
      obrigatorio: false,
    };
    const formulario = comCampos(IMPRESSORA, [...IMPRESSORA.campos, monitor]);
    const ID_DO_MONITOR = '0190a0a0-0000-7000-8000-000000000412';
    const estado = responderNoEstado(
      formulario,
      respostasDoM11(formulario),
      'monitor',
      ID_DO_MONITOR,
      [
        {
          tipo: 'ativo',
          id: ID_DO_MONITOR,
          ativo: { patrimonio: 'MON-0412', rotulo: 'Monitor 24' },
        },
      ],
    );
    const chegaria = oQueChegaria(formulario, estado, 'Impressora');
    expect(chegaria.ativo).toEqual(IMPRESSORA_DO_FINANCEIRO);
    expect(chegaria.respostas).toEqual([
      { nome: 'Problema', resposta: 'Manchando, na borda', mono: false },
      { nome: 'Monitor', resposta: 'MON-0412', mono: true },
    ]);
  });

  it('sem campo Ativo que a pessoa responda, sem o ativo', () => {
    expect(
      oQueChegaria(formularioDe('Acesso e senha'), ESTADO_VAZIO, 'Acesso e senha'),
    ).toMatchObject({
      temAtivo: false,
      ativo: null,
      camposDaTi: false,
    });
    const daTi = comCampos(
      IMPRESSORA,
      IMPRESSORA.campos.map((campo) =>
        campo.id === 'impressora' ? { ...campo, soDaTi: true } : campo,
      ),
    );
    expect(oQueChegaria(daTi, ESTADO_VAZIO, 'Impressora').temAtivo).toBe(false);
  });
});

describe('detalheDoVerComo', () => {
  const sugestoes = (ativos: SugestoesDoChamado['ativos']): SugestoesDoChamado => ({
    local: { id: '0190a0a0-0000-7000-8000-00000000f1a0', nome: 'Financeiro' },
    ativos,
  });
  const ativo = (
    patrimonio: string | null,
    rotulo: string,
    motivo: 'responsavel' | 'local' = 'responsavel',
  ) => ({
    id: `0190a0a0-0000-7000-8000-${String(rotulo.length).padStart(12, '0')}`,
    rotulo,
    patrimonio,
    tipoId: '0190a0a0-0000-7000-8000-00000000c0de',
    motivo,
  });

  it('o local e os ativos sob a responsabilidade dela, como "Financeiro · NB-0231"', () => {
    expect(
      detalheDoVerComo(
        sugestoes([
          ativo('NB-0231', 'Notebook da Fernanda'),
          ativo('PAT-00137', 'Impressora', 'local'),
        ]),
      ),
    ).toEqual([
      { texto: 'Financeiro', mono: false },
      { texto: 'NB-0231', mono: true },
    ]);
  });

  it('o ativo sem patrimônio vai pelo nome; depois do segundo, quantos faltam', () => {
    expect(
      detalheDoVerComo(
        sugestoes([
          ativo(null, 'Headset'),
          ativo('NB-0231', 'Notebook'),
          ativo('MON-0412', 'Monitor'),
          ativo('TEL-0007', 'Telefone'),
        ]),
      ),
    ).toEqual([
      { texto: 'Financeiro', mono: false },
      { texto: 'Headset', mono: false },
      { texto: 'NB-0231', mono: true },
      { texto: 'e mais 2', mono: false },
    ]);
  });

  it('sem local, sem ativo ou ainda sem as sugestões, nada', () => {
    expect(detalheDoVerComo({ local: null, ativos: [] })).toEqual([]);
    expect(detalheDoVerComo(undefined)).toEqual([]);
  });
});

describe('envioDaPrevia', () => {
  it('com as respostas que a abertura pede, o chamado iria, e nada é enviado', () => {
    expect(envioDaPrevia(IMPRESSORA, respostasDoM11().respostas)).toEqual({
      erros: {},
      aviso: {
        situacao: 'sucesso',
        texto: 'Na aba, o chamado iria para a TI. A prévia não envia nada.',
      },
    });
  });

  it('sem as respostas obrigatórias, as recusas da abertura, em cada campo', () => {
    expect(envioDaPrevia(IMPRESSORA, {})).toEqual({
      erros: {
        'campos.impressora': 'Responda esta pergunta.',
        'campos.problema': 'Responda esta pergunta.',
      },
      aviso: {
        situacao: 'atencao',
        texto: 'Na aba, o chamado não iria assim: veja os 2 campos marcados.',
      },
    });
    const semOnde = responderNoEstado(IMPRESSORA, respostasDoM11(), 'manchas', null);
    expect(envioDaPrevia(IMPRESSORA, semOnde.respostas).aviso.texto).toBe(
      'Na aba, o chamado não iria assim: veja o campo marcado.',
    );
  });
});

describe('recusasQueValem', () => {
  it('a recusa de um campo vale enquanto a resposta dele não muda', () => {
    const erros = {
      'campos.impressora': 'Responda esta pergunta.',
      'campos.problema': 'Responda esta pergunta.',
    };
    const depois = responderNoEstado(IMPRESSORA, ESTADO_VAZIO, 'problema', 'atolando').respostas;
    expect(recusasQueValem(erros, {}, depois)).toEqual({
      'campos.impressora': 'Responda esta pergunta.',
    });
    expect(recusasQueValem(erros, {}, {})).toEqual(erros);
  });

  it('a recusa geral do formulário vale enquanto nenhuma resposta muda', () => {
    const erros = { formulario: 'O formulário mudou.' };
    expect(recusasQueValem(erros, {}, {})).toEqual(erros);
    expect(recusasQueValem(erros, {}, { problema: 'atolando' })).toEqual({});
  });
});
