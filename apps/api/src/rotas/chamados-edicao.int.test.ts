// O ativo, o título e os campos da TI do chamado (spec chamados, "Ativo ligado e campos da TI" e
// "Conversa do chamado"; change chamados-da-ti, design, "O ativo, o título e os campos da TI", "O
// local da pessoa na abertura" e "A ficha lê o evento do ativo", tarefa 4.15): as três rotas, com os
// locais refeitos pelo local da pessoa na abertura, a versão, o evento da conversa, a auditoria, os
// anexos dos campos e as recusas. A decisão e as respostas são do domínio (`chamados/edicao.test.ts`
// e `chamados/respostas.test.ts`); aqui fica um caso de cada ligação.
import {
  anexosDosChamados,
  arquivos,
  ativos,
  atribuicoes,
  naOrganizacao,
  pessoas,
} from '@grafite/db';
import { MENSAGEM_DO_ATIVO_INATIVO, normalizarTexto, RECUSA_DO_FORMULARIO } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo, criarTipo } from '../../test/alertas.ts';
import {
  type ChamadosDeTeste,
  montarChamados,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  auditoriaDaRequisicao,
  criarPerfil,
  criarRelogio,
} from '../../test/integracao.ts';
import { ANEXO_NAO_ENCONTRADO } from '../chamados/anexos.ts';

const host = 'grafite.chamados-edicao.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');
const HORA = 60 * 60 * 1000;
const MUDOU = 'urn:grafite:problema:chamado-mudou';
const CONFLITO = 'urn:grafite:problema:conflito';
const NAO_EXISTE = '0192f0c4-6a1e-7c3b-9d2a-5b8e4f1a2c99';

let api: ApiDeTeste;
let c: ChamadosDeTeste;
/** As impressoras: a da Recepção, em Jundiaí, a do Administrativo, em Campinas, a inativa e a sem local. */
const ids = { pat139: '', pat200: '', pat140: '', pat400: '' };

const trocarAtivo = (numero: number, usuario: UsuarioDosChamados, corpo: object) =>
  c.cliente.enviar('PUT', `/chamados/${numero}/ativo`, c.como(usuario), corpo);
const trocarTitulo = (numero: number, usuario: UsuarioDosChamados, corpo: object) =>
  c.cliente.enviar('PUT', `/chamados/${numero}/titulo`, c.como(usuario), corpo);
const mudarCampos = (numero: number, usuario: UsuarioDosChamados, respostas: object) =>
  c.cliente.enviar('PATCH', `/chamados/${numero}/campos`, c.como(usuario), { respostas });

/** A mudança aceita, com a resposta. */
async function aceita(resposta: Promise<{ statusCode: number; body: string }>) {
  const r = await resposta;
  expect(r.statusCode, r.body).toBe(200);
  return r as Awaited<ReturnType<typeof trocarAtivo>>;
}

const comAna = () => ({ id: c.conta('ana'), nome: 'Ana Souza' });

/** A impressora como a auditoria a mostra: o rótulo e o patrimônio. */
const naAuditoria = (patrimonio: string) => `HP LaserJet M404 · ${patrimonio}`;

/** O ativo como a ficha o mostra no evento. */
const naFicha = (id: string, patrimonio: string) => ({
  id,
  rotulo: 'HP LaserJet M404',
  patrimonio,
});

/** O evento em tempo real de uma mudança do chamado, a quem o vê nos locais dados. */
const mudouNos = (...locais: string[]) => ({
  tipo: 'chamados.mudaram',
  alvoTipo: 'chamado',
  permissao: 'chamados.ver',
  locais,
});

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

