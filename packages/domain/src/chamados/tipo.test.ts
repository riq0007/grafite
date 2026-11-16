import { describe, expect, it } from 'vitest';
import type { ContaQueAtendePorPadrao } from './atendimento.ts';
import { conferirFormulario, type Formulario } from './formulario.ts';
import { HORARIO_DA_TI_PADRAO, type PrazoDoTipo } from './prazo.ts';
import {
  type ContextoDoTipoDeChamado,
  conferirTipoDeChamado,
  ICONES_DO_TIPO_DE_CHAMADO,
  ligaASolicitacao,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  type PedidoDoTipoDeChamado,
  SITUACOES_DO_TIPO_DE_CHAMADO,
  SOLICITACOES_DO_TIPO_DE_CHAMADO,
} from './tipo.ts';

/** Confere o pedido pelo `conferirFormulario`, para o formulário ficar como a API o grava. */
function formularioCom(campos: Record<string, unknown>[]): Formulario {
  const conferencia = conferirFormulario(
    { titulo: { comecaPeloTipo: true, campoId: null }, campos },
    { pedeOAtivo: false },
  );
  if (!conferencia.ok) throw new Error(JSON.stringify(conferencia.erros));
  return conferencia.formulario;
}

const QUAL_IMPRESSORA = {
  id: 'impressora',
  tipo: 'ativo',
  rotulo: 'Qual impressora?',
  obrigatorio: true,
};
const QUAL_COR = {
  id: 'cor',
  tipo: 'escolha-unica',
  rotulo: 'Qual cor acabou?',
  obrigatorio: true,
  opcoes: [
    { id: 'preto', texto: 'Preto' },
    { id: 'ciano', texto: 'Ciano' },
  ],
};
const QUEM_VAI_USAR = {
  id: 'quem',
  tipo: 'pessoa',
  rotulo: 'Quem vai usar?',
  obrigatorio: true,
};

/** O formulário do Toner: o campo Ativo obrigatório primeiro, que dá o ativo ligado. */
const DO_TONER = formularioCom([QUAL_IMPRESSORA, QUAL_COR]);
const SEM_ATIVO = formularioCom([QUAL_COR]);
const DO_EQUIPAMENTO_NOVO = formularioCom([QUEM_VAI_USAR]);

const NOTEBOOK = 'tipo-de-ativo-notebook';
const MONITOR = 'tipo-de-ativo-monitor';
/** Um tipo de ativo que a organização inativou. */
const TABLET = 'tipo-de-ativo-tablet';

/** Diego atende os chamados só de Jundiaí: ainda é uma conta que atende os chamados. */
const DIEGO: ContaQueAtendePorPadrao = {
  id: 'conta-diego',
  ativa: true,
  alcance: new Set(['local-jundiai']),
};

/** O alcance de `solicitacoes.atender` de Bruno: só Campinas. */
const SO_CAMPINAS = new Set(['local-campinas']);

const TONER: PedidoDoTipoDeChamado = {
  nome: 'Toner',
  icone: 'gota',
  frase: 'A impressora está sem toner ou a cópia saiu fraca',
  prazo: {
    modo: 'corridas',
    resposta: { valor: 30, unidade: 'min' },
    resolucao: { valor: 8, unidade: 'h' },
  },
  atendePorPadrao: null,
  semNinguem: 'triagem',
  podeVirarOs: false,
  geraSolicitacao: 'toner',
  tipoDeAtivoDoEquipamento: null,
  pedeOAtivo: true,
  apareceParaOColaborador: true,
  soATiAbre: false,
};

/** O Toner como está gravado, com quem grava atendendo as solicitações na organização inteira. */
const NO_TONER: ContextoDoTipoDeChamado = {
  situacao: 'em-uso',
  antes: { geraSolicitacao: 'toner', tipoDeAtivoDoEquipamento: null },
  quemAtende: null,
  tiposDeAtivo: new Set([NOTEBOOK, MONITOR]),
  formulario: DO_TONER,
  alcanceDasSolicitacoes: 'organizacao',
  horario: HORARIO_DA_TI_PADRAO,
};

