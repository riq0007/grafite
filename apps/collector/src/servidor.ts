// Ponto de entrada do coletor. A configuração vem do ambiente e é validada antes de tudo; depois, o
// servidor local responde a saúde, e o coletor busca na API o que coletar.
import pacote from '../package.json' with { type: 'json' };
import { criarClienteDaApi } from './api.ts';
import { criarApp } from './app.ts';
import { type Coletor, criarColetor } from './coletor.ts';
import { type Configuracao, carregarConfiguracao, ErroDeConfiguracao } from './config.ts';
import { criarBuscaDePedidos } from './pedidos.ts';
import { lerImpressora } from './snmp.ts';

let config: Configuracao;
try {
  config = carregarConfiguracao(process.env);
} catch (erro) {
  if (erro instanceof ErroDeConfiguracao) {
    console.error(erro.message);
    process.exit(1);
  }
  throw erro;
}

let coletor: Coletor | undefined;
const app = criarApp({
  versao: pacote.version,
  logger: true,
  estado: () => (coletor as Coletor).estado(),
});
const cliente = criarClienteDaApi({
  urlDaApi: config.urlDaApi,
  endereco: config.endereco,
  token: config.token,
  versao: pacote.version,
});
coletor = criarColetor({
  api: cliente,
  pasta: config.pasta,
  log: app.log,
  snmp: (pedido) => lerImpressora({ ...pedido, porta: config.portaDoSnmp }),
});

await app.listen({ port: config.porta, host: config.host });
await coletor.iniciar();
// Os pedidos de trabalho, como o backup do Control iD (change p5a-backup-do-control-id).
const pedidos = criarBuscaDePedidos({ api: cliente, log: app.log });
pedidos.iniciar();

async function encerrar() {
  await pedidos.parar();
  await coletor?.parar();
  await app.close();
}
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);
