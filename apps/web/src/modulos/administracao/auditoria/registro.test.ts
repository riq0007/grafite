import { descreverFuso } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import { camposDoDetalhe, type Registro, textoDoAlvo } from './registro.ts';

const formatar = (data: Date) => data.toISOString();

const doAtivo = (extras: Partial<Registro>): Registro => ({
  id: 'r1',
  momento: '2026-10-11T14:05:00.000Z',
  acao: 'ativo.alterado',
  rotulo: 'Ativo alterado',
  ator: { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' },
  alvo: { tipo: 'ativo', id: 'a1', nome: 'HP LaserJet M404', usuario: null },
  antes: null,
  depois: null,
  dados: null,
  ip: null,
  codigoDeRastreio: null,
  ...extras,
});

/** A visão do ativo que a API grava no antes e no depois. */
const visao = (campos: Record<string, string>, travados: string[] = []) => ({
  tipo: 'Impressora',
  modelo: 'HP LaserJet M404',
  situacao: 'ativo',
  campos,
  travados,
  restritos: ['Valor de compra'],
});

/** O detalhe sem as quatro linhas fixas: quem fez, o alvo, o IP e o código de rastreio. */
const doRegistro = (registro: Registro) => camposDoDetalhe(registro, formatar).slice(4);

/** A ordem em que o jsonb devolve as chaves: pelo tamanho e, no mesmo tamanho, pelo alfabeto. */
const doBanco = (visao: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(visao).sort(
      ([uma], [outra]) => uma.length - outra.length || (uma < outra ? -1 : 1),
    ),
  );

describe('o registro de um ativo na auditoria', () => {
  it('o alvo pelo nome do ativo', () => {
    expect(textoDoAlvo({ tipo: 'ativo', id: 'a1', nome: 'HP LaserJet M404', usuario: null })).toBe(
      'Ativo: HP LaserJet M404',
    );
  });

  it('os campos um a um, com o antes → depois, sem o que não mudou nem os restritos da visão', () => {
    const registro = doAtivo({
      antes: visao({
        Patrimônio: 'PAT-00412',
        Local: 'Jundiaí › Almoxarifado',
        'Valor de compra': 'R$ 1.500,00',
      }),
      depois: visao(
        {
          Patrimônio: 'PAT-00412',
          Local: 'Jundiaí › Expedição',
          Hostname: 'IMP-01',
          'Valor de compra': 'R$ 1.500,00',
        },
        ['Local'],
      ),
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Local', valor: 'Jundiaí › Almoxarifado → Jundiaí › Expedição' },
      { rotulo: 'Hostname', valor: '— → IMP-01' },
      { rotulo: 'Travados', valor: '— → Local' },
    ]);
  });

  it('o cadastro mostra os campos como ficaram', () => {
    const registro = doAtivo({
      acao: 'ativo.criado',
      rotulo: 'Ativo cadastrado',
      depois: visao({ Patrimônio: 'PAT-00412' }),
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Tipo', valor: 'Impressora' },
      { rotulo: 'Modelo', valor: 'HP LaserJet M404' },
      { rotulo: 'Situação', valor: 'Ativo' },
      { rotulo: 'Patrimônio', valor: 'PAT-00412' },
      { rotulo: 'Travados', valor: '—' },
    ]);
  });

  it('a ligação livre pelo outro ativo, sem os ids', () => {
    const registro = doAtivo({
      acao: 'ativo.ligado',
      rotulo: 'Ligação feita',
      dados: { ligacaoId: 'l1', outro: { id: 'a3', rotulo: 'Switch do rack' } },
    });
    expect(doRegistro(registro)).toEqual([{ rotulo: 'Outro ativo', valor: 'Switch do rack' }]);
  });
});

describe('o registro de um segredo na auditoria', () => {
  const doSegredo = (extras: Partial<Registro>): Registro =>
    doAtivo({
      acao: 'segredo.alterado',
      rotulo: 'Segredo editado',
      alvo: { tipo: 'segredo', id: 's1', nome: 'Switch do CPD', usuario: null },
      ...extras,
    });

  it('o alvo pelo nome do segredo', () => {
    expect(textoDoAlvo(doSegredo({}).alvo)).toBe('Segredo: Switch do CPD');
  });

  it('os dados do segredo pelo rótulo, com o tipo e a classificação em texto', () => {
    const registro = doSegredo({
      antes: { tipo: 'usuario-e-senha', classificacao: 'pessoal', identificador: 'adm' },
      depois: {
        tipo: 'conta-administrativa',
        classificacao: 'equipamento',
        identificador: 'admin',
      },
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Tipo', valor: 'Usuário e senha → Conta administrativa' },
      { rotulo: 'Classificação', valor: 'Pessoal → Equipamento' },
      { rotulo: 'Identificador', valor: 'adm → admin' },
    ]);
  });

  it('o acesso pelos nomes dos titulares, antes e depois', () => {
    const registro = doSegredo({
      acao: 'acesso-do-segredo.alterado',
      rotulo: 'Acesso do segredo alterado',
      antes: {
        acesso: [
          { tipo: 'conta', id: 'c1', nome: 'Ana Souza' },
          { tipo: 'grupo', id: 'g1', nome: 'Suporte' },
        ],
      },
      depois: { acesso: [{ tipo: 'conta', id: 'c1', nome: 'Ana Souza' }] },
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Acesso', valor: 'Ana Souza, Suporte → Ana Souza' },
    ]);
  });

  it('a recusa da revelação pelo motivo, em texto', () => {
    const registro = doSegredo({
      acao: 'revelacao-do-segredo.recusada',
      rotulo: 'Revelação do segredo recusada',
      dados: { motivo: 'cofre-fechado' },
    });
    expect(doRegistro(registro)).toEqual([{ rotulo: 'Motivo', valor: 'Cofre fechado' }]);
  });
});

describe('o registro de um consumível na auditoria', () => {
  // Spec auditoria, "Eventos dos consumíveis registrados"; change p4b-consumiveis.
  const doConsumivel = (extras: Partial<Registro>): Registro => ({
    ...doAtivo({}),
    acao: 'consumivel.alterado',
    rotulo: 'Consumível editado',
    alvo: { tipo: 'consumivel', id: 'cf258a', nome: null, usuario: null },
    ...extras,
  });

  it('o alvo pelo tipo, e os dados pelo rótulo, com o tipo, a cor e as listas em texto', () => {
    expect(textoDoAlvo(doConsumivel({}).alvo)).toBe('Consumível');
    const registro = doConsumivel({
      antes: {
        codigoDoFabricante: 'CF258A',
        tipo: 'toner',
        cor: 'preto',
        rendimento: 3000,
        fornecedores: ['HP Brasil'],
        modelos: ['HP LaserJet M404'],
      },
      depois: {
        codigoDoFabricante: 'CF258X',
        tipo: 'cilindro',
        cor: 'magenta',
        rendimento: 10000,
        fornecedores: ['HP Brasil'],
        modelos: ['HP LaserJet M404', 'HP LaserJet M428'],
      },
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Código', valor: 'CF258A → CF258X' },
      { rotulo: 'Tipo', valor: 'Toner → Cilindro' },
      { rotulo: 'Cor', valor: 'Preto → Magenta' },
      { rotulo: 'Rendimento', valor: '3.000 → 10.000' },
      { rotulo: 'Modelos', valor: 'HP LaserJet M404 → HP LaserJet M404, HP LaserJet M428' },
    ]);
  });
});

describe('o registro do estoque na auditoria', () => {
  // Spec auditoria, "Eventos do estoque registrados"; change p4c-estoque, design, decisão 7.
  const doEstoque = (extras: Partial<Registro>): Registro => ({
    ...doAtivo({}),
    acao: 'estoque.saida',
    rotulo: 'Saída do estoque lançada',
    alvo: { tipo: 'consumivel', id: 'cf258a', nome: null, usuario: null },
    antes: null,
    ...extras,
  });

  it('Saída registrada: o consumível, a quantidade, a origem, o ativo e o contador, pelo rótulo', () => {
    const registro = doEstoque({
      depois: {
        consumivel: 'CF258A',
        quantidade: 1,
        origem: 'Jundiaí › Almoxarifado',
        ativo: 'HP LaserJet M404 · PAT-00412',
        contador: 45210,
        contadorLidoEm: '2026-10-21T17:32:00.000Z',
        observacao: 'Troca do toner',
      },
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Consumível', valor: 'CF258A' },
      { rotulo: 'Quantidade', valor: '1' },
      { rotulo: 'Origem', valor: 'Jundiaí › Almoxarifado' },
      { rotulo: 'Ativo', valor: 'HP LaserJet M404 · PAT-00412' },
      { rotulo: 'Total de páginas', valor: '45.210' },
      { rotulo: 'Lido em', valor: formatar(new Date('2026-10-21T17:32:00.000Z')) },
      { rotulo: 'Observação', valor: 'Troca do toner' },
    ]);
  });

  it('a entrada com o fornecedor e a nota, e o ajuste com o motivo em texto', () => {
    expect(
      doRegistro(
        doEstoque({
          acao: 'estoque.entrada',
          depois: {
            consumivel: 'CF258A',
            quantidade: 10,
            destino: 'Jundiaí › Almoxarifado',
            fornecedor: 'HP Brasil',
            notaFiscal: '12345',
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Consumível', valor: 'CF258A' },
      { rotulo: 'Quantidade', valor: '10' },
      { rotulo: 'Destino', valor: 'Jundiaí › Almoxarifado' },
      { rotulo: 'Fornecedor', valor: 'HP Brasil' },
      { rotulo: 'Nota fiscal', valor: '12345' },
    ]);
    expect(
      doRegistro(doEstoque({ acao: 'estoque.ajuste', depois: { motivo: 'inventario' } })),
    ).toEqual([{ rotulo: 'Motivo', valor: 'Inventário' }]);
  });

  it('Mínimo mudado: o antes e o depois, com o consumível e o local nos dados', () => {
    expect(
      doRegistro(
        doEstoque({
          acao: 'estoque.minimo',
          antes: { minimo: 5 },
          depois: { minimo: 8 },
          dados: { consumivel: 'CF258A', local: 'Jundiaí › Almoxarifado' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Mínimo', valor: '5 → 8' },
      { rotulo: 'Consumível', valor: 'CF258A' },
      { rotulo: 'Local', valor: 'Jundiaí › Almoxarifado' },
    ]);
  });
});

describe('o registro das solicitações na auditoria', () => {
  // Spec auditoria, "Eventos das solicitações registrados"; change p4d-solicitacoes, design,
  // decisão 8.
  const daSolicitacao = (extras: Partial<Registro>): Registro => ({
    ...doAtivo({}),
    acao: 'solicitacao.registrada',
    rotulo: 'Solicitação registrada',
    alvo: {
      tipo: 'solicitacao',
      id: 's42',
      nome: '42 · Toner · Joana Prado',
      usuario: null,
    },
    antes: null,
    ...extras,
  });

  it('Solicitação pelo número na auditoria: o alvo diz o número, o tipo e quem pediu', () => {
    expect(textoDoAlvo(daSolicitacao({}).alvo)).toBe('Solicitação: 42 · Toner · Joana Prado');
  });

  it('Toner registrado: o número, o tipo, quem pediu, a impressora e o item, pelo rótulo', () => {
    expect(
      doRegistro(
        daSolicitacao({
          depois: {
            numero: 42,
            tipo: 'toner',
            pessoa: 'Joana Prado',
            impressoras: ['HP LaserJet M404 · PAT-00412'],
            itens: 'PAT-00412: 1 Preto',
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Número', valor: '42' },
      { rotulo: 'Tipo', valor: 'Toner' },
      { rotulo: 'Pedida por', valor: 'Joana Prado' },
      { rotulo: 'Impressoras', valor: 'HP LaserJet M404 · PAT-00412' },
      { rotulo: 'Itens', valor: 'PAT-00412: 1 Preto' },
    ]);
  });

  it('a situação, o pedido, a entrega e o encerramento, em texto', () => {
    expect(
      doRegistro(
        daSolicitacao({
          acao: 'solicitacao.pedida',
          antes: { situacao: 'aberta' },
          depois: {
            situacao: 'aguardando-entrega',
            fornecedor: 'Locadora Sul',
            osDoFornecedor: 'OS-7781',
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Aberta → Aguardando entrega' },
      { rotulo: 'Fornecedor', valor: '— → Locadora Sul' },
      { rotulo: 'OS do fornecedor', valor: '— → OS-7781' },
    ]);
    expect(
      doRegistro(
        daSolicitacao({
          acao: 'solicitacao.entregue',
          antes: { situacao: 'aguardando-entrega' },
          depois: {
            situacao: 'concluida',
            entregues: ['PAT-00412: 1 Preto do estoque, CF258A de Jundiaí › Almoxarifado'],
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Aguardando entrega → Concluída' },
      {
        rotulo: 'Entregues',
        valor: '— → PAT-00412: 1 Preto do estoque, CF258A de Jundiaí › Almoxarifado',
      },
    ]);
    expect(
      doRegistro(
        daSolicitacao({
          acao: 'solicitacao.cancelada',
          antes: { situacao: 'em-atendimento' },
          depois: { situacao: 'cancelada', motivoDoCancelamento: 'Pedido em duplicidade' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Em atendimento → Cancelada' },
      { rotulo: 'Motivo do cancelamento', valor: '— → Pedido em duplicidade' },
    ]);
    expect(
      doRegistro(
        daSolicitacao({
          acao: 'solicitacao.concluida',
          antes: { situacao: 'em-atendimento' },
          depois: {
            situacao: 'concluida',
            oQueFoiFeito: 'Fonte trocada',
            entreguePeloFornecedor: 'Locadora Sul',
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Em atendimento → Concluída' },
      { rotulo: 'O que foi feito', valor: '— → Fonte trocada' },
      { rotulo: 'Entregue pelo fornecedor', valor: '— → Locadora Sul' },
    ]);
    expect(
      doRegistro(daSolicitacao({ depois: { tipo: 'conserto', defeito: 'Não liga' } })),
    ).toEqual([
      { rotulo: 'Tipo', valor: 'Conserto' },
      { rotulo: 'Defeito', valor: 'Não liga' },
    ]);
  });
});

describe('o registro das ordens de serviço na auditoria', () => {
  // Spec auditoria, "Eventos das ordens de serviço registrados"; change p4e-ordens-de-servico,
  // design, decisão 8.
  const daOrdem = (extras: Partial<Registro>): Registro => ({
    ...doAtivo({}),
    acao: 'ordem.aberta',
    rotulo: 'Ordem de serviço aberta',
    alvo: { tipo: 'ordem', id: 'o12', nome: '12 · NB-0031 · Não liga', usuario: null },
    antes: null,
    ...extras,
  });

  it('OS aberta: o alvo diz o número, o ativo e o problema, e os dados vêm pelo rótulo', () => {
    expect(textoDoAlvo(daOrdem({}).alvo)).toBe('Ordem de serviço: 12 · NB-0031 · Não liga');
    expect(
      doRegistro(
        daOrdem({
          depois: {
            numero: 12,
            ativo: 'Dell Latitude 5440 · NB-0031',
            local: 'Jundiaí › Expedição',
            solicitacao: 43,
            problema: 'Não liga',
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Número', valor: '12' },
      { rotulo: 'Ativo', valor: 'Dell Latitude 5440 · NB-0031' },
      { rotulo: 'Local', valor: 'Jundiaí › Expedição' },
      { rotulo: 'Solicitação', valor: '43' },
      { rotulo: 'Problema', valor: 'Não liga' },
    ]);
  });

  it('a situação com o fornecedor, a resolução, a reabertura e a peça, em texto', () => {
    expect(
      doRegistro(
        daOrdem({
          acao: 'ordem.situacao',
          antes: { situacao: 'em-atendimento' },
          depois: {
            situacao: 'aguardando-fornecedor',
            observacao: 'Enviado à assistência',
            fornecedor: 'Dell Assistência',
            osDoFornecedor: 'DL-5521',
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Em atendimento → Aguardando fornecedor' },
      { rotulo: 'Observação', valor: '— → Enviado à assistência' },
      { rotulo: 'Fornecedor', valor: '— → Dell Assistência' },
      { rotulo: 'OS do fornecedor', valor: '— → DL-5521' },
    ]);
    expect(
      doRegistro(
        daOrdem({
          acao: 'ordem.reaberta',
          antes: { situacao: 'resolvida', solucao: 'Fonte trocada' },
          depois: { situacao: 'em-atendimento', motivo: 'Voltou a desligar sozinho' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Resolvida → Em atendimento' },
      { rotulo: 'O que foi feito', valor: 'Fonte trocada → —' },
      { rotulo: 'Motivo', valor: '— → Voltou a desligar sozinho' },
    ]);
    expect(
      doRegistro(
        daOrdem({
          acao: 'ordem.encerrada',
          antes: { situacao: 'aguardando-peca' },
          depois: { situacao: 'encerrada', motivo: 'Equipamento substituído' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Aguardando peça → Encerrada' },
      { rotulo: 'Motivo', valor: '— → Equipamento substituído' },
    ]);
    expect(
      doRegistro(
        daOrdem({
          acao: 'ordem.peca',
          depois: { consumivel: 'FNT-65W', quantidade: 1, local: 'Jundiaí › Almoxarifado' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Consumível', valor: 'FNT-65W' },
      { rotulo: 'Quantidade', valor: '1' },
      { rotulo: 'Local', valor: 'Jundiaí › Almoxarifado' },
    ]);
  });

  it('OS pela solicitação na auditoria: a solicitação passou a Em atendimento, com a OS', () => {
    expect(
      doRegistro(
        daOrdem({
          acao: 'solicitacao.situacao',
          alvo: {
            tipo: 'solicitacao',
            id: 's43',
            nome: '43 · Conserto · Joana Prado',
            usuario: null,
          },
          antes: { situacao: 'aberta' },
          depois: { situacao: 'em-atendimento', ordem: 12 },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Aberta → Em atendimento' },
      { rotulo: 'Ordem de serviço', valor: '— → 12' },
    ]);
  });
});

// Os registros dos chamados (change chamados-da-ti, design, "Os registros dos chamados na
// Auditoria (tarefa 5.28)"): sem JSON e sem chave crua, nos termos das telas dos chamados.
describe('o registro dos chamados na auditoria', () => {
  const doChamado = (extras: Partial<Registro>): Registro => ({
    id: 'r9',
    momento: '2026-11-19T12:00:00.000Z',
    acao: 'chamado.aberto',
    rotulo: 'Chamado aberto',
    ator: { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' },
    alvo: { tipo: 'chamado', id: 'ch1', nome: '#1042 · Toner preto', usuario: null },
    antes: null,
    depois: null,
    dados: null,
    ip: null,
    codigoDeRastreio: null,
    ...extras,
  });
  const doTipo = (extras: Partial<Registro>) =>
    doChamado({
      acao: 'tipo-de-chamado.criado',
      rotulo: 'Tipo de chamado criado',
      alvo: { tipo: 'tipo-de-chamado', id: 't1', nome: 'Toner', usuario: null },
      ...extras,
    });

  /** O Toner de fábrica, como a visão do tipo que a API grava. */
  const toner = {
    nome: 'Toner',
    icone: 'gota',
    frase: 'A impressora está sem toner',
    situacao: 'em-uso',
    ordem: 1,
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

  /** Um campo do formulário com o que a gravação guarda. */
  const campo = (id: string, rotulo: string, extras: Record<string, unknown> = {}) => ({
    id,
    tipo: 'texto-curto',
    rotulo,
    nomeNoResumo: null,
    obrigatorio: false,
    soDaTi: false,
    apagarSeSumir: false,
    opcoes: [],
    tiposDeAtivo: [],
    condicao: [],
    ...extras,
  });
  const PRETO = { id: 'preto', texto: 'Preto' };
  const CIANO = { id: 'ciano', texto: 'Ciano' };

  it('os alvos pelo tipo e pelo nome; os sem id, só pelo tipo', () => {
    const alvo = (tipo: string, nome: string | null = null) => ({
      tipo,
      id: nome ? 'x1' : null,
      nome,
      usuario: null,
    });
    expect(textoDoAlvo(alvo('chamado', '#1042 · Toner preto'))).toBe(
      'Chamado: #1042 · Toner preto',
    );
    expect(textoDoAlvo(alvo('tipo-de-chamado', 'Toner'))).toBe('Tipo de chamado: Toner');
    expect(textoDoAlvo(alvo('resposta-pronta', 'Pedir o print'))).toBe(
      'Resposta pronta: Pedir o print',
    );
    expect(textoDoAlvo(alvo('tipos-de-chamado'))).toBe('Ordem dos tipos de chamado');
    expect(textoDoAlvo(alvo('respostas-prontas'))).toBe('Ordem das respostas prontas');
    expect(textoDoAlvo(alvo('horario-da-ti'))).toBe('Horário da TI');
  });

  it('Chamado aberto: o número com o "#", a pessoa, a situação pelo texto e quem atende', () => {
    const registro = doChamado({
      depois: {
        numero: 1042,
        tipo: 'Toner',
        titulo: 'Toner preto',
        pessoa: 'Marina Lopes',
        situacao: 'em-atendimento',
        responsavel: 'Ana Souza',
        ativo: 'HP LaserJet M404 · PAT-00139',
        solicitacao: 1005,
      },
    });
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Número', valor: '#1042' },
      { rotulo: 'Tipo', valor: 'Toner' },
      { rotulo: 'Título', valor: 'Toner preto' },
      { rotulo: 'Pessoa', valor: 'Marina Lopes' },
      { rotulo: 'Situação', valor: 'Em atendimento' },
      { rotulo: 'Quem atende', valor: 'Ana Souza' },
      { rotulo: 'Ativo', valor: 'HP LaserJet M404 · PAT-00139' },
      { rotulo: 'Solicitação', valor: '1005' },
    ]);
  });

  it('as chaves na ordem das telas, e não na do banco, que guarda o JSON com as curtas primeiro', () => {
    const rotulos = (registro: Registro) => doRegistro(registro).map(({ rotulo }) => rotulo);
    expect(
      rotulos(
        doChamado({
          depois: doBanco({
            numero: 4,
            tipo: 'Impressora',
            titulo: 'Impressora manchando',
            pessoa: 'Marina Lopes',
            situacao: 'triagem',
            ativo: 'Impressora 131 · PAT-00131',
          }),
        }),
      ),
    ).toEqual(['Número', 'Tipo', 'Título', 'Pessoa', 'Situação', 'Ativo']);
    expect(rotulos(doTipo({ depois: doBanco({ ...toner, duplicadoDe: 'Toner' }) }))).toEqual([
      'Nome',
      'Ícone',
      'Frase',
      'Situação',
      'Posição na lista',
      'Prazo',
      'Quem atende por padrão',
      'Se não houver ninguém',
      'Pode virar OS',
      'Gera uma Solicitação',
      'Tipo de ativo do equipamento',
      'Pede o ativo',
      'Aparece para o colaborador',
      'Só a TI abre',
      'Duplicado de',
    ]);
  });

  it('as ações: a situação e quem atende, a OS, o toner e o título, em texto', () => {
    expect(
      doRegistro(
        doChamado({
          acao: 'chamado.assumido',
          antes: { situacao: 'triagem' },
          depois: { situacao: 'em-atendimento', responsavel: 'Ana Souza' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Na triagem → Em atendimento' },
      { rotulo: 'Quem atende', valor: '— → Ana Souza' },
    ]);
    expect(
      doRegistro(
        doChamado({
          acao: 'chamado.aguardando',
          antes: { situacao: 'em-atendimento', responsavel: 'Ana Souza' },
          depois: { situacao: 'aguardando', responsavel: 'Ana Souza' },
        }),
      ),
    ).toEqual([{ rotulo: 'Situação', valor: 'Em atendimento → Aguardando o colaborador' }]);
    expect(doRegistro(doChamado({ acao: 'chamado.virou-os', depois: { os: 1013 } }))).toEqual([
      { rotulo: 'Ordem de serviço', valor: '1013' },
    ]);
    expect(
      doRegistro(
        doChamado({ acao: 'chamado.pediu-toner', depois: { solicitacao: 5, como: 'juntou' } }),
      ),
    ).toEqual([
      { rotulo: 'Solicitação', valor: '5' },
      { rotulo: 'Pedido', valor: 'Juntou-se à solicitação pendente' },
    ]);
    expect(
      doRegistro(
        doChamado({ acao: 'chamado.pediu-toner', depois: { solicitacao: 6, como: 'pediu' } }),
      ).at(-1),
    ).toEqual({ rotulo: 'Pedido', valor: 'Solicitação nova' });
    expect(
      doRegistro(
        doChamado({
          acao: 'chamado.titulo-trocado',
          antes: { titulo: 'Toner' },
          depois: { titulo: 'Toner preto' },
        }),
      ),
    ).toEqual([{ rotulo: 'Título', valor: 'Toner → Toner preto' }]);
  });

  it('a abertura pelo chat e pela TI: a origem em texto, depois da pessoa', () => {
    const aberto = (origem: string) =>
      doChamado({
        ator: { tipo: 'conta', id: 'c-carla', nome: 'Carla Dias', usuario: 'carla.dias' },
        alvo: { tipo: 'chamado', id: 'ch2', nome: '#1045 · Impressora manchando', usuario: null },
        depois: doBanco({
          numero: 1045,
          tipo: 'Impressora',
          titulo: 'Impressora manchando',
          pessoa: 'Fernanda Lima',
          situacao: 'triagem',
          origem,
        }),
      });
    expect(doRegistro(aberto('chat'))).toEqual([
      { rotulo: 'Número', valor: '#1045' },
      { rotulo: 'Tipo', valor: 'Impressora' },
      { rotulo: 'Título', valor: 'Impressora manchando' },
      { rotulo: 'Pessoa', valor: 'Fernanda Lima' },
      { rotulo: 'Origem', valor: 'Chat' },
      { rotulo: 'Situação', valor: 'Na triagem' },
    ]);
    // Quem abriu pelo chat no nome de outra pessoa fica em "Quem fez", e a pessoa, no chamado.
    expect(camposDoDetalhe(aberto('chat'), formatar)[0]).toEqual({
      rotulo: 'Quem fez',
      valor: 'Carla Dias (carla.dias)',
    });
    expect(doRegistro(aberto('ti')).at(4)).toEqual({ rotulo: 'Origem', valor: 'TI' });
  });

  it('o retomar e o reabrir pela pessoa: ela em "Quem fez", com a situação e quem atende em texto', () => {
    const fernanda = {
      tipo: 'conta' as const,
      id: 'c-fernanda',
      nome: 'Fernanda Lima',
      usuario: 'fernanda.lima',
    };
    const alvo = {
      tipo: 'chamado',
      id: 'ch2',
      nome: '#1045 · Impressora manchando',
      usuario: null,
    };
    const retomado = doChamado({
      acao: 'chamado.retomado',
      rotulo: 'Chamado retomado',
      ator: fernanda,
      alvo,
      antes: { situacao: 'aguardando', responsavel: 'Ana Souza' },
      depois: { situacao: 'em-atendimento', responsavel: 'Ana Souza' },
    });
    expect(camposDoDetalhe(retomado, formatar).slice(0, 2)).toEqual([
      { rotulo: 'Quem fez', valor: 'Fernanda Lima (fernanda.lima)' },
      { rotulo: 'Alvo', valor: 'Chamado: #1045 · Impressora manchando' },
    ]);
    expect(doRegistro(retomado)).toEqual([
      { rotulo: 'Situação', valor: 'Aguardando o colaborador → Em atendimento' },
    ]);
    // Reaberto com quem atendia, ou na triagem, quando ele já não atende.
    expect(
      doRegistro(
        doChamado({
          acao: 'chamado.reaberto',
          rotulo: 'Chamado reaberto',
          ator: fernanda,
          alvo,
          antes: { situacao: 'resolvido', responsavel: 'Ana Souza' },
          depois: { situacao: 'em-atendimento', responsavel: 'Ana Souza' },
        }),
      ),
    ).toEqual([{ rotulo: 'Situação', valor: 'Resolvido → Em atendimento' }]);
    expect(
      doRegistro(
        doChamado({
          acao: 'chamado.reaberto',
          rotulo: 'Chamado reaberto',
          ator: fernanda,
          alvo,
          antes: { situacao: 'resolvido', responsavel: 'Ana Souza' },
          depois: { situacao: 'triagem' },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Resolvido → Na triagem' },
      { rotulo: 'Quem atende', valor: 'Ana Souza → —' },
    ]);
  });

  it('Tipo de fábrica criado: cada parte do tipo pelo nome da tela, com os valores em texto', () => {
    expect(doRegistro(doTipo({ depois: toner }))).toEqual([
      { rotulo: 'Nome', valor: 'Toner' },
      { rotulo: 'Ícone', valor: 'Gota' },
      { rotulo: 'Frase', valor: 'A impressora está sem toner' },
      { rotulo: 'Situação', valor: 'Em uso' },
      { rotulo: 'Posição na lista', valor: '1' },
      { rotulo: 'Prazo', valor: 'Responde em 30 min e resolve em 8 h, em horas corridas' },
      { rotulo: 'Quem atende por padrão', valor: 'Ninguém' },
      { rotulo: 'Se não houver ninguém', valor: 'Cai na triagem' },
      { rotulo: 'Pode virar OS', valor: 'Não' },
      { rotulo: 'Gera uma Solicitação', valor: 'Toner' },
      { rotulo: 'Tipo de ativo do equipamento', valor: '—' },
      { rotulo: 'Pede o ativo', valor: 'Sim' },
      { rotulo: 'Aparece para o colaborador', valor: 'Sim' },
      { rotulo: 'Só a TI abre', valor: 'Não' },
    ]);
  });

  it('o tipo alterado e o duplicado: só o que mudou, com o antes → depois', () => {
    const rascunho = {
      ...toner,
      nome: 'Toner colorido',
      situacao: 'rascunho',
      ordem: 10,
      geraSolicitacao: 'nao',
    };
    expect(
      doRegistro(
        doTipo({
          acao: 'tipo-de-chamado.alterado',
          antes: rascunho,
          depois: {
            ...rascunho,
            situacao: 'em-uso',
            atendePorPadrao: 'Ana Souza',
            semNinguem: 'fica',
            geraSolicitacao: 'equipamento',
            tipoDeAtivoDoEquipamento: 'Notebook',
            prazo: { ...toner.prazo, modo: 'horario' },
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Situação', valor: 'Rascunho → Em uso' },
      {
        rotulo: 'Prazo',
        valor:
          'Responde em 30 min e resolve em 8 h, em horas corridas → Responde em 30 min e resolve em 8 h, no horário da TI',
      },
      { rotulo: 'Quem atende por padrão', valor: 'Ninguém → Ana Souza' },
      {
        rotulo: 'Se não houver ninguém',
        valor: 'Cai na triagem → Fica com quem atende por padrão mesmo assim',
      },
      { rotulo: 'Gera uma Solicitação', valor: 'Não → Equipamento' },
      { rotulo: 'Tipo de ativo do equipamento', valor: '— → Notebook' },
    ]);
    expect(doRegistro(doTipo({ depois: { ...rascunho, duplicadoDe: 'Toner' } })).at(-1)).toEqual({
      rotulo: 'Duplicado de',
      valor: 'Toner',
    });
  });

  it('Formulário salvo: campo a campo pelo rótulo, acrescentado, tirado e mudado, e o título do chamado', () => {
    const registro = doTipo({
      acao: 'tipo-de-chamado.formulario-salvo',
      antes: {
        formulario: {
          titulo: { comecaPeloTipo: true, campoId: 'cor' },
          campos: [
            campo('cor', 'Qual cor acabou?', { tipo: 'escolha-unica', opcoes: [PRETO, CIANO] }),
            campo('obs', 'Observação', { tipo: 'texto-longo' }),
          ],
        },
      },
      depois: {
        formulario: {
          titulo: { comecaPeloTipo: false, campoId: 'cor' },
          campos: [
            campo('cor', 'Cor do toner', {
              tipo: 'escolha-unica',
              obrigatorio: true,
              opcoes: [PRETO, CIANO, { id: 'magenta', texto: 'Magenta' }],
            }),
            campo('foto', 'Foto da impressora', { tipo: 'anexo' }),
          ],
        },
      },
      dados: { tipo: 'Toner' },
    });
    expect(doRegistro(registro)).toEqual([
      {
        rotulo: 'Título do chamado',
        valor: 'O nome do tipo e a resposta de “Qual cor acabou?” → A resposta de “Cor do toner”',
      },
      {
        rotulo: 'Cor do toner',
        valor: 'Mudado: o rótulo (antes, “Qual cor acabou?”), agora obrigatório e as opções',
      },
      { rotulo: 'Foto da impressora', valor: 'Acrescentado: Anexo' },
      { rotulo: 'Observação', valor: 'Tirado' },
      { rotulo: 'Tipo', valor: 'Toner' },
    ]);
  });

  it('o formulário com a ordem mudada, o que cada campo muda e o rótulo repetido com o "(2)"', () => {
    const local = campo('local', 'Onde?', { tipo: 'local' });
    const pessoa = campo('pessoa', 'Para quem?', { tipo: 'pessoa', soDaTi: true });
    const registro = doTipo({
      acao: 'tipo-de-chamado.formulario-salvo',
      antes: {
        formulario: { titulo: { comecaPeloTipo: false, campoId: null }, campos: [local, pessoa] },
      },
      depois: {
        formulario: {
          titulo: { comecaPeloTipo: true, campoId: null },
          campos: [
            { ...pessoa, soDaTi: false, apagarSeSumir: true, nomeNoResumo: 'Pessoa' },
            { ...local, tipo: 'ativo', tiposDeAtivo: ['impressora'], condicao: [{ campoId: 'x' }] },
            campo('obs1', 'Observação'),
            campo('obs2', 'Observação'),
          ],
        },
      },
    });
    expect(doRegistro(registro)).toEqual([
      {
        rotulo: 'Para quem?',
        valor:
          'Mudado: o nome no resumo, agora a pessoa também vê e agora apaga a resposta se o campo sumir',
      },
      {
        rotulo: 'Onde?',
        valor: 'Mudado: o tipo (antes, Local), os tipos de ativo e a condição',
      },
      { rotulo: 'Observação', valor: 'Acrescentado: Texto curto' },
      { rotulo: 'Observação (2)', valor: 'Acrescentado: Texto curto' },
      { rotulo: 'Ordem dos campos', valor: 'Onde?, Para quem? → Para quem?, Onde?' },
    ]);
  });

  it('as respostas prontas: a espera, os tipos (sem nenhum, todos) e a ordem', () => {
    const resposta = (extras: Partial<Registro>) =>
      doChamado({
        acao: 'resposta-pronta.criada',
        alvo: { tipo: 'resposta-pronta', id: 'rp1', nome: 'Pedir o print', usuario: null },
        ...extras,
      });
    expect(
      doRegistro(
        resposta({
          depois: {
            rotulo: 'Pedir o print',
            texto: 'Oi, {nome}! Pode mandar o print?',
            esperaAResposta: true,
            opcoes: [],
            tipos: [],
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Rótulo', valor: 'Pedir o print' },
      { rotulo: 'Texto', valor: 'Oi, {nome}! Pode mandar o print?' },
      { rotulo: 'Espera a resposta', valor: 'Sim' },
      { rotulo: 'Opções da pergunta', valor: 'Sem pergunta' },
      { rotulo: 'Tipos', valor: 'Todos os tipos' },
    ]);
    expect(
      doRegistro(
        resposta({
          acao: 'resposta-pronta.alterada',
          antes: {
            rotulo: 'Pedir o print',
            texto: 'a',
            esperaAResposta: true,
            opcoes: [],
            tipos: [],
          },
          depois: {
            rotulo: 'Pedir o print',
            texto: 'a',
            esperaAResposta: false,
            opcoes: ['Sim', 'Não'],
            tipos: ['Toner', 'Impressora'],
          },
        }),
      ),
    ).toEqual([
      { rotulo: 'Espera a resposta', valor: 'Sim → Não' },
      { rotulo: 'Opções da pergunta', valor: 'Sem pergunta → Sim, Não' },
      { rotulo: 'Tipos', valor: 'Todos os tipos → Toner, Impressora' },
    ]);
    expect(
      doRegistro(
        resposta({
          acao: 'respostas-prontas.ordenadas',
          alvo: { tipo: 'respostas-prontas', id: null, nome: null, usuario: null },
          antes: { ordem: ['Pedir o print', 'Pedir o caminho'] },
          depois: { ordem: ['Pedir o caminho', 'Pedir o print'] },
        }),
      ),
    ).toEqual([
      {
        rotulo: 'Ordem',
        valor: 'Pedir o print, Pedir o caminho → Pedir o caminho, Pedir o print',
      },
    ]);
  });

  it('Horário da TI alterado: os dias na frase, as horas, o fuso pelo nome e os relógios da troca', () => {
    const agora = new Date();
    const registro = doChamado({
      acao: 'horario-da-ti.alterado',
      alvo: { tipo: 'horario-da-ti', id: null, nome: null, usuario: null },
      antes: {
        dias: [1, 2, 3, 4, 5],
        inicio: 480,
        fim: 1080,
        fuso: 'America/Sao_Paulo',
        cargaCheia: 5,
      },
      depois: {
        dias: [1, 2, 3, 4, 5, 6],
        inicio: 480,
        fim: 1020,
        fuso: 'America/Manaus',
        cargaCheia: 6,
      },
      dados: { relogiosFechados: 3 },
    });
    const fuso = (id: string) => descreverFuso(id, agora).rotulo;
    expect(doRegistro(registro)).toEqual([
      { rotulo: 'Dias', valor: 'De segunda a sexta → De segunda a sábado' },
      { rotulo: 'Fim', valor: '18:00 → 17:00' },
      {
        rotulo: 'Fuso horário',
        valor: `${fuso('America/Sao_Paulo')} → ${fuso('America/Manaus')}`,
      },
      { rotulo: 'Carga cheia', valor: '5 → 6' },
      { rotulo: 'Chamados que contavam no horário da TI', valor: '3' },
    ]);
  });
});

describe('o registro das equipes e dos canais na auditoria', () => {
  const daConversa = (extras: Partial<Registro>): Registro => ({
    id: 'r10',
    momento: '2026-11-21T12:00:00.000Z',
    acao: 'canal.criado',
    rotulo: 'Canal criado',
    ator: { tipo: 'conta', id: 'c-ana', nome: 'Ana Souza', usuario: 'ana.souza' },
    alvo: { tipo: 'conversa', id: 'cv1', nome: 'Avisos da TI', usuario: null },
    antes: null,
    depois: null,
    dados: null,
    ip: null,
    codigoDeRastreio: null,
    ...extras,
  });
  /** O canal como a visão que a API grava, nos termos da lista das equipes e dos canais. */
  const avisos = {
    nome: 'Avisos da TI',
    tipo: 'Canal',
    grupo: null,
    escreve: 'Todos que participam',
    avisar: true,
    situacao: 'Ativo',
  };
  const financeiro = {
    nome: 'Financeiro',
    tipo: 'Equipe',
    grupo: 'Financeiro',
    escreve: 'Todos que participam',
    avisar: false,
    situacao: 'Ativo',
  };
  const daEquipe = (extras: Partial<Registro>) =>
    daConversa({
      acao: 'equipe.criada',
      rotulo: 'Equipe criada',
      alvo: { tipo: 'conversa', id: 'cv2', nome: 'Financeiro', usuario: null },
      ...extras,
    });

  it('o alvo pelo tipo da ação e pelo nome de agora', () => {
    const alvo = (nome: string) => ({ tipo: 'conversa', id: 'cv1', nome, usuario: null });
    expect(textoDoAlvo(alvo('Avisos da TI'), 'canal.alterado')).toBe('Canal: Avisos da TI');
    expect(textoDoAlvo(alvo('Financeiro'), 'equipe.arquivada')).toBe('Equipe: Financeiro');
    expect(textoDoAlvo(alvo('Avisos da TI'))).toBe('Conversa: Avisos da TI');
    expect(camposDoDetalhe(daEquipe({ depois: financeiro }), formatar)[1]).toEqual({
      rotulo: 'Alvo',
      valor: 'Equipe: Financeiro',
    });
  });

  it('Canal criado: cada campo pelo nome da lista, na ordem dela, com os valores em texto', () => {
    expect(doRegistro(daConversa({ depois: doBanco(avisos) }))).toEqual([
      { rotulo: 'Nome', valor: 'Avisos da TI' },
      { rotulo: 'Tipo', valor: 'Canal' },
      { rotulo: 'Grupo', valor: 'Todos que usam o chat' },
      { rotulo: 'Quem escreve', valor: 'Todos que participam' },
      { rotulo: 'Avisar a cada mensagem', valor: 'Ligado' },
      { rotulo: 'Situação', valor: 'Ativo' },
    ]);
  });

  it('Canal alterado: só o que mudou, como quem escreve, com o antes → depois', () => {
    expect(
      doRegistro(
        daConversa({
          acao: 'canal.alterado',
          rotulo: 'Canal alterado',
          antes: doBanco(avisos),
          depois: doBanco({ ...avisos, escreve: 'TI', avisar: false }),
        }),
      ),
    ).toEqual([
      { rotulo: 'Quem escreve', valor: 'Todos que participam → TI' },
      { rotulo: 'Avisar a cada mensagem', valor: 'Ligado → Desligado' },
    ]);
  });

  it('a equipe criada, com o grupo pelo nome, e a arquivada e a reativada pela situação', () => {
    expect(doRegistro(daEquipe({ depois: doBanco(financeiro) }))).toEqual([
      { rotulo: 'Nome', valor: 'Financeiro' },
      { rotulo: 'Tipo', valor: 'Equipe' },
      { rotulo: 'Grupo', valor: 'Financeiro' },
      { rotulo: 'Quem escreve', valor: 'Todos que participam' },
      { rotulo: 'Avisar a cada mensagem', valor: 'Desligado' },
      { rotulo: 'Situação', valor: 'Ativo' },
    ]);
    const arquivada = { ...financeiro, situacao: 'Arquivado' };
    expect(
      doRegistro(daEquipe({ acao: 'equipe.arquivada', antes: financeiro, depois: arquivada })),
    ).toEqual([{ rotulo: 'Situação', valor: 'Ativo → Arquivado' }]);
    expect(
      doRegistro(daEquipe({ acao: 'equipe.reativada', antes: arquivada, depois: financeiro })),
    ).toEqual([{ rotulo: 'Situação', valor: 'Arquivado → Ativo' }]);
  });
});
