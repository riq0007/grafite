import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import estilos from './Aba.module.css';
import { AbaFechada } from './AbaFechada.tsx';
import { medidasDaAbaFechada, useAparencia } from './aparencia.ts';
import { useAvisoDoNativo, useDoNativo } from './doNativo.ts';
import { avisoDaResposta, avisoDaVolta, useEstado } from './estado.ts';
import { useFormaInformada } from './forma.ts';
import { Linha } from './Linha.tsx';
import { type FormaMedida, useChegadasDasFontes } from './movimento.ts';
import {
  abrirChamado,
  abrirTelaMaior,
  devolverOFoco,
  EVENTO_DE_FECHAR_O_PAINEL,
  EVENTO_DO_ATALHO,
  lerTelaMaior,
  ouvir,
  ouvirTelaMaior,
  sair,
  type TelaMaior,
} from './nativo.ts';
import { type Origem, Painel } from './Painel.tsx';

const ouvirOAtalho = (aoChegar: () => void) => ouvir(EVENTO_DO_ATALHO, aoChegar);
const ouvirOFechar = (aoChegar: () => void) => ouvir(EVENTO_DE_FECHAR_O_PAINEL, aoChegar);
const semFalha = () => undefined;

/** A linha da apresentação, de onde a aba volta: 96×4, presa à borda. */
const FORMA_DA_LINHA: FormaMedida = { largura: 96, altura: 4, raio: '0px 0px 4px 4px', topo: 0 };
/** Depois da apresentação, o aviso diz a hora da chegada por 1 minuto. */
const DURACAO_DA_VOLTA = 60_000;

/** A forma da aba fechada, sem a escala do mouse em cima, de onde o painel cresce. */
function origemDe(aba: HTMLElement): Origem {
  return {
    largura: aba.offsetWidth,
    altura: aba.offsetHeight,
    raio: getComputedStyle(aba).borderRadius,
  };
}

