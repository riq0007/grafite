// A entrega das notificações pela fila (spec notificacoes, "E-mail do crítico na hora", "Push por
// severidade" e "Aparelhos do push"; change p3c-email-e-push, design, decisões 2 a 4): o
// `notificar` põe a entrega na fila, na transação dele; a entrega decide os canais de cada
// notificação e põe um envio por destino, com as marcas que seguram uma nova tentativa; o e-mail
// sai pelo SMTP e o push pelo serviço de push, decifrado no aparelho.
import { contas, inscricoesDePush, naOrganizacao, notificacoes, pessoas } from '@grafite/db';
import { conteudoDoPush, type NovaNotificacao } from '@grafite/domain';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parDoPush, servicoDePushFalso, servidorDeEmail } from '../../test/canais.ts';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import type { CanaisDaApi } from '../canais/canais.ts';
import { criarCarteiroDeEmail, FalhaDoEmail } from '../canais/email.ts';
import { criarEntregadorDePush } from '../canais/push.ts';
import { FILA_DAS_FALHAS } from '../fila/falhas.ts';
import { type ContextoDasTarefas, type DefinicaoDeTarefa, tarefasDaApi } from '../fila/tarefas.ts';
import { TAREFA_DA_ENTREGA, TAREFA_DO_EMAIL, TAREFA_DO_PUSH, tarefasDaEntrega } from './entrega.ts';
import { notificar } from './notificar.ts';

const host = 'grafite.entrega.local';
const SENHA = ['senha', 'do', 'smtp'].join('-');
const REMETENTE = 'Grafite <grafite@empresa.com.br>';
const ORIGEM = 'https://grafite.entrega.local';
const DESTINO = '/ativos/0199d3a0-0000-7000-8000-0000000000a1';
const ESPERA = { timeout: 20_000, interval: 200 };

let smtp: Awaited<ReturnType<typeof servidorDeEmail>>;
let servico: Awaited<ReturnType<typeof servicoDePushFalso>>;
let canais: CanaisDaApi;
let api: ApiDeTeste;
let org = '';
let ana = '';
let bruno = '';

beforeAll(async () => {
  smtp = await servidorDeEmail({ senha: SENHA });
  servico = await servicoDePushFalso();
  canais = {
    carteiro: criarCarteiroDeEmail({ urlSmtp: smtp.url(), remetente: REMETENTE }),
    entregador: criarEntregadorDePush(
      { ...parDoPush(), contato: 'mailto:ti@empresa.com.br' },
      { extras: [servico.origem], agente: servico.agente },
    ),
    origemDosLinks: ORIGEM,
  };
  api = await abrirApi({ tarefas: tarefasDaApi, intervaloDaFila: 1, canais });
  await api.app.ready();
  org = await criarOrganizacao(api, { nome: 'Empresa da entrega', enderecos: [host] });
  ana = (
    await criarConta(api, org, {
      usuario: 'ana',
      nome: 'Ana Souza',
      email: 'ana.souza@empresa.com.br',
    })
  ).id;
  bruno = (await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Lima' })).id;
});

afterAll(async () => {
  await api?.fechar();
  canais?.carteiro?.fechar();
  await smtp?.fechar();
  await servico?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(inscricoesDePush);
    await tx.delete(notificacoes);
  });
  smtp.mensagens.length = 0;
});

const critica = (contaId: string, dados: Partial<NovaNotificacao> = {}): NovaNotificacao => ({
  contaId,
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'HP LaserJet M404 · PAT-00412',
  origem: 'Alertas',
  destino: DESTINO,
  alertaId: null,
  ...dados,
});

/** Grava as notificações como um módulo, com a fila da API, e devolve os ids delas. */
async function gravar(...novas: NovaNotificacao[]): Promise<string[]> {
  const fila = api.app.fila;
  if (!fila) throw new Error('A API do teste está sem a fila.');
  await naOrganizacao(api.banco, org, (tx) =>
    notificar(tx, novas, api.relogio.agora(), { enviar: (...dados) => fila.enviar(...dados) }),
  );
  const linhas = await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: notificacoes.id }).from(notificacoes),
  );
  return linhas.map(({ id }) => id);
}

