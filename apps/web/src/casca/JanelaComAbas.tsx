import { type AbaNaJanela, AbasDaJanela, Botao, Dialogo } from '@grafite/ui';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { ABA_DA_TELA, type AbaDeCadastro } from './abasDaJanela.ts';
import { type AbasDoApp, ContextoDaAba } from './abasDoApp.tsx';
import estilos from './JanelaComAbas.module.css';

export interface PropsDaJanelaComAbas {
  abas: AbasDoApp;
  /** O conteúdo da primeira aba: a tela do roteador. */
  tela: ReactNode;
  /**
   * A chave da tela, como o caminho do endereço: quando ela muda, a primeira aba volta ao começo
   * da rolagem, porque é outra tela.
   */
  chaveDaTela: string;
  /** O nome da primeira aba enquanto a tela não tem título, como o nome do módulo. */
  nomeReserva: string;
}

/**
 * A janela de conteúdo com as abas de cadastro (change cadastro-em-abas): a primeira aba é a tela
 * do roteador, com o nome dela, e as outras, os cadastros que os campos pediram. Fechar uma aba
 * preenchida pergunta antes.
 */
export function JanelaComAbas({ abas, tela, chaveDaTela, nomeReserva }: PropsDaJanelaComAbas) {
  const { estado } = abas;
  const comCadastros = estado.abas.length > 1;
  const nomeDaTela = useNomeDaTela(comCadastros, nomeReserva);
  useMedirDeNovoComABarra(comCadastros);
  const aConfirmar = estado.abas.find(
    (aba): aba is AbaDeCadastro => aba.tipo === 'cadastro' && aba.id === abas.aConfirmar,
  );

  const naJanela = estado.abas.map(
    (aba): AbaNaJanela =>
      aba.tipo === 'tela'
        ? {
            id: aba.id,
            titulo: nomeDaTela,
            chave: chaveDaTela,
            conteudo: <ContextoDaAba.Provider value={aba.id}>{tela}</ContextoDaAba.Provider>,
          }
        : {
            id: aba.id,
            titulo: aba.titulo,
            fechavel: true,
            conteudo: <CadastroNaAba abas={abas} aba={aba} />,
          },
  );

  return (
    <>
      <AbasDaJanela
        abas={naJanela}
        frente={estado.frente}
        aoEscolher={abas.escolher}
        aoFechar={abas.fechar}
      />
      <Dialogo
        alerta
        titulo="Fechar sem salvar?"
        aberto={aConfirmar !== undefined}
        aoMudarAberto={(aberto) => {
          if (!aberto) abas.desistirDeFechar();
        }}
        acoes={() => (
          <>
            <Botao onPress={abas.desistirDeFechar}>Continuar editando</Botao>
            <Botao nivel="destrutivo" onPress={abas.confirmarFechar}>
              Fechar
            </Botao>
          </>
        )}
      >
        <p className={estilos.aviso}>
          O que foi preenchido em {aConfirmar?.titulo} sai, e nada é cadastrado.
        </p>
      </Dialogo>
    </>
  );
}

/** O corpo do cadastro de uma aba, com a aba como origem dos pedidos dos campos dele. */
function CadastroNaAba({ abas, aba }: { abas: AbasDoApp; aba: AbaDeCadastro }) {
  const Corpo = abas.componenteDe(aba.id);
  if (!Corpo) return null;
  return (
    <ContextoDaAba.Provider value={aba.id}>
      <Corpo
        {...(aba.inicial ? { inicial: aba.inicial } : {})}
        aoConcluir={(registro) => abas.concluir(aba.id, registro)}
        aoCancelar={() => abas.fechar(aba.id)}
        aoMudarPreenchido={(preenchido) => abas.marcarPreenchida(aba.id, preenchido)}
      />
    </ContextoDaAba.Provider>
  );
}

/**
 * O nome da primeira aba: o título do conteúdo da tela, lido enquanto a barra aparece, também
 * quando a tela muda por baixo de uma aba de cadastro.
 */
function useNomeDaTela(comBarra: boolean, reserva: string) {
  const [nome, definirNome] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!comBarra) return;
    const painel = document.querySelector<HTMLElement>(`[data-aba-da-janela="${ABA_DA_TELA}"]`);
    if (!painel) return;
    const ler = () =>
      definirNome(painel.querySelector('[data-titulo-da-janela]')?.textContent?.trim() || null);
    ler();
    const observador = new MutationObserver(ler);
    observador.observe(painel, { subtree: true, childList: true, characterData: true });
    return () => observador.disconnect();
  }, [comBarra]);
  return nome ?? reserva;
}

/**
 * A barra muda a altura acima da tela ao aparecer e ao sumir: as telas que medem a altura até o fim
 * da janela, como a tabela dos ativos, medem de novo pelo aviso de que a janela mudou.
 */
function useMedirDeNovoComABarra(comBarra: boolean) {
  const anterior = useRef(comBarra);
  useLayoutEffect(() => {
    if (anterior.current === comBarra) return;
    anterior.current = comBarra;
    window.dispatchEvent(new Event('resize'));
  }, [comBarra]);
}
