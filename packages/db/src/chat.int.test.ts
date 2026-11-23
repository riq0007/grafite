// O chat no banco (spec chat, "Conversas", "Conversa direta", "Equipes e canais", "Mensagem",
// "Reações", "Não lidas" e "Silenciar uma conversa"; spec arquivos-e-imagens, "Anexos do chat";
// change chat-com-chamados, design, decisão 1): a conversa, com o par da direta único e o cadastro
// da equipe e do canal nas próprias colunas, que o papel da aplicação não apaga; as mensagens, só de
// inclusão, com a resposta da mesma conversa; as reações, que vão e voltam; os anexos, que nascem
// sem dono e passam à mensagem; e a leitura de cada conta. Todas isoladas pela organização.
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

const conta = async (org: string) =>
  incluir('contas', org, {
    pessoa_id: await incluir('pessoas', org, { nome: unico('Pessoa ') }),
    usuario: unico('conta.'),
    hash_senha: 'hash',
  });

const grupo = (org: string) => {
  const nome = unico('Grupo ');
  return incluir('grupos', org, { nome, nome_normalizado: nome.toLowerCase() });
};

/** As duas contas de uma conversa direta, a menor primeiro, como o banco pede. */
async function par(org: string): Promise<[string, string]> {
  const [a, b] = [await conta(org), await conta(org)];
  return a < b ? [a, b] : [b, a];
}

const direta = async (org: string, contas?: [string, string]) => {
  const [a, b] = contas ?? (await par(org));
  return incluir('conversas', org, {
    tipo: 'direta',
    conta_a: a,
    conta_b: b,
    ultima_mensagem_em: new Date(),
  });
};

const equipe = (org: string, grupoId: string, colunas: Record<string, unknown> = {}) => {
  const nome = unico('Equipe ');
  return incluir('conversas', org, {
    tipo: 'equipe',
    nome,
    nome_normalizado: nome.toLowerCase(),
    grupo_id: grupoId,
    ...colunas,
  });
};

const mensagem = (org: string, conversa: string, autor: string, colunas = {}) =>
  incluir('mensagens_do_chat', org, {
    conversa_id: conversa,
    especie: 'mensagem',
    autor_conta: autor,
    texto: 'A impressora do Financeiro está manchando.',
    ...colunas,
  });

const arquivo = (org: string) => incluir('arquivos', org, { tipo: 'image/webp', bytes: 1234 });

let autor = '';
let grupoDeA = '';
let conversaDeA = '';
let outraConversaDeA = '';
let mensagemDeA = '';
let mensagemDaOutra = '';

beforeAll(async () => {
  dono = new pg.Pool({ connectionString: inject('urlDono') });
  app = new pg.Pool({ connectionString: inject('urlApp') });
  orgA = await criarOrganizacao('Organização A do chat');
  orgB = await criarOrganizacao('Organização B do chat');
  autor = await conta(orgA);
  grupoDeA = await grupo(orgA);
  conversaDeA = await equipe(orgA, grupoDeA);
  outraConversaDeA = await direta(orgA);
  mensagemDeA = await mensagem(orgA, conversaDeA, autor);
  mensagemDaOutra = await mensagem(orgA, outraConversaDeA, autor);
});

afterAll(async () => {
  await dono?.end();
  await app?.end();
});

describe('isolamento', () => {
  it('as tabelas do chat têm o RLS ativo e forçado', async () => {
    const { rows } = await dono.query(
      `select relname as tabela, relrowsecurity as ativo, relforcerowsecurity as forcado
         from pg_class
        where relname in ('conversas', 'mensagens_do_chat', 'reacoes_das_mensagens',
                          'anexos_do_chat', 'leituras_das_conversas')
          and relkind = 'r'
        order by relname`,
    );
    expect(rows).toEqual([
      { tabela: 'anexos_do_chat', ativo: true, forcado: true },
      { tabela: 'conversas', ativo: true, forcado: true },
      { tabela: 'leituras_das_conversas', ativo: true, forcado: true },
      { tabela: 'mensagens_do_chat', ativo: true, forcado: true },
      { tabela: 'reacoes_das_mensagens', ativo: true, forcado: true },
    ]);
  });

  it('a outra organização não vê a conversa nem as mensagens, e não as referencia', async () => {
    expect(await consultar(orgB, 'select id from conversas where id = $1', [conversaDeA])).toEqual(
      [],
    );
    expect(
      await consultar(orgB, 'select id from mensagens_do_chat where conversa_id = $1', [
        conversaDeA,
      ]),
    ).toEqual([]);
    expect(await recusada(mensagem(orgB, conversaDeA, await conta(orgB)))).toBe(
      'mensagens_do_chat_conversa_fk',
    );
    // A conta de outra organização não entra na conversa direta.
    const [a] = await par(orgA);
    const deB = await conta(orgB);
    expect(await recusada(direta(orgA, a < deB ? [a, deB] : [deB, a]))).toMatch(
      /^conversas_conta_[ab]_fk$/,
    );
  });
});

