// O protocolo do agente do GLPI (spec inventario-pelo-agente, "Protocolo do agente do GLPI"; change
// inventario-pelo-agente-glpi, design, decisões 1 e 2): o CONTACT e o INVENTORY em JSON, com o corpo
// comprimido pelo zlib ou pelo gzip, ou puro, até 20 MB. A rota fica fora da sessão: a organização
// vem do endereço de acesso, e o token, do caminho. As respostas seguem o formato que o agente lê.
// O PROLOG em XML, que o agente manda primeiro a um servidor novo, é respondido em JSON, como o
// servidor do GLPI faz, para o agente passar ao protocolo JSON (change prolog-do-agente-glpi).
// O Deploy (spec distribuicao-de-software, "Deploy pelo agente do GLPI"; change
// distribuicao-de-software, design, decisão 2) vem por GET no mesmo endereço, com a `action` na query,
// e as partes do arquivo, no espelho `<endereço>/partes/<a>/<ab>/<sha512>`.
import { gunzipSync, inflateSync } from 'node:zlib';
import { type Banco, naOrganizacao, partesDosPacotes } from '@grafite/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { exigirOrganizacao, type ResolvedorDeOrganizacao } from '../acesso/organizacao.ts';
import { receberInventario, registrarContato, tokenEmVigor } from '../agentes/agentes.ts';
import { type Armazenamento, chaveDaParteDoPacote } from '../arquivos/armazenamento.ts';
import { gravarPassoDoDeploy, jobsDoAgente, lerPassoDoDeploy } from '../software/deploy.ts';

const LIMITE_DO_CORPO = 20 * 1024 * 1024;
const TIPOS_DO_CORPO = [
  'application/x-compress-zlib',
  'application/x-compress-gzip',
  'application/json',
  'application/xml',
  'text/xml',
];
const CORPO_GRANDE = Symbol('corpo descomprimido acima do limite');

/** De quanto em quanto tempo o agente volta a falar, em horas. */
export const PRAZO_DO_AGENTE_EM_HORAS = 24;

/** As tarefas que o Grafite atende, e as do agente que ele desliga. */
const TAREFAS = {
  inventory: { server: 'glpi', version: '1.0' },
  deploy: { server: 'glpi', version: '1.0' },
};
const DESLIGADAS = ['netdiscovery', 'netinventory', 'esx', 'collect', 'wakeonlan'];
const SHA512 = /^[0-9a-f]{128}$/;

/** O corpo do agente em texto, descomprimido pelo tipo; o que não descomprime, `null`. */
function textoDoCorpo(
  tipo: string | undefined,
  corpo: unknown,
): string | null | typeof CORPO_GRANDE {
  if (!Buffer.isBuffer(corpo)) return null;
  try {
    const claro = tipo?.startsWith('application/x-compress-zlib')
      ? inflateSync(corpo, { maxOutputLength: LIMITE_DO_CORPO })
      : tipo?.startsWith('application/x-compress-gzip')
        ? gunzipSync(corpo, { maxOutputLength: LIMITE_DO_CORPO })
        : corpo;
    return claro.toString('utf8');
  } catch (erro) {
    if (erro instanceof Error && 'code' in erro && erro.code === 'ERR_BUFFER_TOO_LARGE')
      return CORPO_GRANDE;
    return null;
  }
}

