// O painel dos prazos (spec modulo-chamados, "Prazos"; change chamados-da-ti, design, "O painel dos
// prazos (tarefa 5.16)"; mockup m06): ao lado da lista, com o chamado escolhido. O prazo do tipo, a
// situação, a barra em proporção do prazo e o detalhe; quem pediu, quem atende e o ativo; a última
// mensagem; e, a quem atende, "Passar para…", a mensagem pronta para quem pediu e "Avisar <nome>".
// "Abrir o chamado" leva ao chamado. A lista dá um painel a cada chamado (a `key`), põe o foco no
// título quando escolhe, fecha o painel com o Esc e guarda a mensagem mudada, que fica quando o
// painel fecha e volta.
import { type HorarioDaTi, nomeCurto, type SituacaoDoPrazo } from '@grafite/domain';
import { AreaDeTexto, avisar, Botao, BotaoDeIcone, useDataHora } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Send, SquareArrowOutUpRight, X } from 'lucide-react';
import { Fragment, type Ref, useId, useImperativeHandle, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useArvoreDosLocais } from '../../administracao/seletores/SeletorDeLocal.tsx';
import { useAcoesDoAtendimento } from '../acoes.ts';
import { quadroDoPrazo } from '../chamado/prazo.ts';
import { CHAVE_DOS_CHAMADOS, type ChamadoNosPrazos, useQuadroDosChamados } from '../consultas.ts';
import { IconeDoPrazo, IconeDoTipo, SiglaDaPessoa } from '../Pecas.tsx';
import { momentoDaMensagem, type PessoaParaPassar } from '../quadro/previa.ts';
import { textoDosAbertos } from '../quadro/quadro.ts';
import estilos from './PainelDoPrazo.module.css';
import { acoesDoPainel, barraDoPainel, mensagemPronta } from './painel.ts';

/** O que a lista pede ao painel: o foco no título, quando ela escolhe um chamado. */
export interface ControleDoPainel {
  focar: () => void;
}

export interface PropsDoPainelDoPrazo {
  id: string;
  chamado: ChamadoNosPrazos;
  situacao: SituacaoDoPrazo | null;
  horario: HorarioDaTi;
  agora: Date;
  /** A mensagem que a conta mudou neste chamado; nula, vale a pronta. */
  mensagemMudada: string | null;
  /** O texto novo da mensagem do chamado; nulo, a mensagem volta a ser a pronta. */
  aoMudarAMensagem: (numero: number, texto: string | null) => void;
  aoFechar: () => void;
  controle?: Ref<ControleDoPainel>;
}

