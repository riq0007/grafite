// Uma instalação pronta, para os testes dos comandos que vêm depois dela: o `grafite instalar` da
// versão 0.4.0 de verdade, sobre o servidor simulado, numa pasta temporária. Os eventos da
// instalação são apagados, e o servidor continua com os serviços rodando.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { instalar } from '../src/instalar.ts';
import { pastasDaInstalacao } from '../src/layout.ts';
import { consoleRoteirizado } from './console-roteirizado.ts';
import { type OpcoesDoServidor, pacoteDeExemplo, servidorSimulado } from './servidor-simulado.ts';

export async function instalacaoDeExemplo(pasta: string, opcoes: Partial<OpcoesDoServidor> = {}) {
  const raiz = join(pasta, 'Grafite');
  const pgBin = join(pasta, 'PostgreSQL', '18', 'bin');
  const servidor = servidorSimulado({ raiz, pgBin, ...opcoes });
  const respostas = join(pasta, 'respostas.json');
  await writeFile(
    respostas,
    JSON.stringify({
      raiz,
      plataforma: 'windows',
      pgBin,
      enderecos: ['grafite.empresa.com.br'],
      mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' },
      certificado: { modo: 'interno', ac: 'caddy' },
      backup: { destinos: [join(raiz, 'backups')], janela: '00:00-06:00' },
      organizacao: { nome: 'Empresa', pessoa: 'Ana Souza', usuario: 'ana' },
      senhaDoPostgres: 'senha-do-postgres-da-producao',
    }),
  );
  await instalar({
    zip: await pacoteDeExemplo(pasta, '0.4.0'),
    arquivoDeRespostas: respostas,
    console: consoleRoteirizado().console,
    executar: servidor.executar,
    ferramentas: servidor.ferramentas,
    servicos: () => servidor.servicos,
    juncoes: servidor.juncoes,
    saude: servidor.saude,
    atalhoDoMenu: servidor.atalhoDoMenu,
    node: servidor.node,
    versaoDoNode: '24.19.0',
    gerarSenha: servidor.gerarSenha,
    gerarChave: servidor.gerarChave,
    gerarChavesDoPush: servidor.gerarChavesDoPush,
  });
  servidor.eventos.length = 0;
  servidor.argumentos.length = 0;
  return { raiz, pgBin, servidor, pastas: pastasDaInstalacao(raiz) };
}
