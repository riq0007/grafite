// Os campos do construtor do formulário (change chamados-da-ti, design, "O construtor, os campos
// (tarefa 5.22)"; m09): o selo e o detalhe de cada campo, a ordem, as opções, a recusa na hora, o
// título do chamado, as mudanças não salvas e as recusas junto do que recusam.
import type { CampoDoFormulario, Formulario, TipoDeCampoDoChamado } from '@grafite/domain';
import { describe, expect, it } from 'vitest';
import {
  acrescentarOpcao,
  avisoDasOpcoes,
  camposDoTitulo,
  descricaoDoNomeNoResumo,
  detalheDoCampo,
  errosNoFormulario,
  errosQueValemNoFormulario,
  fraseDoTitulo,
  moverCampo,
  mudancasDoFormulario,
  opcoesDosTiposDeAtivo,
  recusaDaMudanca,
  removerCampo,
  resumoDaRecusa,
  seloDoCampo,
  subirOuDescer,
  textoDasMudancas,
  tirarOpcao,
} from './campos.ts';

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

const IMPRESSORAS = '0199a0a0-0000-7000-8000-000000000001';
const MONITORES = '0199a0a0-0000-7000-8000-000000000002';
const COMPUTADORES = '0199a0a0-0000-7000-8000-000000000003';

/** Os ids em sequência, como o sorteio, para o teste saber quais saem. */
const emSequencia = (...ids: string[]) => {
  const fila = [...ids];
  return () => {
    const proximo = fila.shift();
    if (proximo === undefined) throw new Error('Acabaram os ids do teste.');
    return proximo;
  };
};

const IMPRESSORA: Formulario = {
  titulo: { comecaPeloTipo: true, campoId: 'problema' },
  campos: [
    campo('impressora', 'Qual impressora?', 'ativo', {
      obrigatorio: true,
      tiposDeAtivo: [IMPRESSORAS],
    }),
    campo('problema', 'O que está acontecendo?', 'escolha-unica', {
      obrigatorio: true,
      opcoes: opcoes('Manchando', 'Não puxa o papel', 'Atolando', 'Não imprime'),
    }),
    campo('onde', 'Onde as manchas aparecem?', 'escolha-unica', {
      opcoes: opcoes('Na borda', 'No meio'),
      condicao: [{ campoId: 'problema', juncao: null, opcaoId: 'manchando' }],
    }),
    campo('foto', 'Uma foto ajuda', 'anexo'),
    campo('contador', 'Contador de páginas', 'numero', { soDaTi: true }),
    campo('contrato', 'Contrato de manutenção', 'sim-ou-nao', { soDaTi: true }),
  ],
};

const ids = (campos: readonly CampoDoFormulario[] | null) => campos?.map(({ id }) => id);

/** O formulário da Impressora com o campo trocado. */
const comCampo = (formulario: Formulario, id: string, mudanca: Partial<CampoDoFormulario>) => ({
  ...formulario,
  campos: formulario.campos.map((cada) => (cada.id === id ? { ...cada, ...mudanca } : cada)),
});

describe('o selo do campo', () => {
  it('é um só, com o condicional antes do só da TI, e o obrigatório antes do opcional', () => {
    const [impressora, , onde, foto, contador] = IMPRESSORA.campos;
    expect(seloDoCampo(impressora as CampoDoFormulario)).toBe('obrigatorio');
    expect(seloDoCampo(onde as CampoDoFormulario)).toBe('condicional');
    expect(seloDoCampo(foto as CampoDoFormulario)).toBe('opcional');
    expect(seloDoCampo(contador as CampoDoFormulario)).toBe('so-a-ti-ve');
    expect(seloDoCampo({ ...(onde as CampoDoFormulario), soDaTi: true, obrigatorio: true })).toBe(
      'condicional',
    );
    expect(seloDoCampo({ ...(contador as CampoDoFormulario), obrigatorio: true })).toBe(
      'so-a-ti-ve',
    );
  });
});

