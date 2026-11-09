// O caminho comum das imagens dos registros (design do P1a, decisão 6), com um dono de teste que
// guarda a imagem na memória: o arquivo registrado e gravado, a anterior marcada como removida, a
// auditoria pedida ao dono, e a limpeza do armazenamento quando a transação falha.
import { arquivos, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imagemDeTeste } from '../../test/imagens.ts';
import { type ApiDeTeste, abrirApi, criarConta, criarOrganizacao } from '../../test/integracao.ts';
import type { Armazenamento } from './armazenamento.ts';
import {
  type ImagemDoRegistro,
  type MudancaDaImagem,
  type QuemMuda,
  tirarImagem,
  trocarImagem,
} from './imagem-do-registro.ts';

let api: ApiDeTeste;
let quem: QuemMuda;

/** O armazenamento na memória, com as chaves à vista. */
function armazenamentoAberto() {
  const conteudos = new Map<string, Buffer>();
  const armazenamento: Armazenamento = {
    gravar: async (chave, conteudo) => void conteudos.set(chave, conteudo),
    abrir: async (chave) => conteudos.get(chave) ?? null,
    apagar: async (chave) => void conteudos.delete(chave),
  };
  return { armazenamento, chaves: () => [...conteudos.keys()].sort() };
}

/** Um dono que guarda a imagem na memória e anota o que auditou. */
function donoDeTeste(falharAoApontar = false) {
  const estado = { imagemId: null as string | null, auditadas: [] as MudancaDaImagem[] };
  const registro: ImagemDoRegistro<{ imagemId: string | null }> = {
    conferir: async () => ({ imagemId: estado.imagemId }),
    async apontar(_tx, _dono, imagemId) {
      if (falharAoApontar) throw new Error('falha do teste');
      estado.imagemId = imagemId;
    },
    async auditar(_tx, _dono, mudanca) {
      estado.auditadas.push(mudanca);
    },
  };
  return { estado, registro };
}

const png = () => imagemDeTeste(300, 200).png().toBuffer();
const nada = async () => null;

const removidoEm = (id: string) =>
  naOrganizacao(api.banco, quem.orgId, async (tx) => {
    const [linha] = await tx
      .select({ removidoEm: arquivos.removidoEm })
      .from(arquivos)
      .where(eq(arquivos.id, id));
    return linha?.removidoEm;
  });

beforeAll(async () => {
  api = await abrirApi();
  const orgId = await criarOrganizacao(api, {
    nome: 'Empresa',
    enderecos: ['grafite.imagens.local'],
  });
  const { id: contaId } = await criarConta(api, orgId, { usuario: 'ana', nome: 'Ana Souza' });
  quem = { orgId, contaId, log: { warn: () => {} } };
});

afterAll(async () => {
  await api?.fechar();
});

describe('trocarImagem', () => {
  it('grava as variantes, registra o arquivo, aponta o dono e marca a anterior como removida', async () => {
    const { armazenamento, chaves } = armazenamentoAberto();
    const deps = { banco: api.banco, agora: () => new Date(), armazenamento };
    const { estado, registro } = donoDeTeste();

    await trocarImagem(deps, quem, registro, { conteudo: await png(), responder: nada });
    const primeira = estado.imagemId ?? '';
    expect(chaves()).toEqual(
      ['128', '256', '512', '64', 'completa'].map((v) => `${quem.orgId}/${primeira}/${v}`).sort(),
    );

    await trocarImagem(deps, quem, registro, { conteudo: await png(), responder: nada });
    const segunda = estado.imagemId ?? '';
    expect(segunda).not.toBe(primeira);
    expect(await removidoEm(primeira)).toBeInstanceOf(Date);
    expect(await removidoEm(segunda)).toBeNull();
    expect(estado.auditadas).toEqual([
      { arquivoId: primeira, anteriorId: null },
      { arquivoId: segunda, anteriorId: primeira },
    ]);
  });

  it('a transação que falha apaga as variantes gravadas e não registra o arquivo', async () => {
    const { armazenamento, chaves } = armazenamentoAberto();
    const deps = { banco: api.banco, agora: () => new Date(), armazenamento };
    const { estado, registro } = donoDeTeste(true);
    const antes = await naOrganizacao(api.banco, quem.orgId, (tx) =>
      tx.select({ id: arquivos.id }).from(arquivos),
    );

    await expect(
      trocarImagem(deps, quem, registro, { conteudo: await png(), responder: nada }),
    ).rejects.toThrow('falha do teste');

    expect(chaves()).toEqual([]);
    expect(estado.auditadas).toEqual([]);
    const depois = await naOrganizacao(api.banco, quem.orgId, (tx) =>
      tx.select({ id: arquivos.id }).from(arquivos),
    );
    expect(depois).toEqual(antes);
  });
});

describe('tirarImagem', () => {
  it('tira a imagem do dono e a marca como removida; sem imagem, não audita', async () => {
    const { armazenamento } = armazenamentoAberto();
    const deps = { banco: api.banco, agora: () => new Date(), armazenamento };
    const { estado, registro } = donoDeTeste();
    await trocarImagem(deps, quem, registro, { conteudo: await png(), responder: nada });
    const imagem = estado.imagemId ?? '';

    await tirarImagem(deps, quem, registro, { responder: nada });
    expect(estado.imagemId).toBeNull();
    expect(await removidoEm(imagem)).toBeInstanceOf(Date);

    await tirarImagem(deps, quem, registro, { responder: nada });
    expect(estado.auditadas).toEqual([
      { arquivoId: imagem, anteriorId: null },
      { arquivoId: null, anteriorId: imagem },
    ]);
  });
});
