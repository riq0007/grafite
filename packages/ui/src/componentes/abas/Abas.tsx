import { type ReactNode, useContext } from 'react';
import { Tab, TabList, TabListStateContext, TabPanel, Tabs } from 'react-aria-components';
import estilos from './Abas.module.css';

export interface AbaDaLista {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
  desabilitada?: boolean;
}

export interface PropsDasAbas {
  /** Nome do conjunto de abas para o leitor de tela. */
  rotulo: string;
  abas: AbaDaLista[];
  /** Aba escolhida, quando controlada por fora. */
  selecionada?: string;
  /** Aba escolhida ao abrir, quando não controlada. */
  padrao?: string;
  aoMudar?: (id: string) => void;
  /**
   * As abas que continuam montadas, escondidas, quando outra é escolhida, como a Dados de uma ficha
   * com o formulário: o que foi digitado fica.
   */
  manterMontadas?: readonly string[];
  className?: string;
}

/** Seções de uma mesma tela. As setas trocam a aba; o painel acompanha. */
export function Abas({
  rotulo,
  abas,
  selecionada,
  padrao,
  aoMudar,
  manterMontadas = [],
  className,
}: PropsDasAbas) {
  return (
    <Tabs
      selectedKey={selecionada}
      defaultSelectedKey={padrao}
      onSelectionChange={aoMudar ? (id) => aoMudar(String(id)) : undefined}
      disabledKeys={abas.filter((aba) => aba.desabilitada).map((aba) => aba.id)}
      className={[estilos.abas, className].filter(Boolean).join(' ')}
    >
      <div className={estilos.faixa}>
        <TabList aria-label={rotulo} items={abas} className={estilos.lista}>
          {(aba) => (
            <Tab id={aba.id} className={estilos.aba}>
              {aba.rotulo}
            </Tab>
          )}
        </TabList>
      </div>
      {abas.map((aba) => (
        <Painel key={aba.id} aba={aba} manter={manterMontadas.includes(aba.id)} />
      ))}
    </Tabs>
  );
}

/**
 * O painel de uma aba. O mantido montado, enquanto outra aba está escolhida, fica inerte e
 * escondido pelo `hidden`, que o tira da tela e do leitor de tela mesmo sem o CSS.
 */
function Painel({ aba, manter }: { aba: AbaDaLista; manter: boolean }) {
  const estado = useContext(TabListStateContext);
  const escondido = manter && estado?.selectedKey !== aba.id;
  return (
    <TabPanel
      id={aba.id}
      shouldForceMount={manter}
      hidden={escondido || undefined}
      className={estilos.painel}
    >
      {aba.conteudo}
    </TabPanel>
  );
}