// A aba dos colaboradores (spec aba-dos-colaboradores), na janela transparente do lado nativo, que
// fica no alto e no meio da tela principal: a aba fechada, com o aviso da resposta, e o painel, que
// cresce dela e volta a ela, e fica atrás, recuado, com a tela maior aberta embaixo.
export function Aba() {
  const aparencia = useAparencia();
  const estado = useEstado();
  const telaMaior = useDoNativo<TelaMaior | null>(lerTelaMaior, ouvirTelaMaior, null);
  const semConexao = estado.semConexao !== null;
  const apresentando = aparencia?.apresentacao ?? false;
  const [volta, setVolta] = useState(false);
  const avisoDeSempre = avisoDaResposta(estado.porVer);
  // Sem conexão, o aviso sai: os números são de antes.
  const aviso = semConexao ? null : volta ? avisoDaVolta(estado.porVer) : avisoDeSempre;
  const [aberta, setAberta] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [teclado, setTeclado] = useState(false);
  const [pedidoDeFoco, setPedidoDeFoco] = useState(0);
  const [focarAAba, setFocarAAba] = useState(false);
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [deLargura, setDeLargura] = useState<number | null>(null);
  // A chegada que a pessoa já viu, ao abrir o painel: o ponto não pulsa de novo por ela.
  const [chegadaVista, setChegadaVista] = useState<string | null>(null);
  const chegada = useRef<string | null>(null);
  chegada.current = avisoDeSempre?.chegada ?? null;
  // A aba fechada medida a cada render, para a linha da apresentação encolher dela. A fonte que
  // chega também renderiza, para a medida ser com ela.
  const ultimaForma = useRef<FormaMedida | null>(null);
  useChegadasDasFontes();
  const [saiuDaLinha, setSaiuDaLinha] = useState(false);
  const forma = useRef<HTMLElement>(null);
  const aba = useRef<HTMLButtonElement>(null);
  const medidas = aparencia ? medidasDaAbaFechada(aparencia) : null;
  const naLinha = apresentando && !aberta;
  // A apresentação, derivada no render, para a aba que volta da linha já montar com o aviso certo:
  // com respostas que chegaram durante ela, a hora da chegada por 1 minuto.
  const chegadaAtual = avisoDeSempre?.chegada ?? null;
  const [apresentandoAntes, setApresentandoAntes] = useState(apresentando);
  const [chegadaNoInicio, setChegadaNoInicio] = useState<string | null>(null);
  if (apresentando !== apresentandoAntes) {
    setApresentandoAntes(apresentando);
    if (apresentando) {
      setChegadaNoInicio(chegadaAtual);
      setVolta(false);
    } else if (chegadaAtual && chegadaAtual !== chegadaNoInicio) setVolta(true);
  }
  const [naLinhaAntes, setNaLinhaAntes] = useState(naLinha);
  if (naLinha !== naLinhaAntes) {
    setNaLinhaAntes(naLinha);
    setSaiuDaLinha(!naLinha && !aberta);
  }
  useFormaInformada(
    forma,
    `${aberta} ${naLinha} ${aparencia?.forma} ${medidas?.compacta} ${medidas?.topo}`,
    !naLinha,
  );

  const abrir = useCallback((peloTeclado: boolean) => {
    if (aba.current) setOrigem(origemDe(aba.current));
    setSaiuDaLinha(false);
    setAberta(true);
    setFechando(false);
    setTeclado(peloTeclado);
    setPedidoDeFoco((pedido) => pedido + 1);
    setChegadaVista(chegada.current);
  }, []);
  const abrirPeloAtalho = useCallback(() => abrir(true), [abrir]);
  const fecharFora = useCallback(() => setFechando(true), []);
  useAvisoDoNativo(ouvirOAtalho, abrirPeloAtalho);
  useAvisoDoNativo(ouvirOFechar, fecharFora);

  useLayoutEffect(() => {
    if (aba.current)
      ultimaForma.current = { ...origemDe(aba.current), topo: aba.current.offsetTop };
  });

  useEffect(() => {
    if (!volta) return;
    const espera = setTimeout(() => setVolta(false), DURACAO_DA_VOLTA);
    return () => clearTimeout(espera);
  }, [volta]);

  useEffect(() => {
    if (!aberta && focarAAba) {
      aba.current?.focus();
      setFocarAAba(false);
    }
  }, [aberta, focarAAba]);

  if (!aparencia || !medidas) return <div data-aba="" />;
  const guardarForma = (elemento: HTMLElement | null) => {
    forma.current = elemento;
  };
  const guardarAba = (elemento: HTMLButtonElement | null) => {
    aba.current = elemento;
    guardarForma(elemento);
  };
  return (
    <div
      data-aba=""
      className={estilos.raiz}
      style={{ '--topo': `${naLinha ? 0 : medidas.topo}px` } as CSSProperties}
    >
      {aberta ? (
        <Painel
          ref={guardarForma}
          forma={aparencia.forma}
          compacta={medidas.compacta}
          estado={estado}
          origem={origem}
          telaMaior={telaMaior}
          contato={aparencia.contato}
          fechando={fechando}
          teclado={teclado}
          pedidoDeFoco={pedidoDeFoco}
          aoEscolher={(opcao) => abrirTelaMaior(opcao).catch(semFalha)}
          aoEscolherResposta={(numero) => abrirChamado(numero).catch(semFalha)}
          aoFecharPeloEsc={() => {
            setFechando(true);
            setFocarAAba(true);
            devolverOFoco().catch(semFalha);
          }}
          aoTerminarDeFechar={() => {
            setAberta(false);
            setFechando(false);
            setDeLargura(origem?.largura ?? null);
          }}
          aoSair={() => sair().catch(semFalha)}
          aoUsar={setTeclado}
        />
      ) : naLinha ? (
        <Linha ref={guardarForma} de={ultimaForma.current} semConexao={semConexao} />
      ) : (
        <AbaFechada
          ref={guardarAba}
          forma={aparencia.forma}
          compacta={medidas.compacta}
          aviso={aviso}
          pulsar={aviso !== null && aviso.chegada !== chegadaVista}
          deLargura={deLargura}
          deLinha={saiuDaLinha ? FORMA_DA_LINHA : null}
          semConexao={semConexao}
          aoAbrir={() => abrir(false)}
        />
      )}
    </div>
  );
}
