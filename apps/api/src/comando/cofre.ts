// A troca da chave mestra do cofre pelo comando no servidor (spec cofre-de-segredos, "Troca da chave
// mestra"; design do P6, decisão 9). As organizações vêm da mesma consulta da manutenção; em cada
// uma, no contexto dela, a chave de cada segredo ainda na anterior é decifrada com ela e cifrada com
// a nova. O conteúdo nunca é decifrado. O segredo que não abre fica como está e é listado.
import { type Banco, naOrganizacao, organizacoes, segredos } from '@grafite/db';
import { eq, ne, sql } from 'drizzle-orm';
import { registrarNaAuditoria } from '../auditoria.ts';
import {
  type ChavesDoCofre,
  impressaoDaChaveMestra,
  recifrarChave,
  SegredoQueNaoAbre,
} from '../cofre/cifra.ts';

const ATOR = { tipo: 'sistema', descricao: 'comando no servidor: cofre trocar-chave' } as const;

export interface TrocaNaOrganizacao {
  organizacao: string;
  /** Quantos segredos passaram da chave anterior para a nova. */
  recifrados: number;
  /** Os segredos que não abrem com nenhuma das duas chaves, que ficaram como estavam. */
  naoAbrem: { id: string; nome: string }[];
}

export async function trocarChaveDoCofre(
  banco: Banco,
  agora: () => Date,
  chaves: Required<ChavesDoCofre>,
): Promise<TrocaNaOrganizacao[]> {
  const nova = impressaoDaChaveMestra(chaves.atual);
  const anterior = impressaoDaChaveMestra(chaves.anterior);
  const { rows } = await banco.execute<{ id: string }>(
    sql`select id from app.organizacoes_para_tarefas() as t(id)`,
  );
  const resultados: TrocaNaOrganizacao[] = [];
  for (const { id: orgId } of rows) {
    const resultado = await naOrganizacao(banco, orgId, async (tx) => {
      const [organizacao] = await tx
        .select({ nome: organizacoes.nome })
        .from(organizacoes)
        .where(eq(organizacoes.id, orgId));
      const fora = await tx
        .select({
          id: segredos.id,
          nome: segredos.nome,
          chaveCifrada: segredos.chaveCifrada,
          impressaoDaChaveMestra: segredos.impressaoDaChaveMestra,
        })
        .from(segredos)
        .where(ne(segredos.impressaoDaChaveMestra, nova))
        .for('update');
      const naoAbrem: TrocaNaOrganizacao['naoAbrem'] = [];
      let recifrados = 0;
      for (const segredo of fora) {
        if (segredo.impressaoDaChaveMestra !== anterior) {
          naoAbrem.push({ id: segredo.id, nome: segredo.nome });
          continue;
        }
        try {
          const recifrada = recifrarChave(segredo, chaves, { orgId, segredoId: segredo.id });
          await tx.update(segredos).set(recifrada).where(eq(segredos.id, segredo.id));
          recifrados += 1;
        } catch (erro) {
          if (!(erro instanceof SegredoQueNaoAbre)) throw erro;
          naoAbrem.push({ id: segredo.id, nome: segredo.nome });
        }
      }
      if (recifrados > 0) {
        await registrarNaAuditoria(tx, {
          acao: 'chave-do-cofre.trocada',
          ator: ATOR,
          alvo: { tipo: 'cofre' },
          dados: { recifrados },
          momento: agora(),
        });
      }
      return { organizacao: organizacao?.nome ?? orgId, recifrados, naoAbrem };
    });
    resultados.push(resultado);
  }
  return resultados;
}
