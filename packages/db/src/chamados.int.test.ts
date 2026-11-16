// Os chamados no banco (spec tipos-de-chamado, "Tipo de chamado", "Prazo e atendimento do tipo" e
// "O que acontece depois"; spec chamados, "Chamado", "Situação e quem atende", "Ações do
// atendimento" e "Conversa do chamado"; change chamados-da-ti, design, decisão 1): o tipo, com o
// nome único sem acento, o prazo, o atendimento e o que acontece depois, e o Rascunho que se
// descarta; o chamado, que o papel da aplicação não apaga, com quem atende e o relógio coerentes com
// a situação; e a conversa, que o papel da aplicação só inclui e lê. Todas isoladas pela organização.
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

/** Uma consulta do papel da aplicação na organização. */
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
    hash_senha: 'hash',
  });

let numerosDasOs = 500;
let numerosDasSolicitacoes = 700;

/** As referências de uma organização, para os tipos e os chamados dela. */
interface Referencias {
  pessoa: string;
  conta: string;
  outraConta: string;
  tipoDeAtivo: string;
  ativo: string;
  os: string;
  outraOs: string;
  solicitacao: string;
}

async function referencias(org: string): Promise<Referencias> {
  const nomeDoTipo = unico('Tipo de ativo ');
  const tipoDeAtivo = await incluir('tipos_de_ativo', org, {
    nome: nomeDoTipo,
    nome_normalizado: nomeDoTipo.toLowerCase(),
    icone: 'impressora',
  });
  const ativo = await incluir('ativos', org, { tipo_id: tipoDeAtivo, busca: unico('pat-') });
  const quemAtende = await conta(org);
  const quemPede = await pessoa(org);
  const os = () =>
    incluir('ordens_de_servico', org, {
      numero: ++numerosDasOs,
      ativo_id: ativo,
      problema: 'Mancha na borda',
      situacao: 'aberta',
      aberta_por: quemAtende,
    });
  return {
    pessoa: quemPede,
    conta: quemAtende,
    outraConta: await conta(org),
    tipoDeAtivo,
    ativo,
    os: await os(),
    outraOs: await os(),
    solicitacao: await incluir('solicitacoes', org, {
      numero: ++numerosDasSolicitacoes,
      tipo: 'toner',
      situacao: 'aberta',
      pessoa_id: quemPede,
      registrada_por: quemAtende,
    }),
  };
}

/** O formulário de um tipo sem campos, com o título pelo nome do tipo. */
const FORMULARIO_VAZIO = { titulo: { comecaPeloTipo: true, campoId: null }, campos: [] };

/** O prazo de um chamado, copiado em minutos de "Responde em 30 min e resolve em 8 h". */
const PRAZO = {
  modo: 'horario',
  respostaMin: 30,
  resolucaoMin: 480,
  resposta: { valor: 30, unidade: 'min' },
  resolucao: { valor: 8, unidade: 'h' },
};

const tipoDeChamado = (org: string, colunas: Record<string, unknown> = {}) => {
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
    ...colunas,
  });
};

let numeros = 1000;

/** Um chamado Em atendimento com a conta, aberto por ela, com o relógio contando. */
const chamado = (
  org: string,
  r: Referencias,
  tipo: string,
  colunas: Record<string, unknown> = {},
) => {
  const agora = new Date();
  return incluir('chamados', org, {
    numero: ++numeros,
    tipo_id: tipo,
    titulo: 'Impressora manchando',
    titulo_normalizado: 'impressora manchando',
    pessoa_id: r.pessoa,
    origem: 'ti',
    aberto_por: r.conta,
    formulario: FORMULARIO_VAZIO,
    situacao: 'em-atendimento',
    responsavel_id: r.conta,
    responsavel_desde: agora,
    prazo: PRAZO,
    relogio_desde: agora,
    primeira_resposta_em: agora,
    ...colunas,
  });
};

