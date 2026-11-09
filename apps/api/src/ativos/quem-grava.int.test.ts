// A gravação do ativo fora da requisição (design do P1e, decisão 6): quem grava diz a conta, o
// acesso, a origem dos valores e o rastreio. Com a origem "planilha", o estado guarda a origem e a
// conta, a auditoria leva a importação e não leva o IP, e o campo travado e o só manual ficam como
// estão; o escopo é o do acesso dado.
import { auditoria, naOrganizacao } from '@grafite/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { carregarAcesso } from '../acesso/acesso.ts';
import { RecusaDePermissao } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { gravarAtivo, type QuemGrava } from './escrita.ts';
import { lerAtivo } from './leitura.ts';

const host = 'grafite.quem-grava.local';
const IMPORTACAO = { id: '0199a3f0-0000-7000-8000-00000000e001', arquivo: 'impressoras.csv' };

let api: ApiDeTeste;
let org = '';
let ana: Entrada;
const ids: Record<string, string> = {};
const id = (chave: string) => ids[chave] ?? '';

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  const cliente = clienteDaApi(api, host);
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const tudo = await criarPerfil(api, org, {
    nome: 'Tudo',
    permissoes: ['catalogo.administrar', 'ativos.editar'],
  });
  const soJundiai = await criarPerfil(api, org, { nome: 'Jundiaí', permissoes: ['ativos.editar'] });
  const conta = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  ids.ana = conta.id;
  await atribuir(api, org, { perfilId: tudo, contaId: conta.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  ids.bruno = bruno.id;
  await atribuir(api, org, { perfilId: soJundiai, contaId: bruno.id, localId: id('jundiai') });
  ana = await cliente.entrar('ana');
  const enviar = async (caminho: string, pedido: object) =>
    (await cliente.enviar('POST', caminho, ana, pedido)).json().id as string;
  ids.ip = await enviar('/campos', { rotulo: 'IP', tipo: 'ip' });
  ids.tombamento = await enviar('/campos', {
    rotulo: 'Tombamento',
    tipo: 'texto',
    escrita: 'manual',
  });
  ids.impressora = await enviar('/tipos-de-ativo', {
    nome: 'Impressora',
    icone: 'impressora',
    campos: [
      { campoId: id('ip'), obrigatorio: false },
      { campoId: id('tombamento'), obrigatorio: false },
    ],
  });
});

afterAll(async () => {
  await api?.fechar();
});

/** Grava pela importação, como a conta dada, com o acesso que ela tem agora. */
function gravarPelaPlanilha(
  contaId: string,
  pedido: Parameters<typeof gravarAtivo>[1]['pedido'],
  ativoId: string | null = null,
) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const quem: QuemGrava = {
      contaId,
      acesso: await carregarAcesso(tx, contaId),
      origem: 'planilha',
      rastreio: null,
      importacao: IMPORTACAO,
    };
    const atual = ativoId ? await lerAtivo(tx, ativoId, { travar: true }) : null;
    return gravarAtivo(tx, {
      quem,
      arvore: await lerArvore(tx),
      momento: api.relogio.agora(),
      atual,
      tipoId: id('impressora'),
      pedido,
      lerLinha: (ativoId) => lerAtivo(tx, ativoId),
    });
  });
}

const registrosDo = (ativoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(auditoria)
      .where(and(eq(auditoria.alvoTipo, 'ativo'), eq(auditoria.alvoId, ativoId))),
  );

describe('gravarAtivo com a origem "planilha"', () => {
  it('cadastra com a origem e a conta no estado, e a importação na auditoria, sem o IP', async () => {
    const { id: ativoId, mudou } = await gravarPelaPlanilha(id('ana'), {
      valores: {
        'ativo.patrimonio': 'PAT-00412',
        'ativo.local': id('jundiai'),
        [id('ip')]: '10.0.0.5',
      },
    });
    ids.pat412 = ativoId;
    expect(mudou).toBe(true);
    const linha = await naOrganizacao(api.banco, org, (tx) => lerAtivo(tx, ativoId));
    expect(linha.ativo.estado).toMatchObject({
      'ativo.patrimonio': { origem: 'planilha', autorId: id('ana'), trava: false },
      [id('ip')]: { origem: 'planilha', autorId: id('ana'), trava: false },
    });
    const [registro] = await registrosDo(ativoId);
    expect(registro).toMatchObject({
      acao: 'ativo.criado',
      atorTipo: 'conta',
      atorContaId: id('ana'),
      ip: null,
      dados: { importacao: IMPORTACAO },
    });
  });

  it('não muda o campo travado nem o só manual, e a linha sem outra mudança não grava', async () => {
    await naOrganizacao(api.banco, org, async (tx) => {
      const quem: QuemGrava = {
        contaId: id('ana'),
        acesso: await carregarAcesso(tx, id('ana')),
        origem: 'manual',
        rastreio: null,
      };
      await gravarAtivo(tx, {
        quem,
        arvore: await lerArvore(tx),
        momento: api.relogio.agora(),
        atual: await lerAtivo(tx, id('pat412'), { travar: true }),
        tipoId: id('impressora'),
        pedido: { valores: { [id('tombamento')]: 'T-1' }, travas: { [id('ip')]: true } },
        lerLinha: (ativoId) => lerAtivo(tx, ativoId),
      });
    });
    const antes = (await registrosDo(id('pat412'))).length;
    const resultado = await gravarPelaPlanilha(
      id('ana'),
      { valores: { [id('ip')]: '10.0.0.9', [id('tombamento')]: 'T-2' } },
      id('pat412'),
    );
    expect(resultado).toEqual({ id: id('pat412'), mudou: false });
    const linha = await naOrganizacao(api.banco, org, (tx) => lerAtivo(tx, id('pat412')));
    expect(linha.ativo.valores).toMatchObject({
      [id('ip')]: '10.0.0.5',
      [id('tombamento')]: 'T-1',
    });
    expect((await registrosDo(id('pat412'))).length).toBe(antes);
  });

  it('confere o escopo pelo acesso de quem grava', async () => {
    await expect(
      gravarPelaPlanilha(id('bruno'), {
        valores: { 'ativo.patrimonio': 'PAT-00900', 'ativo.local': id('campinas') },
      }),
    ).rejects.toBeInstanceOf(RecusaDePermissao);
    const { mudou } = await gravarPelaPlanilha(id('bruno'), {
      valores: { 'ativo.patrimonio': 'PAT-00901', 'ativo.local': id('jundiai') },
    });
    expect(mudou).toBe(true);
  });
});
