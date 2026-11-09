import {
  ControleDeslizante,
  ControleSegmentado,
  Formulario,
  Interruptor,
  Segmento,
  usePostura,
} from '@grafite/ui';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
} from '../../../preferencias/alvo.tsx';
import type { PreferenciasDaInterface } from '../../../preferencias/preferencias.ts';
import estilos from './Secoes.module.css';
import { useSistemaPede } from './useSistemaPede.ts';

type TipoDeCursor = PreferenciasDaInterface['cursor']['tipo'];

/**
 * Seção Cursor: suavizado ou do sistema, a suavização do anel e o abraço, com efeito na hora. Com
 * "Do sistema", a suavização e o abraço ficam desabilitados, sem perder os valores. Quando a casca
 * não pode mostrar o cursor suavizado (movimento reduzido ou toque), a seção diz por quê.
 */
export function SecaoCursor() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { tipo, suavizacao, abracar } = preferencias.cursor;
  const toque = usePostura() !== 'computador';
  const sistemaReduz = useSistemaPede('(prefers-reduced-motion: reduce)');
  const movimentoReduzido = sistemaReduz || preferencias.acessibilidade.movimento === 'reduzido';
  const doSistema = tipo === 'sistema';

  const motivo = toque
    ? 'Neste aparelho, a casca usa o cursor do sistema. A escolha vale no computador.'
    : movimentoReduzido
      ? 'Com movimento reduzido, a casca usa o cursor do sistema.'
      : undefined;

  return (
    <>
      <TituloDaSecao>Cursor</TituloDaSecao>
      <Formulario aria-label="Cursor" onSubmit={(evento) => evento.preventDefault()}>
        <ControleSegmentado
          rotulo="Tipo de cursor"
          data-foco="tipo-de-cursor"
          value={tipo}
          onChange={(valor) => mudar('cursor', { tipo: valor as TipoDeCursor })}
          descricao={motivo}
        >
          <Segmento value="suavizado">Suavizado</Segmento>
          <Segmento value="sistema">Do sistema</Segmento>
        </ControleSegmentado>

        <ControleDeslizante
          rotulo="Suavização"
          data-foco="suavizacao-do-cursor"
          unidade="%"
          minValue={0}
          maxValue={100}
          step={5}
          value={suavizacao}
          onChange={(valor) => mudar('cursor', { suavizacao: valor })}
          isDisabled={doSistema}
          className={estilos.deslizante}
        />

        <Interruptor
          data-foco="abracar-botoes"
          isSelected={abracar}
          onChange={(ligado) => mudar('cursor', { abracar: ligado })}
          isDisabled={doSistema}
        >
          Abraçar botões
        </Interruptor>

        <div>
          <RestaurarPadroes secao="cursor" />
        </div>
      </Formulario>
    </>
  );
}
