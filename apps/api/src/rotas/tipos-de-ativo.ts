// Os tipos de ativo e as capacidades (spec catalogo-de-ativos; design do P1a, decisões 1, 4, 7, 8 e
// 10): toda sessão lê o catálogo, como lê os locais; quem tem `catalogo.administrar` cadastra, edita,
// inativa e reativa. A lista de campos do tipo é configuração: mudar a lista reescreve as linhas do
// tipo, com a linha dele travada, e a auditoria guarda a lista antes e depois, com os rótulos. A
// configuração das capacidades, como o campo de IP da disponibilidade (design do P2a, decisão 10), é
// conferida pelo domínio junto com as capacidades e os campos.
import {
  ativos,
  type Banco,
  campos,
  camposDoTipo,
  naOrganizacao,
  segredos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  CAPACIDADES,
  type CampoDoTipo,
  capacidadeDa,
  conferirCamposDoTipo,
  conferirConfiguracaoDasCapacidades,
  conferirPrimeiroCartao,
  ICONES_DE_TIPO,
  normalizarTexto,
  PORTA_DO_CONTROL_ID,
  pode,
} from '@grafite/domain';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { modulosDesligados } from '../acesso/modulos.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import {
  Capacidade,
  ConfiguracaoDasCapacidades,
  SituacaoDoCadastro,
} from '../catalogo/esquemas.ts';
import { LOGIN_INVALIDO, serveDeLogin } from '../coleta/control-id.ts';
import { ativosNoEscopo, ContagemNoEscopo } from '../contagens.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const CampoNoTipo = z
  .object({
    campoId: z.uuid({ error: 'Campo não encontrado.' }),
    obrigatorio: z.boolean().default(false),
  })
  .meta({ id: 'CampoNoTipo' });

const TipoDeAtivo = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    icone: z.enum(ICONES_DE_TIPO),
    /** As chaves das capacidades ligadas, na ordem do registro. */
    capacidades: z.array(z.string()),
    configuracaoDasCapacidades: ConfiguracaoDasCapacidades,
    /** Os campos da organização que o tipo usa, em ordem. */
    campos: z.array(CampoNoTipo),
    situacao: SituacaoDoCadastro,
    /**
     * O cartão em que a ficha dos ativos do tipo abre: `visao-geral` ou a chave de uma capacidade;
     * nulo no automático (change primeiro-cartao-da-ficha).
     */
    primeiroCartao: z.string().nullable(),
    permite: z.object({ editar: z.boolean() }),
  })
  .meta({ id: 'TipoDeAtivo' });

/** O tipo na ficha e na origem da tabela (change relacoes-vivas, design, decisão 1). */
const ResumoDoTipo = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    icone: z.enum(ICONES_DE_TIPO),
    situacao: SituacaoDoCadastro,
    /** Os ativos do tipo, no escopo de quem vê; nulo para quem não vê ativos em nenhum ramo. */
    ativos: ContagemNoEscopo.nullable(),
  })
  .meta({ id: 'ResumoDoTipoDeAtivo' });

const ListaDeTipos = z
  .object({
    tipos: z.array(TipoDeAtivo),
    permite: z.object({ cadastrar: z.boolean() }),
  })
  .meta({ id: 'ListaDeTiposDeAtivo' });

const NomeDoTipo = z
  .string({ error: 'Informe o nome do tipo.' })
  .trim()
  .min(1, { error: 'Informe o nome do tipo.' })
  .max(60, { error: 'Use até 60 caracteres.' });

const IconeDoTipo = z.enum(ICONES_DE_TIPO, { error: 'Escolha o ícone do tipo.' });

const PedidoDeTipo = z
  .object({
    nome: NomeDoTipo,
    icone: IconeDoTipo,
    capacidades: z.array(z.string()).default([]),
    configuracaoDasCapacidades: ConfiguracaoDasCapacidades.default({}),
    campos: z.array(CampoNoTipo).default([]),
    /** O primeiro cartão da ficha; nulo ou ausente no automático. */
    primeiroCartao: z.string().nullable().optional(),
  })
  .meta({ id: 'PedidoDeTipoDeAtivo' });