export function PainelDoPrazo({
  id,
  chamado,
  situacao,
  horario,
  agora,
  mensagemMudada,
  aoMudarAMensagem,
  aoFechar,
  controle,
}: PropsDoPainelDoPrazo) {
  const dataHora = useDataHora();
  const sessao = useSessao();
  const conta = sessao.tipo === 'ativa' ? sessao.conta.id : null;
  const podeAtender = useAcesso().pode('chamados.atender');
  const quadro = useQuadroDosChamados();
  const arvore = useArvoreDosLocais(podeAtender);
  const titulo = useRef<HTMLHeadingElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(controle, () => ({ focar: () => titulo.current?.focus() }), []);
  // A recusa do texto fica no campo até a conta mudar a mensagem ou mandá-la de novo.
  const [recusa, definirRecusa] = useState<string | null>(null);

  const { numero, pessoa, responsavel, ativo, ultimaMensagem } = chamado;
  const acoes = acoesDoPainel(chamado, {
    podeAtender,
    conta,
    colunas: quadro.data?.colunas ?? null,
    arvore,
  });
  const doPrazo = quadroDoPrazo(
    { abertoEm: chamado.abertoEm, relogio: chamado.relogio, parouEm: null },
    horario,
    agora,
    dataHora,
  );
  const barra = situacao && barraDoPainel(situacao);
  // A pronta acompanha o minuto, até a conta mudar o texto.
  const texto =
    mensagemMudada ??
    (acoes.avisar ? mensagemPronta({ chamado, situacao, conta, agora, dataHora }) : '');

  return (
    <aside id={id} aria-label={`Prévia do chamado #${numero}`} className={estilos.painel}>
      <div className={estilos.cabeca}>
        <span className={estilos.numero}>{`#${numero}`}</span>
        <span className={estilos.tipo}>
          <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} decorativo />
          {chamado.tipo.nome}
        </span>
        <BotaoDeIcone
          icone={X}
          rotulo="Fechar a prévia"
          comDica={false}
          className={estilos.fechar}
          onPress={aoFechar}
        />
      </div>
      <h2 ref={titulo} tabIndex={-1} className={estilos.titulo}>
        {chamado.titulo}
      </h2>
      <div className={estilos.corpo}>
        <div
          className={`${estilos.bloco} ${estilos.prazo}`}
          data-marca={doPrazo.marca === 'neutra' ? undefined : doPrazo.marca}
        >
          <div className={estilos.linhaDoPrazo}>
            {doPrazo.prazoDoTipo && <span>{doPrazo.prazoDoTipo}</span>}
            <b className={estilos.destaque}>
              <IconeDoPrazo grupo={doPrazo.grupo} tamanho={16} />
              {doPrazo.destaque}
            </b>
          </div>
          {barra && (
            <div className={estilos.barra} aria-hidden="true">
              {barra.gasto > 0 && (
                <i data-parte="gasto" data-tom={barra.tom} style={{ flexGrow: barra.gasto }} />
              )}
              {barra.resta > 0 && (
                <i data-parte="resta" data-tom={barra.tom} style={{ flexGrow: barra.resta }} />
              )}
              {barra.estouro > 0 && <i data-parte="estouro" style={{ flexGrow: barra.estouro }} />}
            </div>
          )}
          <span className={estilos.detalhe}>
            {doPrazo.detalhe.map((pedaco, indice) => (
              <Fragment key={pedaco.texto}>
                {indice > 0 && ' · '}
                {pedaco.mono ? <span className={estilos.mono}>{pedaco.texto}</span> : pedaco.texto}
              </Fragment>
            ))}
          </span>
        </div>
        <div className={estilos.bloco}>
          <dl className={estilos.dados}>
            <dt>Pediu</dt>
            <dd>{pessoa.local ? `${pessoa.nome} · ${pessoa.local}` : pessoa.nome}</dd>
            <dt>Atende</dt>
            <dd className={estilos.comSigla}>
              {responsavel ? (
                <>
                  <SiglaDaPessoa
                    conta={responsavel.conta}
                    nome={responsavel.nome}
                    tamanho="pequena"
                  />
                  {responsavel.nome}
                </>
              ) : (
                'Ninguém ainda, na triagem'
              )}
            </dd>
            <dt>Ativo</dt>
            <dd>
              {ativo ? (
                <>
                  {ativo.patrimonio && (
                    <>
                      <span className={estilos.mono}>{ativo.patrimonio}</span>{' '}
                    </>
                  )}
                  {ativo.local ? `${ativo.rotulo} · ${ativo.local}` : ativo.rotulo}
                </>
              ) : (
                'Nenhum ativo ligado'
              )}
            </dd>
          </dl>
        </div>
        <div className={estilos.bloco}>
          {ultimaMensagem ? (
            <figure className={estilos.mensagem}>
              <figcaption>
                {`${ultimaMensagem.autor} · ${momentoDaMensagem(new Date(ultimaMensagem.em), agora, dataHora)}`}
              </figcaption>
              <blockquote>{ultimaMensagem.texto}</blockquote>
            </figure>
          ) : (
            <p className={estilos.semMensagem}>Nenhuma mensagem ainda.</p>
          )}
        </div>
        {acoes.pessoas.length > 0 && <PassarPara chamado={chamado} pessoas={acoes.pessoas} />}
        {acoes.avisar && (
          <div className={estilos.bloco}>
            <AreaDeTexto
              ref={campo}
              rotulo={`Mensagem para ${nomeCurto(pessoa.nome)}`}
              ocultarRotulo
              className={estilos.mensagemPronta}
              value={texto}
              onChange={(novo) => {
                aoMudarAMensagem(numero, novo);
                definirRecusa(null);
              }}
              erro={recusa ?? undefined}
            />
          </div>
        )}
      </div>
      <Rodape
        chamado={chamado}
        comAviso={acoes.avisar}
        texto={texto}
        aoRecusar={(frase) => {
          definirRecusa(frase);
          campo.current?.focus();
        }}
        aoEnviar={() => {
          aoMudarAMensagem(numero, null);
          definirRecusa(null);
        }}
      />
    </aside>
  );
}

