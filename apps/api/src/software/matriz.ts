// A matriz do software (spec distribuicao-de-software, "Matriz do software"; change
// software-por-pacote, design, decisões 12 e 15). Por máquina: as células dos pacotes ativos frente
// às máquinas com o agente de um local, só as do próprio local, como o "por local" as conta, com a
// pessoa, só para quem a vê, o sem contato, a distribuição que aguarda, instala ou falhou e a última
// de cada pacote no local. Por local: "N de M" na versão-alvo em cada local com máquinas. As duas
// ficam nos locais em que a conta distribui.
import {
  ativos,
  contas,
  distribuicoes,
  maquinasDasDistribuicoes,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  SITUACOES_DA_MAQUINA,
  type SituacaoFrenteAoPacote,
  semContato,
  situacaoFrenteAoPacote,
  textoDoSemContato,
} from '@grafite/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { doResponsavel, pessoasVistas } from '../ativos/leitura.ts';
import { lerMaquinasDaConta } from './alvo.ts';
import { versoesDosPacotesNasMaquinas } from './base.ts';

/** O pacote como a matriz o compara: a id e a versão-alvo. */
export interface PacoteDaMatriz {
  id: string;
  versao: string | null;
}

/** As situações da máquina na distribuição que a dica da célula conta. */
const NA_DISTRIBUICAO = ['aguardando', 'em-andamento', 'falhou'] as const;

export interface CelulaPorMaquina {
  pacoteId: string;
  ativoId: string;
  situacao: SituacaoFrenteAoPacote;
  versao: string | null;
  distribuicao: {
    id: string;
    situacao: (typeof NA_DISTRIBUICAO)[number];
    texto: string;
    codigo: number | null;
  } | null;
}

/** A máquina contada na versão-alvo; no pacote sem versão-alvo, a que tem o programa. */
const contaNaVersao = (situacao: SituacaoFrenteAoPacote) =>
  situacao === 'na-versao' || situacao === 'instalado-sem-alvo';

