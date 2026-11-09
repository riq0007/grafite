import { TituloDaJanela } from '../casca/Casca.tsx';
import { Botao } from '../componentes/botao/Botao.tsx';
import { Esqueleto } from '../componentes/exibicao/Esqueleto.tsx';
import { EstadoVazio } from '../componentes/exibicao/EstadoVazio.tsx';
import { MiniaturaDeAtivo } from '../componentes/miniatura/MiniaturaDeAtivo.tsx';
import {
  NOMES_DAS_SITUACOES,
  RotuloDeSituacao,
} from '../componentes/situacao/RotuloDeSituacao.tsx';
import {
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  CorpoDaTabela,
  Linha,
  Tabela,
} from '../componentes/tabela/Tabela.tsx';
import estilos from './OQueResolverAgora.module.css';
import {
  type FonteDeOcorrenciasNaTela,
  idadeRelativa,
  type OcorrenciaAberta,
  type OrdenacaoDasOcorrencias,
  ordenarOcorrencias,
} from './ocorrencias.ts';

export interface PropsDoOQueResolverAgora {
  /** As fontes de ocorrências dos módulos, cada uma com o estado da sua busca. */
  fontes: readonly FonteDeOcorrenciasNaTela[];
  ordenacao: OrdenacaoDasOcorrencias;
  /** O usuário ordenou por um cabeçalho: o app guarda a escolha. */
  aoOrdenar: (ordenacao: OrdenacaoDasOcorrencias) => void;
  /** O momento de referência da coluna Há; o app o avança na virada do minuto. */
  agora: Date;
  /** Clique ou Enter na linha: o endereço do registro. */
  aoAbrir: (destino: string) => void;
  aoTentarDeNovo: (idDaFonte: string) => void;
}

/** Uma ocorrência na tabela, com a chave única entre as fontes. */
type LinhaDaOcorrencia = OcorrenciaAberta & { chave: string };

const contagem = (abertas: number) => (abertas === 1 ? '1 aberta' : `${abertas} abertas`);

/**
 * "O que resolver agora" (spec tela-inicial): as ocorrências abertas dos módulos, na tabela base,
 * com a miniatura do ativo e a severidade em texto. Enquanto uma fonte responde, o esqueleto fica
 * no lugar das linhas dela; a falha de uma fonte aparece com "Tentar de novo", sem esconder as
 * outras. Nada é inventado: sem fontes, ou sem nada aberto, a tela diz isso.
 */
export function OQueResolverAgora({
  fontes,
  ordenacao,
  aoOrdenar,
  agora,
  aoAbrir,
  aoTentarDeNovo,
}: PropsDoOQueResolverAgora) {
  const prontas: LinhaDaOcorrencia[] = fontes.flatMap((fonte) =>
    fonte.estado.tipo === 'pronta'
      ? fonte.estado.ocorrencias.map((ocorrencia) => ({
          ...ocorrencia,
          chave: `${fonte.id}/${ocorrencia.id}`,
        }))
      : [],
  );
  const linhas = ordenarOcorrencias(prontas, ordenacao) as LinhaDaOcorrencia[];
  const carregando = fontes.some((fonte) => fonte.estado.tipo === 'carregando');
  const falhas = fontes.filter((fonte) => fonte.estado.tipo === 'erro');
  const destinos = new Map(linhas.map((linha) => [linha.chave, linha.destino]));

  return (
    <>
      <TituloDaJanela>
        O que resolver agora
        {!carregando && linhas.length > 0 && (
          <>
            {' '}
            <span className={estilos.contagem}>{contagem(linhas.length)}</span>
          </>
        )}
      </TituloDaJanela>
      {fontes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum módulo registra ocorrências ainda"
          descricao="As ocorrências abertas aparecem aqui, por severidade e idade, quando os módulos de ativos e de alertas entrarem no Grafite."
        />
      ) : (
        <section
          aria-label="Ocorrências abertas"
          aria-busy={carregando || undefined}
          className={estilos.ocorrencias}
        >
          {falhas.map((fonte) => (
            <div key={fonte.id} className={estilos.falha}>
              <p className={estilos.textoDaFalha}>
                Não foi possível carregar as ocorrências de {fonte.modulo}.
              </p>
              <Botao onPress={() => aoTentarDeNovo(fonte.id)}>Tentar de novo</Botao>
            </div>
          ))}
          {linhas.length > 0 && (
            <Tabela
              rotulo="Ocorrências abertas"
              ordenacao={ordenacao}
              aoOrdenar={(nova) => aoOrdenar(nova as OrdenacaoDasOcorrencias)}
              aoAbrirLinha={(chave) => {
                const destino = destinos.get(chave);
                if (destino) aoAbrir(destino);
              }}
            >
              <CabecalhoDaTabela>
                <ColunaDaMiniatura />
                <Coluna id="ativo" principal ordenavel>
                  Ativo
                </Coluna>
                <Coluna id="ocorrencia" ordenavel>
                  Ocorrência
                </Coluna>
                <Coluna id="ha" ordenavel>
                  Há
                </Coluna>
                <Coluna id="severidade" ordenavel>
                  Severidade
                </Coluna>
              </CabecalhoDaTabela>
              <CorpoDaTabela itens={linhas}>
                {(linha) => (
                  <Linha id={linha.chave}>
                    <CelulaDaMiniatura>
                      <MiniaturaDeAtivo
                        tipo={linha.ativo.tipo}
                        imagemDoAtivo={linha.ativo.imagemDoAtivo}
                        imagemDoModelo={linha.ativo.imagemDoModelo}
                      />
                    </CelulaDaMiniatura>
                    <Celula>{linha.ativo.nome}</Celula>
                    <Celula>{linha.texto}</Celula>
                    <Celula>
                      <time className="mono" dateTime={linha.desde.toISOString()}>
                        {idadeRelativa(linha.desde, agora)}
                      </time>
                    </Celula>
                    <Celula>
                      <RotuloDeSituacao situacao={linha.severidade}>
                        {NOMES_DAS_SITUACOES[linha.severidade]}
                      </RotuloDeSituacao>
                    </Celula>
                  </Linha>
                )}
              </CorpoDaTabela>
            </Tabela>
          )}
          {carregando && (
            <div className={estilos.esqueleto}>
              <span className={estilos.somenteLeitor}>Carregando ocorrências</span>
              {[1, 2, 3].map((posicao) => (
                <div key={posicao} className={estilos.linhaDoEsqueleto}>
                  <Esqueleto
                    forma="bloco"
                    largura="var(--tamanho-miniatura)"
                    altura="var(--tamanho-miniatura)"
                  />
                  <Esqueleto largura="30%" />
                  <Esqueleto largura="40%" />
                </div>
              ))}
            </div>
          )}
          {!carregando && linhas.length === 0 && falhas.length === 0 && (
            <EstadoVazio titulo="Nenhuma ocorrência aberta." />
          )}
        </section>
      )}
    </>
  );
}
