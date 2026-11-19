// O que a tela dos tipos decide sem a API (change chamados-da-ti, design, "A tela dos tipos (tarefa
// 5.19)" e "O rascunho, o duplicar e a situação (tarefa 5.20)"): a ordem nova do arraste, a tabela,
// a gravação, as recusas que valem, a prévia do colaborador com o tipo que se edita, a gaveta do
// Rascunho e a situação.
import { describe, expect, it } from 'vitest';
import {
  camposQueAPessoaVe,
  consequenciaDaInativacao,
  contagemDaLista,
  contagemDoTipo,
  edicaoDoTipo,
  errosDoTipo,
  errosQueValem,
  fraseDaGradeDoRascunho,
  fraseDosAbertos,
  listaDosCampos,
  moverNaOrdem,
  movimentosNaOrdem,
  mudouOTipo,
  notasDaPrevia,
  opcoesDeQuemAtende,
  origensDosRascunhos,
  pedidoDoTipo,
  prazoNaTabela,
  quemAtendeNaTabela,
  reordenar,
  seloDoTipo,
  type TipoDeChamado,
  textoDaSituacao,
  textoDoFormularioDoRascunho,
  tipoAoFecharORascunho,
  tipoPadrao,
  tiposNaPrevia,
  trocarQuemAtende,
} from './edicao.ts';

const DIEGO = { id: '0190a000-0000-7000-8000-000000000d1e', nome: 'Diego Martins' };
const RENATO = { id: '0190a000-0000-7000-8000-0000000000e7', nome: 'Renato Lima' };
const NOTEBOOK = { id: '0190a000-0000-7000-8000-0000000000b0', nome: 'Notebook' };

function tipo(id: string, mudar: Partial<TipoDeChamado> = {}): TipoDeChamado {
  return {
    id,
    nome: id,
    icone: 'impressora',
    frase: `A frase de ${id}`,
    situacao: 'em-uso',
    ordem: 1,
    prazo: {
      modo: 'horario',
      resposta: { valor: 30, unidade: 'min' },
      resolucao: { valor: 8, unidade: 'h' },
    },
    atendePorPadrao: DIEGO,
    semNinguem: 'triagem',
    podeVirarOs: true,
    geraSolicitacao: 'nao',
    tipoDeAtivoDoEquipamento: null,
    pedeOAtivo: true,
    apareceParaOColaborador: true,
    soATiAbre: false,
    campos: 6,
    duplicadoDe: null,
    abertos: 1,
    noUltimoAno: 38,
    ...mudar,
  };
}

const IMPRESSORA = tipo('Impressora', { frase: 'Mancha, atola ou não imprime' });

describe('reordenar', () => {
  const ORDEM = ['toner', 'computador', 'impressora', 'acesso', 'software'];

  it('desce o tipo para depois da linha sob o ponteiro', () => {
    expect(reordenar(ORDEM, 'computador', 'acesso', 'depois')).toEqual([
      'toner',
      'impressora',
      'acesso',
      'computador',
      'software',
    ]);
  });

  it('sobe o tipo para antes da linha sob o ponteiro', () => {
    expect(reordenar(ORDEM, 'software', 'computador', 'antes')).toEqual([
      'toner',
      'software',
      'computador',
      'impressora',
      'acesso',
    ]);
  });

  it('leva ao começo e ao fim da lista', () => {
    expect(reordenar(ORDEM, 'impressora', 'toner', 'antes')[0]).toBe('impressora');
    expect(reordenar(ORDEM, 'toner', 'software', 'depois').at(-1)).toBe('toner');
  });

  it('a metade de baixo de uma linha e a de cima da seguinte dão a mesma ordem', () => {
    expect(reordenar(ORDEM, 'toner', 'impressora', 'depois')).toEqual(
      reordenar(ORDEM, 'toner', 'acesso', 'antes'),
    );
  });

  it('soltar no lugar em que já está, ou num alvo que não está na lista, não muda a ordem', () => {
    expect(reordenar(ORDEM, 'impressora', 'impressora', 'depois')).toEqual(ORDEM);
    expect(reordenar(ORDEM, 'impressora', 'acesso', 'antes')).toEqual(ORDEM);
    expect(reordenar(ORDEM, 'impressora', 'computador', 'depois')).toEqual(ORDEM);
    expect(reordenar(ORDEM, 'impressora', 'outro', 'antes')).toEqual(ORDEM);
    // O que não está na lista não entra nela.
    expect(reordenar(ORDEM, 'outro', 'toner', 'antes')).toEqual(ORDEM);
  });
});

