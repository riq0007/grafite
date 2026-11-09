// A sincronia das preferências (design do F2c, decisão 4): as camadas (os padrões da organização e
// a camada da conta), as mudanças ainda não gravadas por cima delas e a gravação na conta, uma vez,
// 400 ms depois da última mudança. As camadas começam da cópia do navegador e passam a ser as do
// estado da sessão quando ele chega; a cópia guarda tudo de novo a cada mudança. Fica fora do React,
// como a loja da sessão: o provedor a lê pelo useSyncExternalStore, e a leitura puxa a sessão da
// loja, para as camadas valerem no mesmo desenho em que a primeira tela aparece.
import {
  type AjustesDasPreferencias,
  aplicarMudanca,
  lerAjustes,
  type MudancaDasPreferencias,
  type PreferenciasDaInterface,
  resolverPreferencias,
  type SecaoDePreferencias,
} from '@grafite/domain';
import type { CanalDeEventos } from '../eventos/canal.ts';
import type { EstadoDaSessao, LojaDaSessao } from '../sessao/loja.ts';
import { gravarCopia, lerCopia } from './copia.ts';
import { camposNulos, juntar, normalizar } from './mudancas.ts';
import { atributosDaInterface } from './preferencias.ts';

/** Quanto depois da última mudança ela é gravada: arrastar um controle grava uma vez. */
export const ESPERA_DA_GRAVACAO = 400;
/** Quanto depois do último aviso de mudança o estado da sessão é relido. */
export const ESPERA_DA_RELEITURA = 300;

type Campos = Record<string, unknown>;

/** Os padrões da organização e, com a sessão que vale, a camada da conta. */
interface Camadas {
  organizacao: AjustesDasPreferencias;
  conta: AjustesDasPreferencias | null;
}

export interface OpcoesDaSincronia {
  /** A sessão; sem ela, as mudanças valem só neste navegador. */
  loja?: LojaDaSessao;
  /** Os eventos, que avisam das mudanças feitas em outro lugar. */
  canal?: CanalDeEventos;
}

export interface SincroniaDasPreferencias {
  ler(): PreferenciasDaInterface;
  assinar(ouvinte: () => void): () => void;
  mudar<S extends SecaoDePreferencias>(
    secao: S,
    mudanca: Partial<PreferenciasDaInterface[S]>,
  ): void;
  restaurar(secao: SecaoDePreferencias): void;
  /** Passa a acompanhar a sessão, os eventos e a visibilidade da página; devolve o que para. */
  ligar(): () => void;
}

const vazia = (mudanca: MudancaDasPreferencias) => Object.keys(mudanca).length === 0;

