import { type BuildExtraConfigColumns, sql } from 'drizzle-orm';
import type {
  AnyPgColumn,
  PgColumnBuilderBase,
  PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  doublePrecision,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Identificador não sequencial e ordenável no tempo (uuidv7 nativo do PostgreSQL 18). */
const id = () => uuid('id').primaryKey().default(sql`uuidv7()`);

/**
 * Uma camada das preferências de interface (design do F2c, decisão 2): só os campos mudados, por
 * seção, como `{ dock: { posicao: 'esquerda' } }`. Quem valida o conteúdo é o domínio
 * (`lerAjustes`); o banco só confere que é um objeto de até 8 KB.
 */
const preferencias = () =>
  jsonb('preferencias').$type<Record<string, unknown>>().notNull().default({});

const preferenciasValidas = (nome: string, coluna: AnyPgColumn) =>
  check(nome, sql`jsonb_typeof(${coluna}) = 'object' and octet_length(${coluna}::text) <= 8192`);

/**
 * Raiz de todos os dados. Cada organização só enxerga a si mesma:
 * a política usa `app.current_org()` (migration 0002). As preferências são os padrões da
 * organização, que valem para quem não mudou aquele ajuste.
 */
export const organizacoes = pgTable(
  'organizacoes',
  {
    id: id(),
    nome: text('nome').notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    preferencias: preferencias(),
    /** Os módulos opcionais que a organização desligou; um módulo novo começa ligado. */
    modulosDesligados: text('modulos_desligados').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [preferenciasValidas('organizacoes_preferencias_validas', t.preferencias)],
);

/** As colunas que toda tabela de negócio tem. */
const colunasDeNegocio = () => ({
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizacoes.id),
});

type ColunasDeNegocio<TColunas> = ReturnType<typeof colunasDeNegocio> & TColunas;

/**
 * Tabela de negócio com escopo de organização: acrescenta `id` (uuidv7) e `org_id`.
 *
 * O isolamento em si vem do banco. A migration que cria a tabela SHALL chamar
 * `select app.isolar_por_organizacao('<tabela>')`, que ativa e força o RLS e cria
 * a política. O teste-guarda (guarda.int.test.ts) reprova a tabela que ficar sem isso.
 *
 * O PostgreSQL confere chaves estrangeiras sem aplicar o RLS. Por isso a tabela tem
 * `unique (org_id, id)`, que também serve de índice por organização, e uma referência
 * de outra tabela de negócio a ela SHALL levar o `org_id` junto, nos `extras`:
 * `foreignKey({ columns: [t.orgId, t.pessoaId], foreignColumns: [pessoas.orgId, pessoas.id] })`.
 * Assim o banco recusa a referência a um registro de outra organização.
 */
export function orgScoped<
  TNome extends string,
  TColunas extends Record<string, PgColumnBuilderBase>,
>(
  nome: TNome,
  colunas: TColunas,
  extras?: (
    t: BuildExtraConfigColumns<TNome, ColunasDeNegocio<TColunas>, 'pg'>,
  ) => PgTableExtraConfigValue[],
) {
  return pgTable(nome, { ...colunasDeNegocio(), ...colunas } as ColunasDeNegocio<TColunas>, (t) => [
    unique(`${nome}_org_id_id_unico`).on(t.orgId, t.id),
    ...(extras?.(t) ?? []),
  ]);
}

/**
 * Endereços pelos quais cada organização é acessada (design do F2a, decisão 1). A API descobre a
 * organização de cada requisição pelo endereço, com `app.organizacao_do_endereco()`, a única
 * consulta que atravessa organizações (migration 0003).
 *
 * O endereço é guardado normalizado: minúsculas, sem porta, sem o ponto final e sem os colchetes
 * do IPv6. Um dois-pontos só seria uma porta; o IPv6 tem pelo menos dois.
 */
export const enderecosDeAcesso = orgScoped(
  'enderecos_de_acesso',
  {
    endereco: text('endereco').notNull().unique('enderecos_de_acesso_endereco_unico'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'enderecos_de_acesso_endereco_normalizado',
      sql`${t.endereco} ~ '^[a-z0-9:._-]+$' and ${t.endereco} !~ '^[^:]*:[^:]*$' and right(${t.endereco}, 1) <> '.'`,
    ),
  ],
);

/** Momento com fuso, como todos os do banco. */
const momento = (nome: string) => timestamp(nome, { withTimezone: true });

/** Os tipos de local, os mesmos do domínio (`TIPOS_DE_LOCAL`), conferidos aqui pelo banco. */
export const TIPOS_DE_LOCAL_NO_BANCO = [
  'unidade',
  'predio',
  'andar',
  'setor',
  'sala',
  'outro',
] as const;

const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(', '));

/**
 * A árvore de locais (spec locais; design do F2b, decisão 3): cada local guarda só o pai, e a árvore
 * inteira é lida de uma vez e resolvida pelo domínio. O nome normalizado (sem acento, em minúsculas)
 * é único entre irmãos, também na raiz, onde o pai é nulo.
 */
export const locais = orgScoped(
  'locais',
  {
    paiId: uuid('pai_id'),
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    tipo: text('tipo', { enum: TIPOS_DE_LOCAL_NO_BANCO }).notNull(),
    situacao: text('situacao', { enum: ['ativo', 'inativo'] })
      .notNull()
      .default('ativo'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'locais_pai_fk',
      columns: [t.orgId, t.paiId],
      foreignColumns: [t.orgId, t.id],
    }),
    unique('locais_nome_unico_no_lugar').on(t.orgId, t.paiId, t.nomeNormalizado).nullsNotDistinct(),
    check('locais_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check('locais_tipo_valido', sql`${t.tipo} in (${lista(TIPOS_DE_LOCAL_NO_BANCO)})`),
    check('locais_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
  ],
);

/**
 * Pessoa da organização: todo colaborador, tenha ou não conta (spec contas-de-acesso). Guarda só o
 * necessário: o nome e, se houver, o e-mail, a matrícula, o local de trabalho e o telefone. A busca
 * é o texto normalizado pela API (`textoDeBusca` do domínio). A pessoa anonimizada não guarda nenhum
 * desses dados (spec administracao-de-pessoas).
 */
export const pessoas = orgScoped(
  'pessoas',
  {
    nome: text('nome').notNull(),
    email: text('email'),
    matricula: text('matricula'),
    localId: uuid('local_id'),
    telefone: text('telefone'),
    /** A foto da pessoa, um arquivo da mesma organização (spec administracao-de-pessoas). */
    fotoId: uuid('foto_id'),
    busca: text('busca').notNull().default(''),
    situacao: text('situacao', { enum: ['ativa', 'inativa', 'anonimizada'] })
      .notNull()
      .default('ativa'),
    anonimizadaEm: momento('anonimizada_em'),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'pessoas_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'pessoas_foto_fk',
      columns: [t.orgId, t.fotoId],
      foreignColumns: [arquivos.orgId, arquivos.id],
    }),
    unique('pessoas_matricula_unica').on(t.orgId, t.matricula),
    index('pessoas_nome_idx').on(t.orgId, t.nome, t.id),
    index('pessoas_local_idx').on(t.orgId, t.localId),
    check('pessoas_nome_preenchido', sql`length(trim(${t.nome})) > 0`),
    check('pessoas_situacao_valida', sql`${t.situacao} in ('ativa', 'inativa', 'anonimizada')`),
    check('pessoas_matricula_curta', sql`length(${t.matricula}) <= 32`),
    check('pessoas_telefone_curto', sql`length(${t.telefone}) <= 32`),
    check(
      'pessoas_anonimizada_sem_dados',
      sql`(${t.situacao} = 'anonimizada') = (${t.anonimizadaEm} is not null)
        and (${t.situacao} <> 'anonimizada' or (${t.email} is null and ${t.matricula} is null
          and ${t.localId} is null and ${t.telefone} is null and ${t.fotoId} is null))`,
    ),
  ],
);

/**
 * O prazo da confiança nos aparelhos, de 0 a 90 dias, o mesmo do domínio (`PRAZO_DA_CONFIANCA`):
 * nulo onde a coluna aceita seguir o nível de cima (change aparelho-confiavel, design, decisão 4).
 */
const diasDeConfiancaValidos = (coluna: unknown) =>
  sql`${coluna} is null or ${coluna} between 0 and 90`;

/**
 * Conta de acesso de uma pessoa: no máximo uma por pessoa, com o usuário único na organização e
 * guardado normalizado (minúsculas, de 3 a 64 caracteres, começando por letra ou número). A senha
 * nasce temporária, e só o hash dela fica aqui. A conta anonimizada fica sem usuário, que volta a
 * ficar livre, e sem senha (spec administracao-de-pessoas). O prazo da confiança nos aparelhos é o
 * da própria conta, ou nulo para seguir os perfis e a organização (change aparelho-confiavel).
 */
export const contas = orgScoped(
  'contas',
  {
    pessoaId: uuid('pessoa_id').notNull(),
    usuario: text('usuario'),
    hashSenha: text('hash_senha'),
    senhaTemporaria: boolean('senha_temporaria').notNull().default(true),
    exigeDoisPassos: boolean('exige_dois_passos').notNull().default(false),
    situacao: text('situacao', { enum: ['ativa', 'inativa', 'anonimizada'] })
      .notNull()
      .default('ativa'),
    /**
     * De onde vem a credencial (change integracao-ad-ldap): a conta local entra com a senha do
     * Grafite; a do diretório, só pelo AD.
     */
    origem: text('origem', { enum: ['local', 'diretorio'] })
      .notNull()
      .default('local'),
    senhaTrocadaEm: momento('senha_trocada_em'),
    ultimaEntradaEm: momento('ultima_entrada_em'),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
    /** As escolhas da conta, por cima dos padrões da organização. */
    preferencias: preferencias(),
    diasDeConfianca: integer('dias_de_confianca'),
  },
  (t) => [
    preferenciasValidas('contas_preferencias_validas', t.preferencias),
    check('contas_dias_de_confianca_valido', diasDeConfiancaValidos(t.diasDeConfianca)),
    foreignKey({
      name: 'contas_pessoa_fk',
      columns: [t.orgId, t.pessoaId],
      foreignColumns: [pessoas.orgId, pessoas.id],
    }),
    unique('contas_pessoa_unica').on(t.pessoaId),
    unique('contas_usuario_unico').on(t.orgId, t.usuario),
    check('contas_usuario_normalizado', sql`${t.usuario} ~ '^[a-z0-9][a-z0-9._-]{2,63}$'`),
    check('contas_situacao_valida', sql`${t.situacao} in ('ativa', 'inativa', 'anonimizada')`),
    check('contas_origem_valida', sql`${t.origem} in ('local', 'diretorio')`),
    check(
      'contas_anonimizada_sem_credenciais',
      sql`(${t.situacao} = 'anonimizada') = (${t.usuario} is null)
        and (${t.situacao} = 'anonimizada') = (${t.hashSenha} is null)`,
    ),
  ],
);

/**
 * A chave composta da conta, com o tipo escrito: a pessoa aponta para o arquivo da foto, o arquivo
 * para a conta que o enviou e a conta para a pessoa, e sem o tipo o TypeScript não infere o ciclo.
 */
function chaveDaConta(): [AnyPgColumn, AnyPgColumn] {
  return [contas.orgId, contas.id];
}

/**
 * Arquivo de uma organização (spec arquivos-e-imagens; design do F2c, decisão 6). O conteúdo fica no
 * armazenamento, pela chave `<org_id>/<id>/<variante>`, e o registro guarda o tipo e o tamanho da
 * variante completa, as dimensões, quando é imagem, e as variantes gravadas. O nome original fica só
 * nos arquivos dos campos (design do P1d, decisão 5), e não na foto nem nas imagens. O arquivo
 * trocado ou removido ganha `removido_em` e deixa de ser entregue; a manutenção diária apaga o
 * conteúdo e marca `apagado_em`, e o registro fica, sem o conteúdo.
 */
export const arquivos = orgScoped(
  'arquivos',
  {
    nome: text('nome'),
    tipo: text('tipo').notNull(),
    bytes: integer('bytes').notNull(),
    largura: integer('largura'),
    altura: integer('altura'),
    variantes: text('variantes').array().notNull().default(sql`'{}'::text[]`),
    enviadoPor: uuid('enviado_por'),
    enviadoEm: momento('enviado_em').notNull().defaultNow(),
    removidoEm: momento('removido_em'),
    apagadoEm: momento('apagado_em'),
  },
  (t) => [
    foreignKey({
      name: 'arquivos_enviado_por_fk',
      columns: [t.orgId, t.enviadoPor],
      foreignColumns: chaveDaConta(),
    }),
    index('arquivos_para_apagar_idx')
      .on(t.orgId, t.removidoEm)
      .where(sql`${t.removidoEm} is not null and ${t.apagadoEm} is null`),
    check('arquivos_nome_valido', sql`${t.nome} is null or length(${t.nome}) between 1 and 200`),
    check('arquivos_tipo_valido', sql`length(${t.tipo}) between 1 and 100`),
    check('arquivos_bytes_validos', sql`${t.bytes} >= 0`),
    check(
      'arquivos_dimensoes_validas',
      sql`(${t.largura} is null) = (${t.altura} is null)
        and (${t.largura} is null or (${t.largura} > 0 and ${t.altura} > 0))`,
    ),
    check(
      'arquivos_apagado_depois_de_removido',
      sql`${t.apagadoEm} is null or ${t.removidoEm} is not null`,
    ),
  ],
);

/** Bytes crus (hash e segredo cifrado), lidos e gravados como Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/** Por que uma sessão terminou (design do F2a, decisão 6). A expiração não é um fim gravado. */
export const MOTIVOS_DO_FIM_DA_SESSAO = [
  'saida',
  'encerrada-pelo-usuario',
  'outras-encerradas',
  'senha-trocada',
  'dois-passos-ativados',
  'redefinicao',
  'tentativas-esgotadas',
  'conta-inativada',
  'encerrada-pela-administracao',
  'dois-passos-removidos',
] as const;

/**
 * Sessão de uma conta (spec entrada-e-sessoes). O token fica só em hash. Enquanto `ativada_em` é
 * nula, a sessão está pendente; a pendência da vez é derivada da conta e da própria sessão.
 */
