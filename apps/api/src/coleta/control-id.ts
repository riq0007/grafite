// A saúde dos controles de acesso (spec saude-do-control-id, "Login de cada controle" e "Situação do
// Control iD"; change p2c-saude-do-control-id, design, decisões 3 e 7): numa leitura, os segredos
// ligados a cada controle no cofre e o escolhido no tipo, e o domínio decide qual vale. A
// configuração da coleta, a ficha e a tabela usam a mesma escolha, e o motivo do "Não verificado" é o
// mesmo nas três. No banco, a mesma situação serve ao filtro "é qualquer de", à contagem e à ordem
// da coluna, com o que pede atenção primeiro e, na mesma situação, a sondagem mais antiga antes. Sem
// o relógio: a tela diz se a sondagem está desatualizada.
import {
  ativos,
  coletores,
  estadoDosAtivos,
  segredos,
  segredosDosAtivos,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  escolhaDeColetor,
  type LoginDoControle,
  loginDoControle,
  ORDEM_DAS_SITUACOES_DO_CONTROL_ID,
  type SegredoDoLogin,
  situacaoDoControlId,
  TIPOS_DO_LOGIN_DO_CONTROL_ID,
} from '@grafite/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { SaudeDoControlId } from '../ativos/esquemas.ts';
import type { ConfiguracaoDasCapacidades } from '../catalogo/esquemas.ts';
import { coletoresAtivos } from './alvos.ts';
import type { AtivoComDisponibilidade } from './disponibilidade.ts';

type Configuracao = z.infer<typeof ConfiguracaoDasCapacidades>;

/** Um controle de acesso: o ativo e o tipo, que guarda a porta e o login. */
export interface Controle {
  ativoId: string;
  tipoId: string;
}

const doSegredo = {
  id: segredos.id,
  tipo: segredos.tipo,
  situacao: segredos.situacao,
  identificador: segredos.identificador,
};

export const LOGIN_INVALIDO =
  'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.';

/** O segredo que serve de login de um controle: ativo, de um dos dois tipos, com o usuário. */
export const serveDeLogin = and(
  inArray(segredos.tipo, [...TIPOS_DO_LOGIN_DO_CONTROL_ID]),
  eq(segredos.situacao, 'ativo'),
  sql`btrim(coalesce(${segredos.identificador}, '')) <> ''`,
);

/** A configuração da saúde do Control iD de cada tipo dado, pelo id. */
export async function controlIdDosTipos(tx: Transacao, tipoIds: readonly string[]) {
  if (tipoIds.length === 0) return new Map<string, NonNullable<Configuracao['controlid.saude']>>();
  const tipos = await tx
    .select({ id: tiposDeAtivo.id, configuracao: tiposDeAtivo.configuracaoDasCapacidades })
    .from(tiposDeAtivo)
    .where(inArray(tiposDeAtivo.id, [...tipoIds]));
  return new Map(
    tipos.flatMap(({ id, configuracao }) => {
      const doControle = (configuracao as Configuracao)['controlid.saude'];
      return doControle ? [[id, doControle] as const] : [];
    }),
  );
}

/** O login de cada controle, pelo id do ativo. */
export async function loginsDosControles(
  tx: Transacao,
  controles: readonly Controle[],
): Promise<Map<string, LoginDoControle>> {
  if (controles.length === 0) return new Map();
  const doTipo = await controlIdDosTipos(tx, [
    ...new Set(controles.map((controle) => controle.tipoId)),
  ]);
  const idsDosTipos = [
    ...new Set([...doTipo.values()].flatMap(({ segredoId }) => (segredoId ? [segredoId] : []))),
  ];
  const dosTipos =
    idsDosTipos.length === 0
      ? []
      : await tx.select(doSegredo).from(segredos).where(inArray(segredos.id, idsDosTipos));
  const ligados = await tx
    .select({ ativoId: segredosDosAtivos.ativoId, ...doSegredo })
    .from(segredosDosAtivos)
    .innerJoin(
      segredos,
      and(
        eq(segredos.orgId, segredosDosAtivos.orgId),
        eq(segredos.id, segredosDosAtivos.segredoId),
      ),
    )
    .where(
      inArray(
        segredosDosAtivos.ativoId,
        controles.map((controle) => controle.ativoId),
      ),
    );
  const porId = new Map<string, SegredoDoLogin>(dosTipos.map((segredo) => [segredo.id, segredo]));
  const porAtivo = new Map<string, SegredoDoLogin[]>();
  for (const { ativoId, ...segredo } of ligados) {
    porAtivo.set(ativoId, [...(porAtivo.get(ativoId) ?? []), segredo]);
  }
  return new Map(
    controles.map(({ ativoId, tipoId }) => {
      const segredoId = doTipo.get(tipoId)?.segredoId;
      return [
        ativoId,
        loginDoControle({
          doTipo: (segredoId && porId.get(segredoId)) || null,
          // O tipo sem login (change login-de-cada-controle, design, decisão 2).
          escolhidoNoTipo: Boolean(segredoId),
          ligados: porAtivo.get(ativoId) ?? [],
        }),
      ];
    }),
  );
}

