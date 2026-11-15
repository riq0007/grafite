// O assistente da distribuição (spec distribuicao-de-software, "Distribuição às máquinas"; change
// software-por-pacote, design, decisão 10; m03 a m05 e m08): o trilho dos quatro passos à esquerda,
// com o que já saiu hoje; o passo no centro; e o "Até agora" à direita, com a conta da prévia. Nada é
// enviado antes do último passo, e o passo feito volta pelo trilho.
import { explicarOComando } from '@grafite/domain';
import { Botao, Carimbo, Icone, RotuloDeSituacao, type Situacao, useDataHora } from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, Info, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import estilos from './Assistente.module.css';
import {
  ALVO_VAZIO,
  type AlvoDoAssistente,
  alvoEscolhido,
  type MaquinaDaPrevia,
  type PacoteDeSoftware,
  type PreviaDaDistribuicao,
  useDistribuicoes,
  usePacotes,
  usePrevia,
} from './consultas.ts';
import { nomeComVersao, plural, tipoETamanho } from './formatos.ts';
import { PassoDasMaquinas } from './PassoDasMaquinas.tsx';
import { PassoDoPacote } from './PassoDoPacote.tsx';
import { IconeDoPacote } from './Pecas.tsx';

export type Passo = 1 | 2 | 3 | 4;

const PASSOS = ['Pacote', 'Máquinas', 'Quando', 'Conferir'] as const;

/** O pacote que vem no endereço, como o "Distribuir este pacote" da ficha manda. */
export const lerPedidoDoAssistente = (busca: Record<string, unknown>): { pacote?: string } =>
  typeof busca.pacote === 'string' && busca.pacote !== '' ? { pacote: busca.pacote } : {};

/** "Financeiro, 18 máquinas"; só "12 máquinas", sem local; e o nome, quando é uma máquina só. */
function paraQuemComTotal(paraQuem: string, total: number): string {
  const maquinas = plural(total, 'máquina', 'máquinas');
  return total === 1 || paraQuem === maquinas ? paraQuem : `${paraQuem}, ${maquinas}`;
}

/** O texto debaixo do número do "Até agora": de onde vêm as máquinas escolhidas. */
function textoDoTotal(paraQuem: string, total: number): string {
  if (total === 1) return `máquina escolhida: ${paraQuem}`;
  if (paraQuem === plural(total, 'máquina', 'máquinas')) return 'máquinas escolhidas';
  if (/^\d+ locais$/.test(paraQuem)) return `máquinas escolhidas, de ${paraQuem}`;
  return `máquinas escolhidas, do local ${paraQuem}`;
}

export function NovaDistribuicao() {
  const { pacote: doEndereco } = useSearch({ from: '/gestao/software/distribuicoes/nova' });
  const navegar = useNavigate();
  const { fuso } = useDataHora();
  const pacotes = usePacotes();
  const [passo, definirPasso] = useState<Passo>(doEndereco ? 2 : 1);
  const [pacoteId, definirPacoteId] = useState<string | null>(doEndereco ?? null);
  const [alvo, definirAlvo] = useState<AlvoDoAssistente>(ALVO_VAZIO);
  // As máquinas tiradas da lista uma a uma, que a prévia não devolve mais: ficam à vista, desmarcadas.
  const [tiradas, definirTiradas] = useState<ReadonlyMap<string, MaquinaDaPrevia>>(new Map());
  const ativos = (pacotes.data?.pacotes ?? []).filter((um) => um.situacao === 'ativo');
  const pacote = ativos.find((um) => um.id === pacoteId) ?? null;
  const previa = usePrevia(pacote?.id ?? null, alvo, fuso);
  // O pacote do endereço que não está entre os ativos manda de volta ao primeiro passo.
  const atual: Passo = passo > 1 && !pacotes.isPending && !pacote ? 1 : passo;
  const escolheu = alvoEscolhido(alvo);
  const conta = escolheu ? previa.data : undefined;

  const subs = [
    pacote ? nomeComVersao(pacote) : 'O que instalar',
    atual > 2 && conta
      ? paraQuemComTotal(conta.paraQuem, conta.maquinas.length)
      : 'Por local, visão ou busca',
    'Agora ou na janela da noite',
    'O que vai acontecer',
  ];
  const seguir =
    atual === 1
      ? { texto: 'Máquinas', pode: pacote !== null }
      : {
          texto: 'Quando instalar',
          pode: conta !== undefined && conta.conta.vaoInstalar + conta.conta.naFila > 0,
        };

  return (
    <div className={estilos.assistente}>
      <Trilho
        passo={atual}
        subs={subs}
        nota="Nada é enviado antes do passo 4. Você pode voltar a qualquer passo."
        aoVoltar={definirPasso}
      />
      <div className={estilos.centro}>
        {atual === 1 ? (
          <PassoDoPacote
            pacotes={ativos}
            carregando={pacotes.isPending}
            falha={pacotes.isError ? pacotes.error.message : null}
            escolhido={pacote?.id ?? null}
            aoEscolher={definirPacoteId}
          />
        ) : (
          <PassoDasMaquinas
            alvo={alvo}
            definirAlvo={definirAlvo}
            previa={conta}
            versaoAlvo={pacote?.versao ?? null}
            tiradas={tiradas}
            definirTiradas={definirTiradas}
          />
        )}
      </div>
      <AteAgora
        pacote={pacote}
        passo={atual}
        escolheu={escolheu}
        previa={conta}
        falha={escolheu && previa.isError ? previa.error.message : null}
        rodape={
          <>
            {atual === 1 ? (
              <Botao onPress={() => void navegar({ to: '/gestao/software/distribuicoes' })}>
                Cancelar
              </Botao>
            ) : (
              <Botao icone={ArrowLeft} onPress={() => definirPasso((atual - 1) as Passo)}>
                Voltar
              </Botao>
            )}
            <Botao
              nivel="primario"
              isDisabled={!seguir.pode}
              onPress={() => definirPasso((atual + 1) as Passo)}
              className={estilos.seguir}
            >
              {seguir.texto}
              <Icone icone={ArrowRight} />
            </Botao>
          </>
        }
      />
    </div>
  );
}

