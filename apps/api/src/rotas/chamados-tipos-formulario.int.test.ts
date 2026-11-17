// O formulário do tipo de chamado pela API (spec tipos-de-chamado, "Formulário do tipo", "Condição
// de um campo", "Título montado das respostas" e "Formulário que muda"; change chamados-da-ti,
// design, decisões 2 e 6, tarefa 4.3): a leitura, com o "Pede o ativo" e os chamados abertos que
// mantêm o formulário anterior; a gravação pelo `conferirFormulario`, com as recusas no campo e os
// tipos de ativo do campo Ativo conferidos pela API; e a trava do tipo, que não deixa a gravação do
// formulário e a do tipo se cruzarem no "Pede o ativo". Tudo com a auditoria e o evento dos ajustes.
import { chamados, eventos, naOrganizacao, tiposDeAtivo, tiposDeChamado } from '@grafite/db';
import {
  type CampoDoFormulario,
  type Formulario,
  RECUSA_DO_FORMULARIO,
  TIPOS_DE_CHAMADO_DE_FABRICA,
} from '@grafite/domain';
import { eq, notInArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarTipo, desligarModulos } from '../../test/alertas.ts';
import { pedidoDoTipo } from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  esperarNaTrava,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica, linhasDosTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-tipos-formulario.local';
const ATOR = { tipo: 'sistema', descricao: 'teste do formulário dos tipos de chamado' } as const;
const AJUSTES = 'ajustes-dos-chamados.mudaram';
const SEM_O_ATIVO = 'Pede o ativo: inclua no formulário um campo Ativo obrigatório.';
const ATIVO_OPCIONAL =
  "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'.";
const DA_LISTA = 'Escolha os tipos da lista.';

/** O tipo como a lista o devolve, só com o que a gravação do tipo pede. */
interface TipoLido {
  id: string;
  nome: string;
  icone: string;
  frase: string | null;
  situacao: string;
  prazo: unknown;
  atendePorPadrao: { id: string } | null;
  semNinguem: string;
  podeVirarOs: boolean;
  geraSolicitacao: string;
  tipoDeAtivoDoEquipamento: { id: string } | null;
  pedeOAtivo: boolean;
  apareceParaOColaborador: boolean;
  soATiAbre: boolean;
  campos: number;
}

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
/** Os tipos de fábrica pelo nome. */
const tipos: Record<string, string> = {};
let daOutra = '';
let tipoDeAtivoDaOutra = '';
let notebook = '';
let monitor = '';
let matricial = '';
let ana = '';
let renato = '';
let pessoa = '';
let numero = 1000;

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const id = (nome: string) => tipos[nome] ?? '';
const lerFormulario = (tipo: string, usuario = 'ana') =>
  cliente.consultar(`/chamados/tipos/${tipo}/formulario`, como(usuario));
const salvarFormulario = (tipo: string, formulario: object, usuario = 'ana') =>
  cliente.enviar('PUT', `/chamados/tipos/${tipo}/formulario`, como(usuario), formulario);

async function tipoNaLista(nome: string): Promise<TipoLido> {
  const lista: TipoLido[] = (await cliente.consultar('/chamados/tipos', como('ana'))).json().tipos;
  const tipo = lista.find((de) => de.nome === nome);
  if (!tipo) throw new Error(`O tipo ${nome} não está na lista.`);
  return tipo;
}

/** A gravação do tipo, como a tela a manda, com o que mudou. */
async function salvarTipo(nome: string, mudanca: Partial<TipoLido>) {
  const tipo = { ...(await tipoNaLista(nome)), ...mudanca };
  return cliente.enviar('PUT', `/chamados/tipos/${tipo.id}`, como('ana'), pedidoDoTipo(tipo));
}

/** O formulário de fábrica do tipo, numa cópia que o teste pode mudar. */
function deFabrica(nome: string): Formulario {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((de) => de.nome === nome);
  if (!tipo) throw new Error(`O tipo ${nome} não é de fábrica.`);
  return structuredClone(tipo.formulario);
}