export function criarSincronia({ loja, canal }: OpcoesDaSincronia = {}): SincroniaDasPreferencias {
  const copia = lerCopia();
  /** A conta da camada e das mudanças; as mudanças de outra conta não valem. */
  let contaId = copia.contaId;
  let camadas: Camadas = { organizacao: copia.organizacao, conta: copia.conta };
  /** As mudanças que a gravação em andamento leva. */
  let enviando: MudancaDasPreferencias = {};
  /** As mudanças ainda não enviadas. */
  let pendentes = copia.pendentes;
  let gravando = false;
  let gravacao: ReturnType<typeof setTimeout> | null = null;
  let releitura: ReturnType<typeof setTimeout> | null = null;
  const ouvintes = new Set<() => void>();

  // A sessão de onde as camadas vieram por último: a leitura só as refaz quando ela muda.
  let estadoLido: EstadoDaSessao | undefined;
  let padroesLidos: AjustesDasPreferencias | null | undefined;
  let preferencias: PreferenciasDaInterface | undefined;
  let desatualizadas = true;

  /**
   * As camadas do estado da sessão: a da conta só com a sessão que vale, e só os padrões sem ela.
   * Sem a sessão conhecida (validando ou sem servidor), fica o que havia.
   *
   * As mudanças guardadas são da conta que as fez: com outra conta, ou quando ela sai, não valem.
   * As sem conta (as da cópia da versão 1, ou as feitas antes de qualquer sessão neste navegador)
   * esperam a primeira entrada e passam para a conta que ainda não mudou nada; com uma conta que já
   * tem preferências, as do servidor valem, e elas saem.
   */
  function lerCamadasDaLoja() {
    if (!loja) return;
    const estado = loja.ler();
    const padroes = loja.lerPadroes();
    if (estado === estadoLido && padroes === padroesLidos) return;
    estadoLido = estado;
    padroesLidos = padroes;
    desatualizadas = true;
    const organizacao = padroes === null ? camadas.organizacao : lerAjustes(padroes);
    if (estado.tipo === 'ativa') {
      const id = estado.conta.id ?? null;
      const daConta = lerAjustes(estado.conta.preferencias);
      const mesmaConta = id !== null && id === contaId;
      const passagem = contaId === null && Object.keys(daConta).length === 0;
      if (!mesmaConta && !passagem) pendentes = {};
      contaId = id;
      camadas = { organizacao, conta: daConta };
    } else if (estado.tipo === 'sem-sessao') {
      if (contaId !== null) pendentes = {};
      contaId = null;
      camadas = { organizacao, conta: null };
    } else if (estado.tipo === 'pendente') {
      camadas = { organizacao, conta: null };
    }
  }

  /** Sem a sessão que vale, como na tela de entrada, valem só os padrões da organização. */
  const semSessao = () => {
    const tipo = loja?.ler().tipo;
    return tipo === 'sem-sessao' || tipo === 'pendente';
  };

  function calcular(): PreferenciasDaInterface {
    if (semSessao()) return resolverPreferencias(camadas.organizacao);
    return resolverPreferencias(
      camadas.organizacao,
      aplicarMudanca(camadas.conta ?? {}, juntar(enviando, pendentes)),
    );
  }

  function ler(): PreferenciasDaInterface {
    lerCamadasDaLoja();
    if (desatualizadas || !preferencias) {
      desatualizadas = false;
      const novas = calcular();
      // As mesmas preferências continuam o mesmo objeto: ninguém se redesenha à toa.
      if (!preferencias || JSON.stringify(novas) !== JSON.stringify(preferencias)) {
        preferencias = novas;
      }
    }
    return preferencias;
  }

  /** Guarda na cópia as camadas, a conta e as mudanças ainda não gravadas. */
  function guardar() {
    gravarCopia(
      {
        contaId,
        organizacao: camadas.organizacao,
        conta: camadas.conta,
        pendentes: juntar(enviando, pendentes),
      },
      atributosDaInterface(ler()),
    );
  }

  function mudou() {
    desatualizadas = true;
    guardar();
    for (const ouvinte of [...ouvintes]) ouvinte();
  }

  const sessaoVale = () => loja?.ler().tipo === 'ativa';

  function agendarGravacao() {
    if (!loja) return;
    if (gravacao !== null) clearTimeout(gravacao);
    gravacao = setTimeout(() => {
      gravacao = null;
      void gravar();
    }, ESPERA_DA_GRAVACAO);
  }

  /** Grava as mudanças na conta; com `manterViva`, a gravação continua se a página fechar. */
  async function gravar(manterViva = false) {
    if (gravacao !== null) clearTimeout(gravacao);
    gravacao = null;
    if (!loja || gravando || vazia(pendentes) || !sessaoVale()) return;
    gravando = true;
    enviando = pendentes;
    pendentes = {};
    const daConta = contaId;
    let gravou = false;
    try {
      const { data, response } = await loja.cliente.PATCH('/conta/preferencias', {
        body: { mudancas: enviando },
        keepalive: manterViva,
      });
      lerCamadasDaLoja();
      if (data && contaId === daConta) camadas = { ...camadas, conta: lerAjustes(data) };
      // Recusada inteira, a mudança não tem o que tentar de novo.
      gravou = Boolean(data) || response.status === 400;
    } catch {
      // Sem servidor: as mudanças esperam a sessão voltar.
    }
    // As mudanças que não foram gravadas voltam, se a conta ainda é a mesma.
    if (!gravou && contaId === daConta) pendentes = juntar(enviando, pendentes);
    enviando = {};
    gravando = false;
    mudou();
    // O que mudou durante a gravação vai na seguinte.
    if (gravou && !vazia(pendentes)) agendarGravacao();
  }

  function aoMudarASessao() {
    lerCamadasDaLoja();
    guardar();
    if (sessaoVale() && !vazia(pendentes)) agendarGravacao();
  }

  /** Uma mudança feita em outro lugar: relê o estado da sessão, uma vez para uma rajada de avisos. */
  function agendarReleitura() {
    if (releitura !== null) clearTimeout(releitura);
    releitura = setTimeout(() => {
      releitura = null;
      void loja?.validar();
    }, ESPERA_DA_RELEITURA);
  }

  const aoMudarAVisibilidade = () => {
    if (document.visibilityState === 'hidden') void gravar(true);
  };

  return {
    ler,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      // A sessão nova pode trazer camadas novas: quem lê é avisado junto com quem a assina.
      const pararDeOuvirALoja = loja?.assinar(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
        pararDeOuvirALoja?.();
      };
    },
    mudar(secao, mudanca) {
      pendentes = juntar(pendentes, { [secao]: normalizar(secao, mudanca as Campos) });
      mudou();
      agendarGravacao();
    },
    restaurar(secao) {
      pendentes = juntar(pendentes, { [secao]: camposNulos(secao) });
      mudou();
      agendarGravacao();
    },
    ligar() {
      const paradas: Array<() => void> = [];
      if (loja) paradas.push(loja.assinar(aoMudarASessao));
      aoMudarASessao();
      for (const tipo of ['preferencias.mudaram', 'padroes.mudaram'] as const) {
        if (canal) paradas.push(canal.ouvir(tipo, agendarReleitura));
      }
      document.addEventListener('visibilitychange', aoMudarAVisibilidade);
      if (!vazia(pendentes)) agendarGravacao();
      return () => {
        for (const parar of paradas) parar();
        document.removeEventListener('visibilitychange', aoMudarAVisibilidade);
        if (gravacao !== null) clearTimeout(gravacao);
        if (releitura !== null) clearTimeout(releitura);
        gravacao = null;
        releitura = null;
      };
    },
  };
}
