// A conexão de eventos (spec eventos-em-tempo-real; design do F2c, decisão 11): GET /api/eventos,
// um fluxo text/event-stream só para a sessão que vale. Cada evento vai como `id`, `event` (o tipo)
// e `data` (o id, o tipo, o momento e o alvo, sem o público); `reiniciar` manda a tela reler tudo,
// e `sessao`, que a sessão terminou. Um comentário a cada 25 s é o sinal de vida, e a cada 60 s a
// sessão é conferida sem contar como uso. A conexão termina com a sessão e com o fechamento da API.
// Com o último evento recebido, pelo Last-Event-ID ou por ?desde=, ela começa pelos perdidos.
import { type Banco, naOrganizacao } from '@grafite/db';
import { type EventoDeSaida, podeReceber, type TipoDeEvento } from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carregarGrupos } from '../acesso/acesso.ts';
import { exigirAtiva, sessaoDa } from '../acesso/escopo.ts';
import { lerSessao, NOME_DO_COOKIE } from '../acesso/sessoes.ts';
import { lerArvore } from '../arvore.ts';
import type { ConexaoDeEventos, DistribuidorDeEventos } from '../eventos/distribuidor.ts';
import { eventosPerdidos } from '../eventos/retomada.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

export interface IntervalosDosEventos {
  /** De quanto em quanto tempo vai o sinal de vida. */
  sinalDeVida: number;
  /** De quanto em quanto tempo a sessão é conferida. */
  conferencia: number;
}

const INTERVALOS: IntervalosDosEventos = { sinalDeVida: 25_000, conferencia: 60_000 };

export const CONEXOES_POR_SESSAO = 20;

/**
 * Os tipos que a conexão da sessão do chat na aba recebe (change aba-dos-colaboradores, decisão 8):
 * os que o chat relê, os da sessão, das preferências e dos padrões que o `/api/sessao` traz, e o fim
 * da sessão.
 */
export const TIPOS_DO_CHAT_NA_ABA: ReadonlySet<TipoDeEvento> = new Set<TipoDeEvento>([
  'chat.mudou',
  'chamados.mudaram',
  'ajustes-dos-chamados.mudaram',
  'pessoas.mudaram',
  'acessos.mudaram',
  'modulos.mudaram',
  'preferencias.mudaram',
  'padroes.mudaram',
  'sessao.encerrada',
]);

const conexoesDemais = () =>
  new ProblemaDaApi({
    codigo: 'conexoes-demais',
    status: 429,
    titulo: 'Conexões demais',
    detalhe: `Esta sessão já tem ${CONEXOES_POR_SESSAO} conexões de eventos abertas. Feche outras abas e tente de novo.`,
  });

