// O pacote inativado segura a fila (spec distribuicao-de-software, "Pacote inativado na fila";
// change software-por-pacote, design, decisão 17): as máquinas que aguardam o pacote inativo ficam
// em "Aguardando o agente", sem o `getJobs`, sem o pedido no `expiration` do CONTACT e sem o
// chamado; o "Tentar de novo" é recusado e o "Tirar da fila" continua; a distribuição e os mandados
// da ficha trazem a situação do pacote; e a reativação retoma a entrega. O relógio começa às 15:00
// de São Paulo.
import {
  agentes,
  ativos,
  distribuicoes,
  maquinasDasDistribuicoes,
  naOrganizacao,
  pacotesDeSoftware,
  tiposDeAtivo,
  tokensDosAgentes,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chamarOsAgendados as chamarOsAgendadosDa } from '../../test/agendados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
} from '../../test/integracao.ts';
import { hashDoToken } from '../agentes/agentes.ts';

const host = 'grafite.pacote-inativado.local';
const TOKEN = 'token-do-pacote-inativado-0123456789abcdef';
const ENDERECO = `/agentes/glpi/${TOKEN}`;
const FUSO = 'America/Sao_Paulo';
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
let ana: Entrada;
let pacote = '';
let distribuicao = '';
const maquinas: Record<string, string> = {};
const ativosDasMaquinas: Record<string, string> = {};

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

/** O CONTACT do agente, em JSON puro. */
const contato = (deviceid: string) =>
  api.app.inject({
    method: 'POST',
    url: ENDERECO,
    headers: { host, 'content-type': 'application/json' },
    payload: { action: 'contact', deviceid },
  });

/** O `getJobs` do Deploy do agente. */
const pedirAsTarefas = (deviceid: string) =>
  api.app.inject({
    method: 'GET',
    url: `${ENDERECO}?action=getJobs&machineid=${deviceid}`,
    headers: { host },
  });

const situacaoDa = (chave: string) =>
  naOrg(async (tx) => {
    const [linha] = await tx
      .select({ situacao: maquinasDasDistribuicoes.situacao })
      .from(maquinasDasDistribuicoes)
      .where(eq(maquinasDasDistribuicoes.id, maquinas[chave] ?? ''));
    return linha?.situacao;
  });

/** Uma volta da tarefa periódica, com o chamado simulado, que todos respondem. */
const chamarOsAgendados = () => chamarOsAgendadosDa(api, org);

const doPacote = (caminho: 'inativacao' | 'reativacao') =>
  cliente.enviar('POST', `/software/pacotes/${pacote}/${caminho}`, ana);

beforeAll(async () => {
  api = await abrirApi();
  // 18:00 UTC: 15:00 em São Paulo.
  api.relogio.avancar(6 * HORA);
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const financeiro = await criarLocal(api, org, { nome: 'Financeiro', tipo: 'unidade' });
  const perfil = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar', 'ativos.ver'],
  });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: perfil, contaId: conta.id });
  ana = await cliente.entrar('ana');
  await naOrg(async (tx) => {
    await tx
      .insert(tokensDosAgentes)
      .values({ orgId: org, hashDoToken: hashDoToken(TOKEN), criadoPor: conta.id });
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
      })
      .returning({ id: tiposDeAtivo.id });
    const [criado] = await tx
      .insert(pacotesDeSoftware)
      .values({
        orgId: org,
        nome: 'Driver HP Universal',
        nomeNormalizado: normalizarTexto('Driver HP Universal'),
        nomeNoInventarioNormalizado: normalizarTexto('HP Universal Printing'),
        versao: '7.3',
        comando: 'msiexec /i "hp-universal-7.3.msi" /qn',
      })
      .returning({ id: pacotesDeSoftware.id });
    pacote = criado?.id ?? '';
    const [nova] = await tx
      .insert(distribuicoes)
      .values({
        orgId: org,
        pacoteId: pacote,
        criadaPor: conta.id,
        criadaEm: new Date('2026-10-02T11:00:00.000Z'),
        paraQuem: 'Financeiro',
        quando: 'noite',
        fuso: FUSO,
      })
      .returning({ id: distribuicoes.id });
    distribuicao = nova?.id ?? '';
    const emDia = new Date('2026-10-02T11:00:00.000Z');
    for (const [chave, ip, situacao] of [
      ['h1', '10.17.0.1', 'aguardando'],
      ['h2', '10.17.0.2', 'aguardando'],
      ['h3', '10.17.0.3', 'falhou'],
    ] as const) {
      const [ativo] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId: tipo?.id ?? '',
          busca: normalizarTexto(`Estação ${chave}`),
          nome: `Estação ${chave.toUpperCase()}`,
          localId: financeiro,
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      const [agente] = await tx
        .insert(agentes)
        .values({
          orgId: org,
          deviceid: `${chave}-2024`,
          nome: chave,
          ip,
          ultimoContato: emDia,
          // Com o inventário lido, o CONTACT não troca o IP pelo de quem chama.
          ultimoInventario: emDia,
          ativoId: ativo?.id,
        })
        .returning({ id: agentes.id });
      const [linha] = await tx
        .insert(maquinasDasDistribuicoes)
        .values({
          orgId: org,
          distribuicaoId: distribuicao,
          ativoId: ativo?.id ?? '',
          agenteId: agente?.id ?? '',
          situacao,
          codigoDeSaida: situacao === 'falhou' ? 1603 : null,
        })
        .returning({ id: maquinasDasDistribuicoes.id });
      maquinas[chave] = linha?.id ?? '';
      ativosDasMaquinas[chave] = ativo?.id ?? '';
    }
  });
});

