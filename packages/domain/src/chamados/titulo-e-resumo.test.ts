import { describe, expect, it } from 'vitest';
import { type CampoDoFormulario, conferirFormulario, type Formulario } from './formulario.ts';
import {
  type ContextoDasRespostas,
  camposNaAuditoria,
  conferirTituloDoChamado,
  partesDoResumo,
  resumoDasRespostas,
  tituloDasRespostas,
} from './titulo-e-resumo.ts';

const IMPRESSORA = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c3d';
const NOTEBOOK = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c3e';
const SEM_PATRIMONIO = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c3f';
const DESCONHECIDO = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c99';
const FOTO = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c40';
const FOTO_2 = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c41';
const RECEPCAO = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c50';
const MARINA = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c60';

const contexto: ContextoDasRespostas = {
  nomeDoTipo: 'Impressora',
  ativos: new Map([
    [IMPRESSORA, { patrimonio: 'PAT-00139', rotulo: 'Impressora Financeiro' }],
    [NOTEBOOK, { patrimonio: 'NB-0231', rotulo: 'Notebook Dell Latitude 5440' }],
    [SEM_PATRIMONIO, { patrimonio: null, rotulo: 'Notebook da Recepção' }],
  ]),
  locais: new Map([[RECEPCAO, 'Administrativo, Recepção']]),
  pessoas: new Map([[MARINA, 'Marina Rocha']]),
};

const doTipo = (nomeDoTipo: string): ContextoDasRespostas => ({ ...contexto, nomeDoTipo });

/** Confere o pedido pelo `conferirFormulario`, para os testes usarem o formulário como a API o grava. */
function conferido(pedido: unknown): Formulario {
  const conferencia = conferirFormulario(pedido, { pedeOAtivo: false });
  if (!conferencia.ok) throw new Error(JSON.stringify(conferencia.erros));
  return conferencia.formulario;
}

type CampoPedido = Record<string, unknown>;

const formularioCom = (
  campos: CampoPedido[],
  titulo: { comecaPeloTipo: boolean; campoId: string | null } = {
    comecaPeloTipo: true,
    campoId: null,
  },
) => conferido({ titulo, campos });

/** O formulário da Impressora, com os nomes no resumo do m04. */
const camposDaImpressora = (): CampoPedido[] => [
  {
    id: 'impressora',
    tipo: 'ativo',
    rotulo: 'Qual impressora?',
    nomeNoResumo: 'Ativo',
    obrigatorio: true,
  },
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
];

const impressora = (campoId: string | null = 'problema') =>
  formularioCom(camposDaImpressora(), { comecaPeloTipo: true, campoId });

const MANCHANDO_NA_BORDA = {
  impressora: IMPRESSORA,
  problema: 'manchando',
  manchas: 'borda',
  contador: 18450,
  contrato: true,
};

/** O "O que está acontecendo?" da Rede e internet, com as opções que começam por sigla. */
const problemaDaRede = (): CampoPedido => ({
  id: 'problema',
  tipo: 'escolha-unica',
  rotulo: 'O que está acontecendo?',
  nomeNoResumo: 'Problema',
  obrigatorio: true,
  opcoes: [
    { id: 'sem-internet', texto: 'Sem internet' },
    { id: 'lenta', texto: 'Internet lenta' },
    { id: 'wifi', texto: 'Wi-Fi não conecta' },
    { id: 'vpn', texto: 'VPN não conecta' },
    { id: 'sistema', texto: 'Sem acesso a um sistema' },
  ],
});

/** Um campo que aparece quando a Rede e internet está "Sem acesso a um sistema". */
const comOSistema = (campo: CampoPedido): CampoPedido => ({
  ...campo,
  condicao: [{ campoId: 'problema', opcaoId: 'sistema' }],
});

const rede = (campos: CampoPedido[] = []) => formularioCom([problemaDaRede(), ...campos]);

const troca = () =>
  formularioCom(
    [
      { id: 'equipamento', tipo: 'ativo', rotulo: 'Qual equipamento?', obrigatorio: true },
      { id: 'motivo', tipo: 'texto-longo', rotulo: 'Por quê?', obrigatorio: true },
    ],
    { comecaPeloTipo: true, campoId: 'equipamento' },
  );

