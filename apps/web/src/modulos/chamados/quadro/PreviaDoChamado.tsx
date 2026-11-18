// A prévia do quadrado em "Quem está com o quê" (spec modulo-chamados, "Quem está com o quê";
// change chamados-da-ti, design, decisão 22, "A prévia e o menu"; mockup m01): opaca, logo depois
// do quadrado no mesmo item da lista, para o Tab passar do quadrado aos botões dela e dela ao
// quadrado seguinte, e fixa na janela, fora do corte das colunas. O lugar sai do `lugarDaPrevia`,
// medido antes de ela aparecer. A quem só vê os chamados, ela vai sem as ações.
import { nomeCurto, type SituacaoDoPrazo } from '@grafite/domain';
import { Botao, useDataHora } from '@grafite/ui';
import { HandGrab } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { ChamadoNosPrazos } from '../consultas.ts';
import { IconeDoTipo, SeloDoPrazo, SiglaDaPessoa } from '../Pecas.tsx';
import estilos from './PreviaDoChamado.module.css';
import {
  type Caixa,
  LARGURA_DA_PREVIA,
  type LugarDaPrevia,
  lugarDaPrevia,
  momentoDaMensagem,
  type PessoaParaPassar,
} from './previa.ts';
import { textoDosAbertos } from './quadro.ts';

export interface AcoesDaPrevia {
  /** "Assumir", fora no chamado que já está com a conta. */
  assumir: boolean;
  /** As pessoas de "Passar para…"; sem nenhuma, o grupo não aparece. */
  pessoas: readonly PessoaParaPassar[];
  /** O botão que espera a resposta: "assumir", ou a conta da pessoa escolhida. */
  esperando: string | null;
  aoAssumir: () => void;
  aoPassar: (pessoa: PessoaParaPassar) => void;
}

export interface PropsDaPrevia {
  numero: number;
  chamado: ChamadoNosPrazos;
  situacao: SituacaoDoPrazo | null;
  /** Quem atende, pela coluna do quadrado; nulo, na triagem. */
  atende: { nome: string; naoAtendeMais: boolean } | null;
  /** As ações, a quem atende os chamados; sem elas, a prévia só mostra. */
  acoes: AcoesDaPrevia | null;
  agora: Date;
  /** As caixas do quadrado e da área das colunas, na hora de medir. */
  medir: () => { quadrado: Caixa; area: Caixa } | null;
}

const mesmoLugar = (a: LugarDaPrevia | null, b: LugarDaPrevia) =>
  a !== null &&
  a.left === b.left &&
  a.top === b.top &&
  a.largura === b.largura &&
  a.alturaMaxima === b.alturaMaxima;

