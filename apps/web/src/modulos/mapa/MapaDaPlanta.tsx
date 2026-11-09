// O mapa de uma planta (spec mapa-da-planta, "Mapa navegável", "Posição dos ativos na planta",
// "Estado dos ativos no mapa" e "Camadas dos módulos no mapa"; change p7-mapa-da-planta, design,
// decisões 5 e 6): a planta vista de cima num canvas, com o arrastar e o zoom, as camadas do desenho
// e as dos módulos, os textos que cabem, os marcadores com a situação, a busca, o resumo do marcador
// e o posicionamento. As cores vêm dos tokens, lidas na hora, e o redesenho é por quadro, sem
// animação da vista. A lista ao lado repete os marcadores para o teclado e o leitor de tela.
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  Checkbox,
  ControleSegmentado,
  EstadoVazio,
  GrupoDeCheckboxes,
  RotuloDeSituacao,
  Segmento,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Maximize2, Minus, Plus } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { type ContaDoSeletor, SeletorDeConta } from '../administracao/seletores/SeletorDeConta.tsx';
import { useBuscarAtivos } from '../operacao/solicitacoes/escolhas.ts';
import {
  CHAVE_DOS_MARCADORES,
  type MarcadorDoMapa,
  type ModeloDaPlanta,
  useMarcadores,
  useModeloDaPlanta,
  usePlantas,
} from './consultas.ts';
import {
  centrarEm,
  ESCALA_DOS_TEXTOS,
  marcadorNoPonto,
  naPlanta,
  naTela,
  rotulosVisiveis,
  type Vista,
  vistaDaPlantaInteira,
  zoomEm,
} from './desenho.ts';
import { ALVOS_DO_MAPA, EscolhaDaSala, EscolhaDoPainel } from './EscolhaDoAlvo.tsx';
import estilos from './Mapa.module.css';

/** A menor altura do mapa, em px, quando a janela sobra pouco. */
const ALTURA_MINIMA_DO_MAPA = 480;

/** O token da cor de cada tom do marcador. */
const COR_DO_TOM = {
  critico: '--cor-critico',
  atencao: '--cor-atencao',
  sucesso: '--cor-ok',
  info: '--cor-info',
  neutra: '--cor-neutro',
} as const;

/** As cores dos tokens agora, para o canvas, que não lê CSS. */
function coresDoTema(elemento: HTMLElement) {
  const estilo = getComputedStyle(elemento);
  const cor = (token: string) => estilo.getPropertyValue(token).trim();
  return {
    fundo: cor('--cor-superficie'),
    linha: cor('--cor-linha-forte'),
    parede: cor('--cor-texto-2'),
    texto: cor('--cor-texto-2'),
    foco: cor('--cor-foco'),
    destaque: cor('--cor-destaque'),
    tom: (tom: keyof typeof COR_DO_TOM) => cor(COR_DO_TOM[tom]),
  };
}

/** O modelo como a API o entrega: os pontos das paredes chegam como listas de números. */
type ModeloNaTela = Omit<ModeloDaPlanta, 'paredes'> & {
  paredes: { nome: string; pontos: number[][]; altura: number }[];
};

const chaveDo = (marcador: MarcadorDoMapa) => `${marcador.alvo.tipo}:${marcador.alvo.id}`;

