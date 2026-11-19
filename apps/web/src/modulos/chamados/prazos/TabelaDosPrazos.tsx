// A lista dos prazos, nas três formas (spec modulo-chamados, "Prazos" e "Início dos chamados";
// change chamados-da-ti, design, "A lista dos prazos (tarefa 5.15)", "O painel dos prazos (tarefa
// 5.16)" e "O Início dos chamados (tarefa 5.17)"; mockups m05, m06 e m12): a cabeça das colunas, com
// a escala, as faixas dos grupos e os chamados, cada um com a barra até o prazo e o prazo em texto.
// A inteira e a compacta, a do painel aberto, são da tela dos prazos, em que a linha escolhe o
// chamado do painel; a do Início é a mais estreita, sem a linha de quem, e a linha é o link do
// chamado. A tabela mede a si mesma: abaixo da largura de cada forma, fica sem a escala e as barras.
import { Icone } from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { type CSSProperties, type ReactNode, useId } from 'react';
import { IconeDoTipo, PrazoEmTexto } from '../Pecas.tsx';
import {
  type BarraDoPrazo,
  barraDoPrazo,
  type GrupoDosPrazos,
  type LinhaDosPrazos,
  MARCAS_DA_ESCALA,
  marcasDaEscala,
  quemNaLinha,
  type Trecho,
} from './lista.ts';
import estilos from './TabelaDosPrazos.module.css';

/** A forma da lista: a da tela dos prazos, a compacta, com o painel aberto, e a do Início. */
export type FormaDaTabela = 'inteira' | 'compacta' | 'inicio';

/** O passo das marcas da escala de cada forma, em horas. */
const PASSO_DAS_MARCAS: Readonly<Record<FormaDaTabela, 2 | 4 | 8>> = {
  inteira: 2,
  compacta: 4,
  inicio: 8,
};

/** A posição do agora e quantos intervalos a escala tem, para a grade e a linha de cada trilha. */
const DA_ESCALA = {
  '--agora': `${MARCAS_DA_ESCALA.find(({ texto }) => texto === 'agora')?.posicao ?? 0}%`,
  '--intervalos': MARCAS_DA_ESCALA.length - 1,
} as CSSProperties;

/** A escolha do chamado do painel, na tela dos prazos. */
export interface EscolhaNaTabela {
  escolhido: number | null;
  idDoPainel: string;
  aoEscolher: (numero: number) => void;
}

interface DaTabela {
  forma: FormaDaTabela;
  /** O nível dos títulos dos grupos: 2 na tela dos prazos; 3 no Início, embaixo do da caixa. */
  nivel: 2 | 3;
  /** Sem ela, cada linha é o link do chamado. */
  escolha?: EscolhaNaTabela;
}

export function TabelaDosPrazos({
  grupos,
  forma,
  nivel = 2,
  escolha,
}: {
  grupos: readonly GrupoDosPrazos[];
  forma: FormaDaTabela;
  nivel?: 2 | 3;
  escolha?: EscolhaNaTabela;
}) {
  return (
    <div className={estilos.tabela} data-forma={forma}>
      <div className={estilos.lista} style={DA_ESCALA}>
        <CabecaDaLista forma={forma} />
        {grupos.map((grupo) => (
          <GrupoNaLista
            key={grupo.grupo}
            grupo={grupo}
            forma={forma}
            nivel={nivel}
            escolha={escolha}
          />
        ))}
      </div>
    </div>
  );
}

/** A cabeça das colunas, só desenho: cada linha diz o número, o chamado e o prazo em texto. */
function CabecaDaLista({ forma }: { forma: FormaDaTabela }) {
  return (
    <div className={estilos.cabecaDaLista} aria-hidden="true">
      <span>Nº</span>
      <span>Chamado</span>
      <span className={estilos.escala}>
        {marcasDaEscala(PASSO_DAS_MARCAS[forma]).map(({ texto, posicao }) => (
          <span
            key={texto}
            style={{ left: `${posicao}%` }}
            data-agora={texto === 'agora' || undefined}
          >
            {texto}
          </span>
        ))}
      </span>
      <span className={estilos.cabecaDoPrazo}>Prazo</span>
    </div>
  );
}

