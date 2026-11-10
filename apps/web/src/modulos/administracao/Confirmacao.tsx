import { Botao, CampoDeTexto, Dialogo, MensagemDoPasso, type NivelDoBotao } from '@grafite/ui';
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
  /**
   * O texto que precisa ser digitado para liberar o botão que confirma, como o nome da planta que
   * vai ser excluída. É para a ação que apaga muito de uma vez e não se desfaz. Os espaços das
   * pontas não contam.
   */
  conferir?: string;
  /**
   * Aberta por fora, como por um item de menu: a confirmação não desenha o botão que a abre, e
   * `aoFechar` avisa quando ela fecha, por qualquer caminho.
   */
  aberta?: boolean;
  aoFechar?: () => void;
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
  conferir,
  aberta,
  aoFechar,
}: PropsDaConfirmacao) {
  const [abertaPorDentro, definirAberta] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [digitado, definirDigitado] = useState('');
  const abertaPorFora = aberta !== undefined;
  const confere = conferir === undefined || digitado.trim() === conferir.trim();
  return (
    <Dialogo
      alerta={destrutiva}
      titulo={titulo}
      gatilho={
        abertaPorFora ? undefined : (
          <Botao nivel={nivelDoGatilho} aria-label={nomeDoGatilho}>
            {acao}
          </Botao>
        )
      }
      aberto={abertaPorFora ? aberta : abertaPorDentro}
      aoMudarAberto={(abrir) => {
        definirAberta(abrir);
        definirFalha(null);
        // Reaberta, a confirmação pede o texto de novo.
        definirDigitado('');
        if (!abrir) aoFechar?.();
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel={destrutiva ? 'destrutivo' : 'primario'}
            isDisabled={!confere}
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
      {conferir !== undefined && (
        <>
          <p>
            Digite <strong>{conferir}</strong> para confirmar.
          </p>
          <CampoDeTexto
            rotulo="Texto da confirmação"
            autoComplete="off"
            value={digitado}
            onChange={definirDigitado}
          />
        </>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Dialogo>
  );
}