/** O "Acesso e senha" com o título de um Texto curto opcional. */
const acesso = () =>
  formularioCom(
    [
      { id: 'pasta', tipo: 'texto-curto', rotulo: 'Qual pasta ou sistema?' },
      { id: 'motivo', tipo: 'texto-longo', rotulo: 'Por que você precisa?' },
    ],
    { comecaPeloTipo: true, campoId: 'pasta' },
  );

describe('tituloDasRespostas', () => {
  it('começa pelo nome do tipo, com a primeira letra da opção minúscula', () => {
    expect(tituloDasRespostas(impressora(), MANCHANDO_NA_BORDA, contexto)).toBe(
      'Impressora manchando',
    );
  });

  it('sem o nome do tipo, deixa a opção como ela é', () => {
    const formulario = formularioCom([problemaDaRede()], {
      comecaPeloTipo: false,
      campoId: 'problema',
    });
    expect(tituloDasRespostas(formulario, { problema: 'lenta' }, doTipo('Rede e internet'))).toBe(
      'Internet lenta',
    );
  });

  it('mantém a maiúscula quando a primeira palavra tem outra letra maiúscula', () => {
    const formulario = formularioCom([problemaDaRede()], {
      comecaPeloTipo: true,
      campoId: 'problema',
    });
    const titulo = (problema: string) =>
      tituloDasRespostas(formulario, { problema }, doTipo('Rede e internet'));
    expect(titulo('vpn')).toBe('Rede e internet VPN não conecta');
    expect(titulo('wifi')).toBe('Rede e internet Wi-Fi não conecta');
    expect(titulo('sem-internet')).toBe('Rede e internet sem internet');
  });

  it('usa o texto como foi escrito, numa linha só', () => {
    const software = formularioCom(
      [{ id: 'programa', tipo: 'texto-curto', rotulo: 'Qual programa?', obrigatorio: true }],
      { comecaPeloTipo: true, campoId: 'programa' },
    );
    expect(tituloDasRespostas(software, { programa: '7-Zip' }, doTipo('Software'))).toBe(
      'Software 7-Zip',
    );
    expect(
      tituloDasRespostas(software, { programa: '  O Excel\n  não   abre ' }, doTipo('Software')),
    ).toBe('Software O Excel não abre');
  });

  it('usa o patrimônio do ativo ou, sem ele, o nome que as telas mostram', () => {
    const titulo = (equipamento: string) =>
      tituloDasRespostas(
        troca(),
        { equipamento, motivo: 'A tela quebrou' },
        doTipo('Troca de equipamento'),
      );
    expect(titulo(NOTEBOOK)).toBe('Troca de equipamento NB-0231');
    expect(titulo(SEM_PATRIMONIO)).toBe('Troca de equipamento Notebook da Recepção');
  });

  it('no Outro, sem campo para o título, usa o relato numa linha só', () => {
    const outro = formularioCom(
      [
        { id: 'relato', tipo: 'texto-longo', rotulo: 'Conte o que aconteceu', obrigatorio: true },
        { id: 'onde', tipo: 'local', rotulo: 'Onde você está?' },
        { id: 'foto', tipo: 'anexo', rotulo: 'Uma foto ajuda' },
      ],
      { comecaPeloTipo: false, campoId: null },
    );
    expect(
      tituloDasRespostas(
        outro,
        { relato: 'O projetor da sala 3\nnão liga', onde: RECEPCAO },
        doTipo('Outro'),
      ),
    ).toBe('O projetor da sala 3 não liga');
  });

  it('sem a resposta do campo escolhido, usa a primeira resposta de texto, sozinha', () => {
    expect(
      tituloDasRespostas(acesso(), { motivo: 'Entrei no Comercial' }, doTipo('Acesso e senha')),
    ).toBe('Entrei no Comercial');
  });

  it('sem nenhuma resposta de texto, usa o nome do tipo', () => {
    expect(tituloDasRespostas(acesso(), {}, doTipo('Acesso e senha'))).toBe('Acesso e senha');
    expect(tituloDasRespostas(impressora(null), MANCHANDO_NA_BORDA, contexto)).toBe('Impressora');
  });

  it('a primeira resposta de texto é só a de um campo que a pessoa vê', () => {
    const formulario = rede([
      { id: 'nota', tipo: 'texto-curto', rotulo: 'Nota da TI', soDaTi: true },
      comOSistema({
        id: 'qual',
        tipo: 'texto-curto',
        rotulo: 'Qual sistema?',
        apagarSeSumir: false,
      }),
      { id: 'mais', tipo: 'texto-longo', rotulo: 'Quer contar mais?' },
    ]);
    const respostas = { problema: 'lenta', nota: 'Link 2 caiu', qual: 'ERP' };
    expect(tituloDasRespostas(formulario, respostas, doTipo('Rede e internet'))).toBe(
      'Rede e internet',
    );
    expect(
      tituloDasRespostas(
        formulario,
        { ...respostas, mais: 'Desde as 8h' },
        doTipo('Rede e internet'),
      ),
    ).toBe('Desde as 8h');
  });

  it('o campo escolhido que a condição esconde não dá o título', () => {
    const formulario = formularioCom(
      [problemaDaRede(), comOSistema({ id: 'qual', tipo: 'texto-curto', rotulo: 'Qual sistema?' })],
      { comecaPeloTipo: true, campoId: 'qual' },
    );
    const titulo = (respostas: Record<string, unknown>) =>
      tituloDasRespostas(formulario, respostas, doTipo('Acesso a sistema'));
    expect(titulo({ problema: 'sistema', qual: 'ERP' })).toBe('Acesso a sistema ERP');
    expect(titulo({ problema: 'lenta', qual: 'ERP' })).toBe('Acesso a sistema');
  });

  it('o ativo que o contexto não traz não dá o título', () => {
    expect(
      tituloDasRespostas(
        troca(),
        { equipamento: DESCONHECIDO, motivo: 'A tela quebrou' },
        doTipo('Troca de equipamento'),
      ),
    ).toBe('A tela quebrou');
  });

  it('corta o título com mais de 120 caracteres em 120, com as reticências', () => {
    const texto = `${'a'.repeat(95)} ${'b'.repeat(94)}`;
    expect(texto).toHaveLength(190);
    const titulo = tituloDasRespostas(acesso(), { pasta: texto }, doTipo('Acesso e senha'));
    expect([...titulo]).toHaveLength(120);
    expect(titulo).toBe(`Acesso e senha ${'a'.repeat(95)} ${'b'.repeat(8)}…`);
  });

  it('não deixa o espaço antes das reticências', () => {
    const texto = `${'a'.repeat(103)} ${'b'.repeat(50)}`;
    expect(tituloDasRespostas(acesso(), { pasta: texto }, doTipo('Acesso e senha'))).toBe(
      `Acesso e senha ${'a'.repeat(103)}…`,
    );
  });

  it('conta os caracteres, e não as unidades do texto', () => {
    const software = formularioCom([{ id: 'programa', tipo: 'texto-curto', rotulo: 'Programa' }], {
      comecaPeloTipo: true,
      campoId: 'programa',
    });
    const titulo = (programa: string) =>
      tituloDasRespostas(software, { programa }, doTipo('Software'));
    expect(titulo('🔥'.repeat(150))).toBe(`Software ${'🔥'.repeat(110)}…`);
    expect(titulo('a'.repeat(111))).toBe(`Software ${'a'.repeat(111)}`);
  });
});

