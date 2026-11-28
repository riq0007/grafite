// A sessão da aba (spec aba-dos-colaboradores, "Pessoa pelo usuário do Windows", "Pessoa pela senha
// do AD" e "Sessão da aba"; design, decisões 2, 3 e 4), no escopo da aba. O serviço pede a sessão
// com o token do aparelho: pelo SID de quem está no Windows, ou pelo usuário e a senha do AD, com o
// código do app numa segunda chamada quando a conta o tem. A API confere a pessoa no AD e no Grafite
// e devolve o token da sessão, de 1 hora. A renovação, com o token da sessão, estende a mesma sessão
// e confere a pessoa de novo pela conta de serviço; a pessoa que não passa mais tem a sessão
// encerrada. A da senha termina também com o "Sair" e com 30 minutos sem uso.
import {
  type Banco,
  contas,
  naOrganizacao,
  pessoas,
  type Transacao,
  tentativasDeEntrada,
} from '@grafite/db';
import {
  FRASES_SEM_CONEXAO,
  type MotivoSemConexao,
  mensagemDoBloqueio,
  normalizarUsuario,
} from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DestinoDoBilhete, emitirBilhete, precisaDaEntradaDoChat } from '../aba/bilhete.ts';
import {
  type AparelhoDaRequisicao,
  ContadorDeRecusas,
  exigirEntrada,
  LIMITE_POR_TOKEN_DA_ABA,
  muitasRecusas,
  tokenDaAbaRecusado,
} from '../aba/escopo.ts';
import {
  abrirSessaoDaAba,
  ativarPendenteDaAba,
  auditarPessoaRecusada,
  encerrarSessaoDaAba,
  estenderSessaoDaAba,
  passouDoTeto,
  pendenteDaAba,
  registrarUsoDaAba,
  somarCodigoErrado,
  TENTATIVAS_DO_CODIGO_DA_ABA,
} from '../aba/sessao.ts';
import { exigeDoisPassos } from '../acesso/acesso.ts';
import { conferirCodigoDaConta } from '../acesso/dois-passos.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import type { ChavesDoCofre } from '../cofre/cifra.ts';
import {
  conferirPessoaPeloSid,
  type DetalheDaRecusa,
  type PessoaPeloSid,
  recusaDaConta,
} from '../diretorio/aba.ts';
import type { ConectarDiretorio } from '../diretorio/cliente.ts';
import { lerDiretorio } from '../diretorio/diretorio.ts';
import { conferirNoDiretorio, contaPeloDiretorio } from '../diretorio/entrada.ts';
import { ProblemaDaApi, RespostaDeProblema } from '../problemas.ts';
import { LIMITE_DA_ENTRADA } from '../protecao.ts';
import { conferirAEntrada, credenciaisInvalidas, origemDa, registrarRecusa } from './sessao.ts';

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

const PedidoDaSessaoPelaSenha = z
  .object({
    entrada: z.literal('senha'),
    usuario: z
      .string({ error: 'Informe o usuário.' })
      .trim()
      .min(1, { error: 'Informe o usuário.' })
      .max(64, { error: 'Use até 64 caracteres.' }),
    senha: z.string().min(1).max(1024),
  })
  .strict()
  .meta({ id: 'PedidoDaSessaoDaAbaPelaSenha' });

const PedidoDoCodigoDaAba = z
  .object({
    entrada: z.literal('senha'),
    /** O token da pendente, da primeira chamada. */
    pendente: z.string().min(1).max(200),
    codigo: z.string().trim().min(1).max(32),
  })
  .strict()
  .meta({ id: 'PedidoDoCodigoDaAba' });

const SessaoDaAba = z
  .object({
    /** O token da sessão, que só aparece aqui; a aba o guarda só na memória ou cifrado para a pessoa. */
    token: z.string(),
    expiraEm: z.iso.datetime(),
    pessoa: z.object({ nome: z.string() }),
  })
  .meta({ id: 'SessaoDaAba' });