describe('conversas', () => {
  it('Conversa direta: o par em ordem é único, e as colunas do cadastro ficam vazias', async () => {
    const contas = await par(orgA);
    await direta(orgA, contas);
    expect(await recusada(direta(orgA, contas))).toBe('conversas_direta_unica');
    expect(await recusada(direta(orgA, [contas[1], contas[0]]))).toBe('conversas_colunas_do_tipo');
    const [a, b] = await par(orgA);
    for (const colunas of [
      { nome: 'Fernanda e Paulo', nome_normalizado: 'fernanda e paulo' },
      { grupo_id: grupoDeA },
      { avisar: true },
      { arquivada_em: new Date() },
      { ultima_mensagem_em: null },
    ]) {
      expect(
        await recusada(
          incluir('conversas', orgA, {
            tipo: 'direta',
            conta_a: a,
            conta_b: b,
            ultima_mensagem_em: new Date(),
            ...colunas,
          }),
        ),
      ).toBe('conversas_colunas_do_tipo');
    }
  });

  it('Equipes e canais: a equipe tem o grupo, o canal não tem, e nenhum dos dois tem o par', async () => {
    const canal = (colunas: Record<string, unknown> = {}) => {
      const nome = unico('Avisos da TI ');
      return incluir('conversas', orgA, {
        tipo: 'canal',
        nome,
        nome_normalizado: nome.toLowerCase(),
        ...colunas,
      });
    };
    const [a, b] = await par(orgA);
    // O canal de avisos, em que só um grupo escreve, com o aviso a cada mensagem.
    expect(await canal({ escreve_grupo_id: grupoDeA, avisar: true })).toBeTruthy();
    expect(await recusada(canal({ grupo_id: grupoDeA }))).toBe('conversas_colunas_do_tipo');
    expect(await recusada(equipe(orgA, grupoDeA, { grupo_id: null }))).toBe(
      'conversas_colunas_do_tipo',
    );
    expect(await recusada(equipe(orgA, grupoDeA, { conta_a: a, conta_b: b }))).toBe(
      'conversas_colunas_do_tipo',
    );
    expect(await recusada(equipe(orgA, grupoDeA, { nome: null }))).toBe(
      'conversas_colunas_do_tipo',
    );
    expect(await recusada(equipe(orgA, grupoDeA, { nome: '   ' }))).toBe('conversas_nome_valido');
    expect(await recusada(equipe(orgA, grupoDeA, { nome: 'x'.repeat(61) }))).toBe(
      'conversas_nome_valido',
    );
    expect(await recusada(equipe(orgA, grupoDeA, { tipo: 'grupo' }))).toBe('conversas_tipo_valido');
    // O grupo de outra organização não serve.
    expect(await recusada(equipe(orgA, await grupo(orgB)))).toBe('conversas_grupo_fk');
  });

  it('o nome é único entre as equipes e os canais ativos, e o arquivado o libera', async () => {
    const cadastro = { nome: 'Equipe Compras', nome_normalizado: 'equipe compras' };
    const primeira = await equipe(orgA, grupoDeA, cadastro);
    expect(await recusada(incluir('conversas', orgA, { tipo: 'canal', ...cadastro }))).toBe(
      'conversas_nome_unico',
    );
    await consultar(orgA, 'update conversas set arquivada_em = now() where id = $1', [primeira]);
    expect(await equipe(orgA, grupoDeA, cadastro)).toBeTruthy();
    // Reativar a primeira com a segunda ativa esbarra no nome.
    expect(
      await recusada(
        consultar(orgA, 'update conversas set arquivada_em = null where id = $1', [primeira]),
      ),
    ).toBe('conversas_nome_unico');
  });

  it('Conversas: o papel da aplicação não apaga a conversa, e a altera', async () => {
    const id = await equipe(orgA, grupoDeA);
    expect(await recusada(consultar(orgA, 'delete from conversas where id = $1', [id]))).toMatch(
      /permission denied/,
    );
    await consultar(
      orgA,
      'update conversas set avisar = true, arquivada_em = now() where id = $1',
      [id],
    );
    const [linha] = await consultar<{ avisar: boolean; arquivada: boolean }>(
      orgA,
      'select avisar, arquivada_em is not null as arquivada from conversas where id = $1',
      [id],
    );
    expect(linha).toEqual({ avisar: true, arquivada: true });
  });
});

