// O comando gravar-control-id (change p2c-saude-do-control-id, design, decisão 5): lê um controle de
// acesso de verdade, pela mesma sondagem do coletor, e grava a resposta das informações do sistema,
// sem a sessão, no formato das gravações do simulador. Assim, as gravações reais entram no lugar das
// montadas quando houver acesso aos controles. A senha vem pela variável GRAFITE_SENHA_DO_CONTROLE,
// para não ficar no histórico do terminal, e não vai à gravação.
// Uso: GRAFITE_SENHA_DO_CONTROLE=<senha> pnpm --filter @grafite/collector gravar-control-id --
//        --ip <ip> --usuario <usuário> --saida <arquivo> [--porta <porta>]
// A saída relativa fica na pasta do coletor, onde o pnpm roda o comando.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { lerInformacoesDoControle, type OpcoesDaSondagem } from '../src/control-id.ts';

const USO =
  'Uso: GRAFITE_SENHA_DO_CONTROLE=<senha> pnpm --filter @grafite/collector gravar-control-id -- --ip <ip> --usuario <usuário> --saida <arquivo> [--porta <porta>]';

/** Lê o controle e devolve a gravação; rejeita quando ele não responde como um Control iD. */
export async function gravarControle({
  momento = new Date(),
  ...opcoes
}: OpcoesDaSondagem & { momento?: Date }): Promise<string> {
  const lida = await lerInformacoesDoControle(opcoes);
  switch (lida.situacao) {
    case 'sem-resposta':
      throw new Error('O controle não respondeu. Confira o IP e a porta.');
    case 'login-recusado':
      throw new Error(
        'O controle recusou o login. Confira o usuário e a senha em GRAFITE_SENHA_DO_CONTROLE.',
      );
    case 'resposta-inesperada': {
      const etapa = lida.etapa === 'login' ? 'login' : 'informações do sistema';
      const codigo = lida.codigo === null ? '' : `: HTTP ${lida.codigo}`;
      throw new Error(`O endereço respondeu, mas não como um Control iD (${etapa}${codigo}).`);
    }
    case 'respondendo': {
      // A sessão nunca vai à gravação, mesmo que um modelo a devolva nas informações.
      const { session: _sessao, ...informacoes } = lida.informacoes;
      const dia = momento.toISOString().slice(0, 10);
      const gravacao = {
        _origem: `Gravada de um controle pelo comando gravar-control-id, em ${dia}.`,
        ...informacoes,
      };
      return `${JSON.stringify(gravacao, null, 2)}\n`;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // O pnpm passa o `--` adiante.
  const argumentos = process.argv.slice(2);
  if (argumentos[0] === '--') argumentos.shift();
  const { values } = parseArgs({
    args: argumentos,
    options: {
      ip: { type: 'string' },
      usuario: { type: 'string' },
      saida: { type: 'string' },
      porta: { type: 'string', default: '80' },
    },
  });
  const senha = process.env.GRAFITE_SENHA_DO_CONTROLE ?? '';
  const porta = Number(values.porta);
  if (
    !values.ip ||
    !values.usuario ||
    !values.saida ||
    senha === '' ||
    !Number.isInteger(porta) ||
    porta < 1 ||
    porta > 65535
  ) {
    console.error(USO);
    process.exit(2);
  }
  try {
    const texto = await gravarControle({
      ip: values.ip,
      porta,
      usuario: values.usuario,
      senha,
    });
    const saida = resolve(values.saida);
    await writeFile(saida, texto);
    console.log(`Gravação do controle em ${saida}.`);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  }
}
