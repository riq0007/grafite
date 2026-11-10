// A disponibilidade na rede nas telas dos ativos (spec disponibilidade-de-rede e leituras-e-estado):
// a situação em texto, com o ícone, a idade da última leitura, com o momento exato ao parar o mouse,
// e "Desatualizado" depois de 3 intervalos do ping, sem trocar a situação. A ficha mostra também
// desde quando a situação vale, a latência, o coletor e, sem leitura, o motivo.
import type { components } from '@grafite/api-client';
import {
  desatualizada,
  type MetricaDaColeta,
  ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE,
  type SituacaoDaDisponibilidade,
} from '@grafite/domain';
import {
  idadeRelativa,
  RotuloDeSituacao,
  type Situacao,
  useDataHora,
  ValorComposto,
} from '@grafite/ui';
import type { ReactNode } from 'react';
import estilos from './Ativos.module.css';

export type Disponibilidade = components['schemas']['DisponibilidadeDoAtivo'];

/** A coluna da disponibilidade na tabela dos ativos (domínio, capacidade `rede.disponibilidade`). */
export const COLUNA_DA_DISPONIBILIDADE = 'coleta.disponibilidade';

/** Cada situação no rótulo: a forma do ícone muda com ela, além da cor. */
const NA_TELA: Record<SituacaoDaDisponibilidade, Situacao> = {
  online: 'sucesso',
  offline: 'critico',
  'sem-dado': 'atencao',
  'nao-verificado': 'neutra',
};

export const rotuloDaDisponibilidade = (disponibilidade: Disponibilidade) =>
  ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE[disponibilidade.situacao];

function SituacaoNaTela({ disponibilidade }: { disponibilidade: Disponibilidade }) {
  return (
    <RotuloDeSituacao situacao={NA_TELA[disponibilidade.situacao]}>
      {rotuloDaDisponibilidade(disponibilidade)}
    </RotuloDeSituacao>
  );
}

/** A idade da leitura, como "há 2 min", com o momento exato ao parar o mouse. */
export function IdadeDaLeitura({ momento, agora }: { momento: string; agora: Date }) {
  const { formatarDataEHora } = useDataHora();
  const data = new Date(momento);
  const idade = idadeRelativa(data, agora);
  return (
    <time className="mono" dateTime={momento} title={formatarDataEHora(data)}>
      {idade === 'agora' ? 'agora' : `há ${idade}`}
    </time>
  );
}

/** A idade e, com a leitura velha para a métrica, "Desatualizado", ao lado da situação. */
export function IdadeEDesatualizado({
  momento,
  agora,
  metrica,
}: {
  momento: string | null;
  agora: Date;
  metrica?: MetricaDaColeta;
}) {
  if (!momento) return null;
  return (
    <>
      <IdadeDaLeitura momento={momento} agora={agora} />
      <Desatualizado momento={momento} agora={agora} metrica={metrica} />
    </>
  );
}

/** "Desatualizado", com a leitura velha para a métrica; senão, nada. */
export function Desatualizado({
  momento,
  agora,
  metrica,
}: {
  momento: string | null;
  agora: Date;
  metrica?: MetricaDaColeta;
}) {
  if (!momento || !desatualizada(new Date(momento), agora, metrica)) return null;
  return <RotuloDeSituacao situacao="atencao">Desatualizado</RotuloDeSituacao>;
}

/**
 * O valor de uma leitura na célula da tabela (spec componentes-base, "Célula numa linha só"): os
 * rótulos na parte que não encolhe, com o "Desatualizado" ao lado, e a idade na parte que encolhe,
 * depois do texto que a tela puser antes dela.
 */
export function LeituraNaCelula({
  fixo,
  momento,
  agora,
  metrica,
  children,
}: {
  fixo: ReactNode;
  momento: string | null;
  agora: Date;
  metrica?: MetricaDaColeta;
  /** O texto antes da idade, como a descrição do suprimento. */
  children?: ReactNode;
}) {
  return (
    <ValorComposto
      fixo={
        <>
          {fixo}
          <Desatualizado momento={momento} agora={agora} metrica={metrica} />
        </>
      }
    >
      {children}
      {momento && <IdadeDaLeitura momento={momento} agora={agora} />}
    </ValorComposto>
  );
}

/** A disponibilidade na célula da tabela: a situação, a idade e o "Desatualizado". */
export function DisponibilidadeNaCelula({
  disponibilidade,
  agora,
}: {
  disponibilidade: Disponibilidade;
  agora: Date;
}) {
  return (
    <LeituraNaCelula
      fixo={<SituacaoNaTela disponibilidade={disponibilidade} />}
      momento={disponibilidade.momento}
      agora={agora}
    />
  );
}

/**
 * A disponibilidade na ficha do ativo: a situação com a idade, desde quando ela vale, a latência,
 * marcada quando inconsistente, e o coletor da última leitura; sem leitura, o motivo.
 */
export function DisponibilidadeNaFicha({
  disponibilidade,
  agora,
}: {
  disponibilidade: Disponibilidade;
  agora: Date;
}) {
  const { formatarDataEHora } = useDataHora();
  const { latencia } = disponibilidade;
  return (
    // O título é o do cartão da capacidade (change ficha-em-cartoes): a parte só leva o nome.
    <section className={estilos.parte} aria-label="Disponibilidade na rede">
      <dl className={estilos.dadosDaColeta}>
        <div>
          <dt>Situação</dt>
          <dd className={estilos.disponibilidade}>
            <SituacaoNaTela disponibilidade={disponibilidade} />
            <IdadeEDesatualizado momento={disponibilidade.momento} agora={agora} />
          </dd>
        </div>
        {disponibilidade.desde && (
          <div>
            <dt>Desde</dt>
            <dd>
              {`${rotuloDaDisponibilidade(disponibilidade)} desde ${formatarDataEHora(new Date(disponibilidade.desde))}`}
            </dd>
          </div>
        )}
        {latencia && (
          <div>
            <dt>Latência</dt>
            <dd className={estilos.disponibilidade}>
              <span className="mono">{`${latencia.valor.toLocaleString('pt-BR')} ms`}</span>
              {latencia.inconsistente && (
                <RotuloDeSituacao situacao="atencao">Inconsistente</RotuloDeSituacao>
              )}
            </dd>
          </div>
        )}
        {disponibilidade.coletor && (
          <div>
            <dt>Coletor</dt>
            <dd>{disponibilidade.coletor}</dd>
          </div>
        )}
        {disponibilidade.motivo && (
          <div>
            <dt>Motivo</dt>
            <dd>{disponibilidade.motivo}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
