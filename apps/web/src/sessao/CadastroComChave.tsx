// O cadastro dos dois passos com a chave nova da API (spec verificacao-em-dois-passos), na entrada
// e na seção Conta dos Ajustes. A chave é pedida quando o cadastro aparece, uma vez por tentativa.
import { Botao, CadastroDosDoisPassos, MensagemDoPasso, type PropsDoCadastro } from '@grafite/ui';
import { useEffect, useRef, useState } from 'react';
import type { LojaDaSessao } from './loja.ts';

type Cadastro = Awaited<ReturnType<LojaDaSessao['comecarCadastro']>>;

export interface PropsDoCadastroComChave
  extends Pick<
    PropsDoCadastro,
    'aoConfirmar' | 'aoSair' | 'rotuloDeSair' | 'nivelDoTitulo' | 'aviso'
  > {
  loja: LojaDaSessao;
}

export function CadastroComChave({
  loja,
  aoConfirmar,
  aoSair,
  rotuloDeSair = 'Sair',
  nivelDoTitulo,
  aviso,
}: PropsDoCadastroComChave) {
  const [cadastro, definirCadastro] = useState<Cadastro | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  // Um pedido por tentativa, também com os efeitos repetidos do StrictMode: cada pedido gera
  // uma chave, e a tela precisa mostrar a última.
  const pedido = useRef<{ tentativa: number; resposta: Promise<Cadastro> } | null>(null);
  useEffect(() => {
    if (pedido.current?.tentativa !== tentativa) {
      pedido.current = { tentativa, resposta: loja.comecarCadastro() };
    }
    let vale = true;
    void pedido.current.resposta.then((resposta) => {
      if (vale) definirCadastro(resposta);
    });
    return () => {
      vale = false;
    };
  }, [loja, tentativa]);

  if (cadastro === null) return <p role="status">Preparando o cadastro…</p>;
  if ('erro' in cadastro) {
    return (
      <>
        <MensagemDoPasso texto={cadastro.erro} chave={tentativa} />
        <Botao
          nivel="primario"
          onPress={() => {
            definirCadastro(null);
            definirTentativa((atual) => atual + 1);
          }}
        >
          Tentar de novo
        </Botao>
        <Botao nivel="terciario" onPress={aoSair}>
          {rotuloDeSair}
        </Botao>
      </>
    );
  }
  return (
    <CadastroDosDoisPassos
      chave={cadastro.chave}
      uri={cadastro.uri}
      aoConfirmar={aoConfirmar}
      aoSair={aoSair}
      rotuloDeSair={rotuloDeSair}
      nivelDoTitulo={nivelDoTitulo}
      aviso={aviso}
    />
  );
}
