// O prazo da confiança nos aparelhos (spec verificacao-em-dois-passos, "Prazo da confiança"; change
// aparelho-confiavel, design, decisão 4): o número de dias em que um aparelho marcado dispensa o
// código do app, contados da marcação. O prazo da conta vence; sem ele, o menor dos perfis em vigor;
// sem nenhum, o da organização, que é 30 dias de fábrica. O prazo é lido a cada entrada, e o uso
// do aparelho não o renova.

export const PRAZO_DA_CONFIANCA = { minimo: 0, maximo: 90, deFabrica: 30 } as const;

/** Quantos aparelhos confiáveis uma conta guarda; o seguinte tira o usado há mais tempo. */
export const APARELHOS_POR_CONTA = 10;

export const MENSAGENS_DA_CONFIANCA = {
  prazo: 'Informe um prazo de 0 a 90 dias.',
  propriaConta: 'Use outra conta para mudar o seu prazo.',
} as const;

/** O prazo de um perfil em vigor da conta, que tem um. */
export interface PrazoDoPerfil {
  nome: string;
  dias: number;
}

/** Quem define o prazo que vale: a conta, um perfil ou a organização. */
export type OrigemDoPrazo =
  | { tipo: 'conta' }
  | { tipo: 'perfil'; nome: string }
  | { tipo: 'organizacao' };

export interface PrazoDaConfianca {
  dias: number;
  origem: OrigemDoPrazo;
}

const DIA = 24 * 60 * 60 * 1000;

/**
 * O prazo que vale para a conta: o dela, quando tem um; sem ele, o menor dos perfis em vigor, com
 * o empate pelo nome; sem nenhum, o da organização, ou o de fábrica.
 */
export function prazoDaConfianca({
  conta,
  perfis,
  organizacao,
}: {
  conta: number | null;
  perfis: readonly PrazoDoPerfil[];
  organizacao: number | null;
}): PrazoDaConfianca {
  if (conta !== null) return { dias: conta, origem: { tipo: 'conta' } };
  const [menor] = [...perfis].sort(
    (a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
  if (menor) return { dias: menor.dias, origem: { tipo: 'perfil', nome: menor.nome } };
  return { dias: organizacao ?? PRAZO_DA_CONFIANCA.deFabrica, origem: { tipo: 'organizacao' } };
}

/** O aparelho marcado ainda dispensa o código: a marcação mais o prazo do momento é depois de agora. */
export function aparelhoNoPrazo({
  criadoEm,
  dias,
  agora,
}: {
  criadoEm: Date;
  dias: number;
  agora: Date;
}): boolean {
  return criadoEm.getTime() + dias * DIA > agora.getTime();
}

/** O prazo gravável: os dias inteiros de 0 a 90. */
export function prazoValido(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= PRAZO_DA_CONFIANCA.minimo &&
    valor <= PRAZO_DA_CONFIANCA.maximo
  );
}

/** Os dias em texto, no singular e no plural: "1 dia", "30 dias". */
export const textoDosDias = (dias: number) => `${dias} ${dias === 1 ? 'dia' : 'dias'}`;

/** O prazo e de onde ele vem, como a administração o mostra: "30 dias, pela organização". */
export function textoDoPrazo({ dias, origem }: PrazoDaConfianca): string {
  const quanto = dias === 0 ? 'Em toda entrada' : textoDosDias(dias);
  const quem =
    origem.tipo === 'conta'
      ? 'pela conta'
      : origem.tipo === 'perfil'
        ? `pelo perfil ${origem.nome}`
        : 'pela organização';
  return `${quanto}, ${quem}`;
}