const EQUIPAMENTO_NOVO: PedidoDoTipoDeChamado = {
  ...TONER,
  nome: 'Equipamento novo',
  icone: 'torre',
  frase: 'Pedir máquina para quem chega',
  prazo: {
    modo: 'horario',
    resposta: { valor: 1, unidade: 'h' },
    resolucao: { valor: 3, unidade: 'd' },
  },
  atendePorPadrao: DIEGO.id,
  geraSolicitacao: 'equipamento',
  tipoDeAtivoDoEquipamento: NOTEBOOK,
  pedeOAtivo: false,
};

const NO_EQUIPAMENTO_NOVO: ContextoDoTipoDeChamado = {
  ...NO_TONER,
  antes: { geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: NOTEBOOK },
  quemAtende: DIEGO,
  formulario: DO_EQUIPAMENTO_NOVO,
};

/** A Impressora não gera solicitação: pode virar OS e pede o ativo. */
const IMPRESSORA: PedidoDoTipoDeChamado = {
  ...TONER,
  nome: 'Impressora',
  icone: 'impressora',
  frase: 'Mancha, atola ou não imprime',
  prazo: {
    modo: 'horario',
    resposta: { valor: 30, unidade: 'min' },
    resolucao: { valor: 8, unidade: 'h' },
  },
  podeVirarOs: true,
  geraSolicitacao: 'nao',
};

const NA_IMPRESSORA: ContextoDoTipoDeChamado = {
  ...NO_TONER,
  antes: { geraSolicitacao: 'nao', tipoDeAtivoDoEquipamento: null },
};

const prazo = (
  resposta: PrazoDoTipo['resposta'],
  resolucao: PrazoDoTipo['resolucao'],
  modo: PrazoDoTipo['modo'] = 'horario',
): PrazoDoTipo => ({ modo, resposta, resolucao });

/** As recusas da conferência; nenhuma, o objeto vazio. */
function recusas(pedido: PedidoDoTipoDeChamado, contexto: ContextoDoTipoDeChamado) {
  const conferencia = conferirTipoDeChamado(pedido, contexto);
  return conferencia.ok ? {} : conferencia.erros;
}

const M = MENSAGENS_DO_TIPO_DE_CHAMADO;

describe('as listas do tipo de chamado', () => {
  it('tem os 16 ícones da decisão 6, na ordem da tabela', () => {
    expect(ICONES_DO_TIPO_DE_CHAMADO).toEqual([
      'gota',
      'notebook',
      'impressora',
      'cadeado',
      'janela',
      'globo',
      'telefone',
      'reticencias',
      'setas',
      'computador',
      'torre',
      'fone',
      'chave',
      'caixa',
      'camera',
      'wi-fi',
    ]);
  });

  it('tem as situações e as solicitações que o tipo gera', () => {
    expect(SITUACOES_DO_TIPO_DE_CHAMADO).toEqual(['rascunho', 'em-uso', 'inativo']);
    expect(SOLICITACOES_DO_TIPO_DE_CHAMADO).toEqual(['nao', 'toner', 'equipamento']);
  });

  // As da ordem, do tipo que não existe e do rascunho são só da API, para a tela que ficou para
  // trás: a ordem manda todos os tipos, e só o Rascunho mostra "Criar o tipo" e "Descartar".
  it('guarda as frases das recusas da spec e as da API', () => {
    expect(M).toEqual({
      nome: 'Escreva o nome.',
      nomeLongo: 'Use até 40 caracteres.',
      nomeRepetido: 'Já existe um tipo com esse nome.',
      icone: 'Escolha o ícone.',
      frase: 'Escreva a frase.',
      fraseLonga: 'Use até 80 caracteres.',
      numeroDoPrazo: 'Use um número inteiro de 1 a 999.',
      respostaMaior: 'A resposta passa da resolução. Use uma resposta menor.',
      quemAtende: 'Escolha uma conta que atende os chamados.',
      tipoDeAtivo: 'Escolha o tipo de ativo do equipamento.',
      tonerSemAtivo: "O Toner precisa do ativo: ligue 'Pede o ativo'.",
      solicitacaoSemAlcance:
        "Só quem atende as solicitações em todos os locais liga o 'Gera uma Solicitação'.",
      ordem: 'A ordem precisa ter todos os tipos, uma vez cada.',
      naoEncontrado: 'Tipo de chamado não encontrado.',
      naoERascunho: 'Este tipo não é mais um rascunho.',
      rascunho: "O rascunho entra em uso pelo 'Criar o tipo'.",
    });
  });
});

