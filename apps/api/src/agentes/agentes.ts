// Os agentes do GLPI (spec inventario-pelo-agente; change inventario-pelo-agente-glpi, design,
// decisões 1, 4, 5 e 6): o token do endereço, guardado como hash; o contato e o inventário de cada
// agente; a ligação ao ativo pela série ou pelo hostname; os valores do inventário gravados pelo
// gravarAtivo, com o autor de sistema; e os softwares do último inventário completo.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { agentes, ativos, softwaresDosAtivos, type Transacao, tokensDosAgentes } from '@grafite/db';
import {
  camposDoAtivo,
  type InventarioDoAgente,
  identificadorComparavel,
  lerInventarioDoGlpi,
  lerValor,
  nomeDoDeviceid,
  SEM_ACESSO,
} from '@grafite/domain';
import { eq, isNull, sql } from 'drizzle-orm';
import { lerArvore } from '../arvore.ts';
import { camposDaOrganizacao, gravarAtivo, lerTipoDoAtivo } from '../ativos/escrita.ts';
import { lerAtivo } from '../ativos/leitura.ts';
import { ProblemaDaApi } from '../problemas.ts';
import {
  cadastrarComputador,
  lerCadastroDosAgentes,
  rotulosDosCamposRecusados,
} from './cadastro.ts';
import { modeloDoInventario } from './modelo.ts';

export const AUTOR_DO_AGENTE = 'Agente do GLPI';

/** O token novo do endereço dos agentes, e o hash que fica no banco. */
export function gerarTokenDosAgentes(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashDoToken(token) };
}

export const hashDoToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** O token confere com o do endereço em vigor da organização, em tempo constante. */
export async function tokenEmVigor(tx: Transacao, token: string): Promise<boolean> {
  const [emVigor] = await tx
    .select({ hash: tokensDosAgentes.hashDoToken })
    .from(tokensDosAgentes)
    .where(isNull(tokensDosAgentes.revogadoEm));
  if (!emVigor) return false;
  const recebido = Buffer.from(hashDoToken(token), 'hex');
  const guardado = Buffer.from(emVigor.hash, 'hex');
  return recebido.length === guardado.length && timingSafeEqual(recebido, guardado);
}

/** O CONTACT: o agente passa a existir, ou o último contato e a versão andam. */
export async function registrarContato(
  tx: Transacao,
  {
    orgId,
    deviceid,
    versao,
    ip,
    momento,
  }: { orgId: string; deviceid: string; versao: string | null; ip: string; momento: Date },
) {
  await tx
    .insert(agentes)
    .values({
      orgId,
      deviceid,
      nome: nomeDoDeviceid(deviceid),
      versao,
      ip,
      primeiroContato: momento,
      ultimoContato: momento,
    })
    .onConflictDoUpdate({
      target: [agentes.orgId, agentes.deviceid],
      set: {
        ultimoContato: momento,
        versao: sql`coalesce(excluded.versao, ${agentes.versao})`,
        ip: sql`case when ${agentes.ultimoInventario} is null then excluded.ip else ${agentes.ip} end`,
      },
    });
}

/** A série ou o hostname do ativo, comparáveis, como a SQL compara. */
const comparavel = (coluna: typeof ativos.serie | typeof ativos.hostname) =>
  sql`lower(regexp_replace(coalesce(${coluna}, ''), '\\s', '', 'g'))`;

const SERIES_GENERICAS = new Set([
  'tobefilledbyoem',
  'defaultstring',
  'systemserialnumber',
  'unknown',
  'none',
  'notavailable',
  'notapplicable',
  'noserialnumber',
  'notspecified',
  'na',
]);

function serieParaIdentificar(serie: string | null) {
  const valor = identificadorComparavel(serie);
  const semPontuacao = valor?.replace(/[^a-z0-9]/g, '') ?? '';
  return !semPontuacao || SERIES_GENERICAS.has(semPontuacao) || /^0+$/.test(semPontuacao)
    ? null
    : valor;
}

