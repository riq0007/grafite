// As tarefas do menu da operação (change instalador-e-menu-da-operacao, design, decisão 5; spec
// operacao-servicos, "Menu da operação"). Cada tarefa é declarada aqui: o rótulo, as perguntas, com
// os padrões tirados da instalação, e a função que monta, das respostas, os argumentos do mesmo
// comando da linha de comando, que o menu roda pelo executarComando. Assim, o menu nunca tem um
// caminho diferente do comando, com as mesmas conferências e confirmações. O menu é só do servidor
// Windows: as tarefas usam o zip da pasta de Downloads e o Explorer.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AmbienteInstalado, EstadoDaInstalacao } from '../estado.ts';
import { pastasDaInstalacao } from '../layout.ts';
import type { Console } from './console.ts';

export interface PadroesDoMenu {
  /** Os endereços de cada ambiente, da instalação. */
  enderecos: Record<AmbienteInstalado, string[]>;
  /** O zip mais novo das pastas de Downloads e de C:\Temp, para a atualização. */
  zip?: string;
  /** A pasta dos logs da produção. */
  logs: string;
}

type Respostas = Record<string, string>;

export interface PerguntaDoMenu {
  campo: string;
  texto: string;
  padrao?: (respostas: Respostas, padroes: PadroesDoMenu) => string | undefined;
  /** As respostas aceitas, como producao e teste. */
  opcoes?: readonly string[];
  /** A resposta em branco vale como não dada. */
  opcional?: boolean;
}

interface TarefaComum {
  rotulo: string;
  perguntas: readonly PerguntaDoMenu[];
}

export type TarefaDoMenu = TarefaComum &
  (
    | { comando: (respostas: Respostas) => string[] }
    | { programa: (padroes: PadroesDoMenu) => { arquivo: string; argumentos: string[] } }
  );

/** As tentativas de cada pergunta: a entrada que acaba responde vazio, e a pergunta não repete. */
const TENTATIVAS = 3;

const ambiente = (padrao: AmbienteInstalado): PerguntaDoMenu => ({
  campo: 'ambiente',
  texto: 'Ambiente (producao ou teste)',
  padrao: () => padrao,
  opcoes: ['producao', 'teste'],
});

/** O endereço da organização que opera o servidor, no ambiente escolhido. */
const endereco: PerguntaDoMenu = {
  campo: 'endereco',
  texto: 'Endereço da organização',
  padrao: (respostas, { enderecos }) => enderecos[respostas.ambiente as AmbienteInstalado]?.[0],
};

const simOuNao = (campo: string, texto: string): PerguntaDoMenu => ({
  campo,
  texto: `${texto} (sim ou não)`,
  padrao: () => 'não',
  opcoes: ['sim', 'não'],
});