export const sessoes = orgScoped(
  'sessoes',
  {
    contaId: uuid('conta_id').notNull(),
    tokenHash: bytea('token_hash').notNull().unique('sessoes_token_hash_unico'),
    tokenCsrf: text('token_csrf').notNull(),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    ultimoUsoEm: momento('ultimo_uso_em').notNull().defaultNow(),
    expiraEm: momento('expira_em').notNull(),
    ativadaEm: momento('ativada_em'),
    segundoPassoEm: momento('segundo_passo_em'),
    tentativasDeCodigo: integer('tentativas_de_codigo').notNull().default(0),
    encerradaEm: momento('encerrada_em'),
    motivoDoFim: text('motivo_do_fim', { enum: MOTIVOS_DO_FIM_DA_SESSAO }),
    ip: inet('ip'),
    agente: text('agente'),
    /** Até quando o código do app liberou revelar e copiar os segredos nesta sessão (P6). */
    cofreLiberadoAte: momento('cofre_liberado_ate'),
    /**
     * O aparelho confiável pelo qual a sessão entrou, ou que ela marcou (change aparelho-confiavel,
     * design, decisão 1): o cookie do aparelho não vai às rotas da conta, e é por aqui que a lista
     * diz qual é o deste navegador. Sem chave estrangeira: o aparelho esquecido só deixa de casar.
     */
    aparelhoId: uuid('aparelho_id'),
  },
  (t) => [
    foreignKey({
      name: 'sessoes_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('sessoes_conta_idx').on(t.orgId, t.contaId),
    check(
      'sessoes_fim_com_motivo',
      sql`(${t.encerradaEm} is null) = (${t.motivoDoFim} is null) and (${t.motivoDoFim} is null or ${t.motivoDoFim} in (${lista(MOTIVOS_DO_FIM_DA_SESSAO)}))`,
    ),
    check('sessoes_tentativas_de_codigo', sql`${t.tentativasDeCodigo} >= 0`),
    check('sessoes_agente_curto', sql`length(${t.agente}) <= 512`),
  ],
);

/**
 * Os aparelhos confiáveis (spec verificacao-em-dois-passos, "Aparelho confiável"; change
 * aparelho-confiavel, design, decisão 1): o navegador em que a conta marcou "Confiar neste
 * aparelho", que dispensa o código do app nas entradas seguintes, dentro do prazo. Só o hash do
 * token fica aqui, como o da sessão; o token só existe no cookie. O prazo conta de `criado_em`, e
 * `usado_em` só ordena quem sai quando a conta passa de 10 aparelhos.
 */
export const aparelhosConfiaveis = orgScoped(
  'aparelhos_confiaveis',
  {
    contaId: uuid('conta_id').notNull(),
    tokenHash: bytea('token_hash').notNull().unique('aparelhos_confiaveis_token_hash_unico'),
    /** O dispositivo, como "Chrome no Windows". */
    dispositivo: text('dispositivo').notNull(),
    ip: inet('ip'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    usadoEm: momento('usado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'aparelhos_confiaveis_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('aparelhos_confiaveis_conta_idx').on(t.orgId, t.contaId),
    check(
      'aparelhos_confiaveis_dispositivo_valido',
      sql`length(trim(${t.dispositivo})) between 1 and 80`,
    ),
  ],
);

/**
 * A política de entrada da organização (spec verificacao-em-dois-passos, "Prazo da confiança";
 * change aparelho-confiavel, design, decisão 4): uma linha por organização, com o prazo da
 * confiança nos aparelhos. Sem a linha, valem os 30 dias de fábrica.
 */
export const politicaDeEntrada = orgScoped(
  'politica_de_entrada',
  {
    diasDeConfianca: integer('dias_de_confianca').notNull().default(30),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
  },
  (t) => [
    unique('politica_de_entrada_uma_por_organizacao').on(t.orgId),
    check(
      'politica_de_entrada_dias_de_confianca_valido',
      diasDeConfiancaValidos(t.diasDeConfianca),
    ),
  ],
);

/**
 * Recusas seguidas de entrada por usuário digitado, exista ou não a conta (design do F2a,
 * decisão 5): o bloqueio não revela quem existe.
 */
export const tentativasDeEntrada = orgScoped(
  'tentativas_de_entrada',
  {
    usuario: text('usuario').notNull(),
    falhasSeguidas: integer('falhas_seguidas').notNull().default(0),
    bloqueadaAte: momento('bloqueada_ate'),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
  },
  (t) => [
    unique('tentativas_de_entrada_usuario_unico').on(t.orgId, t.usuario),
    check('tentativas_de_entrada_usuario', sql`length(${t.usuario}) between 1 and 64`),
    check('tentativas_de_entrada_falhas', sql`${t.falhasSeguidas} >= 0`),
  ],
);

/**
 * Verificação em dois passos de uma conta (spec verificacao-em-dois-passos): a chave do app
 * cifrada, nula a ativação enquanto o cadastro não termina, e o último passo aceito, que não
 * volta a valer.
 */
export const doisPassos = orgScoped(
  'dois_passos',
  {
    contaId: uuid('conta_id').notNull(),
    segredoCifrado: bytea('segredo_cifrado').notNull(),
    ativadoEm: momento('ativado_em'),
    ultimoPasso: bigint('ultimo_passo', { mode: 'number' }),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'dois_passos_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('dois_passos_conta_unica').on(t.contaId),
  ],
);

/** Códigos de recuperação de uma conta, só em hash, cada um de uso único. */
export const codigosDeRecuperacao = orgScoped(
  'codigos_de_recuperacao',
  {
    contaId: uuid('conta_id').notNull(),
    hash: bytea('hash').notNull(),
    usadoEm: momento('usado_em'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'codigos_de_recuperacao_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('codigos_de_recuperacao_hash_unico').on(t.contaId, t.hash),
  ],
);

const situacaoDoCadastro = () =>
  text('situacao', { enum: ['ativo', 'inativo'] })
    .notNull()
    .default('ativo');

/**
 * Perfil: um conjunto de permissões do catálogo do domínio (spec perfis-e-grupos; design do F2b,
 * decisão 4). As permissões ficam numa coluna, e cada mudança vira um "antes → depois" na auditoria.
 * Só o perfil protegido (o Administrador) tem todas as permissões, inclusive as que vierem depois.
 */
export const perfis = orgScoped(
  'perfis',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    descricao: text('descricao'),
    permissoes: text('permissoes').array().notNull().default(sql`'{}'::text[]`),
    todasAsPermissoes: boolean('todas_as_permissoes').notNull().default(false),
    protegido: boolean('protegido').notNull().default(false),
    exigeDoisPassos: boolean('exige_dois_passos').notNull().default(false),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
    /** O prazo da confiança nos aparelhos do perfil, ou nulo para seguir a organização. */
    diasDeConfianca: integer('dias_de_confianca'),
  },
  (t) => [
    unique('perfis_nome_unico').on(t.orgId, t.nomeNormalizado),
    check('perfis_dias_de_confianca_valido', diasDeConfiancaValidos(t.diasDeConfianca)),
    check('perfis_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check('perfis_descricao_curta', sql`length(${t.descricao}) <= 500`),
    check('perfis_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
    check('perfis_todas_so_no_protegido', sql`not ${t.todasAsPermissoes} or ${t.protegido}`),
  ],
);

/** Grupo: um conjunto de contas, que recebe perfis como uma conta recebe. */
export const grupos = orgScoped(
  'grupos',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    descricao: text('descricao'),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('grupos_nome_unico').on(t.orgId, t.nomeNormalizado),
    check('grupos_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check('grupos_descricao_curta', sql`length(${t.descricao}) <= 500`),
    check('grupos_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
  ],
);

/** Participação de uma conta num grupo. Sair do grupo encerra a participação, sem apagar. */
export const membrosDoGrupo = orgScoped(
  'membros_do_grupo',
  {
    grupoId: uuid('grupo_id').notNull(),
    contaId: uuid('conta_id').notNull(),
    incluidaEm: momento('incluida_em').notNull().defaultNow(),
    encerradaEm: momento('encerrada_em'),
  },
  (t) => [
    foreignKey({
      name: 'membros_do_grupo_grupo_fk',
      columns: [t.orgId, t.grupoId],
      foreignColumns: [grupos.orgId, grupos.id],
    }),
    foreignKey({
      name: 'membros_do_grupo_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    uniqueIndex('membros_do_grupo_em_vigor')
      .on(t.orgId, t.grupoId, t.contaId)
      .where(sql`${t.encerradaEm} is null`),
    index('membros_do_grupo_conta_idx').on(t.orgId, t.contaId),
  ],
);

/**
 * Atribuição de um perfil a uma conta ou a um grupo, com o escopo: a organização inteira (local
 * nulo) ou o ramo de um local. Encerrar grava o fim, sem apagar. A atribuição em vigor é única pelo
 * índice `atribuicoes_em_vigor`, criado à mão na migration 0009 com `nulls not distinct`, que o
 * Drizzle ainda não declara em índices.
 */
export const atribuicoes = orgScoped(
  'atribuicoes',
  {
    perfilId: uuid('perfil_id').notNull(),
    contaId: uuid('conta_id'),
    grupoId: uuid('grupo_id'),
    localId: uuid('local_id'),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    encerradaEm: momento('encerrada_em'),
  },
  (t) => [
    foreignKey({
      name: 'atribuicoes_perfil_fk',
      columns: [t.orgId, t.perfilId],
      foreignColumns: [perfis.orgId, perfis.id],
    }),
    foreignKey({
      name: 'atribuicoes_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'atribuicoes_grupo_fk',
      columns: [t.orgId, t.grupoId],
      foreignColumns: [grupos.orgId, grupos.id],
    }),
    foreignKey({
      name: 'atribuicoes_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    index('atribuicoes_conta_idx').on(t.orgId, t.contaId),
    index('atribuicoes_grupo_idx').on(t.orgId, t.grupoId),
    index('atribuicoes_perfil_idx').on(t.orgId, t.perfilId),
    check('atribuicoes_conta_ou_grupo', sql`(${t.contaId} is null) <> (${t.grupoId} is null)`),
  ],
);

/** Quem fez uma ação auditada: uma conta, o comando no servidor ou alguém sem sessão. */
export const ATORES_DA_AUDITORIA = ['conta', 'sistema', 'anonimo'] as const;

/**
 * Registro único das ações (spec auditoria), gravado na mesma transação do dado. O papel da
 * aplicação só inclui e lê (migration 0006). A ação é "assunto.verbo", como `sessao.encerrada`.
 */
export const auditoria = orgScoped(
  'auditoria',
  {
    momento: momento('momento').notNull().defaultNow(),
    acao: text('acao').notNull(),
    atorTipo: text('ator_tipo', { enum: ATORES_DA_AUDITORIA }).notNull(),
    atorContaId: uuid('ator_conta_id'),
    atorDescricao: text('ator_descricao'),
    alvoTipo: text('alvo_tipo').notNull(),
    alvoId: uuid('alvo_id'),
    antes: jsonb('antes'),
    depois: jsonb('depois'),
    dados: jsonb('dados'),
    ip: inet('ip'),
    codigoDeRastreio: text('codigo_de_rastreio'),
  },
  (t) => [
    foreignKey({
      name: 'auditoria_ator_conta_fk',
      columns: [t.orgId, t.atorContaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('auditoria_momento_idx').on(t.orgId, t.momento.desc()),
    index('auditoria_alvo_idx').on(t.orgId, t.alvoTipo, t.alvoId, t.momento.desc()),
    index('auditoria_ator_idx').on(t.orgId, t.atorContaId, t.momento.desc()),
    check(
      'auditoria_ator_valido',
      sql`(${t.atorTipo} = 'conta' and ${t.atorContaId} is not null and ${t.atorDescricao} is null)
        or (${t.atorTipo} = 'sistema' and ${t.atorContaId} is null and ${t.atorDescricao} is not null)
        or (${t.atorTipo} = 'anonimo' and ${t.atorContaId} is null and ${t.atorDescricao} is null)`,
    ),
    check('auditoria_acao_valida', sql`${t.acao} ~ '^[a-z-]+[.][a-z-]+$'`),
    check('auditoria_alvo_valido', sql`${t.alvoTipo} ~ '^[a-z-]+$'`),
  ],
);

/**
 * Evento de saída (spec eventos-em-tempo-real; design do F2c, decisões 9 e 10): gravado na mesma
 * transação da mudança, com o tipo, o alvo e quem pode recebê-lo, e avisado pelo banco depois do
 * commit (gatilho `eventos_avisar`, migration 0013). Leva só identificadores, nunca dados pessoais.
 * Fica 24 h, para a retomada da conexão de eventos, e a manutenção diária apaga os mais antigos.
 */
export const eventos = orgScoped(
  'eventos',
  {
    momento: momento('momento').notNull().defaultNow(),
    tipo: text('tipo').notNull(),
    alvoTipo: text('alvo_tipo'),
    alvoId: uuid('alvo_id'),
    /** Toda sessão da organização. */
    todas: boolean('todas').notNull().default(false),
    /** Quem tem a permissão, em algum escopo, ou no ramo de um dos locais. */
    permissao: text('permissao'),
    /** Os locais dos registros, com `null` para o registro sem local. */
    locais: uuid('locais').array(),
    contas: uuid('contas').array(),
    sessoes: uuid('sessoes').array(),
  },
  (t) => [
    index('eventos_momento_idx').on(t.orgId, t.momento),
    check('eventos_tipo_valido', sql`${t.tipo} ~ '^[a-z-]+[.][a-z-]+$'`),
    check(
      'eventos_publico_valido',
      sql`(${t.todas} or ${t.permissao} is not null or ${t.contas} is not null
          or ${t.sessoes} is not null)
        and (${t.locais} is null or ${t.permissao} is not null)`,
    ),
    check(
      'eventos_publico_curto',
      sql`coalesce(cardinality(${t.locais}), 0) <= 8
        and coalesce(cardinality(${t.contas}), 0) <= 20
        and coalesce(cardinality(${t.sessoes}), 0) <= 20`,
    ),
  ],
);

/**
 * Tarefa de uma organização que continuou falhando depois das tentativas (spec fila-de-tarefas;
 * design do F2c, decisão 15). Guarda o nome técnico da tarefa, os dados dela (só identificadores),
 * as tentativas e a mensagem do último erro, sem a pilha. "Tentar de novo" põe a tarefa de volta na
 * fila e tira a linha; a auditoria guarda a repetição.
 */
export const tarefasComFalha = orgScoped(
  'tarefas_com_falha',
  {
    tarefa: text('tarefa').notNull(),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    tentativas: integer('tentativas').notNull(),
    erro: text('erro').notNull(),
    falhouEm: momento('falhou_em').notNull().defaultNow(),
  },
  (t) => [
    index('tarefas_com_falha_lista_idx').on(t.orgId, t.falhouEm.desc(), t.id.desc()),
    check('tarefas_com_falha_tarefa_valida', sql`${t.tarefa} ~ '^[a-z][a-z-]{0,99}$'`),
    check(
      'tarefas_com_falha_dados_validos',
      sql`jsonb_typeof(${t.dados}) = 'object' and octet_length(${t.dados}::text) <= 2048`,
    ),
    check('tarefas_com_falha_tentativas', sql`${t.tentativas} >= 1`),
    check('tarefas_com_falha_erro_curto', sql`length(${t.erro}) between 1 and 500`),
  ],
);

/** Os ícones genéricos de um tipo de ativo, os mesmos do domínio (`ICONES_DE_TIPO`). */
export const ICONES_DE_TIPO_NO_BANCO = [
  'impressora',
  'computador',
  'notebook',
  'monitor',
  'switch',
  'rack',
  'controle-de-acesso',
  'camera',
  'storage',
  'nobreak',
  'generico',
] as const;

/** Os tipos de campo, os mesmos do domínio (`TIPOS_DE_CAMPO`). */
export const TIPOS_DE_CAMPO_NO_BANCO = [
  'texto',
  'texto-longo',
  'inteiro',
  'decimal',
  'moeda',
  'data',
  'lista',
  'lista-multipla',
  'pessoa',
  'local',
  'ativo',
  'fornecedor',
  'licenca',
  'url',
  'ip',
  'mac',
  'arquivo',
  'imagem',
] as const;

/**
 * O tipo de ativo (spec catalogo-de-ativos; design do P1a, decisão 1): um cadastro da organização,
 * com um dos ícones genéricos e as chaves das capacidades que liga, que só existem no código. O
 * nome é único pela forma normalizada. A configuração das capacidades guarda o que cada uma pede ao
 * ser ligada, como o campo de IP da disponibilidade na rede (design do P2a, decisão 10); quem
 * confere o conteúdo é o domínio, e o banco só confere que é um objeto.
 */
export const tiposDeAtivo = orgScoped(
  'tipos_de_ativo',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    icone: text('icone', { enum: ICONES_DE_TIPO_NO_BANCO }).notNull(),
    capacidades: text('capacidades').array().notNull().default(sql`'{}'::text[]`),
    configuracaoDasCapacidades: jsonb('configuracao_das_capacidades')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /**
     * O cartão em que a ficha dos ativos do tipo abre: a Visão geral ou a chave de uma capacidade,
     * nulo no automático (change primeiro-cartao-da-ficha). Quem confere o valor é o domínio.
     */
    primeiroCartao: text('primeiro_cartao'),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('tipos_de_ativo_nome_unico').on(t.orgId, t.nomeNormalizado),
    check(
      'tipos_de_ativo_primeiro_cartao_valido',
      sql`${t.primeiroCartao} is null or length(${t.primeiroCartao}) between 1 and 60`,
    ),
    check('tipos_de_ativo_nome_valido', sql`length(trim(${t.nome})) between 1 and 60`),
    check('tipos_de_ativo_icone_valido', sql`${t.icone} in (${lista(ICONES_DE_TIPO_NO_BANCO)})`),
    check('tipos_de_ativo_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
    check(
      'tipos_de_ativo_configuracao_das_capacidades_valida',
      sql`jsonb_typeof(${t.configuracaoDasCapacidades}) = 'object'`,
    ),
  ],
);

/**
 * O campo da organização, que cada tipo escolhe usar. O tipo do campo não muda depois de criado; a
 * configuração (limites, casas e opções) é conferida pelo domínio, e o banco só confere que é um
 * objeto de até 32 KB.
 */
export const campos = orgScoped(
  'campos',
  {
    rotulo: text('rotulo').notNull(),
    rotuloNormalizado: text('rotulo_normalizado').notNull(),
    tipo: text('tipo', { enum: TIPOS_DE_CAMPO_NO_BANCO }).notNull(),
    grupo: text('grupo'),
    configuracao: jsonb('configuracao').$type<Record<string, unknown>>().notNull().default({}),
    restrito: boolean('restrito').notNull().default(false),
    escrita: text('escrita', { enum: ['manual', 'automatica'] })
      .notNull()
      .default('automatica'),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('campos_rotulo_unico').on(t.orgId, t.rotuloNormalizado),
    check('campos_rotulo_valido', sql`length(trim(${t.rotulo})) between 1 and 60`),
    check('campos_tipo_valido', sql`${t.tipo} in (${lista(TIPOS_DE_CAMPO_NO_BANCO)})`),
    check(
      'campos_grupo_valido',
      sql`${t.grupo} is null or length(trim(${t.grupo})) between 1 and 40`,
    ),
    check(
      'campos_configuracao_valida',
      sql`jsonb_typeof(${t.configuracao}) = 'object' and octet_length(${t.configuracao}::text) <= 32768`,
    ),
    check('campos_escrita_valida', sql`${t.escrita} in ('manual', 'automatica')`),
    check('campos_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
  ],
);

/**
 * Os campos que um tipo usa, em ordem, com os obrigatórios. É configuração: mudar a lista reescreve
 * as linhas do tipo, e a auditoria guarda a lista antes e depois. Os valores dos ativos ficam no
 * ativo, pelo id do campo, e não dependem destas linhas.
 */
export const camposDoTipo = orgScoped(
  'campos_do_tipo',
  {
    tipoId: uuid('tipo_id').notNull(),
    campoId: uuid('campo_id').notNull(),
    ordem: integer('ordem').notNull(),
    obrigatorio: boolean('obrigatorio').notNull().default(false),
  },
  (t) => [
    foreignKey({
      name: 'campos_do_tipo_tipo_fk',
      columns: [t.orgId, t.tipoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    foreignKey({
      name: 'campos_do_tipo_campo_fk',
      columns: [t.orgId, t.campoId],
      foreignColumns: [campos.orgId, campos.id],
    }),
    unique('campos_do_tipo_uma_vez').on(t.orgId, t.tipoId, t.campoId),
    index('campos_do_tipo_campo_idx').on(t.orgId, t.campoId),
    check('campos_do_tipo_ordem_valida', sql`${t.ordem} >= 0`),
  ],
);

/**
 * O modelo de equipamento, de um tipo que não muda depois de criado. O fabricante e o nome são
 * únicos juntos dentro do tipo, pela forma normalizada, e a busca é o texto normalizado dos dois. A
 * imagem fica nos arquivos, como a foto da pessoa.
 */
export const modelos = orgScoped(
  'modelos',
  {
    tipoId: uuid('tipo_id').notNull(),
    fabricante: text('fabricante').notNull(),
    fabricanteNormalizado: text('fabricante_normalizado').notNull(),
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    imagemId: uuid('imagem_id'),
    busca: text('busca').notNull(),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'modelos_tipo_fk',
      columns: [t.orgId, t.tipoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    foreignKey({
      name: 'modelos_imagem_fk',
      columns: [t.orgId, t.imagemId],
      foreignColumns: [arquivos.orgId, arquivos.id],
    }),
    // O ativo aponta o modelo junto com o tipo dele: o banco garante que são do mesmo tipo.
    unique('modelos_id_tipo_unico').on(t.orgId, t.id, t.tipoId),
    unique('modelos_unico_no_tipo').on(
      t.orgId,
      t.tipoId,
      t.fabricanteNormalizado,
      t.nomeNormalizado,
    ),
    index('modelos_fabricante_idx').on(t.orgId, t.fabricanteNormalizado),
    check('modelos_fabricante_valido', sql`length(trim(${t.fabricante})) between 1 and 60`),
    check('modelos_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check('modelos_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
  ],
);

/** As situações de uso de um ativo ativo, como no domínio (`USOS_DO_ATIVO`). */
export const USOS_NO_BANCO = ['em-uso', 'em-estoque', 'em-manutencao'] as const;

/**
 * O ativo (spec cadastro-de-ativos; design do P1b, decisão 1). Os campos comuns que o banco garante
 * ou filtra ficam em colunas: o nome, o patrimônio (único pela forma normalizada), a série, o
 * hostname, a situação de uso, o local e o responsável. Os outros campos ficam em `valores`, pela
 * chave, e o estado de todos (a origem, o momento, o autor e a trava), em `estado`. O modelo é
 * apontado junto com o tipo, e o banco garante que é do tipo do ativo. A busca é o texto
 * normalizado dos campos de identificação e dos valores que não são restritos. A imagem própria do
 * ativo fica nos arquivos, como a do modelo, e o índice GIN dos valores atende o lado de lá dos
 * campos do tipo ativo, que procura os ativos com `valores @> {campo: id}` (design do P1d).
 */
export const ativos = orgScoped(
  'ativos',
  {
    tipoId: uuid('tipo_id').notNull(),
    modeloId: uuid('modelo_id'),
    imagemId: uuid('imagem_id'),
    nome: text('nome'),
    patrimonio: text('patrimonio'),
    patrimonioNormalizado: text('patrimonio_normalizado'),
    serie: text('serie'),
    hostname: text('hostname'),
    uso: text('uso', { enum: USOS_NO_BANCO }).notNull().default('em-uso'),
    localId: uuid('local_id'),
    responsavelId: uuid('responsavel_id'),
    valores: jsonb('valores').$type<Record<string, unknown>>().notNull().default({}),
    estado: jsonb('estado').$type<Record<string, unknown>>().notNull().default({}),
    busca: text('busca').notNull(),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'ativos_tipo_fk',
      columns: [t.orgId, t.tipoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    foreignKey({
      name: 'ativos_modelo_fk',
      columns: [t.orgId, t.modeloId, t.tipoId],
      foreignColumns: [modelos.orgId, modelos.id, modelos.tipoId],
    }),
    foreignKey({
      name: 'ativos_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'ativos_responsavel_fk',
      columns: [t.orgId, t.responsavelId],
      foreignColumns: [pessoas.orgId, pessoas.id],
    }),
    foreignKey({
      name: 'ativos_imagem_fk',
      columns: [t.orgId, t.imagemId],
      foreignColumns: [arquivos.orgId, arquivos.id],
    }),
    // Os nulos não se repetem num unique: vários ativos ficam sem patrimônio.
    unique('ativos_patrimonio_unico').on(t.orgId, t.patrimonioNormalizado),
    index('ativos_local_idx').on(t.orgId, t.localId),
    index('ativos_tipo_idx').on(t.orgId, t.tipoId),
    index('ativos_situacao_idx').on(t.orgId, t.situacao, t.uso),
    index('ativos_valores_idx').using('gin', t.valores.op('jsonb_path_ops')),
    check('ativos_uso_valido', sql`${t.uso} in (${lista(USOS_NO_BANCO)})`),
    check('ativos_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
    check(
      'ativos_valores_validos',
      sql`jsonb_typeof(${t.valores}) = 'object' and octet_length(${t.valores}::text) <= 262144`,
    ),
    check(
      'ativos_estado_valido',
      sql`jsonb_typeof(${t.estado}) = 'object' and octet_length(${t.estado}::text) <= 262144`,
    ),
  ],
);

/**
 * A ligação livre entre dois ativos, o "Ligado a" (spec ligacoes-de-ativos; design do P1d, decisão
 * 3). Ela não tem tipo nem sentido: o par vai sempre em ordem, `ativo_a < ativo_b`, para a mesma
 * ligação não entrar duas vezes, de lados diferentes. Desfazer apaga a linha, e o histórico fica na
 * auditoria dos dois ativos. A unicidade do par atende a busca pelo `ativo_a`, e o índice, a busca
 * pelo `ativo_b`.
 */
export const ligacoesDeAtivos = orgScoped(
  'ligacoes_de_ativos',
  {
    ativoA: uuid('ativo_a').notNull(),
    ativoB: uuid('ativo_b').notNull(),
    criadoPor: uuid('criado_por'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'ligacoes_de_ativos_ativo_a_fk',
      columns: [t.orgId, t.ativoA],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'ligacoes_de_ativos_ativo_b_fk',
      columns: [t.orgId, t.ativoB],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'ligacoes_de_ativos_criado_por_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('ligacoes_de_ativos_par_unico').on(t.orgId, t.ativoA, t.ativoB),
    index('ligacoes_de_ativos_ativo_b_idx').on(t.orgId, t.ativoB),
    check('ligacoes_de_ativos_par_em_ordem', sql`${t.ativoA} < ${t.ativoB}`),
  ],
);

/** As tabelas que oferecem visões, como no domínio (`TABELAS_COM_VISOES`). */
export const TABELAS_COM_VISOES_NO_BANCO = ['ativos'] as const;

/**
 * As visões de tabela (spec visoes-de-tabela; design do P1c, decisão 5): a da organização fica sem
 * conta, e a de uma conta, com ela. O nome é único entre as da organização e, à parte, entre as de
 * cada conta, na mesma tabela. A definição (as colunas, a ordenação e os filtros) é conferida pelo
 * domínio; o banco garante que ela é um objeto de até 32 KB. A visão é configuração, e não registro
 * de negócio: a remoção apaga a linha.
 */
export const visoes = orgScoped(
  'visoes',
  {
    tabela: text('tabela', { enum: TABELAS_COM_VISOES_NO_BANCO }).notNull(),
    contaId: uuid('conta_id'),
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    definicao: jsonb('definicao').$type<Record<string, unknown>>().notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'visoes_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    uniqueIndex('visoes_nome_da_organizacao_unico')
      .on(t.orgId, t.tabela, t.nomeNormalizado)
      .where(sql`${t.contaId} is null`),
    uniqueIndex('visoes_nome_da_conta_unico')
      .on(t.orgId, t.tabela, t.contaId, t.nomeNormalizado)
      .where(sql`${t.contaId} is not null`),
    index('visoes_da_conta_idx').on(t.orgId, t.tabela, t.contaId),
    check('visoes_tabela_valida', sql`${t.tabela} in (${lista(TABELAS_COM_VISOES_NO_BANCO)})`),
    check(
      'visoes_definicao_valida',
      sql`jsonb_typeof(${t.definicao}) = 'object' and octet_length(${t.definicao}::text) <= 32768`,
    ),
  ],
);

/**
 * As mudanças de uma conta sobre uma visão da organização ou a de fábrica (change visoes-da-conta,
 * design, decisão 1): a definição inteira, com a forma e o tamanho de uma visão, uma linha por
 * conta, tabela e visão; a de fábrica fica sem a visão. Remover a visão apaga as mudanças de todos
 * sobre ela. As mudanças não vão à auditoria.
 */
export const mudancasDasVisoes = orgScoped(
  'mudancas_das_visoes',
  {
    contaId: uuid('conta_id').notNull(),
    tabela: text('tabela', { enum: TABELAS_COM_VISOES_NO_BANCO }).notNull(),
    visaoId: uuid('visao_id'),
    definicao: jsonb('definicao').$type<Record<string, unknown>>().notNull(),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'mudancas_das_visoes_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'mudancas_das_visoes_visao_fk',
      columns: [t.orgId, t.visaoId],
      foreignColumns: [visoes.orgId, visoes.id],
    }).onDelete('cascade'),
    unique('mudancas_das_visoes_unicas')
      .on(t.orgId, t.contaId, t.tabela, t.visaoId)
      .nullsNotDistinct(),
    index('mudancas_das_visoes_da_visao_idx').on(t.orgId, t.visaoId),
    check(
      'mudancas_das_visoes_tabela_valida',
      sql`${t.tabela} in (${lista(TABELAS_COM_VISOES_NO_BANCO)})`,
    ),
    check(
      'mudancas_das_visoes_definicao_valida',
      sql`jsonb_typeof(${t.definicao}) = 'object' and octet_length(${t.definicao}::text) <= 32768`,
    ),
  ],
);

/** Os cadastros que guardam um rascunho por conta; hoje, só o do ativo. */
export const CADASTROS_COM_RASCUNHO = ['ativo'] as const;
export type CadastroComRascunho = (typeof CADASTROS_COM_RASCUNHO)[number];

/** O tamanho máximo do conteúdo de um rascunho: 256 KB do JSON. */
export const LIMITE_DO_RASCUNHO = 256 * 1024;

/**
 * O rascunho de um cadastro, por conta (spec cadastro-de-ativos, "Rascunho do cadastro do ativo";
 * change cadastro-em-etapas, design, decisão 6): um por conta e cadastro em cada organização, com o
 * conteúdo que o formulário guarda, um objeto até 256 KB. A API usa sempre a conta da sessão, então
 * outra conta não o alcança. O rascunho não vai à auditoria, e a manutenção diária apaga o parado
 * há mais de 30 dias.
 */
export const rascunhosDeCadastro = orgScoped(
  'rascunhos_de_cadastro',
  {
    contaId: uuid('conta_id').notNull(),
    cadastro: text('cadastro', { enum: CADASTROS_COM_RASCUNHO }).notNull(),
    conteudo: jsonb('conteudo').$type<Record<string, unknown>>().notNull(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'rascunhos_de_cadastro_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }).onDelete('cascade'),
    unique('rascunhos_de_cadastro_unico').on(t.orgId, t.contaId, t.cadastro),
    index('rascunhos_de_cadastro_atualizado_em_idx').on(t.orgId, t.atualizadoEm),
    check(
      'rascunhos_de_cadastro_cadastro_valido',
      sql`${t.cadastro} in (${lista(CADASTROS_COM_RASCUNHO)})`,
    ),
    check(
      'rascunhos_de_cadastro_conteudo_valido',
      sql`jsonb_typeof(${t.conteudo}) = 'object' and octet_length(${t.conteudo}::text) <= ${sql.raw(String(LIMITE_DO_RASCUNHO))}`,
    ),
  ],
);

/** As situações de uma importação de ativos, as mesmas do domínio (`SITUACOES_DA_IMPORTACAO`). */
export const SITUACOES_DA_IMPORTACAO_NO_BANCO = [
  'rascunho',
  'na-fila',
  'aplicando',
  'concluida',
  'com-falha',
  'descartada',
] as const;

/** Os totais de uma importação, pela ação de cada linha. */
export interface TotaisDaImportacao {
  novos: number;
  alterados: number;
  semMudanca: number;
  comErro: number;
}

/** Uma linha da planilha guardada: o número dela na planilha e uma célula por coluna. */
export interface LinhaGuardadaDaImportacao {
  linha: number;
  celulas: (string | number | null)[];
}

/** Uma recusa de uma linha da importação: o rótulo do campo, ou `null` na linha inteira. */
export interface MensagemDaLinhaImportada {
  campo: string | null;
  mensagem: string;
}

/**
 * As importações de ativos por planilha (spec importacao-de-ativos; design do P1e, decisões 1 e 3):
 * cada conta vê só as dela. A planilha é lida no envio, e as linhas ficam em `conteudo`, cada uma
 * com o número que tem na planilha e as células, até a importação terminar: a concluída e a descartada guardam só o nome do arquivo, os
 * títulos das colunas e os totais. O mapeamento diz o campo de cada coluna, pela posição, ou `null`.
 * A tarefa da fila grava cada linha numa transação que também avança `processadas` e, na linha com
 * erro, grava as recusas em `erros_da_importacao`.
 */
export const importacoes = orgScoped(
  'importacoes',
  {
    criadaPor: uuid('criada_por').notNull(),
    tipoId: uuid('tipo_id').notNull(),
    nomeDoArquivo: text('nome_do_arquivo').notNull(),
    colunas: jsonb('colunas').$type<string[]>().notNull(),
    conteudo: jsonb('conteudo').$type<LinhaGuardadaDaImportacao[]>(),
    linhas: integer('linhas').notNull(),
    mapeamento: jsonb('mapeamento').$type<(string | null)[]>().notNull(),
    situacao: text('situacao', { enum: SITUACOES_DA_IMPORTACAO_NO_BANCO })
      .notNull()
      .default('rascunho'),
    processadas: integer('processadas').notNull().default(0),
    totais: jsonb('totais')
      .$type<TotaisDaImportacao>()
      .notNull()
      .default({ novos: 0, alterados: 0, semMudanca: 0, comErro: 0 }),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
    aplicadaEm: momento('aplicada_em'),
    concluidaEm: momento('concluida_em'),
  },
  (t) => [
    foreignKey({
      name: 'importacoes_criada_por_fk',
      columns: [t.orgId, t.criadaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'importacoes_tipo_fk',
      columns: [t.orgId, t.tipoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    index('importacoes_da_conta_idx').on(t.orgId, t.criadaPor, t.criadaEm.desc(), t.id.desc()),
    check(
      'importacoes_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_IMPORTACAO_NO_BANCO)})`,
    ),
    check(
      'importacoes_sem_conteudo_depois_do_fim',
      sql`${t.situacao} not in ('concluida', 'descartada') or ${t.conteudo} is null`,
    ),
    check('importacoes_linhas_validas', sql`${t.linhas} between 1 and 5000`),
    check('importacoes_processadas_validas', sql`${t.processadas} between 0 and ${t.linhas}`),
    check('importacoes_nome_do_arquivo_valido', sql`length(${t.nomeDoArquivo}) between 1 and 200`),
    check(
      'importacoes_json_valido',
      sql`jsonb_typeof(${t.colunas}) = 'array' and jsonb_typeof(${t.mapeamento}) = 'array'
        and (${t.conteudo} is null or jsonb_typeof(${t.conteudo}) = 'array')
        and jsonb_typeof(${t.totais}) = 'object'`,
    ),
  ],
);

/**
 * As linhas com erro de uma importação aplicada (design do P1e, decisão 7): uma por linha, gravada
 * na mesma transação que avança a importação, com as recusas. Ficam depois da conclusão, como o
 * resultado que a tela mostra.
 */
export const errosDaImportacao = orgScoped(
  'erros_da_importacao',
  {
    importacaoId: uuid('importacao_id').notNull(),
    linha: integer('linha').notNull(),
    mensagens: jsonb('mensagens').$type<MensagemDaLinhaImportada[]>().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'erros_da_importacao_importacao_fk',
      columns: [t.orgId, t.importacaoId],
      foreignColumns: [importacoes.orgId, importacoes.id],
    }),
    unique('erros_da_importacao_linha_unica').on(t.orgId, t.importacaoId, t.linha),
    check('erros_da_importacao_mensagens_validas', sql`jsonb_typeof(${t.mensagens}) = 'array'`),
  ],
);

/** A situação de um coletor: o inativo não fala com a API. */
export const SITUACOES_DO_COLETOR = ['ativo', 'inativo'] as const;

/**
 * O coletor da organização (spec coletor-local; design do P2a, decisões 1 a 3): o nome, único pela
 * forma normalizada; o hash SHA-256 do token, que só aparece na tela uma vez; as faixas de rede na
 * forma canônica, conferidas pelo domínio; a situação; e o último contato, com a versão informada.
 * Quem criou é a conta, ou nada pelo comando no servidor.
 */
export const coletores = orgScoped(
  'coletores',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    faixas: text('faixas').array().notNull().default(sql`'{}'::text[]`),
    situacao: text('situacao', { enum: SITUACOES_DO_COLETOR }).notNull().default('ativo'),
    criadoPor: uuid('criado_por'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
    ultimoContatoEm: momento('ultimo_contato_em'),
    versao: text('versao'),
  },
  (t) => [
    unique('coletores_nome_unico').on(t.orgId, t.nomeNormalizado),
    unique('coletores_token_unico').on(t.orgId, t.tokenHash),
    foreignKey({
      name: 'coletores_criado_por_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    check('coletores_situacao_valida', sql`${t.situacao} in (${lista(SITUACOES_DO_COLETOR)})`),
    check('coletores_nome_valido', sql`length(trim(${t.nome})) between 1 and 60`),
    check('coletores_faixas_validas', sql`cardinality(${t.faixas}) <= 50`),
    check(
      'coletores_versao_valida',
      sql`${t.versao} is null or length(${t.versao}) between 1 and 40`,
    ),
  ],
);

/**
 * A prova de que um lote do coletor já entrou (spec coletor-local, "Lotes de leituras"): a chave,
 * única na organização, com quantas leituras foram gravadas e ignoradas. O reenvio do mesmo lote
 * acha a chave e não grava nada de novo. A manutenção diária apaga as de mais de 30 dias.
 */
export const lotesDaColeta = orgScoped(
  'lotes_da_coleta',
  {
    coletorId: uuid('coletor_id').notNull(),
    chave: uuid('chave').notNull(),
    recebidoEm: momento('recebido_em').notNull().defaultNow(),
    gravadas: integer('gravadas').notNull(),
    ignoradas: integer('ignoradas').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'lotes_da_coleta_coletor_fk',
      columns: [t.orgId, t.coletorId],
      foreignColumns: [coletores.orgId, coletores.id],
    }),
    unique('lotes_da_coleta_chave_unica').on(t.orgId, t.chave),
    index('lotes_da_coleta_recebido_idx').on(t.orgId, t.recebidoEm),
    check(
      'lotes_da_coleta_contagens_validas',
      sql`${t.gravadas} >= 0 and ${t.ignoradas} >= 0
        and ${t.gravadas} + ${t.ignoradas} between 1 and 1000`,
    ),
  ],
);

/** A situação de uma leitura: válida, sem dado (nunca um valor) ou com o valor fora da faixa. */
export const SITUACOES_DA_LEITURA_NO_BANCO = ['valida', 'sem-dado', 'inconsistente'] as const;

/**
 * As leituras da coleta, em série temporal (spec leituras-e-estado; design do P2a, decisões 3 e 4, e
 * do P2b, decisão 2): o ativo, a métrica, o item, como cada suprimento da impressora, o momento no
 * coletor, o valor em número ou em texto, os detalhes do item, a situação e o coletor. Uma leitura
 * não muda nem substitui outra. O índice da série serve à ficha e o BRIN do momento, à retenção de
 * 30 dias.
 */
export const leituras = orgScoped(
  'leituras',
  {
    ativoId: uuid('ativo_id').notNull(),
    metrica: text('metrica').notNull(),
    item: text('item').notNull().default(''),
    momento: momento('momento').notNull(),
    valorNumero: doublePrecision('valor_numero'),
    valorTexto: text('valor_texto'),
    situacao: text('situacao', { enum: SITUACOES_DA_LEITURA_NO_BANCO }).notNull(),
    detalhes: jsonb('detalhes').$type<Record<string, unknown>>(),
    coletorId: uuid('coletor_id').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'leituras_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'leituras_coletor_fk',
      columns: [t.orgId, t.coletorId],
      foreignColumns: [coletores.orgId, coletores.id],
    }),
    index('leituras_do_ativo_idx').on(t.orgId, t.ativoId, t.metrica, t.item, t.momento.desc()),
    index('leituras_momento_idx').using('brin', t.momento),
    check(
      'leituras_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_LEITURA_NO_BANCO)})`,
    ),
    check(
      'leituras_sem_dado_sem_valor',
      sql`${t.situacao} <> 'sem-dado' or (${t.valorNumero} is null and ${t.valorTexto} is null)`,
    ),
    check('leituras_metrica_valida', sql`length(${t.metrica}) between 1 and 60`),
    check('leituras_item_valido', sql`length(${t.item}) <= 20`),
    check(
      'leituras_detalhes_validos',
      sql`${t.detalhes} is null or (jsonb_typeof(${t.detalhes}) = 'object'
        and octet_length(${t.detalhes}::text) <= 2048)`,
    ),
  ],
);

/**
 * O estado atual de cada ativo, métrica e item (spec leituras-e-estado, "Estado atual"): a leitura
 * de momento mais recente, com os detalhes do item, e desde quando a situação é a mesma. As listas e
 * as fichas leem daqui, e nunca da série. Fica mesmo com a leitura dele apagada pela retenção.
 */
export const estadoDosAtivos = orgScoped(
  'estado_dos_ativos',
  {
    ativoId: uuid('ativo_id').notNull(),
    metrica: text('metrica').notNull(),
    item: text('item').notNull().default(''),
    momento: momento('momento').notNull(),
    valorNumero: doublePrecision('valor_numero'),
    valorTexto: text('valor_texto'),
    situacao: text('situacao', { enum: SITUACOES_DA_LEITURA_NO_BANCO }).notNull(),
    detalhes: jsonb('detalhes').$type<Record<string, unknown>>(),
    desde: momento('desde').notNull(),
    coletorId: uuid('coletor_id').notNull(),
  },
  (t) => [
    unique('estado_dos_ativos_item_unico').on(t.orgId, t.ativoId, t.metrica, t.item),
    foreignKey({
      name: 'estado_dos_ativos_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'estado_dos_ativos_coletor_fk',
      columns: [t.orgId, t.coletorId],
      foreignColumns: [coletores.orgId, coletores.id],
    }),
    check(
      'estado_dos_ativos_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_LEITURA_NO_BANCO)})`,
    ),
    check(
      'estado_dos_ativos_sem_dado_sem_valor',
      sql`${t.situacao} <> 'sem-dado' or (${t.valorNumero} is null and ${t.valorTexto} is null)`,
    ),
    check('estado_dos_ativos_metrica_valida', sql`length(${t.metrica}) between 1 and 60`),
    check('estado_dos_ativos_item_valido', sql`length(${t.item}) <= 20`),
    check(
      'estado_dos_ativos_detalhes_validos',
      sql`${t.detalhes} is null or (jsonb_typeof(${t.detalhes}) = 'object'
        and octet_length(${t.detalhes}::text) <= 2048)`,
    ),
  ],
);

/**
 * Os agregados por hora das leituras (spec leituras-e-estado, "Agregados por hora"; change
 * p2b-impressoras-por-snmp, design, decisões 2 e 9): para cada ativo, métrica, item e hora completa,
 * quantas leituras houve e quantas foram válidas, o mínimo, o máximo e a média dos valores válidos, e
 * o último valor válido com o momento dele, como o contador de páginas do fim da hora. A hora sem
 * leitura válida fica sem os valores, nunca com zero. A manutenção diária os grava antes de apagar as
 * leituras com mais de 30 dias e os guarda por 13 meses.
 */
export const leiturasPorHora = orgScoped(
  'leituras_por_hora',
  {
    ativoId: uuid('ativo_id').notNull(),
    metrica: text('metrica').notNull(),
    item: text('item').notNull().default(''),
    hora: momento('hora').notNull(),
    leituras: integer('leituras').notNull(),
    validas: integer('validas').notNull(),
    minimo: doublePrecision('minimo'),
    maximo: doublePrecision('maximo'),
    media: doublePrecision('media'),
    ultimo: doublePrecision('ultimo'),
    ultimoMomento: momento('ultimo_momento'),
  },
  (t) => [
    unique('leituras_por_hora_unicas').on(t.orgId, t.ativoId, t.metrica, t.item, t.hora),
    foreignKey({
      name: 'leituras_por_hora_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    index('leituras_por_hora_hora_idx').using('brin', t.hora),
    check('leituras_por_hora_metrica_valida', sql`length(${t.metrica}) between 1 and 60`),
    check('leituras_por_hora_item_valido', sql`length(${t.item}) <= 20`),
    check('leituras_por_hora_hora_cheia', sql`${t.hora} = date_trunc('hour', ${t.hora}, 'UTC')`),
    check(
      'leituras_por_hora_contagens_validas',
      sql`${t.leituras} >= 1 and ${t.validas} between 0 and ${t.leituras}`,
    ),
    check(
      'leituras_por_hora_sem_valida_sem_valor',
      sql`${t.validas} > 0 or (${t.minimo} is null and ${t.maximo} is null and ${t.media} is null
        and ${t.ultimo} is null and ${t.ultimoMomento} is null)`,
    ),
  ],
);

/** Os tipos de segredo, os mesmos do domínio (`TIPOS_DE_SEGREDO`). */
export const TIPOS_DE_SEGREDO_NO_BANCO = [
  'usuario-e-senha',
  'conta-administrativa',
  'banco-de-dados',
  'conta-de-servico',
  'chave-de-api',
  'token',
  'chave-ssh',
  'certificado',
  'pin',
  'wi-fi',
  'chave-de-licenca',
  'comunidade-snmp',
  'outro',
] as const;

/** As classificações dos segredos, as mesmas do domínio (`CLASSIFICACOES_DE_SEGREDO`). */
export const CLASSIFICACOES_DE_SEGREDO_NO_BANCO = [
  'pessoal',
  'compartilhado',
  'administrativo',
  'privilegiado',
  'aplicacao',
  'equipamento',
] as const;

export const SITUACOES_DO_SEGREDO = ['ativo', 'inativo'] as const;

/**
 * O segredo do cofre (spec cofre-de-segredos; design do P6, decisões 1, 2 e 6): os dados, que a lista
 * mostra a quem o vê, e o valor, cifrado com a chave própria do segredo, que vai cifrada pela chave
 * mestra do servidor. A impressão diz qual chave mestra cifrou a chave dele, sem deixar recuperá-la.
 */
export const segredos = orgScoped(
  'segredos',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    tipo: text('tipo', { enum: TIPOS_DE_SEGREDO_NO_BANCO }).notNull(),
    classificacao: text('classificacao', { enum: CLASSIFICACOES_DE_SEGREDO_NO_BANCO }).notNull(),
    identificador: text('identificador'),
    endereco: text('endereco'),
    notas: text('notas'),
    validade: date('validade', { mode: 'string' }),
    proximaRotacao: date('proxima_rotacao', { mode: 'string' }),
    pessoaId: uuid('pessoa_id'),
    situacao: text('situacao', { enum: SITUACOES_DO_SEGREDO }).notNull().default('ativo'),
    conteudoCifrado: bytea('conteudo_cifrado').notNull(),
    chaveCifrada: bytea('chave_cifrada').notNull(),
    impressaoDaChaveMestra: text('impressao_da_chave_mestra').notNull(),
    criadoPor: uuid('criado_por'),
    valorTrocadoEm: momento('valor_trocado_em').notNull().defaultNow(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'segredos_pessoa_fk',
      columns: [t.orgId, t.pessoaId],
      foreignColumns: [pessoas.orgId, pessoas.id],
    }),
    foreignKey({
      name: 'segredos_criado_por_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('segredos_nome_idx').on(t.orgId, t.nomeNormalizado),
    check('segredos_nome_valido', sql`length(trim(${t.nome})) between 1 and 120`),
    check('segredos_tipo_valido', sql`${t.tipo} in (${lista(TIPOS_DE_SEGREDO_NO_BANCO)})`),
    check(
      'segredos_classificacao_valida',
      sql`${t.classificacao} in (${lista(CLASSIFICACOES_DE_SEGREDO_NO_BANCO)})`,
    ),
    check('segredos_situacao_valida', sql`${t.situacao} in (${lista(SITUACOES_DO_SEGREDO)})`),
    check(
      'segredos_identificador_valido',
      sql`${t.identificador} is null or length(${t.identificador}) between 1 and 200`,
    ),
    check(
      'segredos_endereco_valido',
      sql`${t.endereco} is null or length(${t.endereco}) between 1 and 500`,
    ),
    check(
      'segredos_notas_validas',
      sql`${t.notas} is null or length(${t.notas}) between 1 and 2000`,
    ),
    check('segredos_impressao_valida', sql`${t.impressaoDaChaveMestra} ~ '^[0-9a-f]{16}$'`),
  ],
);

/**
 * Quem acessa cada segredo (spec cofre-de-segredos, "Acesso ao segredo"; design do P6, decisão 3): um
 * titular por linha, a conta, o grupo ou o perfil, e o mesmo titular uma vez só no segredo.
 */
export const acessosAosSegredos = orgScoped(
  'acessos_aos_segredos',
  {
    segredoId: uuid('segredo_id').notNull(),
    contaId: uuid('conta_id'),
    grupoId: uuid('grupo_id'),
    perfilId: uuid('perfil_id'),
    concedidoPor: uuid('concedido_por'),
    concedidoEm: momento('concedido_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'acessos_aos_segredos_segredo_fk',
      columns: [t.orgId, t.segredoId],
      foreignColumns: [segredos.orgId, segredos.id],
    }),
    foreignKey({
      name: 'acessos_aos_segredos_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'acessos_aos_segredos_grupo_fk',
      columns: [t.orgId, t.grupoId],
      foreignColumns: [grupos.orgId, grupos.id],
    }),
    foreignKey({
      name: 'acessos_aos_segredos_perfil_fk',
      columns: [t.orgId, t.perfilId],
      foreignColumns: [perfis.orgId, perfis.id],
    }),
    foreignKey({
      name: 'acessos_aos_segredos_concedido_por_fk',
      columns: [t.orgId, t.concedidoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('acessos_aos_segredos_titular_unico')
      .on(t.orgId, t.segredoId, t.contaId, t.grupoId, t.perfilId)
      .nullsNotDistinct(),
    check(
      'acessos_aos_segredos_um_titular',
      sql`num_nonnulls(${t.contaId}, ${t.grupoId}, ${t.perfilId}) = 1`,
    ),
  ],
);

/** Os ativos em que cada segredo é usado, como o switch de uma senha de administração (P6). */
export const segredosDosAtivos = orgScoped(
  'segredos_dos_ativos',
  {
    segredoId: uuid('segredo_id').notNull(),
    ativoId: uuid('ativo_id').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'segredos_dos_ativos_segredo_fk',
      columns: [t.orgId, t.segredoId],
      foreignColumns: [segredos.orgId, segredos.id],
    }),
    foreignKey({
      name: 'segredos_dos_ativos_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    unique('segredos_dos_ativos_unico').on(t.orgId, t.segredoId, t.ativoId),
    index('segredos_dos_ativos_ativo_idx').on(t.orgId, t.ativoId),
  ],
);

/** As condições de alerta, as severidades e os escopos, como o domínio os define (P3a). */
export const CONDICOES_DE_ALERTA_NO_BANCO = [
  'rede.offline',
  'toner.nivel',
  'impressora.condicao',
  'controlid.situacao',
  'coleta.atrasada',
  'coletor.sem-contato',
] as const;
export const SEVERIDADES_NO_BANCO = ['critico', 'atencao', 'info'] as const;
export const ESCOPOS_DA_REGRA_NO_BANCO = [
  'organizacao',
  'tipo',
  'modelo',
  'ativo',
  'local',
] as const;
export const SITUACOES_DA_REGRA = ['ativa', 'inativa'] as const;

/**
 * As regras de alerta da organização (spec alertas, "Regras de alerta"; change
 * p3a-regras-e-alertas, design, decisão 3): a condição, com os parâmetros que o domínio confere, a
 * duração em minutos, a severidade e o escopo, com o registro dele, sem chave estrangeira, porque
 * pode ser um tipo, um modelo, um ativo ou um local. A chave da regra de fábrica deixa a API criar
 * só as que faltam. Uma regra nunca é apagada, só inativada.
 */
export const regrasDeAlerta = orgScoped(
  'regras_de_alerta',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    condicao: text('condicao', { enum: CONDICOES_DE_ALERTA_NO_BANCO }).notNull(),
    parametros: jsonb('parametros').$type<Record<string, unknown>>().notNull().default({}),
    duracao: integer('duracao').notNull().default(0),
    severidade: text('severidade', { enum: SEVERIDADES_NO_BANCO }).notNull(),
    escopo: text('escopo', { enum: ESCOPOS_DA_REGRA_NO_BANCO }).notNull().default('organizacao'),
    escopoId: uuid('escopo_id'),
    /**
     * As exceções num tipo, num modelo, num ativo ou num local, como o domínio as confere (change
     * regras-indicadores-e-tarefas, design, decisão 1).
     */
    excecoes: jsonb('excecoes').$type<Record<string, unknown>[]>().notNull().default([]),
    situacao: text('situacao', { enum: SITUACOES_DA_REGRA }).notNull().default('ativa'),
    fabrica: text('fabrica'),
    criadoPor: uuid('criado_por'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('regras_de_alerta_nome_unico').on(t.orgId, t.nomeNormalizado),
    unique('regras_de_alerta_fabrica_unica').on(t.orgId, t.fabrica),
    foreignKey({
      name: 'regras_de_alerta_criado_por_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    check('regras_de_alerta_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check(
      'regras_de_alerta_condicao_valida',
      sql`${t.condicao} in (${lista(CONDICOES_DE_ALERTA_NO_BANCO)})`,
    ),
    check(
      'regras_de_alerta_parametros_validos',
      sql`jsonb_typeof(${t.parametros}) = 'object' and octet_length(${t.parametros}::text) <= 2048`,
    ),
    check('regras_de_alerta_duracao_valida', sql`${t.duracao} between 0 and 1440`),
    check(
      'regras_de_alerta_severidade_valida',
      sql`${t.severidade} in (${lista(SEVERIDADES_NO_BANCO)})`,
    ),
    check(
      'regras_de_alerta_escopo_valido',
      sql`${t.escopo} in (${lista(ESCOPOS_DA_REGRA_NO_BANCO)})`,
    ),
    check(
      'regras_de_alerta_escopo_com_o_registro',
      sql`(${t.escopo} = 'organizacao') = (${t.escopoId} is null)`,
    ),
    check('regras_de_alerta_situacao_valida', sql`${t.situacao} in (${lista(SITUACOES_DA_REGRA)})`),
    check(
      'regras_de_alerta_fabrica_valida',
      sql`${t.fabrica} is null or ${t.fabrica} ~ '^[a-z0-9-]{1,60}$'`,
    ),
  ],
);

/** A situação de um alerta: o pendente ainda não durou a duração da regra e não aparece. */
export const SITUACOES_DO_ALERTA = ['pendente', 'aberto', 'resolvido'] as const;

/** Como o alerta terminou: o valor voltou ao normal, ou a regra deixou de valer para o alvo. */
export const FINS_DO_ALERTA = ['voltou-ao-normal', 'regra-deixou-de-valer'] as const;

/**
 * Os alertas (spec alertas; change p3a-regras-e-alertas, design, decisão 3): de um ativo ou de um
 * coletor, pela regra e pelo item, como cada toner. O índice único parcial garante que nunca há
 * dois não resolvidos com a mesma identidade. O texto e a severidade são os da última avaliação; o
 * reconhecimento e o adiamento guardam quem e quando; o alerta aberto com o ativo silenciado fica
 * marcado, para os canais (P3b) não o avisarem.
 */
export const alertas = orgScoped(
  'alertas',
  {
    regraId: uuid('regra_id').notNull(),
    ativoId: uuid('ativo_id'),
    coletorId: uuid('coletor_id'),
    item: text('item').notNull().default(''),
    situacao: text('situacao', { enum: SITUACOES_DO_ALERTA }).notNull(),
    severidade: text('severidade', { enum: SEVERIDADES_NO_BANCO }).notNull(),
    texto: text('texto').notNull(),
    observadoEm: momento('observado_em').notNull(),
    abertoEm: momento('aberto_em'),
    resolvidoEm: momento('resolvido_em'),
    comoTerminou: text('como_terminou', { enum: FINS_DO_ALERTA }),
    reconhecidoPor: uuid('reconhecido_por'),
    reconhecidoEm: momento('reconhecido_em'),
    adiadoAte: momento('adiado_ate'),
    adiadoPor: uuid('adiado_por'),
    abertoNoSilencio: boolean('aberto_no_silencio').notNull().default(false),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'alertas_regra_fk',
      columns: [t.orgId, t.regraId],
      foreignColumns: [regrasDeAlerta.orgId, regrasDeAlerta.id],
    }),
    foreignKey({
      name: 'alertas_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'alertas_coletor_fk',
      columns: [t.orgId, t.coletorId],
      foreignColumns: [coletores.orgId, coletores.id],
    }),
    foreignKey({
      name: 'alertas_reconhecido_por_fk',
      columns: [t.orgId, t.reconhecidoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'alertas_adiado_por_fk',
      columns: [t.orgId, t.adiadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    uniqueIndex('alertas_um_nao_resolvido')
      .on(t.orgId, t.regraId, sql`coalesce(${t.ativoId}, ${t.coletorId})`, t.item)
      .where(sql`${t.situacao} <> 'resolvido'`),
    index('alertas_do_ativo_idx').on(t.orgId, t.ativoId, t.situacao),
    index('alertas_abertos_idx')
      .on(t.orgId, t.severidade, t.abertoEm)
      .where(sql`${t.situacao} = 'aberto'`),
    index('alertas_resolvidos_idx')
      .on(t.orgId, t.resolvidoEm.desc())
      .where(sql`${t.situacao} = 'resolvido'`),
    // Os indicadores leem os alertas que abriram nos últimos 60 dias (change p3d-indicadores).
    index('alertas_aberto_em_idx').on(t.orgId, t.abertoEm).where(sql`${t.abertoEm} is not null`),
    check('alertas_um_alvo', sql`num_nonnulls(${t.ativoId}, ${t.coletorId}) = 1`),
    check('alertas_item_valido', sql`length(${t.item}) <= 60`),
    check('alertas_situacao_valida', sql`${t.situacao} in (${lista(SITUACOES_DO_ALERTA)})`),
    check('alertas_severidade_valida', sql`${t.severidade} in (${lista(SEVERIDADES_NO_BANCO)})`),
    check('alertas_texto_valido', sql`length(${t.texto}) between 1 and 200`),
    check(
      'alertas_aberto_com_a_abertura',
      sql`(${t.situacao} = 'pendente') = (${t.abertoEm} is null)`,
    ),
    check(
      'alertas_resolvido_com_o_fim',
      sql`(${t.situacao} = 'resolvido') = (${t.resolvidoEm} is not null)
        and (${t.situacao} = 'resolvido') = (${t.comoTerminou} is not null)`,
    ),
    check(
      'alertas_fim_valido',
      sql`${t.comoTerminou} is null or ${t.comoTerminou} in (${lista(FINS_DO_ALERTA)})`,
    ),
    check(
      'alertas_reconhecimento_completo',
      sql`(${t.reconhecidoPor} is null) = (${t.reconhecidoEm} is null)`,
    ),
    check('alertas_adiamento_completo', sql`(${t.adiadoAte} is null) = (${t.adiadoPor} is null)`),
  ],
);

/**
 * O silêncio dos alertas de um ativo (spec alertas, "Silenciar os alertas de um ativo"): até um
 * momento, ou até alguém retomar (sem o momento), com o motivo. Retomar apaga a linha, e a
 * avaliação apaga as vencidas. Os alertas do ativo continuam abrindo e se resolvendo.
 */
export const silenciosDosAtivos = orgScoped(
  'silencios_dos_ativos',
  {
    ativoId: uuid('ativo_id').notNull(),
    ate: momento('ate'),
    motivo: text('motivo'),
    criadoPor: uuid('criado_por').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('silencios_dos_ativos_um_por_ativo').on(t.orgId, t.ativoId),
    foreignKey({
      name: 'silencios_dos_ativos_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'silencios_dos_ativos_criado_por_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    check(
      'silencios_dos_ativos_motivo_valido',
      sql`${t.motivo} is null or length(${t.motivo}) between 1 and 200`,
    ),
  ],
);

/**
 * As notificações (spec notificacoes; change p3b-notificacoes-no-servidor, design, decisão 2):
 * uma linha por conta, com o que a central e o aviso mostram, o alerta de que trata e a leitura.
 * A manutenção diária apaga as de mais de 90 dias, pelo índice do momento. As marcas do envio
 * (change p3c-email-e-push, design, decisão 3) dizem quando ela foi por e-mail, na hora ou no
 * resumo, e quando a entrega decidiu o push dela.
 */
export const notificacoes = orgScoped(
  'notificacoes',
  {
    contaId: uuid('conta_id').notNull(),
    severidade: text('severidade', { enum: SEVERIDADES_NO_BANCO }).notNull(),
    titulo: text('titulo').notNull(),
    descricao: text('descricao'),
    origem: text('origem').notNull(),
    destino: text('destino'),
    alertaId: uuid('alerta_id'),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    lidaEm: momento('lida_em'),
    emailEm: momento('email_em'),
    pushEm: momento('push_em'),
  },
  (t) => [
    foreignKey({
      name: 'notificacoes_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'notificacoes_alerta_fk',
      columns: [t.orgId, t.alertaId],
      foreignColumns: [alertas.orgId, alertas.id],
    }),
    index('notificacoes_da_conta_idx').on(t.orgId, t.contaId, t.criadaEm.desc(), t.id.desc()),
    index('notificacoes_nao_lidas_idx').on(t.orgId, t.contaId).where(sql`${t.lidaEm} is null`),
    index('notificacoes_antigas_idx').on(t.orgId, t.criadaEm),
    index('notificacoes_para_o_resumo_idx')
      .on(t.orgId, t.contaId)
      .where(sql`${t.lidaEm} is null and ${t.emailEm} is null`),
    check(
      'notificacoes_severidade_valida',
      sql`${t.severidade} in (${lista(SEVERIDADES_NO_BANCO)})`,
    ),
    check('notificacoes_titulo_valido', sql`length(${t.titulo}) between 1 and 200`),
    check(
      'notificacoes_descricao_valida',
      sql`${t.descricao} is null or length(${t.descricao}) between 1 and 300`,
    ),
    check('notificacoes_origem_valida', sql`length(${t.origem}) between 1 and 40`),
    check(
      'notificacoes_destino_valido',
      sql`${t.destino} is null or (${t.destino} like '/%' and length(${t.destino}) <= 500)`,
    ),
  ],
);

/**
 * Os aparelhos do push (spec notificacoes, "Aparelhos do push"; change p3c-email-e-push, design,
 * decisão 8): a inscrição de cada aparelho de uma conta, com o endereço no serviço de push, as duas
 * chaves que cifram o conteúdo para o aparelho, o nome dele e o último envio aceito.
 */
export const inscricoesDePush = orgScoped(
  'inscricoes_de_push',
  {
    contaId: uuid('conta_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    aparelho: text('aparelho').notNull(),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    ultimoEnvioEm: momento('ultimo_envio_em'),
  },
  (t) => [
    foreignKey({
      name: 'inscricoes_de_push_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('inscricoes_de_push_endpoint_unico').on(t.orgId, t.endpoint),
    index('inscricoes_de_push_da_conta_idx').on(t.orgId, t.contaId),
    check(
      'inscricoes_de_push_endpoint_valido',
      sql`${t.endpoint} ~ '^https?://' and length(${t.endpoint}) <= 1000`,
    ),
    check(
      'inscricoes_de_push_chaves_validas',
      sql`${t.p256dh} ~ '^[A-Za-z0-9_-]{87}$' and ${t.auth} ~ '^[A-Za-z0-9_-]{22}$'`,
    ),
    check('inscricoes_de_push_aparelho_valido', sql`length(${t.aparelho}) between 1 and 80`),
  ],
);

/**
 * Os fornecedores da organização (spec fornecedores; change p4a-fornecedores, design, decisão 2): o
 * nome, com o normalizado que decide a unicidade, o CNPJ de 14 caracteres em maiúsculas, único entre
 * os preenchidos, o contato, o e-mail, o telefone e as observações. O domínio confere os formatos; o
 * banco repete os limites.
 */
export const fornecedores = orgScoped(
  'fornecedores',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    cnpj: text('cnpj'),
    contato: text('contato'),
    email: text('email'),
    telefone: text('telefone'),
    observacoes: text('observacoes'),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('fornecedores_nome_unico').on(t.orgId, t.nomeNormalizado),
    uniqueIndex('fornecedores_cnpj_unico').on(t.orgId, t.cnpj).where(sql`${t.cnpj} is not null`),
    check('fornecedores_nome_valido', sql`length(trim(${t.nome})) between 1 and 120`),
    check(
      'fornecedores_cnpj_valido',
      sql`${t.cnpj} is null or ${t.cnpj} ~ '^[0-9A-Z]{12}[0-9]{2}$'`,
    ),
    check(
      'fornecedores_textos_validos',
      sql`(${t.contato} is null or length(${t.contato}) between 1 and 120)
        and (${t.email} is null or length(${t.email}) between 3 and 254)
        and (${t.telefone} is null or length(${t.telefone}) between 1 and 30)
        and (${t.observacoes} is null or length(${t.observacoes}) between 1 and 2000)`,
    ),
    check('fornecedores_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
  ],
);

/** Os tipos e as cores dos consumíveis, como o domínio os define (P4b; a Peça, da P4e). */
export const TIPOS_DE_CONSUMIVEL_NO_BANCO = [
  'toner',
  'cilindro',
  'tinta',
  'fita',
  'kit-de-manutencao',
  'peca',
  'outro',
] as const;
export const CORES_DE_CONSUMIVEL_NO_BANCO = [
  'preto',
  'ciano',
  'magenta',
  'amarelo',
  'colorido',
] as const;

/**
 * Os consumíveis da organização (spec consumiveis, "Consumível"; change p4b-consumiveis, design,
 * decisão 2): o código como foi escrito e o normalizado, único na organização, o nome e o nome
 * normalizado, para a busca sem acento, o tipo, a cor, o rendimento em páginas e a situação.
 */
export const consumiveis = orgScoped(
  'consumiveis',
  {
    codigo: text('codigo').notNull(),
    codigoNormalizado: text('codigo_normalizado').notNull(),
    nome: text('nome'),
    nomeNormalizado: text('nome_normalizado'),
    tipo: text('tipo', { enum: TIPOS_DE_CONSUMIVEL_NO_BANCO }).notNull(),
    cor: text('cor', { enum: CORES_DE_CONSUMIVEL_NO_BANCO }),
    rendimento: integer('rendimento'),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('consumiveis_codigo_unico').on(t.orgId, t.codigoNormalizado),
    check(
      'consumiveis_codigo_valido',
      sql`length(trim(${t.codigo})) between 1 and 40 and length(${t.codigoNormalizado}) > 0`,
    ),
    check(
      'consumiveis_nome_valido',
      sql`(${t.nome} is null and ${t.nomeNormalizado} is null)
        or (length(trim(${t.nome})) between 1 and 80 and ${t.nomeNormalizado} is not null)`,
    ),
    check('consumiveis_tipo_valido', sql`${t.tipo} in (${lista(TIPOS_DE_CONSUMIVEL_NO_BANCO)})`),
    check(
      'consumiveis_cor_valida',
      sql`${t.cor} is null or ${t.cor} in (${lista(CORES_DE_CONSUMIVEL_NO_BANCO)})`,
    ),
    check(
      'consumiveis_rendimento_valido',
      sql`${t.rendimento} is null or ${t.rendimento} between 1 and 1000000`,
    ),
    check('consumiveis_situacao_valida', sql`${t.situacao} in ('ativo', 'inativo')`),
  ],
);

/** Os fornecedores que vendem cada consumível (spec consumiveis, "Fornecedores do consumível"). */
export const fornecedoresDosConsumiveis = orgScoped(
  'fornecedores_dos_consumiveis',
  {
    consumivelId: uuid('consumivel_id').notNull(),
    fornecedorId: uuid('fornecedor_id').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'fornecedores_dos_consumiveis_consumivel_fk',
      columns: [t.orgId, t.consumivelId],
      foreignColumns: [consumiveis.orgId, consumiveis.id],
    }),
    foreignKey({
      name: 'fornecedores_dos_consumiveis_fornecedor_fk',
      columns: [t.orgId, t.fornecedorId],
      foreignColumns: [fornecedores.orgId, fornecedores.id],
    }),
    unique('fornecedores_dos_consumiveis_unico').on(t.orgId, t.consumivelId, t.fornecedorId),
    index('fornecedores_dos_consumiveis_fornecedor_idx').on(t.orgId, t.fornecedorId),
  ],
);

/**
 * Os modelos em que cada consumível serve (spec consumiveis, "Compatibilidade com os modelos"): a
 * ficha do modelo e a do ativo leem os compatíveis pelo índice do modelo.
 */
export const consumiveisDosModelos = orgScoped(
  'consumiveis_dos_modelos',
  {
    consumivelId: uuid('consumivel_id').notNull(),
    modeloId: uuid('modelo_id').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'consumiveis_dos_modelos_consumivel_fk',
      columns: [t.orgId, t.consumivelId],
      foreignColumns: [consumiveis.orgId, consumiveis.id],
    }),
    foreignKey({
      name: 'consumiveis_dos_modelos_modelo_fk',
      columns: [t.orgId, t.modeloId],
      foreignColumns: [modelos.orgId, modelos.id],
    }),
    unique('consumiveis_dos_modelos_unico').on(t.orgId, t.consumivelId, t.modeloId),
    index('consumiveis_dos_modelos_modelo_idx').on(t.orgId, t.modeloId),
  ],
);

/** Os tipos da movimentação e os motivos do ajuste, os mesmos do domínio, conferidos pelo banco. */
export const TIPOS_DE_MOVIMENTO_NO_BANCO = ['entrada', 'saida', 'transferencia', 'ajuste'] as const;
export const MOTIVOS_DO_AJUSTE_NO_BANCO = [
  'inventario',
  'perda',
  'avaria',
  'devolucao-ao-fornecedor',
  'outro',
] as const;

/**
 * O livro-razão do estoque (spec estoque, "Movimentação do estoque"; change p4c-estoque, design,
 * decisão 2): cada entrada, saída, transferência e ajuste, com os locais, o fornecedor e a nota, o
 * ativo e o total de páginas lido na hora, o motivo, quem lançou e quando. O papel da aplicação só
 * inclui e lê (migration 0037). O ajuste de retirar tem só a origem, e o de acrescentar, só o destino.
 */
export const movimentosDoEstoque = orgScoped(
  'movimentos_do_estoque',
  {
    tipo: text('tipo', { enum: TIPOS_DE_MOVIMENTO_NO_BANCO }).notNull(),
    consumivelId: uuid('consumivel_id').notNull(),
    quantidade: integer('quantidade').notNull(),
    origemId: uuid('origem_id'),
    destinoId: uuid('destino_id'),
    fornecedorId: uuid('fornecedor_id'),
    notaFiscal: text('nota_fiscal'),
    ativoId: uuid('ativo_id'),
    contadorPaginas: bigint('contador_paginas', { mode: 'number' }),
    contadorLidoEm: momento('contador_lido_em'),
    motivo: text('motivo', { enum: MOTIVOS_DO_AJUSTE_NO_BANCO }),
    observacao: text('observacao'),
    lancadoPor: uuid('lancado_por').notNull(),
    momento: momento('momento').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'movimentos_do_estoque_consumivel_fk',
      columns: [t.orgId, t.consumivelId],
      foreignColumns: [consumiveis.orgId, consumiveis.id],
    }),
    foreignKey({
      name: 'movimentos_do_estoque_origem_fk',
      columns: [t.orgId, t.origemId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'movimentos_do_estoque_destino_fk',
      columns: [t.orgId, t.destinoId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'movimentos_do_estoque_fornecedor_fk',
      columns: [t.orgId, t.fornecedorId],
      foreignColumns: [fornecedores.orgId, fornecedores.id],
    }),
    foreignKey({
      name: 'movimentos_do_estoque_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'movimentos_do_estoque_lancado_por_fk',
      columns: [t.orgId, t.lancadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('movimentos_do_estoque_momento_idx').on(t.orgId, t.momento.desc(), t.id.desc()),
    index('movimentos_do_estoque_consumivel_idx').on(
      t.orgId,
      t.consumivelId,
      t.momento.desc(),
      t.id.desc(),
    ),
    index('movimentos_do_estoque_origem_idx')
      .on(t.orgId, t.origemId, t.momento.desc(), t.id.desc())
      .where(sql`${t.origemId} is not null`),
    index('movimentos_do_estoque_destino_idx')
      .on(t.orgId, t.destinoId, t.momento.desc(), t.id.desc())
      .where(sql`${t.destinoId} is not null`),
    index('movimentos_do_estoque_fornecedor_idx')
      .on(t.orgId, t.fornecedorId, t.momento.desc(), t.id.desc())
      .where(sql`${t.fornecedorId} is not null`),
    index('movimentos_do_estoque_ativo_idx')
      .on(t.orgId, t.ativoId, t.momento.desc(), t.id.desc())
      .where(sql`${t.ativoId} is not null`),
    check(
      'movimentos_do_estoque_tipo_valido',
      sql`${t.tipo} in (${lista(TIPOS_DE_MOVIMENTO_NO_BANCO)})`,
    ),
    check('movimentos_do_estoque_quantidade_valida', sql`${t.quantidade} between 1 and 100000`),
    check(
      'movimentos_do_estoque_nota_valida',
      sql`${t.notaFiscal} is null or length(trim(${t.notaFiscal})) between 1 and 40`,
    ),
    check(
      'movimentos_do_estoque_observacao_valida',
      sql`${t.observacao} is null or length(trim(${t.observacao})) between 1 and 200`,
    ),
    check(
      'movimentos_do_estoque_motivo_valido',
      sql`${t.motivo} is null or ${t.motivo} in (${lista(MOTIVOS_DO_AJUSTE_NO_BANCO)})`,
    ),
    check(
      'movimentos_do_estoque_contador_valido',
      sql`(${t.contadorPaginas} is null) = (${t.contadorLidoEm} is null)
        and (${t.contadorPaginas} is null or ${t.contadorPaginas} >= 0)`,
    ),
    // Cada tipo diz o que preenche e o que fica vazio; um tipo desconhecido fica com a checagem do tipo.
    check(
      'movimentos_do_estoque_campos_do_tipo',
      sql`(${t.tipo} <> 'entrada' or (${t.origemId} is null and ${t.destinoId} is not null
          and ${t.fornecedorId} is not null and ${t.notaFiscal} is not null and ${t.ativoId} is null
          and ${t.contadorPaginas} is null and ${t.motivo} is null))
        and (${t.tipo} <> 'saida' or (${t.origemId} is not null and ${t.destinoId} is null
          and ${t.fornecedorId} is null and ${t.notaFiscal} is null and ${t.ativoId} is not null
          and ${t.motivo} is null))
        and (${t.tipo} <> 'transferencia' or (${t.origemId} is not null and ${t.destinoId} is not null
          and ${t.origemId} <> ${t.destinoId} and ${t.fornecedorId} is null and ${t.notaFiscal} is null
          and ${t.ativoId} is null and ${t.contadorPaginas} is null and ${t.motivo} is null))
        and (${t.tipo} <> 'ajuste' or (num_nonnulls(${t.origemId}, ${t.destinoId}) = 1
          and ${t.fornecedorId} is null and ${t.notaFiscal} is null and ${t.ativoId} is null
          and ${t.contadorPaginas} is null and ${t.motivo} is not null))`,
    ),
    check(
      'movimentos_do_estoque_outro_com_observacao',
      sql`${t.motivo} is distinct from 'outro' or ${t.observacao} is not null`,
    ),
  ],
);

/**
 * O saldo de cada consumível em cada local (spec estoque, "Saldo que nunca fica negativo" e "Mínimo
 * do consumível no local"; change p4c-estoque, design, decisões 2 e 3), que o lançamento muda na
 * mesma transação do livro-razão, com o mínimo, em que 0 é sem mínimo, e o momento em que o par
 * ficou abaixo dele. A linha nasce no primeiro lançamento ou no primeiro mínimo do par.
 */
export const saldosDoEstoque = orgScoped(
  'saldos_do_estoque',
  {
    consumivelId: uuid('consumivel_id').notNull(),
    localId: uuid('local_id').notNull(),
    saldo: integer('saldo').notNull().default(0),
    minimo: integer('minimo').notNull().default(0),
    abaixoDesde: momento('abaixo_desde'),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'saldos_do_estoque_consumivel_fk',
      columns: [t.orgId, t.consumivelId],
      foreignColumns: [consumiveis.orgId, consumiveis.id],
    }),
    foreignKey({
      name: 'saldos_do_estoque_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    unique('saldos_do_estoque_par_unico').on(t.orgId, t.consumivelId, t.localId),
    // A fonte do Início lê os que estão abaixo do mínimo, os mais antigos primeiro.
    index('saldos_do_estoque_abaixo_idx')
      .on(t.orgId, t.abaixoDesde, t.id)
      .where(sql`${t.abaixoDesde} is not null`),
    check('saldos_do_estoque_saldo_valido', sql`${t.saldo} >= 0`),
    check('saldos_do_estoque_minimo_valido', sql`${t.minimo} between 0 and 100000`),
    check(
      'saldos_do_estoque_abaixo_do_minimo_coerente',
      sql`(${t.abaixoDesde} is not null) = (${t.minimo} > 0 and ${t.saldo} < ${t.minimo})`,
    ),
  ],
);

/** Os tipos e as situações da solicitação e as cores do toner, os mesmos do domínio. */
export const TIPOS_DE_SOLICITACAO_NO_BANCO = ['toner', 'conserto', 'equipamento'] as const;
export const SITUACOES_DA_SOLICITACAO_NO_BANCO = [
  'aberta',
  'em-atendimento',
  'aguardando-entrega',
  'concluida',
  'cancelada',
] as const;
export const CORES_DO_TONER_NO_BANCO = [
  'preto',
  'ciano',
  'magenta',
  'amarelo',
  'colorido',
] as const;
export const ORIGENS_DA_ENTREGA_NO_BANCO = ['estoque', 'fornecedor'] as const;

/** O texto aparado com o tamanho de 1 até o limite, ou vazio. */
const textoAte = (coluna: unknown, limite: number) =>
  sql`(${coluna} is null or length(trim(${coluna})) between 1 and ${sql.raw(String(limite))})`;

/**
 * A solicitação à TI (spec solicitacoes, "Solicitação" e "Situação da solicitação"; change
 * p4d-solicitacoes, design, decisões 2 e 6): o número sequencial na organização, o tipo, a
 * situação, a pessoa que pediu e os campos de cada tipo, o pedido ao fornecedor, o encerramento e
 * os locais em que ela vale para ver e para atender. O papel da aplicação não apaga (migration 0038).
 */
export const solicitacoes = orgScoped(
  'solicitacoes',
  {
    numero: integer('numero').notNull(),
    tipo: text('tipo', { enum: TIPOS_DE_SOLICITACAO_NO_BANCO }).notNull(),
    situacao: text('situacao', { enum: SITUACOES_DA_SOLICITACAO_NO_BANCO }).notNull(),
    pessoaId: uuid('pessoa_id').notNull(),
    observacao: text('observacao'),
    ativoId: uuid('ativo_id'),
    defeito: text('defeito'),
    tipoDeAtivoId: uuid('tipo_de_ativo_id'),
    quantidade: integer('quantidade'),
    motivo: text('motivo'),
    localId: uuid('local_id'),
    fornecedorId: uuid('fornecedor_id'),
    osDoFornecedor: text('os_do_fornecedor'),
    oQueFoiFeito: text('o_que_foi_feito'),
    motivoDoCancelamento: text('motivo_do_cancelamento'),
    locais: uuid('locais').array().notNull().default(sql`'{}'::uuid[]`),
    semLocal: boolean('sem_local').notNull().default(false),
    registradaPor: uuid('registrada_por').notNull(),
    registradaEm: momento('registrada_em').notNull().defaultNow(),
    encerradaPor: uuid('encerrada_por'),
    encerradaEm: momento('encerrada_em'),
  },
  (t) => [
    foreignKey({
      name: 'solicitacoes_pessoa_fk',
      columns: [t.orgId, t.pessoaId],
      foreignColumns: [pessoas.orgId, pessoas.id],
    }),
    foreignKey({
      name: 'solicitacoes_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'solicitacoes_tipo_de_ativo_fk',
      columns: [t.orgId, t.tipoDeAtivoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    foreignKey({
      name: 'solicitacoes_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'solicitacoes_fornecedor_fk',
      columns: [t.orgId, t.fornecedorId],
      foreignColumns: [fornecedores.orgId, fornecedores.id],
    }),
    foreignKey({
      name: 'solicitacoes_registrada_por_fk',
      columns: [t.orgId, t.registradaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'solicitacoes_encerrada_por_fk',
      columns: [t.orgId, t.encerradaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('solicitacoes_numero_unico').on(t.orgId, t.numero),
    // A lista vem das mais novas para as mais antigas, com o filtro das pendentes por padrão.
    index('solicitacoes_registrada_idx').on(t.orgId, t.registradaEm.desc(), t.id.desc()),
    index('solicitacoes_situacao_idx').on(t.orgId, t.situacao, t.registradaEm.desc(), t.id.desc()),
    index('solicitacoes_ativo_idx').on(t.orgId, t.ativoId).where(sql`${t.ativoId} is not null`),
    // Ver por algum local (&&) e atender por todos (<@) (design, decisão 6).
    index('solicitacoes_locais_idx').using('gin', t.locais),
    check('solicitacoes_tipo_valido', sql`${t.tipo} in (${lista(TIPOS_DE_SOLICITACAO_NO_BANCO)})`),
    check(
      'solicitacoes_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_SOLICITACAO_NO_BANCO)})`,
    ),
    check(
      'solicitacoes_quantidade_valida',
      sql`${t.quantidade} is null or ${t.quantidade} between 1 and 99`,
    ),
    check(
      'solicitacoes_textos_validos',
      sql`${textoAte(t.observacao, 500)} and ${textoAte(t.defeito, 1000)}
        and ${textoAte(t.motivo, 1000)} and ${textoAte(t.osDoFornecedor, 40)}
        and ${textoAte(t.oQueFoiFeito, 1000)} and ${textoAte(t.motivoDoCancelamento, 200)}`,
    ),
    // Cada tipo diz o que preenche e o que fica vazio, em implicações, para um tipo desconhecido
    // ficar com a checagem do tipo. A OS do fornecedor pede o fornecedor, e o conserto não fica
    // aguardando entrega nem tem o pedido ao fornecedor.
    check(
      'solicitacoes_campos_do_tipo',
      sql`(${t.tipo} <> 'toner' or (${t.ativoId} is null and ${t.defeito} is null
          and ${t.tipoDeAtivoId} is null and ${t.quantidade} is null and ${t.motivo} is null
          and ${t.localId} is null))
        and (${t.tipo} <> 'conserto' or (${t.ativoId} is not null and ${t.defeito} is not null
          and ${t.tipoDeAtivoId} is null and ${t.quantidade} is null and ${t.motivo} is null
          and ${t.localId} is null and ${t.fornecedorId} is null
          and ${t.situacao} <> 'aguardando-entrega'))
        and (${t.tipo} <> 'equipamento' or (${t.tipoDeAtivoId} is not null
          and ${t.quantidade} is not null and ${t.motivo} is not null and ${t.localId} is not null
          and ${t.ativoId} is null and ${t.defeito} is null))
        and (${t.osDoFornecedor} is null or ${t.fornecedorId} is not null)`,
    ),
    // A encerrada tem quem e quando; a cancelada, o motivo; só a concluída, o que foi feito.
    check(
      'solicitacoes_encerramento_coerente',
      sql`(${t.situacao} in ('concluida', 'cancelada')) = (${t.encerradaEm} is not null)
        and (${t.encerradaEm} is null) = (${t.encerradaPor} is null)
        and (${t.situacao} = 'cancelada') = (${t.motivoDoCancelamento} is not null)
        and (${t.oQueFoiFeito} is null or ${t.situacao} = 'concluida')`,
    ),
  ],
);

/**
 * As impressoras do toner, cada uma com o total de páginas e o momento da leitura congelados no
 * momento em que ela entrou na solicitação, ou sem eles, sem leitura (spec solicitacoes, "Contador
 * congelado na solicitação").
 */
export const impressorasDasSolicitacoes = orgScoped(
  'impressoras_das_solicitacoes',
  {
    solicitacaoId: uuid('solicitacao_id').notNull(),
    ativoId: uuid('ativo_id').notNull(),
    contadorPaginas: bigint('contador_paginas', { mode: 'number' }),
    contadorLidoEm: momento('contador_lido_em'),
    incluidaEm: momento('incluida_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'impressoras_das_solicitacoes_solicitacao_fk',
      columns: [t.orgId, t.solicitacaoId],
      foreignColumns: [solicitacoes.orgId, solicitacoes.id],
    }),
    foreignKey({
      name: 'impressoras_das_solicitacoes_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    // O alvo da chave composta dos itens: a impressora uma vez por solicitação.
    unique('impressoras_das_solicitacoes_unica').on(t.orgId, t.solicitacaoId, t.ativoId),
    index('impressoras_das_solicitacoes_ativo_idx').on(t.orgId, t.ativoId),
    check(
      'impressoras_das_solicitacoes_contador_valido',
      sql`(${t.contadorPaginas} is null) = (${t.contadorLidoEm} is null)
        and (${t.contadorPaginas} is null or ${t.contadorPaginas} >= 0)`,
    ),
  ],
);

/**
 * Os itens do toner (spec solicitacoes, "Itens do toner" e "Entrega do toner"): a impressora da
 * solicitação, a cor e a quantidade, com o consumível sugerido ou escolhido, e a entrega, do
 * estoque, com a saída lançada no livro-razão, ou pelo fornecedor. O item entregue não muda nem sai,
 * por um gatilho (migration 0038).
 */
export const itensDasSolicitacoes = orgScoped(
  'itens_das_solicitacoes',
  {
    solicitacaoId: uuid('solicitacao_id').notNull(),
    impressoraId: uuid('impressora_id').notNull(),
    cor: text('cor', { enum: CORES_DO_TONER_NO_BANCO }).notNull(),
    quantidade: integer('quantidade').notNull(),
    consumivelId: uuid('consumivel_id'),
    origem: text('origem', { enum: ORIGENS_DA_ENTREGA_NO_BANCO }),
    movimentoId: uuid('movimento_id'),
    fornecedorId: uuid('fornecedor_id'),
    entreguePor: uuid('entregue_por'),
    entregueEm: momento('entregue_em'),
  },
  (t) => [
    foreignKey({
      name: 'itens_das_solicitacoes_impressora_fk',
      columns: [t.orgId, t.solicitacaoId, t.impressoraId],
      foreignColumns: [
        impressorasDasSolicitacoes.orgId,
        impressorasDasSolicitacoes.solicitacaoId,
        impressorasDasSolicitacoes.ativoId,
      ],
    }),
    foreignKey({
      name: 'itens_das_solicitacoes_consumivel_fk',
      columns: [t.orgId, t.consumivelId],
      foreignColumns: [consumiveis.orgId, consumiveis.id],
    }),
    foreignKey({
      name: 'itens_das_solicitacoes_movimento_fk',
      columns: [t.orgId, t.movimentoId],
      foreignColumns: [movimentosDoEstoque.orgId, movimentosDoEstoque.id],
    }),
    foreignKey({
      name: 'itens_das_solicitacoes_fornecedor_fk',
      columns: [t.orgId, t.fornecedorId],
      foreignColumns: [fornecedores.orgId, fornecedores.id],
    }),
    foreignKey({
      name: 'itens_das_solicitacoes_entregue_por_fk',
      columns: [t.orgId, t.entreguePor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('itens_das_solicitacoes_cor_unica').on(t.orgId, t.solicitacaoId, t.impressoraId, t.cor),
    index('itens_das_solicitacoes_solicitacao_idx').on(t.orgId, t.solicitacaoId),
    check(
      'itens_das_solicitacoes_cor_valida',
      sql`${t.cor} in (${lista(CORES_DO_TONER_NO_BANCO)})`,
    ),
    check('itens_das_solicitacoes_quantidade_valida', sql`${t.quantidade} between 1 and 99`),
    // O pendente não tem entrega; o entregue tem quem e quando; o do estoque, a saída e o
    // consumível; o do fornecedor, o fornecedor, sem a saída.
    check(
      'itens_das_solicitacoes_entrega_coerente',
      sql`(${t.origem} is null) = (${t.entregueEm} is null)
        and (${t.entregueEm} is null) = (${t.entreguePor} is null)
        and (${t.origem} is not null or (${t.movimentoId} is null and ${t.fornecedorId} is null))
        and (${t.origem} is distinct from 'estoque' or (${t.movimentoId} is not null
          and ${t.consumivelId} is not null and ${t.fornecedorId} is null))
        and (${t.origem} is distinct from 'fornecedor' or (${t.fornecedorId} is not null
          and ${t.movimentoId} is null))`,
    ),
  ],
);

/**
 * O último número de solicitação de cada organização (change p4d-solicitacoes, design, decisão 2).
 * O registro o incrementa na transação dele, que trava a linha até o commit: sem buraco nem
 * repetição, também com dois registros ao mesmo tempo.
 */
export const numeracaoDasSolicitacoes = orgScoped(
  'numeracao_das_solicitacoes',
  {
    ultimo: integer('ultimo').notNull(),
  },
  (t) => [
    unique('numeracao_das_solicitacoes_org_unica').on(t.orgId),
    check('numeracao_das_solicitacoes_ultimo_valido', sql`${t.ultimo} >= 1`),
  ],
);

/** As situações da ordem de serviço, as mesmas do domínio (P4e). */
export const SITUACOES_DA_ORDEM_NO_BANCO = [
  'aberta',
  'em-atendimento',
  'aguardando-peca',
  'aguardando-fornecedor',
  'resolvida',
  'encerrada',
] as const;

/**
 * A ordem de serviço (spec ordens-de-servico; change p4e-ordens-de-servico, design, decisões 2 e
 * 7): o número sequencial na organização, o ativo, o local dele na abertura, que vale para ver e
 * para atender, a solicitação de conserto de origem, o problema, a situação, o fornecedor, a
 * resolução e o encerramento. O papel da aplicação não apaga (migration 0039).
 */
export const ordensDeServico = orgScoped(
  'ordens_de_servico',
  {
    numero: integer('numero').notNull(),
    ativoId: uuid('ativo_id').notNull(),
    localId: uuid('local_id'),
    solicitacaoId: uuid('solicitacao_id'),
    problema: text('problema').notNull(),
    situacao: text('situacao', { enum: SITUACOES_DA_ORDEM_NO_BANCO }).notNull(),
    fornecedorId: uuid('fornecedor_id'),
    osDoFornecedor: text('os_do_fornecedor'),
    solucao: text('solucao'),
    motivoDoEncerramento: text('motivo_do_encerramento'),
    abertaPor: uuid('aberta_por').notNull(),
    abertaEm: momento('aberta_em').notNull().defaultNow(),
    resolvidaPor: uuid('resolvida_por'),
    resolvidaEm: momento('resolvida_em'),
    encerradaPor: uuid('encerrada_por'),
    encerradaEm: momento('encerrada_em'),
  },
  (t) => [
    foreignKey({
      name: 'ordens_de_servico_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'ordens_de_servico_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'ordens_de_servico_solicitacao_fk',
      columns: [t.orgId, t.solicitacaoId],
      foreignColumns: [solicitacoes.orgId, solicitacoes.id],
    }),
    foreignKey({
      name: 'ordens_de_servico_fornecedor_fk',
      columns: [t.orgId, t.fornecedorId],
      foreignColumns: [fornecedores.orgId, fornecedores.id],
    }),
    foreignKey({
      name: 'ordens_de_servico_aberta_por_fk',
      columns: [t.orgId, t.abertaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'ordens_de_servico_resolvida_por_fk',
      columns: [t.orgId, t.resolvidaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'ordens_de_servico_encerrada_por_fk',
      columns: [t.orgId, t.encerradaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('ordens_de_servico_numero_unico').on(t.orgId, t.numero),
    // Uma OS por solicitação; a OS aberta direto no ativo não tem solicitação.
    unique('ordens_de_servico_solicitacao_unica').on(t.orgId, t.solicitacaoId),
    // A lista vem das mais novas para as mais antigas, com o filtro das em aberto por padrão.
    index('ordens_de_servico_aberta_idx').on(t.orgId, t.abertaEm.desc(), t.id.desc()),
    index('ordens_de_servico_situacao_idx').on(t.orgId, t.situacao, t.abertaEm.desc(), t.id.desc()),
    index('ordens_de_servico_ativo_idx').on(t.orgId, t.ativoId),
    index('ordens_de_servico_local_idx').on(t.orgId, t.localId),
    // As resolvidas no período, para o tempo de resolução (change p4f-indicadores-da-operacao).
    index('ordens_de_servico_resolvida_idx')
      .on(t.orgId, t.resolvidaEm)
      .where(sql`${t.resolvidaEm} is not null`),
    check(
      'ordens_de_servico_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_ORDEM_NO_BANCO)})`,
    ),
    check(
      'ordens_de_servico_textos_validos',
      sql`length(trim(${t.problema})) between 1 and 1000 and ${textoAte(t.osDoFornecedor, 40)}
        and ${textoAte(t.solucao, 1000)} and ${textoAte(t.motivoDoEncerramento, 200)}`,
    ),
    // Em implicações, para uma situação desconhecida ficar com a checagem da situação. A Aguardando
    // fornecedor tem o fornecedor, e a OS dele pede o fornecedor, que fica na OS depois.
    check(
      'ordens_de_servico_fornecedor_coerente',
      sql`(${t.situacao} <> 'aguardando-fornecedor' or ${t.fornecedorId} is not null)
        and (${t.osDoFornecedor} is null or ${t.fornecedorId} is not null)`,
    ),
    // A resolvida tem o que foi feito, quem e quando; a em aberto não tem, porque a reabertura a
    // limpa, e ela fica no histórico.
    check(
      'ordens_de_servico_resolucao_coerente',
      sql`(${t.resolvidaEm} is null) = (${t.resolvidaPor} is null)
        and (${t.resolvidaEm} is null) = (${t.solucao} is null)
        and (${t.situacao} <> 'resolvida' or ${t.resolvidaEm} is not null)
        and (${t.situacao} in ('resolvida', 'encerrada') or ${t.resolvidaEm} is null)`,
    ),
    // A encerrada tem quem e quando, e o motivo só a encerrada sem resolver.
    check(
      'ordens_de_servico_encerramento_coerente',
      sql`(${t.situacao} = 'encerrada') = (${t.encerradaEm} is not null)
        and (${t.encerradaEm} is null) = (${t.encerradaPor} is null)
        and (${t.motivoDoEncerramento} is null or ${t.situacao} = 'encerrada')
        and (${t.situacao} <> 'encerrada'
          or (${t.resolvidaEm} is null) = (${t.motivoDoEncerramento} is not null))`,
    ),
  ],
);

/**
 * O histórico das situações de cada OS (spec ordens-de-servico, "Situação e histórico da OS"): a
 * situação nova, o texto (a observação, o que foi feito ou o motivo), o fornecedor da Aguardando
 * fornecedor, quem mudou e quando. O papel da aplicação só inclui e lê (migration 0039).
 */
export const historicoDasOrdens = orgScoped(
  'historico_das_ordens',
  {
    ordemId: uuid('ordem_id').notNull(),
    situacao: text('situacao', { enum: SITUACOES_DA_ORDEM_NO_BANCO }).notNull(),
    texto: text('texto'),
    fornecedorId: uuid('fornecedor_id'),
    mudadaPor: uuid('mudada_por').notNull(),
    mudadaEm: momento('mudada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'historico_das_ordens_ordem_fk',
      columns: [t.orgId, t.ordemId],
      foreignColumns: [ordensDeServico.orgId, ordensDeServico.id],
    }),
    foreignKey({
      name: 'historico_das_ordens_fornecedor_fk',
      columns: [t.orgId, t.fornecedorId],
      foreignColumns: [fornecedores.orgId, fornecedores.id],
    }),
    foreignKey({
      name: 'historico_das_ordens_mudada_por_fk',
      columns: [t.orgId, t.mudadaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('historico_das_ordens_ordem_idx').on(t.orgId, t.ordemId, t.mudadaEm),
    check(
      'historico_das_ordens_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_ORDEM_NO_BANCO)})`,
    ),
    check('historico_das_ordens_texto_valido', textoAte(t.texto, 1000)),
    check(
      'historico_das_ordens_fornecedor_coerente',
      sql`(${t.situacao} = 'aguardando-fornecedor') = (${t.fornecedorId} is not null)`,
    ),
  ],
);

/**
 * As peças lançadas em cada OS (spec ordens-de-servico, "Peças da OS"): o consumível, a quantidade,
 * o local de origem e a saída do estoque que a peça lançou, uma vez. O papel da aplicação só
 * inclui e lê (migration 0039).
 */
export const pecasDasOrdens = orgScoped(
  'pecas_das_ordens',
  {
    ordemId: uuid('ordem_id').notNull(),
    consumivelId: uuid('consumivel_id').notNull(),
    quantidade: integer('quantidade').notNull(),
    localId: uuid('local_id').notNull(),
    movimentoId: uuid('movimento_id').notNull(),
    lancadaPor: uuid('lancada_por').notNull(),
    lancadaEm: momento('lancada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'pecas_das_ordens_ordem_fk',
      columns: [t.orgId, t.ordemId],
      foreignColumns: [ordensDeServico.orgId, ordensDeServico.id],
    }),
    foreignKey({
      name: 'pecas_das_ordens_consumivel_fk',
      columns: [t.orgId, t.consumivelId],
      foreignColumns: [consumiveis.orgId, consumiveis.id],
    }),
    foreignKey({
      name: 'pecas_das_ordens_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'pecas_das_ordens_movimento_fk',
      columns: [t.orgId, t.movimentoId],
      foreignColumns: [movimentosDoEstoque.orgId, movimentosDoEstoque.id],
    }),
    foreignKey({
      name: 'pecas_das_ordens_lancada_por_fk',
      columns: [t.orgId, t.lancadaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('pecas_das_ordens_movimento_unico').on(t.orgId, t.movimentoId),
    index('pecas_das_ordens_ordem_idx').on(t.orgId, t.ordemId),
    check('pecas_das_ordens_quantidade_valida', sql`${t.quantidade} between 1 and 100000`),
  ],
);

/**
 * O último número de OS de cada organização, separado do das solicitações (change
 * p4e-ordens-de-servico, design, decisão 2): sem buraco nem repetição, como o das solicitações.
 */
export const numeracaoDasOrdens = orgScoped(
  'numeracao_das_ordens',
  {
    ultimo: integer('ultimo').notNull(),
  },
  (t) => [
    unique('numeracao_das_ordens_org_unica').on(t.orgId),
    check('numeracao_das_ordens_ultimo_valido', sql`${t.ultimo} >= 1`),
  ],
);

/**
 * Os indicadores, como o banco os guarda: os dos alertas (spec indicadores) e os da operação (spec
 * indicadores-da-operacao, migration 0040).
 */
export const INDICADORES_NO_BANCO = [
  'toner',
  'critico',
  'disponibilidade',
  'que-voltam',
  'resolucao-das-os',
  'os-repetidas',
  'paginas-por-toner',
] as const;

/**
 * Os indicadores da organização (spec indicadores, "Metas da organização" e "Indicador fora da meta
 * avisa"; change p3d-indicadores, design, decisão 3): a meta escolhida, na unidade do indicador,
 * com quem a mudou e quando, e a marca da avaliação diária, de quando o indicador está fora da meta.
 * Sem linha, vale a meta de fábrica, e o indicador nunca foi avaliado.
 */
export const indicadoresDaOrganizacao = orgScoped(
  'indicadores_da_organizacao',
  {
    indicador: text('indicador', { enum: INDICADORES_NO_BANCO }).notNull(),
    meta: integer('meta'),
    metaAlteradaEm: momento('meta_alterada_em'),
    metaAlteradaPor: uuid('meta_alterada_por'),
    foraDaMetaDesde: momento('fora_da_meta_desde'),
  },
  (t) => [
    foreignKey({
      name: 'indicadores_da_organizacao_alterada_por_fk',
      columns: [t.orgId, t.metaAlteradaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('indicadores_da_organizacao_indicador_unico').on(t.orgId, t.indicador),
    check(
      'indicadores_da_organizacao_indicador_valido',
      sql`${t.indicador} in (${lista(INDICADORES_NO_BANCO)})`,
    ),
    check('indicadores_da_organizacao_meta_valida', sql`${t.meta} is null or ${t.meta} > 0`),
  ],
);

/** As medidas dos indicadores criados, como o domínio as define. */
export const MEDIDAS_DOS_INDICADORES_NO_BANCO = [
  'toner',
  'critico',
  'disponibilidade',
  'que-voltam',
  'backups-do-control-id',
] as const;

/**
 * Os indicadores criados pela organização (spec indicadores, "Indicadores da organização"; change
 * regras-indicadores-e-tarefas, design, decisão 3): a medida, o recorte opcional (o tipo ou o
 * modelo, e o local) e a meta, com o nome único na organização.
 */
export const indicadoresCriados = orgScoped(
  'indicadores_criados',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    medida: text('medida', { enum: MEDIDAS_DOS_INDICADORES_NO_BANCO }).notNull(),
    tipoId: uuid('tipo_id'),
    modeloId: uuid('modelo_id'),
    localId: uuid('local_id'),
    meta: integer('meta').notNull(),
    criadoPor: uuid('criado_por'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('indicadores_criados_nome_unico').on(t.orgId, t.nomeNormalizado),
    foreignKey({
      name: 'indicadores_criados_tipo_fk',
      columns: [t.orgId, t.tipoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    foreignKey({
      name: 'indicadores_criados_modelo_fk',
      columns: [t.orgId, t.modeloId],
      foreignColumns: [modelos.orgId, modelos.id],
    }),
    foreignKey({
      name: 'indicadores_criados_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'indicadores_criados_criado_por_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    check('indicadores_criados_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check(
      'indicadores_criados_medida_valida',
      sql`${t.medida} in (${lista(MEDIDAS_DOS_INDICADORES_NO_BANCO)})`,
    ),
    check('indicadores_criados_tipo_ou_modelo', sql`${t.tipoId} is null or ${t.modeloId} is null`),
    check('indicadores_criados_meta_valida', sql`${t.meta} > 0`),
  ],
);

/**
 * Os registros da operação do servidor (spec isolamento-organizacoes, "Infraestrutura fora das
 * organizações"; design do F2d, decisão 14): o esquema `operacao`, fora das organizações e sem
 * RLS, como o da fila, porque os backups são do servidor e não de uma organização. Não há dado de
 * negócio nele, e só a organização que opera o servidor o vê, pela tela de backup. O papel da
 * aplicação lê e grava as linhas, sem mudar a estrutura (migration 0016).
 */
export const esquemaDaOperacao = pgSchema('operacao');

/** A situação de um backup ou de um teste de restauração. */
export const SITUACOES_DA_OPERACAO = ['em-andamento', 'feito', 'falhou'] as const;

/** Quem pediu o backup: o horário da agenda, a tela de backup ou o comando de operação. */
export const PEDIDOS_DE_BACKUP = ['agenda', 'tela', 'comando'] as const;

/**
 * Um backup, do começo ao fim. A pasta é o nome dele em cada destino (`AAAA-MM-DDTHHmmZ`), e os
 * destinos dizem onde chegou e onde falhou. A retenção apaga as pastas e marca `removido_em`; a
 * linha fica, para o teste de restauração continuar dizendo qual backup testou. Só um backup fica
 * em andamento de cada vez.
 */
export const backups = esquemaDaOperacao.table(
  'backups',
  {
    id: id(),
    iniciadoEm: momento('iniciado_em').notNull().defaultNow(),
    terminadoEm: momento('terminado_em'),
    situacao: text('situacao', { enum: SITUACOES_DA_OPERACAO }).notNull().default('em-andamento'),
    pedidoPor: text('pedido_por', { enum: PEDIDOS_DE_BACKUP }).notNull(),
    tamanho: bigint('tamanho', { mode: 'number' }),
    destinos: jsonb('destinos').$type<Record<string, unknown>[]>().notNull().default([]),
    pasta: text('pasta'),
    manifesto: jsonb('manifesto').$type<Record<string, unknown>>(),
    erro: text('erro'),
    removidoEm: momento('removido_em'),
  },
  (t) => [
    index('backups_lista_idx').on(t.iniciadoEm.desc()),
    uniqueIndex('backups_um_em_andamento')
      .on(t.situacao)
      .where(sql`${t.situacao} = 'em-andamento'`),
    check('backups_situacao_valida', sql`${t.situacao} in (${lista(SITUACOES_DA_OPERACAO)})`),
    check('backups_pedido_por_valido', sql`${t.pedidoPor} in (${lista(PEDIDOS_DE_BACKUP)})`),
    check(
      'backups_fim_com_a_situacao',
      sql`(${t.situacao} = 'em-andamento') = (${t.terminadoEm} is null)`,
    ),
    check('backups_erro_so_na_falha', sql`(${t.situacao} = 'falhou') = (${t.erro} is not null)`),
    check('backups_erro_curto', sql`${t.erro} is null or length(${t.erro}) between 1 and 2000`),
    check('backups_tamanho_valido', sql`${t.tamanho} is null or ${t.tamanho} >= 0`),
    check(
      'backups_destinos_validos',
      sql`jsonb_typeof(${t.destinos}) = 'array' and octet_length(${t.destinos}::text) <= 8192`,
    ),
    check(
      'backups_pasta_valida',
      sql`${t.pasta} is null or ${t.pasta} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z(-[0-9]+)?$'`,
    ),
    check(
      'backups_manifesto_valido',
      sql`${t.manifesto} is null or jsonb_typeof(${t.manifesto}) = 'object'`,
    ),
    check(
      'backups_removido_terminado',
      sql`${t.removidoEm} is null or ${t.situacao} <> 'em-andamento'`,
    ),
  ],
);

/**
 * Um teste de restauração, num banco descartável da instância de teste (design do F2d, decisão
 * 13). Sem backup pronto, ele falha sem apontar nenhum. Os detalhes são as contagens comparadas
 * com o manifesto. Só um teste fica em andamento de cada vez.
 */
export const testesDeRestauracao = esquemaDaOperacao.table(
  'testes_de_restauracao',
  {
    id: id(),
    iniciadoEm: momento('iniciado_em').notNull().defaultNow(),
    terminadoEm: momento('terminado_em'),
    backupId: uuid('backup_id').references(() => backups.id, { onDelete: 'set null' }),
    situacao: text('situacao', { enum: SITUACOES_DA_OPERACAO }).notNull().default('em-andamento'),
    erro: text('erro'),
    detalhes: jsonb('detalhes').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('testes_de_restauracao_lista_idx').on(t.iniciadoEm.desc()),
    uniqueIndex('testes_de_restauracao_um_em_andamento')
      .on(t.situacao)
      .where(sql`${t.situacao} = 'em-andamento'`),
    check(
      'testes_de_restauracao_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_OPERACAO)})`,
    ),
    check(
      'testes_de_restauracao_fim_com_a_situacao',
      sql`(${t.situacao} = 'em-andamento') = (${t.terminadoEm} is null)`,
    ),
    check(
      'testes_de_restauracao_erro_so_na_falha',
      sql`(${t.situacao} = 'falhou') = (${t.erro} is not null)`,
    ),
    check(
      'testes_de_restauracao_erro_curto',
      sql`${t.erro} is null or length(${t.erro}) between 1 and 2000`,
    ),
    check(
      'testes_de_restauracao_detalhes_validos',
      sql`jsonb_typeof(${t.detalhes}) = 'object' and octet_length(${t.detalhes}::text) <= 8192`,
    ),
  ],
);

/**
 * O horário do backup (`HH:MM`, no fuso do servidor) e o dia da semana do teste de restauração
 * (0 é domingo), que a tela muda dentro dos limites da configuração. Uma linha só, criada pela
 * migration com 02:00 e o domingo.
 */
export const agendaDaOperacao = esquemaDaOperacao.table(
  'agenda',
  {
    id: smallint('id').primaryKey().default(1),
    horario: text('horario').notNull().default('02:00'),
    diaDoTeste: smallint('dia_do_teste').notNull().default(0),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
  },
  (t) => [
    check('agenda_uma_linha', sql`${t.id} = 1`),
    check('agenda_horario_valido', sql`${t.horario} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('agenda_dia_do_teste_valido', sql`${t.diaDoTeste} between 0 and 6`),
  ],
);

/** As situações do backup do Control iD, as mesmas do domínio (P5a). */
export const SITUACOES_DO_BACKUP_NO_BANCO = [
  'na-fila',
  'em-andamento',
  'sucesso',
  'parcial',
  'falha',
] as const;

/** As origens do backup do Control iD: o pedido de alguém ou a agenda do tipo. */
export const ORIGENS_DO_BACKUP_NO_BANCO = ['manual', 'agendado'] as const;

/**
 * O backup do Control iD (spec backup-do-control-id; change p5a-backup-do-control-id, design,
 * decisão 2): o pedido e o histórico numa linha só. Na fila, o coletor ainda não buscou; em
 * andamento, ele buscou; no fim, o resultado, com a chave do ZIP no armazenamento da API, o tamanho,
 * os registros, as fotos, a série, o firmware, o modelo e as categorias. Um pedido aberto por
 * controle. A retenção e a exclusão apagam a linha, e o arquivo sai depois do commit.
 */
export const backupsDoControlId = orgScoped(
  'backups_do_control_id',
  {
    ativoId: uuid('ativo_id').notNull(),
    origem: text('origem', { enum: ORIGENS_DO_BACKUP_NO_BANCO }).notNull(),
    situacao: text('situacao', { enum: SITUACOES_DO_BACKUP_NO_BANCO }).notNull(),
    pedidoPor: uuid('pedido_por'),
    pedidoEm: momento('pedido_em').notNull().defaultNow(),
    iniciadoEm: momento('iniciado_em'),
    concluidoEm: momento('concluido_em'),
    coletorId: uuid('coletor_id'),
    arquivo: text('arquivo'),
    tamanho: bigint('tamanho', { mode: 'number' }),
    registros: integer('registros'),
    fotos: integer('fotos'),
    serie: text('serie'),
    firmware: text('firmware'),
    modelo: text('modelo'),
    categorias:
      jsonb('categorias').$type<
        { categoria: string; situacao: 'ok' | 'erro'; quantidade: number; erro?: string }[]
      >(),
    erro: text('erro'),
  },
  (t) => [
    foreignKey({
      name: 'backups_do_control_id_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'backups_do_control_id_pedido_por_fk',
      columns: [t.orgId, t.pedidoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'backups_do_control_id_coletor_fk',
      columns: [t.orgId, t.coletorId],
      foreignColumns: [coletores.orgId, coletores.id],
    }),
    // Um pedido aberto por controle: o segundo "Fazer backup agora" e a agenda não duplicam.
    uniqueIndex('backups_do_control_id_aberto_unico')
      .on(t.orgId, t.ativoId)
      .where(sql`${t.situacao} in ('na-fila', 'em-andamento')`),
    // A ficha lê os do controle, e a tela lê todos, dos mais novos para os mais antigos.
    index('backups_do_control_id_ativo_idx').on(t.orgId, t.ativoId, t.pedidoEm.desc()),
    index('backups_do_control_id_pedido_idx').on(t.orgId, t.pedidoEm.desc(), t.id.desc()),
    check(
      'backups_do_control_id_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DO_BACKUP_NO_BANCO)})`,
    ),
    check(
      'backups_do_control_id_origem_valida',
      sql`${t.origem} in (${lista(ORIGENS_DO_BACKUP_NO_BANCO)})`,
    ),
    // O fim tem o momento; o pedido aberto não tem. O arquivo é só do Sucesso e do Parcial. Em
    // implicações, para uma situação desconhecida ficar com a checagem da situação.
    check(
      'backups_do_control_id_fim_coerente',
      sql`(${t.situacao} not in ('na-fila', 'em-andamento') or ${t.concluidoEm} is null)
        and (${t.situacao} not in ('sucesso', 'parcial', 'falha') or ${t.concluidoEm} is not null)
        and (${t.arquivo} is null or ${t.situacao} in ('sucesso', 'parcial'))`,
    ),
    check(
      'backups_do_control_id_textos_validos',
      sql`${textoAte(t.erro, 2000)} and ${textoAte(t.serie, 100)}
        and ${textoAte(t.firmware, 100)} and ${textoAte(t.modelo, 100)}`,
    ),
  ],
);

/** Os tipos de operação no controle, os mesmos do domínio (P5b). */
export const TIPOS_DE_OPERACAO_NO_BANCO = ['restauracao', 'comparacao'] as const;

/**
 * A operação num controle do Control iD (spec comparacao-e-restauracao-do-control-id; change
 * p5b-comparacao-e-restauracao, design, decisão 1): a restauração de um backup ou a comparação dele
 * com o controle, pedida ao coletor como o backup. Guarda o backup, que a leva junto quando sai, o
 * controle de destino, as categorias escolhidas (nulo para todas), o resultado por categoria, o aviso
 * do modelo e o erro. Uma operação aberta por controle.
 */
export const operacoesDoControlId = orgScoped(
  'operacoes_do_control_id',
  {
    backupId: uuid('backup_id').notNull(),
    ativoId: uuid('ativo_id').notNull(),
    tipo: text('tipo', { enum: TIPOS_DE_OPERACAO_NO_BANCO }).notNull(),
    situacao: text('situacao', { enum: SITUACOES_DO_BACKUP_NO_BANCO }).notNull(),
    categorias: text('categorias').array(),
    pedidoPor: uuid('pedido_por'),
    pedidoEm: momento('pedido_em').notNull().defaultNow(),
    iniciadoEm: momento('iniciado_em'),
    concluidoEm: momento('concluido_em'),
    coletorId: uuid('coletor_id'),
    resultado: jsonb('resultado').$type<Record<string, unknown>[]>(),
    aviso: text('aviso'),
    erro: text('erro'),
  },
  (t) => [
    foreignKey({
      name: 'operacoes_do_control_id_backup_fk',
      columns: [t.orgId, t.backupId],
      foreignColumns: [backupsDoControlId.orgId, backupsDoControlId.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'operacoes_do_control_id_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'operacoes_do_control_id_pedido_por_fk',
      columns: [t.orgId, t.pedidoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'operacoes_do_control_id_coletor_fk',
      columns: [t.orgId, t.coletorId],
      foreignColumns: [coletores.orgId, coletores.id],
    }),
    uniqueIndex('operacoes_do_control_id_aberta_unica')
      .on(t.orgId, t.ativoId)
      .where(sql`${t.situacao} in ('na-fila', 'em-andamento')`),
    index('operacoes_do_control_id_ativo_idx').on(t.orgId, t.ativoId, t.pedidoEm.desc()),
    index('operacoes_do_control_id_backup_idx').on(t.orgId, t.backupId),
    check(
      'operacoes_do_control_id_tipo_valido',
      sql`${t.tipo} in (${lista(TIPOS_DE_OPERACAO_NO_BANCO)})`,
    ),
    check(
      'operacoes_do_control_id_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DO_BACKUP_NO_BANCO)})`,
    ),
    check(
      'operacoes_do_control_id_fim_coerente',
      sql`(${t.situacao} not in ('na-fila', 'em-andamento') or ${t.concluidoEm} is null)
        and (${t.situacao} not in ('sucesso', 'parcial', 'falha') or ${t.concluidoEm} is not null)`,
    ),
    check(
      'operacoes_do_control_id_textos_validos',
      sql`${textoAte(t.erro, 2000)} and ${textoAte(t.aviso, 500)}`,
    ),
  ],
);

/** As situações da planta: a conversão do arquivo, a planta ativa, a que falhou e a inativa (P7). */
export const SITUACOES_DA_PLANTA_NO_BANCO = ['convertendo', 'ativa', 'falhou', 'inativa'] as const;

/**
 * A planta da organização (spec mapa-da-planta; change p7-mapa-da-planta, design, decisão 3): o
 * nome, o local opcional, a chave do modelo no armazenamento da API, as medidas em metros, as
 * contagens do que veio do arquivo, a situação da conversão, o erro e a fonte.
 */
export const plantas = orgScoped(
  'plantas',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    localId: uuid('local_id'),
    modelo: text('modelo'),
    largura: doublePrecision('largura'),
    profundidade: doublePrecision('profundidade'),
    contagens: jsonb('contagens').$type<Record<string, number>>(),
    situacao: text('situacao', { enum: SITUACOES_DA_PLANTA_NO_BANCO }).notNull(),
    erro: text('erro'),
    fonte: text('fonte').notNull(),
    criadaPor: uuid('criada_por'),
    criadaEm: momento('criada_em').notNull().defaultNow(),
    atualizadaEm: momento('atualizada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'plantas_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    foreignKey({
      name: 'plantas_criada_por_fk',
      columns: [t.orgId, t.criadaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('plantas_nome_idx').on(t.orgId, t.nomeNormalizado),
    check(
      'plantas_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_PLANTA_NO_BANCO)})`,
    ),
    check('plantas_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check('plantas_textos_validos', sql`${textoAte(t.erro, 1000)} and ${textoAte(t.fonte, 200)}`),
  ],
);

/**
 * A posição de um alvo numa planta (spec mapa-da-planta, "Posição dos ativos na planta" e "Camadas
 * dos módulos no mapa"): o alvo é o tipo e o id, sem chave estrangeira, porque pode ser de outro
 * módulo, como as salas e os dashboards; o ponto em metros; quem mudou e quando. Uma por planta e
 * alvo; sai com a planta.
 */
export const posicoesNaPlanta = orgScoped(
  'posicoes_na_planta',
  {
    plantaId: uuid('planta_id').notNull(),
    alvoTipo: text('alvo_tipo').notNull(),
    alvoId: uuid('alvo_id').notNull(),
    x: doublePrecision('x').notNull(),
    z: doublePrecision('z').notNull(),
    mudadaPor: uuid('mudada_por'),
    mudadaEm: momento('mudada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'posicoes_na_planta_planta_fk',
      columns: [t.orgId, t.plantaId],
      foreignColumns: [plantas.orgId, plantas.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'posicoes_na_planta_mudada_por_fk',
      columns: [t.orgId, t.mudadaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('posicoes_na_planta_alvo_unico').on(t.orgId, t.plantaId, t.alvoTipo, t.alvoId),
    index('posicoes_na_planta_alvo_idx').on(t.orgId, t.alvoTipo, t.alvoId),
    check('posicoes_na_planta_alvo_valido', sql`${t.alvoTipo} ~ '^[a-z][a-z-]{1,39}$'`),
    check(
      'posicoes_na_planta_ponto_valido',
      sql`${t.x} between -100000 and 100000 and ${t.z} between -100000 and 100000`,
    ),
  ],
);

/**
 * As salas de reunião (spec salas-de-reuniao, "Salas e itens solicitáveis"; change
 * salas-de-reuniao, design, decisão 1): o nome único na organização, o local opcional, a capacidade
 * e os recursos em texto.
 */
export const salas = orgScoped(
  'salas',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    localId: uuid('local_id'),
    capacidade: integer('capacidade'),
    recursos: text('recursos'),
    situacao: text('situacao', { enum: ['ativo', 'inativo'] })
      .notNull()
      .default('ativo'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('salas_nome_unico').on(t.orgId, t.nomeNormalizado),
    foreignKey({
      name: 'salas_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    check('salas_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check(
      'salas_capacidade_valida',
      sql`${t.capacidade} is null or ${t.capacidade} between 1 and 500`,
    ),
    check('salas_recursos_validos', textoAte(t.recursos, 500)),
  ],
);

/** Os itens que a reserva pede, como o projetor (spec salas-de-reuniao). */
export const itensDasSalas = orgScoped(
  'itens_das_salas',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    descricao: text('descricao'),
    situacao: text('situacao', { enum: ['ativo', 'inativo'] })
      .notNull()
      .default('ativo'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('itens_das_salas_nome_unico').on(t.orgId, t.nomeNormalizado),
    check('itens_das_salas_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check('itens_das_salas_descricao_valida', textoAte(t.descricao, 200)),
  ],
);

export const SITUACOES_DA_RESERVA_NO_BANCO = [
  'pendente',
  'aprovada',
  'recusada',
  'cancelada',
] as const;

/**
 * As reservas das salas (spec salas-de-reuniao, "Pedido de reserva" e "Aprovação e
 * cancelamento"): a sala, o horário, o assunto e o comentário, quem pediu, a decisão e os itens,
 * pelos ids. O conflito de horário, a API confere com a sala trancada (design, decisão 2).
 */
export const reservasDasSalas = orgScoped(
  'reservas_das_salas',
  {
    salaId: uuid('sala_id').notNull(),
    inicio: momento('inicio').notNull(),
    fim: momento('fim').notNull(),
    assunto: text('assunto').notNull(),
    comentario: text('comentario'),
    situacao: text('situacao', { enum: SITUACOES_DA_RESERVA_NO_BANCO }).notNull(),
    itens: jsonb('itens').$type<string[]>().notNull().default([]),
    pedidaPor: uuid('pedida_por').notNull(),
    pedidaEm: momento('pedida_em').notNull().defaultNow(),
    decididaPor: uuid('decidida_por'),
    decididaEm: momento('decidida_em'),
    motivo: text('motivo'),
  },
  (t) => [
    foreignKey({
      name: 'reservas_das_salas_sala_fk',
      columns: [t.orgId, t.salaId],
      foreignColumns: [salas.orgId, salas.id],
    }),
    foreignKey({
      name: 'reservas_das_salas_pedida_por_fk',
      columns: [t.orgId, t.pedidaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    foreignKey({
      name: 'reservas_das_salas_decidida_por_fk',
      columns: [t.orgId, t.decididaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('reservas_das_salas_agenda_idx').on(t.orgId, t.salaId, t.inicio),
    check('reservas_das_salas_horario_valido', sql`${t.fim} > ${t.inicio}`),
    check('reservas_das_salas_assunto_valido', sql`length(trim(${t.assunto})) between 1 and 120`),
    check(
      'reservas_das_salas_textos_validos',
      sql`${textoAte(t.comentario, 1000)} and ${textoAte(t.motivo, 300)}`,
    ),
    check(
      'reservas_das_salas_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_RESERVA_NO_BANCO)})`,
    ),
  ],
);

export const RESPOSTAS_DO_CONVITE_NO_BANCO = ['sem-resposta', 'aceitou', 'recusou'] as const;

/** Os participantes de cada reserva e a resposta de cada um (spec salas-de-reuniao). */
export const participantesDasReservas = orgScoped(
  'participantes_das_reservas',
  {
    reservaId: uuid('reserva_id').notNull(),
    contaId: uuid('conta_id').notNull(),
    resposta: text('resposta', { enum: RESPOSTAS_DO_CONVITE_NO_BANCO })
      .notNull()
      .default('sem-resposta'),
    respondidoEm: momento('respondido_em'),
  },
  (t) => [
    foreignKey({
      name: 'participantes_das_reservas_reserva_fk',
      columns: [t.orgId, t.reservaId],
      foreignColumns: [reservasDasSalas.orgId, reservasDasSalas.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'participantes_das_reservas_conta_fk',
      columns: [t.orgId, t.contaId],
      foreignColumns: [contas.orgId, contas.id],
    }),
    unique('participantes_das_reservas_unico').on(t.orgId, t.reservaId, t.contaId),
    index('participantes_das_reservas_conta_idx').on(t.orgId, t.contaId),
    check(
      'participantes_das_reservas_resposta_valida',
      sql`${t.resposta} in (${lista(RESPOSTAS_DO_CONVITE_NO_BANCO)})`,
    ),
  ],
);

export const SITUACOES_DO_PAINEL_NO_BANCO = ['sem-verificacao', 'no-ar', 'fora-do-ar'] as const;

/** As exibições do painel, as mesmas do domínio (`EXIBICOES_DO_PAINEL`), conferidas pelo banco. */
export const EXIBICOES_DO_PAINEL_NO_BANCO = ['aparece', 'recusa', 'pede-entrada'] as const;

/**
 * Os painéis das VMs (spec painel-de-dashboards, "Painéis cadastrados" e "Verificação dos
 * painéis"; change painel-de-dashboards, design, decisão 1): o cadastro, com o endereço e a ordem
 * na grade, e a última verificação, sem histórico.
 *
 * A exibição (spec painel-de-dashboards, "Exibição do painel"; change diagnostico-dos-paineis,
 * design, decisão 2) é o que a última verificação leu da resposta do painel no ar; fica nula no
 * painel fora do ar e no ainda não verificado.
 */
export const paineis = orgScoped(
  'paineis',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    endereco: text('endereco').notNull(),
    localId: uuid('local_id'),
    ordem: integer('ordem').notNull().default(100),
    situacao: text('situacao', { enum: ['ativo', 'inativo'] })
      .notNull()
      .default('ativo'),
    verificacao: text('verificacao', { enum: SITUACOES_DO_PAINEL_NO_BANCO })
      .notNull()
      .default('sem-verificacao'),
    verificadoEm: momento('verificado_em'),
    tempoDaResposta: integer('tempo_da_resposta'),
    motivo: text('motivo'),
    exibicao: text('exibicao', { enum: EXIBICOES_DO_PAINEL_NO_BANCO }),
    motivoDaExibicao: text('motivo_da_exibicao'),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('paineis_nome_unico').on(t.orgId, t.nomeNormalizado),
    foreignKey({
      name: 'paineis_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    check('paineis_nome_valido', sql`length(trim(${t.nome})) between 1 and 80`),
    check(
      'paineis_endereco_valido',
      sql`${t.endereco} ~ '^https?://' and length(${t.endereco}) <= 500`,
    ),
    check('paineis_ordem_valida', sql`${t.ordem} between 1 and 999`),
    check(
      'paineis_verificacao_valida',
      sql`${t.verificacao} in (${lista(SITUACOES_DO_PAINEL_NO_BANCO)})`,
    ),
    check('paineis_motivo_valido', textoAte(t.motivo, 200)),
    check(
      'paineis_exibicao_valida',
      sql`${t.exibicao} is null or ${t.exibicao} in (${lista(EXIBICOES_DO_PAINEL_NO_BANCO)})`,
    ),
    check('paineis_motivo_da_exibicao_valido', textoAte(t.motivoDaExibicao, 200)),
  ],
);

/**
 * O diretório da organização (spec diretorio-ad; change integracao-ad-ldap), um por organização: o
 * servidor, a base, a conta de serviço do Cofre, o atributo do usuário e o filtro das pessoas. O
 * certificado da AC do servidor, em PEM, é a AC da empresa que emite o LDAPS (change
 * guia-do-diretorio); ele não é segredo.
 */
export const diretorios = orgScoped(
  'diretorios',
  {
    servidor: text('servidor').notNull(),
    baseDn: text('base_dn').notNull(),
    segredoId: uuid('segredo_id').notNull(),
    atributoDoUsuario: text('atributo_do_usuario').notNull(),
    filtroDasPessoas: text('filtro_das_pessoas').notNull(),
    conferirCertificado: boolean('conferir_certificado').notNull().default(true),
    acDoServidor: text('ac_do_servidor'),
    ligado: boolean('ligado').notNull().default(false),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('diretorios_um_por_organizacao').on(t.orgId),
    foreignKey({
      name: 'diretorios_segredo_fk',
      columns: [t.orgId, t.segredoId],
      foreignColumns: [segredos.orgId, segredos.id],
    }),
    check(
      'diretorios_servidor_valido',
      sql`${t.servidor} ~* '^ldaps?://' and length(${t.servidor}) <= 300`,
    ),
    check('diretorios_base_valida', textoAte(t.baseDn, 500)),
    check('diretorios_atributo_valido', textoAte(t.atributoDoUsuario, 64)),
    check('diretorios_filtro_valido', textoAte(t.filtroDasPessoas, 1000)),
    check('diretorios_ac_valida', textoAte(t.acDoServidor, 20000)),
  ],
);

/** Um grupo do AD, pelo DN, ligado a um grupo do Grafite; o DN normalizado é único. */
export const mapeamentosDoDiretorio = orgScoped(
  'mapeamentos_do_diretorio',
  {
    grupoDn: text('grupo_dn').notNull(),
    grupoDnNormalizado: text('grupo_dn_normalizado').notNull(),
    grupoId: uuid('grupo_id').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('mapeamentos_do_diretorio_grupo_unico').on(t.orgId, t.grupoDnNormalizado),
    foreignKey({
      name: 'mapeamentos_do_diretorio_grupo_fk',
      columns: [t.orgId, t.grupoId],
      foreignColumns: [grupos.orgId, grupos.id],
    }),
    index('mapeamentos_do_diretorio_grupo_idx').on(t.orgId, t.grupoId),
    check('mapeamentos_do_diretorio_dn_valido', textoAte(t.grupoDn, 1000)),
  ],
);

/**
 * Tipo e local de entrada dos computadores, por organização. Tipo nulo desliga o cadastro
 * automático (change cadastrar-computadores-pelo-agente).
 */
export const cadastroDosAgentes = orgScoped(
  'cadastro_dos_agentes',
  {
    tipoId: uuid('tipo_id'),
    localId: uuid('local_id'),
  },
  (t) => [
    unique('cadastro_dos_agentes_organizacao_unica').on(t.orgId),
    foreignKey({
      name: 'cadastro_dos_agentes_tipo_fk',
      columns: [t.orgId, t.tipoId],
      foreignColumns: [tiposDeAtivo.orgId, tiposDeAtivo.id],
    }),
    foreignKey({
      name: 'cadastro_dos_agentes_local_fk',
      columns: [t.orgId, t.localId],
      foreignColumns: [locais.orgId, locais.id],
    }),
    check(
      'cadastro_dos_agentes_local_com_tipo',
      sql`${t.tipoId} is not null or ${t.localId} is null`,
    ),
  ],
);

/** O hash do endereço dos agentes: um em vigor por organização; gerar outro revoga o anterior. */
export const tokensDosAgentes = orgScoped(
  'tokens_dos_agentes',
  {
    hashDoToken: text('hash_do_token').notNull(),
    criadoPor: uuid('criado_por').notNull(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    revogadoEm: momento('revogado_em'),
  },
  (t) => [
    foreignKey({
      name: 'tokens_dos_agentes_conta_fk',
      columns: [t.orgId, t.criadoPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    uniqueIndex('tokens_dos_agentes_um_em_vigor').on(t.orgId).where(sql`${t.revogadoEm} is null`),
    check('tokens_dos_agentes_hash_valido', sql`length(${t.hashDoToken}) = 64`),
  ],
);

export const MOTIVOS_DA_PENDENCIA_DO_AGENTE = [
  'parcial',
  'hostname',
  'identidade',
  'tipo',
  'local',
  'campos',
] as const;

/** Os agentes do GLPI que falaram com o Grafite, pelo deviceid, com o ativo ligado. */
export const agentes = orgScoped(
  'agentes',
  {
    deviceid: text('deviceid').notNull(),
    nome: text('nome').notNull(),
    versao: text('versao'),
    serie: text('serie'),
    sistema: text('sistema'),
    ip: text('ip'),
    ativoId: uuid('ativo_id'),
    /** A ligação feita na tela, que o inventário não desfaz. */
    ligadoAMao: boolean('ligado_a_mao').notNull().default(false),
    primeiroContato: momento('primeiro_contato').notNull().defaultNow(),
    ultimoContato: momento('ultimo_contato').notNull().defaultNow(),
    ultimoInventario: momento('ultimo_inventario'),
    pendenciaCadastro: jsonb('pendencia_cadastro').$type<{
      motivo: (typeof MOTIVOS_DA_PENDENCIA_DO_AGENTE)[number];
      campos: string[];
    }>(),
  },
  (t) => [
    unique('agentes_deviceid_unico').on(t.orgId, t.deviceid),
    foreignKey({
      name: 'agentes_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    index('agentes_ativo_idx').on(t.orgId, t.ativoId),
    check('agentes_deviceid_valido', textoAte(t.deviceid, 200)),
    check('agentes_nome_valido', textoAte(t.nome, 200)),
  ],
);

/** Os softwares instalados no ativo, do último inventário completo do agente. */
export const softwaresDosAtivos = orgScoped(
  'softwares_dos_ativos',
  {
    ativoId: uuid('ativo_id').notNull(),
    nome: text('nome').notNull(),
    versao: text('versao'),
    editor: text('editor'),
    instaladoEm: date('instalado_em', { mode: 'string' }),
    inventariadoEm: momento('inventariado_em').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'softwares_dos_ativos_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    index('softwares_dos_ativos_ativo_idx').on(t.orgId, t.ativoId, t.nome),
    check('softwares_dos_ativos_nome_valido', textoAte(t.nome, 500)),
  ],
);

/**
 * A base de software (spec distribuicao-de-software; change distribuicao-de-software): o pacote com
 * o comando, os códigos de sucesso e o arquivo, guardado em partes no armazenamento.
 */
export const pacotesDeSoftware = orgScoped(
  'pacotes_de_software',
  {
    nome: text('nome').notNull(),
    nomeNormalizado: text('nome_normalizado').notNull(),
    versao: text('versao'),
    descricao: text('descricao'),
    comando: text('comando').notNull(),
    codigosDeSucesso: jsonb('codigos_de_sucesso').$type<number[]>().notNull().default([0, 3010]),
    nomeDoArquivo: text('nome_do_arquivo'),
    tamanhoDoArquivo: bigint('tamanho_do_arquivo', { mode: 'number' }),
    sha512DoArquivo: text('sha512_do_arquivo'),
    situacao: situacaoDoCadastro(),
    criadoEm: momento('criado_em').notNull().defaultNow(),
    atualizadoEm: momento('atualizado_em').notNull().defaultNow(),
  },
  (t) => [
    unique('pacotes_de_software_nome_unico').on(t.orgId, t.nomeNormalizado),
    check('pacotes_de_software_nome_valido', sql`length(trim(${t.nome})) between 1 and 120`),
    check('pacotes_de_software_comando_valido', sql`length(trim(${t.comando})) between 1 and 2000`),
    check('pacotes_de_software_versao_valida', textoAte(t.versao, 60)),
    check('pacotes_de_software_descricao_valida', textoAte(t.descricao, 2000)),
    check(
      'pacotes_de_software_arquivo_inteiro',
      sql`(${t.nomeDoArquivo} is null) = (${t.sha512DoArquivo} is null)
        and (${t.nomeDoArquivo} is null) = (${t.tamanhoDoArquivo} is null)`,
    ),
    check(
      'pacotes_de_software_codigos_validos',
      sql`jsonb_typeof(${t.codigosDeSucesso}) = 'array' and jsonb_array_length(${t.codigosDeSucesso}) between 1 and 50`,
    ),
  ],
);

/** As partes do arquivo do pacote, na ordem, cada uma comprimida pelo gzip e pelo SHA-512 dela. */
export const partesDosPacotes = orgScoped(
  'partes_dos_pacotes',
  {
    pacoteId: uuid('pacote_id').notNull(),
    indice: integer('indice').notNull(),
    sha512: text('sha512').notNull(),
    tamanho: integer('tamanho').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'partes_dos_pacotes_pacote_fk',
      columns: [t.orgId, t.pacoteId],
      foreignColumns: [pacotesDeSoftware.orgId, pacotesDeSoftware.id],
    }),
    unique('partes_dos_pacotes_indice_unico').on(t.orgId, t.pacoteId, t.indice),
    index('partes_dos_pacotes_sha512_idx').on(t.orgId, t.sha512),
    check('partes_dos_pacotes_sha512_valido', sql`${t.sha512} ~ '^[0-9a-f]{128}$'`),
  ],
);

/** A distribuição de um pacote às máquinas, com quem criou. */
export const distribuicoes = orgScoped(
  'distribuicoes',
  {
    pacoteId: uuid('pacote_id').notNull(),
    criadaPor: uuid('criada_por').notNull(),
    criadaEm: momento('criada_em').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'distribuicoes_pacote_fk',
      columns: [t.orgId, t.pacoteId],
      foreignColumns: [pacotesDeSoftware.orgId, pacotesDeSoftware.id],
    }),
    foreignKey({
      name: 'distribuicoes_conta_fk',
      columns: [t.orgId, t.criadaPor],
      foreignColumns: [contas.orgId, contas.id],
    }),
    index('distribuicoes_criada_em_idx').on(t.orgId, t.criadaEm),
  ],
);

export const SITUACOES_DA_MAQUINA_NA_DISTRIBUICAO = [
  'aguardando',
  'em-andamento',
  'concluida',
  'falhou',
] as const;

/** Cada máquina da distribuição: o ativo e o agente, a situação, a etapa e o log do agente. */
export const maquinasDasDistribuicoes = orgScoped(
  'maquinas_das_distribuicoes',
  {
    distribuicaoId: uuid('distribuicao_id').notNull(),
    ativoId: uuid('ativo_id').notNull(),
    agenteId: uuid('agente_id').notNull(),
    situacao: text('situacao', { enum: SITUACOES_DA_MAQUINA_NA_DISTRIBUICAO })
      .notNull()
      .default('aguardando'),
    etapa: text('etapa'),
    log: text('log').array().notNull().default(sql`'{}'::text[]`),
    enviadaEm: momento('enviada_em'),
    atualizadaEm: momento('atualizada_em'),
    terminadaEm: momento('terminada_em'),
  },
  (t) => [
    foreignKey({
      name: 'maquinas_das_distribuicoes_distribuicao_fk',
      columns: [t.orgId, t.distribuicaoId],
      foreignColumns: [distribuicoes.orgId, distribuicoes.id],
    }),
    foreignKey({
      name: 'maquinas_das_distribuicoes_ativo_fk',
      columns: [t.orgId, t.ativoId],
      foreignColumns: [ativos.orgId, ativos.id],
    }),
    foreignKey({
      name: 'maquinas_das_distribuicoes_agente_fk',
      columns: [t.orgId, t.agenteId],
      foreignColumns: [agentes.orgId, agentes.id],
    }),
    unique('maquinas_das_distribuicoes_ativo_unico').on(t.orgId, t.distribuicaoId, t.ativoId),
    index('maquinas_das_distribuicoes_agente_idx').on(t.orgId, t.agenteId, t.situacao),
    index('maquinas_das_distribuicoes_ativo_idx').on(t.orgId, t.ativoId),
    check(
      'maquinas_das_distribuicoes_situacao_valida',
      sql`${t.situacao} in (${lista(SITUACOES_DA_MAQUINA_NA_DISTRIBUICAO)})`,
    ),
  ],
);