/** O campo com os padrões do construtor. */
const campoNovo = (
  campoId: string,
  tipo: CampoDoFormulario['tipo'],
  rotulo: string,
  parte: Partial<CampoDoFormulario> = {},
): CampoDoFormulario => ({
  id: campoId,
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

/** O formulário com o campo de id dado mudado. */
const comOCampo = (
  formulario: Formulario,
  campoId: string,
  mudanca: Partial<CampoDoFormulario>,
): Formulario => ({
  ...formulario,
  campos: formulario.campos.map((campo) =>
    campo.id === campoId ? { ...campo, ...mudanca } : campo,
  ),
});

/** O formulário sem o campo de id dado. */
const semOCampo = (formulario: Formulario, campoId: string): Formulario => ({
  ...formulario,
  campos: formulario.campos.filter((campo) => campo.id !== campoId),
});

const linhaDoTipo = (tipo: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select().from(tiposDeChamado).where(eq(tiposDeChamado.id, tipo));
    return linha;
  });

const mudarNoBanco = (tipo: string, valores: Partial<typeof tiposDeChamado.$inferInsert>) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(tiposDeChamado).set(valores).where(eq(tiposDeChamado.id, tipo)),
  );

/** Um chamado direto no banco, com a cópia do formulário que ele guarda desde a abertura. */
function chamado(
  tipo: string,
  situacao: 'triagem' | 'em-atendimento' | 'resolvido',
  formulario: Formulario,
) {
  const abertoEm = api.relogio.agora();
  numero += 1;
  return naOrganizacao(api.banco, org, async (tx) => {
    const [gravado] = await tx
      .insert(chamados)
      .values({
        orgId: org,
        numero,
        tipoId: tipo,
        titulo: 'Telefone sem tom',
        tituloNormalizado: 'telefone sem tom',
        pessoaId: pessoa,
        origem: 'ti',
        abertoPor: renato,
        abertoEm,
        formulario: { ...formulario },
        situacao,
        responsavelId: situacao === 'em-atendimento' ? renato : null,
        responsavelDesde: situacao === 'em-atendimento' ? abertoEm : null,
        prazo: {
          modo: 'corridas',
          respostaMin: 60,
          resolucaoMin: 600,
          resposta: { valor: 1, unidade: 'h' },
          resolucao: { valor: 10, unidade: 'h' },
        },
        relogioDesde: situacao === 'resolvido' ? null : abertoEm,
        primeiraRespostaEm: abertoEm,
        resolvidoEm: situacao === 'resolvido' ? abertoEm : null,
        resolvidoPor: situacao === 'resolvido' ? renato : null,
      })
      .returning({ id: chamados.id });
    return gravado?.id ?? '';
  });
}

/** O que a requisição registrou na auditoria. */
const acoesDa = async (resposta: { headers: Record<string, unknown> }) =>
  (await auditoriaDaRequisicao(api, org, resposta)).map(
    ({ acao, alvoTipo, alvoId, atorContaId, antes, depois, dados }) => ({
      acao,
      alvoTipo,
      alvoId,
      atorContaId,
      antes,
      depois,
      dados,
    }),
  );

const eventosGravados = () =>
  naOrganizacao(api.banco, org, async (tx) =>
    (await tx.select({ tipo: eventos.tipo }).from(eventos)).map(({ tipo }) => tipo),
  );

/**
 * Outra transação trava a linha do tipo e a segura até a função devolvida soltá-la: os pedidos
 * enviados enquanto isso param na trava, na ordem em que chegaram.
 */
