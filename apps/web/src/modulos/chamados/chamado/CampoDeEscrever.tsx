// O campo de escrever do chamado aberto (spec modulo-chamados, "Campo de escrever"; change
// chamados-da-ti, design, "O campo de escrever (tarefa 5.12)"; mockup m03): no pé da tela, só para
// quem atende os locais do chamado, a chave da mensagem e da nota, o "Esperar a resposta", a caixa
// que cresce com o texto, os anexos, as respostas prontas do tipo, o clipe e "Enviar", que o
// Ctrl+Enter também chama. O rascunho fica no componente de fora, que a tela monta pelo número do
// chamado: a releitura da conversa não o apaga, e o chamado resolvido no meio da escrita o guarda até
// o "Reabrir".
import { MAXIMO_DE_ANEXOS, nomeCurto } from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  BotaoDeIcone,
  Checkbox,
  ControleSegmentado,
  FORMATOS_DE_ARQUIVO,
  Icone,
  ItemDeMenu,
  MensagemDoPasso,
  Menu,
  Segmento,
  TeclaDeAtalho,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, MessageSquareText, Paperclip, RotateCcw, Send, Zap } from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { usePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { useAcoesDoAtendimento } from '../acoes.ts';
import { CHAVE_DOS_CHAMADOS, type FichaDoChamado } from '../consultas.ts';
import type { AnexoCitado } from '../formulario/estado.ts';
import { ListaDeAnexos } from '../formulario/ListaDeAnexos.tsx';
import { Recusa } from '../formulario/Recusa.tsx';
import { useFilaDeAnexos } from '../formulario/useFilaDeAnexos.ts';
import estilos from './CampoDeEscrever.module.css';
import {
  envioDoCampo,
  formaDoCampo,
  ID_DO_CAMPO_DE_ESCREVER,
  inserirNoTexto,
  type ModoDoCampo,
} from './escrever.ts';

type RespostaPronta = FichaDoChamado['respostasProntas'][number];

/** O que se escreve, até ser mandado. */
interface Rascunho {
  texto: string;
  modo: ModoDoCampo;
  esperar: boolean;
  /** Os anexos, na ordem, já enviados e ainda sem dono. */
  ids: readonly string[];
  anexos: ReadonlyMap<string, AnexoCitado>;
}

const RASCUNHO_VAZIO: Rascunho = {
  texto: '',
  modo: 'mensagem',
  esperar: false,
  ids: [],
  anexos: new Map(),
};

/** As respostas prontas que vão também em botões, ao lado do menu. */
const RESPOSTAS_A_VISTA = 2;

export interface PropsDoCampoDeEscrever {
  ficha: FichaDoChamado;
  /** O que se escreveu foi aceito: a conversa vai à última mensagem. */
  aoEnviar: () => void;
}

/** O campo de escrever, o "Reabra o chamado para escrever." no resolvido ou nada, sem atender. */
export function CampoDeEscrever({ ficha, aoEnviar }: PropsDoCampoDeEscrever) {
  const [rascunho, definirRascunho] = useState<Rascunho>(RASCUNHO_VAZIO);
  const forma = usePreferencias().preferencias.aparencia.conversas;
  const campo = formaDoCampo(ficha);
  if (campo === null) return null;
  return (
    <section className={estilos.campo} aria-label="Escrever no chamado" data-forma={forma}>
      <div className={estilos.coluna}>
        {campo === 'reabrir' ? (
          <ReabrirParaEscrever ficha={ficha} />
        ) : (
          <Escrever
            ficha={ficha}
            rascunho={rascunho}
            definirRascunho={definirRascunho}
            aoEnviar={aoEnviar}
          />
        )}
      </div>
    </section>
  );
}

/** No resolvido, o campo dá lugar ao "Reabrir", o mesmo do cabeçalho. */
function ReabrirParaEscrever({ ficha: { numero, versao } }: { ficha: FichaDoChamado }) {
  const acoes = useAcoesDoAtendimento();
  const [reabrindo, definirReabrindo] = useState(false);
  const reabrir = async () => {
    if (reabrindo) return;
    definirReabrindo(true);
    try {
      await acoes.reabrir(numero, versao);
    } finally {
      definirReabrindo(false);
    }
  };
  return (
    <div className={estilos.reabrir}>
      <p>Reabra o chamado para escrever.</p>
      <Botao
        icone={RotateCcw}
        carregando={reabrindo}
        rotuloCarregando="Reabrindo"
        onPress={() => void reabrir()}
      >
        Reabrir
      </Botao>
    </div>
  );
}

function Escrever({
  ficha,
  rascunho,
  definirRascunho,
  aoEnviar,
}: {
  ficha: FichaDoChamado;
  rascunho: Rascunho;
  definirRascunho: Dispatch<SetStateAction<Rascunho>>;
  aoEnviar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const caixa = useRef<HTMLTextAreaElement>(null);
  const escolha = useRef<HTMLInputElement>(null);
  const [enviando, definirEnviando] = useState(false);
  const [erroDoTexto, definirErroDoTexto] = useState<string | null>(null);
  const [erroDosAnexos, definirErroDosAnexos] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const { fila, progresso, recusas, receber, limparRecusas } = useFilaDeAnexos({
    ocupados: rascunho.ids.length,
    soNoNavegador: false,
    aoAnexar: (id, anexo) => {
      definirErroDosAnexos(null);
      definirRascunho((antes) => ({
        ...antes,
        ids: [...antes.ids, id],
        anexos: new Map(antes.anexos).set(id, anexo),
      }));
    },
  });

  const { texto, modo, esperar, ids, anexos } = rascunho;
  const pessoa = nomeCurto(ficha.pessoa.nome);
  const envio = envioDoCampo(modo, esperar);
  const nota = modo === 'nota';
  const respostas = nota ? [] : ficha.respostasProntas;
  const cabeMais = ids.length + fila.length < MAXIMO_DE_ANEXOS;

  // A caixa cresce com o texto, até a metade da janela; dali em diante, rola.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada texto e a cada modo.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    const medir = () => {
      // Com a altura zerada, a medida é a do texto, e não a das duas linhas da caixa vazia.
      elemento.style.height = '0px';
      const bordas = elemento.offsetHeight - elemento.clientHeight;
      elemento.style.height = `${elemento.scrollHeight + bordas}px`;
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [texto, modo]);

  // A resposta pronta entra onde estava o cursor, e o cursor fica no fim dela.
  const cursor = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o cursor vai ao lugar depois do texto novo.
  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento || cursor.current === null) return;
    elemento.setSelectionRange(cursor.current, cursor.current);
    cursor.current = null;
  }, [texto]);

  // A resposta escolhida no menu: o menu fechado devolve o foco ao botão dele, que o passa à caixa. Se
  // ele não voltar, a próxima tecla ou o próximo aperto o esquecem, como no quadro.
  const voltaDoMenu = useRef(false);
  useEffect(() => {
    const esquecer = () => {
      voltaDoMenu.current = false;
    };
    document.addEventListener('pointerdown', esquecer, true);
    document.addEventListener('keydown', esquecer, true);
    return () => {
      document.removeEventListener('pointerdown', esquecer, true);
      document.removeEventListener('keydown', esquecer, true);
    };
  }, []);

  const mudar = (parte: Partial<Rascunho>) => definirRascunho((antes) => ({ ...antes, ...parte }));

  function usarResposta(resposta: RespostaPronta, doMenu: boolean) {
    const elemento = caixa.current;
    const inicio = elemento?.selectionStart ?? texto.length;
    const fim = elemento?.selectionEnd ?? inicio;
    const inserido = inserirNoTexto(texto, inicio, fim, resposta.texto);
    cursor.current = inserido.cursor;
    definirRascunho((antes) => ({
      ...antes,
      texto: inserido.texto,
      esperar: antes.esperar || resposta.esperaAResposta,
    }));
    definirErroDoTexto(null);
    if (doMenu) voltaDoMenu.current = true;
    else elemento?.focus();
  }

  async function enviar() {
    if (enviando || fila.length > 0) return;
    definirEnviando(true);
    const pedido = {
      params: { path: { numero: ficha.numero } },
      body: { texto, anexos: ids.length > 0 ? [...ids] : undefined },
    };
    const fazer = () => {
      switch (envio.rota) {
        case '/chamados/{numero}/mensagem':
          return api.POST('/chamados/{numero}/mensagem', pedido);
        case '/chamados/{numero}/esperar':
          return api.POST('/chamados/{numero}/esperar', pedido);
        case '/chamados/{numero}/nota':
          return api.POST('/chamados/{numero}/nota', pedido);
      }
    };
    const resultado = await pedir(fazer, envio.noErro);
    definirEnviando(false);
    // Aceito ou recusado, a tela relê o chamado, como nas ações do atendimento.
    void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
    if ('erro' in resultado) {
      const campos = resultado.problema?.campos;
      if (campos?.texto) {
        definirErroDoTexto(campos.texto);
        caixa.current?.focus();
      } else if (campos?.anexos) {
        definirErroDosAnexos(campos.anexos);
      } else {
        definirFalha(resultado.erro);
        definirTentativa((anterior) => anterior + 1);
      }
      return;
    }
    definirRascunho((antes) => ({ ...RASCUNHO_VAZIO, modo: antes.modo }));
    definirErroDoTexto(null);
    definirErroDosAnexos(null);
    definirFalha(null);
    limparRecusas();
    aoEnviar();
  }

  return (
    <div className={estilos.escrever} data-modo={modo}>
      <div className={estilos.linha}>
        <ControleSegmentado
          rotulo="O que escrever"
          ocultarRotulo
          value={modo}
          onChange={(valor) => {
            mudar({ modo: valor === 'nota' ? 'nota' : 'mensagem' });
            // As recusas de antes eram do outro modo, como o "Escreva a mensagem.".
            definirErroDoTexto(null);
            definirFalha(null);
          }}
        >
          <Segmento value="mensagem" className={estilos.segmento}>
            <Icone icone={MessageSquareText} tamanho={14} />
            {`Mensagem para ${pessoa}`}
          </Segmento>
          <Segmento value="nota" className={estilos.segmento}>
            <Icone icone={Lock} tamanho={14} />
            Nota interna
          </Segmento>
        </ControleSegmentado>
        {!nota && (
          <Checkbox isSelected={esperar} onChange={(marcado) => mudar({ esperar: marcado })}>
            Esperar a resposta
          </Checkbox>
        )}
      </div>
      <AreaDeTexto
        id={ID_DO_CAMPO_DE_ESCREVER}
        ref={caixa}
        rotulo={nota ? 'Nota interna' : `Mensagem para ${pessoa}`}
        ocultarRotulo
        placeholder={
          nota ? `Escreva a nota. ${pessoa} não a vê.` : `Escreva a resposta para ${pessoa}.`
        }
        value={texto}
        onChange={(novo) => {
          mudar({ texto: novo });
          definirErroDoTexto(null);
        }}
        isReadOnly={enviando}
        erro={erroDoTexto ?? undefined}
        className={estilos.caixa}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
            evento.preventDefault();
            void enviar();
            return;
          }
          // O resto das teclas segue para os atalhos da casca.
          evento.continuePropagation();
        }}
      />
      <ListaDeAnexos
        ids={ids}
        anexos={anexos}
        fila={fila}
        progresso={progresso}
        numero={ficha.numero}
        editavel={!enviando}
        rotulo={nota ? 'Anexos da nota' : 'Anexos da mensagem'}
        aoTirar={(id) => {
          definirErroDosAnexos(null);
          definirRascunho((antes) => {
            const restantes = new Map(antes.anexos);
            restantes.delete(id);
            return { ...antes, ids: antes.ids.filter((outro) => outro !== id), anexos: restantes };
          });
        }}
      />
      {recusas.map(({ chave, texto: recusa }) => (
        <Recusa key={chave} texto={recusa} />
      ))}
      {erroDosAnexos && <Recusa texto={erroDosAnexos} />}
      <div className={estilos.linha}>
        {respostas.length > 0 && (
          <>
            <Menu
              rotulo="Respostas prontas"
              posicao="top start"
              gatilho={
                <Botao
                  icone={Zap}
                  onFocus={() => {
                    if (!voltaDoMenu.current) return;
                    voltaDoMenu.current = false;
                    caixa.current?.focus();
                  }}
                >
                  Respostas prontas
                </Botao>
              }
            >
              {respostas.map((resposta) => (
                <ItemDeMenu
                  key={resposta.id}
                  id={resposta.id}
                  descricao={resposta.esperaAResposta ? 'Espera a resposta' : undefined}
                  onAction={() => usarResposta(resposta, true)}
                >
                  {resposta.rotulo}
                </ItemDeMenu>
              ))}
            </Menu>
            {respostas.slice(0, RESPOSTAS_A_VISTA).map((resposta) => (
              <Botao key={resposta.id} onPress={() => usarResposta(resposta, false)}>
                {resposta.rotulo}
              </Botao>
            ))}
          </>
        )}
        <div className={estilos.fim}>
          {cabeMais && (
            <>
              <input
                ref={escolha}
                type="file"
                multiple
                hidden
                accept={FORMATOS_DE_ARQUIVO.join(',')}
                onChange={(evento) => {
                  definirErroDosAnexos(null);
                  receber([...(evento.target.files ?? [])]);
                  // O mesmo arquivo pode ser escolhido de novo, depois de tirado.
                  evento.target.value = '';
                }}
              />
              <BotaoDeIcone
                icone={Paperclip}
                rotulo="Anexar arquivos"
                onPress={() => escolha.current?.click()}
              />
            </>
          )}
          <TeclaDeAtalho teclas={['mod', 'Enter']} />
          <Botao
            nivel="primario"
            icone={Send}
            carregando={enviando}
            rotuloCarregando={envio.carregando}
            isDisabled={fila.length > 0}
            onPress={() => void enviar()}
          >
            {envio.rotulo}
          </Botao>
        </div>
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
