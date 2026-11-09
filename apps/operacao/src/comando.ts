// O comando de operação no servidor (design do F2d, decisão 4): `grafite.ps1 <comando>`, que confere
// a elevação e chama o Node com este comando. Ele lê os argumentos, monta as peças de cada comando a
// partir do ambiente e devolve o código de saída: 0 deu certo, 1 foi recusado ou falhou e 2 é uso
// errado. Os comandos `organizacao` e `conta` são repassados ao comando da API da versão do
// ambiente, com o config.env dele.
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type ExecutarProcesso,
  type FerramentasDoPostgres,
  formatarTamanho,
} from '@grafite/operacao';
import type { ChavesDoPush } from './ambientes.ts';
import { atualizarProducao, atualizarTeste, voltar } from './atualizar.ts';
import type { BackupDoServidor } from './backup.ts';
import { configurarCertificado } from './certificado.ts';
import { trocarChaveDoCofre } from './cofre.ts';
import { lerConfigEnv } from './configuracao.ts';
import { configurarBackup } from './configurar-backup.ts';
import { configurarEmail, testarEmail } from './email.ts';
import { acrescentarEndereco, tirarEndereco } from './enderecos.ts';
import { type AmbienteInstalado, lerEstado } from './estado.ts';
import { type Instalacao, lerInstalacao } from './instalacao.ts';
import { instalar, type PreparacaoDoServidor } from './instalar.ts';
import {
  NO_SERVIDOR,
  type PastasDaInstalacao,
  PG_BIN_NO_LINUX,
  type Plataforma,
  pastasDaInstalacao,
  RAIZ_PADRAO,
  RAIZ_PADRAO_NO_LINUX,
} from './layout.ts';
import { instalarNoLinux } from './linux/instalar.ts';
import type { Permissoes } from './linux/permissoes.ts';
import { abrirPainel } from './painel/painel.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { prepararTeste } from './preparar-teste.ts';
import { exportarRaiz } from './proxy.ts';
import { restaurarProducao } from './restaurar.ts';
import type { Saude } from './saude.ts';
import { iniciarAmbiente, linhasDoEstado, pararAmbiente, reiniciarAmbiente } from './servicos.ts';
import type { AtalhoDoMenu } from './windows/atalhos.ts';
import type { Console } from './windows/console.ts';
import type { Juncoes } from './windows/juncoes.ts';
import { menuDaOperacao, padroesDoMenu, zipMaisNovo } from './windows/menu.ts';
import type { PecasDaPreparacao } from './windows/preparar.ts';
import { lerPrerequisitos } from './windows/prerequisitos.ts';
import type { EstadoDoServico, Servicos } from './windows/servicos.ts';

export interface AmbienteDoComando {
  escrever(texto: string): void;
  escreverErro(texto: string): void;
  /** O console das perguntas e das confirmações, com o `--confirmar` do roteiro. */
  console(confirmar?: string): Console;
  executar: ExecutarProcesso;
  juncoes: Juncoes;
  saude: Saude;
  /** As ferramentas do PostgreSQL de uma pasta de binários. */
  ferramentas(pgBin: string): FerramentasDoPostgres;
  servicos(pastas: PastasDaInstalacao): Servicos;
  backup(instalacao: Instalacao): BackupDoServidor;
  /** As peças da plataforma da instalação (change servidor-linux-com-docker, design, decisão 1). */
  plataforma: PlataformaDaInstalacao;
  /**
   * No Linux, o que o lançador passa (change servidor-linux-com-docker, design, decisão 2): a pasta
   * da instalação, montada no mesmo caminho, e o fuso do servidor, com as permissões das pastas.
   */
  linux?: { raiz: string; fuso: string; permissoes?: Permissoes };
  /**
   * No Windows, as peças da preparação do servidor pelo atalho de instalação e o atalho do menu
   * (change instalador-e-menu-da-operacao, design, decisões 3 e 6).
   */
  windows?: PecasDoWindows;
  /**
   * O painel da operação (change painel-da-operacao): a pasta da página compilada, que fora do
   * pacote é a do desenvolvimento, e o tempo sem uso até ele encerrar.
   */
  painel?: { pagina?: string; semUsoMs?: number };
  /** A pasta do pacote de onde o comando roda. */
  pastaDoPacote: string;
  /** O node.exe que roda o comando, os serviços e os scripts das versões. */
  node: string;
  versaoDoNode: string;
  agora(): Date;
  gerarSenha(): string;
  /** 32 bytes em base64. */
  gerarChave(): string;
  /** Um par novo das chaves do push (change p3c-email-e-push). */
  gerarChavesDoPush(): ChavesDoPush;
}