/** Um chamado Na triagem, sem ninguém atendendo, com o relógio contando. */
const naTriagem = (org: string, r: Referencias, tipo: string, colunas = {}) =>
  chamado(org, r, tipo, {
    situacao: 'triagem',
    responsavel_id: null,
    responsavel_desde: null,
    ...colunas,
  });

const mensagem = (org: string, chamadoId: string, colunas: Record<string, unknown>) =>
  incluir('mensagens_dos_chamados', org, { chamado_id: chamadoId, ...colunas });

let deA: Referencias;
let deB: Referencias;
let tipoDeA = '';
let tipoDeB = '';

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A dos chamados');
  orgB = await criarOrganizacao('Organização B dos chamados');
  deA = await referencias(orgA);
  deB = await referencias(orgB);
  tipoDeA = await tipoDeChamado(orgA);
  tipoDeB = await tipoDeChamado(orgB);
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('isolamento', () => {
  it('os tipos, os chamados e a conversa têm o RLS ativo e forçado', async () => {
    const { rows } = await dono.query(
      `select relname as tabela, relrowsecurity as ativo, relforcerowsecurity as forcado
         from pg_class
        where relname in ('tipos_de_chamado', 'chamados', 'mensagens_dos_chamados')
          and relkind = 'r'
        order by relname`,
    );
    expect(rows).toEqual([
      { tabela: 'chamados', ativo: true, forcado: true },
      { tabela: 'mensagens_dos_chamados', ativo: true, forcado: true },
      { tabela: 'tipos_de_chamado', ativo: true, forcado: true },
    ]);
  });
});

