import { X } from 'lucide-react';
import {
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastRegion as ToastRegion,
} from 'react-aria-components';
import { BotaoDeIcone, Icone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { ICONES_DAS_SITUACOES, NOMES_DAS_SITUACOES } from '../situacao/RotuloDeSituacao.tsx';
import estilos from './Aviso.module.css';
import { type FilaDeAvisos, filaDeAvisos } from './avisos.ts';

export interface PropsDaRegiaoDeAvisos {
  fila?: FilaDeAvisos;
}

/**
 * Canto superior direito, no máximo três avisos, acima das camadas modais. Com o ponteiro ou o foco
 * na região, a contagem dos temporários pausa. O crítico e o persistente só saem quando alguém age
 * ou fecha; a ação com nome próprio, reconhecer, adiar e abrir só aparecem quando quem avisou as
 * oferece, e "Fechar" fica sempre à vista.
 */
export function RegiaoDeAvisos({ fila = filaDeAvisos }: PropsDaRegiaoDeAvisos) {
  return (
    <ToastRegion queue={fila.doReactAria} aria-label="Avisos" className={estilos.regiao}>
      {({ toast }) => {
        const { situacao, titulo, descricao, acao, aoAbrir, aoReconhecer, aoAdiar, rotuloDoAdiar } =
          toast.content;
        const fechar = () => fila.doReactAria.close(toast.key);
        const critico = situacao === 'critico';
        const temAcoes =
          acao !== undefined || aoAbrir !== undefined || (critico && (aoReconhecer || aoAdiar));
        return (
          <Toast toast={toast} data-situacao={situacao} className={estilos.aviso}>
            <span className={estilos.icone}>
              <Icone icone={ICONES_DAS_SITUACOES[situacao]} />
            </span>
            <div className={estilos.corpo}>
              <ToastContent className={estilos.conteudo}>
                {/* A situação fica no título: aparece em texto e entra no anúncio. */}
                <Text slot="title" className={estilos.titulo}>
                  <span className={estilos.situacao}>{NOMES_DAS_SITUACOES[situacao]}</span>
                  <span className={estilos.somenteLeitor}>: </span>
                  {titulo}
                </Text>
                {descricao && (
                  <Text slot="description" className={estilos.descricao}>
                    {descricao}
                  </Text>
                )}
              </ToastContent>
              {temAcoes && (
                <div className={estilos.acoes}>
                  {acao && (
                    <Botao
                      nivel="primario"
                      onPress={() => {
                        acao.aoEscolher();
                        fechar();
                      }}
                    >
                      {acao.rotulo}
                    </Botao>
                  )}
                  {critico && aoReconhecer && (
                    <Botao
                      nivel="primario"
                      onPress={() => {
                        aoReconhecer();
                        fechar();
                      }}
                    >
                      Reconhecer
                    </Botao>
                  )}
                  {critico && aoAdiar && (
                    <Botao
                      onPress={() => {
                        aoAdiar();
                        fechar();
                      }}
                    >
                      {rotuloDoAdiar ?? 'Adiar'}
                    </Botao>
                  )}
                  {aoAbrir && (
                    <Botao
                      onPress={() => {
                        aoAbrir();
                        fechar();
                      }}
                    >
                      Abrir
                    </Botao>
                  )}
                </div>
              )}
            </div>
            <BotaoDeIcone icone={X} rotulo="Fechar" slot="close" comDica={false} />
          </Toast>
        );
      }}
    </ToastRegion>
  );
}