/** O trecho da ajuda do --preparar, que só o servidor Windows tem. */
const COM_O_PREPARAR = ` Com --preparar, que o atalho de
                                 instalação passa, instala antes o PostgreSQL 18 que falta e
                                 desliga o IIS que ocupa as portas do proxy.`;

/** O trecho da ajuda do menu, que só o servidor Windows tem. */
const O_MENU = `
  menu                           Abre o menu da operação no terminal, com as tarefas do dia a dia
                                 numeradas, que rodam estes mesmos comandos.`;

export const AJUDA = `Uso: grafite <comando> [opções]

Operação do dia a dia:
  painel                         Abre o painel da operação no navegador deste servidor, só no
                                 127.0.0.1, com o estado dos serviços e as tarefas, que rodam estes
                                 mesmos comandos. --porta <n> escolhe a porta, e --sem-navegador
                                 só escreve o endereço com o código da sessão.${O_MENU}

Instalação e versões:
  instalar <zip>                 Instala o Grafite do zero neste servidor. Pergunta o que precisa,
                                 ou lê as respostas de --respostas <arquivo>. Rodar de novo retoma
                                 a instalação interrompida.${COM_O_PREPARAR}
  atualizar <zip> --ambiente teste|producao
                                 Passa o ambiente à versão do pacote. A produção só recebe a versão
                                 que já roda no teste, depois de um backup.
  voltar --ambiente teste|producao
                                 Volta o ambiente à versão de antes da última atualização.
  preparar-teste                 Troca os dados do teste pela cópia da produção, do último backup.

Backup:
  backup agora                   Faz o backup da produção agora, em todos os destinos.
  backup listar                  Lista os backups de cada destino.
  backup testar                  Testa a restauração do backup mais novo, na instância do teste.
  backup configurar              Muda o backup da produção: --destinos <pastas separadas por ;>,
                                 --janela HH:MM-HH:MM, --retencao <diários,semanais,mensais> e
                                 --teste-de-restauracao semanal|diario. Confere cada destino antes
                                 de gravar e reinicia a produção.
  restaurar <backup> --ambiente producao
                                 Restaura a produção a partir do backup (a pasta ou o nome, como
                                 2026-10-07T0500Z), guardando o banco e os arquivos de antes.

Proxy e serviços:
  proxy configurar               Gera de novo a configuração do proxy e o reinicia.
  proxy raiz <destino>           Copia o certificado raiz da AC interna, para distribuir.
  servicos estado                Mostra o estado de cada serviço do Grafite.
  servicos reiniciar --ambiente teste|producao
                                 Reinicia o app do ambiente e, na produção, o coletor.
  servicos iniciar --ambiente teste|producao
                                 Liga o que estiver parado no ambiente e confere a saúde do app.
  servicos parar --ambiente teste|producao
                                 Desliga o app do ambiente e, na produção, o coletor, com o nome do
                                 banco da produção digitado.

Certificado e endereços:
  certificado configurar --modo interno|publico
                                 Troca o modo do certificado do proxy: o interno, com --ac caddy ou
                                 --ac empresa --certificado <arquivo> --chave <arquivo>, ou o
                                 público, com --email <e-mail> e o token da Cloudflare pedido sem
                                 eco. Confere o HTTPS dos dois ambientes.
  enderecos acrescentar <endereço>
                                 Acrescenta o endereço à produção e o do teste correspondente ao
                                 teste, na organização que opera o servidor e no proxy.
  enderecos tirar <endereço>     Tira o endereço da produção e o do teste, com o endereço digitado;
                                 o último endereço da produção fica.

Cofre:
  cofre trocar-chave             Troca a chave mestra do cofre nos dois ambientes: grava a nova com a
                                 anterior, reinicia os apps, recifra a chave de cada segredo e tira a
                                 anterior. Depois de uma falha, rodar de novo continua a troca.

E-mail:
  email configurar --smtp <endereço> --remetente <remetente>
                                 Grava o SMTP e o remetente na configuração da produção e reinicia o
                                 app. Com o endereço só com o usuário, como
                                 smtp://grafite@smtp.empresa.com.br:587, pede a senha sem eco. O
                                 remetente é como "Grafite <grafite@empresa.com.br>".
  email testar --para <e-mail>   Manda o e-mail de teste pela configuração da produção e diz o que o
                                 servidor de e-mail respondeu.

Organizações e contas, pelo comando da API, com a configuração do ambiente:
  organizacao criar --ambiente teste|producao ...
  conta criar --ambiente teste|producao ...
  conta redefinir --ambiente teste|producao ...
                                 As outras opções são as do comando da API: grafite conta --ajuda.

Opções:
  --raiz <pasta>                 A pasta da instalação (padrão: a desta versão, ou C:\\Grafite).
  --confirmar <texto>            O texto das confirmações digitadas, no roteiro automático.
  --respostas <arquivo>          No instalar, as respostas do roteiro automático.
  --ajuda                        Mostra esta ajuda.

O runbook (docs\\operacao\\runbook.md) explica cada comando e o que fazer quando algo falha.`;

