import { useState } from 'react';
import { MensagemDoPasso } from '../../entrada/MensagemDoPasso.tsx';
import { Botao } from '../botao/Botao.tsx';
import { Dialogo } from '../modal/Dialogo.tsx';
import estilos from './RemocaoConfirmada.module.css';

export type ResultadoDaRemocao = { ok: true } | { erro: string };

export interface PropsDaRemocaoConfirmada {
  /** O texto do botão que abre a confirmação, como "Remover imagem" ou "Remover". */
  rotulo: string;
  /** O título da confirmação, como "Remover arquivo?". Sem ele, o rótulo com a interrogação. */
  titulo?: string;
  /** O botão que remove, na confirmação. Sem ele, o rótulo. */
  rotuloDeConfirmar?: string;
  /** O que acontece ao remover. */
  explicacao: string;
  desabilitada: boolean;
  aoRemover: () => Promise<ResultadoDaRemocao>;
}

/**
 * A remoção que só vale depois de confirmada, como a da imagem de um registro ou a do arquivo de um
 * campo; a recusa da API fica na confirmação.
 */
export function RemocaoConfirmada({
  rotulo,
  titulo = `${rotulo}?`,
  rotuloDeConfirmar = rotulo,
  explicacao,
  desabilitada,
  aoRemover,
}: PropsDaRemocaoConfirmada) {
  const [aberta, definirAberta] = useState(false);
  const [removendo, definirRemovendo] = useState(false);
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);
  return (
    <Dialogo
      alerta
      titulo={titulo}
      gatilho={
        <Botao nivel="destrutivo" isDisabled={desabilitada}>
          {rotulo}
        </Botao>
      }
      aberto={aberta}
      aoMudarAberto={(abrir) => {
        definirAberta(abrir);
        definirFalha(null);
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="destrutivo"
            carregando={removendo}
            rotuloCarregando="Removendo"
            onPress={async () => {
              definirRemovendo(true);
              definirFalha(null);
              try {
                const resultado = await aoRemover();
                if ('ok' in resultado) {
                  fechar();
                  return;
                }
                definirFalha((anterior) => ({
                  texto: resultado.erro,
                  vez: (anterior?.vez ?? 0) + 1,
                }));
              } finally {
                definirRemovendo(false);
              }
            }}
          >
            {rotuloDeConfirmar}
          </Botao>
        </>
      )}
    >
      <p className={estilos.explicacao}>{explicacao}</p>
      <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
    </Dialogo>
  );
}
