// A conversa do chamado aberto (spec modulo-chamados, "Chamado aberto"; change chamados-da-ti,
// design, "O chamado aberto, a conversa (tarefa 5.11)"; mockups m03 e m04): a hora de cada item, a
// frase de cada evento e de cada alerta, que a web monta com os nomes de agora (decisão 8), e o
// contexto do resumo das respostas, montado do que a ficha cita.
import {
  type ContextoDasRespostas,
  comMinuscula,
  fraseDaSolicitacaoNaoGerada,
  nomeCurto,
} from '@grafite/domain';
import type { DataHora } from '@grafite/ui';
import type { FichaDoChamado } from '../consultas.ts';
import { momentoDaMensagem } from '../quadro/previa.ts';
import { idadeDoMaisAntigo } from '../quadro/quadro.ts';

export type ItemDaConversa = FichaDoChamado['conversa'][number];
export type EventoDaConversa = Extract<ItemDaConversa, { especie: 'evento' }>;
export type AlertaDaConversa = Extract<ItemDaConversa, { especie: 'alerta' }>;

/** O ativo como as frases o citam: o patrimônio ou, sem ele, o nome que as telas mostram. */
interface AtivoNaFrase {
  rotulo: string;
  patrimonio: string | null;
}

const doAtivo = (ativo: AtivoNaFrase) => ativo.patrimonio ?? ativo.rotulo;

/**
 * A hora das mensagens, das notas, da abertura e dos alertas, como no m03: "hoje, 09:21", "ontem,
 * 17:22" e "seg 9 nov, 16:00".
 */
export function momentoNaConversa(em: Date, agora: Date, dataHora: DataHora): string {
  const momento = momentoDaMensagem(em, agora, dataHora);
  return dataHora.grupoDoDia(em, agora) === 'Hoje' ? `hoje, ${momento}` : momento;
}

/** A linha de um evento: a frase, com a hora. */
export interface LinhaDoEvento {
  texto: string;
  /** A espera da pessoa, que para o relógio: em peso forte, com a ampulheta (m03). */
  aguardando: boolean;
}

const juntar = (...partes: (string | null)[]) =>
  partes.filter((parte): parte is string => parte !== null).join(' · ');

/**
 * A frase de um evento, com quem agiu e a hora: só a hora no mesmo dia nas ações, como o "assumiu o
 * chamado · 09:40" do m04, e o dia na abertura. O evento que não traz o dado da frase fica de fora.
 */
