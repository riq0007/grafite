import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../test/console-roteirizado.ts';
import { pastasDaInstalacao } from './layout.ts';
import {
  lerArquivoDeRespostas,
  lerRespostasSalvas,
  perguntarRespostas,
  type RespostasDaInstalacao,
  salvarRespostas,
} from './respostas.ts';

let pasta: string;

beforeEach(async () => {
  pasta = await mkdtemp(join(tmpdir(), 'grafite-respostas-'));
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const respostasDe = (raiz: string): RespostasDaInstalacao => ({
  raiz,
  pgBin: join(raiz, 'PostgreSQL', '18', 'bin'),
  enderecos: ['grafite.empresa.com.br', 'grafite.matriz.empresa.com.br'],
  mapaDoTeste: {
    'grafite.empresa.com.br': 'grafite-teste.empresa.com.br',
    'grafite.matriz.empresa.com.br': 'grafite-teste.matriz.empresa.com.br',
  },
  certificado: { modo: 'interno', ac: 'caddy' },
  backup: {
    destinos: [join(raiz, 'backups'), join(pasta, 'nas', 'Backups Grafite')],
    janela: '00:00-06:00',
  },
  organizacao: {
    nome: 'Empresa',
    pessoa: 'Ana Souza',
    usuario: 'ana.souza',
    email: 'ana@empresa.com.br',
  },
});

async function arquivo(conteudo: unknown): Promise<string> {
  const caminho = join(pasta, 'respostas.json');
  await writeFile(caminho, typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo));
  return caminho;
}

describe('lerArquivoDeRespostas', () => {
  it('lê as respostas e os segredos do roteiro, normalizando os endereços e o usuário', async () => {
    const raiz = join(pasta, 'Grafite');
    const esperadas = respostasDe(raiz);
    const caminho = await arquivo({
      ...esperadas,
      enderecos: ['Grafite.Empresa.com.br ', 'grafite.matriz.empresa.com.br'],
      organizacao: { ...esperadas.organizacao, usuario: ' Ana.Souza' },
      senhaDoPostgres: 's3nh4',
    });
    await expect(lerArquivoDeRespostas(caminho)).resolves.toEqual({
      respostas: esperadas,
      senhaDoPostgres: 's3nh4',
      tokenDaCloudflare: undefined,
    });
  });

  it('no modo público, o provedor é a Cloudflare, e o token vem do roteiro', async () => {
    const caminho = await arquivo({
      ...respostasDe(join(pasta, 'Grafite')),
      certificado: { modo: 'publico', email: 'ti@empresa.com.br' },
      tokenDaCloudflare: 'token-da-zona',
    });
    const lido = await lerArquivoDeRespostas(caminho);
    expect(lido.respostas.certificado).toEqual({
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
    });
    expect(lido.tokenDaCloudflare).toBe('token-da-zona');
  });

  it('no modo interno com a AC da empresa, pede os arquivos do certificado e da chave', async () => {
    const certificado = join(pasta, 'grafite.crt');
    const chave = join(pasta, 'grafite.key');
    const caminho = await arquivo({
      ...respostasDe(join(pasta, 'Grafite')),
      certificado: { modo: 'interno', ac: 'empresa', certificado, chave },
    });
    expect((await lerArquivoDeRespostas(caminho)).respostas.certificado).toEqual({
      modo: 'interno',
      ac: 'empresa',
      certificado,
      chave,
    });
  });

  it('recusa o arquivo com cada problema, pelo campo, sem mudar nada', async () => {
    const valido = respostasDe(join(pasta, 'Grafite'));
    const caminho = await arquivo({
      ...valido,
      raiz: 'Grafite',
      enderecos: ['grafite.empresa.com.br', 'grafite.matriz.empresa.com.br', 'com espaço'],
      mapaDoTeste: {
        'grafite.empresa.com.br': 'grafite.matriz.empresa.com.br',
        'outro.empresa.com.br': 'outro-teste.empresa.com.br',
      },
      certificado: { modo: 'interno', ac: 'empresa' },
      backup: { destinos: [], janela: '06:00-00:00' },
      organizacao: { nome: '', pessoa: 'Ana', usuario: 'a' },
    });
    await expect(lerArquivoDeRespostas(caminho)).rejects.toThrow(
      [
        `O arquivo de respostas ${caminho} não é válido:`,
        '  - raiz: deve ser um caminho absoluto, como C:\\Grafite',
        '  - enderecos.2: deve ser um endereço como grafite.empresa.com.br',
        '  - certificado: com a AC da empresa, diga os arquivos do certificado e da chave',
        '  - backup.destinos: diga ao menos um destino',
        '  - backup.janela: o início deve vir antes do fim',
        '  - organizacao.nome: obrigatório',
        '  - organizacao.usuario: Use de 3 a 64 caracteres.',
        '  - mapaDoTeste.grafite.empresa.com.br: o endereço do teste não pode ser um da produção',
        '  - mapaDoTeste.grafite.matriz.empresa.com.br: falta o endereço do teste no lugar dele',
        '  - mapaDoTeste.outro.empresa.com.br: não é um endereço da produção',
      ].join('\n'),
    );
  });

  it('recusa o arquivo que não é JSON ou que não existe', async () => {
    const caminho = await arquivo('{ quebrado');
    await expect(lerArquivoDeRespostas(caminho)).rejects.toThrow(
      `O arquivo de respostas ${caminho} não é um JSON válido.`,
    );
    await expect(lerArquivoDeRespostas(join(pasta, 'falta.json'))).rejects.toThrow(
      `O arquivo de respostas ${join(pasta, 'falta.json')} não existe.`,
    );
  });
});

describe('perguntarRespostas', () => {
  it('pergunta o resto, com os padrões, e sugere o endereço do teste de cada endereço', async () => {
    const raiz = join(pasta, 'Grafite');
    const pgBin = join(raiz, 'PostgreSQL', '18', 'bin');
    const roteiro = consoleRoteirizado(
      'grafite.empresa.com.br, Grafite.Matriz.empresa.com.br',
      '',
      'grafite-teste.matriz.empresa.com.br',
      '',
      '',
      `${join(raiz, 'backups')};${join(pasta, 'nas', 'Backups Grafite')}`,
      '',
      'Empresa',
      'Ana Souza',
      'Ana.Souza',
      'ana@empresa.com.br',
    );
    await expect(perguntarRespostas(roteiro.console, { raiz, pgBin })).resolves.toEqual({
      respostas: respostasDe(raiz),
      tokenDaCloudflare: undefined,
    });
    expect(roteiro.perguntas).toEqual([
      'Endereços de acesso da produção, separados por vírgula (como grafite.empresa.com.br)',
      'Endereço do teste no lugar de grafite.empresa.com.br',
      'Endereço do teste no lugar de grafite.matriz.empresa.com.br',
      "Certificado: publico (Let's Encrypt, com o DNS na Cloudflare) ou interno",
      'AC do certificado interno: caddy (a do próprio proxy) ou empresa (arquivos da AC da empresa)',
      'Destinos do backup, separados por ponto e vírgula',
      'Janela do horário do backup',
      'Nome da organização que opera o servidor',
      'Nome da pessoa da primeira conta',
      'Usuário da primeira conta',
      'E-mail da pessoa (opcional)',
    ]);
    expect(roteiro.sobra()).toBe(0);
  });

  it('no modo público, pede o e-mail e o token sem eco', async () => {
    const raiz = join(pasta, 'Grafite');
    const roteiro = consoleRoteirizado(
      'grafite.empresa.com.br',
      '',
      'publico',
      'ti@empresa.com.br',
      'token-da-zona',
      '',
      '',
      'Empresa',
      'Ana Souza',
      'ana',
      '',
    );
    const { respostas, tokenDaCloudflare } = await perguntarRespostas(roteiro.console, {
      raiz,
      pgBin: raiz,
    });
    expect(respostas.certificado).toEqual({
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
    });
    expect(tokenDaCloudflare).toBe('token-da-zona');
    expect(respostas.backup.destinos).toEqual([join(raiz, 'backups')]);
    expect(respostas.organizacao.email).toBeUndefined();
    expect(roteiro.perguntas).toContain(
      'Token da Cloudflare, com permissão de editar o DNS só da zona',
    );
  });

  it('pergunta de novo a resposta que não serve, com o motivo, e desiste na terceira', async () => {
    const raiz = join(pasta, 'Grafite');
    const roteiro = consoleRoteirizado('com espaço', 'grafite.empresa.com.br');
    await expect(perguntarRespostas(roteiro.console, { raiz, pgBin: raiz })).rejects.toThrow(
      /O roteiro não tem resposta/,
    );
    expect(roteiro.escritos[0]).toBe('deve ser um endereço como grafite.empresa.com.br');
    expect(roteiro.perguntas.slice(0, 2)).toEqual([
      'Endereços de acesso da produção, separados por vírgula (como grafite.empresa.com.br)',
      'Endereços de acesso da produção, separados por vírgula (como grafite.empresa.com.br)',
    ]);

    const teimoso = consoleRoteirizado('x y', 'x y', 'x y');
    await expect(perguntarRespostas(teimoso.console, { raiz, pgBin: raiz })).rejects.toThrow(
      'Endereços de acesso da produção, separados por vírgula (como grafite.empresa.com.br): deve ser um endereço como grafite.empresa.com.br',
    );
  });
});

describe('respostas salvas', () => {
  it('a instalação em andamento guarda as respostas sem segredos, para a retomada', async () => {
    const pastas = pastasDaInstalacao(join(pasta, 'Grafite'));
    await expect(lerRespostasSalvas(pastas)).resolves.toBeNull();
    const respostas = respostasDe(pastas.raiz);
    await salvarRespostas(pastas, respostas);
    await expect(lerRespostasSalvas(pastas)).resolves.toEqual(respostas);
    expect(JSON.parse(await readFile(pastas.instalacao, 'utf8'))).toEqual(respostas);
  });

  it('as respostas salvas que não valem param a retomada com o caminho do arquivo', async () => {
    const pastas = pastasDaInstalacao(pasta);
    await writeFile(pastas.instalacao, '{"raiz": 1}');
    await expect(lerRespostasSalvas(pastas)).rejects.toThrow(
      `As respostas da instalação interrompida, em ${pastas.instalacao}, não são válidas: apague o arquivo para responder de novo.`,
    );
  });
});