/** A ajuda no servidor da plataforma: no Linux, com o sudo, o pacote tar e /opt/grafite. */
export function ajudaDe(plataforma: Plataforma): string {
  if (plataforma === 'windows') return AJUDA;
  return AJUDA.replace(COM_O_PREPARAR, '')
    .replace(O_MENU, '')
    .replace('Uso: grafite', 'Uso: sudo grafite')
    .replaceAll('<zip>', '<tar>')
    .replace('(padrão: a desta versão, ou C:\\Grafite)', `(padrão: ${RAIZ_PADRAO_NO_LINUX})`)
    .replace('grafite conta --ajuda', 'sudo grafite conta --ajuda')
    .replace(NO_SERVIDOR.windows.runbook, NO_SERVIDOR.linux.runbook);
}

/** Um uso errado: sai com 2. */
class ErroDeUso extends Error {}

const OPCOES = {
  ajuda: { type: 'boolean', short: 'h' },
  ambiente: { type: 'string' },
  raiz: { type: 'string' },
  confirmar: { type: 'string' },
  respostas: { type: 'string' },
  preparar: { type: 'boolean' },
  smtp: { type: 'string' },
  remetente: { type: 'string' },
  para: { type: 'string' },
  destinos: { type: 'string' },
  janela: { type: 'string' },
  retencao: { type: 'string' },
  'teste-de-restauracao': { type: 'string' },
  modo: { type: 'string' },
  ac: { type: 'string' },
  email: { type: 'string' },
  certificado: { type: 'string' },
  chave: { type: 'string' },
  'sem-navegador': { type: 'boolean' },
  porta: { type: 'string' },
} as const;

function lerArgumentos(argumentos: string[]) {
  try {
    return parseArgs({ args: argumentos, options: OPCOES, allowPositionals: true, strict: true });
  } catch (erro) {
    const { code, message } = erro as { code?: string; message: string };
    const opcao = /'([^']+)'/.exec(message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION')
      throw new ErroDeUso(`Opção desconhecida: ${opcao}.`);
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      throw new ErroDeUso(`A opção ${opcao.split(' ')[0]} precisa de um valor.`);
    }
    throw new ErroDeUso(message);
  }
}

