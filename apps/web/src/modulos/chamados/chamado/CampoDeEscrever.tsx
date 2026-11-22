// O campo de escrever do chamado aberto (spec modulo-chamados, "Campo de escrever" e "Chamado
// fechado na tela"; change chamados-da-ti, design, "O campo de escrever (tarefa 5.12)"; change
// chat-com-chamados, design, decisão 15, tarefa 4.13; mockups m03, m05 e m11): no pé da tela, só
// para quem atende os locais do chamado, a chave da mensagem e da nota, o "Esperar a resposta", a
// ajuda do chat, a caixa que cresce com o texto, o cartão do ativo e as opções de resposta, os
// anexos, as respostas prontas do tipo, o clipe, "Cartão do ativo", "Pedir uma escolha" e
// "Enviar para Fernanda", que o Ctrl+Enter também chama. O rascunho fica no componente de fora,
// que a tela monta pelo número do chamado: a releitura da conversa não o apaga, e o chamado
// resolvido no meio da escrita o guarda até o "Reabrir". O fechado não se reabre, e o campo dá
// lugar à frase.
import type { components } from '@grafite/api-client';
import { type ComandoDoAtivo, comandoDoAtivo, MAXIMO_DE_ANEXOS, nomeCurto } from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  BotaoDeIcone,
  Checkbox,
  ControleSegmentado,
  Dialogo,
  FORMATOS_DE_ARQUIVO,
  Icone,
  ItemDeMenu,
  MensagemDoPasso,
  Menu,
  Segmento,
  TeclaDeAtalho,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  IdCard,
  ListChecks,
  Lock,
  MessageSquareText,
  Paperclip,
  RotateCcw,
  Send,
  Zap,
} from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { CartaoDoAtivoNaMensagem } from '../../../chat/CartaoDoAtivoNaMensagem.tsx';
import { diaDoReabrir } from '../../../chat/chamado.ts';
import { usePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useServidor } from '../../../sessao/useSessao.tsx';
import type { ContaDoSeletor } from '../../administracao/seletores/SeletorDeConta.tsx';
import { useAcoesDoAtendimento } from '../acoes.ts';
import { CHAVE_DOS_CHAMADOS, type FichaDoChamado } from '../consultas.ts';
import { EditorDasOpcoes } from '../EditorDasOpcoes.tsx';
import { type AnexoCitado, rotuloDoAtivoCitado } from '../formulario/estado.ts';
import { ListaDeAnexos } from '../formulario/ListaDeAnexos.tsx';
import { Recusa } from '../formulario/Recusa.tsx';
import { useFilaDeAnexos } from '../formulario/useFilaDeAnexos.ts';
import estilos from './CampoDeEscrever.module.css';
import { EscolhaDoAtivo } from './EscolhaDoAtivo.tsx';
import {
  ajudaDoCampo,
  ativoNaoEncontrado,
  comandoParaLer,
  envioDoCampo,
  formaDoCampo,
  ID_DO_CAMPO_DE_ESCREVER,
  inserirNoTexto,
  type ModoDoCampo,
  SEM_O_ATIVO_LIGADO,
} from './escrever.ts';

type RespostaPronta = FichaDoChamado['respostasProntas'][number];
type CartaoDoAtivo = components['schemas']['CartaoDoAtivo'];

/** O que se escreve, até ser mandado. */
interface Rascunho {
  texto: string;
  modo: ModoDoCampo;
  esperar: boolean;
  /** Os anexos, na ordem, já enviados e ainda sem dono. */
  ids: readonly string[];
  anexos: ReadonlyMap<string, AnexoCitado>;
  /** O cartão do ativo, com os dados de quando entrou; o envio grava os da hora de mandar. */
  cartao: CartaoDoAtivo | null;
  /** As opções da pergunta, do "Pedir uma escolha" ou da resposta pronta; nulo, sem pergunta. */
  opcoes: readonly string[] | null;
}

const RASCUNHO_VAZIO: Rascunho = {
  texto: '',
  modo: 'mensagem',
  esperar: false,
  ids: [],
  anexos: new Map(),
  cartao: null,
  opcoes: null,
};

/** As respostas prontas que vão também em botões, ao lado do menu. */
const RESPOSTAS_A_VISTA = 2;

/** A pausa na escrita, em ms, depois da qual o campo lê o "/ativo". */
const PAUSA_DO_COMANDO = 600;

