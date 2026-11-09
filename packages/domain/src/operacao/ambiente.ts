// Os ambientes do Grafite (F2d, design, decisão 1): a configuração diz em qual o processo roda, sem
// padrão, para uma produção mal configurada não se passar por desenvolvimento.

export const AMBIENTES = ['desenvolvimento', 'teste', 'producao'] as const;

export type Ambiente = (typeof AMBIENTES)[number];

export function ambienteConhecido(texto: string): texto is Ambiente {
  return (AMBIENTES as readonly string[]).includes(texto);
}
