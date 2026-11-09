import { normalizarTexto } from '@grafite/domain';
import {
  BuscaComSugestoes,
  criarDataHora,
  descreverFuso,
  Formulario,
  fusoDoSistema,
  listaDeFusos,
} from '@grafite/ui';
import { useEffect, useMemo, useState } from 'react';
import { vigiarOMinuto } from '../../../casca/status/relogio.ts';
import {
  RestaurarPadroes,
  TituloDaSecao,
  useAlvoDasPreferencias,
} from '../../../preferencias/alvo.tsx';
import estilos from './Secoes.module.css';

/**
 * Seção Idioma e região: o idioma da interface, como informação, e o fuso horário, que vale na
 * hora em toda a interface, com a data e a hora de agora no fuso em edição, no formato do relógio
 * da barra.
 */
export function SecaoIdiomaERegiao() {
  const { preferencias, mudar } = useAlvoDasPreferencias();
  const { fuso } = preferencias.regiao;
  const { formatarHorario } = useMemo(
    () => criarDataHora(fuso === 'sistema' ? undefined : fuso),
    [fuso],
  );
  const [agora, definirAgora] = useState(() => new Date());
  useEffect(() => vigiarOMinuto(() => definirAgora(new Date())), []);
  // A lista e a diferença para o UTC são as da abertura da seção: mudam só com o horário de verão.
  const [aberturaDaSecao] = useState(agora);
  const { opcoes, sugeridas } = useMemo(() => {
    const fusos = listaDeFusos(aberturaDaSecao);
    return {
      opcoes: [
        {
          id: 'sistema',
          rotulo: `Seguir o sistema (${descreverFuso(fusoDoSistema(), aberturaDaSecao).nome})`,
        },
        ...fusos.map(({ id, rotulo }) => ({ id, rotulo })),
      ],
      // O sistema e os fusos do Brasil abrem a lista (spec componentes-base, "Escolha com as
      // opções à vista").
      sugeridas: {
        ids: ['sistema', ...fusos.filter((item) => item.doBrasil).map((item) => item.id)],
      },
    };
  }, [aberturaDaSecao]);
  return (
    <>
      <TituloDaSecao>Idioma e região</TituloDaSecao>
      <Formulario aria-label="Idioma e região" onSubmit={(evento) => evento.preventDefault()}>
        <div className={estilos.grupoDeOpcoes}>
          <p className={estilos.rotuloDaInformacao}>Idioma</p>
          <p className={estilos.informacao}>Português (Brasil)</p>
        </div>

        <BuscaComSugestoes
          rotulo="Fuso horário"
          data-foco="fuso-horario"
          sugestoes={opcoes}
          sugeridas={sugeridas}
          // Os outros fusos seguem a ordem da diferença para o UTC, e não a alfabética.
          manterOrdem
          aceitaTextoLivre={false}
          selectedKey={fuso}
          // Apagar o texto não é escolher: o fuso só muda por uma das opções.
          onSelectionChange={(escolhido) => {
            if (escolhido !== null) mudar('regiao', { fuso: String(escolhido) });
          }}
          defaultFilter={(texto, busca) => normalizarTexto(texto).includes(normalizarTexto(busca))}
          descricao={`Agora: ${formatarHorario(agora)}`}
        />

        <div>
          <RestaurarPadroes secao="regiao" />
        </div>
      </Formulario>
    </>
  );
}
