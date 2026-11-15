// O passo Quando do assistente da distribuição (spec distribuicao-de-software, "Quando instalar";
// change software-por-pacote, m04 e m08): agora, na janela da noite ou a partir de um dia marcado.
// Com a noite escolhida, a faixa das próximas 24 horas e o que acontece com cada máquina; vindo da
// matriz, a caixa da origem, com as máquinas marcadas lá.
import { JANELA_DA_NOITE, versaoCortada } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  CampoDeData,
  CampoDeTexto,
  Carimbo,
  GrupoDeRadios,
  Icone,
  Radio,
  RotuloDeSituacao,
  type Situacao,
  useDataHora,
} from '@grafite/ui';
import { ChevronRight, MoonStar, Undo2, Zap } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import estilos from './Assistente.module.css';
import type { MaquinaDaPrevia, PacoteDeSoftware, PreviaDaDistribuicao } from './consultas.ts';
import { nomeComVersao, plural } from './formatos.ts';
import {
  ABRE_A_NOITE,
  amanhaNoFuso,
  type ChaveDoQuando,
  comMaiuscula,
  diaCurto,
  FECHA_A_NOITE,
  type QuandoDoAssistente,
  relogioNoFuso,
} from './momento.ts';

/** De onde vieram o pacote e as máquinas, quando o assistente abre pela matriz. */
export interface OrigemDaMatriz {
  /** O nome do local em que a matriz estava, quando estava num. */
  local: string | null;
  aoVoltar: () => void;
}

export function PassoDoQuando({
  quando,
  definirQuando,
  erros,
  aoRecusarODia,
  origem,
  pacote,
  previa,
}: {
  quando: QuandoDoAssistente;
  definirQuando: (quando: QuandoDoAssistente) => void;
  erros: { dia?: string; hora?: string };
  aoRecusarODia: (texto: string | null) => void;
  origem: OrigemDaMatriz | null;
  pacote: PacoteDeSoftware;
  previa: PreviaDaDistribuicao | undefined;
}) {
  return (
    <>
      <CabecalhoDaPagina
        titulo="Quando instalar?"
        detalhe={
          origem
            ? 'Pacote e máquinas já escolhidos; falta o momento.'
            : 'Escolha quando cada máquina recebe o pedido.'
        }
      />
      {origem && <DaMatriz origem={origem} pacote={pacote} previa={previa} />}
      <GrupoDeRadios
        rotulo="Quando instalar"
        className={estilos.grupoDoQuando}
        value={quando.chave}
        onChange={(chave) => definirQuando({ ...quando, chave: chave as ChaveDoQuando })}
      >
        <Radio value="agora" className={estilos.opcaoDoQuando}>
          <TextoDaOpcao titulo="Agora">
            O pedido segue já; a máquina instala em poucos minutos.
          </TextoDaOpcao>
          <Icone icone={Zap} />
        </Radio>
        <Radio value="noite" className={estilos.opcaoDoQuando}>
          <TextoDaOpcao
            titulo={
              <>
                Na janela da noite, das 22h às 6h
                <RotuloDeSituacao situacao="sucesso" semIcone>
                  Indicado para drivers
                </RotuloDeSituacao>
              </>
            }
          >
            As máquinas ligadas instalam sozinhas, sem a pessoa perceber.
          </TextoDaOpcao>
          <Icone icone={MoonStar} />
        </Radio>
        {/* Os campos do dia ficam fora do rótulo da opção; mexer neles escolhe a opção. */}
        <div
          className={estilos.opcaoComCampos}
          data-escolhida={quando.chave === 'dia' || undefined}
        >
          <Radio value="dia" className={estilos.opcaoInterna}>
            <TextoDaOpcao titulo="Escolher o dia">
              O pedido só segue no dia e na hora marcados.
            </TextoDaOpcao>
          </Radio>
          <div className={estilos.camposDoDia}>
            <CampoDeData
              rotulo="Dia"
              valor={quando.dia}
              aoMudar={(dia) => definirQuando({ ...quando, chave: 'dia', dia })}
              aoRecusar={aoRecusarODia}
              erro={erros.dia}
            />
            <CampoDeTexto
              rotulo="Hora"
              value={quando.hora}
              onChange={(hora) => definirQuando({ ...quando, chave: 'dia', hora })}
              inputMode="numeric"
              autoComplete="off"
              erro={erros.hora}
              className={estilos.hora}
            />
          </div>
        </div>
      </GrupoDeRadios>
      {quando.chave === 'noite' && (
        <>
          <FaixaDasHoras />
          <SeAMaquinaEstiver />
        </>
      )}
    </>
  );
}