describe('o detalhe do campo', () => {
  const nomes = new Map([
    [IMPRESSORAS, 'Impressora'],
    [MONITORES, 'Monitor'],
    [COMPUTADORES, 'Computador'],
  ]);

  it('é o tipo de campo e, nas escolhas, quantas opções', () => {
    const [, problema, , foto] = IMPRESSORA.campos;
    expect(detalheDoCampo(problema as CampoDoFormulario, nomes)).toBe('Escolha única · 4 opções');
    expect(detalheDoCampo(foto as CampoDoFormulario, nomes)).toBe('Anexo');
    expect(detalheDoCampo(campo('v', 'V', 'varias-opcoes', { opcoes: opcoes('Uma') }), nomes)).toBe(
      'Várias opções · 1 opção',
    );
  });

  it('no Ativo, diz os tipos aceitos, e os que não se conhece ficam de fora', () => {
    expect(detalheDoCampo(campo('a', 'A', 'ativo', { tiposDeAtivo: [IMPRESSORAS] }), nomes)).toBe(
      'Ativo · só Impressora',
    );
    const tres = [IMPRESSORAS, MONITORES, COMPUTADORES];
    expect(detalheDoCampo(campo('a', 'A', 'ativo', { tiposDeAtivo: tres }), nomes)).toBe(
      'Ativo · só Impressora, Monitor ou Computador',
    );
    expect(detalheDoCampo(campo('a', 'A', 'ativo', { tiposDeAtivo: ['outro'] }), nomes)).toBe(
      'Ativo',
    );
  });

  it('diz quando a TI preenche', () => {
    expect(detalheDoCampo(IMPRESSORA.campos[4] as CampoDoFormulario, nomes)).toBe(
      'Número · preenchido pela TI',
    );
  });
});

describe('a ordem dos campos', () => {
  const campos = IMPRESSORA.campos;

  it('move o campo para a posição da linha, contada na lista de agora', () => {
    expect(ids(moverCampo(campos, 'foto', 0))).toEqual([
      'foto',
      'impressora',
      'problema',
      'onde',
      'contador',
      'contrato',
    ]);
    expect(ids(moverCampo(campos, 'impressora', 6))).toEqual([
      'problema',
      'onde',
      'foto',
      'contador',
      'contrato',
      'impressora',
    ]);
    expect(ids(moverCampo(campos, 'impressora', 3))?.slice(0, 3)).toEqual([
      'problema',
      'onde',
      'impressora',
    ]);
  });

  it('não move nos dois lugares que não mudam nada, nem o campo que não existe', () => {
    expect(moverCampo(campos, 'foto', 3)).toBeNull();
    expect(moverCampo(campos, 'foto', 4)).toBeNull();
    expect(moverCampo(campos, 'sumiu', 0)).toBeNull();
  });

  it('sobe e desce um lugar pelo menu', () => {
    expect(ids(subirOuDescer(campos, 'foto', 'subir'))?.slice(2, 4)).toEqual(['foto', 'onde']);
    expect(ids(subirOuDescer(campos, 'foto', 'descer'))?.slice(3, 5)).toEqual(['contador', 'foto']);
  });
});

describe('as opções do campo', () => {
  const problema = IMPRESSORA.campos[1] as CampoDoFormulario;

  it('acrescenta a opção seguinte, com o texto único e o id novo no formulário', () => {
    const novo = acrescentarOpcao(
      problema,
      IMPRESSORA.campos,
      emSequencia('foto', 'atolando', 'o5'),
    );
    expect(novo?.opcoes.at(-1)).toEqual({ id: 'o5', texto: 'Opção 5' });
    // O texto que já existe, sem acento nem maiúscula, passa ao número seguinte.
    const comOpcao3 = { ...problema, opcoes: opcoes('Manchando', 'opcao 3') };
    expect(acrescentarOpcao(comOpcao3, [comOpcao3], emSequencia('o4'))?.opcoes.at(-1)).toEqual({
      id: 'o4',
      texto: 'Opção 4',
    });
  });

  it('para em 12, com a frase', () => {
    const cheio = {
      ...problema,
      opcoes: Array.from({ length: 12 }, (_, indice) => ({ id: `o${indice}`, texto: `${indice}` })),
    };
    expect(acrescentarOpcao(cheio, [cheio], emSequencia('novo'))).toBeNull();
    expect(avisoDasOpcoes(cheio)).toBe('O campo tem no máximo 12 opções.');
    expect(avisoDasOpcoes(problema)).toBeNull();
  });

  it('tira a opção que nenhuma condição usa', () => {
    const tirada = tirarOpcao(IMPRESSORA, 'problema', 'atolando', false);
    expect(
      'formulario' in tirada && tirada.formulario.campos[1]?.opcoes.map(({ id }) => id),
    ).toEqual(['manchando', 'nao-puxa-o-papel', 'nao-imprime']);
  });

  it('recusa tirar a opção que uma condição usa e a que deixaria o campo com uma só', () => {
    expect(tirarOpcao(IMPRESSORA, 'problema', 'manchando', false)).toEqual({
      recusa: "'Onde as manchas aparecem?' depende desta opção. Mude a condição antes.",
    });
    expect(tirarOpcao(IMPRESSORA, 'onde', 'na-borda', false)).toEqual({
      recusa: 'O campo tem no mínimo 2 opções.',
    });
  });
});

