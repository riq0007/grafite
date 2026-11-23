// Os "Campos do tipo" do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "A linha do tempo, os campos do tipo e as seções guardadas (tarefa
// 5.14)"): o estado que a ficha dá, a contagem em texto, o que grava na hora, o pedido com os
// campos que mudaram, a recusa que segura o campo e a confirmação da mudança que esconde um anexo.
import {
  type CampoDoFormulario,
  type Formulario,
  type RespostasDoFormulario,
  responder,
  TIPOS_DE_CHAMADO_DE_FABRICA,
} from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import type { FichaDoChamado } from '../consultas.ts';
import {
  campoQueMudou,
  confirmacaoDosAnexos,
  destinoDaFalha,
  estadoDaFicha,
  gravaNaHora,
  pedidoDosCampos,
  respostasGravadas,
  separarARecusa,
  textoDaContagem,
} from './campos.ts';

function formularioDe(nome: string): Formulario {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((deFabrica) => deFabrica.nome === nome);
  if (!tipo) throw new Error(`Sem o tipo de fábrica ${nome}.`);
  return tipo.formulario;
}

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

const SEM_O_CONTRATO = [{ campoId: 'contrato-de-manutencao', juncao: null, valor: false }];

/**
 * A Impressora de fábrica com a Foto da peça e o Laudo, só da TI, que aparecem com "Não" no
 * Contrato de manutenção; o Laudo guarda a resposta quando some.
 */
const IMPRESSORA = formularioDe('Impressora');
const COM_A_FOTO_DA_PECA: Formulario = {
  ...IMPRESSORA,
  campos: [
    ...IMPRESSORA.campos,
    campo('peca', 'anexo', 'Foto da peça', { soDaTi: true, condicao: SEM_O_CONTRATO }),
    campo('laudo', 'anexo', 'Tem o laudo do técnico?', {
      nomeNoResumo: 'Laudo',
      soDaTi: true,
      apagarSeSumir: false,
      condicao: SEM_O_CONTRATO,
    }),
  ],
};

const ATIVO = '0190a000-0000-7000-8000-000000000139';
const LOCAL = '0190a000-0000-7000-8000-0000000000c1';
const PESSOA = '0190a000-0000-7000-8000-0000000000d1';
const [FOTO, PECA, LAUDO_1, LAUDO_2] = [
  '0190a000-0000-7000-8000-0000000000e1',
  '0190a000-0000-7000-8000-0000000000e2',
  '0190a000-0000-7000-8000-0000000000e3',
  '0190a000-0000-7000-8000-0000000000e4',
];

/** As respostas do #1042: a impressora manchando na borda, sem contrato e com a foto da peça. */
const DO_1042 = {
  impressora: ATIVO,
  problema: 'manchando',
  manchas: 'borda',
  'contrato-de-manutencao': false,
  peca: [PECA],
};