/** Inscreve um aparelho da conta no serviço de push falso. */
async function inscrever(contaId: string) {
  const aparelho = servico.aparelho();
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .insert(inscricoesDePush)
      .values({ orgId: org, contaId, ...aparelho.inscricao, aparelho: 'Chrome no Android' })
      .returning({ id: inscricoesDePush.id }),
  );
  return { ...aparelho, id: linha?.id ?? '' };
}

const marcas = (ids: string[]) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ emailEm: notificacoes.emailEm, pushEm: notificacoes.pushEm })
      .from(notificacoes)
      .where(inArray(notificacoes.id, ids)),
  );

/** Espera a entrega decidir os canais das notificações. */
const entregues = (ids: string[]) =>
  vi.waitFor(async () => {
    expect((await marcas(ids)).every(({ pushEm }) => pushEm instanceof Date)).toBe(true);
  }, ESPERA);

/** O e-mail da pessoa de uma conta, trocado direto no banco. */
const trocarEmail = (contaId: string, email: string | null) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [conta] = await tx
      .select({ pessoaId: contas.pessoaId })
      .from(contas)
      .where(eq(contas.id, contaId));
    await tx
      .update(pessoas)
      .set({ email })
      .where(eq(pessoas.id, conta?.pessoaId ?? ''));
  });

/** As tarefas da entrega com os canais dados e um contexto que guarda o que elas põem na fila. */
function tarefasGuardandoOEnvio(comCanais: CanaisDaApi = canais) {
  const enviadas: Array<{ tarefa: string; dados: unknown }> = [];
  const contexto: ContextoDasTarefas = {
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    enviar: async (tarefa, dados) => {
      enviadas.push({ tarefa, dados });
      return null;
    },
    canais: comCanais,
  };
  const porNome = new Map(tarefasDaEntrega(contexto).map((tarefa) => [tarefa.nome, tarefa]));
  return {
    enviadas,
    tarefa: (nome: string) => porNome.get(nome) as DefinicaoDeTarefa,
  };
}

/** O contexto de uma execução direta do trabalho de uma tarefa. */
const execucao = () => ({ tarefaId: 'teste', tentativa: 0, sinal: new AbortController().signal });

