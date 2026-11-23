// A miniatura do anexo de imagem (spec arquivos-e-imagens, "Miniatura do anexo de imagem", "Anexos
// do chat" e "Anexos dos chamados"; change chat-com-chamados, design, decisão 15; tarefa 4.20): a de
// 512 px, gerada no envio, com a largura e a altura dela nas conversas; a entrega à mesma gente do
// anexo, pela conversa do chat, pelo chamado na TI e pelo chamado no chat, sem a da nota; o arquivo,
// que baixa como chegou; a imagem que fica sem ela; a abertura pelo chat, que a leva junto; e a
// remoção, que a tira do armazenamento. A permissão vem antes.
import { naOrganizacao } from '@grafite/db';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChatDeTeste, montarChat, type UsuarioDoChat } from '../../test/chat.ts';
import { imagemDeTeste, pngQueDeclara, temLocalizacao } from '../../test/imagens.ts';
import { type ApiDeTeste, abrirApi, criarRelogio } from '../../test/integracao.ts';
import { chaveDoArquivo } from '../arquivos/armazenamento.ts';
import { removerAnexosDoChatEsquecidos } from '../chat/anexos.ts';
import { tarefasDaManutencao } from '../fila/manutencao.ts';

const HORA = 60 * 60_000;
const PDF = (texto: string) => Buffer.from(`%PDF-1.7\n% ${texto}\n%%EOF\n`);
const DO_PRINT = { largura: 512, altura: 288 };

let api: ApiDeTeste;
let c: ChatDeTeste;
let enderecos = 0;

interface AnexoLido {
  id: string;
  tipo: string;
  miniatura: { largura: number; altura: number } | null;
}

const print = () => imagemDeTeste(1920, 1080).png().toBuffer();

/** Envia o arquivo pelo chat ou pelos chamados e devolve o id, que a mensagem toma. */
async function anexo(
  rota: 'chat' | 'chamados',
  usuario: UsuarioDoChat,
  nome: string,
  conteudo: Buffer,
) {
  const r = await c.cliente.enviarBytes(
    'POST',
    `/${rota}/anexos?nome=${encodeURIComponent(nome)}`,
    c.como(usuario),
    conteudo,
  );
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string }).id;
}

const consultar = (usuario: UsuarioDoChat, caminho: string) =>
  c.cliente.consultar(caminho, c.como(usuario));

const escrever = async (usuario: UsuarioDoChat, conversa: string, corpo: object) => {
  const r = await c.cliente.enviar(
    'POST',
    `/chat/conversas/${conversa}/mensagens`,
    c.como(usuario),
    corpo,
  );
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; anexos: AnexoLido[] };
};

const daTi = (acao: 'mensagem' | 'nota', numero: number, corpo: object) =>
  c.cliente.enviar('POST', `/chamados/${numero}/${acao}`, c.como('ana'), corpo);

/** A miniatura entregue, para exibir na página, em WebP; devolve os metadados dela. */
async function miniaturaEntregue(usuario: UsuarioDoChat, caminho: string) {
  const r = await consultar(usuario, caminho);
  expect(r.statusCode, `${usuario} ${caminho}`).toBe(200);
  expect(r.headers['content-type']).toBe('image/webp');
  expect(r.headers['content-disposition']).toBe('inline');
  return sharp(r.rawPayload).metadata();
}

/** A recusa como o que não existe: o arquivo, ou o chamado, a quem não participa dele. */
async function recusada(
  usuario: UsuarioDoChat,
  caminho: string,
  detalhe = 'Arquivo não encontrado.',
) {
  const r = await consultar(usuario, caminho);
  expect(r.statusCode, `${usuario} ${caminho}`).toBe(404);
  expect(r.json()).toMatchObject({ detail: detalhe });
}

/** Os anexos das mensagens e das notas da ficha do chamado, na TI. */
async function anexosDaFicha(numero: number) {
  const r = await consultar('ana', `/chamados/${numero}`);
  expect(r.statusCode, r.body).toBe(200);
  const ficha = r.json() as {
    conversa: { anexos?: AnexoLido[] }[];
    origemNoChat: { anexos: AnexoLido[] } | null;
  };
  return {
    conversa: ficha.conversa.flatMap(({ anexos = [] }) => anexos),
    origem: ficha.origemNoChat?.anexos ?? [],
  };
}