/** Envia um PDF e devolve o id do arquivo, que a gravação toma. */
async function anexo(usuario: UsuarioDosChamados, texto: string) {
  const r = await c.cliente.enviarBytes(
    'POST',
    `/chamados/anexos?nome=${encodeURIComponent(`${texto}.pdf`)}`,
    c.como(usuario),
    PDF(texto),
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}

/** O dono do anexo e quando ele foi removido. */
const arquivoDe = (arquivoId: string) =>
  naOrganizacao(api.banco, c.org, async (tx) => {
    const [arquivo] = await tx
      .select({ removidoEm: arquivos.removidoEm })
      .from(arquivos)
      .where(eq(arquivos.id, arquivoId));
    const [dono] = await tx
      .select({
        chamadoId: anexosDosChamados.chamadoId,
        mensagemId: anexosDosChamados.mensagemId,
        campoId: anexosDosChamados.campoId,
      })
      .from(anexosDosChamados)
      .where(eq(anexosDosChamados.arquivoId, arquivoId));
    return { removidoEm: arquivo?.removidoEm ?? null, dono };
  });

const mudarAtivo = (id: string, situacao: 'ativo' | 'inativo') =>
  naOrganizacao(api.banco, c.org, (tx) =>
    tx.update(ativos).set({ situacao }).where(eq(ativos.id, id)),
  );

/** Um campo só da TI, como o formulário salvo o grava. */
const daTi = (campo: { id: string; tipo: string; rotulo: string; condicao?: unknown[] }) => ({
  nomeNoResumo: null,
  obrigatorio: false,
  soDaTi: true,
  apagarSeSumir: true,
  opcoes: [],
  tiposDeAtivo: [],
  condicao: [],
  ...campo,
});

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  // Diego vê os ativos da organização inteira: o de Campinas chega à recusa dos locais dele.
  const veOsAtivos = await criarPerfil(api, c.org, {
    nome: 'Vê os ativos',
    permissoes: ['ativos.ver'],
  });
  await atribuir(api, c.org, { perfilId: veOsAtivos, contaId: c.conta('diego') });
  const tipoId = await criarTipo(api, c.org, { nome: 'Impressora' });
  const modeloId = await criarModelo(api, c.org, {
    tipoId,
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  const impressora = (patrimonio: string, localId: string | null, ativa = true) =>
    criarAtivoDoTipo(api, c.org, {
      tipoId,
      modeloId,
      patrimonio,
      localId,
      situacao: ativa ? 'ativo' : 'inativo',
    });
  ids.pat139 = await impressora('PAT-00139', c.locais.recepcao);
  ids.pat200 = await impressora('PAT-00200', c.locais.administrativo);
  ids.pat140 = await impressora('PAT-00140', c.locais.recepcao, false);
  ids.pat400 = await impressora('PAT-00400', null);

  await c.entrar('ana', 'diego');
  // #1042: a Impressora PAT-00139 de Marina, da Recepção, com Ana, com a Foto da peça e a
  // Impressora substituta, só da TI, na cópia do formulário.
  await c.abrir({
    pessoa: c.pessoas.marina,
    tipo: c.tipos.Impressora,
    respostas: { impressora: ids.pat139, problema: 'nao-imprime' },
    ficaComigo: true,
  });
  // #1043 e #1044: o Outro de Marina e o de Otávio, os dois da Recepção, com Ana.
  await c.abrir(c.relato('marina'));
  await c.abrir(c.relato('otavio'));
  // #1045: o de Marina que Diego abre com ele.
  await c.abrir(c.relato('marina'), 'diego');
  // #1046: o de Fernanda, do Administrativo, em Campinas, com Ana.
  await c.abrir(c.relato('fernanda'));
  // #1047: o de Marina na triagem; #1048 e #1049: os de Marina com Ana.
  await c.abrir(c.relato('marina', { ficaComigo: false }));
  await c.abrir(c.relato('marina'));
  await c.abrir(c.relato('marina'));

  const { formulario } = await c.lerChamado(1042);
  await c.mudarChamado(1042, {
    formulario: {
      ...formulario,
      campos: [
        ...(formulario.campos as unknown[]),
        daTi({
          id: 'peca',
          tipo: 'anexo',
          rotulo: 'Foto da peça',
          condicao: [{ campoId: 'contrato-de-manutencao', juncao: null, valor: false }],
        }),
        daTi({ id: 'substituta', tipo: 'ativo', rotulo: 'Impressora substituta' }),
        daTi({ id: 'onde', tipo: 'local', rotulo: 'Onde ficou a peça' }),
        daTi({ id: 'tecnico', tipo: 'pessoa', rotulo: 'Quem foi ao local' }),
      ],
    },
  });
  // #1049: a Foto da peça, só da TI, na cópia do formulário do Outro.
  const doOutro = await c.lerChamado(1049);
  await c.mudarChamado(1049, {
    formulario: {
      ...doOutro.formulario,
      campos: [
        ...(doOutro.formulario.campos as unknown[]),
        daTi({ id: 'peca', tipo: 'anexo', rotulo: 'Foto da peça' }),
      ],
    },
  });
  // As sessões entram uma hora depois da abertura.
  api.relogio.avancar(HORA);
  await c.entrar();
});

describe('PUT /chamados/:numero/ativo', () => {
  it('Ativo de outro local: os locais passam a ser o da pessoa e o do ativo, com a versão, o evento e a auditoria', async () => {
    const agora = api.relogio.agora();
    const eventos = await c.eventosDo(1043);
    const r = await aceita(trocarAtivo(1043, 'ana', { ativo: ids.pat200, versao: 1 }));
    expect(r.json()).toEqual({
      numero: 1043,
      versao: 2,
      situacao: 'em-atendimento',
      responsavel: comAna(),
    });
    expect(await c.lerChamado(1043)).toMatchObject({
      ativoId: ids.pat200,
      locais: [c.locais.recepcao, c.locais.administrativo],
      semLocal: false,
      localDaPessoa: c.locais.recepcao,
      versao: 2,
    });
    expect((await c.conversaDo(1043)).at(-1)).toMatchObject({
      especie: 'evento',
      evento: 'ativo',
      autorConta: c.conta('ana'),
      texto: null,
      dados: { antes: null, depois: ids.pat200 },
      criadaEm: agora,
    });
    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({
      acao: 'chamado.ativo-trocado',
      atorContaId: c.conta('ana'),
      alvoId: c.chamadoId(1043),
    });
    expect(auditado?.antes).toEqual({ ativo: null });
    expect(auditado?.depois).toEqual({ ativo: naAuditoria('PAT-00200') });
    // O evento vai a quem vê os locais de antes e os de depois.
    expect(await c.eventosDo(1043)).toEqual([
      ...eventos,
      mudouNos(c.locais.recepcao, c.locais.administrativo),
    ]);
    // Agora, só quem atende os dois locais pode atendê-lo.
    const deDiego = await trocarTitulo(1043, 'diego', { titulo: 'Impressora emprestada' });
    expect(deDiego.statusCode, deDiego.body).toBe(409);
    expect(deDiego.json()).toMatchObject({
      type: CONFLITO,
      detail: 'Você não atende os chamados de Campinas › Administrativo.',
    });
  });

  it('o mesmo ativo e tirar o que não há não mudam nada: nem a versão, nem a conversa, nem a auditoria', async () => {
    for (const [numero, ativo] of [
      [1043, ids.pat200],
      [1049, null],
    ] as const) {
      const antes = await c.lerChamado(numero);
      const conversa = await c.conversaDo(numero);
      const eventos = await c.eventosDo(numero);
      const r = await aceita(trocarAtivo(numero, 'ana', { ativo }));
      expect(r.json()).toEqual({
        numero,
        versao: antes.versao,
        situacao: 'em-atendimento',
        responsavel: comAna(),
      });
      expect(await c.lerChamado(numero)).toEqual(antes);
      expect(await c.conversaDo(numero)).toEqual(conversa);
      expect(await c.eventosDo(numero)).toEqual(eventos);
      expect(await auditoriaDaRequisicao(api, c.org, r)).toEqual([]);
    }
  });

  it('a troca pela tela de antes de outra mudança é recusada com o chamado-mudou', async () => {
    const r = await trocarAtivo(1043, 'ana', { ativo: ids.pat139, versao: 1 });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json()).toMatchObject({
      type: MUDOU,
      detail: 'O chamado #1043 mudou. Confira antes de trocar o ativo.',
    });
    expect(await c.lerChamado(1043)).toMatchObject({ ativoId: ids.pat200, versao: 2 });
  });

  it('Ativo tirado depois de a pessoa mudar de local: o chamado volta ao local da pessoa na abertura', async () => {
    await aceita(trocarAtivo(1044, 'ana', { ativo: ids.pat200 }));
    // Otávio passa a trabalhar no Administrativo, em Campinas.
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .update(pessoas)
        .set({ localId: c.locais.administrativo })
        .where(eq(pessoas.id, c.pessoas.otavio)),
    );
    const eventos = await c.eventosDo(1044);
    const r = await aceita(trocarAtivo(1044, 'ana', { ativo: null, versao: 2 }));
    expect(r.json()).toMatchObject({ numero: 1044, versao: 3 });
    expect(await c.lerChamado(1044)).toMatchObject({
      ativoId: null,
      locais: [c.locais.recepcao],
      semLocal: false,
      localDaPessoa: c.locais.recepcao,
    });
    expect((await c.conversaDo(1044)).at(-1)?.dados).toEqual({ antes: ids.pat200, depois: null });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado?.antes).toEqual({ ativo: naAuditoria('PAT-00200') });
    expect(auditado?.depois).toEqual({ ativo: null });
    // O evento vai também a quem via o chamado só pelo local do ativo que saiu.
    expect(await c.eventosDo(1044)).toEqual([
      ...eventos,
      mudouNos(c.locais.recepcao, c.locais.administrativo),
    ]);
  });

  it('a ficha lê o evento do ativo com o de antes e o de depois, a toda conta que vê o chamado', async () => {
    // Carla só vê os chamados, sem os ativos.
    const r = await c.cliente.consultar('/chamados/1044', c.como('carla'));
    expect(r.statusCode, r.body).toBe(200);
    const eventos = (r.json().conversa as { especie: string; evento?: string; ativo?: unknown }[])
      .filter((item) => item.especie === 'evento')
      .map(({ evento, ativo }) => ({ evento, ativo }));
    expect(eventos).toEqual([
      { evento: 'abertura', ativo: null },
      { evento: 'ativo', ativo: { antes: null, depois: naFicha(ids.pat200, 'PAT-00200') } },
      { evento: 'ativo', ativo: { antes: naFicha(ids.pat200, 'PAT-00200'), depois: null } },
    ]);
    const [ativo] = (r.json().conversa as { evento?: string }[]).filter(
      (item) => item.evento === 'ativo',
    );
    expect(ativo).toMatchObject({
      autor: { tipo: 'conta', id: c.conta('ana'), nome: 'Ana Souza' },
      de: null,
      para: null,
      desde: null,
    });
  });

  it('Ativo que tira o chamado de quem atende: a recusa pede que ele seja passado antes', async () => {
    const antes = await c.lerChamado(1045);
    const r = await trocarAtivo(1045, 'ana', { ativo: ids.pat200 });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json()).toMatchObject({
      type: CONFLITO,
      detail:
        'Diego não atende os chamados de Campinas › Administrativo. Passe o chamado antes de trocar o ativo.',
    });
    // Quem age também precisa atender os locais novos: Diego atende só Jundiaí.
    const deDiego = await trocarAtivo(1045, 'diego', { ativo: ids.pat200 });
    expect(deDiego.statusCode, deDiego.body).toBe(409);
    expect(deDiego.json()).toMatchObject({
      type: CONFLITO,
      detail: 'Você não atende os chamados de Campinas › Administrativo.',
    });
    expect(await c.lerChamado(1045)).toEqual(antes);
    // O ativo do local dele é aceito.
    await aceita(trocarAtivo(1045, 'diego', { ativo: ids.pat139 }));
    expect(await c.lerChamado(1045)).toMatchObject({
      ativoId: ids.pat139,
      locais: [c.locais.recepcao],
      versao: 2,
    });
  });

  it('quem atende inativo também recebe a recusa: o chamado precisa ser passado antes', async () => {
    await c.mudarConta('diego', 'inativa');
    try {
      const r = await trocarAtivo(1045, 'ana', { ativo: null });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({
        type: CONFLITO,
        detail:
          'Diego não atende os chamados de Jundiaí › Recepção. Passe o chamado antes de trocar o ativo.',
      });
      expect(await c.lerChamado(1045)).toMatchObject({ ativoId: ids.pat139, versao: 2 });
    } finally {
      await c.mudarConta('diego', 'ativa');
      await c.entrar('diego');
    }
  });

  it('o ativo que quem age não vê, o que não existe e o inativo são recusados no campo ativo', async () => {
    // Elisa atende Campinas, sem ver os ativos.
    for (const [usuario, ativo, recusa] of [
      ['elisa', ids.pat200, 'Ativo não encontrado.'],
      ['ana', NAO_EXISTE, 'Ativo não encontrado.'],
      ['ana', 'PAT-00200', 'Ativo não encontrado.'],
      ['ana', ids.pat140, MENSAGEM_DO_ATIVO_INATIVO],
    ] as const) {
      const r = await trocarAtivo(1046, usuario, { ativo });
      expect(r.statusCode, `${ativo}: ${r.body}`).toBe(400);
      expect(r.json().campos).toEqual({ ativo: recusa });
    }
    expect(await c.lerChamado(1046)).toMatchObject({ ativoId: null, versao: 1 });
    // O ativo sem local deixa o chamado sem local, só de quem atende a organização inteira.
    await aceita(trocarAtivo(1046, 'ana', { ativo: ids.pat400 }));
    expect(await c.lerChamado(1046)).toMatchObject({
      ativoId: ids.pat400,
      locais: [c.locais.administrativo],
      semLocal: true,
    });
  });

  it('o desfazer depois da troca do ativo é recusado: o último evento que sobe a versão não é o assumir', async () => {
    const assumiu = await c.cliente.enviar('POST', '/chamados/1047/assumir', c.como('ana'), {
      versao: 1,
    });
    expect(assumiu.statusCode, assumiu.body).toBe(200);
    await aceita(trocarAtivo(1047, 'ana', { ativo: ids.pat139, versao: 2 }));
    const r = await c.cliente.enviar('POST', '/chamados/1047/desfazer', c.como('ana'), {
      versao: 3,
    });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json()).toMatchObject({
      type: MUDOU,
      detail: 'O chamado mudou depois. Confira antes de desfazer.',
    });
    expect(await c.lerChamado(1047)).toMatchObject({
      situacao: 'em-atendimento',
      responsavelId: c.conta('ana'),
      versao: 3,
    });
  });
});

