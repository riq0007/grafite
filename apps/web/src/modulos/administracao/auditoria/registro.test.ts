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
