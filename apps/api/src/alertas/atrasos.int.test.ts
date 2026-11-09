// A coleta atrasada e o coletor sem contato na avaliação (spec alertas, "Coleta atrasada" e
// "Coletor sem contato"; change p3a-regras-e-alertas, design, decisão 5): a leitura de um ativo que
// o coletor ainda lê e que não chega, com o coletor falando com a API; o coletor ativo que parou de
// falar; e o módulo Alertas desligado, que não é avaliado.
import { ativos, coletores, naOrganizacao, regrasDeAlerta } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alertasDa,
  contatoDoColetor,
  criarAtivoDoTipo,
  criarCampoDeIp,
  criarColetor,
  criarTipo,
  desligarModulos,
  gravarEstado,
} from '../../test/alertas.ts';
import { type ApiDeTeste, abrirApi, criarOrganizacao } from '../../test/integracao.ts';
import { avaliarOrganizacao } from './avaliacao.ts';

let api: ApiDeTeste;
let enderecos = 0;

beforeAll(async () => {
  api = await abrirApi();
});

afterAll(async () => {
  await api?.fechar();
});

const MINUTO = 60_000;
const antes = (minutos: number) => new Date(api.relogio.agora().getTime() - minutos * MINUTO);

/** Uma organização com o coletor da unidade e uma impressora pingada por ele. */
async function montar() {
  const org = await criarOrganizacao(api, {
    nome: 'Empresa',
    enderecos: [`grafite.atrasos-${++enderecos}.local`],
  });
  const ip = await criarCampoDeIp(api, org);
  const impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['rede.disponibilidade'],
    configuracao: { 'rede.disponibilidade': { campoDoIp: ip } },
  });
  const coletor = await criarColetor(api, org, {
    nome: 'Coletor da unidade',
    faixas: ['10.0.0.0/16'],
    ultimoContatoEm: api.relogio.agora(),
  });
  const doRh = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    valores: { [ip]: '10.0.0.5' },
  });
  const ping = (momento: Date) =>
    gravarEstado(api, org, {
      ativoId: doRh,
      coletorId: coletor,
      metrica: 'rede.disponibilidade',
      momento,
      valorTexto: 'online',
    });
  return { org, ip, impressora, coletor, doRh, ping };
}

const avaliar = (org: string) =>
  naOrganizacao(api.banco, org, (tx) => avaliarOrganizacao(tx, { agora: api.relogio.agora() }));

const resumo = async (org: string) =>
  (await alertasDa(api, org)).map((alerta) => [alerta.texto, alerta.situacao, alerta.comoTerminou]);

describe('coleta atrasada', () => {
  it('abre quando a leitura não chega com o coletor falando, e se resolve quando ela volta', async () => {
    const { org, doRh, ping } = await montar();
    await ping(antes(7));
    await avaliar(org);
    const [atrasada] = await alertasDa(api, org);
    expect(atrasada).toMatchObject({
      texto: 'Coleta atrasada: Disponibilidade na rede',
      situacao: 'aberto',
      severidade: 'atencao',
      ativoId: doRh,
      item: 'rede.disponibilidade',
    });
    await ping(api.relogio.agora());
    await avaliar(org);
    expect(await resumo(org)).toEqual([
      ['Coleta atrasada: Disponibilidade na rede', 'resolvido', 'voltou-ao-normal'],
    ]);
  });

  it('a leitura dentro do prazo e o ativo que nunca foi lido não abrem', async () => {
    const { org, impressora, ip, ping } = await montar();
    await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      nome: 'Nunca lida',
      valores: { [ip]: '10.0.0.6' },
    });
    await ping(antes(5));
    await avaliar(org);
    expect(await resumo(org)).toEqual([]);
  });

  it('com o coletor sem contato, abre o alerta do coletor, e não a coleta atrasada', async () => {
    const { org, coletor, ping } = await montar();
    await ping(antes(12));
    await contatoDoColetor(api, org, coletor, antes(12));
    await avaliar(org);
    const [doColetor] = await alertasDa(api, org);
    expect(await resumo(org)).toEqual([['Coletor sem contato', 'aberto', null]]);
    expect(doColetor).toMatchObject({ coletorId: coletor, ativoId: null, severidade: 'critico' });
    await contatoDoColetor(api, org, coletor, api.relogio.agora());
    await ping(api.relogio.agora());
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Coletor sem contato', 'resolvido', 'voltou-ao-normal']]);
  });

  it('é encerrada quando o coletor deixa de ler o ativo', async () => {
    const { org, doRh, ping } = await montar();
    await ping(antes(7));
    await avaliar(org);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(ativos).set({ valores: {} }).where(eq(ativos.id, doRh)),
    );
    await avaliar(org);
    expect(await resumo(org)).toEqual([
      ['Coleta atrasada: Disponibilidade na rede', 'resolvido', 'regra-deixou-de-valer'],
    ]);
  });
});

describe('coletor sem contato', () => {
  it('o coletor que nunca falou com a API não abre; o inativado encerra o alerta', async () => {
    const { org } = await montar();
    await criarColetor(api, org, { nome: 'Recém-cadastrado', ultimoContatoEm: null });
    const parado = await criarColetor(api, org, { nome: 'Parado', ultimoContatoEm: antes(30) });
    await avaliar(org);
    expect(
      (await alertasDa(api, org)).map((alerta) => [alerta.coletorId, alerta.situacao]),
    ).toEqual([[parado, 'aberto']]);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(coletores).set({ situacao: 'inativo' }).where(eq(coletores.id, parado)),
    );
    await avaliar(org);
    expect(await resumo(org)).toEqual([
      ['Coletor sem contato', 'resolvido', 'regra-deixou-de-valer'],
    ]);
  });

  it('vale com o módulo Ativos desligado', async () => {
    const { org } = await montar();
    await criarColetor(api, org, { nome: 'Parado', ultimoContatoEm: antes(30) });
    await desligarModulos(api, org, ['ativos']);
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Coletor sem contato', 'aberto', null]]);
  });
});

describe('módulo Alertas desligado', () => {
  it('a organização não é avaliada, nem ganha as regras de fábrica', async () => {
    const { org } = await montar();
    await criarColetor(api, org, { nome: 'Parado', ultimoContatoEm: antes(30) });
    await desligarModulos(api, org, ['alertas']);
    expect(await avaliar(org)).toEqual({ mudou: false });
    expect(await alertasDa(api, org)).toEqual([]);
    const regras = await naOrganizacao(api.banco, org, (tx) => tx.select().from(regrasDeAlerta));
    expect(regras).toEqual([]);
  });
});