const PedidoDeAlteracaoDoTipo = z
  .object({
    nome: NomeDoTipo.optional(),
    icone: IconeDoTipo.optional(),
    capacidades: z.array(z.string()).optional(),
    configuracaoDasCapacidades: ConfiguracaoDasCapacidades.optional(),
    campos: z.array(CampoNoTipo).optional(),
    /** O primeiro cartão da ficha; nulo no automático, e ausente mantém o de antes. */
    primeiroCartao: z.string().nullable().optional(),
  })
  .meta({ id: 'PedidoDeAlteracaoDoTipoDeAtivo' });

const ParametrosDoTipo = z.object({ id: z.uuid({ error: 'Tipo de ativo não encontrado.' }) });

/** As comunidades SNMP do cofre que a ficha do tipo oferece (change p2b-impressoras-por-snmp). */
const ComunidadesSnmp = z
  .object({
    /** As ativas, pelo nome, sem o valor. */
    comunidades: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    /** Por que a lista vem vazia, como o Cofre desligado; nulo quando ela vale. */
    motivo: z.string().nullable(),
  })
  .meta({ id: 'ComunidadesSnmp' });

const COFRE_DESLIGADO_NA_LISTA =
  'Com o módulo Cofre desligado, a comunidade escolhida continua, e a escolha de outra espera o módulo ser ligado.';
const COFRE_DESLIGADO_NA_ESCOLHA =
  'Com o módulo Cofre desligado, a escolha de outra comunidade espera o módulo ser ligado.';
const COMUNIDADE_INVALIDA = 'Escolha uma comunidade SNMP ativa do cofre.';

/** Os logins do Control iD do cofre que a ficha do tipo oferece (change p2c-saude-do-control-id). */
const LoginsDoControlId = z
  .object({
    /** Os que servem de login, pelo nome, sem o usuário nem a senha. */
    logins: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    /** Por que a lista vem vazia, como o Cofre desligado; nulo quando ela vale. */
    motivo: z.string().nullable(),
  })
  .meta({ id: 'LoginsDoControlId' });

const COFRE_DESLIGADO_NOS_LOGINS =
  'Com o módulo Cofre desligado, o login escolhido continua, e a escolha de outro espera o módulo ser ligado.';
const COFRE_DESLIGADO_NA_ESCOLHA_DO_LOGIN =
  'Com o módulo Cofre desligado, a escolha de outro login espera o módulo ser ligado.';

type Configuracao = z.infer<typeof ConfiguracaoDasCapacidades>;

/**
 * O segredo da comunidade, conferido só quando a escolha muda (design, decisão 3): a escolha nova
 * pede um segredo ativo do tipo Comunidade SNMP, com o Cofre ligado. O já escolhido fica, mesmo
 * inativo, e a edição do resto do tipo continua.
 */
async function conferirComunidade(
  tx: Transacao,
  {
    depois,
    antes,
    cofreLigado,
  }: { depois: Configuracao; antes: unknown; cofreLigado: () => Promise<boolean> },
) {
  const segredoId = depois['snmp.suprimentos']?.segredoId ?? null;
  const anterior = (antes as Configuracao | null | undefined)?.['snmp.suprimentos']?.segredoId;
  if (segredoId === null || segredoId === anterior) return;
  if (!(await cofreLigado())) {
    throw dadosInvalidos({ configuracaoDasCapacidades: COFRE_DESLIGADO_NA_ESCOLHA });
  }
  const [comunidade] = await tx
    .select({ id: segredos.id })
    .from(segredos)
    .where(
      and(
        eq(segredos.id, segredoId),
        eq(segredos.tipo, 'comunidade-snmp'),
        eq(segredos.situacao, 'ativo'),
      ),
    );
  if (!comunidade) throw dadosInvalidos({ configuracaoDasCapacidades: COMUNIDADE_INVALIDA });
}

/**
 * O login do Control iD, conferido só quando a escolha muda, como a comunidade (design do P2c,
 * decisão 2): a escolha nova pede um segredo que sirva de login, com o Cofre ligado. O já escolhido
 * fica, mesmo inativo, e a edição do resto do tipo continua.
 */
