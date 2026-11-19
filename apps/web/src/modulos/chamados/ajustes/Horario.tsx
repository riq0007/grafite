// O horário da TI (spec chamados, "Horário da TI"; spec modulo-chamados, "Respostas prontas e
// horário da TI na tela"; change chamados-da-ti, design, "O horário da TI (tarefa 5.26)"), para
// quem configura os chamados: os dias, o início e o fim, o fuso e a carga cheia, com "Salvar" e
// "Horário salvo.". As recusas da spec saem do domínio antes de mandar, e a API confere de novo.
import { type DiaDaSemana, noHorarioDaTi, normalizarTexto } from '@grafite/domain';
import {
  avisar,
  Botao,
  BuscaComSugestoes,
  CabecalhoDaPagina,
  CampoDeHora,
  Carimbo,
  Checkbox,
  criarDataHora,
  Dialogo,
  descreverFuso,
  EstadoVazio,
  Formulario,
  fusoReconhecido,
  GrupoDeCheckboxes,
  Icone,
  LinhaDeCampos,
  listaDeFusos,
  MensagemDoPasso,
  NumeroNaFrase,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { CalendarClock, CircleAlert } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { CHAVE_DO_HORARIO_DA_TI, useHorarioDaTi } from '../consultas.ts';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import estilos from './Horario.module.css';
import {
  conferirEdicao,
  DIAS_PARA_MARCAR,
  type EdicaoDoHorario,
  type ErrosDoHorario,
  edicaoDoHorario,
  errosDoHorario,
  fraseDoHorario,
  mudouOHorario,
  recusasQueValem,
} from './horario.ts';

/** O primeiro campo recusado, onde o foco vai depois da gravação recusada, na ordem da tela. */
const RECUSADO = '[data-invalid] input, [data-invalid] [role="spinbutton"]';

/** A recusa da gravação, com o horário como estava quando foi recusado. */
interface RecusaDoHorario {
  erros: ErrosDoHorario;
  naRecusa: EdicaoDoHorario;
}

/** O horário da TI (spec modulo-chamados), para quem configura os chamados. */
export function HorarioDaTi() {
  return (
    <TelaDosChamados
      titulo="Horário da TI"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="ao horário da TI"
    >
      <TelaDoHorario />
    </TelaDosChamados>
  );
}

function TelaDoHorario() {
  const consulta = useHorarioDaTi();
  const gravado = consulta.data ?? null;

  let corpo: ReactNode;
  if (gravado) {
    corpo = <FormularioDoHorario gravado={gravado} />;
  } else if (consulta.isError) {
    corpo = (
      <EstadoVazio
        titulo={consulta.error.message}
        acao={
          <Botao
            carregando={consulta.isFetching}
            rotuloCarregando="Tentando de novo"
            onPress={() => void consulta.refetch()}
          >
            Tentar de novo
          </Botao>
        }
      />
    );
  } else {
    corpo = <p className={estilos.carregando}>Carregando o horário da TI…</p>;
  }

  return (
    <>
      <CabecalhoDaPagina
        titulo="Horário da TI"
        detalhe="Os prazos que contam no horário da TI só andam nestes dias e horas. Uma mudança vale daí em diante: o tempo que os chamados abertos já contaram fica."
      />
      {corpo}
    </>
  );
}

type Gravado = NonNullable<ReturnType<typeof useHorarioDaTi>['data']>;

function FormularioDoHorario({ gravado }: { gravado: Gravado }) {
  const id = useId();
  const api = useApi();
  const consultas = useQueryClient();
  // Sem mudança, a tela mostra o gravado, que o evento dos ajustes relê; com mudança, o que se
  // escreveu, e o "Salvar" compara com o gravado de agora.
  const [mudada, definirMudada] = useState<EdicaoDoHorario | null>(null);
  const edicao = mudada ?? edicaoDoHorario(gravado);
  const mudou = mudada !== null && mudouOHorario(mudada, gravado);
  const [recusa, definirRecusa] = useState<RecusaDoHorario | null>(null);
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const erros = recusa ? recusasQueValem(recusa.erros, recusa.naRecusa, edicao) : {};

  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current?.querySelector<HTMLElement>(RECUSADO)?.focus();
  }, [pedidoDeFoco]);

  // Sair da tela com o horário mudado pede a confirmação, como a gaveta das respostas.
  const bloqueio = useBlocker({
    shouldBlockFn: () => mudou,
    enableBeforeUnload: () => mudou,
    withResolver: true,
  });

  const mudar = (parte: Partial<EdicaoDoHorario>) =>
    definirMudada((atual) => ({ ...(atual ?? edicaoDoHorario(gravado)), ...parte }));

  const recusar = (errosDaRecusa: ErrosDoHorario) => {
    definirRecusa({ erros: errosDaRecusa, naRecusa: edicao });
    definirFalha(null);
    definirPedidoDeFoco((vez) => vez + 1);
  };

  const descartar = () => {
    definirMudada(null);
    definirRecusa(null);
    definirFalha(null);
  };

  async function salvar() {
    if (salvando) return;
    const conferida = conferirEdicao(edicao);
    if (!conferida.ok) {
      recusar(conferida.erros);
      return;
    }
    definirSalvando(true);
    try {
      const resultado = await pedir(
        () => api.PUT('/chamados/horario-da-ti', { body: conferida.pedido }),
        'salvar o horário da TI',
      );
      if ('erro' in resultado) {
        const doCampo = errosDoHorario(resultado.problema?.campos ?? {});
        if (Object.keys(doCampo).length > 0) {
          recusar(doCampo);
        } else {
          definirRecusa(null);
          definirFalha((anterior) => ({ texto: resultado.erro, vez: (anterior?.vez ?? 0) + 1 }));
        }
        return;
      }
      consultas.setQueryData(CHAVE_DO_HORARIO_DA_TI, resultado.dados);
      descartar();
      avisar({ situacao: 'sucesso', titulo: 'Horário salvo.' });
    } finally {
      definirSalvando(false);
    }
  }

  const frase = fraseDoHorario(edicao);
  const idDoErroDaCarga = erros.cargaCheia ? `${id}-carga` : undefined;

  return (
    <div ref={area} className={estilos.horario}>
      <Formulario
        aria-label="Horário da TI"
        validationBehavior="aria"
        onSubmit={(evento) => {
          evento.preventDefault();
          void salvar();
        }}
        className={estilos.formulario}
      >
        <section aria-labelledby={`${id}-dias`} className={estilos.secao}>
          <Carimbo nivel={3} id={`${id}-dias`}>
            Dias e horas
          </Carimbo>
          <GrupoDeCheckboxes
            rotulo="Dias"
            value={edicao.dias.map(String)}
            onChange={(marcados) =>
              mudar({ dias: marcados.map((dia) => Number(dia) as DiaDaSemana) })
            }
            erro={erros.dias}
            className={estilos.dias}
          >
            {DIAS_PARA_MARCAR.map(({ dia, rotulo }) => (
              <Checkbox key={dia} value={String(dia)}>
                {rotulo}
              </Checkbox>
            ))}
          </GrupoDeCheckboxes>
          <LinhaDeCampos className={estilos.horas}>
            <CampoDeHora
              rotulo="Início"
              valor={edicao.inicio}
              aoMudar={(inicio) => mudar({ inicio })}
              erro={erros.inicio}
            />
            <CampoDeHora
              rotulo="Fim"
              valor={edicao.fim}
              aoMudar={(fim) => mudar({ fim })}
              erro={erros.fim}
            />
          </LinhaDeCampos>
          <EscolhaDoFuso
            edicao={edicao}
            gravado={gravado.fuso}
            aoMudar={(fuso) => mudar({ fuso })}
            erro={erros.fuso}
          />
          {frase && (
            <p className={estilos.frase}>
              <Icone icone={CalendarClock} tamanho={16} />
              {frase}
            </p>
          )}
        </section>

        <section aria-labelledby={`${id}-carga-titulo`} className={estilos.secao}>
          <Carimbo nivel={3} id={`${id}-carga-titulo`}>
            Carga de cada pessoa
          </Carimbo>
          <div>
            <div className={estilos.fraseDaCarga}>
              A barra de carga de cada pessoa enche com
              <NumeroNaFrase
                rotulo="Carga cheia"
                valor={edicao.cargaCheia}
                aoMudar={(cargaCheia) => mudar({ cargaCheia })}
                algarismos={2}
                invalido={idDoErroDaCarga !== undefined}
                aria-describedby={idDoErroDaCarga}
              />
              chamados abertos.
            </div>
            {erros.cargaCheia && (
              <p id={idDoErroDaCarga} className={estilos.erro}>
                <Icone icone={CircleAlert} tamanho={14} />
                {erros.cargaCheia}
              </p>
            )}
            <p className={estilos.ajuda}>
              De 1 a 20. A barra fica em Quem está com o quê, com um pedaço por chamado.
            </p>
          </div>
        </section>

        <div className={estilos.pe}>
          <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
          <div className={estilos.botoes}>
            <Botao onPress={descartar} isDisabled={!mudou || salvando}>
              Descartar
            </Botao>
            <Botao
              type="submit"
              nivel="primario"
              isDisabled={!mudou}
              carregando={salvando}
              rotuloCarregando="Salvando"
            >
              Salvar
            </Botao>
          </div>
        </div>
      </Formulario>

      <Dialogo
        alerta
        titulo="Descartar as mudanças no horário?"
        aberto={bloqueio.status === 'blocked'}
        aoMudarAberto={(abrindo) => {
          if (!abrindo && bloqueio.status === 'blocked') bloqueio.reset();
        }}
        acoes={() => (
          <>
            <Botao
              onPress={() => {
                if (bloqueio.status === 'blocked') bloqueio.reset();
              }}
            >
              Continuar editando
            </Botao>
            <Botao
              nivel="destrutivo"
              onPress={() => {
                if (bloqueio.status === 'blocked') bloqueio.proceed();
              }}
            >
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          As mudanças que não foram salvas saem, e o horário continua como está gravado.
        </p>
      </Dialogo>
    </div>
  );
}

/**
 * O fuso, na busca com sugestões das Preferências: os do Brasil no alto e os outros na ordem da
 * diferença para o UTC, com o gravado mesmo que o navegador não o tenha. A ajuda diz a hora de
 * agora nesse fuso e, com o horário escrito conferido, se ela cai nele.
 */
function EscolhaDoFuso({
  edicao,
  gravado,
  aoMudar,
  erro,
}: {
  edicao: EdicaoDoHorario;
  gravado: string;
  aoMudar: (fuso: string) => void;
  erro: string | undefined;
}) {
  const agora = useAgora();
  // A lista e a diferença para o UTC são as da abertura da tela: mudam só com o horário de verão.
  const [abertura] = useState(() => new Date());
  const { opcoes, sugeridas } = useMemo(() => {
    const fusos = listaDeFusos(abertura);
    const lista = fusos.map(({ id, rotulo }) => ({ id, rotulo }));
    if (!lista.some((opcao) => opcao.id === gravado)) {
      lista.unshift({
        id: gravado,
        rotulo: fusoReconhecido(gravado) ? descreverFuso(gravado, abertura).rotulo : gravado,
      });
    }
    return {
      opcoes: lista,
      sugeridas: { ids: fusos.filter((fuso) => fuso.doBrasil).map((fuso) => fuso.id) },
    };
  }, [abertura, gravado]);
  const conhecido = fusoReconhecido(edicao.fuso);
  const { formatarHorario } = useMemo(
    () => criarDataHora(conhecido ? edicao.fuso : undefined),
    [conhecido, edicao.fuso],
  );
  let descricao: string | undefined;
  if (conhecido) {
    const conferida = conferirEdicao(edicao);
    const onde = conferida.ok
      ? noHorarioDaTi(agora, conferida.pedido)
        ? ', no horário da TI'
        : ', fora do horário da TI'
      : '';
    descricao = `Agora: ${formatarHorario(agora)}${onde}.`;
  }

  return (
    <BuscaComSugestoes
      rotulo="Fuso horário"
      sugestoes={opcoes}
      sugeridas={sugeridas}
      // Os outros fusos seguem a ordem da diferença para o UTC, e não a alfabética.
      manterOrdem
      aceitaTextoLivre={false}
      selectedKey={edicao.fuso}
      // Apagar o texto não é escolher: o fuso só muda por uma das opções.
      onSelectionChange={(escolhido) => {
        if (escolhido !== null) aoMudar(String(escolhido));
      }}
      defaultFilter={(texto, busca) => normalizarTexto(texto).includes(normalizarTexto(busca))}
      descricao={descricao}
      erro={erro}
    />
  );
}
