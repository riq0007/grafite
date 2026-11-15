// O software na ficha da máquina (spec inventario-pelo-agente, "Softwares na ficha do ativo"; change
// software-por-pacote, design, decisão 13): os instalados do último inventário e o agente, para quem
// vê o ativo; e, para quem distribui no local dele, a comparação de cada programa com a base, na
// ordem "Frente à base · ação primeiro", a origem, os mandados pelo Grafite e a máquina frente a
// cada pacote ativo, para o "Instalar outro pacote nesta máquina".
import {
  agentes,
  contas,
  distribuicoes,
  maquinasDasDistribuicoes,
  pacotesDeSoftware,
  pessoas,
  softwaresDosAtivos,
  type Transacao,
} from '@grafite/db';
import {
  casaComOPacote,
  explicarOCodigoDeSaida,
  frenteABase,
  ordenarFrenteABase,
  type PacoteDaBase,
  SITUACOES_DA_MAQUINA,
  semContato,
  situacaoFrenteAoPacote,
  textoDoSemContato,
  textoFrenteABase,
} from '@grafite/domain';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { lerCadastroDosAgentes } from '../agentes/cadastro.ts';
import { paraQuemNaTela } from './base.ts';

/** O pacote ativo como a ficha da máquina o compara. */
export interface PacoteDaMaquina extends PacoteDaBase {
  id: string;
}

/** Os mandados que a ficha mostra, dos mais novos para os mais antigos. */
const LIMITE_DOS_MANDADOS = 50;

const daDistribuicao = eq(distribuicoes.id, maquinasDasDistribuicoes.distribuicaoId);
const doPacote = eq(pacotesDeSoftware.id, distribuicoes.pacoteId);
const deQuemCriou = eq(contas.id, distribuicoes.criadaPor);
const daPessoa = eq(pessoas.id, contas.pessoaId);

/**
 * O software da máquina. Sem os pacotes (`null`, para quem não distribui no local dela), os
 * instalados vêm pelo nome, sem a base, e sem os mandados.
 */
