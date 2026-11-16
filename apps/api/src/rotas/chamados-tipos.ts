// Os tipos de chamado pela API (spec tipos-de-chamado, "Tipo de chamado", "Prazo e atendimento do
// tipo", "O que acontece depois" e "Rascunho, duplicar e descartar"; change chamados-da-ti, design,
// decisões 6 e 18), para quem configura os chamados: a lista e a ordem; o "Novo tipo" e o duplicar,
// como Rascunho; a gravação, o "Criar o tipo" e o reativar, pela conferência do domínio, com o
// contexto lido na mesma transação; o inativar, sem conferir; e o descartar do Rascunho. Tudo com a
// auditoria e o evento dos ajustes.
import {
  type Banco,
  naOrganizacao,
  type Transacao,
  tiposDeAtivo,
  tiposDeChamado,
} from '@grafite/db';
import {
  alcance,
  conferirTipoDeChamado,
  type Formulario,
  MENSAGENS_DO_TIPO_DE_CHAMADO,
  MODOS_DO_PRAZO,
  NOVO_TIPO_DE_CHAMADO,
  nomeDaCopia,
  nomeDoNovoTipo,
  normalizarTexto,
  type PedidoDoTipoDeChamado,
  SEM_NINGUEM,
  type SituacaoDoTipoDeChamado,
  SOLICITACOES_DO_TIPO_DE_CHAMADO,
  solicitacaoDoDuplicado,
  type TipoDeChamadoConferido,
} from '@grafite/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { lerArvore } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { lerHorarioDaTi } from '../chamados/horario.ts';
import { lerContaQueAtende } from '../chamados/quem-atende.ts';
import {
  lerTipoDeChamado,
  lerTiposDeChamado,
  naOrdem,
  TipoDeChamado,
  type TipoDeChamadoLido,
  ValorDoPrazo,
  visaoDoTipoDeChamado,
} from '../chamados/tipos.ts';
import { conflito, dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const M = MENSAGENS_DO_TIPO_DE_CHAMADO;

const ListaDosTiposDeChamado = z
  .object({ tipos: z.array(TipoDeChamado) })
  .meta({ id: 'ListaDosTiposDeChamado' });

/** O tipo como a tela o grava; as recusas da spec são da conferência do domínio, por campo. */
const PedidoDoTipo = z
  .object({
    nome: z.string(),
    /** Fora da lista dos ícones, a conferência recusa com "Escolha o ícone.". */
    icone: z.string(),
    frase: z.string().nullable(),
    prazo: z.object({
      modo: z.enum(MODOS_DO_PRAZO),
      resposta: ValorDoPrazo,
      resolucao: ValorDoPrazo,
    }),
    atendePorPadrao: z.uuid().nullable(),
    semNinguem: z.enum(SEM_NINGUEM),
    podeVirarOs: z.boolean(),
    geraSolicitacao: z.enum(SOLICITACOES_DO_TIPO_DE_CHAMADO),
    tipoDeAtivoDoEquipamento: z.uuid().nullable(),
    pedeOAtivo: z.boolean(),
    apareceParaOColaborador: z.boolean(),
    soATiAbre: z.boolean(),
  })
  .meta({ id: 'PedidoDoTipoDeChamado' });

const TipoDeChamadoDuplicado = z
  .object({
    tipo: TipoDeChamado,
    /** O duplicado veio sem o "Gera uma Solicitação", que quem duplicou não liga. */
    solicitacaoDesligada: z.boolean(),
  })
  .meta({ id: 'TipoDeChamadoDuplicado' });

const ParametrosDoTipo = z.object({ id: z.uuid() });

const PROBLEMAS = { 401: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };
const PROBLEMAS_DA_VIDA = { ...PROBLEMAS, 409: RespostaDeProblema };

/** As tentativas do nome do Rascunho, quando outras gravações ficam com o número antes. */
const TENTATIVAS_DO_NOME = 10;

type LinhaDoTipo = typeof tiposDeChamado.$inferSelect;

/** As colunas do tipo, do formato do domínio, fora o nome, que cada gravação põe à sua maneira. */
function colunasDoTipo(tipo: Omit<TipoDeChamadoConferido, 'nome' | 'nomeNormalizado'>) {
  return {
    icone: tipo.icone,
    frase: tipo.frase,
    modo: tipo.prazo.modo,
    respostaValor: tipo.prazo.resposta.valor,
    respostaUnidade: tipo.prazo.resposta.unidade,
    resolucaoValor: tipo.prazo.resolucao.valor,
    resolucaoUnidade: tipo.prazo.resolucao.unidade,
    atendePorPadrao: tipo.atendePorPadrao,
    semNinguem: tipo.semNinguem,
    podeVirarOs: tipo.podeVirarOs,
    geraSolicitacao: tipo.geraSolicitacao,
    tipoDeAtivoDoEquipamento: tipo.tipoDeAtivoDoEquipamento,
    pedeOAtivo: tipo.pedeOAtivo,
    apareceParaOColaborador: tipo.apareceParaOColaborador,
    soATiAbre: tipo.soATiAbre,
  };
}

/** O tipo gravado como pedido, para o reativar conferir o que ele tem. */
function pedidoDaLinha(linha: LinhaDoTipo): PedidoDoTipoDeChamado {
  return {
    nome: linha.nome,
    icone: linha.icone,
    frase: linha.frase,
    prazo: {
      modo: linha.modo,
      resposta: { valor: linha.respostaValor, unidade: linha.respostaUnidade },
      resolucao: { valor: linha.resolucaoValor, unidade: linha.resolucaoUnidade },
    },
    atendePorPadrao: linha.atendePorPadrao,
    semNinguem: linha.semNinguem,
    podeVirarOs: linha.podeVirarOs,
    geraSolicitacao: linha.geraSolicitacao,
    tipoDeAtivoDoEquipamento: linha.tipoDeAtivoDoEquipamento,
    pedeOAtivo: linha.pedeOAtivo,
    apareceParaOColaborador: linha.apareceParaOColaborador,
    soATiAbre: linha.soATiAbre,
  };
}

/** A linha do tipo; travada, a gravação seguinte espera esta terminar. */
async function lerLinhaDoTipo(
  tx: Transacao,
  id: string,
  { travar = false }: { travar?: boolean } = {},
): Promise<LinhaDoTipo> {
  const consulta = tx.select().from(tiposDeChamado).where(eq(tiposDeChamado.id, id));
  const [linha] = await (travar ? consulta.for('update') : consulta);
  if (!linha) throw naoEncontrado(M.naoEncontrado);
  return linha;
}

/** O tipo de ativo pedido, se está ativo: a conferência só pergunta por ele. */
async function tiposDeAtivoAtivos(tx: Transacao, pedido: PedidoDoTipoDeChamado) {
  const id = pedido.geraSolicitacao === 'equipamento' ? pedido.tipoDeAtivoDoEquipamento : null;
  if (id === null) return new Set<string>();
  const ativos = await tx
    .select({ id: tiposDeAtivo.id })
    .from(tiposDeAtivo)
    .where(and(eq(tiposDeAtivo.id, id), eq(tiposDeAtivo.situacao, 'ativo')));
  return new Set(ativos.map((tipo) => tipo.id));
}

/**
 * Grava o Rascunho com o primeiro nome livre, no fim da ordem. O nome e a ordem são lidos de novo a
 * cada tentativa: quando outra gravação fica com o mesmo nome antes, o `tipos_de_chamado_nome_unico`
 * recusa este, só o ponto de salvamento volta, e a tentativa seguinte vê o nome dela e passa ao
 * número seguinte. Dois Rascunhos ao mesmo tempo podem ficar com a mesma ordem, e o nome desempata.
 */
async function gravarRascunho(
  tx: Transacao,
  nomeDoNumero: (numero: number) => string,
  valores: Omit<
    typeof tiposDeChamado.$inferInsert,
    'orgId' | 'nome' | 'nomeNormalizado' | 'situacao' | 'ordem'
  >,
): Promise<string> {
  for (let tentativa = 1; ; tentativa += 1) {
    const existentes = await tx
      .select({ nome: tiposDeChamado.nomeNormalizado, ordem: tiposDeChamado.ordem })
      .from(tiposDeChamado);
    const usados = new Set(existentes.map(({ nome }) => nome));
    let numero = 1;
    while (usados.has(normalizarTexto(nomeDoNumero(numero)))) numero += 1;
    const nome = nomeDoNumero(numero);
    const ordem = existentes.reduce((maior, tipo) => Math.max(maior, tipo.ordem), 0) + 1;
    try {
      return await tx.transaction(async (ponto) => {
        const [gravado] = await ponto
          .insert(tiposDeChamado)
          .values({
            ...valores,
            orgId: sql`app.current_org()`,
            nome,
            nomeNormalizado: normalizarTexto(nome),
            situacao: 'rascunho',
            ordem,
          })
          .returning({ id: tiposDeChamado.id });
        if (!gravado) throw new Error('O Rascunho não foi gravado.');
        return gravado.id;
      });
    } catch (erro) {
      const outroFicouComONome = violouUnicidade(erro, 'tipos_de_chamado_nome_unico');
      if (!outroFicouComONome || tentativa >= TENTATIVAS_DO_NOME) throw erro;
    }
  }
}

export const rotasDosTiposDeChamado: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
}> = async (app, { banco, agora }) => {
  const orgDa = (requisicao: FastifyRequest) => requisicao.organizacao?.id ?? '';
  const autorDa = (requisicao: FastifyRequest) =>
    ({ tipo: 'conta', contaId: sessaoDa(requisicao).contaId }) as const;

  /**
   * Grava o tipo travado pela conferência do domínio, com o contexto lido na mesma transação: quem
   * atende por padrão como está agora, o tipo de ativo pedido, o formulário gravado, o alcance de
   * `solicitacoes.atender` de quem grava e o horário da TI. A gravação que não muda nada não grava.
   */
  async function gravarConferido(
    tx: Transacao,
    requisicao: FastifyRequest,
    {
      linha,
      pedido,
      situacao,
      acao,
      momento,
    }: {
      linha: LinhaDoTipo;
      pedido: PedidoDoTipoDeChamado;
      situacao: SituacaoDoTipoDeChamado;
      acao: 'tipo-de-chamado.alterado' | 'tipo-de-chamado.reativado';
      momento: Date;
    },
  ): Promise<TipoDeChamadoLido> {
    const arvore = await lerArvore(tx);
    const conferencia = conferirTipoDeChamado(pedido, {
      situacao,
      antes: {
        geraSolicitacao: linha.geraSolicitacao,
        tipoDeAtivoDoEquipamento: linha.tipoDeAtivoDoEquipamento,
      },
      quemAtende:
        pedido.atendePorPadrao === null
          ? null
          : await lerContaQueAtende(tx, pedido.atendePorPadrao, arvore),
      tiposDeAtivo: await tiposDeAtivoAtivos(tx, pedido),
      // A API grava sempre o formulário conferido.
      formulario: linha.formulario as unknown as Formulario,
      alcanceDasSolicitacoes: alcance(sessaoDa(requisicao).acesso, 'solicitacoes.atender', arvore),
      horario: await lerHorarioDaTi(tx),
    });
    if (!conferencia.ok) throw dadosInvalidos(conferencia.erros);
    const { nome, nomeNormalizado, ...resto } = conferencia.tipo;
    const valores = { nome, nomeNormalizado, situacao, ...colunasDoTipo(resto) };
    const antes = await lerTipoDeChamado(tx, momento, linha.id);
    const mudou = (Object.keys(valores) as (keyof typeof valores)[]).some(
      (coluna) => linha[coluna] !== valores[coluna],
    );
    if (!mudou) return antes;
    try {
      await tx.update(tiposDeChamado).set(valores).where(eq(tiposDeChamado.id, linha.id));
    } catch (erro) {
      if (violouUnicidade(erro, 'tipos_de_chamado_nome_unico')) {
        throw conflito(M.nomeRepetido, { nome: M.nomeRepetido });
      }
      throw erro;
    }
    const depois = await lerTipoDeChamado(tx, momento, linha.id);
    await registrarNaAuditoria(tx, {
      acao,
      ator: autorDa(requisicao),
      alvo: { tipo: 'tipo-de-chamado', id: linha.id },
      antes: visaoDoTipoDeChamado(antes),
      depois: visaoDoTipoDeChamado(depois),
      origem: origemDa(requisicao),
      momento,
    });
    return depois;
  }

  app.get(
    '/chamados/tipos',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Os tipos de chamado, na ordem, com os abertos e os do último ano',
        response: { 200: ListaDosTiposDeChamado, ...PROBLEMAS },
      },
    },
    async (requisicao) => ({
      tipos: await naOrganizacao(banco, orgDa(requisicao), (tx) => lerTiposDeChamado(tx, agora())),
    }),
  );

  app.put(
    '/chamados/tipos/ordem',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Ordenar os tipos de chamado, com todos, uma vez cada',
        body: z.object({ ids: z.array(z.uuid()) }),
        response: { 200: ListaDosTiposDeChamado, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { ids } = requisicao.body;
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // Travados, para duas ordens ao mesmo tempo não se misturarem: a segunda espera a primeira.
        // A leitura vem depois da trava, num comando à parte, para ver a ordem que a primeira
        // deixou. No READ COMMITTED, o `order by` junto com a trava ordenaria pelo retrato de
        // antes da espera, e a segunda compararia o pedido e gravaria o antes na sequência velha.
        await tx.select({ id: tiposDeChamado.id }).from(tiposDeChamado).for('update');
        const atuais = await tx
          .select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome, ordem: tiposDeChamado.ordem })
          .from(tiposDeChamado)
          .orderBy(...naOrdem);
        const pelaId = new Map(atuais.map((tipo) => [tipo.id, tipo]));
        if (
          ids.length !== atuais.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !pelaId.has(id))
        ) {
          throw dadosInvalidos({ ids: M.ordem });
        }
        if (ids.every((id, posicao) => atuais[posicao]?.id === id)) {
          return { tipos: await lerTiposDeChamado(tx, momento) };
        }
        for (const [posicao, id] of ids.entries()) {
          if (pelaId.get(id)?.ordem === posicao + 1) continue;
          await tx
            .update(tiposDeChamado)
            .set({ ordem: posicao + 1 })
            .where(eq(tiposDeChamado.id, id));
        }
        await registrarNaAuditoria(tx, {
          acao: 'tipos-de-chamado.ordenados',
          ator: autorDa(requisicao),
          alvo: { tipo: 'tipos-de-chamado' },
          antes: { ordem: atuais.map(({ nome }) => nome) },
          depois: { ordem: ids.map((id) => pelaId.get(id)?.nome ?? id) },
          origem: origemDa(requisicao),
          momento,
        });
        return { tipos: await lerTiposDeChamado(tx, momento) };
      });
    },
  );

  app.post(
    '/chamados/tipos',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Criar um Rascunho de tipo de chamado, com os padrões do "Novo tipo"',
        response: { 201: TipoDeChamado, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const novo = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const { nome: _nome, formulario, ...padrao } = NOVO_TIPO_DE_CHAMADO;
        const id = await gravarRascunho(tx, nomeDoNovoTipo, {
          ...colunasDoTipo(padrao),
          formulario: { ...formulario },
          criadoEm: momento,
          criadoPor: sessaoDa(requisicao).contaId,
        });
        const tipo = await lerTipoDeChamado(tx, momento, id);
        await registrarNaAuditoria(tx, {
          acao: 'tipo-de-chamado.criado',
          ator: autorDa(requisicao),
          alvo: { tipo: 'tipo-de-chamado', id },
          depois: visaoDoTipoDeChamado(tipo),
          origem: origemDa(requisicao),
          momento,
        });
        return tipo;
      });
      return resposta.code(201).send(novo);
    },
  );

  app.post(
    '/chamados/tipos/:id/duplicacao',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Duplicar um tipo de chamado como Rascunho, com o formulário',
        params: ParametrosDoTipo,
        response: { 201: TipoDeChamadoDuplicado, ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      const duplicado = await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        // Travada, para o descartar da origem ao mesmo tempo terminar antes: sem a trava, a cópia
        // esbarraria na chave estrangeira do `duplicado_de` depois do descarte, com o erro 500 no
        // lugar do 404.
        const origem = await lerLinhaDoTipo(tx, requisicao.params.id, { travar: true });
        const solicitacao = solicitacaoDoDuplicado(
          origem,
          alcance(sessaoDa(requisicao).acesso, 'solicitacoes.atender', await lerArvore(tx)),
        );
        const {
          id: _id,
          orgId: _orgId,
          nome: _nome,
          nomeNormalizado: _nomeNormalizado,
          situacao: _situacao,
          ordem: _ordem,
          criadoEm: _criadoEm,
          criadoPor: _criadoPor,
          duplicadoDe: _duplicadoDe,
          ...copia
        } = origem;
        const id = await gravarRascunho(tx, (numero) => nomeDaCopia(origem.nome, numero), {
          ...copia,
          geraSolicitacao: solicitacao.geraSolicitacao,
          tipoDeAtivoDoEquipamento: solicitacao.tipoDeAtivoDoEquipamento,
          duplicadoDe: origem.id,
          criadoEm: momento,
          criadoPor: sessaoDa(requisicao).contaId,
        });
        const tipo = await lerTipoDeChamado(tx, momento, id);
        await registrarNaAuditoria(tx, {
          acao: 'tipo-de-chamado.criado',
          ator: autorDa(requisicao),
          alvo: { tipo: 'tipo-de-chamado', id },
          depois: { ...visaoDoTipoDeChamado(tipo), duplicadoDe: origem.nome },
          origem: origemDa(requisicao),
          momento,
        });
        return { tipo, solicitacaoDesligada: solicitacao.desligada };
      });
      return resposta.code(201).send(duplicado);
    },
  );

  app.put(
    '/chamados/tipos/:id',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Salvar o tipo de chamado, na situação em que ele está',
        params: ParametrosDoTipo,
        body: PedidoDoTipo,
        response: { 200: TipoDeChamado, ...PROBLEMAS_DA_VIDA },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDoTipo(tx, requisicao.params.id, { travar: true });
        return gravarConferido(tx, requisicao, {
          linha,
          pedido: requisicao.body,
          situacao: linha.situacao,
          acao: 'tipo-de-chamado.alterado',
          momento,
        });
      });
    },
  );

  app.post(
    '/chamados/tipos/:id/criacao',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Criar o tipo: o Rascunho passa a Em uso, com as conferências da gravação',
        params: ParametrosDoTipo,
        body: PedidoDoTipo,
        response: { 200: TipoDeChamado, ...PROBLEMAS_DA_VIDA },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDoTipo(tx, requisicao.params.id, { travar: true });
        if (linha.situacao !== 'rascunho') throw conflito(M.naoERascunho);
        return gravarConferido(tx, requisicao, {
          linha,
          pedido: requisicao.body,
          situacao: 'em-uso',
          acao: 'tipo-de-chamado.alterado',
          momento,
        });
      });
    },
  );

  app.post(
    '/chamados/tipos/:id/inativacao',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Inativar o tipo de chamado; os chamados dele seguem até resolvidos',
        params: ParametrosDoTipo,
        response: { 200: TipoDeChamado, ...PROBLEMAS_DA_VIDA },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDoTipo(tx, requisicao.params.id, { travar: true });
        if (linha.situacao === 'rascunho') throw conflito(M.rascunho);
        const antes = await lerTipoDeChamado(tx, momento, linha.id);
        if (linha.situacao === 'inativo') return antes;
        await tx
          .update(tiposDeChamado)
          .set({ situacao: 'inativo' })
          .where(eq(tiposDeChamado.id, linha.id));
        const depois = await lerTipoDeChamado(tx, momento, linha.id);
        await registrarNaAuditoria(tx, {
          acao: 'tipo-de-chamado.inativado',
          ator: autorDa(requisicao),
          alvo: { tipo: 'tipo-de-chamado', id: linha.id },
          antes: visaoDoTipoDeChamado(antes),
          depois: visaoDoTipoDeChamado(depois),
          origem: origemDa(requisicao),
          momento,
        });
        return depois;
      });
    },
  );

  app.post(
    '/chamados/tipos/:id/reativacao',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Reativar o tipo de chamado, com as conferências da gravação',
        params: ParametrosDoTipo,
        response: { 200: TipoDeChamado, ...PROBLEMAS_DA_VIDA },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDoTipo(tx, requisicao.params.id, { travar: true });
        if (linha.situacao === 'rascunho') throw conflito(M.rascunho);
        if (linha.situacao === 'em-uso') return lerTipoDeChamado(tx, momento, linha.id);
        // Confere o tipo como está gravado: ele não volta com quem atende por padrão desativado, ou
        // com o tipo de ativo do equipamento inativado, enquanto esteve inativo.
        return gravarConferido(tx, requisicao, {
          linha,
          pedido: pedidoDaLinha(linha),
          situacao: 'em-uso',
          acao: 'tipo-de-chamado.reativado',
          momento,
        });
      });
    },
  );

  app.delete(
    '/chamados/tipos/:id',
    {
      config: { permissao: 'chamados.configurar' },
      schema: {
        summary: 'Descartar o Rascunho de tipo de chamado',
        params: ParametrosDoTipo,
        response: { 204: z.null(), ...PROBLEMAS_DA_VIDA },
      },
    },
    async (requisicao, resposta) => {
      const momento = agora();
      await naOrganizacao(banco, orgDa(requisicao), async (tx) => {
        const linha = await lerLinhaDoTipo(tx, requisicao.params.id, { travar: true });
        if (linha.situacao !== 'rascunho') throw conflito(M.naoERascunho);
        const antes = await lerTipoDeChamado(tx, momento, linha.id);
        // As cópias dele perdem a marca de onde vieram, para ele poder sair.
        await tx
          .update(tiposDeChamado)
          .set({ duplicadoDe: null })
          .where(eq(tiposDeChamado.duplicadoDe, linha.id));
        await tx.delete(tiposDeChamado).where(eq(tiposDeChamado.id, linha.id));
        await registrarNaAuditoria(tx, {
          acao: 'tipo-de-chamado.descartado',
          ator: autorDa(requisicao),
          alvo: { tipo: 'tipo-de-chamado', id: linha.id },
          antes: visaoDoTipoDeChamado(antes),
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(204).send(null);
    },
  );
};
