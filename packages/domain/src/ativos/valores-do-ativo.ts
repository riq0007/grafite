// Os campos de um ativo e a conferência dos valores dele (spec cadastro-de-ativos; design do P1b,
// decisões 3 e 4): a mesma lista monta o formulário na tela e confere a gravação na API, com as
// recusas do motor de campos pela chave de cada campo.
import {
  type ConfiguracaoDoCampo,
  campoDeArquivo,
  ENVIE_PELA_FICHA,
  type TipoDeCampo,
  type ValorDeCampo,
  vazio,
} from '../campos/tipos.ts';
import { lerValor } from '../campos/valores.ts';
import { normalizarTexto } from '../texto.ts';
import { CAMPOS_DO_ATIVO, type ColunaDoCampoComum, GRUPOS_COMUNS } from './campos-do-ativo.ts';
import {
  CAPACIDADES,
  type CampoDoTipo,
  type Capacidade,
  type PoliticaDeEscrita,
  type SituacaoDoCadastro,
} from './catalogo.ts';

/** Um campo da organização, como o catálogo o guarda. */
export interface CampoNoCatalogo {
  id: string;
  rotulo: string;
  tipo: TipoDeCampo;
  grupo: string | null;
  configuracao: ConfiguracaoDoCampo;
  restrito: boolean;
  escrita: PoliticaDeEscrita;
  situacao: SituacaoDoCadastro;
}

/** De onde vem a definição: comum a todo ativo, da organização ou de uma capacidade. */
export type OrigemDaDefinicao = 'comum' | 'organizacao' | 'capacidade';

/** Um campo como o ativo o usa, com a chave do valor. */
export interface DefinicaoNoAtivo {
  chave: string;
  rotulo: string;
  tipo: TipoDeCampo;
  configuracao: ConfiguracaoDoCampo;
  grupo: string;
  obrigatorio: boolean;
  restrito: boolean;
  escrita: PoliticaDeEscrita;
  origem: OrigemDaDefinicao;
  coluna?: ColunaDoCampoComum;
  padrao?: ValorDeCampo;
}

export interface GrupoDoAtivo {
  /**
   * A chave estável do grupo (change cadastro-em-etapas, decisão 2): `identificacao`, `uso`,
   * `organizacao:<nome>`, `outros`, `capacidade:<chave>` ou `administrativo`. O nome pode repetir
   * entre um grupo da organização e uma capacidade; a chave, não.
   */
  chave: string;
  nome: string;
  campos: DefinicaoNoAtivo[];
}

export interface CamposDoAtivo {
  /** Na ordem da ficha: Identificação, Uso, os grupos do tipo, "Outros", as capacidades e o Administrativo. */
  grupos: GrupoDoAtivo[];
  porChave: Map<string, DefinicaoNoAtivo>;
  /** Os campos inativos que o tipo usa: fora do formulário, mas reconhecidos, pelo rótulo. */
  inativos: Map<string, string>;
}

/** O grupo dos campos da organização sem grupo. */
export const GRUPO_SEM_NOME = 'Outros';

const comoDefinicao = (campo: (typeof CAMPOS_DO_ATIVO)[number]): DefinicaoNoAtivo => ({
  chave: campo.chave,
  rotulo: campo.rotulo,
  tipo: campo.tipo,
  configuracao: campo.configuracao,
  grupo: campo.grupo,
  // O campo com valor padrão, como a situação de uso, nunca fica vazio.
  obrigatorio: campo.padrao !== undefined,
  restrito: false,
  escrita: campo.escrita,
  origem: 'comum',
  ...(campo.coluna ? { coluna: campo.coluna } : {}),
  ...(campo.padrao !== undefined ? { padrao: campo.padrao } : {}),
});

/**
 * Os campos que um ativo do tipo usa, em grupos, na ordem da ficha. Um campo da organização num
 * grupo com o nome de um grupo comum entra nele.
 */
