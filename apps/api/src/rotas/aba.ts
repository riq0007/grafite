// As rotas do serviço da aba (spec aba-dos-colaboradores, "Aparelho registrado pela chave" e
// "Configuração da aba"; design, decisões 2 e 3), no escopo da aba: o registro com a chave, que
// devolve o token do aparelho, e a configuração com o token. O aparelho é identificado pelo
// identificador da máquina; registrar de novo troca o token, com a entrada e o bloqueio mantidos.
import { randomBytes } from 'node:crypto';
import {
  aparelhosDaAba,
  type Banco,
  chavesDaAba,
  configuracoesDaAba,
  ENTRADAS_DA_ABA,
  FORMAS_DA_ABA,
  naOrganizacao,
  type Transacao,
} from '@grafite/db';
import { identificadorCurto } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  aparelhoBloqueado,
  auditarRecusa,
  chaveRecusada,
  LIMITE_POR_TOKEN_DA_ABA,
  nomeDoComputadorValido,
  tokenDaAbaRecusado,
} from '../aba/escopo.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { RespostaDeProblema } from '../problemas.ts';
import { LIMITE_DA_ENTRADA } from '../protecao.ts';
import { origemDa } from './sessao.ts';

/** Em quantos segundos o serviço relê a configuração. */
const PROXIMA_CONFIGURACAO = 60;
/** O re-registro com outro nome em menos disto vai à auditoria: o `MachineGuid` repetido. */
const UMA_HORA = 60 * 60 * 1000;
/** Quantas vezes o registro sorteia outro identificador curto quando ele já existe. */
const SORTEIOS_DO_IDENTIFICADOR = 5;

const PedidoDeRegistro = z
  .object({
    /** A chave da aba, que o MSI grava no registro do Windows. */
    chave: z.string().min(1).max(200),
    /** O `MachineGuid` do Windows. */
    identificadorDaMaquina: z.string().trim().min(1).max(64),
    /** O nome do computador. */
    nome: z.string().trim().min(1).max(63).refine(nomeDoComputadorValido),
    /** A versão da aba. */
    versao: z
      .string()
      .regex(/^[\x21-\x7e]{1,40}$/)
      .optional(),
    /** A entrada que o MSI sugere, só para o primeiro registro. */
    entradaSugerida: z.enum(ENTRADAS_DA_ABA).optional(),
  })
  .meta({ id: 'PedidoDeRegistroDaAba' });

const RegistroDaAba = z
  .object({
    /** O token do aparelho, que só aparece aqui; o serviço o guarda cifrado. */
    token: z.string(),
    entrada: z.enum(ENTRADAS_DA_ABA),
    /** Os 6 caracteres do Crockford que o comando no servidor aceita. */
    identificadorCurto: z.string(),
  })
  .meta({ id: 'RegistroDaAba' });

const ConfiguracaoDaAba = z
  .object({
    forma: z.enum(FORMAS_DA_ABA),
    /** O contato de reserva, que a aba sem conexão mostra. */
    contato: z.string().nullable(),
    entrada: z.enum(ENTRADAS_DA_ABA),
    /** Sobe a cada mudança; 0 enquanto a organização não configurou a aba. */
    versao: z.number().int(),
    /** Em quantos segundos reler a configuração. */
    proximaEm: z.number().int(),
  })
  .meta({ id: 'ConfiguracaoDaAba' });

const PROBLEMAS = { 401: RespostaDeProblema, 403: RespostaDeProblema, 404: RespostaDeProblema };

type ResultadoDoRegistro =
  | { tipo: 'registrado'; token: string; entrada: (typeof ENTRADAS_DA_ABA)[number]; curto: string }
  | { tipo: 'chave-recusada' }
  | { tipo: 'bloqueado' };

const novoToken = () => randomBytes(32).toString('base64url');

