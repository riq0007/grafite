// O e-mail da produção pelo comando de operação (spec operacao-servicos, "E-mail configurado pelo
// comando de operação"; change p3c-email-e-push, design, decisão 10), sobre uma instalação da 0.4.0
// no servidor simulado.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { instalacaoDeExemplo } from '../test/instalacao-de-exemplo.ts';
import { lerConfigEnv } from './configuracao.ts';
import { configurarEmail, type DependenciasDoEmail, testarEmail } from './email.ts';
import { plataformaDoWindows } from './windows/plataforma.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-email-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

type Instalacao = Awaited<ReturnType<typeof instalacaoDeExemplo>>;

function dependencias(
  { raiz, servidor }: Instalacao,
  console = consoleRoteirizado().console,
): DependenciasDoEmail {
  return {
    raiz,
    console,
    executar: servidor.executar,
    servicos: servidor.servicos,
    saude: servidor.saude,
    plataforma: plataformaDoWindows({
      executar: servidor.executar,
      node: servidor.node,
      juncoes: servidor.juncoes,
      ferramentas: servidor.ferramentas,
      atalhoDoMenu: servidor.atalhoDoMenu,
    }),
  };
}

const SENHA = ['S3nh4', 'do', 'smtp'].join('-');
const REMETENTE = 'Grafite <grafite@empresa.com.br>';

describe('grafite email configurar', () => {
  it('pede a senha sem eco, grava o SMTP e o remetente só na produção e reinicia o app com saúde', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const testeAntes = await lerConfigEnv(instalacao.pastas.teste.configEnv);
    const roteiro = consoleRoteirizado(SENHA);
    await configurarEmail(dependencias(instalacao, roteiro.console), {
      smtp: 'smtp://grafite@smtp.empresa.com.br:587',
      remetente: REMETENTE,
    });

    expect(roteiro.perguntas).toEqual(['Senha do SMTP']);
    const producao = await lerConfigEnv(instalacao.pastas.producao.configEnv);
    expect(producao.GRAFITE_EMAIL_REMETENTE).toBe(REMETENTE);
    const smtp = new URL(producao.GRAFITE_SMTP_URL ?? '');
    expect([smtp.protocol, smtp.username, decodeURIComponent(smtp.password), smtp.host]).toEqual([
      'smtp:',
      'grafite',
      SENHA,
      'smtp.empresa.com.br:587',
    ]);
    expect(await lerConfigEnv(instalacao.pastas.teste.configEnv)).toEqual(testeAntes);
    expect(instalacao.servidor.eventos).toEqual([
      'acl producao/config.env',
      'parar grafite-coletor',
      'parar grafite',
      'iniciar grafite',
      'saúde 3000',
      'iniciar grafite-coletor',
    ]);
    expect(roteiro.escritos).toEqual([
      'O e-mail da produção está configurado, e o app reiniciou com saúde. Confira o envio com grafite email testar --para <e-mail>.',
    ]);
    expect(roteiro.escritos.join('\n')).not.toContain(SENHA);
    expect(instalacao.servidor.argumentos.flat().join(' ')).not.toContain(SENHA);
  });

  it('o endereço que já traz a senha não pergunta de novo', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const roteiro = consoleRoteirizado();
    const comSenha = new URL('smtps://smtp.empresa.com.br:465');
    comSenha.username = 'grafite';
    comSenha.password = SENHA;
    await configurarEmail(dependencias(instalacao, roteiro.console), {
      smtp: comSenha.href,
      remetente: REMETENTE,
    });
    expect(roteiro.perguntas).toEqual([]);
    expect((await lerConfigEnv(instalacao.pastas.producao.configEnv)).GRAFITE_SMTP_URL).toBe(
      comSenha.href,
    );
  });

  it.each([
    [
      { smtp: 'http://smtp.empresa.com.br', remetente: REMETENTE },
      '--smtp: deve começar com smtp:// ou smtps://, como smtp://usuario:senha@smtp.empresa.com.br:587.',
    ],
    [
      { smtp: 'smtp://smtp.empresa.com.br:587', remetente: 'Grafite' },
      '--remetente: deve ter o nome e o e-mail, como Grafite <grafite@empresa.com.br>.',
    ],
  ])('recusa o que está fora do formato antes de gravar', async (pedido, motivo) => {
    const instalacao = await instalacaoDeExemplo(pasta);
    const antes = await lerConfigEnv(instalacao.pastas.producao.configEnv);
    await expect(configurarEmail(dependencias(instalacao), pedido)).rejects.toThrow(motivo);
    expect(await lerConfigEnv(instalacao.pastas.producao.configEnv)).toEqual(antes);
    expect(instalacao.servidor.eventos).toEqual([]);
  });
});

describe('grafite email testar', () => {
  it('manda o e-mail de teste pelo comando da API da produção e diz o que o servidor respondeu', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await configurarEmail(dependencias(instalacao, consoleRoteirizado(SENHA).console), {
      smtp: 'smtp://grafite@smtp.empresa.com.br:587',
      remetente: REMETENTE,
    });
    instalacao.servidor.eventos.length = 0;
    const roteiro = consoleRoteirizado();
    await testarEmail(dependencias(instalacao, roteiro.console), 'ti@empresa.com.br');
    expect(instalacao.servidor.eventos).toEqual([
      'api grafite email testar --para ti@empresa.com.br',
    ]);
    expect(roteiro.escritos).toEqual([
      'O servidor de e-mail aceitou o e-mail de teste para ti@empresa.com.br.',
    ]);
  });

  it('a recusa do SMTP sai com o motivo, sem a senha', async () => {
    const instalacao = await instalacaoDeExemplo(pasta);
    await configurarEmail(dependencias(instalacao, consoleRoteirizado('senha-errada').console), {
      smtp: 'smtp://grafite@smtp.empresa.com.br:587',
      remetente: REMETENTE,
    });
    const falha = await testarEmail(dependencias(instalacao), 'ti@empresa.com.br').catch(
      (erro: Error) => erro,
    );
    expect((falha as Error).message).toBe(
      'O servidor de e-mail recusou a autenticação. (535 Authentication failed)',
    );
    expect((falha as Error).message).not.toContain('senha-errada');
  });
});