/** Desenha a planta e os marcadores na vista. */
function desenhar(
  canvas: HTMLCanvasElement,
  {
    modelo,
    marcadores,
    vista,
    ocultas,
    selecionado,
    pendente,
  }: {
    modelo: ModeloNaTela;
    marcadores: readonly MarcadorDoMapa[];
    vista: Vista;
    ocultas: ReadonlySet<string>;
    selecionado: string | null;
    pendente: { x: number; z: number } | null;
  },
) {
  const contexto = canvas.getContext('2d');
  if (!contexto) return;
  const proporcao = window.devicePixelRatio || 1;
  const largura = canvas.clientWidth;
  const altura = canvas.clientHeight;
  if (canvas.width !== largura * proporcao || canvas.height !== altura * proporcao) {
    canvas.width = largura * proporcao;
    canvas.height = altura * proporcao;
  }
  contexto.setTransform(proporcao, 0, 0, proporcao, 0, 0);
  const cores = coresDoTema(canvas);
  contexto.fillStyle = cores.fundo;
  contexto.fillRect(0, 0, largura, altura);

  // As linhas do desenho, um caminho por camada.
  contexto.lineWidth = 1;
  contexto.strokeStyle = cores.linha;
  for (const camada of modelo.camadas) {
    if (ocultas.has(`desenho:${camada.nome}`)) continue;
    contexto.beginPath();
    const s = camada.segmentos;
    for (let i = 0; i + 3 < s.length; i += 4) {
      const a = naTela(vista, s[i] as number, s[i + 1] as number);
      const b = naTela(vista, s[i + 2] as number, s[i + 3] as number);
      if (
        (a.x < 0 && b.x < 0) ||
        (a.y < 0 && b.y < 0) ||
        (a.x > largura && b.x > largura) ||
        (a.y > altura && b.y > altura)
      ) {
        continue;
      }
      contexto.moveTo(a.x, a.y);
      contexto.lineTo(b.x, b.y);
    }
    contexto.stroke();
  }
  // As paredes e as máquinas, aproximações do desenho.
  contexto.strokeStyle = cores.parede;
  contexto.lineWidth = 2;
  for (const parede of modelo.paredes) {
    contexto.beginPath();
    parede.pontos.forEach(([x = 0, z = 0], indice) => {
      const ponto = naTela(vista, x, z);
      if (indice === 0) contexto.moveTo(ponto.x, ponto.y);
      else contexto.lineTo(ponto.x, ponto.y);
    });
    contexto.stroke();
  }
  contexto.lineWidth = 1;
  for (const maquina of modelo.maquinas) {
    const canto = naTela(
      vista,
      maquina.x - maquina.largura / 2,
      maquina.z - maquina.profundidade / 2,
    );
    contexto.strokeRect(
      canto.x,
      canto.y,
      maquina.largura * vista.escala,
      maquina.profundidade * vista.escala,
    );
  }
  // Os textos que cabem no zoom.
  contexto.fillStyle = cores.texto;
  contexto.font = '11px system-ui, sans-serif';
  contexto.textBaseline = 'middle';
  for (const rotulo of rotulosVisiveis(modelo.rotulos, vista, { largura, altura })) {
    contexto.fillText(rotulo.texto, rotulo.x, rotulo.y);
  }
  // Os marcadores, com o tom da situação e o nome do escolhido.
  for (const marcador of marcadores) {
    if (ocultas.has(`modulo:${marcador.camada}`)) continue;
    const ponto = naTela(vista, marcador.x, marcador.z);
    contexto.beginPath();
    contexto.arc(ponto.x, ponto.y, 7, 0, Math.PI * 2);
    contexto.fillStyle = cores.tom(marcador.situacao.tom);
    contexto.fill();
    contexto.lineWidth = 2;
    contexto.strokeStyle = cores.fundo;
    contexto.stroke();
    if (chaveDo(marcador) === selecionado) {
      contexto.beginPath();
      contexto.arc(ponto.x, ponto.y, 11, 0, Math.PI * 2);
      contexto.strokeStyle = cores.foco;
      contexto.lineWidth = 3;
      contexto.stroke();
      contexto.fillStyle = cores.texto;
      contexto.font = '12px system-ui, sans-serif';
      contexto.fillText(marcador.rotulo, ponto.x + 14, ponto.y);
    }
  }
  if (pendente) {
    const ponto = naTela(vista, pendente.x, pendente.z);
    contexto.beginPath();
    contexto.arc(ponto.x, ponto.y, 8, 0, Math.PI * 2);
    contexto.strokeStyle = cores.destaque;
    contexto.lineWidth = 3;
    contexto.stroke();
  }
}

