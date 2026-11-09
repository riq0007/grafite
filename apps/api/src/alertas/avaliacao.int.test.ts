// A avaliação dos alertas de uma organização (spec alertas, "Avaliação a cada minuto",
// "Recuperação com folga" e "Encerramento quando a regra deixa de valer"; change
// p3a-regras-e-alertas, design, decisões 5 a 9): as condições do estado atual (o ativo offline, o
// toner, as condições da impressora e a saúde do Control iD), com o escopo, a duração, a folga, a
// leitura sem dado, o encerramento fora da regra, o silêncio, o trinco da organização e o evento
// só quando algo muda.
import {
  alertas,
  ativos,
  eventos,
  naOrganizacao,
  regrasDeAlerta,
  silenciosDosAtivos,
  tiposDeAtivo,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  alertasDa,
  contatoDoColetor,
  criarAtivoDoTipo,
  criarColetor,
  criarModelo,
  criarRegra,
  criarTipo,
  desligarModulos,
  gravarEstado,
} from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
} from '../../test/integracao.ts';
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

/** Uma organização com uma impressora, um controle de acesso e o coletor deles. */
async function montar() {
  const org = await criarOrganizacao(api, {
    nome: 'Empresa',
    enderecos: [`grafite.avaliacao-${++enderecos}.local`],
  });
  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const coletor = await criarColetor(api, org, { ultimoContatoEm: api.relogio.agora() });
  const impressora = await criarTipo(api, org, {
    nome: 'Impressora',
    capacidades: ['rede.disponibilidade', 'snmp.suprimentos'],
  });
  const controle = await criarTipo(api, org, {
    nome: 'Controle de acesso',
    capacidades: ['controlid.saude'],
  });
  const doRh = await criarAtivoDoTipo(api, org, {
    tipoId: impressora,
    nome: 'Impressora do RH',
    localId: jundiai,
  });
  const portaria = await criarAtivoDoTipo(api, org, { tipoId: controle, nome: 'Portaria' });
  const estado = (colunas: Omit<Parameters<typeof gravarEstado>[2], 'coletorId'>) =>
    gravarEstado(api, org, { coletorId: coletor, ...colunas });
  return { org, jundiai, coletor, impressora, controle, doRh, portaria, estado };
}

const avaliar = (org: string) =>
  naOrganizacao(api.banco, org, (tx) => avaliarOrganizacao(tx, { agora: api.relogio.agora() }));

/** Os alertas não resolvidos e os resolvidos, pelo texto, com a situação. */
const resumo = async (org: string) =>
  (await alertasDa(api, org)).map((alerta) => [alerta.texto, alerta.situacao, alerta.severidade]);

const toner = (nivel: number | null, situacao: 'valida' | 'sem-dado' = 'valida') => ({
  metrica: 'impressora.suprimento',
  item: '1',
  momento: api.relogio.agora(),
  valorNumero: nivel,
  situacao,
  detalhes: { descricao: 'Toner preto', capacidade: 100, nivel: nivel ?? -2 },
});

const mudarRegra = (
  org: string,
  fabrica: string,
  mudancas: Partial<typeof regrasDeAlerta.$inferInsert>,
) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(regrasDeAlerta).set(mudancas).where(eq(regrasDeAlerta.fabrica, fabrica)),
  );

