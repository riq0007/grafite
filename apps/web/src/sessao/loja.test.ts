import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarLojaDaSessao, type EstadoDaSessao, type LojaDaSessao } from './loja.ts';

const ORGANIZACAO = { nome: 'Empresa' };
const CONTA = {
  id: '0199a6e0-0000-7000-8000-0000000000c1',
  usuario: 'ana.souza',
  nome: 'Ana Souza',
  pessoaId: '0199a6e0-0000-7000-8000-0000000000a1',
  foto: null,
  preferencias: {},
};
const ACESSO = {
  permissoes: [{ chave: 'pessoas.ver', organizacao: true, locais: [] }],
};
const SESSAO_ATIVA = {
  conta: CONTA,
  pendencia: null,
  csrf: 'csrf-ativa',
  expiraEm: '2099-01-01T00:00:00.000Z',
  acesso: ACESSO,
};
const pendente = (pendencia: string, csrf = 'csrf-pendente') => ({
  ...SESSAO_ATIVA,
  pendencia,
  csrf,
});

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const estado = (sessao: unknown) => json(200, { organizacao: ORGANIZACAO, sessao });

const problema = (status: number, codigo: string, extras: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      type: `urn:grafite:problema:${codigo}`,
      title: 'Título',
      status,
      detail: `Detalhe de ${codigo}.`,
      codigoDeRastreio: 'R7K2-9QXM',
      ...extras,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

const semRede = () => Promise.reject(new TypeError('Failed to fetch'));
const vazia = () => new Response(null, { status: 204 });

type Resposta = Response | (() => Response | Promise<Response>);

let respostas: Resposta[] = [];
let pedidos: Request[] = [];
let loja: LojaDaSessao;

const buscar = vi.fn(async (pedido: Request) => {
  pedidos.push(pedido);
  const proxima = respostas.shift();
  if (!proxima) throw new Error(`Sem resposta preparada para ${pedido.method} ${pedido.url}.`);
  return typeof proxima === 'function' ? proxima() : proxima;
});

const responder = (...lista: Resposta[]) => {
  respostas.push(...lista);
};

const ultimo = () => pedidos.at(-1);
const caminho = (pedido: Request | undefined) =>
  `${pedido?.method} ${new URL(pedido?.url ?? '').pathname}`;

/** A loja já validada, no estado da resposta. */
async function comecarCom(resposta: Resposta) {
  responder(resposta);
  await loja.validar();
}

beforeEach(() => {
  respostas = [];
  pedidos = [];
  buscar.mockClear();
  vi.useFakeTimers();
  loja = criarLojaDaSessao({ buscar });
});

afterEach(() => {
  loja.parar();
  vi.useRealTimers();
});

describe('validar', () => {
  it('começa validando', () => {
    expect(loja.ler()).toEqual({ tipo: 'validando' });
  });

  it('começa no estado dado, como o app aberto depois da chegada, e ele conta como a sessão da página', async () => {
    const ativa: EstadoDaSessao = {
      tipo: 'ativa',
      organizacao: 'Empresa',
      conta: CONTA,
      csrf: 'csrf-ativa',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: { permissoes: [] },
    };
    const aberta = criarLojaDaSessao({ buscar, estado: ativa });
    expect(aberta.ler()).toEqual(ativa);
    responder(problema(401, 'sem-sessao'));
    await aberta.cliente.GET('/conta');
    expect(aberta.ler()).toMatchObject({ terminou: true, usuarioAnterior: 'ana.souza' });
    aberta.parar();
  });

  it('sem sessão, guarda o nome da organização', async () => {
    await comecarCom(estado(null));
    expect(caminho(ultimo())).toBe('GET /api/sessao');
    expect(loja.ler()).toEqual({ tipo: 'sem-sessao', organizacao: 'Empresa', terminou: false });
  });

  it('com a sessão valendo, guarda a conta, o CSRF e o acesso', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    expect(loja.ler()).toEqual({
      tipo: 'ativa',
      organizacao: 'Empresa',
      conta: CONTA,
      csrf: 'csrf-ativa',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: ACESSO,
    });
  });

  it('com a sessão pendente, guarda o passo da vez', async () => {
    await comecarCom(estado(pendente('trocar-senha')));
    expect(loja.ler()).toEqual({
      tipo: 'pendente',
      organizacao: 'Empresa',
      conta: CONTA,
      pendencia: 'trocar-senha',
      csrf: 'csrf-pendente',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: ACESSO,
    });
  });

  it('guarda os padrões da organização que o estado traz, com ou sem sessão', async () => {
    expect(loja.lerPadroes()).toBeNull();
    const padroes = { aparencia: { tema: 'nevoa' } };
    await comecarCom(
      json(200, { organizacao: { ...ORGANIZACAO, preferencias: padroes }, sessao: null }),
    );
    expect(loja.lerPadroes()).toEqual(padroes);
    responder(
      json(200, { organizacao: { ...ORGANIZACAO, preferencias: {} }, sessao: SESSAO_ATIVA }),
    );
    await loja.validar();
    expect(loja.lerPadroes()).toEqual({});
  });

  it('sem resposta do servidor, os padrões que ele deu por último continuam', async () => {
    const padroes = { dock: { posicao: 'esquerda' } };
    await comecarCom(
      json(200, { organizacao: { ...ORGANIZACAO, preferencias: padroes }, sessao: SESSAO_ATIVA }),
    );
    responder(semRede);
    await loja.validar();
    expect(loja.ler()).toEqual({ tipo: 'desconhecida' });
    expect(loja.lerPadroes()).toEqual(padroes);
  });

  it('o endereço desconhecido vira um estado próprio', async () => {
    await comecarCom(problema(404, 'endereco-desconhecido'));
    expect(loja.ler()).toEqual({ tipo: 'endereco-desconhecido' });
  });

  it.each([
    ['sem rede', semRede],
    ['com um erro do servidor', () => problema(500, 'erro-interno')],
    ['com a resposta de um proxy', () => new Response('<html>Bad Gateway</html>', { status: 502 })],
  ])('%s, a sessão fica desconhecida', async (_caso, resposta) => {
    await comecarCom(resposta);
    expect(loja.ler()).toEqual({ tipo: 'desconhecida' });
  });

  it('não espera mais de 5 s pela resposta', async () => {
    responder(() => new Promise<Response>(() => {}));
    const validacao = loja.validar();
    await vi.advanceTimersByTimeAsync(4999);
    expect(loja.ler()).toEqual({ tipo: 'validando' });
    await vi.advanceTimersByTimeAsync(1);
    await validacao;
    expect(loja.ler()).toEqual({ tipo: 'desconhecida' });
  });

  it('a sessão desconhecida é validada de novo a cada 30 s até o servidor responder', async () => {
    await comecarCom(semRede);
    responder(semRede);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(loja.ler()).toEqual({ tipo: 'desconhecida' });
    responder(estado(SESSAO_ATIVA));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(loja.ler()).toMatchObject({ tipo: 'ativa' });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it('a rede que volta valida a sessão desconhecida na hora', async () => {
    await comecarCom(semRede);
    responder(estado(null));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(loja.ler()).toMatchObject({ tipo: 'sem-sessao', terminou: false });
  });

  it('a rede que volta não valida de novo uma sessão conhecida', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('duas validações ao mesmo tempo fazem um pedido só', async () => {
    responder(estado(null));
    await Promise.all([loja.validar(), loja.validar()]);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe('entrar', () => {
  beforeEach(() => comecarCom(estado(null)));

  it('com sucesso, a sessão passa a valer', async () => {
    responder(estado(SESSAO_ATIVA));
    expect(await loja.entrar({ usuario: 'ana.souza', senha: 'cavalo bateria' })).toEqual({
      ok: true,
    });
    expect(caminho(ultimo())).toBe('POST /api/sessao');
    expect(await ultimo()?.json()).toEqual({ usuario: 'ana.souza', senha: 'cavalo bateria' });
    expect(loja.ler()).toMatchObject({ tipo: 'ativa', csrf: 'csrf-ativa' });
  });

  it('com um passo pendente, a sessão fica pendente', async () => {
    responder(estado(pendente('segundo-passo')));
    await loja.entrar({ usuario: 'ana.souza', senha: 'x' });
    expect(loja.ler()).toMatchObject({ tipo: 'pendente', pendencia: 'segundo-passo' });
  });

  it.each([
    [
      'a senha errada limpa a senha',
      () => problema(401, 'credenciais-invalidas'),
      { erro: 'Detalhe de credenciais-invalidas.', limparSenha: true },
    ],
    [
      'o bloqueio diz quanto falta',
      () => problema(429, 'entrada-bloqueada'),
      { erro: 'Detalhe de entrada-bloqueada.' },
    ],
    [
      'o limite de requisições diz quanto falta',
      () => problema(429, 'muitas-requisicoes'),
      { erro: 'Detalhe de muitas-requisicoes.' },
    ],
    [
      'o erro do servidor traz o código de rastreio',
      () => problema(500, 'erro-interno'),
      { erro: 'Não foi possível entrar. Informe à TI o código R7K2-9QXM.' },
    ],
    ['sem rede, não há conexão', semRede, { erro: 'Sem conexão com o servidor. Tente de novo.' }],
    [
      'a resposta de um proxy também é falta de conexão',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
      { erro: 'Sem conexão com o servidor. Tente de novo.' },
    ],
  ])('%s', async (_caso, resposta, esperado) => {
    responder(resposta);
    expect(await loja.entrar({ usuario: 'ana.souza', senha: 'x' })).toEqual(esperado);
    expect(loja.ler()).toEqual({ tipo: 'sem-sessao', organizacao: 'Empresa', terminou: false });
  });

  it('as escritas seguintes levam o CSRF da sessão nova', async () => {
    responder(estado(SESSAO_ATIVA), vazia());
    await loja.entrar({ usuario: 'ana.souza', senha: 'x' });
    await loja.sair();
    expect(ultimo()?.headers.get('x-grafite-csrf')).toBe('csrf-ativa');
  });
});

describe('o segundo passo', () => {
  beforeEach(() => comecarCom(estado(pendente('segundo-passo'))));

  it('o código aceito faz a sessão valer', async () => {
    responder(estado(SESSAO_ATIVA));
    expect(await loja.mandarCodigo('287082')).toEqual({ ok: true });
    expect(caminho(ultimo())).toBe('POST /api/sessao/segundo-passo');
    expect(ultimo()?.headers.get('x-grafite-csrf')).toBe('csrf-pendente');
    expect(loja.ler()).toMatchObject({ tipo: 'ativa', csrf: 'csrf-ativa' });
  });

  it('o código de recuperação aceito diz quantos restam', async () => {
    responder(json(200, { organizacao: ORGANIZACAO, sessao: SESSAO_ATIVA, codigosRestantes: 9 }));
    expect(await loja.mandarCodigo('a7k2m-9qx4t')).toEqual({ ok: true, codigosRestantes: 9 });
  });

  it('o código recusado volta como texto, e a sessão continua pendente', async () => {
    responder(problema(401, 'codigo-invalido'));
    expect(await loja.mandarCodigo('000000')).toEqual({ erro: 'Detalhe de codigo-invalido.' });
    expect(loja.ler()).toMatchObject({ tipo: 'pendente', pendencia: 'segundo-passo' });
  });

  it('os códigos errados demais levam de volta ao usuário e senha, com o motivo', async () => {
    responder(problema(401, 'tentativas-esgotadas'));
    await loja.mandarCodigo('000000');
    expect(loja.ler()).toEqual({
      tipo: 'sem-sessao',
      organizacao: 'Empresa',
      terminou: false,
      mensagem: 'Detalhe de tentativas-esgotadas.',
    });
  });

  it('a sessão pendente que expirou volta ao usuário e senha', async () => {
    responder(problema(401, 'sem-sessao'));
    await loja.mandarCodigo('287082');
    expect(loja.ler()).toEqual({ tipo: 'sem-sessao', organizacao: 'Empresa', terminou: false });
  });
});

describe('a troca da senha', () => {
  beforeEach(() => comecarCom(estado(pendente('trocar-senha'))));

  it('aceita, segue para o próximo passo e diz quantas sessões encerrou', async () => {
    responder(
      json(200, {
        organizacao: ORGANIZACAO,
        sessao: pendente('cadastrar-dois-passos', 'csrf-novo'),
        sessoesEncerradas: 2,
      }),
    );
    expect(await loja.trocarSenha({ senhaAtual: 'temporaria', senhaNova: 'nova' })).toEqual({
      ok: true,
      sessoesEncerradas: 2,
    });
    expect(caminho(ultimo())).toBe('PUT /api/conta/senha');
    expect(loja.ler()).toMatchObject({
      tipo: 'pendente',
      pendencia: 'cadastrar-dois-passos',
      csrf: 'csrf-novo',
    });
  });

  it('a senha nova recusada aponta o campo, com o motivo', async () => {
    responder(
      problema(400, 'senha-recusada', { campos: { senhaNova: 'Use pelo menos 12 caracteres.' } }),
    );
    expect(await loja.trocarSenha({ senhaAtual: 'temporaria', senhaNova: 'curta' })).toEqual({
      erro: 'Use pelo menos 12 caracteres.',
      campo: 'senhaNova',
    });
  });

  it('a senha atual errada aponta o campo dela', async () => {
    responder(
      problema(400, 'senha-atual-incorreta', {
        campos: { senhaAtual: 'A senha atual está incorreta.' },
      }),
    );
    expect(await loja.trocarSenha({ senhaAtual: 'errada', senhaNova: 'nova' })).toEqual({
      erro: 'A senha atual está incorreta.',
      campo: 'senhaAtual',
    });
  });

  it('o erro do servidor diz o que não foi possível', async () => {
    responder(problema(500, 'erro-interno'));
    expect(await loja.trocarSenha({ senhaAtual: 'temporaria', senhaNova: 'nova' })).toEqual({
      erro: 'Não foi possível trocar a senha. Informe à TI o código R7K2-9QXM.',
    });
  });
});

describe('o cadastro dos dois passos', () => {
  const ativacao = (sessao: unknown) =>
    json(200, {
      organizacao: ORGANIZACAO,
      sessao,
      codigosDeRecuperacao: ['a7k2m-9qx4t', 'b3n8p-2wr6v'],
      sessoesEncerradas: 0,
    });

  it('começa com a chave e a URI do QR code', async () => {
    await comecarCom(estado(pendente('cadastrar-dois-passos')));
    responder(json(200, { chave: 'GEZD GNBV', uri: 'otpauth://totp/Grafite' }));
    expect(await loja.comecarCadastro()).toEqual({
      chave: 'GEZD GNBV',
      uri: 'otpauth://totp/Grafite',
    });
    expect(caminho(ultimo())).toBe('POST /api/conta/dois-passos/cadastro');
  });

  it('na entrada, mostra os códigos antes de a sessão valer na tela', async () => {
    await comecarCom(estado(pendente('cadastrar-dois-passos')));
    responder(ativacao(SESSAO_ATIVA));
    expect(await loja.confirmarCadastro('287082')).toEqual({
      ok: true,
      codigos: ['a7k2m-9qx4t', 'b3n8p-2wr6v'],
    });
    expect(caminho(ultimo())).toBe('POST /api/conta/dois-passos/confirmacao');
    expect(loja.ler()).toEqual({
      tipo: 'pendente',
      organizacao: 'Empresa',
      conta: CONTA,
      pendencia: 'guardar-codigos',
      codigos: ['a7k2m-9qx4t', 'b3n8p-2wr6v'],
      csrf: 'csrf-ativa',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: ACESSO,
    });
    loja.continuar();
    expect(loja.ler()).toMatchObject({ tipo: 'ativa', csrf: 'csrf-ativa', acesso: ACESSO });
  });

  it('com a sessão valendo, como nos Ajustes, só troca o CSRF', async () => {
    await comecarCom(estado({ ...SESSAO_ATIVA, csrf: 'csrf-antigo' }));
    responder(ativacao(SESSAO_ATIVA));
    expect(await loja.confirmarCadastro('287082')).toMatchObject({ ok: true });
    expect(loja.ler()).toMatchObject({ tipo: 'ativa', csrf: 'csrf-ativa' });
  });

  it('o código recusado volta como texto', async () => {
    await comecarCom(estado(pendente('cadastrar-dois-passos')));
    responder(problema(400, 'codigo-invalido'));
    expect(await loja.confirmarCadastro('000000')).toEqual({ erro: 'Detalhe de codigo-invalido.' });
    expect(loja.ler()).toMatchObject({ tipo: 'pendente', pendencia: 'cadastrar-dois-passos' });
  });

  it('o erro do servidor diz o que não foi possível', async () => {
    await comecarCom(estado(pendente('cadastrar-dois-passos')));
    responder(problema(500, 'erro-interno'));
    expect(await loja.comecarCadastro()).toEqual({
      erro: 'Não foi possível cadastrar a verificação em dois passos. Informe à TI o código R7K2-9QXM.',
    });
  });
});

describe('o acesso que muda com a sessão aberta', () => {
  const ACESSO_NOVO = {
    permissoes: [{ chave: 'auditoria.ver', organizacao: false, locais: ['jundiai'] }],
  };
  const EXIGENCIA = 'A verificação em dois passos passou a ser exigida para a sua conta.';

  /** O pedido de um módulo recebe a resposta, e a nova validação, se houver, termina. */
  async function pedirDoModulo() {
    await loja.cliente.GET('/conta');
    await vi.advanceTimersByTimeAsync(0);
  }

  it('uma recusa sem-permissao valida de novo, e o acesso novo passa a valer', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(problema(403, 'sem-permissao'), estado({ ...SESSAO_ATIVA, acesso: ACESSO_NOVO }));
    await pedirDoModulo();
    expect(pedidos.map(caminho)).toEqual(['GET /api/sessao', 'GET /api/conta', 'GET /api/sessao']);
    expect(loja.ler()).toMatchObject({ tipo: 'ativa', acesso: ACESSO_NOVO });
  });

  it('uma recusa pela pendência valida de novo, e o cadastro exigido vem com a mensagem', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(
      problema(403, 'pendencia', { pendencia: 'cadastrar-dois-passos' }),
      estado(pendente('cadastrar-dois-passos')),
    );
    await pedirDoModulo();
    expect(pedidos.map(caminho)).toEqual(['GET /api/sessao', 'GET /api/conta', 'GET /api/sessao']);
    expect(loja.ler()).toMatchObject({
      tipo: 'pendente',
      pendencia: 'cadastrar-dois-passos',
      mensagem: EXIGENCIA,
    });
  });

  it('o cadastro exigido na entrada não traz a mensagem', async () => {
    await comecarCom(estado(pendente('cadastrar-dois-passos')));
    expect(loja.ler()).not.toHaveProperty('mensagem');
  });

  it('as outras recusas não validam de novo', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(problema(403, 'csrf-invalido'), problema(409, 'conflito'));
    await pedirDoModulo();
    await pedirDoModulo();
    expect(pedidos.map(caminho)).toEqual(['GET /api/sessao', 'GET /api/conta', 'GET /api/conta']);
  });
});

describe('o fim da sessão', () => {
  it('o sem-sessao no meio do uso diz que a sessão terminou e guarda o usuário', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(problema(401, 'sem-sessao'));
    await loja.cliente.GET('/conta');
    expect(loja.ler()).toEqual({
      tipo: 'sem-sessao',
      organizacao: 'Empresa',
      terminou: true,
      usuarioAnterior: 'ana.souza',
    });
  });

  it('a sessão terminada continua terminada ao errar a senha ou sair de um passo', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(problema(401, 'sem-sessao'));
    await loja.cliente.GET('/conta');
    responder(problema(401, 'credenciais-invalidas'));
    await loja.entrar({ usuario: 'ana.souza', senha: 'errada' });
    expect(loja.ler()).toMatchObject({ terminou: true, usuarioAnterior: 'ana.souza' });
    responder(estado(pendente('segundo-passo')), vazia());
    await loja.entrar({ usuario: 'ana.souza', senha: 'certa' });
    await loja.sair();
    expect(loja.ler()).toMatchObject({ terminou: true, usuarioAnterior: 'ana.souza' });
  });

  it('a sessão desconhecida que recebe sem-sessao valida de novo para saber a organização', async () => {
    await comecarCom(semRede);
    responder(problema(401, 'sem-sessao'), estado(null));
    await loja.cliente.GET('/conta');
    await vi.advanceTimersByTimeAsync(0);
    expect(caminho(ultimo())).toBe('GET /api/sessao');
    expect(loja.ler()).toEqual({ tipo: 'sem-sessao', organizacao: 'Empresa', terminou: false });
  });

  it('sair encerra a sessão no servidor', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(vazia());
    expect(await loja.sair()).toEqual({ ok: true });
    expect(caminho(ultimo())).toBe('DELETE /api/sessao');
    expect(loja.ler()).toEqual({ tipo: 'sem-sessao', organizacao: 'Empresa', terminou: false });
  });

  it('sair sem rede avisa e mantém a sessão', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(semRede);
    expect(await loja.sair()).toEqual({ erro: 'Sem conexão com o servidor. Tente de novo.' });
    expect(loja.ler()).toMatchObject({ tipo: 'ativa' });
  });

  it('cada mudança avisa quem assina, até deixar de assinar', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    const ouvinte = vi.fn();
    const deixar = loja.assinar(ouvinte);
    responder(vazia());
    await loja.sair();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    deixar();
    responder(estado(SESSAO_ATIVA));
    await loja.entrar({ usuario: 'ana.souza', senha: 'x' });
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
});

describe('a sessão que expira sem pedido nenhum', () => {
  const AGORA = new Date('2026-10-02T12:00:00.000Z');
  const DUAS_HORAS = 2 * 60 * 60 * 1000;
  const comExpiracao = (sessao: object, expiraEm: string) => estado({ ...sessao, expiraEm });

  it('na hora em que expira, valida de novo e, sem sessão, diz que terminou', async () => {
    vi.setSystemTime(AGORA);
    await comecarCom(comExpiracao(SESSAO_ATIVA, '2026-10-02T14:00:00.000Z'));
    responder(estado(null));
    await vi.advanceTimersByTimeAsync(DUAS_HORAS - 1);
    expect(buscar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(loja.ler()).toEqual({
      tipo: 'sem-sessao',
      organizacao: 'Empresa',
      terminou: true,
      usuarioAnterior: 'ana.souza',
    });
  });

  it('se a sessão foi usada e vale mais, passa a vigiar a expiração nova', async () => {
    vi.setSystemTime(AGORA);
    await comecarCom(comExpiracao(SESSAO_ATIVA, '2026-10-02T14:00:00.000Z'));
    responder(comExpiracao(SESSAO_ATIVA, '2026-10-02T15:00:00.000Z'), estado(null));
    await vi.advanceTimersByTimeAsync(DUAS_HORAS + 2000);
    expect(loja.ler()).toMatchObject({ tipo: 'ativa', expiraEm: '2026-10-02T15:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(loja.ler()).toMatchObject({ tipo: 'sem-sessao', terminou: true });
  });

  it('a sessão pendente que expira volta ao usuário e senha', async () => {
    vi.setSystemTime(AGORA);
    await comecarCom(comExpiracao(pendente('segundo-passo'), '2026-10-02T12:10:00.000Z'));
    responder(estado(null));
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 2000);
    expect(loja.ler()).toEqual({ tipo: 'sem-sessao', organizacao: 'Empresa', terminou: false });
  });

  it('ao voltar à página, valida a sessão, que pode ter sido encerrada em outro dispositivo', async () => {
    await comecarCom(estado(SESSAO_ATIVA));
    responder(estado(null));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(loja.ler()).toMatchObject({ tipo: 'sem-sessao', terminou: true });
  });

  it('sem sessão, voltar à página não pede nada', async () => {
    await comecarCom(estado(null));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe('uma expiração distante', () => {
  it('além do maior tempo de um temporizador, não confere a sessão antes da hora', async () => {
    vi.useRealTimers();
    await comecarCom(estado({ ...SESSAO_ATIVA, expiraEm: '2099-01-01T00:00:00.000Z' }));
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(loja.ler()).toMatchObject({ tipo: 'ativa' });
  });
});

describe('o servidor', () => {
  it('antes da resposta do servidor, não diz o ambiente', () => {
    expect(loja.lerServidor()).toBeNull();
  });

  it('guarda o ambiente e se a organização opera o servidor, com ou sem sessão', async () => {
    await comecarCom(
      json(200, {
        ambiente: 'teste',
        organizacao: { ...ORGANIZACAO, operaOServidor: true },
        sessao: null,
      }),
    );
    expect(loja.lerServidor()).toEqual({
      ambiente: 'teste',
      operaOServidor: true,
      modulosDesligados: [],
    });
    const antes = loja.lerServidor();
    responder(
      json(200, {
        ambiente: 'teste',
        organizacao: { ...ORGANIZACAO, operaOServidor: true },
        sessao: SESSAO_ATIVA,
      }),
    );
    await loja.validar();
    expect(loja.lerServidor()).toBe(antes);
  });

  it('o servidor sem o ambiente na resposta não opera nada', async () => {
    await comecarCom(estado(null));
    expect(loja.lerServidor()).toEqual({
      ambiente: null,
      operaOServidor: false,
      modulosDesligados: [],
    });
  });

  it('guarda os módulos que a organização desligou, num objeto novo só quando eles mudam', async () => {
    const comDesligados = (modulosDesligados: string[]) =>
      json(200, {
        ambiente: 'producao',
        organizacao: { ...ORGANIZACAO, operaOServidor: false, modulosDesligados },
        sessao: SESSAO_ATIVA,
      });
    await comecarCom(comDesligados([]));
    const ligado = loja.lerServidor();
    responder(comDesligados([]));
    await loja.validar();
    expect(loja.lerServidor()).toBe(ligado);

    responder(comDesligados(['ativos']));
    await loja.validar();
    expect(loja.lerServidor()).toEqual({
      ambiente: 'producao',
      operaOServidor: false,
      modulosDesligados: ['ativos'],
    });
    const desligado = loja.lerServidor();
    responder(comDesligados(['ativos']));
    await loja.validar();
    expect(loja.lerServidor()).toBe(desligado);
  });
});
