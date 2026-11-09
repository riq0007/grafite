// A situação das OS pela API (spec ordens-de-servico, "Situação e histórico da OS", "Fornecedor da
// OS" e "Mudança da situação das OS em lote"; auditoria, "Eventos das ordens de serviço
// registrados"; change p4e-ordens-de-servico, design, decisões 4 e 6): a mudança de uma, com o
// fornecedor, a resolução, a reabertura, os encerramentos e o lote, em que cada uma muda ou fica
// como estava.
import { eventos, naOrganizacao } from '@grafite/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ApiDeTeste, abrirApi, auditoriaDaRequisicao } from '../../test/integracao.ts';
import { montarOrdens, type OrdensDeTeste } from '../../test/ordens.ts';
import type { UsuarioDasSolicitacoes } from '../../test/solicitacoes.ts';

const host = 'grafite.ordens-situacao.local';

let api: ApiDeTeste;
let s: OrdensDeTeste;

beforeAll(async () => {
  api = await abrirApi();
  s = await montarOrdens(api, host);
});

afterAll(async () => {
  await api?.fechar();
});

beforeEach(async () => {
  await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
});

const enviar = (caminho: string, corpo: object, usuario: UsuarioDasSolicitacoes = 'carla') =>
  s.cliente.enviar('POST', caminho, s.entradas[usuario], corpo);

/** Abre uma OS no NB-0031 e devolve o número. */
async function abrir(usuario: UsuarioDasSolicitacoes = 'carla'): Promise<number> {
  const r = await enviar('/ordens', { ativo: s.ativos.nb0031, problema: 'Não liga' }, usuario);
  return r.json().numero;
}

const mudar = (numero: number, corpo: object) => enviar(`/ordens/${numero}/situacao`, corpo);
const resolver = (numero: number, solucao: string | null = 'Fonte trocada') =>
  enviar(`/ordens/${numero}/resolucao`, { solucao });
const reabrir = (numero: number, motivo: string | null = 'Voltou a desligar sozinho') =>
  enviar(`/ordens/${numero}/reabertura`, { motivo });
const encerrar = (numero: number, corpo: object = { semResolver: false }) =>
  enviar(`/ordens/${numero}/encerramento`, corpo);
const corrigir = (numero: number, corpo: object) =>
  s.cliente.enviar('PATCH', `/ordens/${numero}`, s.entradas.carla, corpo);

