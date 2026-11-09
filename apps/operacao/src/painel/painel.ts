// O comando painel (change painel-da-operacao, design, decisões 1, 2, 4 e 7; spec
// painel-da-operacao): sobe o servidor do painel numa porta livre, com a página do pacote, a sessão
// pelo código de uso único, o estado do servidor, as tarefas pelo mesmo executarComando, uma por vez,
// e as leituras da página, sem os segredos. Abre o navegador da sessão de quem chamou o comando, ou
// só escreve o endereço, e encerra depois do tempo sem uso, nunca com uma tarefa rodando. A janela
// do comando diz para não fechá-la enquanto uma tarefa roda.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupDoServidor } from '../backup.ts';
import { lerConfigEnv } from '../configuracao.ts';
import {
  discoDaPasta,
  type EstadoDoServidor,
  estadoDoServidor,
  vencimentoPeloProxy,
} from '../estado-do-servidor.ts';
import { lerInstalacao } from '../instalacao.ts';
import { servicosDaInstalacao } from '../layout.ts';
import type { LogDoServico, PedidoDoLog } from '../logs.ts';
import type { PlataformaDaInstalacao } from '../plataforma.ts';
import type { Servicos } from '../windows/servicos.ts';
import { type CanalDeEventos, type ConsoleDoPainel, canalDeEventos } from './console.ts';
import { abrirServidorDoPainel, lerPagina, type OpcoesDoServidorDoPainel } from './servidor.ts';
import { comSessao, criarSessao } from './sessao.ts';
import {
  type CampoDaTarefa,
  type ExecutorDeTarefas,
  executorDeTarefas,
  TAREFAS_DO_PAINEL,
} from './tarefas.ts';

/** Quanto tempo sem nenhum pedido da página até o painel encerrar. */
export const SEM_USO_MS = 30 * 60 * 1000;

export interface DependenciasDoPainel {
  raiz: string;
  plataforma: PlataformaDaInstalacao;
  servicos: Servicos;
  backup: BackupDoServidor;
  /** Escreve na janela do comando. */
  escrever(texto: string): void;
  /** Roda o comando da linha de comando pelo console do painel e devolve o código de saída. */
  rodar(
    argumentos: string[],
    console: ConsoleDoPainel,
    escreverErro: (texto: string) => void,
  ): Promise<number>;
  /** Abre o endereço no navegador da sessão de quem chamou o comando; sem ele, só o escreve. */
  abrirNavegador?(endereco: string): Promise<void>;
  /** A pasta da página compilada. */
  pagina: string;
  /** Onde o servidor escuta: 127.0.0.1, ou todas as interfaces do contêiner no Linux. */
  host: string;
  porta?: number;
  semUsoMs?: number;
  /** As pastas onde a página acha os pacotes das versões. */
  pastasDosPacotes: readonly string[];
  agora(): Date;
}

const PACOTE = /^grafite-(\d+\.\d+\.\d+)-(?:windows-x64\.zip|linux-x64\.tar)$/;

/** Os pacotes das versões nas pastas, do mais novo ao mais antigo. */
async function pacotesNasPastas(pastas: readonly string[]) {
  const pacotes: {
    caminho: string;
    nome: string;
    versao: string;
    tamanho: number;
    modificadoEm: string;
  }[] = [];
  for (const pasta of pastas) {
    for (const nome of await readdir(pasta).catch(() => [] as string[])) {
      const versao = PACOTE.exec(nome)?.[1];
      if (versao === undefined) continue;
      const caminho = join(pasta, nome);
      const { size, mtime } = await stat(caminho);
      pacotes.push({ caminho, nome, versao, tamanho: size, modificadoEm: mtime.toISOString() });
    }
  }
  return pacotes.sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm));
}

/** O endereço do SMTP sem a senha. */
function semSenha(smtp: string): string {
  try {
    const endereco = new URL(smtp);
    endereco.password = '';
    return endereco.href;
  } catch {
    return '';
  }
}

