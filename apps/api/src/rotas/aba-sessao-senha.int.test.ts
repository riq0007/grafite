// A sessão da aba pela senha (spec aba-dos-colaboradores, "Pessoa pela senha do AD" e "Sessão da
// aba"; design, decisão 2), com o AD em memória: a mesma conferência da entrada da web, só pelo
// diretório, com as recusas e o bloqueio por tentativas; a pendente de 5 minutos com o código do
// app; a recusa de quem exige os dois passos sem os ter; o "Sair"; e os 30 minutos sem uso, contados
// no servidor pelo último uso.
import {
  atribuicoes,
  auditoria,
  contas,
  diretorios,
  grupos,
  naOrganizacao,
  sessoesDaAba,
  tentativasDeEntrada,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ligarDiretorioSimulado } from '../../test/diretorio.ts';
import {
  type ApiDeTeste,
  abrirApi,
  ativarDoisPassos,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  novoIp,
} from '../../test/integracao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { gerarCodigoTotp } from '../acesso/totp.ts';
import { executarComando } from '../comando/executar.ts';
import { criarDiretorioSimulado } from '../diretorio/simulado.ts';

const host = 'grafite.aba-senha.local';
const ad = criarDiretorioSimulado();
let api: ApiDeTeste;
let org = '';
let chave = '';
const MINUTO = 60_000;
const dns: Record<string, string> = {};

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);

const comando = async (...argumentos: string[]) => {
  const saida: string[] = [];
  const codigo = await executarComando(argumentos, {
    banco: () => api.banco,
    agora: api.relogio.agora,
    escrever: (texto) => saida.push(texto),
    escreverErro: (texto) => saida.push(texto),
  });
  return { codigo, saida: saida.join('\n') };
};