function TextoDaOpcao({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <span className={estilos.textoDaOpcao}>
      <b>{titulo}</b>
      <span>{children}</span>
    </span>
  );
}

const doisDigitos = (numero: number) => String(numero).padStart(2, '0');

const naJanela = (hora: number) => hora >= JANELA_DA_NOITE.abre || hora < JANELA_DA_NOITE.fecha;

/**
 * As próximas 24 horas, da hora de agora em diante, com cada trecho da janela da noite num bloco só
 * e as marcas de agora, do início e do fim da janela. É só desenho: o texto das opções já diz tudo.
 */
function FaixaDasHoras() {
  const { fuso } = useDataHora();
  const agora = new Date();
  const { dia, hora, minuto } = relogioNoFuso(agora, fuso);
  // Cada hora fora da janela numa célula; cada trecho seguido da janela num bloco só.
  const horasDoDia: { hora: number; coluna: number }[] = [];
  const blocos: { inicio: number; tamanho: number }[] = [];
  for (let coluna = 1; coluna <= 24; coluna++) {
    const deHora = (hora + coluna - 1) % 24;
    if (!naJanela(deHora)) {
      horasDoDia.push({ hora: deHora, coluna });
      continue;
    }
    const ultimo = blocos.at(-1);
    if (ultimo && ultimo.inicio + ultimo.tamanho === coluna) ultimo.tamanho++;
    else blocos.push({ inicio: coluna, tamanho: 1 });
  }
  const lugarDa = (deHora: number) => ((deHora - hora + 24) % 24) / 24;
  const marcas: { lugar: number; hora: string; texto: string }[] = [];
  for (const marca of [
    {
      lugar: minuto / 60 / 24,
      hora: `${doisDigitos(hora)}:${doisDigitos(minuto)}`,
      texto: 'agora',
    },
    { lugar: lugarDa(JANELA_DA_NOITE.abre), hora: ABRE_A_NOITE, texto: 'início da janela' },
    { lugar: lugarDa(JANELA_DA_NOITE.fecha), hora: FECHA_A_NOITE, texto: 'fim da janela' },
  ]) {
    // A marca colada a outra sai, para os textos não se encobrirem.
    if (marcas.every((outra) => Math.abs(outra.lugar - marca.lugar) >= 3 / 24)) marcas.push(marca);
  }
  // As horas de hoje até a meia-noite; com a faixa começando à meia-noite, o dia inteiro é hoje.
  const deHoje = (24 - hora) % 24;
  return (
    <div className={estilos.faixa} aria-hidden="true">
      <div
        className={estilos.diasDaFaixa}
        style={{ gridTemplateColumns: deHoje === 0 ? '1fr' : `${deHoje}fr ${24 - deHoje}fr` }}
      >
        <span>Hoje, {diaCurto(dia)}</span>
        {deHoje > 0 && <span>{comMaiuscula(diaCurto(amanhaNoFuso(agora, fuso)))}</span>}
      </div>
      <div className={estilos.horas}>
        {horasDoDia.map((celula) => (
          <i key={`hora-${celula.hora}`} style={{ gridColumn: celula.coluna }} />
        ))}
        {blocos.map((bloco) => (
          <span
            key={`bloco-${bloco.inicio}`}
            className={estilos.janela}
            style={{ gridColumn: `${bloco.inicio} / span ${bloco.tamanho}` }}
          >
            {bloco.tamanho >= 4 ? 'Janela da noite' : null}
          </span>
        ))}
      </div>
      <div className={estilos.marcas}>
        {marcas.map((marca) => (
          <span
            key={marca.texto}
            style={{ left: `${marca.lugar * 100}%` }}
            data-lado={marca.lugar > 0.8 ? 'fim' : undefined}
          >
            <b className={estilos.mono}>{marca.hora}</b>
            {marca.texto}
          </span>
        ))}
      </div>
    </div>
  );
}