describe('PUT /chamados/:numero/titulo', () => {
  it('troca o título, numa linha só, sem subir a versão nem ir à conversa, com a auditoria', async () => {
    const conversa = await c.conversaDo(1042);
    const eventos = await c.eventosDo(1042);
    const r = await aceita(
      trocarTitulo(1042, 'diego', { titulo: '  Impressora da recepção   sem toner \n' }),
    );
    expect(r.json()).toEqual({
      numero: 1042,
      versao: 1,
      situacao: 'em-atendimento',
      responsavel: comAna(),
    });
    expect(await c.lerChamado(1042)).toMatchObject({
      titulo: 'Impressora da recepção sem toner',
      tituloNormalizado: normalizarTexto('Impressora da recepção sem toner'),
      versao: 1,
    });
    expect(await c.conversaDo(1042)).toEqual(conversa);
    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({
      acao: 'chamado.titulo-trocado',
      atorContaId: c.conta('diego'),
      alvoId: c.chamadoId(1042),
    });
    expect(auditado?.antes).toEqual({ titulo: 'Impressora não imprime' });
    expect(auditado?.depois).toEqual({ titulo: 'Impressora da recepção sem toner' });
    expect(await c.eventosDo(1042)).toEqual([...eventos, mudouNos(c.locais.recepcao)]);

    // O mesmo título não muda nada.
    const igual = await aceita(
      trocarTitulo(1042, 'ana', { titulo: 'Impressora da recepção sem toner' }),
    );
    expect(await auditoriaDaRequisicao(api, c.org, igual)).toEqual([]);
    expect(await c.eventosDo(1042)).toHaveLength(eventos.length + 1);
  });

  it('o título vazio e o longo são recusados no campo, com as frases da abertura', async () => {
    for (const [corpo, recusa] of [
      [{ titulo: ' \n ' }, 'Escreva o título.'],
      [{}, 'Escreva o título.'],
      [{ titulo: '🖨'.repeat(121) }, 'Use até 120 caracteres.'],
    ] as const) {
      const r = await trocarTitulo(1042, 'ana', corpo);
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual({ titulo: recusa });
    }
    expect((await c.lerChamado(1042)).titulo).toBe('Impressora da recepção sem toner');
  });
});

