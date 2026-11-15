// O assistente da distribuição (spec distribuicao-de-software, "Distribuição às máquinas"; change
// software-por-pacote, design, decisão 10; m03 a m05 e m08): o trilho dos quatro passos à esquerda,
// com o que já saiu hoje; o passo no centro; e o "Até agora" à direita, com a conta da prévia e o
// caminho até a outra distribuição em que as máquinas já aguardam o pacote. Nada é enviado antes do
// último passo, e o passo feito volta pelo trilho. Vindo da matriz, com o pacote e as máquinas no
// endereço, ele abre no passo Quando.
import { explicarOComando, MENSAGENS_DO_QUANDO } from '@grafite/domain';
import {
  avisar,
  Botao,
  Carimbo,
  Icone,
  MensagemDoPasso,
  RotuloDeSituacao,
  type Situacao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  ExternalLink,
  Info,
  Monitor,
  MoonStar,
  Send,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useId, useState } from 'react';
import { FalhaDaConsulta } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilos from './Assistente.module.css';
import {
  ALVO_VAZIO,
  type AlvoDoAssistente,
  alvoEscolhido,
  CHAVE_DO_SOFTWARE,
  type MaquinaDaPrevia,
  type PacoteDeSoftware,
  type PreviaDaDistribuicao,
  useAlvos,
  useDistribuicoes,
  usePacotes,
  usePrevia,
} from './consultas.ts';
import { nomeComVersao, plural, textoDaOutra, tipoETamanho } from './formatos.ts';
import {
  ABRE_A_NOITE,
  amanhaNoFuso,
  comMaiuscula,
  conferirODia,
  diaCurto,
  FECHA_A_NOITE,
  naJanelaDaNoite,
  type QuandoDoAssistente,
  relogioNoFuso,
  textoDoMomento,
} from './momento.ts';
import { PassoDasMaquinas } from './PassoDasMaquinas.tsx';
import { PassoDeConferir, porOutra } from './PassoDeConferir.tsx';
import { PassoDoPacote } from './PassoDoPacote.tsx';
import { PassoDoQuando } from './PassoDoQuando.tsx';
import { IconeDoPacote } from './Pecas.tsx';
import doSoftware from './Software.module.css';

export type Passo = 1 | 2 | 3 | 4;

const PASSOS = ['Pacote', 'Máquinas', 'Quando', 'Conferir'] as const;

/** O que vem no endereço: o pacote da ficha e, da matriz, as máquinas marcadas e o local dela. */
export interface PedidoDoAssistente {
  pacote?: string;
  maquinas?: string[];
  local?: string;
}

const texto = (valor: unknown): valor is string => typeof valor === 'string' && valor !== '';

export function lerPedidoDoAssistente(busca: Record<string, unknown>): PedidoDoAssistente {
  const pedido: PedidoDoAssistente = {};
  if (texto(busca.pacote)) pedido.pacote = busca.pacote;
  const maquinas = Array.isArray(busca.maquinas) ? busca.maquinas.filter(texto) : [];
  if (maquinas.length > 0) pedido.maquinas = maquinas;
  if (texto(busca.local)) pedido.local = busca.local;
  return pedido;
}

/** "Financeiro, 18 máquinas"; só "12 máquinas", sem local; e o nome, quando é uma máquina só. */
function paraQuemComTotal(paraQuem: string, total: number): string {
  const maquinas = plural(total, 'máquina', 'máquinas');
  return total === 1 || paraQuem === maquinas ? paraQuem : `${paraQuem}, ${maquinas}`;
}

/** O texto debaixo do número do "Até agora": de onde vêm as máquinas escolhidas. */
function textoDoTotal(paraQuem: string, total: number): string {
  if (total === 1) return `máquina escolhida: ${paraQuem}`;
  if (paraQuem === plural(total, 'máquina', 'máquinas')) return 'máquinas escolhidas';
  if (/^\d+ locais$/.test(paraQuem)) return `máquinas escolhidas, de ${paraQuem}`;
  return `máquinas escolhidas, do local ${paraQuem}`;
}