describe('resumoDasRespostas', () => {
  it('junta as respostas que a pessoa vê, com a condicional depois da vírgula e o ativo por último', () => {
    expect(resumoDasRespostas(impressora(), MANCHANDO_NA_BORDA, contexto)).toBe(
      'Problema: Manchando, na borda · Ativo: PAT-00139',
    );
  });

  it('as partes dão o nome e a resposta de cada uma, com o patrimônio do ativo na mono', () => {
    expect(partesDoResumo(impressora(), MANCHANDO_NA_BORDA, contexto)).toEqual([
      { nome: 'Problema', resposta: 'Manchando, na borda', mono: false },
      { nome: 'Ativo', resposta: 'PAT-00139', mono: true },
    ]);
    const semPatrimonio: ContextoDasRespostas = {
      ...contexto,
      ativos: new Map([[IMPRESSORA, { patrimonio: null, rotulo: 'Impressora Financeiro' }]]),
    };
    expect(partesDoResumo(impressora(), MANCHANDO_NA_BORDA, semPatrimonio).at(-1)).toEqual({
      nome: 'Ativo',
      resposta: 'Impressora Financeiro',
      mono: false,
    });
  });

  it('sem o nome no resumo, usa o rótulo sem o "?"', () => {
    expect(
      resumoDasRespostas(impressora(), { ...MANCHANDO_NA_BORDA, foto: [FOTO] }, contexto),
    ).toBe('Problema: Manchando, na borda · Uma foto ajuda: 1 arquivo · Ativo: PAT-00139');
    const toner = formularioCom([
      {
        id: 'cor',
        tipo: 'escolha-unica',
        rotulo: 'Qual cor acabou?',
        opcoes: [
          { id: 'preto', texto: 'Preto' },
          { id: 'ciano', texto: 'Ciano' },
        ],
      },
    ]);
    expect(resumoDasRespostas(toner, { cor: 'preto' }, doTipo('Toner'))).toBe(
      'Qual cor acabou: Preto',
    );
  });

  it('mostra a resposta de cada tipo de campo', () => {
    const formulario = formularioCom([
      { id: 'curto', tipo: 'texto-curto', rotulo: 'Qual programa?' },
      { id: 'longo', tipo: 'texto-longo', rotulo: 'Quer contar mais?' },
      {
        id: 'unica',
        tipo: 'escolha-unica',
        rotulo: 'Qual telefone?',
        opcoes: [
          { id: 'ramal', texto: 'Ramal da mesa' },
          { id: 'celular', texto: 'Celular da empresa' },
        ],
      },
      {
        id: 'varias',
        tipo: 'varias-opcoes',
        rotulo: 'O que não abre?',
        opcoes: [
          { id: 'email', texto: 'E-mail' },
          { id: 'wifi', texto: 'Wi-Fi' },
          { id: 'vpn', texto: 'VPN' },
          { id: 'pasta', texto: 'Pasta do Financeiro' },
        ],
      },
      { id: 'local', tipo: 'local', rotulo: 'Onde você está?' },
      { id: 'pessoa', tipo: 'pessoa', rotulo: 'Quem vai usar?' },
      { id: 'data', tipo: 'data', rotulo: 'Data de chegada' },
      { id: 'numero', tipo: 'numero', rotulo: 'Quantas páginas?' },
      { id: 'anexo', tipo: 'anexo', rotulo: 'Fotos' },
      { id: 'reiniciou', tipo: 'sim-ou-nao', rotulo: 'Já reiniciou?' },
      { id: 'cabo', tipo: 'sim-ou-nao', rotulo: 'O cabo está ligado?' },
    ]);
    const respostas = {
      curto: '7-Zip',
      longo: 'Começou\n\nhoje   cedo',
      unica: 'ramal',
      varias: ['pasta', 'email', 'wifi', 'vpn'],
      local: RECEPCAO,
      pessoa: MARINA,
      data: '2026-11-12',
      numero: 18450,
      anexo: [FOTO, FOTO_2],
      reiniciou: false,
      cabo: true,
    };
    expect(resumoDasRespostas(formulario, respostas, contexto).split(' · ')).toEqual([
      'Qual programa: 7-Zip',
      'Quer contar mais: Começou hoje cedo',
      'Qual telefone: Ramal da mesa',
      'O que não abre: E-mail, Wi-Fi, VPN, pasta do Financeiro',
      'Onde você está: Administrativo, Recepção',
      'Quem vai usar: Marina Rocha',
      'Data de chegada: 12/11/2026',
      'Quantas páginas: 18.450',
      'Fotos: 2 arquivos',
      'Já reiniciou: Não',
      'O cabo está ligado: Sim',
    ]);
  });

  it('junta a opção condicional com a minúscula, fora quando a primeira palavra tem outra maiúscula', () => {
    const formulario = rede([
      comOSistema({
        id: 'qual',
        tipo: 'escolha-unica',
        rotulo: 'Qual sistema?',
        opcoes: [
          { id: 'vpn', texto: 'VPN não conecta' },
          { id: 'pasta', texto: 'Pasta do Financeiro' },
        ],
      }),
    ]);
    const resumo = (qual: string) =>
      resumoDasRespostas(formulario, { problema: 'sistema', qual }, doTipo('Rede e internet'));
    expect(resumo('vpn')).toBe('Problema: Sem acesso a um sistema, VPN não conecta');
    expect(resumo('pasta')).toBe('Problema: Sem acesso a um sistema, pasta do Financeiro');
  });

  it('junta o texto condicional como foi escrito, e a pessoa condicional fica com o nome dela', () => {
    const formulario = rede([
      comOSistema({ id: 'quem', tipo: 'texto-curto', rotulo: 'Quem pediu?' }),
      comOSistema({ id: 'pessoa', tipo: 'pessoa', rotulo: 'Para quem?' }),
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        { problema: 'sistema', quem: 'Fernanda pediu a troca', pessoa: MARINA },
        doTipo('Rede e internet'),
      ),
    ).toBe('Problema: Sem acesso a um sistema, Fernanda pediu a troca · Para quem: Marina Rocha');
  });

  it('junta as Várias opções condicionais com a minúscula, e o Sim ou não condicional fica com o nome dele', () => {
    const formulario = rede([
      comOSistema({ id: 'reiniciou', tipo: 'sim-ou-nao', rotulo: 'Já reiniciou?' }),
      comOSistema({
        id: 'quais',
        tipo: 'varias-opcoes',
        rotulo: 'Quais?',
        opcoes: [
          { id: 'email', texto: 'E-mail' },
          { id: 'vpn', texto: 'VPN' },
        ],
      }),
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        { problema: 'sistema', reiniciou: true, quais: ['vpn', 'email'] },
        doTipo('Rede e internet'),
      ),
    ).toBe('Problema: Sem acesso a um sistema, e-mail, VPN · Já reiniciou: Sim');
  });

  it('o Sim ou não, a data, o local, o número e o anexo condicionais ficam com o nome no resumo, e o que depende deles se junta a eles', () => {
    const formulario = rede([
      comOSistema({ id: 'reiniciou', tipo: 'sim-ou-nao', rotulo: 'Já reiniciou?' }),
      {
        id: 'depois',
        tipo: 'texto-curto',
        rotulo: 'E depois?',
        condicao: [{ campoId: 'reiniciou', valor: true }],
      },
      comOSistema({ id: 'quando', tipo: 'data', rotulo: 'Desde quando?' }),
      comOSistema({ id: 'onde', tipo: 'local', rotulo: 'Onde?' }),
      comOSistema({ id: 'vezes', tipo: 'numero', rotulo: 'Quantas vezes?' }),
      comOSistema({ id: 'fotos', tipo: 'anexo', rotulo: 'Fotos' }),
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        {
          problema: 'sistema',
          reiniciou: true,
          depois: 'Voltou a travar',
          quando: '2026-11-12',
          onde: RECEPCAO,
          vezes: 3,
          fotos: [FOTO],
        },
        doTipo('Rede e internet'),
      ).split(' · '),
    ).toEqual([
      'Problema: Sem acesso a um sistema',
      'Já reiniciou: Sim, Voltou a travar',
      'Desde quando: 12/11/2026',
      'Onde: Administrativo, Recepção',
      'Quantas vezes: 3',
      'Fotos: 1 arquivo',
    ]);
  });

  it('em cadeia, junta tudo na resposta do primeiro campo', () => {
    const formulario = rede([
      comOSistema({
        id: 'qual',
        tipo: 'escolha-unica',
        rotulo: 'Qual sistema?',
        opcoes: [
          { id: 'erp', texto: 'O ERP' },
          { id: 'pasta', texto: 'Uma pasta' },
        ],
      }),
      {
        id: 'erro',
        tipo: 'texto-curto',
        rotulo: 'Qual erro aparece?',
        condicao: [{ campoId: 'qual', opcaoId: 'erp' }],
      },
      { id: 'mais', tipo: 'texto-longo', rotulo: 'Quer contar mais?' },
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        { problema: 'sistema', qual: 'erp', erro: 'Senha expirada', mais: 'Desde ontem' },
        doTipo('Rede e internet'),
      ),
    ).toBe(
      'Problema: Sem acesso a um sistema, o ERP, Senha expirada · Quer contar mais: Desde ontem',
    );
  });

  it('junta a resposta à do campo da primeira cláusula que vale', () => {
    const formulario = formularioCom([
      {
        id: 'a',
        tipo: 'escolha-unica',
        rotulo: 'Qual andar?',
        opcoes: [
          { id: 'terreo', texto: 'Térreo' },
          { id: 'primeiro', texto: 'Primeiro' },
        ],
      },
      {
        id: 'b',
        tipo: 'sim-ou-nao',
        rotulo: 'Tem visita?',
      },
      {
        id: 'sala',
        tipo: 'texto-curto',
        rotulo: 'Qual sala?',
        condicao: [
          { campoId: 'a', opcaoId: 'primeiro' },
          { campoId: 'b', valor: true, juncao: 'ou' },
        ],
      },
    ]);
    const resumo = (respostas: Record<string, unknown>) =>
      resumoDasRespostas(formulario, respostas, doTipo('Sala'));
    expect(resumo({ a: 'terreo', b: true, sala: 'Sala 3' })).toBe(
      'Qual andar: Térreo · Tem visita: Sim, Sala 3',
    );
    expect(resumo({ a: 'primeiro', b: true, sala: 'Sala 3' })).toBe(
      'Qual andar: Primeiro, Sala 3 · Tem visita: Sim',
    );
  });

  it('em "A e B ou C", com A e C valendo e B não, junta a resposta à do A', () => {
    const formulario = formularioCom([
      {
        id: 'a',
        tipo: 'escolha-unica',
        rotulo: 'Qual andar?',
        opcoes: [
          { id: 'terreo', texto: 'Térreo' },
          { id: 'primeiro', texto: 'Primeiro' },
        ],
      },
      { id: 'b', tipo: 'sim-ou-nao', rotulo: 'Tem visita?' },
      { id: 'c', tipo: 'sim-ou-nao', rotulo: 'É urgente?' },
      {
        id: 'sala',
        tipo: 'texto-curto',
        rotulo: 'Qual sala?',
        condicao: [
          { campoId: 'a', opcaoId: 'primeiro' },
          { campoId: 'b', valor: true, juncao: 'e' },
          { campoId: 'c', valor: true, juncao: 'ou' },
        ],
      },
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        { a: 'primeiro', b: false, c: true, sala: 'Sala 3' },
        doTipo('Sala'),
      ),
    ).toBe('Qual andar: Primeiro, Sala 3 · Tem visita: Não · É urgente: Sim');
  });

  it('põe os ativos por último, na ordem do formulário, também o que aparece por uma condição', () => {
    const formulario = formularioCom([
      { id: 'atual', tipo: 'ativo', rotulo: 'Qual equipamento?', nomeNoResumo: 'Ativo' },
      {
        id: 'motivo',
        tipo: 'escolha-unica',
        rotulo: 'Por quê?',
        opcoes: [
          { id: 'quebrou', texto: 'Quebrou' },
          { id: 'lento', texto: 'Está lento' },
        ],
      },
      {
        id: 'novo',
        tipo: 'ativo',
        rotulo: 'Qual o novo?',
        condicao: [{ campoId: 'motivo', opcaoId: 'quebrou' }],
      },
      { id: 'quando', tipo: 'data', rotulo: 'Para quando?' },
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        { atual: SEM_PATRIMONIO, motivo: 'quebrou', novo: NOTEBOOK, quando: '2026-11-20' },
        doTipo('Troca de equipamento'),
      ),
    ).toBe(
      'Por quê: Quebrou · Para quando: 20/11/2026 · Ativo: Notebook da Recepção · Qual o novo: NB-0231',
    );
  });

  it('deixa de fora os campos escondidos, também com a resposta guardada, e os só da TI', () => {
    const formulario = formularioCom(
      camposDaImpressora().map((campo) =>
        campo.id === 'manchas' ? { ...campo, apagarSeSumir: false } : campo,
      ),
    );
    expect(
      resumoDasRespostas(
        formulario,
        { ...MANCHANDO_NA_BORDA, problema: 'papel', manchas: 'borda' },
        contexto,
      ),
    ).toBe('Problema: Não puxa o papel · Ativo: PAT-00139');
  });

  it('sem respostas, o resumo é vazio', () => {
    expect(resumoDasRespostas(impressora(), {}, contexto)).toBe('');
  });

  it('deixa de fora o que o contexto não traz e o que não está no tipo do campo', () => {
    const formulario = formularioCom([
      { id: 'ativo', tipo: 'ativo', rotulo: 'Qual ativo?' },
      { id: 'local', tipo: 'local', rotulo: 'Onde?' },
      { id: 'pessoa', tipo: 'pessoa', rotulo: 'Quem?' },
      { id: 'texto', tipo: 'texto-curto', rotulo: 'O quê?' },
      {
        id: 'unica',
        tipo: 'escolha-unica',
        rotulo: 'Qual?',
        opcoes: [
          { id: 'x', texto: 'X' },
          { id: 'y', texto: 'Y' },
        ],
      },
      {
        id: 'varias',
        tipo: 'varias-opcoes',
        rotulo: 'Quais?',
        opcoes: [
          { id: 'x', texto: 'X' },
          { id: 'y', texto: 'Y' },
        ],
      },
      { id: 'data', tipo: 'data', rotulo: 'Quando?' },
      { id: 'numero', tipo: 'numero', rotulo: 'Quantos?' },
      { id: 'sim', tipo: 'sim-ou-nao', rotulo: 'Sim?' },
    ]);
    expect(
      resumoDasRespostas(
        formulario,
        {
          ativo: DESCONHECIDO,
          local: DESCONHECIDO,
          pessoa: DESCONHECIDO,
          texto: 42,
          unica: 'z',
          varias: ['z', 'y'],
          data: '12/11/2026',
          numero: '18450',
          sim: 'sim',
        },
        contexto,
      ),
    ).toBe('Quais: Y');
    expect(resumoDasRespostas(formulario, { local: RECEPCAO }, { nomeDoTipo: 'Outro' })).toBe('');
  });

  it('lê só as respostas do próprio pedido, também com os ids que são nomes do JavaScript', () => {
    const campo = (id: string): CampoDoFormulario => ({
      id,
      tipo: 'texto-curto',
      rotulo: id,
      nomeNoResumo: null,
      obrigatorio: false,
      soDaTi: false,
      apagarSeSumir: true,
      opcoes: [],
      tiposDeAtivo: [],
      condicao: [],
    });
    const formulario: Formulario = {
      titulo: { comecaPeloTipo: true, campoId: 'constructor' },
      campos: [campo('constructor'), campo('toString')],
    };
    expect(tituloDasRespostas(formulario, {}, doTipo('Outro'))).toBe('Outro');
    expect(resumoDasRespostas(formulario, {}, doTipo('Outro'))).toBe('');
    expect(
      resumoDasRespostas(formulario, JSON.parse('{"toString": "Teste"}'), doTipo('Outro')),
    ).toBe('toString: Teste');
  });
});