export const TAREFAS: readonly TarefaDoMenu[] = [
  { rotulo: 'Estado dos serviços', perguntas: [], comando: () => ['servicos', 'estado'] },
  {
    rotulo: 'Criar uma conta',
    perguntas: [
      ambiente('producao'),
      endereco,
      { campo: 'pessoa', texto: 'Nome da pessoa' },
      { campo: 'usuario', texto: 'Usuário da conta' },
      { campo: 'email', texto: 'E-mail da pessoa (opcional)', opcional: true },
      simOuNao('administrador', 'A pessoa é administradora?'),
    ],
    comando: (r) => [
      'conta',
      'criar',
      ...['--ambiente', r.ambiente ?? '', '--endereco', r.endereco ?? ''],
      ...['--pessoa', r.pessoa ?? '', '--usuario', r.usuario ?? ''],
      ...(r.email ? ['--email', r.email] : []),
      ...(r.administrador === 'sim' ? ['--administrador'] : []),
    ],
  },
  {
    rotulo: 'Redefinir um acesso',
    perguntas: [
      ambiente('producao'),
      endereco,
      { campo: 'usuario', texto: 'Usuário da conta' },
      simOuNao('doisPassos', 'Remover também a verificação em dois passos?'),
    ],
    comando: (r) => [
      'conta',
      'redefinir',
      ...['--ambiente', r.ambiente ?? '', '--endereco', r.endereco ?? ''],
      ...['--usuario', r.usuario ?? ''],
      ...(r.doisPassos === 'sim' ? ['--remover-dois-passos'] : []),
    ],
  },
  { rotulo: 'Fazer o backup agora', perguntas: [], comando: () => ['backup', 'agora'] },
  { rotulo: 'Listar os backups', perguntas: [], comando: () => ['backup', 'listar'] },
  {
    rotulo: 'Configurar o e-mail',
    perguntas: [
      {
        campo: 'smtp',
        texto: 'Endereço do servidor de e-mail, como smtp://grafite@smtp.empresa.com.br:587',
      },
      { campo: 'remetente', texto: 'Remetente, como Grafite <grafite@empresa.com.br>' },
    ],
    comando: (r) => [
      'email',
      'configurar',
      ...['--smtp', r.smtp ?? '', '--remetente', r.remetente ?? ''],
    ],
  },
  {
    rotulo: 'Testar o e-mail',
    perguntas: [{ campo: 'para', texto: 'E-mail que recebe o teste' }],
    comando: (r) => ['email', 'testar', '--para', r.para ?? ''],
  },
  {
    rotulo: 'Atualizar um ambiente',
    perguntas: [
      { campo: 'zip', texto: 'Zip da versão', padrao: (_respostas, { zip }) => zip },
      // A versão nova vai primeiro ao teste, e a produção só recebe a que já roda nele.
      ambiente('teste'),
    ],
    comando: (r) => ['atualizar', r.zip ?? '', '--ambiente', r.ambiente ?? ''],
  },
  { rotulo: 'Preparar o teste', perguntas: [], comando: () => ['preparar-teste'] },
  {
    rotulo: 'Reiniciar um ambiente',
    perguntas: [ambiente('producao')],
    comando: (r) => ['servicos', 'reiniciar', '--ambiente', r.ambiente ?? ''],
  },
  {
    rotulo: 'Abrir a pasta dos logs',
    perguntas: [],
    programa: ({ logs }) => ({ arquivo: 'explorer.exe', argumentos: [logs] }),
  },
];

/** O texto sem acentos e em minúsculas, para comparar respostas como "NÃO" e "nao". */
const comparavel = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

async function responder(
  pergunta: PerguntaDoMenu,
  console: Console,
  respostas: Respostas,
  padroes: PadroesDoMenu,
): Promise<string> {
  const padrao = pergunta.padrao?.(respostas, padroes);
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const resposta = (await console.perguntar(pergunta.texto, padrao)).trim();
    if (pergunta.opcoes !== undefined) {
      const escolhida = pergunta.opcoes.find((opcao) => comparavel(opcao) === comparavel(resposta));
      if (escolhida !== undefined) return escolhida;
      console.escrever(`Responda ${pergunta.opcoes.join(' ou ')}.`);
      continue;
    }
    if (resposta !== '' || pergunta.opcional) return resposta;
    console.escrever('Esta resposta é obrigatória.');
  }
  throw new Error(
    `Sem resposta para "${pergunta.texto}" depois de três tentativas: a tarefa não rodou.`,
  );
}

/** Pergunta os campos da tarefa, com os padrões, e monta os argumentos do comando dela. */
export async function argumentosDaTarefa(
  tarefa: TarefaDoMenu,
  console: Console,
  padroes: PadroesDoMenu,
): Promise<string[]> {
  if (!('comando' in tarefa)) throw new Error(`A tarefa "${tarefa.rotulo}" não roda um comando.`);
  const respostas: Respostas = {};
  for (const pergunta of tarefa.perguntas) {
    respostas[pergunta.campo] = await responder(pergunta, console, respostas, padroes);
  }
  return tarefa.comando(respostas);
}