async function registrar(
  tx: Transacao,
  pedido: z.infer<typeof PedidoDeRegistro>,
  { momento, origem }: { momento: Date; origem: { ip: string; codigoDeRastreio: string } },
): Promise<ResultadoDoRegistro> {
  const [chave] = await tx
    .select({ id: chavesDaAba.id })
    .from(chavesDaAba)
    .where(eq(chavesDaAba.hash, hashDoToken(pedido.chave)));
  if (!chave) {
    await auditarRecusa(tx, {
      acao: 'chave-da-aba.recusada',
      origem,
      momento,
      dados: { computador: pedido.nome },
    });
    return { tipo: 'chave-recusada' };
  }
  const token = novoToken();
  const [existente] = await tx
    .select()
    .from(aparelhosDaAba)
    .where(eq(aparelhosDaAba.identificadorDaMaquina, pedido.identificadorDaMaquina))
    .for('update');
  if (existente?.bloqueadoEm) return { tipo: 'bloqueado' };
  if (existente) {
    await tx
      .update(aparelhosDaAba)
      .set({
        tokenHash: hashDoToken(token),
        tokenTrocadoEm: momento,
        ultimoContatoEm: momento,
        nome: pedido.nome,
        ...(pedido.versao ? { versao: pedido.versao } : {}),
      })
      .where(eq(aparelhosDaAba.id, existente.id));
    const dados = { computador: pedido.nome, identificador: existente.identificadorCurto };
    await registrarNaAuditoria(tx, {
      acao: 'aparelho-da-aba.registrado',
      ator: { tipo: 'anonimo' },
      alvo: { tipo: 'aparelho-da-aba', id: existente.id },
      dados: { ...dados, primeiro: false },
      origem,
      momento,
    });
    const outroNome = existente.nome !== pedido.nome;
    if (outroNome && momento.getTime() - existente.tokenTrocadoEm.getTime() < UMA_HORA) {
      await registrarNaAuditoria(tx, {
        acao: 'aparelho-da-aba.registrado-com-outro-nome',
        ator: { tipo: 'anonimo' },
        alvo: { tipo: 'aparelho-da-aba', id: existente.id },
        antes: { nome: existente.nome },
        depois: { nome: pedido.nome },
        dados,
        origem,
        momento,
      });
    }
    return {
      tipo: 'registrado',
      token,
      entrada: existente.entrada,
      curto: existente.identificadorCurto,
    };
  }
  const entrada = pedido.entradaSugerida ?? 'windows';
  for (let tentativa = 1; ; tentativa++) {
    const curto = identificadorCurto(randomBytes(6));
    try {
      // Num ponto de retorno: o identificador repetido não perde a transação do registro.
      const [criado] = await tx.transaction((ponto) =>
        ponto
          .insert(aparelhosDaAba)
          .values({
            orgId: sql`app.current_org()`,
            identificadorDaMaquina: pedido.identificadorDaMaquina,
            identificadorCurto: curto,
            nome: pedido.nome,
            versao: pedido.versao ?? null,
            entrada,
            tokenHash: hashDoToken(token),
            registradoEm: momento,
            tokenTrocadoEm: momento,
            ultimoContatoEm: momento,
          })
          .returning({ id: aparelhosDaAba.id }),
      );
      if (!criado) throw new Error('O aparelho da aba não foi gravado.');
      await registrarNaAuditoria(tx, {
        acao: 'aparelho-da-aba.registrado',
        ator: { tipo: 'anonimo' },
        alvo: { tipo: 'aparelho-da-aba', id: criado.id },
        dados: { computador: pedido.nome, identificador: curto, primeiro: true, entrada },
        origem,
        momento,
      });
      return { tipo: 'registrado', token, entrada, curto };
    } catch (erro) {
      const repetido = violouUnicidade(erro, 'aparelhos_da_aba_identificador_curto_unico');
      if (!repetido || tentativa >= SORTEIOS_DO_IDENTIFICADOR) throw erro;
    }
  }
}

export const rotasDaAba: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  app.post(
    '/aba/aparelho',
    {
      config: { semTokenDaAba: true, rateLimit: LIMITE_DA_ENTRADA },
      schema: {
        summary: 'Registrar o computador na aba, com a chave da organização',
        body: PedidoDeRegistro,
        response: { 200: RegistroDaAba, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const orgId = requisicao.organizacao?.id;
      if (!orgId) throw chaveRecusada();
      const momento = agora();
      const pedido = requisicao.body;
      const registro = async () =>
        naOrganizacao(banco, orgId, (tx) =>
          registrar(tx, pedido, { momento, origem: origemDa(requisicao) }),
        );
      let resultado: ResultadoDoRegistro;
      try {
        resultado = await registro();
      } catch (erro) {
        // A mesma máquina registrando duas vezes ao mesmo tempo: a segunda acha a primeira.
        if (!violouUnicidade(erro, 'aparelhos_da_aba_maquina_unica')) throw erro;
        resultado = await registro();
      }
      if (resultado.tipo === 'chave-recusada') throw chaveRecusada();
      if (resultado.tipo === 'bloqueado') throw aparelhoBloqueado();
      return {
        token: resultado.token,
        entrada: resultado.entrada,
        identificadorCurto: resultado.curto,
      };
    },
  );

  app.get(
    '/aba/configuracao',
    {
      config: { rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'A configuração da aba deste computador: a forma, o contato e a entrada',
        response: { 200: ConfiguracaoDaAba, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { aparelhoDaAba, organizacao } = requisicao;
      if (!aparelhoDaAba || !organizacao) throw tokenDaAbaRecusado();
      const [linha] = await naOrganizacao(banco, organizacao.id, (tx) =>
        tx
          .select({
            forma: configuracoesDaAba.forma,
            contato: configuracoesDaAba.contato,
            versao: configuracoesDaAba.versao,
          })
          .from(configuracoesDaAba),
      );
      return {
        forma: linha?.forma ?? 'pilula',
        contato: linha?.contato ?? null,
        entrada: aparelhoDaAba.entrada,
        versao: linha?.versao ?? 0,
        proximaEm: PROXIMA_CONFIGURACAO,
      };
    },
  );
};