function Trilho({
  passo,
  subs,
  nota,
  aoVoltar,
}: {
  passo: Passo;
  subs: readonly string[];
  nota: string;
  aoVoltar: (passo: Passo) => void;
}) {
  const titulo = useId();
  return (
    <nav className={estilos.trilho} aria-labelledby={titulo}>
      <p id={titulo} className={estilos.tituloDoTrilho}>
        Nova distribuição
      </p>
      <ol className={estilos.passos}>
        {PASSOS.map((nome, indice) => {
          const numero = (indice + 1) as Passo;
          const estado = numero < passo ? 'feito' : numero === passo ? 'agora' : 'depois';
          const conteudo = (
            <>
              <span className={estilos.bola} aria-hidden="true">
                {estado === 'feito' ? <Icone icone={Check} /> : numero}
              </span>
              <span className={estilos.textoDoPasso}>
                <b>{nome}</b>
                <span>{subs[indice]}</span>
              </span>
            </>
          );
          return (
            <li
              key={nome}
              data-estado={estado}
              aria-current={estado === 'agora' ? 'step' : undefined}
            >
              {estado === 'feito' ? (
                <button type="button" className={estilos.passo} onClick={() => aoVoltar(numero)}>
                  {conteudo}
                  <span className={estilos.oculto}>, feito. Voltar a este passo.</span>
                </button>
              ) : (
                <div className={estilos.passo}>{conteudo}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className={estilos.peDoTrilho}>
        <JaEnviadoHoje />
        <p className={estilos.notaDoTrilho}>{nota}</p>
      </div>
    </nav>
  );
}

/** As distribuições que saíram hoje, as mais novas primeiro, para não mandar o mesmo duas vezes. */
function JaEnviadoHoje() {
  const distribuicoes = useDistribuicoes();
  const { formatarHora, grupoDoDia } = useDataHora();
  const agora = new Date();
  const deHoje = (distribuicoes.data?.distribuicoes ?? [])
    .filter((distribuicao) => grupoDoDia(new Date(distribuicao.criadaEm), agora) === 'Hoje')
    .slice(0, 3);
  if (deHoje.length === 0) return null;
  return (
    <div className={estilos.hoje}>
      <p className={estilos.legendaForte}>Já enviado hoje</p>
      <ul>
        {deHoje.map((distribuicao) => (
          <li key={distribuicao.id}>
            <b>
              {nomeComVersao(distribuicao.pacote)}, {distribuicao.paraQuem}
            </b>
            <span>
              <span className={estilos.mono}>{formatarHora(new Date(distribuicao.criadaEm))}</span>
              {` · ${distribuicao.progresso}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AteAgora({
  pacote,
  passo,
  escolheu,
  previa,
  falha,
  rodape,
}: {
  pacote: PacoteDeSoftware | null;
  passo: Passo;
  escolheu: boolean;
  previa: PreviaDaDistribuicao | undefined;
  falha: string | null;
  rodape: ReactNode;
}) {
  const titulo = useId();
  return (
    <aside className={estilos.ateAgora} aria-labelledby={titulo}>
      <Carimbo id={titulo}>Até agora</Carimbo>
      {pacote ? (
        <CartaoDoPacote pacote={pacote} />
      ) : (
        <p className={estilos.nota}>
          {passo === 1 ? 'Escolha o pacote ao lado.' : 'Carregando o pacote…'}
        </p>
      )}
      {passo > 1 && (
        <>
          <hr className={estilos.separador} />
          {!escolheu ? (
            <p className={estilos.nota}>Marque locais, visões ou máquinas ao lado.</p>
          ) : falha ? (
            <p role="alert" className={estilos.nota}>
              {falha}
            </p>
          ) : !previa ? (
            <p role="status" className={estilos.nota}>
              Contando as máquinas…
            </p>
          ) : (
            <Conta previa={previa} versaoAlvo={pacote?.versao ?? null} />
          )}
        </>
      )}
      <div className={estilos.rodape}>{rodape}</div>
    </aside>
  );
}

/** O pacote escolhido, com o tipo, o tamanho e o que a instalação faz ("instala sem perguntar"). */
function CartaoDoPacote({ pacote }: { pacote: PacoteDeSoftware }) {
  const { resumo } = explicarOComando(pacote.comando);
  return (
    <div className={estilos.pacote}>
      <IconeDoPacote nome={pacote.nome} tamanho="m" />
      <span className={estilos.textoDoPacote}>
        <b>{nomeComVersao(pacote)}</b>
        <span>
          {[tipoETamanho(pacote), resumo ? `instala ${resumo}` : null].filter(Boolean).join(' · ')}
        </span>
      </span>
    </div>
  );
}

/** A conta da prévia: quantas vão instalar, quantas já têm a versão-alvo e quantas vão para a fila. */
function Conta({
  previa,
  versaoAlvo,
}: {
  previa: PreviaDaDistribuicao;
  versaoAlvo: string | null;
}) {
  const { conta, maquinas, paraQuem } = previa;
  const total = maquinas.length;
  const linhas: { situacao: Situacao; texto: string; quantas: number }[] = [
    { situacao: 'sucesso', texto: 'Vão instalar', quantas: conta.vaoInstalar },
    {
      situacao: 'neutra',
      texto: versaoAlvo ? `Já têm a ${versaoAlvo} · puladas` : 'Puladas',
      quantas: conta.puladas,
    },
    { situacao: 'atencao', texto: 'Na fila', quantas: conta.naFila },
  ];
  const naFila = maquinas.filter((maquina) => maquina.classe === 'na-fila');
  const ocupadas = maquinas.filter((maquina) => maquina.emAndamento !== null);
  const [semContato] = naFila;
  const [ocupada] = ocupadas;
  return (
    <>
      <p className={estilos.total}>
        <span className={estilos.numeroGrande}>{total}</span>
        <span>{textoDoTotal(paraQuem, total)}</span>
      </p>
      {total === 0 ? (
        <p className={estilos.nota}>Nenhuma máquina com o agente do GLPI no que você marcou.</p>
      ) : (
        <dl className={estilos.quadro}>
          {linhas
            .filter(({ quantas }) => quantas > 0)
            .map(({ situacao, texto, quantas }) => (
              <div key={texto}>
                <dt>
                  <RotuloDeSituacao situacao={situacao} semIcone>
                    {texto}
                  </RotuloDeSituacao>
                </dt>
                <dd>{quantas}</dd>
              </div>
            ))}
        </dl>
      )}
      {semContato && (
        <Aviso tipo="atencao">
          {naFila.length === 1 ? (
            <>
              <b>
                {semContato.rotulo} sem contato
                {semContato.semContato
                  ? ` há ${plural(semContato.semContato.dias, 'dia', 'dias')}`
                  : ''}
                .
              </b>{' '}
              Ela entra na fila e instala quando voltar, ou você a tira da lista.
            </>
          ) : (
            <>
              <b>{naFila.length} máquinas sem contato.</b> Elas entram na fila e instalam quando
              voltarem, ou você as tira da lista.
            </>
          )}
        </Aviso>
      )}
      {ocupada?.emAndamento && (
        <Aviso tipo="info">
          {ocupadas.length === 1 ? (
            <>
              <b>
                {ocupada.rotulo} ainda instala o {ocupada.emAndamento.pacote}.
              </b>{' '}
              Este pacote entra na fila dela e instala em seguida.
            </>
          ) : (
            <>
              <b>{ocupadas.length} máquinas ainda instalam outro pacote.</b> Este entra na fila de
              cada uma e instala em seguida.
            </>
          )}
        </Aviso>
      )}
    </>
  );
}

function Aviso({ tipo, children }: { tipo: 'atencao' | 'info'; children: ReactNode }) {
  return (
    <div className={estilos.aviso} data-tipo={tipo}>
      <Icone icone={tipo === 'atencao' ? TriangleAlert : Info} />
      <p>{children}</p>
    </div>
  );
}