async function segurarOTipo(tipo: string): Promise<() => Promise<void>> {
  let soltar = () => {};
  let presa = () => {};
  const linhaPresa = new Promise<void>((resolve) => {
    presa = resolve;
  });
  const segurando = naOrganizacao(api.banco, org, async (tx) => {
    await tx
      .select({ id: tiposDeChamado.id })
      .from(tiposDeChamado)
      .where(eq(tiposDeChamado.id, tipo))
      .for('update');
    presa();
    await new Promise<void>((resolve) => {
      soltar = resolve;
    });
  });
  await linhaPresa;
  return async () => {
    soltar();
    await segurando;
  };
}

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const outra = await criarOrganizacao(api, {
    nome: 'Outra',
    enderecos: ['grafite.chamados-tipos-formulario-outra.local'],
  });
  const momento = api.relogio.agora();
  for (const de of [org, outra]) {
    await naOrganizacao(api.banco, de, (tx) => criarTiposDeFabrica(tx, { ator: ATOR, momento }));
  }
  for (const tipo of await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
  )) {
    tipos[tipo.nome] = tipo.id;
  }
  daOutra = await naOrganizacao(
    api.banco,
    outra,
    async (tx) => (await tx.select({ id: tiposDeChamado.id }).from(tiposDeChamado))[0]?.id ?? '',
  );

  notebook = await criarTipo(api, org, { nome: 'Notebook' });
  monitor = await criarTipo(api, org, { nome: 'Monitor' });
  matricial = await criarTipo(api, org, { nome: 'Impressora matricial', situacao: 'inativo' });
  tipoDeAtivoDaOutra = await criarTipo(api, outra, { nome: 'Tablet' });

  cliente = clienteDaApi(api, host);
  // Ana configura os chamados; Renato os atende, sem configurar. Os chamados são de Fernanda.
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  ana = (await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' })).id;
  renato = (await criarConta(api, org, { usuario: 'renato', nome: 'Renato Alves' })).id;
  pessoa = (await criarConta(api, org, { usuario: 'fernanda', nome: 'Fernanda Rocha' })).pessoaId;
  await atribuir(api, org, { perfilId: configura, contaId: ana });
  await atribuir(api, org, { perfilId: atende, contaId: renato });
  for (const usuario of ['ana', 'renato']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  // Cada teste começa dos 9 tipos de fábrica como a lista os cria, sem os que os outros testes
  // criaram, com o Monitor ativo e sem eventos.
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.update(tiposDeChamado).set({ duplicadoDe: null });
    await tx.delete(tiposDeChamado).where(notInArray(tiposDeChamado.id, Object.values(tipos)));
    for (const linha of linhasDosTiposDeFabrica()) {
      await tx
        .update(tiposDeChamado)
        .set({ ...linha, formulario: { ...linha.formulario } })
        .where(eq(tiposDeChamado.id, id(linha.nome)));
    }
    await tx.update(tiposDeAtivo).set({ situacao: 'ativo' }).where(eq(tiposDeAtivo.id, monitor));
    await tx.delete(eventos);
  });
});

describe('a leitura do formulário', () => {
  it('traz o formulário gravado e o "Pede o ativo" do tipo', async () => {
    const r = await lerFormulario(id('Impressora'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ formulario: deFabrica('Impressora'), pedeOAtivo: true, abertos: 0 });
    expect((await lerFormulario(id('Outro'))).json()).toEqual({
      formulario: deFabrica('Outro'),
      pedeOAtivo: false,
      abertos: 0,
    });
  });

  it('Campo novo com um chamado aberto: os abertos mantêm o formulário com que abriram', async () => {
    // O Telefone tem dois chamados abertos, um na triagem e outro com Renato, e um resolvido. Só
    // este teste abre chamados, que o papel da aplicação não apaga.
    const telefone = deFabrica('Telefone');
    const aberto = await chamado(id('Telefone'), 'triagem', telefone);
    await chamado(id('Telefone'), 'em-atendimento', telefone);
    await chamado(id('Telefone'), 'resolvido', telefone);
    const lido = await lerFormulario(id('Telefone'));
    expect(lido.json()).toMatchObject({ pedeOAtivo: false, abertos: 2 });

    const novo = {
      ...telefone,
      campos: [...telefone.campos, campoNovo('ramal', 'texto-curto', 'Qual o ramal?')],
    };
    const r = await salvarFormulario(id('Telefone'), novo);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ formulario: novo, pedeOAtivo: false, abertos: 2 });
    const [copia] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ formulario: chamados.formulario }).from(chamados).where(eq(chamados.id, aberto)),
    );
    expect(copia?.formulario).toEqual(telefone);
  });
});

