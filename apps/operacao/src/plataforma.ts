// As peças da plataforma da instalação (change servidor-linux-com-docker, design, decisão 1): os
// comandos de depois da instalação têm o fluxo e as regras das duas plataformas, e cada uma dá as
// peças dela. No Windows (windows/plataforma.ts), o zip desempacotado e as junções, com o
// PostgreSQL da produção do servidor; no Linux (linux/plataforma.ts), as imagens no Docker, o .env
// do Compose e os bancos em contêiner, com o dono dos arquivos dos contêineres.
import type { Superusuario } from './banco.ts';
import type { AmbienteInstalado, EstadoDaInstalacao } from './estado.ts';
import type { Instalacao } from './instalacao.ts';
import type { Plataforma } from './layout.ts';
import type { LogDoServico, PedidoDoLog } from './logs.ts';
import type { ScriptsDaVersao } from './versao.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

/** Uma migration do diário do pacote: a etiqueta e o momento, que o banco guarda ao aplicá-la. */
export interface MigracaoDoDiario {
  tag: string;
  when: number;
}

/** O pacote conferido pelo hash, ainda sem nada mudado no servidor. */
export interface PacoteConferido {
  versao: string;
  /** Prepara a versão no servidor, se ela ainda não estiver lá, e diz o que fez. */
  preparar(instalacao: Instalacao): Promise<string>;
}

export interface PlataformaDaInstalacao {
  nome: Plataforma;
  /** Confere o pacote pelo hash, antes de tudo, e lê a versão dele. */
  conferirPacote(pacote: string): Promise<PacoteConferido>;
  /** Os scripts da versão preparada: as migrations e o comando da API. */
  scripts(instalacao: Instalacao, versao: string): ScriptsDaVersao;
  /** Os scripts da versão que o ambiente roda, como o comando da API com a configuração dele. */
  scriptsDoAmbiente(instalacao: Instalacao, ambiente: AmbienteInstalado): ScriptsDaVersao;
  /** As migrations da versão preparada, pelo diário dela. */
  diario(instalacao: Instalacao, versao: string): Promise<MigracaoDoDiario[]>;
  /** Passa o ambiente a rodar a versão: a anterior recebe a atual. Na mesma versão, só confere. */
  passarParaAVersao(
    instalacao: Instalacao,
    ambiente: AmbienteInstalado,
    versao: string,
  ): Promise<void>;
  /** Troca a versão atual e a anterior do ambiente. */
  trocarAtualEAnterior(instalacao: Instalacao, ambiente: AmbienteInstalado): Promise<void>;
  /** Os serviços que rodam a versão da produção, além do app e do coletor, iniciados depois deles. */
  servicosDaProducao: readonly string[];
  /** Depois de uma atualização com saúde, apaga as versões que nenhum ambiente usa e diz o que fez. */
  limparVersoes(instalacao: Instalacao): Promise<string[]>;
  /**
   * Depois da atualização da produção (change instalador-e-menu-da-operacao, design, decisão 6): no
   * Windows, o Grafite.cmd e o ícone da versão na raiz e o atalho do menu que falta; o Linux não tem
   * atalho. Devolve o que dizer a quem opera.
   */
  atalhoDoMenu(instalacao: Instalacao, versao: string): Promise<string[]>;
  /**
   * O superusuário da instância do PostgreSQL da produção: no Windows, com a senha do postgres
   * pedida e conferida; no Linux, o do contêiner, com a senha gerada na instalação.
   */
  superusuarioDaProducao(instalacao: Instalacao, console: Console): Promise<Superusuario>;
  /**
   * Acerta o dono do que o comando gravou numa pasta que um app usa, com tudo dentro dela: no
   * Linux, o usuário dos contêineres, porque o comando roda como o root.
   */
  acertarDono(pasta: string): Promise<void>;
  /** Deixa um arquivo com segredos só para quem administra o servidor. */
  restringirAcesso(arquivo: string): Promise<void>;
  /** Gera o Caddyfile do estado, conferido pelo Caddy da plataforma, e reinicia o proxy. */
  configurarProxy(estado: EstadoDaInstalacao, servicos: Servicos): Promise<void>;
  /** O nome de um serviço na plataforma: o do Windows ou o do serviço do Compose. */
  nomeDoServico(id: string): string;
  /**
   * Confere que um destino do backup existe e aceita gravação, antes de ele entrar na configuração
   * (change painel-da-operacao, design, decisão 8): no Windows, por um arquivo de prova; no Linux, por
   * um contêiner com o destino montado sem criá-lo, que grava a marca e dá o destino aos contêineres.
   */
  prepararDestinoDoBackup(instalacao: Instalacao, destino: string): Promise<void>;
  /**
   * Gera de novo o que a plataforma monta a partir do estado e da configuração, depois que eles
   * mudam (change painel-da-operacao, design, decisão 8): no Linux, o compose.yaml, que monta nos
   * contêineres os destinos do backup e os arquivos da AC; o Windows não tem o que gerar.
   */
  regerarProjeto(estado: EstadoDaInstalacao, destinosDoBackup: readonly string[]): Promise<void>;
  /**
   * As últimas linhas do log de um serviço, com a busca (change painel-da-operacao, design, decisão
   * 9): no Windows, os arquivos do WinSW; no Linux, o docker compose logs.
   */
  logs(instalacao: Instalacao, id: string, pedido: PedidoDoLog): Promise<LogDoServico[]>;
}
