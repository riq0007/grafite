// A referência a um modelo (spec componentes-base, "Referência com cartão"; change relacoes-vivas,
// decisão 2): o link para a ficha do modelo no catálogo, que toda sessão abre, com o cartão do
// resumo.
import { CartaoDoRegistro, MiniaturaDeAtivo, ReferenciaComCartao } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { contagemComRotulo, estadoDoCartao, useResumo } from '../../../relacoes/resumos.ts';
import { origemNoEndereco } from '../origem.ts';
import { imagemDoModelo } from './imagens.ts';

export interface ModeloReferido {
  id: string;
  fabricante: string;
  nome: string;
}

export const nomeDoModelo = (modelo: Pick<ModeloReferido, 'fabricante' | 'nome'>) =>
  `${modelo.fabricante} ${modelo.nome}`;

export function ReferenciaAoModelo({ modelo }: { modelo: ModeloReferido }) {
  const nome = nomeDoModelo(modelo);
  return (
    <ReferenciaComCartao
      titulo={`Resumo de ${nome}`}
      cartao={() => <CartaoDoModelo modelo={modelo} />}
    >
      <Link to="/gestao/catalogo/modelos/$id" params={{ id: modelo.id }}>
        {nome}
      </Link>
    </ReferenciaComCartao>
  );
}

/** A imagem, o tipo, a situação e os ativos do modelo, com "Abrir". */
function CartaoDoModelo({ modelo }: { modelo: ModeloReferido }) {
  const resumo = useResumo('modelo', modelo.id);
  const dados = resumo.data;
  return (
    <CartaoDoRegistro
      nome={nomeDoModelo(dados ?? modelo)}
      tipo={
        dados
          ? [dados.tipo.nome, dados.situacao === 'inativo' ? 'Inativo' : null]
              .filter(Boolean)
              .join(' · ')
          : 'Modelo'
      }
      midia={
        dados && (
          <MiniaturaDeAtivo tipo={dados.tipo.icone} imagemDoModelo={imagemDoModelo(dados, 128)} />
        )
      }
      estado={estadoDoCartao(resumo)}
      detalhes={dados?.ativos ? [contagemComRotulo('Ativos', dados.ativos)] : []}
      acoes={
        <>
          <Link to="/gestao/catalogo/modelos/$id" params={{ id: modelo.id }}>
            Abrir
          </Link>
          {dados?.ativos && (
            <Link
              to="/ativos"
              search={{ origem: origemNoEndereco({ tipo: 'modelo', id: modelo.id }) }}
            >
              Ver ativos
            </Link>
          )}
        </>
      }
    />
  );
}
