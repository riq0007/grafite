// A base de software pela API (spec distribuicao-de-software, "Base de software"; change
// distribuicao-de-software): a lista para quem distribui, e o cadastro, a edição, a inativação e o
// envio do arquivo para quem administra o software, tudo na auditoria; e o arquivo inteiro, montado
// das partes, para quem vê a base. Na change software-por-pacote, o pacote ganha a categoria, o nome
// no inventário, o tipo pela extensão e quem guardou o arquivo (design, decisões 1, 3 e 4).
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import {
  type Banco,
  categoriasDeSoftware,
  contas,
  naOrganizacao,
  pacotesDeSoftware,
  partesDosPacotes,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  conferirPacote,
  contasDoPacote,
  LIMITE_DO_ARQUIVO_DO_PACOTE,
  MENSAGENS_DO_SOFTWARE,
  normalizarTexto,
  pode,
  tipoDoPacote,
} from '@grafite/domain';
import { and, asc, count, eq } from 'drizzle-orm';
import type { FastifyError, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { type Armazenamento, chaveDaParteDoPacote } from '../arquivos/armazenamento.ts';
import { BytesDoArquivo } from '../arquivos/esquemas.ts';
import { nomeCodificado, nomeEmAscii } from '../ativos/arquivos-dos-campos.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouChaveEstrangeira, violouUnicidade } from '../banco.ts';
import {
  conflito,
  dadosInvalidos,
  naoEncontrado,
  ProblemaDaApi,
  RespostaDeProblema,
} from '../problemas.ts';
import {
  distribuicoesDoPacote,
  instalacoesNaConta,
  ultimasDistribuicoes,
} from '../software/base.ts';
import { trocarArquivoDoPacote } from '../software/pacotes.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

export const PacoteDeSoftware = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    versao: z.string().nullable(),
    descricao: z.string().nullable(),
    categoria: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    /** O nome que liga o pacote ao inventário; `null`, vale o nome. */
    nomeNoInventario: z.string().nullable(),
    comando: z.string(),
    codigosDeSucesso: z.array(z.number()),
    /** O tipo pela extensão do arquivo: o longo da ficha e o curto das listas. */
    tipo: z.object({ longo: z.string(), curto: z.string() }),
    arquivo: z
      .object({
        nome: z.string(),
        tamanho: z.number(),
        guardadoEm: z.string().nullable(),
        guardadoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
      })
      .nullable(),
    situacao: z.enum(['ativo', 'inativo']),
  })
  .meta({ id: 'PacoteDeSoftware' });

const PedidoDePacote = z
  .object({
    nome: z.string(),
    versao: z.string().nullable().optional(),
    descricao: z.string().nullable().optional(),
    /** A categoria; sem o campo, a edição mantém a de antes, e `null` tira. */
    categoriaId: z.uuid({ error: MENSAGENS_DO_SOFTWARE.categoria }).nullable().optional(),
    /** O nome no inventário; sem o campo, a edição mantém o de antes, e vazio volta ao nome. */
    nomeNoInventario: z.string().nullable().optional(),
    comando: z.string(),
    /** Os códigos como texto, "0, 3010", ou a lista. */
    codigosDeSucesso: z.union([z.string(), z.array(z.number())]).optional(),
  })
  .meta({ id: 'PedidoDePacote' });

const ParametrosDoPacote = z.object({ id: z.uuid({ error: 'Pacote não encontrado.' }) });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

/** O pacote com o nome da categoria e o de quem guardou o arquivo. */
interface PacoteLido {
  pacote: typeof pacotesDeSoftware.$inferSelect;
  categoria: { id: string; nome: string } | null;
  guardadoPor: string | null;
}

const selecionarPacotes = (tx: Transacao) =>
  tx
    .select({
      pacote: pacotesDeSoftware,
      categoria: { id: categoriasDeSoftware.id, nome: categoriasDeSoftware.nome },
      guardadoPor: pessoas.nome,
    })
    .from(pacotesDeSoftware)
    .leftJoin(
      categoriasDeSoftware,
      and(
        eq(categoriasDeSoftware.orgId, pacotesDeSoftware.orgId),
        eq(categoriasDeSoftware.id, pacotesDeSoftware.categoriaId),
      ),
    )
    .leftJoin(
      contas,
      and(
        eq(contas.orgId, pacotesDeSoftware.orgId),
        eq(contas.id, pacotesDeSoftware.arquivoGuardadoPor),
      ),
    )
    .leftJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)));

