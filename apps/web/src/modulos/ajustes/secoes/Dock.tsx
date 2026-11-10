import {
  ControleDeslizante,
  ControleSegmentado,
  casca,
  Formulario,
  Interruptor,
  type PosicaoDoDock,
  Segmento,
  usePostura,
} from '@grafite/ui';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
} from '../../../preferencias/alvo.tsx';
import { ModulosDoDock } from './ModulosDoDock.tsx';
import estilos from './Secoes.module.css';

const NOMES_DAS_POSICOES: Record<PosicaoDoDock, string> = {
  embaixo: 'Embaixo',
  esquerda: 'À esquerda',
  direita: 'À direita',
};

/**
 * Seção Dock: posição, tamanho, ampliação, ocultar automático e os módulos do dock, na ordem e com
 * os tirados dele, com efeito na hora.
 */
export function SecaoDock() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { posicao, tamanho, ampliar, ocultar } = preferencias.dock;
  // No tablet, o dock fica embaixo qualquer que seja a posição salva.
  const tablet = usePostura() === 'tablet';
  return (
    <>
      <TituloDaSecao>Dock</TituloDaSecao>
      <Formulario aria-label="Dock" onSubmit={(evento) => evento.preventDefault()}>
        <ControleSegmentado
          rotulo="Posição"
          data-foco="posicao-do-dock"
          value={posicao}
          onChange={(valor) => mudar('dock', { posicao: valor as PosicaoDoDock })}
          descricao={
            tablet
              ? 'Neste aparelho, o dock fica embaixo. A posição escolhida vale no computador.'
              : undefined
          }
        >
          {(Object.keys(NOMES_DAS_POSICOES) as PosicaoDoDock[]).map((id) => (
            <Segmento key={id} value={id}>
              {NOMES_DAS_POSICOES[id]}
            </Segmento>
          ))}
        </ControleSegmentado>

        <ControleDeslizante
          rotulo="Tamanho"
          data-foco="tamanho-do-dock"
          unidade="px"
          minValue={casca.tamanhoItemDockMinimo}
          maxValue={casca.tamanhoItemDockMaximo}
          value={tamanho}
          onChange={(valor) => mudar('dock', { tamanho: valor })}
          className={estilos.deslizante}
        />

        <Interruptor
          data-foco="ampliar-o-dock"
          isSelected={ampliar}
          onChange={(ligado) => mudar('dock', { ampliar: ligado })}
        >
          Ampliar ao passar o mouse
        </Interruptor>

        <Interruptor
          data-foco="ocultar-o-dock"
          isSelected={ocultar}
          onChange={(ligado) => mudar('dock', { ocultar: ligado })}
        >
          Ocultar automaticamente
        </Interruptor>

        <ModulosDoDock />

        <div>
          <RestaurarPadroes secao="dock" />
        </div>
      </Formulario>
    </>
  );
}
