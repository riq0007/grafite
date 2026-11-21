// A avaliação do atendimento no chat (spec modulo-chat, "Chamado no chat"; spec chamados, "Avaliação
// do atendimento"; change chat-com-chamados, design, decisão 15, "O chamado no chat"): o quadro logo
// depois do resolvido, com os quatro níveis em cartões, "Só a TI vê a sua resposta.", o comentário
// opcional e "Enviar avaliação", sem ação até um nível ser marcado. Avaliado, o quadro mostra o nível
// marcado e diz "Você marcou: Ótimo. Obrigado!" ou, quando outra conta do chamado avaliou, "O
// atendimento foi avaliado: Ótimo.". A recusa fica no campo dela; a de fora dos campos, embaixo.
import {
  LIMITE_DO_COMENTARIO,
  NIVEIS_DA_AVALIACAO,
  ROTULOS_DOS_NIVEIS_DA_AVALIACAO,
} from '@grafite/domain';
import { Botao, CampoDeTexto, GrupoDeRadios, Icone, Radio } from '@grafite/ui';
import { Frown, Laugh, type LucideIcon, Meh, Smile } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Recusa } from '../modulos/chamados/formulario/Recusa.tsx';
import estilos from './AvaliacaoDoChamado.module.css';
import type { AcoesDoChamado, ConversaDoChamadoNoChat, NivelDaAvaliacao } from './consultas.ts';

const ICONES_DOS_NIVEIS: Record<NivelDaAvaliacao, LucideIcon> = {
  ruim: Frown,
  regular: Meh,
  bom: Smile,
  otimo: Laugh,
};

const ehNivel = (valor: string): valor is NivelDaAvaliacao =>
  (NIVEIS_DA_AVALIACAO as readonly string[]).includes(valor);

interface RecusaDaAvaliacao {
  nivel?: string;
  comentario?: string;
  geral?: string;
}

/** O ícone, o nome e o que o nível quer dizer, como no cartão dele. */
function Nivel({ nivel }: { nivel: NivelDaAvaliacao }) {
  const { nome, descricao } = ROTULOS_DOS_NIVEIS_DA_AVALIACAO[nivel];
  return (
    <>
      <Icone icone={ICONES_DOS_NIVEIS[nivel]} tamanho={22} />
      <span className={estilos.nomeDoNivel}>{nome}</span>
      <span className={estilos.descricaoDoNivel}>{descricao}</span>
    </>
  );
}

export function AvaliacaoDoChamado({
  avaliacao,
  avaliar,
}: {
  avaliacao: ConversaDoChamadoNoChat['avaliacao'];
  avaliar: AcoesDoChamado['avaliar'];
}) {
  const [nivel, definirNivel] = useState<NivelDaAvaliacao | null>(null);
  const [comentario, definirComentario] = useState('');
  const [enviando, definirEnviando] = useState(false);
  const [recusa, definirRecusa] = useState<RecusaDaAvaliacao>({});
  const idDoTitulo = useId();
  const resultado = useRef<HTMLParagraphElement>(null);
  /** A avaliação foi mandada aqui: o foco, que estava no botão, vai à frase do resultado. */
  const avaliouAqui = useRef(false);

  useEffect(() => {
    if (avaliacao === null || !avaliouAqui.current) return;
    avaliouAqui.current = false;
    resultado.current?.focus();
  }, [avaliacao]);

  const titulo = (
    <h3 id={idDoTitulo} className={estilos.titulo}>
      Como foi o atendimento?
    </h3>
  );

  if (avaliacao !== null) {
    const { nome } = ROTULOS_DOS_NIVEIS_DA_AVALIACAO[avaliacao.nivel];
    return (
      <section className={estilos.quadro} aria-labelledby={idDoTitulo}>
        {titulo}
        <ul className={estilos.niveis} aria-label="Níveis">
          {NIVEIS_DA_AVALIACAO.map((cada) => (
            <li
              key={cada}
              className={estilos.nivel}
              data-marcado={cada === avaliacao.nivel || undefined}
            >
              <Nivel nivel={cada} />
            </li>
          ))}
        </ul>
        <p ref={resultado} tabIndex={-1} className={estilos.frase}>
          {avaliacao.minha
            ? `Você marcou: ${nome}. Obrigado!`
            : `O atendimento foi avaliado: ${nome}.`}
        </p>
      </section>
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (nivel === null || enviando) return;
    definirEnviando(true);
    avaliouAqui.current = true;
    const resposta = await avaliar(nivel, comentario);
    definirEnviando(false);
    if ('dados' in resposta) {
      definirRecusa({});
      return;
    }
    avaliouAqui.current = false;
    const campos = resposta.problema?.campos;
    definirRecusa(
      campos?.nivel || campos?.comentario
        ? { nivel: campos.nivel, comentario: campos.comentario }
        : { geral: resposta.erro },
    );
  }

  return (
    <section className={estilos.quadro} aria-labelledby={idDoTitulo}>
      {titulo}
      <form className={estilos.formulario} onSubmit={(evento) => void enviar(evento)}>
        <GrupoDeRadios
          rotulo="Como foi o atendimento?"
          ocultarRotulo
          value={nivel}
          onChange={(valor) => {
            if (ehNivel(valor)) definirNivel(valor);
            definirRecusa(({ comentario: doComentario }) => ({ comentario: doComentario }));
          }}
          erro={recusa.nivel}
          className={estilos.grupo}
        >
          {NIVEIS_DA_AVALIACAO.map((cada) => (
            <Radio key={cada} value={cada} className={estilos.nivel}>
              <Nivel nivel={cada} />
            </Radio>
          ))}
        </GrupoDeRadios>
        <p className={estilos.frase}>Só a TI vê a sua resposta.</p>
        <div className={estilos.linha}>
          <CampoDeTexto
            rotulo="Comentário (opcional)"
            placeholder="Quer deixar um comentário?"
            value={comentario}
            onChange={(texto) => {
              definirComentario(texto);
              definirRecusa(({ nivel: doNivel }) => ({ nivel: doNivel }));
            }}
            contador={{ maximo: LIMITE_DO_COMENTARIO }}
            erro={recusa.comentario}
            className={estilos.comentario}
          />
          <Botao
            type="submit"
            nivel="primario"
            isDisabled={nivel === null}
            carregando={enviando}
            rotuloCarregando="Enviando a avaliação"
          >
            Enviar avaliação
          </Botao>
        </div>
        {recusa.geral && <Recusa texto={recusa.geral} />}
      </form>
    </section>
  );
}