/** O "/ativo" como o campo o reconhece: pelo patrimônio escrito ou, sozinho, pelo ativo ligado. */
const chaveDoComando = (comando: ComandoDoAtivo) => comando.patrimonio ?? '';

/** O "/ativo" lido pela prévia: o texto de agora sem a linha do comando, e o cartão. */
interface ComandoLido {
  texto: string;
  cartao: CartaoDoAtivo;
}

const NENHUM_DESLIGADO: readonly string[] = [];

/** A recusa do envio, pelo campo que a teve. */
type CampoDaRecusa = 'texto' | 'anexos' | 'opcoes' | 'cartao';

/** Rola o elemento para perto, no que rola em volta dele, como o meio do campo na janela baixa. */
const trazerAVista = (elemento: Element | null | undefined) =>
  elemento?.scrollIntoView({ block: 'nearest' });

/**
 * O que entra no meio do campo vem à vista quando o sinal muda para um valor que não é nulo: na
 * janela baixa, o meio rola por dentro, e o que entra embaixo ficaria escondido. O primeiro valor
 * não rola, e o rascunho que volta abre no alto.
 */
function useVemAVista(sinal: unknown, alvo: () => Element | null | undefined) {
  const anterior = useRef(sinal);
  useEffect(() => {
    if (Object.is(sinal, anterior.current)) return;
    anterior.current = sinal;
    if (sinal !== null && sinal !== undefined) trazerAVista(alvo());
  });
}

export interface PropsDoCampoDeEscrever {
  ficha: FichaDoChamado;
  /** O que se escreveu foi aceito: a conversa vai à última mensagem. */
  aoEnviar: () => void;
}

/**
 * O campo de escrever, o "Reabra o chamado para escrever." no resolvido, o "O chamado fechou em
 * 18/11." no fechado ou nada, sem atender.
 */
export function CampoDeEscrever({ ficha, aoEnviar }: PropsDoCampoDeEscrever) {
  const [rascunho, definirRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);
  const forma = usePreferencias().preferencias.aparencia.conversas;
  const campo = formaDoCampo(ficha);
  if (campo === null) return null;
  return (
    <section className={estilos.campo} aria-label="Escrever no chamado" data-forma={forma}>
      <div className={estilos.coluna}>
        {campo === 'reabrir' && <ReabrirParaEscrever ficha={ficha} />}
        {campo === 'fechado' && <ChamadoFechado ficha={ficha} />}
        {campo === 'escrever' && (
          <Escrever
            ficha={ficha}
            rascunho={rascunho}
            definirRascunho={definirRascunho}
            aoEnviar={aoEnviar}
          />
        )}
      </div>
    </section>
  );
}

/** No resolvido, o campo dá lugar ao "Reabrir", o mesmo do cabeçalho. */
function ReabrirParaEscrever({ ficha: { numero, versao } }: { ficha: FichaDoChamado }) {
  const acoes = useAcoesDoAtendimento();
  const [reabrindo, definirReabrindo] = useState(false);
  const reabrir = async () => {
    if (reabrindo) return;
    definirReabrindo(true);
    try {
      await acoes.reabrir(numero, versao);
    } finally {
      definirReabrindo(false);
    }
  };
  return (
    <div className={estilos.reabrir}>
      <p>Reabra o chamado para escrever.</p>
      <Botao
        icone={RotateCcw}
        carregando={reabrindo}
        rotuloCarregando="Reabrindo"
        onPress={() => void reabrir()}
      >
        Reabrir
      </Botao>
    </div>
  );
}

/** No fechado, a frase com o último dia em que ele se reabria, sem ação. */
function ChamadoFechado({ ficha }: { ficha: FichaDoChamado }) {
  const agora = useAgora();
  const dataHora = useDataHora();
  const dia = ficha.reabrirAte === null ? null : diaDoReabrir(ficha.reabrirAte, agora, dataHora);
  return (
    <div className={estilos.reabrir}>
      <p>{dia === null ? 'O chamado fechou.' : `O chamado fechou em ${dia}.`}</p>
    </div>
  );
}

