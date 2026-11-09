// A saúde do Control iD nas telas dos ativos (spec saude-do-control-id, "Situação do Control iD";
// change p2c-saude-do-control-id, design, decisão 8): a situação em texto, com um ícone próprio para
// cada uma que pede uma ação diferente, a idade da última sondagem e "Desatualizado" depois de 3
// intervalos, sem trocar a situação. A ficha mostra também desde quando a situação vale, o último
// contato, o firmware com o produto, de onde vem o login e o coletor, e, sem sondagem, o motivo.
import type { components } from '@grafite/api-client';
import { ROTULOS_DAS_SITUACOES_DO_CONTROL_ID, type SituacaoDoControlId } from '@grafite/domain';
import { RotuloDeSituacao, type Situacao, useDataHora } from '@grafite/ui';
import type { ReactNode } from 'react';
import estilos from './Ativos.module.css';
import { IdadeDaLeitura, IdadeEDesatualizado } from './disponibilidade.tsx';

export type SaudeDoControlId = components['schemas']['SaudeDoControlId'];

/** A coluna do Control iD na tabela dos ativos (domínio, capacidade `controlid.saude`). */
export const COLUNA_DO_CONTROL_ID = 'coleta.control-id';

/** Cada situação no rótulo: a forma do ícone muda com ela, além da cor. */
const NA_TELA: Record<SituacaoDoControlId, Situacao> = {
  respondendo: 'sucesso',
  'login-recusado': 'atencao',
  'sem-resposta': 'critico',
  'resposta-inesperada': 'info',
  'sem-dado': 'atencao',
  'nao-verificado': 'neutra',
};

const DE_ONDE_VEM_O_LOGIN = {
  tipo: 'Login do tipo',
  controle: 'Login próprio do controle',
} as const;

export const rotuloDoControlId = (saude: SaudeDoControlId) =>
  ROTULOS_DAS_SITUACOES_DO_CONTROL_ID[saude.situacao];

function SituacaoNaTela({ saude }: { saude: SaudeDoControlId }) {
  return (
    <RotuloDeSituacao situacao={NA_TELA[saude.situacao]}>
      {rotuloDoControlId(saude)}
    </RotuloDeSituacao>
  );
}

/** A saúde na célula da tabela: a situação, a idade e o "Desatualizado". */
export function ControlIdNaCelula({ saude, agora }: { saude: SaudeDoControlId; agora: Date }) {
  return (
    <span className={estilos.disponibilidade}>
      <SituacaoNaTela saude={saude} />
      <IdadeEDesatualizado momento={saude.momento} agora={agora} metrica="controlid.sondagem" />
    </span>
  );
}

/**
 * A saúde do Control iD na ficha do ativo: a situação com a idade, desde quando ela vale, o último
 * contato, o firmware com o produto, de onde vem o login e o coletor; sem sondagem, o motivo. Ao lado
 * do login, a ação de escolhê-lo, para quem pode (change login-de-cada-controle, design, decisão 5).
 */
export function SaudeDoControlIdNaFicha({
  saude,
  agora,
  acaoDoLogin,
}: {
  saude: SaudeDoControlId;
  agora: Date;
  acaoDoLogin?: ReactNode;
}) {
  const { formatarDataEHora } = useDataHora();
  const { ultimoContato } = saude;
  return (
    // O título é o do cartão da capacidade (change ficha-em-cartoes): a parte só leva o nome.
    <section className={estilos.parte} aria-label="Saúde do Control iD">
      <dl className={estilos.dadosDaColeta}>
        <div>
          <dt>Situação</dt>
          <dd className={estilos.disponibilidade}>
            <SituacaoNaTela saude={saude} />
            <IdadeEDesatualizado
              momento={saude.momento}
              agora={agora}
              metrica="controlid.sondagem"
            />
          </dd>
        </div>
        {saude.desde && (
          <div>
            <dt>Desde</dt>
            <dd>{`${rotuloDoControlId(saude)} desde ${formatarDataEHora(new Date(saude.desde))}`}</dd>
          </div>
        )}
        <div>
          <dt>Último contato</dt>
          <dd>
            {ultimoContato ? (
              <>
                {`${formatarDataEHora(new Date(ultimoContato))} · `}
                <IdadeDaLeitura momento={ultimoContato} agora={agora} />
              </>
            ) : (
              'Nenhum contato ainda.'
            )}
          </dd>
        </div>
        {ultimoContato && (
          <div>
            <dt>Firmware</dt>
            <dd>
              {[saude.firmware ?? 'Não informado', saude.produto].filter(Boolean).join(' · ')}
            </dd>
          </div>
        )}
        {(saude.login || acaoDoLogin) && (
          <div>
            <dt>Login</dt>
            <dd className={estilos.disponibilidade}>
              {saude.login ? DE_ONDE_VEM_O_LOGIN[saude.login] : 'Nenhum em uso'}
              {acaoDoLogin}
            </dd>
          </div>
        )}
        {saude.coletor && (
          <div>
            <dt>Coletor</dt>
            <dd>{saude.coletor}</dd>
          </div>
        )}
        {saude.motivo && (
          <div>
            <dt>Motivo</dt>
            <dd>{saude.motivo}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