/** O mapa de uma planta ativa. */
export function MapaDaPlanta() {
  const { id } = useParams({ from: '/mapa/$id' });
  const api = useApi();
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const plantas = usePlantas();
  const modelo = useModeloDaPlanta(id);
  const marcadores = useMarcadores(id);
  const ativos = useBuscarAtivos();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const quadro = useRef<HTMLDivElement | null>(null);
  const areaDoMapa = useRef<HTMLDivElement | null>(null);
  const [altura, definirAltura] = useState<number | null>(null);
  const [vista, definirVista] = useState<Vista | null>(null);
  const [ocultas, definirOcultas] = useState<ReadonlySet<string>>(new Set());
  const [selecionado, definirSelecionado] = useState<string | null>(null);
  const [busca, definirBusca] = useState('');
  const [alvo, definirAlvo] = useState<ContaDoSeletor | null>(null);
  // O tipo do que se posiciona: o ativo, a sala ou o painel, pelas camadas que a conta vê.
  const [tipoDoAlvo, definirTipoDoAlvo] = useState('ativo');
  const [posicionando, definirPosicionando] = useState(false);
  const [pendente, definirPendente] = useState<{ x: number; z: number } | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const arraste = useRef<{ x: number; y: number; vista: Vista; moveu: boolean } | null>(null);

  const planta = plantas.data?.plantas.find((uma) => uma.id === id);
  const lista = marcadores.data?.marcadores ?? [];
  const podeEditar = marcadores.data?.podeEditar ?? false;
  const posicionaveis = marcadores.data?.posicionaveis ?? [];
  const escolherAlvo = (escolhido: ContaDoSeletor | null) => {
    definirAlvo(escolhido);
    definirPosicionando(escolhido !== null);
    definirPendente(null);
  };
  const escolhido = lista.find((marcador) => chaveDo(marcador) === selecionado) ?? null;

  const area = useCallback(() => {
    const elemento = canvas.current;
    return { largura: elemento?.clientWidth ?? 800, altura: elemento?.clientHeight ?? 600 };
  }, []);

  // A vista começa com a planta inteira, quando o modelo chega e o quadro tem tamanho.
  useEffect(() => {
    if (!modelo.data || vista) return;
    definirVista(vistaDaPlantaInteira(modelo.data, area()));
  }, [modelo.data, vista, area]);

  // O redesenho a cada mudança, no quadro seguinte.
  useEffect(() => {
    if (!canvas.current || !modelo.data || !vista) return;
    const elemento = canvas.current;
    const dados = modelo.data;
    const quadroDoDesenho = requestAnimationFrame(() =>
      desenhar(elemento, {
        modelo: dados,
        marcadores: lista,
        vista,
        ocultas,
        selecionado,
        pendente,
      }),
    );
    return () => cancelAnimationFrame(quadroDoDesenho);
  }, [modelo.data, lista, vista, ocultas, selecionado, pendente]);

  // O tamanho do quadro muda com a janela: redesenha na mesma vista.
  useEffect(() => {
    if (!quadro.current || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() =>
      definirVista((atual) => (atual ? { ...atual } : atual)),
    );
    observador.observe(quadro.current);
    return () => observador.disconnect();
  }, []);

  // O mapa vai até o fim da área da janela: a altura é medida, porque a área que rola não tem
  // altura definida para o 100%. Sem ela, a lista das camadas de uma planta real esticaria o quadro
  // muito além da tela, com o desenho no meio, fora de vista.
  useLayoutEffect(() => {
    const elemento = areaDoMapa.current;
    const janela = elemento?.closest<HTMLElement>('[data-rolagem-da-janela]');
    if (!elemento || !janela) return;
    const medir = () => {
      const respiro = Number.parseFloat(getComputedStyle(janela).paddingBottom) || 0;
      const sobra = janela.getBoundingClientRect().bottom - elemento.getBoundingClientRect().top;
      definirAltura(Math.max(ALTURA_MINIMA_DO_MAPA, Math.floor(sobra - respiro)));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(janela);
    return () => observador.disconnect();
  }, []);

  // A roda dá o zoom em torno do ponteiro; o ouvinte não é passivo, para a página não rolar.
  useEffect(() => {
    const elemento = canvas.current;
    if (!elemento) return;
    const aoRolar = (evento: WheelEvent) => {
      evento.preventDefault();
      const caixa = elemento.getBoundingClientRect();
      const ponto = { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
      definirVista((atual) =>
        atual ? zoomEm(atual, evento.deltaY < 0 ? 1.2 : 1 / 1.2, ponto) : atual,
      );
    };
    elemento.addEventListener('wheel', aoRolar, { passive: false });
    return () => elemento.removeEventListener('wheel', aoRolar);
  }, []);

  const achados = useMemo(() => {
    const procurado = busca.trim().toLowerCase();
    if (procurado.length < 2) return [];
    const deMarcadores = lista
      .filter((marcador) =>
        `${marcador.rotulo} ${marcador.detalhe ?? ''}`.toLowerCase().includes(procurado),
      )
      .map((marcador) => ({
        chave: chaveDo(marcador),
        texto: marcador.rotulo,
        x: marcador.x,
        z: marcador.z,
        marcador,
      }));
    const deTextos = (modelo.data?.rotulos ?? [])
      .filter((rotulo) => rotulo.texto.toLowerCase().includes(procurado))
      .slice(0, 10)
      .map((rotulo, indice) => ({
        chave: `texto:${indice}:${rotulo.texto}`,
        texto: rotulo.texto,
        x: rotulo.x,
        z: rotulo.z,
        marcador: null,
      }));
    return [...deMarcadores, ...deTextos].slice(0, 12);
  }, [busca, lista, modelo.data]);

  async function salvar() {
    if (!alvo || !pendente) return;
    definirSalvando(true);
    const resultado = await pedir(
      () =>
        api.PUT('/mapa/plantas/{id}/posicoes', {
          params: { path: { id } },
          body: { alvo: { tipo: tipoDoAlvo, id: alvo.id }, x: pendente.x, z: pendente.z },
        }),
      'salvar a posição',
    );
    definirSalvando(false);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    // Sem o gênero do alvo, que pode ser o ativo, a sala ou o painel.
    avisar({ situacao: 'sucesso', titulo: `${alvo.rotulo} agora está no mapa.` });
    definirPosicionando(false);
    definirPendente(null);
    definirSelecionado(`${tipoDoAlvo}:${alvo.id}`);
    definirAlvo(null);
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_MARCADORES });
  }

  async function tirar(marcador: MarcadorDoMapa) {
    const resultado = await pedir(
      () =>
        api.DELETE('/mapa/plantas/{id}/posicoes/{tipo}/{alvo}', {
          params: { path: { id, tipo: marcador.alvo.tipo, alvo: marcador.alvo.id } },
        }),
      'tirar do mapa',
    );
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `${marcador.rotulo} saiu do mapa.` });
    definirSelecionado(null);
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_MARCADORES });
  }

  if (modelo.isError) {
    return (
      <div className={estilos.tela}>
        <CabecalhoDaPagina titulo={planta?.nome ?? 'Mapa'} />
        <EstadoVazio titulo={modelo.error.message} />
      </div>
    );
  }

  const camadasDoDesenho = modelo.data?.camadas.map((camada) => camada.nome) ?? [];
  const camadasDosModulos = marcadores.data?.camadas ?? [];
  const todas = [
    ...camadasDosModulos.map((nome) => `modulo:${nome}`),
    ...camadasDoDesenho.map((nome) => `desenho:${nome}`),
  ];
  const visiveis = todas.filter((chave) => !ocultas.has(chave));

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={planta?.nome ?? 'Mapa'}
        acoes={
          <>
            <Botao
              nivel="terciario"
              icone={Plus}
              onPress={() =>
                definirVista((atual) =>
                  atual
                    ? zoomEm(atual, 1.4, { x: area().largura / 2, y: area().altura / 2 })
                    : atual,
                )
              }
            >
              Aproximar
            </Botao>
            <Botao
              nivel="terciario"
              icone={Minus}
              onPress={() =>
                definirVista((atual) =>
                  atual
                    ? zoomEm(atual, 1 / 1.4, { x: area().largura / 2, y: area().altura / 2 })
                    : atual,
                )
              }
            >
              Afastar
            </Botao>
            <Botao
              nivel="terciario"
              icone={Maximize2}
              onPress={() => modelo.data && definirVista(vistaDaPlantaInteira(modelo.data, area()))}
            >
              Ver a planta inteira
            </Botao>
          </>
        }
      />
      <p className={estilos.nota}>
        Paredes e volumes são aproximações do desenho, e não medidas. Arraste para mover e use a
        roda para o zoom.
      </p>
      <div
        ref={areaDoMapa}
        className={estilos.mapa}
        style={altura ? ({ '--altura-do-mapa': `${altura}px` } as CSSProperties) : undefined}
      >
        <div ref={quadro} className={estilos.quadro}>
          {modelo.isPending ? (
            <p role="status" className={estilos.nota}>
              Carregando a planta…
            </p>
          ) : null}
          <canvas
            ref={canvas}
            className={estilos.canvas}
            data-posicionando={posicionando}
            role="img"
            aria-label={`Planta ${planta?.nome ?? ''}, com ${lista.length} ${lista.length === 1 ? 'marcador' : 'marcadores'}`}
            onPointerDown={(evento) => {
              if (!vista) return;
              evento.currentTarget.setPointerCapture(evento.pointerId);
              arraste.current = { x: evento.clientX, y: evento.clientY, vista, moveu: false };
            }}
            onPointerMove={(evento) => {
              const inicio = arraste.current;
              if (!inicio) return;
              const [mx, my] = [evento.clientX - inicio.x, evento.clientY - inicio.y];
              if (!inicio.moveu && Math.hypot(mx, my) < 4) return;
              inicio.moveu = true;
              definirVista({ ...inicio.vista, dx: inicio.vista.dx + mx, dy: inicio.vista.dy + my });
            }}
            onPointerUp={(evento) => {
              const inicio = arraste.current;
              arraste.current = null;
              if (!inicio || inicio.moveu || !vista) return;
              const caixa = evento.currentTarget.getBoundingClientRect();
              const ponto = { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
              if (posicionando) {
                definirPendente(naPlanta(vista, ponto));
                return;
              }
              const visiveisNoMapa = lista.filter((m) => !ocultas.has(`modulo:${m.camada}`));
              const achado = marcadorNoPonto(visiveisNoMapa, vista, ponto);
              definirSelecionado(achado ? chaveDo(achado) : null);
            }}
          />
        </div>
        <div className={estilos.painel}>
          <div className={estilos.bloco}>
            <CampoDeTexto
              rotulo="Procurar no mapa"
              type="search"
              value={busca}
              onChange={definirBusca}
              autoComplete="off"
            />
            {achados.length > 0 && (
              <ul className={estilos.lista} aria-label="Achados no mapa">
                {achados.map((achado) => (
                  <li key={achado.chave}>
                    <Botao
                      nivel="terciario"
                      onPress={() => {
                        definirVista(
                          centrarEm(
                            achado.x,
                            achado.z,
                            Math.max(vista?.escala ?? 0, ESCALA_DOS_TEXTOS * 2),
                            area(),
                          ),
                        );
                        if (achado.marcador) definirSelecionado(chaveDo(achado.marcador));
                      }}
                    >
                      {achado.texto}
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {escolhido && (
            <section className={estilos.bloco} aria-label="Marcador escolhido">
              <p className={estilos.tituloDoBloco}>{escolhido.rotulo}</p>
              {escolhido.detalhe && <p className={estilos.nota}>{escolhido.detalhe}</p>}
              <RotuloDeSituacao situacao={escolhido.situacao.tom}>
                {escolhido.situacao.texto}
              </RotuloDeSituacao>
              <div className={estilos.acoes}>
                {escolhido.acoes.map((acao) => (
                  <Botao key={acao.destino} onPress={() => void navegar({ to: acao.destino })}>
                    {acao.rotulo}
                  </Botao>
                ))}
                {podeEditar && escolhido.alvo.tipo === 'ativo' && (
                  <>
                    <Botao
                      nivel="terciario"
                      onPress={() => {
                        definirAlvo({ id: escolhido.alvo.id, rotulo: escolhido.rotulo });
                        definirPosicionando(true);
                        definirPendente(null);
                      }}
                    >
                      Mover
                    </Botao>
                    <Botao nivel="terciario" onPress={() => void tirar(escolhido)}>
                      Tirar do mapa
                    </Botao>
                  </>
                )}
              </div>
            </section>
          )}

          {podeEditar && (
            <section className={estilos.bloco} aria-label="Posicionar no mapa">
              <p className={estilos.tituloDoBloco}>Posicionar no mapa</p>
              {posicionaveis.length > 1 && (
                <ControleSegmentado
                  rotulo="O que posicionar"
                  value={tipoDoAlvo}
                  onChange={(escolhido) => {
                    definirTipoDoAlvo(escolhido);
                    escolherAlvo(null);
                  }}
                >
                  {posicionaveis.map(({ tipo, camada }) => (
                    <Segmento key={tipo} value={tipo}>
                      {ALVOS_DO_MAPA[tipo]?.rotulo ?? camada}
                    </Segmento>
                  ))}
                </ControleSegmentado>
              )}
              {tipoDoAlvo === 'sala' ? (
                <EscolhaDaSala valor={alvo} aoEscolher={escolherAlvo} />
              ) : tipoDoAlvo === 'painel' ? (
                <EscolhaDoPainel valor={alvo} aoEscolher={escolherAlvo} />
              ) : (
                <SeletorDeConta
                  rotulo="Ativo"
                  valor={alvo}
                  aoMudar={escolherAlvo}
                  buscar={ativos.buscar}
                  descricao={ALVOS_DO_MAPA.ativo?.dica}
                />
              )}
              {posicionando && (
                <p className={estilos.nota}>
                  {pendente
                    ? 'Ponto escolhido. Salve ou clique em outro ponto.'
                    : 'Clique no ponto do mapa.'}
                </p>
              )}
              {posicionando && (
                <div className={estilos.acoes}>
                  <Botao
                    onPress={() => {
                      definirPosicionando(false);
                      definirPendente(null);
                      definirAlvo(null);
                    }}
                  >
                    Cancelar
                  </Botao>
                  <Botao
                    nivel="primario"
                    isDisabled={!pendente}
                    carregando={salvando}
                    rotuloCarregando="Salvando"
                    onPress={() => void salvar()}
                  >
                    Salvar posição
                  </Botao>
                </div>
              )}
            </section>
          )}

          <div className={estilos.bloco}>
            <GrupoDeCheckboxes
              rotulo="Camadas"
              value={visiveis}
              onChange={(escolhidas) =>
                definirOcultas(new Set(todas.filter((chave) => !escolhidas.includes(chave))))
              }
            >
              {camadasDosModulos.map((nome) => (
                <Checkbox key={`modulo:${nome}`} value={`modulo:${nome}`}>
                  {nome}
                </Checkbox>
              ))}
              {camadasDoDesenho.map((nome) => (
                <Checkbox key={`desenho:${nome}`} value={`desenho:${nome}`}>
                  {`Desenho: ${nome}`}
                </Checkbox>
              ))}
            </GrupoDeCheckboxes>
          </div>

          <div className={estilos.bloco}>
            <p className={estilos.tituloDoBloco}>{`Marcadores (${lista.length})`}</p>
            {lista.length === 0 ? (
              <p className={estilos.nota}>
                {podeEditar
                  ? 'Nada no mapa ainda. Posicione um ativo acima.'
                  : 'Nada no mapa ainda.'}
              </p>
            ) : (
              <ul className={estilos.lista} aria-label="Marcadores">
                {lista.map((marcador) => (
                  <li key={chaveDo(marcador)}>
                    <Botao
                      nivel="terciario"
                      onPress={() => {
                        definirSelecionado(chaveDo(marcador));
                        definirVista(
                          centrarEm(
                            marcador.x,
                            marcador.z,
                            Math.max(vista?.escala ?? 0, 8),
                            area(),
                          ),
                        );
                      }}
                    >
                      {`${marcador.rotulo} · ${marcador.situacao.texto}`}
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
