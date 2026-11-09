// O resumo diário por e-mail (spec notificacoes, "Resumo diário por e-mail"; change
// p3c-email-e-push, design, decisão 5): às 8h de São Paulo, cada organização põe um resumo por
// conta com o resumo ligado e a pessoa com e-mail, e cada resumo leva as notificações não lidas que
// ainda não foram por e-mail, marcando todas como enviadas.
import { contas, naOrganizacao, notificacoes } from '@grafite/db';
import type { NovaNotificacao } from '@grafite/domain';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { servidorDeEmail } from '../../test/canais.ts';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import type { CanaisDaApi } from '../canais/canais.ts';
import { criarCarteiroDeEmail } from '../canais/email.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from '../fila/tarefas.ts';
import {
  TAREFA_DO_RESUMO,
  TAREFA_DOS_RESUMOS,
  TAREFA_DOS_RESUMOS_DO_DIA,
  tarefasDoResumo,
} from './resumo.ts';

const SENHA = ['senha', 'do', 'smtp'].join('-');
const MINUTO = 60_000;

let smtp: Awaited<ReturnType<typeof servidorDeEmail>>;
let canais: CanaisDaApi;
let api: ApiDeTeste;
let org = '';
let ana = '';
let bruno = '';

beforeAll(async () => {
  smtp = await servidorDeEmail({ senha: SENHA });
  canais = {
    carteiro: criarCarteiroDeEmail({
      urlSmtp: smtp.url(),
      remetente: 'Grafite <grafite@empresa.com.br>',
    }),
    origemDosLinks: 'https://grafite.resumo.local',
  };
  api = await abrirApi({ canais });
  org = await criarOrganizacao(api, {
    nome: 'Empresa do resumo',
    enderecos: ['grafite.resumo.local'],
  });
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
});

beforeEach(async () => {
  await naOrganizacao(api.banco, org, async (tx) => {
    await tx.delete(notificacoes);
    await tx
      .update(contas)
      .set({ preferencias: {} })
      .where(inArray(contas.id, [ana, bruno]));
  });
  smtp.mensagens.length = 0;
});

/** As tarefas do resumo com um contexto que guarda o que elas põem na fila. */
function tarefas(comCanais: CanaisDaApi = canais) {
  const enviadas: Array<{ tarefa: string; dados: unknown; chave?: string }> = [];
  const contexto: ContextoDasTarefas = {
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    enviar: async (tarefa, dados, opcoes) => {
      enviadas.push({ tarefa, dados, chave: opcoes?.chaveUnica });
      return null;
    },
    canais: comCanais,
  };
  const porNome = new Map(tarefasDoResumo(contexto).map((tarefa) => [tarefa.nome, tarefa]));
  const execucao = { tarefaId: 'teste', tentativa: 0, sinal: new AbortController().signal };
  return {
    enviadas,
    tarefa: (nome: string) => porNome.get(nome) as DefinicaoDeTarefa,
    rodar: (nome: string, dados: unknown) =>
      (porNome.get(nome) as DefinicaoDeTarefa).trabalho(dados, execucao),
  };
}

/** Grava uma notificação da conta, um minuto depois da anterior, e devolve o id. */
async function gravar(
  contaId: string,
  dados: Partial<NovaNotificacao> & { lida?: boolean; enviada?: boolean } = {},
) {
  const { lida = false, enviada = false, ...resto } = dados;
  api.relogio.avancar(MINUTO);
  const [linha] = await naOrganizacao(api.banco, org, (tx) =>
    tx
      .insert(notificacoes)
      .values({
        orgId: org,
        contaId,
        severidade: 'atencao',
        titulo: 'Coletor sem contato',
        descricao: null,
        origem: 'Alertas',
        destino: null,
        alertaId: null,
        criadaEm: api.relogio.agora(),
        lidaEm: lida ? api.relogio.agora() : null,
        emailEm: enviada ? api.relogio.agora() : null,
        ...resto,
      })
      .returning({ id: notificacoes.id }),
  );
  return linha?.id ?? '';
}

const marcasDoEmail = (ids: string[]) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({ id: notificacoes.id, emailEm: notificacoes.emailEm })
      .from(notificacoes)
      .where(inArray(notificacoes.id, ids)),
  );

