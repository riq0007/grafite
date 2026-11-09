// As portas das pontas a ponta (change ci-paralelo, design, decisão 1). Cada instância do executor
// na mesma máquina recebe as suas pelo .env da pasta dela; sem a variável, valem as de sempre.

type Ambiente = Record<string, string | undefined>;

function porta(ambiente: Ambiente, variavel: string, padrao: number): number {
  const valor = ambiente[variavel];
  if (valor === undefined || valor === '') return padrao;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < 1024 || numero > 65535) {
    throw new Error(`${variavel} precisa ser uma porta entre 1024 e 65535, e veio "${valor}".`);
  }
  return numero;
}

/** A porta em que a ponta a ponta da web serve a web compilada. */
export const portaDoE2e = (ambiente: Ambiente = process.env) =>
  porta(ambiente, 'GRAFITE_E2E_PORTA', 4173);

/** A porta da API na ponta a ponta da pilha; o coletor usa a seguinte. */
export const portaDaPilha = (ambiente: Ambiente = process.env) =>
  porta(ambiente, 'GRAFITE_PILHA_PORTA', 4174);
