// Os campos da organização (spec catalogo-de-ativos e campos-personalizados; design do P1a, decisões
// 2, 3, 8 e 10): toda sessão lê os campos, com quantos tipos ativos usam cada um; quem tem
// `catalogo.administrar` cadastra, edita, inativa e reativa. O tipo de campo não muda depois de
// criado, a configuração é conferida pelo domínio, e as opções de uma lista só se inativam: o id de
// cada uma é dado aqui e não muda, porque é ele que os ativos guardam.
import {
  type Banco,
  campos,
  camposDoTipo,
  naOrganizacao,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type ConfiguracaoDoCampo,
  conferirConfiguracao,
  normalizarTexto,
  type OpcaoDaLista,
  opcoesExcluidas,
  POLITICAS_DE_ESCRITA,
  pode,
  recusaDaInativacaoPeloIp,
  rotuloReservado,
  TIPOS_DE_CAMPO,
  type TipoDeCampo,
} from '@grafite/domain';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import {
  ConfiguracaoDoCampo as EsquemaDaConfiguracao,
  SituacaoDoCadastro,
} from '../catalogo/esquemas.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const Campo = z
  .object({
    id: z.uuid(),
    rotulo: z.string(),
    tipo: z.enum(TIPOS_DE_CAMPO),
    grupo: z.string().nullable(),
    configuracao: EsquemaDaConfiguracao,
    /** Só quem pode ver os campos restritos vê o valor dele. */
    restrito: z.boolean(),
    /** Só a edição manual, ou também a importação e a coleta. */
    escrita: z.enum(POLITICAS_DE_ESCRITA),
    situacao: SituacaoDoCadastro,
    /** Quantos tipos ativos usam o campo. */
    usadoPor: z.number().int().min(0),
    permite: z.object({ editar: z.boolean() }),
  })
  .meta({ id: 'Campo' });

const ListaDeCampos = z
  .object({ campos: z.array(Campo), permite: z.object({ cadastrar: z.boolean() }) })
  .meta({ id: 'ListaDeCampos' });

/** O rótulo, sem repetir o de um campo comum a todo ativo nem o de um campo de capacidade. */
const RotuloDoCampo = z
  .string({ error: 'Informe o rótulo do campo.' })
  .trim()
  .min(1, { error: 'Informe o rótulo do campo.' })
  .max(60, { error: 'Use até 60 caracteres.' })
  .superRefine((rotulo, contexto) => {
    const reservado = rotuloReservado(rotulo);
    if (reservado) contexto.addIssue({ code: 'custom', message: reservado });
  });

/** O grupo: vazio é a falta dele. */
const GrupoDoCampo = z
  .string()
  .trim()
  .max(40, { error: 'Use até 40 caracteres.' })
  .nullable()
  .transform((grupo) => (grupo ? grupo : null));

/** A configuração pedida: quem a confere é o domínio, conforme o tipo do campo. */
const ConfiguracaoPedida = z.record(z.string(), z.unknown());

const PedidoDeCampo = z
  .object({
    rotulo: RotuloDoCampo,
    tipo: z.enum(TIPOS_DE_CAMPO, { error: 'Escolha o tipo do campo.' }),
    grupo: GrupoDoCampo.default(null),
    configuracao: ConfiguracaoPedida.default({}),
    restrito: z.boolean().default(false),
    escrita: z.enum(POLITICAS_DE_ESCRITA).default('automatica'),
  })
  .meta({ id: 'PedidoDeCampo' });

/** Sem o tipo do campo: ele não muda depois de criado. */
const PedidoDeAlteracaoDoCampo = z
  .object({
    rotulo: RotuloDoCampo.optional(),
    grupo: GrupoDoCampo.optional(),
    configuracao: ConfiguracaoPedida.optional(),
    restrito: z.boolean().optional(),
    escrita: z.enum(POLITICAS_DE_ESCRITA).optional(),
  })
  .meta({ id: 'PedidoDeAlteracaoDoCampo' });

const ParametrosDoCampo = z.object({ id: z.uuid({ error: 'Campo não encontrado.' }) });

const ROTULO_REPETIDO = 'Já existe um campo com este rótulo.';
const OPCAO_EXCLUIDA = 'As opções não são excluídas: inative a opção.';