/** O único ativo ativo cuja série, ou cujo hostname, confere; sem um só, `null`. */
async function ativoDaMaquina(
  tx: Transacao,
  { serie, hostname }: { serie: string | null; hostname: string | null },
): Promise<{ ativoId: string | null; impedeCadastro: boolean }> {
  for (const [coluna, valor] of [
    [ativos.serie, serieParaIdentificar(serie)],
    [ativos.hostname, identificadorComparavel(hostname)],
  ] as const) {
    if (!valor) continue;
    const achados = await tx
      .select({ id: ativos.id, situacao: ativos.situacao })
      .from(ativos)
      .where(sql`${comparavel(coluna)} = ${valor}`)
      .limit(2);
    if (achados.length === 1 && achados[0]?.situacao === 'ativo')
      return { ativoId: achados[0].id, impedeCadastro: false };
    if (achados.length > 0) return { ativoId: null, impedeCadastro: true };
  }
  return { ativoId: null, impedeCadastro: false };
}

const LOTE_DE_SOFTWARES = 1000;

/** Troca os softwares do ativo pelos do inventário. */
async function trocarSoftwares(
  tx: Transacao,
  {
    orgId,
    ativoId,
    softwares,
    momento,
  }: {
    orgId: string;
    ativoId: string;
    softwares: NonNullable<InventarioDoAgente['softwares']>;
    momento: Date;
  },
) {
  await tx.delete(softwaresDosAtivos).where(eq(softwaresDosAtivos.ativoId, ativoId));
  for (let inicio = 0; inicio < softwares.length; inicio += LOTE_DE_SOFTWARES) {
    await tx.insert(softwaresDosAtivos).values(
      softwares.slice(inicio, inicio + LOTE_DE_SOFTWARES).map((software) => ({
        orgId,
        ativoId,
        nome: software.nome.slice(0, 500),
        versao: software.versao,
        editor: software.editor,
        instaladoEm: software.instaladoEm,
        inventariadoEm: momento,
      })),
    );
  }
}

/**
 * O INVENTORY: guarda o agente, liga-o ao ativo pela série ou pelo hostname, grava os valores do
 * inventário no ativo ligado e troca os softwares, no inventário completo.
 */
