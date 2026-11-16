// A distribuição aberta (spec distribuicao-de-software, "Histórico das distribuições"; changes
// distribuicao-de-software e software-por-pacote, m02): à esquerda, as distribuições do mesmo
// pacote, com a aberta em borda forte, e "Distribuir este pacote"; no centro, o "Para quem" e o
// momento, as concluídas em número grande com a régua, quantas máquinas ficam fora dos locais em
// que a conta distribui (design, decisão 16), o que precisa de alguém (as que falharam,
// com o código explicado e "Tentar de novo", ou o caminho até a outra distribuição em que a máquina
// já aguarda o pacote, decisão 11, e as sem contato, com "Tirar da fila"), a fila, as em
// andamento, as concluídas e as tiradas da fila, e "Exportar". O nome de cada máquina abre o log
// dela. O servidor acorda os agentes sozinho, pela fila; enquanto alguma máquina espera ou instala,
// a ficha se relê a cada 5 s.
import { explicarOComando } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  Carimbo,
  EstadoVazio,
  Gaveta,
  Icone,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronLeft,
  CircleCheck,
  CircleMinus,
  Download,
  PackageX,
  Rocket,
  RotateCw,
} from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import {
  CHAVE_DO_SOFTWARE,
  type FichaDaDistribuicao as Ficha,
  type MaquinaDaDistribuicao,
  useDistribuicao,
  usePacote,
} from './consultas.ts';
import { gravarCsv } from './csv.ts';
import dividida from './Dividida.module.css';
import estilos from './FichaDaDistribuicao.module.css';
import { momentoCurto, plural, textoDaOutra } from './formatos.ts';
import {
  BarraDeSituacoes,
  IconeDoPacote,
  type ResultadoDaDistribuicao,
  RotulosDoResultado,
} from './Pecas.tsx';
import doSoftware from './Software.module.css';

const nomeDaMaquina = (maquina: MaquinaDaDistribuicao) =>
  maquina.ativo.patrimonio
    ? `${maquina.ativo.rotulo} (${maquina.ativo.patrimonio})`
    : maquina.ativo.rotulo;

/** A parte do trilho de cada etapa do agente, na ordem em que ele as passa. */
const PARTE_DA_ETAPA: Record<string, number> = {
  Conferindo: 0.15,
  Baixando: 0.35,
  Preparando: 0.55,
  Executando: 0.75,
};

/** Quantas máquinas a distribuição tem em cada situação; as sem contato contam também em aguardando. */
function contar(maquinas: readonly MaquinaDaDistribuicao[]): ResultadoDaDistribuicao {
  const resultado = {
    concluidas: 0,
    emAndamento: 0,
    aguardando: 0,
    falharam: 0,
    tiradas: 0,
    semContato: 0,
  };
  for (const maquina of maquinas) {
    const chave = maquina.situacao.chave;
    if (chave === 'concluida') resultado.concluidas++;
    else if (chave === 'em-andamento') resultado.emAndamento++;
    else if (chave === 'falhou') resultado.falharam++;
    else if (chave === 'tirada') resultado.tiradas++;
    else {
      resultado.aguardando++;
      if (maquina.semContato) resultado.semContato++;
    }
  }
  return resultado;
}

/**
 * O log da máquina numa gaveta, como o agente mandou. Com o pacote inativado, a que aguarda diz
 * por que o agente não recebe a tarefa (design, decisão 17).
 */