type LinhaDoCampo = typeof campos.$inferSelect;

async function lerCampo(tx: Transacao, id: string, { travar = false } = {}): Promise<LinhaDoCampo> {
  const consulta = tx.select().from(campos).where(eq(campos.id, id));
  const [campo] = await (travar ? consulta.for('update') : consulta);
  if (!campo) throw naoEncontrado('Campo não encontrado.');
  return campo;
}

/** Quantos tipos ativos usam cada campo. */
async function usoDosCampos(tx: Transacao): Promise<Map<string, number>> {
  const linhas = await tx
    .select({ campoId: camposDoTipo.campoId, total: count() })
    .from(camposDoTipo)
    .innerJoin(
      tiposDeAtivo,
      and(eq(tiposDeAtivo.orgId, camposDoTipo.orgId), eq(tiposDeAtivo.id, camposDoTipo.tipoId)),
    )
    .where(eq(tiposDeAtivo.situacao, 'ativo'))
    .groupBy(camposDoTipo.campoId);
  return new Map(linhas.map(({ campoId, total }) => [campoId, total]));
}

/** Ids novos do banco, em uuidv7, para as opções que chegam sem um. */
async function idsNovos(tx: Transacao, quantos: number): Promise<string[]> {
  if (quantos === 0) return [];
  const { rows } = await tx.execute<{ id: string }>(
    sql`select uuidv7() as id from generate_series(1, ${quantos})`,
  );
  return rows.map((linha) => linha.id);
}

/**
 * Confere a configuração pelo domínio. O id que o pedido traz só vale se a opção já existia no
 * campo; o resto ganha um id novo. A recusa vai para cada parte, como `configuracao.minimo`.
 */
async function configuracaoConferida(
  tx: Transacao,
  tipo: TipoDeCampo,
  pedida: Record<string, unknown>,
  existentes: readonly OpcaoDaLista[],
): Promise<ConfiguracaoDoCampo> {
  const conhecidos = new Set(existentes.map((opcao) => opcao.id));
  const vistos = new Set<string>();
  const opcoes = Array.isArray(pedida.opcoes)
    ? pedida.opcoes.map((item) => {
        const opcao = typeof item === 'object' && item !== null ? { ...item } : {};
        const id = (opcao as { id?: unknown }).id;
        if (typeof id === 'string' && conhecidos.has(id) && !vistos.has(id)) vistos.add(id);
        else delete (opcao as { id?: unknown }).id;
        return opcao;
      })
    : pedida.opcoes;
  const semId = Array.isArray(opcoes)
    ? opcoes.filter((opcao) => !(opcao as { id?: unknown }).id).length
    : 0;
  const novos = await idsNovos(tx, semId);
  const conferida = conferirConfiguracao(
    tipo,
    opcoes === undefined ? pedida : { ...pedida, opcoes },
    () => novos.shift() ?? '',
  );
  if (!conferida.ok) {
    throw dadosInvalidos(
      Object.fromEntries(
        Object.entries(conferida.erros).map(([parte, motivo]) => [
          parte === 'configuracao' ? parte : `configuracao.${parte}`,
          motivo,
        ]),
      ),
    );
  }
  return conferida.configuracao;
}

/**
 * Os tipos aceitos de um campo de ativo existem, e os que entram na configuração estão ativos: um
 * tipo aceito que é inativado depois fica nela (design do P1d, decisão 1).
 */
async function conferirTiposAceitos(
  tx: Transacao,
  configuracao: ConfiguracaoDoCampo,
  antes: ConfiguracaoDoCampo | null,
) {
  const tipos = configuracao.tipos ?? [];
  if (tipos.length === 0) return;
  const linhas = await tx
    .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome, situacao: tiposDeAtivo.situacao })
    .from(tiposDeAtivo)
    .where(inArray(tiposDeAtivo.id, tipos));
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  if (tipos.some((id) => !porId.has(id))) {
    throw dadosInvalidos({ 'configuracao.tipos': 'Tipo de ativo não encontrado.' });
  }
  const jaAceitos = new Set(antes?.tipos ?? []);
  const inativo = tipos
    .filter((id) => !jaAceitos.has(id))
    .map((id) => porId.get(id))
    .find((tipo) => tipo?.situacao === 'inativo');
  if (inativo) {
    const motivo = `O tipo ${inativo.nome} está inativo.`;
    throw conflito(motivo, { 'configuracao.tipos': motivo });
  }
}

