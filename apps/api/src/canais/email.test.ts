// O carteiro do e-mail (spec notificacoes, "E-mail do crítico na hora" e "Teste dos canais"; change
// p3c-email-e-push, design, decisões 1 e 6), com um servidor SMTP de verdade, em processo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { servidorDeEmail } from '../../test/canais.ts';
import { criarCarteiroDeEmail, FalhaDoEmail } from './email.ts';

const SENHA = ['S3nh4', 'do', 'smtp'].join('-');
const REMETENTE = 'Grafite <grafite@empresa.com.br>';
let smtp: Awaited<ReturnType<typeof servidorDeEmail>>;

beforeAll(async () => {
  smtp = await servidorDeEmail({ senha: SENHA });
});

afterAll(async () => {
  await smtp.fechar();
});

describe('carteiro do e-mail', () => {
  it('manda o e-mail em texto, com o remetente, o assunto e o Auto-Submitted', async () => {
    const carteiro = criarCarteiroDeEmail({ urlSmtp: smtp.url(), remetente: REMETENTE });
    await carteiro.enviar({
      para: 'ana.souza@empresa.com.br',
      assunto: 'Crítico: Black Toner Cartridge em 8%',
      texto: 'Black Toner Cartridge em 8%\nHP LaserJet M404 · PAT-00412\n',
    });
    carteiro.fechar();
    const [mensagem] = smtp.mensagens.slice(-1);
    expect(mensagem?.from?.value).toEqual([{ name: 'Grafite', address: 'grafite@empresa.com.br' }]);
    expect(mensagem?.to && 'text' in mensagem.to ? mensagem.to.text : '').toBe(
      'ana.souza@empresa.com.br',
    );
    expect(mensagem?.subject).toBe('Crítico: Black Toner Cartridge em 8%');
    expect(mensagem?.text).toBe('Black Toner Cartridge em 8%\nHP LaserJet M404 · PAT-00412\n');
    expect(mensagem?.html).toBe(false);
    expect(mensagem?.headers.get('auto-submitted')).toBe('auto-generated');
  });

  it('a autenticação recusada vira a falha com o motivo, sem a senha', async () => {
    const outra = ['outra', 'senha'].join('-');
    const carteiro = criarCarteiroDeEmail({ urlSmtp: smtp.url(outra), remetente: REMETENTE });
    const falha = await carteiro
      .enviar({ para: 'ana.souza@empresa.com.br', assunto: 'Teste', texto: 'Teste' })
      .catch((erro: unknown) => erro);
    carteiro.fechar();
    expect(falha).toBeInstanceOf(FalhaDoEmail);
    expect((falha as FalhaDoEmail).message).toBe('O servidor de e-mail recusou a autenticação.');
    expect(JSON.stringify(falha)).not.toContain(outra);
  });

  it('o servidor fora do ar vira a falha de quem não respondeu', async () => {
    const fechado = await servidorDeEmail({ senha: SENHA });
    const url = fechado.url();
    await fechado.fechar();
    const carteiro = criarCarteiroDeEmail({ urlSmtp: url, remetente: REMETENTE });
    const falha = await carteiro
      .enviar({ para: 'ana.souza@empresa.com.br', assunto: 'Teste', texto: 'Teste' })
      .catch((erro: unknown) => erro);
    carteiro.fechar();
    expect(falha).toBeInstanceOf(FalhaDoEmail);
    expect((falha as FalhaDoEmail).message).toBe('O servidor de e-mail não respondeu.');
  });
});