/** As configurações que a página mostra: os valores atuais, sem os segredos. */
async function configuracoes(raiz: string, plataforma: PlataformaDaInstalacao) {
  const { estado, pastas } = await lerInstalacao(raiz, plataforma.nome);
  const producao = await lerConfigEnv(pastas.producao.configEnv);
  const proxy = await lerConfigEnv(pastas.caddyEnv).catch(() => ({}) as Record<string, string>);
  const smtp = producao.GRAFITE_SMTP_URL;
  return {
    email: {
      smtp: smtp === undefined ? null : semSenha(smtp),
      remetente: producao.GRAFITE_EMAIL_REMETENTE ?? null,
      senhaConfigurada: smtp !== undefined && new URL(smtp).password !== '',
    },
    backup: {
      destinos: (producao.GRAFITE_BACKUP_DESTINOS ?? '').split(';').filter(Boolean),
      janela: producao.GRAFITE_BACKUP_JANELA ?? '00:00-06:00',
      retencao: producao.GRAFITE_BACKUP_RETENCAO ?? '7,4,12',
      teste: producao.GRAFITE_BACKUP_TESTE ?? 'semanal',
    },
    certificado: { ...estado.certificado, tokenConfigurado: Boolean(proxy.CLOUDFLARE_API_TOKEN) },
    enderecos: {
      producao: estado.ambientes.producao.enderecos,
      teste: estado.ambientes.teste.enderecos,
      mapaDoTeste: estado.mapaDoTeste,
    },
    organizacaoOperadora: producao.GRAFITE_ORGANIZACAO_OPERADORA ?? null,
  };
}

/** O corpo como um objeto de textos, como os campos de um formulário. */
function textos(valor: unknown): Record<string, string> {
  if (typeof valor !== 'object' || valor === null) return {};
  return Object.fromEntries(
    Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === 'string'),
  );
}

/** Um pacote de versão que a página oferece à atualização. */
export type PacoteDaVersao = Awaited<ReturnType<typeof pacotesNasPastas>>[number];
/** As configurações da instalação que a página mostra, sem os segredos. */
export type ConfiguracoesDoServidor = Awaited<ReturnType<typeof configuracoes>>;
/** O estado da tela principal: o do servidor, com a tarefa que roda. */
export type EstadoDoPainel = EstadoDoServidor & { tarefaEmAndamento: string | null };

/** Uma tarefa como a página a vê: o formulário dela e se ela é sensível. */
export interface TarefaDaPagina {
  id: string;
  rotulo: string;
  campos: readonly CampoDaTarefa[];
  sensivel: boolean;
}

/** Os backups de um destino, como a página os lista para a restauração. */
export interface BackupsListados {
  destino: string;
  backups: {
    nome: string;
    criadoEm: string | null;
    tamanho?: number;
    versao?: string;
    problema?: string;
  }[];
}

/** As peças das rotas da API: as do comando de verdade ou as do servidor simulado da página. */
export interface PecasDasRotas {
  estado(): Promise<EstadoDoServidor>;
  executor: ExecutorDeTarefas;
  canal: CanalDeEventos;
  /** Os serviços cujo log a página pode ler. */
  servicos: ReadonlySet<string>;
  logs(servico: string, pedido: PedidoDoLog): Promise<LogDoServico[]>;
  pacotes(): Promise<PacoteDaVersao[]>;
  backups(): Promise<BackupsListados[]>;
  configuracoes(): Promise<ConfiguracoesDoServidor>;
}

/** As rotas da API do painel, atrás da sessão. */
export function rotasDoPainel(pecas: PecasDasRotas): OpcoesDoServidorDoPainel['api'] {
  const { executor, canal } = pecas;
  return async (pedido) => {
    const { metodo, caminho, corpo, consulta } = pedido;
    const rota = `${metodo} ${caminho}`;
    if (rota === 'GET /estado') {
      const estado: EstadoDoPainel = {
        ...(await pecas.estado()),
        tarefaEmAndamento: executor.emAndamento(),
      };
      return { status: 200, corpo: estado };
    }
    if (rota === 'GET /eventos') return canal.entregar(pedido);
    if (rota === 'GET /tarefas') {
      const tarefas: TarefaDaPagina[] = TAREFAS_DO_PAINEL.map(
        ({ id, rotulo, campos, sensivel }) => ({
          id,
          rotulo,
          campos,
          sensivel: sensivel ?? false,
        }),
      );
      return { status: 200, corpo: tarefas };
    }
    if (rota === 'POST /tarefas') {
      const { tarefa, campos } = (corpo ?? {}) as { tarefa?: unknown; campos?: unknown };
      const resultado = executor.iniciar(String(tarefa ?? ''), textos(campos));
      return 'iniciada' in resultado
        ? { status: 202, corpo: resultado }
        : { status: 409, corpo: { mensagem: resultado.recusada } };
    }
    if (rota === 'POST /respostas') {
      const { id, resposta } = (corpo ?? {}) as { id?: unknown; resposta?: unknown };
      return executor.responder(String(id ?? ''), String(resposta ?? ''))
        ? { status: 204 }
        : { status: 404, corpo: { mensagem: 'A pergunta não está mais esperando resposta.' } };
    }
    if (rota === 'POST /cancelar') {
      executor.cancelar();
      return { status: 204 };
    }
    if (rota === 'GET /logs') {
      const servico = consulta.get('servico') ?? '';
      if (!pecas.servicos.has(servico)) {
        return { status: 400, corpo: { mensagem: `O serviço ${servico} não é do Grafite.` } };
      }
      const linhas = Math.min(Math.max(Number(consulta.get('linhas')) || 200, 1), 2000);
      const busca = consulta.get('busca') ?? undefined;
      return {
        status: 200,
        corpo: await pecas.logs(servico, { linhas, ...(busca ? { busca } : {}) }),
      };
    }
    if (rota === 'GET /pacotes') return { status: 200, corpo: await pecas.pacotes() };
    if (rota === 'GET /backups') return { status: 200, corpo: await pecas.backups() };
    if (rota === 'GET /configuracoes') return { status: 200, corpo: await pecas.configuracoes() };
    return undefined;
  };
}

