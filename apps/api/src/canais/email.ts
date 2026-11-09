// O carteiro do e-mail (spec notificacoes, "E-mail do crítico na hora" e "Teste dos canais"; change
// p3c-email-e-push, design, decisões 1 e 6): manda um e-mail em texto pelo SMTP da configuração,
// com o cabeçalho que segura as respostas automáticas. A falha vira a `FalhaDoEmail`, com o motivo
// em pt-BR para a tela e o detalhe do servidor para o log, sem a senha que o endereço do SMTP leva.
import { createTransport } from 'nodemailer';
import type { ConfiguracaoDoEmail } from '../config.ts';

export interface EmailParaEnviar {
  para: string;
  assunto: string;
  texto: string;
}

export interface CarteiroDeEmail {
  enviar(email: EmailParaEnviar): Promise<void>;
  /** Fecha as conexões abertas com o SMTP. */
  fechar(): void;
}

export class FalhaDoEmail extends Error {
  /** O que o servidor de e-mail disse, sem a senha, para o log. */
  readonly detalhe: string;

  constructor(mensagem: string, detalhe: string) {
    super(mensagem);
    this.name = 'FalhaDoEmail';
    this.detalhe = detalhe;
  }
}

/** Os erros do nodemailer de quem não chegou a responder. */
const SEM_RESPOSTA = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS']);

function falhaDe(erro: unknown, senha: string): FalhaDoEmail {
  const { code, response, message } = erro as {
    code?: string;
    response?: string;
    message?: string;
  };
  const bruto = response ?? message ?? '';
  const detalhe = senha === '' ? bruto : bruto.replaceAll(senha, '***');
  if (code === 'EAUTH') {
    return new FalhaDoEmail('O servidor de e-mail recusou a autenticação.', detalhe);
  }
  if (code !== undefined && SEM_RESPOSTA.has(code)) {
    return new FalhaDoEmail('O servidor de e-mail não respondeu.', detalhe);
  }
  return new FalhaDoEmail('O servidor de e-mail recusou o envio.', detalhe);
}

export function criarCarteiroDeEmail(
  { urlSmtp, remetente }: ConfiguracaoDoEmail,
  { tempoLimite = 15_000 }: { tempoLimite?: number } = {},
): CarteiroDeEmail {
  const senha = decodeURIComponent(new URL(urlSmtp).password);
  const transporte = createTransport({
    url: urlSmtp,
    connectionTimeout: tempoLimite,
    greetingTimeout: tempoLimite,
    socketTimeout: tempoLimite,
  });
  return {
    async enviar({ para, assunto, texto }) {
      try {
        await transporte.sendMail({
          from: remetente,
          to: para,
          subject: assunto,
          text: texto,
          headers: { 'Auto-Submitted': 'auto-generated' },
        });
      } catch (erro) {
        throw falhaDe(erro, senha);
      }
    },
    fechar: () => transporte.close(),
  };
}