/** "agora", "hoje à noite", "amanhã" ou "qui 12/11": o rótulo das que vão instalar, no Conferir. */
function quandoInstalam(quando: QuandoDoAssistente, agora: Date, fuso: string): string {
  if (quando.chave === 'agora') return 'agora';
  if (quando.chave === 'noite') return naJanelaDaNoite(agora, fuso) ? 'agora' : 'hoje à noite';
  if (!quando.dia) return 'no dia marcado';
  return quando.dia === amanhaNoFuso(agora, fuso) ? 'amanhã' : diaCurto(quando.dia);
}

export function NovaDistribuicao() {
  const pedido = useSearch({ from: '/gestao/software/distribuicoes/nova' });
  const navegar = useNavigate();
  const router = useRouter();
  const api = useApi();
  const consultas = useQueryClient();
  const sessao = useSessao();
  const { fuso } = useDataHora();
  const pacotes = usePacotes();
  const alvos = useAlvos(fuso);
  const daMatriz = pedido.pacote !== undefined && pedido.maquinas !== undefined;
  const [passo, definirPasso] = useState<Passo>(daMatriz ? 3 : pedido.pacote ? 2 : 1);
  const [pacoteId, definirPacoteId] = useState<string | null>(pedido.pacote ?? null);
  const [alvo, definirAlvo] = useState<AlvoDoAssistente>(
    daMatriz ? { ...ALVO_VAZIO, ativoIds: pedido.maquinas ?? [] } : ALVO_VAZIO,
  );
  // A escolha da matriz vale até a pessoa mudar as máquinas no passo 2.
  const [vindoDaMatriz, definirVindoDaMatriz] = useState(daMatriz);
  // As máquinas tiradas da lista uma a uma, que a prévia não devolve mais: ficam à vista, desmarcadas.
  const [tiradas, definirTiradas] = useState<ReadonlyMap<string, MaquinaDaPrevia>>(new Map());
  const [quando, definirQuando] = useState<QuandoDoAssistente>(() => ({
    chave: 'agora',
    dia: amanhaNoFuso(new Date(), fuso),
    hora: ABRE_A_NOITE,
  }));
  const [conferiuODia, definirConferiuODia] = useState(false);
  const [diaRecusado, definirDiaRecusado] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  // A recusa do envio. A do alvo relê a prévia e, sem nenhuma que entra, ganha o caminho até as
  // outras distribuições em que elas já aguardam o pacote.
  const [recusa, definirRecusa] = useState<{
    texto: string | null;
    vez: number;
    doAlvo: boolean;
  }>({ texto: null, vez: 0, doAlvo: false });
  const recusar = (motivo: string, doAlvo = false) =>
    definirRecusa(({ vez }) => ({ texto: motivo, vez: vez + 1, doAlvo }));

  const ativos = (pacotes.data?.pacotes ?? []).filter((um) => um.situacao === 'ativo');
  const pacote = ativos.find((um) => um.id === pacoteId) ?? null;
  const previa = usePrevia(pacote?.id ?? null, alvo, fuso);
  // A visão que deixou de valer depois da contagem, na recusa da prévia: a aba "Por visão" é relida
  // e a mostra desabilitada (decisão 10).
  const falhaDaPrevia = previa.error instanceof FalhaDaConsulta ? previa.error.falha : null;
  const visaoQueDeixouDeValer = falhaDaPrevia?.problema?.campos?.visoes;
  useEffect(() => {
    if (visaoQueDeixouDeValer !== undefined) {
      void consultas.invalidateQueries({ queryKey: [...CHAVE_DO_SOFTWARE, 'alvos'] });
    }
  }, [visaoQueDeixouDeValer, consultas]);
  const escolheu = alvoEscolhido(alvo);
  // O pacote do endereço que não está entre os ativos manda de volta ao primeiro passo, e a falta de
  // máquinas, ao segundo.
  const atual: Passo =
    passo > 1 && !pacotes.isPending && !pacote ? 1 : passo > 2 && !escolheu ? 2 : passo;
  const conta = escolheu ? previa.data : undefined;
  const total = conta?.maquinas.length ?? 0;
  // A prévia recusada não deixa seguir com a conta de antes, que o cache guarda depois de relida.
  const temMaquinas =
    !previa.isError && conta !== undefined && conta.conta.vaoInstalar + conta.conta.naFila > 0;
  // A recusa da prévia vem num campo, que o "Até agora" não tem: o texto é o do campo. Na visão que
  // deixou de valer, ele leva a saída de dentro do assistente: desmarcá-la no passo Máquinas, onde a
  // caixa dela segue habilitada enquanto marcada.
  const textoDaFalhaDaPrevia =
    visaoQueDeixouDeValer !== undefined
      ? `${visaoQueDeixouDeValer} ${atual === 2 ? 'Desmarque-a para seguir sem ela.' : 'Volte ao passo Máquinas e desmarque-a.'}`
      : (Object.values(falhaDaPrevia?.problema?.campos ?? {})[0] ?? previa.error?.message);

  const agora = new Date();
  const dia = quando.chave === 'dia' ? conferirODia(quando, agora, fuso) : null;
  const errosDoDia = conferiuODia && dia && !dia.ok ? dia.erros : {};
  const momento = textoDoMomento(quando, agora, fuso);
  const localDaMatriz = alvos.data?.locais.find((local) => local.id === pedido.local)?.nome ?? null;

  const irPara = (proximo: Passo) => {
    definirRecusa(({ vez }) => ({ texto: null, vez, doAlvo: false }));
    definirPasso(proximo);
  };

  const subs = [
    pacote ? nomeComVersao(pacote) : 'O que instalar',
    atual > 2 && conta
      ? vindoDaMatriz
        ? `${plural(total, 'máquina', 'máquinas')}, ${total === 1 ? 'vinda' : 'vindas'} da matriz`
        : paraQuemComTotal(conta.paraQuem, total)
      : 'Por local, visão ou busca',
    atual > 3 ? comMaiuscula(momento) : 'Agora ou na janela da noite',
    'O que vai acontecer',
  ];
  const nota =
    atual === 4
      ? 'Nada foi enviado ainda.'
      : atual === 3 && vindoDaMatriz
        ? 'Os passos 1 e 2 já vieram da matriz. Você pode voltar e mudar a escolha.'
        : 'Nada é enviado antes do passo 4. Você pode voltar a qualquer passo.';
  const seguir =
    atual === 1
      ? { texto: 'Máquinas', pode: pacote !== null }
      : { texto: atual === 2 ? 'Quando instalar' : 'Conferir', pode: temMaquinas };

  const avancar = () => {
    if (atual === 3 && quando.chave === 'dia' && (!dia?.ok || diaRecusado)) {
      definirConferiuODia(true);
      return;
    }
    irPara((atual + 1) as Passo);
  };

  async function enviar() {
    if (!pacote) return;
    let aPartirDe: string | null = null;
    if (quando.chave === 'dia') {
      const conferido = conferirODia(quando, new Date(), fuso);
      if (!conferido.ok) {
        recusar(conferido.erros.dia ?? conferido.erros.hora ?? MENSAGENS_DO_QUANDO.diaFaltando);
        return;
      }
      aPartirDe = conferido.instante.toISOString();
    }
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        api.POST('/software/distribuicoes', {
          body: {
            pacoteId: pacote.id,
            alvo: { ...alvo, fuso },
            quando: quando.chave,
            aPartirDe,
            fuso,
          },
        }),
      'enviar a distribuição',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<'aPartirDe' | 'alvo' | 'visoes' | 'pacoteId' | 'fuso'>(resultado);
      // A visão que deixou de valer entre a conta e o envio: a prévia relida a recusa também, e o
      // "Até agora" diz o motivo com o caminho até as Máquinas, sem deixar seguir com a conta velha.
      // A recusa da prévia relê a aba "Por visão" (decisão 10).
      if (campos?.visoes !== undefined) {
        definirRecusa(({ vez }) => ({ texto: null, vez, doAlvo: false }));
        await consultas.invalidateQueries({ queryKey: [...CHAVE_DO_SOFTWARE, 'previa'] });
        return;
      }
      // A recusa do alvo diz que a prévia ficou velha, como quando outra distribuição levou as
      // máquinas entre a conta e o envio. A prévia relida mostra onde elas ficaram (decisão 10).
      const doAlvo = campos?.alvo !== undefined;
      recusar(
        campos?.aPartirDe ?? campos?.alvo ?? campos?.pacoteId ?? campos?.fuso ?? resultado.erro,
        doAlvo,
      );
      if (doAlvo) {
        await consultas.invalidateQueries({ queryKey: [...CHAVE_DO_SOFTWARE, 'previa'] });
      }
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo: `Distribuição criada para ${plural(resultado.dados.maquinas, 'máquina', 'máquinas')}.`,
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
    await navegar({
      to: '/gestao/software/distribuicoes/$id',
      params: { id: resultado.dados.id },
    });
  }

  const tirarDaLista = (maquinas: readonly MaquinaDaPrevia[]) => {
    definirAlvo({ ...alvo, fora: [...alvo.fora, ...maquinas.map((maquina) => maquina.id)] });
    definirTiradas(
      new Map([...tiradas, ...maquinas.map((maquina) => [maquina.id, maquina] as const)]),
    );
  };

  const centro =
    atual === 1 ? (
      <PassoDoPacote
        pacotes={ativos}
        carregando={pacotes.isPending}
        falha={pacotes.isError ? pacotes.error.message : null}
        escolhido={pacote?.id ?? null}
        aoEscolher={definirPacoteId}
      />
    ) : atual === 2 ? (
      <PassoDasMaquinas
        alvo={alvo}
        definirAlvo={(novo) => {
          definirAlvo(novo);
          definirVindoDaMatriz(false);
        }}
        previa={previa.isError ? undefined : conta}
        versaoAlvo={pacote?.versao ?? null}
        tiradas={tiradas}
        definirTiradas={definirTiradas}
      />
    ) : !pacote ? (
      <p role="status" className={estilos.nota}>
        Carregando o pacote…
      </p>
    ) : atual === 3 ? (
      <PassoDoQuando
        quando={quando}
        definirQuando={definirQuando}
        erros={errosDoDia}
        aoRecusarODia={definirDiaRecusado}
        origem={
          vindoDaMatriz ? { local: localDaMatriz, aoVoltar: () => router.history.back() } : null
        }
        pacote={pacote}
        previa={conta}
      />
    ) : conta ? (
      <PassoDeConferir
        pacote={pacote}
        previa={conta}
        quandoInstalam={quandoInstalam(quando, agora, fuso)}
        aoTirarDaLista={tirarDaLista}
      />
    ) : (
      <p role="status" className={estilos.nota}>
        Contando as máquinas…
      </p>
    );

  const doPasso = (dados: PreviaDaDistribuicao) =>
    atual === 2 || (atual === 3 && vindoDaMatriz) ? (
      <Conta
        previa={dados}
        versaoAlvo={pacote?.versao ?? null}
        texto={
          atual === 3
            ? `${total === 1 ? 'máquina marcada' : 'máquinas marcadas'} na matriz${localDaMatriz ? ` do local ${localDaMatriz}` : ''}`
            : undefined
        }
      />
    ) : atual === 3 ? (
      <ResumoDoQuando
        previa={dados}
        versaoAlvo={pacote?.versao ?? null}
        quando={quando}
        momento={momento}
        naJanela={naJanelaDaNoite(agora, fuso)}
      />
    ) : (
      <ResumoDoEnvio
        previa={dados}
        quando={quando}
        momento={momento}
        quemEnvia={sessao.tipo === 'ativa' ? sessao.conta.nome : null}
      />
    );

  return (
    <div className={estilos.assistente} data-janela-inteira="">
      <Trilho passo={atual} subs={subs} nota={nota} aoVoltar={irPara} />
      <div className={estilos.centro}>{centro}</div>
      <AteAgora
        pacote={pacote}
        passo={atual}
        rodape={
          <>
            {atual === 1 ? (
              <Botao onPress={() => void navegar({ to: '/gestao/software/distribuicoes' })}>
                Cancelar
              </Botao>
            ) : (
              <Botao
                icone={ArrowLeft}
                isDisabled={enviando}
                onPress={() => irPara((atual - 1) as Passo)}
              >
                Voltar
              </Botao>
            )}
            {atual === 4 ? (
              <Botao
                nivel="primario"
                icone={Send}
                isDisabled={!temMaquinas}
                carregando={enviando}
                rotuloCarregando="Enviando…"
                onPress={() => void enviar()}
                className={estilos.seguir}
              >
                Enviar
              </Botao>
            ) : (
              <Botao
                nivel="primario"
                isDisabled={!seguir.pode}
                onPress={avancar}
                className={estilos.seguir}
              >
                {seguir.texto}
                <Icone icone={ArrowRight} />
              </Botao>
            )}
          </>
        }
      >
        {atual > 1 && (
          <>
            {atual < 4 && <hr className={estilos.separador} />}
            {!escolheu ? (
              <p className={estilos.nota}>Marque locais, visões ou máquinas ao lado.</p>
            ) : previa.isError ? (
              <p role="alert" className={estilos.nota}>
                {textoDaFalhaDaPrevia}
              </p>
            ) : !conta ? (
              <p role="status" className={estilos.nota}>
                Contando as máquinas…
              </p>
            ) : (
              doPasso(conta)
            )}
            {atual === 4 && <MensagemDoPasso texto={recusa.texto} chave={recusa.vez} />}
            {/* O aviso sai só da prévia relida de verdade, sem nenhuma que entra. */}
            {atual === 4 && recusa.doAlvo && !previa.isError && conta && !temMaquinas && (
              <AvisoDasQueJaAguardam maquinas={conta.maquinas} />
            )}
          </>
        )}
      </AteAgora>
    </div>
  );
}

