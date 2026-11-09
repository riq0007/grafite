import { mostrarDecimal } from '@grafite/domain';
import { BarraDeProgresso, Botao, EstadoVazio, PreviaDaImportacao, useDataHora } from '@grafite/ui';
import { itensDasPaginas } from '../../../api/consultas.ts';
import estilosDosAtivos from '../Ativos.module.css';
import { type Importacao, useErrosDaImportacao } from './consultas.ts';
import estilos from './Importacao.module.css';
import { acaoDaLinha, totaisEmTexto } from './textos.ts';

/** "60 de 120 linhas processadas." */
const processadas = (importacao: Importacao) =>
  `${mostrarDecimal(importacao.processadas)} de ${mostrarDecimal(importacao.linhas)} linhas processadas.`;

/** As linhas que a aplicação não gravou, com as recusas, por páginas. */
function LinhasComErro({ importacao }: { importacao: Importacao }) {
  const erros = useErrosDaImportacao(importacao.id, importacao.totais.comErro > 0);
  if (importacao.totais.comErro === 0) {
    return <p className={estilosDosAtivos.contagem}>Nenhuma linha com erro.</p>;
  }
  if (erros.isError && !erros.data) {
    return (
      <EstadoVazio
        titulo={erros.error.message}
        acao={<Botao onPress={() => void erros.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  if (!erros.data) {
    return (
      <p role="status" className={estilosDosAtivos.contagem}>
        Carregando as linhas com erro…
      </p>
    );
  }
  return (
    <PreviaDaImportacao
      rotulo="Linhas com erro"
      linhas={itensDasPaginas(erros.data).map((linha) => ({
        linha: linha.linha,
        acao: acaoDaLinha('com-erro'),
        mudancas: [],
        seguros: [],
        erros: linha.mensagens,
      }))}
      aoCarregarMais={erros.hasNextPage ? () => void erros.fetchNextPage() : undefined}
      carregandoMais={erros.isFetchingNextPage}
    />
  );
}

/**
 * O acompanhamento e o resultado de uma importação aplicada (spec importacao-de-ativos, "Aplicação
 * na fila"): na fila; importando, com as linhas processadas, que avançam pelo evento; com falha,
 * até onde chegou e o que fazer; concluída, com os totais e as linhas com erro; ou descartada.
 */
export function AndamentoDaImportacao({ importacao }: { importacao: Importacao }) {
  const { formatarDataEHora } = useDataHora();
  switch (importacao.situacao) {
    case 'na-fila':
      return (
        <p className={estilosDosAtivos.informacao}>Na fila: a importação começa em instantes.</p>
      );
    case 'aplicando':
      return (
        <div className={estilos.andamento}>
          <BarraDeProgresso
            rotulo="Importando"
            valor={Math.round((importacao.processadas / importacao.linhas) * 100)}
          />
          <p className={estilosDosAtivos.contagem}>{processadas(importacao)}</p>
        </div>
      );
    case 'com-falha':
      return (
        <div className={estilos.andamento}>
          <p className={estilosDosAtivos.informacao}>
            A importação parou com uma falha. Quem administra as tarefas pode tentar de novo pela
            lista das tarefas com falha, e ela continua de onde parou.
          </p>
          <p className={estilosDosAtivos.contagem}>{processadas(importacao)}</p>
        </div>
      );
    case 'concluida':
      return (
        <section className={estilosDosAtivos.tela} aria-labelledby="resultado-da-importacao">
          <h2 id="resultado-da-importacao" className={estilos.titulo}>
            Resultado
          </h2>
          <p className={estilosDosAtivos.informacao}>{totaisEmTexto(importacao.totais)}</p>
          {importacao.concluidaEm && (
            <p className={estilosDosAtivos.contagem}>
              Concluída em {formatarDataEHora(new Date(importacao.concluidaEm))}.
            </p>
          )}
          <LinhasComErro importacao={importacao} />
        </section>
      );
    case 'descartada':
      return <p className={estilosDosAtivos.informacao}>Descartada: nada foi importado.</p>;
    default:
      return null;
  }
}
