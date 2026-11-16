// O formulário do tipo de chamado na API (spec tipos-de-chamado, "Formulário do tipo" e "Formulário
// que muda"; change chamados-da-ti, design, decisões 2 e 6): o formato em que a API o devolve, os
// chamados abertos que mantêm o formulário com que abriram e o que só a API confere, os tipos de
// ativo do campo Ativo. O resto da conferência é do domínio (`conferirFormulario`).
import { chamados, type Transacao, tiposDeAtivo } from '@grafite/db';
import {
  type Formulario,
  RECUSA_DOS_TIPOS_DE_ATIVO,
  TIPOS_DE_CAMPO_DO_CHAMADO,
} from '@grafite/domain';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { dadosInvalidos } from '../problemas.ts';

const JuncaoDaCondicao = z.enum(['e', 'ou']).nullable();

export const FormularioDeChamado = z
  .object({
    titulo: z.object({
      comecaPeloTipo: z.boolean(),
      /** O campo cuja resposta dá o título; nulo, o título sai da primeira resposta de texto. */
      campoId: z.string().nullable(),
    }),
    campos: z.array(
      z.object({
        /** O id curto e estável, que liga as condições, as respostas e o título. */
        id: z.string(),
        tipo: z.enum(TIPOS_DE_CAMPO_DO_CHAMADO),
        rotulo: z.string(),
        /** O nome na linha do resumo; nulo, vale o rótulo sem o "?". */
        nomeNoResumo: z.string().nullable(),
        obrigatorio: z.boolean(),
        soDaTi: z.boolean(),
        apagarSeSumir: z.boolean(),
        /** As opções da Escolha única e das Várias opções. */
        opcoes: z.array(z.object({ id: z.string(), texto: z.string() })),
        /** Os tipos aceitos no campo Ativo; nenhum, o campo aceita ativos de qualquer tipo. */
        tiposDeAtivo: z.array(z.uuid()),
        /**
         * As cláusulas da condição, com a opção na Escolha única e nas Várias opções e o sim ou não
         * no Sim ou não; nenhuma, o campo aparece sempre.
         */
        condicao: z.array(
          z.union([
            z.object({ campoId: z.string(), juncao: JuncaoDaCondicao, opcaoId: z.string() }),
            z.object({ campoId: z.string(), juncao: JuncaoDaCondicao, valor: z.boolean() }),
          ]),
        ),
      }),
    ),
  })
  .meta({ id: 'FormularioDeChamado' });

/** Os chamados do tipo em aberto, de todos os locais: cada um mantém o formulário com que abriu. */
export async function contarAbertos(tx: Transacao, tipoId: string): Promise<number> {
  const [contagem] = await tx
    .select({ abertos: count() })
    .from(chamados)
    .where(and(eq(chamados.tipoId, tipoId), ne(chamados.situacao, 'resolvido')));
  return contagem?.abertos ?? 0;
}

/**
 * Os tipos de ativo dos campos Ativo, que o domínio deixa para a API: o tipo novo no campo existe na
 * organização e está ativo. O que o campo já aceitava fica, mesmo inativado depois, como os tipos
 * aceitos dos campos do ativo (design do P1d, decisão 1).
 */
export async function conferirTiposDeAtivoDoFormulario(
  tx: Transacao,
  formulario: Formulario,
  gravado: Formulario,
): Promise<void> {
  const pedidos = [...new Set(formulario.campos.flatMap((campo) => campo.tiposDeAtivo))];
  if (pedidos.length === 0) return;
  const ativos = new Set(
    (
      await tx
        .select({ id: tiposDeAtivo.id })
        .from(tiposDeAtivo)
        .where(and(inArray(tiposDeAtivo.id, pedidos), eq(tiposDeAtivo.situacao, 'ativo')))
    ).map(({ id }) => id),
  );
  const erros: Record<string, string> = {};
  for (const campo of formulario.campos) {
    const jaAceitos = new Set(gravado.campos.find(({ id }) => id === campo.id)?.tiposDeAtivo);
    if (campo.tiposDeAtivo.some((tipo) => !ativos.has(tipo) && !jaAceitos.has(tipo))) {
      erros[`campos.${campo.id}.tiposDeAtivo`] = RECUSA_DOS_TIPOS_DE_ATIVO;
    }
  }
  if (Object.keys(erros).length > 0) throw dadosInvalidos(erros);
}
