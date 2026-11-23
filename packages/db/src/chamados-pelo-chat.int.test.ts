// O que muda nos chamados com o chat, no banco (spec chamados, "Chamado", "Conversa do chamado",
// "Respostas prontas", "Resposta nova", "Pergunta com opções", "Cartão do ativo na mensagem",
// "Avaliação do atendimento" e "Fechamento do chamado"; change chat-com-chamados, design, decisões
// 2, 5 e 7; tarefa 1.2): o chamado aberto pelo chat, com quem abriu e a mensagem de origem, que vira
// um chamado só; o Fechado, que é o resolvido com o `fechado_em`; na conversa, a cópia da mensagem de
// origem, as opções e o cartão da TI, a primeira escolha de cada pergunta, uma avaliação por
// resolução e o `fechou`, o único evento sem autor; a leitura de cada conta, presa ao chamado; e as
// opções das respostas prontas. A gravação da versão anterior está no teste da migration.
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let dono: pg.Pool;
let app: pg.Pool;
let orgA = '';
let orgB = '';

async function emTransacao<T>(
  pool: pg.Pool,
  org: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.org_id', $1, true)", [org]);
    const resultado = await fn(c);
    await c.query('commit');
    return resultado;
  } catch (erro) {
    await c.query('rollback');
    throw erro;
  } finally {
    c.release();
  }
}

async function criarOrganizacao(nome: string): Promise<string> {
  const { rows } = await dono.query<{ id: string }>('select uuidv7() as id');
  const id = rows[0]?.id ?? '';
  await emTransacao(dono, id, (c) =>
    c.query('insert into organizacoes (id, nome) values ($1, $2)', [id, nome]),
  );
  return id;
}

