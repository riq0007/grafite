// As relações do módulo Ativos nas fichas dos outros (spec estrutura-da-casca, "Módulos
// registrados"; change relacoes-vivas, decisão 4): os ativos sob responsabilidade da pessoa, os do
// local, aqui e com os de dentro, os do modelo e do tipo e os do fornecedor (change
// p4a-fornecedores), no escopo de quem vê, com o link que abre a tabela com a origem do registro.
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';
import {
  aquiEDentro,
  CHAVE_DOS_RESUMOS,
  type ContagemNoEscopo,
  contagemComRotulo,
  useResumo,
} from '../../relacoes/resumos.ts';
import type { RelacaoDoModulo } from '../tipos.ts';
import estilos from './Ativos.module.css';
import { type OrigemDaTabela, origemNoEndereco } from './origem.ts';

/** O link que abre a tabela dos ativos com a origem. */
function NaTabela({
  origem,
  children,
}: {
  origem: Pick<OrigemDaTabela, 'tipo' | 'id'>;
  children: ReactNode;
}) {
  return (
    <Link to="/ativos" search={{ origem: origemNoEndereco(origem) }} className={estilos.link}>
      {children}
    </Link>
  );
}

/** A linha da relação: a contagem e, se houver, o link. */
function Linha({ texto, link }: { texto: string; link?: ReactNode }) {
  return (
    <p className={estilos.relacao}>
      <span>{texto}</span>
      {link}
    </p>
  );
}

function AtivosDaPessoa({ id }: { id: string }) {
  const ativos = useResumo('pessoa', id).data?.ativos;
  if (!ativos) return null;
  return (
    <Linha
      texto={contagemComRotulo('Ativos sob responsabilidade', ativos)}
      link={<NaTabela origem={{ tipo: 'pessoa', id }}>Ver na tabela</NaTabela>}
    />
  );
}

function AtivosDoLocal({ id }: { id: string }) {
  const ativos = useResumo('local', id).data?.ativos;
  if (!ativos) return null;
  return (
    <Linha
      texto={aquiEDentro('Ativos', ativos)}
      link={<NaTabela origem={{ tipo: 'local', id }}>Ver ativos</NaTabela>}
    />
  );
}

/** Os ativos do modelo ou do tipo, ou que não há nenhum. */
function ativosDoCatalogo(
  origem: Pick<OrigemDaTabela, 'tipo' | 'id'>,
  ativos: ContagemNoEscopo | null | undefined,
  nenhum: string,
) {
  if (!ativos) return null;
  if (ativos.quantos === 0) {
    return <Linha texto={`${nenhum}${ativos.recortada ? ' que você vê' : ''}.`} />;
  }
  return (
    <Linha
      texto={contagemComRotulo('Ativos', ativos)}
      link={<NaTabela origem={origem}>Ver na tabela</NaTabela>}
    />
  );
}

function AtivosDoModelo({ id }: { id: string }) {
  const ativos = useResumo('modelo', id).data?.ativos;
  return ativosDoCatalogo({ tipo: 'modelo', id }, ativos, 'Nenhum ativo deste modelo');
}

function AtivosDoTipo({ id }: { id: string }) {
  const ativos = useResumo('tipo', id).data?.ativos;
  return ativosDoCatalogo({ tipo: 'tipo', id }, ativos, 'Nenhum ativo deste tipo');
}

/**
 * Os ativos ativos do fornecedor que a conta vê (spec fornecedores, "Ativos do fornecedor"), pela
 * contagem da API, sob a chave dos resumos: o evento dos ativos a relê. Sem ver ativos, nada.
 */
function AtivosDoFornecedor({ id }: { id: string }) {
  const api = useApi();
  const contagem = useQuery({
    queryKey: [...CHAVE_DOS_RESUMOS, 'ativos-do-fornecedor', id],
    queryFn: () =>
      consultar(
        () => api.GET('/fornecedores/{id}/ativos', { params: { path: { id } } }),
        'carregar os ativos do fornecedor',
      ),
  });
  const ativos = contagem.data?.ativos;
  if (ativos === undefined || ativos === null) return null;
  if (ativos === 0) return <Linha texto="Nenhum ativo deste fornecedor." />;
  return (
    <Linha
      texto={`Ativos deste fornecedor: ${ativos.toLocaleString('pt-BR')}`}
      link={<NaTabela origem={{ tipo: 'fornecedor', id }}>Ver na tabela</NaTabela>}
    />
  );
}

/** As relações do módulo, para quem vê ativos em algum ramo. */
export const RELACOES_DOS_ATIVOS: readonly RelacaoDoModulo[] = [
  { alvo: 'pessoa', componente: AtivosDaPessoa, permissoes: ['ativos.ver'] },
  { alvo: 'local', componente: AtivosDoLocal, permissoes: ['ativos.ver'] },
  { alvo: 'modelo', componente: AtivosDoModelo, permissoes: ['ativos.ver'] },
  { alvo: 'tipo', componente: AtivosDoTipo, permissoes: ['ativos.ver'] },
  { alvo: 'fornecedor', componente: AtivosDoFornecedor, permissoes: ['ativos.ver'] },
];