function Escrever({
  ficha,
  rascunho,
  definirRascunho,
  aoEnviar,
}: {
  ficha: FichaDoChamado;
  rascunho: Rascunho;
  definirRascunho: Dispatch<SetStateAction<Rascunho>>;
  aoEnviar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const agora = useAgora();
  const dataHora = useDataHora();
  const { pode } = useAcesso();
  const desligados = useServidor()?.modulosDesligados ?? NENHUM_DESLIGADO;
  const caixa = useRef<HTMLTextAreaElement>(null);
  const escolha = useRef<HTMLInputElement>(null);
  const idDaAjuda = useId();
  const [enviando, definirEnviando] = useState(false);
  const [erroDoTexto, definirErroDoTexto] = useState<string | null>(null);
  const [erroDosAnexos, definirErroDosAnexos] = useState<string | null>(null);
  const [erroDasOpcoes, definirErroDasOpcoes] = useState<string | null>(null);
  // A pergunta do "Pedir uma escolha", que sai da tela ao ser apertado: a primeira opção recebe o
  // foco. A da resposta pronta deixa o foco na caixa, onde o texto entrou.
  const [focarNaPergunta, definirFocarNaPergunta] = useState(false);
  const [erroDoCartao, definirErroDoCartao] = useState<string | null>(null);
  // A recusa do "/ativo", pelo comando que a teve: ela fica à vista enquanto o comando é o mesmo.
  const [recusaDoComando, definirRecusaDoComando] = useState<{
    chave: string;
    texto: string;
  } | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  // A recusa do envio que vem à vista, a cada vez, também quando repete a de antes.
  const [recusaDoEnvio, definirRecusaDoEnvio] = useState<{
    campo: CampoDaRecusa;
    vez: number;
  } | null>(null);
  // O que entra no meio do campo, para vir à vista.
  const recusaDoComandoNaTela = useRef<HTMLParagraphElement>(null);
  const cartaoNaTela = useRef<HTMLDivElement>(null);
  const erroDoCartaoNaTela = useRef<HTMLParagraphElement>(null);
  const opcoesNaTela = useRef<HTMLFieldSetElement>(null);
  const listaNaTela = useRef<HTMLUListElement>(null);
  const ultimaRecusaNaTela = useRef<HTMLParagraphElement>(null);
  const erroDosAnexosNaTela = useRef<HTMLParagraphElement>(null);
  const falhaNaTela = useRef<HTMLParagraphElement>(null);
  const { fila, progresso, recusas, receber, limparRecusas } = useFilaDeAnexos({
    ocupados: rascunho.ids.length,
    soNoNavegador: false,
    aoAnexar: (id, anexo) => {
      definirErroDosAnexos(null);
      definirRascunho((antes) => ({
        ...antes,
        ids: [...antes.ids, id],
        anexos: new Map(antes.anexos).set(id, anexo),
      }));
    },
  });

  const { texto, modo, esperar, ids, anexos, cartao, opcoes } = rascunho;
  const pessoa = nomeCurto(ficha.pessoa.nome);
  const envio = envioDoCampo(modo, esperar, pessoa);
  const nota = modo === 'nota';
  const respostas = nota ? [] : ficha.respostasProntas;
  const cabeMais = ids.length + fila.length < MAXIMO_DE_ANEXOS;
  const usaOCartao = pode('ativos.ver') && !desligados.includes('ativos');
  const comando = comandoDoAtivo(texto);
  const recusaDeAgora =
    comando !== null && recusaDoComando?.chave === chaveDoComando(comando)
      ? recusaDoComando.texto
      : null;
  // O texto de agora, para a prévia que chega depois de quem continuou escrevendo.
  const textoDeAgora = useRef(texto);
  textoDeAgora.current = texto;
  // A leitura do "/ativo" no ar, pelo comando: o envio espera por ela em vez de pedir outra.
  const leituraNoAr = useRef<{ chave: string; lido: Promise<ComandoLido | null> } | null>(null);
  // O comando cuja leitura falhou sem conexão ou no servidor: a pausa não o lê de novo sozinha, e o
  // envio o relê.
  const falhouNaLeitura = useRef<string | null>(null);
  // O comando recusado com que o envio já parou uma vez: o envio seguinte o manda como está.
  const paradoNaRecusa = useRef<string | null>(null);

  // O que entra no meio vem à vista: a recusa do "/ativo", o cartão, a recusa do envio e a última
  // recusa dos arquivos. As opções da resposta pronta não, porque o foco fica no texto que entrou.
  // A falha do pé também, a cada tentativa: na tela estreita, quem rola é a página.
  useVemAVista(falha === null ? null : tentativa, () => falhaNaTela.current);
  useVemAVista(recusaDeAgora, () => recusaDoComandoNaTela.current);
  useVemAVista(cartao, () => cartaoNaTela.current);
  useVemAVista(recusaDoEnvio, () => {
    switch (recusaDoEnvio?.campo) {
      case 'texto':
        // O erro do kit, embaixo da caixa, que pode ser mais alta que o meio.
        return caixa.current?.parentElement?.querySelector('[slot="errorMessage"]');
      case 'anexos':
        return erroDosAnexosNaTela.current;
      case 'opcoes':
        return opcoesNaTela.current?.querySelector('[role="alert"]');
      case 'cartao':
        return erroDoCartaoNaTela.current;
      default:
        return null;
    }
  });
  useVemAVista(recusas.at(-1)?.chave ?? null, () => ultimaRecusaNaTela.current);
  // O arquivo que entra na lista, e não o que sai dela nem o que acaba de subir.
  const arquivosNoCampo = ids.length + fila.length;
  const arquivosAntes = useRef(arquivosNoCampo);
  useEffect(() => {
    const entrou = arquivosNoCampo > arquivosAntes.current;
    arquivosAntes.current = arquivosNoCampo;
    if (entrou) trazerAVista(listaNaTela.current?.lastElementChild);
  }, [arquivosNoCampo]);

  // A caixa cresce com o texto, até a metade da janela; dali em diante, rola.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada texto e a cada modo.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    const medir = () => {
      // Zerar a altura encolhe por um instante o que rola em volta, como o meio do campo e a tela
      // estreita, e o navegador puxa a rolagem deles para cima: ela volta ao lugar depois da medida.
      const rolagens: [Element, number][] = [];
      for (let pai = elemento.parentElement; pai; pai = pai.parentElement) {
        if (pai.scrollTop > 0) rolagens.push([pai, pai.scrollTop]);
      }
      // Com a altura zerada, a medida é a do texto, e não a das duas linhas da caixa vazia.
      elemento.style.height = '0px';
      const bordas = elemento.offsetHeight - elemento.clientHeight;
      elemento.style.height = `${elemento.scrollHeight + bordas}px`;
      for (const [pai, topo] of rolagens) pai.scrollTop = topo;
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [texto, modo]);

  // A resposta pronta entra onde estava o cursor, e o cursor fica no fim dela.
  const cursor = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o cursor vai ao lugar depois do texto novo.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento || cursor.current === null) return;
    elemento.setSelectionRange(cursor.current, cursor.current);
    cursor.current = null;
  }, [texto]);

  // A resposta escolhida no menu: o menu fechado devolve o foco ao botão dele, que o passa à caixa. Se
  // ele não voltar, a próxima tecla ou o próximo aperto o esquecem, como no quadro.
  const voltaDoMenu = useRef(false);
  useEffect(() => {
    const esquecer = () => {
      voltaDoMenu.current = false;
    };
    document.addEventListener('pointerdown', esquecer, true);
    document.addEventListener('keydown', esquecer, true);
    return () => {
      document.removeEventListener('pointerdown', esquecer, true);
      document.removeEventListener('keydown', esquecer, true);
    };
  }, []);

  const mudar = (parte: Partial<Rascunho>) => definirRascunho((antes) => ({ ...antes, ...parte }));

  /**
   * Lê o "/ativo" pela prévia do cartão, uma leitura por comando de cada vez: a que está no ar serve
   * também ao envio. Devolve o texto e o cartão com que o envio segue, ou nulo.
   */
  function lerOComando(lido: ComandoDoAtivo): Promise<ComandoLido | null> {
    const chave = chaveDoComando(lido);
    const noAr = leituraNoAr.current;
    if (noAr?.chave === chave) return noAr.lido;
    const leitura = buscarOCartao(lido, chave).finally(() => {
      if (leituraNoAr.current?.lido === leitura) leituraNoAr.current = null;
    });
    leituraNoAr.current = { chave, lido: leitura };
    return leitura;
  }

  /**
   * Achado, o cartão entra no campo e a linha do comando sai do texto de agora. Não encontrado, a
   * frase fica embaixo da caixa e o texto, como foi escrito. Sem conexão ou com o erro do servidor,
   * a falha vai ao pé, e o comando não é recusado: o envio o lê de novo.
   */
  async function buscarOCartao(lido: ComandoDoAtivo, chave: string): Promise<ComandoLido | null> {
    const recusar = (frase: string) => {
      falhouNaLeitura.current = null;
      definirRecusaDoComando({ chave, texto: frase });
      return null;
    };
    const ligado = ficha.ativo;
    if (lido.patrimonio === null && ligado === null) return recusar(SEM_O_ATIVO_LIGADO);
    const query =
      lido.patrimonio === null ? { ativo: ligado?.id ?? '' } : { patrimonio: lido.patrimonio };
    const resultado = await pedir(
      () =>
        api.GET('/chamados/{numero}/cartao', {
          params: { path: { numero: ficha.numero }, query },
        }),
      'buscar o ativo',
    );
    if ('erro' in resultado) {
      if (resultado.problema?.status === 404) {
        return recusar(ativoNaoEncontrado(lido.patrimonio ?? ligado?.patrimonio ?? null));
      }
      falhouNaLeitura.current = chave;
      definirFalha(resultado.erro);
      definirTentativa((anterior) => anterior + 1);
      return null;
    }
    falhouNaLeitura.current = null;
    definirFalha(null);
    // Quem continuou escrevendo pode ter trocado o comando: a prévia vale só para o mesmo.
    const deAgora = comandoDoAtivo(textoDeAgora.current);
    if (deAgora === null || chaveDoComando(deAgora) !== chave) return null;
    definirRecusaDoComando(null);
    definirErroDoCartao(null);
    mudar({ cartao: resultado.dados, texto: deAgora.semOComando });
    return { texto: deAgora.semOComando, cartao: resultado.dados };
  }

  // O "/ativo" lido depois da pausa na escrita, uma vez por comando recusado ou que falhou.
  const chaveParaLer = (() => {
    const paraLer = comandoParaLer(texto);
    return paraLer === null ? null : chaveDoComando(paraLer);
  })();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a leitura segue o texto e a recusa do comando.
  useEffect(() => {
    if (
      chaveParaLer === null ||
      recusaDoComando?.chave === chaveParaLer ||
      falhouNaLeitura.current === chaveParaLer ||
      enviando
    ) {
      return;
    }
    const espera = window.setTimeout(() => {
      const paraLer = comandoParaLer(textoDeAgora.current);
      if (paraLer) void lerOComando(paraLer);
    }, PAUSA_DO_COMANDO);
    return () => window.clearTimeout(espera);
  }, [texto, chaveParaLer, recusaDoComando, enviando]);

  function usarResposta(resposta: RespostaPronta, doMenu: boolean) {
    const elemento = caixa.current;
    const inicio = elemento?.selectionStart ?? texto.length;
    const fim = elemento?.selectionEnd ?? inicio;
    const inserido = inserirNoTexto(texto, inicio, fim, resposta.texto);
    cursor.current = inserido.cursor;
    definirRascunho((antes) => ({
      ...antes,
      texto: inserido.texto,
      esperar: antes.esperar || resposta.esperaAResposta,
      // A que tem opções as põe no campo, no lugar das que havia.
      opcoes: resposta.opcoes.length > 0 ? [...resposta.opcoes] : antes.opcoes,
    }));
    definirErroDoTexto(null);
    if (resposta.opcoes.length > 0) {
      definirErroDasOpcoes(null);
      definirFocarNaPergunta(false);
    }
    if (doMenu) voltaDoMenu.current = true;
    else elemento?.focus();
  }

  async function enviar() {
    if (enviando || fila.length > 0 || texto.trim() === '') return;
    let textoDoEnvio = texto;
    let cartaoDoEnvio = cartao;
    if (comando !== null) {
      const chave = chaveDoComando(comando);
      if (recusaDoComando?.chave !== chave) {
        // O "/ativo" que a pausa não leu, ou cuja leitura falhou, o envio o lê antes, ou espera a
        // leitura que está no ar.
        definirEnviando(true);
        const lido = await lerOComando(comando);
        if (lido === null || lido.texto.trim() === '') {
          // Só com o comando, o cartão entra no campo, e quem escreve escreve a mensagem. Recusado,
          // a frase fica à vista, e o envio seguinte manda o texto como está.
          paradoNaRecusa.current = chave;
          definirEnviando(false);
          caixa.current?.focus();
          return;
        }
        textoDoEnvio = lido.texto;
        cartaoDoEnvio = lido.cartao;
      } else if (paradoNaRecusa.current !== chave) {
        // O que a pausa recusou para o primeiro envio, com a frase à vista, para quem escreveu sem
        // a ver; o seguinte manda o texto como está.
        paradoNaRecusa.current = chave;
        caixa.current?.focus();
        trazerAVista(recusaDoComandoNaTela.current);
        return;
      }
    }
    definirEnviando(true);
    const comum = {
      texto: textoDoEnvio,
      anexos: ids.length > 0 ? [...ids] : undefined,
      cartao: cartaoDoEnvio?.ativo,
    };
    const comAsOpcoes = {
      ...comum,
      opcoes: opcoes !== null && opcoes.length > 0 ? [...opcoes] : undefined,
    };
    const caminho = { path: { numero: ficha.numero } };
    const fazer = () => {
      switch (envio.rota) {
        case '/chamados/{numero}/mensagem':
          return api.POST('/chamados/{numero}/mensagem', { params: caminho, body: comAsOpcoes });
        case '/chamados/{numero}/esperar':
          return api.POST('/chamados/{numero}/esperar', { params: caminho, body: comAsOpcoes });
        case '/chamados/{numero}/nota':
          return api.POST('/chamados/{numero}/nota', { params: caminho, body: comum });
      }
    };
    const resultado = await pedir(fazer, envio.noErro);
    definirEnviando(false);
    // Aceito ou recusado, a tela relê o chamado, como nas ações do atendimento.
    void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
    if ('erro' in resultado) {
      const campos = resultado.problema?.campos;
      const mostrar = (campo: CampoDaRecusa) =>
        definirRecusaDoEnvio((antes) => ({ campo, vez: (antes?.vez ?? 0) + 1 }));
      if (campos?.texto) {
        definirErroDoTexto(campos.texto);
        caixa.current?.focus();
        mostrar('texto');
      } else if (campos?.anexos) {
        definirErroDosAnexos(campos.anexos);
        mostrar('anexos');
      } else if (campos?.opcoes && !nota) {
        definirErroDasOpcoes(campos.opcoes);
        mostrar('opcoes');
      } else if (campos?.cartao) {
        definirErroDoCartao(campos.cartao);
        mostrar('cartao');
      } else {
        definirFalha(resultado.erro);
        definirTentativa((anterior) => anterior + 1);
      }
      return;
    }
    definirRascunho((antes) => ({ ...RASCUNHO_VAZIO, modo: antes.modo }));
    definirErroDoTexto(null);
    definirErroDosAnexos(null);
    definirErroDasOpcoes(null);
    definirErroDoCartao(null);
    definirRecusaDoComando(null);
    definirFalha(null);
    limparRecusas();
    paradoNaRecusa.current = null;
    aoEnviar();
    // A caixa vazia recebe o foco para a mensagem seguinte, e não o "Enviar", que desliga.
    caixa.current?.focus();
  }

  const pedirUmaEscolha = () => {
    mudar({ opcoes: ['', ''] });
    definirErroDasOpcoes(null);
    definirFocarNaPergunta(true);
  };

  return (
    <div className={estilos.escrever} data-modo={modo}>
      <div className={estilos.linha}>
        <ControleSegmentado
          rotulo="O que escrever"
          ocultarRotulo
          value={modo}
          onChange={(valor) => {
            mudar({ modo: valor === 'nota' ? 'nota' : 'mensagem' });
            // As recusas de antes eram do outro modo, como o "Escreva a mensagem.".
            definirErroDoTexto(null);
            definirErroDasOpcoes(null);
            definirFalha(null);
            // As opções que voltam com a mensagem não tomam o foco da chave.
            definirFocarNaPergunta(false);
          }}
        >
          <Segmento value="mensagem" className={estilos.segmento}>
            <Icone icone={MessageSquareText} tamanho={14} />
            {`Mensagem para ${pessoa}`}
          </Segmento>
          <Segmento value="nota" className={estilos.segmento}>
            <Icone icone={Lock} tamanho={14} />
            Nota interna
          </Segmento>
        </ControleSegmentado>
        {!nota && (
          <Checkbox isSelected={esperar} onChange={(marcado) => mudar({ esperar: marcado })}>
            Esperar a resposta
          </Checkbox>
        )}
        {!nota && (
          <p id={idDaAjuda} className={estilos.ajuda}>
            {ajudaDoCampo(pessoa, ficha.pessoa.usaOChat)}
          </p>
        )}
      </div>
      <div className={estilos.meio}>
        <AreaDeTexto
          id={ID_DO_CAMPO_DE_ESCREVER}
          ref={caixa}
          rotulo={nota ? 'Nota interna' : `Mensagem para ${pessoa}`}
          ocultarRotulo
          aria-describedby={nota ? undefined : idDaAjuda}
          placeholder={
            nota ? `Escreva a nota. ${pessoa} não a vê.` : `Escreva a resposta para ${pessoa}.`
          }
          value={texto}
          onChange={(novo) => {
            mudar({ texto: novo });
            definirErroDoTexto(null);
          }}
          isReadOnly={enviando}
          erro={erroDoTexto ?? undefined}
          className={estilos.caixa}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
              evento.preventDefault();
              void enviar();
              return;
            }
            // O resto das teclas segue para os atalhos da casca.
            evento.continuePropagation();
          }}
        />
        {recusaDeAgora && <Recusa ref={recusaDoComandoNaTela} texto={recusaDeAgora} />}
        {cartao && (
          <div ref={cartaoNaTela} className={estilos.cartao}>
            <CartaoDoAtivoNaMensagem
              cartao={cartao}
              agora={agora}
              dataHora={dataHora}
              abrir={false}
              acao={
                !enviando && (
                  <Botao
                    nivel="terciario"
                    aria-label={`Tirar o cartão de ${cartao.nome}`}
                    onPress={() => {
                      mudar({ cartao: null });
                      definirErroDoCartao(null);
                      caixa.current?.focus();
                    }}
                  >
                    Tirar
                  </Botao>
                )
              }
            />
            {erroDoCartao && <Recusa ref={erroDoCartaoNaTela} texto={erroDoCartao} />}
          </div>
        )}
        {!nota && opcoes !== null && (
          <EditorDasOpcoes
            ref={opcoesNaTela}
            opcoes={opcoes}
            editavel={!enviando}
            erro={erroDasOpcoes}
            focarAoAparecer={focarNaPergunta}
            aoMudar={(novas) => {
              definirErroDasOpcoes(null);
              // Sem nenhuma opção, a pergunta sai, e "Pedir uma escolha" volta.
              mudar({ opcoes: novas.length === 0 ? null : novas });
              if (novas.length === 0) caixa.current?.focus();
            }}
          />
        )}
        <ListaDeAnexos
          ref={listaNaTela}
          ids={ids}
          anexos={anexos}
          fila={fila}
          progresso={progresso}
          numero={ficha.numero}
          editavel={!enviando}
          rotulo={nota ? 'Anexos da nota' : 'Anexos da mensagem'}
          aoTirar={(id) => {
            definirErroDosAnexos(null);
            definirRascunho((antes) => {
              const restantes = new Map(antes.anexos);
              restantes.delete(id);
              return {
                ...antes,
                ids: antes.ids.filter((outro) => outro !== id),
                anexos: restantes,
              };
            });
          }}
        />
        {recusas.map(({ chave, texto: recusa }, posicao) => (
          <Recusa
            key={chave}
            ref={posicao === recusas.length - 1 ? ultimaRecusaNaTela : undefined}
            texto={recusa}
          />
        ))}
        {erroDosAnexos && <Recusa ref={erroDosAnexosNaTela} texto={erroDosAnexos} />}
      </div>
      <div className={estilos.linha}>
        {respostas.length > 0 && (
          <>
            <Menu
              rotulo="Respostas prontas"
              posicao="top start"
              gatilho={
                <Botao
                  icone={Zap}
                  onFocus={() => {
                    if (!voltaDoMenu.current) return;
                    voltaDoMenu.current = false;
                    caixa.current?.focus();
                  }}
                >
                  Respostas prontas
                </Botao>
              }
            >
              {respostas.map((resposta) => (
                <ItemDeMenu
                  key={resposta.id}
                  id={resposta.id}
                  descricao={resposta.esperaAResposta ? 'Espera a resposta' : undefined}
                  onAction={() => usarResposta(resposta, true)}
                >
                  {resposta.rotulo}
                </ItemDeMenu>
              ))}
            </Menu>
            {respostas.slice(0, RESPOSTAS_A_VISTA).map((resposta) => (
              <Botao key={resposta.id} onPress={() => usarResposta(resposta, false)}>
                {resposta.rotulo}
              </Botao>
            ))}
          </>
        )}
        <div className={estilos.fim}>
          {cabeMais && (
            <>
              <input
                ref={escolha}
                type="file"
                multiple
                hidden
                accept={FORMATOS_DE_ARQUIVO.join(',')}
                onChange={(evento) => {
                  definirErroDosAnexos(null);
                  receber([...(evento.target.files ?? [])]);
                  // O mesmo arquivo pode ser escolhido de novo, depois de tirado.
                  evento.target.value = '';
                }}
              />
              <BotaoDeIcone
                icone={Paperclip}
                rotulo="Anexar arquivos"
                onPress={() => escolha.current?.click()}
              />
            </>
          )}
          {usaOCartao && (
            <EscolherOCartao
              ficha={ficha}
              desligado={enviando}
              aoEscolher={(escolhido) => {
                mudar({ cartao: escolhido });
                definirErroDoCartao(null);
              }}
            />
          )}
          {!nota && opcoes === null && (
            <Botao icone={ListChecks} isDisabled={enviando} onPress={pedirUmaEscolha}>
              Pedir uma escolha
            </Botao>
          )}
          <span className={estilos.envio}>
            <TeclaDeAtalho teclas={['mod', 'Enter']} />
            <Botao
              nivel="primario"
              icone={Send}
              carregando={enviando}
              rotuloCarregando={envio.carregando}
              isDisabled={fila.length > 0 || texto.trim() === ''}
              onPress={() => void enviar()}
            >
              {envio.rotulo}
            </Botao>
          </span>
        </div>
      </div>
      <MensagemDoPasso ref={falhaNaTela} texto={falha} chave={tentativa} />
    </div>
  );
}