describe('resumo diário', () => {
  it('fica agendado às 8h de São Paulo e põe os resumos de cada organização com a chave do dia', async () => {
    const { tarefa, rodar, enviadas } = tarefas();
    expect(tarefa(TAREFA_DOS_RESUMOS_DO_DIA).agenda).toEqual({
      cron: '0 8 * * *',
      fuso: 'America/Sao_Paulo',
    });
    await rodar(TAREFA_DOS_RESUMOS_DO_DIA, null);
    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      api.relogio.agora(),
    );
    expect(enviadas).toContainEqual({
      tarefa: TAREFA_DOS_RESUMOS,
      dados: { orgId: org },
      chave: `${org}:${dia}`,
    });
  });

  it('o resumo com Atenção e Informação leva as três e marca todas como enviadas', async () => {
    const ids = [
      await gravar(ana, { titulo: 'Coletor sem contato' }),
      await gravar(ana, { severidade: 'info', titulo: 'Backup concluído', origem: 'Operação' }),
      await gravar(ana, { titulo: 'Impressora pede atenção' }),
    ];
    const { rodar, enviadas } = tarefas();
    await rodar(TAREFA_DOS_RESUMOS, { orgId: org });
    expect(enviadas.map(({ tarefa, dados }) => ({ tarefa, dados }))).toEqual([
      { tarefa: TAREFA_DO_RESUMO, dados: { orgId: org, contaId: ana } },
    ]);
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: ana });
    const [email] = smtp.mensagens;
    expect(email?.subject).toBe('Resumo do Grafite: 3 notificações não lidas');
    expect(email?.to && 'text' in email.to ? email.to.text : '').toBe('ana.souza@empresa.com.br');
    // Da mais nova para a mais antiga.
    const linhas = (email?.text ?? '').split('\n');
    expect(linhas.slice(0, 3).map((linha) => linha.split(' · ').slice(0, 3))).toEqual([
      ['Atenção', 'Impressora pede atenção', 'Alertas'],
      ['Informação', 'Backup concluído', 'Operação'],
      ['Atenção', 'Coletor sem contato', 'Alertas'],
    ]);
    expect((await marcasDoEmail(ids)).every(({ emailEm }) => emailEm instanceof Date)).toBe(true);
  });

  it('sem nada para resumir, nada sai', async () => {
    await gravar(ana, { lida: true });
    const { rodar, enviadas } = tarefas();
    await rodar(TAREFA_DOS_RESUMOS, { orgId: org });
    expect(enviadas).toEqual([]);
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: ana });
    expect(smtp.mensagens).toEqual([]);
  });

  it('a lida e a que já foi por e-mail ficam de fora', async () => {
    const lida = await gravar(ana, { titulo: 'Lida antes do resumo', lida: true });
    await gravar(ana, { severidade: 'critico', titulo: 'Crítico já enviado', enviada: true });
    await gravar(ana, { titulo: 'Coletor sem contato' });
    const { rodar } = tarefas();
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: ana });
    const [email] = smtp.mensagens;
    expect(email?.subject).toBe('Resumo do Grafite: 1 notificação não lida');
    expect(email?.text).not.toContain('Lida antes do resumo');
    expect(email?.text).not.toContain('Crítico já enviado');
    expect((await marcasDoEmail([lida]))[0]?.emailEm).toBeNull();
  });

  it('o resumo seguinte não repete o que já foi', async () => {
    await gravar(ana);
    const { rodar } = tarefas();
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: ana });
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: ana });
    expect(smtp.mensagens).toHaveLength(1);
  });

  it('o resumo desligado e a pessoa sem e-mail não recebem', async () => {
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(contas)
        .set({ preferencias: { notificacoes: { resumo: 'desligado' } } })
        .where(eq(contas.id, ana)),
    );
    await gravar(ana);
    await gravar(bruno);
    const { rodar, enviadas } = tarefas();
    await rodar(TAREFA_DOS_RESUMOS, { orgId: org });
    expect(enviadas).toEqual([]);
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: ana });
    await rodar(TAREFA_DO_RESUMO, { orgId: org, contaId: bruno });
    expect(smtp.mensagens).toEqual([]);
  });

  it('sem o e-mail configurado, o dia não põe nenhum resumo', async () => {
    await gravar(ana);
    const { rodar, enviadas } = tarefas({});
    await rodar(TAREFA_DOS_RESUMOS_DO_DIA, null);
    await rodar(TAREFA_DOS_RESUMOS, { orgId: org });
    expect(enviadas).toEqual([]);
  });
});