/** Os padrões das perguntas, do operacao.json da instalação. */
export function padroesDoMenu(estado: EstadoDaInstalacao, zip: string | undefined): PadroesDoMenu {
  return {
    enderecos: {
      producao: estado.ambientes.producao.enderecos,
      teste: estado.ambientes.teste.enderecos,
    },
    ...(zip === undefined ? {} : { zip }),
    logs: pastasDaInstalacao(estado.raiz).producao.logs,
  };
}

const ZIP_DO_GRAFITE = /^grafite-\d+\.\d+\.\d+-windows-x64\.zip$/;

/** O zip do Grafite mais recente das pastas, pela data da última mudança. */
export async function zipMaisNovo(pastas: readonly string[]): Promise<string | undefined> {
  let maisNovo: { caminho: string; quando: number } | undefined;
  for (const pasta of pastas) {
    const nomes = await readdir(pasta).catch(() => [] as string[]);
    for (const nome of nomes.filter((candidato) => ZIP_DO_GRAFITE.test(candidato))) {
      const caminho = join(pasta, nome);
      const { mtimeMs } = await stat(caminho);
      if (maisNovo === undefined || mtimeMs > maisNovo.quando) {
        maisNovo = { caminho, quando: mtimeMs };
      }
    }
  }
  return maisNovo?.caminho;
}

/** As peças do laço do menu. */
export interface DependenciasDoMenu {
  console: Console;
  escrever(texto: string): void;
  escreverErro(texto: string): void;
  padroes: PadroesDoMenu;
  /** Roda o comando da linha de comando com os argumentos e devolve o código de saída. */
  rodar(argumentos: string[]): Promise<number>;
  /** Abre um programa do Windows, como o Explorer. */
  abrir(programa: { arquivo: string; argumentos: string[] }): Promise<void>;
}

function mostrarLista(escrever: (texto: string) => void): void {
  escrever('Menu da operação do Grafite');
  TAREFAS.forEach(({ rotulo }, indice) => {
    escrever(`  ${indice + 1}. ${rotulo}`);
  });
  escrever('  0. Sair');
  escrever(
    'Ficam no painel da operação e no comando, como diz o runbook: a restauração, a volta à versão anterior e a troca da chave do cofre.',
  );
}

/** A tarefa escolhida pelo número, ou nada com o 0. Sem escolha depois de três tentativas, para. */
async function escolherTarefa(dep: DependenciasDoMenu): Promise<TarefaDoMenu | undefined> {
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const escolha = (await dep.console.perguntar('Número da tarefa')).trim();
    if (escolha === '0') return undefined;
    const tarefa = /^\d+$/.test(escolha) ? TAREFAS[Number(escolha) - 1] : undefined;
    if (tarefa !== undefined) return tarefa;
    if (tentativa < TENTATIVAS) dep.escrever(`Escolha um número de 0 a ${TAREFAS.length}.`);
  }
  throw new Error('Nenhuma tarefa foi escolhida depois de três tentativas: o menu fechou.');
}

/**
 * O laço do menu: a lista, a escolha, a tarefa pelo mesmo comando da linha de comando, o resultado e
 * a volta à lista, até o 0. Uma tarefa que falha mostra o motivo e volta à lista, sem fechar.
 */
export async function menuDaOperacao(dep: DependenciasDoMenu): Promise<void> {
  for (;;) {
    mostrarLista(dep.escrever);
    const tarefa = await escolherTarefa(dep);
    if (tarefa === undefined) return;
    try {
      let codigo = 0;
      if ('programa' in tarefa) await dep.abrir(tarefa.programa(dep.padroes));
      else codigo = await dep.rodar(await argumentosDaTarefa(tarefa, dep.console, dep.padroes));
      dep.escrever(
        codigo === 0
          ? `Pronto: ${tarefa.rotulo}.`
          : `${tarefa.rotulo} não terminou: o motivo está acima.`,
      );
    } catch (erro) {
      dep.escreverErro(erro instanceof Error ? erro.message : String(erro));
      dep.escrever(`${tarefa.rotulo} não terminou: o motivo está acima.`);
    }
  }
}
