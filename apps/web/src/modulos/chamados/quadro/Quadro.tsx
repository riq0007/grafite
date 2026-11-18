// Quem está com o quê (spec modulo-chamados, "Quem está com o quê"; spec chamados, "Carga de cada
// pessoa"; change chamados-da-ti, design, decisão 22, mockup m01): a triagem, uma coluna por pessoa
// da TI e a de quem não atende mais, com os quadrados pelo vencimento. O quadro dá as colunas e os
// números; a lista dos prazos completa cada quadrado. Os dois pedidos andam cada um no seu tempo, e
// o número que a lista ainda não trouxe fica só com o número. A falha de uma releitura vai acima das
// colunas, que ficam com a última leitura; sem as colunas, a falha fica no lugar delas.
import type { HorarioDaTi } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  Icone,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { CircleAlert, Info } from 'lucide-react';
import { type ReactNode, useId, useMemo } from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import {
  type ChamadoNosPrazos,
  type ColunaDoQuadro,
  type QuadroDosChamados,
  usePrazosDosChamados,
  useQuadroDosChamados,
} from '../consultas.ts';
import {
  BandejaDaTriagem,
  IconeDoTipo,
  PrazoEmTexto,
  SiglaDaPessoa,
  TextoComMedidas,
} from '../Pecas.tsx';
import { type ContarOPrazo, contadorDoPrazo } from '../prazo.ts';
import estilos from './Quadro.module.css';
import {
  abertosNoQuadro,
  chaveDaColuna,
  listaPorNumero,
  type Quadrado,
  quadradosDaColuna,
  textoDaCarga,
  textoDaTriagem,
  textoDoMaisAntigo,
  textoDosAbertos,
  textoDosResolvidosHoje,
} from './quadro.ts';

const TITULO = 'Quem está com o quê';

export function Quadro() {
  const quadro = useQuadroDosChamados();
  const prazos = usePrazosDosChamados();
  // Um relógio só: a idade do mais antigo e o prazo de cada quadrado viram no mesmo minuto.
  const agora = useAgora();
  const { fuso } = useDataHora();
  const contar = useMemo(() => contadorDoPrazo(agora, fuso), [agora, fuso]);

  const falha = quadro.isError ? quadro.error : prazos.isError ? prazos.error : null;
  const relendo = quadro.isFetching || prazos.isFetching;
  const tentarDeNovo = (
    <Botao
      carregando={relendo}
      rotuloCarregando="Tentando de novo"
      onPress={() => {
        if (quadro.isError) void quadro.refetch();
        if (prazos.isError) void prazos.refetch();
      }}
    >
      Tentar de novo
    </Botao>
  );
  // As colunas só com os dois pedidos na mão; o selo dos abertos entra com elas.
  const naTela = quadro.data && prazos.data ? { quadro: quadro.data, prazos: prazos.data } : null;

  let conteudo: ReactNode;
  if (naTela) {
    // A falha de uma releitura vai acima das colunas, que ficam com a última leitura.
    conteudo = (
      <>
        {falha && (
          <div role="alert" className={estilos.falhaAoReler}>
            <Icone icone={CircleAlert} tamanho={14} />
            <p>{`${falha.message} As colunas mostram a última leitura.`}</p>
            {tentarDeNovo}
          </div>
        )}
        <Colunas
          quadro={naTela.quadro}
          chamados={naTela.prazos.chamados}
          horario={naTela.prazos.horario}
          agora={agora}
          contar={contar}
          relendo={relendo}
        />
      </>
    );
  } else if (falha) {
    conteudo = <EstadoVazio className={estilos.falha} titulo={falha.message} acao={tentarDeNovo} />;
  } else {
    conteudo = (
      <p role="status" className={estilos.carregando}>
        Carregando os chamados…
      </p>
    );
  }

  return (
    <div className={estilos.tela} data-janela-inteira="">
      <CabecalhoDaPagina
        titulo={TITULO}
        selos={
          naTela && (
            <RotuloDeSituacao situacao="neutra" semIcone>
              {textoDosAbertos(abertosNoQuadro(naTela.quadro))}
            </RotuloDeSituacao>
          )
        }
      />
      {conteudo}
    </div>
  );
}

interface DaTela {
  agora: Date;
  /** Um dos dois pedidos é relido: o quadrado sem os detalhes diz "Carregando…". */
  relendo: boolean;
}

