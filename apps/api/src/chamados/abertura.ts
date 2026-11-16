// A abertura do chamado pela TI (spec chamados, "Abrir um chamado pela TI", "Situação e quem
// atende", "Ativo ligado e campos da TI" e "Quem vê e quem atende os chamados"; spec
// tipos-de-chamado, "Respostas do formulário"; change chamados-da-ti, design, decisões 2, 3, 5, 7, 8
// e 10), numa transação:
// - a pessoa e o tipo, travados para leitura, o título escrito e as respostas pelo domínio, todas
//   as recusas dos campos juntas;
// - o ativo, o local e a pessoa das respostas, que só a API confere, numa segunda volta;
// - os locais, da pessoa e do ativo ligado, e o alcance de quem abre;
// - o atendimento, o número da organização e o prazo do tipo em minutos;
// - o chamado, com a primeira resposta dada, o evento de abertura, sem o resumo pronto, os anexos
//   tomados pelos campos, a auditoria e o `chamados.mudaram`;
// - as notificações de quem recebe o chamado pelo tipo ou da triagem (tarefa 4.8).
// A solicitação gerada pelo tipo chega na tarefa 4.18.
import {
  ativos,
  chamados,
  locais,
  mensagensDosChamados,
  modelos,
  numeracaoDosChamados,
  pessoas,
  type Transacao,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  type AtivoDasRespostas,
  alcance,
  conferirRespostas,
  conferirTituloDoChamado,
  decidirAtendimento,
  type Formulario,
  locaisDaSolicitacao,
  MENSAGEM_DA_PESSOA_INATIVA,
  MENSAGEM_DO_ATIVO_INATIVO,
  MENSAGEM_DO_LOCAL_INATIVO,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  normalizarTexto,
  notificacoesDaAbertura,
  podeEm,
  prazoEmMinutos,
  recusaDeQuemAbre,
  rotuloDoAtivo,
  type SituacaoDoChamado,
  tituloDasRespostas,
} from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { recusaDosTiposAceitos } from '../ativos/escrita.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import type { EnviarTarefa } from '../fila/tarefas.ts';
import { notificar } from '../notificacoes/notificar.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { publicoDoChamado } from './alcance.ts';
import { tomarAnexos } from './anexos.ts';
import { formularioDa } from './formulario.ts';
import { lerHorarioDaTi } from './horario.ts';
import { contasDaTriagem, lerContaQueAtende, nomeDaConta } from './quem-atende.ts';

export const RECUSAS_DA_ABERTURA = {
  semPessoa: 'Escolha quem pediu.',
  pessoaNaoEncontrada: 'Pessoa não encontrada.',
  semTipo: 'Escolha o tipo.',
  tipoForaDeUso: 'O tipo escolhido não está em uso.',
  ativoNaoEncontrado: 'Ativo não encontrado.',
  localNaoEncontrado: 'Local não encontrado.',
} as const;

const R = RECUSAS_DA_ABERTURA;

export interface PedidoDeAbertura {
  pessoa?: string | null;
  tipo?: string | null;
  /** O título que quem abre escreveu; sem ele, vale o montado das respostas. */
  titulo?: string | null;
  respostas?: Record<string, unknown>;
  ficaComigo: boolean;
}

export interface ChamadoAberto {
  numero: number;
  situacao: SituacaoDoChamado;
  responsavel: { id: string; nome: string } | null;
}

interface Leitor {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
}

/** O ativo de uma resposta, como a abertura o usa. */
interface AtivoDaResposta extends AtivoDasRespostas {
  id: string;
  localId: string | null;
}

type Recusas = Record<string, string>;

/** A pessoa pelo id, travada para leitura: a de outra organização não aparece, pelo RLS. */
async function lerPessoa(tx: Transacao, id: string) {
  const [pessoa] = await tx
    .select({
      id: pessoas.id,
      nome: pessoas.nome,
      localId: pessoas.localId,
      situacao: pessoas.situacao,
    })
    .from(pessoas)
    .where(eq(pessoas.id, id))
    .for('share');
  return pessoa ?? null;
}