describe('tipos de chamado', () => {
  it('cria o tipo com as chaves de fábrica, e o nome é único sem acento e maiúsculas', async () => {
    const id = await tipoDeChamado(orgA, { nome: 'Impressora', nome_normalizado: 'impressora' });
    expect(
      await consultar(
        orgA,
        `select pode_virar_os, gera_solicitacao, pede_o_ativo, aparece_para_o_colaborador,
                so_a_ti_abre, atende_por_padrao, criado_em is not null as momento
           from tipos_de_chamado where id = $1`,
        [id],
      ),
    ).toEqual([
      {
        pode_virar_os: false,
        gera_solicitacao: 'nao',
        pede_o_ativo: false,
        aparece_para_o_colaborador: true,
        so_a_ti_abre: false,
        atende_por_padrao: null,
        momento: true,
      },
    ]);
    expect(
      await recusada(tipoDeChamado(orgA, { nome: 'impressora', nome_normalizado: 'impressora' })),
    ).toBe('tipos_de_chamado_nome_unico');
    await tipoDeChamado(orgB, { nome: 'Impressora', nome_normalizado: 'impressora' });
  });

  it('confere o nome, a frase, o ícone e a situação', async () => {
    expect(await recusada(tipoDeChamado(orgA, { nome: '  ' }))).toBe(
      'tipos_de_chamado_nome_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { nome: 'a'.repeat(41) }))).toBe(
      'tipos_de_chamado_nome_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { frase: 'a'.repeat(81) }))).toBe(
      'tipos_de_chamado_frase_valida',
    );
    expect(await recusada(tipoDeChamado(orgA, { frase: ' ' }))).toBe(
      'tipos_de_chamado_frase_valida',
    );
    // Só o Rascunho do "Novo tipo" fica sem a frase, até "Criar o tipo".
    expect(await recusada(tipoDeChamado(orgA, { frase: null }))).toBe(
      'tipos_de_chamado_frase_valida',
    );
    await tipoDeChamado(orgA, { frase: null, situacao: 'rascunho' });
    expect(await recusada(tipoDeChamado(orgA, { icone: 'foguete' }))).toBe(
      'tipos_de_chamado_icone_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { situacao: 'ativo' }))).toBe(
      'tipos_de_chamado_situacao_valida',
    );
    await tipoDeChamado(orgA, { situacao: 'inativo', icone: 'wi-fi' });
  });

  it('confere o prazo: os números de 1 a 999, as unidades e o modo de contar', async () => {
    expect(await recusada(tipoDeChamado(orgA, { resposta_valor: 0 }))).toBe(
      'tipos_de_chamado_prazo_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { resolucao_valor: 1000 }))).toBe(
      'tipos_de_chamado_prazo_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { resposta_unidade: 'semana' }))).toBe(
      'tipos_de_chamado_prazo_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { resolucao_unidade: 'mes' }))).toBe(
      'tipos_de_chamado_prazo_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { modo: 'uteis' }))).toBe(
      'tipos_de_chamado_prazo_valido',
    );
    await tipoDeChamado(orgA, {
      resposta_valor: 999,
      resposta_unidade: 'd',
      resolucao_valor: 1,
      resolucao_unidade: 'min',
      modo: 'corridas',
    });
  });

  it('o "Fica com a pessoa mesmo assim" pede quem atende por padrão', async () => {
    expect(await recusada(tipoDeChamado(orgA, { sem_ninguem: 'fica' }))).toBe(
      'tipos_de_chamado_atendimento_valido',
    );
    expect(await recusada(tipoDeChamado(orgA, { sem_ninguem: 'espera' }))).toBe(
      'tipos_de_chamado_atendimento_valido',
    );
    await tipoDeChamado(orgA, { sem_ninguem: 'fica', atende_por_padrao: deA.conta });
  });

  it('a solicitação gerada: o Equipamento com o tipo de ativo e o Toner com o ativo', async () => {
    expect(await recusada(tipoDeChamado(orgA, { gera_solicitacao: 'equipamento' }))).toBe(
      'tipos_de_chamado_solicitacao_coerente',
    );
    expect(
      await recusada(tipoDeChamado(orgA, { tipo_de_ativo_do_equipamento: deA.tipoDeAtivo })),
    ).toBe('tipos_de_chamado_solicitacao_coerente');
    expect(await recusada(tipoDeChamado(orgA, { gera_solicitacao: 'toner' }))).toBe(
      'tipos_de_chamado_solicitacao_coerente',
    );
    expect(await recusada(tipoDeChamado(orgA, { gera_solicitacao: 'conserto' }))).toBe(
      'tipos_de_chamado_solicitacao_coerente',
    );
    await tipoDeChamado(orgA, { gera_solicitacao: 'toner', pede_o_ativo: true });
    await tipoDeChamado(orgA, {
      gera_solicitacao: 'equipamento',
      tipo_de_ativo_do_equipamento: deA.tipoDeAtivo,
    });
  });

  it('o formulário é um objeto', async () => {
    expect(await recusada(tipoDeChamado(orgA, { formulario: '[]' }))).toBe(
      'tipos_de_chamado_formulario_valido',
    );
  });

  it('recusa as referências de outra organização', async () => {
    expect(await recusada(tipoDeChamado(orgA, { atende_por_padrao: deB.conta }))).toBe(
      'tipos_de_chamado_atende_por_padrao_fk',
    );
    expect(
      await recusada(
        tipoDeChamado(orgA, {
          gera_solicitacao: 'equipamento',
          tipo_de_ativo_do_equipamento: deB.tipoDeAtivo,
        }),
      ),
    ).toBe('tipos_de_chamado_tipo_de_ativo_fk');
    expect(await recusada(tipoDeChamado(orgA, { duplicado_de: tipoDeB }))).toBe(
      'tipos_de_chamado_duplicado_de_fk',
    );
    expect(await recusada(tipoDeChamado(orgA, { criado_por: deB.conta }))).toBe(
      'tipos_de_chamado_criado_por_fk',
    );
    await tipoDeChamado(orgA, { duplicado_de: tipoDeA, criado_por: deA.conta });
  });

  it('cada organização vê só os próprios tipos', async () => {
    expect(
      await consultar(orgA, 'select id from tipos_de_chamado where id = $1', [tipoDeB]),
    ).toEqual([]);
  });

  it('o Rascunho se descarta, e o tipo com chamados não sai', async () => {
    const rascunho = await tipoDeChamado(orgA, { situacao: 'rascunho', frase: null });
    await emTransacao(app, orgA, (c) =>
      c.query('delete from tipos_de_chamado where id = $1', [rascunho]),
    );
    const comChamado = await tipoDeChamado(orgA);
    await chamado(orgA, deA, comChamado);
    expect(
      await recusada(
        emTransacao(app, orgA, (c) =>
          c.query('delete from tipos_de_chamado where id = $1', [comChamado]),
        ),
      ),
    ).toBe('chamados_tipo_fk');
  });
});