describe('a gravação do formulário', () => {
  it('grava o formulário conferido, só com as chaves conhecidas, com a auditoria e o evento', async () => {
    const antes = deFabrica('Impressora');
    // O campo novo chega como a tela o monta, com uma chave a mais e sem as que têm padrão, e o
    // rótulo com espaços nas pontas; o formulário também traz uma chave a mais.
    const r = await salvarFormulario(id('Impressora'), {
      ...antes,
      campos: [
        ...antes.campos,
        {
          id: 'modelo-do-toner',
          tipo: 'texto-curto',
          rotulo: '  Modelo do toner ',
          nomeNoResumo: '',
          obrigatorio: false,
          soDaTi: false,
          sobra: 'fora do formulário',
        },
      ],
      versao: 2,
    });
    expect(r.statusCode, r.body).toBe(200);
    const depois = {
      ...antes,
      campos: [...antes.campos, campoNovo('modelo-do-toner', 'texto-curto', 'Modelo do toner')],
    };
    expect(r.json()).toEqual({ formulario: depois, pedeOAtivo: true, abertos: 0 });
    expect((await linhaDoTipo(id('Impressora')))?.formulario).toEqual(depois);
    expect((await tipoNaLista('Impressora')).campos).toBe(7);
    expect(await acoesDa(r)).toEqual([
      {
        acao: 'tipo-de-chamado.formulario-salvo',
        alvoTipo: 'tipo-de-chamado',
        alvoId: id('Impressora'),
        atorContaId: ana,
        antes: { formulario: antes },
        depois: { formulario: depois },
        dados: { tipo: 'Impressora' },
      },
    ]);
    expect(await eventosGravados()).toEqual([AJUSTES]);
  });

  it('o formulário igual ao gravado não grava nada', async () => {
    const r = await salvarFormulario(id('Impressora'), deFabrica('Impressora'));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ formulario: deFabrica('Impressora'), pedeOAtivo: true, abertos: 0 });
    expect(await acoesDa(r)).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('o Rascunho e o tipo inativo também gravam o formulário', async () => {
    const rascunho = (await cliente.enviar('POST', '/chamados/tipos', como('ana'))).json();
    const relato = campoNovo('relato', 'texto-longo', 'Conte o que aconteceu', {
      obrigatorio: true,
    });
    const r = await salvarFormulario(rascunho.id, {
      titulo: { comecaPeloTipo: true, campoId: null },
      campos: [relato],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((await tipoNaLista('Novo tipo')).campos).toBe(1);

    await mudarNoBanco(id('Outro'), { situacao: 'inativo' });
    const outro = comOCampo(deFabrica('Outro'), 'foto', { rotulo: 'Mande uma foto' });
    const inativo = await salvarFormulario(id('Outro'), outro);
    expect(inativo.statusCode, inativo.body).toBe(200);
    expect((await linhaDoTipo(id('Outro')))?.formulario).toEqual(outro);
  });

  it('as recusas ficam no campo, e nada é gravado', async () => {
    // A opção "Atolando" passa a "Manchando", que já existe, e a foto fica sem rótulo.
    const repetido = comOCampo(
      comOCampo(deFabrica('Impressora'), 'problema', {
        opcoes: [
          { id: 'manchando', texto: 'Manchando' },
          { id: 'nao-puxa-o-papel', texto: 'Não puxa o papel' },
          { id: 'atolando', texto: 'manchando' },
          { id: 'nao-imprime', texto: 'Não imprime' },
        ],
      }),
      'foto',
      { rotulo: ' ' },
    );
    const r = await salvarFormulario(id('Impressora'), repetido);
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().campos).toEqual({
      'campos.problema.opcoes.atolando': 'Essa opção já existe.',
      'campos.foto.rotulo': 'Escreva o rótulo.',
    });

    // Título de um campo só da TI: "O que está acontecendo?" dá o título, e "Onde as manchas
    // aparecem?", que a pessoa vê, depende dele.
    const soDaTi = await salvarFormulario(
      id('Impressora'),
      comOCampo(deFabrica('Impressora'), 'problema', { soDaTi: true }),
    );
    expect(soDaTi.statusCode, soDaTi.body).toBe(400);
    expect(soDaTi.json().campos).toEqual({
      'campos.manchas.condicao':
        "'Onde as manchas aparecem?' aparece para a pessoa e depende de 'O que está acontecendo?', que só a TI vê.",
      'campos.problema': "O título usa este campo. Ele não pode ser 'Só a TI vê'.",
    });

    expect((await linhaDoTipo(id('Impressora')))?.formulario).toEqual(deFabrica('Impressora'));
    expect([...(await acoesDa(r)), ...(await acoesDa(soDaTi))]).toEqual([]);
    expect(await eventosGravados()).toEqual([]);
  });

  it('recusa o vigésimo primeiro campo e o formulário que a tela não monta', async () => {
    const impressora = deFabrica('Impressora');
    const cheio = {
      ...impressora,
      campos: [
        ...impressora.campos,
        ...Array.from({ length: 15 }, (_, posicao) =>
          campoNovo(`extra-${posicao + 1}`, 'texto-curto', `Pergunta ${posicao + 1}`),
        ),
      ],
    };
    const r = await salvarFormulario(id('Impressora'), cheio);
    expect(r.statusCode, r.body).toBe(400);
    expect(r.json().campos).toEqual({ campos: 'O formulário tem no máximo 20 campos.' });

    // O campo sem o id e o formulário sem os campos não saem da tela.
    const { id: _id, ...semId } = campoNovo('ramal', 'texto-curto', 'Qual o ramal?');
    for (const pedido of [{ ...impressora, campos: [...impressora.campos, semId] }, {}]) {
      const recusado = await salvarFormulario(id('Impressora'), pedido);
      expect(recusado.statusCode, recusado.body).toBe(400);
      expect(recusado.json().campos).toEqual({ formulario: RECUSA_DO_FORMULARIO });
    }
    expect((await linhaDoTipo(id('Impressora')))?.formulario).toEqual(impressora);
  });
});

describe('o "Pede o ativo"', () => {
  it('o tipo que pede o ativo não fica sem o campo Ativo obrigatório', async () => {
    const sem = await salvarFormulario(
      id('Impressora'),
      semOCampo(deFabrica('Impressora'), 'impressora'),
    );
    expect(sem.statusCode, sem.body).toBe(400);
    expect(sem.json().campos).toEqual({ pedeOAtivo: SEM_O_ATIVO });

    const opcional = await salvarFormulario(
      id('Impressora'),
      comOCampo(deFabrica('Impressora'), 'impressora', { obrigatorio: false }),
    );
    expect(opcional.statusCode, opcional.body).toBe(400);
    expect(opcional.json().campos).toEqual({ pedeOAtivo: ATIVO_OPCIONAL });
    expect((await linhaDoTipo(id('Impressora')))?.formulario).toEqual(deFabrica('Impressora'));
  });

  it('confere pelo "Pede o ativo" gravado: desligado, o campo Ativo pode sair', async () => {
    await mudarNoBanco(id('Computador'), { pedeOAtivo: false });
    const semOAtivo = semOCampo(deFabrica('Computador'), 'computador');
    const r = await salvarFormulario(id('Computador'), semOAtivo);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ formulario: semOAtivo, pedeOAtivo: false, abertos: 0 });
  });
});