describe('mensagens do chat', () => {
  it('Mensagem: de 1 a 4.000 caracteres sem os espaços das pontas, ou nulo só com os anexos, sempre de uma conta', async () => {
    expect(await mensagem(orgA, conversaDeA, autor, { texto: `  ${'a'.repeat(4000)}  ` })).toEqual(
      expect.any(String),
    );
    // Só com os anexos, o texto é nulo (tarefa 4.18 do chat-com-chamados).
    expect(await mensagem(orgA, conversaDeA, autor, { texto: null })).toEqual(expect.any(String));
    for (const texto of ['   ', 'a'.repeat(4001)]) {
      expect(await recusada(mensagem(orgA, conversaDeA, autor, { texto }))).toBe(
        'mensagens_do_chat_conteudo_valido',
      );
    }
    expect(await recusada(mensagem(orgA, conversaDeA, autor, { autor_conta: null }))).toMatch(
      /autor_conta/,
    );
    expect(await recusada(mensagem(orgA, conversaDeA, autor, { evento: 'virou-chamado' }))).toBe(
      'mensagens_do_chat_conteudo_valido',
    );
    expect(await recusada(mensagem(orgA, conversaDeA, autor, { especie: 'nota' }))).toBe(
      'mensagens_do_chat_especie_valida',
    );
  });

  it('Chamados da conversa: o evento tem o código e os dados, sem texto nem resposta', async () => {
    const evento = (colunas: Record<string, unknown>) =>
      mensagem(orgA, conversaDeA, autor, {
        especie: 'evento',
        texto: null,
        evento: 'virou-chamado',
        dados: { mensagem: mensagemDeA, chamado: 1045 },
        ...colunas,
      });
    expect(await evento({})).toEqual(expect.any(String));
    expect(await recusada(evento({ evento: null }))).toBe('mensagens_do_chat_conteudo_valido');
    expect(await recusada(evento({ texto: 'transformou' }))).toBe(
      'mensagens_do_chat_conteudo_valido',
    );
    expect(await recusada(evento({ responde_a: mensagemDeA }))).toBe(
      'mensagens_do_chat_conteudo_valido',
    );
    expect(await recusada(evento({ evento: 'Virou chamado' }))).toBe(
      'mensagens_do_chat_evento_valido',
    );
    expect(await recusada(evento({ dados: JSON.stringify([1045]) }))).toBe(
      'mensagens_do_chat_dados_validos',
    );
    expect(await recusada(evento({ dados: { texto: 'x'.repeat(16384) } }))).toBe(
      'mensagens_do_chat_dados_validos',
    );
  });

  it('a resposta é a outra mensagem da mesma conversa', async () => {
    expect(await mensagem(orgA, conversaDeA, autor, { responde_a: mensagemDeA })).toEqual(
      expect.any(String),
    );
    expect(
      await recusada(mensagem(orgA, conversaDeA, autor, { responde_a: mensagemDaOutra })),
    ).toBe('mensagens_do_chat_responde_a_fk');
  });

  it('o papel da aplicação só inclui e lê as mensagens', async () => {
    expect(
      await recusada(
        consultar(orgA, "update mensagens_do_chat set texto = 'outra' where id = $1", [
          mensagemDeA,
        ]),
      ),
    ).toMatch(/permission denied/);
    expect(
      await recusada(consultar(orgA, 'delete from mensagens_do_chat where id = $1', [mensagemDeA])),
    ).toMatch(/permission denied/);
  });

  it('a conversa em ordem pelo id, que é o uuidv7 da criação', async () => {
    const conversa = await equipe(orgA, grupoDeA);
    const ids = [];
    for (const texto of ['primeira', 'segunda', 'terceira']) {
      ids.push(await mensagem(orgA, conversa, autor, { texto }));
    }
    const lidas = await consultar<{ texto: string }>(
      orgA,
      'select texto from mensagens_do_chat where conversa_id = $1 order by id',
      [conversa],
    );
    expect(lidas.map((linha) => linha.texto)).toEqual(['primeira', 'segunda', 'terceira']);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('reações', () => {
  it('Reações: um texto por conta, que vai e volta', async () => {
    const outra = await conta(orgA);
    const reagir = (contaId: string, texto: string) =>
      incluir('reacoes_das_mensagens', orgA, {
        mensagem_id: mensagemDeA,
        conta_id: contaId,
        texto,
      });
    const id = await reagir(autor, '+1');
    expect(await reagir(outra, '+1')).toEqual(expect.any(String));
    expect(await reagir(autor, 'Também manchou')).toEqual(expect.any(String));
    expect(await recusada(reagir(autor, '+1'))).toBe('reacoes_das_mensagens_unica');
    for (const texto of ['  ', 'x'.repeat(21)]) {
      expect(await recusada(reagir(autor, texto))).toBe('reacoes_das_mensagens_texto_valido');
    }
    expect(
      await recusada(
        consultar(orgA, "update reacoes_das_mensagens set texto = 'ok' where id = $1", [id]),
      ),
    ).toMatch(/permission denied/);
    // Reagir de novo apaga a linha, e depois a mesma reação volta.
    await consultar(orgA, 'delete from reacoes_das_mensagens where id = $1', [id]);
    expect(await reagir(autor, '+1')).toEqual(expect.any(String));
  });
});

describe('anexos do chat', () => {
  it('Anexos do chat: nasce sem dono e passa à mensagem, da conversa dela', async () => {
    const id = await incluir('anexos_do_chat', orgA, { arquivo_id: await arquivo(orgA) });
    await consultar(
      orgA,
      'update anexos_do_chat set conversa_id = $2, mensagem_id = $3 where id = $1',
      [id, conversaDeA, mensagemDeA],
    );
    const anexar = async (colunas: Record<string, unknown>) =>
      incluir('anexos_do_chat', orgA, { arquivo_id: await arquivo(orgA), ...colunas });
    expect(await recusada(anexar({ conversa_id: conversaDeA }))).toBe('anexos_do_chat_dono_valido');
    expect(await recusada(anexar({ conversa_id: conversaDeA, mensagem_id: mensagemDaOutra }))).toBe(
      'anexos_do_chat_mensagem_fk',
    );
    const [linha] = await consultar<{ arquivo_id: string }>(
      orgA,
      'select arquivo_id from anexos_do_chat where id = $1',
      [id],
    );
    expect(await recusada(incluir('anexos_do_chat', orgA, { arquivo_id: linha?.arquivo_id }))).toBe(
      'anexos_do_chat_arquivo_unico',
    );
    expect(
      await recusada(consultar(orgA, 'delete from anexos_do_chat where id = $1', [id])),
    ).toMatch(/permission denied/);
  });
});

describe('leituras das conversas', () => {
  it('Não lidas: uma leitura por conta e conversa, com a última lida da mesma conversa', async () => {
    const leitora = await conta(orgA);
    const id = await incluir('leituras_das_conversas', orgA, {
      conversa_id: conversaDeA,
      conta_id: leitora,
      lida_ate: mensagemDeA,
    });
    expect(
      await recusada(
        incluir('leituras_das_conversas', orgA, { conversa_id: conversaDeA, conta_id: leitora }),
      ),
    ).toBe('leituras_das_conversas_unica');
    expect(
      await recusada(
        incluir('leituras_das_conversas', orgA, {
          conversa_id: conversaDeA,
          conta_id: await conta(orgA),
          lida_ate: mensagemDaOutra,
        }),
      ),
    ).toBe('leituras_das_conversas_lida_ate_fk');
    // A leitura anda, e o silenciar não precisa de leitura.
    const seguinte = await mensagem(orgA, conversaDeA, autor);
    await consultar(orgA, 'update leituras_das_conversas set lida_ate = $2 where id = $1', [
      id,
      seguinte,
    ]);
    expect(
      await incluir('leituras_das_conversas', orgA, {
        conversa_id: outraConversaDeA,
        conta_id: leitora,
        silenciada: true,
      }),
    ).toEqual(expect.any(String));
    expect(
      await recusada(consultar(orgA, 'delete from leituras_das_conversas where id = $1', [id])),
    ).toMatch(/permission denied/);
  });
});
