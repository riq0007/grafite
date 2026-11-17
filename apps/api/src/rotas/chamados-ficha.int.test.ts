// A ficha do chamado (spec chamados, "Quem vê e quem atende os chamados", "Conversa do chamado",
// "OS e solicitação pelo chamado" e "Respostas prontas"; spec modulo-chamados, "Chamado aberto";
// change chamados-da-ti, design, decisões 5, 8 e 9, e tarefa 4.11): o chamado inteiro numa
// resposta, a quem o vê, com o resumo montado na leitura pelos nomes de agora, a pessoa pelo
// alcance das pessoas, a conversa com os anexos e os alertas do ativo, o momento em que o relógio
// parou, a OS e a solicitação a quem as vê e as respostas prontas do tipo.
import {
  anexosDosChamados,
  arquivos,
  ativos,
  chamados,
  contas,
  horarioDaTi,
  locais,
  mensagensDosChamados,
  naOrganizacao,
  numeracaoDosChamados,
  ordensDeServico,
  pessoas,
  respostasProntas,
  solicitacoes,
  tiposDeChamado,
} from '@grafite/db';
import type { CampoDoFormulario, Formulario, HorarioDaTi } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  criarAlerta,
  criarAtivoDoTipo,
  criarModelo,
  criarRegra,
  criarTipo,
  desligarModulos,
} from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  criarRelogio,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica, linhasDosTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-ficha.local';
const ATOR = { tipo: 'sistema', descricao: 'teste da ficha do chamado' } as const;
/** A quarta-feira, 11 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-11T10:40:00.000Z');
/** A ficha é lida às 09:40, duas horas depois da abertura. */
const DUAS_HORAS = 2 * 60 * 60 * 1000;
const SAO_PAULO = 'America/Sao_Paulo';
const HORARIO: HorarioDaTi = {
  dias: [1, 2, 3, 4, 5],
  inicio: 480,
  fim: 1080,
  fuso: SAO_PAULO,
  cargaCheia: 5,
};
const NAO_ENCONTRADO = 'Chamado não encontrado.';

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contasDe: Record<string, string> = {};
const ids: Record<string, string> = {};
const chamadoDe: Record<number, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const conta = (usuario: string) => contasDe[usuario] ?? '';
const id = (chave: string) => ids[chave] ?? '';
const tipoDe = (nome: string) => id(`tipo:${nome}`);
const chamadoId = (numero: number) => chamadoDe[numero] ?? '';
/** O momento de 11/11/2026 em São Paulo, como "09:21", no formato da resposta. */
const as = (hora: string) => new Date(`2026-11-11T${hora}:00-03:00`);
const iso = (hora: string) => as(hora).toISOString();

const ficha = (numero: number | string, usuario: string) =>
  cliente.consultar(`/chamados/${numero}`, como(usuario));

/** A ficha lida com sucesso. */
async function lerFicha(numero: number, usuario = 'ana') {
  const r = await ficha(numero, usuario);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}

/** Abre o chamado como Ana e guarda o id dele pelo número. */
async function abrir(corpo: object): Promise<number> {
  const r = await cliente.enviar('POST', '/chamados', como('ana'), corpo);
  expect(r.statusCode, r.body).toBe(201);
  const { numero } = r.json() as { numero: number };
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: chamados.id }).from(chamados).where(eq(chamados.numero, numero)),
  );
  chamadoDe[numero] = linha?.id ?? '';
  return numero;
}

/** O chamado de Outro, com o relato, em nome da pessoa, com Ana. */
const relato = (pessoa: string, texto = 'A cadeira da sala 3 quebrou.') => ({
  pessoa: id(pessoa),
  tipo: tipoDe('Outro'),
  respostas: { relato: texto },
  ficaComigo: true,
});

/** O chamado da Impressora manchando na borda, em nome de Marina, com Ana. */
const manchando = (impressora: string, respostas: Record<string, unknown> = {}) => ({
  pessoa: id('marina'),
  tipo: tipoDe('Impressora'),
  respostas: { impressora: id(impressora), problema: 'manchando', manchas: 'borda', ...respostas },
  ficaComigo: true,
});

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

/** Envia um PDF como Ana e devolve o anexo como a ficha o mostra. */
async function enviarAnexo(nome: string) {
  const conteudo = PDF(nome);
  const r = await cliente.enviarBytes(
    'POST',
    `/chamados/anexos?nome=${encodeURIComponent(nome)}`,
    como('ana'),
    conteudo,
  );
  expect(r.statusCode, r.body).toBe(201);
  const anexo = r.json() as { id: string; nome: string; tipo: string; bytes: number };
  expect(anexo).toEqual({ id: anexo.id, nome, tipo: 'application/pdf', bytes: conteudo.length });
  return anexo;
}

interface LinhaDaConversa {
  especie: 'mensagem' | 'nota' | 'evento';
  /** A conta de quem escreveu ou agiu, pelo usuário, ou a pessoa que pediu, pela chave. */
  conta?: string;
  pessoa?: string;
  texto?: string;
  evento?: string;
  dados?: Record<string, unknown>;
  em: string;
}

