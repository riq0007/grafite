// As tarefas do painel e a trava (change painel-da-operacao, design, decisão 4; spec
// painel-da-operacao, "Tarefas do painel pelos mesmos comandos"). Cada tarefa é declarada aqui: o
// rótulo, os campos do formulário e a função que monta, deles, os argumentos do mesmo comando da
// linha de comando, que o painel roda pelo executarComando. Onde a tarefa é a do menu, a função é a
// dele, com os mesmos campos. A trava deixa rodar uma tarefa por vez; a leitura do estado não passa
// por ela.
import { mensagemDe } from '../falhas.ts';
import { TAREFAS } from '../windows/menu.ts';
import { type CanalDeEventos, type ConsoleDoPainel, consoleDoPainel } from './console.ts';

type Campos = Record<string, string>;

export interface CampoDaTarefa {
  campo: string;
  rotulo: string;
  /** Os valores aceitos, como producao e teste. */
  opcoes?: readonly string[];
  /** O campo em branco vale como não dado. */
  opcional?: boolean;
}

export interface TarefaDoPainel {
  /** O nome da tarefa na API, como backup-agora. */
  id: string;
  rotulo: string;
  campos: readonly CampoDaTarefa[];
  /** A operação sensível, que o painel explica antes de rodar. */
  sensivel?: boolean;
  comando(campos: Campos): string[];
}

/** A função do menu que monta os argumentos da tarefa com o rótulo. */
function doMenu(rotulo: string): (campos: Campos) => string[] {
  const tarefa = TAREFAS.find((doMenu) => doMenu.rotulo === rotulo);
  if (tarefa === undefined || !('comando' in tarefa)) {
    throw new Error(`O menu não tem a tarefa "${rotulo}".`);
  }
  return tarefa.comando;
}

const AMBIENTE: CampoDaTarefa = {
  campo: 'ambiente',
  rotulo: 'Ambiente',
  opcoes: ['producao', 'teste'],
};
const ENDERECO_DA_ORGANIZACAO: CampoDaTarefa = {
  campo: 'endereco',
  rotulo: 'Endereço da organização',
};
const SIM_OU_NAO = ['sim', 'não'] as const;

/** As opções que vêm do campo preenchido, como --janela 01:00-05:00. */
const opcoesPreenchidas = (campos: Campos, pares: [string, string][]) =>
  pares.flatMap(([campo, opcao]) => (campos[campo] ? [opcao, campos[campo] ?? ''] : []));

