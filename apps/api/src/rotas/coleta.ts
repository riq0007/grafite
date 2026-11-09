// As rotas do coletor (spec coletor-local; design do P2a, decisões 1, 2, 4, 5 e 6, do P2b, decisão 4,
// e do P2c, decisão 3), no escopo da coleta: a organização pelo endereço e o coletor pelo token. A
// configuração traz as faixas do coletor e os ativos dele, com o que coletar e de quanto em quanto
// tempo, o SNMP com a versão e a comunidade e a sondagem do Control iD com a porta, o usuário e a
// senha, decifrados do cofre só para o coletor; com o módulo Ativos desligado, ela vem sem alvos. O lote é conferido pelo domínio e gravado numa transação; o reenvio
// da mesma chave, mesmo ao mesmo tempo, responde como o primeiro, sem gravar nada de novo.
import { type Banco, naOrganizacao, segredos, type Transacao, tiposDeAtivo } from '@grafite/db';
import {
  INTERVALOS_DAS_METRICAS,
  lerLote,
  PORTA_DO_CONTROL_ID,
  VERSOES_DO_SNMP,
} from '@grafite/domain';
import { inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { modulosDesligados } from '../acesso/modulos.ts';
import type { Armazenamento } from '../arquivos/armazenamento.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import { violouUnicidade } from '../banco.ts';
import type { ConfiguracaoDasCapacidades } from '../catalogo/esquemas.ts';
import { type ChavesDoCofre, decifrarSegredo, SegredoQueNaoAbre } from '../cofre/cifra.ts';
import { type AlvoDaColeta as AlvoDosTipos, alvosDaColeta } from '../coleta/alvos.ts';
import { controlIdDosTipos, loginsDosControles } from '../coleta/control-id.ts';
import { tokenRecusado } from '../coleta/escopo.ts';
import { gravarLote, loteRecebido } from '../coleta/lotes.ts';
import {
  backupsNaFila,
  chaveDoZipDaOperacao,
  entregarBackups,
  entregarOperacoes,
  operacoesNaFila,
  receberArquivo,
  receberFalha,
  receberResultado,
} from '../controlid/arquivo.ts';
import {
  FalhaDoPedido,
  ParametrosDoPedido,
  PedidosDoColetor,
  RespostaDoPedido,
  ResultadoDoPedido,
} from '../controlid/esquemas.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';

/** Em quantos segundos o coletor pede a configuração de novo. */
const PROXIMA_CONFIGURACAO = 300;

/** A comunidade sem segredo escolhido, ou com ele inativo (spec impressoras-por-snmp). */
const COMUNIDADE_PADRAO = 'public';

/**
 * O que o coletor faz em cada alvo: o ping, que dá a disponibilidade e a latência, e o SNMP, que lê
 * os suprimentos, os contadores e as condições da impressora, com a versão e a comunidade do tipo. A
 * comunidade vai só aqui e fica só na memória do coletor.
 */
const ColetaDoAlvo = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('ping'),
      /** De quanto em quanto tempo, em segundos. */
      intervalo: z.number().int(),
    }),
    z.object({
      tipo: z.literal('snmp'),
      intervalo: z.number().int(),
      versao: z.enum(VERSOES_DO_SNMP),
      comunidade: z.string(),
    }),
    z.object({
      tipo: z.literal('controlid'),
      intervalo: z.number().int(),
      porta: z.number().int(),
      /** O usuário e a senha do login, decifrados só para o coletor, que os guarda na memória. */
      usuario: z.string(),
      senha: z.string(),
    }),
  ])
  .meta({ id: 'ColetaDoAlvo' });

type Coleta = z.infer<typeof ColetaDoAlvo>;

/**
 * O SNMP de cada tipo dos alvos: a versão e a comunidade, decifrada uma vez por pedido. Sem segredo,
 * ou com ele inativo, vale a public; com o Cofre desligado, o escolhido continua. O segredo que o
 * cofre não abre tira o SNMP do tipo, sem mandar ao coletor uma comunidade errada, e a causa vai ao
 * log, sem o valor. Nada disso é uma revelação, e a auditoria não registra.
 */
