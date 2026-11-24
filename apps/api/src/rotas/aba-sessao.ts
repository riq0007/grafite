// A sessão da aba pelo Windows (spec aba-dos-colaboradores, "Pessoa pelo usuário do Windows" e
// "Sessão da aba"; design, decisões 3 e 4), no escopo da aba. O serviço pede a sessão com o token do
// aparelho e o SID de quem está no Windows; a API confere a pessoa no AD e no Grafite, o teto do
// aparelho, e devolve o token da sessão, de 1 hora. A renovação, com o token da sessão, estende a
// mesma sessão e confere a pessoa de novo; a pessoa que não passa mais tem a sessão encerrada.
import { type Banco, contas, naOrganizacao, pessoas } from '@grafite/db';
import { FRASES_SEM_CONEXAO, type MotivoSemConexao } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigirEntrada, LIMITE_POR_TOKEN_DA_ABA, tokenDaAbaRecusado } from '../aba/escopo.ts';
import {
  abrirSessaoDaAba,
  auditarPessoaRecusada,
  encerrarSessaoDaAba,
  estenderSessaoDaAba,
  passouDoTeto,
} from '../aba/sessao.ts';
import { violouUnicidade } from '../banco.ts';
import type { ChavesDoCofre } from '../cofre/cifra.ts';
import {
  conferirPessoaPeloSid,
  type DetalheDaRecusa,
  type PessoaPeloSid,
  recusaDaConta,
} from '../diretorio/aba.ts';
import type { ConectarDiretorio } from '../diretorio/cliente.ts';
import { contaPeloDiretorio } from '../diretorio/entrada.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { origemDa } from './sessao.ts';

/** Quanto tempo a API responde o AD fora do ar sem tentar de novo. */
const PAUSA_DO_AD_FORA_DO_AR = 30_000;

const PedidoDaSessaoPeloWindows = z
  .object({
    entrada: z.literal('windows'),
    /** O SID de quem está do outro lado do pipe, que o serviço lê do Windows. */
    sid: z.string().trim().min(1).max(200),
    /** O usuário do Windows, como `EMPRESA\fernanda.lima`, só para a auditoria. */
    usuarioDoWindows: z.string().trim().min(1).max(256).optional(),
  })
  .meta({ id: 'PedidoDaSessaoDaAba' });

const SessaoDaAba = z
  .object({
    /** O token da sessão, que só aparece aqui; a aba o guarda cifrado só para a pessoa. */
    token: z.string(),
    expiraEm: z.iso.datetime(),
    pessoa: z.object({ nome: z.string() }),
  })
  .meta({ id: 'SessaoDaAba' });

const PedidoDeRenovacao = z
  .object({ sid: z.string().trim().min(1).max(200) })
  .meta({ id: 'PedidoDeRenovacaoDaSessaoDaAba' });

const Renovacao = z.object({ expiraEm: z.iso.datetime() }).meta({ id: 'RenovacaoDaSessaoDaAba' });

const PROBLEMAS = {
  401: RespostaDeProblema,
  403: RespostaDeProblema,
  404: RespostaDeProblema,
  503: RespostaDeProblema,
};

/** A pessoa recusada: o motivo vai junto, para a aba sem conexão mostrar a frase dele. */
export const pessoaRecusada = (motivo: MotivoSemConexao) =>
  new ProblemaDaApi({
    codigo: 'pessoa-recusada-na-aba',
    // O AD fora do alcance passa: a aba tenta de novo sozinha, como na rede caída.
    status: motivo === 'ti-fora-do-alcance' ? 503 : 403,
    titulo: 'Pessoa recusada na aba',
    detalhe: FRASES_SEM_CONEXAO[motivo],
    extras: { motivo },
  });

const outraSessaoAoMesmoTempo = () =>
  new ProblemaDaApi({
    codigo: 'sessao-da-aba-ao-mesmo-tempo',
    status: 503,
    titulo: 'Tente de novo',
    detalhe: 'Outra sessão da aba foi aberta ao mesmo tempo. Tente de novo.',
  });

