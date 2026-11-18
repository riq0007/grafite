// O Início dos chamados (spec modulo-chamados, "Início dos chamados"; change chamados-da-ti, design,
// "O Início dos chamados (tarefa 5.17)"; mockup m12): a saudação e a contagem no alto; à esquerda,
// as colunas de "Quem está com o quê", sem a triagem; à direita, a triagem, com "Assumir" e "Passar
// para…", e os prazos compactos, sem os parados, com a frase deles no pé. As colunas vêm do mesmo
// quadro e da mesma lista dos prazos de "Quem está com o quê", num relógio só: a idade do mais
// antigo, o prazo, a contagem e a saudação viram no mesmo minuto.
import { AVISO_DO_ALCANCE, saudacao } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  Icone,
  ItemDeMenu,
  Menu,
  useDataHora,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { CircleAlert, HandGrab, Hourglass, Info } from 'lucide-react';
import {
  type FocusEvent,
  Fragment,
  type ReactNode,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useArvoreDosLocais } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { type ChamadoDepoisDaAcao, useAcoesDoAtendimento } from '../acoes.ts';
import { BuscaNosChamados } from '../BuscaNosChamados.tsx';
import {
  type PrazosDosChamados,
  type QuadroDosChamados,
  usePrazosDosChamados,
  useQuadroDosChamados,
} from '../consultas.ts';
import { IconeDoTipo, PrazoEmTexto } from '../Pecas.tsx';
import { type ContarOPrazo, contadorDoPrazo } from '../prazo.ts';
import { type GrupoDosPrazos, gruposDosPrazos } from '../prazos/lista.ts';
import { TabelaDosPrazos } from '../prazos/TabelaDosPrazos.tsx';
import { type ChamadoNoAr, Colunas, Dica } from '../quadro/Quadro.tsx';
import { textoDosAbertos } from '../quadro/quadro.ts';
import {
  acoesDaTriagem,
  contagemDoInicio,
  fraseDosParados,
  gruposDoInicio,
  linhasDaTriagem,
  type NumerosDoInicio,
  numerosDoInicio,
  quemPediuNaTriagem,
} from './inicio.ts';
import estilos from './TelaDoInicio.module.css';

export function TelaDoInicio() {
  const quadro = useQuadroDosChamados();
  const prazos = usePrazosDosChamados();
  const agora = useAgora();
  const dataHora = useDataHora();
  const { fuso } = dataHora;
  const contar = useMemo(() => contadorDoPrazo(agora, fuso), [agora, fuso]);
  const sessao = useSessao();
  const nome = sessao.tipo === 'ativa' ? sessao.conta.nome : '';
  const arrasta = useAcesso().pode('chamados.atender');
  // O chamado no ar, que a dica diz e que pede o cursor de segurar na tela inteira.
  const [noAr, definirNoAr] = useState<ChamadoNoAr | null>(null);
  const idDasPessoas = useId();

  // Os grupos da lista compacta, no minuto da tela: a contagem, os prazos e os parados saem deles.
  const grupos = useMemo(
    () =>
      prazos.data
        ? gruposDosPrazos(prazos.data.chamados, {
            horario: prazos.data.horario,
            contar,
            agora,
            dataHora,
            compacto: true,
          })
        : null,
    [prazos.data, contar, agora, dataHora],
  );

  const falha = quadro.isError ? quadro.error : prazos.isError ? prazos.error : null;
  const relendo = quadro.isFetching || prazos.isFetching;
  const tentarDeNovo = (
    <Botao
      carregando={relendo}
      rotuloCarregando="Tentando de novo"
      onPress={() => {
        if (quadro.isError) void quadro.refetch();
        if (prazos.isError) void prazos.refetch();
      }}
    >
      Tentar de novo
    </Botao>
  );
  // Tudo só com os dois pedidos na mão, como em "Quem está com o quê".
  const naTela =
    quadro.data && prazos.data && grupos
      ? { quadro: quadro.data, prazos: prazos.data, grupos }
      : null;

  let conteudo: ReactNode;
  if (naTela) {
    const abertosDasColunas = naTela.quadro.colunas.reduce(
      (soma, coluna) => soma + coluna.abertos.length,
      0,
    );
    conteudo = (
      <>
        {falha && (
          <div role="alert" className={estilos.falhaAoReler}>
            <Icone icone={CircleAlert} tamanho={14} />
            <p>{`${falha.message} O Início mostra a última leitura.`}</p>
            {tentarDeNovo}
          </div>
        )}
        <div className={estilos.meio}>
          <section className={estilos.pessoas} aria-labelledby={idDasPessoas}>
            <header className={estilos.cabecaDoBloco}>
              <h2 id={idDasPessoas}>Quem está com o quê</h2>
              <div className={estilos.apoioDoBloco}>
                <span>{textoDosAbertos(abertosDasColunas)}</span>
                <Dica noAr={noAr} arrasta={arrasta} />
              </div>
            </header>
            <Colunas
              quadro={naTela.quadro}
              chamados={naTela.prazos.chamados}
              horario={naTela.prazos.horario}
              agora={agora}
              contar={contar}
              relendo={relendo}
              aoArrastar={definirNoAr}
              comTriagem={false}
              comAviso={false}
              nivel={3}
            />
          </section>
          <div className={estilos.direita}>
            <TriagemDoInicio
              quadro={naTela.quadro}
              prazos={naTela.prazos}
              contar={contar}
              relendo={relendo}
            />
            <PrazosDoInicio grupos={naTela.grupos} />
          </div>
        </div>
      </>
    );
  } else if (falha) {
    conteudo = <EstadoVazio className={estilos.falha} titulo={falha.message} acao={tentarDeNovo} />;
  } else {
    conteudo = (
      <p role="status" className={estilos.carregando}>
        Carregando os chamados…
      </p>
    );
  }

  return (
    <div
      className={estilos.tela}
      data-janela-inteira=""
      // No arraste, o cursor do sistema, de segurar, em vez do suavizado.
      data-arrastando={noAr ? '' : undefined}
      data-cursor-nativo={noAr ? '' : undefined}
    >
      <CabecalhoDaPagina
        titulo={saudacao(nome, agora, fuso)}
        detalhe={
          naTela && (
            <ContagemDoAlto
              numeros={numerosDoInicio(naTela.quadro, naTela.grupos)}
              soOsLocaisQueVe={naTela.quadro.contandoSoOsLocaisQueVe}
            />
          )
        }
        acoes={<BuscaNosChamados />}
      />
      {conteudo}
    </div>
  );
}