async function snmpDosTipos(
  tx: Transacao,
  {
    tipoIds,
    chaves,
    orgId,
    avisar,
  }: {
    tipoIds: readonly string[];
    chaves: ChavesDoCofre;
    orgId: string;
    avisar: (dados: object, mensagem: string) => void;
  },
): Promise<Map<string, Extract<Coleta, { tipo: 'snmp' }>>> {
  const resultado = new Map<string, Extract<Coleta, { tipo: 'snmp' }>>();
  if (tipoIds.length === 0) return resultado;
  const tipos = await tx
    .select({ id: tiposDeAtivo.id, configuracao: tiposDeAtivo.configuracaoDasCapacidades })
    .from(tiposDeAtivo)
    .where(inArray(tiposDeAtivo.id, [...tipoIds]));
  const doSnmp = tipos.map(({ id, configuracao }) => ({
    tipoId: id,
    ...(configuracao as z.infer<typeof ConfiguracaoDasCapacidades>)['snmp.suprimentos'],
  }));
  const segredoIds = [
    ...new Set(doSnmp.flatMap(({ segredoId }) => (segredoId ? [segredoId] : []))),
  ];
  const cifrados =
    segredoIds.length === 0
      ? []
      : await tx
          .select({
            id: segredos.id,
            tipo: segredos.tipo,
            situacao: segredos.situacao,
            conteudoCifrado: segredos.conteudoCifrado,
            chaveCifrada: segredos.chaveCifrada,
            impressaoDaChaveMestra: segredos.impressaoDaChaveMestra,
          })
          .from(segredos)
          .where(inArray(segredos.id, segredoIds));
  const comunidades = new Map<string, string | null>();
  for (const segredo of cifrados) {
    if (segredo.tipo !== 'comunidade-snmp' || segredo.situacao !== 'ativo') {
      comunidades.set(segredo.id, COMUNIDADE_PADRAO);
      continue;
    }
    try {
      comunidades.set(
        segredo.id,
        decifrarSegredo(segredo, chaves, { orgId, segredoId: segredo.id }).valor,
      );
    } catch (erro) {
      if (!(erro instanceof SegredoQueNaoAbre)) throw erro;
      avisar(
        { segredoId: segredo.id, motivo: erro.motivo },
        'comunidade SNMP que o cofre não abre',
      );
      comunidades.set(segredo.id, null);
    }
  }
  const intervalo = INTERVALOS_DAS_METRICAS['snmp.resposta'] / 1000;
  for (const { tipoId, versao, segredoId } of doSnmp) {
    const comunidade = segredoId
      ? (comunidades.get(segredoId) ?? (comunidades.has(segredoId) ? null : COMUNIDADE_PADRAO))
      : COMUNIDADE_PADRAO;
    if (comunidade === null) continue;
    resultado.set(tipoId, { tipo: 'snmp', intervalo, versao: versao ?? '2c', comunidade });
  }
  return resultado;
}

type SondagemDoAlvo = Extract<Coleta, { tipo: 'controlid' }>;

/**
 * A sondagem de cada controle dos alvos, pelo id do ativo: a porta do tipo e o login, o ligado ao
 * controle ou o do tipo, com o usuário e a senha decifrados uma vez por pedido. O controle sem um
 * login que sirva fica sem a sondagem, e a tela diz o motivo; o login que o cofre não abre também,
 * com a causa no log, sem o valor. Com o Cofre desligado, o login continua. Nada disso é uma
 * revelação, e a auditoria não registra.
 */
async function controlIdDosAlvos(
  tx: Transacao,
  {
    alvos,
    chaves,
    orgId,
    avisar,
  }: {
    alvos: readonly AlvoDosTipos[];
    chaves: ChavesDoCofre;
    orgId: string;
    avisar: (dados: object, mensagem: string) => void;
  },
): Promise<Map<string, SondagemDoAlvo>> {
  const resultado = new Map<string, SondagemDoAlvo>();
  if (alvos.length === 0) return resultado;
  const doTipo = await controlIdDosTipos(tx, [...new Set(alvos.map((alvo) => alvo.tipoId))]);
  const logins = await loginsDosControles(tx, alvos);
  const segredoIds = [
    ...new Set([...logins.values()].flatMap((login) => (login.ok ? [login.segredoId] : []))),
  ];
  const cifrados =
    segredoIds.length === 0
      ? []
      : await tx
          .select({
            id: segredos.id,
            identificador: segredos.identificador,
            conteudoCifrado: segredos.conteudoCifrado,
            chaveCifrada: segredos.chaveCifrada,
            impressaoDaChaveMestra: segredos.impressaoDaChaveMestra,
          })
          .from(segredos)
          .where(inArray(segredos.id, segredoIds));
  const abertos = new Map<string, { usuario: string; senha: string }>();
  for (const segredo of cifrados) {
    try {
      const { valor } = decifrarSegredo(segredo, chaves, { orgId, segredoId: segredo.id });
      abertos.set(segredo.id, { usuario: (segredo.identificador ?? '').trim(), senha: valor });
    } catch (erro) {
      if (!(erro instanceof SegredoQueNaoAbre)) throw erro;
      avisar(
        { segredoId: segredo.id, motivo: erro.motivo },
        'login do Control iD que o cofre não abre',
      );
    }
  }
  const intervalo = INTERVALOS_DAS_METRICAS['controlid.sondagem'] / 1000;
  for (const alvo of alvos) {
    const login = logins.get(alvo.ativoId);
    const aberto = login?.ok ? abertos.get(login.segredoId) : undefined;
    if (!aberto) continue;
    const porta = doTipo.get(alvo.tipoId)?.porta ?? PORTA_DO_CONTROL_ID;
    resultado.set(alvo.ativoId, { tipo: 'controlid', intervalo, porta, ...aberto });
  }
  return resultado;
}