/** Grava as linhas da conversa direto no banco, como as ações gravarão, e devolve os ids. */
async function incluirConversa(numero: number, linhas: LinhaDaConversa[]): Promise<string[]> {
  const gravados: string[] = [];
  for (const linha of linhas) {
    const [gravada] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .insert(mensagensDosChamados)
        .values({
          orgId: org,
          chamadoId: chamadoId(numero),
          especie: linha.especie,
          autorConta: linha.conta ? conta(linha.conta) : null,
          autorPessoa: linha.pessoa ? id(linha.pessoa) : null,
          texto: linha.especie === 'evento' ? null : (linha.texto ?? ''),
          evento: linha.especie === 'evento' ? (linha.evento ?? '') : null,
          dados: linha.especie === 'evento' ? (linha.dados ?? {}) : null,
          criadaEm: as(linha.em),
        })
        .returning({ id: mensagensDosChamados.id }),
    );
    gravados.push(gravada?.id ?? '');
  }
  return gravados;
}

/** Os anexos passam à mensagem ou à nota do chamado, como a gravação os tomará. */
const darAnexos = (numero: number, mensagemId: string, arquivosIds: string[]) =>
  naOrganizacao(api.banco, org, async (tx) => {
    for (const arquivoId of arquivosIds) {
      await tx
        .update(anexosDosChamados)
        .set({ chamadoId: chamadoId(numero), mensagemId })
        .where(eq(anexosDosChamados.arquivoId, arquivoId));
    }
  });

/** Muda o chamado direto no banco, como as ações mudarão. */
const mudarChamado = (numero: number, mudanca: Partial<typeof chamados.$inferInsert>) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(chamados).set(mudanca).where(eq(chamados.numero, numero)),
  );

const mudarConta = (usuario: string, situacao: 'ativa' | 'inativa') =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(contas)
      .set({ situacao })
      .where(eq(contas.id, conta(usuario))),
  );

/** O campo do formulário de teste, com os padrões do construtor. */
const campo = (
  parte: Pick<CampoDoFormulario, 'id' | 'tipo' | 'rotulo'> & Partial<CampoDoFormulario>,
): CampoDoFormulario => ({
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: false,
  apagarSeSumir: true,
  opcoes: [],
  tiposDeAtivo: [],
  condicao: [],
  ...parte,
});