export const TAREFAS_DO_PAINEL: readonly TarefaDoPainel[] = [
  {
    id: 'servicos-iniciar',
    rotulo: 'Ligar um ambiente',
    campos: [AMBIENTE],
    comando: (c) => ['servicos', 'iniciar', '--ambiente', c.ambiente ?? ''],
  },
  {
    id: 'servicos-parar',
    rotulo: 'Desligar um ambiente',
    campos: [AMBIENTE],
    comando: (c) => ['servicos', 'parar', '--ambiente', c.ambiente ?? ''],
  },
  {
    id: 'servicos-reiniciar',
    rotulo: 'Reiniciar um ambiente',
    campos: [AMBIENTE],
    comando: doMenu('Reiniciar um ambiente'),
  },
  {
    id: 'atualizar',
    rotulo: 'Atualizar um ambiente',
    campos: [{ campo: 'zip', rotulo: 'Pacote da versão' }, AMBIENTE],
    comando: doMenu('Atualizar um ambiente'),
  },
  {
    id: 'backup-agora',
    rotulo: 'Fazer o backup agora',
    campos: [],
    comando: doMenu('Fazer o backup agora'),
  },
  {
    id: 'backup-listar',
    rotulo: 'Listar os backups',
    campos: [],
    comando: doMenu('Listar os backups'),
  },
  {
    id: 'backup-testar',
    rotulo: 'Testar a restauração',
    campos: [],
    comando: () => ['backup', 'testar'],
  },
  {
    id: 'preparar-teste',
    rotulo: 'Preparar o teste',
    campos: [],
    comando: doMenu('Preparar o teste'),
  },
  {
    id: 'email-configurar',
    rotulo: 'Configurar o e-mail',
    campos: [
      { campo: 'smtp', rotulo: 'Endereço do servidor de e-mail' },
      { campo: 'remetente', rotulo: 'Remetente' },
    ],
    comando: doMenu('Configurar o e-mail'),
  },
  {
    id: 'email-testar',
    rotulo: 'Testar o e-mail',
    campos: [{ campo: 'para', rotulo: 'E-mail que recebe o teste' }],
    comando: doMenu('Testar o e-mail'),
  },
  {
    id: 'backup-configurar',
    rotulo: 'Configurar o backup',
    campos: [
      { campo: 'destinos', rotulo: 'Destinos', opcional: true },
      { campo: 'janela', rotulo: 'Janela do horário', opcional: true },
      { campo: 'retencao', rotulo: 'Retenção', opcional: true },
      {
        campo: 'teste',
        rotulo: 'Frequência do teste de restauração',
        opcoes: ['semanal', 'diario'],
        opcional: true,
      },
    ],
    comando: (c) => [
      'backup',
      'configurar',
      ...opcoesPreenchidas(c, [
        ['destinos', '--destinos'],
        ['janela', '--janela'],
        ['retencao', '--retencao'],
        ['teste', '--teste-de-restauracao'],
      ]),
    ],
  },
  {
    id: 'certificado-configurar',
    rotulo: 'Configurar o certificado',
    campos: [
      { campo: 'modo', rotulo: 'Modo', opcoes: ['interno', 'publico'] },
      { campo: 'ac', rotulo: 'AC', opcoes: ['caddy', 'empresa'], opcional: true },
      { campo: 'email', rotulo: "E-mail da conta do Let's Encrypt", opcional: true },
      { campo: 'certificado', rotulo: 'Arquivo do certificado', opcional: true },
      { campo: 'chave', rotulo: 'Arquivo da chave', opcional: true },
    ],
    comando: (c) => [
      'certificado',
      'configurar',
      '--modo',
      c.modo ?? '',
      ...opcoesPreenchidas(c, [
        ['ac', '--ac'],
        ['email', '--email'],
        ['certificado', '--certificado'],
        ['chave', '--chave'],
      ]),
    ],
  },
  {
    id: 'enderecos-acrescentar',
    rotulo: 'Acrescentar um endereço',
    campos: [{ campo: 'endereco', rotulo: 'Endereço da produção' }],
    comando: (c) => ['enderecos', 'acrescentar', c.endereco ?? ''],
  },
  {
    id: 'enderecos-tirar',
    rotulo: 'Tirar um endereço',
    campos: [{ campo: 'endereco', rotulo: 'Endereço da produção' }],
    comando: (c) => ['enderecos', 'tirar', c.endereco ?? ''],
  },
  {
    id: 'conta-criar',
    rotulo: 'Criar uma conta',
    campos: [
      AMBIENTE,
      ENDERECO_DA_ORGANIZACAO,
      { campo: 'pessoa', rotulo: 'Nome da pessoa' },
      { campo: 'usuario', rotulo: 'Usuário da conta' },
      { campo: 'email', rotulo: 'E-mail da pessoa', opcional: true },
      { campo: 'administrador', rotulo: 'A pessoa é administradora?', opcoes: SIM_OU_NAO },
    ],
    comando: doMenu('Criar uma conta'),
  },
  {
    id: 'conta-redefinir',
    rotulo: 'Redefinir um acesso',
    campos: [
      AMBIENTE,
      ENDERECO_DA_ORGANIZACAO,
      { campo: 'usuario', rotulo: 'Usuário da conta' },
      {
        campo: 'doisPassos',
        rotulo: 'Remover também a verificação em dois passos?',
        opcoes: SIM_OU_NAO,
      },
    ],
    comando: doMenu('Redefinir um acesso'),
  },
  {
    id: 'restaurar',
    rotulo: 'Restaurar a produção',
    sensivel: true,
    campos: [{ campo: 'backup', rotulo: 'Backup' }],
    comando: (c) => ['restaurar', c.backup ?? '', '--ambiente', 'producao'],
  },
  {
    id: 'voltar',
    rotulo: 'Voltar à versão anterior',
    sensivel: true,
    campos: [AMBIENTE],
    comando: (c) => ['voltar', '--ambiente', c.ambiente ?? ''],
  },
  {
    id: 'cofre-trocar-chave',
    rotulo: 'Trocar a chave do cofre',
    sensivel: true,
    campos: [],
    comando: () => ['cofre', 'trocar-chave'],
  },
];

