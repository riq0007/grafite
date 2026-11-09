/**
 * Uma falha do comando no servidor, com o código de saída: 2 para um uso errado (opção ausente ou
 * inválida) e 1 para uma recusa ao executar (como um endereço já em uso).
 */
export class ErroDoComando extends Error {
  readonly codigoDeSaida: 1 | 2;

  constructor(codigoDeSaida: 1 | 2, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDoComando';
    this.codigoDeSaida = codigoDeSaida;
  }
}
