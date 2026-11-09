// A referência a um tipo de ativo (spec componentes-base, "Referência com cartão"; change
// relacoes-vivas, decisão 2): o link para a ficha do tipo no catálogo, que toda sessão abre, com o
// cartão do resumo.
import { CartaoDoRegistro, MiniaturaDeAtivo, ReferenciaComCartao } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { contagemComRotulo, estadoDoCartao, useResumo } from '../../../relacoes/resumos.ts';
import { origemNoEndereco } from '../origem.ts';

export interface TipoReferido {
  id: string;
  nome: string;
  icone: string;
}

export function ReferenciaAoTipo({ tipo }: { tipo: TipoReferido }) {
  return (
    <ReferenciaComCartao
      titulo={`Resumo de ${tipo.nome}`}
      cartao={() => <CartaoDoTipo tipo={tipo} />}
    >
      <Link to="/gestao/catalogo/tipos/$id" params={{ id: tipo.id }}>
        {tipo.nome}
      </Link>
    </ReferenciaComCartao>
  );
}

/** O ícone, a situação e os ativos do tipo, com "Abrir". */
function CartaoDoTipo({ tipo }: { tipo: TipoReferido }) {
  const resumo = useResumo('tipo', tipo.id);
  const dados = resumo.data;
  return (
    <CartaoDoRegistro
      nome={dados?.nome ?? tipo.nome}
      tipo={dados?.situacao === 'inativo' ? 'Tipo de ativo · Inativo' : 'Tipo de ativo'}
      midia={<MiniaturaDeAtivo tipo={dados?.icone ?? tipo.icone} />}
      estado={estadoDoCartao(resumo)}
      detalhes={dados?.ativos ? [contagemComRotulo('Ativos', dados.ativos)] : []}
      acoes={
        <>
          <Link to="/gestao/catalogo/tipos/$id" params={{ id: tipo.id }}>
            Abrir
          </Link>
          {dados?.ativos && (
            <Link to="/ativos" search={{ origem: origemNoEndereco({ tipo: 'tipo', id: tipo.id }) }}>
              Ver ativos
            </Link>
          )}
        </>
      }
    />
  );
}
