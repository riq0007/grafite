import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import estilos from './Aba.module.css';
import { AbaFechada } from './AbaFechada.tsx';
import { medidasDaAbaFechada, useAparencia } from './aparencia.ts';
import { useAvisoDoNativo } from './doNativo.ts';
import { useEstado } from './estado.ts';
import { useFormaInformada } from './forma.ts';
import {
  abrirTelaMaior,
  devolverOFoco,
  EVENTO_DE_FECHAR_O_PAINEL,
  EVENTO_DO_ATALHO,
  ouvir,
  sair,
} from './nativo.ts';
import { Painel } from './Painel.tsx';

const ouvirOAtalho = (aoChegar: () => void) => ouvir(EVENTO_DO_ATALHO, aoChegar);
const ouvirOFechar = (aoChegar: () => void) => ouvir(EVENTO_DE_FECHAR_O_PAINEL, aoChegar);
const semFalha = () => undefined;

// A aba dos colaboradores (spec aba-dos-colaboradores), na janela transparente do lado nativo, que
// fica no alto e no meio da tela principal: a aba fechada e o painel. O aviso e a tela maior entram
// nas tarefas da tela seguintes.
export function Aba() {
  const aparencia = useAparencia();
  const estado = useEstado();
  const [aberta, setAberta] = useState(false);
  const [teclado, setTeclado] = useState(false);
  const [pedidoDeFoco, setPedidoDeFoco] = useState(0);
  const [focarAAba, setFocarAAba] = useState(false);
  const forma = useRef<HTMLElement>(null);
  const aba = useRef<HTMLButtonElement>(null);
  const medidas = aparencia ? medidasDaAbaFechada(aparencia) : null;
  useFormaInformada(forma, `${aberta} ${aparencia?.forma} ${medidas?.compacta} ${medidas?.topo}`);

  const abrir = useCallback((peloTeclado: boolean) => {
    setAberta(true);
    setTeclado(peloTeclado);
    setPedidoDeFoco((pedido) => pedido + 1);
  }, []);
  const abrirPeloAtalho = useCallback(() => abrir(true), [abrir]);
  const fecharFora = useCallback(() => setAberta(false), []);
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
          teclado={teclado}
          pedidoDeFoco={pedidoDeFoco}
          aoEscolher={(opcao) => abrirTelaMaior(opcao).catch(semFalha)}
          aoFecharPeloEsc={() => {
            setAberta(false);
            setFocarAAba(true);
            devolverOFoco().catch(semFalha);
          }}
          aoSair={() => sair().catch(semFalha)}
          aoUsar={setTeclado}
        />
      ) : (
        <AbaFechada
          ref={guardarAba}
          forma={aparencia.forma}
          compacta={medidas.compacta}
          aoAbrir={() => abrir(false)}
        />
      )}
    </div>
  );
}