export const rotasDaSessaoDaAba: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  diretorio: { chavesDoCofre: ChavesDoCofre; conectar: ConectarDiretorio };
}> = async (app, { banco, agora, diretorio }) => {
  // O AD fora do ar, por organização: as abas da empresa tentam de novo como na rede caída, e cada
  // tentativa seguraria o pedido pelo prazo da conexão e gravaria um aviso.
  const adForaDoArAte = new Map<string, number>();
  const conferir = async (
    orgId: string,
    sid: string,
    avisar: (dados: object, msg: string) => void,
  ): Promise<PessoaPeloSid> => {
    const agoraMs = agora().getTime();
    if ((adForaDoArAte.get(orgId) ?? 0) > agoraMs) {
      return { tipo: 'recusada', motivo: 'ti-fora-do-alcance', detalhe: 'ad-fora-do-ar' };
    }
    const pessoa = await conferirPessoaPeloSid(banco, {
      orgId,
      sid,
      chaves: diretorio.chavesDoCofre,
      conectar: diretorio.conectar,
      avisar,
    });
    if (pessoa.tipo === 'recusada' && pessoa.detalhe === 'ad-fora-do-ar') {
      adForaDoArAte.set(orgId, agoraMs + PAUSA_DO_AD_FORA_DO_AR);
    } else {
      adForaDoArAte.delete(orgId);
    }
    return pessoa;
  };

  app.post(
    '/aba/sessao',
    {
      config: { rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'Abrir a sessão da aba para a pessoa do Windows, com o token do aparelho',
        body: PedidoDaSessaoPeloWindows,
        response: { 200: SessaoDaAba, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { aparelhoDaAba: aparelho, organizacao } = requisicao;
      if (!aparelho || !organizacao) throw tokenDaAbaRecusado();
      exigirEntrada(aparelho, 'windows');
      const orgId = organizacao.id;
      const { sid, usuarioDoWindows } = requisicao.body;
      const origem = origemDa(requisicao);
      const doWindows = usuarioDoWindows ? { usuarioDoWindows } : {};
      const pessoa = await conferir(orgId, sid, (dados, msg) => requisicao.log.warn(dados, msg));
      // Lido depois do AD, que pode levar segundos: a validade conta do fim da conferência.
      const momento = agora();
      const recusar = async (
        motivo: MotivoSemConexao,
        detalhe: DetalheDaRecusa | 'teto',
        quem?: { usuario: string; nome: string },
      ) => {
        // O AD fora do ar não é da pessoa: fica só no aviso do log, e não um registro por computador.
        if (motivo !== 'ti-fora-do-alcance') {
          await naOrganizacao(banco, orgId, (tx) =>
            auditarPessoaRecusada(tx, {
              aparelho,
              motivo,
              // O SID fora da forma não vai inteiro: é o que o cliente mandou, até 200 caracteres.
              pessoa: detalhe === 'sid-fora-da-forma' ? 'fora-da-forma' : sid,
              dados: { detalhe, ...quem, ...doWindows },
              origem,
              momento,
            }),
          );
        }
        return pessoaRecusada(motivo);
      };
      if (pessoa.tipo === 'recusada') {
        throw await recusar(pessoa.motivo, pessoa.detalhe, pessoa.quem);
      }
      const quem = { usuario: pessoa.usuario, nome: pessoa.aceita.usuario.nome };
      const abrir = () =>
        naOrganizacao(banco, orgId, async (tx) => {
          // A conta pode ter mudado entre a conferência e a transação.
          const daConta = await recusaDaConta(tx, pessoa.usuario);
          if (daConta) return { tipo: 'recusada', motivo: daConta, detalhe: daConta } as const;
          if (await passouDoTeto(tx, { aparelho, usuario: pessoa.usuario, momento })) {
            return { tipo: 'recusada', motivo: 'teto-do-aparelho', detalhe: 'teto' } as const;
          }
          const contaId = await contaPeloDiretorio(tx, {
            orgId,
            usuario: pessoa.usuario,
            aceita: pessoa.aceita,
            momento,
          });
          const aberta = await abrirSessaoDaAba(tx, {
            contaId,
            aparelho,
            entrada: 'windows',
            dados: { pessoa: sid, ...doWindows },
            origem,
            momento,
          });
          const [dono] = await tx
            .select({ nome: pessoas.nome })
            .from(contas)
            .innerJoin(
              pessoas,
              and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)),
            )
            .where(eq(contas.id, contaId));
          return {
            tipo: 'aberta',
            ...aberta,
            nome: dono?.nome ?? pessoa.aceita.usuario.nome,
          } as const;
        });
      // Duas entradas ao mesmo tempo: a da mesma sessão no aparelho, ou a primeira da mesma conta.
      const aoMesmoTempo = (erro: unknown) =>
        violouUnicidade(erro, 'sessoes_da_aba_uma_aberta_por_conta_e_aparelho') ||
        violouUnicidade(erro, 'contas_usuario_unico');
      let resultado: Awaited<ReturnType<typeof abrir>>;
      try {
        resultado = await abrir();
      } catch (erro) {
        if (!aoMesmoTempo(erro)) throw erro;
        // A outra entrada ganhou: esta encerra a dela e abre de novo, uma vez.
        try {
          resultado = await abrir();
        } catch (deNovo) {
          if (aoMesmoTempo(deNovo)) throw outraSessaoAoMesmoTempo();
          throw deNovo;
        }
      }
      if (resultado.tipo === 'recusada') {
        throw await recusar(resultado.motivo, resultado.detalhe, quem);
      }
      return {
        token: resultado.token,
        expiraEm: resultado.expiraEm.toISOString(),
        pessoa: { nome: resultado.nome },
      };
    },
  );

  app.post(
    '/aba/sessao/renovar',
    {
      config: { daSessaoDaAba: true, rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'Renovar a sessão da aba, conferindo a pessoa de novo',
        body: PedidoDeRenovacao,
        response: { 200: Renovacao, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { aparelhoDaAba: aparelho, sessaoDaAba: sessao, organizacao } = requisicao;
      if (!aparelho || !sessao || !organizacao) throw tokenDaAbaRecusado();
      exigirEntrada(aparelho, 'windows');
      const orgId = organizacao.id;
      const { sid } = requisicao.body;
      const origem = origemDa(requisicao);
      const pessoa = await conferir(orgId, sid, (dados, msg) => requisicao.log.warn(dados, msg));
      const momento = agora();
      // O AD fora do alcance não encerra a sessão: ela vale até vencer, e a aba tenta de novo.
      if (pessoa.tipo === 'recusada' && pessoa.motivo === 'ti-fora-do-alcance') {
        throw pessoaRecusada(pessoa.motivo);
      }
      const resultado = await naOrganizacao(banco, orgId, async (tx) => {
        const [conta] = await tx
          .select({ usuario: contas.usuario })
          .from(contas)
          .where(eq(contas.id, sessao.contaId));
        const daConta =
          pessoa.tipo === 'aceita' && conta?.usuario === pessoa.usuario
            ? await recusaDaConta(tx, pessoa.usuario)
            : null;
        const recusada: { motivo: MotivoSemConexao; detalhe: string } | null =
          pessoa.tipo === 'recusada'
            ? pessoa
            : conta?.usuario !== pessoa.usuario
              ? { motivo: 'usuario-de-fora', detalhe: 'outra-pessoa-no-windows' }
              : daConta
                ? { motivo: daConta, detalhe: daConta }
                : null;
        if (recusada) {
          const { motivo, detalhe } = recusada;
          await encerrarSessaoDaAba(tx, {
            sessaoId: sessao.id,
            contaId: sessao.contaId,
            usuario: conta?.usuario ?? null,
            aparelho,
            motivo: 'pessoa-recusada',
            dados: { recusa: motivo, detalhe, sid },
            origem,
            momento,
          });
          return { tipo: 'recusada', motivo } as const;
        }
        if (pessoa.tipo !== 'aceita') throw new Error('A pessoa da renovação não foi aceita.');
        await contaPeloDiretorio(tx, {
          orgId,
          usuario: pessoa.usuario,
          aceita: pessoa.aceita,
          momento,
        });
        const expiraEm = await estenderSessaoDaAba(tx, { sessaoId: sessao.id, momento });
        return { tipo: 'renovada', expiraEm } as const;
      });
      if (resultado.tipo === 'recusada') throw pessoaRecusada(resultado.motivo);
      return { expiraEm: resultado.expiraEm.toISOString() };
    },
  );
};