describe('PATCH /chamados/:numero/campos', () => {
  it('Campo da TI preenchido: o Contador fica com 48210, e a auditoria guarda o antes e o depois', async () => {
    const conversa = await c.conversaDo(1042);
    const eventos = await c.eventosDo(1042);
    const r = await aceita(mudarCampos(1042, 'diego', { 'contador-de-paginas': 48_210 }));
    expect(r.json()).toEqual({
      numero: 1042,
      versao: 1,
      situacao: 'em-atendimento',
      responsavel: comAna(),
    });
    expect(await c.lerChamado(1042)).toMatchObject({
      respostas: { impressora: ids.pat139, problema: 'nao-imprime', 'contador-de-paginas': 48_210 },
      versao: 1,
    });
    expect(await c.conversaDo(1042)).toEqual(conversa);
    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({
      acao: 'chamado.campos-trocados',
      atorContaId: c.conta('diego'),
      alvoId: c.chamadoId(1042),
    });
    expect(auditado?.antes).toEqual({ campos: {} });
    expect(auditado?.depois).toEqual({ campos: { 'Contador de páginas': '48.210' } });
    expect(await c.eventosDo(1042)).toEqual([...eventos, mudouNos(c.locais.recepcao)]);

    // As mesmas respostas não mudam nada.
    const iguais = await aceita(mudarCampos(1042, 'ana', { 'contador-de-paginas': 48_210 }));
    expect(await auditoriaDaRequisicao(api, c.org, iguais)).toEqual([]);
    expect(await c.eventosDo(1042)).toHaveLength(eventos.length + 1);
  });

  it('Anexo tirado de um campo da TI: a foto é removida na hora, e a auditoria guarda "1 arquivo" antes e nada depois', async () => {
    const foto = await anexo('diego', 'foto da peça');
    await aceita(mudarCampos(1042, 'diego', { 'contrato-de-manutencao': false, peca: [foto] }));
    expect(await arquivoDe(foto)).toEqual({
      removidoEm: null,
      dono: { chamadoId: c.chamadoId(1042), mensagemId: null, campoId: 'peca' },
    });
    // A segunda foto se junta à primeira, que fica com o campo; depois, só a que sai é removida.
    const segunda = await anexo('diego', 'segunda foto da peça');
    await aceita(mudarCampos(1042, 'diego', { peca: [foto, segunda] }));
    expect((await arquivoDe(foto)).removidoEm).toBeNull();
    api.relogio.avancar(60_000);
    const primeiraSai = api.relogio.agora();
    await aceita(mudarCampos(1042, 'diego', { peca: [segunda] }));
    expect((await arquivoDe(foto)).removidoEm).toEqual(primeiraSai);
    expect(await arquivoDe(segunda)).toEqual({
      removidoEm: null,
      dono: { chamadoId: c.chamadoId(1042), mensagemId: null, campoId: 'peca' },
    });
    api.relogio.avancar(60_000);
    const agora = api.relogio.agora();
    const r = await aceita(mudarCampos(1042, 'diego', { peca: [] }));
    expect((await arquivoDe(segunda)).removidoEm).toEqual(agora);
    expect((await c.lerChamado(1042)).respostas).toEqual({
      impressora: ids.pat139,
      problema: 'nao-imprime',
      'contador-de-paginas': 48_210,
      'contrato-de-manutencao': false,
    });
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado?.antes).toEqual({ campos: { 'Foto da peça': '1 arquivo' } });
    expect(auditado?.depois).toEqual({ campos: {} });
  });

  it('o campo que some pela condição perde a resposta, e a foto dele é removida', async () => {
    const foto = await anexo('diego', 'outra foto da peça');
    await aceita(mudarCampos(1042, 'diego', { peca: [foto] }));
    const agora = api.relogio.agora();
    const r = await aceita(mudarCampos(1042, 'diego', { 'contrato-de-manutencao': true }));
    expect((await c.lerChamado(1042)).respostas).toEqual({
      impressora: ids.pat139,
      problema: 'nao-imprime',
      'contador-de-paginas': 48_210,
      'contrato-de-manutencao': true,
    });
    expect((await arquivoDe(foto)).removidoEm).toEqual(agora);
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado?.antes).toEqual({
      campos: { 'Contrato de manutenção': 'Não', 'Foto da peça': '1 arquivo' },
    });
    expect(auditado?.depois).toEqual({ campos: { 'Contrato de manutenção': 'Sim' } });
  });

  it('as recusas: a chave que não é um campo só da TI, a do campo e a do ativo, o anexo e o arquivo de outra conta', async () => {
    const deAna = await anexo('ana', 'foto de ana');
    for (const [respostas, campos] of [
      [{ problema: 'atolando' }, { formulario: RECUSA_DO_FORMULARIO }],
      [
        { 'contador-de-paginas': -1 },
        { 'campos.contador-de-paginas': 'Use um número inteiro de 0 a 999.999.999.' },
      ],
      [{ substituta: ids.pat140 }, { 'campos.substituta': MENSAGEM_DO_ATIVO_INATIVO }],
      [{ substituta: NAO_EXISTE }, { 'campos.substituta': 'Ativo não encontrado.' }],
      [{ 'contrato-de-manutencao': false, peca: [deAna] }, { 'campos.peca': ANEXO_NAO_ENCONTRADO }],
    ] as const) {
      const r = await mudarCampos(1042, 'diego', respostas);
      expect(r.statusCode, r.body).toBe(400);
      expect(r.json().campos).toEqual(campos);
    }
    expect((await c.lerChamado(1042)).respostas).toMatchObject({
      'contador-de-paginas': 48_210,
      'contrato-de-manutencao': true,
    });
    expect((await arquivoDe(deAna)).dono).toEqual({
      chamadoId: null,
      mensagemId: null,
      campoId: null,
    });
  });

  it('o ativo da resposta da pessoa que ficou inativo depois não recusa a mudança de outro campo', async () => {
    await mudarAtivo(ids.pat139, 'inativo');
    try {
      const r = await aceita(
        mudarCampos(1042, 'diego', { 'contador-de-paginas': 50_000, substituta: ids.pat200 }),
      );
      // A resposta do campo Ativo só da TI não liga o ativo: ele muda só pela troca.
      expect(await c.lerChamado(1042)).toMatchObject({
        ativoId: ids.pat139,
        respostas: {
          impressora: ids.pat139,
          'contador-de-paginas': 50_000,
          substituta: ids.pat200,
        },
      });
      // O ativo vai à auditoria pelo patrimônio, como o resumo o mostra.
      const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
      expect(auditado?.antes).toEqual({ campos: { 'Contador de páginas': '48.210' } });
      expect(auditado?.depois).toEqual({
        campos: { 'Contador de páginas': '50.000', 'Impressora substituta': 'PAT-00200' },
      });
    } finally {
      await mudarAtivo(ids.pat139, 'ativo');
    }
  });

  it('o local e a pessoa vão à auditoria pelo caminho e pelo nome, antes e depois', async () => {
    const r = await aceita(
      mudarCampos(1042, 'diego', { onde: c.locais.reunioes, tecnico: c.pessoas.paulo }),
    );
    const [auditado] = await auditoriaDaRequisicao(api, c.org, r);
    expect(auditado?.antes).toEqual({ campos: {} });
    expect(auditado?.depois).toEqual({
      campos: {
        'Onde ficou a peça': 'Campinas › Sala de reuniões',
        'Quem foi ao local': 'Paulo Mendes',
      },
    });
    const outra = await aceita(
      mudarCampos(1042, 'diego', { onde: c.locais.recepcao, tecnico: null }),
    );
    const [mudou] = await auditoriaDaRequisicao(api, c.org, outra);
    expect(mudou?.antes).toEqual({
      campos: {
        'Onde ficou a peça': 'Campinas › Sala de reuniões',
        'Quem foi ao local': 'Paulo Mendes',
      },
    });
    expect(mudou?.depois).toEqual({ campos: { 'Onde ficou a peça': 'Jundiaí › Recepção' } });
  });

  it('o arquivo de outro dono que as respostas citam fica, quando sai do campo', async () => {
    // As respostas do #1042 passam a citar, gravados direto no banco, o anexo de uma nota dele e o
    // da Foto da peça do #1049: só os anexos dos campos do próprio chamado saem com o campo.
    const daNota = await anexo('ana', 'anexo da nota');
    const nota = await c.cliente.enviar('POST', '/chamados/1042/nota', c.como('ana'), {
      texto: 'A peça trocada.',
      anexos: [daNota],
    });
    expect(nota.statusCode, nota.body).toBe(200);
    const doOutro = await anexo('ana', 'foto do outro chamado');
    await aceita(mudarCampos(1049, 'ana', { peca: [doOutro] }));
    const { respostas } = await c.lerChamado(1042);
    await c.mudarChamado(1042, {
      respostas: { ...respostas, 'contrato-de-manutencao': false, peca: [daNota, doOutro] },
    });
    await aceita(mudarCampos(1042, 'diego', { peca: [] }));
    expect((await c.lerChamado(1042)).respostas).not.toHaveProperty('peca');
    expect(await arquivoDe(daNota)).toMatchObject({
      removidoEm: null,
      dono: { chamadoId: c.chamadoId(1042), campoId: null },
    });
    expect(await arquivoDe(doOutro)).toEqual({
      removidoEm: null,
      dono: { chamadoId: c.chamadoId(1049), mensagemId: null, campoId: 'peca' },
    });
  });
});

