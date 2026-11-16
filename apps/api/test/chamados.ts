// Os chamados dos testes de integração (change chamados-da-ti): o preparo que cada arquivo dos
// chamados refazia, num lugar só. A organização com os tipos de fábrica, o horário da TI e a
// numeração do mockup (o primeiro chamado é o #1042), os locais, as pessoas que pedem, as contas da
// TI com as sessões, e as funções que leem e gravam os chamados direto no banco, como as ações
// gravam. Os arquivos antigos passam a usá-lo quando uma tarefa mexer neles.

import {
  chamados,
  contas,
  eventos,
  horarioDaTi,
  mensagensDosChamados,
  naOrganizacao,
  notificacoes,
  numeracaoDosChamados,
  tiposDeChamado,
} from '@grafite/db';
import type { HorarioDaTi } from '@grafite/domain';
import { asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { criarTiposDeFabrica } from '../src/chamados/fabrica.ts';
import {
  type ApiDeTeste,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  type Entrada,
  SEM_ENTRADA,
} from './integracao.ts';

/** O horário da TI dos testes: de segunda a sexta, das 08:00 às 18:00 em São Paulo, carga de 5. */
export const HORARIO_DOS_CHAMADOS: HorarioDaTi = {
  dias: [1, 2, 3, 4, 5],
  inicio: 480,
  fim: 1080,
  fuso: 'America/Sao_Paulo',
  cargaCheia: 5,
};

/**
 * As contas, pelo usuário:
 * - `ana`: atende os chamados da organização inteira e vê as pessoas, os ativos, os alertas, as OS e
 *   as solicitações;
 * - `diego`: atende os chamados de Jundiaí, sem ver mais nada;
 * - `elisa`: atende os chamados de Campinas, sem ver mais nada;
 * - `carla`: só vê os chamados, da organização inteira;
 * - `bruno`: só vê os chamados de Campinas;
 * - `livia`: administra a organização.
 */
export const CONTAS_DOS_CHAMADOS = {
  ana: 'Ana Souza',
  bruno: 'Bruno Costa',
  carla: 'Carla Dias',
  diego: 'Diego Ramos',
  elisa: 'Elisa Prado',
  livia: 'Lívia Prates',
} as const;
export type UsuarioDosChamados = keyof typeof CONTAS_DOS_CHAMADOS;

/** Uma linha da conversa gravada direto no banco: a conta, pelo usuário, ou a pessoa, pela chave. */
export interface LinhaDaConversa {
  especie: 'mensagem' | 'nota' | 'evento';
  conta?: UsuarioDosChamados;
  pessoa?: string;
  texto?: string;
  evento?: string;
  dados?: Record<string, unknown>;
  em: Date;
}

export type ChamadosDeTeste = Awaited<ReturnType<typeof montarChamados>>;

/**
 * Monta a organização dos chamados no endereço. Os locais são Jundiaí, com a Recepção, e Campinas,
 * com o Administrativo e a Sala de reuniões; as pessoas, Marina e Otávio, da Recepção, Fernanda e
 * Paulo, do Administrativo, e Rita, sem local. As sessões entram no momento do relógio: depois de
 * avançá-lo mais que a inatividade da sessão, o `entrar` as renova.
 */
export async function montarChamados(api: ApiDeTeste, host: string) {
  const org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, async (tx) => {
    await criarTiposDeFabrica(tx, {
      ator: { tipo: 'sistema', descricao: 'teste dos chamados' },
      momento: api.relogio.agora(),
    });
    await tx.insert(horarioDaTi).values({
      orgId: org,
      ...HORARIO_DOS_CHAMADOS,
      dias: [...HORARIO_DOS_CHAMADOS.dias],
    });
    // Os números do mockup: o primeiro chamado aberto aqui é o #1042.
    await tx.insert(numeracaoDosChamados).values({ orgId: org, ultimo: 1041 });
  });
  const tipos = Object.fromEntries(
    (
      await naOrganizacao(api.banco, org, (tx) =>
        tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
      )
    ).map(({ id, nome }) => [nome, id]),
  );

  const jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  const campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  const locais = {
    jundiai,
    recepcao: await criarLocal(api, org, { nome: 'Recepção', paiId: jundiai }),
    campinas,
    administrativo: await criarLocal(api, org, { nome: 'Administrativo', paiId: campinas }),
    reunioes: await criarLocal(api, org, { nome: 'Sala de reuniões', paiId: campinas }),
  };
  const pessoas = {
    marina: await criarPessoa(api, org, { nome: 'Marina Rocha', localId: locais.recepcao }),
    otavio: await criarPessoa(api, org, { nome: 'Otávio Nunes', localId: locais.recepcao }),
    fernanda: await criarPessoa(api, org, {
      nome: 'Fernanda Lima',
      localId: locais.administrativo,
    }),
    paulo: await criarPessoa(api, org, { nome: 'Paulo Mendes', localId: locais.administrativo }),
    rita: await criarPessoa(api, org, { nome: 'Rita Moraes' }),
  };

  const contasDe = {} as Record<UsuarioDosChamados, string>;
  for (const [usuario, nome] of Object.entries(CONTAS_DOS_CHAMADOS)) {
    contasDe[usuario as UsuarioDosChamados] = (await criarConta(api, org, { usuario, nome })).id;
  }
  const perfis = {
    atendeEVe: await criarPerfil(api, org, {
      nome: 'Atende e vê tudo',
      permissoes: [
        'chamados.atender',
        'pessoas.ver',
        'ativos.ver',
        'alertas.ver',
        'ordens.ver',
        'solicitacoes.ver',
      ],
    }),
    atende: await criarPerfil(api, org, {
      nome: 'Atende os chamados',
      permissoes: ['chamados.atender'],
    }),
    ve: await criarPerfil(api, org, { nome: 'Vê os chamados', permissoes: ['chamados.ver'] }),
    administrador: await criarPerfil(api, org, { nome: 'Administrador', administrador: true }),
  };
  await atribuir(api, org, { perfilId: perfis.atendeEVe, contaId: contasDe.ana });
  await atribuir(api, org, {
    perfilId: perfis.atende,
    contaId: contasDe.diego,
    localId: locais.jundiai,
  });
  await atribuir(api, org, {
    perfilId: perfis.atende,
    contaId: contasDe.elisa,
    localId: locais.campinas,
  });
  await atribuir(api, org, { perfilId: perfis.ve, contaId: contasDe.carla });
  await atribuir(api, org, {
    perfilId: perfis.ve,
    contaId: contasDe.bruno,
    localId: locais.campinas,
  });
  await atribuir(api, org, { perfilId: perfis.administrador, contaId: contasDe.livia });

  const cliente = clienteDaApi(api, host);
  const entradas: Partial<Record<UsuarioDosChamados, Entrada>> = {};
  const chamadoDe = new Map<number, string>();
  const conta = (usuario: UsuarioDosChamados) => contasDe[usuario];
  const usuarioDa = (contaId: string) =>
    Object.entries(contasDe).find(([, deUsuario]) => deUsuario === contaId)?.[0] ?? contaId;
  const chamadoId = (numero: number) => chamadoDe.get(numero) ?? '';

  return {
    org,
    cliente,
    tipos,
    locais,
    pessoas,
    perfis,
    conta,
    usuarioDa,
    chamadoId,
    /** A sessão do usuário; a de quem não entrou não autentica. */
    como: (usuario: UsuarioDosChamados | 'ninguem') =>
      usuario === 'ninguem' ? SEM_ENTRADA : (entradas[usuario] ?? SEM_ENTRADA),

    /** Entra, no momento do relógio, com todas as contas, ou com as dadas. */
    async entrar(...usuarios: UsuarioDosChamados[]) {
      const quem = usuarios.length > 0 ? usuarios : (Object.keys(contasDe) as UsuarioDosChamados[]);
      for (const usuario of quem) entradas[usuario] = await cliente.entrar(usuario);
    },

    /** O chamado do tipo Outro, com o relato, em nome da pessoa. */
    relato: (
      pessoa: keyof typeof pessoas,
      { texto = 'A cadeira da sala 3 quebrou.', ficaComigo = true } = {},
    ) => ({
      pessoa: pessoas[pessoa],
      tipo: tipos.Outro,
      respostas: { relato: texto },
      ficaComigo,
    }),

    /** Abre o chamado pela rota, como o usuário, guarda o id pelo número e devolve o número. */
    async abrir(corpo: object, usuario: UsuarioDosChamados = 'ana'): Promise<number> {
      const r = await cliente.enviar('POST', '/chamados', entradas[usuario] ?? SEM_ENTRADA, corpo);
      expect(r.statusCode, r.body).toBe(201);
      const { numero } = r.json() as { numero: number };
      const [linha] = await naOrganizacao(api.banco, org, (tx) =>
        tx.select({ id: chamados.id }).from(chamados).where(eq(chamados.numero, numero)),
      );
      chamadoDe.set(numero, linha?.id ?? '');
      return numero;
    },

    /** O chamado como o banco o guarda. */
    async lerChamado(numero: number) {
      const [linha] = await naOrganizacao(api.banco, org, (tx) =>
        tx.select().from(chamados).where(eq(chamados.numero, numero)),
      );
      if (!linha) throw new Error(`O chamado #${numero} não existe.`);
      return linha;
    },

    /** Muda o chamado direto no banco, como uma ação. */
    mudarChamado: (numero: number, mudanca: Partial<typeof chamados.$inferInsert>) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.update(chamados).set(mudanca).where(eq(chamados.numero, numero)),
      ),

    mudarConta: (usuario: UsuarioDosChamados, situacao: 'ativa' | 'inativa') =>
      naOrganizacao(api.banco, org, (tx) =>
        tx.update(contas).set({ situacao }).where(eq(contas.id, contasDe[usuario])),
      ),

    /** Grava as linhas da conversa direto no banco, como as ações gravam, e devolve os ids. */
    async incluirConversa(numero: number, linhas: LinhaDaConversa[]): Promise<string[]> {
      const gravados: string[] = [];
      for (const linha of linhas) {
        const [gravada] = await naOrganizacao(api.banco, org, (tx) =>
          tx
            .insert(mensagensDosChamados)
            .values({
              orgId: org,
              chamadoId: chamadoId(numero),
              especie: linha.especie,
              autorConta: linha.conta ? contasDe[linha.conta] : null,
              autorPessoa: linha.pessoa
                ? (pessoas[linha.pessoa as keyof typeof pessoas] ?? null)
                : null,
              texto: linha.especie === 'evento' ? null : (linha.texto ?? ''),
              evento: linha.especie === 'evento' ? (linha.evento ?? '') : null,
              dados: linha.especie === 'evento' ? (linha.dados ?? {}) : null,
              criadaEm: linha.em,
            })
            .returning({ id: mensagensDosChamados.id }),
        );
        gravados.push(gravada?.id ?? '');
      }
      return gravados;
    },

    /** A conversa do chamado, na ordem. */
    conversaDo: (numero: number) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx
          .select()
          .from(mensagensDosChamados)
          .where(eq(mensagensDosChamados.chamadoId, chamadoId(numero)))
          .orderBy(asc(mensagensDosChamados.criadaEm), asc(mensagensDosChamados.id)),
      ),

    /** Os eventos em tempo real do chamado, na ordem. */
    eventosDo: (numero: number) =>
      naOrganizacao(api.banco, org, (tx) =>
        tx
          .select({
            tipo: eventos.tipo,
            alvoTipo: eventos.alvoTipo,
            permissao: eventos.permissao,
            locais: eventos.locais,
          })
          .from(eventos)
          .where(eq(eventos.alvoId, chamadoId(numero)))
          .orderBy(asc(eventos.id)),
      ),

    /** As notificações do chamado, na ordem, com quem recebeu pelo usuário. */
    async notificacoesDo(numero: number) {
      const linhas = await naOrganizacao(api.banco, org, (tx) =>
        tx
          .select({ contaId: notificacoes.contaId, titulo: notificacoes.titulo })
          .from(notificacoes)
          .where(eq(notificacoes.destino, `/chamados/${numero}`))
          .orderBy(asc(notificacoes.criadaEm), asc(notificacoes.id)),
      );
      return linhas.map(({ contaId, titulo }) => ({ usuario: usuarioDa(contaId), titulo }));
    },
  };
}