/** Os alvos de um coletor: um por ativo e IP, com as coletas dele. */
function alvosDoColetor(
  alvos: readonly AlvoDosTipos[],
  snmp: ReadonlyMap<string, Extract<Coleta, { tipo: 'snmp' }>>,
  controlId: ReadonlyMap<string, SondagemDoAlvo>,
) {
  const intervaloDoPing = INTERVALOS_DAS_METRICAS['rede.disponibilidade'] / 1000;
  const porAlvo = new Map<string, { ativoId: string; ip: string; coletas: Coleta[] }>();
  for (const alvo of alvos) {
    const coleta: Coleta | undefined =
      alvo.coleta === 'ping'
        ? { tipo: 'ping', intervalo: intervaloDoPing }
        : alvo.coleta === 'snmp'
          ? snmp.get(alvo.tipoId)
          : controlId.get(alvo.ativoId);
    if (!coleta) continue;
    const chave = `${alvo.ativoId}|${alvo.ip}`;
    const guardado = porAlvo.get(chave) ?? { ativoId: alvo.ativoId, ip: alvo.ip, coletas: [] };
    guardado.coletas.push(coleta);
    porAlvo.set(chave, guardado);
  }
  return [...porAlvo.values()];
}

const AlvoDaColeta = z
  .object({ ativoId: z.uuid(), ip: z.string(), coletas: z.array(ColetaDoAlvo) })
  .meta({ id: 'AlvoDaColeta' });

const ConfiguracaoDaColeta = z
  .object({
    /** As faixas do coletor: ele confere cada alvo contra elas antes de ler. */
    faixas: z.array(z.string()),
    alvos: z.array(AlvoDaColeta),
    /** Em quantos segundos pedir a configuração de novo. */
    proximaEm: z.number().int(),
  })
  .meta({ id: 'ConfiguracaoDaColeta' });

/** A leitura como o coletor manda: a forma e os limites são conferidos pelo domínio. */
const LeituraRecebida = z
  .object({
    ativoId: z.string(),
    metrica: z.string(),
    /** O índice do suprimento ou do contador da impressora; nas outras métricas, nenhum. */
    item: z.string().optional(),
    /** ISO 8601, no relógio do coletor. */
    momento: z.string(),
    /**
     * O texto da disponibilidade e da resposta do SNMP, o número da latência, do nível e das
     * páginas, a lista das condições e das mensagens, ou nada quando a leitura falhou.
     */
    valor: z.union([z.string(), z.number(), z.array(z.string()), z.null()]),
    /** A descrição, a capacidade e o nível de um suprimento, e as cores de um contador. */
    detalhes: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .nullable()
      .optional(),
  })
  .meta({ id: 'LeituraRecebida' });

const LoteRecebido = z
  .object({ chave: z.string(), leituras: z.array(LeituraRecebida) })
  .meta({ id: 'LoteRecebido' });

const ResultadoDoLote = z
  .object({
    gravadas: z.number().int(),
    ignoradas: z.number().int(),
    /** O lote já tinha entrado: nada foi gravado de novo. */
    repetido: z.boolean(),
  })
  .meta({ id: 'ResultadoDoLote' });

const PROBLEMAS_DA_COLETA = { 401: RespostaDeProblema, 404: RespostaDeProblema };

