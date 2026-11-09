// O teste do e-mail pelo comando no servidor (spec operacao-servicos, "E-mail configurado pelo
// comando de operação"; change p3c-email-e-push, design, decisão 10): `email testar` manda o
// e-mail de teste pela configuração do ambiente e diz o que o servidor de e-mail respondeu, sem
// mostrar a senha.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { servidorDeEmail } from '../../test/canais.ts';
import { AJUDA, executarComando } from './executar.ts';

const SENHA = ['senha', 'do', 'smtp'].join('-');
let smtp: Awaited<ReturnType<typeof servidorDeEmail>>;

beforeAll(async () => {
  smtp = await servidorDeEmail({ senha: SENHA });
});

afterAll(async () => {
  await smtp.fechar();
});

async function rodar(argumentos: string[], variaveis: Record<string, string>) {
  const saida: string[] = [];
  const erros: string[] = [];
  const codigo = await executarComando(argumentos, {
    banco: () => {
      throw new Error('O teste do e-mail não abre o banco.');
    },
    agora: () => new Date(),
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => erros.push(texto),
    variavel: (nome) => variaveis[nome],
  });
  return { codigo, saida: saida.join('\n'), erros: erros.join('\n') };
}

const configurado = () => ({
  GRAFITE_SMTP_URL: smtp.url(),
  GRAFITE_EMAIL_REMETENTE: 'Grafite <grafite@empresa.com.br>',
});

describe('email testar', () => {
  it('manda o e-mail de teste pela configuração e diz que o servidor aceitou', async () => {
    const r = await rodar(['email', 'testar', '--para', 'ti@empresa.com.br'], configurado());
    expect(r).toMatchObject({ codigo: 0, erros: '' });
    expect(r.saida).toBe('O servidor de e-mail aceitou o e-mail de teste para ti@empresa.com.br.');
    const [email] = smtp.mensagens.slice(-1);
    expect(email?.subject).toBe('Teste do e-mail do Grafite');
    expect(email?.to && 'text' in email.to ? email.to.text : '').toBe('ti@empresa.com.br');
  });

  it('a autenticação recusada sai com o motivo, sem a senha', async () => {
    const outra = ['outra', 'senha'].join('-');
    const r = await rodar(['email', 'testar', '--para', 'ti@empresa.com.br'], {
      ...configurado(),
      GRAFITE_SMTP_URL: smtp.url(outra),
    });
    expect(r.codigo).toBe(1);
    expect(r.erros).toMatch(/^O servidor de e-mail recusou a autenticação\./);
    expect(r.erros).not.toContain(outra);
  });

  it('sem a configuração ou com ela fora do formato, recusa antes de tentar', async () => {
    const semRemetente = await rodar(['email', 'testar', '--para', 'ti@empresa.com.br'], {
      GRAFITE_SMTP_URL: smtp.url(),
    });
    expect(semRemetente.codigo).toBe(2);
    expect(semRemetente.erros).toBe(
      'GRAFITE_EMAIL_REMETENTE: obrigatório para o teste (o remetente, como Grafite <grafite@empresa.com.br>).',
    );
    const foraDoFormato = await rodar(['email', 'testar', '--para', 'ti@empresa.com.br'], {
      ...configurado(),
      GRAFITE_SMTP_URL: 'http://smtp.empresa.com.br',
    });
    expect(foraDoFormato.codigo).toBe(2);
    expect(foraDoFormato.erros).toMatch(/^GRAFITE_SMTP_URL: deve começar com smtp:\/\//);
  });

  it('pede o e-mail de quem recebe o teste', async () => {
    expect((await rodar(['email', 'testar'], configurado())).erros).toBe('Falta a opção --para.');
    expect((await rodar(['email', 'testar', '--para', 'ti'], configurado())).erros).toBe(
      'Use um e-mail em --para, como ti@empresa.com.br.',
    );
  });

  it('está na ajuda', () => {
    expect(AJUDA).toContain('email testar');
  });
});
