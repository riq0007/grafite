// A sessão na web (design do F2a, decisão 12): uma loja fora do React, para a chegada e o cliente
// da API falarem com ela antes e fora dos componentes. Os componentes a leem pelo `useSessao()`.
import type { components } from '@grafite/api-client';
import type { AjustesDasPreferencias, Ambiente } from '@grafite/domain';
import { type ClienteDaApi, codigoDoProblema, comoProblema, criarCliente } from '../api/cliente.ts';
import { type FalhaDoPedido, pedir as pedirAApi, type RespostaDaApi } from '../api/pedir.ts';
import { vigiarInteracao } from '../api/segundoPlano.ts';

type EstadoDaApi = components['schemas']['EstadoDaSessao'];
type SessaoDaApi = NonNullable<EstadoDaApi['sessao']>;

/** O passo que falta para a sessão valer, como a API o diz. */
export type Pendencia = NonNullable<SessaoDaApi['pendencia']>;
export type ContaDaSessao = SessaoDaApi['conta'];
/** O que a conta pode, com o escopo de cada permissão, como a API o diz. */
export type AcessoDaSessao = SessaoDaApi['acesso'];

/** Por que o cadastro dos dois passos cobriu a casca aberta. */
export const MENSAGEM_DA_EXIGENCIA =
  'A verificação em dois passos passou a ser exigida para a sua conta.';

/** Quanto a validação espera a API antes de dar a sessão por desconhecida. */
export const LIMITE_DA_VALIDACAO = 5000;
/** De quanto em quanto tempo a sessão desconhecida é validada de novo. */
export const INTERVALO_DA_NOVA_VALIDACAO = 30_000;
/** Quanto depois da expiração conhecida a loja confere a sessão, para o servidor já a dar por vencida. */
export const MARGEM_DA_EXPIRACAO = 1000;
/** O maior atraso de um temporizador: acima dele, o navegador dispara na hora. */
const MAIOR_ESPERA = 2 ** 31 - 1;

const CAMPOS_DA_SENHA = ['senhaAtual', 'senhaNova'] as const;

interface DadosDaSessao {
  organizacao: string;
  conta: ContaDaSessao;
  csrf: string;
  expiraEm: string;
  acesso: AcessoDaSessao;
}

export type EstadoDaSessao =
  /** A primeira validação da página ainda não terminou. */
  | { tipo: 'validando' }
  /** O servidor não respondeu: a casca abre, e a loja valida de novo quando ele voltar. */
  | { tipo: 'desconhecida' }
  /** O endereço não pertence a nenhuma organização. */
  | { tipo: 'endereco-desconhecido' }
  | {
      tipo: 'sem-sessao';
      organizacao: string;
      /** Uma sessão valeu nesta página e terminou: a tela de entrada cobre a casca dela. */
      terminou: boolean;
      /** O usuário da sessão que terminou, que a tela traz preenchido. */
      usuarioAnterior?: string;
      /** Por que a entrada voltou ao usuário e senha, como nos códigos errados demais. */
      mensagem?: string;
    }
  | (DadosDaSessao & {
      tipo: 'pendente';
      pendencia: Pendencia;
      /** Por que o passo apareceu, quando ele surge com a casca aberta. */
      mensagem?: string;
      /**
       * No passo do código, o prazo da confiança da conta (change aparelho-confiavel): maior que
       * zero, a tela oferece "Confiar neste aparelho".
       */
      diasDeConfianca?: number;
    })
  /** Os dois passos acabaram de ser ativados na entrada: os códigos aparecem antes da casca. */
  | (DadosDaSessao & { tipo: 'pendente'; pendencia: 'guardar-codigos'; codigos: string[] })
  | (DadosDaSessao & { tipo: 'ativa' });

/**
 * O que o servidor diz de si, com ou sem sessão: o ambiente (nulo num servidor que ainda não o
 * diz), se a organização do endereço opera o servidor, a única com a tela de backup, e os módulos
 * opcionais que ela desligou, que a casca não mostra.
 */
export interface ServidorDaSessao {
  ambiente: Ambiente | null;
  operaOServidor: boolean;
  modulosDesligados: readonly string[];
}

/** Uma ação recusada, com o texto para a tela. */
export interface Recusa {
  erro: string;
  /** A senha digitada não serve: a tela a limpa. */
  limparSenha?: true;
  /** O campo do motivo, na troca da senha. */
  campo?: (typeof CAMPOS_DA_SENHA)[number];
}