describe('chamados', () => {
  it('abre o chamado com o número, a pessoa, quem abriu, o prazo copiado e o relógio', async () => {
    const id = await chamado(orgA, deA, tipoDeA);
    expect(
      await consultar(
        orgA,
        `select origem, situacao, respostas, locais, sem_local, contado_s, versao, prazo,
                aberto_em is not null as momento
           from chamados where id = $1`,
        [id],
      ),
    ).toEqual([
      {
        origem: 'ti',
        situacao: 'em-atendimento',
        respostas: {},
        locais: [],
        sem_local: false,
        contado_s: 0,
        versao: 1,
        prazo: PRAZO,
        momento: true,
      },
    ]);
  });

  it('Chamado não se apaga: o papel da aplicação não apaga, e muda', async () => {
    const id = await chamado(orgA, deA, tipoDeA);
    expect(
      await recusada(
        emTransacao(app, orgA, (c) => c.query('delete from chamados where id = $1', [id])),
      ),
    ).toMatch(/permission denied/);
    await emTransacao(app, orgA, (c) =>
      c.query('update chamados set versao = versao + 1, titulo = $2 where id = $1', [
        id,
        'Impressora manchando na borda',
      ]),
    );
  });

  it('o número é único na organização, e outra organização repete o número', async () => {
    const numero = ++numeros;
    await chamado(orgA, deA, tipoDeA, { numero });
    expect(await recusada(chamado(orgA, deA, tipoDeA, { numero }))).toBe('chamados_numero_unico');
    await chamado(orgB, deB, tipoDeB, { numero });
  });

  it('cada organização vê só os próprios chamados', async () => {
    const id = await chamado(orgB, deB, tipoDeB);
    expect(await consultar(orgA, 'select id from chamados where id = $1', [id])).toEqual([]);
  });

  it('recusa as referências de outra organização', async () => {
    expect(await recusada(chamado(orgA, deA, tipoDeB))).toBe('chamados_tipo_fk');
    expect(await recusada(chamado(orgA, deA, tipoDeA, { pessoa_id: deB.pessoa }))).toBe(
      'chamados_pessoa_fk',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { ativo_id: deB.ativo }))).toBe(
      'chamados_ativo_fk',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { aberto_por: deB.conta }))).toBe(
      'chamados_aberto_por_fk',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { responsavel_id: deB.conta }))).toBe(
      'chamados_responsavel_fk',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { os_id: deB.os }))).toBe('chamados_os_fk');
    expect(await recusada(chamado(orgA, deA, tipoDeA, { solicitacao_id: deB.solicitacao }))).toBe(
      'chamados_solicitacao_fk',
    );
    const agora = new Date();
    expect(
      await recusada(
        chamado(orgA, deA, tipoDeA, {
          situacao: 'resolvido',
          relogio_desde: null,
          resolvido_em: agora,
          resolvido_por: deB.conta,
        }),
      ),
    ).toBe('chamados_resolvido_por_fk');
  });

  it('confere o número, o título, a origem, a situação, o relógio contado e a versão', async () => {
    expect(await recusada(chamado(orgA, deA, tipoDeA, { numero: 0 }))).toBe(
      'chamados_numero_valido',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { titulo: ' ' }))).toBe(
      'chamados_titulo_valido',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { titulo: 'a'.repeat(121) }))).toBe(
      'chamados_titulo_valido',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { origem: 'chat' }))).toBe(
      'chamados_origem_valida',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { situacao: 'pausado' }))).toBe(
      'chamados_situacao_valida',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { contado_s: -1 }))).toBe(
      'chamados_contado_valido',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { versao: 0 }))).toBe(
      'chamados_versao_valida',
    );
    await chamado(orgA, deA, tipoDeA, { titulo: 'a'.repeat(120), contado_s: 3 * 3600 });
  });

  it('quem atende segue a situação: ninguém na triagem e alguém no atendimento e no aguardando', async () => {
    expect(await recusada(chamado(orgA, deA, tipoDeA, { situacao: 'triagem' }))).toBe(
      'chamados_atendimento_coerente',
    );
    expect(await recusada(naTriagem(orgA, deA, tipoDeA, { situacao: 'em-atendimento' }))).toBe(
      'chamados_atendimento_coerente',
    );
    expect(
      await recusada(
        naTriagem(orgA, deA, tipoDeA, { situacao: 'aguardando', relogio_desde: null }),
      ),
    ).toBe('chamados_atendimento_coerente');
    expect(await recusada(chamado(orgA, deA, tipoDeA, { responsavel_desde: null }))).toBe(
      'chamados_atendimento_coerente',
    );
    await naTriagem(orgA, deA, tipoDeA);
    // O resolvido da triagem fica sem ninguém; o do atendimento guarda quem atendia.
    await naTriagem(orgA, deA, tipoDeA, {
      situacao: 'resolvido',
      relogio_desde: null,
      resolvido_em: new Date(),
      resolvido_por: deA.conta,
    });
  });

  it('o relógio conta na triagem e no atendimento e para no aguardando e no resolvido', async () => {
    expect(await recusada(chamado(orgA, deA, tipoDeA, { situacao: 'aguardando' }))).toBe(
      'chamados_relogio_coerente',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { relogio_desde: null }))).toBe(
      'chamados_relogio_coerente',
    );
    expect(await recusada(naTriagem(orgA, deA, tipoDeA, { relogio_desde: null }))).toBe(
      'chamados_relogio_coerente',
    );
    await chamado(orgA, deA, tipoDeA, {
      situacao: 'aguardando',
      relogio_desde: null,
      contado_s: 1800,
    });
  });

  it('o resolvido tem quem resolveu e quando, e o aberto não tem', async () => {
    const agora = new Date();
    expect(
      await recusada(chamado(orgA, deA, tipoDeA, { situacao: 'resolvido', relogio_desde: null })),
    ).toBe('chamados_resolucao_coerente');
    expect(
      await recusada(
        chamado(orgA, deA, tipoDeA, { resolvido_em: agora, resolvido_por: deA.conta }),
      ),
    ).toBe('chamados_resolucao_coerente');
    expect(
      await recusada(
        chamado(orgA, deA, tipoDeA, {
          situacao: 'resolvido',
          relogio_desde: null,
          resolvido_em: agora,
        }),
      ),
    ).toBe('chamados_resolucao_coerente');
    await chamado(orgA, deA, tipoDeA, {
      situacao: 'resolvido',
      relogio_desde: null,
      resolvido_em: agora,
      resolvido_por: deA.conta,
    });
  });

  it('o chamado aberto pela TI tem quem abriu e nasce com a primeira resposta', async () => {
    expect(await recusada(chamado(orgA, deA, tipoDeA, { aberto_por: null }))).toBe(
      'chamados_abertura_coerente',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { primeira_resposta_em: null }))).toBe(
      'chamados_abertura_coerente',
    );
  });

  it('uma OS sai de um chamado só, e uma solicitação junta vários chamados', async () => {
    await chamado(orgA, deA, tipoDeA, { os_id: deA.os });
    expect(await recusada(chamado(orgA, deA, tipoDeA, { os_id: deA.os }))).toBe(
      'chamados_os_unica',
    );
    await chamado(orgA, deA, tipoDeA, { os_id: deA.outraOs, solicitacao_id: deA.solicitacao });
    await chamado(orgA, deA, tipoDeA, { solicitacao_id: deA.solicitacao, ativo_id: deA.ativo });
  });

  it('o formulário, as respostas e o prazo são objetos, com um teto que só serve de rede', async () => {
    expect(await recusada(chamado(orgA, deA, tipoDeA, { formulario: '[]' }))).toBe(
      'chamados_formulario_valido',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { respostas: '[]' }))).toBe(
      'chamados_respostas_validas',
    );
    expect(await recusada(chamado(orgA, deA, tipoDeA, { prazo: '"8 h"' }))).toBe(
      'chamados_prazo_valido',
    );
    expect(
      await recusada(chamado(orgA, deA, tipoDeA, { prazo: { ...PRAZO, texto: 'a'.repeat(1024) } })),
    ).toBe('chamados_prazo_valido');
    // O teto conta bytes, e o pior caso que o domínio aceita são 20 textos longos de 4.000
    // caracteres de 4 bytes cada: 320 KB.
    const respostas = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`campo${i}`, '\u{1F600}'.repeat(4000)]),
    );
    await chamado(orgA, deA, tipoDeA, { respostas });
  });
});