/** "Passar para…": um botão por pessoa, com a sigla, o primeiro nome e os abertos dela. */
function PassarPara({
  chamado,
  pessoas,
}: {
  chamado: ChamadoNosPrazos;
  pessoas: readonly PessoaParaPassar[];
}) {
  const idDoRotulo = useId();
  const acoes = useAcoesDoAtendimento();
  // A conta da pessoa que espera a resposta: os outros botões ficam parados até ela chegar.
  const [esperando, definirEsperando] = useState<string | null>(null);
  const passar = async (quem: PessoaParaPassar) => {
    if (esperando) return;
    definirEsperando(quem.conta);
    try {
      await acoes.passar(chamado.numero, chamado.versao, quem.conta);
    } finally {
      definirEsperando(null);
    }
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: os botões de quem recebe não são um formulário, e o fieldset traria a moldura e a legenda de um.
    <div role="group" aria-labelledby={idDoRotulo} className={estilos.bloco}>
      <span id={idDoRotulo} className={estilos.rotulo}>
        Passar para…
      </span>
      <div className={estilos.pessoas}>
        {pessoas.map((quem) => (
          <Botao
            key={quem.conta}
            className={estilos.pessoa}
            aria-label={`${quem.nome}, ${textoDosAbertos(quem.abertos)}`}
            carregando={esperando === quem.conta}
            isDisabled={esperando !== null && esperando !== quem.conta}
            onPress={() => void passar(quem)}
          >
            <span className={estilos.quem}>
              <SiglaDaPessoa conta={quem.conta} nome={quem.nome} tamanho="pequena" />
              <b>{nomeCurto(quem.nome)}</b>
              <small>{textoDosAbertos(quem.abertos)}</small>
            </span>
          </Botao>
        ))}
      </div>
    </div>
  );
}

/** O "Avisar <nome>", a ação principal, que manda a mensagem, e "Abrir o chamado". */
function Rodape({
  chamado: { numero, pessoa },
  comAviso,
  texto,
  aoRecusar,
  aoEnviar,
}: {
  chamado: ChamadoNosPrazos;
  comAviso: boolean;
  texto: string;
  aoRecusar: (frase: string) => void;
  aoEnviar: () => void;
}) {
  const navegar = useNavigate();
  const api = useApi();
  const consultas = useQueryClient();
  const nome = nomeCurto(pessoa.nome);
  const [enviando, definirEnviando] = useState(false);
  const enviar = async () => {
    if (enviando) return;
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        api.POST('/chamados/{numero}/mensagem', {
          params: { path: { numero } },
          body: { texto },
        }),
      'enviar a mensagem',
    );
    definirEnviando(false);
    // Aceita ou recusada, a tela relê os chamados, como no campo de escrever.
    void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
    if ('erro' in resultado) {
      const doTexto = resultado.problema?.campos?.texto;
      if (doTexto) aoRecusar(doTexto);
      else avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `Você avisou ${nome} no #${numero}.` });
    aoEnviar();
  };
  return (
    <div className={estilos.rodape}>
      {comAviso && (
        <Botao
          nivel="primario"
          icone={Send}
          carregando={enviando}
          rotuloCarregando="Enviando"
          onPress={() => void enviar()}
        >
          {`Avisar ${nome}`}
        </Botao>
      )}
      <Botao
        icone={SquareArrowOutUpRight}
        onPress={() =>
          void navegar({ to: '/chamados/$numero', params: { numero: String(numero) } })
        }
      >
        Abrir o chamado
      </Botao>
    </div>
  );
}