async function registrar(maquina: string, nome: string, entradaSugerida: string) {
  const r = await api.app.inject({
    method: 'POST',
    url: '/api/aba/aparelho',
    remoteAddress: novoIp(),
    headers: { host },
    payload: { chave, identificadorDaMaquina: maquina, nome, entradaSugerida },
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as { token: string; identificadorCurto: string };
}

const comToken = (token: string) => ({ host, authorization: `Bearer ${token}` });

const pedir = (token: string, payload: object) =>
  api.app.inject({
    method: 'POST',
    url: '/api/aba/sessao',
    remoteAddress: novoIp(),
    headers: comToken(token),
    payload,
  });

const entrar = (usuario: string, senha: string, token = prod.token) =>
  pedir(token, { entrada: 'senha', usuario, senha });

const comCodigo = (pendente: string, codigo: string, token = prod.token) =>
  pedir(token, { entrada: 'senha', pendente, codigo });

const daSessao = (method: 'POST' | 'DELETE', url: string, token: string, payload?: object) =>
  api.app.inject({
    method,
    url,
    remoteAddress: novoIp(),
    headers: comToken(token),
    ...(payload ? { payload } : {}),
  });

const sessaoDo = async (token: string) =>
  (
    await naOrg((tx) =>
      tx
        .select()
        .from(sessoesDaAba)
        .where(eq(sessoesDaAba.tokenHash, hashDoToken(token))),
    )
  )[0];

const acoes = (acao: string) =>
  naOrg((tx) =>
    tx.select().from(auditoria).where(eq(auditoria.acao, acao)).orderBy(auditoria.momento),
  );

const contaDe = async (usuario: string) =>
  (await naOrg((tx) => tx.select().from(contas).where(eq(contas.usuario, usuario))))[0];

/** Zera o bloqueio por tentativas do usuário, para um teste não pesar no outro. */
const liberar = (usuario: string) =>
  naOrg((tx) => tx.delete(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, usuario)));

let prod: { token: string; identificadorCurto: string };
let win: { token: string; identificadorCurto: string };

beforeAll(async () => {
  api = await abrirApi({ conectarDiretorio: ad.conectar });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza', senha: 'senha-da-ana' });
  const { saida } = await comando('aba', 'chave', 'criar', '--endereco', host);
  chave = /Chave da aba: (\S+)/.exec(saida)?.[1] ?? '';
  const perfil = await criarPerfil(api, org, {
    nome: 'Colaborador',
    permissoes: ['chat.usar', 'chamados.pedir'],
  });
  dns.carla = ad.usuario({ usuario: 'carla.dias', nome: 'Carla Dias', senha: 'senha-da-carla' });
  dns.paulo = ad.usuario({ usuario: 'paulo.reis', nome: 'Paulo Reis', senha: 'senha-do-paulo' });
  dns.rita = ad.usuario({ usuario: 'rita.moura', nome: 'Rita Moura', senha: 'senha-da-rita' });
  dns.davi = ad.usuario({ usuario: 'davi.costa', nome: 'Davi Costa', senha: 'senha-do-davi' });
  dns.ana = ad.usuario({ usuario: 'ana', nome: 'Ana do AD', senha: 'senha-da-ana' });
  dns.grupo = ad.grupo('Producao', [dns.carla, dns.paulo, dns.rita, dns.davi, dns.ana]);
  const [grupo] = await naOrg((tx) =>
    tx
      .insert(grupos)
      .values({ orgId: org, nome: 'Produção', nomeNormalizado: 'producao' })
      .returning({ id: grupos.id }),
  );
  await naOrg((tx) =>
    tx.insert(atribuicoes).values({ orgId: org, perfilId: perfil, grupoId: grupo?.id ?? '' }),
  );
  await ligarDiretorioSimulado(api, org, [[dns.grupo, grupo?.id ?? '']]);
  prod = await registrar('guid-prod-03', 'PC-PROD-03', 'senha');
  win = await registrar('guid-fin-11', 'PC-FIN-11', 'windows');
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(() => {
  ad.estado.foraDoAr = false;
});

describe('a entrada pela senha', () => {
  it('Perfil genérico: Carla entra com o usuário e a senha do AD, e a sessão vale 1 hora', async () => {
    const r = await entrar('Carla.Dias', 'senha-da-carla');
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(corpo).toMatchObject({
      pessoa: { nome: 'Carla Dias' },
      expiraEm: new Date(api.relogio.agora().getTime() + 60 * MINUTO).toISOString(),
    });
    const conta = await contaDe('carla.dias');
    expect(conta?.origem).toBe('diretorio');
    expect(await sessaoDo(corpo.token)).toMatchObject({
      contaId: conta?.id,
      entrada: 'senha',
      encerradaEm: null,
    });
    const abertas = await acoes('sessao-da-aba.aberta');
    expect(abertas.at(-1)?.dados).toMatchObject({
      computador: 'PC-PROD-03',
      entrada: 'senha',
      pessoa: 'carla.dias',
    });
    expect(JSON.stringify(abertas.at(-1)?.dados)).not.toContain('senha-da-carla');
  });

  it('a senha errada é a recusa das credenciais, e a quinta bloqueia o usuário', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await entrar('paulo.reis', 'errada');
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:credenciais-invalidas' });
    }
    const recusadas = await acoes('entrada.recusada');
    expect(recusadas.at(-1)?.dados).toMatchObject({
      usuario: 'paulo.reis',
      motivo: 'credenciais',
      computador: 'PC-PROD-03',
    });
    expect((await entrar('paulo.reis', 'errada')).statusCode).toBe(401);
    expect((await acoes('entrada.bloqueada')).at(-1)?.dados).toMatchObject({
      usuario: 'paulo.reis',
    });
    // A senha certa espera o bloqueio, como na entrada da web.
    const bloqueada = await entrar('paulo.reis', 'senha-do-paulo');
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json()).toMatchObject({ type: 'urn:grafite:problema:entrada-bloqueada' });
    expect(bloqueada.headers['retry-after']).toBe('60');
    await liberar('paulo.reis');
  });

  it('a conta local não entra, nem com a senha certa, e a recusa é a das credenciais', async () => {
    // A Ana tem conta local no Grafite e o mesmo usuário no AD: a aba não confere a senha local.
    const r = await entrar('ana', 'senha-da-ana');
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:credenciais-invalidas' });
    expect((await acoes('entrada.recusada')).at(-1)?.dados).toMatchObject({
      usuario: 'ana',
      motivo: 'conta-local',
    });
    expect((await contaDe('ana'))?.origem).toBe('local');
    await liberar('ana');
  });

  it('o AD fora do ar e o diretório desligado deixam a TI fora do alcance, sem contar tentativa', async () => {
    ad.estado.foraDoAr = true;
    const fora = await entrar('rita.moura', 'senha-da-rita');
    expect(fora.statusCode).toBe(503);
    expect(fora.json()).toMatchObject({ motivo: 'ti-fora-do-alcance' });
    ad.estado.foraDoAr = false;
    await naOrg((tx) => tx.update(diretorios).set({ ligado: false }));
    const desligado = await entrar('rita.moura', 'senha-da-rita');
    expect(desligado.statusCode).toBe(503);
    expect(desligado.json()).toMatchObject({ motivo: 'ti-fora-do-alcance' });
    await naOrg((tx) => tx.update(diretorios).set({ ligado: true }));
    const tentativas = await naOrg((tx) =>
      tx.select().from(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, 'rita.moura')),
    );
    expect(tentativas).toEqual([]);
  });

  it('a pessoa de fora do grupo mapeado tem a frase de quem não tem acesso', async () => {
    ad.tirar(dns.rita ?? '', dns.grupo ?? '');
    const r = await entrar('rita.moura', 'senha-da-rita');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ motivo: 'sem-grupo' });
    ad.incluir(dns.rita ?? '', dns.grupo ?? '');
    await liberar('rita.moura');
  });

  it('o aparelho pelo Windows recusa a senha, e o pela senha recusa o SID', async () => {
    const pelaSenha = await entrar('carla.dias', 'senha-da-carla', win.token);
    expect(pelaSenha.statusCode).toBe(403);
    expect(pelaSenha.json()).toMatchObject({
      type: 'urn:grafite:problema:entrada-do-aparelho-diferente',
    });
    const peloSid = await pedir(prod.token, {
      entrada: 'windows',
      sid: 'S-1-5-21-1004336348-1177238915-682003330-1105',
    });
    expect(peloSid.statusCode).toBe(403);
    expect(peloSid.json()).toMatchObject({
      type: 'urn:grafite:problema:entrada-do-aparelho-diferente',
    });
  });

  it('a entrada pela senha não tem o teto de contas do aparelho', async () => {
    await comando('aba', 'teto', prod.identificadorCurto, '1', '--endereco', host);
    expect((await entrar('carla.dias', 'senha-da-carla')).statusCode).toBe(200);
    expect((await entrar('rita.moura', 'senha-da-rita')).statusCode).toBe(200);
  });
});