/** A coluna do Control iD na tabela dos ativos. */
export const COLUNA_DO_CONTROL_ID = 'coleta.control-id';

/** Se o tipo do ativo liga a saúde do Control iD. */
const tipoComControlId = sql`'controlid.saude' = any(${tiposDeAtivo.capacidades})`;

/** O campo de IP que o tipo escolheu para a sondagem, no JSONB da configuração. */
const campoDoIpDaSondagem = sql<
  string | null
>`(${tiposDeAtivo.configuracaoDasCapacidades} -> 'controlid.saude' ->> 'campoDoIp')`;

/**
 * Os logins da organização para a situação no banco, lidos uma vez por pedido: os tipos com o login
 * escolhido ativo e os controles com um ou com mais de um login ligado no cofre. Assim, a situação de
 * cada linha só lê a sondagem, como a disponibilidade.
 */
export interface LoginsNoBanco {
  tiposComLogin: readonly string[];
  comUmLogin: readonly string[];
  comVariosLogins: readonly string[];
}

export const SEM_LOGINS: LoginsNoBanco = { tiposComLogin: [], comUmLogin: [], comVariosLogins: [] };

export async function lerLoginsNoBanco(tx: Transacao): Promise<LoginsNoBanco> {
  const tipos = await tx
    .select({
      id: tiposDeAtivo.id,
      segredoId: sql<
        string | null
      >`(${tiposDeAtivo.configuracaoDasCapacidades} -> 'controlid.saude' ->> 'segredoId')`,
    })
    .from(tiposDeAtivo)
    .where(tipoComControlId);
  if (tipos.length === 0) return SEM_LOGINS;
  const escolhidos = [...new Set(tipos.flatMap(({ segredoId }) => (segredoId ? [segredoId] : [])))];
  const ativosEscolhidos = new Set(
    escolhidos.length === 0
      ? []
      : (
          await tx
            .select({ id: segredos.id })
            .from(segredos)
            .where(and(inArray(segredos.id, escolhidos), eq(segredos.situacao, 'ativo')))
        ).map(({ id }) => id),
  );
  const ligados = await tx
    .select({ ativoId: segredosDosAtivos.ativoId, logins: sql<number>`count(*)::int` })
    .from(segredosDosAtivos)
    .innerJoin(
      segredos,
      and(
        eq(segredos.orgId, segredosDosAtivos.orgId),
        eq(segredos.id, segredosDosAtivos.segredoId),
      ),
    )
    .where(
      and(
        eq(segredos.situacao, 'ativo'),
        inArray(segredos.tipo, [...TIPOS_DO_LOGIN_DO_CONTROL_ID]),
        sql`btrim(coalesce(${segredos.identificador}, '')) <> ''`,
      ),
    )
    .groupBy(segredosDosAtivos.ativoId);
  return {
    tiposComLogin: tipos.flatMap(({ id, segredoId }) =>
      segredoId && ativosEscolhidos.has(segredoId) ? [id] : [],
    ),
    comUmLogin: ligados.flatMap(({ ativoId, logins }) => (logins === 1 ? [ativoId] : [])),
    comVariosLogins: ligados.flatMap(({ ativoId, logins }) => (logins > 1 ? [ativoId] : [])),
  };
}

/** A coluna entre os ids dados; nenhum id, nenhuma linha. */
const entre = (coluna: typeof ativos.id | typeof ativos.tipoId, ids: readonly string[]) =>
  ids.length === 0 ? sql`false` : sql`${coluna} in ${[...ids]}`;

/** O estado atual da sondagem do ativo da linha, numa subconsulta. */
const daSondagem = (coluna: string) =>
  sql`(select ${sql.raw(coluna)} from estado_dos_ativos e
        where e.org_id = ${ativos.orgId} and e.ativo_id = ${ativos.id}
          and e.metrica = 'controlid.sondagem' and e.item = '')`;

/**
 * A situação no banco, como o domínio a diz: vazia no ativo inativo e no de tipo sem a capacidade;
 * "nao-verificado" sem o IP, sem um login que sirva ou sem sondagem; e a da última sondagem.
 */
export const situacaoDoControlIdNoBanco = (logins: LoginsNoBanco) => sql<string | null>`(case
  when ${ativos.situacao} = 'inativo' or not ${tipoComControlId} then null
  when (${ativos.valores} ->> ${campoDoIpDaSondagem}) is null then 'nao-verificado'
  when ${entre(ativos.id, logins.comVariosLogins)} then 'nao-verificado'
  when not ${entre(ativos.id, logins.comUmLogin)}
    and not ${entre(ativos.tipoId, logins.tiposComLogin)} then 'nao-verificado'
  else coalesce(${daSondagem("case when e.situacao = 'sem-dado' or e.valor_texto is null then 'sem-dado' else e.valor_texto end")}, 'nao-verificado')
end)`;

