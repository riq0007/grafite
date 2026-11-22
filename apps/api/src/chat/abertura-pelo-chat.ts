// A abertura de um chamado pelo chat (spec chamados, "Abrir um chamado pelo chat"; spec chat,
// "Chamados da conversa"; change chat-com-chamados, design, decisão 8; tarefa 3.7): os tipos que o
// chat oferece, os ativos sugeridos para a pessoa de "No nome de" e a abertura a partir de uma
// mensagem, numa transação:
// - a mensagem, de uma conversa de que a conta participa, travada (`mensagem:<id>`), e a recusa da
//   que já virou chamado;
// - o tipo, a pessoa e os sugeridos, conferidos pelo domínio, com as recusas juntas;
// - a gravação da abertura da TI (`gravarAbertura`), com a origem `chat`, a linha da origem e os
//   anexos da mensagem, sem o "Fica comigo" e sem a primeira resposta;
// - o evento `virou-chamado` na conversa, travada como na mensagem, e o `chat.mudou`.
// Os ativos sugeridos e o escolhido são lidos pela organização inteira: quem abre lê deles só o id,
// o nome e o patrimônio, sem `ativos.ver`.
import {
  anexosDoChat,
  arquivos,
  chamados,
  conversas,
  mensagensDoChat,
  type Transacao,
  tiposDeChamado,
} from '@grafite/db';
import {
  type Acesso,
  type CampoDoFormulario,
  conferirAberturaPeloChat,
  jaVirouChamado,
  locaisDaSolicitacao,
  SEM_ACESSO,
  tipoAbrePeloChat,
} from '@grafite/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { lerArvore } from '../arvore.ts';
import {
  type ChamadoAberto,
  conferirAtivo,
  gravarAbertura,
  type Leitor,
  lerPessoa,
  lerTipo,
} from '../chamados/abertura.ts';
import { formularioDa } from '../chamados/formulario.ts';
import { sugestoesDaPessoa } from '../chamados/sugestoes.ts';
import { naOrdem } from '../chamados/tipos.ts';
import { registrarEvento } from '../eventos/saida.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { conflito, dadosInvalidos, ProblemaDaApi } from '../problemas.ts';
import { travar } from '../travas.ts';
import { type ContaQueLe, lerConversaDaConta, publicoDaConversa } from './conversa.ts';
import { mensagemNaoEncontrada } from './mensagens.ts';

/**
 * Quem lê na abertura pelo chat: a organização inteira, nos ativos, para a escolha e a solicitação
 * que o tipo gera, e no estoque, para o consumível sugerido pelo saldo, como na abertura pela TI.
 * Da escolha, quem abre recebe só o id, o nome e o patrimônio.
 */
const ACESSO_DA_ABERTURA_PELO_CHAT: Acesso = {
  ...SEM_ACESSO,
  permissoes: new Map([
    ['ativos.ver', { organizacao: true, locais: new Set<string>() }],
    ['estoque.ver', { organizacao: true, locais: new Set<string>() }],
  ]),
};

/** O leitor dos ativos sugeridos, do escolhido e da solicitação que o tipo gera. */
export async function leitorDaAberturaPeloChat(tx: Transacao): Promise<Leitor> {
  return { acesso: ACESSO_DA_ABERTURA_PELO_CHAT, arvore: await lerArvore(tx) };
}

/** O primeiro campo Ativo do tipo que pede o ativo, cujo ativo é o ligado; nos outros, nenhum. */
function campoDoAtivo(tipo: {
  pedeOAtivo: boolean;
  formulario: Record<string, unknown>;
}): CampoDoFormulario | null {
  if (!tipo.pedeOAtivo) return null;
  return formularioDa(tipo).campos.find((campo) => campo.tipo === 'ativo') ?? null;
}