describe('os limites da entrada pela senha', () => {
  it('o usuário com mais de 64 caracteres é recusado na forma, como na web', async () => {
    const r = await entrar('a'.repeat(65), 'qualquer');
    expect(r.statusCode).toBe(400);
  });

  it('as recusas das credenciais têm, por computador, o limite da entrada', async () => {
    const sala = await registrar('guid-treino-01', 'PC-TREINO-01', 'senha');
    for (let i = 0; i < 20; i++) {
      expect((await entrar(`sorteado.${i}`, 'senha-comum', sala.token)).statusCode).toBe(401);
    }
    const passou = await entrar('carla.dias', 'senha-da-carla', sala.token);
    expect(passou.statusCode).toBe(429);
    // O outro computador não espera, e este volta depois do minuto.
    expect((await entrar('carla.dias', 'senha-da-carla')).statusCode).toBe(200);
    api.relogio.avancar(MINUTO);
    expect((await entrar('carla.dias', 'senha-da-carla', sala.token)).statusCode).toBe(200);
  });
});

describe('o código do app', () => {
  let chaveDoApp: Buffer;

  beforeAll(async () => {
    // A primeira entrada cria a conta do diretório; depois, o código do app cadastrado.
    expect((await entrar('davi.costa', 'senha-do-davi')).statusCode).toBe(200);
    const conta = await contaDe('davi.costa');
    ({ chaveDoApp } = await ativarDoisPassos(api, org, conta?.id ?? ''));
  });

  const codigoCerto = () => gerarCodigoTotp(chaveDoApp, api.relogio.agora().getTime());

  it('falta o código: a pendente de 5 minutos, e o código certo abre a sessão com outro token', async () => {
    const primeira = await entrar('davi.costa', 'senha-do-davi');
    expect(primeira.statusCode, primeira.body).toBe(200);
    const { pendente, faltaOCodigo, expiraEm } = primeira.json();
    expect(faltaOCodigo).toBe(true);
    expect(expiraEm).toBe(new Date(api.relogio.agora().getTime() + 5 * MINUTO).toISOString());
    // A pendente não é a sessão.
    expect((await daSessao('POST', '/api/aba/uso', pendente)).statusCode).toBe(401);
    const errado = await comCodigo(pendente, '000000');
    expect(errado.statusCode).toBe(401);
    expect(errado.json()).toMatchObject({ type: 'urn:grafite:problema:codigo-invalido' });
    const certo = await comCodigo(pendente, codigoCerto());
    expect(certo.statusCode, certo.body).toBe(200);
    const { token } = certo.json();
    expect(token).not.toBe(pendente);
    expect(await sessaoDo(token)).toMatchObject({
      ativadaEm: api.relogio.agora(),
      ultimoUsoEm: api.relogio.agora(),
      tentativasDeCodigo: 1,
    });
    expect((await daSessao('POST', '/api/aba/uso', token)).statusCode).toBe(204);
    // A pendente usada não volta.
    expect((await comCodigo(pendente, codigoCerto())).statusCode).toBe(401);
    await liberar('davi.costa');
  });

  it('a pendente vence em 5 minutos, e a de outro aparelho não serve', async () => {
    const { pendente } = (await entrar('davi.costa', 'senha-do-davi')).json();
    const outro = await registrar('guid-prod-04', 'PC-PROD-04', 'senha');
    expect((await comCodigo(pendente, codigoCerto(), outro.token)).statusCode).toBe(401);
    api.relogio.avancar(5 * MINUTO);
    const vencida = await comCodigo(pendente, codigoCerto());
    expect(vencida.statusCode).toBe(401);
    expect(vencida.json()).toMatchObject({ type: 'urn:grafite:problema:pendente-da-aba-recusada' });
  });

  it('cinco códigos errados encerram a pendente', async () => {
    const { pendente } = (await entrar('davi.costa', 'senha-do-davi')).json();
    for (let i = 0; i < 4; i++) {
      expect((await comCodigo(pendente, '000000')).json()).toMatchObject({
        type: 'urn:grafite:problema:codigo-invalido',
      });
    }
    const quinto = await comCodigo(pendente, '000000');
    expect(quinto.json()).toMatchObject({ type: 'urn:grafite:problema:tentativas-esgotadas' });
    expect(await sessaoDo(pendente)).toMatchObject({ motivoDoFim: 'tentativas-esgotadas' });
    expect((await comCodigo(pendente, codigoCerto())).statusCode).toBe(401);
    await liberar('davi.costa');
  });

  it('o código certo depois de quatro errados zera as tentativas do usuário', async () => {
    const { pendente } = (await entrar('davi.costa', 'senha-do-davi')).json();
    for (let i = 0; i < 4; i++) await comCodigo(pendente, '000000');
    expect((await comCodigo(pendente, codigoCerto())).statusCode).toBe(200);
    const [tentativa] = await naOrg((tx) =>
      tx.select().from(tentativasDeEntrada).where(eq(tentativasDeEntrada.usuario, 'davi.costa')),
    );
    expect(tentativa).toMatchObject({ falhasSeguidas: 0, bloqueadaAte: null });
  });

  it('quem exige os dois passos sem os ter é recusado com a frase de cadastrar pelo navegador', async () => {
    await naOrg((tx) =>
      tx.update(contas).set({ exigeDoisPassos: true }).where(eq(contas.usuario, 'carla.dias')),
    );
    const r = await entrar('carla.dias', 'senha-da-carla');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({
      motivo: 'cadastrar-o-codigo',
      detail: 'Cadastre o código do app pelo navegador antes de usar a aba.',
    });
    await naOrg((tx) =>
      tx.update(contas).set({ exigeDoisPassos: false }).where(eq(contas.usuario, 'carla.dias')),
    );
  });
});

