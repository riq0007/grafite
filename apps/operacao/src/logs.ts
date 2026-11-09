// Os logs de cada serviço pela peça da plataforma (change painel-da-operacao, design, decisão 9),
// para o painel: as últimas linhas e a busca por um texto, sem diferença de maiúsculas. No Windows,
// os arquivos do WinSW na pasta de logs do serviço e, nos PostgreSQL, os da pasta log dos dados; no
// Linux, o docker compose logs do serviço, que junta a saída e os erros em ordem.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import type { Instalacao } from './instalacao.ts';
import { SERVICO_DO_POSTGRES_DA_PRODUCAO, SERVICOS } from './layout.ts';
import { argumentosDoCompose, servicoDoCompose } from './linux/servicos.ts';

export interface LogDoServico {
  /** De onde vêm as linhas: o arquivo no Windows, o serviço do Compose no Linux. */
  origem: string;
  linhas: string[];
}

export interface PedidoDoLog {
  /** Quantas linhas, das últimas. */
  linhas: number;
  /** Só as linhas com o texto. */
  busca?: string;
}

/** As últimas linhas do texto, com a busca. */
function ultimas(texto: string, { linhas, busca }: PedidoDoLog): string[] {
  const procurado = busca?.trim().toLowerCase();
  const todas = texto.split(/\r?\n/).filter((linha) => linha !== '');
  const achadas =
    procurado === undefined || procurado === ''
      ? todas
      : todas.filter((linha) => linha.toLowerCase().includes(procurado));
  return achadas.slice(-linhas);
}

const lerSeExistir = (arquivo: string) => readFile(arquivo, 'utf8').catch(() => null);

/** A pasta dos dados do PostgreSQL da produção, pelo -D do serviço dele. */
async function dadosDaProducao(executar: ExecutarProcesso): Promise<string | null> {
  const { codigo, saida } = await executar('sc.exe', ['qc', SERVICO_DO_POSTGRES_DA_PRODUCAO], {
    env: process.env,
  });
  if (codigo !== 0) return null;
  return /-D\s+"([^"]+)"/.exec(saida)?.[1] ?? null;
}

/** Os arquivos .log de uma pasta, do mais antigo ao mais novo pelo nome, como os do PostgreSQL. */
async function logsDaPasta(pasta: string, pedido: PedidoDoLog): Promise<LogDoServico[]> {
  const nomes = (await readdir(pasta).catch(() => [] as string[]))
    .filter((nome) => nome.endsWith('.log'))
    .sort();
  const logs: LogDoServico[] = [];
  for (const nome of nomes) {
    const texto = await lerSeExistir(join(pasta, nome));
    if (texto !== null) logs.push({ origem: join(pasta, nome), linhas: ultimas(texto, pedido) });
  }
  return logs;
}

export async function logsNoWindows(
  { pastas }: Instalacao,
  id: string,
  pedido: PedidoDoLog,
  executar: ExecutarProcesso,
): Promise<LogDoServico[]> {
  if (id === SERVICOS.postgresDoTeste) return logsDaPasta(join(pastas.bancoDoTeste, 'log'), pedido);
  if (id === SERVICO_DO_POSTGRES_DA_PRODUCAO) {
    const dados = await dadosDaProducao(executar);
    return dados === null ? [] : logsDaPasta(join(dados, 'log'), pedido);
  }
  const pastaDoServico: Record<string, string> = {
    [SERVICOS.producao]: pastas.producao.logs,
    [SERVICOS.teste]: pastas.teste.logs,
    [SERVICOS.coletor]: pastas.producao.logs,
    [SERVICOS.proxy]: join(pastas.caddy, 'logs'),
  };
  const pasta = pastaDoServico[id];
  if (pasta === undefined) throw new Error(`O serviço ${id} não é um serviço do Grafite.`);
  // Os arquivos atuais do WinSW: a saída, os erros e o do próprio WinSW.
  const logs: LogDoServico[] = [];
  for (const arquivo of ['out', 'err', 'wrapper'].map((tipo) => join(pasta, `${id}.${tipo}.log`))) {
    const texto = await lerSeExistir(arquivo);
    if (texto !== null) logs.push({ origem: arquivo, linhas: ultimas(texto, pedido) });
  }
  return logs;
}

/** Quantas linhas o Linux lê para a busca, antes de ficar com as últimas que têm o texto. */
const JANELA_DA_BUSCA = 5000;

export async function logsNoLinux(
  { estado }: Instalacao,
  id: string,
  pedido: PedidoDoLog,
  executar: ExecutarProcesso,
): Promise<LogDoServico[]> {
  const servico = servicoDoCompose(id);
  const cauda = pedido.busca?.trim() ? JANELA_DA_BUSCA : pedido.linhas;
  const { codigo, saida, erro } = await executar(
    'docker',
    [...argumentosDoCompose(estado.raiz), 'logs', '--no-color', '--tail', String(cauda), servico],
    { env: process.env },
  );
  if (codigo !== 0) {
    throw new Error(`Não foi possível ler o log do serviço ${servico}: ${(erro || saida).trim()}`);
  }
  return [{ origem: servico, linhas: ultimas(saida, pedido) }];
}
