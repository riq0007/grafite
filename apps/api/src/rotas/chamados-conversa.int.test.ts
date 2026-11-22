// A conversa do chamado (spec chamados, "Ações do atendimento" e "Conversa do chamado"; change
// chamados-da-ti, design, decisões 3, 4 e 10, e tarefa 4.13): a mensagem, o "Enviar e esperar a
// resposta" e a nota pelas rotas, com os anexos, a conversa na ordem, o relógio e o evento. A
// matriz, as recusas do texto e o relógio são do domínio (`chamados/acoes.test.ts`); aqui fica um
// caso de cada ligação.
import { anexosDosChamados, chamados, horarioDaTi, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ChamadosDeTeste,
  HORARIO_DOS_CHAMADOS,
  montarChamados,
  type UsuarioDosChamados,
} from '../../test/chamados.ts';
import {
  type ApiDeTeste,
  abrirApi,
  auditoriaDaRequisicao,
  criarRelogio,
  esperarNaTrava,
} from '../../test/integracao.ts';
import { ANEXO_NAO_ENCONTRADO } from '../chamados/anexos.ts';

const host = 'grafite.chamados-conversa.local';
/** A terça-feira, 17 de novembro de 2026, às 07:40 em São Paulo: a abertura dos chamados. */
const ABERTURA = new Date('2026-11-17T10:40:00.000Z');
const MINUTO = 60 * 1000;
const MUDOU = 'urn:grafite:problema:chamado-mudou';
const RELATO = 'A cadeira da sala 3 quebrou.';

let api: ApiDeTeste;
let c: ChamadosDeTeste;

type Escrita = 'mensagem' | 'esperar' | 'nota';

const escrever = (
  numero: number,
  rota: Escrita,
  usuario: UsuarioDosChamados | 'ninguem',
  corpo: object,
) => c.cliente.enviar('POST', `/chamados/${numero}/${rota}`, c.como(usuario), corpo);

/** A escrita aceita, com a resposta. */
async function escreveu(numero: number, rota: Escrita, usuario: UsuarioDosChamados, corpo: object) {
  const r = await escrever(numero, rota, usuario, corpo);
  expect(r.statusCode, r.body).toBe(200);
  return r;
}

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

/** O dono do anexo: o chamado e a mensagem, ou nulos, sem dono. */
const donoDo = (arquivoId: string) =>
  naOrganizacao(api.banco, c.org, async (tx) => {
    const [linha] = await tx
      .select({ chamadoId: anexosDosChamados.chamadoId, mensagemId: anexosDosChamados.mensagemId })
      .from(anexosDosChamados)
      .where(eq(anexosDosChamados.arquivoId, arquivoId));
    return linha;
  });

/** O evento em tempo real de cada mudança do chamado, a quem o vê na Recepção. */
const MUDOU_O_CHAMADO = {
  tipo: 'chamados.mudaram',
  alvoTipo: 'chamado',
  permissao: 'chamados.ver',
  locais: [] as string[],
};

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(ABERTURA) });
  c = await montarChamados(api, host);
  MUDOU_O_CHAMADO.locais = [c.locais.recepcao];
  // Os chamados #1042 a #1047, de Marina, da Recepção, em Jundiaí, do tipo Outro (em horas
  // corridas), abertos por Ana às 07:40 na triagem.
  await c.entrar('ana');
  for (let vez = 0; vez < 6; vez += 1) {
    await c.abrir(c.relato('marina', { texto: RELATO, ficaComigo: false }));
  }
  // As sessões entram às 09:40.
  api.relogio.avancar(2 * 60 * MINUTO);
  await c.entrar();
});

