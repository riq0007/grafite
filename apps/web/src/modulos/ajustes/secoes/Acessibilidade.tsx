import { ControleSegmentado, Formulario, Segmento } from '@grafite/ui';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
} from '../../../preferencias/alvo.tsx';
import type { PreferenciasDaInterface } from '../../../preferencias/preferencias.ts';
import { useSistemaPede } from './useSistemaPede.ts';

type Acessibilidade = PreferenciasDaInterface['acessibilidade'];

const oQueOSistemaPede = (pede: boolean, reducao: string) =>
  pede ? `No momento, o sistema pede ${reducao}.` : `No momento, o sistema não pede ${reducao}.`;

/**
 * Seção Acessibilidade: movimento e transparência, cada um seguindo o sistema ou reduzido, com o
 * que o sistema operacional pede no momento. Nunca há opção de forçar animação ou transparência.
 */
export function SecaoAcessibilidade() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { movimento, transparencia } = preferencias.acessibilidade;
  const movimentoReduzido = useSistemaPede('(prefers-reduced-motion: reduce)');
  const transparenciaReduzida = useSistemaPede('(prefers-reduced-transparency: reduce)');
  return (
    <>
      <TituloDaSecao>Acessibilidade</TituloDaSecao>
      <Formulario aria-label="Acessibilidade" onSubmit={(evento) => evento.preventDefault()}>
        <ControleSegmentado
          rotulo="Movimento"
          data-foco="movimento"
          value={movimento}
          onChange={(valor) =>
            mudar('acessibilidade', { movimento: valor as Acessibilidade['movimento'] })
          }
          descricao={oQueOSistemaPede(movimentoReduzido, 'movimento reduzido')}
        >
          <Segmento value="sistema">Seguir o sistema</Segmento>
          <Segmento value="reduzido">Reduzir</Segmento>
        </ControleSegmentado>

        <ControleSegmentado
          rotulo="Transparência"
          data-foco="transparencia"
          value={transparencia}
          onChange={(valor) =>
            mudar('acessibilidade', { transparencia: valor as Acessibilidade['transparencia'] })
          }
          descricao={oQueOSistemaPede(transparenciaReduzida, 'transparência reduzida')}
        >
          <Segmento value="sistema">Seguir o sistema</Segmento>
          <Segmento value="reduzida">Reduzir</Segmento>
        </ControleSegmentado>

        <div>
          <RestaurarPadroes secao="acessibilidade" />
        </div>
      </Formulario>
    </>
  );
}