const FaltaOCodigo = z
  .object({
    faltaOCodigo: z.literal(true),
    /** O token da pendente, de 5 minutos, que volta com o código. */
    pendente: z.string(),
    expiraEm: z.iso.datetime(),
  })
  .meta({ id: 'FaltaOCodigoDaAba' });

const PedidoDeRenovacao = z
  .object({
    /** O SID de quem está no Windows, na entrada pelo Windows; na pela senha, nada. */
    sid: z.string().trim().min(1).max(200).optional(),
  })
  .meta({ id: 'PedidoDeRenovacaoDaSessaoDaAba' });

const Renovacao = z.object({ expiraEm: z.iso.datetime() }).meta({ id: 'RenovacaoDaSessaoDaAba' });

const BilheteDaAba = z
  .object({
    /** O bilhete de uso único, que a aba põe no fragmento de `/chat/entrar`. */
    bilhete: z.string(),
    expiraEm: z.iso.datetime(),
  })
  .meta({ id: 'BilheteDaAba' });

const PROBLEMAS = {
  400: RespostaDeProblema,
  401: RespostaDeProblema,
  403: RespostaDeProblema,
  404: RespostaDeProblema,
  429: RespostaDeProblema,
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

const entradaBloqueada = (restante: number) =>
  new ProblemaDaApi({
    codigo: 'entrada-bloqueada',
    status: 429,
    titulo: 'Entrada bloqueada',
    detalhe: mensagemDoBloqueio(restante),
    extras: { restante: Math.ceil(restante / 1000) },
  });

const pendenteVencida = () =>
  new ProblemaDaApi({
    codigo: 'pendente-da-aba-recusada',
    status: 401,
    titulo: 'Entre de novo',
    detalhe: 'O tempo para o código passou. Entre de novo.',
  });

/** As duas entradas ao mesmo tempo: a da mesma sessão no aparelho, ou a primeira da mesma conta. */
const aoMesmoTempo = (erro: unknown) =>
  violouUnicidade(erro, 'sessoes_da_aba_uma_aberta_por_conta_e_aparelho') ||
  violouUnicidade(erro, 'contas_usuario_unico');

/** A transação da abertura, com uma nova tentativa quando a outra entrada ganhou (decisão 3). */
async function comNovaTentativa<T>(abrir: () => Promise<T>): Promise<T> {
  try {
    return await abrir();
  } catch (erro) {
    if (!aoMesmoTempo(erro)) throw erro;
    try {
      return await abrir();
    } catch (deNovo) {
      if (aoMesmoTempo(deNovo)) throw outraSessaoAoMesmoTempo();
      throw deNovo;
    }
  }
}

async function nomeDaConta(tx: Transacao, contaId: string): Promise<string | null> {
  const [dono] = await tx
    .select({ nome: pessoas.nome })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.id, contaId));
  return dono?.nome ?? null;
}

const doAparelho = (aparelho: AparelhoDaRequisicao) => ({
  computador: aparelho.nome,
  identificador: aparelho.identificadorCurto,
});