describe('a mensagem e a nota', () => {
  it('entram na conversa como elas mesmas, com os anexos, sem mudar o chamado nem ir para a auditoria', async () => {
    const agora = api.relogio.agora();
    const antes = { 1042: await c.lerChamado(1042), 1043: await c.lerChamado(1043) };
    const foto = await anexo('ana', 'foto da cadeira');
    const orcamento = await anexo('ana', 'orçamento');
    const laudo = await anexo('ana', 'laudo');

    const mensagem = await escreveu(1042, 'mensagem', 'ana', {
      texto: '  Qual é a sala?  ',
      anexos: [foto, orcamento],
    });
    expect(mensagem.json()).toEqual({
      numero: 1042,
      versao: 1,
      situacao: 'triagem',
      responsavel: null,
    });
    const nota = await escreveu(1043, 'nota', 'ana', {
      texto: 'A cadeira é do Comercial.',
      anexos: [laudo],
    });
    expect(nota.json()).toMatchObject({ numero: 1043, versao: 1, situacao: 'triagem' });

    const daMensagem = (await c.conversaDo(1042)).at(-1);
    expect(daMensagem).toMatchObject({
      especie: 'mensagem',
      evento: null,
      texto: 'Qual é a sala?',
      autorConta: c.conta('ana'),
      criadaEm: agora,
    });
    const daNota = (await c.conversaDo(1043)).at(-1);
    expect(daNota).toMatchObject({
      especie: 'nota',
      evento: null,
      texto: 'A cadeira é do Comercial.',
      autorConta: c.conta('ana'),
      criadaEm: agora,
    });
    expect(await donoDo(foto)).toEqual({
      chamadoId: c.chamadoId(1042),
      mensagemId: daMensagem?.id,
    });
    expect(await donoDo(orcamento)).toEqual({
      chamadoId: c.chamadoId(1042),
      mensagemId: daMensagem?.id,
    });
    expect(await donoDo(laudo)).toEqual({ chamadoId: c.chamadoId(1043), mensagemId: daNota?.id });

    // Nem a versão, nem o relógio, nem a primeira resposta da abertura mudam.
    expect(await c.lerChamado(1042)).toEqual(antes[1042]);
    expect(await c.lerChamado(1043)).toEqual(antes[1043]);
    expect(await auditoriaDaRequisicao(api, c.org, mensagem)).toEqual([]);
    expect(await auditoriaDaRequisicao(api, c.org, nota)).toEqual([]);
    // O da abertura e o da escrita, a quem vê o chamado nos locais dele.
    expect(await c.eventosDo(1042)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
    expect(await c.eventosDo(1043)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
  });

  it('só com os anexos, a mensagem e a nota vão com o texto nulo, e a pergunta pede o texto (tarefa 4.18)', async () => {
    const planta = await anexo('ana', 'planta da sala');
    const orcamento = await anexo('ana', 'orçamento da cadeira');
    const pergunta = await escrever(1047, 'mensagem', 'ana', {
      anexos: [planta],
      opcoes: ['Pode ser', 'Mais tarde'],
    });
    expect(pergunta.statusCode, pergunta.body).toBe(400);
    expect(pergunta.json().campos).toEqual({ texto: 'Escreva a mensagem.' });
    expect(await donoDo(planta)).toEqual({ chamadoId: null, mensagemId: null });

    await escreveu(1047, 'nota', 'ana', { anexos: [orcamento] });
    await escreveu(1047, 'mensagem', 'ana', { texto: '   ', anexos: [planta] });
    const [nota, mensagem] = (await c.conversaDo(1047)).slice(-2);
    expect(nota).toMatchObject({ especie: 'nota', texto: null });
    expect(mensagem).toMatchObject({ especie: 'mensagem', texto: null });
    expect(await donoDo(planta)).toEqual({
      chamadoId: c.chamadoId(1047),
      mensagemId: mensagem?.id,
    });

    // A ficha lê o texto nulo, com os anexos, e os Prazos, o nome do primeiro como o começo.
    const ficha = await c.cliente.consultar('/chamados/1047', c.como('ana'));
    expect(ficha.statusCode, ficha.body).toBe(200);
    expect(
      (ficha.json() as { conversa: { especie: string; texto?: string | null }[] }).conversa
        .filter(({ especie }) => especie === 'mensagem' || especie === 'nota')
        .slice(-2),
    ).toMatchObject([
      { especie: 'nota', texto: null, anexos: [{ nome: 'orçamento da cadeira.pdf' }] },
      { especie: 'mensagem', texto: null, anexos: [{ nome: 'planta da sala.pdf' }] },
    ]);
    const prazos = await c.cliente.consultar(
      '/chamados/prazos?fuso=America%2FSao_Paulo',
      c.como('ana'),
    );
    expect(prazos.statusCode, prazos.body).toBe(200);
    const doPrazo = (
      prazos.json() as { chamados: { numero: number; ultimaMensagem: { texto: string } | null }[] }
    ).chamados.find(({ numero }) => numero === 1047);
    expect(doPrazo?.ultimaMensagem?.texto).toBe('planta da sala.pdf');
  });

  it('o texto e os anexos recusados são o 400 no campo, e nada fica gravado', async () => {
    const antes = await c.conversaDo(1046);
    const vazia = await escrever(1046, 'mensagem', 'ana', { texto: '   ' });
    expect(vazia.statusCode, vazia.body).toBe(400);
    expect(vazia.json().campos).toEqual({ texto: 'Escreva a mensagem.' });
    // Sem o texto, a frase é a da ação, do domínio.
    const semTexto = await escrever(1046, 'nota', 'ana', {});
    expect(semTexto.statusCode, semTexto.body).toBe(400);
    expect(semTexto.json().campos).toEqual({ texto: 'Escreva a nota.' });
    const longa = await escrever(1046, 'esperar', 'ana', { texto: 'a'.repeat(4001) });
    expect(longa.statusCode, longa.body).toBe(400);
    expect(longa.json().campos).toEqual({ texto: 'Use até 4.000 caracteres.' });

    const muitos = await escrever(1046, 'nota', 'ana', {
      texto: 'Seis fotos.',
      anexos: Array.from({ length: 6 }, (_, i) => `0198a3f0-0000-7000-8000-00000000000${i}`),
    });
    expect(muitos.statusCode, muitos.body).toBe(400);
    expect(muitos.json().campos).toEqual({ anexos: 'Anexe até 5 arquivos.' });

    const foraDoFormato = await escrever(1046, 'mensagem', 'ana', {
      texto: 'Segue a foto.',
      anexos: ['foto-1'],
    });
    expect(foraDoFormato.statusCode, foraDoFormato.body).toBe(400);
    expect(foraDoFormato.json().campos).toEqual({ anexos: ANEXO_NAO_ENCONTRADO });

    // O anexo que Diego enviou não é de Ana: a mensagem volta inteira.
    const deDiego = await anexo('diego', 'foto do Diego');
    const deOutro = await escrever(1046, 'mensagem', 'ana', {
      texto: 'Segue a foto.',
      anexos: [deDiego],
    });
    expect(deOutro.statusCode, deOutro.body).toBe(400);
    expect(deOutro.json().campos).toEqual({ anexos: ANEXO_NAO_ENCONTRADO });
    expect(await donoDo(deDiego)).toEqual({ chamadoId: null, mensagemId: null });

    expect(await c.conversaDo(1046)).toEqual(antes);
    expect(await c.lerChamado(1046)).toMatchObject({ situacao: 'triagem', versao: 1 });
  });

  it('quem não atende recebe o 403, e o chamado que a conta não vê responde como o que não existe', async () => {
    for (const rota of ['mensagem', 'esperar', 'nota'] as const) {
      const naoAtende = await escrever(1046, rota, 'carla', { texto: 'Oi.' });
      expect(naoAtende.statusCode, `${rota}: ${naoAtende.body}`).toBe(403);
      const naoVe = await escrever(1046, rota, 'elisa', { texto: 'Oi.' });
      expect(naoVe.statusCode, `${rota}: ${naoVe.body}`).toBe(404);
      expect(naoVe.json().detail).toBe('Chamado não encontrado.');
    }
    expect(await c.lerChamado(1046)).toMatchObject({ situacao: 'triagem', versao: 1 });
  });
});

describe('POST /chamados/:numero/esperar', () => {
  it('na triagem: o assumir, a mensagem e a espera, nessa ordem, com o relógio parado; o desfazer depois é recusado', async () => {
    const agora = api.relogio.agora();
    const antes = await c.lerChamado(1044);
    const foto = await anexo('ana', 'foto da sala');
    const r = await escreveu(1044, 'esperar', 'ana', { texto: 'Qual é a sala?', anexos: [foto] });
    expect(r.json()).toEqual({
      numero: 1044,
      versao: 2,
      situacao: 'aguardando',
      responsavel: { id: c.conta('ana'), nome: 'Ana Souza' },
    });
    expect(await c.lerChamado(1044)).toMatchObject({
      situacao: 'aguardando',
      responsavelId: c.conta('ana'),
      responsavelDesde: agora,
      versao: 2,
      // O tipo Outro conta em horas corridas: das 07:40 às 09:40.
      contadoS: 2 * 60 * 60,
      relogioDesde: null,
      primeiraRespostaEm: antes.primeiraRespostaEm,
    });
    const gravadas = (await c.conversaDo(1044)).slice(-3);
    expect(gravadas.map(({ especie, evento, texto }) => ({ especie, evento, texto }))).toEqual([
      { especie: 'evento', evento: 'assumiu', texto: null },
      { especie: 'mensagem', evento: null, texto: 'Qual é a sala?' },
      { especie: 'evento', evento: 'aguardando', texto: null },
    ]);
    for (const linha of gravadas) {
      expect(linha).toMatchObject({ autorConta: c.conta('ana'), criadaEm: agora });
    }
    expect(gravadas[0]?.dados).toEqual({ de: null, desde: ABERTURA.toISOString() });
    // O anexo fica com a mensagem, a segunda linha, e não com o evento do assumir.
    expect(await donoDo(foto)).toEqual({
      chamadoId: c.chamadoId(1044),
      mensagemId: gravadas[1]?.id,
    });

    const [auditado, ...outros] = await auditoriaDaRequisicao(api, c.org, r);
    expect(outros).toEqual([]);
    expect(auditado).toMatchObject({ acao: 'chamado.aguardando', alvoId: c.chamadoId(1044) });
    expect(auditado?.antes).toEqual({ situacao: 'triagem' });
    expect(auditado?.depois).toEqual({ situacao: 'aguardando', responsavel: 'Ana Souza' });
    expect(await c.eventosDo(1044)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);

    // Com a versão que a espera devolveu, o último evento que sobe a versão é a espera, e não o
    // assumir que ela gravou.
    const desfazer = await c.cliente.enviar('POST', '/chamados/1044/desfazer', c.como('ana'), {
      versao: 2,
    });
    expect(desfazer.statusCode, desfazer.body).toBe(409);
    expect(desfazer.json()).toMatchObject({
      type: MUDOU,
      detail: 'O chamado mudou depois. Confira antes de desfazer.',
    });
    expect(await c.lerChamado(1044)).toMatchObject({ situacao: 'aguardando', versao: 2 });
  });

  it('no chamado que já aguarda, vale como a mensagem: sem evento, sem a auditoria e com o relógio parado desde a espera', async () => {
    await escreveu(1045, 'esperar', 'ana', { texto: 'Qual é a sala?' });
    const esperando = await c.lerChamado(1045);
    api.relogio.avancar(10 * MINUTO);
    const r = await escreveu(1045, 'esperar', 'ana', { texto: 'Conseguiu ver a sala?' });
    expect(r.json()).toMatchObject({ numero: 1045, versao: 2, situacao: 'aguardando' });
    expect(await c.lerChamado(1045)).toEqual(esperando);
    expect((await c.conversaDo(1045)).at(-1)).toMatchObject({
      especie: 'mensagem',
      evento: null,
      texto: 'Conseguiu ver a sala?',
    });
    expect(await auditoriaDaRequisicao(api, c.org, r)).toEqual([]);
    // O da abertura, o da primeira espera e o da segunda.
    expect(await c.eventosDo(1045)).toEqual([MUDOU_O_CHAMADO, MUDOU_O_CHAMADO, MUDOU_O_CHAMADO]);
  });

  it('a troca do horário trava o chamado antes da espera: a espera espera e conta desde a troca, pelo horário novo', async () => {
    // O #1047 conta no horário da TI desde 30 min antes de agora.
    const agora = api.relogio.agora();
    const { prazo } = await c.lerChamado(1047);
    await c.mudarChamado(1047, {
      prazo: { ...prazo, modo: 'horario' },
      contadoS: 0,
      relogioDesde: new Date(agora.getTime() - 30 * MINUTO),
    });

    // Outra conexão faz o que a troca do horário faz: trava o #1047, fecha o relógio dele pelo
    // horário antigo, das 08:00 às 18:00, e grava o novo, das 17:00 às 18:00, longe de agora.
    let soltar = () => {};
    let preso = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    const troca = naOrganizacao(api.banco, c.org, async (tx) => {
      await tx
        .select({ id: chamados.id })
        .from(chamados)
        .where(eq(chamados.numero, 1047))
        .for('update');
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
      await tx
        .update(chamados)
        .set({ contadoS: 30 * 60, relogioDesde: agora })
        .where(eq(chamados.numero, 1047));
      await tx.update(horarioDaTi).set({ inicio: 17 * 60 });
    });
    try {
      await travado;
      // A espera vem 5 min depois da troca: pelo horário novo, o trecho não conta; pelo antigo,
      // seriam 300 s.
      api.relogio.avancar(5 * MINUTO);
      let espera: ReturnType<typeof escrever> | undefined;
      try {
        espera = escrever(1047, 'esperar', 'ana', { texto: 'Qual é a sala?' });
        await esperarNaTrava(api, 1);
      } finally {
        soltar();
        await troca;
      }
      const r = await espera;
      expect(r?.statusCode, r?.body).toBe(200);
      expect(await c.lerChamado(1047)).toMatchObject({
        situacao: 'aguardando',
        contadoS: 30 * 60,
        relogioDesde: null,
      });
    } finally {
      // O horário de antes volta mesmo com o teste reprovado.
      await naOrganizacao(api.banco, c.org, (tx) =>
        tx.update(horarioDaTi).set({ inicio: HORARIO_DOS_CHAMADOS.inicio }),
      );
    }
  });
});