/**
 * "Cartão do ativo": o diálogo escolhe o ativo como o "Trocar o ativo", a começar pelo ligado ao
 * chamado, e a prévia do cartão, pelo id, põe no campo os dados de agora. A recusa fica no diálogo.
 */
function EscolherOCartao({
  ficha,
  desligado,
  aoEscolher,
}: {
  ficha: FichaDoChamado;
  desligado: boolean;
  aoEscolher: (cartao: CartaoDoAtivo) => void;
}) {
  const api = useApi();
  const { numero, ativo, pessoa } = ficha;
  const [aberto, definirAberto] = useState(false);
  const [escolhido, definirEscolhido] = useState<ContaDoSeletor | null>(null);
  const [erro, definirErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [buscando, definirBuscando] = useState(false);

  const mudarAberto = (abrir: boolean) => {
    if (buscando) return;
    if (abrir) {
      definirEscolhido(ativo ? { id: ativo.id, rotulo: rotuloDoAtivoCitado(ativo) } : null);
      definirErro(null);
      definirFalha(null);
    }
    definirAberto(abrir);
  };

  const inserir = async (id: string) => {
    if (buscando) return;
    definirBuscando(true);
    const resultado = await pedir(
      () =>
        api.GET('/chamados/{numero}/cartao', {
          params: { path: { numero }, query: { ativo: id } },
        }),
      'buscar o ativo',
    );
    definirBuscando(false);
    if ('erro' in resultado) {
      if (resultado.problema?.status === 404) {
        definirErro(ativoNaoEncontrado(null));
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((anterior) => anterior + 1);
      return;
    }
    aoEscolher(resultado.dados);
    definirAberto(false);
  };

  return (
    <Dialogo
      gatilho={
        <Botao icone={IdCard} isDisabled={desligado}>
          Cartão do ativo
        </Botao>
      }
      titulo="Cartão do ativo"
      aberto={aberto}
      aoMudarAberto={mudarAberto}
      acoes={(fechar) => (
        <>
          <Botao isDisabled={buscando} onPress={fechar}>
            Cancelar
          </Botao>
          <Botao
            nivel="primario"
            carregando={buscando}
            rotuloCarregando="Inserindo o cartão"
            isDisabled={escolhido === null}
            onPress={() => {
              if (escolhido) void inserir(escolhido.id);
            }}
          >
            Inserir o cartão
          </Botao>
        </>
      )}
    >
      <div className={estilos.formulario}>
        <EscolhaDoAtivo
          valor={escolhido}
          aoMudar={(novo) => {
            definirEscolhido(novo);
            definirErro(null);
          }}
          pessoa={{ id: pessoa.id, nome: pessoa.nome }}
          descricao="O cartão vai na mensagem com os dados da hora de mandar."
          erro={erro ?? undefined}
        />
        <MensagemDoPasso texto={falha} chave={tentativa} />
      </div>
    </Dialogo>
  );
}