export const rotasDaSessaoDaAba: FastifyPluginAsyncZod<{
  banco: Banco;
  agora: () => Date;
  chaveDoisPassos: Buffer;
  conferirDeEngano: (senha: string) => Promise<false>;
  diretorio: { chavesDoCofre: ChavesDoCofre; conectar: ConectarDiretorio };
}> = async (app, { banco, agora, chaveDoisPassos, conferirDeEngano, diretorio }) => {
  // O AD fora do ar, por organização: as abas da empresa tentam de novo como na rede caída, e cada
  // tentativa seguraria o pedido pelo prazo da conexão e gravaria um aviso.
  const adForaDoArAte = new Map<string, number>();
  // Os pedidos pela senha, com o código ou sem ele, por computador, com o limite da entrada, contados
  // na chegada, como o da web, para os pedidos em paralelo não passarem juntos: o token de um
  // computador não testa uma senha comum em muitos usuários, nem códigos, por minuto, abaixo do
  // bloqueio por usuário. O pedido pelo Windows segue no limite do token.
  const pedidosPelaSenha = new ContadorDeRecusas(
    LIMITE_DA_ENTRADA.max,
    LIMITE_DA_ENTRADA.timeWindow,
  );
  const conferir = async (
    orgId: string,
    busca: { sid: string } | { usuario: string },
    avisar: (dados: object, msg: string) => void,
  ): Promise<PessoaPeloSid> => {
    const agoraMs = agora().getTime();
    if ((adForaDoArAte.get(orgId) ?? 0) > agoraMs) {
      return { tipo: 'recusada', motivo: 'ti-fora-do-alcance', detalhe: 'ad-fora-do-ar' };
    }
    const pessoa = await conferirPessoaPeloSid(banco, {
      orgId,
      busca,
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
        summary: 'Abrir a sessão da aba, pelo Windows ou pela senha, com o token do aparelho',
        body: z.union([PedidoDaSessaoPeloWindows, PedidoDaSessaoPelaSenha, PedidoDoCodigoDaAba]),
        response: { 200: z.union([SessaoDaAba, FaltaOCodigo]), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { aparelhoDaAba: aparelho, organizacao } = requisicao;
      if (!aparelho || !organizacao) throw tokenDaAbaRecusado();
      const orgId = organizacao.id;
      const origem = origemDa(requisicao);
      const corpo = requisicao.body;
      exigirEntrada(aparelho, corpo.entrada);
      const avisar = (dados: object, msg: string) => requisicao.log.warn(dados, msg);
      if (corpo.entrada === 'senha') {
        const chegada = agora().getTime();
        const espera = pedidosPelaSenha.espera(aparelho.id, chegada);
        if (espera !== null) throw muitasRecusas(espera);
        pedidosPelaSenha.contar(aparelho.id, chegada);
      }

      if ('codigo' in corpo) {
        // A segunda chamada da entrada pela senha: o código e a pendente.
        const momento = agora();
        const resultado = await naOrganizacao(banco, orgId, async (tx) => {
          const pendente = await pendenteDaAba(tx, { token: corpo.pendente, aparelho, momento });
          if (!pendente) return { tipo: 'vencida' } as const;
          const [conta] = await tx
            .select({ usuario: contas.usuario })
            .from(contas)
            .where(eq(contas.id, pendente.contaId));
          // A conta anonimizada nos 5 minutos da pendente não tem usuário: a pendente não serve.
          const usuario = conta?.usuario;
          if (!usuario) return { tipo: 'vencida' } as const;
          const ator = { tipo: 'conta', contaId: pendente.contaId } as const;
          const { aceito } = await conferirCodigoDaConta(tx, {
            contaId: pendente.contaId,
            codigo: corpo.codigo,
            momento,
            chaveDoisPassos,
            ator,
            origem,
          });
          if (!aceito) {
            const tentativa = await somarCodigoErrado(tx, pendente.id);
            await registrarNaAuditoria(tx, {
              acao: 'segundo-passo.recusado',
              ator,
              alvo: { tipo: 'aparelho-da-aba', id: aparelho.id },
              dados: { tentativa, ...doAparelho(aparelho) },
              origem,
              momento,
            });
            const ate = await registrarRecusa(tx, { usuario, momento });
            if (ate) {
              await registrarNaAuditoria(tx, {
                acao: 'entrada.bloqueada',
                ator: { tipo: 'anonimo' },
                alvo: { tipo: 'conta', id: pendente.contaId },
                dados: { usuario, ate: ate.toISOString(), ...doAparelho(aparelho) },
                origem,
                momento,
              });
            }
            if (tentativa < TENTATIVAS_DO_CODIGO_DA_ABA) return { tipo: 'recusado' } as const;
            await encerrarSessaoDaAba(tx, {
              sessaoId: pendente.id,
              contaId: pendente.contaId,
              usuario,
              aparelho,
              motivo: 'tentativas-esgotadas',
              ator,
              origem,
              momento,
            });
            return { tipo: 'esgotado' } as const;
          }
          // O código certo zera as tentativas do usuário, como na entrada da web.
          await tx
            .update(tentativasDeEntrada)
            .set({ falhasSeguidas: 0, bloqueadaAte: null, atualizadaEm: momento })
            .where(eq(tentativasDeEntrada.usuario, usuario));
          // A conta pode ter mudado nos 5 minutos da pendente.
          const daConta = await recusaDaConta(tx, usuario);
          if (daConta) {
            await encerrarSessaoDaAba(tx, {
              sessaoId: pendente.id,
              contaId: pendente.contaId,
              usuario,
              aparelho,
              motivo: 'pessoa-recusada',
              dados: { recusa: daConta, detalhe: daConta },
              origem,
              momento,
            });
            return { tipo: 'recusada', motivo: daConta } as const;
          }
          const ativa = await ativarPendenteDaAba(tx, {
            sessaoId: pendente.id,
            contaId: pendente.contaId,
            aparelho,
            dados: { pessoa: usuario },
            origem,
            momento,
          });
          return {
            tipo: 'aberta',
            ...ativa,
            nome: (await nomeDaConta(tx, pendente.contaId)) ?? usuario,
          } as const;
        });
        if (resultado.tipo === 'vencida') throw pendenteVencida();
        if (resultado.tipo === 'recusado') {
          throw new ProblemaDaApi({
            codigo: 'codigo-invalido',
            status: 401,
            titulo: 'Código incorreto',
            detalhe: 'Código incorreto.',
          });
        }
        if (resultado.tipo === 'esgotado') {
          throw new ProblemaDaApi({
            codigo: 'tentativas-esgotadas',
            status: 401,
            titulo: 'Tentativas esgotadas',
            detalhe: 'Códigos errados demais. Entre de novo.',
          });
        }
        if (resultado.tipo === 'recusada') throw pessoaRecusada(resultado.motivo);
        return {
          token: resultado.token,
          expiraEm: resultado.expiraEm.toISOString(),
          pessoa: { nome: resultado.nome },
        };
      }

      if ('senha' in corpo) {
        // A entrada pela senha: a mesma conferência da entrada da web, só pelo diretório.
        const usuario = normalizarUsuario(corpo.usuario);
        const ligado = await naOrganizacao(banco, orgId, async (tx) => {
          const lido = await lerDiretorio(tx);
          return lido?.diretorio.ligado === true;
        });
        if (!ligado) throw pessoaRecusada('ti-fora-do-alcance');
        const peloDiretorio = await conferirNoDiretorio(banco, {
          orgId,
          usuario,
          senha: corpo.senha,
          chaves: diretorio.chavesDoCofre,
          conectar: diretorio.conectar,
          avisar,
        });
        const momento = agora();
        const resultado = await comNovaTentativa(() =>
          naOrganizacao(banco, orgId, async (tx) => {
            const conferida = await conferirAEntrada(tx, {
              orgId,
              usuario,
              senha: corpo.senha,
              peloDiretorio,
              momento,
              origem,
              conferirDeEngano,
              daAba: { dados: doAparelho(aparelho) },
            });
            if (conferida.tipo !== 'aceita') return conferida;
            const { conta, nome, doisPassosAtivos, acesso } = conferida;
            if (!doisPassosAtivos && exigeDoisPassos(conta, acesso)) {
              await auditarPessoaRecusada(tx, {
                aparelho,
                motivo: 'cadastrar-o-codigo',
                pessoa: usuario,
                dados: { detalhe: 'sem-o-codigo', usuario: conta.usuario, nome },
                origem,
                momento,
              });
              return { tipo: 'sem-o-codigo' } as const;
            }
            const aberta = await abrirSessaoDaAba(tx, {
              contaId: conta.id,
              aparelho,
              entrada: 'senha',
              pendente: doisPassosAtivos,
              dados: { pessoa: usuario },
              origem,
              momento,
            });
            return { tipo: doisPassosAtivos ? 'pendente' : 'aberta', ...aberta, nome } as const;
          }),
        );
        if (resultado.tipo === 'bloqueada') {
          resposta.header('retry-after', String(Math.ceil(resultado.restante / 1000)));
          throw entradaBloqueada(resultado.restante);
        }
        if (resultado.tipo === 'fora-do-ar') throw pessoaRecusada('ti-fora-do-alcance');
        if (resultado.tipo === 'sem-acesso') throw pessoaRecusada('sem-grupo');
        if (resultado.tipo === 'recusada') throw credenciaisInvalidas();
        if (resultado.tipo === 'sem-o-codigo') throw pessoaRecusada('cadastrar-o-codigo');
        if (resultado.tipo === 'pendente') {
          return {
            faltaOCodigo: true as const,
            pendente: resultado.token,
            expiraEm: resultado.expiraEm.toISOString(),
          };
        }
        return {
          token: resultado.token,
          expiraEm: resultado.expiraEm.toISOString(),
          pessoa: { nome: resultado.nome },
        };
      }

      const { sid, usuarioDoWindows } = corpo;
      const doWindows = usuarioDoWindows ? { usuarioDoWindows } : {};
      const pessoa = await conferir(orgId, { sid }, avisar);
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
      const resultado = await comNovaTentativa(() =>
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
          return {
            tipo: 'aberta',
            ...aberta,
            nome: (await nomeDaConta(tx, contaId)) ?? pessoa.aceita.usuario.nome,
          } as const;
        }),
      );
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
      // A sessão é da entrada que o aparelho tem: a troca da entrada a encerra (tarefa 3.7).
      exigirEntrada(aparelho, sessao.entrada);
      const orgId = organizacao.id;
      const { sid } = requisicao.body;
      if (sessao.entrada === 'windows' && !sid) {
        throw new ProblemaDaApi({
          codigo: 'falta-o-sid',
          status: 400,
          titulo: 'Falta o SID',
          detalhe: 'A renovação pelo Windows leva o SID de quem está no Windows.',
        });
      }
      const origem = origemDa(requisicao);
      const [conta] = await naOrganizacao(banco, orgId, (tx) =>
        tx.select({ usuario: contas.usuario }).from(contas).where(eq(contas.id, sessao.contaId)),
      );
      const usuarioDaConta = conta?.usuario ?? null;
      // Pela senha, a pessoa é a da conta, buscada no AD sem a senha, pela conta de serviço.
      const pessoa: PessoaPeloSid =
        sessao.entrada === 'windows'
          ? await conferir(orgId, { sid: sid ?? '' }, (d, m) => requisicao.log.warn(d, m))
          : usuarioDaConta
            ? await conferir(orgId, { usuario: usuarioDaConta }, (d, m) =>
                requisicao.log.warn(d, m),
              )
            : { tipo: 'recusada', motivo: 'conta-inativa', detalhe: 'conta-inativa' };
      const momento = agora();
      // O AD fora do alcance não encerra a sessão: ela vale até vencer, e a aba tenta de novo.
      if (pessoa.tipo === 'recusada' && pessoa.motivo === 'ti-fora-do-alcance') {
        throw pessoaRecusada(pessoa.motivo);
      }
      const resultado = await naOrganizacao(banco, orgId, async (tx) => {
        const daConta =
          pessoa.tipo === 'aceita' && usuarioDaConta === pessoa.usuario
            ? await recusaDaConta(tx, pessoa.usuario)
            : null;
        const recusada: { motivo: MotivoSemConexao; detalhe: string } | null =
          pessoa.tipo === 'recusada'
            ? pessoa
            : usuarioDaConta !== pessoa.usuario
              ? { motivo: 'usuario-de-fora', detalhe: 'outra-pessoa-no-windows' }
              : daConta
                ? { motivo: daConta, detalhe: daConta }
                : null;
        if (recusada) {
          const { motivo, detalhe } = recusada;
          await encerrarSessaoDaAba(tx, {
            sessaoId: sessao.id,
            contaId: sessao.contaId,
            usuario: usuarioDaConta,
            aparelho,
            motivo: 'pessoa-recusada',
            dados: { recusa: motivo, detalhe, ...(sid ? { sid } : {}) },
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

  app.delete(
    '/aba/sessao',
    {
      config: { daSessaoDaAba: true, rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'Sair da aba: encerra a sessão da aba no servidor',
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { aparelhoDaAba: aparelho, sessaoDaAba: sessao, organizacao } = requisicao;
      if (!aparelho || !sessao || !organizacao) throw tokenDaAbaRecusado();
      await naOrganizacao(banco, organizacao.id, async (tx) => {
        const [conta] = await tx
          .select({ usuario: contas.usuario })
          .from(contas)
          .where(eq(contas.id, sessao.contaId));
        await encerrarSessaoDaAba(tx, {
          sessaoId: sessao.id,
          contaId: sessao.contaId,
          usuario: conta?.usuario ?? null,
          aparelho,
          motivo: 'saida',
          ator: { tipo: 'conta', contaId: sessao.contaId },
          origem: origemDa(requisicao),
          momento: agora(),
        });
      });
      return resposta.code(204).send(null);
    },
  );

  app.post(
    '/aba/bilhete',
    {
      config: { daSessaoDaAba: true, rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'Pedir o bilhete que leva o chat da aba à sessão dele, por 60 s e uma vez só',
        body: DestinoDoBilhete,
        response: { 200: BilheteDaAba, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const { aparelhoDaAba: aparelho, sessaoDaAba: sessao, organizacao } = requisicao;
      if (!aparelho || !sessao || !organizacao) throw tokenDaAbaRecusado();
      const resultado = await naOrganizacao(banco, organizacao.id, async (tx) => {
        // Na entrada pelo Windows, a conta com os dois passos entra pela página do chat, com a
        // senha e o código; a marca da aba liga a sessão que sai de lá a esta.
        if (
          await precisaDaEntradaDoChat(tx, { contaId: sessao.contaId, entrada: sessao.entrada })
        ) {
          return null;
        }
        return emitirBilhete(tx, {
          sessaoDaAbaId: sessao.id,
          destino: requisicao.body,
          momento: agora(),
        });
      });
      if (!resultado) {
        throw new ProblemaDaApi({
          codigo: 'bilhete-pede-a-entrada',
          status: 403,
          titulo: 'Entre no chat',
          detalhe: 'Esta conta entra no chat da aba com a senha e o código.',
          extras: { aba: aparelho.identificadorCurto },
        });
      }
      return { bilhete: resultado.bilhete, expiraEm: resultado.expiraEm.toISOString() };
    },
  );

  app.post(
    '/aba/uso',
    {
      config: { daSessaoDaAba: true, rateLimit: LIMITE_POR_TOKEN_DA_ABA },
      schema: {
        summary: 'O uso da aba ou da tela maior com o foco, no máximo uma vez por minuto',
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { sessaoDaAba: sessao, organizacao } = requisicao;
      if (!sessao || !organizacao) throw tokenDaAbaRecusado();
      await naOrganizacao(banco, organizacao.id, (tx) =>
        registrarUsoDaAba(tx, { sessaoId: sessao.id, momento: agora() }),
      );
      return resposta.code(204).send(null);
    },
  );
};