export function linhaDoEvento(
  evento: EventoDaConversa,
  { pessoa, agora, dataHora }: { pessoa: string; agora: Date; dataHora: DataHora },
): LinhaDoEvento | null {
  const em = new Date(evento.em);
  const hora = momentoDaMensagem(em, agora, dataHora);
  // Só o `fechou` vem sem autor, porque ninguém o faz (chat-com-chamados, tarefa 3.11).
  const quem = evento.autor?.nome ?? '';
  const linha = (...partes: (string | null)[]): LinhaDoEvento => ({
    texto: juntar(...partes),
    aguardando: false,
  });
  /** A conta dos dados que não é quem agiu, como quem estava com o chamado que outro passou. */
  const outra = (conta: { conta: string; nome: string } | null) =>
    conta !== null && conta.conta !== evento.autor?.id ? conta : null;
  switch (evento.evento) {
    case 'abertura':
      return linha(
        evento.autor?.tipo === 'pessoa'
          ? `${quem} abriu o chamado`
          : `${quem} abriu o chamado para ${pessoa}`,
        momentoNaConversa(em, agora, dataHora),
      );
    case 'assumiu': {
      const onde = evento.de ? `com ${evento.de.nome}` : 'na triagem';
      const estava = evento.desde
        ? `estava há ${idadeDoMaisAntigo(new Date(evento.desde), em)} ${onde}`
        : null;
      return linha(`${quem} assumiu o chamado`, hora, estava);
    }
    case 'passou': {
      if (!evento.para) return null;
      const de = outra(evento.de);
      return linha(
        `${quem} passou o chamado${de ? ` de ${de.nome}` : ''} para ${evento.para.nome}`,
        hora,
      );
    }
    case 'devolveu':
      return linha(`${quem} devolveu o chamado à triagem`, hora);
    case 'desfez':
      return linha(
        `${quem} desfez o assumir`,
        hora,
        evento.para ? `o chamado voltou para ${evento.para.nome}` : 'o chamado voltou à triagem',
      );
    case 'aguardando':
      return {
        texto: juntar(`Aguardando ${nomeCurto(pessoa)}`, hora, 'o relógio parou'),
        aguardando: true,
      };
    case 'retomou':
      return linha(`${quem} retomou o atendimento`, hora, 'o relógio voltou a contar');
    case 'resolveu':
      return linha(`${quem} resolveu o chamado`, hora);
    case 'reabriu': {
      const para = outra(evento.para);
      const destino =
        evento.para === null ? 'voltou à triagem' : para ? `voltou para ${para.nome}` : null;
      return linha(`${quem} reabriu o chamado`, hora, destino, 'o relógio voltou a contar');
    }
    case 'ativo': {
      const antes = evento.ativo?.antes ?? null;
      const depois = evento.ativo?.depois ?? null;
      if (antes && depois) {
        return linha(`${quem} trocou o ativo ${doAtivo(antes)} por ${doAtivo(depois)}`, hora);
      }
      if (depois) return linha(`${quem} ligou o ativo ${doAtivo(depois)}`, hora);
      if (antes) return linha(`${quem} tirou o ativo ${doAtivo(antes)}`, hora);
      return null;
    }
    case 'os':
      return evento.os ? linha(`Virou a OS ${evento.os.numero}`, hora, `por ${quem}`) : null;
    case 'solicitacao': {
      if (!evento.solicitacao) return null;
      const { numero, como } = evento.solicitacao;
      const frase = {
        juntou: `Juntou-se à solicitação ${numero}`,
        pediu: `Pediu toner na solicitação ${numero}`,
        gerou: `Gerou a solicitação ${numero}`,
      }[como];
      return linha(frase, hora, `por ${quem}`);
    }
    case 'solicitacao-nao-gerada':
      // O motivo termina no ponto, que sai antes da hora.
      return evento.motivo
        ? linha(fraseDaSolicitacaoNaoGerada(evento.motivo).replace(/\.$/u, ''), hora)
        : null;
    case 'avaliou':
    case 'fechou':
      // A avaliação de quem participa e o fechamento entram na conversa da TI na tarefa 4.13.
      return null;
  }
}

/**
 * A linha de um alerta do ativo ligado, como no m04, sem o artigo da decisão 19: "Alerta no ativo
 * PAT-00139: toner preto abaixo de 10% · hoje, 09:36".
 */
export function linhaDoAlerta(
  alerta: AlertaDaConversa,
  ativo: AtivoNaFrase | null,
  agora: Date,
  dataHora: DataHora,
): string {
  const onde = ativo ? `Alerta no ativo ${doAtivo(ativo)}` : 'Alerta no ativo';
  return juntar(
    `${onde}: ${comMinuscula(alerta.texto)}`,
    momentoNaConversa(new Date(alerta.em), agora, dataHora),
  );
}

/** O contexto do resumo das respostas: os nomes de agora do que as respostas citam. */
export function contextoDaFicha(ficha: FichaDoChamado): ContextoDasRespostas {
  return {
    nomeDoTipo: ficha.tipo.nome,
    ativos: new Map(
      ficha.citados.ativos.map(({ id, rotulo, patrimonio }) => [id, { rotulo, patrimonio }]),
    ),
    locais: new Map(ficha.citados.locais.map(({ id, caminho }) => [id, caminho])),
    pessoas: new Map(ficha.citados.pessoas.map(({ id, nome }) => [id, nome])),
  };
}
