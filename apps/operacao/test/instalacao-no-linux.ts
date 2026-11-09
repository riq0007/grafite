// Uma instalação no servidor Linux simulado, feita pelo próprio `instalarNoLinux`, para os testes dos
// comandos de depois da instalação (change servidor-linux-com-docker). Os pacotes das versões ficam
// numa pasta de fora da instalação, com o hash ao lado, e o servidor conhece todos.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { instalarNoLinux } from '../src/linux/instalar.ts';
import { consoleRoteirizado } from './console-roteirizado.ts';
import { type FalhasDoServidorLinux, servidorLinuxSimulado } from './servidor-linux-simulado.ts';

/** O tar de exemplo da versão, com o hash ao lado. */
export async function pacoteDoLinux(pasta: string, versao: string): Promise<string> {
  const arquivo = join(pasta, `grafite-${versao}-linux-x64.tar`);
  await writeFile(arquivo, `o tar da ${versao}`);
  const hash = createHash('sha256').update(`o tar da ${versao}`).digest('hex');
  await writeFile(`${arquivo}.sha256`, `${hash}  grafite-${versao}-linux-x64.tar\n`);
  return arquivo;
}

/**
 * A instalação da primeira versão no servidor simulado, com o modo interno e a AC do Caddy, e os
 * pacotes de todas as versões ao lado. Os eventos da instalação são limpos.
 */
export async function instalacaoNoLinuxDeExemplo({
  raiz,
  fora,
  versoes = ['1.4.0', '1.5.0'],
  ...falhas
}: {
  raiz: string;
  /** A pasta dos pacotes e do arquivo de respostas, fora da instalação. */
  fora: string;
  /** As versões dos pacotes; a primeira é a instalada. */
  versoes?: string[];
} & FalhasDoServidorLinux) {
  const pacotes: Record<string, string> = {};
  for (const versao of versoes) pacotes[versao] = await pacoteDoLinux(fora, versao);
  const servidor = servidorLinuxSimulado({
    raiz,
    enderecos: {
      'grafite.empresa.com.br': 'producao',
      'grafite-teste.empresa.com.br': 'teste',
    },
    pacotes: Object.fromEntries(Object.entries(pacotes).map(([versao, tar]) => [tar, versao])),
    ...falhas,
  });
  const respostas = join(fora, 'respostas.json');
  await writeFile(
    respostas,
    JSON.stringify({
      enderecos: ['grafite.empresa.com.br'],
      mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
      certificado: { modo: 'interno', ac: 'caddy' },
      backup: { destinos: [join(raiz, 'backups')], janela: '01:00-05:00' },
      organizacao: { nome: 'Empresa', pessoa: 'Ana Souza', usuario: 'ana.souza' },
    }),
  );
  let senhas = 0;
  let chaves = 0;
  await instalarNoLinux({
    pacote: pacotes[versoes[0] ?? ''] ?? '',
    arquivoDeRespostas: respostas,
    raiz,
    fuso: 'America/Sao_Paulo',
    console: consoleRoteirizado().console,
    executar: servidor.executar,
    ferramentas: servidor.ferramentas,
    servicos: servidor.servicos,
    saude: servidor.saude,
    permissoes: { dono: async () => {}, modo: async () => {} },
    esperarBanco: { esperar: async () => {}, tentativas: 2 },
    gerarSenha: () => `senha-gerada-${++senhas}`,
    gerarChave: () => Buffer.alloc(32, ++chaves).toString('base64'),
    gerarChavesDoPush: () => ({ publica: 'publica-do-push', privada: 'privada-do-push' }),
  });
  servidor.eventos.length = 0;
  return { servidor, pacotes };
}
