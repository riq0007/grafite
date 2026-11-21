// O cartão do ativo na mensagem da TI e na nota (spec chamados, "Cartão do ativo na mensagem";
// change chat-com-chamados, design, decisões 10 e 15; tarefa 3.10): o retrato do ativo que quem
// escreve vê, montado na hora de mandar, com as leituras do resumo do ativo, e gravado no `cartao`
// da conversa. A prévia do campo de escrever dá o mesmo retrato. Quem participa o lê como foi
// mandado, sem `ativos.ver`; o ativo que quem escreve não vê, ou com o Ativos desligado, responde
// como o que não existe.
import { ativos, chamados, modelos, type Transacao, tiposDeAtivo } from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  normalizarTexto,
  podeEm,
  ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE,
  rotuloDoAtivo,
  SITUACOES_DA_DISPONIBILIDADE,
  veOChamado,
} from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import { camposRestritos } from '../ativos/leitura.ts';
import { disponibilidadeDosAtivos } from '../coleta/disponibilidade.ts';
import { suprimentosDosAtivos } from '../coleta/suprimentos.ts';
import { naoEncontrado } from '../problemas.ts';
import { chamadoNaoEncontrado } from './alcance.ts';
import { tonerCriticoDo } from './resumo-do-ativo.ts';

/** A recusa do cartão, na prévia e no envio. */
export const ATIVO_DO_CARTAO_NAO_ENCONTRADO = 'O ativo não foi encontrado.';

export const CartaoDoAtivo = z
  .object({
    /** O id do ativo, para o "Abrir a ficha" de quem o vê. */
    ativo: z.uuid(),
    /** O ícone do tipo do ativo. */
    icone: z.string(),
    /** O nome do tipo do ativo. */
    tipo: z.string(),
    /** O rótulo do ativo: o nome, ou o modelo, ou o tipo. */
    nome: z.string(),
    /** O fabricante e o modelo, como "HP LaserJet M428". */
    modelo: z.string().nullable(),
    patrimonio: z.string().nullable(),
    /** O IP do campo que o tipo usa na coleta; nulo no campo restrito, que o cartão não leva. */
    ip: z.string().nullable(),
    /** A situação da última leitura da disponibilidade, em texto; nula sem leitura. */
    disponibilidade: z
      .object({ situacao: z.enum(SITUACOES_DA_DISPONIBILIDADE), texto: z.string() })
      .nullable(),
    /**
     * O suprimento mais baixo medido, com o "Toner crítico" pelo alerta aberto, a quem vê os
     * alertas do ativo; nulo sem nenhum medido.
     */
    suprimento: z
      .object({ descricao: z.string(), percentual: z.number(), critico: z.boolean() })
      .nullable(),
    /** ISO 8601: quando o retrato foi montado, a hora dos dados. */
    em: z.iso.datetime(),
  })
  .meta({ id: 'CartaoDoAtivo' });
export type CartaoDoAtivo = z.infer<typeof CartaoDoAtivo>;

/** O cartão gravado, como esta versão o lê; o que ela não lê fica de fora, em vez de quebrar. */
export function cartaoLido(gravado: unknown): CartaoDoAtivo | null {
  if (gravado === null || gravado === undefined) return null;
  const lido = CartaoDoAtivo.safeParse(gravado);
  return lido.success ? lido.data : null;
}

/** O campo de IP que o tipo usa na coleta: o da disponibilidade, ou o dos suprimentos. */
function campoDoIp(tipo: { capacidades: string[]; configuracao: unknown }): string | null {
  const configuracao = (tipo.configuracao ?? {}) as Record<string, { campoDoIp?: unknown }>;
  for (const capacidade of ['rede.disponibilidade', 'snmp.suprimentos']) {
    const campo = configuracao[capacidade]?.campoDoIp;
    if (tipo.capacidades.includes(capacidade) && typeof campo === 'string') return campo;
  }
  return null;
}

