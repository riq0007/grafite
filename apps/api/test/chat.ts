// O chat dos testes de integração (change chat-com-chamados): a organização com as contas que usam o
// chat, os perfis, os grupos e os tipos de chamado de fábrica, e as funções que gravam as equipes,
// os canais, as conversas diretas, as mensagens e as leituras direto no banco, como as rotas gravam.

import {
  chamados,
  conversas,
  horarioDaTi,
  leiturasDasConversas,
  membrosDoGrupo,
  mensagensDoChat,
  mensagensDosChamados,
  naOrganizacao,
  notificacoes,
  numeracaoDosChamados,
  reacoesDasMensagens,
  tiposDeChamado,
} from '@grafite/db';
import { assuntoDaConversa, normalizarTexto } from '@grafite/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { expect } from 'vitest';
import { criarTiposDeFabrica } from '../src/chamados/fabrica.ts';
import { HORARIO_DOS_CHAMADOS } from './chamados.ts';
import {
  type ApiDeTeste,
  atribuir,
  clienteDaApi,
  criarConta,
  criarGrupo,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  incluirNoGrupo,
  SEM_ENTRADA,
} from './integracao.ts';

/**
 * As contas, pelo usuário:
 * - `fernanda`, `paulo` e `tatiana`: usam o chat pelo grupo Todos e são do grupo Financeiro;
 * - `ana`: usa o chat e atende os chamados da organização inteira, pelo perfil dela, e é do grupo TI;
 * - `livia`: administra a organização, com todas as permissões;
 * - `rita`: não usa o chat.
 */
export const CONTAS_DO_CHAT = {
  fernanda: 'Fernanda Rocha',
  paulo: 'Paulo Nunes',
  tatiana: 'Tatiana Ramos',
  ana: 'Ana Souza',
  livia: 'Lívia Prates',
  rita: 'Rita Moraes',
} as const;
export type UsuarioDoChat = keyof typeof CONTAS_DO_CHAT;

export type ChatDeTeste = Awaited<ReturnType<typeof montarChat>>;

/**
 * Monta a organização do chat no endereço, com os tipos de chamado de fábrica, o horário da TI e o
 * primeiro chamado no #1042. Nenhuma equipe nem canal: cada teste cria os seus. As sessões entram no
 * momento do relógio.
 */
