// O estado e os eventos da aba (spec aba-dos-colaboradores, "Estado da aba" e "Auditoria e eventos
// da aba"; change aba-dos-colaboradores, design, decisão 6), com o token da sessão da aba:
// - `GET /api/aba/estado`: as não lidas do chat, os chamados com resposta nova e a versão da
//   configuração, que a aba lê ao abrir, a cada evento e a cada 60 s sem a conexão;
// - `GET /api/aba/eventos`: o text/event-stream da aba, pelo mesmo distribuidor das telas, com o
//   público da conta, da sessão da aba e do aparelho. Só vão os tipos que mudam o estado da aba, com
//   a marca `deMuitos` dos que chegam a muita gente de uma vez, para a aba reler com o atraso
//   sorteado. O sinal de vida é de 10 s; o fim da sessão da aba manda `sessao` e fecha.
import { type Banco, configuracoesDaAba, naOrganizacao } from '@grafite/db';
import {
  type EventoDeSaida,
  eventoDeMuitos,
  pode,
  type TipoDeEvento,
  totalDoChat,
} from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  LIMITE_POR_TOKEN_DA_ABA,
  sessaoDoToken,
  tokenDaAbaRecusado,
  tokenDoCabecalho,
} from '../aba/escopo.ts';
import { carregarAcesso, carregarGrupos } from '../acesso/acesso.ts';
import { ligadoNaTransacao } from '../acesso/modulos.ts';
import type { ConexaoDeEventos, DistribuidorDeEventos } from '../eventos/distribuidor.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { chamadosComResposta, conversasDaConta } from './chat.ts';

export interface IntervalosDosEventosDaAba {
  /** De quanto em quanto tempo vai o sinal de vida: a aba fica sem conexão sem ele por 30 s. */
  sinalDeVida: number;
  /** De quanto em quanto tempo a sessão da aba é conferida. */
  conferencia: number;
}

const INTERVALOS: IntervalosDosEventosDaAba = { sinalDeVida: 10_000, conferencia: 60_000 };

/** Quantas conexões de eventos uma sessão da aba abre de uma vez. */
export const CONEXOES_POR_SESSAO_DA_ABA = 3;

/** Os tipos que mudam o estado da aba; o `sessao.encerrada` só vai com a sessão da aba dela. */
const TIPOS_DA_ABA: ReadonlySet<TipoDeEvento> = new Set<TipoDeEvento>([
  'chat.mudou',
  'chamados.mudaram',
  'configuracao-da-aba.mudou',
  'entrada-da-aba.mudou',
  'bloqueio-da-aba.mudou',
]);

const EstadoDaAba = z
  .object({
    /** As não lidas do chat; `null` sem o chat ligado ou sem o `chat.usar`. */
    naoLidas: z.number().int().nullable(),
    /** Os chamados da pessoa com resposta nova; `null` com os chamados desligados. */
    respostasNovas: z.number().int().nullable(),
    versaoDaConfiguracao: z.number().int(),
  })
  .meta({ id: 'EstadoDaAba' });

const PROBLEMAS = {
  401: RespostaDeProblema,
  403: RespostaDeProblema,
  429: RespostaDeProblema,
};

const conexoesDemais = () =>
  new ProblemaDaApi({
    codigo: 'conexoes-demais',
    status: 429,
    titulo: 'Conexões demais',
    detalhe: `Esta sessão da aba já tem ${CONEXOES_POR_SESSAO_DA_ABA} conexões de eventos abertas.`,
  });