export function camposDoAtivo({
  tipo,
  campos,
  capacidades = CAPACIDADES,
}: {
  tipo: { capacidades: readonly string[]; campos: readonly CampoDoTipo[] };
  campos: readonly CampoNoCatalogo[];
  capacidades?: readonly Capacidade[];
}): CamposDoAtivo {
  const comuns = new Map<string, DefinicaoNoAtivo[]>(
    GRUPOS_COMUNS.map((grupo) => [
      grupo,
      CAMPOS_DO_ATIVO.filter((campo) => campo.grupo === grupo).map(comoDefinicao),
    ]),
  );
  const comumPeloNome = new Map(GRUPOS_COMUNS.map((grupo) => [normalizarTexto(grupo), grupo]));
  const daOrganizacao = new Map<string, DefinicaoNoAtivo[]>();
  const semGrupo: DefinicaoNoAtivo[] = [];
  const inativos = new Map<string, string>();
  const porId = new Map(campos.map((campo) => [campo.id, campo]));

  for (const { campoId, obrigatorio } of tipo.campos) {
    const campo = porId.get(campoId);
    if (!campo) continue;
    if (campo.situacao === 'inativo') {
      inativos.set(campo.id, campo.rotulo);
      continue;
    }
    const nomeDoGrupo = campo.grupo?.trim() ? campo.grupo.trim() : null;
    const comum = nomeDoGrupo ? comumPeloNome.get(normalizarTexto(nomeDoGrupo)) : undefined;
    const definicao: DefinicaoNoAtivo = {
      chave: campo.id,
      rotulo: campo.rotulo,
      tipo: campo.tipo,
      configuracao: campo.configuracao,
      grupo: comum ?? nomeDoGrupo ?? GRUPO_SEM_NOME,
      obrigatorio,
      restrito: campo.restrito,
      escrita: campo.escrita,
      origem: 'organizacao',
    };
    if (comum) comuns.get(comum)?.push(definicao);
    else if (nomeDoGrupo) {
      const lista = daOrganizacao.get(nomeDoGrupo) ?? [];
      lista.push(definicao);
      daOrganizacao.set(nomeDoGrupo, lista);
    } else semGrupo.push(definicao);
  }

  const dasCapacidades = tipo.capacidades.flatMap((chave) => {
    const capacidade = capacidades.find((candidata) => candidata.chave === chave);
    if (!capacidade) return [];
    return [
      {
        chave: `capacidade:${capacidade.chave}`,
        nome: capacidade.nome,
        campos: capacidade.campos.map(
          (campo): DefinicaoNoAtivo => ({
            chave: campo.chave,
            rotulo: campo.rotulo,
            tipo: campo.tipo,
            configuracao: campo.configuracao,
            grupo: capacidade.nome,
            obrigatorio: false,
            restrito: false,
            escrita: campo.escrita,
            origem: 'capacidade',
          }),
        ),
      },
    ];
  });

  const grupos: GrupoDoAtivo[] = [
    { chave: 'identificacao', nome: 'Identificação', campos: comuns.get('Identificação') ?? [] },
    { chave: 'uso', nome: 'Uso', campos: comuns.get('Uso') ?? [] },
    ...[...daOrganizacao].map(([nome, lista]) => ({
      chave: `organizacao:${nome}`,
      nome,
      campos: lista,
    })),
    ...(semGrupo.length > 0 ? [{ chave: 'outros', nome: GRUPO_SEM_NOME, campos: semGrupo }] : []),
    ...dasCapacidades,
    {
      chave: 'administrativo',
      nome: 'Administrativo',
      campos: comuns.get('Administrativo') ?? [],
    },
  ];
  const porChave = new Map(
    grupos.flatMap((grupo) => grupo.campos.map((definicao) => [definicao.chave, definicao])),
  );
  return { grupos, porChave, inativos };
}

/** Dois valores guardados iguais: o mesmo texto ou número, ou a mesma lista na mesma ordem. */
export function valoresIguais(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, posicao) => item === b[posicao]);
  }
  return a === b;
}

const vazioGuardado = (valor: unknown) =>
  valor === null || valor === undefined || (Array.isArray(valor) && valor.length === 0);

export type ConferenciaDosValores =
  | { ok: true; mudancas: Record<string, ValorDeCampo | null> }
  | { ok: false; erros: Record<string, string> };

/**
 * Confere os valores pedidos para um ativo, pela chave de cada campo, e devolve só o que muda,
 * na forma em que é guardado (`null` esvazia o campo). Na edição, só as chaves pedidas são
 * conferidas, e um valor igual ao guardado não muda nada, nem é conferido de novo: uma opção
 * inativada continua até alguém mudá-la. No cadastro, os obrigatórios são cobrados e os campos com
 * valor padrão começam com ele.
 */
export function conferirValoresDoAtivo({
  campos,
  atuais,
  pedidos,
  cadastro,
}: {
  campos: CamposDoAtivo;
  atuais: Readonly<Record<string, unknown>>;
  pedidos: Readonly<Record<string, unknown>>;
  cadastro: boolean;
}): ConferenciaDosValores {
  const erros: Record<string, string> = {};
  const mudancas: Record<string, ValorDeCampo | null> = {};
  for (const [chave, pedido] of Object.entries(pedidos)) {
    const inativo = campos.inativos.get(chave);
    if (inativo !== undefined) {
      erros[chave] = `O campo ${inativo} está inativo.`;
      continue;
    }
    const definicao = campos.porChave.get(chave);
    if (!definicao) {
      erros[chave] = 'Este campo não é do tipo do ativo.';
      continue;
    }
    const atual = atuais[chave] ?? null;
    if (atual !== null && valoresIguais(pedido, atual)) continue;
    // O arquivo e a imagem mudam só pelo envio na ficha, que grava o arquivo junto com o valor.
    if (campoDeArquivo(definicao.tipo)) {
      erros[chave] = ENVIE_PELA_FICHA;
      continue;
    }
    const lido = lerValor(definicao, pedido);
    if (!lido.ok) {
      erros[chave] = lido.erro;
      continue;
    }
    if (lido.valor === null && definicao.obrigatorio) {
      erros[chave] = 'Preencha este campo.';
      continue;
    }
    if (vazioGuardado(lido.valor) && vazioGuardado(atual)) continue;
    if (valoresIguais(lido.valor, atual)) continue;
    mudancas[chave] = lido.valor;
  }
  if (cadastro) {
    for (const definicao of campos.porChave.values()) {
      if (definicao.chave in pedidos && !vazio(pedidos[definicao.chave])) continue;
      if (definicao.padrao !== undefined) {
        mudancas[definicao.chave] = definicao.padrao;
        delete erros[definicao.chave];
      } else if (definicao.obrigatorio) erros[definicao.chave] = 'Preencha este campo.';
    }
  }
  return Object.keys(erros).length > 0 ? { ok: false, erros } : { ok: true, mudancas };
}
