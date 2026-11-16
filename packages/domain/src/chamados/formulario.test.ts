import { describe, expect, it } from 'vitest';
import {
  conferirFormulario,
  ID_DO_FORMULARIO,
  idDoFormulario,
  TIPOS_DE_CAMPO_DO_CHAMADO,
} from './formulario.ts';

const conferir = (pedido: unknown, pedeOAtivo = false) =>
  conferirFormulario(pedido, { pedeOAtivo });

const GERAL = 'O formulário não pôde ser lido. Recarregue a página e tente de novo.';

/** O formulário da Impressora da spec (tipos-de-chamado, "Tipos de fábrica"). */
const impressora = () => ({
  titulo: { comecaPeloTipo: true, campoId: 'problema' },
  campos: [
    { id: 'impressora', tipo: 'ativo', rotulo: 'Qual impressora?', obrigatorio: true },
    {
      id: 'problema',
      tipo: 'escolha-unica',
      rotulo: 'O que está acontecendo?',
      nomeNoResumo: 'Problema',
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
  ],
});

type CampoPedido = Record<string, unknown>;

/** A Impressora com uma mudança nos campos, como o construtor manda. */
function comCampos(mudar: (campos: CampoPedido[]) => unknown[]) {
  const pedido = impressora();
  return { ...pedido, campos: mudar(pedido.campos) };
}

const recusas = (pedido: unknown, pedeOAtivo = false) => {
  const conferido = conferir(pedido, pedeOAtivo);
  return conferido.ok ? {} : conferido.erros;
};

describe('conferirFormulario', () => {
  it('aceita a Impressora da spec, com os padrões e só as chaves conhecidas', () => {
    const conferido = conferir({ ...impressora(), outra: 1 }, true);
    expect(conferido.ok).toBe(true);
    if (!conferido.ok) return;
    const { titulo, campos } = conferido.formulario;
    expect(titulo).toEqual({ comecaPeloTipo: true, campoId: 'problema' });
    expect(campos.map((campo) => campo.id)).toEqual([
      'impressora',
      'problema',
      'manchas',
      'foto',
      'contador',
      'contrato',
    ]);
    expect(campos[0]).toEqual({
      id: 'impressora',
      tipo: 'ativo',
      rotulo: 'Qual impressora?',
      nomeNoResumo: null,
      obrigatorio: true,
      soDaTi: false,
      apagarSeSumir: true,
      opcoes: [],
      tiposDeAtivo: [],
      condicao: [],
    });
    expect(campos[1]?.nomeNoResumo).toBe('Problema');
    expect(campos[2]?.condicao).toEqual([
      { campoId: 'problema', opcaoId: 'manchando', juncao: null },
    ]);
    expect(campos[4]).toMatchObject({ soDaTi: true, obrigatorio: false, opcoes: [] });
  });

  it('tem os 11 tipos de campo da spec', () => {
    expect(TIPOS_DE_CAMPO_DO_CHAMADO).toEqual([
      'texto-curto',
      'texto-longo',
      'escolha-unica',
      'varias-opcoes',
      'ativo',
      'local',
      'pessoa',
      'data',
      'numero',
      'anexo',
      'sim-ou-nao',
    ]);
  });

  describe('os ids', () => {
    it.each([
      ['o campo sem id', (c: CampoPedido[]) => [{ ...c[0], id: undefined }]],
      ['o id do campo vazio', (c: CampoPedido[]) => [{ ...c[0], id: '' }]],
      [
        'a opção sem id',
        (c: CampoPedido[]) => [
          {
            ...c[1],
            opcoes: [{ texto: 'Manchando' }, { id: 'atolando', texto: 'Atolando' }],
          },
        ],
      ],
      [
        'o id da opção vazio',
        (c: CampoPedido[]) => [
          {
            ...c[1],
            opcoes: [
              { id: '', texto: 'Manchando' },
              { id: 'atolando', texto: 'Atolando' },
            ],
          },
        ],
      ],
      ['o id do campo fora do formato', (c: CampoPedido[]) => [{ ...c[0], id: 'qual impressora' }]],
      ['o id do campo longo', (c: CampoPedido[]) => [{ ...c[0], id: 'a'.repeat(41) }]],
      ['o id do campo repetido', (c: CampoPedido[]) => [c[0], { ...c[3], id: 'impressora' }]],
      [
        'o id da opção repetido',
        (c: CampoPedido[]) => [
          {
            ...c[1],
            opcoes: [
              { id: 'a', texto: 'Manchando' },
              { id: 'a', texto: 'Atolando' },
            ],
          },
        ],
      ],
    ])('%s é a recusa geral', (_, mudar) => {
      const pedido = comCampos(mudar);
      expect(recusas({ ...pedido, titulo: { comecaPeloTipo: true, campoId: null } })).toEqual({
        formulario: GERAL,
      });
    });
  });

  describe('o rótulo e o nome no resumo', () => {
    it('o rótulo é escrito, tem até 80 caracteres e é único sem acento e maiúsculas', () => {
      expect(recusas(comCampos((c) => [{ ...c[0], rotulo: '  ' }, ...c.slice(1)]))).toEqual({
        'campos.impressora.rotulo': 'Escreva o rótulo.',
      });
      expect(
        recusas(comCampos((c) => [{ ...c[0], rotulo: 'a'.repeat(81) }, ...c.slice(1)])),
      ).toEqual({ 'campos.impressora.rotulo': 'Use até 80 caracteres.' });
      expect(
        recusas(
          comCampos((c) => [
            ...c,
            { id: 'outro', tipo: 'texto-curto', rotulo: 'qual IMPRESSORA?' },
          ]),
        ),
      ).toEqual({ 'campos.outro.rotulo': 'Já existe um campo com esse rótulo.' });
      expect(
        recusas(
          comCampos((c) => [
            ...c,
            { id: 'acento', tipo: 'texto-curto', rotulo: 'Contador de paginas' },
          ]),
        ),
      ).toEqual({ 'campos.acento.rotulo': 'Já existe um campo com esse rótulo.' });
    });

    it('o nome no resumo tem até 30 caracteres, e o vazio vira nulo', () => {
      expect(
        recusas(comCampos((c) => [c[0], { ...c[1], nomeNoResumo: 'a'.repeat(31) }, ...c.slice(2)])),
      ).toEqual({ 'campos.problema.nomeNoResumo': 'Use até 30 caracteres.' });
      const conferido = conferir(
        comCampos((c) => [c[0], { ...c[1], nomeNoResumo: ' ' }, ...c.slice(2)]),
      );
      expect(conferido.ok && conferido.formulario.campos[1]?.nomeNoResumo).toBeNull();
    });
  });

  describe('as opções', () => {
    const problema = (opcoes: unknown) =>
      comCampos((c) => [c[0], { ...c[1], opcoes } as CampoPedido, ...c.slice(2)]);

    it('de 2 a 12, cada uma escrita, com até 60 caracteres e única no campo', () => {
      expect(recusas(problema([{ id: 'manchando', texto: 'Manchando' }]))).toEqual({
        'campos.problema.opcoes': 'Inclua ao menos 2 opções.',
      });
      const treze = Array.from({ length: 13 }, (_, i) => ({ id: `o${i}`, texto: `Opção ${i}` }));
      expect(recusas(problema([{ id: 'manchando', texto: 'Manchando' }, ...treze]))).toEqual({
        'campos.problema.opcoes': 'Use até 12 opções.',
      });
      const com = (texto: string) =>
        problema([
          { id: 'manchando', texto: 'Manchando' },
          { id: 'x', texto },
        ]);
      expect(recusas(com(' '))).toEqual({ 'campos.problema.opcoes.x': 'Escreva a opção.' });
      expect(recusas(com('a'.repeat(61)))).toEqual({
        'campos.problema.opcoes.x': 'Use até 60 caracteres.',
      });
      expect(recusas(com('MANCHÂNDO'))).toEqual({
        'campos.problema.opcoes.x': 'Essa opção já existe.',
      });
    });

    it('as Várias opções também têm opções, e os outros tipos não as guardam', () => {
      const conferido = conferir({
        titulo: { comecaPeloTipo: true, campoId: null },
        campos: [
          {
            id: 'sintomas',
            tipo: 'varias-opcoes',
            rotulo: 'O que você notou?',
            opcoes: [
              { id: 'lento', texto: 'Está lento' },
              { id: 'barulho', texto: 'Faz barulho' },
            ],
          },
          {
            id: 'relato',
            tipo: 'texto-longo',
            rotulo: 'Conte mais',
            opcoes: [{ id: 'a', texto: 'A' }],
          },
        ],
      });
      expect(
        conferido.ok && conferido.formulario.campos.map((campo) => campo.opcoes.length),
      ).toEqual([2, 0]);
    });
  });

  it('os tipos de ativo: os ids da lista, sem repetir, só no campo Ativo', () => {
    const tipo = '0195f0a1-7c3e-7b1a-9c2d-3e4f5a6b7c8d';
    const ativo = (tiposDeAtivo: unknown) =>
      comCampos((c) => [{ ...c[0], tiposDeAtivo } as CampoPedido, ...c.slice(1)]);
    const conferido = conferir(ativo([tipo, tipo.toUpperCase()]));
    expect(conferido.ok && conferido.formulario.campos[0]?.tiposDeAtivo).toEqual([tipo]);
    expect(recusas(ativo(['impressoras']))).toEqual({
      'campos.impressora.tiposDeAtivo': 'Escolha os tipos da lista.',
    });
    expect(recusas(ativo(tipo))).toEqual({
      'campos.impressora.tiposDeAtivo': 'Escolha os tipos da lista.',
    });
    const naFoto = conferir(
      comCampos((c) => [...c.slice(0, 3), { ...c[3], tiposDeAtivo: [tipo] }, ...c.slice(4)]),
    );
    expect(naFoto.ok && naFoto.formulario.campos[3]?.tiposDeAtivo).toEqual([]);
  });

  it('tem no máximo 20 campos', () => {
    const campos = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      tipo: 'texto-curto',
      rotulo: `Pergunta ${i}`,
    }));
    expect(recusas({ titulo: { comecaPeloTipo: true, campoId: null }, campos })).toEqual({
      campos: 'O formulário tem no máximo 20 campos.',
    });
    expect(
      conferir({ titulo: { comecaPeloTipo: true, campoId: null }, campos: campos.slice(1) }).ok,
    ).toBe(true);
  });

  describe('a condição', () => {
    it('depende de um campo anterior: o que vem depois precisa vir antes', () => {
      const movido = comCampos((c) => [c[0], c[2], c[1], ...c.slice(3)]);
      expect(recusas(movido)).toEqual({
        'campos.manchas.condicao':
          "'Onde as manchas aparecem?' depende de 'O que está acontecendo?', que precisa vir antes.",
      });
    });

    it('sem o rótulo, a frase da recusa cita o id do campo', () => {
      const movido = comCampos((c) => [c[0], { ...c[2], rotulo: '   ' }, c[1], ...c.slice(3)]);
      expect(recusas(movido)).toEqual({
        'campos.manchas.rotulo': 'Escreva o rótulo.',
        'campos.manchas.condicao':
          "'manchas' depende de 'O que está acontecendo?', que precisa vir antes.",
      });
    });

    it('junta as cláusulas com "e" e "ou", e o Sim ou não usa o valor', () => {
      const conferido = conferir(
        comCampos((c) => [
          ...c.slice(0, 2),
          {
            ...c[2],
            condicao: [
              { campoId: 'problema', opcaoId: 'manchando', juncao: 'ou' },
              { campoId: 'problema', opcaoId: 'atolando', juncao: 'ou' },
            ],
          },
          ...c.slice(3, 5),
          c[5],
          {
            id: 'qual-contrato',
            tipo: 'texto-curto',
            rotulo: 'Número do contrato',
            soDaTi: true,
            condicao: [{ campoId: 'contrato', valor: true }],
          },
        ]),
      );
      expect(conferido.ok).toBe(true);
      if (!conferido.ok) return;
      expect(conferido.formulario.campos[2]?.condicao).toEqual([
        { campoId: 'problema', opcaoId: 'manchando', juncao: null },
        { campoId: 'problema', opcaoId: 'atolando', juncao: 'ou' },
      ]);
      expect(conferido.formulario.campos[6]?.condicao).toEqual([
        { campoId: 'contrato', valor: true, juncao: null },
      ]);
    });

    it('o campo que a pessoa vê não depende de um campo só da TI', () => {
      const comNumero = comCampos((c) => [
        ...c,
        {
          id: 'qual-contrato',
          tipo: 'texto-curto',
          rotulo: 'Número do contrato',
          condicao: [{ campoId: 'contrato', valor: true }],
        },
      ]);
      expect(recusas(comNumero)).toEqual({
        'campos.qual-contrato.condicao':
          "'Número do contrato' aparece para a pessoa e depende de 'Contrato de manutenção', que só a TI vê.",
      });
    });

    it('o campo só da TI depende de qualquer campo anterior', () => {
      const contadorCondicional = comCampos((c) => [
        ...c.slice(0, 4),
        { ...c[4], condicao: [{ campoId: 'problema', opcaoId: 'nao-imprime' }] },
        c[5],
      ]);
      expect(conferir(contadorCondicional).ok).toBe(true);
    });

    it('a cláusula fora do formato é a recusa geral antes da ordem', () => {
      const movido = comCampos((c) => [
        c[0],
        { ...c[2], condicao: [{ campoId: 'problema', opcaoId: 'mancha ndo' }] },
        c[1],
        ...c.slice(3),
      ]);
      expect(recusas(movido)).toEqual({ formulario: GERAL });
    });

    it.each([
      [
        'seis cláusulas',
        Array.from({ length: 6 }, () => ({
          campoId: 'problema',
          opcaoId: 'manchando',
          juncao: 'e',
        })),
      ],
      ['o próprio campo', [{ campoId: 'manchas', opcaoId: 'borda' }]],
      ['um campo que não é de escolha', [{ campoId: 'impressora', opcaoId: 'manchando' }]],
      ['a escolha sem a opção', [{ campoId: 'problema', valor: true }]],
      [
        'a junção desconhecida',
        [
          { campoId: 'problema', opcaoId: 'manchando' },
          { campoId: 'problema', opcaoId: 'atolando', juncao: 'senao' },
        ],
      ],
    ])('%s é a recusa geral', (_, condicao) => {
      expect(
        recusas(comCampos((c) => [...c.slice(0, 2), { ...c[2], condicao }, ...c.slice(3)])),
      ).toEqual({ formulario: GERAL });
    });

    it('o Sim ou não sem o valor é a recusa geral', () => {
      expect(
        recusas(
          comCampos((c) => [
            ...c,
            {
              id: 'x',
              tipo: 'texto-curto',
              rotulo: 'Qual?',
              condicao: [{ campoId: 'contrato', opcaoId: 'sim' }],
            },
          ]),
        ),
      ).toEqual({ formulario: GERAL });
    });
  });

  describe('o que outro usa', () => {
    it('remover o campo de que outro depende é recusado na chave do campo removido', () => {
      expect(recusas(comCampos((c) => [c[0], ...c.slice(2)]))).toMatchObject({
        'campos.problema':
          "'Onde as manchas aparecem?' depende deste campo. Mude a condição antes.",
      });
    });

    it('remover a opção de uma condição é recusado na chave da opção removida', () => {
      const semManchando = comCampos((c) => [
        c[0],
        {
          ...c[1],
          opcoes: [
            { id: 'papel', texto: 'Não puxa o papel' },
            { id: 'atolando', texto: 'Atolando' },
            { id: 'nao-imprime', texto: 'Não imprime' },
          ],
        },
        ...c.slice(2),
      ]);
      expect(recusas(semManchando)).toEqual({
        'campos.problema.opcoes.manchando':
          "'Onde as manchas aparecem?' depende desta opção. Mude a condição antes.",
      });
    });

    it('o título vem de uma Escolha única, de um Texto curto ou de um Ativo, ou de nenhum', () => {
      const pedido = impressora();
      for (const campoId of ['impressora', 'problema', null]) {
        expect(conferir({ ...pedido, titulo: { comecaPeloTipo: false, campoId } }).ok).toBe(true);
      }
      expect(recusas({ ...pedido, titulo: { comecaPeloTipo: true, campoId: 'foto' } })).toEqual({
        formulario: GERAL,
      });
    });

    it('remover o campo do título é recusado na chave do campo removido', () => {
      const semProblema = comCampos((c) => [c[0], ...c.slice(3)]);
      expect(recusas(semProblema)).toEqual({
        'campos.problema': 'O título usa este campo. Escolha outro no Título do chamado.',
      });
    });

    it('o campo do título não pode ser só da TI', () => {
      const pedido = impressora();
      const ativoDaTi = {
        titulo: { comecaPeloTipo: true, campoId: 'impressora' },
        campos: [{ ...pedido.campos[0], soDaTi: true }, ...pedido.campos.slice(1)],
      };
      expect(recusas(ativoDaTi)).toEqual({
        'campos.impressora': "O título usa este campo. Ele não pode ser 'Só a TI vê'.",
      });
      const problemaDaTi = comCampos((c) => [c[0], { ...c[1], soDaTi: true }, ...c.slice(2)]);
      expect(recusas(problemaDaTi)).toEqual({
        'campos.problema': "O título usa este campo. Ele não pode ser 'Só a TI vê'.",
        'campos.manchas.condicao':
          "'Onde as manchas aparecem?' aparece para a pessoa e depende de 'O que está acontecendo?', que só a TI vê.",
      });
    });
  });

  describe('o Pede o ativo', () => {
    it('pede um campo Ativo', () => {
      const semAtivo = comCampos((c) => c.slice(1));
      expect(recusas(semAtivo, true)).toEqual({
        pedeOAtivo: 'Pede o ativo: inclua no formulário um campo Ativo obrigatório.',
      });
      expect(conferir(semAtivo, false).ok).toBe(true);
    });

    it.each([
      ['opcional', { obrigatorio: false }],
      ['só da TI', { soDaTi: true }],
      ['com condição', { condicao: [{ campoId: 'problema', opcaoId: 'nao-imprime' }] }],
    ])('recusa o primeiro campo Ativo %s', (_, mudanca) => {
      const pedido = comCampos((c) => [c[1], { ...c[0], ...mudanca }, ...c.slice(2)]);
      expect(recusas(pedido, true)).toEqual({
        pedeOAtivo:
          "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'.",
      });
    });

    it('vale o primeiro campo Ativo, mesmo com outro depois', () => {
      const comOutro = comCampos((c) => [
        ...c,
        { id: 'reserva', tipo: 'ativo', rotulo: 'Qual a impressora reserva?', soDaTi: true },
      ]);
      expect(conferir(comOutro, true).ok).toBe(true);
    });
  });

  it.each([
    ['nada', null],
    ['uma lista', []],
    ['sem os campos', { titulo: { comecaPeloTipo: true, campoId: null } }],
    ['sem o título', { campos: [] }],
    [
      'o campo que não é objeto',
      { titulo: { comecaPeloTipo: true, campoId: null }, campos: ['x'] },
    ],
    [
      'o tipo de campo desconhecido',
      {
        titulo: { comecaPeloTipo: true, campoId: null },
        campos: [{ id: 'a', tipo: 'cor', rotulo: 'Cor' }],
      },
    ],
  ])('%s é a recusa geral', (_, pedido) => {
    expect(recusas(pedido)).toEqual({ formulario: GERAL });
  });
});

describe('idDoFormulario', () => {
  it('monta o id dos bytes sorteados, no formato que o banco confere', () => {
    expect(idDoFormulario(new Uint8Array([0, 25, 26, 51, 52, 61, 62, 255]))).toBe('AZaz09AH');
    const id = idDoFormulario(new Uint8Array(10).fill(200));
    expect(id).toMatch(ID_DO_FORMULARIO);
    expect(id).toHaveLength(10);
  });
});
