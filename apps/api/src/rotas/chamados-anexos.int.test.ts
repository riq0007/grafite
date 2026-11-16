// Os anexos dos chamados pela API (spec arquivos-e-imagens, "Anexos dos chamados"; change
// chamados-da-ti, design, decisão 10, tarefa 4.6): o envio sem dono, com `chamados.atender` e as
// regras de "Arquivos aceitos"; a gravação que toma os anexos, só os enviados pela mesma conta, sem
// dono e não removidos, na transação dela, que volta inteira na recusa; a entrega pelo chamado dono,
// a quem o vê, e a do sem dono, só a quem o enviou; e a remoção dos esquecidos na manutenção diária,
// passadas 24 h. A conversa e o formulário que tomam os anexos chegam nas tarefas 4.7, 4.13 e 4.15:
// aqui, a gravação é a mensagem incluída direto no banco, com a tomada na mesma transação.
import {
  anexosDosChamados,
  arquivos,
  chamados,
  mensagensDosChamados,
  naOrganizacao,
  type Transacao,
  tiposDeChamado,
} from '@grafite/db';
import { TIPOS_DE_CHAMADO_DE_FABRICA } from '@grafite/domain';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { desligarModulos } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarRelogio,
  type Entrada,
  esperarNaTrava,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { chaveDoArquivo } from '../arquivos/armazenamento.ts';
import { LIMITE_DO_DOCUMENTO } from '../arquivos/documentos.ts';
import {
  ANEXO_NAO_ENCONTRADO,
  type DonoDoAnexo,
  removerAnexosEsquecidos,
  tomarAnexos,
} from '../chamados/anexos.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';
import { tarefasDaManutencao } from '../fila/manutencao.ts';

const host = 'grafite.chamados-anexos.local';
const ATOR = { tipo: 'sistema', descricao: 'teste dos anexos dos chamados' } as const;
/** A sexta-feira, 2 de outubro de 2026, às 11:00 em São Paulo. */
const AGORA = new Date('2026-10-02T14:00:00.000Z');
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const NAO_ACEITO =
  'Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.';
/** A recusa da gravação com um anexo que a conta não pode usar. */
const RECUSA = {
  dados: { status: 400, codigo: 'dados-invalidos', campos: { anexos: ANEXO_NAO_ENCONTRADO } },
};

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contas: Record<string, string> = {};
const ids: Record<string, string> = {};
let pessoa = '';
let tipo = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const conta = (usuario: string) => contas[usuario] ?? '';
const id = (chave: string) => ids[chave] ?? '';
const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

const enviarAnexo = (conteudo: Buffer, nome: string, usuario = 'ana') =>
  cliente.enviarBytes(
    'POST',
    `/chamados/anexos?nome=${encodeURIComponent(nome)}`,
    como(usuario),
    conteudo,
  );

/** Envia um PDF e devolve o id do arquivo, que a gravação toma. */
async function anexo(usuario = 'ana', texto = 'foto da impressora') {
  const r = await enviarAnexo(PDF(texto), `${texto}.pdf`, usuario);
  expect(r.statusCode, r.body).toBe(201);
  return r.json().id as string;
}

const baixar = (numero: number, arquivo: string, usuario: string) =>
  cliente.consultar(`/chamados/${numero}/anexos/${arquivo}`, como(usuario));
const baixarSemDono = (arquivo: string, usuario: string) =>
  cliente.consultar(`/chamados/anexos/${arquivo}`, como(usuario));