describe('o Subir e o Descer do menu da linha', () => {
  const ORDEM = ['toner', 'computador', 'impressora'];

  it('o Subir troca o tipo com o de cima, e o Descer, com o de baixo', () => {
    expect(moverNaOrdem(ORDEM, 'impressora', 'subir')).toEqual([
      'toner',
      'impressora',
      'computador',
    ]);
    expect(moverNaOrdem(ORDEM, 'toner', 'descer')).toEqual(['computador', 'toner', 'impressora']);
  });

  it('nas pontas, e com um tipo que não está na lista, a ordem fica', () => {
    expect(moverNaOrdem(ORDEM, 'toner', 'subir')).toEqual(ORDEM);
    expect(moverNaOrdem(ORDEM, 'impressora', 'descer')).toEqual(ORDEM);
    expect(moverNaOrdem(ORDEM, 'outro', 'subir')).toEqual(ORDEM);
  });

  it('o menu só oferece o que muda a ordem: o primeiro só desce, e o último só sobe', () => {
    expect(movimentosNaOrdem(ORDEM, 'toner')).toEqual(['descer']);
    expect(movimentosNaOrdem(ORDEM, 'computador')).toEqual(['subir', 'descer']);
    expect(movimentosNaOrdem(ORDEM, 'impressora')).toEqual(['subir']);
    expect(movimentosNaOrdem(['toner'], 'toner')).toEqual([]);
    expect(movimentosNaOrdem(ORDEM, 'outro')).toEqual([]);
  });
});

describe('a tabela dos tipos', () => {
  it('o prazo é o da resolução, curto, com a unidade como está', () => {
    expect(prazoNaTabela(IMPRESSORA)).toBe('8 h');
    const curto = { modo: 'corridas' as const, resposta: { valor: 10, unidade: 'min' as const } };
    expect(prazoNaTabela(tipo('a', { prazo: { ...curto, resolucao: curto.resposta } }))).toBe(
      '10 min',
    );
    expect(
      prazoNaTabela(
        tipo('b', { prazo: { ...curto, modo: 'horario', resolucao: { valor: 3, unidade: 'd' } } }),
      ),
    ).toBe('3 d');
  });

  it('quem atende é o primeiro nome, ou a triagem', () => {
    expect(quemAtendeNaTabela(IMPRESSORA)).toBe('Diego');
    expect(quemAtendeNaTabela(tipo('a', { atendePorPadrao: null }))).toBe('Triagem');
  });

  it('o selo marca só a exceção', () => {
    expect(seloDoTipo(IMPRESSORA)).toBeNull();
    expect(seloDoTipo(tipo('a', { soATiAbre: true }))).toBe('so-a-ti-abre');
    expect(seloDoTipo(tipo('b', { situacao: 'rascunho' }))).toBe('rascunho');
    expect(seloDoTipo(tipo('c', { situacao: 'inativo', soATiAbre: true }))).toBe('inativo');
  });

  it('o pé soma os abertos', () => {
    expect(fraseDosAbertos([tipo('a', { abertos: 3 }), tipo('b', { abertos: 9 })])).toBe(
      '12 chamados abertos nestes tipos.',
    );
    expect(fraseDosAbertos([tipo('a', { abertos: 1 }), tipo('b', { abertos: 0 })])).toBe(
      '1 chamado aberto nestes tipos.',
    );
    expect(fraseDosAbertos([tipo('a', { abertos: 0 })])).toBe(
      'Nenhum chamado aberto nestes tipos.',
    );
  });

  it('o cabeçalho conta os abertos e os do último ano', () => {
    expect(contagemDoTipo(IMPRESSORA)).toBe('1 aberto · 38 no último ano');
    expect(contagemDoTipo(tipo('a', { abertos: 3, noUltimoAno: 1 }))).toBe(
      '3 abertos · 1 no último ano',
    );
    expect(contagemDoTipo(tipo('b', { abertos: 0, noUltimoAno: 0 }))).toBe(
      'Nenhum aberto · nenhum no último ano',
    );
  });
});