/** Os argumentos da linha de comando da tarefa, com os campos conferidos. */
export function argumentosDaTarefa(id: string, recebidos: Campos): string[] {
  const tarefa = TAREFAS_DO_PAINEL.find((candidata) => candidata.id === id);
  if (tarefa === undefined) throw new Error(`O painel não tem a tarefa ${id}.`);
  const campos: Campos = {};
  for (const { campo, rotulo, opcoes, opcional } of tarefa.campos) {
    const valor = (recebidos[campo] ?? '').trim();
    if (valor === '') {
      if (!opcional) throw new Error(`Preencha "${rotulo}".`);
    } else if (opcoes !== undefined && !opcoes.includes(valor)) {
      throw new Error(`"${rotulo}" deve ser ${opcoes.join(' ou ')}.`);
    }
    campos[campo] = valor;
  }
  return tarefa.comando(campos);
}

export interface ExecutorDeTarefas {
  /** Começa a tarefa, ou diz por que ela não começou. */
  iniciar(id: string, campos: Campos): { iniciada: string } | { recusada: string };
  /** O rótulo da tarefa que roda, ou `null`. */
  emAndamento(): string | null;
  responder(idDaPergunta: string, resposta: string): boolean;
  cancelar(): void;
  /** Espera a última tarefa terminar. */
  terminada(): Promise<void>;
}

export function executorDeTarefas({
  canal,
  rodar,
}: {
  canal: CanalDeEventos;
  /** Roda o comando com os argumentos, pelo console do painel, e devolve o código de saída. */
  rodar: (argumentos: string[], console: ConsoleDoPainel) => Promise<number>;
}): ExecutorDeTarefas {
  let atual: { rotulo: string; console: ConsoleDoPainel } | null = null;
  let ultima: Promise<void> = Promise.resolve();
  return {
    iniciar(id, campos) {
      const tarefa = TAREFAS_DO_PAINEL.find((candidata) => candidata.id === id);
      if (tarefa === undefined) return { recusada: `O painel não tem a tarefa ${id}.` };
      if (atual !== null) {
        return {
          recusada: `"${atual.rotulo}" está rodando: "${tarefa.rotulo}" espera ela terminar.`,
        };
      }
      let argumentos: string[];
      try {
        argumentos = argumentosDaTarefa(id, campos);
      } catch (erro) {
        return { recusada: mensagemDe(erro) };
      }
      const { rotulo } = tarefa;
      canal.comecar(rotulo);
      const console = consoleDoPainel({ tarefa: rotulo, emitir: (evento) => canal.emitir(evento) });
      atual = { rotulo, console };
      ultima = rodar(argumentos, console)
        .catch((erro: unknown) => {
          canal.emitir({ tipo: 'andamento', tarefa: rotulo, texto: mensagemDe(erro), erro: true });
          return 1;
        })
        .then((codigo) => {
          atual = null;
          canal.emitir({
            tipo: 'fim',
            tarefa: rotulo,
            codigo,
            resultado:
              codigo === 0 ? `Pronto: ${rotulo}.` : `${rotulo} não terminou: o motivo está acima.`,
          });
        });
      return { iniciada: rotulo };
    },
    emAndamento: () => atual?.rotulo ?? null,
    responder: (idDaPergunta, resposta) =>
      atual?.console.responder(idDaPergunta, resposta) ?? false,
    cancelar() {
      atual?.console.cancelar();
    },
    terminada: () => ultima,
  };
}
