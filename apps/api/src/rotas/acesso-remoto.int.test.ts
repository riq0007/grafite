// O acesso remoto pela API (spec acesso-remoto; change acesso-remoto-vnc, design, decisões 2 e 4):
// a ponte até uma máquina de mentira, que responde como um VNC; o acesso na auditoria; a recusa de
// outro site, de quem não tem a permissão, da conta de outro local e da máquina sem IP; a máquina
// que não responde, a que recusa a conexão e a que encerra; e a ação no marcador do mapa.
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer, type Server, type Socket } from 'node:net';
import { ativos, auditoria, campos, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

const host = 'grafite.remoto.local';
const PRAZO = 500;
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contas: Record<string, string> = {};
const ids: Record<string, string> = {};

/** A máquina de mentira: diz a versão do VNC ao conectar e devolve o que recebe, com "eco:". */
let vnc: Server;
/** A máquina que aceita a conexão e nunca responde. */
let muda: Server;
const doVnc: Socket[] = [];
let portaFechada = 0;

const porta = (servidor: Server) => (servidor.address() as AddressInfo).port;

async function ouvir(servidor: Server) {
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  return servidor;
}

beforeAll(async () => {
  vnc = await ouvir(
    createServer((socket) => {
      doVnc.push(socket);
      socket.write('RFB 003.008\n');
      socket.on('data', (dados) => socket.write(Buffer.concat([Buffer.from('eco:'), dados])));
    }),
  );
  muda = await ouvir(createServer(() => {}));
  const livre = await ouvir(createServer());
  portaFechada = porta(livre);
  livre.close();

  api = await abrirApi({ prazoDoAcessoRemoto: PRAZO });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const mapa = await criarPerfil(api, org, {
    nome: 'Mapa',
    permissoes: ['mapa.editar', 'ativos.ver'],
  });
  const remoto = await criarPerfil(api, org, {
    nome: 'Acesso remoto',
    permissoes: ['ativos.acesso-remoto'],
  });
  for (const usuario of ['ana', 'bruno', 'carla']) {
    const conta = await criarConta(api, org, { usuario });
    contas[usuario] = conta.id;
    await atribuir(api, org, { perfilId: mapa, contaId: conta.id });
    if (usuario === 'ana') {
      await atribuir(api, org, { perfilId: remoto, contaId: conta.id, localId: jundiai });
    }
    if (usuario === 'bruno') {
      await atribuir(api, org, { perfilId: remoto, contaId: conta.id, localId: campinas });
    }
    entradas[usuario] = await cliente.entrar(usuario);
  }
  await naOrganizacao(api.banco, org, async (tx) => {
    const [ip] = await tx
      .insert(campos)
      .values({ orgId: org, rotulo: 'IP', rotuloNormalizado: 'ip', tipo: 'ip', situacao: 'ativo' })
      .returning({ id: campos.id });
    const campoDoIp = ip?.id ?? '';
    const tipo = async (nome: string, portaDoVnc: number | null) => {
      const [linha] = await tx
        .insert(tiposDeAtivo)
        .values({
          orgId: org,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          icone: 'generico',
          capacidades:
            portaDoVnc === null ? ['rede.disponibilidade'] : ['rede.disponibilidade', 'acesso.vnc'],
          configuracaoDasCapacidades: {
            'rede.disponibilidade': { campoDoIp },
            ...(portaDoVnc === null ? {} : { 'acesso.vnc': { porta: portaDoVnc } }),
          },
        })
        .returning({ id: tiposDeAtivo.id });
      return linha?.id ?? '';
    };
    const ativo = async (nome: string, tipoId: string, ipDaMaquina: string | null) => {
      const [linha] = await tx
        .insert(ativos)
        .values({
          orgId: org,
          tipoId,
          busca: '',
          nome,
          patrimonio: `PAT-${nome.length}`,
          localId: jundiai,
          valores: ipDaMaquina ? { [campoDoIp]: ipDaMaquina } : {},
        } as typeof ativos.$inferInsert)
        .returning({ id: ativos.id });
      return linha?.id ?? '';
    };
    ids.pc = await ativo('PAT-00321', await tipo('Computador', porta(vnc)), '127.0.0.1');
    ids.semIp = await ativo('Computador sem IP', await tipo('Computador novo', 5900), null);
    ids.mudo = await ativo(
      'Computador mudo',
      await tipo('Computador travado', porta(muda)),
      '127.0.0.1',
    );
    ids.desligado = await ativo(
      'Computador desligado',
      await tipo('Computador fora', portaFechada),
      '127.0.0.1',
    );
    ids.switch = await ativo('Switch', await tipo('Switch', null), '127.0.0.1');
  });
});

afterAll(async () => {
  await api?.fechar();
  for (const socket of doVnc) socket.destroy();
  vnc?.close();
  muda?.close();
});

/** A conexão da tela, como o navegador abre: o cookie da sessão e a origem do Grafite. */
const abrir = (usuario: string, ativoId: string, origem: string | null = `https://${host}`) =>
  api.app.injectWS(`/ativos/${ativoId}/acesso-remoto`, {
    headers: {
      host,
      cookie: entradas[usuario]?.cookie ?? '',
      ...(origem === null ? {} : { origin: origem }),
    },
    socket: { remoteAddress: '127.0.0.1' },
  } as never);

type Conexao = Awaited<ReturnType<typeof abrir>>;

/** O fechamento da conexão: o código e o motivo. */
const fechamento = (conexao: Conexao) =>
  new Promise<{ codigo: number; motivo: string }>((resolver) =>
    conexao.on('close', (codigo, motivo) => resolver({ codigo, motivo: motivo.toString() })),
  );

const registros = (acao: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select({
        alvoId: auditoria.alvoId,
        atorContaId: auditoria.atorContaId,
        dados: auditoria.dados,
      })
      .from(auditoria)
      .where(and(eq(auditoria.acao, acao))),
  );

describe('a ponte', () => {
  it('Acesso registrado: passa os dados nos dois sentidos e grava a auditoria', async () => {
    const conexao = await abrir('ana', ids.pc ?? '');
    const recebido: Buffer[] = [];
    conexao.on('message', (dados: Buffer) => recebido.push(dados));
    await vi.waitFor(() => expect(Buffer.concat(recebido).toString()).toBe('RFB 003.008\n'));
    conexao.send(Buffer.from('RFB 003.008\n'));
    await vi.waitFor(() =>
      expect(Buffer.concat(recebido).toString()).toBe('RFB 003.008\neco:RFB 003.008\n'),
    );
    expect(await registros('acesso-remoto.aberto')).toEqual([
      {
        alvoId: ids.pc,
        atorContaId: contas.ana,
        dados: { ip: '127.0.0.1', porta: porta(vnc) },
      },
    ]);
    // O fim da tela fecha a máquina.
    const doLado = doVnc.at(-1);
    const fechouNaMaquina = doLado ? once(doLado, 'close') : Promise.resolve();
    conexao.terminate();
    await fechouNaMaquina;
  });

  it('a máquina que encerra fecha a tela, com o motivo', async () => {
    const antes = doVnc.length;
    const conexao = await abrir('ana', ids.pc ?? '');
    const fim = fechamento(conexao);
    await vi.waitFor(() => expect(doVnc.length).toBe(antes + 1));
    doVnc.at(-1)?.end();
    expect(await fim).toEqual({ codigo: 4000, motivo: 'A máquina encerrou a conexão.' });
  });

  it('a máquina que não responde no prazo, e a que recusa a conexão', async () => {
    const muda = await abrir('ana', ids.mudo ?? '');
    expect(await fechamento(muda)).toEqual({
      codigo: 4000,
      motivo: 'A máquina não respondeu no VNC.',
    });
    const desligada = await abrir('ana', ids.desligado ?? '');
    expect(await fechamento(desligada)).toEqual({
      codigo: 4000,
      motivo: `A máquina recusou a conexão na porta ${portaFechada}.`,
    });
  });
});

describe('as recusas', () => {
  it('recusa a conexão de outro site e a sem a origem, antes da troca do protocolo', async () => {
    await expect(abrir('ana', ids.pc ?? '', 'https://outro.site')).rejects.toThrow('403');
    await expect(abrir('ana', ids.pc ?? '', null)).rejects.toThrow('403');
  });

  it('recusa quem não tem a permissão, antes da troca do protocolo', async () => {
    await expect(abrir('carla', ids.pc ?? '')).rejects.toThrow('403');
  });

  it('Conta de outro local: recusa sem ligar a máquina, com a recusa na auditoria', async () => {
    const ligacoes = doVnc.length;
    const conexao = await abrir('bruno', ids.pc ?? '');
    expect(await fechamento(conexao)).toEqual({
      codigo: 4000,
      motivo: 'Você não tem o acesso remoto no local deste ativo.',
    });
    expect(doVnc.length).toBe(ligacoes);
    expect(
      (await registros('permissao.recusada')).filter(
        (registro) => registro.atorContaId === contas.bruno,
      ),
    ).toHaveLength(1);
  });

  it('Máquina sem IP, o tipo sem o acesso remoto e o ativo que não existe', async () => {
    const motivos = [];
    for (const ativoId of [ids.semIp, ids.switch, '00000000-0000-4000-8000-000000000000']) {
      const conexao = await abrir('ana', ativoId ?? '');
      motivos.push((await fechamento(conexao)).motivo);
    }
    expect(motivos).toEqual([
      'O ativo não tem IP para o acesso remoto.',
      'O tipo do ativo não tem o acesso remoto.',
      'Ativo não encontrado.',
    ]);
  });
});

describe('o mapa', () => {
  it('Pelo mapa: o marcador da máquina tem o acesso remoto para quem pode no local', async () => {
    const planta = await cliente.enviarBytes(
      'POST',
      `/mapa/plantas?nome=${encodeURIComponent('Jundiaí')}&fonte=planta.json`,
      entradas.ana as Entrada,
      Buffer.from(
        JSON.stringify({
          id: 'planta',
          width: 100,
          depth: 100,
          layers: [{ name: 'PAREDES', segments: [0, 0, 100, 0] }],
          walls: [],
          labels: [],
          machines: [],
        }),
      ),
    );
    expect(planta.statusCode, planta.body).toBe(201);
    const id = planta.json().id;
    const posicionado = await cliente.enviar(
      'PUT',
      `/mapa/plantas/${id}/posicoes`,
      entradas.ana as Entrada,
      { alvo: { tipo: 'ativo', id: ids.pc }, x: 10, z: 10 },
    );
    expect(posicionado.statusCode, posicionado.body).toBe(204);
    const acoesDe = async (usuario: string) =>
      (await cliente.consultar(`/mapa/plantas/${id}/marcadores`, entradas[usuario] as Entrada))
        .json()
        .marcadores[0].acoes.map((acao: { rotulo: string }) => acao.rotulo);
    expect(await acoesDe('ana')).toEqual(['Abrir ficha', 'Acesso remoto']);
    expect(await acoesDe('bruno')).toEqual(['Abrir ficha']);
  });
});
