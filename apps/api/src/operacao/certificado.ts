// A vigilância do certificado HTTPS (spec https-interno; design do F2d, decisão 10): uma tarefa
// diária abre uma conexão TLS com o endereço público do Grafite, lê a validade do certificado que o
// proxy entrega e falha quando faltam menos de 14 dias, porque então a renovação automática parou.
// A falha esgotada aparece em Tarefas, como as outras.
import { isIP } from 'node:net';
import { connect } from 'node:tls';

/** Com menos dias que isto, a renovação devia ter acontecido. */
export const DIAS_DE_AVISO_DO_CERTIFICADO = 14;

const DIA = 24 * 60 * 60 * 1000;

export interface OpcoesDaVigilancia {
  agora?: () => Date;
  /** Quanto esperar pela conexão, em ms. */
  tempoLimite?: number;
}

/**
 * Os dias inteiros até o certificado de `endereco` (`host` ou `host:porta`, 443 por padrão) vencer,
 * negativos se já venceu. Só lê a validade: a cadeia não é conferida, porque a AC interna pode não
 * estar entre as que o Node conhece, e nada é enviado pela conexão.
 */
export function diasDeValidade(
  endereco: string,
  { agora = () => new Date(), tempoLimite = 10_000 }: OpcoesDaVigilancia = {},
): Promise<number> {
  const [host = '', porta = '443'] = endereco.split(':');
  return new Promise((resolver, recusar) => {
    const falhar = (motivo: string) => {
      conexao.destroy();
      recusar(new Error(`Não foi possível conferir o certificado de ${endereco}: ${motivo}`));
    };
    const conexao = connect({
      host,
      port: Number(porta),
      servername: isIP(host) === 0 ? host : undefined,
      rejectUnauthorized: false,
      timeout: tempoLimite,
    });
    conexao.once('secureConnect', () => {
      const { valid_to: validoAte } = conexao.getPeerCertificate();
      conexao.end();
      const vence = Date.parse(validoAte ?? '');
      if (Number.isNaN(vence)) {
        recusar(new Error(`Não foi possível conferir o certificado de ${endereco}: sem validade.`));
        return;
      }
      resolver(Math.floor((vence - agora().getTime()) / DIA));
    });
    conexao.once('timeout', () => falhar(`não respondeu em ${Math.round(tempoLimite / 1000)} s.`));
    conexao.once('error', (erro) => falhar(erro.message));
  });
}

/** Confere o certificado e falha quando a renovação devia ter acontecido; devolve os dias que faltam. */
export async function vigiarCertificado(
  endereco: string,
  opcoes: OpcoesDaVigilancia = {},
): Promise<number> {
  const dias = await diasDeValidade(endereco, opcoes);
  if (dias < 0) {
    throw new Error(
      `O certificado de ${endereco} venceu há ${-dias} dias, e a renovação não aconteceu.`,
    );
  }
  if (dias < DIAS_DE_AVISO_DO_CERTIFICADO) {
    throw new Error(
      `O certificado de ${endereco} vence em ${dias} dias, e a renovação não aconteceu.`,
    );
  }
  return dias;
}