describe('a edição e a gravação', () => {
  it('o editor começa no tipo gravado, com os números em texto', () => {
    const edicao = edicaoDoTipo(IMPRESSORA);
    expect(edicao.prazo.resposta).toEqual({ valor: '30', unidade: 'min' });
    expect(edicao.atendePorPadrao).toBe(DIEGO.id);
    expect(edicao.frase).toBe('Mancha, atola ou não imprime');
    expect(edicaoDoTipo(tipo('a', { frase: null })).frase).toBe('');
  });

  it('o pedido leva os números e o tipo de ativo só do Equipamento', () => {
    const edicao = edicaoDoTipo(
      tipo('a', { geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: NOTEBOOK }),
    );
    expect(pedidoDoTipo(edicao)).toMatchObject({
      prazo: {
        modo: 'horario',
        resposta: { valor: 30, unidade: 'min' },
        resolucao: { valor: 8, unidade: 'h' },
      },
      geraSolicitacao: 'equipamento',
      tipoDeAtivoDoEquipamento: NOTEBOOK.id,
    });
    // Trocado para o Toner, o tipo de ativo fica no editor, para a volta, mas não vai.
    const toner = { ...edicao, geraSolicitacao: 'toner' as const };
    expect(toner.tipoDeAtivoDoEquipamento).toBe(NOTEBOOK.id);
    expect(pedidoDoTipo(toner).tipoDeAtivoDoEquipamento).toBeNull();
  });

  it('o número apagado vai como zero, que a API recusa no número', () => {
    const edicao = edicaoDoTipo(IMPRESSORA);
    const vazio = {
      ...edicao,
      prazo: { ...edicao.prazo, resposta: { valor: '', unidade: 'h' as const } },
    };
    expect(pedidoDoTipo(vazio).prazo.resposta).toEqual({ valor: 0, unidade: 'h' });
  });

  it('mudou só com o pedido diferente do gravado', () => {
    const edicao = edicaoDoTipo(IMPRESSORA);
    expect(mudouOTipo(edicao, IMPRESSORA)).toBe(false);
    expect(mudouOTipo({ ...edicao, nome: 'Impressoras' }, IMPRESSORA)).toBe(true);
    // O zero à esquerda é o mesmo número.
    const comZero = {
      ...edicao,
      prazo: { ...edicao.prazo, resolucao: { valor: '08', unidade: 'h' as const } },
    };
    expect(mudouOTipo(comZero, IMPRESSORA)).toBe(false);
    // O tipo de ativo guardado para a volta ao Equipamento não é mudança.
    expect(mudouOTipo({ ...edicao, tipoDeAtivoDoEquipamento: NOTEBOOK.id }, IMPRESSORA)).toBe(
      false,
    );
  });

  it('tirar quem atende volta o "Se não houver ninguém" para a triagem', () => {
    const fica = { ...edicaoDoTipo(IMPRESSORA), semNinguem: 'fica' as const };
    expect(trocarQuemAtende(fica, RENATO.id)).toMatchObject({
      atendePorPadrao: RENATO.id,
      semNinguem: 'fica',
    });
    expect(trocarQuemAtende(fica, null)).toMatchObject({
      atendePorPadrao: null,
      semNinguem: 'triagem',
    });
  });
});

describe('quem atende por padrão', () => {
  it('ninguém primeiro, e as contas pelo nome', () => {
    expect(opcoesDeQuemAtende([DIEGO, RENATO], DIEGO)).toEqual([
      { id: 'ninguem', rotulo: 'Ninguém, cai na triagem' },
      { id: DIEGO.id, rotulo: 'Diego Martins' },
      { id: RENATO.id, rotulo: 'Renato Lima' },
    ]);
  });

  it('a conta gravada que deixou de atender fica escolhida, na ordem do nome, até a gravação a recusar', () => {
    const carla = { id: '0190a000-0000-7000-8000-0000000000ca', nome: 'Carla Dias' };
    expect(opcoesDeQuemAtende([DIEGO, RENATO], carla).map((opcao) => opcao.rotulo)).toEqual([
      'Ninguém, cai na triagem',
      'Carla Dias',
      'Diego Martins',
      'Renato Lima',
    ]);
    expect(opcoesDeQuemAtende([DIEGO], null)).toHaveLength(2);
  });
});