describe('mudança da situação', () => {
  it('Aguardando a peça: a mudança entra no histórico, com quem, quando e a observação', async () => {
    const numero = await abrir();
    expect((await mudar(numero, { situacao: 'em-atendimento' })).statusCode).toBe(200);
    const r = await mudar(numero, {
      situacao: 'aguardando-peca',
      observacao: 'Fonte pedida ao almoxarifado',
    });
    expect(r.statusCode).toBe(200);
    const agora = api.relogio.agora().toISOString();
    expect(r.json()).toMatchObject({
      situacao: 'aguardando-peca',
      historico: [
        {
          situacao: 'aguardando-peca',
          texto: 'Fonte pedida ao almoxarifado',
          mudadaPor: { id: s.contas.carla, nome: 'Carla Dias' },
          mudadaEm: agora,
        },
        { situacao: 'em-atendimento', texto: null },
        { situacao: 'aberta' },
      ],
    });
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'ordem.situacao',
        alvoTipo: 'ordem',
        antes: { situacao: 'em-atendimento' },
        depois: { situacao: 'aguardando-peca', observacao: 'Fonte pedida ao almoxarifado' },
      },
    ]);
  });

  it('recusa a situação em que ela já está, a observação longa e a situação fora da lista', async () => {
    const numero = await abrir();
    await mudar(numero, { situacao: 'em-atendimento' });
    const mesma = await mudar(numero, { situacao: 'em-atendimento' });
    expect(mesma.statusCode).toBe(409);
    expect(mesma.json().detail).toBe(`A OS ${numero} já está em atendimento.`);
    const longa = await mudar(numero, { situacao: 'aguardando-peca', observacao: 'a'.repeat(501) });
    expect(longa.statusCode).toBe(400);
    expect(longa.json().campos).toEqual({ observacao: 'Use até 500 caracteres.' });
    const aberta = await mudar(numero, { situacao: 'aberta' });
    expect(aberta.statusCode).toBe(400);
    expect(aberta.json().campos).toEqual({ situacao: 'Escolha a situação.' });
  });

  it('Notebook na assistência: o fornecedor e a OS dele ficam na OS, também depois', async () => {
    const numero = await abrir();
    const semFornecedor = await mudar(numero, { situacao: 'aguardando-fornecedor' });
    expect(semFornecedor.statusCode).toBe(400);
    expect(semFornecedor.json().campos).toEqual({ fornecedor: 'Escolha o fornecedor.' });
    const inativo = await mudar(numero, {
      situacao: 'aguardando-fornecedor',
      fornecedor: s.fornecedores.locadora,
    });
    expect(inativo.statusCode).toBe(409);
    expect(inativo.json().campos).toEqual({
      fornecedor: 'O fornecedor escolhido está inativo. Escolha um fornecedor ativo.',
    });
    const r = await mudar(numero, {
      situacao: 'aguardando-fornecedor',
      fornecedor: s.fornecedores.dell,
      os: ' DL-5521 ',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'aguardando-fornecedor',
      fornecedor: { id: s.fornecedores.dell, nome: 'Dell Assistência' },
      osDoFornecedor: 'DL-5521',
      historico: [
        { situacao: 'aguardando-fornecedor', fornecedor: { nome: 'Dell Assistência' } },
        { situacao: 'aberta', fornecedor: null },
      ],
    });
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'ordem.situacao',
        depois: {
          situacao: 'aguardando-fornecedor',
          fornecedor: 'Dell Assistência',
          osDoFornecedor: 'DL-5521',
        },
      },
    ]);
    const voltou = await mudar(numero, { situacao: 'em-atendimento' });
    expect(voltou.json()).toMatchObject({
      situacao: 'em-atendimento',
      fornecedor: { nome: 'Dell Assistência' },
      osDoFornecedor: 'DL-5521',
      historico: [
        { situacao: 'em-atendimento', fornecedor: null },
        { situacao: 'aguardando-fornecedor' },
        { situacao: 'aberta' },
      ],
    });
  });

  it('Número da assistência informado depois: a correção muda a OS do fornecedor', async () => {
    const numero = await abrir();
    await mudar(numero, { situacao: 'aguardando-fornecedor', fornecedor: s.fornecedores.dell });
    const r = await corrigir(numero, {
      problema: 'Não liga',
      fornecedor: s.fornecedores.dell,
      os: 'DL-5521',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().osDoFornecedor).toBe('DL-5521');
    const [registro] = await auditoriaDaRequisicao(api, s.org, r);
    expect(registro).toMatchObject({
      acao: 'ordem.corrigida',
      depois: { osDoFornecedor: 'DL-5521' },
    });
    expect(registro?.antes).not.toHaveProperty('osDoFornecedor');
    const semFornecedor = await corrigir(numero, { problema: 'Não liga', fornecedor: null });
    expect(semFornecedor.statusCode).toBe(400);
    expect(semFornecedor.json().campos).toEqual({ fornecedor: 'Escolha o fornecedor.' });
    const soOProblema = await corrigir(numero, { problema: 'Não liga nem com a fonte' });
    expect(soOProblema.json()).toMatchObject({
      problema: 'Não liga nem com a fonte',
      fornecedor: { nome: 'Dell Assistência' },
      osDoFornecedor: 'DL-5521',
    });
  });
});