describe('os tipos de ativo do campo Ativo', () => {
  const qualMonitor = (tiposDoCampo: string[]) => {
    const impressora = deFabrica('Impressora');
    return {
      ...impressora,
      campos: [
        ...impressora.campos,
        campoNovo('monitor', 'ativo', 'Qual monitor?', { tiposDeAtivo: tiposDoCampo }),
      ],
    };
  };

  it('aceita os tipos ativos e recusa o inativo e o de outra organização', async () => {
    const aceito = await salvarFormulario(
      id('Impressora'),
      qualMonitor([monitor.toUpperCase(), notebook, monitor]),
    );
    expect(aceito.statusCode, aceito.body).toBe(200);
    expect(aceito.json().formulario).toEqual(qualMonitor([monitor, notebook]));

    for (const tipo of [matricial, tipoDeAtivoDaOutra]) {
      const r = await salvarFormulario(id('Impressora'), qualMonitor([notebook, tipo]));
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ 'campos.monitor.tiposDeAtivo': DA_LISTA });
    }
    expect((await linhaDoTipo(id('Impressora')))?.formulario).toEqual(
      qualMonitor([monitor, notebook]),
    );
  });

  it('o tipo de ativo inativado depois fica no campo que já o aceitava', async () => {
    expect((await salvarFormulario(id('Impressora'), qualMonitor([monitor]))).statusCode).toBe(200);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(tiposDeAtivo).set({ situacao: 'inativo' }).where(eq(tiposDeAtivo.id, monitor)),
    );

    const renomeado = comOCampo(qualMonitor([monitor]), 'monitor', { rotulo: 'Qual tela?' });
    const r = await salvarFormulario(id('Impressora'), renomeado);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().formulario).toEqual(renomeado);

    // Num campo que ainda não o aceitava, ele é recusado.
    const noOutro = comOCampo(renomeado, 'impressora', { tiposDeAtivo: [monitor] });
    const recusado = await salvarFormulario(id('Impressora'), noOutro);
    expect(recusado.statusCode, recusado.body).toBe(400);
    expect(recusado.json().campos).toEqual({ 'campos.impressora.tiposDeAtivo': DA_LISTA });
  });
});

