// A base de software pela API (spec distribuicao-de-software, "Base de software"; change
// distribuicao-de-software): a lista para quem distribui, e o cadastro, a edição, a inativação e o
// envio do arquivo para quem administra o software, tudo na auditoria; e o arquivo inteiro, montado
// das partes, para quem vê a base.
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { type Banco, naOrganizacao, pacotesDeSoftware, partesDosPacotes } from '@grafite/db';
import {
  conferirPacote,
  LIMITE_DO_ARQUIVO_DO_PACOTE,
  MENSAGENS_DO_SOFTWARE,
  normalizarTexto,
  pode,
} from '@grafite/domain';
import { asc, eq } from 'drizzle-orm';
import type { FastifyError, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { type Armazenamento, chaveDaParteDoPacote } from '../arquivos/armazenamento.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import { nomeCodificado, nomeEmAscii } from '../ativos/arquivos-dos-campos.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  RespostaDeProblema,
} from '../problemas.ts';
import { trocarArquivoDoPacote } from '../software/pacotes.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

export const PacoteDeSoftware = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    versao: z.string().nullable(),
    descricao: z.string().nullable(),
    comando: z.string(),
    codigosDeSucesso: z.array(z.number()),
    arquivo: z.object({ nome: z.string(), tamanho: z.number() }).nullable(),
    situacao: z.enum(['ativo', 'inativo']),
  })
  .meta({ id: 'PacoteDeSoftware' });

const PedidoDePacote = z
  .object({
    nome: z.string(),
    versao: z.string().nullable().optional(),
    descricao: z.string().nullable().optional(),
    comando: z.string(),
    /** Os códigos como texto, "0, 3010", ou a lista. */
    codigosDeSucesso: z.union([z.string(), z.array(z.number())]).optional(),
  })
  .meta({ id: 'PedidoDePacote' });

const ParametrosDoPacote = z.object({ id: z.uuid({ error: 'Pacote não encontrado.' }) });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

type LinhaDoPacote = typeof pacotesDeSoftware.$inferSelect;

export const pacoteNaTela = (linha: LinhaDoPacote): z.infer<typeof PacoteDeSoftware> => ({
  id: linha.id,
  nome: linha.nome,
  versao: linha.versao,
  descricao: linha.descricao,
  comando: linha.comando,
  codigosDeSucesso: linha.codigosDeSucesso,
  arquivo:
    linha.nomeDoArquivo && linha.tamanhoDoArquivo !== null
      ? { nome: linha.nomeDoArquivo, tamanho: linha.tamanhoDoArquivo }
      : null,
  situacao: linha.situacao,
});

/** O que a auditoria guarda do pacote: sem o SHA-512, com o arquivo pelo nome. */
const visaoDoPacote = (linha: LinhaDoPacote) => ({
  nome: linha.nome,
  versao: linha.versao,
  comando: linha.comando,
  codigosDeSucesso: linha.codigosDeSucesso,
  arquivo: linha.nomeDoArquivo,
  situacao: linha.situacao,
});

/** O nome do arquivo sem pasta: até 200 caracteres, sem os proibidos no Windows nem os de controle. */
const PROIBIDOS_NO_NOME = new Set([...'\\/:*?"<>|']);
const nomeDeArquivoValido = (nome: string) =>
  nome.length >= 1 &&
  nome.length <= 200 &&
  [...nome].every((letra) => !PROIBIDOS_NO_NOME.has(letra) && letra.charCodeAt(0) >= 32);

