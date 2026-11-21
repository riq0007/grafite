// As sugestões dos campos Ativo e Local pela pessoa do chamado (spec tipos-de-chamado, "Campos do
// formulário"; change chamados-da-ti, tarefa 4.8): o campo Ativo sugere os ativos sob a
// responsabilidade da pessoa e depois os do local de trabalho dela, e o campo Local, o local de
// trabalho dela. As sugestões são as que a abertura aceitaria: só os ativos ativos, que quem abre
// vê, dos tipos que o campo aceita, e o local ativo.
import { ativos, modelos, pessoas, type Transacao, tiposDeAtivo } from '@grafite/db';
import { type Acesso, type ArvoreDeLocais, alcance, rotuloDoAtivo } from '@grafite/domain';
import { and, asc, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import { localEm } from '../estoque/leitura.ts';
import { naoEncontrado } from '../problemas.ts';

/**
 * Quantos ativos as sugestões trazem, no máximo, na TI: o campo busca os outros pelo nome. A abertura
 * pelo chat, sem a busca, pede todos (change chat-com-chamados, design, decisão 15).
 */
export const LIMITE_DAS_SUGESTOES = 10;

export interface AtivoSugerido {
  id: string;
  rotulo: string;
  patrimonio: string | null;
  tipoId: string;
  /** Por que o ativo é sugerido: está sob a responsabilidade da pessoa ou no local dela. */
  motivo: 'responsavel' | 'local';
}

export interface SugestoesDaPessoa {
  /** O local de trabalho da pessoa, com o caminho, se ele está ativo. */
  local: { id: string; nome: string } | null;
  ativos: AtivoSugerido[];
}

/**
 * As sugestões para a pessoa: primeiro os ativos sob a responsabilidade dela, de qualquer local,
 * e depois os do local de trabalho dela, sem os de dentro dele nem os dela de novo; cada grupo pelo
 * patrimônio, até o limite, que o nulo tira. A pessoa que não existe, ou de outra organização, é
 * recusada.
 */
export async function sugestoesDaPessoa(
  tx: Transacao,
  pessoaId: string,
  {
    tipos,
    acesso,
    arvore,
    limite = LIMITE_DAS_SUGESTOES,
  }: {
    tipos: readonly string[];
    acesso: Acesso;
    arvore: ArvoreDeLocais;
    limite?: number | null;
  },
): Promise<SugestoesDaPessoa> {
  const [pessoa] = await tx
    .select({ localId: pessoas.localId })
    .from(pessoas)
    .where(eq(pessoas.id, pessoaId));
  if (!pessoa) throw naoEncontrado('Pessoa não encontrada.');
  const { localId } = pessoa;
  const local =
    localId !== null && arvore.local(localId)?.situacao === 'ativo'
      ? { id: localId, nome: arvore.caminho(localId) }
      : null;

  // Só os ativos que a conta vê, na própria consulta, para o limite ficar no banco: os dos locais
  // do alcance de `ativos.ver`, e o sem local só pela organização inteira.
  const doVer = alcance(acesso, 'ativos.ver', arvore);
  if (doVer === null) return { local, ativos: [] };

  const ativosOnde = (...condicoes: (SQL | undefined)[]) =>
    tx
      .select({
        id: ativos.id,
        nome: ativos.nome,
        patrimonio: ativos.patrimonio,
        tipoId: ativos.tipoId,
        tipo: { nome: tiposDeAtivo.nome },
        modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
      })
      .from(ativos)
      .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
      .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
      .where(
        and(
          eq(ativos.situacao, 'ativo'),
          ...(doVer === 'organizacao' ? [] : [localEm(ativos.localId, [...doVer])]),
          ...(tipos.length > 0 ? [inArray(ativos.tipoId, [...tipos])] : []),
          ...condicoes,
        ),
      )
      .orderBy(asc(ativos.patrimonio), asc(ativos.id))
      .$dynamic();
  const ate = (consulta: ReturnType<typeof ativosOnde>, quantos: number | null) =>
    quantos === null ? consulta : consulta.limit(quantos);

  const comoSugestao =
    (motivo: AtivoSugerido['motivo']) =>
    (linha: Awaited<ReturnType<typeof ativosOnde>>[number]): AtivoSugerido => ({
      id: linha.id,
      rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
      patrimonio: linha.patrimonio,
      tipoId: linha.tipoId,
      motivo,
    });

  const dela = (await ate(ativosOnde(eq(ativos.responsavelId, pessoaId)), limite)).map(
    comoSugestao('responsavel'),
  );

  // Os do local de trabalho entram nas vagas que sobram.
  const vagas = limite === null ? null : limite - dela.length;
  const doLocal =
    localId !== null && (vagas === null || vagas > 0)
      ? (
          await ate(
            ativosOnde(
              eq(ativos.localId, localId),
              or(isNull(ativos.responsavelId), ne(ativos.responsavelId, pessoaId)),
            ),
            vagas,
          )
        ).map(comoSugestao('local'))
      : [];

  return { local, ativos: [...dela, ...doLocal] };
}