describe('as recusas da gravação', () => {
  it('ficam nas chaves da tela, com as do formato do prazo no número', () => {
    expect(
      errosDoTipo({
        nome: 'Já existe um tipo com esse nome.',
        'prazo.resposta.valor': 'Número inválido',
        'prazo.resolucao': 'Valor inválido',
        resolucao: 'Use um número inteiro de 1 a 999.',
        atendePorPadrao: 'Escolha uma conta que atende os chamados.',
        'prazo.modo': 'Opção inválida',
      }),
    ).toEqual({
      nome: 'Já existe um tipo com esse nome.',
      resposta: 'Número inválido',
      resolucao: 'Valor inválido',
      atendePorPadrao: 'Escolha uma conta que atende os chamados.',
      geral: 'Opção inválida',
    });
  });

  it('cada uma vale enquanto o que ela recusou não muda', () => {
    const naRecusa = edicaoDoTipo(IMPRESSORA);
    const erros = {
      nome: 'Já existe um tipo com esse nome.',
      resposta: 'A resposta passa da resolução. Use uma resposta menor.',
      atendePorPadrao: 'Escolha uma conta que atende os chamados.',
      tipoDeAtivoDoEquipamento: 'Escolha o tipo de ativo do equipamento.',
      pedeOAtivo: "O Toner precisa do ativo: ligue 'Pede o ativo'.",
      geral: 'Opção inválida',
    };
    expect(errosQueValem(erros, naRecusa, naRecusa)).toEqual(erros);

    const outroNome = errosQueValem(erros, naRecusa, { ...naRecusa, nome: 'Impressoras' });
    expect(outroNome.nome).toBeUndefined();
    expect(outroNome.resposta).toBeDefined();
    // O geral é do pedido inteiro: qualquer mudança o tira.
    expect(outroNome.geral).toBeUndefined();

    // A resposta maior é da frase inteira: mudar a resolução também a tira.
    const outraResolucao = errosQueValem(erros, naRecusa, {
      ...naRecusa,
      prazo: { ...naRecusa.prazo, resolucao: { valor: '9', unidade: 'h' } },
    });
    expect(outraResolucao.resposta).toBeUndefined();
    expect(outraResolucao.nome).toBeDefined();

    // Quem atende vale com o "Se não houver ninguém"; o tipo de ativo, com a solicitação.
    const outroSemNinguem = errosQueValem(erros, naRecusa, { ...naRecusa, semNinguem: 'fica' });
    expect(outroSemNinguem.atendePorPadrao).toBeUndefined();
    const outraSolicitacao = errosQueValem(erros, naRecusa, {
      ...naRecusa,
      geraSolicitacao: 'toner',
    });
    expect(outraSolicitacao.tipoDeAtivoDoEquipamento).toBeUndefined();
    expect(outraSolicitacao.pedeOAtivo).toBeUndefined();
    expect(outraSolicitacao.atendePorPadrao).toBeDefined();
  });
});