export async function montarChat(api: ApiDeTeste, host: string) {
  const org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, async (tx) => {
    await criarTiposDeFabrica(tx, {
      ator: { tipo: 'sistema', descricao: 'teste do chat' },
      momento: api.relogio.agora(),
    });
    await tx.insert(horarioDaTi).values({
      orgId: org,
      ...HORARIO_DOS_CHAMADOS,
      dias: [...HORARIO_DOS_CHAMADOS.dias],
    });
    await tx.insert(numeracaoDosChamados).values({ orgId: org, ultimo: 1041 });
  });
  const tipos = Object.fromEntries(
    (
      await naOrganizacao(api.banco, org, (tx) =>
        tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
      )
    ).map(({ id, nome }) => [nome, id]),
  );

  const contasDe = {} as Record<UsuarioDoChat, string>;
  const pessoasDe = {} as Record<UsuarioDoChat, string>;
  for (const [usuario, nome] of Object.entries(CONTAS_DO_CHAT)) {
    const conta = await criarConta(api, org, { usuario, nome });
    contasDe[usuario as UsuarioDoChat] = conta.id;
    pessoasDe[usuario as UsuarioDoChat] = conta.pessoaId;
  }
  const perfis = {
    colaborador: await criarPerfil(api, org, {
      nome: 'Colaborador',
      permissoes: ['chat.usar', 'chamados.pedir'],
    }),
    ti: await criarPerfil(api, org, {
      nome: 'TI',
      permissoes: ['chat.usar', 'chamados.atender', 'pessoas.ver'],
    }),
    administrador: await criarPerfil(api, org, { nome: 'Administrador', administrador: true }),
  };
  const grupos = {
    todos: await criarGrupo(api, org, { nome: 'Todos' }),
    financeiro: await criarGrupo(api, org, { nome: 'Financeiro' }),
    ti: await criarGrupo(api, org, { nome: 'TI' }),
  };
  await atribuir(api, org, { perfilId: perfis.colaborador, grupoId: grupos.todos });
  for (const usuario of ['fernanda', 'paulo', 'tatiana'] as const) {
    await incluirNoGrupo(api, org, { grupoId: grupos.todos, contaId: contasDe[usuario] });
    await incluirNoGrupo(api, org, { grupoId: grupos.financeiro, contaId: contasDe[usuario] });
  }
  await atribuir(api, org, { perfilId: perfis.ti, contaId: contasDe.ana });
  await incluirNoGrupo(api, org, { grupoId: grupos.ti, contaId: contasDe.ana });
  await atribuir(api, org, { perfilId: perfis.administrador, contaId: contasDe.livia });

  const cliente = clienteDaApi(api, host);
  const entradas: Partial<Record<UsuarioDoChat, Entrada>> = {};
  const conta = (usuario: UsuarioDoChat) => contasDe[usuario];
  const naOrg = <T>(fn: Parameters<typeof naOrganizacao<T>>[2]) =>
    naOrganizacao(api.banco, org, fn);

  /** Uma equipe ou um canal, direto no banco. */
  const criarEquipeOuCanal = async (
    tipo: 'equipe' | 'canal',
    nome: string,
    {
      grupo = null,
      escreve = null,
      avisar = false,
      arquivada = false,
    }: { grupo?: string | null; escreve?: string | null; avisar?: boolean; arquivada?: boolean },
  ) => {
    const [linha] = await naOrg((tx) =>
      tx
        .insert(conversas)
        .values({
          orgId: org,
          tipo,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          grupoId: grupo,
          escreveGrupoId: escreve,
          avisar,
          arquivadaEm: arquivada ? api.relogio.agora() : null,
        })
        .returning({ id: conversas.id }),
    );
    return linha?.id ?? '';
  };

  return {
    org,
    cliente,
    tipos,
    perfis,
    grupos,
    conta,
    pessoa: (usuario: UsuarioDoChat) => pessoasDe[usuario],
    /** A sessão do usuário; a de quem não entrou não autentica. */
    como: (usuario: UsuarioDoChat) => entradas[usuario] ?? SEM_ENTRADA,

    /** Entra, no momento do relógio, com todas as contas, ou com as dadas. */
    async entrar(...usuarios: UsuarioDoChat[]) {
      const quem = usuarios.length > 0 ? usuarios : (Object.keys(contasDe) as UsuarioDoChat[]);
      for (const usuario of quem) entradas[usuario] = await cliente.entrar(usuario);
    },

    /** Uma equipe, com o grupo cujas contas participam. */
    criarEquipe: (
      nome: string,
      grupo: string,
      opcoes: { escreve?: string | null; avisar?: boolean; arquivada?: boolean } = {},
    ) => criarEquipeOuCanal('equipe', nome, { ...opcoes, grupo }),

    /** Um canal, de todas as contas que usam o chat. */
    criarCanal: (
      nome: string,
      opcoes: { escreve?: string | null; avisar?: boolean; arquivada?: boolean } = {},
    ) => criarEquipeOuCanal('canal', nome, opcoes),

    /** A conversa direta das duas contas, com o par na ordem do banco, nascida agora. */
    async criarDireta(um: UsuarioDoChat, outro: UsuarioDoChat) {
      const [contaA, contaB] = [contasDe[um], contasDe[outro]].sort();
      const [linha] = await naOrg((tx) =>
        tx
          .insert(conversas)
          .values({
            orgId: org,
            tipo: 'direta',
            contaA,
            contaB,
            ultimaMensagemEm: api.relogio.agora(),
          })
          .returning({ id: conversas.id }),
      );
      return linha?.id ?? '';
    },

    /**
     * A mensagem do usuário na conversa, no momento do relógio, com a última mensagem da conversa
     * atualizada antes, como a rota grava. Devolve o id.
     */
    async mensagem(conversaId: string, usuario: UsuarioDoChat, texto = 'Bom dia!') {
      const momento = api.relogio.agora();
      const [linha] = await naOrg(async (tx) => {
        await tx
          .update(conversas)
          .set({ ultimaMensagemEm: momento })
          .where(eq(conversas.id, conversaId));
        return tx
          .insert(mensagensDoChat)
          .values({
            orgId: org,
            conversaId,
            especie: 'mensagem',
            autorConta: contasDe[usuario],
            texto,
            criadaEm: momento,
          })
          .returning({ id: mensagensDoChat.id });
      });
      return linha?.id ?? '';
    },

    /** A leitura da conta, até a mensagem, direto no banco. */
    lerAte: (usuario: UsuarioDoChat, conversaId: string, mensagemId: string) =>
      naOrg((tx) =>
        tx
          .insert(leiturasDasConversas)
          .values({ orgId: org, conversaId, contaId: contasDe[usuario], lidaAte: mensagemId })
          .onConflictDoUpdate({
            target: [
              leiturasDasConversas.orgId,
              leiturasDasConversas.contaId,
              leiturasDasConversas.conversaId,
            ],
            set: { lidaAte: mensagemId },
          }),
      ),

    /** A conversa silenciada pela conta, direto no banco. */
    silenciar: (usuario: UsuarioDoChat, conversaId: string) =>
      naOrg((tx) =>
        tx
          .insert(leiturasDasConversas)
          .values({ orgId: org, conversaId, contaId: contasDe[usuario], silenciada: true })
          .onConflictDoUpdate({
            target: [
              leiturasDasConversas.orgId,
              leiturasDasConversas.contaId,
              leiturasDasConversas.conversaId,
            ],
            set: { silenciada: true },
          }),
      ),

    /** A conta sai do grupo agora, como a saída grava. */
    sairDoGrupo: (usuario: UsuarioDoChat, grupoId: string) =>
      naOrg((tx) =>
        tx
          .update(membrosDoGrupo)
          .set({ encerradaEm: api.relogio.agora() })
          .where(
            and(
              eq(membrosDoGrupo.grupoId, grupoId),
              eq(membrosDoGrupo.contaId, contasDe[usuario]),
              isNull(membrosDoGrupo.encerradaEm),
            ),
          ),
      ),

    /** Abre pela TI, como a Ana, o chamado do tipo Outro da pessoa do usuário e devolve o número. */
    async abrirChamado(usuario: UsuarioDoChat, texto = 'A cadeira da sala 3 quebrou.') {
      const r = await cliente.enviar('POST', '/chamados', entradas.ana ?? SEM_ENTRADA, {
        pessoa: pessoasDe[usuario],
        tipo: tipos.Outro,
        respostas: { relato: texto },
        ficaComigo: true,
      });
      expect(r.statusCode, r.body).toBe(201);
      return (r.json() as { numero: number }).numero;
    },

    /**
     * A mensagem da TI, como a Ana, na conversa do chamado, direto no banco, com as opções da
     * pergunta, se há. Devolve o id.
     */
    async mensagemDaTi(
      numero: number,
      texto = 'Já vi aqui.',
      { opcoes = null }: { opcoes?: string[] | null } = {},
    ) {
      const [linha] = await naOrg(async (tx) => {
        const [chamado] = await tx
          .select({ id: chamados.id })
          .from(chamados)
          .where(eq(chamados.numero, numero));
        return tx
          .insert(mensagensDosChamados)
          .values({
            orgId: org,
            chamadoId: chamado?.id ?? '',
            especie: 'mensagem',
            autorConta: contasDe.ana,
            texto,
            opcoes,
            criadaEm: api.relogio.agora(),
          })
          .returning({ id: mensagensDosChamados.id });
      });
      return linha?.id ?? '';
    },

    /** A reação da conta à mensagem, no momento do relógio, direto no banco. */
    reagir: (usuario: UsuarioDoChat, mensagemId: string, texto: string) =>
      naOrg((tx) =>
        tx.insert(reacoesDasMensagens).values({
          orgId: org,
          mensagemId,
          contaId: contasDe[usuario],
          texto,
          criadaEm: api.relogio.agora(),
        }),
      ),

    /** A equipe ou o canal arquivado, no momento do relógio, direto no banco. */
    arquivar: (conversaId: string) =>
      naOrg((tx) =>
        tx
          .update(conversas)
          .set({ arquivadaEm: api.relogio.agora() })
          .where(eq(conversas.id, conversaId)),
      ),

    /** A notificação da mensagem do chat à conta, como a tarefa `chat.notificar` grava. */
    notificarMensagem: async (usuario: UsuarioDoChat, conversaId: string, mensagemId: string) => {
      const [linha] = await naOrg((tx) =>
        tx
          .insert(notificacoes)
          .values({
            orgId: org,
            contaId: contasDe[usuario],
            severidade: 'info',
            titulo: 'Mensagem no chat',
            origem: 'chat',
            destino: `/chat/c/${conversaId}?m=${mensagemId}`,
            mensagem: true,
            assunto: assuntoDaConversa(conversaId),
            mensagemDoChatId: mensagemId,
            criadaEm: api.relogio.agora(),
          })
          .returning({ id: notificacoes.id }),
      );
      return linha?.id ?? '';
    },

    /**
     * O chamado passa a ser da mensagem, como a abertura pelo chat grava a origem: a conversa e a
     * mensagem, quem abriu e a linha `origem`, com a cópia da mensagem, de onde saem as marcas.
     */
    virarChamadoDa: (
      numero: number,
      conversaId: string,
      mensagemId: string,
      usuario: UsuarioDoChat,
    ) =>
      naOrg(async (tx) => {
        const [chamado] = await tx
          .update(chamados)
          .set({
            origem: 'chat',
            origemConversaId: conversaId,
            origemMensagemId: mensagemId,
            abertoPor: contasDe[usuario],
          })
          .where(eq(chamados.numero, numero))
          .returning({ id: chamados.id, abertoEm: chamados.abertoEm });
        const [mensagem] = await tx
          .select({
            autorConta: mensagensDoChat.autorConta,
            texto: mensagensDoChat.texto,
            criadaEm: mensagensDoChat.criadaEm,
          })
          .from(mensagensDoChat)
          .where(eq(mensagensDoChat.id, mensagemId));
        if (!chamado || !mensagem) throw new Error('O chamado ou a mensagem não existe.');
        await tx.insert(mensagensDosChamados).values({
          orgId: org,
          chamadoId: chamado.id,
          especie: 'origem',
          autorConta: mensagem.autorConta,
          texto: mensagem.texto,
          dados: {
            conversa: conversaId,
            mensagem: mensagemId,
            em: mensagem.criadaEm.toISOString(),
          },
          criadaEm: chamado.abertoEm,
        });
      }),

    /** O chamado aguardando a pessoa, com o relógio parado, direto no banco. */
    deixarAguardando: (numero: number) =>
      naOrg((tx) =>
        tx
          .update(chamados)
          .set({ situacao: 'aguardando', relogioDesde: null })
          .where(eq(chamados.numero, numero)),
      ),
  };
}