export interface LojaDaSessao {
  ler(): EstadoDaSessao;
  /**
   * Os padrões da organização que o servidor deu por último, com ou sem sessão; `null` enquanto
   * ele não respondeu. Mudam junto com o estado, e quem assina a loja é avisado.
   */
  lerPadroes(): AjustesDasPreferencias | null;
  /** O que o servidor disse de si por último; `null` enquanto ele não respondeu. */
  lerServidor(): ServidorDaSessao | null;
  assinar(ouvinte: () => void): () => void;
  /** O cliente da API com o CSRF da sessão, que o `useApi()` entrega aos módulos. */
  cliente: ClienteDaApi;
  /** Consulta a sessão no servidor, esperando no máximo 5 s; nunca falha. */
  validar(): Promise<void>;
  entrar(credenciais: { usuario: string; senha: string }): Promise<{ ok: true } | Recusa>;
  /** O código do app ou de recuperação; com o de recuperação, diz quantos restam. */
  /** Manda o código; com `confiar`, o navegador fica como aparelho confiável. */
  mandarCodigo(
    codigo: string,
    opcoes?: { confiar: boolean },
  ): Promise<{ ok: true; codigosRestantes?: number } | Recusa>;
  trocarSenha(senhas: {
    senhaAtual: string;
    senhaNova: string;
  }): Promise<{ ok: true; sessoesEncerradas: number } | Recusa>;
  comecarCadastro(): Promise<{ chave: string; uri: string } | Recusa>;
  /** Ativa os dois passos e devolve os códigos de recuperação, que só aparecem agora. */
  confirmarCadastro(codigo: string): Promise<{ ok: true; codigos: string[] } | Recusa>;
  /** Os códigos de recuperação da entrada foram vistos: a sessão passa a valer na tela. */
  continuar(): void;
  sair(): Promise<{ ok: true } | Recusa>;
  /** Para as novas validações e deixa de ouvir a rede. */
  parar(): void;
}

export interface OpcoesDaLoja {
  /** O fetch do navegador; os testes passam um simulado. */
  buscar?: (pedido: Request) => Promise<Response>;
  /** O estado de partida; os testes que abrem o app depois da chegada passam o da sessão. */
  estado?: EstadoDaSessao;
  /** O que o servidor diz de si, nos testes que abrem o app depois da chegada. */
  servidor?: ServidorDaSessao;
}

type Pedido<T> = { dados: T } | { recusa: Recusa; codigo: string | null };

const mesmoAcesso = (a: AcessoDaSessao, b: AcessoDaSessao) =>
  JSON.stringify(a) === JSON.stringify(b);