/**
 * A contagem do alto, com a triagem e o estourado em peso forte, e, a quem não vê a organização
 * inteira, o aviso do alcance embaixo.
 */
function ContagemDoAlto({
  numeros,
  soOsLocaisQueVe,
}: {
  numeros: NumerosDoInicio;
  soOsLocaisQueVe: boolean;
}) {
  return (
    <div className={estilos.contagem}>
      <p>
        {contagemDoInicio(numeros).map(({ texto, forte }, indice) =>
          forte ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o lugar do trecho na frase.
            <b key={indice}>{texto}</b>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o lugar do trecho na frase.
            <Fragment key={indice}>{texto}</Fragment>
          ),
        )}
      </p>
      {soOsLocaisQueVe && (
        <p className={estilos.alcance}>
          <Icone icone={Info} tamanho={14} />
          {AVISO_DO_ALCANCE}
        </p>
      )}
    </div>
  );
}

/**
 * A triagem do Início: uma linha por chamado, pela ordem do vencimento, com "Assumir" e "Passar
 * para…" a quem atende. A linha da ação aceita sai na releitura, e o foco que estava nela vai ao
 * primeiro botão da linha que ficou no lugar, ou da última, ou, sem nenhuma, ao título da caixa.
 */
function TriagemDoInicio({
  quadro,
  prazos,
  contar,
  relendo,
}: {
  quadro: QuadroDosChamados;
  prazos: PrazosDosChamados;
  contar: ContarOPrazo;
  relendo: boolean;
}) {
  const idDoTitulo = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const sessao = useSessao();
  const conta = sessao.tipo === 'ativa' ? sessao.conta.id : null;
  const podeAtender = useAcesso().pode('chamados.atender');
  // Os ramos de quem atende só uns locais, para o "Passar para…".
  const arvore = useArvoreDosLocais(podeAtender);
  const acoes = useAcoesDoAtendimento();
  const linhas = linhasDaTriagem(quadro, prazos, contar);
  // O botão que espera a resposta: os outros da triagem esperam com ele.
  const [esperando, definirEsperando] = useState<{ numero: number; botao: string } | null>(null);
  const esperandoAgora = useRef(false);

  // O foco numa linha, pela posição dela: quando ela sai, o foco que caiu no corpo da página vai à
  // linha que ficou no lugar. O menu do "Passar para…" fica fora da lista na página, mas é da linha:
  // o foco nele chega ao `onFocus` dela pela árvore do React e fica guardado como o da linha.
  const emFoco = useRef<{ indice: number; elemento: Element } | null>(null);
  useLayoutEffect(() => {
    const foco = emFoco.current;
    if (!foco) return;
    const ativo = document.activeElement;
    if (foco.elemento.isConnected) {
      if (!ativo || (ativo !== foco.elemento && !lista.current?.contains(ativo))) {
        emFoco.current = null;
      }
      return;
    }
    emFoco.current = null;
    if (ativo && ativo !== document.body) return;
    const itens = lista.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [];
    const item = itens[Math.min(foco.indice, itens.length - 1)];
    const alvo =
      item?.querySelector<HTMLElement>('button') ?? item?.querySelector<HTMLElement>('a');
    if (alvo) alvo.focus();
    else titulo.current?.focus();
  });
  const aoFocar = (indice: number) => (evento: FocusEvent) => {
    emFoco.current = { indice, elemento: evento.target };
  };

  /** A ação, com a versão do quadro: a lista, que pode estar fora de passo, só completa a linha. */
  const agir = async (
    numero: number,
    versaoDaLista: number,
    botao: string,
    fazer: (versao: number) => Promise<ChamadoDepoisDaAcao | null>,
  ) => {
    if (esperandoAgora.current) return;
    esperandoAgora.current = true;
    definirEsperando({ numero, botao });
    try {
      await fazer(quadro.versoes[numero] ?? versaoDaLista);
    } finally {
      esperandoAgora.current = false;
      definirEsperando(null);
    }
  };

  return (
    <section className={`${estilos.caixa} ${estilos.triagem}`} aria-labelledby={idDoTitulo}>
      <header className={estilos.cabecaDaCaixa}>
        <h2 id={idDoTitulo} ref={titulo} tabIndex={-1}>
          Triagem
        </h2>
        {linhas.length > 0 && <p>{`${linhas.length} sem responsável · o prazo já conta`}</p>}
      </header>
      {linhas.length === 0 ? (
        <p className={estilos.vazioDaCaixa}>Nenhum chamado na triagem.</p>
      ) : (
        <ul ref={lista} className={estilos.linhasDaTriagem}>
          {linhas.map(({ numero, chamado, situacao }, indice) => {
            const quais = acoesDaTriagem(chamado, {
              podeAtender,
              conta,
              colunas: quadro.colunas,
              arvore,
            });
            const desta = esperando?.numero === numero ? esperando.botao : null;
            return (
              <li
                key={numero}
                className={estilos.linhaDaTriagem}
                data-numero={numero}
                onFocus={aoFocar(indice)}
              >
                {chamado ? (
                  <>
                    <IconeDoTipo
                      icone={chamado.tipo.icone}
                      nome={chamado.tipo.nome}
                      tamanho="grande"
                    />
                    <div className={estilos.textoDaTriagem}>
                      <Link
                        to="/chamados/$numero"
                        params={{ numero: String(numero) }}
                        className={estilos.tituloDaTriagem}
                      >
                        {chamado.titulo}
                      </Link>
                      <span className={estilos.quemDaTriagem}>
                        {`#${numero} · ${quemPediuNaTriagem(chamado)}`}
                      </span>
                    </div>
                    <span className={estilos.prazoDaTriagem}>
                      <PrazoEmTexto situacao={situacao} forma="inteira" />
                    </span>
                  </>
                ) : (
                  <span className={estilos.semDetalhes}>
                    <span className={estilos.mono}>{`#${numero}`}</span>
                    {relendo ? 'Carregando…' : 'Detalhes não carregados'}
                  </span>
                )}
                {chamado && quais && (
                  <div className={estilos.acoesDaTriagem}>
                    {quais.assumir && (
                      <Botao
                        nivel="primario"
                        icone={HandGrab}
                        carregando={desta === 'assumir'}
                        rotuloCarregando="Assumindo"
                        isDisabled={esperando !== null && desta !== 'assumir'}
                        onPress={() =>
                          void agir(numero, chamado.versao, 'assumir', (versao) =>
                            acoes.assumir(numero, versao),
                          )
                        }
                      >
                        Assumir
                      </Botao>
                    )}
                    <Menu
                      rotulo={`Passar o #${numero}`}
                      gatilho={
                        <Botao
                          carregando={desta === 'passar'}
                          rotuloCarregando="Passando"
                          isDisabled={esperando !== null && desta !== 'passar'}
                        >
                          Passar para…
                        </Botao>
                      }
                    >
                      {quais.pessoas.length === 0 ? (
                        <ItemDeMenu id="ninguem" isDisabled>
                          Ninguém mais atende os locais do chamado.
                        </ItemDeMenu>
                      ) : (
                        quais.pessoas.map((pessoa) => (
                          <ItemDeMenu
                            key={pessoa.conta}
                            id={pessoa.conta}
                            descricao={textoDosAbertos(pessoa.abertos)}
                            onAction={() =>
                              void agir(numero, chamado.versao, 'passar', (versao) =>
                                acoes.passar(numero, versao, pessoa.conta),
                              )
                            }
                          >
                            {pessoa.nome}
                          </ItemDeMenu>
                        ))
                      )}
                    </Menu>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Os prazos do Início: a lista compacta, sem os parados, com as marcas de 8 em 8 h e o link de cada
 * chamado; no pé, a frase dos parados.
 */
function PrazosDoInicio({ grupos }: { grupos: readonly GrupoDosPrazos[] }) {
  const idDoTitulo = useId();
  const correndo = gruposDoInicio(grupos);
  const parados = fraseDosParados(grupos);
  return (
    <section className={`${estilos.caixa} ${estilos.prazos}`} aria-labelledby={idDoTitulo}>
      <header className={estilos.cabecaDaCaixa}>
        <h2 id={idDoTitulo}>Prazos à frente</h2>
        <p>o que vence primeiro, no alto</p>
      </header>
      <div className={estilos.corpoDosPrazos}>
        {correndo.length === 0 ? (
          <p className={estilos.vazioDaCaixa}>Nenhum prazo correndo.</p>
        ) : (
          <TabelaDosPrazos grupos={correndo} forma="inicio" nivel={3} />
        )}
      </div>
      {parados && (
        <p className={estilos.peDosPrazos}>
          <Icone icone={Hourglass} tamanho={14} />
          {parados}
        </p>
      )}
    </section>
  );
}
