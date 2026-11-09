// O entregador do push (spec notificacoes, "Push por severidade" e "Aparelhos do push"; change
// p3c-email-e-push, design, decisões 1, 7 e 8), com um serviço de push falso, em processo, que
// decifra o que o aparelho recebe.
import { conteudoDoPush } from '@grafite/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parDoPush, servicoDePushFalso } from '../../test/canais.ts';
import { criarEntregadorDePush, servicoDePushConhecido } from './push.ts';

const CHAVES = parDoPush();
let servico: Awaited<ReturnType<typeof servicoDePushFalso>>;

beforeAll(async () => {
  servico = await servicoDePushFalso();
});

afterAll(async () => {
  await servico.fechar();
});

const entregador = () =>
  criarEntregadorDePush(
    { ...CHAVES, contato: 'mailto:ti@empresa.com.br' },
    { extras: [servico.origem], agente: servico.agente },
  );

const CONTEUDO = conteudoDoPush({
  id: '0199d3a0-0000-7000-8000-0000000000e1',
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'HP LaserJet M404 · PAT-00412',
  origem: 'Alertas',
  destino: '/ativos/0199d3a0-0000-7000-8000-0000000000a1',
  criadaEm: new Date(),
});

describe('entregador do push', () => {
  it('manda o conteúdo cifrado, com a chave VAPID e a urgência, e o aparelho o decifra', async () => {
    const aparelho = servico.aparelho();
    expect(await entregador().enviar(aparelho.inscricao, CONTEUDO)).toBe('entregue');
    expect(aparelho.recebidos()).toEqual([CONTEUDO]);
    const [pedido] = servico.pedidos.filter(({ caminho }) => caminho === aparelho.caminho);
    expect(pedido?.cabecalhos['content-encoding']).toBe('aes128gcm');
    expect(pedido?.cabecalhos.ttl).toBe('86400');
    expect(pedido?.cabecalhos.urgency).toBe('high');
    expect(pedido?.cabecalhos.authorization).toMatch(
      new RegExp(`^vapid t=[\\w.-]+, k=${CHAVES.chavePublica}$`),
    );
  });

  it('o que não é crítico vai com a urgência normal', async () => {
    const aparelho = servico.aparelho();
    await entregador().enviar(aparelho.inscricao, { ...CONTEUDO, severidade: 'atencao' });
    const [pedido] = servico.pedidos.filter(({ caminho }) => caminho === aparelho.caminho);
    expect(pedido?.cabecalhos.urgency).toBe('normal');
  });

  it.each([404, 410])('a resposta %i diz que a inscrição não existe mais', async (codigo) => {
    const aparelho = servico.aparelho();
    servico.responder(aparelho.caminho, codigo);
    expect(await entregador().enviar(aparelho.inscricao, CONTEUDO)).toBe('expirada');
  });

  it('outra falha do serviço é lançada, para a fila tentar de novo', async () => {
    const aparelho = servico.aparelho();
    servico.responder(aparelho.caminho, 503);
    await expect(entregador().enviar(aparelho.inscricao, CONTEUDO)).rejects.toThrow();
  });

  it('o endereço fora dos serviços de push nunca é chamado', async () => {
    const aparelho = servico.aparelho();
    const semExtras = criarEntregadorDePush(
      { ...CHAVES, contato: 'mailto:ti@empresa.com.br' },
      { agente: servico.agente },
    );
    await expect(semExtras.enviar(aparelho.inscricao, CONTEUDO)).rejects.toThrow(
      'O endereço da inscrição não é de um serviço de push conhecido.',
    );
    expect(servico.pedidos.filter(({ caminho }) => caminho === aparelho.caminho)).toEqual([]);
  });
});

describe('serviços de push conhecidos', () => {
  it('aceita os dos navegadores, em https', () => {
    for (const endereco of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://android.googleapis.com/gcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QK1abc',
      'https://api.push.apple.com/3/device/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(servicoDePushConhecido(endereco), endereco).toBe(true);
    }
  });

  it('recusa o http, outro servidor e o que imita um conhecido', () => {
    for (const endereco of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://10.0.0.5/admin',
      'https://fcm.googleapis.com.exemplo.test/abc',
      'https://notify.windows.com.exemplo.test/abc',
      'https://exemplopush.apple.com/abc',
      'não é endereço',
    ]) {
      expect(servicoDePushConhecido(endereco), endereco).toBe(false);
    }
  });

  it('aceita as origens extras da configuração', () => {
    expect(servicoDePushConhecido('http://127.0.0.1:4380/push/1', ['http://127.0.0.1:4380'])).toBe(
      true,
    );
    expect(servicoDePushConhecido('http://127.0.0.1:4381/push/1', ['http://127.0.0.1:4380'])).toBe(
      false,
    );
  });
});