afterAll(async () => {
  await api?.fechar();
});

describe('o pacote inativado na fila', () => {
  it('Pacote inativado com a fila da noite: às 22:05 nenhuma recebe o pedido nem é chamada', async () => {
    // 15:00: o pedido da noite conta no CONTACT, até as 23:00.
    expect((await contato('h1-2024')).json()).toMatchObject({ expiration: '480m' });

    const inativado = await doPacote('inativacao');
    expect(inativado.statusCode, inativado.body).toBe(200);
    // O pedido do pacote inativo não conta: o agente volta nas 24 horas de quem não tem pedido.
    expect((await contato('h1-2024')).json()).toMatchObject({ expiration: 24 });

    // 22:05 em São Paulo, dentro da janela da noite.
    api.relogio.avancar(7 * HORA + 5 * MINUTO);
    expect(await chamarOsAgendados()).toEqual([]);
    expect((await pedirAsTarefas('h1-2024')).json()).toEqual({});
    expect(await situacaoDa('h1')).toBe('aguardando');

    // A distribuição e os mandados da ficha trazem a situação do pacote. A sessão das 15:00
    // expirou, e a Ana entra de novo.
    ana = await cliente.entrar('ana');
    const ficha = await cliente.consultar(`/software/distribuicoes/${distribuicao}`, ana);
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(ficha.json().pacote).toMatchObject({ id: pacote, situacao: 'inativo' });
    const software = await cliente.consultar(`/ativos/${ativosDasMaquinas.h1}/software`, ana);
    expect(software.statusCode, software.body).toBe(200);
    expect(software.json().distribuir.mandados).toEqual([
      expect.objectContaining({
        maquinaId: maquinas.h1,
        pacote: expect.objectContaining({ id: pacote, situacao: 'inativo' }),
      }),
    ]);
  });

  it('o "Tentar de novo" é recusado com o pacote inativo, e o "Tirar da fila" continua', async () => {
    const tentar = await cliente.enviar(
      'POST',
      `/software/distribuicoes/${distribuicao}/maquinas/${maquinas.h3}/tentar-de-novo`,
      ana,
    );
    expect(tentar.statusCode).toBe(409);
    expect(tentar.json().detail).toBe('O pacote está inativo.');
    expect(await situacaoDa('h3')).toBe('falhou');

    const tirar = await cliente.enviar(
      'POST',
      `/software/distribuicoes/${distribuicao}/maquinas/${maquinas.h2}/tirar-da-fila`,
      ana,
    );
    expect(tirar.statusCode, tirar.body).toBe(200);
    expect(await situacaoDa('h2')).toBe('tirada');
  });

  it('Pacote reativado: na janela da noite seguinte, o agente recebe o pedido e é chamado', async () => {
    // 10:00 do dia seguinte em São Paulo; a sessão da noite expirou, e a Ana entra de novo.
    api.relogio.avancar(11 * HORA + 55 * MINUTO);
    ana = await cliente.entrar('ana');
    const reativado = await doPacote('reativacao');
    expect(reativado.statusCode, reativado.body).toBe(200);
    // O pedido volta a contar no CONTACT: até as 23:00, 13 horas depois.
    expect((await contato('h1-2024')).json()).toMatchObject({ expiration: '780m' });
    // Fora da janela, ainda ninguém.
    expect(await chamarOsAgendados()).toEqual([]);

    // 22:05: a H1 é chamada e recebe o pedido; a H2 saiu da fila, e a H3 falhou.
    api.relogio.avancar(12 * HORA + 5 * MINUTO);
    expect(await chamarOsAgendados()).toEqual(['10.17.0.1']);
    const tarefas = await pedirAsTarefas('h1-2024');
    expect(tarefas.json().jobs).toEqual([expect.objectContaining({ uuid: maquinas.h1 })]);
    expect(await situacaoDa('h1')).toBe('em-andamento');
  });
});