describe('a prévia do colaborador', () => {
  const TONER = tipo('Toner', { icone: 'gota', abertos: 1 });
  const TROCA = tipo('Troca de equipamento', { icone: 'setas', soATiAbre: true, abertos: 0 });
  const NOVO = tipo('Equipamento novo', { situacao: 'rascunho', abertos: 0 });
  const TELEFONE = tipo('Telefone', { situacao: 'inativo' });
  const TIPOS = [TONER, IMPRESSORA, TROCA, NOVO, TELEFONE];

  it('os tipos em uso que o colaborador escolhe, na ordem, com o editado marcado e como se escreve', () => {
    const edicao = {
      ...edicaoDoTipo(IMPRESSORA),
      nome: 'Impressoras',
      icone: 'computador' as const,
    };
    expect(tiposNaPrevia(TIPOS, { id: IMPRESSORA.id, edicao })).toEqual([
      { id: 'Toner', nome: 'Toner', icone: 'gota', frase: 'A frase de Toner' },
      {
        id: 'Impressora',
        nome: 'Impressoras',
        icone: 'computador',
        frase: 'Mancha, atola ou não imprime',
        marca: 'editando',
      },
    ]);
    expect(tiposNaPrevia(TIPOS, null).map((cada) => cada.id)).toEqual(['Toner', 'Impressora']);
  });

  it('ligar o "Só a TI abre" tira o editado da grade na hora, e desligá-lo o põe', () => {
    const so = { ...edicaoDoTipo(IMPRESSORA), soATiAbre: true };
    expect(tiposNaPrevia(TIPOS, { id: IMPRESSORA.id, edicao: so }).map((cada) => cada.id)).toEqual([
      'Toner',
    ]);
    const aberto = { ...edicaoDoTipo(TROCA), soATiAbre: false };
    expect(tiposNaPrevia(TIPOS, { id: TROCA.id, edicao: aberto }).map((cada) => cada.id)).toEqual([
      'Toner',
      'Impressora',
      'Troca de equipamento',
    ]);
  });

  it('as notas: os que só a TI abre e os abertos do editado', () => {
    expect(notasDaPrevia(TIPOS, { id: IMPRESSORA.id, edicao: edicaoDoTipo(IMPRESSORA) })).toEqual({
      soDaTi: 'Troca de equipamento é só da TI e não aparece nesta grade.',
      abertos: 'Vale para os próximos chamados. O 1 aberto mantém o formulário atual.',
    });
    const so = { ...edicaoDoTipo(IMPRESSORA), soATiAbre: true };
    const tres = tipo('Impressora', { abertos: 3 });
    expect(notasDaPrevia([TONER, tres, TROCA], { id: tres.id, edicao: so })).toEqual({
      soDaTi: 'Impressora e Troca de equipamento são só da TI e não aparecem nesta grade.',
      abertos: 'Vale para os próximos chamados. Os 3 abertos mantêm o formulário atual.',
    });
    const semAbertos = tipo('Toner', { abertos: 0 });
    expect(
      notasDaPrevia([semAbertos], { id: semAbertos.id, edicao: edicaoDoTipo(semAbertos) }),
    ).toEqual({ soDaTi: null, abertos: null });
  });
});