export function criarLojaDaSessao({
  buscar,
  estado: inicial = { tipo: 'validando' },
  servidor: servidorInicial,
}: OpcoesDaLoja = {}): LojaDaSessao {
  let estado = inicial;
  /** O usuário da última sessão que valeu nesta página: a casca, se montada, é dele. */
  let ultimaConta = estado.tipo === 'ativa' ? estado.conta.usuario : null;
  let padroes: AjustesDasPreferencias | null = null;
  let servidor: ServidorDaSessao | null = servidorInicial ?? null;
  let validacao: Promise<void> | null = null;
  // As requisições sem o usuário interagir há 5 min não contam como uso da sessão.
  const interacao = vigiarInteracao();
  let novaValidacao: ReturnType<typeof setInterval> | null = null;
  let expiracao: ReturnType<typeof setTimeout> | null = null;
  const ouvintes = new Set<() => void>();

  const cliente = criarCliente({
    csrf: () => ('csrf' in estado ? estado.csrf : null),
    aoPerderASessao: perderASessao,
    aoMudarOAcesso: () => void validar(),
    emSegundoPlano: interacao.emSegundoPlano,
    buscar,
  });

  function definir(novo: EstadoDaSessao) {
    if (novo.tipo === 'desconhecida' && estado.tipo === 'desconhecida') return;
    // O mesmo acesso fica o mesmo objeto: quem depende dele não refaz nada a cada validação.
    if ('acesso' in novo && 'acesso' in estado && mesmoAcesso(novo.acesso, estado.acesso)) {
      novo = { ...novo, acesso: estado.acesso };
    }
    estado = novo;
    if (novo.tipo === 'desconhecida') {
      novaValidacao ??= setInterval(() => void validar(), INTERVALO_DA_NOVA_VALIDACAO);
    } else if (novaValidacao !== null) {
      clearInterval(novaValidacao);
      novaValidacao = null;
    }
    vigiarAExpiracao();
    for (const ouvinte of ouvintes) ouvinte();
  }

  /**
   * Na hora em que a sessão expira, sem pedido nenhum no meio, a loja confere de novo: se ela
   * venceu, a entrada cobre a casca; se foi usada e vale mais, a hora nova passa a valer.
   */
  function vigiarAExpiracao() {
    if (expiracao !== null) clearTimeout(expiracao);
    expiracao = null;
    if (!('expiraEm' in estado)) return;
    const falta = Date.parse(estado.expiraEm) + MARGEM_DA_EXPIRACAO - Date.now();
    // Uma expiração além do maior atraso espera em partes, até a hora chegar.
    expiracao = setTimeout(
      () => (falta > MAIOR_ESPERA ? vigiarAExpiracao() : void validar()),
      Math.min(Math.max(0, falta), MAIOR_ESPERA),
    );
  }

  const organizacaoAtual = () => ('organizacao' in estado ? estado.organizacao : null);

  function semSessao(organizacao: string, mensagem?: string): EstadoDaSessao {
    return {
      tipo: 'sem-sessao',
      organizacao,
      terminou: ultimaConta !== null,
      ...(ultimaConta !== null && { usuarioAnterior: ultimaConta }),
      ...(mensagem && { mensagem }),
    };
  }

  function ativa(dados: DadosDaSessao) {
    ultimaConta = dados.conta.usuario;
    definir({ tipo: 'ativa', ...dados });
  }

  /** O que o servidor disse de si; o mesmo objeto enquanto nada muda, para quem depende dele. */
  function guardarServidor({ ambiente, organizacao }: EstadoDaApi) {
    const novo: ServidorDaSessao = {
      ambiente: ambiente ?? null,
      operaOServidor: organizacao.operaOServidor ?? false,
      modulosDesligados: organizacao.modulosDesligados ?? [],
    };
    if (
      servidor?.ambiente !== novo.ambiente ||
      servidor.operaOServidor !== novo.operaOServidor ||
      servidor.modulosDesligados.join() !== novo.modulosDesligados.join()
    ) {
      servidor = novo;
    }
  }

  /** O estado que a API devolveu. */
  function aplicar(dadosDaApi: EstadoDaApi) {
    const {
      organizacao: { nome, preferencias },
      sessao,
    } = dadosDaApi;
    guardarServidor(dadosDaApi);
    padroes = (preferencias ?? {}) as AjustesDasPreferencias;
    if (!sessao) return definir(semSessao(nome));
    const { conta, pendencia, csrf, expiraEm, acesso, diasDeConfianca } = sessao;
    const dados = { organizacao: nome, conta, csrf, expiraEm, acesso };
    if (pendencia) {
      // O cadastro que surge com a casca aberta da mesma conta diz por que apareceu.
      const surgiu =
        pendencia === 'cadastrar-dois-passos' &&
        estado.tipo === 'ativa' &&
        estado.conta.usuario === conta.usuario;
      return definir({
        tipo: 'pendente',
        pendencia,
        ...dados,
        ...(surgiu && { mensagem: MENSAGEM_DA_EXIGENCIA }),
        ...(pendencia === 'segundo-passo' &&
          typeof diasDeConfianca === 'number' && { diasDeConfianca }),
      });
    }
    ativa(dados);
  }

  /** A API disse `sem-sessao` no meio do uso. Sem o nome da organização, pergunta de novo. */
  function perderASessao() {
    const organizacao = organizacaoAtual();
    if (organizacao === null) void validar();
    else definir(semSessao(organizacao));
  }

  /** A recusa para a tela: a senha a limpar, ou o campo do motivo, na troca da senha. */
  function recusar({ erro, problema, codigo }: FalhaDoPedido): Recusa {
    if (!problema || problema.status >= 500) return { erro };
    if (codigo === 'credenciais-invalidas') return { erro, limparSenha: true };
    for (const campo of CAMPOS_DA_SENHA) {
      const motivo = problema.campos?.[campo];
      if (motivo) return { erro: motivo, campo };
    }
    return { erro };
  }

  /** O pedido de uma ação; a recusa que muda a sessão (endereço, códigos esgotados) muda aqui. */
  async function pedir<T>(
    fazer: () => Promise<RespostaDaApi<T>>,
    acao: string,
  ): Promise<Pedido<T>> {
    const resultado = await pedirAApi(fazer, acao);
    if ('dados' in resultado) return resultado;
    const { problema, codigo } = resultado;
    const organizacao = organizacaoAtual();
    if (codigo === 'endereco-desconhecido') definir({ tipo: 'endereco-desconhecido' });
    if (codigo === 'tentativas-esgotadas' && problema && organizacao !== null) {
      definir(semSessao(organizacao, problema.detail));
    }
    return { recusa: recusar(resultado), codigo };
  }

  async function consultar() {
    const controle = new AbortController();
    let limite: ReturnType<typeof setTimeout> | undefined;
    const esgotou = new Promise<null>((resolver) => {
      limite = setTimeout(() => {
        controle.abort();
        resolver(null);
      }, LIMITE_DA_VALIDACAO);
    });
    try {
      const resposta = await Promise.race([
        cliente.GET('/sessao', { signal: controle.signal }),
        esgotou,
      ]);
      if (resposta?.data) return aplicar(resposta.data);
      const desconhecido =
        codigoDoProblema(comoProblema(resposta?.error)) === 'endereco-desconhecido';
      definir({ tipo: desconhecido ? 'endereco-desconhecido' : 'desconhecida' });
    } catch {
      definir({ tipo: 'desconhecida' });
    } finally {
      clearTimeout(limite);
    }
  }

  function validar(): Promise<void> {
    validacao ??= consultar().finally(() => {
      validacao = null;
    });
    return validacao;
  }

  const aoVoltarARede = () => {
    if (estado.tipo === 'desconhecida') void validar();
  };
  window.addEventListener('online', aoVoltarARede);
  // De volta à página, a sessão pode ter sido encerrada em outro dispositivo nesse meio-tempo.
  const aoVoltarAPagina = () => {
    if (document.visibilityState === 'visible' && 'csrf' in estado) void validar();
  };
  document.addEventListener('visibilitychange', aoVoltarAPagina);
  vigiarAExpiracao();

  return {
    ler: () => estado,
    lerPadroes: () => padroes,
    lerServidor: () => servidor,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    cliente,
    validar,

    async entrar(credenciais) {
      const pedido = await pedir(() => cliente.POST('/sessao', { body: credenciais }), 'entrar');
      if ('recusa' in pedido) return pedido.recusa;
      aplicar(pedido.dados);
      return { ok: true };
    },

    async mandarCodigo(codigo, { confiar } = { confiar: false }) {
      const pedido = await pedir(
        () => cliente.POST('/sessao/segundo-passo', { body: { codigo, confiar } }),
        'entrar',
      );
      if ('recusa' in pedido) return pedido.recusa;
      aplicar(pedido.dados);
      const { codigosRestantes } = pedido.dados;
      return codigosRestantes === undefined ? { ok: true } : { ok: true, codigosRestantes };
    },

    async trocarSenha(senhas) {
      const pedido = await pedir(
        () => cliente.PUT('/conta/senha', { body: senhas }),
        'trocar a senha',
      );
      if ('recusa' in pedido) return pedido.recusa;
      aplicar(pedido.dados);
      return { ok: true, sessoesEncerradas: pedido.dados.sessoesEncerradas };
    },

    async comecarCadastro() {
      const pedido = await pedir(
        () => cliente.POST('/conta/dois-passos/cadastro'),
        'cadastrar a verificação em dois passos',
      );
      return 'recusa' in pedido ? pedido.recusa : pedido.dados;
    },

    async confirmarCadastro(codigo) {
      const naEntrada = estado.tipo === 'pendente';
      const pedido = await pedir(
        () => cliente.POST('/conta/dois-passos/confirmacao', { body: { codigo } }),
        'cadastrar a verificação em dois passos',
      );
      if ('recusa' in pedido) return pedido.recusa;
      const { organizacao, sessao, codigosDeRecuperacao: codigos } = pedido.dados;
      if (naEntrada && sessao && !sessao.pendencia) {
        const { conta, csrf, expiraEm, acesso } = sessao;
        padroes = (organizacao.preferencias ?? {}) as AjustesDasPreferencias;
        guardarServidor(pedido.dados);
        definir({
          tipo: 'pendente',
          pendencia: 'guardar-codigos',
          codigos,
          organizacao: organizacao.nome,
          conta,
          csrf,
          expiraEm,
          acesso,
        });
      } else {
        aplicar(pedido.dados);
      }
      return { ok: true, codigos };
    },

    continuar() {
      if (estado.tipo !== 'pendente' || estado.pendencia !== 'guardar-codigos') return;
      const { organizacao, conta, csrf, expiraEm, acesso } = estado;
      ativa({ organizacao, conta, csrf, expiraEm, acesso });
    },

    async sair() {
      const organizacao = organizacaoAtual();
      const daSessaoAtiva = estado.tipo === 'ativa';
      const pedido = await pedir(() => cliente.DELETE('/sessao'), 'sair');
      // Sem sessão no servidor, ela já terminou, que é o que se pediu.
      if ('recusa' in pedido && pedido.codigo !== 'sem-sessao') return pedido.recusa;
      if (daSessaoAtiva) ultimaConta = null;
      if (organizacao === null) void validar();
      else definir(semSessao(organizacao));
      return { ok: true };
    },

    parar() {
      interacao.parar();
      window.removeEventListener('online', aoVoltarARede);
      document.removeEventListener('visibilitychange', aoVoltarAPagina);
      if (novaValidacao !== null) clearInterval(novaValidacao);
      novaValidacao = null;
      if (expiracao !== null) clearTimeout(expiracao);
      expiracao = null;
    },
  };
}
