// A lista dos prazos (spec chamados, "Prazo do chamado"; spec modulo-chamados, "Prazos"; change
// chamados-da-ti, design, decisão 3, e tarefa 4.10): os chamados abertos que a conta vê, pelo
// vencimento, nos grupos do dia do fuso de quem olha, com o que a lista e o painel mostram. A web
// recalcula a situação a cada minuto, do relógio e do horário da TI que vêm junto. O prazo copiado
// é conferido na leitura: o estragado vai para o fim, pelo número, sem relógio nem grupo, e não
// derruba a lista.
import {
  ativos,
  chamados,
  contas,
  mensagensDosChamados,
  modelos,
  pessoas,
  type Transacao,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  alcance,
  compararPrazos,
  type DiaDaSemana,
  type GrupoDoPrazo,
  type HorarioDaTi,
  lerPrazoDoChamado,
  type PrazoDoChamado,
  type RelogioDoChamado,
  rotuloDoAtivo,
  type SituacaoDoChamado,
  type SituacaoDoPrazo,
  situacaoDoPrazo,
} from '@grafite/domain';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { ondeAContaVe } from './alcance.ts';
import { lerHorarioDaTi } from './horario.ts';

const ABERTOS = ['triagem', 'em-atendimento', 'aguardando'] as const;

/** O começo da última mensagem que a lista leva, em caracteres: o painel mostra só ele. */
const LIMITE_DA_ULTIMA_MENSAGEM = 280;

export interface ChamadoNosPrazos {
  numero: number;
  titulo: string;
  situacao: SituacaoDoChamado;
  /** A versão, que a tela manda nas ações (tarefa 4.12). */
  versao: number;
  abertoEm: string;
  tipo: { id: string; nome: string; icone: string };
  /** Quem pediu, com o caminho do local de trabalho. */
  pessoa: { id: string; nome: string; local: string | null };
  responsavel: { conta: string; nome: string } | null;
  ativo: { id: string; rotulo: string; patrimonio: string | null; local: string | null } | null;
  locais: string[];
  semLocal: boolean;
  /** O relógio guardado; nulo com o prazo estragado. */
  relogio: {
    prazo: PrazoDoChamado;
    contadoS: number;
    relogioDesde: string | null;
    primeiraRespostaEm: string | null;
  } | null;
  /** O grupo agora, no dia do fuso de quem olha; nulo com o prazo estragado. */
  grupo: GrupoDoPrazo | null;
  /** A última mensagem da conversa, de quem pediu ou da TI, sem as notas e os eventos. */
  ultimaMensagem: { autor: string; em: string; texto: string } | null;
}

export interface PrazosDosChamados {
  /** O horário da TI, com os dias numa lista nova. */
  horario: Omit<HorarioDaTi, 'dias'> & { dias: DiaDaSemana[] };
  chamados: ChamadoNosPrazos[];
}

/** O começo do texto, cortado em caracteres, e não em unidades do UTF-16, com as reticências. */
function comecoDoTexto(texto: string): string {
  const caracteres = [...texto];
  if (caracteres.length <= LIMITE_DA_ULTIMA_MENSAGEM) return texto;
  return `${caracteres.slice(0, LIMITE_DA_ULTIMA_MENSAGEM - 1).join('')}…`;
}

/** O caminho do local, como "Jundiaí › Financeiro"; a árvore tem também os inativos. */
const caminhoDo = (arvore: ArvoreDeLocais, localId: string | null) =>
  localId === null ? null : arvore.caminho(localId);

const pessoaQueAtende = alias(pessoas, 'pessoa_que_atende');
const pessoaDaConta = alias(pessoas, 'pessoa_da_conta');
const pessoaQueEscreveu = alias(pessoas, 'pessoa_que_escreveu');

/**
 * A lista para a conta que olha: os abertos que ela vê, lidos pelo número, e depois ordenados pelo
 * `compararPrazos`, que deixa o empate na ordem do número, com os estragados no fim. O fuso chega
 * já pelo nome do Intl: o grupo de hoje lê o relógio dele duas vezes por chamado.
 */