export const pacoteNaTela = ({
  pacote: linha,
  categoria,
  guardadoPor,
}: PacoteLido): z.infer<typeof PacoteDeSoftware> => {
  const comArquivo = linha.nomeDoArquivo !== null && linha.tamanhoDoArquivo !== null;
  return {
    id: linha.id,
    nome: linha.nome,
    versao: linha.versao,
    descricao: linha.descricao,
    categoria,
    nomeNoInventario: linha.nomeNoInventario,
    comando: linha.comando,
    codigosDeSucesso: linha.codigosDeSucesso,
    tipo: tipoDoPacote(comArquivo ? linha.nomeDoArquivo : null),
    arquivo:
      linha.nomeDoArquivo && linha.tamanhoDoArquivo !== null
        ? {
            nome: linha.nomeDoArquivo,
            tamanho: linha.tamanhoDoArquivo,
            guardadoEm: linha.arquivoGuardadoEm?.toISOString() ?? null,
            guardadoPor:
              linha.arquivoGuardadoPor && guardadoPor
                ? { id: linha.arquivoGuardadoPor, nome: guardadoPor }
                : null,
          }
        : null,
    situacao: linha.situacao,
  };
};

/** As contas do pacote nas máquinas da conta; sem versão-alvo, as duas do meio são `null`. */
const ContasDoPacote = z
  .object({
    maquinas: z.number(),
    instalado: z.number(),
    naVersao: z.number().nullable(),
    desatualizadas: z.number().nullable(),
    sem: z.number(),
  })
  .meta({ id: 'ContasDoPacote' });

const PacoteNaBase = PacoteDeSoftware.extend({
  contas: ContasDoPacote,
  ultimaDistribuicao: z
    .object({ id: z.uuid(), criadaEm: z.string(), paraQuem: z.string() })
    .nullable(),
}).meta({ id: 'PacoteNaBase' });

const DistribuicaoDoPacote = z
  .object({
    id: z.uuid(),
    criadaEm: z.string(),
    paraQuem: z.string(),
    maquinas: z.number(),
    resultado: z.object({
      concluidas: z.number(),
      emAndamento: z.number(),
      aguardando: z.number(),
      falharam: z.number(),
      tiradas: z.number(),
    }),
  })
  .meta({ id: 'DistribuicaoDoPacote' });

const FichaDoPacote = z
  .object({
    pacote: PacoteDeSoftware,
    /** Em quantas partes o arquivo está guardado ("118 MB, em 12 partes"). */
    partes: z.number(),
    contas: ContasDoPacote,
    /** As barras das versões, da mais nova para a mais velha. */
    versoes: z.array(
      z.object({
        versao: z.string().nullable(),
        estado: z.enum(['alvo', 'abaixo', 'acima']).nullable(),
        quantas: z.number(),
      }),
    ),
    distribuicoes: z.array(DistribuicaoDoPacote),
    permite: z.object({ administrar: z.boolean() }),
  })
  .meta({ id: 'FichaDoPacote' });