/** O executor das tarefas com o canal: o erro escrito vira andamento com a marca de erro. */
export function tarefasComCanal(
  rodar: (
    argumentos: string[],
    console: ConsoleDoPainel,
    escreverErro: (texto: string) => void,
  ) => Promise<number>,
): { canal: CanalDeEventos; executor: ExecutorDeTarefas } {
  const canal = canalDeEventos();
  const executor = executorDeTarefas({
    canal,
    rodar: (argumentos, console) =>
      rodar(argumentos, console, (texto) =>
        canal.emitir({
          tipo: 'andamento',
          tarefa: executor.emAndamento() ?? '',
          texto,
          erro: true,
        }),
      ),
  });
  return { canal, executor };
}

export async function abrirPainel(dep: DependenciasDoPainel): Promise<void> {
  const instalacao = await lerInstalacao(dep.raiz, dep.plataforma.nome);
  const pagina = await lerPagina(dep.pagina).catch(() => {
    throw new Error(`A página do painel não está em ${dep.pagina}: o pacote está incompleto.`);
  });
  const sessao = criarSessao();
  const { canal, executor } = tarefasComCanal(dep.rodar);
  canal.ouvir((evento) => {
    if (evento.tipo === 'inicio') {
      dep.escrever(`Rodando "${evento.tarefa}": não feche esta janela até a tarefa terminar.`);
    }
    if (evento.tipo === 'fim') dep.escrever(evento.resultado);
  });
  const pecasDoEstado = {
    raiz: dep.raiz,
    plataforma: dep.plataforma,
    servicos: dep.servicos,
    backup: dep.backup,
    vencimentoDoCertificado: vencimentoPeloProxy(dep.plataforma.nome),
    disco: discoDaPasta,
    agora: dep.agora,
  };
  const rotas = rotasDoPainel({
    estado: () => estadoDoServidor(pecasDoEstado),
    executor,
    canal,
    servicos: new Set(servicosDaInstalacao().map(({ id }) => id)),
    logs: (servico, pedido) => dep.plataforma.logs(instalacao, servico, pedido),
    pacotes: () => pacotesNasPastas(dep.pastasDosPacotes),
    async backups() {
      const listados = await dep.backup.listar().catch(() => []);
      return listados.map(({ destino, backups }) => ({
        destino,
        backups: backups.map(({ criadoEm, ...backup }) => ({
          ...backup,
          criadoEm: criadoEm?.toISOString() ?? null,
        })),
      }));
    },
    configuracoes: () => configuracoes(dep.raiz, dep.plataforma),
  });

  // Cada pedido da página conta como uso; sem nenhum, o painel encerra, nunca com uma tarefa rodando.
  const semUsoMs = dep.semUsoMs ?? SEM_USO_MS;
  let ultimoUso = Date.now();
  const servidor = await abrirServidorDoPainel({
    pagina,
    api: comSessao(sessao, async (pedido) => {
      ultimoUso = Date.now();
      return rotas(pedido);
    }),
    host: dep.host,
    ...(dep.porta === undefined ? {} : { porta: dep.porta }),
  });
  const endereco = `${servidor.endereco}/#${sessao.codigo}`;
  dep.escrever(`O painel da operação está em ${endereco}`);
  dep.escrever(
    'Deixe esta janela aberta enquanto usa o painel: fechá-la encerra o painel. Ele também encerra sozinho depois de 30 minutos sem uso.',
  );
  if (dep.abrirNavegador !== undefined) await dep.abrirNavegador(endereco);

  await new Promise<void>((encerrado) => {
    const vigia = setInterval(
      async () => {
        if (executor.emAndamento() !== null || Date.now() - ultimoUso < semUsoMs) return;
        clearInterval(vigia);
        await servidor.fechar();
        dep.escrever('O painel encerrou, sem uso.');
        encerrado();
      },
      Math.min(semUsoMs / 4, 60_000),
    );
  });
}