function ambienteDa(valor: string | undefined): AmbienteInstalado {
  if (valor === undefined) throw new ErroDeUso('Falta --ambiente teste ou --ambiente producao.');
  if (valor !== 'teste' && valor !== 'producao') {
    throw new ErroDeUso(`O ambiente ${valor} não existe: use teste ou producao.`);
  }
  return valor;
}

/** A raiz da instalação: a dada, a da versão de onde o comando roda, ou a padrão. */
function raizDa(dada: string | undefined, ambiente: AmbienteDoComando): string {
  if (dada !== undefined) return resolve(dada);
  // No Linux, a pasta que o lançador montou.
  if (ambiente.linux !== undefined) return ambiente.linux.raiz;
  const pai = dirname(ambiente.pastaDoPacote);
  return basename(pai) === 'versoes' ? dirname(pai) : RAIZ_PADRAO;
}

const _TEXTO_DO_ESTADO: Record<EstadoDoServico, string> = {
  rodando: 'rodando',
  parado: 'parado',
  mudando: 'iniciando ou parando',
  ausente: 'não registrado',
};

const NUMERO = new Intl.NumberFormat('pt-BR');
const quantos = (n: number, um: string, varios: string) =>
  `${NUMERO.format(n)} ${n === 1 ? um : varios}`;

/** Executa o comando e devolve o código de saída. */
export async function executarComando(
  argumentos: string[],
  ambiente: AmbienteDoComando,
): Promise<number> {
  try {
    const [primeiro] = argumentos;
    if (primeiro === 'organizacao' || primeiro === 'conta') {
      return await repassarAoComandoDaApi(argumentos, ambiente);
    }
    const { values: opcoes, positionals } = lerArgumentos(argumentos);
    if (opcoes.ajuda) {
      ambiente.escrever(ajudaDe(ambiente.plataforma.nome));
      return 0;
    }
    const [comando, ...resto] = positionals;
    if (comando === undefined) {
      ambiente.escreverErro(ajudaDe(ambiente.plataforma.nome));
      return 2;
    }
    const executor = COMANDOS[comando];
    if (executor === undefined)
      throw new ErroDeUso(
        `Comando desconhecido: ${comando}.\n\n${ajudaDe(ambiente.plataforma.nome)}`,
      );
    await executor({ resto, opcoes, ambiente, raiz: raizDa(opcoes.raiz, ambiente) });
    return 0;
  } catch (erro) {
    if (erro instanceof ErroDeUso) {
      ambiente.escreverErro(erro.message);
      return 2;
    }
    ambiente.escreverErro(erro instanceof Error ? erro.message : String(erro));
    return 1;
  }
}

interface Pedido {
  resto: string[];
  opcoes: ReturnType<typeof lerArgumentos>['values'];
  ambiente: AmbienteDoComando;
  raiz: string;
}

/** As peças comuns aos comandos sobre uma instalação. */
function pecas({ ambiente, raiz, opcoes }: Pedido) {
  const pastas = pastasDaInstalacao(raiz);
  return {
    raiz,
    console: ambiente.console(opcoes.confirmar),
    executar: ambiente.executar,
    servicos: ambiente.servicos(pastas),
    juncoes: ambiente.juncoes,
    saude: ambiente.saude,
    node: ambiente.node,
    ferramentas: (pgBin: string) => ambiente.ferramentas(pgBin),
    backup: (instalacao: Instalacao) => ambiente.backup(instalacao),
    plataforma: ambiente.plataforma,
    agora: () => ambiente.agora(),
    gerarChave: () => ambiente.gerarChave(),
    gerarChavesDoPush: () => ambiente.gerarChavesDoPush(),
  };
}

/** O pacote da versão dos argumentos: o zip no Windows, o tar no Linux. */
function pacoteDo(resto: string[], comando: string, plataforma: Plataforma): string {
  const [pacote] = resto;
  if (pacote === undefined) {
    const doServidor = NO_SERVIDOR[plataforma];
    throw new ErroDeUso(
      `Falta o ${plataforma === 'linux' ? 'tar' : 'zip'} da versão: ${doServidor.comando} ${comando} ${doServidor.pacote}.`,
    );
  }
  return resolve(pacote);
}