describe('conversa dos chamados', () => {
  let doA = '';
  let doB = '';

  beforeAll(async () => {
    doA = await chamado(orgA, deA, tipoDeA);
    doB = await chamado(orgB, deB, tipoDeB);
  });

  it('grava a mensagem, a nota e o evento, na ordem em que aconteceram', async () => {
    const id = await chamado(orgA, deA, tipoDeA);
    await mensagem(orgA, id, {
      especie: 'evento',
      evento: 'abertura',
      autor_conta: deA.conta,
      dados: { resumo: 'Problema: Manchando, na borda · Ativo: PAT-00139' },
    });
    await mensagem(orgA, id, {
      especie: 'mensagem',
      autor_conta: deA.conta,
      texto: 'Já estou vendo a impressora.',
    });
    await mensagem(orgA, id, {
      especie: 'nota',
      autor_conta: deA.outraConta,
      texto: 'O toner foi trocado ontem.',
    });
    expect(
      await consultar(
        orgA,
        `select especie, evento, texto, criada_em is not null as momento
           from mensagens_dos_chamados where chamado_id = $1 order by criada_em, id`,
        [id],
      ),
    ).toEqual([
      { especie: 'evento', evento: 'abertura', texto: null, momento: true },
      { especie: 'mensagem', evento: null, texto: 'Já estou vendo a impressora.', momento: true },
      { especie: 'nota', evento: null, texto: 'O toner foi trocado ontem.', momento: true },
    ]);
  });

  it('a conversa só cresce: o papel da aplicação não muda nem apaga', async () => {
    const id = await mensagem(orgA, doA, {
      especie: 'mensagem',
      autor_conta: deA.conta,
      texto: 'Pode reiniciar a impressora?',
    });
    expect(
      await recusada(
        emTransacao(app, orgA, (c) =>
          c.query("update mensagens_dos_chamados set texto = 'Outra coisa' where id = $1", [id]),
        ),
      ),
    ).toMatch(/permission denied/);
    expect(
      await recusada(
        emTransacao(app, orgA, (c) =>
          c.query('delete from mensagens_dos_chamados where id = $1', [id]),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it('a autoria: a mensagem de uma conta ou da pessoa, e a nota e o evento de uma conta', async () => {
    await mensagem(orgA, doA, {
      especie: 'mensagem',
      autor_pessoa: deA.pessoa,
      texto: 'Reiniciei e continua manchando.',
    });
    // Nenhum evento desta change é do sistema: cada um é de quem agiu.
    expect(await recusada(mensagem(orgA, doA, { especie: 'evento', evento: 'retomou' }))).toBe(
      'mensagens_dos_chamados_autoria_valida',
    );
    expect(
      await recusada(
        mensagem(orgA, doA, {
          especie: 'mensagem',
          autor_conta: deA.conta,
          autor_pessoa: deA.pessoa,
          texto: 'As duas autorias',
        }),
      ),
    ).toBe('mensagens_dos_chamados_autoria_valida');
    expect(await recusada(mensagem(orgA, doA, { especie: 'mensagem', texto: 'Sem autoria' }))).toBe(
      'mensagens_dos_chamados_autoria_valida',
    );
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'nota', autor_pessoa: deA.pessoa, texto: 'Nota da pessoa' }),
      ),
    ).toBe('mensagens_dos_chamados_autoria_valida');
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'evento', evento: 'retomou', autor_pessoa: deA.pessoa }),
      ),
    ).toBe('mensagens_dos_chamados_autoria_valida');
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'aviso', autor_conta: deA.conta, texto: 'Aviso' }),
      ),
    ).toBe('mensagens_dos_chamados_especie_valida');
  });

  it('o conteúdo: o texto da mensagem e da nota, o código e os dados do evento', async () => {
    const daConta = { autor_conta: deA.conta };
    await mensagem(orgA, doA, { especie: 'nota', ...daConta, texto: 'a'.repeat(4000) });
    expect(await recusada(mensagem(orgA, doA, { especie: 'mensagem', ...daConta }))).toBe(
      'mensagens_dos_chamados_conteudo_valido',
    );
    expect(
      await recusada(mensagem(orgA, doA, { especie: 'mensagem', ...daConta, texto: '  ' })),
    ).toBe('mensagens_dos_chamados_conteudo_valido');
    expect(
      await recusada(mensagem(orgA, doA, { especie: 'nota', ...daConta, texto: 'a'.repeat(4001) })),
    ).toBe('mensagens_dos_chamados_conteudo_valido');
    expect(await recusada(mensagem(orgA, doA, { especie: 'evento', ...daConta }))).toBe(
      'mensagens_dos_chamados_conteudo_valido',
    );
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'evento', ...daConta, evento: 'assumiu', texto: 'Assumi' }),
      ),
    ).toBe('mensagens_dos_chamados_conteudo_valido');
    expect(
      await recusada(
        mensagem(orgA, doA, {
          especie: 'mensagem',
          ...daConta,
          texto: 'Com dados',
          dados: { conta: deA.conta },
        }),
      ),
    ).toBe('mensagens_dos_chamados_conteudo_valido');
    expect(
      await recusada(mensagem(orgA, doA, { especie: 'evento', ...daConta, evento: 'Assumiu' })),
    ).toBe('mensagens_dos_chamados_evento_valido');
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'evento', ...daConta, evento: 'passou', dados: '[]' }),
      ),
    ).toBe('mensagens_dos_chamados_dados_validos');
    await mensagem(orgA, doA, {
      especie: 'evento',
      ...daConta,
      evento: 'virou-os',
      dados: { os: deA.os },
    });
  });

  it('recusa as referências de outra organização', async () => {
    expect(
      await recusada(
        mensagem(orgA, doB, { especie: 'mensagem', autor_conta: deA.conta, texto: 'Oi' }),
      ),
    ).toBe('mensagens_dos_chamados_chamado_fk');
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'mensagem', autor_conta: deB.conta, texto: 'Oi' }),
      ),
    ).toBe('mensagens_dos_chamados_autor_conta_fk');
    expect(
      await recusada(
        mensagem(orgA, doA, { especie: 'mensagem', autor_pessoa: deB.pessoa, texto: 'Oi' }),
      ),
    ).toBe('mensagens_dos_chamados_autor_pessoa_fk');
  });

  it('cada organização vê só a própria conversa', async () => {
    const id = await mensagem(orgB, doB, {
      especie: 'nota',
      autor_conta: deB.conta,
      texto: 'Nota de outra organização',
    });
    expect(
      await consultar(orgA, 'select id from mensagens_dos_chamados where id = $1', [id]),
    ).toEqual([]);
  });
});