describe('o estado que a ficha dá', () => {
  it('as respostas e o nome do que elas citam, com os anexos no chamado', () => {
    const ficha = {
      respostas: { impressora: ATIVO, foto: [FOTO] },
      citados: {
        ativos: [{ id: ATIVO, rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00139' }],
        locais: [{ id: LOCAL, caminho: 'Jundiaí › Recepção' }],
        pessoas: [{ id: PESSOA, nome: 'Marina Rocha' }],
      },
      anexosDosCampos: [
        {
          id: FOTO,
          nome: 'mancha.jpg',
          tipo: 'image/jpeg',
          bytes: 182_000,
          miniatura: null,
          campo: 'foto',
        },
      ],
    } satisfies Pick<FichaDoChamado, 'respostas' | 'citados' | 'anexosDosCampos'>;
    expect(estadoDaFicha(ficha)).toEqual({
      respostas: { impressora: ATIVO, foto: [FOTO] },
      citados: {
        ativos: new Map([[ATIVO, { rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00139' }]]),
        locais: new Map([[LOCAL, 'Jundiaí › Recepção']]),
        pessoas: new Map([[PESSOA, 'Marina Rocha']]),
        anexos: new Map([[FOTO, { nome: 'mancha.jpg', bytes: 182_000, onde: 'no-chamado' }]]),
      },
    });
  });
});

describe('a contagem na cabeça da seção', () => {
  it.each([
    [3, 0, '3 respondidos'],
    [1, 0, '1 respondido'],
    [0, 0, 'Nenhum respondido'],
    [3, 1, '3 respondidos, 1 pendente'],
    [0, 2, 'Nenhum respondido, 2 pendentes'],
  ])('%i respondidos e %i pendentes: "%s"', (respondidos, pendentes, texto) => {
    expect(textoDaContagem({ respondidos, pendentes })).toBe(texto);
  });
});

describe('o que grava na hora e o que grava ao sair do campo', () => {
  it.each([
    'escolha-unica',
    'varias-opcoes',
    'sim-ou-nao',
    'ativo',
    'local',
    'pessoa',
    'anexo',
  ] as const)('%s, que é uma escolha, grava na hora', (tipo) => {
    expect(gravaNaHora(tipo)).toBe(true);
  });

  it.each(['texto-curto', 'texto-longo', 'numero', 'data'] as const)(
    '%s grava ao sair do campo',
    (tipo) => {
      expect(gravaNaHora(tipo)).toBe(false);
    },
  );
});

describe('o pedido com os campos que mudaram', () => {
  const salvas = { ...DO_1042, 'contador-de-paginas': 48_000 };

  it('só os campos que a conta mudou e que ficaram diferentes do guardado', () => {
    const atuais = { ...salvas, 'contrato-de-manutencao': true, 'contador-de-paginas': 48_210 };
    const mudados = new Set(['contrato-de-manutencao', 'contador-de-paginas']);
    expect(pedidoDosCampos(salvas, atuais, mudados)).toEqual({
      'contrato-de-manutencao': true,
      'contador-de-paginas': 48_210,
    });
    expect(pedidoDosCampos(salvas, salvas, mudados)).toEqual({});
  });

  it('o campo apagado vai com o nulo', () => {
    const { 'contador-de-paginas': _, ...semContador } = salvas;
    expect(pedidoDosCampos(salvas, semContador, new Set(['contador-de-paginas']))).toEqual({
      'contador-de-paginas': null,
    });
  });

  it('o campo que some pela condição não vai: a API apaga o escondido', () => {
    const atuais = responder(COM_A_FOTO_DA_PECA, salvas, 'contrato-de-manutencao', true);
    expect(pedidoDosCampos(salvas, atuais, new Set(['contrato-de-manutencao']))).toEqual({
      'contrato-de-manutencao': true,
    });
  });

  it('depois do pedido aceito, a tela sabe o que a API tem: o nulo apagou', () => {
    expect(
      respostasGravadas(salvas, { 'contrato-de-manutencao': true, 'contador-de-paginas': null }),
    ).toEqual({ ...DO_1042, 'contrato-de-manutencao': true });
  });
});

describe('a confirmação da mudança que esconde um anexo', () => {
  const sim = (antes: RespostasDoFormulario) =>
    responder(COM_A_FOTO_DA_PECA, antes, 'contrato-de-manutencao', true);

  it('o Sim no Contrato de manutenção esconde a Foto da peça, com 1 arquivo', () => {
    expect(confirmacaoDosAnexos(COM_A_FOTO_DA_PECA, DO_1042, sim(DO_1042))).toEqual({
      titulo: 'Mudar o campo “Contrato de manutenção”?',
      texto: 'O campo “Foto da peça” some, e 1 arquivo é apagado.',
    });
  });

  it('dois campos no plural, também o que guarda a resposta ao sumir, porque a API a apaga', () => {
    const antes = { ...DO_1042, laudo: [LAUDO_1, LAUDO_2] };
    expect(confirmacaoDosAnexos(COM_A_FOTO_DA_PECA, antes, sim(antes))).toEqual({
      titulo: 'Mudar o campo “Contrato de manutenção”?',
      texto: 'Os campos “Foto da peça” e “Laudo” somem, e 3 arquivos são apagados.',
    });
  });

  it('o laudo sozinho, com 2 arquivos', () => {
    const { peca: _, ...semAFoto } = DO_1042;
    const antes = { ...semAFoto, laudo: [LAUDO_1, LAUDO_2] };
    expect(confirmacaoDosAnexos(COM_A_FOTO_DA_PECA, antes, sim(antes))?.texto).toBe(
      'O campo “Laudo” some, e 2 arquivos são apagados.',
    );
  });

  it('sem arquivo no campo que some, ou sem campo que some, nada a confirmar', () => {
    const { peca: _, ...semAFoto } = DO_1042;
    expect(confirmacaoDosAnexos(COM_A_FOTO_DA_PECA, semAFoto, sim(semAFoto))).toBeNull();
    const contador = responder(COM_A_FOTO_DA_PECA, DO_1042, 'contador-de-paginas', 48_210);
    expect(confirmacaoDosAnexos(COM_A_FOTO_DA_PECA, DO_1042, contador)).toBeNull();
  });
});

describe('o campo que a mudança mudou', () => {
  it('o que aparece antes e depois com outra resposta, e não o que sumiu', () => {
    const depois = responder(COM_A_FOTO_DA_PECA, DO_1042, 'contrato-de-manutencao', true);
    expect(campoQueMudou(COM_A_FOTO_DA_PECA, DO_1042, depois)?.id).toBe('contrato-de-manutencao');
    expect(campoQueMudou(COM_A_FOTO_DA_PECA, DO_1042, DO_1042)).toBeNull();
  });
});

describe('a recusa dos campos', () => {
  it('o campo recusado sai dos próximos pedidos, e o outro do mesmo pedido volta a esperar', () => {
    const pedido = { 'contador-de-paginas': 77777, laudo: 'Fusor trocado.' };
    const erros = { 'campos.contador-de-paginas': 'O contador não pode voltar.' };
    expect(separarARecusa(pedido, erros)).toEqual({
      recusados: ['contador-de-paginas'],
      deVolta: ['laudo'],
    });
  });

  it('a chave de dentro do campo também é dele, e o campo de nome parecido, não', () => {
    const pedido = { contador: 1, 'contador-de-paginas': 2 };
    expect(separarARecusa(pedido, { 'campos.contador.0': 'Escolha outra.' })).toEqual({
      recusados: ['contador'],
      deVolta: ['contador-de-paginas'],
    });
  });

  it('a recusa que não diz o campo segura o pedido inteiro, para não se repetir', () => {
    const pedido = { 'contador-de-paginas': 77777, laudo: 'Fusor trocado.' };
    expect(separarARecusa(pedido, { formulario: 'Esse campo não é da TI.' })).toEqual({
      recusados: ['contador-de-paginas', 'laudo'],
      deVolta: [],
    });
  });
});

describe('a falha da gravação', () => {
  it('sem resposta da API, ou no erro do servidor, nada foi recusado: o pedido volta', () => {
    expect(destinoDaFalha(null)).toBe('tentar-de-novo');
    expect(destinoDaFalha({ status: 500 })).toBe('tentar-de-novo');
    expect(destinoDaFalha({ status: 503, campos: { 'campos.laudo': 'Sem o AD.' } })).toBe(
      'tentar-de-novo',
    );
  });

  it('a recusa que diz os campos, ou o formulário, fica neles', () => {
    const doContador = { 'campos.contador-de-paginas': 'O contador não pode voltar.' };
    expect(destinoDaFalha({ status: 400, campos: doContador })).toBe('nos-campos');
    expect(destinoDaFalha({ status: 400, campos: { formulario: 'Esse campo não é da TI.' } })).toBe(
      'nos-campos',
    );
  });

  it('a recusa do pedido inteiro, como o chamado resolvido por outra conta, devolve a ficha', () => {
    expect(destinoDaFalha({ status: 409 })).toBe('a-ficha-vale');
    expect(destinoDaFalha({ status: 400, campos: {} })).toBe('a-ficha-vale');
  });
});