export async function prazosDosChamados(
  tx: Transacao,
  {
    acesso,
    arvore,
    fuso,
    agora,
  }: { acesso: Acesso; arvore: ArvoreDeLocais; fuso: string; agora: Date },
): Promise<PrazosDosChamados> {
  const doVer = alcance(acesso, 'chamados.ver', arvore);
  const lidos = await tx
    .select({
      id: chamados.id,
      numero: chamados.numero,
      titulo: chamados.titulo,
      situacao: chamados.situacao,
      versao: chamados.versao,
      abertoEm: chamados.abertoEm,
      locais: chamados.locais,
      semLocal: chamados.semLocal,
      prazo: chamados.prazo,
      contadoS: chamados.contadoS,
      relogioDesde: chamados.relogioDesde,
      primeiraRespostaEm: chamados.primeiraRespostaEm,
      tipo: { id: tiposDeChamado.id, nome: tiposDeChamado.nome, icone: tiposDeChamado.icone },
      pessoa: { id: pessoas.id, nome: pessoas.nome, localId: pessoas.localId },
      responsavel: chamados.responsavelId,
      nomeDeQuemAtende: pessoaQueAtende.nome,
      ativoId: chamados.ativoId,
    })
    .from(chamados)
    .innerJoin(tiposDeChamado, eq(tiposDeChamado.id, chamados.tipoId))
    .innerJoin(pessoas, eq(pessoas.id, chamados.pessoaId))
    .leftJoin(contas, eq(contas.id, chamados.responsavelId))
    .leftJoin(pessoaQueAtende, eq(pessoaQueAtende.id, contas.pessoaId))
    .where(and(ondeAContaVe(doVer), inArray(chamados.situacao, [...ABERTOS])))
    .orderBy(asc(chamados.numero));
  const horario = await lerHorarioDaTi(tx);
  const horarioNaResposta = { ...horario, dias: [...horario.dias] };
  if (lidos.length === 0) return { horario: horarioNaResposta, chamados: [] };

  const idsDosAtivos = [...new Set(lidos.flatMap((linha) => linha.ativoId ?? []))];
  const ativosLidos =
    idsDosAtivos.length === 0
      ? []
      : await tx
          .select({
            id: ativos.id,
            nome: ativos.nome,
            patrimonio: ativos.patrimonio,
            localId: ativos.localId,
            tipo: { nome: tiposDeAtivo.nome },
            modelo: { fabricante: modelos.fabricante, nome: modelos.nome },
          })
          .from(ativos)
          .innerJoin(tiposDeAtivo, eq(tiposDeAtivo.id, ativos.tipoId))
          .leftJoin(modelos, eq(modelos.id, ativos.modeloId))
          .where(inArray(ativos.id, idsDosAtivos));
  const ativoDe = new Map(
    ativosLidos.map((ativo) => [
      ativo.id,
      {
        id: ativo.id,
        rotulo: rotuloDoAtivo({ nome: ativo.nome, modelo: ativo.modelo, tipo: ativo.tipo }),
        patrimonio: ativo.patrimonio,
        local: caminhoDo(arvore, ativo.localId),
      },
    ]),
  );

  // A última mensagem de cada chamado, pelo momento e, no empate, pela gravada depois.
  const ultimas = await tx
    .selectDistinctOn([mensagensDosChamados.chamadoId], {
      chamadoId: mensagensDosChamados.chamadoId,
      autor: sql<string>`coalesce(${pessoaDaConta.nome}, ${pessoaQueEscreveu.nome})`,
      texto: mensagensDosChamados.texto,
      criadaEm: mensagensDosChamados.criadaEm,
    })
    .from(mensagensDosChamados)
    .leftJoin(contas, eq(contas.id, mensagensDosChamados.autorConta))
    .leftJoin(pessoaDaConta, eq(pessoaDaConta.id, contas.pessoaId))
    .leftJoin(pessoaQueEscreveu, eq(pessoaQueEscreveu.id, mensagensDosChamados.autorPessoa))
    .where(
      and(
        inArray(
          mensagensDosChamados.chamadoId,
          lidos.map((linha) => linha.id),
        ),
        eq(mensagensDosChamados.especie, 'mensagem'),
      ),
    )
    .orderBy(
      mensagensDosChamados.chamadoId,
      desc(mensagensDosChamados.criadaEm),
      desc(mensagensDosChamados.id),
    );
  const ultimaDe = new Map(
    ultimas.map((mensagem) => [
      mensagem.chamadoId,
      {
        autor: mensagem.autor,
        em: mensagem.criadaEm.toISOString(),
        // A mensagem sempre tem o texto (mensagens_dos_chamados_conteudo_valido).
        texto: comecoDoTexto(mensagem.texto ?? ''),
      },
    ]),
  );

  const lista = lidos.map((linha) => {
    const prazo = lerPrazoDoChamado(linha.prazo);
    const relogio: RelogioDoChamado | null = prazo && {
      prazo,
      contadoS: linha.contadoS,
      relogioDesde: linha.relogioDesde,
      primeiraRespostaEm: linha.primeiraRespostaEm,
    };
    const situacao: SituacaoDoPrazo | null =
      relogio && situacaoDoPrazo(relogio, horario, agora, fuso);
    const chamado: ChamadoNosPrazos = {
      numero: linha.numero,
      titulo: linha.titulo,
      situacao: linha.situacao,
      versao: linha.versao,
      abertoEm: linha.abertoEm.toISOString(),
      tipo: linha.tipo,
      pessoa: {
        id: linha.pessoa.id,
        nome: linha.pessoa.nome,
        local: caminhoDo(arvore, linha.pessoa.localId),
      },
      responsavel:
        linha.responsavel === null
          ? null
          : { conta: linha.responsavel, nome: linha.nomeDeQuemAtende ?? '' },
      ativo: linha.ativoId === null ? null : (ativoDe.get(linha.ativoId) ?? null),
      locais: linha.locais,
      semLocal: linha.semLocal,
      relogio: relogio && {
        prazo: relogio.prazo,
        contadoS: relogio.contadoS,
        relogioDesde: relogio.relogioDesde?.toISOString() ?? null,
        primeiraRespostaEm: relogio.primeiraRespostaEm?.toISOString() ?? null,
      },
      grupo: situacao?.grupo ?? null,
      ultimaMensagem: ultimaDe.get(linha.id) ?? null,
    };
    return { chamado, situacao };
  });

  const comPrazo = lista.flatMap(({ chamado, situacao }) =>
    situacao === null ? [] : [{ chamado, situacao }],
  );
  // O sort é estável: o empate fica na ordem do número, que veio da consulta.
  comPrazo.sort((a, b) => compararPrazos(a.situacao, b.situacao));
  return {
    horario: horarioNaResposta,
    chamados: [
      ...comPrazo.map(({ chamado }) => chamado),
      ...lista.flatMap(({ chamado, situacao }) => (situacao === null ? [chamado] : [])),
    ],
  };
}
