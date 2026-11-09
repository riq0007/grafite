// A referência a uma pessoa (spec componentes-base, "Referência com cartão"; change relacoes-vivas,
// decisão 2): o link para a ficha dela, com o cartão do resumo, para quem a vê no local de trabalho
// dela; para quem não a vê, e na pessoa anonimizada, só o nome.
import { Avatar, CartaoDoRegistro, ReferenciaComCartao } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { miniaturasDaPessoa } from '../../../api/fotos.ts';
import { ativosSobResponsabilidade, estadoDoCartao, useResumo } from '../../../relacoes/resumos.ts';
import { origemNoEndereco } from '../../ativos/origem.ts';

export interface PessoaReferida {
  id: string;
  nome: string;
}

export function ReferenciaAPessoa({
  pessoa,
  comCartao,
}: {
  pessoa: PessoaReferida;
  /** A conta vê a pessoa, e ela não está anonimizada; sem isso, só o nome. */
  comCartao: boolean;
}) {
  if (!comCartao) return <>{pessoa.nome}</>;
  return (
    <ReferenciaComCartao
      titulo={`Resumo de ${pessoa.nome}`}
      cartao={() => <CartaoDaPessoa pessoa={pessoa} />}
    >
      <Link to="/administracao/pessoas/$id" params={{ id: pessoa.id }}>
        {pessoa.nome}
      </Link>
    </ReferenciaComCartao>
  );
}

/** A foto, o local de trabalho, se tem conta e os ativos sob responsabilidade, com "Abrir". */
function CartaoDaPessoa({ pessoa }: { pessoa: PessoaReferida }) {
  const resumo = useResumo('pessoa', pessoa.id);
  const dados = resumo.data;
  const nome = dados?.nome ?? pessoa.nome;
  return (
    <CartaoDoRegistro
      nome={nome}
      tipo={dados?.situacao === 'inativa' ? 'Pessoa · Inativa' : 'Pessoa'}
      midia={
        <Avatar
          nome={nome}
          imagens={dados ? miniaturasDaPessoa(pessoa.id, dados.foto) : undefined}
          tamanho="ficha"
          decorativo
        />
      }
      estado={estadoDoCartao(resumo)}
      detalhes={
        dados
          ? [
              dados.local?.caminho ?? 'Sem local de trabalho',
              dados.temConta ? 'Tem conta de acesso' : 'Sem conta de acesso',
              ...(dados.ativos ? [ativosSobResponsabilidade(dados.ativos)] : []),
            ]
          : []
      }
      acoes={
        <>
          <Link to="/administracao/pessoas/$id" params={{ id: pessoa.id }}>
            Abrir
          </Link>
          {dados?.ativos && (
            <Link
              to="/ativos"
              search={{ origem: origemNoEndereco({ tipo: 'pessoa', id: pessoa.id }) }}
            >
              Ver ativos
            </Link>
          )}
        </>
      }
    />
  );
}
