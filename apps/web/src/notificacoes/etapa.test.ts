// A etapa "Conectando alertas" da chegada (spec chegada, "Carregamento com etapas reais"; change
// p3b-notificacoes-no-servidor, design, decisão 11): com a sessão valendo, a chegada espera as
// notificações recentes, as da contagem do sino, e a conexão de eventos aberta, dentro do prazo do
// servidor; sem a sessão valendo, a etapa não vale, e o carregamento não a mostra.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarClienteDeConsultas } from '../api/consultas.ts';
import { criarPrazoDoServidor, PRAZO_DO_SERVIDOR } from '../chegada/prazo.ts';
import { criarLojaDaSessao, type LojaDaSessao } from '../sessao/loja.ts';
import { sessaoAtiva } from '../teste/sessao.ts';
import { etapaDosAlertas } from './etapa.ts';
import { CHAVE_DAS_NOTIFICACOES } from './useNotificacoes.tsx';

const lojas: LojaDaSessao[] = [];

afterEach(() => {
  for (const loja of lojas.splice(0)) loja.parar();
  vi.useRealTimers();
});

/** Uma espera que o teste termina quando quer. */
function espera() {
  let terminar = () => {};
  const promessa = new Promise<void>((resolver) => {
    terminar = resolver;
  });
  return { promessa, terminar };
}

/** Acompanha uma espera: se ela já terminou. */
function acompanhar(promessa: Promise<void>) {
  const estado = { terminou: false };
  void promessa.then(() => {
    estado.terminou = true;
  });
  return estado;
}

const RECENTES = { itens: [], naoLidas: 2, proximo: null };
const conexaoAberta = { aberta: () => Promise.resolve() };

/** A loja com a sessão valendo, e as notificações que o servidor dá. */
function comSessao(notificacoes: () => Response | Promise<Response>) {
  const loja = sessaoAtiva([], { 'GET /api/notificacoes': notificacoes });
  lojas.push(loja);
  return loja;
}

describe('etapa dos alertas', () => {
  it('com a sessão valendo, espera as recentes do sino e a conexão de eventos aberta', async () => {
    const loja = comSessao(() => Response.json(RECENTES));
    const consultas = criarClienteDeConsultas({ esperaEntreTentativas: 0 });
    const conexao = espera();
    const etapa = etapaDosAlertas({
      loja,
      consultas,
      conexao: { aberta: () => conexao.promessa },
      prazo: criarPrazoDoServidor(),
    });
    expect(etapa.rotulo).toBe('Conectando alertas');
    expect(etapa.vale?.()).toBe(true);
    const pronta = acompanhar(etapa.pronta());
    await vi.waitFor(() =>
      expect(consultas.getQueryData([...CHAVE_DAS_NOTIFICACOES, 'recentes'])).toEqual(RECENTES),
    );
    expect(pronta.terminou).toBe(false);
    conexao.terminar();
    await vi.waitFor(() => expect(pronta.terminou).toBe(true));
  });

  it('sem a sessão valendo, a etapa não vale', () => {
    const loja = criarLojaDaSessao({
      buscar: async () => new Response(null, { status: 503 }),
      estado: { tipo: 'desconhecida' },
    });
    lojas.push(loja);
    const etapa = etapaDosAlertas({
      loja,
      consultas: criarClienteDeConsultas(),
      conexao: conexaoAberta,
      prazo: criarPrazoDoServidor(),
    });
    expect(etapa.vale?.()).toBe(false);
  });

  it('sem resposta das notificações, termina no fim do prazo do servidor', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    let relogio = 0;
    const prazo = criarPrazoDoServidor({ agora: () => relogio });
    const avancar = async (ms: number) => {
      relogio += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    const loja = comSessao(() => new Promise<Response>(() => {}));
    // A sessão levou 3 s: a etapa dos alertas tem os 2 s que restam.
    prazo.comecar();
    await avancar(3000);
    const etapa = etapaDosAlertas({
      loja,
      consultas: criarClienteDeConsultas({ esperaEntreTentativas: 0 }),
      conexao: conexaoAberta,
      prazo,
    });
    const pronta = acompanhar(etapa.pronta());
    await avancar(PRAZO_DO_SERVIDOR - 3000 - 1);
    expect(pronta.terminou).toBe(false);
    await avancar(1);
    expect(pronta.terminou).toBe(true);
  });

  it('a leitura que falha termina a etapa na hora, sem tentar de novo', async () => {
    let pedidos = 0;
    const loja = comSessao(() => {
      pedidos += 1;
      throw new TypeError('Failed to fetch');
    });
    const etapa = etapaDosAlertas({
      loja,
      consultas: criarClienteDeConsultas({ esperaEntreTentativas: 0 }),
      conexao: conexaoAberta,
      prazo: criarPrazoDoServidor(),
    });
    await etapa.pronta();
    expect(pedidos).toBe(1);
  });
});
