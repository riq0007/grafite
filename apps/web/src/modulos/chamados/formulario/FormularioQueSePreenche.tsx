// O formulário que se preenche (spec modulo-chamados, "Formulário que se preenche"; change
// chamados-da-ti, design, decisão 21): uma peça só para a gaveta da abertura, os "Campos do tipo"
// do chamado aberto e a prévia do colaborador. O `quem` diz qual dos três: os campos que aparecem,
// os que mudam e as rotas que as sugestões e a busca da pessoa usam. O estado é de quem usa a peça.
// O `visual` da aba, na prévia (decisão 16), numera as perguntas, cola a continuação à pergunta de
// que depende e põe as escolhas em cartões e em chips.
import type { Formulario, RespostaDoCampo } from '@grafite/domain';
import { AnexosDoCampo } from './AnexosDoCampo.tsx';
import type { PessoaDoFormulario } from './buscas.ts';
import { CampoQueSePreenche, type VisualDoFormulario } from './CampoQueSePreenche.tsx';
import {
  type CampoQueAparece,
  type Citado,
  type CitadosDoFormulario,
  camposQueAparecem,
  continuacoesDasPerguntas,
  descricaoDoCampo,
  type EstadoDoFormulario,
  numerosDasPerguntas,
  type QuemPreenche,
  responderNoEstado,
  respostaDoCampo,
  textoDaResposta,
} from './estado.ts';
import estilos from './Formulario.module.css';
import { Recusa } from './Recusa.tsx';

export interface PropsDoFormularioQueSePreenche {
  formulario: Formulario;
  /** As respostas e o nome do que elas citam. */
  estado: EstadoDoFormulario;
  /**
   * A mudança, pelo estado anterior, como o `set` do `useState`: um anexo termina de ir depois de
   * outras respostas. Aplicada na hora, como o `set`: adiada, o Número apaga o que se digita.
   */
  aoMudar: (mudar: (anterior: EstadoDoFormulario) => EstadoDoFormulario) => void;
  quem: QuemPreenche;
  /** A pessoa do chamado, de quem vêm as sugestões do Ativo e do Local; sem ela, nenhuma. */
  pessoa: PessoaDoFormulario | null;
  /** O número do chamado aberto, de onde os anexos dele baixam. */
  numero?: number;
  /** Tudo só para ler, a quem vê o chamado sem atender. */
  soLeitura?: boolean;
  /** As recusas, na chave do domínio: `campos.<id>` em cada campo e `formulario` no alto. */
  erros?: Readonly<Record<string, string>>;
  /**
   * O visual da tela, ou o da aba, na prévia do colaborador (decisão 16): as perguntas numeradas,
   * sem número no campo com condição, que se cola à pergunta de que depende quando vem logo depois
   * dela, e as escolhas em cartões e em chips.
   */
  visual?: VisualDoFormulario;
}

const idsDoAnexo = (resposta: RespostaDoCampo | undefined): readonly string[] =>
  Array.isArray(resposta) ? resposta : [];

