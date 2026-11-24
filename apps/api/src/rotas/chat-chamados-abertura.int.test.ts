// A abertura pelo chat (spec chamados, "Abrir um chamado pelo chat" e "Conversa do chamado"; spec
// chat, "Chamados da conversa"; spec arquivos-e-imagens, "Anexos dos chamados"; change
// chat-com-chamados, design, decisões 8 e 15; tarefa 3.7): os tipos e os ativos sugeridos que a
// abertura lê, o chamado com a origem `chat`, a linha da origem com os anexos da mensagem, o evento
// na conversa e a marca na mensagem, a recusa da segunda abertura, também ao mesmo tempo, e o anexo
// sem dono dos chamados com só o `chat.usar`. As recusas dos campos são do domínio; aqui fica um
// caso de cada ligação.
import {
  anexosDosChamados,
  ativos,
  auditoria,
  chamados,
  impressorasDasSolicitacoes,
  mensagensDosChamados,
  naOrganizacao,
  pessoas,
  solicitacoes,
  tiposDeChamado,
} from '@grafite/db';
import { and, asc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo, criarTipo } from '../../test/alertas.ts';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import {
  type ApiDeTeste,
  abrirApi,
  criarLocal,
  criarRelogio,
  esperarNaTrava,
} from '../../test/integracao.ts';
import { criarCompativel } from '../../test/solicitacoes.ts';
import { travar } from '../travas.ts';

/** O id que nada tem, para a leitura sem a solicitação. */
const NENHUM = '00000000-0000-0000-0000-000000000000';

const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;
/** A impressora sob a responsabilidade da Fernanda. */
let pat137 = '';

interface MensagemLida {
  id: string;
  especie: string;
  evento: string | null;
  autor: { nome: string };
  chamado: { numero: number; abrir: boolean } | null;
}

const abrir = (usuario: UsuarioDoChat, mensagem: string, corpo: object) =>
  c.cliente.enviar('POST', `/chat/mensagens/${mensagem}/chamado`, c.como(usuario), corpo);

const pagina = async (usuario: UsuarioDoChat, conversa: string) => {
  const r = await c.cliente.consultar(`/chat/conversas/${conversa}/mensagens`, c.como(usuario));
  expect(r.statusCode, r.body).toBe(200);
  return (r.json() as { itens: MensagemLida[] }).itens;
};