describe('o chamado resolvido e o acesso', () => {
  it('no chamado resolvido, as três mudanças são recusadas', async () => {
    const resolveu = await c.cliente.enviar('POST', '/chamados/1048/resolver', c.como('ana'), {
      feito: 'Troquei a cadeira.',
    });
    expect(resolveu.statusCode, resolveu.body).toBe(200);
    const antes = await c.lerChamado(1048);
    for (const r of [
      await trocarAtivo(1048, 'ana', { ativo: ids.pat139 }),
      await trocarTitulo(1048, 'ana', { titulo: 'Cadeira quebrada' }),
      await mudarCampos(1048, 'ana', { 'contador-de-paginas': 1 }),
    ]) {
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({ type: CONFLITO, detail: 'O chamado #1048 está resolvido.' });
    }
    expect(await c.lerChamado(1048)).toEqual(antes);
  });

  it('quem não atende recebe o 403, quem vê e não atende os locais recebe a recusa do domínio, e o chamado que a conta não vê responde como o que não existe', async () => {
    const mudancas = [
      (usuario: UsuarioDosChamados) => trocarAtivo(1049, usuario, { ativo: null }),
      (usuario: UsuarioDosChamados) => trocarTitulo(1049, usuario, { titulo: 'Outro título' }),
      (usuario: UsuarioDosChamados) => mudarCampos(1049, usuario, {}),
    ];
    for (const mudar of mudancas) {
      const naoAtende = await mudar('carla');
      expect(naoAtende.statusCode, naoAtende.body).toBe(403);
      const naoVe = await mudar('elisa');
      expect(naoVe.statusCode, naoVe.body).toBe(404);
      expect(naoVe.json().detail).toBe('Chamado não encontrado.');
    }
    // Carla, que vê os chamados da organização, passa a atender os de Campinas: vê o #1049, da
    // Recepção, em Jundiaí, e não o atende. As três passam pelo mesmo `travarParaMudar`, e uma basta.
    const atribuicao = await atribuir(api, c.org, {
      perfilId: c.perfis.atende,
      contaId: c.conta('carla'),
      localId: c.locais.campinas,
    });
    try {
      const antes = await c.lerChamado(1049);
      const r = await trocarTitulo(1049, 'carla', { titulo: 'Outro título' });
      expect(r.statusCode, r.body).toBe(409);
      expect(r.json()).toMatchObject({
        type: CONFLITO,
        detail: 'Você não atende os chamados de Jundiaí › Recepção.',
      });
      expect(await c.lerChamado(1049)).toEqual(antes);
    } finally {
      await naOrganizacao(api.banco, c.org, (tx) =>
        tx.delete(atribuicoes).where(eq(atribuicoes.id, atribuicao)),
      );
    }
  });
});