/** Um chamado direto no banco, em atendimento com Ana, nos locais pedidos. */
async function chamado(
  numero: number,
  { locais, semLocal = false }: { locais: string[]; semLocal?: boolean },
) {
  const formulario = TIPOS_DE_CHAMADO_DE_FABRICA.find(({ nome }) => nome === 'Outro')?.formulario;
  ids[`#${numero}`] = await naOrganizacao(api.banco, org, async (tx) => {
    const [gravado] = await tx
      .insert(chamados)
      .values({
        orgId: org,
        numero,
        tipoId: tipo,
        titulo: 'Impressora manchando',
        tituloNormalizado: 'impressora manchando',
        pessoaId: pessoa,
        origem: 'ti',
        abertoPor: conta('ana'),
        abertoEm: AGORA,
        formulario: { ...formulario },
        locais,
        semLocal,
        situacao: 'em-atendimento',
        responsavelId: conta('ana'),
        responsavelDesde: AGORA,
        prazo: {
          modo: 'corridas',
          respostaMin: 60,
          resolucaoMin: 1800,
          resposta: { valor: 1, unidade: 'h' },
          resolucao: { valor: 3, unidade: 'd' },
        },
        relogioDesde: AGORA,
        primeiraRespostaEm: AGORA,
      })
      .returning({ id: chamados.id });
    return gravado?.id ?? '';
  });
}

/** A mensagem ou a nota de quem escreve, na transação da gravação. */
async function escrever(
  tx: Transacao,
  chamadoId: string,
  especie: 'mensagem' | 'nota',
  usuario: string,
) {
  const [linha] = await tx
    .insert(mensagensDosChamados)
    .values({
      orgId: org,
      chamadoId,
      especie,
      autorConta: conta(usuario),
      texto: especie === 'nota' ? 'Toner trocado, falta testar.' : 'Pode mandar uma foto?',
    })
    .returning({ id: mensagensDosChamados.id });
  return linha?.id ?? '';
}

/** Grava uma mensagem ou uma nota com os anexos, como a conversa: tudo numa transação. */
function gravarComAnexos(
  numero: number,
  especie: 'mensagem' | 'nota',
  usuario: string,
  arquivosDaGravacao: string[],
) {
  return naOrganizacao(api.banco, org, async (tx) => {
    const chamadoId = id(`#${numero}`);
    const mensagemId = await escrever(tx, chamadoId, especie, usuario);
    const tomados = await tomarAnexos(tx, {
      arquivos: arquivosDaGravacao,
      contaId: conta(usuario),
      dono: { chamadoId, mensagemId },
      chave: 'anexos',
    });
    return { mensagemId, tomados };
  });
}

/** Toma os anexos para um dono qualquer, como o campo do formulário. */
const tomarPara = (dono: DonoDoAnexo, arquivosDaGravacao: string[], usuario = 'ana') =>
  naOrganizacao(api.banco, org, (tx) =>
    tomarAnexos(tx, {
      arquivos: arquivosDaGravacao,
      contaId: conta(usuario),
      dono,
      chave: 'campos.k3Fq9x',
    }),
  );

/** O dono do anexo e a remoção do arquivo dele. */
const anexoDo = (arquivoId: string) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({
        chamadoId: anexosDosChamados.chamadoId,
        mensagemId: anexosDosChamados.mensagemId,
        campoId: anexosDosChamados.campoId,
        removidoEm: arquivos.removidoEm,
        apagadoEm: arquivos.apagadoEm,
      })
      .from(anexosDosChamados)
      .innerJoin(arquivos, eq(arquivos.id, anexosDosChamados.arquivoId))
      .where(eq(anexosDosChamados.arquivoId, arquivoId));
    return linha;
  });

const SEM_DONO = { chamadoId: null, mensagemId: null, campoId: null, removidoEm: null };

const total = (tabela: typeof anexosDosChamados | typeof arquivos) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx.select({ total: count() }).from(tabela);
    return linha?.total ?? 0;
  });

const conversaDo = (numero: number) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const [linha] = await tx
      .select({ total: count() })
      .from(mensagensDosChamados)
      .where(eq(mensagensDosChamados.chamadoId, id(`#${numero}`)));
    return linha?.total ?? 0;
  });

/** Remove o arquivo direto no banco, como a troca de um campo da TI ou a manutenção. */
const removerArquivo = (arquivoId: string) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.update(arquivos).set({ removidoEm: api.relogio.agora() }).where(eq(arquivos.id, arquivoId)),
  );

const USUARIOS = ['ana', 'bruno', 'carla', 'diego'] as const;

/** Adianta o relógio da API e entra de novo, porque as sessões vencem com o relógio. */
async function avancar(ms: number) {
  api.relogio.avancar(ms);
  for (const usuario of USUARIOS) entradas[usuario] = await cliente.entrar(usuario);
}

