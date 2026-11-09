import { Botao, Dialogo, MensagemDoPasso, type NivelDoBotao } from '@grafite/ui';
import { type ReactNode, useState } from 'react';

export interface PropsDaConfirmacao {
  /** O nome da ação, no botão que abre a confirmação, como "Inativar a conta". */
  acao: string;
  /**
   * O nome do botão para o leitor de tela, quando a ação se repete na tela, como "Encerrar" em
   * cada perfil: "Encerrar a atribuição de Técnico em Jundiaí". Começa pelo nome da ação.
   */
  nomeDoGatilho?: string;
  titulo: string;
  /** O que acontece ao confirmar, em texto. */
  children: ReactNode;
  /** O botão que confirma; sem ele, o nome da ação. */
  confirmar?: string;
  /** O que o botão que confirma anuncia enquanto a API responde, como "Inativando". */
  confirmando: string;
  fazer: () => Promise<{ ok: true } | { erro: string }>;
  /** O nível do botão que abre a confirmação; o da linha de uma tabela é o secundário. */
  nivelDoGatilho?: NivelDoBotao;
  /**
   * A ação que só acrescenta, como incluir num grupo, confirma pelo botão primário, num diálogo
   * comum; a destrutiva, num alerta, pelo botão destrutivo.
   */
  destrutiva?: boolean;
}

/**
 * Uma ação destrutiva da Administração (spec modulo-administracao; ANTISLOP §22 e §38): o botão
 * abre a confirmação, que diz o que acontece, e a ação só vale depois de confirmada. A recusa da
 * API aparece na confirmação, e nada muda.
 */
export function Confirmacao({
  acao,
  nomeDoGatilho,
  titulo,
  children,
  confirmar = acao,
  confirmando,
  fazer,
  nivelDoGatilho = 'destrutivo',
  destrutiva = true,
}: PropsDaConfirmacao) {
  const [aberto, definirAberto] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  return (
    <Dialogo
      alerta={destrutiva}
      titulo={titulo}
      gatilho={
        <Botao nivel={nivelDoGatilho} aria-label={nomeDoGatilho}>
          {acao}
        </Botao>
      }
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel={destrutiva ? 'destrutivo' : 'primario'}
            carregando={enviando}
            rotuloCarregando={confirmando}
            onPress={async () => {
              definirEnviando(true);
              definirFalha(null);
              try {
                const resultado = await fazer();
                if ('ok' in resultado) return fechar();
                definirFalha(resultado.erro);
                definirTentativa((atual) => atual + 1);
              } finally {
                definirEnviando(false);
              }
            }}
          >
            {confirmar}
          </Botao>
        </>
      )}
    >
      {children}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}