/** A chave da ordem: a posição da situação e, nela, o momento da sondagem, em ms. */
export const ordemDoControlId = (logins: LoginsNoBanco) => sql`(array_position(array[${sql.join(
  ORDEM_DAS_SITUACOES_DO_CONTROL_ID.map((situacao) => sql`${situacao}`),
  sql`, `,
)}]::text[], ${situacaoDoControlIdNoBanco(logins)}) * 10000000000000::numeric
  + coalesce((extract(epoch from ${daSondagem('e.momento')}) * 1000)::numeric, 0))`;

type Saude = z.infer<typeof SaudeDoControlId>;

const iso = (momento: Date) => momento.toISOString();

/**
 * A saúde do Control iD de cada ativo, pelo id; fica de fora o inativo e o de tipo sem a capacidade.
 * O motivo "nenhum coletor alcança" só mostra o IP a quem vê o campo, como na disponibilidade.
 */
export async function controlIdDosAtivos(
  tx: Transacao,
  linhas: readonly AtivoComDisponibilidade[],
  {
    restritos,
    veRestritos,
  }: { restritos: ReadonlySet<string>; veRestritos: (localId: string | null) => boolean },
): Promise<Map<string, Saude>> {
  const resultado = new Map<string, Saude>();
  const tipos = await tx
    .select({ id: tiposDeAtivo.id, campoDoIp: campoDoIpDaSondagem })
    .from(tiposDeAtivo)
    .where(tipoComControlId);
  const campoDoTipo = new Map(tipos.map((tipo) => [tipo.id, tipo.campoDoIp]));
  const candidatos = linhas.filter(
    (linha) => linha.situacao === 'ativo' && campoDoTipo.has(linha.tipoId),
  );
  if (candidatos.length === 0) return resultado;
  const logins = await loginsDosControles(
    tx,
    candidatos.map((linha) => ({ ativoId: linha.id, tipoId: linha.tipoId })),
  );
  const estados = await tx
    .select()
    .from(estadoDosAtivos)
    .where(
      and(
        inArray(
          estadoDosAtivos.ativoId,
          candidatos.map((linha) => linha.id),
        ),
        inArray(estadoDosAtivos.metrica, ['controlid.sondagem', 'controlid.firmware']),
      ),
    );
  const estadoDe = (ativoId: string, metrica: string) =>
    estados.find((estado) => estado.ativoId === ativoId && estado.metrica === metrica);
  const nomes = new Map(
    (await tx.select({ id: coletores.id, nome: coletores.nome }).from(coletores)).map((coletor) => [
      coletor.id,
      coletor.nome,
    ]),
  );
  const escolher = escolhaDeColetor(await coletoresAtivos(tx));
  for (const linha of candidatos) {
    const campoDoIp = campoDoTipo.get(linha.tipoId) ?? null;
    const guardado = campoDoIp ? (linha.valores as Record<string, unknown>)[campoDoIp] : null;
    const ip = typeof guardado === 'string' && guardado !== '' ? guardado : null;
    const login = logins.get(linha.id) ?? {
      ok: false,
      motivo: 'O login escolhido no tipo está inativo.',
    };
    const sondagem = estadoDe(linha.id, 'controlid.sondagem');
    const firmware = estadoDe(linha.id, 'controlid.firmware');
    const situacao = situacaoDoControlId({
      ip,
      login,
      estado: sondagem ?? null,
      alcancado: ip !== null && escolher(ip) !== null,
    });
    const doContato = {
      ultimoContato: firmware ? iso(firmware.momento) : null,
      firmware: firmware?.situacao === 'valida' ? firmware.valorTexto : null,
      produto: typeof firmware?.detalhes?.produto === 'string' ? firmware.detalhes.produto : null,
      login: login.ok ? login.origem : null,
    };
    if (situacao.situacao === 'nao-verificado') {
      const ipEscondido =
        campoDoIp !== null && restritos.has(campoDoIp) && !veRestritos(linha.localId);
      resultado.set(linha.id, {
        situacao: 'nao-verificado',
        momento: null,
        desde: null,
        motivo:
          ipEscondido && ip
            ? situacao.motivo.replace(`o IP ${ip}`, 'o IP do ativo')
            : situacao.motivo,
        ...doContato,
        coletor: null,
      });
      continue;
    }
    resultado.set(linha.id, {
      situacao: situacao.situacao,
      momento: iso(situacao.momento),
      desde: iso(situacao.desde),
      motivo: null,
      ...doContato,
      coletor: sondagem ? (nomes.get(sondagem.coletorId) ?? null) : null,
    });
  }
  return resultado;
}