function SeAMaquinaEstiver() {
  const titulo = useId();
  const casos: { situacao: Situacao; caso: string; texto: string }[] = [
    {
      situacao: 'sucesso',
      caso: `Ligada às ${ABRE_A_NOITE}`,
      texto: 'Instala na hora e a pessoa não percebe.',
    },
    {
      situacao: 'neutra',
      caso: 'Desligada',
      texto: `Instala quando ligar, até as ${FECHA_A_NOITE}, ou na noite seguinte.`,
    },
    {
      situacao: 'atencao',
      caso: 'Sem contato',
      texto: 'Fica na fila e instala quando o agente responder.',
    },
  ];
  return (
    <section className={estilos.seAMaquina} aria-labelledby={titulo}>
      <Carimbo id={titulo}>Na janela da noite, se a máquina estiver…</Carimbo>
      <dl className={estilos.casos}>
        {casos.map(({ situacao, caso, texto }) => (
          <div key={caso}>
            <dt>
              <RotuloDeSituacao situacao={situacao} semIcone>
                {caso}
              </RotuloDeSituacao>
            </dt>
            <dd>{texto}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type TipoNaTira = 'ja' | 'atualiza' | 'novo' | 'fila';

const tipoNaTira = (maquina: MaquinaDaPrevia): TipoNaTira =>
  maquina.classe === 'pulada'
    ? 'ja'
    : maquina.classe === 'na-fila'
      ? 'fila'
      : maquina.versao
        ? 'atualiza'
        : 'novo';

/** A caixa da origem (m08): de que matriz vieram as máquinas, cada uma com a versão de hoje. */
function DaMatriz({
  origem,
  pacote,
  previa,
}: {
  origem: OrigemDaMatriz;
  pacote: PacoteDeSoftware;
  previa: PreviaDaDistribuicao | undefined;
}) {
  const maquinas = previa?.maquinas ?? [];
  const total = maquinas.length;
  const deTipo = (tipo: TipoNaTira) => maquinas.filter((maquina) => tipoNaTira(maquina) === tipo);
  const atualizam = deTipo('atualiza');
  const versoesDeHoje = new Set(
    atualizam.map((maquina) => versaoCortada(maquina.versao, pacote.versao)),
  );
  const [daVersao] = versoesDeHoje;
  const legenda: { situacao: Situacao; texto: string; quantas: number }[] = [
    {
      situacao: 'sucesso',
      texto: pacote.versao ? `Já na ${pacote.versao}, puladas` : 'Já têm o pacote, puladas',
      quantas: deTipo('ja').length,
    },
    {
      situacao: 'atencao',
      texto: versoesDeHoje.size === 1 && daVersao ? `Atualizam da ${daVersao}` : 'Atualizam',
      quantas: atualizam.length,
    },
    { situacao: 'neutra', texto: 'Instalam pela primeira vez', quantas: deTipo('novo').length },
    { situacao: 'atencao', texto: 'Sem contato, na fila', quantas: deTipo('fila').length },
  ];
  return (
    <div className={estilos.origem}>
      <div className={estilos.linhaDaOrigem}>
        <RotuloDeSituacao situacao="info" semIcone>
          {origem.local ? `Vindo da matriz do local ${origem.local}` : 'Vindo da matriz'}
        </RotuloDeSituacao>
        <span className={estilos.caminho}>
          Matriz
          <Icone icone={ChevronRight} tamanho={12} />
          {origem.local && (
            <>
              {origem.local}
              <Icone icone={ChevronRight} tamanho={12} />
            </>
          )}
          <b>{pacote.nome}</b>
        </span>
        <Botao icone={Undo2} onPress={origem.aoVoltar}>
          Voltar à matriz
        </Botao>
      </div>
      <p>
        Você marcou <b>{plural(total, 'máquina', 'máquinas')}</b> na matriz e pediu{' '}
        <b>
          Distribuir {nomeComVersao(pacote)} {total === 1 ? 'a esta' : `a estas ${total}`}
        </b>
        .
      </p>
      {total > 0 && (
        <>
          <ul className={estilos.tira} aria-label="Máquinas marcadas na matriz">
            {maquinas.map((maquina) => {
              const tipo = tipoNaTira(maquina);
              return (
                <li key={maquina.id} data-tipo={tipo}>
                  <span className={estilos.mono}>{maquina.rotulo}</span>
                  {tipo === 'fila' ? (
                    <span>na fila</span>
                  ) : maquina.versao ? (
                    <span className={estilos.versaoNaTira}>{maquina.versao}</span>
                  ) : (
                    <span>sem</span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={estilos.legendaDaTira}>
            {legenda
              .filter(({ quantas }) => quantas > 0)
              .map(({ situacao, texto, quantas }) => (
                <RotuloDeSituacao key={texto} situacao={situacao} semIcone>
                  {`${texto} · ${quantas}`}
                </RotuloDeSituacao>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