/** As peças do servidor Windows que o grafite.ts monta: a preparação e o atalho do menu. */
export interface PecasDoWindows extends PecasDaPreparacao {
  atalhoDoMenu: AtalhoDoMenu;
}

/** Onde o menu procura o zip mais novo para a atualização: a pasta de Downloads e a C:\Temp. */
const PASTAS_DOS_ZIPS = [join(homedir(), 'Downloads'), 'C:\\Temp'];

/** A preparação do servidor pelo atalho: as peças do Windows, os pré-requisitos e a pasta do zip. */
async function preparacaoDo(pecas: PecasDaPreparacao, zip: string): Promise<PreparacaoDoServidor> {
  return { ...pecas, prerequisitos: await lerPrerequisitos(), pastaDoZip: dirname(zip) };
}

const COMANDOS: Record<string, (pedido: Pedido) => Promise<void>> = {
  async painel(pedido) {
    const { ambiente, opcoes, raiz } = pedido;
    const noLinux = ambiente.linux !== undefined;
    const porta = opcoes.porta === undefined ? undefined : Number(opcoes.porta);
    if (porta !== undefined && !(Number.isInteger(porta) && porta >= 1024 && porta <= 65535)) {
      throw new ErroDeUso('--porta: use um número de 1024 a 65535.');
    }
    const instalacao = await lerInstalacao(raiz, ambiente.plataforma.nome);
    const daRaiz = opcoes.raiz === undefined ? [] : ['--raiz', opcoes.raiz];
    await abrirPainel({
      raiz,
      plataforma: ambiente.plataforma,
      servicos: ambiente.servicos(pastasDaInstalacao(raiz)),
      backup: ambiente.backup(instalacao),
      escrever: (texto) => ambiente.escrever(texto),
      rodar: (argumentos, console, escreverErro) =>
        executarComando([...argumentos, ...daRaiz], {
          ...ambiente,
          escrever: (texto) => console.escrever(texto),
          escreverErro,
          console: () => console,
        }),
      // No Linux, o lançador abre o navegador de quem chamou o sudo, com o endereço que o comando
      // escreve; no Windows, o Explorer entrega o endereço à sessão de quem está logado.
      ...(noLinux || opcoes['sem-navegador']
        ? {}
        : {
            abrirNavegador: async (endereco: string) => {
              await ambiente.executar('explorer.exe', [endereco], { env: process.env });
            },
          }),
      pagina: ambiente.painel?.pagina ?? join(ambiente.pastaDoPacote, 'painel'),
      host: noLinux ? '0.0.0.0' : '127.0.0.1',
      ...(porta === undefined ? {} : { porta }),
      ...(ambiente.painel?.semUsoMs === undefined ? {} : { semUsoMs: ambiente.painel.semUsoMs }),
      pastasDosPacotes: noLinux ? [] : PASTAS_DOS_ZIPS,
      agora: () => ambiente.agora(),
    });
  },

  async menu(pedido) {
    const { ambiente, opcoes, raiz } = pedido;
    if (ambiente.linux !== undefined) {
      throw new ErroDeUso(
        'O menu da operação é do servidor Windows. No Linux, a operação é pelos comandos: sudo grafite --ajuda.',
      );
    }
    const estado = await lerEstado(raiz);
    if (estado === null) throw new Error(`O Grafite não está instalado neste servidor (${raiz}).`);
    const daRaiz = opcoes.raiz === undefined ? [] : ['--raiz', opcoes.raiz];
    await menuDaOperacao({
      console: ambiente.console(opcoes.confirmar),
      escrever: (texto) => ambiente.escrever(texto),
      escreverErro: (texto) => ambiente.escreverErro(texto),
      padroes: padroesDoMenu(estado, await zipMaisNovo(PASTAS_DOS_ZIPS)),
      rodar: (argumentos) => executarComando([...argumentos, ...daRaiz], ambiente),
      abrir: async ({ arquivo, argumentos }) => {
        await ambiente.executar(arquivo, argumentos, { env: process.env });
      },
    });
  },

  async instalar(pedido) {
    const { ambiente, opcoes } = pedido;
    const pacote = pacoteDo(pedido.resto, 'instalar', ambiente.plataforma.nome);
    const arquivoDeRespostas =
      opcoes.respostas === undefined ? undefined : resolve(opcoes.respostas);
    // No Linux, a instalação é a dos contêineres, com a pasta e o fuso que o lançador passa.
    if (ambiente.linux !== undefined) {
      if (opcoes.preparar) {
        throw new ErroDeUso(
          'A opção --preparar é do servidor Windows: no Linux, o Docker é o único pré-requisito, e o instalar.sh o confere.',
        );
      }
      await instalarNoLinux({
        pacote,
        arquivoDeRespostas,
        raiz: pedido.raiz,
        fuso: ambiente.linux.fuso,
        console: ambiente.console(opcoes.confirmar),
        executar: ambiente.executar,
        ferramentas: ambiente.ferramentas(PG_BIN_NO_LINUX),
        servicos: ambiente.servicos(pastasDaInstalacao(pedido.raiz)),
        saude: ambiente.saude,
        ...(ambiente.linux.permissoes === undefined
          ? {}
          : { permissoes: ambiente.linux.permissoes }),
        gerarSenha: () => ambiente.gerarSenha(),
        gerarChave: () => ambiente.gerarChave(),
        gerarChavesDoPush: () => ambiente.gerarChavesDoPush(),
      });
      return;
    }
    const { windows } = ambiente;
    if (windows === undefined) throw new Error('As peças do servidor Windows não foram montadas.');
    await instalar({
      zip: pacote,
      arquivoDeRespostas,
      console: ambiente.console(opcoes.confirmar),
      executar: ambiente.executar,
      ferramentas: (pgBin) => ambiente.ferramentas(pgBin),
      servicos: (pastas) => ambiente.servicos(pastas),
      juncoes: ambiente.juncoes,
      saude: ambiente.saude,
      node: ambiente.node,
      versaoDoNode: ambiente.versaoDoNode,
      gerarSenha: () => ambiente.gerarSenha(),
      gerarChave: () => ambiente.gerarChave(),
      gerarChavesDoPush: () => ambiente.gerarChavesDoPush(),
      atalhoDoMenu: windows.atalhoDoMenu,
      ...(opcoes.preparar ? { preparacao: await preparacaoDo(windows, pacote) } : {}),
    });
  },

  async atualizar(pedido) {
    const alvo = ambienteDa(pedido.opcoes.ambiente);
    const dep = {
      ...pecas(pedido),
      pacote: pacoteDo(pedido.resto, 'atualizar', pedido.ambiente.plataforma.nome),
    };
    if (alvo === 'teste') await atualizarTeste(dep);
    else await atualizarProducao(dep);
  },

  async voltar(pedido) {
    await voltar(pecas(pedido), ambienteDa(pedido.opcoes.ambiente));
  },

  async cofre(pedido) {
    const [acao] = pedido.resto;
    if (acao !== 'trocar-chave') throw new ErroDeUso('Use cofre trocar-chave.');
    await trocarChaveDoCofre(pecas(pedido));
  },

  async email(pedido) {
    const [acao] = pedido.resto;
    const { opcoes } = pedido;
    const dep = pecas(pedido);
    if (acao === 'configurar') {
      if (opcoes.smtp === undefined || opcoes.remetente === undefined) {
        throw new ErroDeUso('Use email configurar --smtp <endereço> --remetente <remetente>.');
      }
      await configurarEmail(dep, { smtp: opcoes.smtp, remetente: opcoes.remetente });
      return;
    }
    if (acao === 'testar') {
      if (opcoes.para === undefined) throw new ErroDeUso('Use email testar --para <e-mail>.');
      await testarEmail(dep, opcoes.para);
      return;
    }
    throw new ErroDeUso('Use email configurar ou email testar.');
  },

  async 'preparar-teste'(pedido) {
    await prepararTeste(pecas(pedido));
  },

  async restaurar(pedido) {
    if (ambienteDa(pedido.opcoes.ambiente) !== 'producao') {
      throw new ErroDeUso(
        'A restauração pelo comando é só da produção: --ambiente producao. O teste recebe a cópia por grafite preparar-teste.',
      );
    }
    const [backup] = pedido.resto;
    if (backup === undefined) {
      throw new ErroDeUso('Falta o backup: a pasta ou o nome, como 2026-10-07T0500Z.');
    }
    const dep = pecas(pedido);
    await restaurarProducao({
      ...dep,
      backup: /[\\/]/.test(backup) ? resolve(backup) : backup,
      backupDoServidor: dep.backup,
    });
  },

  async backup(pedido) {
    const [acao] = pedido.resto;
    if (acao === 'configurar') {
      const { destinos, janela, retencao } = pedido.opcoes;
      const testeDeRestauracao = pedido.opcoes['teste-de-restauracao'];
      if ([destinos, janela, retencao, testeDeRestauracao].every((valor) => valor === undefined)) {
        throw new ErroDeUso(
          'Use backup configurar com --destinos, --janela, --retencao ou --teste-de-restauracao.',
        );
      }
      await configurarBackup(pecas(pedido), { destinos, janela, retencao, testeDeRestauracao });
      return;
    }
    if (acao !== 'agora' && acao !== 'listar' && acao !== 'testar') {
      throw new ErroDeUso('Use backup agora, backup listar, backup testar ou backup configurar.');
    }
    const { ambiente } = pedido;
    const backup = ambiente.backup(await lerInstalacao(pedido.raiz));
    if (acao === 'agora') {
      const feito = await backup.fazer();
      ambiente.escrever(
        `Backup ${feito.nome} feito em todos os destinos e conferido: ${feito.pasta}.`,
      );
    } else if (acao === 'listar') {
      for (const { destino, backups } of await backup.listar()) {
        ambiente.escrever(destino);
        if (backups.length === 0) ambiente.escrever('  nenhum backup pronto');
        for (const item of backups) {
          ambiente.escrever(
            item.problema === undefined
              ? `  ${item.nome}  ${formatarTamanho(item.tamanho ?? 0)}  versão ${item.versao}`
              : `  ${item.nome}  ${item.problema}`,
          );
        }
      }
    } else {
      const { backup: testado, detalhes } = await backup.testar();
      ambiente.escrever(
        `O backup ${testado} restaurou na instância do teste: ${quantos(detalhes.tabelas, 'tabela', 'tabelas')}, ${quantos(detalhes.linhas, 'linha', 'linhas')} e ${quantos(detalhes.arquivos, 'arquivo', 'arquivos')} conferidos.`,
      );
    }
  },

  async certificado(pedido) {
    const [acao] = pedido.resto;
    const { modo, ac, email, certificado, chave } = pedido.opcoes;
    if (acao !== 'configurar' || modo === undefined) {
      throw new ErroDeUso('Use certificado configurar --modo interno|publico.');
    }
    await configurarCertificado(pecas(pedido), { modo, ac, email, certificado, chave });
  },

  async enderecos(pedido) {
    const [acao, endereco] = pedido.resto;
    if ((acao !== 'acrescentar' && acao !== 'tirar') || endereco === undefined) {
      throw new ErroDeUso('Use enderecos acrescentar <endereço> ou enderecos tirar <endereço>.');
    }
    if (acao === 'acrescentar') await acrescentarEndereco(pecas(pedido), endereco);
    else await tirarEndereco(pecas(pedido), endereco);
  },

  async proxy(pedido) {
    const [acao, destino] = pedido.resto;
    const { estado, pastas } = await lerInstalacao(pedido.raiz);
    const { ambiente } = pedido;
    if (acao === 'configurar') {
      await ambiente.plataforma.configurarProxy(estado, ambiente.servicos(pastas));
      ambiente.escrever('Proxy configurado e reiniciado.');
    } else if (acao === 'raiz') {
      if (destino === undefined) {
        throw new ErroDeUso('Falta o destino: grafite proxy raiz <pasta ou arquivo>.');
      }
      const arquivo = await exportarRaiz(estado, resolve(destino));
      ambiente.escrever(
        `Certificado raiz copiado para ${arquivo}. Distribua-o às máquinas e aos celulares, como diz o runbook.`,
      );
    } else {
      throw new ErroDeUso('Use proxy configurar ou proxy raiz <destino>.');
    }
  },

  async servicos(pedido) {
    const [acao] = pedido.resto;
    const { ambiente } = pedido;
    const pastas = pastasDaInstalacao(pedido.raiz);
    const servicos = ambiente.servicos(pastas);
    if (acao === 'estado') {
      for (const linha of await linhasDoEstado(servicos, (id) =>
        ambiente.plataforma.nomeDoServico(id),
      )) {
        ambiente.escrever(linha);
      }
      return;
    }
    if (acao === 'parar' || acao === 'iniciar') {
      const dep = pecas(pedido);
      const alvo = ambienteDa(pedido.opcoes.ambiente);
      if (acao === 'parar') await pararAmbiente(dep, alvo);
      else await iniciarAmbiente(dep, alvo);
      return;
    }
    if (acao !== 'reiniciar') {
      throw new ErroDeUso(
        'Use servicos estado, servicos iniciar, servicos parar ou servicos reiniciar.',
      );
    }
    const alvo = ambienteDa(pedido.opcoes.ambiente);
    const { estado } = await lerInstalacao(pedido.raiz);
    const versao = estado.ambientes[alvo].atual ?? '';
    const producao = alvo === 'producao';
    await reiniciarAmbiente(
      { servicos, saude: ambiente.saude, plataforma: ambiente.plataforma },
      alvo,
      versao,
    );
    ambiente.escrever(
      `${producao ? 'A produção foi reiniciada' : 'O teste foi reiniciado'} e responde, na versão ${versao}.`,
    );
  },
};

