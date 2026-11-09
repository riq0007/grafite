// O número de série lido pela coleta (spec impressoras-por-snmp, "Número de série pela coleta";
// change p2b-impressoras-por-snmp, design, decisão 7): a leitura mais recente de cada ativo no lote,
// quando muda e a política de escrita do campo deixa, grava o Número de série com a origem "coleta",
// o momento da leitura e o coletor, sem mexer na trava; a mudança entra na auditoria, com o coletor
// como quem fez, e o evento dos ativos sai com ela. A série travada, ou a igual, não grava nada.
import { ativos, type Transacao } from '@grafite/db';
import {
  CAMPOS_DO_ATIVO,
  camposDoAtivo,
  conferirValoresDoAtivo,
  type EstadoDoCampo,
  podeGravar,
  registrarGravacao,
} from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { lerArvore } from '../arvore.ts';
import {
  camposDaOrganizacao,
  lerTipoDoAtivo,
  textoDeBuscaDoAtivo,
  visaoDoAtivo,
} from '../ativos/escrita.ts';
import { lerAtivo, valoresGuardados } from '../ativos/leitura.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { saidaDoAtivo } from '../eventos/ativos.ts';

const CHAVE_DA_SERIE = 'ativo.serie';

/** A série lida de um ativo: o texto e o momento da leitura. */
export interface SerieLida {
  serie: string;
  momento: Date;
}

export async function gravarSeriesDaColeta(
  tx: Transacao,
  {
    coletor,
    series,
    momento,
  }: {
    coletor: { id: string; nome: string };
    series: ReadonlyMap<string, SerieLida>;
    /** O momento do pedido, para a auditoria. */
    momento: Date;
  },
): Promise<void> {
  if (series.size === 0) return;
  const definicao = CAMPOS_DO_ATIVO.find((campo) => campo.chave === CHAVE_DA_SERIE);
  if (!definicao) throw new Error('O campo do número de série sumiu.');
  const daOrganizacao = await camposDaOrganizacao(tx);
  const arvore = await lerArvore(tx);
  for (const [ativoId, lida] of series) {
    const atual = await lerAtivo(tx, ativoId, { travar: true });
    const estadoAtual = atual.ativo.estado as Record<string, EstadoDoCampo>;
    if (!podeGravar(definicao, estadoAtual[CHAVE_DA_SERIE], 'coleta')) continue;
    const tipo = await lerTipoDoAtivo(tx, atual.ativo.tipoId);
    if (!tipo) continue;
    const definicoes = camposDoAtivo({ tipo, campos: daOrganizacao });
    const atuais = valoresGuardados(atual.ativo);
    const conferida = conferirValoresDoAtivo({
      campos: definicoes,
      atuais,
      pedidos: { [CHAVE_DA_SERIE]: lida.serie },
      cadastro: false,
    });
    // A série que o motor recusa, ou que já é a do ativo, não grava nada.
    if (!conferida.ok || !(CHAVE_DA_SERIE in conferida.mudancas)) continue;
    const serie = conferida.mudancas[CHAVE_DA_SERIE] as string | null;
    const estado = registrarGravacao(estadoAtual, [CHAVE_DA_SERIE], {
      origem: 'coleta',
      momento: lida.momento.toISOString(),
      autorId: null,
      coletorId: coletor.id,
    });
    const valoresDepois = { ...atuais };
    if (serie === null) delete valoresDepois[CHAVE_DA_SERIE];
    else valoresDepois[CHAVE_DA_SERIE] = serie;
    await tx
      .update(ativos)
      .set({
        serie,
        estado,
        busca: textoDeBuscaDoAtivo(valoresDepois, definicoes),
        atualizadoEm: momento,
      })
      .where(eq(ativos.id, ativoId));
    const depois = await lerAtivo(tx, ativoId);
    await registrarNaAuditoria(tx, {
      acao: 'ativo.alterado',
      ator: { tipo: 'sistema', descricao: `coletor: ${coletor.nome}` },
      alvo: { tipo: 'ativo', id: ativoId },
      antes: await visaoDoAtivo(tx, atual, definicoes, arvore),
      depois: await visaoDoAtivo(tx, depois, definicoes, arvore),
      momento,
      saida: saidaDoAtivo({ ativoId, locais: [atual.ativo.localId] }),
    });
  }
}