/** Em quantos segundos o coletor busca os pedidos de novo. */
const PROXIMOS_PEDIDOS = 15;

/** O maior ZIP de backup que o coletor envia: 512 MiB. */
const LIMITE_DO_ZIP = 512 * 1024 * 1024;

export const rotasDaColeta: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  chavesDoCofre: ChavesDoCofre;
  armazenamento: Armazenamento;
}> = async (app, { banco, agora, chavesDoCofre, armazenamento }) => {
  // O ZIP do backup do Control iD chega em bytes (change p5a-backup-do-control-id, design, decisão 3).
  app.addContentTypeParser(
    'application/zip',
    { parseAs: 'buffer', bodyLimit: LIMITE_DO_ZIP },
    (_requisicao, corpo: Buffer, pronto: (erro: null, corpo: Buffer) => void) =>
      pronto(null, corpo),
  );

  app.get(
    '/coleta/pedidos',
    {
      schema: {
        summary:
          'Os pedidos de trabalho dos ativos que o coletor alcança, como o backup do Control iD',
        response: { 200: PedidosDoColetor, ...PROBLEMAS_DA_COLETA },
      },
    },
    async (requisicao) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      const desligado = (await modulosDesligados(banco, organizacao.id)).includes('ativos');
      if (desligado) return { pedidos: [], proximaEm: PROXIMOS_PEDIDOS };
      const pedidos = await naOrganizacao(banco, organizacao.id, async (tx) => {
        const backups = await backupsNaFila(tx);
        const operacoes = await operacoesNaFila(tx);
        if (backups.length === 0 && operacoes.length === 0) return [];
        const alvos = (
          await alvosDaColeta(tx, {
            ativoIds: [...new Set([...backups, ...operacoes].map((pedido) => pedido.ativoId))],
            coletas: ['controlid'],
          })
        ).filter((alvo) => alvo.coletorId === coletor.id);
        const sondagens = await controlIdDosAlvos(tx, {
          alvos,
          chaves: chavesDoCofre,
          orgId: organizacao.id,
          avisar: (dados, mensagem) => requisicao.log.warn(dados, mensagem),
        });
        const logins = new Map(
          [...sondagens].map(([ativoId, { porta, usuario, senha }]) => [
            ativoId,
            { porta, usuario, senha },
          ]),
        );
        const momento = agora();
        const deBackup = (
          await entregarBackups(tx, { coletor, candidatos: backups, alvos, logins, momento })
        ).map((pedido) => ({ ...pedido, backupId: null, categorias: null }));
        // As operações vêm depois dos backups, até o mesmo limite de 2 por busca.
        const deOperacao = await entregarOperacoes(tx, {
          coletor,
          candidatos: operacoes,
          alvos,
          logins,
          momento,
          limite: Math.max(0, 2 - deBackup.length),
        });
        return [...deBackup, ...deOperacao];
      });
      return { pedidos, proximaEm: PROXIMOS_PEDIDOS };
    },
  );

  app.put(
    '/coleta/pedidos/:id/arquivo',
    {
      schema: {
        summary: 'O ZIP do backup que o coletor terminou',
        params: ParametrosDoPedido,
        body: BytesDoArquivo,
        response: { 200: RespostaDoPedido, 409: RespostaDeProblema, ...PROBLEMAS_DA_COLETA },
      },
    },
    async (requisicao) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      const { situacao, apagar } = await naOrganizacao(banco, organizacao.id, (tx) =>
        receberArquivo(tx, {
          id: requisicao.params.id,
          coletor,
          conteudo: requisicao.body,
          armazenamento,
          orgId: organizacao.id,
          momento: agora(),
        }),
      );
      for (const chave of apagar) await armazenamento.apagar(chave);
      return { situacao };
    },
  );

  app.get(
    '/coleta/pedidos/:id/arquivo',
    {
      schema: {
        summary: 'O ZIP do backup de uma operação em andamento com o coletor',
        params: ParametrosDoPedido,
        response: {
          200: { description: 'O ZIP', content: { 'application/zip': { schema: BytesDoArquivo } } },
          409: RespostaDeProblema,
          ...PROBLEMAS_DA_COLETA,
        },
      },
    },
    async (requisicao, resposta) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      const chave = await naOrganizacao(banco, organizacao.id, (tx) =>
        chaveDoZipDaOperacao(tx, requisicao.params.id, coletor.id),
      );
      const conteudo = await armazenamento.abrir(chave);
      if (!conteudo) throw tokenRecusado();
      resposta.header('content-type', 'application/zip');
      return resposta.send(conteudo);
    },
  );

  app.post(
    '/coleta/pedidos/:id/resultado',
    {
      schema: {
        summary: 'O resultado por categoria de uma operação que o coletor terminou',
        params: ParametrosDoPedido,
        body: ResultadoDoPedido,
        response: { 200: RespostaDoPedido, 409: RespostaDeProblema, ...PROBLEMAS_DA_COLETA },
      },
    },
    async (requisicao) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      return naOrganizacao(banco, organizacao.id, (tx) =>
        receberResultado(tx, {
          id: requisicao.params.id,
          coletor,
          categorias: requisicao.body.categorias,
          momento: agora(),
        }),
      );
    },
  );

  app.post(
    '/coleta/pedidos/:id/falha',
    {
      schema: {
        summary: 'O backup que o coletor não conseguiu fazer, com a mensagem',
        params: ParametrosDoPedido,
        body: FalhaDoPedido,
        response: { 200: RespostaDoPedido, 409: RespostaDeProblema, ...PROBLEMAS_DA_COLETA },
      },
    },
    async (requisicao) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      return naOrganizacao(banco, organizacao.id, (tx) =>
        receberFalha(tx, {
          id: requisicao.params.id,
          coletor,
          mensagem: requisicao.body.mensagem,
          momento: agora(),
        }),
      );
    },
  );

  app.get(
    '/coleta/configuracao',
    {
      schema: {
        summary: 'O que o coletor do token coleta: as faixas dele e os ativos que ele alcança',
        response: { 200: ConfiguracaoDaColeta, ...PROBLEMAS_DA_COLETA },
      },
    },
    async (requisicao) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      const desligado = (await modulosDesligados(banco, organizacao.id)).includes('ativos');
      const alvos = desligado
        ? []
        : await naOrganizacao(banco, organizacao.id, async (tx) => {
            const doColetor = (await alvosDaColeta(tx)).filter(
              (alvo) => alvo.coletorId === coletor.id,
            );
            const snmp = await snmpDosTipos(tx, {
              tipoIds: [
                ...new Set(
                  doColetor.filter((alvo) => alvo.coleta === 'snmp').map((alvo) => alvo.tipoId),
                ),
              ],
              chaves: chavesDoCofre,
              orgId: organizacao.id,
              avisar: (dados, mensagem) => requisicao.log.warn(dados, mensagem),
            });
            const controlId = await controlIdDosAlvos(tx, {
              alvos: doColetor.filter((alvo) => alvo.coleta === 'controlid'),
              chaves: chavesDoCofre,
              orgId: organizacao.id,
              avisar: (dados, mensagem) => requisicao.log.warn(dados, mensagem),
            });
            return alvosDoColetor(doColetor, snmp, controlId);
          });
      return { faixas: coletor.faixas, alvos, proximaEm: PROXIMA_CONFIGURACAO };
    },
  );

  app.post(
    '/coleta/lotes',
    {
      schema: {
        summary: 'Um lote de leituras do coletor, com a chave que não deixa o reenvio duplicar',
        body: LoteRecebido,
        response: { 200: ResultadoDoLote, 400: RespostaDeProblema, ...PROBLEMAS_DA_COLETA },
      },
    },
    async (requisicao) => {
      const { coletor, organizacao } = requisicao;
      if (!coletor || !organizacao) throw tokenRecusado();
      const lido = lerLote(requisicao.body, agora());
      if (!lido.ok) {
        throw new ProblemaDaApi({
          codigo: 'dados-invalidos',
          status: 400,
          titulo: 'Lote recusado',
          detalhe: lido.erro,
        });
      }
      const moduloLigado = !(await modulosDesligados(banco, organizacao.id)).includes('ativos');
      try {
        return await naOrganizacao(banco, organizacao.id, (tx) =>
          gravarLote(tx, { coletor, lote: lido.lote, moduloLigado, momento: agora() }),
        );
      } catch (erro) {
        // O mesmo lote ao mesmo tempo: o outro pedido gravou primeiro, e este responde como ele.
        if (!violouUnicidade(erro, 'lotes_da_coleta_chave_unica')) throw erro;
        const anterior = await naOrganizacao(banco, organizacao.id, (tx) =>
          loteRecebido(tx, lido.lote.chave),
        );
        if (!anterior) throw erro;
        return anterior;
      }
    },
  );
};
