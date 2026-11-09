// A referência a um local (spec componentes-base, "Referência com cartão"; change relacoes-vivas,
// decisão 2): o link para o local na tela de locais, com o cartão do resumo, para quem abre a tela;
// para os outros, só o caminho.
import { ROTULOS_DOS_TIPOS } from '@grafite/domain';
import { CartaoDoRegistro, ReferenciaComCartao } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import {
  aquiEDentro,
  contagemComRotulo,
  estadoDoCartao,
  useResumo,
} from '../../../relacoes/resumos.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { origemNoEndereco } from '../../ativos/origem.ts';

export interface LocalReferido {
  id: string;
  /** Como "Jundiaí › Expedição". */
  caminho: string;
}

export function ReferenciaAoLocal({ local }: { local: LocalReferido }) {
  // A ficha do local é a tela de locais, de quem altera locais em algum ramo.
  const abreALista = useAcesso().pode('locais.editar');
  if (!abreALista) return <>{local.caminho}</>;
  return (
    <ReferenciaComCartao
      titulo={`Resumo de ${local.caminho}`}
      cartao={() => <CartaoDoLocal local={local} />}
    >
      <Link to="/administracao/locais" search={{ local: local.id }}>
        {local.caminho}
      </Link>
    </ReferenciaComCartao>
  );
}

/** O tipo, a situação, e os ativos e as pessoas, aqui e com os de dentro, com "Abrir". */
function CartaoDoLocal({ local }: { local: LocalReferido }) {
  const resumo = useResumo('local', local.id);
  const dados = resumo.data;
  const tipo = dados
    ? [ROTULOS_DOS_TIPOS[dados.tipo], dados.situacao === 'inativo' ? 'Inativo' : null]
        .filter(Boolean)
        .join(' · ')
    : 'Local';
  return (
    <CartaoDoRegistro
      nome={dados?.caminho ?? local.caminho}
      tipo={tipo}
      estado={estadoDoCartao(resumo)}
      detalhes={
        dados
          ? [
              ...(dados.ativos ? [aquiEDentro('Ativos', dados.ativos)] : []),
              ...(dados.pessoas ? [contagemComRotulo('Pessoas', dados.pessoas.comOsDeDentro)] : []),
            ]
          : []
      }
      acoes={
        <>
          <Link to="/administracao/locais" search={{ local: local.id }}>
            Abrir
          </Link>
          {dados?.ativos && (
            <Link
              to="/ativos"
              search={{ origem: origemNoEndereco({ tipo: 'local', id: local.id }) }}
            >
              Ver ativos
            </Link>
          )}
        </>
      }
    />
  );
}