/** O chamado como quem participa o lê no chat. */
async function lidoNoChat(usuario: UsuarioDoChat, numero: number) {
  const r = await consultar(usuario, `/chat/chamados/${numero}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as {
    origem: { anexos: AnexoLido[] } | null;
    conversa: { especie: string; anexos?: AnexoLido[] }[];
  };
}

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(new Date('2026-11-17T13:19:00.000Z')) });
  return () => api.fechar();
});

beforeEach(async () => {
  enderecos += 1;
  c = await montarChat(api, `grafite.anexos-miniatura-${enderecos}.local`);
  await c.entrar();
});

describe('no chat', () => {
  it('o print ganha a de 512 × 288, que vai a quem participa da conversa, e baixa como foi enviado', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const canal = await c.criarCanal('Geral');
    const conteudo = await print();
    const foto = await anexo('chat', 'paulo', 'print.png', conteudo);
    const folha = await anexo('chat', 'paulo', 'folha.pdf', PDF('folha'));
    const esperados = [
      { id: foto, tipo: 'image/png', miniatura: DO_PRINT },
      { id: folha, tipo: 'application/pdf', miniatura: null },
    ];
    expect(await escrever('paulo', equipe, { anexos: [foto, folha] })).toMatchObject({
      anexos: esperados,
    });
    expect(
      (await consultar('fernanda', `/chat/conversas/${equipe}/mensagens`)).json(),
    ).toMatchObject({ itens: [{ anexos: esperados }] });

    const metadados = await miniaturaEntregue(
      'fernanda',
      `/chat/conversas/${equipe}/anexos/${foto}/miniatura`,
    );
    expect(metadados).toMatchObject({ format: 'webp', width: 512, height: 288 });
    const baixado = await consultar('fernanda', `/chat/conversas/${equipe}/anexos/${foto}`);
    expect(baixado.statusCode).toBe(200);
    expect(baixado.headers['content-type']).toBe('image/png');
    expect(baixado.rawPayload.equals(conteudo)).toBe(true);

    // Pelo canal, a quem não é da equipe e a quem saiu dela, a miniatura não existe, nem a do PDF.
    await recusada('fernanda', `/chat/conversas/${canal}/anexos/${foto}/miniatura`);
    await recusada('ana', `/chat/conversas/${equipe}/anexos/${foto}/miniatura`);
    await recusada('fernanda', `/chat/conversas/${equipe}/anexos/${folha}/miniatura`);
    await c.sairDoGrupo('tatiana', c.grupos.financeiro);
    await recusada('tatiana', `/chat/conversas/${equipe}/anexos/${foto}/miniatura`);
  });

  it('a foto de lado com a localização: a miniatura de pé e sem metadados, e o arquivo como chegou', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const conteudo = await imagemDeTeste(300, 100)
      .jpeg()
      .withExif({
        IFD0: { Make: 'Celular', Model: 'X1' },
        IFD3: {
          GPSLatitudeRef: 'S',
          GPSLatitude: '23/1 33/1 0/1',
          GPSLongitudeRef: 'W',
          GPSLongitude: '46/1 38/1 0/1',
        },
      })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const foto = await anexo('chat', 'paulo', 'folha-manchada.jpg', conteudo);
    expect(await escrever('paulo', equipe, { texto: 'A folha.', anexos: [foto] })).toMatchObject({
      anexos: [{ id: foto, miniatura: { largura: 100, altura: 300 } }],
    });

    const metadados = await miniaturaEntregue(
      'fernanda',
      `/chat/conversas/${equipe}/anexos/${foto}/miniatura`,
    );
    expect(metadados).toMatchObject({ width: 100, height: 300 });
    expect(metadados.exif).toBeUndefined();
    expect(metadados.xmp).toBeUndefined();
    expect(metadados.icc).toBeUndefined();
    expect(metadados.orientation).toBeUndefined();
    const baixado = await consultar('fernanda', `/chat/conversas/${equipe}/anexos/${foto}`);
    expect(baixado.rawPayload.equals(conteudo)).toBe(true);
    expect(temLocalizacao((await sharp(baixado.rawPayload).metadata()).exif)).toBe(true);
  });

  it('a imagem que não se lê e a de mais de 50 megapixels entram sem a miniatura', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const png = await imagemDeTeste(300, 200).png().toBuffer();
    const cortada = await anexo(
      'chat',
      'paulo',
      'cortada.png',
      png.subarray(0, Math.floor(png.length / 2)),
    );
    const gigante = await anexo('chat', 'paulo', 'gigante.png', await pngQueDeclara(10_000, 5_001));
    expect(await escrever('paulo', equipe, { anexos: [cortada, gigante] })).toMatchObject({
      anexos: [
        { id: cortada, tipo: 'image/png', miniatura: null },
        { id: gigante, tipo: 'image/png', miniatura: null },
      ],
    });
    for (const arquivo of [cortada, gigante]) {
      await recusada('fernanda', `/chat/conversas/${equipe}/anexos/${arquivo}/miniatura`);
      const baixado = await consultar('fernanda', `/chat/conversas/${equipe}/anexos/${arquivo}`);
      expect(baixado.statusCode).toBe(200);
    }
  });

  it('o anexo removido leva a miniatura junto, na manutenção', async () => {
    const foto = await anexo('chat', 'paulo', 'print.png', await print());
    const chaves = [chaveDoArquivo(c.org, foto, 'completa'), chaveDoArquivo(c.org, foto, '512')];
    for (const chave of chaves) expect(await api.armazenamento.abrir(chave)).not.toBeNull();

    api.relogio.avancar(25 * HORA);
    const removidos = await naOrganizacao(api.banco, c.org, (tx) =>
      removerAnexosDoChatEsquecidos(tx, api.relogio.agora()),
    );
    expect(removidos).toBe(1);
    const tarefa = tarefasDaManutencao({
      banco: api.banco,
      armazenamento: api.armazenamento,
      agora: api.relogio.agora,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      enviar: vi.fn(async () => null),
    }).find(({ nome }) => nome === 'manutencao');
    await tarefa?.trabalho(
      { orgId: c.org },
      { tarefaId: 't', tentativa: 0, sinal: new AbortController().signal },
    );
    for (const chave of chaves) expect(await api.armazenamento.abrir(chave)).toBeNull();
  });
});

describe('nos chamados', () => {
  it('a imagem da mensagem e a da nota: a TI vê as duas, e quem participa só a da mensagem', async () => {
    const numero = await c.abrirChamado('fernanda');
    const daMensagem = await anexo('chamados', 'ana', 'print.png', await print());
    const daNota = await anexo(
      'chamados',
      'ana',
      'orçamento.png',
      await imagemDeTeste(400, 300).png().toBuffer(),
    );
    for (const r of [
      await daTi('mensagem', numero, { texto: 'É esta a tela?', anexos: [daMensagem] }),
      await daTi('nota', numero, { anexos: [daNota] }),
    ]) {
      expect(r.statusCode, r.body).toBe(200);
    }

    expect((await anexosDaFicha(numero)).conversa).toMatchObject([
      { id: daMensagem, miniatura: DO_PRINT },
      { id: daNota, miniatura: { largura: 400, altura: 300 } },
    ]);
    for (const [arquivo, largura, altura] of [
      [daMensagem, 512, 288],
      [daNota, 400, 300],
    ] as const) {
      const metadados = await miniaturaEntregue(
        'ana',
        `/chamados/${numero}/anexos/${arquivo}/miniatura`,
      );
      expect(metadados).toMatchObject({ format: 'webp', width: largura, height: altura });
    }

    const lido = await lidoNoChat('fernanda', numero);
    expect(lido.conversa.flatMap(({ anexos = [] }) => anexos)).toMatchObject([
      { id: daMensagem, miniatura: DO_PRINT },
    ]);
    const metadados = await miniaturaEntregue(
      'fernanda',
      `/chat/chamados/${numero}/anexos/${daMensagem}/miniatura`,
    );
    expect(metadados).toMatchObject({ width: 512, height: 288 });
    await recusada('fernanda', `/chat/chamados/${numero}/anexos/${daNota}/miniatura`);
    await recusada(
      'paulo',
      `/chat/chamados/${numero}/anexos/${daMensagem}/miniatura`,
      'Chamado não encontrado.',
    );
  });

  it('a abertura pelo chat leva a miniatura da mensagem citada', async () => {
    const equipe = await c.criarEquipe('Equipe Financeiro', c.grupos.financeiro);
    const foto = await anexo('chat', 'paulo', 'print.png', await print());
    const mensagem = await escrever('paulo', equipe, {
      texto: 'O sistema travou nesta tela.',
      anexos: [foto],
    });
    const aberto = await c.cliente.enviar(
      'POST',
      `/chat/mensagens/${mensagem.id}/chamado`,
      c.como('fernanda'),
      {
        tipo: c.tipos.Outro,
        titulo: 'O sistema travou',
        pessoa: c.pessoa('fernanda'),
        ativo: null,
      },
    );
    expect(aberto.statusCode, aberto.body).toBe(201);
    const { numero } = aberto.json() as { numero: number };

    expect((await anexosDaFicha(numero)).origem).toMatchObject([{ id: foto, miniatura: DO_PRINT }]);
    expect(
      await miniaturaEntregue('ana', `/chamados/${numero}/anexos/${foto}/miniatura`),
    ).toMatchObject({ width: 512, height: 288 });
    expect((await lidoNoChat('fernanda', numero)).origem?.anexos).toMatchObject([
      { id: foto, miniatura: DO_PRINT },
    ]);
    expect(
      await miniaturaEntregue('fernanda', `/chat/chamados/${numero}/anexos/${foto}/miniatura`),
    ).toMatchObject({ width: 512, height: 288 });
  });
});