/** Tira `--opcao valor` (ou `--opcao=valor`) dos argumentos e devolve o valor e o resto. */
function tirarOpcao(argumentos: string[], nome: string): [string | undefined, string[]] {
  const resto: string[] = [];
  let valor: string | undefined;
  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i] ?? '';
    if (argumento === `--${nome}`) {
      valor = argumentos[i + 1];
      i += 1;
    } else if (argumento.startsWith(`--${nome}=`)) valor = argumento.slice(nome.length + 3);
    else resto.push(argumento);
  }
  return [valor, resto];
}

/** `organizacao` e `conta` vão ao comando da API da versão do ambiente, com o config.env dele. */
async function repassarAoComandoDaApi(
  argumentos: string[],
  ambiente: AmbienteDoComando,
): Promise<number> {
  const [dada, semRaiz] = tirarOpcao(argumentos, 'raiz');
  const [alvo, paraAApi] = tirarOpcao(semRaiz, 'ambiente');
  const ajuda = paraAApi.includes('--ajuda') || paraAApi.includes('-h');
  // A ajuda sem o ambiente é a da versão da produção, sem configuração; o resto roda na versão do
  // ambiente, com a configuração dele.
  const semAmbiente = ajuda && alvo === undefined;
  const doAmbiente = semAmbiente ? 'producao' : ambienteDa(alvo);
  const { plataforma } = ambiente;
  const instalacao = await lerInstalacao(raizDa(dada, ambiente), plataforma.nome);
  const variaveis = semAmbiente ? {} : await lerConfigEnv(instalacao.pastas[doAmbiente].configEnv);
  const { codigo, saida, erro } = await plataforma
    .scriptsDoAmbiente(instalacao, doAmbiente)
    .comandoDaApi(variaveis, paraAApi);
  if (saida.trim() !== '') ambiente.escrever(saida.trimEnd());
  if (erro.trim() !== '') ambiente.escreverErro(erro.trimEnd());
  return codigo;
}