/** A foto da folha, que a abertura do #1042 toma no campo Foto. */
let foto: Awaited<ReturnType<typeof enviarAnexo>>;

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, async (tx) => {
    await criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() });
    await tx.insert(horarioDaTi).values({ orgId: org, ...HORARIO, dias: [...HORARIO.dias] });
  });

  // Jundiaí, com a Recepção; Campinas, com o Administrativo e a Sala de reuniões.
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.recepcao = await criarLocal(api, org, { nome: 'Recepção', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.administrativo = await criarLocal(api, org, {
    nome: 'Administrativo',
    paiId: id('campinas'),
  });
  ids.reunioes = await criarLocal(api, org, { nome: 'Sala de reuniões', paiId: id('campinas') });

  // As impressoras da Recepção, com o rótulo do modelo, e o notebook de empréstimo do
  // Administrativo, sem patrimônio.
  const impressoras = await criarTipo(api, org, { nome: 'Impressora' });
  const computadores = await criarTipo(api, org, { nome: 'Computador' });
  const laserjet = await criarModelo(api, org, {
    tipoId: impressoras,
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  for (const patrimonio of ['PAT-00139', 'PAT-00150', 'PAT-00160']) {
    ids[patrimonio] = await criarAtivoDoTipo(api, org, {
      tipoId: impressoras,
      modeloId: laserjet,
      patrimonio,
      localId: id('recepcao'),
    });
  }
  ids.notebook = await criarAtivoDoTipo(api, org, {
    tipoId: computadores,
    nome: 'Notebook de empréstimo 3',
    localId: id('administrativo'),
  });
  await naOrganizacao(api.banco, org, (tx) =>
    tx
      .update(ativos)
      .set({ patrimonio: null })
      .where(eq(ativos.id, id('notebook'))),
  );

  // O Empréstimo, de teste: a pessoa que vai usar, a sala e o equipamento.
  const outro = linhasDosTiposDeFabrica().find(({ nome }) => nome === 'Outro');
  if (!outro) throw new Error('O tipo Outro não é de fábrica.');
  const emprestimo: Formulario = {
    titulo: { comecaPeloTipo: true, campoId: 'equipamento' },
    campos: [
      campo({ id: 'quem-vai-usar', tipo: 'pessoa', rotulo: 'Quem vai usar?', obrigatorio: true }),
      campo({ id: 'sala', tipo: 'local', rotulo: 'Em que sala?' }),
      campo({ id: 'equipamento', tipo: 'ativo', rotulo: 'Qual equipamento?' }),
    ],
  };
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.insert(tiposDeChamado).values({
      ...outro,
      orgId: org,
      nome: 'Empréstimo',
      nomeNormalizado: 'emprestimo',
      ordem: 20,
      formulario: { ...emprestimo },
    });
    // Os números do mockup: o primeiro chamado aberto aqui é o #1042.
    await tx.insert(numeracaoDosChamados).values({ orgId: org, ultimo: 1041 });
  });
  for (const tipo of await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
  )) {
    ids[`tipo:${tipo.nome}`] = tipo.id;
  }

  // As pessoas: Marina e Otávio, da Recepção; Fernanda e Paulo, do Administrativo; Rita, sem local.
  ids.marina = await criarPessoa(api, org, {
    nome: 'Marina Rocha',
    localId: id('recepcao'),
    email: 'marina.rocha@empresa.com.br',
    telefone: '(11) 4521-0139',
  });
  ids.otavio = await criarPessoa(api, org, {
    nome: 'Otávio Nunes',
    localId: id('recepcao'),
    email: 'otavio.nunes@empresa.com.br',
  });
  ids.fernanda = await criarPessoa(api, org, {
    nome: 'Fernanda Lima',
    localId: id('administrativo'),
  });
  ids.paulo = await criarPessoa(api, org, { nome: 'Paulo Mendes', localId: id('administrativo') });
  ids.rita = await criarPessoa(api, org, { nome: 'Rita Moraes' });

  // Ana atende a organização inteira e vê as pessoas, os ativos, os alertas, as OS e as
  // solicitações; Diego atende Jundiaí, e Elisa, Campinas, sem ver mais nada; Carla vê os chamados
  // da organização, e Bruno, os de Campinas; Lívia administra a organização, que não fica sem
  // administrador na anonimização.
  cliente = clienteDaApi(api, host);
  const atendeEVe = await criarPerfil(api, org, {
    nome: 'Atende e vê tudo',
    permissoes: [
      'chamados.atender',
      'pessoas.ver',
      'ativos.ver',
      'alertas.ver',
      'ordens.ver',
      'solicitacoes.ver',
    ],
  });
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê os chamados', permissoes: ['chamados.ver'] });
  const administrador = await criarPerfil(api, org, { nome: 'Administrador', administrador: true });
  const nomes = {
    ana: 'Ana Souza',
    bruno: 'Bruno Costa',
    carla: 'Carla Dias',
    diego: 'Diego Ramos',
    elisa: 'Elisa Prado',
    livia: 'Lívia Prates',
  } as const;
  for (const [usuario, nome] of Object.entries(nomes)) {
    contasDe[usuario] = (await criarConta(api, org, { usuario, nome })).id;
  }
  await atribuir(api, org, { perfilId: atendeEVe, contaId: conta('ana') });
  await atribuir(api, org, { perfilId: atende, contaId: conta('diego'), localId: id('jundiai') });
  await atribuir(api, org, { perfilId: atende, contaId: conta('elisa'), localId: id('campinas') });
  await atribuir(api, org, { perfilId: ve, contaId: conta('carla') });
  await atribuir(api, org, { perfilId: ve, contaId: conta('bruno'), localId: id('campinas') });
  await atribuir(api, org, { perfilId: administrador, contaId: conta('livia') });
  entradas.ana = await cliente.entrar('ana');

  // Os chamados, abertos por Ana às 07:40.
  foto = await enviarAnexo('foto da folha.pdf');
  await abrir(manchando('PAT-00139', { foto: [foto.id], 'contador-de-paginas': 48210 })); // #1042
  await abrir(relato('rita', 'O ramal da portaria não toca.')); // #1043, da organização inteira
  await abrir({
    pessoa: id('fernanda'),
    tipo: tipoDe('Empréstimo'),
    respostas: {
      'quem-vai-usar': id('paulo'),
      sala: id('reunioes'),
      equipamento: id('notebook'),
    },
    ficaComigo: true,
  }); // #1044
  await abrir({
    ...relato('otavio', 'O mouse do Otávio Nunes parou de funcionar.'),
    titulo: 'Otávio Nunes pediu a troca do mouse',
  }); // #1045
  for (let vez = 0; vez < 4; vez += 1) await abrir(relato('marina')); // #1046 a #1049
  await abrir(manchando('PAT-00150')); // #1050
  await abrir(manchando('PAT-00160')); // #1051
  await abrir(manchando('PAT-00139')); // #1052
  await abrir(relato('marina')); // #1053
  await abrir({
    pessoa: id('fernanda'),
    tipo: tipoDe('Empréstimo'),
    respostas: { 'quem-vai-usar': id('otavio'), equipamento: id('notebook') },
    ficaComigo: true,
  }); // #1054
  api.relogio.avancar(DUAS_HORAS);
  // As sessões entram às 09:40, depois da espera, que venceria a de Ana.
  for (const usuario of Object.keys(nomes)) entradas[usuario] = await cliente.entrar(usuario);
});

