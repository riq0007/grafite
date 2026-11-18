// O quadro do prazo do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "O chamado aberto, o cabeçalho"): o prazo do tipo, a situação do selo do
// prazo em destaque, o detalhe no tempo do relógio e a primeira resposta pendente. A conta é a do
// domínio, a mesma da lista dos prazos, e anda com o `agora` da tela.
import {
  type GrupoDoPrazo,
  type HorarioDaTi,
  momentoEmQueAlcanca,
  situacaoDoPrazo,
  textoDoValorDoPrazo,
} from '@grafite/domain';
import type { DataHora, Situacao } from '@grafite/ui';
import { type RelogioDaApi, relogioDaApi, seloDoPrazo } from '../prazo.ts';

/** O que o quadro do prazo lê do chamado, como a ficha o manda. */
export interface ChamadoDoQuadroDoPrazo {
  abertoEm: string;
  relogio: RelogioDaApi | null;
  /** O momento em que o relógio parou, com ele parado. */
  parouEm: string | null;
}

/** Um pedaço do detalhe; o vencimento e o que resta, ou o que passou, vão em mono. */
export interface PedacoDoDetalhe {
  texto: string;
  mono?: true;
}

export interface QuadroDoPrazo {
  /** "Prazo do tipo, 8 h, no horário da TI"; nulo no prazo ilegível. */
  prazoDoTipo: string | null;
  /** "Vence em 2 h", "Estourado há 20 min", "Relógio parado" ou "Prazo ilegível". */
  destaque: string;
  /** O grupo do prazo; nulo no prazo ilegível. */
  grupo: GrupoDoPrazo | null;
  /** A marca do selo do prazo: a cor só no estourado e no que vence em até 2 h. */
  marca: Situacao;
  /** Os pedaços do detalhe, que a tela junta com o "·". */
  detalhe: PedacoDoDetalhe[];
  /** "Responder até 08:30" ou "Resposta atrasada desde 08:30", com a primeira resposta pendente. */
  resposta: { texto: string; atrasada: boolean } | null;
}

const MS_POR_DIA = 86_400_000;

/**
 * O dia de um momento em relação a agora, no fuso da conta: nulo hoje, "ontem", "amanhã", o dia da
 * semana com o dia e o mês ("qui 19 nov") e, em outro ano, a data inteira.
 */
function diaDe(momento: Date, agora: Date, dataHora: DataHora): string | null {
  const dia = dataHora.formatarData(momento);
  if (dia === dataHora.formatarData(agora)) return null;
  if (dia === dataHora.formatarData(new Date(agora.getTime() - MS_POR_DIA))) return 'ontem';
  if (dia === dataHora.formatarData(new Date(agora.getTime() + MS_POR_DIA))) return 'amanhã';
  if (dia.slice(-4) !== dataHora.formatarData(agora).slice(-4)) return dia;
  return dataHora.formatarDia(momento);
}

/** "às 16:00" hoje, "ontem às 17:05", "amanhã às 08:12" e "qui 19 nov às 08:12". */
function quando(momento: Date, agora: Date, dataHora: DataHora): string {
  const dia = diaDe(momento, agora, dataHora);
  const hora = dataHora.formatarHora(momento);
  return dia === null ? `às ${hora}` : `${dia} às ${hora}`;
}

/** Como o `quando`, sem o "às" de hoje: "08:30" e "amanhã às 08:30". */
function quandoSemAs(momento: Date, agora: Date, dataHora: DataHora): string {
  const dia = diaDe(momento, agora, dataHora);
  const hora = dataHora.formatarHora(momento);
  return dia === null ? hora : `${dia} às ${hora}`;
}