/** Um grupo numa faixa, com o título e o apoio, e os chamados dele. */
function GrupoNaLista({
  grupo: { grupo, titulo, apoio, linhas },
  ...daTabela
}: { grupo: GrupoDosPrazos } & DaTabela) {
  const idDoTitulo = useId();
  const Titulo = daTabela.nivel === 3 ? 'h3' : 'h2';
  return (
    <section aria-labelledby={idDoTitulo} className={estilos.grupo} data-grupo={grupo}>
      <div className={estilos.faixa}>
        <Titulo id={idDoTitulo}>{titulo}</Titulo>
        {apoio && <p>{apoio}</p>}
      </div>
      <ul className={estilos.linhas}>
        {linhas.map((linha) => (
          <LinhaDoPrazo key={linha.chamado.numero} linha={linha} {...daTabela} />
        ))}
      </ul>
    </section>
  );
}

/**
 * O chamado, com o número, o tipo, o título, quem, a barra e o prazo em texto: o botão que abre o
 * painel dele, na tela dos prazos, ou o link dele, no Início. Fora da inteira, o relógio parado fica
 * sem o "sem contagem de prazo"; no Início, sem a linha de quem.
 */
function LinhaDoPrazo({
  linha: { chamado, situacao },
  forma,
  escolha,
}: { linha: LinhaDosPrazos } & DaTabela) {
  const barra = situacao && barraDoPrazo(situacao);
  const conteudo: ReactNode = (
    <>
      <span className={estilos.numero}>#{chamado.numero}</span>
      <span className={estilos.chamado}>
        <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} />
        <span className={estilos.tituloEQuem}>
          <b>{chamado.titulo}</b>
          {forma !== 'inicio' && <span>{quemNaLinha(chamado)}</span>}
        </span>
      </span>
      <span className={estilos.trilha} data-sem-barra={barra ? undefined : ''} aria-hidden="true">
        {barra ? (
          <Barra barra={barra} />
        ) : (
          forma === 'inteira' && <span className={estilos.semContagem}>sem contagem de prazo</span>
        )}
      </span>
      <span className={estilos.prazo}>
        <PrazoEmTexto situacao={situacao} forma="inteira" />
      </span>
    </>
  );
  if (!escolha) {
    return (
      <li>
        <Link
          to="/chamados/$numero"
          params={{ numero: String(chamado.numero) }}
          className={estilos.linha}
          data-numero={chamado.numero}
        >
          {conteudo}
        </Link>
      </li>
    );
  }
  const aberto = escolha.escolhido === chamado.numero;
  return (
    <li>
      <button
        type="button"
        className={estilos.linha}
        aria-expanded={aberto}
        aria-controls={aberto ? escolha.idDoPainel : undefined}
        data-numero={chamado.numero}
        onClick={() => escolha.aoEscolher(chamado.numero)}
      >
        {conteudo}
      </button>
    </li>
  );
}

const noTrecho = ({ de, ate }: Trecho): CSSProperties => ({
  left: `${de}%`,
  width: `${ate - de}%`,
});

/** A barra até o prazo: o gasto, o que resta ou o estouro hachurado, a marca e a seta. */
function Barra({ barra }: { barra: BarraDoPrazo }) {
  return (
    <>
      <i className={estilos.gasto} data-tom={barra.tom} style={noTrecho(barra.gasto)} />
      {barra.resta && (
        <i className={estilos.resta} data-tom={barra.tom} style={noTrecho(barra.resta)} />
      )}
      {barra.estouro && <i className={estilos.estouro} style={noTrecho(barra.estouro)} />}
      <i className={estilos.marca} data-tom={barra.tom} style={{ left: `${barra.marca}%` }} />
      {barra.alemDaEscala && (
        <span className={estilos.alem}>
          <Icone icone={ArrowRight} tamanho={12} />
        </span>
      )}
    </>
  );
}