describe('o rascunho (5.20)', () => {
  const TONER = tipo('Toner', { icone: 'gota' });
  const COMPUTADOR = tipo('Computador', { icone: 'computador' });
  const TROCA = tipo('Troca de equipamento', { soATiAbre: true });
  const TELEFONE = tipo('Telefone', { situacao: 'inativo' });
  const NOVO = tipo('Equipamento novo', {
    situacao: 'rascunho',
    duplicadoDe: 'Computador',
    abertos: 0,
  });
  const OUTRO = tipo('Novo tipo', { situacao: 'rascunho', abertos: 0 });
  const TIPOS = [TONER, COMPUTADOR, TROCA, TELEFONE, NOVO, OUTRO];

  it('a contagem deixa os Rascunhos de fora', () => {
    expect(contagemDaLista(TIPOS)).toBe('4 tipos');
    expect(contagemDaLista([TONER, OUTRO])).toBe('1 tipo');
  });

  it('sem o tipo no endereço, a tela fica no primeiro que não é Rascunho', () => {
    expect(tipoPadrao([OUTRO, NOVO, TONER])?.id).toBe('Toner');
    expect(tipoPadrao([OUTRO])?.id).toBe('Novo tipo');
    expect(tipoPadrao([])).toBeNull();
  });

  it('a origem de um Rascunho duplicado fica marcada', () => {
    expect([...origensDosRascunhos(TIPOS)]).toEqual(['Computador']);
    const criado = { ...NOVO, situacao: 'em-uso' as const };
    expect([...origensDosRascunhos([COMPUTADOR, criado])]).toEqual([]);
  });

  it('fechar a gaveta volta ao tipo de antes, ou à origem, ou ao padrão, nunca a um Rascunho', () => {
    expect(tipoAoFecharORascunho(TIPOS, NOVO, 'Telefone')).toBe('Telefone');
    expect(tipoAoFecharORascunho(TIPOS, NOVO, null)).toBe('Computador');
    expect(tipoAoFecharORascunho(TIPOS, NOVO, 'Novo tipo')).toBe('Computador');
    expect(tipoAoFecharORascunho(TIPOS, OUTRO, 'sumiu')).toBe('Toner');
    expect(tipoAoFecharORascunho([NOVO, OUTRO], OUTRO, null)).toBeNull();
  });

  it('a prévia mostra o Rascunho que se edita marcado "novo", no lugar dele, e nenhum outro', () => {
    const edicao = { ...edicaoDoTipo(NOVO), nome: 'Equipamento' };
    expect(tiposNaPrevia(TIPOS, { id: NOVO.id, edicao })).toEqual([
      { id: 'Toner', nome: 'Toner', icone: 'gota', frase: 'A frase de Toner' },
      {
        id: 'Computador',
        nome: 'Computador',
        icone: 'computador',
        frase: 'A frase de Computador',
      },
      {
        id: 'Equipamento novo',
        nome: 'Equipamento',
        icone: 'impressora',
        frase: 'A frase de Equipamento novo',
        marca: 'novo',
      },
    ]);
    const so = { ...edicaoDoTipo(NOVO), soATiAbre: true };
    expect(tiposNaPrevia(TIPOS, { id: NOVO.id, edicao: so }).map((cada) => cada.id)).toEqual([
      'Toner',
      'Computador',
    ]);
    expect(notasDaPrevia(TIPOS, { id: NOVO.id, edicao: so }).soDaTi).toBe(
      'Troca de equipamento e Equipamento novo são só da TI e não aparecem nesta grade.',
    );
  });

  it('a frase da grade diz o lugar do Rascunho por extenso até o vigésimo', () => {
    expect(fraseDaGradeDoRascunho(9)).toBe('A grade da aba, em Abrir chamado, já com o nono tipo.');
    expect(fraseDaGradeDoRascunho(11)).toBe(
      'A grade da aba, em Abrir chamado, já com o décimo primeiro tipo.',
    );
    expect(fraseDaGradeDoRascunho(20)).toBe(
      'A grade da aba, em Abrir chamado, já com o vigésimo tipo.',
    );
    expect(fraseDaGradeDoRascunho(21)).toBe(
      'A grade da aba, em Abrir chamado, já com o tipo novo.',
    );
    expect(fraseDaGradeDoRascunho(null)).toBe('A grade da aba, em Abrir chamado.');
  });

  it('o formulário: os campos com o tipo, e só os que a pessoa vê depois de escolher', () => {
    const campos = [
      { id: 'quem', rotulo: 'Quem vai usar?', tipo: 'pessoa' as const, soDaTi: false },
      { id: 'setor', rotulo: 'Setor', tipo: 'escolha-unica' as const, soDaTi: false },
      { id: 'patrimonio', rotulo: 'Patrimônio', tipo: 'texto-curto' as const, soDaTi: true },
    ];
    expect(listaDosCampos(campos)).toBe(
      'Quem vai usar? (pessoa) · Setor (escolha única) · Patrimônio (texto curto, só a TI vê)',
    );
    expect(camposQueAPessoaVe(campos)).toEqual([
      { id: 'quem', rotulo: 'Quem vai usar?', tipo: 'pessoa' },
      { id: 'setor', rotulo: 'Setor', tipo: 'escolha única' },
    ]);
    expect(textoDoFormularioDoRascunho(3, 'Computador')).toBe(
      '3 campos, a partir do tipo Computador',
    );
    expect(textoDoFormularioDoRascunho(1, null)).toBe('1 campo');
    expect(textoDoFormularioDoRascunho(0, 'Computador')).toBe('Nenhum campo ainda.');
  });
});

describe('a situação (5.20)', () => {
  it('em texto, com o que ela quer dizer', () => {
    expect(textoDaSituacao('em-uso')).toBe('Em uso: recebe chamados novos.');
    expect(textoDaSituacao('inativo')).toBe(
      'Inativo: não recebe chamados novos, e os abertos seguem até resolvidos.',
    );
  });

  it('o inativar diz o que acontece aos abertos', () => {
    expect(consequenciaDaInativacao(0)).toBe('O tipo sai da escolha ao abrir um chamado.');
    expect(consequenciaDaInativacao(1)).toBe(
      'O tipo sai da escolha ao abrir um chamado, e o 1 aberto segue até resolvido.',
    );
    expect(consequenciaDaInativacao(3)).toBe(
      'O tipo sai da escolha ao abrir um chamado, e os 3 abertos seguem até resolvidos.',
    );
  });
});