describe('a trava do tipo', () => {
  it('a gravação do tipo liga o "Pede o ativo" antes, e a do formulário que tira o campo Ativo é recusada', async () => {
    // As duas gravações param na trava de outra transação, a do tipo primeiro. Sem a trava na
    // gravação do formulário, ela leria o "Pede o ativo" desligado, e o tipo ficaria com a chave
    // ligada sem o campo Ativo.
    await mudarNoBanco(id('Impressora'), { pedeOAtivo: false });
    const soltar = await segurarOTipo(id('Impressora'));
    let tipo: ReturnType<typeof salvarTipo> | undefined;
    let formulario: ReturnType<typeof salvarFormulario> | undefined;
    try {
      tipo = salvarTipo('Impressora', { pedeOAtivo: true });
      await esperarNaTrava(api, 1);
      formulario = salvarFormulario(
        id('Impressora'),
        semOCampo(deFabrica('Impressora'), 'impressora'),
      );
      await esperarNaTrava(api, 2);
    } finally {
      await soltar();
    }
    const [rTipo, rFormulario] = await Promise.all([tipo, formulario]);
    expect(rTipo?.statusCode, rTipo?.body).toBe(200);
    expect(rTipo?.json().pedeOAtivo).toBe(true);
    expect(rFormulario?.statusCode, rFormulario?.body).toBe(400);
    expect(rFormulario?.json().campos).toEqual({ pedeOAtivo: SEM_O_ATIVO });
    expect(await linhaDoTipo(id('Impressora'))).toMatchObject({
      pedeOAtivo: true,
      formulario: deFabrica('Impressora'),
    });
  });

  it('a gravação do formulário tira o campo Ativo antes, e a do tipo que liga o "Pede o ativo" é recusada', async () => {
    await mudarNoBanco(id('Impressora'), { pedeOAtivo: false });
    const semOAtivo = semOCampo(deFabrica('Impressora'), 'impressora');
    const soltar = await segurarOTipo(id('Impressora'));
    let formulario: ReturnType<typeof salvarFormulario> | undefined;
    let tipo: ReturnType<typeof salvarTipo> | undefined;
    try {
      formulario = salvarFormulario(id('Impressora'), semOAtivo);
      await esperarNaTrava(api, 1);
      tipo = salvarTipo('Impressora', { pedeOAtivo: true });
      await esperarNaTrava(api, 2);
    } finally {
      await soltar();
    }
    const [rFormulario, rTipo] = await Promise.all([formulario, tipo]);
    expect(rFormulario?.statusCode, rFormulario?.body).toBe(200);
    expect(rTipo?.statusCode, rTipo?.body).toBe(400);
    expect(rTipo?.json().campos).toEqual({ pedeOAtivo: SEM_O_ATIVO });
    expect(await linhaDoTipo(id('Impressora'))).toMatchObject({
      pedeOAtivo: false,
      formulario: semOAtivo,
    });
  });
});

describe('quem pode, o tipo que não existe e o módulo', () => {
  it('Conta sem chamados.configurar: o formulário responde 403', async () => {
    const impressora = deFabrica('Impressora');
    for (const r of [
      await lerFormulario(id('Impressora'), 'renato'),
      await salvarFormulario(id('Impressora'), semOCampo(impressora, 'foto'), 'renato'),
    ]) {
      expect(r.statusCode).toBe(403);
    }
    expect((await linhaDoTipo(id('Impressora')))?.formulario).toEqual(impressora);
  });

  it('o tipo de outra organização responde 404, com a frase do domínio', async () => {
    for (const r of [
      await lerFormulario(daOutra),
      await salvarFormulario(daOutra, deFabrica('Toner')),
    ]) {
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe('Tipo de chamado não encontrado.');
    }
  });

  it('recusa as rotas com o módulo Chamados desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    try {
      for (const r of [
        await lerFormulario(id('Impressora')),
        await salvarFormulario(id('Impressora'), deFabrica('Impressora')),
      ]) {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({
          type: 'urn:grafite:problema:modulo-desligado',
          detail: 'O módulo Chamados está desligado nesta organização.',
        });
      }
    } finally {
      await desligarModulos(api, org, []);
    }
  });
});
