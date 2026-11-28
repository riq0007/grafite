import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import estilos from './Aba.module.css';
import { AbaFechada } from './AbaFechada.tsx';
import { medidasDaAbaFechada, useAparencia } from './aparencia.ts';
import { useAvisoDoNativo } from './doNativo.ts';
import { avisoDaResposta, useEstado } from './estado.ts';
import { useFormaInformada } from './forma.ts';
import {
  abrirChamado,
  abrirTelaMaior,
  devolverOFoco,
  EVENTO_DE_FECHAR_O_PAINEL,
  EVENTO_DO_ATALHO,
  ouvir,
  sair,
} from './nativo.ts';
import { type Origem, Painel } from './Painel.tsx';

const ouvirOAtalho = (aoChegar: () => void) => ouvir(EVENTO_DO_ATALHO, aoChegar);
const ouvirOFechar = (aoChegar: () => void) => ouvir(EVENTO_DE_FECHAR_O_PAINEL, aoChegar);
const semFalha = () => undefined;

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
// cresce dela e volta a ela. A tela maior entra na tarefa seguinte.
export function Aba() {
  const aparencia = useAparencia();
  const estado = useEstado();
  const aviso = avisoDaResposta(estado.porVer);
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
  chegada.current = aviso?.chegada ?? null;
  const forma = useRef<HTMLElement>(null);
  const aba = useRef<HTMLButtonElement>(null);
  const medidas = aparencia ? medidasDaAbaFechada(aparencia) : null;
  useFormaInformada(forma, `${aberta} ${aparencia?.forma} ${medidas?.compacta} ${medidas?.topo}`);

  const abrir = useCallback((peloTeclado: boolean) => {
    if (aba.current) setOrigem(origemDe(aba.current));
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
      style={{ '--topo': `${medidas.topo}px` } as CSSProperties}
    >
      {aberta ? (
        <Painel
          ref={guardarForma}
          forma={aparencia.forma}
          compacta={medidas.compacta}
          estado={estado}
          origem={origem}
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
      ) : (
        <AbaFechada
          ref={guardarAba}
          forma={aparencia.forma}
          compacta={medidas.compacta}
          aviso={aviso}
          pulsar={aviso !== null && aviso.chegada !== chegadaVista}
          deLargura={deLargura}
          aoAbrir={() => abrir(false)}
        />
      )}
    </div>
  );
}