/** A duração em horas e minutos, para baixo: "1 h 44 min", "2 h", "20 min" e "menos de 1 min". */
function duracao(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  if (minutos < 1) return 'menos de 1 min';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** "restam 1 h 44 min", no singular quando é uma medida só de 1, ou menos de 1 min. */
function oQueResta(segundos: number): string {
  const texto = duracao(segundos);
  const singular = texto === '1 h' || texto === '1 min' || texto === 'menos de 1 min';
  return `${singular ? 'resta' : 'restam'} ${texto}`;
}

/**
 * O primeiro momento que o relógio conta a partir de quando voltou a contar: o mesmo, no horário
 * ou em horas corridas; fora do horário, o começo da próxima janela dele.
 */
function comecoDaContagem(desde: Date, relogio: RelogioDaApi, horario: HorarioDaTi): Date {
  const umSegundoDepois = momentoEmQueAlcanca(desde, 1, relogio.prazo.modo, horario);
  return new Date(umSegundoDepois.getTime() - 1000);
}

/** O quadro do prazo do chamado agora, no fuso da conta. */
export function quadroDoPrazo(
  chamado: ChamadoDoQuadroDoPrazo,
  horario: HorarioDaTi,
  agora: Date,
  dataHora: DataHora,
): QuadroDoPrazo {
  const abertoEm = new Date(chamado.abertoEm);
  const abriu: PedacoDoDetalhe = { texto: `Abriu ${quando(abertoEm, agora, dataHora)}` };
  if (!chamado.relogio) {
    const { texto, marca } = seloDoPrazo(null);
    return {
      prazoDoTipo: null,
      destaque: texto,
      grupo: null,
      marca,
      detalhe: [abriu],
      resposta: null,
    };
  }

  const relogio = chamado.relogio;
  const { modo, resolucao } = relogio.prazo;
  const situacao = situacaoDoPrazo(relogioDaApi(relogio), horario, agora, dataHora.fuso);
  const { texto: destaque, marca } = seloDoPrazo(situacao);
  const comoConta = modo === 'horario' ? 'no horário da TI' : 'em horas corridas';
  const base = {
    prazoDoTipo: `Prazo do tipo, ${textoDoValorDoPrazo(resolucao, modo)}, ${comoConta}`,
    destaque,
    grupo: situacao.grupo,
    marca,
  };

  if (situacao.vencimento === null || relogio.relogioDesde === null) {
    const detalhe: PedacoDoDetalhe[] = [];
    if (chamado.parouEm) {
      detalhe.push({ texto: `Parou ${quando(new Date(chamado.parouEm), agora, dataHora)}` });
    }
    detalhe.push({
      texto:
        situacao.restaS > 0
          ? oQueResta(situacao.restaS)
          : `passou ${duracao(-situacao.restaS)} do prazo`,
      mono: true,
    });
    return { ...base, detalhe, resposta: null };
  }

  const detalhe: PedacoDoDetalhe[] = [abriu];
  // O relógio que ainda não contou nada e voltou a contar fora do horário começa na janela seguinte.
  const desde = new Date(relogio.relogioDesde);
  const comeco = comecoDaContagem(desde, relogio, horario);
  if (relogio.contadoS === 0 && comeco.getTime() > desde.getTime()) {
    const mesmoDia = dataHora.formatarData(comeco) === dataHora.formatarData(desde);
    detalhe.push({
      texto: mesmoDia
        ? `conta das ${dataHora.formatarHora(comeco)}`
        : `conta a partir de ${quandoSemAs(comeco, agora, dataHora)}`,
    });
  }
  const vencido = situacao.vencimento.getTime() <= agora.getTime();
  detalhe.push({
    texto: `${vencido ? 'venceu' : 'vence'} ${quando(situacao.vencimento, agora, dataHora)}`,
    mono: true,
  });

  const pendente = situacao.primeiraResposta;
  const resposta =
    pendente &&
    (pendente.atrasada
      ? {
          texto: `Resposta atrasada desde ${quandoSemAs(pendente.ate, agora, dataHora)}`,
          atrasada: true,
        }
      : { texto: `Responder até ${quandoSemAs(pendente.ate, agora, dataHora)}`, atrasada: false });
  return { ...base, detalhe, resposta };
}
