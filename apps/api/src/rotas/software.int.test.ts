// A base de software pela API (spec distribuicao-de-software, "Base de software"; change
// distribuicao-de-software): o cadastro conferido, o nome repetido, a edição, a inativação, o
// arquivo em partes gzip com os SHA-512 (a troca apaga as partes que sobram) e as permissões.
import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { auditoria, naOrganizacao, partesDosPacotes } from '@grafite/db';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { chaveDaParteDoPacote } from '../arquivos/armazenamento.ts';

const host = 'grafite.software.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
let pacote = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const sha512 = (conteudo: Buffer) => createHash('sha512').update(conteudo).digest('hex');

const enviarArquivo = (usuario: string, id: string, nome: string, conteudo: Buffer) => {
  const { cookie, csrf } = como(usuario);
  return api.app.inject({
    method: 'PUT',
    url: `/software/pacotes/${id}/arquivo?nome=${encodeURIComponent(nome)}`,
    headers: {
      host,
      cookie,
      'x-grafite-csrf': csrf,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/octet-stream',
    },
    payload: conteudo,
  });
};

const partes = () =>
  naOrganizacao(api.banco, org, (tx) =>
    tx
      .select()
      .from(partesDosPacotes)
      .where(eq(partesDosPacotes.pacoteId, pacote))
      .orderBy(asc(partesDosPacotes.indice)),
  );

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const administra = await criarPerfil(api, org, {
    nome: 'Software',
    permissoes: ['software.administrar'],
  });
  const distribui = await criarPerfil(api, org, {
    nome: 'Distribui',
    permissoes: ['software.distribuir'],
  });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: administra, contaId: ana.id });
  const bruno = await criarConta(api, org, { usuario: 'bruno', nome: 'Bruno Costa' });
  await atribuir(api, org, { perfilId: distribui, contaId: bruno.id });
  for (const usuario of ['ana', 'bruno']) entradas[usuario] = await cliente.entrar(usuario);
});

afterAll(async () => {
  await api?.fechar();
});

describe('os pacotes', () => {
  it('Pacote cadastrado: com os códigos de fábrica, e o nome repetido é recusado', async () => {
    const r = await cliente.enviar('POST', '/software/pacotes', como('ana'), {
      nome: '7-Zip 23.01',
      versao: '23.01',
      comando: 'msiexec /i "7z2301-x64.msi" /qn /norestart',
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      nome: '7-Zip 23.01',
      codigosDeSucesso: [0, 3010],
      arquivo: null,
      situacao: 'ativo',
    });
    pacote = r.json().id;
    const repetido = await cliente.enviar('POST', '/software/pacotes', como('ana'), {
      nome: '7-zip 23.01',
      comando: 'x',
    });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().campos).toEqual({ nome: 'Já existe um pacote com este nome.' });
    const vazio = await cliente.enviar('POST', '/software/pacotes', como('ana'), {
      nome: 'Outro',
      comando: ' ',
      codigosDeSucesso: '0, x',
    });
    expect(vazio.json().campos).toEqual({
      comando: 'Informe o comando que o agente roda.',
      codigosDeSucesso: 'Informe os códigos de sucesso como números, separados por vírgula.',
    });
  });

  it('o arquivo vai em partes gzip de 8 MB, com os SHA-512; a troca apaga as partes que sobram', async () => {
    const arquivo = randomBytes(20 * 1024 * 1024);
    const r = await enviarArquivo('ana', pacote, '7z2301-x64.msi', arquivo);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().arquivo).toEqual({ nome: '7z2301-x64.msi', tamanho: arquivo.length });
    const gravadas = await partes();
    expect(gravadas.map((parte) => parte.indice)).toEqual([0, 1, 2]);
    const juntas: Buffer[] = [];
    for (const parte of gravadas) {
      const conteudo = await api.armazenamento.abrir(
        chaveDaParteDoPacote(org, pacote, parte.indice),
      );
      expect(conteudo).not.toBeNull();
      expect(sha512(conteudo ?? Buffer.alloc(0))).toBe(parte.sha512);
      juntas.push(gunzipSync(conteudo ?? Buffer.alloc(0)));
    }
    expect(Buffer.concat(juntas).equals(arquivo)).toBe(true);
    const baixado = await api.app.inject({
      method: 'GET',
      url: `/software/pacotes/${pacote}/arquivo`,
      headers: { host, cookie: como('bruno').cookie },
    });
    expect(baixado.statusCode).toBe(200);
    expect(baixado.headers['content-disposition']).toBe(
      'attachment; filename="7z2301-x64.msi"; filename*=UTF-8\'\'7z2301-x64.msi',
    );
    expect(baixado.rawPayload.equals(arquivo)).toBe(true);

    const menor = Buffer.from('instalador pequeno');
    expect((await enviarArquivo('ana', pacote, 'setup.exe', menor)).statusCode).toBe(200);
    expect((await partes()).map((parte) => parte.indice)).toEqual([0]);
    expect(await api.armazenamento.abrir(chaveDaParteDoPacote(org, pacote, 2))).toBeNull();
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'pacote.arquivo-trocado')),
    );
    expect(registros).toHaveLength(2);
  });

  it('recusa o nome do arquivo com pasta', async () => {
    const r = await enviarArquivo('ana', pacote, '../setup.exe', Buffer.from('x'));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toEqual({ arquivo: 'Informe o nome do arquivo, sem pastas.' });
  });

  it('Técnico sem a administração: vê a base, mas não cadastra nem inativa', async () => {
    const lista = await cliente.consultar('/software/pacotes', como('bruno'));
    expect(lista.json()).toMatchObject({
      pacotes: [{ nome: '7-Zip 23.01' }],
      permite: { administrar: false },
    });
    expect(
      (
        await cliente.enviar('POST', '/software/pacotes', como('bruno'), {
          nome: 'X',
          comando: 'x',
        })
      ).statusCode,
    ).toBe(403);
    const inativado = await cliente.enviar(
      'POST',
      `/software/pacotes/${pacote}/inativacao`,
      como('ana'),
    );
    expect(inativado.json().situacao).toBe('inativo');
  });
});