describe('entrega das notificações', () => {
  it('o crítico vai por e-mail para a pessoa e por push para os dois aparelhos', async () => {
    const celular = await inscrever(ana);
    const computador = await inscrever(ana);
    const ids = await gravar(critica(ana));
    await vi.waitFor(() => expect(smtp.mensagens).toHaveLength(1), ESPERA);
    const [email] = smtp.mensagens;
    expect(email?.subject).toBe('Crítico: Black Toner Cartridge em 8%');
    expect(email?.to && 'text' in email.to ? email.to.text : '').toBe('ana.souza@empresa.com.br');
    expect(email?.text).toContain(`Abrir: ${ORIGEM}${DESTINO}`);
    expect(email?.text).toContain('Empresa da entrega');
    const esperado = conteudoDoPush({
      ...critica(ana),
      id: ids[0] ?? '',
      criadaEm: api.relogio.agora(),
    });
    await vi.waitFor(() => {
      expect(celular.recebidos()).toEqual([esperado]);
      expect(computador.recebidos()).toEqual([esperado]);
    }, ESPERA);
    const [marca] = await marcas(ids);
    expect(marca?.emailEm).toBeInstanceOf(Date);
    expect(marca?.pushEm).toBeInstanceOf(Date);
    await vi.waitFor(async () => {
      const aparelhos = await naOrganizacao(api.banco, org, (tx) =>
        tx.select({ ultimoEnvioEm: inscricoesDePush.ultimoEnvioEm }).from(inscricoesDePush),
      );
      expect(aparelhos.every(({ ultimoEnvioEm }) => ultimoEnvioEm instanceof Date)).toBe(true);
    }, ESPERA);
  });

  it('a nova tentativa da entrega não põe de novo nem o e-mail nem o push', async () => {
    await inscrever(ana);
    const ids = await gravar(critica(ana));
    await entregues(ids);
    await vi.waitFor(async () => {
      expect((await marcas(ids))[0]?.emailEm).toBeInstanceOf(Date);
    }, ESPERA);
    const { enviadas, tarefa } = tarefasGuardandoOEnvio();
    await tarefa(TAREFA_DA_ENTREGA).trabalho({ orgId: org, ids }, execucao());
    expect(enviadas).toEqual([]);
  });

  it('Atenção não vai por e-mail na hora, nem por push fora das severidades escolhidas', async () => {
    const celular = await inscrever(ana);
    const ids = await gravar(critica(ana, { severidade: 'atencao', titulo: 'Coletor atrasado' }));
    await entregues(ids);
    expect(smtp.mensagens).toEqual([]);
    expect(celular.recebidos()).toEqual([]);
    expect((await marcas(ids))[0]?.emailEm).toBeNull();
  });

  it('a pessoa sem e-mail não recebe e-mail', async () => {
    await entregues(await gravar(critica(bruno)));
    expect(smtp.mensagens).toEqual([]);
  });

  it('o aparelho que deixou de existir sai da lista, e o outro recebe', async () => {
    const perdido = await inscrever(ana);
    servico.responder(perdido.caminho, 410);
    const celular = await inscrever(ana);
    await gravar(critica(ana));
    await vi.waitFor(() => expect(celular.recebidos()).toHaveLength(1), ESPERA);
    await vi.waitFor(async () => {
      const restantes = await naOrganizacao(api.banco, org, (tx) =>
        tx.select({ id: inscricoesDePush.id }).from(inscricoesDePush),
      );
      expect(restantes).toEqual([{ id: celular.id }]);
    }, ESPERA);
  });

  it('a conta inativa não recebe', async () => {
    await inscrever(bruno);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(contas).set({ situacao: 'inativa' }).where(eq(contas.id, bruno)),
    );
    try {
      const [linha] = await naOrganizacao(api.banco, org, (tx) =>
        tx
          .insert(notificacoes)
          .values({ orgId: org, ...critica(bruno), criadaEm: api.relogio.agora() })
          .returning({ id: notificacoes.id }),
      );
      const { enviadas, tarefa } = tarefasGuardandoOEnvio();
      await tarefa(TAREFA_DA_ENTREGA).trabalho({ orgId: org, ids: [linha?.id] }, execucao());
      expect(enviadas).toEqual([]);
    } finally {
      await naOrganizacao(api.banco, org, (tx) =>
        tx.update(contas).set({ situacao: 'ativa' }).where(eq(contas.id, bruno)),
      );
    }
  });

  it('o servidor de e-mail fora do ar faz o envio falhar, e a falha vai para a lista', async () => {
    const ids = await gravar(critica(bruno));
    await entregues(ids);
    const fechado = await servidorDeEmail({ senha: SENHA });
    const urlFechada = fechado.url();
    await fechado.fechar();
    const semResposta = criarCarteiroDeEmail({ urlSmtp: urlFechada, remetente: REMETENTE });
    await trocarEmail(bruno, 'bruno.lima@empresa.com.br');
    try {
      const { tarefa } = tarefasGuardandoOEnvio({ ...canais, carteiro: semResposta });
      await expect(
        tarefa(TAREFA_DO_EMAIL).trabalho({ orgId: org, notificacaoId: ids[0] }, execucao()),
      ).rejects.toThrow(FalhaDoEmail);
      expect((await marcas(ids))[0]?.emailEm).toBeNull();
      for (const nome of [TAREFA_DA_ENTREGA, TAREFA_DO_EMAIL, TAREFA_DO_PUSH]) {
        expect(tarefa(nome).opcoes).toMatchObject({
          retryLimit: 5,
          retryBackoff: true,
          deadLetter: FILA_DAS_FALHAS,
        });
      }
    } finally {
      semResposta.fechar();
      await trocarEmail(bruno, null);
    }
  });
});
