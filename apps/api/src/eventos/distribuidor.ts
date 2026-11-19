// O distribuidor dos eventos (spec eventos-em-tempo-real; design do F2c, decisão 10): as conexões
// abertas de cada organização, na memória, e a entrega de cada evento a quem `podeReceber`. A
// árvore de locais de cada organização fica guardada até o próximo `locais.mudaram`, e o acesso de
// cada conta, com os grupos dela (change chat-com-chamados, design, decisão 4), é relido uma vez em
// `acessos.mudaram`. Os eventos saem na ordem em que chegam.
import {
  type Acesso,
  type ArvoreDeLocais,
  type ConexaoQueRecebe,
  type EventoDeSaida,
  podeReceber,
} from '@grafite/domain';

/** Uma conexão de eventos aberta: a sessão, a conta, o acesso de agora e como falar com a tela. */
export interface ConexaoDeEventos extends ConexaoQueRecebe {
  /** O acesso da conta, trocado pelo distribuidor quando os acessos mudam. */
  acesso: Acesso;
  /** Os grupos da conta, trocados com o acesso. */
  grupos: readonly string[];
  enviar(evento: EventoDeSaida): void;
  /** Avisa a tela de que eventos podem ter se perdido: ela relê tudo. */
  reiniciar(): void;
}

export interface FontesDoDistribuidor {
  lerArvore(orgId: string): Promise<ArvoreDeLocais>;
  /** O acesso da conta e os grupos dela, lidos juntos. */
  lerAcesso(orgId: string, contaId: string): Promise<Pick<ConexaoQueRecebe, 'acesso' | 'grupos'>>;
  /** Uma falha que não para a distribuição, para o log. */
  avisar(erro: unknown): void;
}

export interface DistribuidorDeEventos {
  /** Põe a conexão para receber os eventos da organização dela; devolve como tirá-la. */
  entrar(conexao: ConexaoDeEventos): () => void;
  /** Entrega o evento; termina quando ele foi entregue, depois dos que chegaram antes. */
  distribuir(evento: EventoDeSaida): Promise<void>;
  /** Manda `reiniciar` a todas as conexões, depois de reler os acessos e esquecer as árvores. */
  reiniciar(): Promise<void>;
  /** As conexões abertas de todas as organizações. */
  conexoes(): ConexaoDeEventos[];
}

/** O evento sem locais no público não consulta a árvore. */
const SEM_ARVORE: Pick<ArvoreDeLocais, 'ancestrais'> = { ancestrais: () => [] };

export function criarDistribuidor(fontes: FontesDoDistribuidor): DistribuidorDeEventos {
  const porOrganizacao = new Map<string, Set<ConexaoDeEventos>>();
  const arvores = new Map<string, Promise<ArvoreDeLocais>>();
  let fila: Promise<void> = Promise.resolve();

  /** Uma tarefa depois das que já estão na fila; a falha de uma não para as seguintes. */
  function naVez(tarefa: () => Promise<void>): Promise<void> {
    const vez = fila.then(tarefa).catch((erro: unknown) => fontes.avisar(erro));
    fila = vez;
    return vez;
  }

  function arvoreDa(orgId: string): Promise<ArvoreDeLocais> {
    let arvore = arvores.get(orgId);
    if (!arvore) {
      arvore = fontes.lerArvore(orgId);
      arvores.set(orgId, arvore);
      // A leitura que falha não fica guardada: o próximo evento tenta de novo.
      arvore.catch(() => arvores.delete(orgId));
    }
    return arvore;
  }

  /** Relê o acesso e os grupos de cada conta conectada uma vez e os põe nas conexões dela. */
  async function relerAcessos(orgId: string, conexoes: Iterable<ConexaoDeEventos>) {
    const porConta = new Map<string, ConexaoDeEventos[]>();
    for (const conexao of conexoes) {
      porConta.set(conexao.contaId, [...(porConta.get(conexao.contaId) ?? []), conexao]);
    }
    await Promise.all(
      [...porConta].map(async ([contaId, daConta]) => {
        const { acesso, grupos } = await fontes.lerAcesso(orgId, contaId);
        for (const conexao of daConta) {
          conexao.acesso = acesso;
          conexao.grupos = grupos;
        }
      }),
    );
  }

  async function entregar(evento: EventoDeSaida) {
    if (evento.tipo === 'locais.mudaram') arvores.delete(evento.orgId);
    const conexoes = porOrganizacao.get(evento.orgId);
    if (!conexoes || conexoes.size === 0) return;
    try {
      if (evento.tipo === 'acessos.mudaram') {
        // Com o alvo conta, a mudança é só dela, como a entrada num grupo, que o login pelo AD grava
        // uma vez por grupo: relê só as conexões dela, e não as da organização inteira.
        const daConta = evento.alvo?.tipo === 'conta' ? evento.alvo.id : null;
        const alcancadas = daConta
          ? [...conexoes].filter((conexao) => conexao.contaId === daConta)
          : conexoes;
        await relerAcessos(evento.orgId, alcancadas);
      }
      const { permissao, locais } = evento.publico;
      const arvore = permissao && locais !== undefined ? await arvoreDa(evento.orgId) : SEM_ARVORE;
      for (const conexao of [...conexoes]) {
        if (podeReceber(evento, conexao, arvore)) conexao.enviar(evento);
      }
    } catch (erro) {
      // Sem saber quem pode receber, ninguém recebe; a tela relê tudo e não perde a mudança.
      fontes.avisar(erro);
      for (const conexao of [...conexoes]) conexao.reiniciar();
    }
  }

  return {
    entrar(conexao) {
      let conexoes = porOrganizacao.get(conexao.orgId);
      if (!conexoes) {
        conexoes = new Set();
        porOrganizacao.set(conexao.orgId, conexoes);
      }
      conexoes.add(conexao);
      return () => {
        conexoes.delete(conexao);
        if (conexoes.size === 0 && porOrganizacao.get(conexao.orgId) === conexoes) {
          porOrganizacao.delete(conexao.orgId);
          arvores.delete(conexao.orgId);
        }
      };
    },

    distribuir: (evento) => naVez(() => entregar(evento)),

    reiniciar: () =>
      naVez(async () => {
        arvores.clear();
        await Promise.all(
          [...porOrganizacao].map(([orgId, conexoes]) =>
            relerAcessos(orgId, conexoes).catch((erro: unknown) => fontes.avisar(erro)),
          ),
        );
        for (const conexoes of porOrganizacao.values()) {
          for (const conexao of [...conexoes]) conexao.reiniciar();
        }
      }),

    conexoes: () => [...porOrganizacao.values()].flatMap((conexoes) => [...conexoes]),
  };
}