describe('avaliação dos alertas', () => {
  it('o toner no limite abre o alerta crítico, que acompanha o valor sem duplicar', async () => {
    const { org, doRh, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 8%', 'aberto', 'critico']]);
    const [aberto] = await alertasDa(api, org);
    expect(aberto).toMatchObject({ ativoId: doRh, item: '1', abertoNoSilencio: false });

    await estado({ ativoId: doRh, ...toner(7) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 7%', 'aberto', 'critico']]);
  });

  it('na folga o alerta continua; além dela se resolve, e o problema que volta abre outro', async () => {
    const { org, doRh, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    await estado({ ativoId: doRh, ...toner(12) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 12%', 'aberto', 'critico']]);

    await estado({ ativoId: doRh, ...toner(100) });
    await avaliar(org);
    const [resolvido] = await alertasDa(api, org);
    expect(resolvido).toMatchObject({
      situacao: 'resolvido',
      comoTerminou: 'voltou-ao-normal',
      resolvidoEm: api.relogio.agora(),
    });

    await estado({ ativoId: doRh, ...toner(9) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([
      ['Toner preto em 12%', 'resolvido', 'critico'],
      ['Toner preto em 9%', 'aberto', 'critico'],
    ]);
  });

  it('a leitura sem dado não abre nem resolve o alerta', async () => {
    const { org, doRh, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    await estado({ ativoId: doRh, ...toner(null, 'sem-dado') });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 8%', 'aberto', 'critico']]);
  });

  it('o offline curto não abre; o que dura abre depois da duração da regra', async () => {
    const { org, doRh, estado } = await montar();
    const ping = (valorTexto: string) => ({
      ativoId: doRh,
      metrica: 'rede.disponibilidade',
      momento: api.relogio.agora(),
      valorTexto,
    });
    await estado(ping('offline'));
    await avaliar(org);
    // O pendente não aparece, mas guarda quando a condição foi vista.
    expect(await resumo(org)).toEqual([['Offline', 'pendente', 'atencao']]);
    api.relogio.avancar(3 * MINUTO);
    await estado(ping('online'));
    await avaliar(org);
    expect(await resumo(org)).toEqual([]);

    await estado(ping('offline'));
    await avaliar(org);
    const visto = api.relogio.agora();
    api.relogio.avancar(4 * MINUTO);
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Offline', 'pendente', 'atencao']]);
    api.relogio.avancar(MINUTO);
    await avaliar(org);
    const [aberto] = await alertasDa(api, org);
    expect(aberto).toMatchObject({
      texto: 'Offline',
      situacao: 'aberto',
      observadoEm: visto,
      abertoEm: api.relogio.agora(),
    });
  });

  it('as condições da impressora abrem um alerta por condição escolhida', async () => {
    const { org, doRh, estado } = await montar();
    const condicoes = (lista: string[]) => ({
      ativoId: doRh,
      metrica: 'impressora.condicoes',
      momento: api.relogio.agora(),
      valorTexto: JSON.stringify(lista),
    });
    await estado(condicoes(['sem-papel', 'pouco-papel']));
    await avaliar(org);
    expect(await resumo(org)).toEqual(
      expect.arrayContaining([
        ['Sem papel', 'aberto', 'critico'],
        ['Pouco papel', 'aberto', 'atencao'],
      ]),
    );
    await estado(condicoes(['pouco-papel']));
    await avaliar(org);
    const porTexto = Object.fromEntries(
      (await alertasDa(api, org)).map((alerta) => [alerta.texto, alerta.situacao]),
    );
    expect(porTexto).toEqual({ 'Sem papel': 'resolvido', 'Pouco papel': 'aberto' });
  });

  it('a saúde do Control iD troca de regra quando a situação muda', async () => {
    const { org, coletor, portaria, estado } = await montar();
    const sondagem = (valorTexto: string) => ({
      ativoId: portaria,
      metrica: 'controlid.sondagem',
      momento: api.relogio.agora(),
      valorTexto,
    });
    await estado(sondagem('sem-resposta'));
    await avaliar(org);
    api.relogio.avancar(10 * MINUTO);
    // O coletor continua falando com a API: o alerta é só o do controle.
    await contatoDoColetor(api, org, coletor, api.relogio.agora());
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Control iD sem resposta', 'aberto', 'critico']]);
    await estado(sondagem('login-recusado'));
    await avaliar(org);
    expect(await resumo(org)).toEqual([
      ['Control iD sem resposta', 'resolvido', 'critico'],
      ['Control iD com login recusado', 'aberto', 'atencao'],
    ]);
  });

  it('a regra de um local vale para o ramo dele, e a de um tipo, só para os ativos dele', async () => {
    const { org, jundiai, impressora, controle, coletor } = await montar();
    const expedicao = await criarLocal(api, org, { nome: 'Expedição', paiId: jundiai });
    const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
    const naExpedicao = await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      nome: 'Da expedição',
      localId: expedicao,
    });
    const emCampinas = await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      nome: 'De Campinas',
      localId: campinas,
    });
    const doControle = await criarAtivoDoTipo(api, org, {
      tipoId: controle,
      nome: 'Controle offline',
      localId: jundiai,
    });
    await criarRegra(api, org, {
      nome: 'Offline em Jundiaí',
      condicao: 'rede.offline',
      parametros: {},
      duracao: 0,
      severidade: 'critico',
      escopo: { tipo: 'local', id: jundiai },
    });
    await criarRegra(api, org, {
      nome: 'Impressora offline',
      condicao: 'rede.offline',
      parametros: {},
      duracao: 0,
      severidade: 'info',
      escopo: { tipo: 'tipo', id: impressora },
    });
    for (const ativoId of [naExpedicao, emCampinas, doControle]) {
      await gravarEstado(api, org, {
        ativoId,
        coletorId: coletor,
        metrica: 'rede.disponibilidade',
        momento: api.relogio.agora(),
        valorTexto: 'offline',
      });
    }
    await avaliar(org);
    const abertos = (await alertasDa(api, org)).filter((alerta) => alerta.situacao === 'aberto');
    const regras = await naOrganizacao(api.banco, org, (tx) => tx.select().from(regrasDeAlerta));
    const nomeDa = (id: string) => regras.find((regra) => regra.id === id)?.nome;
    expect(abertos.map((alerta) => [nomeDa(alerta.regraId), alerta.ativoId]).sort()).toEqual(
      [
        ['Impressora offline', emCampinas],
        ['Impressora offline', naExpedicao],
        ['Offline em Jundiaí', naExpedicao],
      ].sort(),
    );
  });

  it('encerra o alerta quando a regra deixa de valer para o ativo', async () => {
    const { org, doRh, impressora, estado } = await montar();
    const outra = await criarAtivoDoTipo(api, org, { tipoId: impressora, nome: 'Outra' });
    await estado({ ativoId: doRh, ...toner(8) });
    await estado({ ativoId: outra, ...toner(5) });
    await avaliar(org);
    await naOrganizacao(api.banco, org, (tx) =>
      tx.update(ativos).set({ situacao: 'inativo' }).where(eq(ativos.id, doRh)),
    );
    await avaliar(org);
    const doAtivo = (ativoId: string) =>
      alertasDa(api, org).then((todos) => todos.filter((alerta) => alerta.ativoId === ativoId));
    expect(await doAtivo(doRh)).toEqual([
      expect.objectContaining({ situacao: 'resolvido', comoTerminou: 'regra-deixou-de-valer' }),
    ]);
    expect(await doAtivo(outra)).toEqual([expect.objectContaining({ situacao: 'aberto' })]);

    // O tipo que desliga a capacidade tira os ativos dele da regra.
    await naOrganizacao(api.banco, org, (tx) =>
      tx
        .update(tiposDeAtivo)
        .set({ capacidades: ['rede.disponibilidade'] })
        .where(eq(tiposDeAtivo.id, impressora)),
    );
    await avaliar(org);
    expect(await doAtivo(outra)).toEqual([
      expect.objectContaining({ situacao: 'resolvido', comoTerminou: 'regra-deixou-de-valer' }),
    ]);
  });

  it('a regra inativada e o módulo Ativos desligado encerram os alertas', async () => {
    const { org, doRh, portaria, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await estado({
      ativoId: portaria,
      metrica: 'controlid.sondagem',
      momento: api.relogio.agora(),
      valorTexto: 'login-recusado',
    });
    await avaliar(org);
    await mudarRegra(org, 'toner-10', { situacao: 'inativa' });
    await avaliar(org);
    const situacoes = async () =>
      Object.fromEntries(
        (await alertasDa(api, org)).map((alerta) => [
          alerta.texto,
          alerta.comoTerminou ?? 'aberto',
        ]),
      );
    expect(await situacoes()).toEqual({
      'Toner preto em 8%': 'regra-deixou-de-valer',
      'Control iD com login recusado': 'aberto',
    });
    await desligarModulos(api, org, ['ativos']);
    await avaliar(org);
    expect(await situacoes()).toEqual({
      'Toner preto em 8%': 'regra-deixou-de-valer',
      'Control iD com login recusado': 'regra-deixou-de-valer',
    });
  });

  it('a severidade acompanha a regra editada', async () => {
    const { org, doRh, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    await mudarRegra(org, 'toner-10', { severidade: 'atencao' });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 8%', 'aberto', 'atencao']]);
  });

  it('o alerta que abre com o ativo silenciado fica marcado', async () => {
    const { org, doRh, estado } = await montar();
    const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
    await naOrganizacao(api.banco, org, (tx) =>
      tx.insert(silenciosDosAtivos).values({ orgId: org, ativoId: doRh, criadoPor: ana.id }),
    );
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    const [aberto] = await alertasDa(api, org);
    expect(aberto).toMatchObject({ situacao: 'aberto', abertoNoSilencio: true });
  });

  it('grava o evento só quando algo que a tela mostra muda, com o local do ativo', async () => {
    const { org, jundiai, doRh, estado } = await montar();
    const avisos = () =>
      naOrganizacao(api.banco, org, (tx) =>
        tx
          .select({ tipo: eventos.tipo, permissao: eventos.permissao, locais: eventos.locais })
          .from(eventos)
          .where(eq(eventos.tipo, 'alertas.mudaram')),
      );
    // A primeira avaliação cria as regras de fábrica, cada uma com o evento da auditoria.
    await avaliar(org);
    await naOrganizacao(api.banco, org, (tx) => tx.delete(eventos));
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    expect(await avisos()).toEqual([
      { tipo: 'alertas.mudaram', permissao: 'alertas.ver', locais: [jundiai] },
    ]);
    await avaliar(org);
    expect(await avisos()).toHaveLength(1);
    // O pendente não aparece na tela, e não grava evento.
    await estado({
      ativoId: doRh,
      metrica: 'rede.disponibilidade',
      momento: api.relogio.agora(),
      valorTexto: 'offline',
    });
    await avaliar(org);
    expect(await avisos()).toHaveLength(1);
  });

  it('Modelo que acaba antes: o "Outro limite" abre e recupera pelo limite e pela folga dele', async () => {
    const { org, impressora, jundiai, doRh, estado } = await montar();
    const m404 = await criarModelo(api, org, { tipoId: impressora, nome: 'LaserJet M404' });
    const daM404 = await criarAtivoDoTipo(api, org, {
      tipoId: impressora,
      nome: 'Impressora da expedição',
      modeloId: m404,
      localId: jundiai,
    });
    // A primeira avaliação cria as regras de fábrica.
    await avaliar(org);
    await mudarRegra(org, 'toner-10', {
      excecoes: [
        { lugar: { tipo: 'modelo', id: m404 }, efeito: 'outro-limite', limite: 20, folga: 5 },
      ],
    });
    await estado({ ativoId: daM404, ...toner(18) });
    await estado({ ativoId: doRh, ...toner(18) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 18%', 'aberto', 'critico']]);
    expect((await alertasDa(api, org))[0]?.ativoId).toBe(daM404);

    // Na folga dela continua; acima de 25%, resolve.
    await estado({ ativoId: daM404, ...toner(24) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 24%', 'aberto', 'critico']]);
    await estado({ ativoId: daM404, ...toner(26) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 24%', 'resolvido', 'critico']]);
  });

  it('Local sem o alerta: o "Não alertar" não abre e encerra o que estava aberto', async () => {
    const { org, jundiai, doRh, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 8%', 'aberto', 'critico']]);

    await mudarRegra(org, 'toner-10', {
      excecoes: [{ lugar: { tipo: 'local', id: jundiai }, efeito: 'nao-alertar' }],
    });
    await avaliar(org);
    const [encerrado] = await alertasDa(api, org);
    expect(encerrado).toMatchObject({
      situacao: 'resolvido',
      comoTerminou: 'regra-deixou-de-valer',
    });
    await estado({ ativoId: doRh, ...toner(5) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 8%', 'resolvido', 'critico']]);
  });

  it('Ativo vence o local: a exceção do ativo vale no lugar da do local dele', async () => {
    const { org, jundiai, doRh, estado } = await montar();
    await avaliar(org);
    await mudarRegra(org, 'toner-10', {
      excecoes: [
        { lugar: { tipo: 'local', id: jundiai }, efeito: 'nao-alertar' },
        { lugar: { tipo: 'ativo', id: doRh }, efeito: 'outro-limite', limite: 30, folga: 5 },
      ],
    });
    await estado({ ativoId: doRh, ...toner(28) });
    await avaliar(org);
    expect(await resumo(org)).toEqual([['Toner preto em 28%', 'aberto', 'critico']]);
  });

  it('o "Não alertar" vale também no ativo offline', async () => {
    const { org, impressora, doRh, estado } = await montar();
    await avaliar(org);
    await mudarRegra(org, 'ativo-offline', {
      duracao: 0,
      excecoes: [{ lugar: { tipo: 'tipo', id: impressora }, efeito: 'nao-alertar' }],
    });
    await estado({
      ativoId: doRh,
      metrica: 'rede.disponibilidade',
      momento: api.relogio.agora(),
      valorTexto: 'offline',
    });
    await avaliar(org);
    expect(await resumo(org)).toEqual([]);
  });

  it('duas avaliações da mesma organização não se cruzam', async () => {
    const { org, doRh, estado } = await montar();
    await estado({ ativoId: doRh, ...toner(8) });
    await Promise.all([avaliar(org), avaliar(org), avaliar(org)]);
    const naoResolvidos = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(alertas).where(eq(alertas.situacao, 'aberto')),
    );
    expect(naoResolvidos).toHaveLength(1);
  });
});