describe('a recusa na hora', () => {
  it('é a primeira recusa nova que a mudança traz', () => {
    const semRotulo = comCampo(IMPRESSORA, 'foto', { rotulo: '' });
    // A recusa que já havia não conta.
    expect(
      recusaDaMudanca(semRotulo, comCampo(semRotulo, 'foto', { obrigatorio: true }), true),
    ).toBeNull();
    expect(
      recusaDaMudanca(IMPRESSORA, comCampo(IMPRESSORA, 'impressora', { obrigatorio: false }), true),
    ).toBe(
      "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'.",
    );
    expect(
      recusaDaMudanca(
        IMPRESSORA,
        comCampo(IMPRESSORA, 'impressora', { obrigatorio: false }),
        false,
      ),
    ).toBeNull();
    // A primeira, na ordem do domínio: a condição de quem depende vem antes do título.
    expect(
      recusaDaMudanca(IMPRESSORA, comCampo(IMPRESSORA, 'problema', { soDaTi: true }), false),
    ).toBe(
      "'Onde as manchas aparecem?' aparece para a pessoa e depende de 'O que está acontecendo?', que só a TI vê.",
    );
    const peloAtivo = { ...IMPRESSORA, titulo: { comecaPeloTipo: true, campoId: 'impressora' } };
    expect(
      recusaDaMudanca(peloAtivo, comCampo(peloAtivo, 'impressora', { soDaTi: true }), false),
    ).toBe("O título usa este campo. Ele não pode ser 'Só a TI vê'.");
  });

  it('recusa a ordem que põe a condição antes do campo de que ela depende', () => {
    const depois = { ...IMPRESSORA, campos: subirOuDescer(IMPRESSORA.campos, 'onde', 'subir') };
    expect(recusaDaMudanca(IMPRESSORA, depois, false)).toBe(
      "'Onde as manchas aparecem?' depende de 'O que está acontecendo?', que precisa vir antes.",
    );
  });

  it('recusa remover o campo de que outro depende, ou o do título', () => {
    const semTitulo = { ...IMPRESSORA, titulo: { comecaPeloTipo: true, campoId: null } };
    expect(removerCampo(semTitulo, 'problema', false)).toEqual({
      recusa: "'Onde as manchas aparecem?' depende deste campo. Mude a condição antes.",
    });
    const peloAtivo = { ...IMPRESSORA, titulo: { comecaPeloTipo: true, campoId: 'impressora' } };
    expect(removerCampo(peloAtivo, 'impressora', false)).toEqual({
      recusa: 'O título usa este campo. Escolha outro no Título do chamado.',
    });
    expect(removerCampo(IMPRESSORA, 'impressora', true)).toEqual({
      recusa: 'Pede o ativo: inclua no formulário um campo Ativo obrigatório.',
    });
    const removido = removerCampo(IMPRESSORA, 'foto', true);
    expect('formulario' in removido && ids(removido.formulario.campos)).not.toContain('foto');
  });
});

