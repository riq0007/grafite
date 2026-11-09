// Fonte única das preferências de interface na casca e nos Ajustes (design do F2c, decisão 4): por
// trás do mesmo `usePreferencias()`, as camadas do servidor, a da organização e a da conta, as
// mudanças gravadas na conta e a cópia no navegador.
import { ProvedorDaRegiao, ProvedorDaTabela } from '@grafite/ui';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useChegada } from '../chegada/avisos.tsx';
import type { CanalDeEventos } from '../eventos/canal.ts';
import type { LojaDaSessao } from '../sessao/loja.ts';
import {
  ATRIBUTOS_PERMITIDOS,
  atributosDaInterface,
  type PreferenciasDaInterface,
  type SecaoDePreferencias,
  VARIAVEL_DE_COR,
} from './preferencias.ts';
import { criarSincronia } from './sincronia.ts';

export interface ControleDasPreferencias {
  preferencias: PreferenciasDaInterface;
  /**
   * Muda campos de uma seção; vale na hora e é gravado na conta. Valores fora do intervalo são
   * presos, e os desconhecidos, como um fuso que o navegador não reconhece, saem da conta, e vale o
   * padrão da organização.
   */
  mudar: <S extends SecaoDePreferencias>(
    secao: S,
    mudanca: Partial<PreferenciasDaInterface[S]>,
  ) => void;
  /** Volta uma seção inteira aos padrões da organização, sem mexer nas outras. */
  restaurar: (secao: SecaoDePreferencias) => void;
}

const Contexto = createContext<ControleDasPreferencias | null>(null);

/** Aplica as preferências no <html>, como o anti-flash faz antes do app. */
function aplicar(preferencias: PreferenciasDaInterface): void {
  const raiz = document.documentElement;
  const atributos = atributosDaInterface(preferencias);
  for (const nome of ATRIBUTOS_PERMITIDOS) {
    const valor = atributos[nome];
    if (nome.startsWith('--')) {
      if (valor) raiz.style.setProperty(nome, valor);
      else raiz.style.removeProperty(nome);
    } else if (valor) {
      raiz.setAttribute(nome, valor);
    } else {
      raiz.removeAttribute(nome);
    }
  }
  // As variáveis do tema e do destaque personalizados: as que saíram do mapa saem do <html>.
  for (const nome of Array.from(raiz.style)) {
    if (VARIAVEL_DE_COR.test(nome) && !(nome in atributos)) raiz.style.removeProperty(nome);
  }
  for (const [nome, valor] of Object.entries(atributos)) {
    if (VARIAVEL_DE_COR.test(nome)) raiz.style.setProperty(nome, valor);
  }
}

export interface PropsDoProvedorDePreferencias {
  /** A sessão, que traz as camadas e grava a da conta; sem ela, as mudanças valem só aqui. */
  loja?: LojaDaSessao;
  /** Os eventos, que avisam das mudanças feitas em outro dispositivo ou nos padrões. */
  canal?: CanalDeEventos;
  children: ReactNode;
}

export function ProvedorDePreferencias({ loja, canal, children }: PropsDoProvedorDePreferencias) {
  const [sincronia] = useState(() => criarSincronia({ loja, canal }));
  useEffect(() => sincronia.ligar(), [sincronia]);
  const preferencias = useSyncExternalStore(sincronia.assinar, sincronia.ler);
  // Antes da pintura, para nenhum quadro sair com a preferência anterior.
  useLayoutEffect(() => aplicar(preferencias), [preferencias]);
  // Depois da primeira aplicação, a chegada passa da etapa das preferências.
  const { preferenciasAplicadas } = useChegada();
  useLayoutEffect(() => preferenciasAplicadas(), [preferenciasAplicadas]);
  const controle = useMemo<ControleDasPreferencias>(
    () => ({ preferencias, mudar: sincronia.mudar, restaurar: sincronia.restaurar }),
    [preferencias, sincronia],
  );
  const { fuso } = preferencias.regiao;
  return (
    <Contexto.Provider value={controle}>
      {/* As datas e horas seguem o fuso escolhido, e as tabelas, as linhas e as miniaturas. */}
      <ProvedorDaRegiao fuso={fuso === 'sistema' ? undefined : fuso}>
        <ProvedorDaTabela {...preferencias.tabelas}>{children}</ProvedorDaTabela>
      </ProvedorDaRegiao>
    </Contexto.Provider>
  );
}

export function usePreferencias(): ControleDasPreferencias {
  const controle = useContext(Contexto);
  if (!controle) throw new Error('usePreferencias precisa do ProvedorDePreferencias acima dele.');
  return controle;
}
