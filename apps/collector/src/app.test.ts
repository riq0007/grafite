import { describe, expect, it } from 'vitest';
import { criarApp } from './app.ts';
import type { EstadoDoColetor } from './saude.ts';

const AGORA = new Date('2026-10-12T12:00:00.000Z');
const minutosAntes = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);
const TOKEN = `token-do-coletor-${'x'.repeat(40)}`;

function estado(mudancas: {
  configuracao?: Partial<EstadoDoColetor['configuracao']>;
  fila?: Partial<EstadoDoColetor['fila']>;
}): EstadoDoColetor {
  return {
    configuracao: {
      alvos: [
        { ativoId: 'a', ip: '10.0.0.5', coletas: [{ tipo: 'ping', intervalo: 120 }] },
        { ativoId: 'b', ip: '10.0.0.6', coletas: [{ tipo: 'ping', intervalo: 120 }] },
      ],
      ultimaConfiguracao: minutosAntes(2),
      tokenRecusado: false,
      apiSemResponderDesde: null,
      ...mudancas.configuracao,
    },
    fila: {
      naFila: 0,
      descartados: 0,
      ultimoLoteAceito: new Date(AGORA.getTime() - 10_000),
      tokenRecusado: false,
      apiSemResponderDesde: null,
      ...mudancas.fila,
    },
    agendador: { alvos: 2, rodando: 0, naFila: 0 },
  };
}

async function saude(estadoDoColetor: EstadoDoColetor) {
  const app = criarApp({ versao: '9.9.9', estado: () => estadoDoColetor, agora: () => AGORA });
  const resposta = await app.inject({ method: 'GET', url: '/health' });
  return { status: resposta.statusCode, corpo: resposta.json(), texto: resposta.body };
}

describe('GET /health do coletor', () => {
  it('informa a versão, a última configuração com os alvos, o último lote, a fila e o token', async () => {
    expect(await saude(estado({}))).toMatchObject({
      status: 200,
      corpo: {
        status: 'ok',
        versao: '9.9.9',
        configuracao: { recebidaEm: '2026-10-12T11:58:00.000Z', alvos: 2 },
        lotes: { ultimoAceitoEm: '2026-10-12T11:59:50.000Z', naFila: 0, descartados: 0 },
        tokenRecusado: false,
        apiSemResponderDesde: null,
      },
    });
  });

  it('antes da primeira configuração, diz que nada chegou ainda', async () => {
    const { corpo } = await saude(
      estado({
        configuracao: { alvos: [], ultimaConfiguracao: null },
        fila: { ultimoLoteAceito: null },
      }),
    );
    expect(corpo).toMatchObject({
      status: 'ok',
      configuracao: { recebidaEm: null, alvos: 0 },
      lotes: { ultimoAceitoEm: null },
    });
  });

  it('com a API sem responder há mais de 10 min, diz degradado, sem código de erro, com a fila', async () => {
    const { status, corpo } = await saude(
      estado({
        configuracao: { apiSemResponderDesde: minutosAntes(15) },
        fila: { apiSemResponderDesde: minutosAntes(14), naFila: 84, descartados: 0 },
      }),
    );
    expect(status).toBe(200);
    expect(corpo).toMatchObject({
      status: 'degradado',
      apiSemResponderDesde: '2026-10-12T11:45:00.000Z',
      lotes: { naFila: 84 },
    });
  });

  it('com a API sem responder há menos de 10 min, continua ok', async () => {
    const { corpo } = await saude(
      estado({ fila: { apiSemResponderDesde: minutosAntes(9), naFila: 3 } }),
    );
    expect(corpo).toMatchObject({
      status: 'ok',
      apiSemResponderDesde: '2026-10-12T11:51:00.000Z',
    });
  });

  it('com o token recusado, na configuração ou num lote, diz degradado e que o token foi recusado', async () => {
    expect(
      (await saude(estado({ configuracao: { tokenRecusado: true, alvos: [] } }))).corpo,
    ).toMatchObject({ status: 'degradado', tokenRecusado: true });
    expect((await saude(estado({ fila: { tokenRecusado: true } }))).corpo).toMatchObject({
      status: 'degradado',
      tokenRecusado: true,
    });
  });

  it('nunca mostra o token, as faixas nem os IPs dos alvos', async () => {
    const { texto } = await saude(estado({}));
    expect(texto).not.toContain(TOKEN);
    expect(texto).not.toMatch(/faixa|token"|10\.0\.0\./i);
  });
});