/**
 * O retrato do ativo, pelo id ou pelo patrimônio, para quem escreve; nulo no ativo que não existe,
 * que ele não vê ou com o Ativos desligado.
 */
export async function retratoDoAtivo(
  tx: Transacao,
  onde: { ativo: string } | { patrimonio: string },
  { acesso, arvore, agora }: { acesso: Acesso; arvore: ArvoreDeLocais; agora: Date },
): Promise<CartaoDoAtivo | null> {
  if (!(await ligadoNaTransacao(tx, 'ativos'))) return null;
  const [lido] = await tx
    .select({
      ativo: ativos,
      tipo: {
        nome: tiposDeAtivo.nome,
        icone: tiposDeAtivo.icone,
        capacidades: tiposDeAtivo.capacidades,
        configuracao: tiposDeAtivo.configuracaoDasCapacidades,
      },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(
      'ativo' in onde
        ? eq(ativos.id, onde.ativo)
        : eq(ativos.patrimonioNormalizado, normalizarTexto(onde.patrimonio)),
    );
  if (!lido || !podeEm(acesso, 'ativos.ver', lido.ativo.localId, arvore)) return null;
  const { ativo, tipo, modelo } = lido;
  // O cartão é lido por quem participa e por quem vê o chamado sem a permissão dos restritos: o IP de
  // um campo restrito não entra nele, qualquer que seja quem escreve (revisão da tarefa 3.10).
  const restritos = await camposRestritos(tx);
  const leitura = { restritos, veRestritos: () => false };

  const campo = campoDoIp(tipo);
  const guardado = campo === null ? null : (ativo.valores as Record<string, unknown>)[campo];
  const ip =
    typeof guardado === 'string' && guardado !== '' && !restritos.has(campo ?? '')
      ? guardado
      : null;
  const disponibilidade = (await disponibilidadeDosAtivos(tx, [ativo], leitura)).get(ativo.id);
  const menor = (await suprimentosDosAtivos(tx, [ativo], leitura)).get(ativo.id)?.menor ?? null;
  const veOsAlertas =
    menor !== null &&
    (await ligadoNaTransacao(tx, 'alertas')) &&
    podeEm(acesso, 'alertas.ver', ativo.localId, arvore);
  return {
    ativo: ativo.id,
    icone: tipo.icone,
    tipo: tipo.nome,
    nome: rotuloDoAtivo({ nome: ativo.nome, modelo, tipo }),
    modelo: modelo ? `${modelo.fabricante} ${modelo.nome}` : null,
    patrimonio: ativo.patrimonio,
    ip,
    disponibilidade:
      disponibilidade && disponibilidade.momento !== null
        ? {
            situacao: disponibilidade.situacao,
            texto: ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE[disponibilidade.situacao],
          }
        : null,
    suprimento: menor && {
      descricao: menor.descricao,
      percentual: menor.nivel,
      critico: veOsAlertas ? await tonerCriticoDo(tx, ativo.id) : false,
    },
    em: agora.toISOString(),
  };
}

/**
 * A prévia do campo de escrever (`GET /chamados/:numero/cartao`): o retrato pelo patrimônio, no
 * chamado que a conta vê; o ativo que ela não vê responde como o que não existe.
 */
export async function previaDoCartao(
  tx: Transacao,
  numero: number,
  patrimonio: string,
  leitura: { acesso: Acesso; arvore: ArvoreDeLocais; agora: Date },
): Promise<CartaoDoAtivo> {
  const [chamado] = await tx
    .select({ locais: chamados.locais, semLocal: chamados.semLocal })
    .from(chamados)
    .where(eq(chamados.numero, numero));
  if (!chamado || !veOChamado(alcance(leitura.acesso, 'chamados.ver', leitura.arvore), chamado)) {
    throw chamadoNaoEncontrado();
  }
  const retrato = await retratoDoAtivo(tx, { patrimonio }, leitura);
  if (retrato === null) throw naoEncontrado(ATIVO_DO_CARTAO_NAO_ENCONTRADO);
  return retrato;
}