/** Os tipos que o chat oferece, na ordem dos tipos, com o que a escolha mostra. */
export async function tiposDaAberturaPeloChat(tx: Transacao) {
  const linhas = await tx
    .select({
      id: tiposDeChamado.id,
      nome: tiposDeChamado.nome,
      icone: tiposDeChamado.icone,
      frase: tiposDeChamado.frase,
      situacao: tiposDeChamado.situacao,
      apareceParaOColaborador: tiposDeChamado.apareceParaOColaborador,
      soATiAbre: tiposDeChamado.soATiAbre,
      pedeOAtivo: tiposDeChamado.pedeOAtivo,
      formulario: tiposDeChamado.formulario,
    })
    .from(tiposDeChamado)
    .where(eq(tiposDeChamado.situacao, 'em-uso'))
    .orderBy(...naOrdem);
  return linhas.filter(tipoAbrePeloChat).map((tipo) => ({
    id: tipo.id,
    nome: tipo.nome,
    icone: tipo.icone,
    frase: tipo.frase,
    pedeOAtivo: campoDoAtivo(tipo) !== null,
  }));
}

/**
 * Os ativos sugeridos para a pessoa, pelos tipos de ativo do primeiro campo Ativo; nulo no tipo que
 * não abre pelo chat ou não pede o ativo.
 */
async function sugeridosPara(
  tx: Transacao,
  tipo: Awaited<ReturnType<typeof lerTipo>>,
  pessoaId: string,
  leitor: Leitor,
) {
  const campo = tipo && tipoAbrePeloChat(tipo) ? campoDoAtivo(tipo) : null;
  if (!campo) return null;
  // Todos, sem o teto da TI: no chat, o ativo só se escolhe da lista, sem a busca.
  const { ativos } = await sugestoesDaPessoa(tx, pessoaId, {
    tipos: campo.tiposDeAtivo,
    ...leitor,
    limite: null,
  });
  return { campo, ativos };
}

/** Os ativos sugeridos que a escolha mostra: o id, o nome e o patrimônio. */
export async function ativosSugeridosPeloChat(tx: Transacao, tipoId: string, pessoaId: string) {
  const tipo = await lerTipo(tx, tipoId);
  const sugeridos = await sugeridosPara(tx, tipo, pessoaId, await leitorDaAberturaPeloChat(tx));
  return (sugeridos?.ativos ?? []).map(({ id, rotulo, patrimonio }) => ({
    id,
    nome: rotulo,
    patrimonio,
  }));
}

export interface PedidoDaAberturaPeloChat {
  tipo: string | null;
  titulo: string;
  pessoa: string | null;
  ativo: string | null;
}

/**
 * Abre o chamado a partir da mensagem, para a conta da sessão, que usa o chat e tem
 * `chamados.pedir` pela guarda da rota. A mensagem de uma conversa de que a conta não participa, e
 * o evento, respondem como inexistentes.
 */
