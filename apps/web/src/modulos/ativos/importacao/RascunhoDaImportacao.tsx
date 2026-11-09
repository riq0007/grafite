import { type AcaoDaLinha, conferirMapeamento, ROTULOS_DAS_ACOES_DA_LINHA } from '@grafite/domain';
import {
  avisar,
  Botao,
  ControleSegmentado,
  Dialogo,
  EstadoVazio,
  MensagemDoPasso,
  PreviaDaImportacao,
  Segmento,
  Selecao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import estilosDosAtivos from '../Ativos.module.css';
import {
  CHAVE_DAS_IMPORTACOES,
  chaveDaImportacao,
  type Importacao,
  type LinhaDaPreviaDaApi,
  type PreviaDaImportacao as Previa,
  usePrevia,
} from './consultas.ts';
import estilos from './Importacao.module.css';
import { acaoDaLinha, linhas, totaisEmTexto } from './textos.ts';

/** A opção "Ignorar" da escolha do campo de uma coluna. */
const IGNORAR = 'ignorar';

type Filtro = AcaoDaLinha | 'todas';

/** Os totais de uma ação, para o filtro. */
const TOTAL_DO_FILTRO = {
  novo: 'novos',
  alterar: 'alterados',
  'sem-mudanca': 'semMudanca',
  'com-erro': 'comErro',
} as const satisfies Record<AcaoDaLinha, keyof Previa['totais']>;

const plural = (quantos: number, um: string, varios: string) =>
  `${quantos} ${quantos === 1 ? um : varios}`;

/** O que a importação grava, em texto, para a confirmação. */
function oQueGrava(totais: Previa['totais']): string[] {
  const grava = [
    totais.novos > 0 && plural(totais.novos, 'ativo novo', 'ativos novos'),
    totais.alterados > 0 && plural(totais.alterados, 'ativo alterado', 'ativos alterados'),
  ].filter(Boolean);
  const frases = [`${grava.join(' e ')}.`];
  if (totais.comErro === 1) frases.push('A linha com erro fica de fora.');
  if (totais.comErro > 1) frases.push(`As ${totais.comErro} linhas com erro ficam de fora.`);
  return frases;
}

/** A linha da prévia como a lista mostra: a ação em texto e o ativo pelo nome e pelo patrimônio. */
const naLista = (linha: LinhaDaPreviaDaApi) => ({
  linha: linha.linha,
  acao: acaoDaLinha(linha.acao),
  ativo: linha.ativo
    ? [linha.ativo.rotulo, linha.ativo.patrimonio].filter(Boolean).join(' · ')
    : null,
  mudancas: linha.mudancas,
  seguros: linha.seguros,
  erros: linha.erros,
});

/**
 * O rascunho de uma importação (spec importacao-de-ativos, "Colunas da planilha" e "Prévia linha a
 * linha"): o campo de cada coluna, com os primeiros valores dela, conferido antes de enviar; a
 * prévia, com os totais e o filtro por ação; "Importar", que confirma os totais e põe a importação
 * na fila; e "Descartar".
 */
export function RascunhoDaImportacao({ importacao }: { importacao: Importacao }) {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const [filtro, definirFiltro] = useState<Filtro>('todas');
  const [mapeamento, definirMapeamento] = useState(() =>
    importacao.colunas.map((coluna) => coluna.campo),
  );
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [salvando, definirSalvando] = useState(false);
  const [confirmando, definirConfirmando] = useState(false);
  const [aplicando, definirAplicando] = useState(false);
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);
  const previa = usePrevia(importacao.id, filtro === 'todas' ? null : filtro);
  const totais = previa.data?.pages[0]?.totais;
  const linhasDaPrevia = previa.data?.pages.flatMap((pagina) => pagina.linhas) ?? [];

  async function escolher(posicao: number, campo: string | null) {
    const novo = mapeamento.map((atual, i) => (i === posicao ? campo : atual));
    definirMapeamento(novo);
    const conferido = conferirMapeamento(novo, importacao.colunas.length, importacao.campos);
    if (!conferido.ok) {
      definirErros(conferido.erros);
      return;
    }
    definirErros({});
    definirSalvando(true);
    const resultado = await pedir(
      () =>
        api.PUT('/ativos/importacoes/{id}/colunas', {
          params: { path: { id: importacao.id } },
          body: { colunas: novo },
        }),
      'guardar as colunas',
    );
    definirSalvando(false);
    if ('erro' in resultado) {
      definirErros(resultado.problema?.campos ?? { colunas: resultado.erro });
      return;
    }
    consultas.setQueryData(chaveDaImportacao(importacao.id), resultado.dados);
    void consultas.invalidateQueries({ queryKey: [...chaveDaImportacao(importacao.id), 'previa'] });
  }

  async function importar(fechar: () => void) {
    definirAplicando(true);
    definirFalha(null);
    const resultado = await pedir(
      () =>
        api.POST('/ativos/importacoes/{id}/aplicacao', {
          params: { path: { id: importacao.id } },
        }),
      'pôr a importação na fila',
    );
    definirAplicando(false);
    if ('erro' in resultado) {
      definirFalha((anterior) => ({ texto: resultado.erro, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    fechar();
    consultas.setQueryData(chaveDaImportacao(importacao.id), resultado.dados);
    void consultas.invalidateQueries({ queryKey: [...CHAVE_DAS_IMPORTACOES, 'lista'] });
    avisar({ situacao: 'sucesso', titulo: 'Importação na fila.' });
  }

  async function descartar() {
    const resultado = await pedir(
      () => api.DELETE('/ativos/importacoes/{id}', { params: { path: { id: importacao.id } } }),
      'descartar a importação',
    );
    if ('erro' in resultado) return { erro: resultado.erro };
    void consultas.invalidateQueries({ queryKey: CHAVE_DAS_IMPORTACOES });
    avisar({ situacao: 'sucesso', titulo: 'Importação descartada.' });
    void navegar({ to: '/gestao/importacoes', replace: true });
    return { ok: true } as const;
  }

  const opcoes = [
    { id: IGNORAR, rotulo: 'Ignorar' },
    ...importacao.campos.map((campo) => ({
      id: campo.chave,
      rotulo: campo.restrito ? `${campo.rotulo} (restrito)` : campo.rotulo,
    })),
  ];
  const semGravar = totais ? totais.novos + totais.alterados === 0 : true;
  const errosDasColunas = Object.keys(erros).length > 0;

  return (
    <>
      <section className={estilosDosAtivos.tela} aria-labelledby="colunas-da-importacao">
        <h2 id="colunas-da-importacao" className={estilos.titulo}>
          Colunas
        </h2>
        <p className={estilosDosAtivos.contagem}>
          Escolha o campo de cada coluna da planilha. A coluna em "Ignorar" não é importada.
        </p>
        <fieldset aria-label="Colunas" className={estilos.colunas}>
          {importacao.colunas.map((coluna, posicao) => (
            <Selecao
              // biome-ignore lint/suspicious/noArrayIndexKey: a posição é a coluna: a planilha não muda.
              key={posicao}
              rotulo={coluna.titulo}
              descricao={
                coluna.exemplos.length > 0 ? `Ex.: ${coluna.exemplos.join(', ')}` : 'Coluna vazia'
              }
              opcoes={opcoes}
              selectedKey={mapeamento[posicao] ?? IGNORAR}
              onSelectionChange={(chave) =>
                void escolher(posicao, chave === IGNORAR ? null : String(chave))
              }
              erro={erros[`colunas.${posicao}`]}
              isDisabled={salvando}
            />
          ))}
        </fieldset>
        {erros.colunas && <MensagemDoPasso texto={erros.colunas} chave={0} />}
      </section>

      <section className={estilosDosAtivos.tela} aria-labelledby="previa-da-importacao">
        <h2 id="previa-da-importacao" className={estilos.titulo}>
          Prévia
        </h2>
        {previa.isError && !previa.data ? (
          <EstadoVazio
            titulo={previa.error.message}
            acao={<Botao onPress={() => void previa.refetch()}>Tentar de novo</Botao>}
          />
        ) : !totais ? (
          <p role="status" className={estilosDosAtivos.contagem}>
            Conferindo as linhas…
          </p>
        ) : (
          <>
            <p className={estilosDosAtivos.contagem}>
              {linhas(importacao.linhas)}: {totaisEmTexto(totais)}
            </p>
            <ControleSegmentado
              rotulo="Mostrar"
              value={filtro}
              onChange={(valor) => definirFiltro(valor as Filtro)}
            >
              <Segmento value="todas">Todas ({importacao.linhas})</Segmento>
              {(Object.keys(TOTAL_DO_FILTRO) as AcaoDaLinha[]).map((acao) => (
                <Segmento key={acao} value={acao}>
                  {ROTULOS_DAS_ACOES_DA_LINHA[acao]} ({totais[TOTAL_DO_FILTRO[acao]]})
                </Segmento>
              ))}
            </ControleSegmentado>
            <PreviaDaImportacao
              rotulo="Prévia da importação"
              linhas={linhasDaPrevia.map(naLista)}
              vazio="Nenhuma linha com esta ação."
              aoCarregarMais={previa.hasNextPage ? () => void previa.fetchNextPage() : undefined}
              carregandoMais={previa.isFetchingNextPage}
            />
          </>
        )}
      </section>

      <div className={estilos.acoes}>
        <Dialogo
          alerta
          titulo={`Importar ${importacao.nomeDoArquivo}?`}
          gatilho={
            <Botao nivel="primario" isDisabled={semGravar || salvando || errosDasColunas}>
              Importar
            </Botao>
          }
          aberto={confirmando}
          aoMudarAberto={(abrir) => {
            definirConfirmando(abrir);
            definirFalha(null);
          }}
          acoes={(fechar) => (
            <>
              <Botao onPress={fechar}>Cancelar</Botao>
              <Botao
                nivel="primario"
                carregando={aplicando}
                rotuloCarregando="Pondo na fila"
                onPress={() => void importar(fechar)}
              >
                Importar
              </Botao>
            </>
          )}
        >
          {totais && oQueGrava(totais).map((frase) => <p key={frase}>{frase}</p>)}
          <p>
            A importação roda na fila: você pode sair desta tela e acompanhar pela lista das
            importações.
          </p>
          <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
        </Dialogo>
        {semGravar && totais && (
          <span className={estilos.detalhes}>Nenhuma linha para gravar.</span>
        )}
        <div className={estilos.acoesDestrutivas}>
          <Confirmacao
            acao="Descartar"
            titulo="Descartar a importação?"
            confirmando="Descartando"
            fazer={descartar}
          >
            <p>A planilha sai do Grafite, e nada é importado.</p>
          </Confirmacao>
        </div>
      </div>
    </>
  );
}