describe('o título do chamado', () => {
  it('se escolhe entre os campos de Escolha única, Texto curto e Ativo que a pessoa vê', () => {
    const campos = [
      ...IMPRESSORA.campos,
      campo('nome', 'Nome', 'texto-curto'),
      campo('nota', 'Nota da TI', 'texto-curto', { soDaTi: true }),
      campo('detalhes', 'Detalhes', 'texto-longo'),
    ];
    expect(ids(camposDoTitulo(campos))).toEqual(['impressora', 'problema', 'onde', 'nome']);
  });

  it('mostra o exemplo pela primeira opção da Escolha única', () => {
    expect(fraseDoTitulo(IMPRESSORA, 'Impressora')).toBe('Das respostas: “Impressora manchando”');
    expect(
      fraseDoTitulo(
        { ...IMPRESSORA, titulo: { comecaPeloTipo: false, campoId: 'problema' } },
        'Impressora',
      ),
    ).toBe('Das respostas: “Manchando”');
    // A condição do campo escolhido não esconde o exemplo.
    expect(
      fraseDoTitulo(
        { ...IMPRESSORA, titulo: { comecaPeloTipo: true, campoId: 'onde' } },
        'Impressora',
      ),
    ).toBe('Das respostas: “Impressora na borda”');
  });

  it('diz de onde vem a resposta no Texto curto e no Ativo, e sem o campo', () => {
    const peloAtivo = { ...IMPRESSORA, titulo: { comecaPeloTipo: true, campoId: 'impressora' } };
    expect(fraseDoTitulo(peloAtivo, 'Impressora')).toBe(
      'Das respostas: “Impressora” e a resposta de “Qual impressora?”',
    );
    expect(
      fraseDoTitulo(
        { ...peloAtivo, titulo: { comecaPeloTipo: false, campoId: 'impressora' } },
        'Impressora',
      ),
    ).toBe('Das respostas: a resposta de “Qual impressora?”');
    const semCampo = { ...IMPRESSORA, titulo: { comecaPeloTipo: true, campoId: null } };
    expect(fraseDoTitulo(semCampo, 'Impressora')).toBe(
      'Das respostas: a primeira resposta de texto ou “Impressora”',
    );
    // O campo que deixou de servir conta como nenhum.
    const soDaTi = comCampo(IMPRESSORA, 'problema', { soDaTi: true });
    expect(fraseDoTitulo(soDaTi, 'Impressora')).toBe(
      'Das respostas: a primeira resposta de texto ou “Impressora”',
    );
  });
});

describe('as mudanças não salvas', () => {
  it('contam cada campo acrescentado, tirado ou mudado, a ordem e o título', () => {
    expect(mudancasDoFormulario(IMPRESSORA, IMPRESSORA)).toBe(0);
    const mudado = comCampo(IMPRESSORA, 'foto', { rotulo: 'Foto' });
    expect(mudancasDoFormulario(IMPRESSORA, mudado)).toBe(1);
    const semFoto = { ...mudado, campos: mudado.campos.filter(({ id }) => id !== 'foto') };
    const comNovo = { ...semFoto, campos: [...semFoto.campos, campo('novo', 'Número', 'numero')] };
    expect(mudancasDoFormulario(IMPRESSORA, comNovo)).toBe(2);
    const naOrdem = { ...comNovo, campos: subirOuDescer(comNovo.campos, 'contador', 'subir') };
    expect(mudancasDoFormulario(IMPRESSORA, naOrdem)).toBe(3);
    const comTitulo = { ...naOrdem, titulo: { comecaPeloTipo: false, campoId: 'problema' } };
    expect(mudancasDoFormulario(IMPRESSORA, comTitulo)).toBe(4);
  });

  it('o campo que volta a ser o gravado não conta', () => {
    const idaEVolta = comCampo(comCampo(IMPRESSORA, 'foto', { rotulo: 'Foto' }), 'foto', {
      rotulo: 'Uma foto ajuda',
    });
    expect(mudancasDoFormulario(IMPRESSORA, idaEVolta)).toBe(0);
  });

  it('dizem quantas são', () => {
    expect(textoDasMudancas(1)).toBe('1 mudança não salva');
    expect(textoDasMudancas(3)).toBe('3 mudanças não salvas');
  });
});

