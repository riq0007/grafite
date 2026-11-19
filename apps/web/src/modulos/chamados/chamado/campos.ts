// Os "Campos do tipo" do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "A linha do tempo, os campos do tipo e as seções guardadas (tarefa
// 5.14)"): o estado que a ficha dá, a contagem em texto, o que grava na hora, o pedido com os
// campos que mudaram e a confirmação da mudança que esconde um anexo, que sai na hora.
import {
  type CampoDoFormulario,
  camposVisiveis,
  type Formulario,
  nomeNoResumo,
  type RespostaDoCampo,
  type RespostasDoFormulario,
} from '@grafite/domain';
import type { Problema } from '../../../api/cliente.ts';
import type { FichaDoChamado } from '../consultas.ts';
import { type EstadoDoFormulario, respostaDoCampo } from '../formulario/estado.ts';

/** As respostas guardadas e o nome do que elas citam, como a ficha os traz. */
export function estadoDaFicha({
  respostas,
  citados,
  anexosDosCampos,
}: Pick<FichaDoChamado, 'respostas' | 'citados' | 'anexosDosCampos'>): EstadoDoFormulario {
  return {
    // A API manda as respostas como as guardou, conferidas pelo formulário do chamado.
    respostas: respostas as RespostasDoFormulario,
    citados: {
      ativos: new Map(
        citados.ativos.map(({ id, rotulo, patrimonio }) => [id, { rotulo, patrimonio }]),
      ),
      locais: new Map(citados.locais.map(({ id, caminho }) => [id, caminho])),
      pessoas: new Map(citados.pessoas.map(({ id, nome }) => [id, nome])),
      anexos: new Map(
        anexosDosCampos.map(({ id, nome, bytes }) => [
          id,
          { nome, bytes, onde: 'no-chamado' as const },
        ]),
      ),
    },
  };
}

const quantos = (numero: number, um: string, varios: string) =>
  `${numero.toLocaleString('pt-BR')} ${numero === 1 ? um : varios}`;

/** A contagem na cabeça da seção: "3 respondidos, 1 pendente", sem os pendentes quando não há. */
export function textoDaContagem({
  respondidos,
  pendentes,
}: {
  respondidos: number;
  pendentes: number;
}): string {
  const deRespondidos =
    respondidos === 0 ? 'Nenhum respondido' : quantos(respondidos, 'respondido', 'respondidos');
  return pendentes === 0
    ? deRespondidos
    : `${deRespondidos}, ${quantos(pendentes, 'pendente', 'pendentes')}`;
}

const GRAVAM_NA_HORA: ReadonlySet<CampoDoFormulario['tipo']> = new Set([
  'escolha-unica',
  'varias-opcoes',
  'sim-ou-nao',
  'ativo',
  'local',
  'pessoa',
  'anexo',
]);

/**
 * A escolha grava na hora, porque cada clique é uma decisão; o texto, o número e a data gravam ao
 * sair do campo, porque cada tecla não é uma decisão e cada gravação entra na auditoria.
 */
export const gravaNaHora = (tipo: CampoDoFormulario['tipo']): boolean => GRAVAM_NA_HORA.has(tipo);

const igual = (uma: unknown, outra: unknown) =>
  JSON.stringify(uma ?? null) === JSON.stringify(outra ?? null);

/**
 * O pedido do `PATCH /chamados/:numero/campos`: os campos que a conta mudou e que ficaram diferentes
 * do guardado, com o nulo para apagar. O que sumiu pela condição não vai: a API apaga o escondido.
 */
export function pedidoDosCampos(
  salvas: Readonly<RespostasDoFormulario>,
  atuais: Readonly<RespostasDoFormulario>,
  mudados: ReadonlySet<string>,
): Record<string, RespostaDoCampo | null> {
  return Object.fromEntries(
    [...mudados].flatMap((id) => {
      const atual = respostaDoCampo(atuais, id) ?? null;
      return igual(atual, respostaDoCampo(salvas, id)) ? [] : [[id, atual]];
    }),
  );
}

/**
 * A recusa de um pedido dos campos: o campo recusado fica fora dos próximos pedidos até a conta
 * mudá-lo de novo, porque a API confere o pedido inteiro, e a recusa repetida levaria junto a
 * mudança de outro campo. O outro campo do mesmo pedido, que a recusa levou junto, volta a esperar
 * a próxima gravação. A recusa que não diz o campo segura o pedido inteiro, para não se repetir.
 */