/** Uma mensagem no formato text/event-stream. */
function mensagem({ id, evento, dados }: { id?: string; evento: string; dados: unknown }) {
  return `${id ? `id: ${id}\n` : ''}event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
}

/** O evento como a tela o recebe: sem o público, que diz quem mais o recebe. */
const doEvento = ({ id, tipo, momento, alvo }: EventoDeSaida) =>
  mensagem({ id, evento: tipo, dados: { id, tipo, momento, alvo } });

export interface DependenciasDosEventos {
  banco: Banco;
  agora: () => Date;
  distribuidor: DistribuidorDeEventos;
  intervalos?: Partial<IntervalosDosEventos>;
}

export const rotasDosEventos: FastifyPluginAsyncZod<DependenciasDosEventos> = async (
  app,
  { banco, agora, distribuidor, intervalos },
) => {
  const { sinalDeVida, conferencia } = { ...INTERVALOS, ...intervalos };
  const abertas = new Set<() => void>();
  const porSessao = new Map<string, number>();

  // Antes de o servidor parar de atender: sem fechar as conexões, ele esperaria por elas.
  app.addHook('preClose', async () => {
    for (const fechar of [...abertas]) fechar();
  });

  app.get(
    '/eventos',
    {
      config: { semPermissao: 'propria-conta', naoContaComoUso: true, chatDaAba: true },
      preHandler: exigirAtiva,
      schema: {
        summary: 'A conexão de eventos da sessão, em text/event-stream',
        querystring: z.object({
          /** O último evento recebido, quando a tela reabre a conexão sem o Last-Event-ID. */
          desde: z.string().max(100).optional(),
        }),
        response: {
          200: {
            description: 'O fluxo dos eventos, com o sinal de vida',
            content: { 'text/event-stream': { schema: z.string() } },
          },
          401: RespostaDeProblema,
          ...PROBLEMAS_DO_ACESSO,
        },
      },
    },
    async (requisicao, resposta) => {
      const sessao = sessaoDa(requisicao);
      const orgId = requisicao.organizacao?.id ?? '';
      const token = requisicao.cookies[NOME_DO_COOKIE] ?? '';
      // Os grupos da conta, que a equipe do chat pede (change chat-com-chamados, design, decisão 4),
      // lidos antes da contagem, que fica sem espera entre a conferência e a soma.
      const grupos = await naOrganizacao(banco, orgId, (tx) => carregarGrupos(tx, sessao.contaId));
      const daSessao = porSessao.get(sessao.id) ?? 0;
      if (daSessao >= CONEXOES_POR_SESSAO) throw conexoesDemais();
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
      const entregar = (evento: EventoDeSaida) => {
        if (sessao.naAba && !TIPOS_DO_CHAT_NA_ABA.has(evento.tipo)) return;
        escrever(doEvento(evento));
        if (evento.tipo === 'sessao.encerrada' && evento.publico.sessoes?.includes(sessao.id)) {
          fechar();
        }
      };
      const ultimo = requisicao.headers['last-event-id'] ?? requisicao.query.desde;
      // Durante a retomada, os eventos ao vivo esperam: saem depois dos perdidos, sem repetir.
      let aoVivo: EventoDeSaida[] | null = ultimo === undefined ? null : [];
      const conexao: ConexaoDeEventos = {
        orgId,
        contaId: sessao.contaId,
        sessaoId: sessao.id,
        acesso: sessao.acesso,
        grupos,
        enviar: (evento) => {
          if (aoVivo) aoVivo.push(evento);
          else entregar(evento);
        },
        reiniciar: () => escrever(mensagem({ evento: 'reiniciar', dados: {} })),
      };
      const sair = distribuidor.entrar(conexao);
      const vivo = setInterval(() => escrever(': vivo\n\n'), sinalDeVida);
      // A sessão que expirou, ou que ficou pendente, encerra a conexão; a falha de leitura não.
      const conferir = setInterval(async () => {
        const atual = await lerSessao(banco, {
          orgId,
          token,
          agora: agora(),
          tocar: false,
          alcances: [sessao.naAba ? 'chat-da-aba' : 'comum'],
        }).catch((erro: unknown) => {
          requisicao.log.warn({ err: erro }, 'não foi possível conferir a sessão dos eventos');
          return undefined;
        });
        if (atual === null || (atual && atual.pendencia !== null)) {
          escrever(mensagem({ evento: 'sessao', dados: {} }));
          fechar();
        }
      }, conferencia);

      function fechar() {
        if (fechada) return;
        fechada = true;
        clearInterval(vivo);
        clearInterval(conferir);
        sair();
        abertas.delete(fechar);
        const restantes = (porSessao.get(sessao.id) ?? 1) - 1;
        if (restantes > 0) porSessao.set(sessao.id, restantes);
        else porSessao.delete(sessao.id);
        saida.end();
      }
      abertas.add(fechar);
      saida.on('close', fechar);
      // O fim chega uma vez só: o cliente que saiu enquanto a abertura lia o banco não o manda de novo.
      if (saida.destroyed) fechar();

      if (typeof ultimo === 'string') {
        const retomados = await naOrganizacao(banco, orgId, async (tx) => {
          const perdidos = await eventosPerdidos(tx, ultimo, agora());
          if (!perdidos) return null;
          const arvore = await lerArvore(tx);
          return perdidos.filter((evento) => podeReceber(evento, conexao, arvore));
        }).catch((erro: unknown) => {
          requisicao.log.warn({ err: erro }, 'não foi possível retomar os eventos');
          return null;
        });
        if (retomados) for (const evento of retomados) entregar(evento);
        else conexao.reiniciar();
        const enviados = new Set(retomados?.map((evento) => evento.id));
        const esperando = aoVivo ?? [];
        aoVivo = null;
        for (const evento of esperando) if (!enviados.has(evento.id)) entregar(evento);
      }
    },
  );
};
