// O teste do e-mail pelo comando no servidor (spec operacao-servicos, "E-mail configurado pelo
// comando de operação"; change p3c-email-e-push, design, decisão 10): manda o e-mail de teste pela
// configuração do ambiente, conferida pelas mesmas regras da partida da API, e diz o que o servidor
// de e-mail respondeu. A senha do SMTP nunca aparece: a falha leva só o motivo e o detalhe sem ela.
import { conferirEnderecoDoSmtp, conferirRemetente } from '@grafite/domain';
import { criarCarteiroDeEmail, FalhaDoEmail } from '../canais/email.ts';
import { ErroDoComando } from './erros.ts';

const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/** A variável do ambiente, conferida pela regra dada; sem ela, o comando recusa antes de tentar. */
function daConfiguracao(
  variavel: (nome: string) => string | undefined,
  nome: string,
  falta: string,
  conferir: (valor: string) => string | null,
): string {
  const valor = variavel(nome)?.trim();
  if (!valor) throw new ErroDoComando(2, `${nome}: obrigatório para o teste (${falta}).`);
  const motivo = conferir(valor);
  if (motivo !== null) throw new ErroDoComando(2, `${nome}: ${motivo}.`);
  return valor;
}

export async function testarEmail(
  variavel: (nome: string) => string | undefined,
  para: string,
): Promise<string> {
  const urlSmtp = daConfiguracao(
    variavel,
    'GRAFITE_SMTP_URL',
    'o endereço do SMTP',
    conferirEnderecoDoSmtp,
  );
  const remetente = daConfiguracao(
    variavel,
    'GRAFITE_EMAIL_REMETENTE',
    'o remetente, como Grafite <grafite@empresa.com.br>',
    conferirRemetente,
  );
  if (!EMAIL.test(para)) {
    throw new ErroDoComando(2, 'Use um e-mail em --para, como ti@empresa.com.br.');
  }
  const carteiro = criarCarteiroDeEmail({ urlSmtp, remetente });
  try {
    await carteiro.enviar({
      para,
      assunto: 'Teste do e-mail do Grafite',
      texto:
        'Este é um e-mail de teste do Grafite, mandado pelo comando no servidor. Se ele chegou, o envio de e-mail está configurado.\n',
    });
  } catch (erro) {
    if (!(erro instanceof FalhaDoEmail)) throw erro;
    throw new ErroDoComando(1, erro.detalhe ? `${erro.message} (${erro.detalhe})` : erro.message);
  } finally {
    carteiro.fechar();
  }
  return `O servidor de e-mail aceitou o e-mail de teste para ${para}.`;
}