export async function abrirPeloChat(
  tx: Transacao,
  conta: ContaQueLe,
  mensagemId: string,
  pedido: PedidoDaAberturaPeloChat,
  {
    requisicao,
    momento,
    enviar,
  }: { requisicao: FastifyRequest; momento: Date; enviar?: EnviarTarefa | undefined },
): Promise<ChamadoAberto> {
  const [mensagem] = await tx
    .select()
    .from(mensagensDoChat)
    .where(and(eq(mensagensDoChat.id, mensagemId), eq(mensagensDoChat.especie, 'mensagem')));
  if (!mensagem) throw mensagemNaoEncontrada();
  const { linha } = await lerConversaDaConta(tx, conta, mensagem.conversaId).catch(
    (erro: unknown) => {
      const naoParticipa = erro instanceof ProblemaDaApi && erro.dados.status === 404;
      throw naoParticipa ? mensagemNaoEncontrada() : erro;
    },
  );

  // A mensagem vira um chamado só: as aberturas dela esperam umas pelas outras, e a que vem depois
  // lê o chamado da que veio antes.
  await travar(tx, `mensagem:${mensagem.id}`);
  const [jaAberto] = await tx
    .select({ numero: chamados.numero })
    .from(chamados)
    .where(eq(chamados.origemMensagemId, mensagem.id));
  if (jaAberto) throw conflito(jaVirouChamado(jaAberto.numero));

  const leitor = await leitorDaAberturaPeloChat(tx);
  const tipo = pedido.tipo ? await lerTipo(tx, pedido.tipo) : null;
  const pessoa = pedido.pessoa ? await lerPessoa(tx, pedido.pessoa) : null;
  const sugeridos =
    pessoa && pessoa.situacao === 'ativa' ? await sugeridosPara(tx, tipo, pessoa.id, leitor) : null;
  const conferida = conferirAberturaPeloChat(pedido, {
    tipo: tipo ? { ...tipo, pedeOAtivo: sugeridos !== null } : null,
    pessoa: pessoa ? { nome: pessoa.nome, ativa: pessoa.situacao === 'ativa' } : null,
    sugeridos: sugeridos ? sugeridos.ativos.map(({ id }) => id) : null,
  });
  if (!conferida.ok) throw dadosInvalidos(conferida.erros);
  if (!tipo || !pessoa) throw new Error('A abertura pelo chat não foi conferida.');

  // O ativo escolhido, entre os sugeridos, travado para leitura como na abertura da TI.
  let ativoLigado = null;
  if (conferida.ativo !== null && sugeridos) {
    const conferido = await conferirAtivo(
      tx,
      conferida.ativo,
      sugeridos.campo.tiposDeAtivo,
      leitor,
    );
    if ('recusa' in conferido) throw dadosInvalidos({ ativo: conferido.recusa });
    ativoLigado = conferido.ativo;
  }

  const anexos = await tx
    .select({ id: anexosDoChat.arquivoId })
    .from(anexosDoChat)
    .innerJoin(arquivos, eq(arquivos.id, anexosDoChat.arquivoId))
    .where(and(eq(anexosDoChat.mensagemId, mensagem.id), isNull(arquivos.removidoEm)))
    .orderBy(asc(arquivos.enviadoEm), asc(arquivos.id));

  const aberto = await gravarAbertura(
    tx,
    {
      pessoa,
      tipo,
      formulario: formularioDa(tipo),
      // As respostas ficam vazias, fora a do primeiro campo Ativo, e os obrigatórios não barram.
      respostas: ativoLigado && sugeridos ? { [sugeridos.campo.id]: ativoLigado.id } : {},
      titulo: conferida.titulo,
      ativoLigado,
      locais: locaisDaSolicitacao([pessoa.localId, ...(ativoLigado ? [ativoLigado.localId] : [])]),
      origem: {
        tipo: 'chat',
        conversaId: linha.id,
        mensagemId: mensagem.id,
        texto: mensagem.texto,
        autorConta: mensagem.autorConta,
        escritaEm: mensagem.criadaEm,
        anexos: anexos.map(({ id }) => id),
      },
    },
    { requisicao, momento, enviar, leitor },
  );

  // O evento na conversa, travada como na mensagem, para o `uuidv7()` dele seguir a ordem dela; a
  // hora da última mensagem não muda, porque o evento não é uma mensagem.
  await tx
    .select({ id: conversas.id })
    .from(conversas)
    .where(eq(conversas.id, linha.id))
    .for('no key update');
  await tx.insert(mensagensDoChat).values({
    orgId: linha.orgId,
    conversaId: linha.id,
    especie: 'evento',
    autorConta: conta.id,
    evento: 'virou-chamado',
    dados: { chamadoId: aberto.id, numero: aberto.numero },
    criadaEm: momento,
  });
  await registrarEvento(tx, {
    tipo: 'chat.mudou',
    alvo: { tipo: 'conversa', id: linha.id },
    publico: publicoDaConversa(linha),
  });
  return { numero: aberto.numero, situacao: aberto.situacao, responsavel: aberto.responsavel };
}