/** O que a auditoria guarda do pacote: sem o SHA-512, com a categoria e o arquivo pelo nome. */
const visaoDoPacote = ({ pacote: linha, categoria }: PacoteLido) => ({
  nome: linha.nome,
  versao: linha.versao,
  categoria: categoria?.nome ?? null,
  nomeNoInventario: linha.nomeNoInventario,
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

  async function lerPacote(tx: Transacao, id: string): Promise<PacoteLido> {
    const [lido] = await selecionarPacotes(tx).where(eq(pacotesDeSoftware.id, id));
    if (!lido) throw naoEncontrado('Pacote não encontrado.');
    return lido;
  }

  /** A categoria pedida, que precisa ser uma das da organização. */
  async function conferirCategoria(tx: Transacao, categoriaId: string) {
    const [categoria] = await tx
      .select({ id: categoriasDeSoftware.id })
      .from(categoriasDeSoftware)
      .where(eq(categoriasDeSoftware.id, categoriaId));
    if (!categoria) throw dadosInvalidos({ categoriaId: MENSAGENS_DO_SOFTWARE.categoria });
  }

  app.get(
    '/software/pacotes',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary:
          'A base de software frente ao inventário das máquinas da conta, com as mais desatualizadas primeiro',
        response: {
          200: z.object({
            pacotes: z.array(PacoteNaBase),
            /** As máquinas da conta: os ativos ativos com o agente ligado, nos locais dela. */
            maquinas: z.number(),
            permite: z.object({ administrar: z.boolean() }),
          }),
          ...PROBLEMAS,
        },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linhas = await selecionarPacotes(tx).orderBy(asc(pacotesDeSoftware.nomeNormalizado));
        const { maquinas, porPacote } = await instalacoesNaConta(tx, acesso);
        const ultimas = await ultimasDistribuicoes(tx);
        const pacotes = linhas.map((lido) => ({
          ...pacoteNaTela(lido),
          contas: contasDoPacote(porPacote.get(lido.pacote.id) ?? [], maquinas, lido.pacote.versao)
            .contas,
          ultimaDistribuicao: ultimas.get(lido.pacote.id) ?? null,
        }));
        pacotes.sort(
          (a, b) =>
            (b.contas.desatualizadas ?? 0) - (a.contas.desatualizadas ?? 0) ||
            a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true }),
        );
        return {
          pacotes,
          maquinas,
          permite: { administrar: pode(acesso, 'software.administrar') },
        };
      });
    },
  );

  app.get(
    '/software/pacotes/:id',
    {
      config: { permissao: 'software.distribuir' },
      schema: {
        summary: 'A ficha do pacote: as contas, as barras das versões e as distribuições',
        params: ParametrosDoPacote,
        response: { 200: FichaDoPacote, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const lido = await lerPacote(tx, requisicao.params.id);
        const { maquinas, porPacote } = await instalacoesNaConta(tx, acesso, lido.pacote.id);
        const { contas, versoes } = contasDoPacote(
          porPacote.get(lido.pacote.id) ?? [],
          maquinas,
          lido.pacote.versao,
        );
        const [partes] = await tx
          .select({ quantas: count() })
          .from(partesDosPacotes)
          .where(eq(partesDosPacotes.pacoteId, lido.pacote.id));
        return {
          pacote: pacoteNaTela(lido),
          partes: partes?.quantas ?? 0,
          contas,
          versoes,
          distribuicoes: await distribuicoesDoPacote(tx, lido.pacote.id),
          permite: { administrar: pode(acesso, 'software.administrar') },
        };
      });
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
      // Sem o campo, a edição mantém o de antes: o cliente de antes desta change não os manda.
      const nomeNoInventario =
        pedido.nomeNoInventario === undefined && antes
          ? antes.pacote.nomeNoInventario
          : dados.nomeNoInventario;
      const categoriaId =
        pedido.categoriaId === undefined ? (antes?.pacote.categoriaId ?? null) : pedido.categoriaId;
      if (categoriaId && categoriaId !== antes?.pacote.categoriaId) {
        await conferirCategoria(tx, categoriaId);
      }
      const valores = {
        ...dados,
        nomeNoInventario,
        categoriaId,
        nomeNormalizado: normalizarTexto(dados.nome),
        nomeNoInventarioNormalizado: normalizarTexto(nomeNoInventario ?? dados.nome),
        atualizadoEm: momento,
      };
      let gravado: { id: string } | undefined;
      try {
        [gravado] = antes
          ? await tx
              .update(pacotesDeSoftware)
              .set(valores)
              .where(eq(pacotesDeSoftware.id, antes.pacote.id))
              .returning({ id: pacotesDeSoftware.id })
          : await tx
              .insert(pacotesDeSoftware)
              .values({ orgId: orgDa(requisicao), ...valores, criadoEm: momento })
              .returning({ id: pacotesDeSoftware.id });
      } catch (erro) {
        if (violouUnicidade(erro, 'pacotes_de_software_nome_unico')) {
          throw conflito(MENSAGENS_DO_SOFTWARE.nomeRepetido, {
            nome: MENSAGENS_DO_SOFTWARE.nomeRepetido,
          });
        }
        // A categoria removida enquanto o pacote era gravado.
        if (violouChaveEstrangeira(erro, 'pacotes_de_software_categoria_fk')) {
          throw dadosInvalidos({ categoriaId: MENSAGENS_DO_SOFTWARE.categoria });
        }
        throw erro;
      }
      if (!gravado) throw new Error('O pacote não foi gravado.');
      const depois = await lerPacote(tx, gravado.id);
      await registrarNaAuditoria(tx, {
        acao: antes ? 'pacote.alterado' : 'pacote.criado',
        ator: { tipo: 'conta', contaId },
        alvo: { tipo: 'pacote', id: gravado.id },
        ...(antes ? { antes: visaoDoPacote(antes) } : {}),
        depois: visaoDoPacote(depois),
        origem: origemDa(requisicao),
        momento,
      });
      return pacoteNaTela(depois);
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
          if (antes.pacote.situacao === situacao) return pacoteNaTela(antes);
          await tx
            .update(pacotesDeSoftware)
            .set({ situacao, atualizadoEm: momento })
            .where(eq(pacotesDeSoftware.id, antes.pacote.id));
          const depois = await lerPacote(tx, antes.pacote.id);
          await registrarNaAuditoria(tx, {
            acao,
            ator: { tipo: 'conta', contaId },
            alvo: { tipo: 'pacote', id: antes.pacote.id },
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
        pacote: (await lerPacote(tx, requisicao.params.id)).pacote,
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
          const { pacote: antes } = await lerPacote(tx, (requisicao.params as { id: string }).id);
          const { partes } = await trocarArquivoDoPacote(tx, {
            orgId,
            pacoteId: antes.id,
            nome,
            arquivo,
            armazenamento,
            contaId,
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