function LogDaMaquina({
  maquina,
  pacoteInativo,
  aoFechar,
}: {
  maquina: MaquinaDaDistribuicao;
  pacoteInativo: boolean;
  aoFechar: () => void;
}) {
  const { formatarDataEHora } = useDataHora();
  const segurada = pacoteInativo && maquina.situacao.chave === 'aguardando';
  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={`Log de ${nomeDaMaquina(maquina)}`}
    >
      <div className={doSoftware.formulario}>
        <p className={doSoftware.nota}>
          {[
            maquina.situacao.texto,
            segurada ? 'pacote inativado' : null,
            maquina.etapa ? `etapa ${maquina.etapa}` : null,
            maquina.enviadaEm
              ? `enviada ao agente em ${formatarDataEHora(new Date(maquina.enviadaEm))}`
              : 'ainda não enviada ao agente',
            maquina.terminadaEm
              ? `terminou em ${formatarDataEHora(new Date(maquina.terminadaEm))}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {maquina.log.length === 0 ? (
          <EstadoVazio
            titulo="O agente ainda não mandou nenhum passo."
            descricao={
              segurada
                ? 'O pacote está inativado: o agente só recebe a tarefa depois de ele ser reativado.'
                : 'Ele pega a tarefa quando o pedido pode seguir, no contato seguinte com o Grafite.'
            }
          />
        ) : (
          <ol className={doSoftware.log} aria-label="Passos do agente">
            {maquina.log.map((linha, indice) => (
              // A mesma linha pode se repetir: a posição faz parte da chave.
              // biome-ignore lint/suspicious/noArrayIndexKey: o log só cresce no fim, na ordem.
              <li key={`${indice}-${linha}`}>{linha}</li>
            ))}
          </ol>
        )}
      </div>
    </Gaveta>
  );
}

/** A coluna da esquerda: o pacote, as distribuições dele e "Distribuir este pacote". */
function Lateral({ ficha }: { ficha: Ficha }) {
  const pacote = usePacote(ficha.pacote.id);
  const dataHora = useDataHora();
  const navegar = useNavigate();
  const agora = new Date();
  const dados = pacote.data?.pacote;
  return (
    <div className={dividida.lateral}>
      <Link to="/gestao/software" className={dividida.volta}>
        <Icone icone={ChevronLeft} tamanho={14} />
        Base de pacotes
      </Link>
      <Link
        to="/gestao/software/pacotes/$id"
        params={{ id: ficha.pacote.id }}
        className={estilos.pacote}
      >
        <IconeDoPacote nome={ficha.pacote.nome} tamanho="m" />
        <span>
          <b className={estilos.nomeDoPacote}>{ficha.pacote.nome}</b>
          <span>{ficha.pacote.versao ? `Versão ${ficha.pacote.versao}` : 'Sem versão-alvo'}</span>
        </span>
      </Link>
      <Carimbo>Distribuições</Carimbo>
      {pacote.isError ? (
        <p className={dividida.nota}>{pacote.error.message}</p>
      ) : (
        <ul className={estilos.distribuicoes} aria-label="Distribuições do pacote">
          {(pacote.data?.distribuicoes ?? []).map((distribuicao) => (
            <li key={distribuicao.id}>
              <Link
                to="/gestao/software/distribuicoes/$id"
                params={{ id: distribuicao.id }}
                className={estilos.distribuicao}
                aria-current={distribuicao.id === ficha.id ? 'page' : undefined}
              >
                <span className={estilos.linhaDaDistribuicao}>
                  <b>{distribuicao.paraQuem}</b>
                  <span className={estilos.mono}>
                    {momentoCurto(new Date(distribuicao.criadaEm), agora, dataHora)}
                  </span>
                </span>
                <RotulosDoResultado
                  compacto
                  maquinas={distribuicao.maquinas}
                  resultado={distribuicao.resultado}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className={dividida.pe}>
        <Botao
          nivel="primario"
          icone={Rocket}
          className={dividida.principal}
          isDisabled={dados?.situacao !== 'ativo'}
          onPress={() =>
            void navegar({
              to: '/gestao/software/distribuicoes/nova',
              search: { pacote: ficha.pacote.id },
            })
          }
        >
          Distribuir este pacote
        </Botao>
      </div>
    </div>
  );
}

/**
 * O título com o "Para quem" e o momento, e a linha com as máquinas, quem enviou, o quando e o
 * resumo do comando do pacote ("sem perguntar e sem reiniciar").
 */
function Cabecalho({ ficha, aoExportar }: { ficha: Ficha; aoExportar: () => void }) {
  const pacote = usePacote(ficha.pacote.id);
  const dataHora = useDataHora();
  const { formatarHora, formatarDia, grupoDoDia } = dataHora;
  const agora = new Date();
  const criadaEm = new Date(ficha.criadaEm);
  const quandoCriada =
    grupoDoDia(criadaEm, agora) === 'Hoje'
      ? `hoje às ${formatarHora(criadaEm)}`
      : `${momentoCurto(criadaEm, agora, dataHora)} às ${formatarHora(criadaEm)}`;
  const aPartirDe = ficha.quando.aPartirDe ? new Date(ficha.quando.aPartirDe) : null;
  const paraQuando =
    ficha.quando.chave === 'noite'
      ? ' para a janela da noite'
      : ficha.quando.chave === 'dia' && aPartirDe
        ? ` para ${formatarDia(aPartirDe)} às ${formatarHora(aPartirDe)}`
        : '';
  const resumo = pacote.data ? explicarOComando(pacote.data.pacote.comando).resumo : null;
  return (
    <CabecalhoDaPagina
      titulo={`${ficha.paraQuem}, ${quandoCriada}`}
      detalhe={`${plural(ficha.maquinas, 'máquina', 'máquinas')} · enviada por ${ficha.criadaPor}${paraQuando}${resumo ? `, ${resumo}` : ''}`}
      acoes={
        <Botao icone={Download} onPress={aoExportar}>
          Exportar
        </Botao>
      }
    />
  );
}

/** O nome da máquina, que abre o log dela. */
function NomeDaMaquina({
  maquina,
  aoAbrirLog,
}: {
  maquina: MaquinaDaDistribuicao;
  aoAbrirLog: (id: string) => void;
}) {
  return (
    <button type="button" className={estilos.nome} onClick={() => aoAbrirLog(maquina.id)}>
      {maquina.ativo.rotulo}
    </button>
  );
}

/** A tela da distribuição aberta. */
export function FichaDaDistribuicao() {
  const { id } = useParams({ from: '/gestao/software/distribuicoes/$id' });
  const distribuicao = useDistribuicao(id);
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const dataHora = useDataHora();
  const { formatarHora, formatarDia, formatarDataEHora } = dataHora;
  const [vendo, definirVendo] = useState<string | null>(null);
  const [ocupada, definirOcupada] = useState<string | null>(null);

  if (distribuicao.isPending) {
    return (
      <div className={dividida.espera}>
        <CabecalhoDaPagina titulo="Distribuição" />
        <p role="status" className={dividida.nota}>
          Carregando a distribuição…
        </p>
      </div>
    );
  }
  if (distribuicao.isError) {
    return (
      <div className={dividida.espera}>
        <CabecalhoDaPagina titulo="Distribuição" />
        <EstadoVazio
          titulo={distribuicao.error.message}
          acao={<Botao onPress={() => void distribuicao.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  const ficha = distribuicao.data;
  const maquinas = ficha.maquinasDaDistribuicao;
  const aberta = maquinas.find((maquina) => maquina.id === vendo);
  const contas = contar(maquinas);
  const hora = (momento: string | null) => (momento ? formatarHora(new Date(momento)) : null);

  const falharam = maquinas.filter(({ situacao }) => situacao.chave === 'falhou');
  const semContato = maquinas.filter(
    ({ situacao, semContato }) => situacao.chave === 'aguardando' && semContato,
  );
  const naFila = maquinas.filter(
    ({ situacao, semContato }) => situacao.chave === 'aguardando' && !semContato,
  );
  const emAndamento = maquinas.filter(({ situacao }) => situacao.chave === 'em-andamento');
  const concluidas = maquinas.filter(({ situacao }) => situacao.chave === 'concluida');
  const tiradas = maquinas.filter(({ situacao }) => situacao.chave === 'tirada');

  const aPartirDe = ficha.quando.aPartirDe ? new Date(ficha.quando.aPartirDe) : null;
  // O pacote inativado segura a fila até ser reativado, sem o "Tentar de novo" (decisão 17).
  const inativo = ficha.pacote.situacao === 'inativo';

  /**
   * Quando o pedido da máquina na fila segue, até quando o agente que não respondeu volta, ou o
   * pacote inativado, que segura a fila.
   */
  function textoDaFila(maquina: MaquinaDaDistribuicao): string {
    if (inativo) return 'Pacote inativado';
    const chamada = maquina.chamada;
    if (chamada && !chamada.respondeu) {
      const volta = hora(maquina.voltaAte);
      return `Não respondeu ao chamado das ${hora(chamada.em)}${volta ? `; o agente volta até ${volta}` : ''}`;
    }
    if (ficha.quando.chave === 'noite') return 'Segue na janela da noite, das 22:00 às 06:00';
    if (ficha.quando.chave === 'dia' && aPartirDe) {
      return `Segue a partir de ${formatarDia(aPartirDe)} às ${formatarHora(aPartirDe)}`;
    }
    return 'Segue no próximo contato do agente';
  }

  async function agir(maquina: MaquinaDaDistribuicao, acao: 'tentar-de-novo' | 'tirar-da-fila') {
    definirOcupada(maquina.id);
    const caminho = { params: { path: { id: ficha.id, maquinaId: maquina.id } } };
    const resultado = await pedir(
      () =>
        acao === 'tentar-de-novo'
          ? api.POST('/software/distribuicoes/{id}/maquinas/{maquinaId}/tentar-de-novo', caminho)
          : api.POST('/software/distribuicoes/{id}/maquinas/{maquinaId}/tirar-da-fila', caminho),
      acao === 'tentar-de-novo' ? 'tentar de novo' : 'tirar da fila',
    );
    definirOcupada(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo:
        acao === 'tentar-de-novo'
          ? `${maquina.ativo.rotulo} voltou a aguardar o agente.`
          : `${maquina.ativo.rotulo} saiu da fila.`,
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
  }

  /** A situação no CSV diz, como a tela, o pacote inativado e a falta de contato da que aguarda. */
  function situacaoNoCsv(maquina: MaquinaDaDistribuicao): string {
    const detalhes = [
      inativo && maquina.situacao.chave === 'aguardando' ? 'Pacote inativado' : null,
      maquina.semContato?.texto ?? null,
    ].filter(Boolean);
    return detalhes.length > 0
      ? `${maquina.situacao.texto} (${detalhes.join(' · ')})`
      : maquina.situacao.texto;
  }

  function exportar() {
    const momento = (valor: string | null) => (valor ? formatarDataEHora(new Date(valor)) : null);
    gravarCsv(
      `Distribuição ${ficha.pacote.nome} - ${ficha.paraQuem}.csv`.replace(/[\\/:*?"<>|]/g, '-'),
      [
        [
          'Máquina',
          'Patrimônio',
          'Pessoa',
          'Situação',
          'Etapa',
          'Código de saída',
          'Enviada ao agente em',
          'Atualizada em',
          'Terminada em',
        ],
        ...maquinas.map((maquina) => [
          maquina.ativo.rotulo,
          maquina.ativo.patrimonio,
          maquina.pessoa,
          situacaoNoCsv(maquina),
          maquina.etapa,
          maquina.codigo?.numero ?? null,
          momento(maquina.enviadaEm),
          momento(maquina.atualizadaEm),
          momento(maquina.terminadaEm),
        ]),
      ],
    );
  }

  const verFicha = (maquina: MaquinaDaDistribuicao) =>
    void navegar({ to: '/ativos/$id', params: { id: maquina.ativo.id } });

  return (
    <div className={dividida.tela} data-janela-inteira="">
      <Lateral ficha={ficha} />
      <div className={`${dividida.centro} ${estilos.centro}`}>
        <Cabecalho ficha={ficha} aoExportar={exportar} />
        <div className={estilos.progresso}>
          <span className={estilos.grande}>
            {contas.concluidas}
            <small>
              de {ficha.maquinas} {ficha.maquinas === 1 ? 'concluída' : 'concluídas'}
            </small>
          </span>
          <div className={estilos.regua}>
            <BarraDeSituacoes
              className={estilos.barra}
              partes={[
                { parte: 'ok', quantidade: contas.concluidas },
                { parte: 'info', quantidade: contas.emAndamento },
                { parte: 'neutra', quantidade: contas.aguardando - contas.semContato },
                { parte: 'critico', quantidade: contas.falharam },
                { parte: 'atencao', quantidade: contas.semContato },
                { parte: 'neutra', quantidade: contas.tiradas },
              ]}
            />
            <RotulosDoResultado maquinas={ficha.maquinas} resultado={contas} />
          </div>
        </div>
        {ficha.foraDoAlcance > 0 && (
          <p className={dividida.nota}>
            {ficha.foraDoAlcance === 1
              ? '1 máquina num local fora do seu alcance'
              : `${ficha.foraDoAlcance} máquinas em locais fora do seu alcance`}
          </p>
        )}
        {inativo && contas.aguardando > 0 && (
          <p className={doSoftware.aviso}>
            <Icone icone={PackageX} tamanho={16} />
            <span>
              Pacote inativado: as máquinas que aguardam ficam na fila até ele ser reativado.
            </span>
          </p>
        )}
        {falharam.length + semContato.length > 0 && (
          <section className={estilos.secao}>
            <Carimbo>Precisa de você</Carimbo>
            <ul className={estilos.cartoes}>
              {falharam.map((maquina) => (
                <li key={maquina.id} className={estilos.cartao} data-situacao="critico">
                  <div className={estilos.topo}>
                    <span>
                      <NomeDaMaquina maquina={maquina} aoAbrirLog={definirVendo} />
                      {maquina.pessoa && <span className={estilos.dado}>{maquina.pessoa}</span>}
                    </span>
                    <RotuloDeSituacao situacao="critico" semIcone>
                      {maquina.codigo ? `Falhou · ${maquina.codigo.numero}` : 'Falhou'}
                    </RotuloDeSituacao>
                  </div>
                  <p>
                    {maquina.codigo?.explicacao ??
                      (maquina.codigo
                        ? `O instalador terminou com o código ${maquina.codigo.numero}. O log diz o que ele mandou.`
                        : 'O agente avisou a falha. O log diz o que ele mandou.')}
                  </p>
                  {maquina.aguardaNoutra && (
                    <p>
                      {`Já aguarda este pacote noutra distribuição, ${textoDaOutra(maquina.aguardaNoutra, new Date(), dataHora)}.`}
                    </p>
                  )}
                  <div className={estilos.acoesDoCartao}>
                    {inativo ? (
                      <span className={doSoftware.semAcao}>Pacote inativado</span>
                    ) : maquina.aguardaNoutra ? (
                      <Link
                        to="/gestao/software/distribuicoes/$id"
                        params={{ id: maquina.aguardaNoutra.id }}
                        className={doSoftware.link}
                      >
                        Abrir a outra distribuição
                      </Link>
                    ) : (
                      <Botao
                        nivel="primario"
                        icone={RotateCw}
                        carregando={ocupada === maquina.id}
                        onPress={() => void agir(maquina, 'tentar-de-novo')}
                      >
                        Tentar de novo
                      </Botao>
                    )}
                    <Botao onPress={() => verFicha(maquina)}>Ver a ficha</Botao>
                    {maquina.terminadaEm && (
                      <span className={estilos.fim}>falhou às {hora(maquina.terminadaEm)}</span>
                    )}
                  </div>
                </li>
              ))}
              {semContato.map((maquina) => (
                <li key={maquina.id} className={estilos.cartao} data-situacao="atencao">
                  <div className={estilos.topo}>
                    <span>
                      <NomeDaMaquina maquina={maquina} aoAbrirLog={definirVendo} />
                      {maquina.pessoa && <span className={estilos.dado}>{maquina.pessoa}</span>}
                    </span>
                    <RotuloDeSituacao situacao="atencao" semIcone>
                      {maquina.semContato?.texto}
                    </RotuloDeSituacao>
                  </div>
                  <p>
                    {inativo
                      ? 'Pacote inativado: a instalação fica na fila até ele ser reativado. O agente também não responde: ligue a máquina ou confira o agente.'
                      : 'O agente não responde. A instalação espera na fila. Ligue a máquina ou confira o agente.'}
                  </p>
                  <div className={estilos.acoesDoCartao}>
                    <Botao onPress={() => verFicha(maquina)}>Ver a ficha</Botao>
                    <Botao
                      carregando={ocupada === maquina.id}
                      onPress={() => void agir(maquina, 'tirar-da-fila')}
                    >
                      Tirar da fila
                    </Botao>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {naFila.length > 0 && (
          <section className={estilos.secao}>
            <Carimbo>Na fila</Carimbo>
            <ul className={estilos.linhas}>
              {naFila.map((maquina) => (
                <li key={maquina.id} className={estilos.linha}>
                  <NomeDaMaquina maquina={maquina} aoAbrirLog={definirVendo} />
                  <span>{maquina.pessoa ?? '—'}</span>
                  <span>{textoDaFila(maquina)}</span>
                  <span className={estilos.fimDaLinha}>
                    <RotuloDeSituacao situacao="neutra" semIcone>
                      {maquina.situacao.texto}
                    </RotuloDeSituacao>
                    <Botao
                      nivel="terciario"
                      carregando={ocupada === maquina.id}
                      onPress={() => void agir(maquina, 'tirar-da-fila')}
                    >
                      Tirar da fila
                    </Botao>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {emAndamento.length > 0 && (
          <section className={estilos.secao}>
            <Carimbo>Em andamento</Carimbo>
            <ul className={estilos.linhas}>
              {emAndamento.map((maquina) => (
                <li key={maquina.id} className={estilos.linha}>
                  <NomeDaMaquina maquina={maquina} aoAbrirLog={definirVendo} />
                  <span>{maquina.pessoa ?? '—'}</span>
                  <span className={estilos.trilho} aria-hidden="true">
                    <i
                      style={{
                        width: `${(PARTE_DA_ETAPA[maquina.etapa ?? ''] ?? 0.1) * 100}%`,
                      }}
                    />
                  </span>
                  <span className={estilos.fimDaLinha}>
                    <RotuloDeSituacao situacao="info" semIcone>
                      Instalando
                    </RotuloDeSituacao>
                    <span>
                      {[hora(maquina.enviadaEm), maquina.etapa?.toLowerCase() ?? 'começando']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {concluidas.length > 0 && (
          <section className={estilos.secao}>
            <Carimbo>Concluídas</Carimbo>
            <ul className={estilos.chips}>
              {concluidas.map((maquina) => (
                <li key={maquina.id}>
                  <button
                    type="button"
                    className={estilos.chip}
                    onClick={() => definirVendo(maquina.id)}
                  >
                    <Icone icone={CircleCheck} tamanho={14} />
                    <span className={estilos.mono}>{maquina.ativo.rotulo}</span>
                    <span className={estilos.hora}>{hora(maquina.terminadaEm)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tiradas.length > 0 && (
          <section className={estilos.secao}>
            <Carimbo>Tiradas da fila</Carimbo>
            <ul className={estilos.chips}>
              {tiradas.map((maquina) => (
                <li key={maquina.id}>
                  <button
                    type="button"
                    className={estilos.chip}
                    data-tirada=""
                    onClick={() => definirVendo(maquina.id)}
                  >
                    <Icone icone={CircleMinus} tamanho={14} />
                    <span className={estilos.mono}>{maquina.ativo.rotulo}</span>
                    <span className={estilos.hora}>{hora(maquina.atualizadaEm)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {aberta && (
        <LogDaMaquina
          maquina={aberta}
          pacoteInativo={inativo}
          aoFechar={() => definirVendo(null)}
        />
      )}
    </div>
  );
}