/** O JSON do agente como objeto; fora do protocolo, `null`. */
function lerJson(texto: string | null): Record<string, unknown> | null {
  if (texto === null) return null;
  try {
    const lido: unknown = JSON.parse(texto);
    return typeof lido === 'object' && lido !== null && !Array.isArray(lido)
      ? (lido as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** O PROLOG em XML do agente: o XML com a QUERY PROLOG. */
const ehProlog = (texto: string | null) =>
  texto?.trimStart().startsWith('<') === true && /<QUERY>\s*PROLOG\s*<\/QUERY>/i.test(texto);

const texto = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;

export async function instalarAgentesDoGlpi(
  app: FastifyInstance,
  {
    banco,
    agora,
    resolver,
    armazenamento,
    organizacaoOperadora,
  }: {
    banco: Banco;
    agora: () => Date;
    resolver: ResolvedorDeOrganizacao;
    armazenamento: Armazenamento;
    organizacaoOperadora?: string;
  },
) {
  await app.register(async (escopo) => {
    exigirOrganizacao(escopo, resolver, organizacaoOperadora);
    escopo.removeContentTypeParser('application/json');
    escopo.addContentTypeParser(
      TIPOS_DO_CORPO,
      { parseAs: 'buffer', bodyLimit: LIMITE_DO_CORPO },
      (_requisicao, corpo, feito) => feito(null, corpo),
    );

    // O caminho tem o token: a rota não entra no log de cada requisição.
    escopo.post(
      '/agentes/glpi/:token',
      { logLevel: 'warn', schema: { hide: true } },
      async (requisicao, resposta) => {
        const recusa = (codigo: number, message: string) =>
          resposta.code(codigo).type('application/json').send({ status: 'error', message });
        const orgId = requisicao.organizacao?.id ?? '';
        const { token = '' } = requisicao.params as { token?: string };
        const conteudo = textoDoCorpo(requisicao.headers['content-type'], requisicao.body);
        if (conteudo === CORPO_GRANDE) return recusa(413, 'O inventário excede o limite de 20 MB.');
        if (ehProlog(conteudo)) {
          if (!(await naOrganizacao(banco, orgId, (tx) => tokenEmVigor(tx, token)))) {
            return recusa(403, 'Endereço dos agentes desconhecido ou desligado.');
          }
          return resposta
            .type('application/json')
            .send({ status: 'ok', expiration: PRAZO_DO_AGENTE_EM_HORAS });
        }
        const corpo = lerJson(conteudo);
        const deviceid = texto(corpo?.deviceid);
        if (!corpo || !deviceid || deviceid.length > 200) {
          return recusa(400, 'Pedido fora do protocolo do agente do GLPI.');
        }
        if (!(await naOrganizacao(banco, orgId, (tx) => tokenEmVigor(tx, token)))) {
          return recusa(403, 'Endereço dos agentes desconhecido ou desligado.');
        }
        const momento = agora();
        if (corpo.action === 'contact') {
          await naOrganizacao(banco, orgId, (tx) =>
            registrarContato(tx, {
              orgId,
              deviceid,
              versao: texto(corpo.version),
              ip: requisicao.ip,
              momento,
            }),
          );
          return resposta.type('application/json').send({
            status: 'ok',
            expiration: PRAZO_DO_AGENTE_EM_HORAS,
            tasks: TAREFAS,
            disabled: DESLIGADAS,
          });
        }
        if (corpo.action === 'inventory') {
          await naOrganizacao(banco, orgId, (tx) =>
            receberInventario(tx, {
              orgId,
              deviceid,
              conteudo: corpo.content,
              parcial: corpo.partial === true,
              itemtype: texto(corpo.itemtype),
              ip: requisicao.ip,
              momento,
              avisar: (dados, mensagem) => requisicao.log.warn(dados, mensagem),
            }),
          );
          return resposta
            .type('application/json')
            .send({ status: 'ok', expiration: PRAZO_DO_AGENTE_EM_HORAS });
        }
        return recusa(400, 'Ação desconhecida do agente do GLPI.');
      },
    );

    // O Deploy: o cliente "Fusion" do agente pede por GET, com os argumentos na query.
    escopo.get(
      '/agentes/glpi/:token',
      { logLevel: 'warn', schema: { hide: true } },
      async (requisicao, resposta) => {
        const recusa = (codigo: number, message: string) =>
          resposta.code(codigo).type('application/json').send({ status: 'error', message });
        const orgId = requisicao.organizacao?.id ?? '';
        const { token = '' } = requisicao.params as { token?: string };
        const query = requisicao.query as Record<string, unknown>;
        const deviceid = texto(query.machineid);
        if (!deviceid || deviceid.length > 200) {
          return recusa(400, 'Pedido fora do protocolo do agente do GLPI.');
        }
        if (!(await naOrganizacao(banco, orgId, (tx) => tokenEmVigor(tx, token)))) {
          return recusa(403, 'Endereço dos agentes desconhecido ou desligado.');
        }
        // O endereço como a tela o gerou e o agente o chama, com o /api: no desenvolvimento, o
        // proxy da web tira o /api antes de a API ver o caminho.
        const endereco = `${requisicao.protocol}://${requisicao.host}/api/agentes/glpi/${token}`;
        const momento = agora();
        resposta.type('application/json');
        if (query.action === 'getConfig') {
          return { schedule: [{ task: 'Deploy', remote: endereco }] };
        }
        if (query.action === 'getJobs') {
          return naOrganizacao(banco, orgId, (tx) =>
            jobsDoAgente(tx, { deviceid, espelho: `${endereco}/partes/`, momento }),
          );
        }
        if (query.action === 'setStatus') {
          await naOrganizacao(banco, orgId, (tx) =>
            gravarPassoDoDeploy(tx, { deviceid, passo: lerPassoDoDeploy(query), momento }),
          );
        }
        return {};
      },
    );

    // As partes do arquivo dos pacotes da organização, prontas: comprimidas pelo gzip. O SHA-512
    // passa dos 100 caracteres que o Fastify aceita num parâmetro: o fim do caminho vem no curinga.
    escopo.get(
      '/agentes/glpi/:token/partes/*',
      { logLevel: 'warn', schema: { hide: true } },
      async (requisicao, resposta) => {
        const orgId = requisicao.organizacao?.id ?? '';
        const { token = '', '*': resto = '' } = requisicao.params as Record<
          string,
          string | undefined
        >;
        const [a = '', ab = '', sha512 = '', ...sobra] = resto.split('/');
        if (
          sobra.length > 0 ||
          !SHA512.test(sha512) ||
          a !== sha512.slice(0, 1) ||
          ab !== sha512.slice(0, 2)
        ) {
          return resposta.code(404).send();
        }
        const parte = await naOrganizacao(banco, orgId, async (tx) => {
          if (!(await tokenEmVigor(tx, token))) return 'recusada' as const;
          const [linha] = await tx
            .select({ pacoteId: partesDosPacotes.pacoteId, indice: partesDosPacotes.indice })
            .from(partesDosPacotes)
            .where(eq(partesDosPacotes.sha512, sha512))
            .limit(1);
          return linha ?? null;
        });
        if (parte === 'recusada') return resposta.code(403).send();
        const conteudo =
          parte &&
          (await armazenamento.abrir(chaveDaParteDoPacote(orgId, parte.pacoteId, parte.indice)));
        if (!conteudo) return resposta.code(404).send();
        return resposta.type('application/octet-stream').send(conteudo);
      },
    );
  });
}