function Trilho({
  passo,
  subs,
  nota,
  aoVoltar,
}: {
  passo: Passo;
  subs: readonly string[];
  nota: string;
  aoVoltar: (passo: Passo) => void;
}) {
  const titulo = useId();
  return (
    <nav className={estilos.trilho} aria-labelledby={titulo}>
      <p id={titulo} className={estilos.tituloDoTrilho}>
        Nova distribuição
      </p>
      <ol className={estilos.passos}>
        {PASSOS.map((nome, indice) => {
          const numero = (indice + 1) as Passo;
          const estado = numero < passo ? 'feito' : numero === passo ? 'agora' : 'depois';
          const conteudo = (
            <>
              <span className={estilos.bola} aria-hidden="true">
                {estado === 'feito' ? <Icone icone={Check} /> : numero}
              </span>
              <span className={estilos.textoDoPasso}>
                <b>{nome}</b>
                <span>{subs[indice]}</span>
              </span>
            </>
          );
          return (
            <li
              key={nome}
              data-estado={estado}
              aria-current={estado === 'agora' ? 'step' : undefined}
            >
              {estado === 'feito' ? (
                <button type="button" className={estilos.passo} onClick={() => aoVoltar(numero)}>
                  {conteudo}
                  <span className={estilos.oculto}>, feito. Voltar a este passo.</span>
                </button>
              ) : (
                <div className={estilos.passo}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className={estilos.peDoTrilho}>
        <JaEnviadoHoje />
        <p className={estilos.notaDoTrilho}>{nota}</p>
      </div>
    </nav>
  );
}

/** As distribuições que saíram hoje, as mais novas primeiro, para não mandar o mesmo duas vezes. */
function JaEnviadoHoje() {
  const distribuicoes = useDistribuicoes();
  const { formatarHora, grupoDoDia } = useDataHora();
  const agora = new Date();
  const deHoje = (distribuicoes.data?.distribuicoes ?? [])
    .filter((distribuicao) => grupoDoDia(new Date(distribuicao.criadaEm), agora) === 'Hoje')
    .slice(0, 3);
  if (deHoje.length === 0) return null;
  return (
    <div className={estilos.hoje}>
      <p className={estilos.legendaForte}>Já enviado hoje</p>
      <ul>
        {deHoje.map((distribuicao) => (
          <li key={distribuicao.id}>
            <b>
              {nomeComVersao(distribuicao.pacote)}, {distribuicao.paraQuem}
            </b>
            <span>
              <span className={estilos.mono}>{formatarHora(new Date(distribuicao.criadaEm))}</span>
              {` · ${distribuicao.progresso}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AteAgora({
  pacote,
  passo,
  rodape,
  children,
}: {
  pacote: PacoteDeSoftware | null;
  passo: Passo;
  rodape: ReactNode;
  children: ReactNode;
}) {
  const titulo = useId();
  return (
    <aside className={estilos.ateAgora} aria-labelledby={titulo}>
      <Carimbo id={titulo}>Até agora</Carimbo>
      {pacote ? (
        <CartaoDoPacote pacote={pacote} />
      ) : (
        <p className={estilos.nota}>
          {passo === 1 ? 'Escolha o pacote ao lado.' : 'Carregando o pacote…'}
        </p>
      )}
      {children}
      <div className={estilos.rodape}>{rodape}</div>
    </aside>
  );
}

/** O pacote escolhido, com o tipo, o tamanho e o que a instalação faz ("instala sem perguntar"). */
function CartaoDoPacote({ pacote }: { pacote: PacoteDeSoftware }) {
  const { resumo } = explicarOComando(pacote.comando);
  return (
    <div className={estilos.pacote}>
      <IconeDoPacote nome={pacote.nome} tamanho="m" />
      <span className={estilos.textoDoPacote}>
        <b>{nomeComVersao(pacote)}</b>
        <span>
          {[tipoETamanho(pacote), resumo ? `instala ${resumo}` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </div>
  );
}

/**
 * A conta da prévia: quantas vão instalar, quantas já têm a versão-alvo, quantas já aguardam este
 * pacote noutra distribuição e quantas vão para a fila.
 */
function Conta({
  previa,
  versaoAlvo,
  texto: textoDoNumero,
}: {
  previa: PreviaDaDistribuicao;
  versaoAlvo: string | null;
  /** O texto debaixo do número, no lugar do de onde vêm as máquinas, como o da matriz. */
  texto?: string;
}) {
  const { conta, maquinas, paraQuem } = previa;
  const total = maquinas.length;
  const linhas: { situacao: Situacao; texto: string; quantas: number }[] = [
    { situacao: 'sucesso', texto: 'Vão instalar', quantas: conta.vaoInstalar },
    {
      situacao: 'neutra',
      texto: versaoAlvo ? `Já têm a ${versaoAlvo} · puladas` : 'Puladas',
      quantas: conta.puladas,
    },
    { situacao: 'neutra', texto: 'Já aguardam este pacote · puladas', quantas: conta.jaAguardam },
    { situacao: 'atencao', texto: 'Na fila', quantas: conta.naFila },
  ];
  const naFila = maquinas.filter((maquina) => maquina.classe === 'na-fila');
  // Recebe este pacote em seguida só a que entra; a pulada e a que já aguarda não o recebem.
  const ocupadas = maquinas.filter(
    (maquina) =>
      (maquina.classe === 'vai-instalar' || maquina.classe === 'na-fila') &&
      maquina.emAndamento !== null,
  );
  const [semContato] = naFila;
  const [ocupada] = ocupadas;
  return (
    <>
      <p className={estilos.total}>
        <span className={estilos.numeroGrande}>{total}</span>
        <span>{textoDoNumero ?? textoDoTotal(paraQuem, total)}</span>
      </p>
      {total === 0 ? (
        <p className={estilos.nota}>Nenhuma máquina com o agente do GLPI no que você marcou.</p>
      ) : (
        <dl className={estilos.quadro}>
          {linhas
            .filter(({ quantas }) => quantas > 0)
            .map(({ situacao, texto, quantas }) => (
              <div key={texto}>
                <dt>
                  <RotuloDeSituacao situacao={situacao} semIcone>
                    {texto}
                  </RotuloDeSituacao>
                </dt>
                <dd>{quantas}</dd>
              </div>
            ))}
        </dl>
      )}
      {semContato && (
        <Aviso tipo="atencao">
          {naFila.length === 1 ? (
            <>
              <b>
                {semContato.rotulo} sem contato
                {semContato.semContato
                  ? ` há ${plural(semContato.semContato.dias, 'dia', 'dias')}`
                  : ''}
                .
              </b>{' '}
              Ela entra na fila e instala quando voltar, ou você a tira da lista.
            </>
          ) : (
            <>
              <b>{naFila.length} máquinas sem contato.</b> Elas entram na fila e instalam quando
              voltarem, ou você as tira da lista.
            </>
          )}
        </Aviso>
      )}
      {ocupada?.emAndamento && (
        <Aviso tipo="info">
          {ocupadas.length === 1 ? (
            <>
              <b>
                {ocupada.rotulo} ainda instala o {ocupada.emAndamento.pacote}.
              </b>{' '}
              Este pacote entra na fila dela e instala em seguida.
            </>
          ) : (
            <>
              <b>{ocupadas.length} máquinas ainda instalam outro pacote.</b> Este entra na fila de
              cada uma e instala em seguida.
            </>
          )}
        </Aviso>
      )}
      <AvisoDasQueJaAguardam maquinas={maquinas} />
    </>
  );
}

/**
 * As que já aguardam este pacote noutra distribuição (decisão 10): quantas, e o caminho até cada
 * outra, em outra aba, onde o "Tirar da fila" deixa mandar de novo; a escolha segue no assistente.
 * Também na recusa de quando nenhuma entra.
 */
function AvisoDasQueJaAguardam({ maquinas }: { maquinas: readonly MaquinaDaPrevia[] }) {
  const dataHora = useDataHora();
  const jaAguardam = maquinas.filter((maquina) => maquina.classe === 'ja-aguarda');
  const outras = porOutra(jaAguardam);
  const [primeira] = jaAguardam;
  if (!primeira || outras.length === 0) return null;
  const agora = new Date();
  const uma = jaAguardam.length === 1;
  return (
    <Aviso tipo="info">
      <b>
        {uma ? `${primeira.rotulo} já aguarda` : `${jaAguardam.length} máquinas já aguardam`} este
        pacote
      </b>{' '}
      {outras.length === 1
        ? `noutra distribuição e ${uma ? 'segue' : 'seguem'} nela: `
        : 'noutras distribuições e seguem nelas: '}
      {outras.map(({ outra }, indice) => {
        const texto = textoDaOutra(outra, agora, dataHora);
        // O ícone de outra aba fica preso à última palavra, sem quebrar sozinho para a outra linha.
        const corte = texto.lastIndexOf(' ') + 1;
        return (
          <Fragment key={outra.id}>
            {indice > 0 && (indice === outras.length - 1 ? ' e ' : ', ')}
            <Link
              to="/gestao/software/distribuicoes/$id"
              params={{ id: outra.id }}
              target="_blank"
              rel="noopener"
              className={doSoftware.link}
              aria-label={`Abrir a distribuição ${texto}, em outra aba`}
            >
              {texto.slice(0, corte)}
              <span className={estilos.semQuebra}>
                {texto.slice(corte)}
                <span className={estilos.iconeDaOutraAba}>
                  <Icone icone={ExternalLink} tamanho={14} />
                </span>
              </span>
            </Link>
          </Fragment>
        );
      })}
      .
    </Aviso>
  );
}

/**
 * O "Até agora" do passo Quando (m04): quantas, quando, e o que acontece com as puladas, as que já
 * aguardam este pacote noutra distribuição e a fila.
 */
function ResumoDoQuando({
  previa,
  versaoAlvo,
  quando,
  momento,
  naJanela,
}: {
  previa: PreviaDaDistribuicao;
  versaoAlvo: string | null;
  quando: QuandoDoAssistente;
  momento: string;
  naJanela: boolean;
}) {
  const { puladas, jaAguardam, naFila } = previa.conta;
  const total = previa.maquinas.length;
  const outras = porOutra(previa.maquinas.filter((maquina) => maquina.classe === 'ja-aguarda'));
  const fila =
    naFila === 0
      ? ''
      : naFila === 1
        ? ' A sem contato entra na fila.'
        : ' As sem contato entram na fila.';
  const doQuando =
    quando.chave === 'agora'
      ? { icone: Zap, titulo: 'Segue agora', texto: 'Cada máquina instala em poucos minutos.' }
      : quando.chave === 'noite'
        ? {
            icone: MoonStar,
            titulo: `Toda noite, das ${ABRE_A_NOITE} às ${FECHA_A_NOITE}`,
            texto: `O pedido segue ${naJanela ? 'agora' : `hoje às ${ABRE_A_NOITE}`}; quem não instalar tenta na noite seguinte.`,
          }
        : {
            icone: CalendarCheck,
            titulo: `A partir de ${momento}`,
            texto: 'O pedido só segue no dia e na hora marcados.',
          };
  return (
    <>
      <p className={estilos.total}>
        <span className={estilos.numeroGrande}>{total}</span>
        <span>
          {[
            total === 1 ? 'máquina' : 'máquinas',
            momento,
            quando.chave === 'noite' ? 'a pessoa não percebe' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </p>
      <ul className={estilos.oQueAcontece}>
        {puladas > 0 ? (
          <li>
            <Icone icone={Monitor} />
            <span>
              <b>
                {versaoAlvo
                  ? `${puladas} já ${puladas === 1 ? 'tem' : 'têm'} a ${versaoAlvo}`
                  : plural(puladas, 'pulada', 'puladas')}
              </b>
              {puladas === 1 ? 'Será pulada.' : 'Serão puladas.'}
              {fila}
            </span>
          </li>
        ) : (
          naFila > 0 && (
            <li>
              <Icone icone={Monitor} />
              <span>
                <b>{naFila} sem contato</b>
                {naFila === 1
                  ? 'Entra na fila e instala quando voltar.'
                  : 'Entram na fila e instalam quando voltarem.'}
              </span>
            </li>
          )
        )}
        {jaAguardam > 0 && (
          <li>
            <Icone icone={Monitor} />
            <span>
              <b>
                {jaAguardam} já {jaAguardam === 1 ? 'aguarda' : 'aguardam'} este pacote
              </b>
              {outras.length > 1
                ? 'Seguem nas outras distribuições.'
                : jaAguardam === 1
                  ? 'Segue na outra distribuição.'
                  : 'Seguem na outra distribuição.'}
            </span>
          </li>
        )}
        <li>
          <Icone icone={doQuando.icone} />
          <span>
            <b>{doQuando.titulo}</b>
            {doQuando.texto}
          </span>
        </li>
      </ul>
    </>
  );
}

/** O "Até agora" do passo Conferir (m05): para quem, quando e quem envia, e o que vem depois. */
function ResumoDoEnvio({
  previa,
  quando,
  momento,
  quemEnvia,
}: {
  previa: PreviaDaDistribuicao;
  quando: QuandoDoAssistente;
  momento: string;
  quemEnvia: string | null;
}) {
  const { fuso } = useDataHora();
  const titulo = useId();
  const agora = new Date();
  const naJanela = naJanelaDaNoite(agora, fuso);
  const depoisDaMeiaNoite = naJanela && relogioNoFuso(agora, fuso).hora < 12;
  const noite = quando.chave === 'noite';
  // Só a hora sai em mono; "Agora" e "Amanhã" são texto.
  const primeiro =
    quando.chave === 'dia' && quando.dia
      ? { quando: `${diaCurto(quando.dia)}, ${quando.hora}`, mono: true }
      : noite && !naJanela
        ? { quando: ABRE_A_NOITE, mono: true }
        : { quando: 'Agora', mono: false };
  const segundo = noite
    ? naJanela
      ? { quando: `Até as ${FECHA_A_NOITE}`, mono: false }
      : { quando: `${ABRE_A_NOITE} a ${FECHA_A_NOITE}`, mono: true }
    : { quando: quando.chave === 'dia' ? 'Em seguida' : 'Em poucos minutos', mono: false };
  const terceiro = noite
    ? { quando: depoisDaMeiaNoite ? `Depois das ${FECHA_A_NOITE}` : 'Amanhã', mono: false }
    : { quando: 'Depois', mono: false };
  const depois = [
    { ...primeiro, texto: 'As máquinas ligadas recebem o pedido e instalam.' },
    {
      ...segundo,
      texto: 'Cada máquina passa a Instalando e a Concluída, na ficha da distribuição.',
    },
    {
      ...terceiro,
      texto: noite
        ? 'O que falhar aparece em Precisa de você; quem não instalar tenta na noite seguinte.'
        : 'O que falhar aparece em Precisa de você.',
    },
  ];
  return (
    <>
      <dl className={`${estilos.quadro} ${estilos.quadroDoEnvio}`}>
        <div>
          <dt>Para</dt>
          <dd>{paraQuemComTotal(previa.paraQuem, previa.maquinas.length)}</dd>
        </div>
        <div>
          <dt>Quando</dt>
          <dd>{comMaiuscula(momento)}</dd>
        </div>
        {quemEnvia && (
          <div>
            <dt>Quem envia</dt>
            <dd>{quemEnvia}</dd>
          </div>
        )}
      </dl>
      <Carimbo id={titulo}>Depois de enviar</Carimbo>
      <ol className={estilos.depois} aria-labelledby={titulo}>
        {depois.map((linha) => (
          <li key={linha.quando}>
            <b className={linha.mono ? estilos.mono : undefined}>{linha.quando}</b>
            <span>{linha.texto}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function Aviso({ tipo, children }: { tipo: 'atencao' | 'info'; children: ReactNode }) {
  return (
    <div className={estilos.aviso} data-tipo={tipo}>
      <Icone icone={tipo === 'atencao' ? TriangleAlert : Info} />
      <p>{children}</p>
    </div>
  );
}
