// O servidor simulado do painel (change painel-da-operacao, design, decisão 10): o mesmo servidor, a
// mesma sessão, as mesmas rotas e o mesmo executor de tarefas do comando de verdade, com o servidor
// de mentira do dominio.ts. Ele serve a página compilada, nas pontas a ponta, ou só a API, para o
// servidor da página no desenvolvimento. Rodado direto, ele sobe com os argumentos:
//   node simulado/servidor.ts --porta 4311 --pagina dist --codigo <código>
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { servicosDaInstalacao } from '../../operacao/src/layout.ts';
import { rotasDoPainel, tarefasComCanal } from '../../operacao/src/painel/painel.ts';
import {
  type ArquivoDaPagina,
  abrirServidorDoPainel,
  lerPagina,
  type ServidorDoPainel,
} from '../../operacao/src/painel/servidor.ts';
import { comSessao, criarSessao } from '../../operacao/src/painel/sessao.ts';
import { type CenarioSimulado, criarDominioSimulado } from './dominio.ts';

export async function abrirServidorSimulado({
  porta,
  pagina = new Map(),
  codigo,
  origemDoDesenvolvimento,
  cenario = {},
}: {
  porta?: number;
  pagina?: ReadonlyMap<string, ArquivoDaPagina>;
  codigo?: string;
  origemDoDesenvolvimento?: string;
  cenario?: CenarioSimulado;
}): Promise<ServidorDoPainel & { codigo: string }> {
  const dominio = criarDominioSimulado(cenario);
  const sessao = criarSessao(codigo);
  const { canal, executor } = tarefasComCanal(dominio.rodar);
  const servidor = await abrirServidorDoPainel({
    pagina,
    api: comSessao(
      sessao,
      rotasDoPainel({
        estado: async () => dominio.estado(),
        executor,
        canal,
        servicos: new Set(servicosDaInstalacao().map(({ id }) => id)),
        logs: async (servico, pedido) => dominio.logs(servico, pedido),
        pacotes: async () => dominio.pacotes(),
        backups: async () => dominio.backups(),
        configuracoes: async () => dominio.configuracoes(),
      }),
    ),
    ...(porta === undefined ? {} : { porta }),
    ...(origemDoDesenvolvimento === undefined ? {} : { origemDoDesenvolvimento }),
  });
  return { ...servidor, codigo: sessao.codigo };
}

// Rodado direto: o servidor das pontas a ponta, com a página compilada.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { values } = parseArgs({
    options: {
      porta: { type: 'string' },
      pagina: { type: 'string' },
      codigo: { type: 'string' },
      espera: { type: 'string' },
    },
  });
  const servidor = await abrirServidorSimulado({
    ...(values.porta === undefined ? {} : { porta: Number(values.porta) }),
    ...(values.pagina === undefined ? {} : { pagina: await lerPagina(resolve(values.pagina)) }),
    ...(values.codigo === undefined ? {} : { codigo: values.codigo }),
    cenario: { esperaMs: Number(values.espera ?? 300) },
  });
  console.log(`Painel simulado: ${servidor.endereco}/#${servidor.codigo}`);
}