function manutencao(log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }) {
  const tarefa = tarefasDaManutencao({
    banco: api.banco,
    armazenamento: api.armazenamento,
    agora: api.relogio.agora,
    log,
    enviar: vi.fn(async () => null),
  }).find(({ nome }) => nome === 'manutencao');
  return {
    log,
    rodar: () =>
      tarefa?.trabalho(
        { orgId: org },
        { tarefaId: 't', tentativa: 0, sinal: new AbortController().signal },
      ),
  };
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(AGORA) });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, (tx) =>
    criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
  );
  tipo = await naOrganizacao(
    api.banco,
    org,
    async (tx) =>
      (
        await tx
          .select({ id: tiposDeChamado.id })
          .from(tiposDeChamado)
          .where(eq(tiposDeChamado.nome, 'Outro'))
      )[0]?.id ?? '',
  );
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });

  cliente = clienteDaApi(api, host);
  // Ana e Bruno atendem a organização inteira; Carla vê os chamados de Jundiaí, e Diego, os de
  // Campinas. Os chamados são de Fernanda.
  const atende = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê os chamados', permissoes: ['chamados.ver'] });
  const nomes = {
    ana: 'Ana Souza',
    bruno: 'Bruno Costa',
    carla: 'Carla Dias',
    diego: 'Diego Ramos',
  } as const;
  for (const usuario of USUARIOS) {
    contas[usuario] = (await criarConta(api, org, { usuario, nome: nomes[usuario] })).id;
  }
  pessoa = (await criarConta(api, org, { usuario: 'fernanda', nome: 'Fernanda Rocha' })).pessoaId;
  await atribuir(api, org, { perfilId: atende, contaId: conta('ana') });
  await atribuir(api, org, { perfilId: atende, contaId: conta('bruno') });
  await atribuir(api, org, { perfilId: ve, contaId: conta('carla'), localId: id('jundiai') });
  await atribuir(api, org, { perfilId: ve, contaId: conta('diego'), localId: id('campinas') });
  for (const usuario of USUARIOS) entradas[usuario] = await cliente.entrar(usuario);

  await chamado(1041, { locais: [id('jundiai')] });
  await chamado(1042, { locais: [id('jundiai')] });
  // O chamado da organização inteira: a pessoa sem local de trabalho.
  await chamado(1043, { locais: [], semLocal: true });
});

afterAll(async () => {
  await api?.fechar();
});

describe('o envio do anexo', () => {
  it('guarda o arquivo sem dono, com quem o enviou, e devolve o id, o nome, o tipo e o tamanho', async () => {
    const conteudo = PDF('nota 1234');
    const r = await enviarAnexo(conteudo, 'C:\\Users\\ana\\nota-fiscal-1234.pdf');
    expect(r.statusCode, r.body).toBe(201);
    const enviado = r.json();
    expect(enviado).toEqual({
      id: expect.any(String),
      nome: 'nota-fiscal-1234.pdf',
      tipo: 'application/pdf',
      bytes: conteudo.length,
    });
    const [registro] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(arquivos).where(eq(arquivos.id, enviado.id)),
    );
    expect(registro).toMatchObject({
      nome: 'nota-fiscal-1234.pdf',
      tipo: 'application/pdf',
      bytes: conteudo.length,
      variantes: ['completa'],
      enviadoPor: conta('ana'),
      enviadoEm: AGORA,
      removidoEm: null,
    });
    expect(await anexoDo(enviado.id)).toMatchObject(SEM_DONO);
    const guardado = await api.armazenamento.abrir(chaveDoArquivo(org, enviado.id, 'completa'));
    expect(guardado?.toString()).toBe(conteudo.toString());
  });

  it('o texto com nome de script ganha a extensão do texto', async () => {
    const r = await enviarAnexo(Buffer.from('Get-PrintJob | Remove-PrintJob\n'), 'limpeza.ps1');
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({ nome: 'limpeza.ps1.txt', tipo: 'text/plain' });
  });

  it('recusa quem não atende, sem gravar nada', async () => {
    const antes = await total(arquivos);
    const r = await enviarAnexo(PDF('de Carla'), 'foto.pdf', 'carla');
    expect(r.statusCode).toBe(403);
    expect(await total(arquivos)).toBe(antes);
  });

  it('recusa o formato, o arquivo vazio e o grande demais, sem gravar nada', async () => {
    const antes = { arquivos: await total(arquivos), anexos: await total(anexosDosChamados) };
    const programa = await enviarAnexo(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'nota.pdf');
    expect(programa.statusCode).toBe(415);
    expect(programa.json().detail).toBe(NAO_ACEITO);
    const vazio = await enviarAnexo(Buffer.alloc(0), 'vazio.pdf');
    expect(vazio.statusCode).toBe(400);
    expect(vazio.json().detail).toBe('O arquivo está vazio.');
    const grande = await enviarAnexo(Buffer.alloc(LIMITE_DO_DOCUMENTO + 1, 0x61), 'grande.txt');
    expect(grande.statusCode).toBe(413);
    expect(grande.json().detail).toBe('O arquivo passa de 25 MB.');
    expect({ arquivos: await total(arquivos), anexos: await total(anexosDosChamados) }).toEqual(
      antes,
    );
  });
});

