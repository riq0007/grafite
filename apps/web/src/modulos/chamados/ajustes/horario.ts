// O que a tela do horário da TI decide sem a API (spec modulo-chamados, "Respostas prontas e
// horário da TI na tela"; change chamados-da-ti, design, "O horário da TI (tarefa 5.26)"): o
// horário escrito numa frase, o que mudou, as recusas da spec antes de mandar, pelo `conferirHorario`
// do domínio, e as que ainda valem.
import type { components } from '@grafite/api-client';
import { conferirHorario, type DiaDaSemana, type HorarioDaTi } from '@grafite/domain';

/** O horário como a tela o escreve: as horas apagadas ficam nulas, e a carga é o texto da frase. */
export interface EdicaoDoHorario {
  dias: DiaDaSemana[];
  /** O início em minutos do dia, de 0 (00:00) a 1.439 (23:59), ou `null` com a hora apagada. */
  inicio: number | null;
  fim: number | null;
  fuso: string;
  /** Os algarismos do número na frase da carga. */
  cargaCheia: string;
}

export type PedidoDoHorario = components['schemas']['PedidoDoHorarioDaTi'];

export type CampoDoHorario = 'dias' | 'inicio' | 'fim' | 'fuso' | 'cargaCheia';
export type ErrosDoHorario = Partial<Record<CampoDoHorario, string>>;

const CAMPOS_DO_HORARIO: readonly CampoDoHorario[] = [
  'dias',
  'inicio',
  'fim',
  'fuso',
  'cargaCheia',
];

/** Os dias da semana na frase, de segunda (1) a domingo (7), como o domínio os numera. */
const NOMES_DOS_DIAS: Readonly<Record<DiaDaSemana, string>> = {
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
  7: 'domingo',
};

const comMaiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** As caixas dos dias, na ordem da semana: "Segunda" a "Domingo". */
export const DIAS_PARA_MARCAR = (Object.keys(NOMES_DOS_DIAS) as `${DiaDaSemana}`[]).map((chave) => {
  const dia = Number(chave) as DiaDaSemana;
  return { dia, rotulo: comMaiuscula(NOMES_DOS_DIAS[dia]) };
});

/** As partes da frase juntas por vírgula e, a última, por "e". */
function juntar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

/**
 * Os dias do horário numa frase: três ou mais seguidos vão "de segunda a sexta", os outros pelo
 * nome, e os sete são "Todos os dias". Sem dias, não há frase.
 */
export function diasNaFrase(dias: readonly DiaDaSemana[]): string | null {
  const ordem = [...new Set(dias)].sort((a, b) => a - b);
  const [primeiro] = ordem;
  if (primeiro === undefined) return null;
  if (ordem.length === 7) return 'Todos os dias';
  if (ordem.length === 1) return `Só ${primeiro >= 6 ? 'no' : 'na'} ${NOMES_DOS_DIAS[primeiro]}`;
  const partes: string[] = [];
  let seguidos: DiaDaSemana[] = [];
  const fecharSeguidos = () => {
    const [de] = seguidos;
    const ate = seguidos.at(-1);
    if (seguidos.length >= 3 && de !== undefined && ate !== undefined) {
      partes.push(`de ${NOMES_DOS_DIAS[de]} a ${NOMES_DOS_DIAS[ate]}`);
    } else {
      partes.push(...seguidos.map((dia) => NOMES_DOS_DIAS[dia]));
    }
    seguidos = [];
  };
  for (const dia of ordem) {
    const anterior = seguidos.at(-1);
    if (anterior !== undefined && dia !== anterior + 1) fecharSeguidos();
    seguidos.push(dia);
  }
  fecharSeguidos();
  return comMaiuscula(juntar(partes));
}

/** Uma duração em minutos, como "10 h", "9 h 30 min" ou "45 min". */
export function textoDaDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** A hora do minuto do dia, como "08:00". */
export function horaDoMinuto(minutos: number): string {
  const doisAlgarismos = (numero: number) => String(numero).padStart(2, '0');
  return `${doisAlgarismos(Math.floor(minutos / 60))}:${doisAlgarismos(minutos % 60)}`;
}

/**
 * O horário escrito: os dias, as horas e o comprimento do dia útil, que é o dia dos prazos em dias
 * úteis, como "De segunda a sexta, das 08:00 às 18:00. Cada dia útil tem 10 h.". A 01:00 vai no
 * singular, como se lê "uma hora". Sem dias, com uma hora apagada ou com o fim antes do início, não
 * há frase.
 */