export const rotasDaBaseDeSoftware: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  armazenamento: Armazenamento;
}> = async (app, { banco, agora, armazenamento }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';

  async function lerPacote(
    tx: Parameters<Parameters<typeof naOrganizacao>[2]>[0],
    id: string,
  ): Promise<LinhaDoPacote> {
    const [linha] = await tx.select().from(pacotesDeSoftware).where(eq(pacotesDeSoftware.id, id));
    if (!linha) throw naoEncontrado('Pacote não encontrado.');
    return linha;
  }

  app.get(
    '/software/pacotes',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'A base de software da organização, pelo nome',
        response: {
          200: z.object({
            pacotes: z.array(PacoteDeSoftware),
            permite: z.object({ administrar: z.boolean() }),
          }),
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const linhas = await naOrganizacao(banco, orgDa(requisicao), (tx) =>
        tx.select().from(pacotesDeSoftware).orderBy(asc(pacotesDeSoftware.nomeNormalizado)),
      );
      return {
        pacotes: linhas.map(pacoteNaTela),
        permite: { administrar: pode(acesso, 'software.administrar') },
      };
    },
  );

  /** Grava o pacote novo ou a mudança, com o nome único e a auditoria. */
  async function gravar(
    requisicao: FastifyRequest,
    pedido: z.infer<typeof PedidoDePacote>,
    id?: string,
  ) {
    const { contaId } = sessaoDa(requisicao);
    const conferido = conferirPacote(pedido);
    if (!conferido.ok) throw dadosInvalidos(conferido.erros as Record<string, string>);
    const { dados } = conferido;
    const momento = agora();
    return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
      const antes = id ? await lerPacote(tx, id) : null;
      const valores = {
        ...dados,
        nomeNormalizado: normalizarTexto(dados.nome),
        atualizadoEm: momento,
      };
      let linha: LinhaDoPacote | undefined;
      try {
        [linha] = antes
          ? await tx
              .update(pacotesDeSoftware)
              .set(valores)
              .where(eq(pacotesDeSoftware.id, antes.id))
              .returning()
          : await tx
              .insert(pacotesDeSoftware)
              .values({ orgId: orgDa(requisicao), ...valores, criadoEm: momento })
              .returning();
      } catch (erro) {
        if (violouUnicidade(erro, 'pacotes_de_software_nome_unico')) {
          throw conflito(MENSAGENS_DO_SOFTWARE.nomeRepetido, {
            nome: MENSAGENS_DO_SOFTWARE.nomeRepetido,
          });
        }
        throw erro;
      }
      if (!linha) throw new Error('O pacote não foi gravado.');
      await registrarNaAuditoria(tx, {
        acao: antes ? 'pacote.alterado' : 'pacote.criado',
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'pacote', id: linha.id },
        ...(antes ? { antes: visaoDoPacote(antes) } : {}),
        depois: visaoDoPacote(linha),
        origem: origemDa(requisicao),
        momento,
      });
      return pacoteNaTela(linha);
    });
  }

  app.post(
    '/software/pacotes',
    {
      config: { permissao: 'software.administrar' },
      schema: {
        summary: 'Cadastrar um pacote de software',
        body: PedidoDePacote,
        response: { 201: PacoteDeSoftware, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) =>
      resposta.code(201).send(await gravar(requisicao, requisicao.body)),
  );

  app.patch(
    '/software/pacotes/:id',
    {
      config: { permissao: 'software.administrar' },
      schema: {
        summary: 'Editar um pacote de software',
        params: ParametrosDoPacote,
        body: PedidoDePacote,
        response: { 200: PacoteDeSoftware, ...PROBLEMAS },
      },
    },
    (requisicao) => gravar(requisicao, requisicao.body, requisicao.params.id),
  );

  for (const [caminho, situacao, acao] of [
    ['inativacao', 'inativo', 'pacote.inativado'],
    ['reativacao', 'ativo', 'pacote.reativado'],
  ] as const) {
    app.post(
      `/software/pacotes/:id/${caminho}`,
      {
        config: { permissao: 'software.administrar' },
        schema: {
          summary: situacao === 'inativo' ? 'Inativar o pacote' : 'Reativar o pacote',
          params: ParametrosDoPacote,
          response: { 200: PacoteDeSoftware, ...PROBLEMAS },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const momento = agora();
        return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
          const antes = await lerPacote(tx, requisicao.params.id);
          if (antes.situacao === situacao) return pacoteNaTela(antes);
          const [depois] = await tx
            .update(pacotesDeSoftware)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(pacotesDeSoftware.id, antes.id))
            .returning();
          if (!depois) throw new Error('O pacote sumiu.');
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'pacote', id: antes.id },
            antes: visaoDoPacote(antes),
            depois: visaoDoPacote(depois),
            origem: origemDa(requisicao),
            momento,
          });
          return pacoteNaTela(depois);
        });
      },
    );
  }

  app.get(
    '/software/pacotes/:id/arquivo',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'Baixar o arquivo do pacote, montado das partes',
        params: ParametrosDoPacote,
        response: {
          200: {
            description: 'O arquivo do pacote, como foi enviado',
            content: { 'application/octet-stream': { schema: BytesDoArquivo } },
          },
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao, resposta) => {
      const orgId = orgDa(requisicao);
      const { pacote, partes } = await naOrganizacao(banco, orgId, async (tx) => ({
        pacote: await lerPacote(tx, requisicao.params.id),
        partes: await tx
          .select({ indice: partesDosPacotes.indice })
          .from(partesDosPacotes)
          .where(eq(partesDosPacotes.pacoteId, requisicao.params.id))
          .orderBy(asc(partesDosPacotes.indice)),
      }));
      const nome = pacote.nomeDoArquivo;
      if (!nome || pacote.tamanhoDoArquivo === null || partes.length === 0) {
        throw naoEncontrado('O pacote não tem arquivo.');
      }
      // Uma parte por vez na memória: até 8 MB, e não o arquivo inteiro.
      async function* montar() {
        for (const { indice } of partes) {
          const conteudo = await armazenamento.abrir(
            chaveDaParteDoPacote(orgId, pacote.id, indice),
          );
          if (!conteudo) throw new Error(`A parte ${indice} do pacote sumiu do armazenamento.`);
          yield gunzipSync(conteudo);
        }
      }
      resposta.headers({
        'content-type': 'application/octet-stream',
        'content-length': pacote.tamanhoDoArquivo,
        'x-content-type-options': 'nosniff',
        'content-disposition': `attachment; filename="${nomeEmAscii(nome)}"; filename*=UTF-8''${nomeCodificado(nome)}`,
      });
      // O corpo vai em fluxo, parte por parte; no contrato, o esquema descreve os bytes.
      return resposta.send(Readable.from(montar()) as unknown as Buffer);
    },
  );

  // O envio do arquivo, num escopo com o corpo binário até 512 MB.
  await app.register(async (doArquivo) => {
    doArquivo.removeAllContentTypeParsers();
    doArquivo.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: LIMITE_DO_ARQUIVO_DO_PACOTE },
      (_requisicao, corpo, pronto) => pronto(null, corpo),
    );
    doArquivo.setErrorHandler((erro: FastifyError) => {
      if (erro.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        throw new ProblemaDaApi({
          codigo: 'arquivo-grande',
          status: 413,
          titulo: 'Arquivo grande demais',
          detalhe: MENSAGENS_DO_SOFTWARE.arquivoGrande,
        });
      }
      throw erro;
    });
    doArquivo.put(
      '/software/pacotes/:id/arquivo',
      {
        config: { permissao: 'software.administrar' },
        schema: {
          summary: 'Enviar o arquivo do pacote, que o agente baixa em partes',
          params: ParametrosDoPacote,
          // O nome original na query, como nos outros envios de arquivo.
          querystring: z.object({ nome: z.string().max(255).optional() }),
          response: { 200: PacoteDeSoftware, 413: RespostaDeProblema, ...PROBLEMAS },
        },
      },
      async (requisicao) => {
        const { contaId } = sessaoDa(requisicao);
        const arquivo = requisicao.body;
        const nome = ((requisicao.query as { nome?: string }).nome ?? '').trim();
        if (!nomeDeArquivoValido(nome)) {
          throw dadosInvalidos({ arquivo: 'Informe o nome do arquivo, sem pastas.' });
        }
        if (!Buffer.isBuffer(arquivo) || arquivo.length === 0) {
          throw dadosInvalidos({ arquivo: 'Envie o arquivo do pacote.' });
        }
        const momento = agora();
        const orgId = orgDa(requisicao);
        return naOrganizacao(banco, orgId, async (tx) => {
          const antes = await lerPacote(tx, (requisicao.params as { id: string }).id);
          const { partes } = await trocarArquivoDoPacote(tx, {
            orgId,
            pacoteId: antes.id,
            nome,
            arquivo,
            armazenamento,
            momento,
          });
          const depois = await lerPacote(tx, antes.id);
          await registrarNaAuditoria(tx, {
            acao: 'pacote.arquivo-trocado',
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'pacote', id: antes.id },
            dados: { arquivo: nome, tamanho: arquivo.length, partes },
            origem: origemDa(requisicao),
            momento,
          });
          return pacoteNaTela(depois);
        });
      },
    );
  });
};