describe('o título que quem abre escreve', () => {
  it('fica numa linha só, sem os espaços das pontas', () => {
    expect(conferirTituloDoChamado('  Notebook da recepção   não liga\n ')).toEqual({
      ok: true,
      titulo: 'Notebook da recepção não liga',
    });
  });

  it('vazio, ou só com espaços, pede o título', () => {
    expect(conferirTituloDoChamado('')).toEqual({ ok: false, erro: 'Escreva o título.' });
    expect(conferirTituloDoChamado(' \n\t ')).toEqual({ ok: false, erro: 'Escreva o título.' });
  });

  it('conta os caracteres, e não as unidades do UTF-16, até 120', () => {
    const noLimite = '🖨'.repeat(120);
    expect(conferirTituloDoChamado(noLimite)).toEqual({ ok: true, titulo: noLimite });
    expect(conferirTituloDoChamado(`${noLimite}a`)).toEqual({
      ok: false,
      erro: 'Use até 120 caracteres.',
    });
  });

  it('conta depois de juntar os espaços', () => {
    const titulo = `${'a'.repeat(60)}     ${'b'.repeat(59)}`;
    expect(conferirTituloDoChamado(titulo)).toEqual({
      ok: true,
      titulo: `${'a'.repeat(60)} ${'b'.repeat(59)}`,
    });
  });
});

