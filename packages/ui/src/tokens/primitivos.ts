// Camada 1 (referência): as cores fixas, iguais em todos os temas, como o preto sobre branco do
// código QR e da etiqueta impressa. As cores dos temas saem das entradas do gerador (temas.ts e
// destaques.ts; spec mestre, Apêndice A). Nunca vai para o CSS como variável própria.

export const primitivos = {
  branco: '#ffffff',
  preto: '#000000',
} as const;
