// A cor do toner do chamado (spec solicitacoes, "Solicitação pelo chamado"; change chamados-da-ti,
// design, decisão 11): a respondida no formulário, a mais baixa na última leitura válida dos
// suprimentos ou o preto, para o "Pedir toner" e para a solicitação gerada pelo tipo.
import type { TintaDoSuprimento } from '../coleta/impressoras.ts';
import {
  CORES_DE_CONSUMIVEL,
  type CorDeConsumivel,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
} from '../consumiveis/consumivel.ts';
import { normalizarTexto } from '../texto.ts';
import type { CampoDoFormulario } from './formulario.ts';

/** O que decide a cor: o formulário e as respostas do chamado, a impressora e a leitura dela. */
export interface CorDoTonerPedida {
  /** Os campos do formulário do chamado, na ordem. */
  campos: readonly Pick<CampoDoFormulario, 'id' | 'tipo' | 'opcoes'>[];
  /** As respostas do chamado, pelo id do campo. */
  respostas: Readonly<Record<string, unknown>>;
  /** As cores dos consumíveis compatíveis ativos da impressora; vazio, nenhum está cadastrado. */
  cores: readonly CorDeConsumivel[];
  /** O nível medido de cada suprimento na última leitura válida, com a tinta pela descrição. */
  leituras: readonly { tinta: TintaDoSuprimento | null; percentual: number }[];
}

/** A cor pelo nome, sem maiúsculas nem acentos, como "Preto" e "amárelo". */
const COR_PELO_NOME: ReadonlyMap<string, CorDeConsumivel> = new Map(
  CORES_DE_CONSUMIVEL.map((cor) => [normalizarTexto(ROTULOS_DAS_CORES_DE_CONSUMIVEL[cor]), cor]),
);

/**
 * A cor do toner: a da primeira escolha única, na ordem dos campos, cuja opção respondida tem o
 * nome de uma cor que a impressora usa; sem ela, a mais baixa da leitura, com o ciano, o magenta e
 * o amarelo da que só usa o colorido contados como ele e, no empate, a ordem das cores; e o preto.
 * Sem nenhum compatível cadastrado, a impressora é tratada como se usasse todas as cores.
 */
export function corDoToner({
  campos,
  respostas,
  cores,
  leituras,
}: CorDoTonerPedida): CorDeConsumivel {
  const usa = (cor: CorDeConsumivel) => cores.length === 0 || cores.includes(cor);

  for (const campo of campos) {
    if (campo.tipo !== 'escolha-unica') continue;
    const resposta = Object.hasOwn(respostas, campo.id) ? respostas[campo.id] : undefined;
    const opcao = campo.opcoes.find(({ id }) => id === resposta);
    const cor = opcao ? COR_PELO_NOME.get(normalizarTexto(opcao.texto)) : undefined;
    if (cor !== undefined && usa(cor)) return cor;
  }

  const daTinta = (tinta: TintaDoSuprimento): CorDeConsumivel | null => {
    if (usa(tinta)) return tinta;
    return tinta !== 'preto' && usa('colorido') ? 'colorido' : null;
  };
  let maisBaixa: { cor: CorDeConsumivel; percentual: number } | null = null;
  for (const { tinta, percentual } of leituras) {
    const cor = tinta === null ? null : daTinta(tinta);
    if (cor === null) continue;
    const antes =
      maisBaixa === null ||
      percentual < maisBaixa.percentual ||
      (percentual === maisBaixa.percentual &&
        CORES_DE_CONSUMIVEL.indexOf(cor) < CORES_DE_CONSUMIVEL.indexOf(maisBaixa.cor));
    if (antes) maisBaixa = { cor, percentual };
  }
  return maisBaixa?.cor ?? 'preto';
}