/** O tipo pelo id, travado para leitura até o fim da abertura, como a gravação dele o trava. */
async function lerTipo(tx: Transacao, id: string) {
  const [tipo] = await tx
    .select()
    .from(tiposDeChamado)
    .where(eq(tiposDeChamado.id, id))
    .for('share');
  return tipo ?? null;
}

/**
 * O ativo de uma resposta: o que quem abre não vê é como o que não existe, o inativo é recusado, e
 * o de um tipo que o campo não aceita, com os nomes dos aceitos.
 */
async function conferirAtivo(
  tx: Transacao,
  ativoId: string,
  aceitos: readonly string[],
  { acesso, arvore }: Leitor,
): Promise<{ ativo: AtivoDaResposta } | { recusa: string }> {
  const [linha] = await tx
    .select({
      id: ativos.id,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      localId: ativos.localId,
      situacao: ativos.situacao,
      tipoId: ativos.tipoId,
      tipo: { nome: tiposDeAtivo.nome },
      modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
    .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
    .where(eq(ativos.id, ativoId))
    .for('share', { of: ativos });
  if (!linha || !podeEm(acesso, 'ativos.ver', linha.localId, arvore)) {
    return { recusa: R.ativoNaoEncontrado };
  }
  if (linha.situacao !== 'ativo') return { recusa: MENSAGEM_DO_ATIVO_INATIVO };
  if (aceitos.length > 0 && !aceitos.includes(linha.tipoId)) {
    return { recusa: await recusaDosTiposAceitos(tx, aceitos) };
  }
  return {
    ativo: {
      id: linha.id,
      patrimonio: linha.patrimonio,
      rotulo: rotuloDoAtivo({ nome: linha.nome, modelo: linha.modelo, tipo: linha.tipo }),
      localId: linha.localId,
    },
  };
}

/** O local de uma resposta, travado para leitura: o de outra organização não aparece, pelo RLS. */
async function conferirLocal(tx: Transacao, localId: string): Promise<string | null> {
  const [local] = await tx
    .select({ situacao: locais.situacao })
    .from(locais)
    .where(eq(locais.id, localId))
    .for('share');
  if (!local) return R.localNaoEncontrado;
  return local.situacao === 'ativo' ? null : MENSAGEM_DO_LOCAL_INATIVO;
}

/**
 * O ativo, o local e a pessoa das respostas, que o domínio deixa para a API (design, decisão 2):
 * existem, quem abre vê o ativo, e estão ativos. Devolve as recusas na chave de cada campo, os
 * ativos lidos, para o título, e o ativo ligado, a resposta do primeiro campo Ativo.
 */
async function conferirReferencias(
  tx: Transacao,
  formulario: Formulario,
  respostas: Readonly<Record<string, unknown>>,
  leitor: Leitor,
) {
  const recusas: Recusas = {};
  const lidos = new Map<string, AtivoDaResposta>();
  const primeiroAtivo = formulario.campos.find((campo) => campo.tipo === 'ativo');
  let ativoLigado: AtivoDaResposta | null = null;
  for (const campo of formulario.campos) {
    const resposta = respostas[campo.id];
    if (typeof resposta !== 'string') continue;
    const chave = `campos.${campo.id}`;
    if (campo.tipo === 'ativo') {
      const conferido = await conferirAtivo(tx, resposta, campo.tiposDeAtivo, leitor);
      if ('recusa' in conferido) {
        recusas[chave] = conferido.recusa;
        continue;
      }
      lidos.set(conferido.ativo.id, conferido.ativo);
      if (campo === primeiroAtivo) ativoLigado = conferido.ativo;
    } else if (campo.tipo === 'local') {
      const recusa = await conferirLocal(tx, resposta);
      if (recusa) recusas[chave] = recusa;
    } else if (campo.tipo === 'pessoa') {
      const pessoa = await lerPessoa(tx, resposta);
      if (!pessoa) recusas[chave] = R.pessoaNaoEncontrada;
      else if (pessoa.situacao !== 'ativa') recusas[chave] = MENSAGEM_DA_PESSOA_INATIVA;
    }
  }
  return { recusas, ativos: lidos as ReadonlyMap<string, AtivoDasRespostas>, ativoLigado };
}

/** O próximo número da organização, pela linha da numeração, que serializa as aberturas. */
async function proximoNumero(tx: Transacao): Promise<number> {
  const [linha] = await tx
    .insert(numeracaoDosChamados)
    .values({ orgId: sql`app.current_org()`, ultimo: 1 })
    .onConflictDoUpdate({
      target: numeracaoDosChamados.orgId,
      set: { ultimo: sql`${numeracaoDosChamados.ultimo} + 1` },
    })
    .returning({ ultimo: numeracaoDosChamados.ultimo });
  if (!linha) throw new Error('O número do chamado não foi gerado.');
  return linha.ultimo;
}

/**
 * Abre o chamado e devolve o número, a situação e quem atende. Com a fila, as notificações vão
 * também pelo e-mail e pelo push.
 */
export async function abrirChamado(
  tx: Transacao,
  pedido: PedidoDeAbertura,
  {
    requisicao,
    momento,
    enviar,
  }: { requisicao: FastifyRequest; momento: Date; enviar?: EnviarTarefa },
): Promise<ChamadoAberto> {
  const { acesso, contaId } = sessaoDa(requisicao);
  const arvore = await lerArvore(tx);
  const leitor: Leitor = { acesso, arvore };
  const recusas: Recusas = {};

  const pessoa = pedido.pessoa ? await lerPessoa(tx, pedido.pessoa) : null;
  if (!pedido.pessoa) recusas.pessoa = R.semPessoa;
  else if (!pessoa) recusas.pessoa = R.pessoaNaoEncontrada;
  else if (pessoa.situacao !== 'ativa') recusas.pessoa = MENSAGEM_DA_PESSOA_INATIVA;

  const tipo = pedido.tipo ? await lerTipo(tx, pedido.tipo) : null;
  if (!pedido.tipo) recusas.tipo = R.semTipo;
  else if (!tipo) recusas.tipo = MENSAGENS_DO_TIPO_DE_CHAMADO.naoEncontrado;
  else if (tipo.situacao !== 'em-uso') recusas.tipo = R.tipoForaDeUso;

  let tituloEscrito: string | null = null;
  if (pedido.titulo !== null && pedido.titulo !== undefined) {
    const conferido = conferirTituloDoChamado(pedido.titulo);
    if (conferido.ok) tituloEscrito = conferido.titulo;
    else recusas.titulo = conferido.erro;
  }

  // As respostas, só com o tipo em uso; o ativo, o local e a pessoa delas, depois das do domínio.
  const formulario = tipo?.situacao === 'em-uso' ? formularioDa(tipo) : null;
  const conferidas = formulario ? conferirRespostas(formulario, pedido.respostas ?? {}) : null;
  if (conferidas && !conferidas.ok) Object.assign(recusas, conferidas.erros);
  if (Object.keys(recusas).length > 0) throw dadosInvalidos(recusas);
  if (!pessoa || !tipo || !formulario || !conferidas?.ok) {
    throw new Error('A abertura não foi conferida.');
  }
  const respostas = conferidas.respostas;
  const referencias = await conferirReferencias(tx, formulario, respostas, leitor);
  if (Object.keys(referencias.recusas).length > 0) throw dadosInvalidos(referencias.recusas);

  // Os locais: o da pessoa e o do ativo ligado. Quem abre atende todos.
  const { ativoLigado } = referencias;
  const doChamado = locaisDaSolicitacao([
    pessoa.localId,
    ...(ativoLigado ? [ativoLigado.localId] : []),
  ]);
  const recusa = recusaDeQuemAbre(alcance(acesso, 'chamados.atender', arvore), {
    locais: doChamado.locais.map((id) => ({ id, nome: arvore.caminho(id) })),
    semLocal: doChamado.semLocal,
  });
  if (recusa) throw conflito(recusa);

  // A abertura lê o horário sem a trava `horario-da-ti` (design, decisão 3, que só a pede nas ações
  // que mexem nos relógios). Se o horário muda junto, o chamado nasce com o prazo e o atendimento do
  // horário antigo, e os segundos dele contam pelo novo, como se tivesse sido aberto logo antes.
  const horario = await lerHorarioDaTi(tx);
  const atendimento = decidirAtendimento({
    ficaComigo: pedido.ficaComigo ? contaId : null,
    padrao: tipo.atendePorPadrao ? await lerContaQueAtende(tx, tipo.atendePorPadrao, arvore) : null,
    semNinguem: tipo.semNinguem,
    locais: doChamado,
    horario,
    agora: momento,
  });
  const titulo =
    tituloEscrito ??
    tituloDasRespostas(formulario, respostas, {
      nomeDoTipo: tipo.nome,
      ativos: referencias.ativos,
    });

  const numero = await proximoNumero(tx);
  const [aberto] = await tx
    .insert(chamados)
    .values({
      orgId: sql`app.current_org()`,
      numero,
      tipoId: tipo.id,
      titulo,
      tituloNormalizado: normalizarTexto(titulo),
      pessoaId: pessoa.id,
      origem: 'ti',
      abertoPor: contaId,
      abertoEm: momento,
      formulario: { ...formulario },
      respostas,
      ativoId: ativoLigado?.id ?? null,
      locais: doChamado.locais,
      semLocal: doChamado.semLocal,
      situacao: atendimento.situacao,
      responsavelId: atendimento.atende,
      responsavelDesde: atendimento.atende ? momento : null,
      prazo: {
        ...prazoEmMinutos(
          {
            modo: tipo.modo,
            resposta: { valor: tipo.respostaValor, unidade: tipo.respostaUnidade },
            resolucao: { valor: tipo.resolucaoValor, unidade: tipo.resolucaoUnidade },
          },
          horario,
        ),
      },
      contadoS: 0,
      // A pessoa já falou com a TI: o relógio conta desde a abertura, com a primeira resposta dada.
      relogioDesde: momento,
      primeiraRespostaEm: momento,
    })
    .returning({ id: chamados.id });
  if (!aberto) throw new Error('O chamado não foi aberto.');

  // O evento de abertura não guarda o resumo: a leitura o monta da cópia (decisão 8).
  await tx.insert(mensagensDosChamados).values({
    orgId: sql`app.current_org()`,
    chamadoId: aberto.id,
    especie: 'evento',
    autorConta: contaId,
    evento: 'abertura',
    dados: {},
    criadaEm: momento,
  });
  for (const campo of formulario.campos) {
    const arquivos = respostas[campo.id];
    if (campo.tipo !== 'anexo' || !Array.isArray(arquivos)) continue;
    await tomarAnexos(tx, {
      arquivos: arquivos.map(String),
      contaId,
      dono: { chamadoId: aberto.id, campoId: campo.id },
      chave: `campos.${campo.id}`,
    });
  }

  const responsavel = atendimento.atende
    ? { id: atendimento.atende, nome: await nomeDaConta(tx, atendimento.atende) }
    : null;
  const visao: Record<string, unknown> = {
    numero,
    tipo: tipo.nome,
    titulo,
    pessoa: pessoa.nome,
    situacao: atendimento.situacao,
    responsavel: responsavel?.nome ?? null,
    ativo: ativoLigado
      ? [ativoLigado.rotulo, ativoLigado.patrimonio].filter(Boolean).join(' · ')
      : null,
  };
  await registrarNaAuditoria(tx, {
    acao: 'chamado.aberto',
    ator: { tipo: 'conta', contaId },
    alvo: { tipo: 'chamado', id: aberto.id },
    depois: Object.fromEntries(Object.entries(visao).filter(([, valor]) => valor !== null)),
    origem: origemDa(requisicao),
    momento,
    saida: { publico: publicoDoChamado(doChamado) },
  });

  // As notificações: a de quem recebe o chamado pelo tipo, ou as da triagem, fora quem abriu. As
  // contas da organização só são lidas para a triagem.
  const contasQueAtendem =
    atendimento.situacao === 'triagem' ? await contasDaTriagem(tx, arvore) : [];
  await notificar(
    tx,
    notificacoesDaAbertura(
      {
        numero,
        titulo,
        situacao: atendimento.situacao,
        responsavelId: atendimento.atende,
        locais: doChamado,
      },
      { abertoPor: contaId, contas: contasQueAtendem },
    ),
    momento,
    enviar ? { enviar } : {},
  );
  return { numero, situacao: atendimento.situacao, responsavel };
}