const contarChamados = () =>
  naOrganizacao(api.banco, c.org, (tx) => tx.select({ id: chamados.id }).from(chamados)).then(
    (linhas) => linhas.length,
  );

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.chat-abertura-${enderecos}.local`);
  await c.entrar();
  const impressora = await criarTipo(api, c.org, { nome: 'Impressora' });
  pat137 = await criarAtivoDoTipo(api, c.org, {
    tipoId: impressora,
    nome: 'Impressora do Financeiro',
    patrimonio: 'PAT-00137',
  });
  await naOrganizacao(api.banco, c.org, (tx) =>
    tx
      .update(ativos)
      .set({ responsavelId: c.pessoa('fernanda') })
      .where(eq(ativos.id, pat137)),
  );
});

/** A mensagem de Paulo na Equipe Financeiro, com um PDF anexo. */
async function mensagemDoPaulo() {
  const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
  const enviado = await c.cliente.enviarBytes(
    'POST',
    `/chat/anexos?nome=${encodeURIComponent('folha manchada.pdf')}`,
    c.como('paulo'),
    PDF('folha manchada'),
  );
  expect(enviado.statusCode, enviado.body).toBe(201);
  const arquivo = (enviado.json() as { id: string }).id;
  const escrita = await c.cliente.enviar(
    'POST',
    `/chat/conversas/${equipe}/mensagens`,
    c.como('paulo'),
    { texto: 'A impressora do Financeiro está manchando as folhas.', anexos: [arquivo] },
  );
  expect(escrita.statusCode, escrita.body).toBe(201);
  return { equipe, arquivo, mensagem: (escrita.json() as { id: string }).id };
}

const impressoraPara = (pessoa: UsuarioDoChat) => ({
  tipo: c.tipos.Impressora,
  titulo: 'Impressora manchando',
  pessoa: c.pessoa(pessoa),
  ativo: pat137,
});

describe('a abertura pelo chat', () => {
  it('sem chamados.pedir, fora da conversa e com o tipo só da TI, nada é gravado', async () => {
    const { mensagem } = await mensagemDoPaulo();
    const antes = await contarChamados();

    // A Ana, da TI, usa o chat sem o chamados.pedir.
    for (const r of [
      await abrir('ana', mensagem, impressoraPara('ana')),
      await c.cliente.consultar('/chat/chamados/tipos', c.como('ana')),
      await c.cliente.consultar(
        `/chat/chamados/sugestoes?tipo=${c.tipos.Impressora}&pessoa=${c.pessoa('ana')}`,
        c.como('ana'),
      ),
    ]) {
      expect(r.statusCode, r.body).toBe(403);
    }

    // A Fernanda não participa da direta do Paulo com a Tatiana.
    const direta = await c.criarDireta('paulo', 'tatiana');
    const daDireta = await c.mensagem(direta, 'paulo', 'Só entre nós.');
    const fora = await abrir('fernanda', daDireta, impressoraPara('fernanda'));
    expect(fora.statusCode).toBe(404);
    expect(fora.json()).toMatchObject({ detail: 'A mensagem não foi encontrada.' });

    const soDaTi = await abrir('fernanda', mensagem, {
      ...impressoraPara('fernanda'),
      tipo: c.tipos['Troca de equipamento'],
    });
    expect(soDaTi.statusCode).toBe(400);
    expect(soDaTi.json()).toMatchObject({
      campos: { tipo: 'Esse tipo não está disponível para abrir pelo chat.' },
    });
    expect(await contarChamados()).toBe(antes);
  });

  it('os tipos e os sugeridos que a abertura lê, só com o id, o nome e o patrimônio', async () => {
    const tipos = await c.cliente.consultar('/chat/chamados/tipos', c.como('fernanda'));
    expect(tipos.statusCode, tipos.body).toBe(200);
    const nomes = (tipos.json() as { itens: { nome: string }[] }).itens.map(({ nome }) => nome);
    expect(nomes).toContain('Impressora');
    expect(nomes).toContain('Outro');
    expect(nomes).not.toContain('Troca de equipamento');

    const sugestoes = await c.cliente.consultar(
      `/chat/chamados/sugestoes?tipo=${c.tipos.Impressora}&pessoa=${c.pessoa('fernanda')}`,
      c.como('fernanda'),
    );
    expect(sugestoes.statusCode, sugestoes.body).toBe(200);
    expect(sugestoes.json()).toEqual({
      ativos: [{ id: pat137, nome: 'Impressora do Financeiro', patrimonio: 'PAT-00137' }],
    });
  });

  it('transformar a mensagem do Paulo: a origem, o ativo, os anexos, o evento e a marca', async () => {
    const escritaEm = api.relogio.agora().toISOString();
    const { equipe, arquivo, mensagem } = await mensagemDoPaulo();
    api.relogio.avancar(13 * 60 * 1000);
    const r = await abrir('fernanda', mensagem, impressoraPara('fernanda'));
    expect(r.statusCode, r.body).toBe(201);
    const { numero } = r.json() as { numero: number };

    const [chamado] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx.select().from(chamados).where(eq(chamados.numero, numero)),
    );
    expect(chamado).toMatchObject({
      titulo: 'Impressora manchando',
      origem: 'chat',
      origemConversaId: equipe,
      origemMensagemId: mensagem,
      pessoaId: c.pessoa('fernanda'),
      abertoPor: c.conta('fernanda'),
      ativoId: pat137,
      respostas: { impressora: pat137 },
      primeiraRespostaEm: null,
    });

    const linhas = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select()
        .from(mensagensDosChamados)
        .where(eq(mensagensDosChamados.chamadoId, chamado?.id ?? ''))
        .orderBy(asc(mensagensDosChamados.criadaEm), asc(mensagensDosChamados.id)),
    );
    const abertura = linhas.find((linha) => linha.evento === 'abertura');
    expect(abertura?.dados).toEqual({ para: chamado?.responsavelId ?? null });
    const origem = linhas.find((linha) => linha.especie === 'origem');
    expect(origem).toMatchObject({
      texto: 'A impressora do Financeiro está manchando as folhas.',
      autorConta: c.conta('paulo'),
      dados: { conversa: equipe, mensagem, em: escritaEm },
    });
    const copiados = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select()
        .from(anexosDosChamados)
        .where(eq(anexosDosChamados.chamadoId, chamado?.id ?? '')),
    );
    expect(copiados).toEqual([
      expect.objectContaining({ arquivoId: arquivo, mensagemId: origem?.id, campoId: null }),
    ]);
    const [registro] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.acao, 'chamado.aberto'), eq(auditoria.alvoId, chamado?.id ?? ''))),
    );
    expect(registro?.depois).toMatchObject({ numero, origem: 'chat' });

    // O Paulo, que não participa do chamado nem o vê com chamados.ver, vê a marca e o evento sem o
    // "Abrir chamado"; a Fernanda, que o abriu, com ele. O evento cita a mensagem de origem.
    const doPaulo = await pagina('paulo', equipe);
    expect(doPaulo.map(({ especie, evento, chamado }) => ({ especie, evento, chamado }))).toEqual([
      {
        especie: 'mensagem',
        evento: null,
        chamado: { numero, abrir: false, mensagem, mensagens: 1 },
      },
      {
        especie: 'evento',
        evento: 'virou-chamado',
        chamado: { numero, abrir: false, mensagem, mensagens: 1 },
      },
    ]);
    expect(doPaulo[1]?.autor.nome).toBe('Fernanda Rocha');
    expect((await pagina('fernanda', equipe)).map(({ chamado }) => chamado)).toEqual([
      { numero, abrir: true, mensagem, mensagens: 1 },
      { numero, abrir: true, mensagem, mensagens: 1 },
    ]);
  });

  it('a segunda abertura da mesma mensagem é recusada, também ao mesmo tempo', async () => {
    const { mensagem } = await mensagemDoPaulo();
    let preso: () => void = () => {};
    const travado = new Promise<void>((resolve) => {
      preso = resolve;
    });
    let soltar: () => void = () => {};
    const segurando = naOrganizacao(api.banco, c.org, async (tx) => {
      await travar(tx, `mensagem:${mensagem}`);
      preso();
      await new Promise<void>((resolve) => {
        soltar = resolve;
      });
    });
    await travado;
    const daFernanda = abrir('fernanda', mensagem, impressoraPara('fernanda'));
    const daTatiana = abrir('tatiana', mensagem, {
      ...impressoraPara('tatiana'),
      tipo: c.tipos.Outro,
      ativo: null,
    });
    await esperarNaTrava(api, 2);
    soltar();
    await segurando;
    const respostas = [await daFernanda, await daTatiana];
    expect(respostas.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    const aberta = respostas.find(({ statusCode }) => statusCode === 201)?.json() as {
      numero: number;
    };
    expect(respostas.find(({ statusCode }) => statusCode === 409)?.json()).toMatchObject({
      detail: `Esta mensagem já virou o chamado #${aberta.numero}.`,
    });
    const deNovo = await abrir('paulo', mensagem, { ...impressoraPara('paulo'), ativo: null });
    expect(deNovo.statusCode).toBe(409);
  });

  it('no nome de outra pessoa, e o tipo que pede o ativo sem nenhum sugerido', async () => {
    const { mensagem } = await mensagemDoPaulo();
    // O campo "Qual computador?" aceita só os computadores, e a Fernanda não tem nenhum.
    const computador = await criarTipo(api, c.org, { nome: 'Computador' });
    await naOrganizacao(api.banco, c.org, async (tx) => {
      const [tipo] = await tx
        .select({ formulario: tiposDeChamado.formulario })
        .from(tiposDeChamado)
        .where(eq(tiposDeChamado.id, c.tipos.Computador ?? ''));
      const formulario = tipo?.formulario as { campos: { id: string; tiposDeAtivo: string[] }[] };
      for (const campo of formulario.campos) {
        if (campo.id === 'computador') campo.tiposDeAtivo = [computador];
      }
      await tx
        .update(tiposDeChamado)
        .set({ formulario })
        .where(eq(tiposDeChamado.id, c.tipos.Computador ?? ''));
    });
    const semComputador = await abrir('fernanda', mensagem, {
      tipo: c.tipos.Computador,
      titulo: 'O computador não liga',
      pessoa: c.pessoa('fernanda'),
      ativo: null,
    });
    expect(semComputador.statusCode).toBe(400);
    expect(semComputador.json()).toMatchObject({
      campos: {
        ativo:
          'Nenhum ativo desse tipo está com Fernanda Rocha ou no local dela. Escolha outro tipo ou escreva à TI.',
      },
    });

    const r = await abrir('fernanda', mensagem, {
      tipo: c.tipos.Outro,
      titulo: 'A cadeira da Tatiana quebrou',
      pessoa: c.pessoa('tatiana'),
      ativo: null,
    });
    expect(r.statusCode, r.body).toBe(201);
    const [chamado] = await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .select()
        .from(chamados)
        .where(eq(chamados.numero, (r.json() as { numero: number }).numero)),
    );
    expect(chamado).toMatchObject({
      pessoaId: c.pessoa('tatiana'),
      abertoPor: c.conta('fernanda'),
      ativoId: null,
      respostas: {},
    });
  });

  it('a solicitação que o tipo gera, também a quem não vê os ativos nem o estoque', async () => {
    // A impressora a laser da Fernanda, que usa os consumíveis; a Fernanda não tem o ativos.ver.
    const comToner = await criarTipo(api, c.org, {
      nome: 'Impressora a laser',
      capacidades: ['consumiveis.compatibilidade'],
    });
    const modelo = await criarModelo(api, c.org, { tipoId: comToner, nome: 'LaserJet M404' });
    await criarCompativel(api, c.org, { codigo: 'CF258A', cor: 'preto', modeloId: modelo });
    const laser = await criarAtivoDoTipo(api, c.org, {
      tipoId: comToner,
      modeloId: modelo,
      patrimonio: 'PAT-00150',
    });
    const financeiro = await criarLocal(api, c.org, { nome: 'Financeiro' });
    await naOrganizacao(api.banco, c.org, async (tx) => {
      await tx
        .update(ativos)
        .set({ responsavelId: c.pessoa('fernanda') })
        .where(eq(ativos.id, laser));
      await tx
        .update(pessoas)
        .set({ localId: financeiro })
        .where(eq(pessoas.id, c.pessoa('fernanda')));
      // O Outro passa a gerar o equipamento, um computador a laser para o local da pessoa.
      await tx
        .update(tiposDeChamado)
        .set({ geraSolicitacao: 'equipamento', tipoDeAtivoDoEquipamento: comToner })
        .where(eq(tiposDeChamado.id, c.tipos.Outro ?? ''));
    });

    const daSolicitacao = async (numero: number) =>
      naOrganizacao(api.banco, c.org, async (tx) => {
        const [chamado] = await tx.select().from(chamados).where(eq(chamados.numero, numero));
        const eventos = await tx
          .select({ evento: mensagensDosChamados.evento, dados: mensagensDosChamados.dados })
          .from(mensagensDosChamados)
          .where(eq(mensagensDosChamados.chamadoId, chamado?.id ?? ''));
        const [solicitacao] = await tx
          .select()
          .from(solicitacoes)
          .where(eq(solicitacoes.id, chamado?.solicitacaoId ?? NENHUM));
        const impressoras = await tx
          .select({ ativoId: impressorasDasSolicitacoes.ativoId })
          .from(impressorasDasSolicitacoes)
          .where(eq(impressorasDasSolicitacoes.solicitacaoId, solicitacao?.id ?? NENHUM));
        return {
          eventos: eventos.flatMap(({ evento, dados }) =>
            evento?.startsWith('solicitacao') ? [{ evento, dados }] : [],
          ),
          solicitacao,
          impressoras: impressoras.map(({ ativoId }) => ativoId),
        };
      });

    const { mensagem } = await mensagemDoPaulo();
    const toner = await abrir('fernanda', mensagem, {
      tipo: c.tipos.Toner,
      titulo: 'Acabou o toner',
      pessoa: c.pessoa('fernanda'),
      ativo: laser,
    });
    expect(toner.statusCode, toner.body).toBe(201);
    const doToner = await daSolicitacao((toner.json() as { numero: number }).numero);
    expect(doToner.eventos).toEqual([
      { evento: 'solicitacao', dados: { numero: doToner.solicitacao?.numero, como: 'gerou' } },
    ]);
    expect(doToner.solicitacao).toMatchObject({ tipo: 'toner', pessoaId: c.pessoa('fernanda') });
    expect(doToner.impressoras).toEqual([laser]);

    const outra = await c.mensagem(await c.criarDireta('fernanda', 'paulo'), 'fernanda');
    const equipamento = await abrir('fernanda', outra, {
      tipo: c.tipos.Outro,
      titulo: 'Preciso de uma impressora',
      pessoa: c.pessoa('fernanda'),
      ativo: null,
    });
    expect(equipamento.statusCode, equipamento.body).toBe(201);
    const doEquipamento = await daSolicitacao((equipamento.json() as { numero: number }).numero);
    expect(doEquipamento.eventos.map(({ evento }) => evento)).toEqual(['solicitacao']);
    expect(doEquipamento.solicitacao).toMatchObject({
      tipo: 'equipamento',
      tipoDeAtivoId: comToner,
      localId: financeiro,
    });
  });

  it('os sugeridos vêm todos, sem o teto da TI, e o último também se escolhe', async () => {
    // Onze impressoras na sala da Fernanda, sem responsável, além da PAT-00137, que é dela.
    const sala = await criarLocal(api, c.org, { nome: 'Sala 3' });
    const impressora = await criarTipo(api, c.org, { nome: 'Impressora da sala' });
    const daSala: string[] = [];
    for (let indice = 1; indice <= 11; indice += 1) {
      daSala.push(
        await criarAtivoDoTipo(api, c.org, {
          tipoId: impressora,
          patrimonio: `SALA-${String(indice).padStart(2, '0')}`,
          localId: sala,
        }),
      );
    }
    await naOrganizacao(api.banco, c.org, (tx) =>
      tx
        .update(pessoas)
        .set({ localId: sala })
        .where(eq(pessoas.id, c.pessoa('fernanda'))),
    );
    const sugestoes = await c.cliente.consultar(
      `/chat/chamados/sugestoes?tipo=${c.tipos.Impressora}&pessoa=${c.pessoa('fernanda')}`,
      c.como('fernanda'),
    );
    expect(sugestoes.statusCode, sugestoes.body).toBe(200);
    const ids = (sugestoes.json() as { ativos: { id: string }[] }).ativos.map(({ id }) => id);
    expect(ids).toEqual([pat137, ...daSala]);

    const { mensagem } = await mensagemDoPaulo();
    const r = await abrir('fernanda', mensagem, {
      ...impressoraPara('fernanda'),
      ativo: daSala.at(-1),
    });
    expect(r.statusCode, r.body).toBe(201);
  });

  it('a abertura pela TI guarda quem nasce atendendo no para', async () => {
    const numero = await c.abrirChamado('fernanda');
    const [evento] = await naOrganizacao(api.banco, c.org, async (tx) => {
      const [chamado] = await tx
        .select({ id: chamados.id })
        .from(chamados)
        .where(eq(chamados.numero, numero));
      return tx
        .select({ dados: mensagensDosChamados.dados })
        .from(mensagensDosChamados)
        .where(
          and(
            eq(mensagensDosChamados.chamadoId, chamado?.id ?? ''),
            eq(mensagensDosChamados.evento, 'abertura'),
          ),
        );
    });
    expect(evento?.dados).toEqual({ para: c.conta('ana') });
  });
});

describe('o anexo sem dono dos chamados', () => {
  it('quem só usa o chat envia e baixa o seu; quem não usa nem atende, não', async () => {
    const enviado = await c.cliente.enviarBytes(
      'POST',
      `/chamados/anexos?nome=${encodeURIComponent('nota fiscal.pdf')}`,
      c.como('fernanda'),
      PDF('nota fiscal'),
    );
    expect(enviado.statusCode, enviado.body).toBe(201);
    const { id } = enviado.json() as { id: string };
    const baixado = await c.cliente.consultar(`/chamados/anexos/${id}`, c.como('fernanda'));
    expect(baixado.statusCode).toBe(200);

    const recusado = await c.cliente.enviarBytes(
      'POST',
      `/chamados/anexos?nome=${encodeURIComponent('nota fiscal.pdf')}`,
      c.como('rita'),
      PDF('nota fiscal'),
    );
    expect(recusado.statusCode).toBe(403);
  });
});