describe('a gravação que toma os anexos', () => {
  it('a mensagem toma os anexos de quem a escreve, que passam ao chamado', async () => {
    const primeiro = await anexo();
    const segundo = await anexo('ana', 'etiqueta');
    // O mesmo anexo duas vezes na lista conta uma vez.
    const { mensagemId, tomados } = await gravarComAnexos(1042, 'mensagem', 'ana', [
      primeiro,
      segundo.toUpperCase(),
      primeiro,
    ]);
    expect(tomados).toEqual([primeiro, segundo]);
    for (const arquivo of [primeiro, segundo]) {
      expect(await anexoDo(arquivo)).toMatchObject({
        chamadoId: id('#1042'),
        mensagemId,
        campoId: null,
        removidoEm: null,
      });
    }
  });

  it('o campo do formulário toma os anexos pelo id do campo', async () => {
    const foto = await anexo('ana', 'foto do defeito');
    expect(await tomarPara({ chamadoId: id('#1042'), campoId: 'k3Fq9x' }, [foto])).toEqual([foto]);
    expect(await anexoDo(foto)).toMatchObject({
      chamadoId: id('#1042'),
      mensagemId: null,
      campoId: 'k3Fq9x',
    });
  });

  it('a gravação sem anexos não toma nada', async () => {
    expect((await gravarComAnexos(1042, 'nota', 'ana', [])).tomados).toEqual([]);
  });

  it('o anexo de outra conta é recusado, e nada é gravado', async () => {
    const deAna = await anexo();
    const conversa = await conversaDo(1042);
    await expect(gravarComAnexos(1042, 'mensagem', 'bruno', [deAna])).rejects.toMatchObject(RECUSA);
    expect(await conversaDo(1042)).toBe(conversa);
    expect(await anexoDo(deAna)).toMatchObject(SEM_DONO);
  });

  it('o anexo usado duas vezes é recusado na segunda gravação e continua só do primeiro chamado', async () => {
    const foto = await anexo();
    const { mensagemId } = await gravarComAnexos(1042, 'mensagem', 'ana', [foto]);
    const conversa = await conversaDo(1041);
    await expect(gravarComAnexos(1041, 'nota', 'ana', [foto])).rejects.toMatchObject(RECUSA);
    expect(await conversaDo(1041)).toBe(conversa);
    expect(await anexoDo(foto)).toMatchObject({ chamadoId: id('#1042'), mensagemId });
  });

  it('o anexo removido e o que não existe são recusados', async () => {
    const removido = await anexo();
    await removerArquivo(removido);
    await expect(gravarComAnexos(1042, 'mensagem', 'ana', [removido])).rejects.toMatchObject(
      RECUSA,
    );
    expect(await anexoDo(removido)).toMatchObject({ chamadoId: null });
    await expect(
      gravarComAnexos(1042, 'mensagem', 'ana', ['01900000-0000-7000-8000-000000000000']),
    ).rejects.toMatchObject(RECUSA);
  });

  it('um anexo recusado recusa a gravação inteira, sem tomar os outros', async () => {
    const bom = await anexo();
    const deBruno = await anexo('bruno');
    await expect(gravarComAnexos(1042, 'mensagem', 'ana', [bom, deBruno])).rejects.toMatchObject(
      RECUSA,
    );
    expect(await anexoDo(bom)).toMatchObject(SEM_DONO);
    expect(await anexoDo(deBruno)).toMatchObject(SEM_DONO);
  });

  it('a recusa vai na chave pedida pela gravação', async () => {
    const deBruno = await anexo('bruno');
    await expect(
      tomarPara({ chamadoId: id('#1042'), campoId: 'k3Fq9x' }, [deBruno]),
    ).rejects.toMatchObject({ dados: { campos: { 'campos.k3Fq9x': ANEXO_NAO_ENCONTRADO } } });
  });

  it('duas gravações com o mesmo anexo ao mesmo tempo: a segunda espera a primeira e é recusada', async () => {
    const foto = await anexo();
    let soltar = () => {};
    let tomou = () => {};
    const tomado = new Promise<void>((resolve) => {
      tomou = resolve;
    });
    let mensagemDaPrimeira = '';
    const primeira = naOrganizacao(api.banco, org, async (tx) => {
      const chamadoId = id('#1042');
      mensagemDaPrimeira = await escrever(tx, chamadoId, 'mensagem', 'ana');
      await tomarAnexos(tx, {
        arquivos: [foto],
        contaId: conta('ana'),
        dono: { chamadoId, mensagemId: mensagemDaPrimeira },
        chave: 'anexos',
      });
      tomou();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await tomado;
    let segunda: Promise<unknown> | undefined;
    try {
      segunda = gravarComAnexos(1041, 'nota', 'ana', [foto]).catch((erro: unknown) => erro);
      await esperarNaTrava(api, 1);
    } finally {
      soltar();
      await primeira;
    }
    expect(await segunda).toMatchObject(RECUSA);
    expect(await anexoDo(foto)).toMatchObject({
      chamadoId: id('#1042'),
      mensagemId: mensagemDaPrimeira,
    });
  });

  it('a gravação que espera a manutenção relê o arquivo e não toma o que ela removeu', async () => {
    // Outra conexão faz o que a manutenção faz: trava o anexo sem dono e remove o arquivo. A
    // gravação espera a trava e, depois, relê o arquivo, já removido, e recusa.
    const foto = await anexo();
    let soltar = () => {};
    let preso = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    const removendo = naOrganizacao(api.banco, org, async (tx) => {
      await tx
        .select({ id: anexosDosChamados.id })
        .from(anexosDosChamados)
        .where(eq(anexosDosChamados.arquivoId, foto))
        .for('update');
      await tx
        .update(arquivos)
        .set({ removidoEm: api.relogio.agora() })
        .where(eq(arquivos.id, foto));
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await travado;
    let gravacao: Promise<unknown> | undefined;
    try {
      gravacao = gravarComAnexos(1042, 'mensagem', 'ana', [foto]).catch((erro: unknown) => erro);
      await esperarNaTrava(api, 1);
    } finally {
      soltar();
      await removendo;
    }
    expect(await gravacao).toMatchObject(RECUSA);
    expect(await anexoDo(foto)).toMatchObject({ chamadoId: null });
  });
});

describe('a entrega dos anexos', () => {
  it('o anexo de uma nota vai a quem vê o chamado, para baixar, com o nome original', async () => {
    const r = await enviarAnexo(PDF('laudo do toner'), 'Laudo técnico.pdf');
    const laudo = r.json().id as string;
    await gravarComAnexos(1042, 'nota', 'ana', [laudo]);
    const baixado = await baixar(1042, laudo, 'carla');
    expect(baixado.statusCode, baixado.body).toBe(200);
    expect(baixado.headers['content-type']).toBe('application/pdf');
    expect(baixado.headers['x-content-type-options']).toBe('nosniff');
    expect(baixado.headers['content-disposition']).toBe(
      `attachment; filename="Laudo tecnico.pdf"; filename*=UTF-8''Laudo%20t%C3%A9cnico.pdf`,
    );
    expect(baixado.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(baixado.rawPayload.toString()).toContain('laudo do toner');
  });

  it('o anexo de uma mensagem e o de um campo também vão a quem vê o chamado', async () => {
    const daMensagem = await anexo();
    await gravarComAnexos(1042, 'mensagem', 'ana', [daMensagem]);
    const doCampo = await anexo();
    await tomarPara({ chamadoId: id('#1042'), campoId: 'k3Fq9x' }, [doCampo]);
    for (const arquivo of [daMensagem, doCampo]) {
      expect((await baixar(1042, arquivo, 'carla')).statusCode).toBe(200);
    }
  });

  it('o chamado que a conta não vê, ou que não existe, responde como inexistente', async () => {
    const foto = await anexo();
    await gravarComAnexos(1042, 'nota', 'ana', [foto]);
    for (const r of [await baixar(1042, foto, 'diego'), await baixar(9999, foto, 'ana')]) {
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe('Chamado não encontrado.');
    }
  });

  it('o chamado da organização inteira só a quem vê a organização', async () => {
    const foto = await anexo();
    await gravarComAnexos(1043, 'mensagem', 'ana', [foto]);
    expect((await baixar(1043, foto, 'carla')).statusCode).toBe(404);
    expect((await baixar(1043, foto, 'ana')).statusCode).toBe(200);
  });

  it('o anexo de outro chamado, pelo endereço deste, não é encontrado', async () => {
    const foto = await anexo();
    await gravarComAnexos(1041, 'mensagem', 'ana', [foto]);
    const r = await baixar(1042, foto, 'carla');
    expect(r.statusCode).toBe(404);
    expect(r.json().detail).toBe('Arquivo não encontrado.');
    expect((await baixar(1041, foto, 'carla')).statusCode).toBe(200);
  });

  it('o sem dono vai só a quem o enviou, e o que já tem dono, só pelo chamado', async () => {
    const foto = await anexo('ana', 'antes de mandar');
    const deAna = await baixarSemDono(foto, 'ana');
    expect(deAna.statusCode, deAna.body).toBe(200);
    expect(deAna.headers['content-disposition']).toContain('filename="antes de mandar.pdf"');
    expect(deAna.rawPayload.toString()).toContain('antes de mandar');
    const deBruno = await baixarSemDono(foto, 'bruno');
    expect(deBruno.statusCode).toBe(404);
    expect(deBruno.json().detail).toBe('Arquivo não encontrado.');
    await gravarComAnexos(1042, 'mensagem', 'ana', [foto]);
    expect((await baixarSemDono(foto, 'ana')).statusCode).toBe(404);
  });

  it('o arquivo removido deixa de ser entregue', async () => {
    const semDono = await anexo();
    const comDono = await anexo();
    await gravarComAnexos(1042, 'mensagem', 'ana', [comDono]);
    await removerArquivo(semDono);
    await removerArquivo(comDono);
    for (const r of [await baixarSemDono(semDono, 'ana'), await baixar(1042, comDono, 'ana')]) {
      expect(r.statusCode).toBe(404);
      expect(r.json().detail).toBe('Arquivo não encontrado.');
    }
  });
});

describe('a manutenção diária', () => {
  it('remove o anexo esquecido há mais de 24 h, e só ele', async () => {
    const esquecido = await anexo('ana', 'esquecido');
    const tomado = await anexo('ana', 'tomado');
    await gravarComAnexos(1042, 'mensagem', 'ana', [tomado]);
    await avancar(MINUTO);
    const noLimite = await anexo('ana', 'no limite');
    // A manutenção roda 24 h depois do envio do que está no limite: ele não passou das 24 h.
    await avancar(24 * HORA);
    const { log, rodar } = manutencao();
    await rodar();
    const momento = api.relogio.agora();
    expect(await anexoDo(esquecido)).toMatchObject({
      chamadoId: null,
      removidoEm: momento,
      apagadoEm: momento,
    });
    expect(await api.armazenamento.abrir(chaveDoArquivo(org, esquecido, 'completa'))).toBeNull();
    expect((await baixarSemDono(esquecido, 'ana')).statusCode).toBe(404);
    await expect(gravarComAnexos(1042, 'mensagem', 'ana', [esquecido])).rejects.toMatchObject(
      RECUSA,
    );
    expect(await anexoDo(noLimite)).toMatchObject(SEM_DONO);
    expect((await baixarSemDono(noLimite, 'ana')).statusCode).toBe(200);
    expect(await anexoDo(tomado)).toMatchObject({ chamadoId: id('#1042'), removidoEm: null });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: org, anexos: expect.any(Number) }),
      'manutenção da organização',
    );

    // Rodar de novo não mexe no que já saiu: a linha do anexo fica, com o arquivo removido.
    await avancar(HORA);
    await manutencao().rodar();
    expect(await anexoDo(esquecido)).toMatchObject({ removidoEm: momento, apagadoEm: momento });
  });

  it('a manutenção espera a gravação que toma o anexo e o deixa com o chamado', async () => {
    const foto = await anexo('ana', 'tomada no fim do prazo');
    await avancar(25 * HORA);
    let soltar = () => {};
    let tomou = () => {};
    const tomado = new Promise<void>((resolve) => {
      tomou = resolve;
    });
    const gravacao = naOrganizacao(api.banco, org, async (tx) => {
      const chamadoId = id('#1042');
      const mensagemId = await escrever(tx, chamadoId, 'mensagem', 'ana');
      await tomarAnexos(tx, {
        arquivos: [foto],
        contaId: conta('ana'),
        dono: { chamadoId, mensagemId },
        chave: 'anexos',
      });
      tomou();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await tomado;
    let rodando: Promise<unknown> | undefined;
    try {
      rodando = manutencao().rodar();
      await esperarNaTrava(api, 1);
    } finally {
      soltar();
      await gravacao;
    }
    await rodando;
    expect(await anexoDo(foto)).toMatchObject({ chamadoId: id('#1042'), removidoEm: null });
  });

  it('duas voltas juntas: a segunda espera a primeira e não remove de novo o que ela removeu', async () => {
    const esquecido = await anexo('ana', 'esquecido nas duas voltas');
    await avancar(25 * HORA);
    const primeiroMomento = api.relogio.agora();
    let soltar = () => {};
    let removeu = () => {};
    const removido = new Promise<void>((resolve) => {
      removeu = resolve;
    });
    const primeira = naOrganizacao(api.banco, org, async (tx) => {
      const quantos = await removerAnexosEsquecidos(tx, primeiroMomento);
      removeu();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
      return quantos;
    });
    await removido;
    // A segunda trava os mesmos anexos, que a primeira só travou: depois da espera, a linha do
    // anexo é a mesma, e só o UPDATE, num comando à parte, enxerga o arquivo já removido.
    let segunda: Promise<number> | undefined;
    try {
      segunda = naOrganizacao(api.banco, org, (tx) =>
        removerAnexosEsquecidos(tx, new Date(primeiroMomento.getTime() + MINUTO)),
      );
      await esperarNaTrava(api, 1);
    } finally {
      soltar();
    }
    expect(await primeira).toBeGreaterThanOrEqual(1);
    expect(await segunda).toBe(0);
    expect(await anexoDo(esquecido)).toMatchObject({ removidoEm: primeiroMomento });
  });
});

describe('o módulo desligado', () => {
  it('as rotas dos anexos respondem que o módulo está desligado', async () => {
    const foto = await anexo();
    await desligarModulos(api, org, ['chamados']);
    try {
      for (const r of [
        await enviarAnexo(PDF('desligado'), 'foto.pdf'),
        await baixarSemDono(foto, 'ana'),
        await baixar(1042, foto, 'ana'),
      ]) {
        expect(r.statusCode).toBe(403);
        expect(r.json()).toMatchObject({
          type: 'urn:grafite:problema:modulo-desligado',
          detail: 'O módulo Chamados está desligado nesta organização.',
        });
      }
    } finally {
      await desligarModulos(api, org, []);
    }
  });
});