async function conferirLogin(
  tx: Transacao,
  {
    depois,
    antes,
    cofreLigado,
  }: { depois: Configuracao; antes: unknown; cofreLigado: () => Promise<boolean> },
) {
  const segredoId = depois['controlid.saude']?.segredoId ?? null;
  const anterior = (antes as Configuracao | null | undefined)?.['controlid.saude']?.segredoId;
  if (segredoId === null || segredoId === anterior) return;
  if (!(await cofreLigado())) {
    throw dadosInvalidos({ configuracaoDasCapacidades: COFRE_DESLIGADO_NA_ESCOLHA_DO_LOGIN });
  }
  const [login] = await tx
    .select({ id: segredos.id })
    .from(segredos)
    .where(and(eq(segredos.id, segredoId), serveDeLogin));
  if (!login) throw dadosInvalidos({ configuracaoDasCapacidades: LOGIN_INVALIDO });
}

/** Os nomes dos segredos escolhidos nas configurações dadas, a comunidade e o login, para a auditoria. */
async function nomesDosSegredos(
  tx: Transacao,
  ...configuracoes: unknown[]
): Promise<Map<string, string>> {
  const ids = configuracoes
    .flatMap((configuracao) => {
      const daConfiguracao = configuracao as Configuracao | null;
      return [
        daConfiguracao?.['snmp.suprimentos']?.segredoId,
        daConfiguracao?.['controlid.saude']?.segredoId,
      ];
    })
    .filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return new Map();
  const linhas = await tx
    .select({ id: segredos.id, nome: segredos.nome })
    .from(segredos)
    .where(inArray(segredos.id, ids));
  return new Map(linhas.map(({ id, nome }) => [id, nome]));
}

const NOME_REPETIDO = 'Já existe um tipo com este nome.';

const tipoNaoEncontrado = () => naoEncontrado('Tipo de ativo não encontrado.');

type LinhaDoTipo = typeof tiposDeAtivo.$inferSelect;

async function lerTipo(tx: Transacao, id: string, { travar = false } = {}): Promise<LinhaDoTipo> {
  const consulta = tx.select().from(tiposDeAtivo).where(eq(tiposDeAtivo.id, id));
  const [tipo] = await (travar ? consulta.for('update') : consulta);
  if (!tipo) throw tipoNaoEncontrado();
  return tipo;
}

async function lerCamposDoTipo(tx: Transacao, tipoId: string): Promise<CampoDoTipo[]> {
  return tx
    .select({ campoId: camposDoTipo.campoId, obrigatorio: camposDoTipo.obrigatorio })
    .from(camposDoTipo)
    .where(eq(camposDoTipo.tipoId, tipoId))
    .orderBy(asc(camposDoTipo.ordem));
}

/** Os campos da organização, para conferir a lista e mostrar os rótulos na auditoria. */
function lerCamposDaOrganizacao(tx: Transacao) {
  return tx
    .select({ id: campos.id, rotulo: campos.rotulo, tipo: campos.tipo, situacao: campos.situacao })
    .from(campos);
}

/** As capacidades pedidas, sem repetir e na ordem do registro; a desconhecida é recusada. */
function capacidadesPedidas(pedidas: readonly string[]): string[] {
  for (const chave of pedidas) {
    if (!capacidadeDa(chave)) {
      throw dadosInvalidos({ capacidades: `Capacidade desconhecida: ${chave}.` });
    }
  }
  return CAPACIDADES.map((capacidade) => capacidade.chave).filter((chave) =>
    pedidas.includes(chave),
  );
}

/**
 * A configuração das capacidades conferida pelo domínio, com a recusa no campo do pedido: a lista
 * de campos, quando ela tira o IP da disponibilidade, ou a configuração.
 */
function configuracaoConferida(
  conferencia: Parameters<typeof conferirConfiguracaoDasCapacidades>[0],
): z.infer<typeof ConfiguracaoDasCapacidades> {
  const conferida = conferirConfiguracaoDasCapacidades(conferencia);
  if (!conferida.ok) {
    throw dadosInvalidos({
      [conferida.onde === 'campos' ? 'campos' : 'configuracaoDasCapacidades']: conferida.erro,
    });
  }
  return conferida.configuracao;
}