export function FormularioQueSePreenche({
  formulario,
  estado,
  aoMudar,
  quem,
  pessoa,
  numero,
  soLeitura = false,
  erros = {},
  visual = 'tela',
}: PropsDoFormularioQueSePreenche) {
  /** A resposta nova pela anterior, que um envio acabado pode ter mudado. */
  const mudarResposta = (
    campoId: string,
    mudar: (anterior: RespostaDoCampo | undefined) => RespostaDoCampo | null,
    citados: readonly Citado[] = [],
  ) =>
    aoMudar((anterior) =>
      responderNoEstado(
        formulario,
        anterior,
        campoId,
        mudar(respostaDoCampo(anterior.respostas, campoId)),
        citados,
      ),
    );

  const geral = erros.formulario;
  const aparecem = camposQueAparecem(formulario, estado.respostas, quem, soLeitura);
  const naAba = visual === 'aba';
  const perguntas = naAba ? numerosDasPerguntas(aparecem) : [];
  const continuacoes = naAba ? continuacoesDasPerguntas(aparecem) : [];
  return (
    <div className={estilos.formulario} data-visual={visual}>
      {geral && <Recusa texto={geral} />}
      {aparecem.map((aparece, indice) => {
        const pergunta = perguntas[indice] ?? null;
        const continuacao = continuacoes[indice] ?? false;
        return (
          <div
            key={aparece.campo.id}
            data-campo={aparece.campo.id}
            // Na aba, o campo que se cola à pergunta de cima, como a continuação dela.
            data-continuacao={continuacao ? '' : undefined}
            className={estilos.campo}
          >
            {pergunta !== null && (
              // O número é desenho: o nome lido do campo é só o rótulo.
              <span className={estilos.numero} data-parte="numero" aria-hidden="true">
                {pergunta}
              </span>
            )}
            <Campo
              aparece={aparece}
              estado={estado}
              mudarResposta={mudarResposta}
              quem={quem}
              pessoa={pessoa}
              numero={numero}
              erro={erros[`campos.${aparece.campo.id}`]}
              visual={visual}
              continuacao={continuacao}
            />
          </div>
        );
      })}
    </div>
  );
}

interface PropsDoCampo {
  aparece: CampoQueAparece;
  estado: EstadoDoFormulario;
  mudarResposta: (
    campoId: string,
    mudar: (anterior: RespostaDoCampo | undefined) => RespostaDoCampo | null,
    citados?: readonly Citado[],
  ) => void;
  quem: QuemPreenche;
  pessoa: PessoaDoFormulario | null;
  numero?: number;
  erro?: string;
  visual: VisualDoFormulario;
  continuacao: boolean;
}

function Campo({
  aparece: { campo, editavel },
  estado,
  mudarResposta,
  quem,
  pessoa,
  numero,
  erro,
  visual,
  continuacao,
}: PropsDoCampo) {
  const resposta = respostaDoCampo(estado.respostas, campo.id);
  if (campo.tipo === 'anexo') {
    return (
      <AnexosDoCampo
        campo={campo}
        ids={idsDoAnexo(resposta)}
        anexos={estado.citados.anexos}
        editavel={editavel}
        quem={quem}
        numero={numero}
        erro={erro}
        aoAnexar={(id, anexo) =>
          mudarResposta(campo.id, (anterior) => [...idsDoAnexo(anterior), id], [
            { tipo: 'anexo', id, anexo },
          ])
        }
        aoTirar={(id) =>
          mudarResposta(campo.id, (anterior) =>
            idsDoAnexo(anterior).filter((outro) => outro !== id),
          )
        }
      />
    );
  }
  if (!editavel) {
    return (
      <RespostaParaLer campo={campo} resposta={resposta} citados={estado.citados} erro={erro} />
    );
  }
  return (
    <CampoQueSePreenche
      campo={campo}
      resposta={resposta}
      citados={estado.citados}
      responder={(nova, citados) => mudarResposta(campo.id, () => nova, citados)}
      quem={quem}
      pessoa={pessoa}
      erro={erro}
      visual={visual}
      continuacao={continuacao}
    />
  );
}

interface PropsDaRespostaParaLer {
  campo: PropsDoCampo['aparece']['campo'];
  resposta: RespostaDoCampo | undefined;
  citados: CitadosDoFormulario;
  erro?: string;
}

/** A resposta só para ler: o rótulo do campo e a resposta em texto, ou "Sem resposta". */
function RespostaParaLer({ campo, resposta, citados, erro }: PropsDaRespostaParaLer) {
  const texto = textoDaResposta(campo, resposta, citados);
  const descricao = descricaoDoCampo(campo);
  return (
    <>
      <dl className={estilos.paraLer}>
        <dt className={estilos.rotulo} data-parte="rotulo">
          {campo.rotulo}
        </dt>
        <dd className={estilos.resposta} data-vazia={texto === null ? '' : undefined}>
          {texto ?? 'Sem resposta'}
        </dd>
      </dl>
      {descricao && <p className={estilos.descricao}>{descricao}</p>}
      {erro && <Recusa texto={erro} />}
    </>
  );
}
