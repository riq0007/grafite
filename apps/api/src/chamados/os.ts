// Virar OS (spec chamados, "OS e solicitação pelo chamado"; ordens-de-servico, "OS pelo chamado";
// change chamados-da-ti, design, "Virar OS (tarefa 4.16)"), numa transação:
// - o módulo Operação desligado responde o 403 dele antes de tudo, como as rotas das OS;
// - o chamado, travado como nas ações (`travarParaMudar`), se a conta o vê; senão, o que não existe;
// - as recusas do chamado, do domínio (`recusaDoVirarOs`), no 409, com o tipo como está agora;
// - a abertura das OS de hoje (`abrir`), com as regras e as recusas dela, o problema pedido ou o
//   título do chamado, e a auditoria `ordem.aberta`;
// - o chamado guarda a OS, a conversa ganha o evento `os`, que não sobe a versão, e a auditoria, o
//   `chamado.virou-os`, com o `chamados.mudaram` pela saída dela. Nada notifica.
import {
  chamados,
  mensagensDosChamados,
  ordensDeServico,
  type Transacao,
  tiposDeChamado,
} from '@grafite/db';
import { mensagemDaRecusaDoVirarOs, recusaDoVirarOs } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { exigirLigadoNaTransacao } from '../acesso/modulos.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { abrir, type Contexto } from '../ordens/abertura.ts';
import { lerOrdem, type OrdemLida } from '../ordens/leitura.ts';
import { conflito } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { travarParaMudar } from './acoes.ts';
import { publicoDoChamado } from './alcance.ts';

/** O pedido do "Virar OS": o problema da OS, ou nada, para o título do chamado. */
export interface PedidoDoVirarOs {
  problema?: string | undefined;
}

/** Abre a OS do chamado, liga os dois e devolve a OS lida, já com o chamado. */
export async function virarOs(
  tx: Transacao,
  numero: number,
  pedido: PedidoDoVirarOs,
  contexto: Contexto,
): Promise<OrdemLida> {
  await exigirLigadoNaTransacao(tx, 'operacao');
  const { requisicao, momento } = contexto;
  const { acesso, contaId, arvore, lido, quemAge } = await travarParaMudar(tx, numero, requisicao);
  const [extra] = await tx
    .select({
      tipo: { nome: tiposDeChamado.nome, podeVirarOs: tiposDeChamado.podeVirarOs },
      os: ordensDeServico.numero,
    })
    .from(chamados)
    .innerJoin(tiposDeChamado, eq(tiposDeChamado.id, chamados.tipoId))
    .leftJoin(ordensDeServico, eq(ordensDeServico.id, chamados.osId))
    .where(eq(chamados.id, lido.id));
  if (!extra) throw new Error('O tipo do chamado não foi lido.');
  const recusa = recusaDoVirarOs(
    {
      numero: lido.numero,
      situacao: lido.situacao,
      locais: lido.locais.map((id) => ({ id, nome: arvore.caminho(id) })),
      semLocal: lido.semLocal,
      os: extra.os,
      tipo: extra.tipo,
      ativo: lido.ativo,
    },
    quemAge,
  );
  if (recusa) throw conflito(mensagemDaRecusaDoVirarOs(lido.numero, recusa));

  const ordem = await abrir(
    tx,
    { ativo: lido.ativo, problema: pedido.problema ?? lido.titulo },
    contexto,
  );
  await tx.update(chamados).set({ osId: ordem.id }).where(eq(chamados.id, lido.id));
  await tx.insert(mensagensDosChamados).values({
    orgId: sql`app.current_org()`,
    chamadoId: lido.id,
    especie: 'evento',
    autorConta: contaId,
    criadaEm: momento,
    evento: 'os',
    dados: { numero: ordem.numero },
  });
  await registrarNaAuditoria(tx, {
    acao: 'chamado.virou-os',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: lido.id },
    depois: { os: ordem.numero },
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(lido) },
  });
  return lerOrdem(tx, { acesso, arvore }, ordem.id);
}