describe('as recusas junto do que recusam', () => {
  it('vão ao campo, à opção, e o "Pede o ativo" ao primeiro campo Ativo', () => {
    const { porCampo, geral } = errosNoFormulario(
      {
        'campos.foto.rotulo': 'Já existe um campo com esse rótulo.',
        'campos.problema.opcoes.atolando': 'Essa opção já existe.',
        'campos.problema.opcoes': 'Use até 12 opções.',
        'campos.impressora.tiposDeAtivo': 'Escolha os tipos da lista.',
        'campos.onde.condicao':
          "'Onde as manchas aparecem?' depende de 'X', que precisa vir antes.",
        'campos.contador': 'O título usa este campo. Escolha outro no Título do chamado.',
        pedeOAtivo: 'Pede o ativo: …',
        formulario: 'O formulário não pôde ser lido.',
        'campos.sumiu.rotulo': 'Escreva o rótulo.',
      },
      IMPRESSORA.campos,
    );
    expect(porCampo.foto).toMatchObject({ rotulo: 'Já existe um campo com esse rótulo.' });
    expect(porCampo.problema).toMatchObject({
      opcoes: 'Use até 12 opções.',
      porOpcao: { atolando: 'Essa opção já existe.' },
    });
    expect(porCampo.impressora).toMatchObject({
      tiposDeAtivo: 'Escolha os tipos da lista.',
      pedeOAtivo: 'Pede o ativo: …',
    });
    expect(porCampo.onde?.outras).toEqual([
      "'Onde as manchas aparecem?' depende de 'X', que precisa vir antes.",
    ]);
    expect(porCampo.contador?.outras).toEqual([
      'O título usa este campo. Escolha outro no Título do chamado.',
    ]);
    expect(geral).toEqual(['O formulário não pôde ser lido.', 'Escreva o rótulo.']);
  });

  it('o "Pede o ativo" sem campo Ativo fica no alto da lista', () => {
    const semAtivo = IMPRESSORA.campos.slice(1);
    expect(errosNoFormulario({ pedeOAtivo: 'Pede o ativo: inclua…' }, semAtivo).geral).toEqual([
      'Pede o ativo: inclua…',
    ]);
  });

  it('o campo fechado mostra a primeira, na ordem do campo aberto', () => {
    const problema = IMPRESSORA.campos[1] as CampoDoFormulario;
    expect(
      resumoDaRecusa(problema, {
        porOpcao: { atolando: 'Essa opção já existe.', manchando: 'Escreva a opção.' },
        outras: ['Outra.'],
      }),
    ).toBe('Escreva a opção.');
    expect(
      resumoDaRecusa(problema, { rotulo: 'Escreva o rótulo.', porOpcao: {}, outras: [] }),
    ).toBe('Escreva o rótulo.');
    expect(resumoDaRecusa(problema, undefined)).toBeNull();
  });
});

describe('as recusas que valem', () => {
  const erros = {
    'campos.foto.rotulo': 'Já existe um campo com esse rótulo.',
    'campos.problema.opcoes.atolando': 'Essa opção já existe.',
    pedeOAtivo: 'Pede o ativo: …',
  };

  it('valem enquanto o campo recusado não muda; as outras, enquanto o formulário não muda', () => {
    expect(errosQueValemNoFormulario(erros, IMPRESSORA, IMPRESSORA)).toEqual(erros);
    const mudouAFoto = comCampo(IMPRESSORA, 'foto', { obrigatorio: true });
    expect(errosQueValemNoFormulario(erros, IMPRESSORA, mudouAFoto)).toEqual({
      'campos.problema.opcoes.atolando': 'Essa opção já existe.',
    });
  });

  it('a do rótulo sai quando outro rótulo muda', () => {
    const mudouOutroRotulo = comCampo(IMPRESSORA, 'contador', { rotulo: 'Páginas' });
    expect(
      errosQueValemNoFormulario(
        { 'campos.foto.rotulo': 'Já existe um campo com esse rótulo.' },
        IMPRESSORA,
        mudouOutroRotulo,
      ),
    ).toEqual({});
  });
});

describe('os tipos de ativo do campo', () => {
  it('são os ativos e os inativos que o campo já aceitava, pelo nome', () => {
    const tipos = [
      { id: MONITORES, nome: 'Monitor', situacao: 'inativo' },
      { id: IMPRESSORAS, nome: 'Impressora', situacao: 'ativo' },
      { id: COMPUTADORES, nome: 'Computador', situacao: 'ativo' },
      { id: 'celulares', nome: 'Celular', situacao: 'inativo' },
    ];
    expect(opcoesDosTiposDeAtivo(tipos, [MONITORES])).toEqual([
      { id: COMPUTADORES, rotulo: 'Computador' },
      { id: IMPRESSORAS, rotulo: 'Impressora' },
      { id: MONITORES, rotulo: 'Monitor (inativo)' },
    ]);
  });
});

describe('o nome no resumo', () => {
  it('diz o que vale vazio: o rótulo sem o "?"', () => {
    expect(descricaoDoNomeNoResumo(IMPRESSORA.campos[1] as CampoDoFormulario)).toBe(
      'Vazio, vale “O que está acontecendo”.',
    );
    expect(descricaoDoNomeNoResumo(campo('a', ''))).toBe('Vazio, vale o rótulo.');
  });
});
