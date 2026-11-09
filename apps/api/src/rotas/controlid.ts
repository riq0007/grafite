// Os backups do Control iD pela API (spec backup-do-control-id; change p5a-backup-do-control-id,
// design, decisões 2, 8 e 9), no escopo do Ativos: a lista dos backups que a conta vê, o histórico
// do controle, o "Fazer backup agora" e o "Backup de todos os controles", a exclusão, o download do
// ZIP, o conteúdo pelas abas e as fotos das pessoas, lidos do ZIP guardado.
import { type Banco, naOrganizacao } from '@grafite/db';
import { podeEm } from '@grafite/domain';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import type { Armazenamento } from '../arquivos/armazenamento.ts';
import { BytesDaImagem, BytesDoArquivo } from '../arquivos/esquemas.ts';
import { lerArvore } from '../arvore.ts';
import { conteudoDoBackup, fotoDoBackup } from '../controlid/arquivo.ts';
import {
  apagarBackup,
  arquivoParaBaixar,
  backupsDoControle,
  chaveParaLer,
  controlesComBackup,
  lerBackup,
  lerPaginaDeBackups,
  pedirBackup,
  pedirTodos,
  resumoDosBackups,
} from '../controlid/backups.ts';
import { compararLados, guardarArquivo } from '../controlid/comparador.ts';
import {
  ArquivoParaComparar,
  BackupDoControlId,
  BackupsDoControle,
  ComparacaoDeBackups,
  ConteudoDoBackup,
  ControlesComBackup,
  FiltrosDoConteudo,
  FiltrosDoResumo,
  FiltrosDosBackups,
  ListaDeBackups,
  OperacaoDoControlId,
  OperacoesDoControle,
  ParametrosDaFotoDoBackup,
  ParametrosDoBackup,
  PedidoDeOperacao,
  PedidoDoComparador,
  ResultadoDoPedidoDeTodos,
  ResumoDosBackups,
} from '../controlid/esquemas.ts';
import { operacoesDoControle, pedirOperacao } from '../controlid/operacoes.ts';
import { naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { PROBLEMAS_DO_ACESSO } from './sessao.ts';

const PROBLEMAS_DO_BACKUP = {
  401: RespostaDeProblema,
  409: RespostaDeProblema,
  ...PROBLEMAS_DO_ACESSO,
};

/** O nome do arquivo no cabeçalho, sem acento nem aspas, e o original codificado. */
const nomeEmAscii = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');

/** O maior arquivo que o comparador aceita: 512 MiB. */
const LIMITE_DO_ARQUIVO = 512 * 1024 * 1024;

export const rotasDoControlId: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  armazenamento: Armazenamento;
  chaveDoisPassos: Buffer;
}> = async (app, { banco, agora, armazenamento, chaveDoisPassos }) => {
  // Os arquivos do comparador chegam em bytes (change p5b-comparacao-e-restauracao, decisão 6).
  const comoBytes = (
    _requisicao: unknown,
    corpo: Buffer,
    pronto: (erro: null, corpo: Buffer) => void,
  ) => pronto(null, corpo);
  app.addContentTypeParser(
    'application/zip',
    { parseAs: 'buffer', bodyLimit: LIMITE_DO_ARQUIVO },
    comoBytes,
  );
  app.addContentTypeParser(
    'text/csv',
    { parseAs: 'buffer', bodyLimit: LIMITE_DO_ARQUIVO },
    comoBytes,
  );
  // O envio da tela vai em bytes, sem o tipo; o formato é conferido pelo conteúdo.
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: LIMITE_DO_ARQUIVO },
    comoBytes,
  );

  const daOrganizacao = (requisicao: { organizacao: { id: string } | null }) =>
    requisicao.organizacao?.id ?? '';

  app.get(
    '/controlid/backups',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary:
          'Os backups do Control iD dos controles que a conta vê, do mais novo para o mais antigo, com o filtro pelo controle e pela situação',
        querystring: FiltrosDosBackups,
        response: { 200: ListaDeBackups, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        lerPaginaDeBackups(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.query),
      );
    },
  );

  app.get(
    '/controlid/backups/resumo',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary:
          'O resumo dos backups de cada controle que a conta vê: os dias de São Paulo, o último e o anterior, com os usuários e os rostos, e a série dos rostos',
        querystring: FiltrosDoResumo,
        response: { 200: ResumoDosBackups, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        resumoDosBackups(
          tx,
          { acesso, arvore: await lerArvore(tx) },
          { ...requisicao.query, agora: agora() },
        ),
      );
    },
  );

  app.post(
    '/controlid/backups/todos',
    {
      config: { permissao: 'controlid.backup' },
      schema: {
        summary: 'Pôr na fila o backup de todos os controles em que a conta faz o backup',
        response: { 200: ResultadoDoPedidoDeTodos, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) =>
      naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        pedirTodos(tx, { requisicao, momento: agora() }),
      ),
  );

  app.get(
    '/ativos/:id/backups-do-control-id',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary: 'O histórico dos backups do controle, com o horário do tipo',
        params: ParametrosDoBackup,
        response: { 200: BackupsDoControle, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        backupsDoControle(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
    },
  );

  app.post(
    '/ativos/:id/backups-do-control-id',
    {
      config: { permissao: 'controlid.backup' },
      schema: {
        summary: 'Fazer backup agora: pôr na fila o backup do controle',
        params: ParametrosDoBackup,
        response: { 201: BackupDoControlId, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao, resposta) => {
      const backup = await naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        pedirBackup(tx, requisicao.params.id, { requisicao, momento: agora() }),
      );
      return resposta.code(201).send(backup);
    },
  );

  app.get(
    '/controlid/backups/:id',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary: 'Um backup do Control iD, com as categorias',
        params: ParametrosDoBackup,
        response: { 200: BackupDoControlId, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        lerBackup(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
    },
  );

  app.delete(
    '/controlid/backups/:id',
    {
      config: { permissao: 'controlid.backup' },
      schema: {
        summary: 'Apagar um backup que não está na fila nem em andamento, com o arquivo',
        params: ParametrosDoBackup,
        response: { 204: z.null(), ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao, resposta) => {
      const chave = await naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        apagarBackup(tx, requisicao.params.id, { requisicao, momento: agora() }),
      );
      if (chave) await armazenamento.apagar(chave);
      return resposta.code(204).send(null);
    },
  );

  app.get(
    '/controlid/backups/:id/arquivo',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary: 'O ZIP do backup, para baixar',
        params: ParametrosDoBackup,
        response: {
          200: {
            description: 'O ZIP no formato do PMG',
            content: { 'application/zip': { schema: BytesDoArquivo } },
          },
          ...PROBLEMAS_DO_BACKUP,
        },
      },
    },
    async (requisicao, resposta) => {
      const { chave, nome } = await naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        arquivoParaBaixar(tx, requisicao.params.id, { requisicao, momento: agora() }),
      );
      const conteudo = await armazenamento.abrir(chave);
      if (!conteudo) throw naoEncontrado('Este backup não tem arquivo.');
      resposta.headers({
        'content-type': 'application/zip',
        'x-content-type-options': 'nosniff',
        'content-disposition': `attachment; filename="${nomeEmAscii(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
        'cache-control': 'private, no-store',
      });
      return resposta.send(conteudo);
    },
  );

  app.get(
    '/controlid/backups/:id/conteudo',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary:
          'O conteúdo do backup pela aba (pessoas, grupos, regras de acesso e horários), com a busca e a página',
        params: ParametrosDoBackup,
        querystring: FiltrosDoConteudo,
        response: { 200: ConteudoDoBackup, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const chave = await naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        chaveParaLer(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
      const conteudo = await armazenamento.abrir(chave);
      if (!conteudo) throw naoEncontrado('Este backup não tem arquivo.');
      return conteudoDoBackup(conteudo, requisicao.query);
    },
  );

  app.get(
    '/controlid/backups/:id/fotos/:usuario',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary: 'A foto da pessoa no backup',
        params: ParametrosDaFotoDoBackup,
        response: {
          200: {
            description: 'A foto em JPEG',
            content: { 'image/jpeg': { schema: BytesDaImagem } },
          },
          ...PROBLEMAS_DO_BACKUP,
        },
      },
    },
    async (requisicao, resposta) => {
      const { acesso } = sessaoDa(requisicao);
      const chave = await naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        chaveParaLer(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
      const conteudo = await armazenamento.abrir(chave);
      const foto = conteudo ? await fotoDoBackup(conteudo, requisicao.params.usuario) : null;
      if (!foto) throw naoEncontrado('Foto não encontrada.');
      resposta.headers({
        'content-type': 'image/jpeg',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, max-age=86400',
      });
      return resposta.send(foto);
    },
  );

  // A comparação com o controle e a restauração (change p5b-comparacao-e-restauracao).
  app.post(
    '/controlid/backups/:id/operacoes',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary:
          'Pedir a restauração do backup num controle, com o código do app, ou a comparação dele com o controle',
        params: ParametrosDoBackup,
        body: PedidoDeOperacao,
        response: { 201: OperacaoDoControlId, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao, resposta) => {
      const operacao = await naOrganizacao(banco, daOrganizacao(requisicao), (tx) =>
        pedirOperacao(tx, requisicao.params.id, requisicao.body, {
          requisicao,
          momento: agora(),
          chaveDoisPassos,
        }),
      );
      return resposta.code(201).send(operacao);
    },
  );

  app.get(
    '/ativos/:id/operacoes-do-control-id',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary: 'As 10 operações mais recentes do controle, com o resultado',
        params: ParametrosDoBackup,
        response: { 200: OperacoesDoControle, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) =>
        operacoesDoControle(tx, { acesso, arvore: await lerArvore(tx) }, requisicao.params.id),
      );
    },
  );

  app.post(
    '/controlid/comparador/arquivos',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary:
          'Enviar um arquivo para o comparador: o ZIP de um backup ou o CSV exportado pelo controle',
        querystring: z.object({ nome: z.string().max(200).optional() }),
        body: BytesDoArquivo,
        response: { 200: ArquivoParaComparar, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const nome = requisicao.query.nome ?? 'arquivo';
      return guardarArquivo({
        orgId: daOrganizacao(requisicao),
        nome: nome.slice(0, 200),
        tipo: String(requisicao.headers['content-type'] ?? ''),
        conteudo: requisicao.body,
        agora: agora(),
      });
    },
  );

  app.post(
    '/controlid/comparador',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary:
          'Comparar dois lados, backups do histórico ou arquivos enviados, nas pessoas e nos cartões',
        body: PedidoDoComparador,
        response: { 200: ComparacaoDeBackups, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      const orgId = daOrganizacao(requisicao);
      return naOrganizacao(banco, orgId, async (tx) =>
        compararLados(requisicao.body.a, requisicao.body.b, {
          tx,
          leitor: { acesso, arvore: await lerArvore(tx) },
          armazenamento,
          orgId,
          agora: agora(),
        }),
      );
    },
  );

  app.get(
    '/controlid/controles',
    {
      config: { permissao: 'controlid.ver' },
      schema: {
        summary: 'Os controles com o backup ligado que a conta vê',
        response: { 200: ControlesComBackup, ...PROBLEMAS_DO_BACKUP },
      },
    },
    async (requisicao) => {
      const { acesso } = sessaoDa(requisicao);
      return naOrganizacao(banco, daOrganizacao(requisicao), async (tx) => {
        const arvore = await lerArvore(tx);
        const controles = (await controlesComBackup(tx)).filter((controle) =>
          podeEm(acesso, 'controlid.ver', controle.localId, arvore),
        );
        return {
          controles: controles.map(({ id, rotulo, patrimonio }) => ({ id, rotulo, patrimonio })),
        };
      });
    },
  );
};