describe('conferirTipoDeChamado', () => {
  it('aceita o Toner como está gravado e devolve o tipo limpo, com o nome normalizado', () => {
    expect(conferirTipoDeChamado(TONER, NO_TONER)).toEqual({
      ok: true,
      tipo: { ...TONER, nomeNormalizado: 'toner' },
    });
  });

  it('aceita o Equipamento novo, com quem atende por padrão e o tipo de ativo', () => {
    expect(conferirTipoDeChamado(EQUIPAMENTO_NOVO, NO_EQUIPAMENTO_NOVO)).toEqual({
      ok: true,
      tipo: { ...EQUIPAMENTO_NOVO, nomeNormalizado: 'equipamento novo' },
    });
  });

  it('não leva para a gravação o que vier a mais no pedido', () => {
    const comAMais = { ...TONER, situacao: 'inativo', ordem: 1 } as PedidoDoTipoDeChamado;
    expect(conferirTipoDeChamado(comAMais, NO_TONER)).toEqual({
      ok: true,
      tipo: { ...TONER, nomeNormalizado: 'toner' },
    });
  });

  it('junta as recusas de todos os campos de uma vez', () => {
    const tudoErrado: PedidoDoTipoDeChamado = {
      ...EQUIPAMENTO_NOVO,
      nome: ' ',
      icone: 'desktop-tower',
      frase: null,
      prazo: prazo({ valor: 0, unidade: 'h' }, { valor: 3, unidade: 'd' }),
      atendePorPadrao: 'conta-que-nao-existe',
      tipoDeAtivoDoEquipamento: null,
    };
    expect(
      recusas(tudoErrado, {
        ...NO_EQUIPAMENTO_NOVO,
        antes: { geraSolicitacao: 'nao', tipoDeAtivoDoEquipamento: null },
        quemAtende: null,
        alcanceDasSolicitacoes: SO_CAMPINAS,
      }),
    ).toEqual({
      nome: M.nome,
      icone: M.icone,
      frase: M.frase,
      resposta: M.numeroDoPrazo,
      atendePorPadrao: M.quemAtende,
      tipoDeAtivoDoEquipamento: M.tipoDeAtivo,
      geraSolicitacao: M.solicitacaoSemAlcance,
    });
  });

  describe('o nome', () => {
    it('grava numa linha, sem os espaços das pontas e com os repetidos juntados', () => {
      const conferencia = conferirTipoDeChamado(
        { ...TONER, nome: '  Toner   da\nrecepção ' },
        NO_TONER,
      );
      expect(conferencia.ok && conferencia.tipo.nome).toBe('Toner da recepção');
    });

    it('normaliza sem acento e maiúsculas, para o nome único do banco', () => {
      const conferencia = conferirTipoDeChamado({ ...TONER, nome: 'Toner da RECEPÇÃO' }, NO_TONER);
      expect(conferencia.ok && conferencia.tipo.nomeNormalizado).toBe('toner da recepcao');
    });

    it('recusa o vazio e o de mais de 40 caracteres', () => {
      expect(recusas({ ...TONER, nome: '' }, NO_TONER)).toEqual({ nome: M.nome });
      expect(recusas({ ...TONER, nome: ' \n ' }, NO_TONER)).toEqual({ nome: M.nome });
      expect(recusas({ ...TONER, nome: 'T'.repeat(41) }, NO_TONER)).toEqual({ nome: M.nomeLongo });
      expect(recusas({ ...TONER, nome: 'T'.repeat(40) }, NO_TONER)).toEqual({});
    });

    it('conta o tamanho em caracteres, como o banco', () => {
      expect(recusas({ ...TONER, nome: '🖨'.repeat(40) }, NO_TONER)).toEqual({});
      expect(recusas({ ...TONER, nome: '🖨'.repeat(41) }, NO_TONER)).toEqual({
        nome: M.nomeLongo,
      });
    });
  });

  describe('o ícone', () => {
    it('recusa o que não é da lista', () => {
      expect(recusas({ ...TONER, icone: 'printer' }, NO_TONER)).toEqual({ icone: M.icone });
      expect(recusas({ ...TONER, icone: '' }, NO_TONER)).toEqual({ icone: M.icone });
    });

    it('aceita cada um dos 16', () => {
      for (const icone of ICONES_DO_TIPO_DE_CHAMADO) {
        expect(recusas({ ...TONER, icone }, NO_TONER)).toEqual({});
      }
    });
  });

  describe('a frase', () => {
    it('grava numa linha, sem os espaços das pontas e com os repetidos juntados', () => {
      const pedido = { ...TONER, frase: ' Sem toner\nou  fraca ' };
      const conferencia = conferirTipoDeChamado(pedido, NO_TONER);
      expect(conferencia.ok && conferencia.tipo.frase).toBe('Sem toner ou fraca');
    });

    it('pede a frase fora do Rascunho', () => {
      expect(recusas({ ...TONER, frase: null }, NO_TONER)).toEqual({ frase: M.frase });
      expect(recusas({ ...TONER, frase: '  ' }, NO_TONER)).toEqual({ frase: M.frase });
      const inativo = { ...NO_TONER, situacao: 'inativo' } as const;
      expect(recusas({ ...TONER, frase: null }, inativo)).toEqual({ frase: M.frase });
    });

    it('aceita o Rascunho sem a frase, gravada nula', () => {
      const rascunho = { ...NO_TONER, situacao: 'rascunho' } as const;
      const conferencia = conferirTipoDeChamado({ ...TONER, frase: '   ' }, rascunho);
      expect(conferencia.ok && conferencia.tipo.frase).toBeNull();
    });

    it('recusa a de mais de 80 caracteres, também no Rascunho', () => {
      const longa = { ...TONER, frase: 'a'.repeat(81) };
      expect(recusas(longa, NO_TONER)).toEqual({ frase: M.fraseLonga });
      const rascunho = { ...NO_TONER, situacao: 'rascunho' } as const;
      expect(recusas(longa, rascunho)).toEqual({ frase: M.fraseLonga });
      expect(recusas({ ...TONER, frase: 'a'.repeat(80) }, NO_TONER)).toEqual({});
    });

    it('passa o Rascunho do "Novo tipo" e pede a frase ao criar o tipo', () => {
      const novoTipo: PedidoDoTipoDeChamado = {
        nome: 'Novo tipo',
        icone: 'reticencias',
        frase: null,
        prazo: prazo({ valor: 1, unidade: 'h' }, { valor: 1, unidade: 'd' }),
        atendePorPadrao: null,
        semNinguem: 'triagem',
        podeVirarOs: false,
        geraSolicitacao: 'nao',
        tipoDeAtivoDoEquipamento: null,
        pedeOAtivo: false,
        apareceParaOColaborador: true,
        soATiAbre: false,
      };
      const contexto: ContextoDoTipoDeChamado = {
        ...NA_IMPRESSORA,
        situacao: 'rascunho',
        formulario: formularioCom([]),
      };
      expect(recusas(novoTipo, contexto)).toEqual({});
      expect(recusas(novoTipo, { ...contexto, situacao: 'em-uso' })).toEqual({ frase: M.frase });
    });
  });

  describe('o prazo', () => {
    it('recusa o número fora de 1 a 999 ou com casas, no número', () => {
      for (const valor of [0, 1000, 1.5, -3, Number.NaN]) {
        const naResposta = prazo({ valor, unidade: 'min' }, { valor: 8, unidade: 'h' });
        expect(recusas({ ...TONER, prazo: naResposta }, NO_TONER)).toEqual({
          resposta: M.numeroDoPrazo,
        });
        const naResolucao = prazo({ valor: 30, unidade: 'min' }, { valor, unidade: 'h' });
        expect(recusas({ ...TONER, prazo: naResolucao }, NO_TONER)).toEqual({
          resolucao: M.numeroDoPrazo,
        });
      }
    });

    it('aceita 1 e 999', () => {
      const pedido = {
        ...TONER,
        prazo: prazo({ valor: 1, unidade: 'min' }, { valor: 999, unidade: 'd' }),
      };
      expect(recusas(pedido, NO_TONER)).toEqual({});
    });

    it('recusa a resposta maior que a resolução, na resposta', () => {
      const pedido = {
        ...TONER,
        prazo: prazo({ valor: 10, unidade: 'h' }, { valor: 8, unidade: 'h' }),
      };
      expect(recusas(pedido, NO_TONER)).toEqual({ resposta: M.respostaMaior });
    });

    it('aceita a resposta igual à resolução, em outra unidade', () => {
      const pedido = {
        ...TONER,
        prazo: prazo({ valor: 480, unidade: 'min' }, { valor: 8, unidade: 'h' }),
      };
      expect(recusas(pedido, NO_TONER)).toEqual({});
    });

    it('compara com o dia útil do horário da TI de quando o tipo é gravado', () => {
      // O dia útil do horário padrão tem 10 h (das 08:00 às 18:00); o dia corrido, 24 h.
      const onzeHorasEUmDia = (modo: PrazoDoTipo['modo']) => ({
        ...TONER,
        prazo: prazo({ valor: 11, unidade: 'h' }, { valor: 1, unidade: 'd' }, modo),
      });
      expect(recusas(onzeHorasEUmDia('horario'), NO_TONER)).toEqual({ resposta: M.respostaMaior });
      expect(recusas(onzeHorasEUmDia('corridas'), NO_TONER)).toEqual({});
      const noveHoras = {
        ...TONER,
        prazo: prazo({ valor: 9, unidade: 'h' }, { valor: 1, unidade: 'd' }),
      };
      expect(recusas(noveHoras, NO_TONER)).toEqual({});
      // Com o horário das 08:00 às 12:00, o dia útil tem 4 h.
      const meioPeriodo = { ...NO_TONER, horario: { ...HORARIO_DA_TI_PADRAO, fim: 12 * 60 } };
      expect(recusas(noveHoras, meioPeriodo)).toEqual({ resposta: M.respostaMaior });
    });

    it('não compara quando um dos números é recusado', () => {
      const semResolucao = {
        ...TONER,
        prazo: prazo({ valor: 10, unidade: 'h' }, { valor: 0, unidade: 'h' }),
      };
      expect(recusas(semResolucao, NO_TONER)).toEqual({ resolucao: M.numeroDoPrazo });
    });
  });

  describe('o atendimento', () => {
    it('aceita a conta ativa que atende os chamados de um local só', () => {
      const pedido = { ...TONER, atendePorPadrao: DIEGO.id };
      expect(recusas(pedido, { ...NO_TONER, quemAtende: DIEGO })).toEqual({});
    });

    it('recusa a conta desativada, a sem `chamados.atender` em algum local e a que não é da organização', () => {
      const pedido = { ...TONER, atendePorPadrao: DIEGO.id };
      const comDiego = (quemAtende: ContaQueAtendePorPadrao | null) => ({
        ...NO_TONER,
        quemAtende,
      });
      const recusa = { atendePorPadrao: M.quemAtende };
      expect(recusas(pedido, comDiego({ ...DIEGO, ativa: false }))).toEqual(recusa);
      expect(recusas(pedido, comDiego({ ...DIEGO, alcance: null }))).toEqual(recusa);
      expect(recusas(pedido, comDiego({ ...DIEGO, alcance: new Set() }))).toEqual(recusa);
      expect(recusas(pedido, comDiego(null))).toEqual(recusa);
      expect(recusas(pedido, comDiego({ ...DIEGO, id: 'conta-renato' }))).toEqual(recusa);
    });

    it('confere a conta como está agora, como na Impressora de Diego desativado', () => {
      const pedido = { ...IMPRESSORA, atendePorPadrao: DIEGO.id, frase: 'Mancha ou atola' };
      const desativado = { ...NA_IMPRESSORA, quemAtende: { ...DIEGO, ativa: false } };
      expect(recusas(pedido, desativado)).toEqual({ atendePorPadrao: M.quemAtende });
    });

    it('pede quem atende por padrão para o "Fica com <pessoa> mesmo assim"', () => {
      const sozinho = { ...TONER, semNinguem: 'fica' } as const;
      expect(recusas(sozinho, NO_TONER)).toEqual({ atendePorPadrao: M.quemAtende });
      const comDiego = { ...sozinho, atendePorPadrao: DIEGO.id };
      expect(recusas(comDiego, { ...NO_TONER, quemAtende: DIEGO })).toEqual({});
    });
  });

  describe('o que acontece depois', () => {
    it('pede o tipo de ativo do equipamento, e ativo', () => {
      const semTipo = { ...EQUIPAMENTO_NOVO, tipoDeAtivoDoEquipamento: null };
      expect(recusas(semTipo, NO_EQUIPAMENTO_NOVO)).toEqual({
        tipoDeAtivoDoEquipamento: M.tipoDeAtivo,
      });
      const inativo = { ...EQUIPAMENTO_NOVO, tipoDeAtivoDoEquipamento: TABLET };
      expect(recusas(inativo, NO_EQUIPAMENTO_NOVO)).toEqual({
        tipoDeAtivoDoEquipamento: M.tipoDeAtivo,
      });
    });

    it('recusa manter o tipo de ativo que foi inativado depois de escolhido', () => {
      const tabletInativado = {
        ...NO_EQUIPAMENTO_NOVO,
        antes: { geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: TABLET },
      } as const;
      const pedido = { ...EQUIPAMENTO_NOVO, tipoDeAtivoDoEquipamento: TABLET };
      expect(recusas(pedido, tabletInativado)).toEqual({
        tipoDeAtivoDoEquipamento: M.tipoDeAtivo,
      });
    });

    it('grava o tipo de ativo só no Equipamento', () => {
      const tonerComTipo = conferirTipoDeChamado(
        { ...TONER, tipoDeAtivoDoEquipamento: NOTEBOOK },
        NO_TONER,
      );
      expect(tonerComTipo.ok && tonerComTipo.tipo.tipoDeAtivoDoEquipamento).toBeNull();
      const desligado = conferirTipoDeChamado(
        { ...EQUIPAMENTO_NOVO, geraSolicitacao: 'nao' },
        NO_EQUIPAMENTO_NOVO,
      );
      expect(desligado.ok && desligado.tipo.tipoDeAtivoDoEquipamento).toBeNull();
    });

    it('pede o "Pede o ativo" no Toner', () => {
      expect(recusas({ ...TONER, pedeOAtivo: false }, NO_TONER)).toEqual({
        pedeOAtivo: M.tonerSemAtivo,
      });
    });

    it('confere o "Pede o ativo" pelo formulário gravado', () => {
      const semCampo = { ...NA_IMPRESSORA, formulario: SEM_ATIVO };
      expect(recusas(IMPRESSORA, semCampo)).toEqual({
        pedeOAtivo: 'Pede o ativo: inclua no formulário um campo Ativo obrigatório.',
      });
      const primeiroAtivoRecusado =
        "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'.";
      const condicional = formularioCom([
        QUAL_COR,
        { ...QUAL_IMPRESSORA, condicao: [{ campoId: 'cor', opcaoId: 'preto' }] },
      ]);
      const opcional = formularioCom([{ ...QUAL_IMPRESSORA, obrigatorio: false }]);
      const soDaTi = formularioCom([{ ...QUAL_IMPRESSORA, soDaTi: true }]);
      for (const formulario of [condicional, opcional, soDaTi]) {
        expect(recusas(IMPRESSORA, { ...NA_IMPRESSORA, formulario })).toEqual({
          pedeOAtivo: primeiroAtivoRecusado,
        });
      }
    });

    it('não confere o formulário sem o "Pede o ativo"', () => {
      const semCampo = { ...NA_IMPRESSORA, formulario: SEM_ATIVO };
      expect(recusas({ ...IMPRESSORA, pedeOAtivo: false }, semCampo)).toEqual({});
    });
  });

  describe('o "Gera uma Solicitação" e o alcance das solicitações', () => {
    const deBruno = (contexto: ContextoDoTipoDeChamado): ContextoDoTipoDeChamado => ({
      ...contexto,
      alcanceDasSolicitacoes: SO_CAMPINAS,
    });
    const recusa = { geraSolicitacao: M.solicitacaoSemAlcance };

    it('recusa ligá-lo a quem não atende as solicitações em todos os locais', () => {
      const liga = {
        ...IMPRESSORA,
        geraSolicitacao: 'equipamento',
        tipoDeAtivoDoEquipamento: NOTEBOOK,
      } as const;
      expect(recusas(liga, deBruno(NA_IMPRESSORA))).toEqual(recusa);
      const semAtender = { ...NA_IMPRESSORA, alcanceDasSolicitacoes: null };
      expect(recusas(liga, semAtender)).toEqual(recusa);
      expect(recusas(liga, NA_IMPRESSORA)).toEqual({});
    });

    it('deixa desligá-lo e gravar o resto sem pedir a permissão', () => {
      const desligado = { ...TONER, geraSolicitacao: 'nao' } as const;
      expect(recusas(desligado, deBruno(NO_TONER))).toEqual({});
      expect(recusas({ ...TONER, frase: 'Sem toner' }, deBruno(NO_TONER))).toEqual({});
      expect(recusas(EQUIPAMENTO_NOVO, deBruno(NO_EQUIPAMENTO_NOVO))).toEqual({});
    });

    it('pede a permissão para gerar outra solicitação', () => {
      const deTonerParaEquipamento = {
        ...TONER,
        geraSolicitacao: 'equipamento',
        tipoDeAtivoDoEquipamento: NOTEBOOK,
      } as const;
      expect(recusas(deTonerParaEquipamento, deBruno(NO_TONER))).toEqual(recusa);
      const deNotebookParaMonitor = { ...EQUIPAMENTO_NOVO, tipoDeAtivoDoEquipamento: MONITOR };
      expect(recusas(deNotebookParaMonitor, deBruno(NO_EQUIPAMENTO_NOVO))).toEqual(recusa);
      const deEquipamentoParaToner = {
        ...EQUIPAMENTO_NOVO,
        geraSolicitacao: 'toner',
        pedeOAtivo: true,
      } as const;
      const comOAtivo = { ...NO_EQUIPAMENTO_NOVO, formulario: DO_TONER };
      expect(recusas(deEquipamentoParaToner, deBruno(comOAtivo))).toEqual(recusa);
    });
  });
});