export function fraseDoHorario({
  dias,
  inicio,
  fim,
}: Pick<EdicaoDoHorario, 'dias' | 'inicio' | 'fim'>): string | null {
  const quando = diasNaFrase(dias);
  if (quando === null || inicio === null || fim === null || fim <= inicio) return null;
  const uma = (minutos: number) => Math.floor(minutos / 60) === 1;
  const de = uma(inicio) ? 'da' : 'das';
  const ate = uma(fim) ? 'à' : 'às';
  return `${quando}, ${de} ${horaDoMinuto(inicio)} ${ate} ${horaDoMinuto(fim)}. Cada dia útil tem ${textoDaDuracao(fim - inicio)}.`;
}

/** A edição que começa no horário gravado, com a carga em texto, para o número na frase. */
export function edicaoDoHorario(horario: HorarioDaTi): EdicaoDoHorario {
  return {
    dias: [...horario.dias],
    inicio: horario.inicio,
    fim: horario.fim,
    fuso: horario.fuso,
    cargaCheia: String(horario.cargaCheia),
  };
}

const mesmosDias = (uns: readonly DiaDaSemana[], outros: readonly DiaDaSemana[]) => {
  const conjunto = new Set(uns);
  const deOutros = new Set(outros);
  return conjunto.size === deOutros.size && [...conjunto].every((dia) => deOutros.has(dia));
};

/** O que mudou do horário gravado: os dias como conjunto, e a carga pelo número. */
export function mudouOHorario(edicao: EdicaoDoHorario, horario: HorarioDaTi): boolean {
  const carga = edicao.cargaCheia === '' ? null : Number(edicao.cargaCheia);
  return (
    !mesmosDias(edicao.dias, horario.dias) ||
    edicao.inicio !== horario.inicio ||
    edicao.fim !== horario.fim ||
    edicao.fuso !== horario.fuso ||
    carga !== horario.cargaCheia
  );
}

/**
 * As recusas da spec antes de mandar, pelo `conferirHorario` do domínio, como a API confere. A
 * hora apagada não vai à API, que só aceita os minutos: o campo pede a hora, e o fim só se confere
 * com as duas.
 */
export function conferirEdicao(
  edicao: EdicaoDoHorario,
): { ok: true; pedido: PedidoDoHorario } | { ok: false; erros: ErrosDoHorario } {
  const conferido = conferirHorario({
    dias: edicao.dias,
    inicio: edicao.inicio ?? 0,
    fim: edicao.fim ?? 0,
    fuso: edicao.fuso,
    cargaCheia: edicao.cargaCheia === '' ? Number.NaN : Number(edicao.cargaCheia),
  });
  const erros: ErrosDoHorario = conferido.ok ? {} : { ...conferido.erros };
  if (edicao.inicio === null || edicao.fim === null) delete erros.fim;
  if (edicao.inicio === null) erros.inicio = 'Escreva a hora.';
  if (edicao.fim === null) erros.fim = 'Escreva a hora.';
  if (!conferido.ok || Object.keys(erros).length > 0) return { ok: false, erros };
  const { horario } = conferido;
  return {
    ok: true,
    pedido: {
      dias: [...horario.dias],
      inicio: horario.inicio,
      fim: horario.fim,
      fuso: horario.fuso,
      cargaCheia: horario.cargaCheia,
    },
  };
}

/** As recusas da API nos campos da tela; o resto a tela mostra no pé, pela frase do pedido. */
export function errosDoHorario(campos: Readonly<Record<string, string>>): ErrosDoHorario {
  const erros: ErrosDoHorario = {};
  for (const campo of CAMPOS_DO_HORARIO) {
    const erro = campos[campo];
    if (erro) erros[campo] = erro;
  }
  return erros;
}

/**
 * As recusas que ainda valem: cada uma, enquanto o campo dela não muda; a do fim, também enquanto o
 * início não muda, porque ela compara os dois.
 */
export function recusasQueValem(
  erros: ErrosDoHorario,
  naRecusa: EdicaoDoHorario,
  agora: EdicaoDoHorario,
): ErrosDoHorario {
  const valem: ErrosDoHorario = {};
  if (erros.dias && mesmosDias(naRecusa.dias, agora.dias)) valem.dias = erros.dias;
  if (erros.inicio && naRecusa.inicio === agora.inicio) valem.inicio = erros.inicio;
  if (erros.fim && naRecusa.fim === agora.fim && naRecusa.inicio === agora.inicio) {
    valem.fim = erros.fim;
  }
  if (erros.fuso && naRecusa.fuso === agora.fuso) valem.fuso = erros.fuso;
  if (erros.cargaCheia && naRecusa.cargaCheia === agora.cargaCheia) {
    valem.cargaCheia = erros.cargaCheia;
  }
  return valem;
}