/** Uma mensagem no formato text/event-stream. */
function mensagem({ id, evento, dados }: { id?: string; evento: string; dados: unknown }) {
  return `${id ? `id: ${id}\n` : ''}event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
}

export interface DependenciasDoEstadoDaAba {
  banco: Banco;
  agora: () => Date;
  distribuidor: DistribuidorDeEventos;
  intervalos?: Partial<IntervalosDosEventosDaAba>;
}

export const rotasDoEstadoDaAba: FastifyPluginAsyncZod<DependenciasDoEstadoDaAba> = async (
  app,
  { banco, agora, distribuidor, intervalos },
) => {
  const { sinalDeVida, conferencia } = { ...INTERVALOS, ...intervalos };
  const abertas = new Set<() => void>();
  const porSessao = new Map<string, number>();

  app.addHook('preClose', async () => {
    for (const fechar of [...abertas]) fechar();
  });

  app.get(
    '/aba/estado',
    {
      config: { daSessaoDaAba: true, rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'O estado da aba: as não lidas, as respostas novas e a versão da configuração',
        response: { 200: EstadoDaAba, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { sessaoDaAba: sessao, organizacao } = requisicao;
      if (!sessao || !organizacao) throw tokenDaAbaRecusado();
      return naOrganizacao(banco, organizacao.id, async (tx) => {
        const acesso = await carregarAcesso(tx, sessao.contaId);
        const usaOChat = (await ligadoNaTransacao(tx, 'chat')) && pode(acesso, 'chat.usar');
        const [configuracao] = await tx
          .select({ versao: configuracoesDaAba.versao })
          .from(configuracoesDaAba);
        return {
          naoLidas: usaOChat ? totalDoChat(await conversasDaConta(tx, sessao.contaId)) : null,
          respostasNovas: (await ligadoNaTransacao(tx, 'chamados'))
            ? await chamadosComResposta(tx, { contaId: sessao.contaId, acesso })
            : null,
          versaoDaConfiguracao: configuracao?.versao ?? 0,
        };
      });
    },
  );

  app.get(
    '/aba/eventos',
    {
      config: { daSessaoDaAba: true, rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'A conexão de eventos da aba, em text/event-stream',
        response: {
          200: {
            description: 'O fluxo dos eventos da aba, com o sinal de vida',
            content: { 'text/event-stream': { schema: z.string() } },
          },
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao, resposta) => {
      const { sessaoDaAba: sessao, aparelhoDaAba: aparelho, organizacao } = requisicao;
      if (!sessao || !aparelho || !organizacao) throw tokenDaAbaRecusado();
      const orgId = organizacao.id;
      const token = tokenDoCabecalho(requisicao.headers.authorization) ?? '';
      const { acesso, grupos } = await naOrganizacao(banco, orgId, async (tx) => ({
        acesso: await carregarAcesso(tx, sessao.contaId),
        grupos: await carregarGrupos(tx, sessao.contaId),
      }));
      const daSessao = porSessao.get(sessao.id) ?? 0;
      if (daSessao >= CONEXOES_POR_SESSAO_DA_ABA) throw conexoesDemais();
      porSessao.set(sessao.id, daSessao + 1);

      resposta.hijack();
      const saida = resposta.raw;
      saida.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
        'x-codigo-de-rastreio': requisicao.id,
      });
      saida.write('retry: 3000\n\n');

      let fechada = false;
      const escrever = (texto: string) => {
        if (!fechada) saida.write(texto);
      };
      const terminar = () => {
        escrever(mensagem({ evento: 'sessao', dados: {} }));
        fechar();
      };
      const conexao: ConexaoDeEventos = {
        orgId,
        contaId: sessao.contaId,
        // A conexão da aba não tem linha nas `sessoes`: um valor que nenhum público tem.
        sessaoId: `aba:${sessao.id}`,
        sessaoDaAbaId: sessao.id,
        aparelhoId: aparelho.id,
        acesso,
        grupos,
        enviar: (evento: EventoDeSaida) => {
          if (evento.tipo === 'sessao.encerrada') {
            if (evento.publico.sessoesDaAba?.includes(sessao.id)) terminar();
            return;
          }
          if (!TIPOS_DA_ABA.has(evento.tipo)) return;
          const { id, tipo, momento, alvo } = evento;
          escrever(
            mensagem({
              id,
              evento: tipo,
              dados: { id, tipo, momento, alvo, deMuitos: eventoDeMuitos(evento.publico, conexao) },
            }),
          );
        },
        reiniciar: () => escrever(mensagem({ evento: 'reiniciar', dados: {} })),
      };
      const sair = distribuidor.entrar(conexao);
      const vivo = setInterval(() => escrever(': vivo\n\n'), sinalDeVida);
      // A sessão vencida, encerrada ou parada, e o aparelho bloqueado, encerram a conexão; a falha
      // de leitura não.
      const conferir = setInterval(async () => {
        const atual = await sessaoDoToken(banco, orgId, token, agora()).catch((erro: unknown) => {
          requisicao.log.warn({ err: erro }, 'não foi possível conferir a sessão da aba');
          return undefined;
        });
        if (atual === undefined) return;
        if (atual === null || atual === 'bloqueado' || 'encerrada' in atual) terminar();
      }, conferencia);

      function fechar() {
        if (fechada) return;
        fechada = true;
        clearInterval(vivo);
        clearInterval(conferir);
        sair();
        abertas.delete(fechar);
        const restantes = (porSessao.get(sessao?.id ?? '') ?? 1) - 1;
        if (restantes > 0) porSessao.set(sessao?.id ?? '', restantes);
        else porSessao.delete(sessao?.id ?? '');
        saida.end();
      }
      abertas.add(fechar);
      saida.on('close', fechar);
      if (saida.destroyed) fechar();
    },
  );
};