async function semRotuloRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'campos_rotulo_unico')) {
      throw conflito(ROTULO_REPETIDO, { rotulo: ROTULO_REPETIDO });
    }
    throw erro;
  }
}

const opcoesDa = (configuracao: unknown): OpcaoDaLista[] =>
  ((configuracao as ConfiguracaoDoCampo | null)?.opcoes ?? []) as OpcaoDaLista[];

/** O que a auditoria guarda do campo, com a configuração inteira. */
const visaoDoCampo = (campo: LinhaDoCampo) => ({
  rotulo: campo.rotulo,
  tipo: campo.tipo,
  grupo: campo.grupo,
  configuracao: campo.configuracao,
  restrito: campo.restrito,
  escrita: campo.escrita,
  situacao: campo.situacao,
});

export const rotasDosCampos: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  const RESPOSTAS_DO_CAMPO = {
    200: Campo,
    401: RespostaDeProblema,
    409: RespostaDeProblema,
    ...PROBLEMAS_DO_ACESSO,
  };

  const comUso = (campo: LinhaDoCampo, uso: ReadonlyMap<string, number>, editar: boolean) => ({
    id: campo.id,
    rotulo: campo.rotulo,
    tipo: campo.tipo,
    grupo: campo.grupo,
    configuracao: campo.configuracao as ConfiguracaoDoCampo,
    restrito: campo.restrito,
    escrita: campo.escrita,
    situacao: campo.situacao,
    usadoPor: uso.get(campo.id) ?? 0,
    permite: { editar },
  });

  app.get(
    '/campos',
    {
      config: { semPermissao: 'referencia' },
      schema: {
        summary: 'Os campos da organização',
        response: { 200: ListaDeCampos, 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO },
      },
    },
    async (requisicao) => {
      const editar = pode(sessaoDa(requisicao).acesso, 'catalogo.administrar');
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const lidos = await tx.select().from(campos).orderBy(asc(campos.rotuloNormalizado));
        const uso = await usoDosCampos(tx);
        return {
          campos: lidos.map((campo) => comUso(campo, uso, editar)),
          permite: { cadastrar: editar },
        };
      });
    },
  );

  app.post(
    '/campos',
    {
      config: { permissao: 'catalogo.administrar' },
      schema: {
        summary: 'Cadastrar um campo da organização',
        body: PedidoDeCampo,
        response: { ...RESPOSTAS_DO_CAMPO, 201: Campo },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      const criado = await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const configuracao = await configuracaoConferida(tx, pedido.tipo, pedido.configuracao, []);
        await conferirTiposAceitos(tx, configuracao, null);
        const [campo] = await semRotuloRepetido(() =>
          tx
            .insert(campos)
            .values({
              orgId: sql`app.current_org()`,
              rotulo: pedido.rotulo,
              rotuloNormalizado: normalizarTexto(pedido.rotulo),
              tipo: pedido.tipo,
              grupo: pedido.grupo,
              configuracao: configuracao as Record<string, unknown>,
              restrito: pedido.restrito,
              escrita: pedido.escrita,
              criadoEm: momento,
              atualizadoEm: momento,
            })
            .returning(),
        );
        if (!campo) throw new Error('O campo não foi cadastrado.');
        await registrarNaAuditoria(tx, {
          acao: 'campo.criado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'campo', id: campo.id },
          depois: visaoDoCampo(campo),
          origem: origemDa(requisicao),
          momento,
        });
        return comUso(campo, new Map(), true);
      });
      return resposta.code(201).send(criado);
    },
  );

  app.patch(
    '/campos/:id',
    {
      config: { permissao: 'catalogo.administrar' },
      schema: {
        summary: 'Editar um campo da organização, sem mudar o tipo dele',
        params: ParametrosDoCampo,
        body: PedidoDeAlteracaoDoCampo,
        response: RESPOSTAS_DO_CAMPO,
      },
    },
    async (requisicao) => {
      const { contaId } = sessaoDa(requisicao);
      const pedido = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const antes = await lerCampo(tx, requisicao.params.id, { travar: true });
        const opcoesAntes = opcoesDa(antes.configuracao);
        let configuracao = antes.configuracao as ConfiguracaoDoCampo;
        if (pedido.configuracao) {
          const pedidas = Array.isArray(pedido.configuracao.opcoes)
            ? (pedido.configuracao.opcoes as Record<string, unknown>[])
            : [];
          if (opcoesAntes.length > 0 && opcoesExcluidas(opcoesAntes, pedidas).length > 0) {
            throw conflito(OPCAO_EXCLUIDA, { 'configuracao.opcoes': OPCAO_EXCLUIDA });
          }
          configuracao = await configuracaoConferida(
            tx,
            antes.tipo,
            pedido.configuracao,
            opcoesAntes,
          );
          await conferirTiposAceitos(tx, configuracao, antes.configuracao as ConfiguracaoDoCampo);
        }
        const rotulo = pedido.rotulo ?? antes.rotulo;
        const valores = {
          rotulo,
          rotuloNormalizado: normalizarTexto(rotulo),
          grupo: pedido.grupo === undefined ? antes.grupo : pedido.grupo,
          configuracao: configuracao as Record<string, unknown>,
          restrito: pedido.restrito ?? antes.restrito,
          escrita: pedido.escrita ?? antes.escrita,
        };
        const mudou =
          valores.rotulo !== antes.rotulo ||
          valores.grupo !== antes.grupo ||
          valores.restrito !== antes.restrito ||
          valores.escrita !== antes.escrita ||
          JSON.stringify(valores.configuracao) !== JSON.stringify(antes.configuracao);
        const uso = await usoDosCampos(tx);
        if (!mudou) return comUso(antes, uso, true);
        const [depois] = await semRotuloRepetido(() =>
          tx
            .update(campos)
            .set({ ...valores, atualizadoEm: momento })
            .where(eq(campos.id, antes.id))
            .returning(),
        );
        if (!depois) throw new Error('O campo não foi alterado.');
        await registrarNaAuditoria(tx, {
          acao: 'campo.alterado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'campo', id: antes.id },
          antes: visaoDoCampo(antes),
          depois: visaoDoCampo(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return comUso(depois, uso, true);
      });
    },
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'campo.inativado'],
    ['reativacao', 'ativo', 'campo.reativado'],
  ] as const) {
    app.post(
      `/campos/:id/${caminho}`,
      {
        config: { permissao: 'catalogo.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar um campo' : 'Reativar um campo',
          params: ParametrosDoCampo,
          response: RESPOSTAS_DO_CAMPO,
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
          const antes = await lerCampo(tx, requisicao.params.id, { travar: true });
          const uso = await usoDosCampos(tx);
          if (antes.situacao === situacao) return comUso(antes, uso, true);
          if (situacao === 'inativo') {
            // O campo que é o IP de uma capacidade em algum tipo fica ativo (design do P2a e do
            // P2b), com a recusa que diz qual capacidade o usa.
            for (const capacidade of [
              'rede.disponibilidade',
              'snmp.suprimentos',
              'controlid.saude',
            ] as const) {
              const comoIp = await tx
                .select({ id: tiposDeAtivo.id })
                .from(tiposDeAtivo)
                .where(
                  sql`${tiposDeAtivo.configuracaoDasCapacidades} -> ${capacidade}::text ->> 'campoDoIp' = ${antes.id}::text`,
                );
              if (comoIp.length > 0) {
                throw conflito(recusaDaInativacaoPeloIp(antes.rotulo, capacidade, comoIp.length));
              }
            }
          }
          // As ligações com os tipos ficam: o campo volta a eles quando é reativado.
          const [depois] = await tx
            .update(campos)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(campos.id, antes.id))
            .returning();
          if (!depois) throw new Error('O campo não foi alterado.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'campo', id: antes.id },
            antes: visaoDoCampo(antes),
            depois: visaoDoCampo(depois),
            origem: origemDa(requisicao),
            momento,
          });
          return comUso(depois, uso, true);
        });
      },
    );
  }
};