export async function softwareDaMaquina<P extends PacoteDaMaquina>(
  tx: Transacao,
  { ativoId, pacotes, momento }: { ativoId: string; pacotes: readonly P[] | null; momento: Date },
) {
  const lidos = await tx
    .select({
      nome: softwaresDosAtivos.nome,
      versao: softwaresDosAtivos.versao,
      editor: softwaresDosAtivos.editor,
      instaladoEm: softwaresDosAtivos.instaladoEm,
      doSistema: softwaresDosAtivos.doSistema,
      inventariadoEm: softwaresDosAtivos.inventariadoEm,
    })
    .from(softwaresDosAtivos)
    .where(eq(softwaresDosAtivos.ativoId, ativoId))
    .orderBy(asc(softwaresDosAtivos.nome));
  let inventariadoEm: Date | null = null;
  for (const linha of lidos) {
    if (!inventariadoEm || linha.inventariadoEm > inventariadoEm) {
      inventariadoEm = linha.inventariadoEm;
    }
  }
  const programas = lidos.map(({ nome, versao, editor, instaladoEm, doSistema }) => ({
    nome,
    versao,
    editor,
    instaladoEm,
    doSistema,
  }));
  const [agente] = await tx
    .select({ ultimoContato: agentes.ultimoContato })
    .from(agentes)
    .where(eq(agentes.ativoId, ativoId))
    .orderBy(desc(agentes.ultimoContato))
    .limit(1);
  let doAgente: {
    ultimoContato: string;
    semContato: { dias: number; texto: string } | null;
  } | null = null;
  if (agente) {
    const { diasSemContato } = await lerCadastroDosAgentes(tx);
    const contato = semContato(agente.ultimoContato, momento, diasSemContato);
    doAgente = {
      ultimoContato: agente.ultimoContato.toISOString(),
      semContato: contato.semContato
        ? { dias: contato.dias, texto: textoDoSemContato(contato.dias) }
        : null,
    };
  }
  const comum = { inventariadoEm: inventariadoEm?.toISOString() ?? null, agente: doAgente };
  if (pacotes === null) {
    return {
      ...comum,
      instalados: programas.map((programa) => ({ ...programa, base: null })),
      distribuir: null,
    };
  }

  const mandados = await tx
    .select({
      distribuicaoId: distribuicoes.id,
      maquinaId: maquinasDasDistribuicoes.id,
      pacote: {
        id: pacotesDeSoftware.id,
        nome: pacotesDeSoftware.nome,
        versao: pacotesDeSoftware.versao,
      },
      paraQuem: distribuicoes.paraQuem,
      situacao: maquinasDasDistribuicoes.situacao,
      codigo: maquinasDasDistribuicoes.codigoDeSaida,
      etapa: maquinasDasDistribuicoes.etapa,
      criadaEm: distribuicoes.criadaEm,
      criadaPor: pessoas.nome,
      enviadaEm: maquinasDasDistribuicoes.enviadaEm,
      terminadaEm: maquinasDasDistribuicoes.terminadaEm,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(distribuicoes, daDistribuicao)
    .innerJoin(pacotesDeSoftware, doPacote)
    .innerJoin(contas, deQuemCriou)
    .innerJoin(pessoas, daPessoa)
    .where(eq(maquinasDasDistribuicoes.ativoId, ativoId))
    .orderBy(desc(distribuicoes.criadaEm), desc(distribuicoes.id))
    .limit(LIMITE_DOS_MANDADOS);
  // A distribuição de antes do "Para quem" diz quantas máquinas teve.
  const semParaQuem = mandados
    .filter(({ paraQuem }) => paraQuem === null)
    .map(({ distribuicaoId }) => distribuicaoId);
  const quantas = new Map<string, number>();
  if (semParaQuem.length > 0) {
    const contadas = await tx
      .select({ distribuicaoId: maquinasDasDistribuicoes.distribuicaoId, maquinas: count() })
      .from(maquinasDasDistribuicoes)
      .where(inArray(maquinasDasDistribuicoes.distribuicaoId, semParaQuem))
      .groupBy(maquinasDasDistribuicoes.distribuicaoId);
    for (const { distribuicaoId, maquinas } of contadas) quantas.set(distribuicaoId, maquinas);
  }

  // A origem: a última distribuição concluída de cada pacote que chegou à máquina, mesmo o inativo.
  const entregues = await tx
    .selectDistinctOn([distribuicoes.pacoteId], {
      pacoteId: distribuicoes.pacoteId,
      nome: pacotesDeSoftware.nome,
      nomeNoInventario: pacotesDeSoftware.nomeNoInventario,
      versao: pacotesDeSoftware.versao,
      distribuicaoId: distribuicoes.id,
      por: pessoas.nome,
    })
    .from(maquinasDasDistribuicoes)
    .innerJoin(distribuicoes, daDistribuicao)
    .innerJoin(pacotesDeSoftware, doPacote)
    .innerJoin(contas, deQuemCriou)
    .innerJoin(pessoas, daPessoa)
    .where(
      and(
        eq(maquinasDasDistribuicoes.ativoId, ativoId),
        eq(maquinasDasDistribuicoes.situacao, 'concluida'),
      ),
    )
    .orderBy(distribuicoes.pacoteId, desc(distribuicoes.criadaEm), desc(distribuicoes.id));

  const comparados = programas.map((programa) => {
    const { comparacao, pacote } = frenteABase(programa, pacotes);
    const entregue = programa.doSistema ? null : frenteABase(programa, entregues).pacote;
    return {
      ...programa,
      comparacao,
      base: {
        comparacao,
        texto: textoFrenteABase(comparacao, pacote?.versao ?? null),
        pacote: pacote ? { id: pacote.id, nome: pacote.nome, versao: pacote.versao } : null,
        origem: entregue ? { distribuicaoId: entregue.distribuicaoId, por: entregue.por } : null,
      },
    };
  });

  return {
    ...comum,
    instalados: ordenarFrenteABase(comparados).map(
      ({ nome, versao, editor, instaladoEm, doSistema, base }) => ({
        nome,
        versao,
        editor,
        instaladoEm,
        doSistema,
        base,
      }),
    ),
    distribuir: {
      mandados: mandados.map(
        ({ paraQuem, situacao, codigo, criadaEm, enviadaEm, terminadaEm, ...mandado }) => ({
          ...mandado,
          paraQuem: paraQuemNaTela(paraQuem, quantas.get(mandado.distribuicaoId) ?? 1),
          situacao: { chave: situacao, ...SITUACOES_DA_MAQUINA[situacao] },
          codigo:
            codigo === null ? null : { numero: codigo, explicacao: explicarOCodigoDeSaida(codigo) },
          criadaEm: criadaEm.toISOString(),
          enviadaEm: enviadaEm?.toISOString() ?? null,
          terminadaEm: terminadaEm?.toISOString() ?? null,
        }),
      ),
      // A máquina frente a cada pacote ativo, pelas versões dos programas dela que casam com ele.
      pacotes: pacotes.map((pacote) => {
        const nomeNoInventario = pacote.nomeNoInventario || pacote.nome;
        const versoes = programas
          .filter(({ nome }) => casaComOPacote(nome, nomeNoInventario))
          .map(({ versao }) => versao);
        return { pacote, ...situacaoFrenteAoPacote(versoes, pacote.versao) };
      }),
    },
  };
}