export async function receberInventario(
  tx: Transacao,
  {
    orgId,
    deviceid,
    conteudo,
    parcial,
    itemtype,
    ip,
    momento,
    avisar,
  }: {
    orgId: string;
    deviceid: string;
    conteudo: unknown;
    parcial: boolean;
    itemtype?: string | null;
    ip: string;
    momento: Date;
    avisar: (dados: object, mensagem: string) => void;
  },
): Promise<{ ativoId: string | null }> {
  const inventario = lerInventarioDoGlpi(conteudo);
  const nome = inventario.nome ?? nomeDoDeviceid(deviceid);
  const [agente] = await tx
    .insert(agentes)
    .values({
      orgId,
      deviceid,
      nome,
      versao: inventario.versaoDoAgente,
      serie: inventario.serie,
      sistema: inventario.sistema,
      ip: inventario.ips[0] ?? ip,
      primeiroContato: momento,
      ultimoContato: momento,
      ultimoInventario: momento,
    })
    .onConflictDoUpdate({
      target: [agentes.orgId, agentes.deviceid],
      set: {
        nome,
        versao: sql`coalesce(excluded.versao, ${agentes.versao})`,
        serie: sql`coalesce(excluded.serie, ${agentes.serie})`,
        sistema: sql`coalesce(excluded.sistema, ${agentes.sistema})`,
        ip: inventario.ips[0] ? sql`excluded.ip` : sql`coalesce(${agentes.ip}, excluded.ip)`,
        ultimoContato: momento,
        ultimoInventario: momento,
      },
    })
    .returning();
  if (!agente) throw new Error('O agente não foi gravado.');

  let ativoId = agente.ativoId;
  if (!ativoId) {
    let pendenciaCadastro: typeof agente.pendenciaCadastro = null;
    // Agentes reinstalados têm deviceids distintos: a identidade precisa da mesma trava.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`cadastro-agentes:${orgId}`}, 0))`,
    );
    const identidade = await ativoDaMaquina(tx, { serie: agente.serie, hostname: nome });
    ativoId = identidade.ativoId;
    if (!ativoId) {
      const { tipoId, localId } = await lerCadastroDosAgentes(tx);
      if (tipoId) {
        if (identidade.impedeCadastro) pendenciaCadastro = { motivo: 'identidade', campos: [] };
        else if (parcial && (itemtype !== 'Computer' || !inventario.nome))
          pendenciaCadastro = { motivo: 'parcial', campos: [] };
        else if (!inventario.nome) pendenciaCadastro = { motivo: 'hostname', campos: [] };
        else {
          try {
            ativoId = await cadastrarComputador(tx, {
              orgId,
              inventario,
              momento,
              ip,
              autor: AUTOR_DO_AGENTE,
              configuracao: { tipoId, localId },
            });
          } catch (erro) {
            if (!(erro instanceof ProblemaDaApi)) throw erro;
            const chaves = Object.keys(erro.dados.campos ?? {});
            const motivo = chaves.includes('tipoId')
              ? 'tipo'
              : chaves.includes('localId')
                ? 'local'
                : 'campos';
            const campos =
              motivo === 'campos' ? await rotulosDosCamposRecusados(tx, tipoId, chaves) : [];
            pendenciaCadastro = { motivo, campos };
            avisar(
              { agenteId: agente.id, motivo, campos },
              'o inventário foi recebido, mas o cadastro do computador precisa de revisão',
            );
          }
        }
      }
    }
    if (identidade.impedeCadastro)
      avisar(
        { agenteId: agente.id },
        'a identidade do computador corresponde a cadastro inativo ou ambíguo',
      );
    await tx.update(agentes).set({ ativoId, pendenciaCadastro }).where(eq(agentes.id, agente.id));
  }
  if (!ativoId) return { ativoId: null };

  const atual = await lerAtivo(tx, ativoId, { travar: true });
  if (atual.ativo.situacao !== 'ativo') return { ativoId };
  const tipo = await lerTipoDoAtivo(tx, atual.ativo.tipoId);
  if (!tipo) return { ativoId };
  const definicoes = camposDoAtivo({ tipo, campos: await camposDaOrganizacao(tx) });
  // Só os valores que o motor de campos aceita: o que veio fora do formato fica de fora.
  const valores: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(inventario.valores)) {
    const definicao = definicoes.porChave.get(chave);
    if (definicao && lerValor(definicao, valor).ok) valores[chave] = valor;
  }
  // A série e o hostname do ativo, só quando estão vazios.
  if (inventario.serie && !atual.ativo.serie) valores['ativo.serie'] = inventario.serie;
  if (inventario.nome && !atual.ativo.hostname) valores['ativo.hostname'] = inventario.nome;
  if (Object.keys(valores).length > 0 || !atual.ativo.modeloId) {
    try {
      await tx.transaction(async (escrita) => {
        const modeloId =
          !atual.ativo.modeloId && tipo.situacao === 'ativo'
            ? await modeloDoInventario(escrita, {
                orgId,
                tipo,
                inventario,
                momento,
                autor: AUTOR_DO_AGENTE,
                ip,
              })
            : undefined;
        await gravarAtivo(escrita, {
          quem: {
            contaId: '',
            acesso: SEM_ACESSO,
            origem: 'agente',
            rastreio: { ip },
            sistema: AUTOR_DO_AGENTE,
          },
          arvore: await lerArvore(escrita),
          momento,
          atual,
          tipoId: atual.ativo.tipoId,
          pedido: { valores, ...(modeloId ? { modeloId } : {}) },
          lerLinha: (id) => lerAtivo(escrita, id),
        });
      });
    } catch (erro) {
      // A recusa do motor de campos não derruba o inventário: os softwares e o agente ficam.
      if (!(erro instanceof ProblemaDaApi)) throw erro;
      avisar({ ativoId, detalhe: erro.message }, 'o inventário do agente não gravou no ativo');
    }
  }
  if (inventario.softwares !== null) {
    await trocarSoftwares(tx, { orgId, ativoId, softwares: inventario.softwares, momento });
  } else if (!parcial) {
    // O inventário completo sem a seção de softwares diz que a máquina não tem nenhum.
    await trocarSoftwares(tx, { orgId, ativoId, softwares: [], momento });
  }
  return { ativoId };
}