/**
 * O primeiro cartão conferido pelo domínio (change primeiro-cartao-da-ficha, design, decisão 2): a
 * capacidade desligada é esquecida, e o que não é um cartão é recusado no campo.
 */
function primeiroCartaoConferido(pedido: unknown, capacidades: readonly string[]): string | null {
  const conferido = conferirPrimeiroCartao({ pedido, capacidades });
  if (!conferido.ok) throw dadosInvalidos({ primeiroCartao: conferido.erro });
  return conferido.primeiroCartao;
}

/** Reescreve a lista de campos do tipo, na ordem pedida. */
async function gravarCamposDoTipo(tx: Transacao, tipoId: string, lista: readonly CampoDoTipo[]) {
  await tx.delete(camposDoTipo).where(eq(camposDoTipo.tipoId, tipoId));
  if (lista.length === 0) return;
  await tx.insert(camposDoTipo).values(
    lista.map(({ campoId, obrigatorio }, ordem) => ({
      orgId: sql`app.current_org()`,
      tipoId,
      campoId,
      ordem,
      obrigatorio,
    })),
  );
}

async function semNomeRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'tipos_de_ativo_nome_unico')) {
      throw conflito(NOME_REPETIDO, { nome: NOME_REPETIDO });
    }
    throw erro;
  }
}

/**
 * O que a auditoria guarda do tipo: a lista de campos vai com os rótulos, o campo de IP da
 * disponibilidade, pelo rótulo, os suprimentos com o campo de IP, a versão e a comunidade, pelo
 * nome, ou "public", e a saúde do Control iD com o campo de IP, a porta e o login, pelo nome.
 */
function visaoDoTipo(
  tipo: LinhaDoTipo,
  lista: readonly CampoDoTipo[],
  rotulos: ReadonlyMap<string, string>,
  segredosPeloId: ReadonlyMap<string, string> = new Map(),
) {
  const configuracao = tipo.configuracaoDasCapacidades as Configuracao;
  const campoDoIp = configuracao['rede.disponibilidade']?.campoDoIp;
  const doSnmp = configuracao['snmp.suprimentos'];
  const doControle = configuracao['controlid.saude'];
  const rotuloDo = (campoId: string | undefined) =>
    campoId ? (rotulos.get(campoId) ?? campoId) : null;
  return {
    nome: tipo.nome,
    icone: tipo.icone,
    capacidades: tipo.capacidades,
    ipDaDisponibilidade: campoDoIp ? (rotulos.get(campoDoIp) ?? campoDoIp) : null,
    suprimentos: doSnmp
      ? {
          ip: doSnmp.campoDoIp ? (rotulos.get(doSnmp.campoDoIp) ?? doSnmp.campoDoIp) : null,
          versao: doSnmp.versao ?? '2c',
          comunidade: doSnmp.segredoId
            ? (segredosPeloId.get(doSnmp.segredoId) ?? doSnmp.segredoId)
            : 'public',
        }
      : null,
    controlId: doControle
      ? {
          ip: rotuloDo(doControle.campoDoIp),
          porta: doControle.porta ?? PORTA_DO_CONTROL_ID,
          login: doControle.segredoId
            ? (segredosPeloId.get(doControle.segredoId) ?? doControle.segredoId)
            : null,
        }
      : null,
    campos: lista.map(({ campoId, obrigatorio }) => ({
      rotulo: rotulos.get(campoId) ?? campoId,
      obrigatorio,
    })),
    primeiroCartao: tipo.primeiroCartao,
    situacao: tipo.situacao,
  };
}

const iguais = (a: readonly CampoDoTipo[], b: readonly CampoDoTipo[]) =>
  JSON.stringify(a) === JSON.stringify(b);