function Colunas({
  quadro,
  chamados,
  horario,
  agora,
  contar,
  relendo,
}: DaTela & {
  quadro: QuadroDosChamados;
  chamados: ChamadoNosPrazos[];
  horario: HorarioDaTi;
  contar: ContarOPrazo;
}) {
  const lista = useMemo(() => listaPorNumero({ chamados }), [chamados]);
  const quadradosDe = (numeros: number[]) => quadradosDaColuna(numeros, { lista, horario, contar });
  return (
    <>
      {quadro.contandoSoOsLocaisQueVe && (
        <p className={estilos.aviso}>
          <Icone icone={Info} tamanho={14} />
          Contando só os chamados dos locais que você vê.
        </p>
      )}
      <div className={estilos.colunas}>
        <ColunaDaTriagem
          triagem={quadro.triagem}
          quadrados={quadradosDe(quadro.triagem.abertos)}
          agora={agora}
          relendo={relendo}
        />
        {quadro.colunas.map((coluna) => (
          <ColunaDaPessoa
            key={chaveDaColuna(coluna)}
            coluna={coluna}
            quadrados={quadradosDe(coluna.abertos)}
            agora={agora}
            relendo={relendo}
          />
        ))}
      </div>
    </>
  );
}

/**
 * "3 na triagem · mais antigo #1038, há 6 h": um embaixo do outro, como no mockup, com o "·" só para
 * o leitor de tela.
 */
function Contagem({
  abertos,
  maisAntigo,
  agora,
}: {
  abertos: string;
  maisAntigo: { numero: number; abertoEm: string } | null;
  agora: Date;
}) {
  return (
    <p className={estilos.contagem} data-parte="contagem">
      <span className={estilos.linha}>{abertos}</span>
      {maisAntigo && (
        <>
          <span className={estilos.oculto}> · </span>
          <span className={estilos.linha}>
            <TextoComMedidas texto={textoDoMaisAntigo(maisAntigo, agora)} />
          </span>
        </>
      )}
    </p>
  );
}

function ColunaDaTriagem({
  triagem,
  quadrados,
  agora,
  relendo,
}: DaTela & { triagem: QuadroDosChamados['triagem']; quadrados: Quadrado[] }) {
  const id = useId();
  return (
    <section className={estilos.coluna} data-coluna="triagem" data-triagem="" aria-labelledby={id}>
      <header className={estilos.cabecalho}>
        <BandejaDaTriagem />
        <div className={estilos.quem}>
          <h2 id={id} className={estilos.nome}>
            Sem responsável
          </h2>
          <Contagem
            abertos={textoDaTriagem(triagem.abertos.length)}
            maisAntigo={triagem.maisAntigo}
            agora={agora}
          />
        </div>
      </header>
      <Quadrados quadrados={quadrados} relendo={relendo} />
    </section>
  );
}

function ColunaDaPessoa({
  coluna,
  quadrados,
  agora,
  relendo,
}: DaTela & { coluna: ColunaDoQuadro; quadrados: Quadrado[] }) {
  const id = useId();
  const carga = textoDaCarga(coluna.abertos.length, coluna.pedacos.total);
  return (
    <section className={estilos.coluna} data-coluna={chaveDaColuna(coluna)} aria-labelledby={id}>
      <header className={estilos.cabecalho}>
        <SiglaDaPessoa conta={coluna.conta} nome={coluna.nome} />
        <div className={estilos.quem}>
          <h2 id={id} className={estilos.nome}>
            {coluna.nome}
            {coluna.naoAtendeMais && (
              <>
                <span className={estilos.oculto}> · </span>
                <span className={estilos.naoAtendeMais}>não atende mais os chamados</span>
              </>
            )}
          </h2>
          <Contagem
            abertos={textoDosAbertos(coluna.abertos.length)}
            maisAntigo={coluna.maisAntigo}
            agora={agora}
          />
        </div>
        <span className={estilos.carga} role="img" aria-label={carga} title={carga}>
          {Array.from({ length: coluna.pedacos.total }, (_, indice) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o lugar do pedaço na barra.
            <span key={indice} data-cheio={indice < coluna.pedacos.cheios ? '' : undefined} />
          ))}
        </span>
      </header>
      <Quadrados quadrados={quadrados} relendo={relendo} />
      <p className={estilos.pe}>{textoDosResolvidosHoje(coluna.resolvidosHoje)}</p>
    </section>
  );
}

function Quadrados({ quadrados, relendo }: { quadrados: Quadrado[]; relendo: boolean }) {
  if (quadrados.length === 0) return null;
  return (
    <ul className={estilos.quadrados}>
      {quadrados.map(({ numero, chamado, situacao }) => (
        <li key={numero} className={estilos.quadrado}>
          <span className={estilos.alto}>
            {chamado && <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} />}
            <span className={estilos.numero}>{`#${numero}`}</span>
          </span>
          {chamado ? (
            <>
              <span className={estilos.titulo}>{chamado.titulo}</span>
              <PrazoEmTexto situacao={situacao} forma="curta" />
            </>
          ) : (
            <span className={estilos.semDetalhes}>
              {relendo ? 'Carregando…' : 'Detalhes não carregados'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
