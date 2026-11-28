// A porta da ponta a ponta da tela da aba. Cada instância do executor na mesma máquina tem as suas
// portas (change ci-paralelo, design, decisão 1): a da web na `GRAFITE_E2E_PORTA` (4173 sem ela), a
// da pilha na seguinte e o coletor na outra. A da aba vem três depois da da web: 4176 sem a
// variável, e na instância seguinte, 4276.
export function portaDoE2eDaAba(ambiente: Record<string, string | undefined> = process.env) {
  const valor = ambiente.GRAFITE_E2E_PORTA;
  if (valor === undefined || valor === '') return 4176;
  const numero = Number(valor);
  if (!/^\d+$/.test(valor) || numero < 1024 || numero > 65532) {
    throw new Error(
      `GRAFITE_E2E_PORTA precisa ser uma porta entre 1024 e 65532, e veio "${valor}".`,
    );
  }
  return numero + 3;
}
