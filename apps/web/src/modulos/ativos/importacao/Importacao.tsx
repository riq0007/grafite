import { Botao, CabecalhoDaPagina, EstadoVazio, RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { useParams } from '@tanstack/react-router';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilosDosAtivos from '../Ativos.module.css';
import { AndamentoDaImportacao } from './AndamentoDaImportacao.tsx';
import { useImportacao } from './consultas.ts';
import { RascunhoDaImportacao } from './RascunhoDaImportacao.tsx';
import { situacaoDaImportacao } from './textos.ts';

/**
 * Uma importação da conta (spec importacao-de-ativos): o arquivo, o tipo, quando e a situação em
 * texto, e o que cada situação pede. A tela se atualiza sozinha pelo evento `importacoes.mudaram`.
 */
export function Importacao() {
  const { id } = useParams({ from: '/gestao/importacoes/$id' });
  const { pode } = useAcesso();
  const { formatarDataEHora } = useDataHora();
  const importacao = useImportacao(id);

  if (!pode('ativos.editar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importação" />
        <SemPermissao a="às importações de ativos" />
      </>
    );
  }
  if (importacao.error && !importacao.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importação" />
        <EstadoVazio
          titulo={importacao.error.message}
          acao={<Botao onPress={() => void importacao.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }
  if (!importacao.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importação" />
        <p role="status" className={estilosDosAtivos.contagem}>
          Carregando a importação…
        </p>
      </>
    );
  }
  const dados = importacao.data;
  const situacao = situacaoDaImportacao(dados.situacao);
  return (
    <div className={estilosDosAtivos.tela}>
      <CabecalhoDaPagina
        titulo={dados.nomeDoArquivo}
        selos={<RotuloDeSituacao situacao={situacao.tom}>{situacao.texto}</RotuloDeSituacao>}
        detalhe={`${dados.tipo.nome} · ${formatarDataEHora(new Date(dados.criadaEm))}`}
      />
      {dados.situacao === 'rascunho' ? (
        <RascunhoDaImportacao importacao={dados} />
      ) : (
        <AndamentoDaImportacao importacao={dados} />
      )}
    </div>
  );
}