describe('o fim da sessão pela senha', () => {
  it('Troca de pessoa: o "Sair" encerra a sessão no servidor', async () => {
    const { token } = (await entrar('carla.dias', 'senha-da-carla')).json();
    expect((await daSessao('DELETE', '/api/aba/sessao', token)).statusCode).toBe(204);
    expect(await sessaoDo(token)).toMatchObject({ motivoDoFim: 'saida' });
    const depois = await daSessao('POST', '/api/aba/uso', token);
    expect(depois.statusCode).toBe(401);
    expect(depois.json()).toMatchObject({ motivoDoFim: 'saida' });
    const encerradas = await acoes('sessao-da-aba.encerrada');
    const saida = encerradas.find(
      (linha) => (linha.dados as { motivo?: string }).motivo === 'saida',
    );
    expect(saida).toMatchObject({
      atorTipo: 'conta',
      dados: { motivo: 'saida', usuario: 'carla.dias' },
    });
    expect((await entrar('paulo.reis', 'senha-do-paulo')).statusCode).toBe(200);
  });

  it('30 minutos sem uso encerram a sessão, contados pelo último uso, e a renovação não conta', async () => {
    const { token } = (await entrar('carla.dias', 'senha-da-carla')).json();
    api.relogio.avancar(20 * MINUTO);
    expect((await daSessao('POST', '/api/aba/uso', token)).statusCode).toBe(204);
    api.relogio.avancar(20 * MINUTO);
    // 40 minutos desde a entrada, 20 desde o uso: vale, e a renovação não é uso.
    expect((await daSessao('POST', '/api/aba/sessao/renovar', token, {})).statusCode).toBe(200);
    api.relogio.avancar(10 * MINUTO);
    const parada = await daSessao('POST', '/api/aba/uso', token);
    expect(parada.statusCode).toBe(401);
    expect(parada.json()).toMatchObject({ motivoDoFim: 'sem-uso' });
    expect(await sessaoDo(token)).toMatchObject({ motivoDoFim: 'sem-uso' });
  });

  it('a renovação confere a pessoa no AD sem a senha, e quem saiu do grupo tem a sessão encerrada', async () => {
    const { token } = (await entrar('rita.moura', 'senha-da-rita')).json();
    const renovada = await daSessao('POST', '/api/aba/sessao/renovar', token, {});
    expect(renovada.statusCode, renovada.body).toBe(200);
    ad.tirar(dns.rita ?? '', dns.grupo ?? '');
    const recusada = await daSessao('POST', '/api/aba/sessao/renovar', token, {});
    expect(recusada.statusCode).toBe(403);
    expect(recusada.json()).toMatchObject({ motivo: 'sem-grupo' });
    expect(await sessaoDo(token)).toMatchObject({ motivoDoFim: 'pessoa-recusada' });
    ad.incluir(dns.rita ?? '', dns.grupo ?? '');
  });
});