export function PreviaDoChamado({
  numero,
  chamado,
  situacao,
  atende,
  acoes,
  agora,
  medir,
}: PropsDaPrevia) {
  const dataHora = useDataHora();
  const idDoPassar = useId();
  const elemento = useRef<HTMLDivElement>(null);
  const [lugar, definirLugar] = useState<LugarDaPrevia | null>(null);
  // A aberta pelo foco fica com a rolagem e com a mudança do tamanho da janela, e acompanha o
  // quadrado: cada uma pede outra medida.
  const [, medirDeNovo] = useReducer((volta: number) => volta + 1, 0);
  useEffect(() => {
    window.addEventListener('scroll', medirDeNovo, true);
    window.addEventListener('resize', medirDeNovo);
    return () => {
      window.removeEventListener('scroll', medirDeNovo, true);
      window.removeEventListener('resize', medirDeNovo);
    };
  }, []);
  // Medida a cada desenho, antes de ela aparecer: a altura muda com o conteúdo, e a largura, com a
  // área. A conta só muda o lugar quando ele muda, e para em duas ou três voltas.
  useLayoutEffect(() => {
    const previa = elemento.current;
    const caixas = medir();
    if (!previa || !caixas) return;
    const altura = previa.scrollHeight + previa.offsetHeight - previa.clientHeight;
    const proximo = lugarDaPrevia(caixas.quadrado, caixas.area, altura);
    definirLugar((antes) => (mesmoLugar(antes, proximo) ? antes : proximo));
  });

  const { pessoa, ativo, ultimaMensagem } = chamado;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a prévia não é um formulário, e o fieldset traria a moldura e a legenda de um.
    <div
      ref={elemento}
      role="group"
      aria-label={`Prévia do #${numero}`}
      className={estilos.previa}
      data-previa=""
      data-medida={lugar ? undefined : ''}
      style={
        lugar
          ? {
              left: lugar.left,
              top: lugar.top,
              width: lugar.largura,
              maxHeight: lugar.alturaMaxima ?? undefined,
            }
          : { left: 0, top: 0, width: LARGURA_DA_PREVIA }
      }
    >
      <div className={estilos.alto}>
        <span className={estilos.numero}>{`#${numero}`}</span>
        <span className={estilos.tipo}>
          <IconeDoTipo icone={chamado.tipo.icone} nome={chamado.tipo.nome} decorativo />
          {chamado.tipo.nome}
        </span>
        <span className={estilos.selo}>
          <SeloDoPrazo situacao={situacao} />
        </span>
      </div>
      <h3 className={estilos.titulo}>{chamado.titulo}</h3>
      <dl className={estilos.linhas}>
        <dt>Pediu</dt>
        <dd>{pessoa.local ? `${pessoa.nome} · ${pessoa.local}` : pessoa.nome}</dd>
        <dt>Ativo</dt>
        <dd>
          {ativo ? (
            <>
              {ativo.patrimonio && (
                <>
                  <span className={estilos.patrimonio}>{ativo.patrimonio}</span>{' '}
                </>
              )}
              {ativo.local ? `${ativo.rotulo} · ${ativo.local}` : ativo.rotulo}
            </>
          ) : (
            'Nenhum ativo ligado'
          )}
        </dd>
        <dt>Atende</dt>
        <dd>
          {atende
            ? atende.naoAtendeMais
              ? `${atende.nome} · não atende mais os chamados`
              : atende.nome
            : 'Ninguém ainda, na triagem'}
        </dd>
      </dl>
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
      {acoes && (acoes.assumir || acoes.pessoas.length > 0) && (
        <div className={estilos.acoes}>
          {acoes.assumir && (
            <Botao
              className={estilos.assumir}
              nivel="primario"
              icone={HandGrab}
              carregando={acoes.esperando === 'assumir'}
              rotuloCarregando="Assumindo"
              isDisabled={acoes.esperando !== null && acoes.esperando !== 'assumir'}
              onPress={acoes.aoAssumir}
            >
              Assumir
            </Botao>
          )}
          {acoes.pessoas.length > 0 && (
            // biome-ignore lint/a11y/useSemanticElements: os botões de quem recebe não são um formulário, e o fieldset traria a moldura e a legenda de um.
            <div role="group" aria-labelledby={idDoPassar} className={estilos.passar}>
              <span id={idDoPassar} className={estilos.rotulo}>
                Passar para…
              </span>
              <div className={estilos.pessoas}>
                {acoes.pessoas.map((quem) => (
                  <Botao
                    key={quem.conta}
                    className={estilos.pessoa}
                    aria-label={`${quem.nome}, ${textoDosAbertos(quem.abertos)}`}
                    carregando={acoes.esperando === quem.conta}
                    isDisabled={acoes.esperando !== null && acoes.esperando !== quem.conta}
                    onPress={() => acoes.aoPassar(quem)}
                  >
                    <span className={estilos.quem}>
                      <SiglaDaPessoa conta={quem.conta} nome={quem.nome} pequena />
                      <b>{nomeCurto(quem.nome)}</b>
                      <small>{textoDosAbertos(quem.abertos)}</small>
                    </span>
                  </Botao>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