export function separarARecusa(
  pedido: Readonly<Record<string, unknown>>,
  erros: Readonly<Record<string, string>>,
): { recusados: string[]; deVolta: string[] } {
  const ids = Object.keys(pedido);
  const chaves = Object.keys(erros);
  const recusados = ids.filter((id) =>
    chaves.some((chave) => chave === `campos.${id}` || chave.startsWith(`campos.${id}.`)),
  );
  if (recusados.length === 0) return { recusados: ids, deVolta: [] };
  return { recusados, deVolta: ids.filter((id) => !recusados.includes(id)) };
}

/**
 * O que a falha de um pedido dos campos faz com a tela: a recusa que diz os campos, ou o formulário,
 * fica neles (`separarARecusa`); a recusa do pedido inteiro, como a do chamado resolvido por outra
 * conta, devolve a tela à ficha; sem resposta da API, ou no erro do servidor, nada foi recusado, e
 * o que a conta escreveu fica na tela e volta no próximo pedido.
 */
export type DestinoDaFalha = 'nos-campos' | 'a-ficha-vale' | 'tentar-de-novo';

export function destinoDaFalha(
  problema: Pick<Problema, 'status' | 'campos'> | null,
): DestinoDaFalha {
  if (!problema || problema.status >= 500) return 'tentar-de-novo';
  return Object.keys(problema.campos ?? {}).length > 0 ? 'nos-campos' : 'a-ficha-vale';
}

/** As respostas que a API tem depois do pedido aceito: o nulo apagou a resposta do campo. */
export function respostasGravadas(
  salvas: Readonly<RespostasDoFormulario>,
  pedido: Readonly<Record<string, RespostaDoCampo | null>>,
): RespostasDoFormulario {
  return Object.fromEntries([
    ...Object.entries(salvas).filter(([id]) => !Object.hasOwn(pedido, id)),
    ...Object.entries(pedido).flatMap(([id, resposta]) =>
      resposta === null ? [] : [[id, resposta] as const],
    ),
  ]);
}

/** O campo que a mudança mudou: o que aparece antes e depois, com outra resposta. */
export function campoQueMudou(
  formulario: Formulario,
  antes: Readonly<RespostasDoFormulario>,
  depois: Readonly<RespostasDoFormulario>,
): CampoDoFormulario | null {
  const deAntes = camposVisiveis(formulario, antes);
  const deDepois = camposVisiveis(formulario, depois);
  return (
    formulario.campos.find(
      (campo) =>
        deAntes.has(campo.id) &&
        deDepois.has(campo.id) &&
        !igual(respostaDoCampo(antes, campo.id), respostaDoCampo(depois, campo.id)),
    ) ?? null
  );
}

const arquivosDe = (resposta: RespostaDoCampo | undefined) =>
  Array.isArray(resposta) ? resposta.length : 0;

const entreAspas = (nome: string) => `“${nome}”`;

const LISTA = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

export interface ConfirmacaoDosAnexos {
  titulo: string;
  texto: string;
}

/**
 * A confirmação da mudança que esconde um campo Anexo com arquivo: a API apaga o arquivo na hora,
 * também o da resposta que o campo guardaria ao sumir. O nome vai depois de "o campo", porque o
 * artigo mudaria com o nome. Sem campo com arquivo que some, nula.
 */
export function confirmacaoDosAnexos(
  formulario: Formulario,
  antes: Readonly<RespostasDoFormulario>,
  depois: Readonly<RespostasDoFormulario>,
): ConfirmacaoDosAnexos | null {
  const deAntes = camposVisiveis(formulario, antes);
  const deDepois = camposVisiveis(formulario, depois);
  const somem = formulario.campos.filter(
    (campo) =>
      campo.tipo === 'anexo' &&
      deAntes.has(campo.id) &&
      !deDepois.has(campo.id) &&
      arquivosDe(respostaDoCampo(antes, campo.id)) > 0,
  );
  const mudou = campoQueMudou(formulario, antes, depois);
  if (somem.length === 0 || !mudou) return null;
  const arquivos = somem.reduce(
    (soma, campo) => soma + arquivosDe(respostaDoCampo(antes, campo.id)),
    0,
  );
  const nomes = LISTA.format(somem.map((campo) => entreAspas(nomeNoResumo(campo))));
  const apagados =
    arquivos === 1
      ? '1 arquivo é apagado'
      : `${arquivos.toLocaleString('pt-BR')} arquivos são apagados`;
  return {
    titulo: `Mudar o campo ${entreAspas(nomeNoResumo(mudou))}?`,
    texto:
      somem.length === 1
        ? `O campo ${nomes} some, e ${apagados}.`
        : `Os campos ${nomes} somem, e ${apagados}.`,
  };
}