/** Inclui uma linha com o papel da aplicação, no contexto da organização, e devolve o id. */
function incluir(tabela: string, org: string, colunas: Record<string, unknown>): Promise<string> {
  const todas = { org_id: org, ...colunas };
  const nomes = Object.keys(todas);
  return emTransacao(app, org, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into ${tabela} (${nomes.join(', ')}) values (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) returning id`,
      Object.values(todas),
    );
    return rows[0]?.id ?? '';
  });
}

/** Uma consulta ou uma mudança do papel da aplicação na organização. */
async function consultar<T extends pg.QueryResultRow>(
  org: string,
  texto: string,
  valores: unknown[] = [],
): Promise<T[]> {
  return emTransacao(app, org, async (c) => (await c.query<T>(texto, valores)).rows);
}

let nomes = 0;
const unico = (prefixo: string) => `${prefixo}${++nomes}`;

/** O erro do PostgreSQL de uma mudança que devia ser recusada: a checagem, ou a mensagem. */
async function recusada(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    return (erro as { constraint?: string; message: string }).constraint ?? (erro as Error).message;
  }
  throw new Error('a mudança não foi recusada');
}

const pessoa = (org: string) => incluir('pessoas', org, { nome: unico('Pessoa ') });

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await pessoa(org),
    usuario: unico('conta.'),
    hash_senha: 'h',
  });

const canal = (org: string) => {
  const nome = unico('Canal ');
  return incluir('conversas', org, { tipo: 'canal', nome, nome_normalizado: nome.toLowerCase() });
};

const mensagemDoChat = (org: string, conversa: string, autor: string) =>
  incluir('mensagens_do_chat', org, {
    conversa_id: conversa,
    especie: 'mensagem',
    autor_conta: autor,
    texto: 'A impressora do Financeiro está manchando.',
  });

const FORMULARIO_VAZIO = { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] };
const PRAZO = {
  modo: 'horario',
  respostaMin: 30,
  resolucaoMin: 480,
  resposta: { valor: 30, unidade: 'min' },
  resolucao: { valor: 8, unidade: 'h' },
};

const tipoDeChamado = (org: string) => {
  const nome = unico('Tipo de chamado ');
  return incluir('tipos_de_chamado', org, {
    nome,
    nome_normalizado: nome.toLowerCase(),
    icone: 'impressora',
    frase: 'Mancha, atola ou não imprime',
    situacao: 'em-uso',
    ordem: 1,
    resposta_valor: 30,
    resposta_unidade: 'min',
    resolucao_valor: 8,
    resolucao_unidade: 'h',
    modo: 'horario',
    sem_ninguem: 'triagem',
    gera_solicitacao: 'nao',
    formulario: FORMULARIO_VAZIO,
  });
};

/** O que cada chamado de uma organização usa. */
interface Referencias {
  pessoa: string;
  /** A conta da TI que atende e escreve. */
  ti: string;
  /** A conta de quem abre pelo chat. */
  quemAbre: string;
  tipo: string;
  conversa: string;
  outraConversa: string;
}

async function referencias(org: string): Promise<Referencias> {
  const quemAbre = await conta(org);
  return {
    pessoa: await pessoa(org),
    ti: await conta(org),
    quemAbre,
    tipo: await tipoDeChamado(org),
    conversa: await canal(org),
    outraConversa: await canal(org),
  };
}

let numeros = 3000;

/** Um chamado Na triagem aberto pela TI, como na versão anterior. */
const pelaTi = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  incluir('chamados', org, {
    numero: ++numeros,
    tipo_id: r.tipo,
    titulo: 'Impressora manchando',
    titulo_normalizado: 'impressora manchando',
    pessoa_id: r.pessoa,
    origem: 'ti',
    aberto_por: r.ti,
    formulario: FORMULARIO_VAZIO,
    situacao: 'triagem',
    prazo: PRAZO,
    relogio_desde: new Date(),
    primeira_resposta_em: new Date(),
    ...colunas,
  });

/** Um chamado Na triagem aberto pelo chat, sem a primeira resposta, a partir de uma mensagem nova. */
const peloChat = async (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  pelaTi(org, r, {
    origem: 'chat',
    aberto_por: r.quemAbre,
    origem_conversa_id: r.conversa,
    origem_mensagem_id: await mensagemDoChat(org, r.conversa, r.quemAbre),
    primeira_resposta_em: null,
    ...colunas,
  });

const RESOLVIDO_EM = new Date('2026-11-11T14:20:00.000Z');

/** Um chamado resolvido em 11/11, às 11:20 de Brasília. */
const resolvido = (org: string, r: Referencias, colunas: Record<string, unknown> = {}) =>
  pelaTi(org, r, {
    situacao: 'resolvido',
    responsavel_id: r.ti,
    responsavel_desde: RESOLVIDO_EM,
    relogio_desde: null,
    resolvido_em: RESOLVIDO_EM,
    resolvido_por: r.ti,
    ...colunas,
  });

const linha = (org: string, chamado: string, colunas: Record<string, unknown>) =>
  incluir('mensagens_dos_chamados', org, { chamado_id: chamado, ...colunas });

/** A mensagem da TI para a pessoa, com as opções ou o cartão. */
const daTi = (
  org: string,
  r: Referencias,
  chamado: string,
  colunas: Record<string, unknown> = {},
) =>
  linha(org, chamado, {
    especie: 'mensagem',
    autor_conta: r.ti,
    texto: 'Passo aí em 10 minutos. Pode ser?',
    ...colunas,
  });

const evento = (org: string, chamado: string, autor: string | null, nome: string, dados = {}) =>
  linha(org, chamado, { especie: 'evento', autor_conta: autor, evento: nome, dados });

const CARTAO = {
  icone: 'impressora',
  nome: 'Impressora Financeiro',
  modelo: 'HP LaserJet M428',
  patrimonio: 'PAT-00137',
  ip: '10.0.4.21',
  disponibilidade: 'Disponível',
  suprimento: 'Toner crítico · 6%',
  lidoEm: '2026-11-11T13:50:00.000Z',
};

let deA: Referencias;
let deB: Referencias;

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A dos chamados pelo chat');
  orgB = await criarOrganizacao('Organização B dos chamados pelo chat');
  deA = await referencias(orgA);
  deB = await referencias(orgB);
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('Chamado aberto pelo chat', () => {
  it('tem quem abriu e a mensagem de origem, sem a primeira resposta, e a mensagem vira um chamado só', async () => {
    const origem = await mensagemDoChat(orgA, deA.conversa, deA.quemAbre);
    await peloChat(orgA, deA, { origem_mensagem_id: origem });
    expect(await recusada(peloChat(orgA, deA, { origem_mensagem_id: origem }))).toBe(
      'chamados_origem_mensagem_unica',
    );
  });

  it('a mensagem de origem é da conversa de origem e da mesma organização', async () => {
    const daOutra = await mensagemDoChat(orgA, deA.outraConversa, deA.quemAbre);
    expect(await recusada(peloChat(orgA, deA, { origem_mensagem_id: daOutra }))).toBe(
      'chamados_origem_mensagem_fk',
    );
    const deOutraOrganizacao = await mensagemDoChat(orgB, deB.conversa, deB.quemAbre);
    expect(
      await recusada(
        peloChat(orgA, deA, {
          origem_conversa_id: deB.conversa,
          origem_mensagem_id: deOutraOrganizacao,
        }),
      ),
    ).toMatch(/^chamados_origem_(conversa|mensagem)_fk$/);
  });

  it('o chat sem quem abriu ou sem a origem, a origem pela metade e a TI com a origem são recusados', async () => {
    const origem = await mensagemDoChat(orgA, deA.conversa, deA.quemAbre);
    expect(await recusada(peloChat(orgA, deA, { aberto_por: null }))).toBe(
      'chamados_origem_coerente',
    );
    expect(
      await recusada(peloChat(orgA, deA, { origem_conversa_id: null, origem_mensagem_id: null })),
    ).toBe('chamados_origem_coerente');
    expect(await recusada(peloChat(orgA, deA, { origem_mensagem_id: null }))).toBe(
      'chamados_origem_coerente',
    );
    expect(
      await recusada(
        pelaTi(orgA, deA, { origem_conversa_id: deA.conversa, origem_mensagem_id: origem }),
      ),
    ).toBe('chamados_origem_coerente');
  });
});

describe('Fechado', () => {
  it('é o resolvido com o fechado_em depois da resolução', async () => {
    const fechado = await resolvido(orgA, deA);
    await consultar(orgA, `update chamados set fechado_em = $2 where id = $1`, [
      fechado,
      new Date('2026-11-19T03:00:00.000Z'),
    ]);
    const [lido] = await consultar<{ situacao: string; fechado_em: Date }>(
      orgA,
      'select situacao, fechado_em from chamados where id = $1',
      [fechado],
    );
    expect(lido).toEqual({ situacao: 'resolvido', fechado_em: new Date('2026-11-19T03:00:00Z') });
  });

  it('o fechado_em fora do resolvido ou antes da resolução é recusado', async () => {
    expect(await recusada(pelaTi(orgA, deA, { fechado_em: new Date() }))).toBe(
      'chamados_fechamento_coerente',
    );
    expect(
      await recusada(resolvido(orgA, deA, { fechado_em: new Date('2026-11-10T03:00:00Z') })),
    ).toBe('chamados_fechamento_coerente');
  });

  it('reabrir o fechado é recusado, como a versão anterior faria', async () => {
    const fechado = await resolvido(orgA, deA, { fechado_em: new Date('2026-11-19T03:00:00Z') });
    expect(
      await recusada(
        consultar(
          orgA,
          `update chamados set situacao = 'em-atendimento', relogio_desde = now(),
             resolvido_em = null, resolvido_por = null, versao = versao + 1
           where id = $1`,
          [fechado],
        ),
      ),
    ).toBe('chamados_fechamento_coerente');
  });
});

describe('Conversa do chamado', () => {
  /** A cópia de uma mensagem do chat na conversa do chamado, como a abertura pelo chat a grava. */
  const origemDe = (mensagem: string) => ({
    especie: 'origem',
    autor_conta: deA.quemAbre,
    texto: 'A impressora do Financeiro está manchando.',
    dados: { conversa: deA.conversa, mensagem, em: '2026-11-11T13:19:00.000Z' },
  });
  const novaMensagem = () => mensagemDoChat(orgA, deA.conversa, deA.quemAbre);

  it('a origem copia a mensagem com o autor, o texto e os dados', async () => {
    const chamado = await peloChat(orgA, deA);
    expect(
      await recusada(linha(orgA, chamado, { ...origemDe(await novaMensagem()), dados: null })),
    ).toBe('mensagens_dos_chamados_conteudo_valido');
    // A citada só com os anexos dá a origem com o texto nulo (tarefa 4.18).
    await linha(orgA, chamado, { ...origemDe(await novaMensagem()), texto: null });
    // A resposta da pessoa só com os anexos também.
    await linha(orgA, chamado, { especie: 'mensagem', autor_pessoa: deA.pessoa, texto: null });
    expect(
      await recusada(
        linha(orgA, chamado, {
          ...origemDe(await novaMensagem()),
          autor_conta: null,
          autor_pessoa: deA.pessoa,
        }),
      ),
    ).toBe('mensagens_dos_chamados_autoria_valida');
  });

  it('o chamado cita várias mensagens, e cada mensagem vira um chamado só', async () => {
    // Change andamento-e-varias-mensagens, decisão 5: uma linha `origem` por mensagem citada.
    const primeira = await novaMensagem();
    const segunda = await novaMensagem();
    const chamado = await peloChat(orgA, deA, { origem_mensagem_id: primeira });
    // A primeira é a linha que a versão anterior grava, uma por chamado, e o banco novo a aceita na
    // volta do runbook (Migration Plan).
    await linha(orgA, chamado, origemDe(primeira));
    await linha(orgA, chamado, origemDe(segunda));
    expect(await recusada(linha(orgA, chamado, origemDe(segunda)))).toBe(
      'mensagens_dos_chamados_origem_da_mensagem',
    );
    const outro = await peloChat(orgA, deA);
    expect(await recusada(linha(orgA, outro, origemDe(primeira)))).toBe(
      'mensagens_dos_chamados_origem_da_mensagem',
    );
  });

  it('as opções: de 2 a 3, de 1 a 40 caracteres, só na mensagem da TI', async () => {
    const chamado = await pelaTi(orgA, deA);
    await daTi(orgA, deA, chamado, { opcoes: ['Pode ser', 'Daqui a meia hora, por favor'] });
    await daTi(orgA, deA, chamado, {
      opcoes: ['Pode ser', 'Daqui a meia hora, por favor', 'Estou em reunião, volte às 14h'],
    });
    for (const opcoes of [
      ['Pode ser'],
      ['Um', 'Dois', 'Três', 'Quatro'],
      ['Pode ser', '   '],
      ['Pode ser', 'x'.repeat(41)],
      ['Pode ser', null],
      [
        ['Pode', 'ser'],
        ['Mais', 'tarde'],
      ],
      [],
    ]) {
      expect(await recusada(daTi(orgA, deA, chamado, { opcoes }))).toBe(
        'mensagens_dos_chamados_opcoes_validas',
      );
    }
    const opcoes = ['Pode ser', 'Mais tarde'];
    expect(
      await recusada(
        linha(orgA, chamado, {
          especie: 'mensagem',
          autor_pessoa: deA.pessoa,
          texto: 'Pode ser',
          opcoes,
        }),
      ),
    ).toBe('mensagens_dos_chamados_opcoes_validas');
    expect(await recusada(daTi(orgA, deA, chamado, { especie: 'nota', opcoes }))).toBe(
      'mensagens_dos_chamados_opcoes_validas',
    );
    // A pergunta tem o texto, mesmo com os anexos (tarefa 4.18).
    expect(await recusada(daTi(orgA, deA, chamado, { texto: null, opcoes }))).toBe(
      'mensagens_dos_chamados_opcoes_validas',
    );
  });

  it('o cartão: um documento de até 4 KiB, na mensagem da TI e na nota', async () => {
    const chamado = await pelaTi(orgA, deA);
    await daTi(orgA, deA, chamado, { cartao: CARTAO });
    await daTi(orgA, deA, chamado, { especie: 'nota', cartao: CARTAO });
    expect(
      await recusada(
        linha(orgA, chamado, {
          especie: 'mensagem',
          autor_pessoa: deA.pessoa,
          texto: 'Olha a impressora',
          cartao: CARTAO,
        }),
      ),
    ).toBe('mensagens_dos_chamados_cartao_valido');
    expect(
      await recusada(daTi(orgA, deA, chamado, { cartao: { ...CARTAO, nome: 'x'.repeat(4096) } })),
    ).toBe('mensagens_dos_chamados_cartao_valido');
    expect(await recusada(daTi(orgA, deA, chamado, { cartao: JSON.stringify([CARTAO]) }))).toBe(
      'mensagens_dos_chamados_cartao_valido',
    );
  });

  it('o fechou é o único evento sem autor, um por chamado', async () => {
    const chamado = await resolvido(orgA, deA);
    await evento(orgA, chamado, null, 'fechou');
    expect(await recusada(evento(orgA, chamado, null, 'fechou'))).toBe(
      'mensagens_dos_chamados_fechou_unico',
    );
    expect(await recusada(evento(orgA, chamado, null, 'resolveu'))).toBe(
      'mensagens_dos_chamados_autoria_valida',
    );
  });

  it('a primeira escolha de cada pergunta vence', async () => {
    const chamado = await pelaTi(orgA, deA);
    const pergunta = await daTi(orgA, deA, chamado, { opcoes: ['Pode ser', 'Mais tarde'] });
    const outraPergunta = await daTi(orgA, deA, chamado, { opcoes: ['Sim', 'Não'] });
    await evento(orgA, chamado, deA.quemAbre, 'escolheu', { mensagem: pergunta, opcao: 0 });
    expect(
      await recusada(
        evento(orgA, chamado, await conta(orgA), 'escolheu', { mensagem: pergunta, opcao: 1 }),
      ),
    ).toBe('mensagens_dos_chamados_escolha_unica');
    await evento(orgA, chamado, deA.quemAbre, 'escolheu', { mensagem: outraPergunta, opcao: 1 });
  });

  it('uma avaliação por resolução', async () => {
    const chamado = await resolvido(orgA, deA);
    const avaliacao = (resolucao: string) =>
      evento(orgA, chamado, deA.quemAbre, 'avaliou', { nivel: 'otimo', comentario: '', resolucao });
    await avaliacao(RESOLVIDO_EM.toISOString());
    expect(await recusada(avaliacao(RESOLVIDO_EM.toISOString()))).toBe(
      'mensagens_dos_chamados_avaliacao_unica',
    );
    // Reaberto e resolvido de novo, o chamado pede outra avaliação.
    await avaliacao('2026-11-12T12:00:00.000Z');
  });

  // Com a chave nula, o índice único não compararia a linha (pontos da revisão da tarefa 1.2).
  it('a escolha e a avaliação sempre têm a chave do índice', async () => {
    const chamado = await resolvido(orgA, deA);
    const semChave = 'mensagens_dos_chamados_chaves_dos_eventos';
    const semDados = (nome: string) =>
      linha(orgA, chamado, {
        especie: 'evento',
        autor_conta: deA.quemAbre,
        evento: nome,
        dados: null,
      });
    const doEvento = (nome: string, dados: object) =>
      evento(orgA, chamado, deA.quemAbre, nome, dados);
    expect(await recusada(doEvento('escolheu', { opcao: 0 }))).toBe(semChave);
    expect(await recusada(doEvento('escolheu', { mensagem: null, opcao: 0 }))).toBe(semChave);
    expect(await recusada(semDados('escolheu'))).toBe(semChave);
    expect(await recusada(doEvento('avaliou', { nivel: 'otimo', comentario: '' }))).toBe(semChave);
    expect(await recusada(semDados('avaliou'))).toBe(semChave);
  });
});

describe('Leitura dos chamados', () => {
  it('tem o RLS ativo e forçado, e a outra organização não a vê', async () => {
    const { rows } = await dono.query(
      `select relrowsecurity as ativo, relforcerowsecurity as forcado
         from pg_class where relname = 'leituras_dos_chamados' and relkind = 'r'`,
    );
    expect(rows).toEqual([{ ativo: true, forcado: true }]);
    const chamado = await pelaTi(orgA, deA);
    const vista = await daTi(orgA, deA, chamado);
    await incluir('leituras_dos_chamados', orgA, {
      chamado_id: chamado,
      conta_id: deA.quemAbre,
      vista_ate: vista,
    });
    expect(
      await consultar(orgB, 'select id from leituras_dos_chamados where chamado_id = $1', [
        chamado,
      ]),
    ).toEqual([]);
  });

  it('uma por conta e chamado, com a última linha vista do mesmo chamado, que anda e não sai', async () => {
    const chamado = await pelaTi(orgA, deA);
    const primeira = await daTi(orgA, deA, chamado);
    const leitura = { chamado_id: chamado, conta_id: deA.quemAbre, vista_ate: primeira };
    const id = await incluir('leituras_dos_chamados', orgA, leitura);
    expect(await recusada(incluir('leituras_dos_chamados', orgA, leitura))).toBe(
      'leituras_dos_chamados_unica',
    );
    const deOutroChamado = await daTi(orgA, deA, await pelaTi(orgA, deA));
    expect(
      await recusada(
        incluir('leituras_dos_chamados', orgA, {
          ...leitura,
          conta_id: deA.ti,
          vista_ate: deOutroChamado,
        }),
      ),
    ).toBe('leituras_dos_chamados_vista_ate_fk');
    const segunda = await daTi(orgA, deA, chamado);
    await consultar(orgA, 'update leituras_dos_chamados set vista_ate = $2 where id = $1', [
      id,
      segunda,
    ]);
    expect(
      await consultar(orgA, 'select vista_ate from leituras_dos_chamados where id = $1', [id]),
    ).toEqual([{ vista_ate: segunda }]);
    expect(
      await recusada(consultar(orgA, 'delete from leituras_dos_chamados where id = $1', [id])),
    ).toMatch(/permission denied/);
  });
});

describe('Respostas prontas', () => {
  const resposta = (opcoes?: unknown) => {
    const rotulo = unico('Passo aí ');
    return incluir('respostas_prontas', orgA, {
      rotulo,
      rotulo_normalizado: rotulo.toLowerCase(),
      texto: 'Passo aí em 10 minutos. Pode ser?',
      ordem: 1,
      ...(opcoes === undefined ? {} : { opcoes }),
    });
  };

  it('as opções começam vazias e vão de 2 a 3, de 1 a 40 caracteres', async () => {
    const sem = await resposta();
    expect(
      await consultar(orgA, 'select opcoes from respostas_prontas where id = $1', [sem]),
    ).toEqual([{ opcoes: [] }]);
    await resposta(['Pode ser', 'Mais tarde']);
    await resposta(['Pode ser', 'Mais tarde', 'Estou em reunião']);
    for (const opcoes of [
      ['Pode ser'],
      ['a', 'b', 'c', 'd'],
      ['Pode ser', ''],
      ['a', 'x'.repeat(41)],
    ]) {
      expect(await recusada(resposta(opcoes))).toBe('respostas_prontas_opcoes_validas');
    }
  });
});