describe('ligaASolicitacao', () => {
  const nao = { geraSolicitacao: 'nao', tipoDeAtivoDoEquipamento: null } as const;
  const toner = { geraSolicitacao: 'toner', tipoDeAtivoDoEquipamento: null } as const;
  const notebook = { geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: NOTEBOOK } as const;
  const monitor = { geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: MONITOR } as const;

  it('liga quando o tipo passa a gerar uma solicitação, também no duplicar, sem o antes', () => {
    expect(ligaASolicitacao(nao, toner)).toBe(true);
    expect(ligaASolicitacao(nao, notebook)).toBe(true);
    expect(ligaASolicitacao(null, toner)).toBe(true);
    expect(ligaASolicitacao(null, nao)).toBe(false);
  });

  it('liga quando o tipo passa a gerar outra solicitação ou outro tipo de ativo', () => {
    expect(ligaASolicitacao(toner, notebook)).toBe(true);
    expect(ligaASolicitacao(notebook, toner)).toBe(true);
    expect(ligaASolicitacao(notebook, monitor)).toBe(true);
  });

  it('não liga ao manter nem ao desligar', () => {
    expect(ligaASolicitacao(toner, toner)).toBe(false);
    expect(ligaASolicitacao(notebook, notebook)).toBe(false);
    expect(ligaASolicitacao(toner, nao)).toBe(false);
    expect(ligaASolicitacao(notebook, nao)).toBe(false);
    expect(ligaASolicitacao(nao, nao)).toBe(false);
  });
});
