// A cópia das preferências no navegador (design do F2c, decisão 4). A versão 2 guarda a conta, as
// camadas que o servidor deu por último e as mudanças ainda não gravadas, para a primeira pintura e
// para quando o servidor não responde. Os atributos já calculados vão numa chave à parte, que o
// script anti-flash do index.html copia para o <html>.
import {
  type AjustesDasPreferencias,
  lerAjustes,
  type MudancaDasPreferencias,
  PADRAO_DE_FABRICA,
  type PreferenciasDaInterface,
} from '@grafite/domain';
import { lerPreferencias } from './preferencias.ts';

const CHAVE = 'grafite.preferencias';
/** Aparência salva pelo F0: lida só enquanto não há a cópia das preferências. */
const CHAVE_DO_F0 = 'grafite.aparencia';
/** Atributos já calculados: o script anti-flash (index.html) só os copia para o <html>. */
const CHAVE_ATRIBUTOS = 'grafite.preferencias.atributos';

export interface CopiaDasPreferencias {
  /** A conta da camada e das mudanças; `null` sem a sessão que vale. */
  contaId: string | null;
  organizacao: AjustesDasPreferencias;
  /** A camada da conta; `null` sem a sessão que vale, e então só os padrões valem. */
  conta: AjustesDasPreferencias | null;
  /** As mudanças ainda não gravadas na conta. */
  pendentes: MudancaDasPreferencias;
}

const SEM_COPIA: CopiaDasPreferencias = {
  contaId: null,
  organizacao: {},
  conta: {},
  pendentes: {},
};

type Bruto = Record<string, unknown>;

const objeto = (valor: unknown): Bruto | null =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Bruto) : null;

/**
 * As mudanças guardadas, campo a campo: o valor válido fica (o número fora do intervalo, preso ao
 * limite), o `null`, que tira o ajuste da conta, também, e o resto sai.
 */
export function lerMudanca(bruto: unknown): MudancaDasPreferencias {
  const lida: Record<string, Bruto> = {};
  for (const [secao, campos] of Object.entries(objeto(bruto) ?? {})) {
    const conhecidos = objeto(PADRAO_DE_FABRICA[secao as keyof typeof PADRAO_DE_FABRICA]);
    const salvos = objeto(campos);
    if (!conhecidos || !salvos) continue;
    const validos: Bruto = {};
    for (const [campo, valor] of Object.entries(salvos)) {
      if (!(campo in conhecidos)) continue;
      const lido =
        valor === null
          ? null
          : (lerAjustes({ [secao]: { [campo]: valor } }) as Record<string, Bruto | undefined>)[
              secao
            ]?.[campo];
      if (lido !== undefined) validos[campo] = lido;
    }
    if (Object.keys(validos).length > 0) lida[secao] = validos;
  }
  return lida as MudancaDasPreferencias;
}

/** Os ajustes que diferem dos padrões de fábrica, como mudanças. */
function diferencasDaFabrica(preferencias: PreferenciasDaInterface): MudancaDasPreferencias {
  const diferencas: Record<string, Bruto> = {};
  for (const [secao, campos] of Object.entries(preferencias) as Array<[string, Bruto]>) {
    const fabrica = PADRAO_DE_FABRICA[secao as keyof PreferenciasDaInterface] as Bruto;
    for (const [campo, valor] of Object.entries(campos)) {
      if (JSON.stringify(valor) === JSON.stringify(fabrica[campo])) continue;
      diferencas[secao] = { ...diferencas[secao], [campo]: valor };
    }
  }
  return diferencas as MudancaDasPreferencias;
}

/**
 * Lê a cópia. A da versão 1, ou a aparência do F0 sem ela, guardava as preferências que valiam
 * neste navegador: os ajustes que diferem da fábrica viram mudanças sem conta, que valem até o
 * servidor responder e passam para a primeira conta que entrar sem preferências (a passagem).
 */
export function lerCopia(): CopiaDasPreferencias {
  try {
    const texto = localStorage.getItem(CHAVE);
    let salva: Bruto | null = null;
    try {
      salva = objeto(JSON.parse(texto ?? 'null'));
    } catch {
      // Texto que não é JSON: uma cópia antiga, mas vazia.
    }
    if (salva?.versao === 2) {
      return {
        contaId: typeof salva.contaId === 'string' ? salva.contaId : null,
        organizacao: lerAjustes(salva.organizacao),
        conta: salva.conta === null ? null : lerAjustes(salva.conta),
        pendentes: lerMudanca(salva.pendentes),
      };
    }
    const doF0 = localStorage.getItem(CHAVE_DO_F0);
    if (texto === null && doF0 === null) return SEM_COPIA;
    return { ...SEM_COPIA, pendentes: diferencasDaFabrica(lerPreferencias(texto, doF0)) };
  } catch {
    // Armazenamento bloqueado: as preferências começam dos padrões.
    return SEM_COPIA;
  }
}

/** Grava a cópia e os atributos do anti-flash; com o armazenamento bloqueado, não grava nada. */
export function gravarCopia(copia: CopiaDasPreferencias, atributos: Record<string, string>): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ versao: 2, ...copia }));
    localStorage.setItem(CHAVE_ATRIBUTOS, JSON.stringify(atributos));
  } catch {
    // Navegação privada ou armazenamento bloqueado: as preferências valem só nesta página.
  }
}