describe('camposNaAuditoria', () => {
  /** A Impressora com os campos só da TI da revisão: a foto da peça, o técnico e as observações. */
  const comOsDaTi = () =>
    formularioCom([
      ...camposDaImpressora(),
      { id: 'peca', tipo: 'anexo', rotulo: 'Foto da peça', soDaTi: true },
      { id: 'tecnico', tipo: 'pessoa', rotulo: 'Quem foi ao local?', soDaTi: true },
      { id: 'obs', tipo: 'texto-longo', rotulo: 'Observação', soDaTi: true },
      {
        id: 'obs-final',
        tipo: 'texto-longo',
        rotulo: 'Observação final',
        nomeNoResumo: 'Observação',
        soDaTi: true,
      },
    ]);

  const campoDe = (id: string): CampoDoFormulario => {
    const campo = comOsDaTi().campos.find((um) => um.id === id);
    if (!campo) throw new Error(`Sem o campo ${id}.`);
    return campo;
  };

  it('Campo da TI preenchido: o antes e o depois pelo nome no resumo, como o resumo mostra', () => {
    expect(
      camposNaAuditoria([{ campo: campoDe('contador'), antes: null, depois: 48_210 }], contexto),
    ).toEqual({ antes: {}, depois: { 'Contador de páginas': '48.210' } });
  });

  it('Anexo tirado de um campo da TI: "1 arquivo" antes e nada depois', () => {
    expect(
      camposNaAuditoria([{ campo: campoDe('peca'), antes: [FOTO], depois: null }], contexto),
    ).toEqual({ antes: { 'Foto da peça': '1 arquivo' }, depois: {} });
  });

  it('cada campo que mudou, com o sim ou não e a pessoa pelos nomes', () => {
    expect(
      camposNaAuditoria(
        [
          { campo: campoDe('contrato'), antes: false, depois: true },
          { campo: campoDe('peca'), antes: [FOTO, FOTO_2], depois: [FOTO] },
          { campo: campoDe('tecnico'), antes: null, depois: MARINA },
        ],
        contexto,
      ),
    ).toEqual({
      antes: { 'Contrato de manutenção': 'Não', 'Foto da peça': '2 arquivos' },
      depois: {
        'Contrato de manutenção': 'Sim',
        'Foto da peça': '1 arquivo',
        'Quem foi ao local': 'Marina Rocha',
      },
    });
  });

  it('o nome repetido ganha o número da vez, para um campo não apagar o outro', () => {
    expect(
      camposNaAuditoria(
        [
          { campo: campoDe('obs'), antes: null, depois: 'Troquei o toner.' },
          { campo: campoDe('obs-final'), antes: 'Pedir o fusor', depois: null },
        ],
        contexto,
      ),
    ).toEqual({
      antes: { 'Observação (2)': 'Pedir o fusor' },
      depois: { Observação: 'Troquei o toner.' },
    });
  });

  it('o nome dos nomes do JavaScript fica no próprio registro', () => {
    const campo = { ...campoDe('obs'), rotulo: '__proto__', nomeNoResumo: null };
    const { depois } = camposNaAuditoria([{ campo, antes: null, depois: 'Teste' }], contexto);
    expect(JSON.stringify(depois)).toBe('{"__proto__":"Teste"}');
    expect(Object.getPrototypeOf(depois)).toBe(Object.prototype);
  });
});