export async function matrizPorMaquina(
  tx: Transacao,
  {
    acesso,
    arvore,
    localId,
    pacotes,
    momento,
  }: {
    acesso: Acesso;
    arvore: ArvoreDeLocais;
    localId: string;
    pacotes: readonly PacoteDaMatriz[];
    momento: Date;
  },
) {
  const maquinas = (await lerMaquinasDaConta(tx, acesso, arvore)).filter(
    (maquina) => maquina.localId === localId,
  );
  const ids = maquinas.map(({ id }) => id);
  const { diasSemContato } = await lerCadastroDosAgentes(tx);
  const versoes = await versoesDosPacotesNasMaquinas(tx, ids);
  const responsaveis = new Map<string, string>();
  const emCurso = new Map<string, NonNullable<CelulaPorMaquina['distribuicao']>>();
  const ultimas: {
    pacoteId: string;
    distribuicaoId: string;
    criadaEm: string;
    criadaPor: string;
  }[] = [];
  // A pessoa só para quem a vê, como na ficha do ativo (design, decisão 15).
  const dasPessoas = pessoasVistas(acesso, arvore);
  if (ids.length > 0 && dasPessoas) {
    const comPessoa = await tx
      .select({ id: ativos.id, pessoa: pessoas.nome })
      .from(ativos)
      .innerJoin(pessoas, doResponsavel)
      .where(and(inArray(ativos.id, ids), dasPessoas));
    for (const { id, pessoa } of comPessoa) responsaveis.set(id, pessoa);
  }
  if (ids.length > 0) {
    // A mais nova de cada pacote em cada máquina, entre as que aguardam, instalam ou falharam.
    const daMatriz = await tx
      .select({
        pacoteId: distribuicoes.pacoteId,
        ativoId: maquinasDasDistribuicoes.ativoId,
        distribuicaoId: distribuicoes.id,
        situacao: maquinasDasDistribuicoes.situacao,
        codigo: maquinasDasDistribuicoes.codigoDeSaida,
      })
      .from(maquinasDasDistribuicoes)
      .innerJoin(distribuicoes, eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId))
      .where(
        and(
          inArray(maquinasDasDistribuicoes.ativoId, ids),
          inArray(maquinasDasDistribuicoes.situacao, [...NA_DISTRIBUICAO]),
        ),
      )
      .orderBy(desc(distribuicoes.criadaEm), desc(distribuicoes.id));
    for (const linha of daMatriz) {
      const chave = `${linha.pacoteId}:${linha.ativoId}`;
      if (emCurso.has(chave) || linha.situacao === 'concluida' || linha.situacao === 'tirada') {
        continue;
      }
      emCurso.set(chave, {
        id: linha.distribuicaoId,
        situacao: linha.situacao,
        texto: SITUACOES_DA_MAQUINA[linha.situacao].texto,
        codigo: linha.codigo,
      });
    }
    // A última distribuição de cada pacote com alguma máquina do local, com quem a criou.
    const doLocal = await tx
      .selectDistinctOn([distribuicoes.pacoteId], {
        pacoteId: distribuicoes.pacoteId,
        distribuicaoId: distribuicoes.id,
        criadaEm: distribuicoes.criadaEm,
        criadaPor: pessoas.nome,
      })
      .from(distribuicoes)
      .innerJoin(
        maquinasDasDistribuicoes,
        eq(maquinasDasDistribuicoes.distribuicaoId, distribuicoes.id),
      )
      .innerJoin(contas, eq(contas.id, distribuicoes.criadaPor))
      .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
      .where(inArray(maquinasDasDistribuicoes.ativoId, ids))
      .orderBy(distribuicoes.pacoteId, desc(distribuicoes.criadaEm), desc(distribuicoes.id));
    for (const linha of doLocal) {
      if (!pacotes.some(({ id }) => id === linha.pacoteId)) continue;
      ultimas.push({ ...linha, criadaEm: linha.criadaEm.toISOString() });
    }
  }
  const celulas: CelulaPorMaquina[] = pacotes.flatMap((pacote) =>
    maquinas.map((maquina) => {
      const frente = situacaoFrenteAoPacote(
        versoes.get(pacote.id)?.get(maquina.id) ?? [],
        pacote.versao,
      );
      return {
        pacoteId: pacote.id,
        ativoId: maquina.id,
        situacao: frente.situacao,
        versao: frente.versao,
        distribuicao: emCurso.get(`${pacote.id}:${maquina.id}`) ?? null,
      };
    }),
  );
  return {
    maquinas: maquinas.map((maquina) => {
      const contato = semContato(maquina.agente.ultimoContato, momento, diasSemContato);
      return {
        id: maquina.id,
        rotulo: maquina.rotulo,
        patrimonio: maquina.patrimonio,
        hostname: maquina.hostname,
        pessoa: responsaveis.get(maquina.id) ?? null,
        semContato: contato.semContato
          ? { dias: contato.dias, texto: textoDoSemContato(contato.dias) }
          : null,
      };
    }),
    celulas,
    ultimas: ultimas.sort(
      (a, b) =>
        pacotes.findIndex(({ id }) => id === a.pacoteId) -
        pacotes.findIndex(({ id }) => id === b.pacoteId),
    ),
  };
}

/** Os locais na ordem da árvore: cada um seguido dos de dentro, em ordem de nome. */
function naOrdemDaArvore(arvore: ArvoreDeLocais): string[] {
  const ordem: string[] = [];
  const visitar = (paiId: string | null) => {
    for (const local of arvore.filhos(paiId)) {
      ordem.push(local.id);
      visitar(local.id);
    }
  };
  visitar(null);
  return ordem;
}

export async function matrizPorLocal(
  tx: Transacao,
  {
    acesso,
    arvore,
    pacotes,
  }: { acesso: Acesso; arvore: ArvoreDeLocais; pacotes: readonly PacoteDaMatriz[] },
) {
  const maquinas = await lerMaquinasDaConta(tx, acesso, arvore);
  const versoes = await versoesDosPacotesNasMaquinas(
    tx,
    maquinas.map(({ id }) => id),
  );
  const porLocal = new Map<string, string[]>();
  for (const maquina of maquinas) {
    if (!maquina.localId) continue;
    porLocal.set(maquina.localId, [...(porLocal.get(maquina.localId) ?? []), maquina.id]);
  }
  const locais = naOrdemDaArvore(arvore).flatMap((id) => {
    const local = arvore.local(id);
    const doLocal = porLocal.get(id);
    return local && doLocal
      ? [{ id, nome: local.nome, caminho: arvore.caminho(id), maquinas: doLocal.length }]
      : [];
  });
  const celulas = pacotes.flatMap((pacote) =>
    locais.map((local) => {
      const doLocal = porLocal.get(local.id) ?? [];
      const naVersao = doLocal.filter((ativoId) =>
        contaNaVersao(
          situacaoFrenteAoPacote(versoes.get(pacote.id)?.get(ativoId) ?? [], pacote.versao)
            .situacao,
        ),
      ).length;
      return { pacoteId: pacote.id, localId: local.id, naVersao, total: doLocal.length };
    }),
  );
  return { locais, celulas };
}