describe('resolução, reabertura e encerramento', () => {
  it('Resolvida reaberta: a resolução de antes fica no histórico, com a reabertura e o motivo', async () => {
    const numero = await abrir();
    const semSolucao = await resolver(numero, ' ');
    expect(semSolucao.statusCode).toBe(400);
    expect(semSolucao.json().campos).toEqual({ solucao: 'Descreva o que foi feito.' });
    const antesDeResolver = await reabrir(numero);
    expect(antesDeResolver.statusCode).toBe(409);
    expect(antesDeResolver.json().detail).toBe(`A OS ${numero} ainda não foi resolvida.`);

    const resolvida = await resolver(numero);
    expect(resolvida.statusCode).toBe(200);
    expect(resolvida.json()).toMatchObject({
      situacao: 'resolvida',
      solucao: 'Fonte trocada',
      resolvidaPor: { id: s.contas.carla, nome: 'Carla Dias' },
      resolvidaEm: api.relogio.agora().toISOString(),
      historico: [{ situacao: 'resolvida', texto: 'Fonte trocada' }, { situacao: 'aberta' }],
    });
    expect(await auditoriaDaRequisicao(api, s.org, resolvida)).toMatchObject([
      {
        acao: 'ordem.resolvida',
        antes: { situacao: 'aberta' },
        depois: { situacao: 'resolvida', solucao: 'Fonte trocada' },
      },
    ]);
    const mudarAResolvida = await mudar(numero, { situacao: 'em-atendimento' });
    expect(mudarAResolvida.statusCode).toBe(409);
    expect(mudarAResolvida.json().detail).toBe(`A OS ${numero} está resolvida: reabra ou encerre.`);
    expect((await reabrir(numero, null)).json().campos).toEqual({
      motivo: 'Informe o motivo da reabertura.',
    });

    const reaberta = await reabrir(numero);
    expect(reaberta.statusCode).toBe(200);
    expect(reaberta.json()).toMatchObject({
      situacao: 'em-atendimento',
      solucao: null,
      resolvidaPor: null,
      resolvidaEm: null,
      historico: [
        { situacao: 'em-atendimento', texto: 'Voltou a desligar sozinho' },
        { situacao: 'resolvida', texto: 'Fonte trocada' },
        { situacao: 'aberta' },
      ],
    });
    expect(await auditoriaDaRequisicao(api, s.org, reaberta)).toMatchObject([
      {
        acao: 'ordem.reaberta',
        antes: { situacao: 'resolvida', solucao: 'Fonte trocada' },
        depois: { situacao: 'em-atendimento', motivo: 'Voltou a desligar sozinho' },
      },
    ]);
  });

  it('Encerrada não muda: a resolvida se encerra, e a encerrada não muda mais', async () => {
    const numero = await abrir();
    const emAberto = await encerrar(numero);
    expect(emAberto.statusCode).toBe(409);
    expect(emAberto.json().detail).toBe(`A OS ${numero} ainda não foi resolvida.`);
    await resolver(numero);
    const encerrada = await encerrar(numero);
    expect(encerrada.statusCode).toBe(200);
    expect(encerrada.json()).toMatchObject({
      situacao: 'encerrada',
      solucao: 'Fonte trocada',
      motivoDoEncerramento: null,
      encerradaPor: { id: s.contas.carla },
      historico: [{ situacao: 'encerrada', texto: null }, { situacao: 'resolvida' }, {}],
    });
    expect(await auditoriaDaRequisicao(api, s.org, encerrada)).toMatchObject([
      {
        acao: 'ordem.encerrada',
        antes: { situacao: 'resolvida' },
        depois: { situacao: 'encerrada' },
      },
    ]);
    const depois = await mudar(numero, { situacao: 'em-atendimento' });
    expect(depois.statusCode).toBe(409);
    expect(depois.json().detail).toBe(`A OS ${numero} já está encerrada.`);
    expect((await resolver(numero)).json().detail).toBe(`A OS ${numero} já está encerrada.`);
  });

  it('OS aberta por engano: a em aberto se encerra sem resolver, com o motivo', async () => {
    const numero = await abrir();
    const semMotivo = await encerrar(numero, { semResolver: true });
    expect(semMotivo.statusCode).toBe(400);
    expect(semMotivo.json().campos).toEqual({ motivo: 'Informe o motivo do encerramento.' });
    const r = await encerrar(numero, { semResolver: true, motivo: 'Aberta no ativo errado' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      situacao: 'encerrada',
      solucao: null,
      motivoDoEncerramento: 'Aberta no ativo errado',
      encerradaPor: { id: s.contas.carla, nome: 'Carla Dias' },
      encerradaEm: api.relogio.agora().toISOString(),
      historico: [{ situacao: 'encerrada', texto: 'Aberta no ativo errado' }, {}],
    });
    expect(await auditoriaDaRequisicao(api, s.org, r)).toMatchObject([
      {
        acao: 'ordem.encerrada',
        depois: { situacao: 'encerrada', motivo: 'Aberta no ativo errado' },
      },
    ]);
    const resolvida = await abrir();
    await resolver(resolvida);
    expect(
      (await encerrar(resolvida, { semResolver: true, motivo: 'Duplicada' })).json().detail,
    ).toBe(`A OS ${resolvida} está resolvida: reabra ou encerre.`);
  });
});