describe('GET /chamados/:numero', () => {
  it('o chamado da organização inteira pede chamados.ver na organização inteira', async () => {
    const f = await lerFicha(1043, 'carla');
    expect(f).toMatchObject({
      numero: 1043,
      titulo: 'O ramal da portaria não toca.',
      pessoa: { id: id('rita'), nome: 'Rita Moraes', local: null },
      locais: [],
      semLocal: true,
      // Carla só vê os chamados: não atende nenhum.
      permite: { atender: false },
    });
    expect((await lerFicha(1043, 'ana')).permite).toEqual({ atender: true });
    // Bruno vê os chamados de Campinas, e Diego atende os de Jundiaí: nenhum dos dois o vê.
    for (const usuario of ['bruno', 'diego']) {
      const r = await ficha(1043, usuario);
      expect(r.statusCode, `${usuario}: ${r.body}`).toBe(404);
      expect(r.json().detail).toBe(NAO_ENCONTRADO);
    }
  });

  it('o chamado que a conta não vê responde como o que não existe', async () => {
    // O #1042 é da Recepção, em Jundiaí, e Bruno vê só os chamados de Campinas.
    const naoVe = await ficha(1042, 'bruno');
    const naoExiste = await ficha(9999, 'bruno');
    expect(naoVe.statusCode).toBe(404);
    // O mesmo problema, fora o código de rastreio, que é de cada requisição.
    const { codigoDeRastreio: _deUm, ...problema } = naoVe.json();
    const { codigoDeRastreio: _doOutro, ...mesmo } = naoExiste.json();
    expect(problema).toEqual(mesmo);
    expect(naoVe.json().detail).toBe(NAO_ENCONTRADO);
    // O que não é o número de um chamado é recusado no número, com a mesma frase, como no anexo.
    for (const numero of ['abc', '0', '-3', '1.5', '99999999999']) {
      const r = await ficha(numero, 'ana');
      expect(r.statusCode, `${numero}: ${r.body}`).toBe(400);
      expect(r.json().campos).toEqual({ numero: NAO_ENCONTRADO });
    }
    // Sem entrar, a sessão é pedida antes de tudo.
    expect((await ficha(1042, 'ninguem')).statusCode).toBe(401);
  });

  it('o técnico sem pessoas.ver vê o nome e o local da pessoa, sem os contatos e sem o atalho', async () => {
    const deAna = await lerFicha(1042, 'ana');
    expect(deAna.pessoa).toEqual({
      id: id('marina'),
      nome: 'Marina Rocha',
      local: 'Jundiaí › Recepção',
      abrir: true,
      contatos: { email: 'marina.rocha@empresa.com.br', telefone: '(11) 4521-0139' },
    });
    expect(deAna.ativo).toEqual({
      id: id('PAT-00139'),
      rotulo: 'HP LaserJet M404',
      patrimonio: 'PAT-00139',
      local: 'Jundiaí › Recepção',
      abrir: true,
      // O resumo tem o teste dele (chamados-resumo-do-ativo).
      resumo: expect.any(Object),
    });

    // Diego atende os chamados de Jundiaí, sem pessoas.ver nem ativos.ver.
    const deDiego = await lerFicha(1042, 'diego');
    expect(deDiego.pessoa).toEqual({
      id: id('marina'),
      nome: 'Marina Rocha',
      local: 'Jundiaí › Recepção',
      abrir: false,
      contatos: null,
    });
    expect(deDiego.ativo).toEqual({
      id: id('PAT-00139'),
      rotulo: 'HP LaserJet M404',
      patrimonio: 'PAT-00139',
      local: 'Jundiaí › Recepção',
      abrir: false,
      resumo: expect.any(Object),
    });
    expect(deDiego.permite).toEqual({ atender: true });
  });

  it('o cabeçalho, o prazo e as respostas, com o resumo só das que a pessoa vê', async () => {
    const f = await lerFicha(1042);
    const [linha] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(chamados).where(eq(chamados.numero, 1042)),
    );
    const [tipo] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .select({ formulario: tiposDeChamado.formulario })
        .from(tiposDeChamado)
        .where(eq(tiposDeChamado.id, tipoDe('Impressora'))),
    );
    expect(f).toMatchObject({
      numero: 1042,
      titulo: 'Impressora manchando',
      situacao: 'em-atendimento',
      versao: 1,
      origem: 'ti',
      abertoEm: iso('07:40'),
      tipo: { id: tipoDe('Impressora'), nome: 'Impressora', icone: 'impressora' },
      responsavel: {
        conta: conta('ana'),
        nome: 'Ana Souza',
        desde: iso('07:40'),
        naoAtendeMais: false,
      },
      locais: [id('recepcao')],
      semLocal: false,
      permite: { atender: true },
      relogio: {
        prazo: linha?.prazo,
        contadoS: 0,
        relogioDesde: iso('07:40'),
        primeiraRespostaEm: iso('07:40'),
      },
      // O relógio conta: não parou.
      parouEm: null,
      horario: HORARIO,
      os: null,
      solicitacao: null,
      formulario: tipo?.formulario,
      respostas: {
        impressora: id('PAT-00139'),
        problema: 'manchando',
        manchas: 'borda',
        foto: [foto.id],
        'contador-de-paginas': 48210,
      },
      citados: {
        ativos: [{ id: id('PAT-00139'), rotulo: 'HP LaserJet M404', patrimonio: 'PAT-00139' }],
        locais: [],
        pessoas: [],
      },
      anexosDosCampos: [{ campo: 'foto', ...foto }],
      // O Contador de páginas é só da TI: fica fora do resumo, que é o que a pessoa vê.
      resumo: 'Problema: Manchando, na borda · Foto: 1 arquivo · Ativo: PAT-00139',
    });
  });

  it('o resumo cita o ativo, o local e a pessoa pelos nomes de agora, e o título fica como foi gravado', async () => {
    const antes = await lerFicha(1044);
    expect(antes.titulo).toBe('Empréstimo Notebook de empréstimo 3');
    expect(antes.resumo).toBe(
      'Quem vai usar: Paulo Mendes · Em que sala: Campinas › Sala de reuniões · Qual equipamento: Notebook de empréstimo 3',
    );

    await naOrganizacao(api.banco, org, async (tx) => {
      await tx
        .update(pessoas)
        .set({ nome: 'Paulo Mendes Neto' })
        .where(eq(pessoas.id, id('paulo')));
      await tx
        .update(locais)
        .set({ nome: 'Sala de reuniões 2' })
        .where(eq(locais.id, id('reunioes')));
      await tx
        .update(ativos)
        .set({ nome: 'Notebook de empréstimo 4' })
        .where(eq(ativos.id, id('notebook')));
    });

    const depois = await lerFicha(1044);
    expect(depois).toMatchObject({
      titulo: 'Empréstimo Notebook de empréstimo 3',
      resumo:
        'Quem vai usar: Paulo Mendes Neto · Em que sala: Campinas › Sala de reuniões 2 · Qual equipamento: Notebook de empréstimo 4',
      citados: {
        ativos: [{ id: id('notebook'), rotulo: 'Notebook de empréstimo 4', patrimonio: null }],
        locais: [{ id: id('reunioes'), caminho: 'Campinas › Sala de reuniões 2' }],
        pessoas: [{ id: id('paulo'), nome: 'Paulo Mendes Neto' }],
      },
      // O ativo ligado também vem com o nome de agora.
      ativo: {
        id: id('notebook'),
        rotulo: 'Notebook de empréstimo 4',
        patrimonio: null,
        local: 'Campinas › Administrativo',
      },
    });
  });

  it('a pessoa anonimizada vem com o nome anonimizado, sem os contatos, e o texto fica como foi escrito', async () => {
    await incluirConversa(1045, [
      {
        especie: 'mensagem',
        conta: 'ana',
        texto: 'Otávio, o mouse novo está na portaria.',
        em: '08:10',
      },
    ]);
    const inativada = await cliente.enviar(
      'POST',
      `/pessoas/${id('otavio')}/inativacao`,
      como('livia'),
    );
    expect(inativada.statusCode, inativada.body).toBe(200);
    const anonimizada = await cliente.enviar(
      'POST',
      `/pessoas/${id('otavio')}/anonimizacao`,
      como('livia'),
    );
    expect(anonimizada.statusCode, anonimizada.body).toBe(200);
    const nome: string = anonimizada.json().nome;
    expect(nome).toMatch(/^Pessoa anonimizada [0-9A-HJKMNP-TV-Z]{4}$/);

    // Também a quem vê as pessoas.
    const f = await lerFicha(1045, 'ana');
    expect(f.pessoa).toEqual({ id: id('otavio'), nome, local: null, abrir: false, contatos: null });
    expect(f.titulo).toBe('Otávio Nunes pediu a troca do mouse');
    expect(f.resumo).toBe('Relato: O mouse do Otávio Nunes parou de funcionar.');
    expect(f.conversa.map((item: { texto?: string }) => item.texto ?? null)).toContain(
      'Otávio, o mouse novo está na portaria.',
    );
    // O chamado continua como estava.
    expect(f.locais).toEqual([id('recepcao')]);

    // A resposta do campo Pessoa é uma referência: o resumo traz o nome anonimizado.
    expect((await lerFicha(1054, 'ana')).resumo).toContain(`Quem vai usar: ${nome}`);
    expect((await lerFicha(1054, 'ana')).citados.pessoas).toEqual([{ id: id('otavio'), nome }]);
  });

  it('a conversa vem na ordem, com os nomes de agora e os anexos de cada mensagem e nota, sem os removidos', async () => {
    const folha1 = await enviarAnexo('folha-1.pdf');
    const folha2 = await enviarAnexo('folha-2.pdf');
    const doCilindro = await enviarAnexo('cilindro.pdf');
    const [mensagem = '', nota = ''] = await incluirConversa(1042, [
      {
        especie: 'mensagem',
        pessoa: 'marina',
        texto: 'As folhas saem com manchas pretas na borda. Já troquei o papel.',
        em: '07:41',
      },
      {
        especie: 'nota',
        conta: 'diego',
        texto: 'A PAT-00139 já trocou o cilindro em setembro.',
        em: '08:05',
      },
    ]);
    await darAnexos(1042, mensagem, [folha1.id, folha2.id]);
    await darAnexos(1042, nota, [doCilindro.id]);
    // A folha 2 foi removida: não vai.
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(arquivos)
        .set({ removidoEm: as('09:00') })
        .where(eq(arquivos.id, folha2.id)),
    );
    const [passou = '', assumiu = ''] = await incluirConversa(1042, [
      {
        especie: 'evento',
        conta: 'ana',
        evento: 'passou',
        // O desde num formato que esta versão não grava fica de fora.
        dados: { de: conta('ana'), para: conta('diego'), desde: 'ontem' },
        em: '08:30',
      },
      {
        especie: 'evento',
        conta: 'ana',
        evento: 'assumiu',
        // Desde quando o chamado estava com Diego, que o assumir guarda.
        dados: { de: conta('diego'), desde: as('08:30').toISOString() },
        em: '09:10',
      },
      // O código que esta versão não lê, gravado por uma versão mais nova, com os dados num formato
      // que ela não conhece: fica de fora.
      {
        especie: 'evento',
        conta: 'ana',
        evento: 'virou-pdf',
        dados: { de: 'pdf-1', para: { arquivo: 'folha.pdf' } },
        em: '09:15',
      },
    ]);

    const ana = { tipo: 'conta', id: conta('ana'), nome: 'Ana Souza' };
    const esperada = [
      {
        especie: 'evento',
        id: expect.any(String),
        em: iso('07:40'),
        autor: ana,
        evento: 'abertura',
        de: null,
        para: null,
        desde: null,
        // Só o evento do ativo tem o ativo (tarefa 4.15), e só os da OS e da solicitação, a OS e a
        // solicitação (4.16 e 4.17), e só o da solicitação não gerada, o motivo (4.18).
        ativo: null,
        os: null,
        solicitacao: null,
        motivo: null,
      },
      {
        especie: 'mensagem',
        id: mensagem,
        em: iso('07:41'),
        autor: { tipo: 'pessoa', id: id('marina'), nome: 'Marina Rocha' },
        texto: 'As folhas saem com manchas pretas na borda. Já troquei o papel.',
        anexos: [folha1],
      },
      {
        especie: 'nota',
        id: nota,
        em: iso('08:05'),
        autor: { tipo: 'conta', id: conta('diego'), nome: 'Diego Ramos' },
        texto: 'A PAT-00139 já trocou o cilindro em setembro.',
        anexos: [doCilindro],
      },
      {
        especie: 'evento',
        id: passou,
        em: iso('08:30'),
        autor: ana,
        evento: 'passou',
        de: { conta: conta('ana'), nome: 'Ana Souza' },
        para: { conta: conta('diego'), nome: 'Diego Ramos' },
        desde: null,
        ativo: null,
        os: null,
        solicitacao: null,
        motivo: null,
      },
      {
        especie: 'evento',
        id: assumiu,
        em: iso('09:10'),
        autor: ana,
        evento: 'assumiu',
        de: { conta: conta('diego'), nome: 'Diego Ramos' },
        para: null,
        desde: iso('08:30'),
        ativo: null,
        os: null,
        solicitacao: null,
        motivo: null,
      },
    ];
    expect((await lerFicha(1042, 'ana')).conversa).toEqual(esperada);
    // Quem só vê os chamados lê a mesma conversa, com as notas.
    expect((await lerFicha(1042, 'carla')).conversa).toEqual(esperada);

    // Os nomes são os de agora.
    const [diego] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ pessoaId: pessoas.id }).from(pessoas).where(eq(pessoas.nome, 'Diego Ramos')),
    );
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(pessoas)
        .set({ nome: 'Diego Ramos Lima' })
        .where(eq(pessoas.id, diego?.pessoaId ?? '')),
    );
    const renomeado = await lerFicha(1042, 'ana');
    expect(renomeado.conversa[2].autor.nome).toBe('Diego Ramos Lima');
    expect(renomeado.conversa[3].para.nome).toBe('Diego Ramos Lima');
    expect(renomeado.conversa[4].de.nome).toBe('Diego Ramos Lima');
  });

  it('os alertas do ativo ligado entram entre a abertura e a resolução, só a quem vê os alertas no local dele', async () => {
    const regra = await criarRegra(api, org, {
      nome: 'Impressora pede atenção',
      condicao: 'impressora.condicao',
      parametros: { condicoes: ['sem-papel'] },
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'organizacao', id: null },
    });
    // O #1050, da PAT-00150, foi resolvido às 09:00; o #1051, da PAT-00160, está aberto.
    await mudarChamado(1050, {
      situacao: 'resolvido',
      relogioDesde: null,
      contadoS: 4800,
      resolvidoEm: as('09:00'),
      resolvidoPor: conta('ana'),
    });
    const alerta = (ativo: string, item: string, texto: string, abertoHa: number) =>
      criarAlerta(api, org, {
        regraId: regra,
        ativoId: id(ativo),
        item,
        texto,
        severidade: 'atencao',
        abertoHa,
      });
    // Às 09:40: o de 07:10 abriu antes dos chamados, e o de 09:20, depois da resolução do #1050.
    await alerta('PAT-00150', 'cilindro', 'Cilindro perto do fim', 150);
    const atolado = await alerta('PAT-00150', 'bandeja-2', 'Papel atolado na bandeja 2', 50);
    await alerta('PAT-00150', 'papel', 'Sem papel', 20);
    const toner = await criarAlerta(api, org, {
      regraId: regra,
      ativoId: id('PAT-00160'),
      item: 'toner-preto',
      texto: 'Toner preto abaixo de 10%',
      severidade: 'critico',
      abertoHa: 4,
    });
    // O pendente ainda não abriu: não entra.
    await criarAlerta(api, org, {
      regraId: regra,
      ativoId: id('PAT-00160'),
      item: 'cilindro',
      texto: 'Cilindro perto do fim',
      situacao: 'pendente',
      abertoEm: null,
    });

    const alertasDa = (f: { conversa: { especie: string }[] }) =>
      f.conversa.filter((item) => item.especie === 'alerta');
    expect(alertasDa(await lerFicha(1050, 'ana'))).toEqual([
      {
        especie: 'alerta',
        id: atolado,
        em: iso('08:50'),
        texto: 'Papel atolado na bandeja 2',
        severidade: 'atencao',
      },
    ]);
    // Uma nota antes do alerta e uma mensagem depois dele.
    await incluirConversa(1051, [
      { especie: 'nota', conta: 'ana', texto: 'Pedi o toner ao almoxarifado.', em: '09:30' },
      { especie: 'mensagem', pessoa: 'marina', texto: 'Agora a folha sai em branco.', em: '09:38' },
    ]);
    const doAberto = await lerFicha(1051, 'ana');
    expect(alertasDa(doAberto)).toEqual([
      {
        especie: 'alerta',
        id: toner,
        em: iso('09:36'),
        texto: 'Toner preto abaixo de 10%',
        severidade: 'critico',
      },
    ]);
    // O alerta entra na conversa na hora em que abriu.
    expect(doAberto.conversa.map((item: { especie: string }) => item.especie)).toEqual([
      'evento',
      'nota',
      'alerta',
      'mensagem',
    ]);

    // Diego atende a Recepção, sem alertas.ver: os chamados vêm sem os alertas.
    expect(alertasDa(await lerFicha(1050, 'diego'))).toEqual([]);
    expect(alertasDa(await lerFicha(1051, 'diego'))).toEqual([]);
  });

  it('a OS e a solicitação vêm com a situação só a quem as vê', async () => {
    const [os] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .insert(ordensDeServico)
        .values({
          orgId: org,
          numero: 12,
          ativoId: id('PAT-00139'),
          localId: id('recepcao'),
          problema: 'Manchas na borda.',
          situacao: 'em-atendimento',
          abertaPor: conta('ana'),
        })
        .returning({ id: ordensDeServico.id }),
    );
    const [solicitacao] = await naOrganizacao(api.banco, org, (tx) =>
      tx
        .insert(solicitacoes)
        .values({
          orgId: org,
          numero: 4,
          tipo: 'toner',
          situacao: 'aberta',
          pessoaId: id('marina'),
          registradaPor: conta('ana'),
          locais: [id('recepcao')],
          semLocal: false,
        })
        .returning({ id: solicitacoes.id }),
    );
    await mudarChamado(1052, { osId: os?.id ?? null, solicitacaoId: solicitacao?.id ?? null });

    expect(await lerFicha(1052, 'ana')).toMatchObject({
      os: { id: os?.id, numero: 12, situacao: 'em-atendimento' },
      solicitacao: { id: solicitacao?.id, numero: 4, situacao: 'aberta' },
    });
    // Diego e Carla não veem as OS nem as solicitações.
    for (const usuario of ['diego', 'carla']) {
      expect(await lerFicha(1052, usuario)).toMatchObject({ os: null, solicitacao: null });
    }
  });

  it('o relógio parou no primeiro aguardando ou resolveu depois da última volta dele', async () => {
    // #1046: aguardando desde as 09:21.
    await incluirConversa(1046, [
      { especie: 'evento', conta: 'ana', evento: 'aguardando', em: '09:21' },
    ]);
    await mudarChamado(1046, { situacao: 'aguardando', relogioDesde: null, contadoS: 6060 });
    // #1047: resolvido às 08:30, vindo do aguardando das 08:00: parou na espera.
    await incluirConversa(1047, [
      { especie: 'evento', conta: 'ana', evento: 'aguardando', em: '08:00' },
      { especie: 'evento', conta: 'ana', evento: 'resolveu', em: '08:30' },
    ]);
    await mudarChamado(1047, {
      situacao: 'resolvido',
      relogioDesde: null,
      contadoS: 1200,
      resolvidoEm: as('08:30'),
      resolvidoPor: conta('ana'),
    });
    // #1048: retomado às 08:20 e resolvido às 09:00.
    await incluirConversa(1048, [
      { especie: 'evento', conta: 'ana', evento: 'aguardando', em: '08:00' },
      { especie: 'evento', conta: 'ana', evento: 'retomou', em: '08:20' },
      { especie: 'evento', conta: 'ana', evento: 'resolveu', em: '09:00' },
    ]);
    await mudarChamado(1048, {
      situacao: 'resolvido',
      relogioDesde: null,
      contadoS: 3600,
      resolvidoEm: as('09:00'),
      resolvidoPor: conta('ana'),
    });
    // #1049: resolvido às 08:00, reaberto às 08:30 e aguardando desde as 09:00.
    await incluirConversa(1049, [
      { especie: 'evento', conta: 'ana', evento: 'resolveu', em: '08:00' },
      {
        especie: 'evento',
        conta: 'ana',
        evento: 'reabriu',
        dados: { para: conta('ana') },
        em: '08:30',
      },
      { especie: 'evento', conta: 'ana', evento: 'aguardando', em: '09:00' },
    ]);
    await mudarChamado(1049, { situacao: 'aguardando', relogioDesde: null, contadoS: 3000 });

    const parou = async (numero: number) => (await lerFicha(numero)).parouEm;
    expect(await parou(1046)).toBe(iso('09:21'));
    expect(await parou(1047)).toBe(iso('08:00'));
    expect(await parou(1048)).toBe(iso('09:00'));
    expect(await parou(1049)).toBe(iso('09:00'));
    expect((await lerFicha(1046)).relogio).toMatchObject({ contadoS: 6060, relogioDesde: null });

    // #1043: a espera das 09:00 acabou às 09:20 por um evento que esta versão não lê, como o da
    // resposta pela aba de uma versão mais nova. O relógio conta: não parou.
    await incluirConversa(1043, [
      { especie: 'evento', conta: 'ana', evento: 'aguardando', em: '09:00' },
      { especie: 'evento', conta: 'ana', evento: 'respondeu-pela-aba', em: '09:20' },
    ]);
    await mudarChamado(1043, { relogioDesde: as('09:20'), contadoS: 4800 });
    expect(await parou(1043)).toBeNull();

    // O prazo estragado vem sem o relógio, e a ficha segue.
    await mudarChamado(1048, { prazo: { modo: 'quebrado' } });
    expect(await lerFicha(1048)).toMatchObject({ relogio: null, parouEm: iso('09:00') });
  });

  it('as respostas prontas do tipo, na ordem, com o primeiro nome da pessoa', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(respostasProntas).values(
        [
          [
            'Pedir uma foto da folha',
            'Oi, {nome}! Pode mandar uma foto da folha?',
            true,
            ['Impressora'],
            0,
          ],
          ['Pedir o print do erro', 'Oi, {nome}! Pode mandar um print do erro?', true, [], 1],
          [
            'Avisar da troca do toner',
            '{nome}, o toner foi trocado. {nome}, confira.',
            false,
            ['Impressora'],
            2,
          ],
          [
            'Reiniciar o roteador',
            'Oi, {nome}! Reinicie o roteador.',
            false,
            ['Rede e internet'],
            3,
          ],
        ].map(([rotulo, texto, esperaAResposta, tipos, ordem]) => ({
          orgId: org,
          rotulo: rotulo as string,
          rotuloNormalizado: (rotulo as string).toLowerCase(),
          texto: texto as string,
          esperaAResposta: esperaAResposta as boolean,
          tipos: (tipos as string[]).map(tipoDe),
          ordem: ordem as number,
        })),
      ),
    );
    const daImpressora = await lerFicha(1042);
    expect(daImpressora.respostasProntas).toEqual([
      {
        id: expect.any(String),
        rotulo: 'Pedir uma foto da folha',
        texto: 'Oi, Marina! Pode mandar uma foto da folha?',
        esperaAResposta: true,
      },
      {
        id: expect.any(String),
        rotulo: 'Pedir o print do erro',
        texto: 'Oi, Marina! Pode mandar um print do erro?',
        esperaAResposta: true,
      },
      {
        id: expect.any(String),
        rotulo: 'Avisar da troca do toner',
        texto: 'Marina, o toner foi trocado. Marina, confira.',
        esperaAResposta: false,
      },
    ]);
    // No chamado de Outro, só a que aparece em todos os tipos.
    expect((await lerFicha(1043)).respostasProntas).toEqual([
      {
        id: expect.any(String),
        rotulo: 'Pedir o print do erro',
        texto: 'Oi, Rita! Pode mandar um print do erro?',
        esperaAResposta: true,
      },
    ]);
  });

  it('quem atende vem com o "não atende mais" de quem perdeu os locais do chamado ou a conta', async () => {
    // Elisa atende Campinas, e o #1053 é da Recepção, em Jundiaí.
    await mudarChamado(1053, { responsavelId: conta('elisa'), responsavelDesde: as('08:15') });
    expect((await lerFicha(1053)).responsavel).toEqual({
      conta: conta('elisa'),
      nome: 'Elisa Prado',
      desde: iso('08:15'),
      naoAtendeMais: true,
    });
    // No #1044, do Administrativo, em Campinas, Elisa atende.
    expect((await lerFicha(1044, 'elisa')).permite).toEqual({ atender: true });
    expect((await lerFicha(1042, 'carla')).permite).toEqual({ atender: false });

    // Com o #1044 de Campinas, Elisa atende os locais; com a conta desativada, não atende mais.
    await mudarChamado(1044, { responsavelId: conta('elisa'), responsavelDesde: as('08:20') });
    const comElisa = { conta: conta('elisa'), nome: 'Elisa Prado', desde: iso('08:20') };
    expect((await lerFicha(1044)).responsavel).toEqual({ ...comElisa, naoAtendeMais: false });
    await mudarConta('elisa', 'inativa');
    try {
      expect((await lerFicha(1044)).responsavel).toEqual({ ...comElisa, naoAtendeMais: true });
    } finally {
      await mudarConta('elisa', 'ativa');
    }
  });

  it('com o Alertas, o Operação e o Ativos desligados, a ficha leva o que é deles como a quem não os vê', async () => {
    // Os alertas do #1051 e a OS e a solicitação do #1052 vieram nos testes acima.
    const ligada = await lerFicha(1052, 'ana');
    expect(ligada.os).not.toBeNull();
    expect(ligada.ativo.abrir).toBe(true);
    await desligarModulos(api, org, ['alertas', 'operacao', 'ativos']);
    try {
      const desligada = await lerFicha(1052, 'ana');
      expect(desligada).toMatchObject({ os: null, solicitacao: null });
      // O ativo é do chamado: continua no cabeçalho e no resumo, sem o atalho.
      expect(desligada.ativo).toEqual({ ...ligada.ativo, abrir: false, resumo: null });
      expect(desligada.resumo).toBe(ligada.resumo);
      const daImpressora = await lerFicha(1051, 'ana');
      expect(daImpressora.conversa.map((item: { especie: string }) => item.especie)).toEqual([
        'evento',
        'nota',
        'mensagem',
      ]);
    } finally {
      await desligarModulos(api, org, []);
    }
    expect((await lerFicha(1052, 'ana')).os).toEqual(ligada.os);
  });
});