export const rotasDosTiposDeAtivo: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const RESPOSTAS_DO_TIPO = {
    200: TipoDeAtivo,
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  const comPermite = (tipo: LinhaDoTipo, lista: CampoDoTipo[], editar: boolean) => ({
    id: tipo.id,
    nome: tipo.nome,
    icone: tipo.icone,
    capacidades: tipo.capacidades,
    configuracaoDasCapacidades: tipo.configuracaoDasCapacidades as z.infer<
      typeof ConfiguracaoDasCapacidades
    >,
    campos: lista,
    situacao: tipo.situacao,
    primeiroCartao: tipo.primeiroCartao,
    permite: { editar },
  });

  app.get(
    '/capacidades',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'As capacidades que um tipo de ativo pode ligar',
        response: {
          200: z.object({ capacidades: z.array(Capacidade) }).meta({ id: 'ListaDeCapacidades' }),
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async () => ({
      capacidades: CAPACIDADES.map((capacidade) => ({
        chave: capacidade.chave,
        nome: capacidade.nome,
        descricao: capacidade.descricao,
        campos: [...capacidade.campos],
        configuracao: capacidade.configuracao ?? null,
      })),
    }),
  );

  app.get(
    '/tipos-de-ativo',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os tipos de ativo da organização',
        response: { 200: ListaDeTipos, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const editar = pode(sessaoDa(requisicao).acesso, 'catalogo.administrar');
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const tipos = await tx
          .select()
          .from(tiposDeAtivo)
          .orderBy(asc(tiposDeAtivo.nomeNormalizado));
        const ligacoes = await tx
          .select({
            tipoId: camposDoTipo.tipoId,
            campoId: camposDoTipo.campoId,
            obrigatorio: camposDoTipo.obrigatorio,
          })
          .from(camposDoTipo)
          .orderBy(asc(camposDoTipo.tipoId), asc(camposDoTipo.ordem));
        return {
          tipos: tipos.map((tipo) =>
            comPermite(
              tipo,
              ligacoes
                .filter((ligacao) => ligacao.tipoId === tipo.id)
                .map(({ campoId, obrigatorio }) => ({ campoId, obrigatorio })),
              editar,
            ),
          ),
          permite: { cadastrar: editar },
        };
      });
    },
  );

  app.get(
    '/tipos-de-ativo/:id/resumo',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'O resumo de um tipo de ativo, com os ativos dele no escopo de quem vê',
        params: ParametrosDoTipo,
        response: { 200: ResumoDoTipo, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const tipo = await lerTipo(tx, requisicao.params.id);
        const arvore = await lerArvore(tx);
        return {
          id: tipo.id,
          nome: tipo.nome,
          icone: tipo.icone,
          situacao: tipo.situacao,
          ativos: await ativosNoEscopo(tx, { acesso, arvore }, eq(ativos.tipoId, tipo.id)),
        };
      });
    },
  );

  /** Se o Cofre está ligado na organização, lido só quando a escolha da comunidade muda. */
  const cofreLigado = async (orgId: string) =>
    !(await modulosDesligados(banco, orgId)).includes('cofre');

  // As comunidades SNMP do cofre para a ficha do tipo: o id e o nome das ativas, nunca o valor, a
  // quem administra o catálogo, sem o acesso aos segredos do cofre (spec cofre-de-segredos).
  app.get(
    '/catalogo/comunidades-snmp',
    {
      config: { permissao: 'catalogo.administrar' },
      schema: {
        summary: 'As comunidades SNMP do cofre que a ficha do tipo oferece',
        response: { 200: ComunidadesSnmp, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const orgId = requisicao.organizacao?.id ?? '';
      if (!(await cofreLigado(orgId))) {
        return { comunidades: [], motivo: COFRE_DESLIGADO_NA_LISTA };
      }
      const comunidades = await naOrganizacao(banco, orgId, (tx) =>
        tx
          .select({ id: segredos.id, nome: segredos.nome })
          .from(segredos)
          .where(and(eq(segredos.tipo, 'comunidade-snmp'), eq(segredos.situacao, 'ativo')))
          .orderBy(asc(segredos.nomeNormalizado)),
      );
      return { comunidades, motivo: null };
    },
  );

  app.get(
    '/catalogo/logins-do-control-id',
    {
      config: { permissao: 'catalogo.administrar' },
      schema: {
        summary: 'Os logins do cofre que a ficha do tipo oferece para a saúde do Control iD',
        response: { 200: LoginsDoControlId, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const orgId = requisicao.organizacao?.id ?? '';
      if (!(await cofreLigado(orgId))) return { logins: [], motivo: COFRE_DESLIGADO_NOS_LOGINS };
      const logins = await naOrganizacao(banco, orgId, (tx) =>
        tx
          .select({ id: segredos.id, nome: segredos.nome })
          .from(segredos)
          .where(serveDeLogin)
          .orderBy(asc(segredos.nomeNormalizado)),
      );
      return { logins, motivo: null };
    },
  );

  app.post(
    '/tipos-de-ativo',
    {
      config: { permissao: 'catalogo.administrar' },
      schema: {
        summary: 'Cadastrar um tipo de ativo',
        body: PedidoDeTipo,
        response: { ...RESPOSTAS_DO_TIPO, 201: TipoDeAtivo },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const capacidades = capacidadesPedidas(pedido.capacidades);
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const daOrganizacao = await lerCamposDaOrganizacao(tx);
        const lista = conferirCamposDoTipo([], pedido.campos, daOrganizacao);
        if (!lista.ok) throw dadosInvalidos({ campos: lista.erro });
        const configuracaoDasCapacidades = configuracaoConferida({
          capacidades,
          configuracao: pedido.configuracaoDasCapacidades,
          campos: lista.campos.map(({ campoId }) => campoId),
          atual: {},
          definicoes: daOrganizacao,
        });
        await conferirComunidade(tx, {
          depois: configuracaoDasCapacidades,
          antes: {},
          cofreLigado: () => cofreLigado(requisicao.organizacao?.id ?? ''),
        });
        await conferirLogin(tx, {
          depois: configuracaoDasCapacidades,
          antes: {},
          cofreLigado: () => cofreLigado(requisicao.organizacao?.id ?? ''),
        });
        const [tipo] = await semNomeRepetido(() =>
          tx
            .insert(tiposDeAtivo)
            .values({
              orgId: sql`app.current_org()`,
              nome: pedido.nome,
              nomeNormalizado: normalizarTexto(pedido.nome),
              icone: pedido.icone,
              capacidades,
              configuracaoDasCapacidades,
              primeiroCartao: primeiroCartaoConferido(pedido.primeiroCartao, capacidades),
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!tipo) throw new Error('O tipo de ativo não foi cadastrado.');
        await gravarCamposDoTipo(tx, tipo.id, lista.campos);
        const rotulos = new Map(daOrganizacao.map((campo) => [campo.id, campo.rotulo]));
        const segredosPeloId = await nomesDosSegredos(tx, tipo.configuracaoDasCapacidades);
        await registrarNaAuditoria(tx, {
          acao: 'tipo-de-ativo.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'tipo-de-ativo', id: tipo.id },
          depois: visaoDoTipo(tipo, lista.campos, rotulos, segredosPeloId),
          origem: origemDa(requisicao),
          momento,
        });
        return comPermite(tipo, lista.campos, true);
      });
      return resposta.code(201).send(criado);
    },
  );

  app.patch(
    '/tipos-de-ativo/:id',
    {
      config: { permissao: 'catalogo.administrar' },
      schema: {
        summary: 'Editar um tipo de ativo: o nome, o ícone, as capacidades e os campos',
        params: ParametrosDoTipo,
        body: PedidoDeAlteracaoDoTipo,
        response: RESPOSTAS_DO_TIPO,
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        // A linha travada: duas edições do mesmo tipo rodam uma depois da outra.
        const antes = await lerTipo(tx, requisicao.params.id, { travar: true });
        const listaAntes = await lerCamposDoTipo(tx, antes.id);
        const daOrganizacao = await lerCamposDaOrganizacao(tx);
        let listaDepois = listaAntes;
        if (pedido.campos) {
          const atuais = listaAntes.map((campo) => campo.campoId);
          const lista = conferirCamposDoTipo(atuais, pedido.campos, daOrganizacao);
          if (!lista.ok) throw dadosInvalidos({ campos: lista.erro });
          listaDepois = lista.campos;
        }
        const nome = pedido.nome ?? antes.nome;
        const capacidades = pedido.capacidades
          ? capacidadesPedidas(pedido.capacidades)
          : antes.capacidades;
        const valores = {
          nome,
          nomeNormalizado: normalizarTexto(nome),
          icone: pedido.icone ?? antes.icone,
          capacidades,
          configuracaoDasCapacidades: configuracaoConferida({
            capacidades,
            configuracao: pedido.configuracaoDasCapacidades ?? antes.configuracaoDasCapacidades,
            campos: listaDepois.map(({ campoId }) => campoId),
            atual: antes.configuracaoDasCapacidades,
            definicoes: daOrganizacao,
          }),
          // Sem o pedido, a escolha de antes é conferida de novo: a capacidade desligada a esquece.
          primeiroCartao: primeiroCartaoConferido(
            pedido.primeiroCartao === undefined ? antes.primeiroCartao : pedido.primeiroCartao,
            capacidades,
          ),
        };
        await conferirComunidade(tx, {
          depois: valores.configuracaoDasCapacidades,
          antes: antes.configuracaoDasCapacidades,
          cofreLigado: () => cofreLigado(requisicao.organizacao?.id ?? ''),
        });
        await conferirLogin(tx, {
          depois: valores.configuracaoDasCapacidades,
          antes: antes.configuracaoDasCapacidades,
          cofreLigado: () => cofreLigado(requisicao.organizacao?.id ?? ''),
        });
        const mudouOTipo =
          valores.nome !== antes.nome ||
          valores.icone !== antes.icone ||
          valores.capacidades.join() !== antes.capacidades.join() ||
          JSON.stringify(valores.configuracaoDasCapacidades) !==
            JSON.stringify(antes.configuracaoDasCapacidades) ||
          valores.primeiroCartao !== antes.primeiroCartao;
        const mudouALista = !iguais(listaAntes, listaDepois);
        if (!mudouOTipo && !mudouALista) return comPermite(antes, listaAntes, true);

        const [depois] = await semNomeRepetido(() =>
          tx
            .update(tiposDeAtivo)
            .set({ ...valores, atualizadoEm: momento })
            .where(eq(tiposDeAtivo.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O tipo de ativo não foi alterado.');
        if (mudouALista) await gravarCamposDoTipo(tx, antes.id, listaDepois);
        const rotulos = new Map(daOrganizacao.map((campo) => [campo.id, campo.rotulo]));
        const segredosPeloId = await nomesDosSegredos(
          tx,
          antes.configuracaoDasCapacidades,
          depois.configuracaoDasCapacidades,
        );
        await registrarNaAuditoria(tx, {
          acao: 'tipo-de-ativo.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'tipo-de-ativo', id: antes.id },
          antes: visaoDoTipo(antes, listaAntes, rotulos, segredosPeloId),
          depois: visaoDoTipo(depois, listaDepois, rotulos, segredosPeloId),
          origem: origemDa(requisicao),
          momento,
        });
        return comPermite(depois, listaDepois, true);
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'tipo-de-ativo.inativado'],
    ['reativacao', 'ativo', 'tipo-de-ativo.reativado'],
  ] as const) {
    app.post(
      `/tipos-de-ativo/:id/${caminho}`,
      {
        config: { permissao: 'catalogo.administrar' },
        schema: {
          summary:
            situacao === 'inativo' ? 'Inativar um tipo de ativo' : 'Reativar um tipo de ativo',
          params: ParametrosDoTipo,
          response: RESPOSTAS_DO_TIPO,
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerTipo(tx, requisicao.params.id, { travar: true });
          const lista = await lerCamposDoTipo(tx, antes.id);
          if (antes.situacao === situacao) return comPermite(antes, lista, true);
          const [depois] = await tx
            .update(tiposDeAtivo)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(tiposDeAtivo.id, antes.id))
            .returning();
          if (!depois) throw new Error('O tipo de ativo não foi alterado.');
          const rotulos = new Map(
            (await lerCamposDaOrganizacao(tx)).map((campo) => [campo.id, campo.rotulo]),
          );
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'tipo-de-ativo', id: antes.id },
            antes: visaoDoTipo(antes, lista, rotulos),
            depois: visaoDoTipo(depois, lista, rotulos),
            origem: origemDa(requisicao),
            momento,
          });
          return comPermite(depois, lista, true);
        });
      },
    );
  }
};