describe('mudança em lote', () => {
  const lote = (numeros: number[], situacao: string) =>
    enviar('/ordens/situacao', { numeros, situacao });

  it('Resolvidas encerradas em lote: as cinco mudam, cada uma com a auditoria e o evento', async () => {
    const numeros: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const numero = await abrir();
      await resolver(numero);
      numeros.push(numero);
    }
    await naOrganizacao(api.banco, s.org, (tx) => tx.delete(eventos));
    const r = await lote(numeros, 'encerrada');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ mudaram: 5, recusadas: [], texto: '5 ordens de serviço mudaram.' });
    expect(await auditoriaDaRequisicao(api, s.org, r)).toHaveLength(5);
    const gravados = await naOrganizacao(api.banco, s.org, (tx) =>
      tx.select({ tipo: eventos.tipo }).from(eventos),
    );
    expect(gravados).toHaveLength(5);
  });

  it('Uma em aberto no encerramento em lote: as outras mudam, e ela fica como estava', async () => {
    const resolvida = await abrir();
    await resolver(resolvida);
    const emAtendimento = await abrir();
    await mudar(emAtendimento, { situacao: 'em-atendimento' });
    const semLocal = (
      await enviar('/ordens', { ativo: s.ativos.semLocal, problema: 'Não liga' }, 'ana')
    ).json().numero;
    const r = await lote([emAtendimento, resolvida, semLocal, 999_999], 'encerrada');
    expect(r.json()).toEqual({
      mudaram: 1,
      recusadas: [
        { numero: emAtendimento, mensagem: `A OS ${emAtendimento} ainda não foi resolvida.` },
        { numero: semLocal, mensagem: 'Ordem de serviço não encontrada.' },
        { numero: 999_999, mensagem: 'Ordem de serviço não encontrada.' },
      ],
      texto: `1 ordem de serviço mudou. A ${emAtendimento} não: ainda não foi resolvida. A ${semLocal} não: não foi encontrada. A 999999 não: não foi encontrada.`,
    });
    const ficou = await mudar(emAtendimento, { situacao: 'aguardando-peca' });
    expect(ficou.statusCode).toBe(200);
  });

  it('passa as em aberto a Em atendimento ou a Aguardando peça, e recusa a situação fora do lote', async () => {
    const numeros = [await abrir(), await abrir()];
    const r = await lote(numeros, 'aguardando-peca');
    expect(r.json()).toMatchObject({ mudaram: 2, texto: '2 ordens de serviço mudaram.' });
    const fornecedor = await lote(numeros, 'aguardando-fornecedor');
    expect(fornecedor.statusCode).toBe(400);
  });
});
