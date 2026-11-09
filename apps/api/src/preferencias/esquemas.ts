// Os esquemas das preferências na API (design do F2c, decisões 1 e 3), montados das listas do
// domínio: a camada que a API devolve, já lida por `lerAjustes`, e a mudança que ela grava, como
// merge patch, em que `null` tira o campo ou a seção. A gravação é estrita: um campo desconhecido
// ou um valor fora do permitido recusa o pedido inteiro, com a mensagem no campo.
import {
  COLUNAS_DA_TELA_INICIAL,
  DENSIDADES,
  DESTAQUES_DA_ESCOLHA,
  fusoReconhecido,
  LIMITES_DAS_PREFERENCIAS,
  POSICOES_DO_DOCK,
  RESUMOS_POR_EMAIL,
  TEMAS_DA_ESCOLHA,
  TEMPOS_DO_AVISO,
  TONS,
  VISAO_DE_FABRICA,
} from '@grafite/domain';
import { z } from 'zod';

const inteiroEntre = ({ minimo, maximo }: { minimo: number; maximo: number }) =>
  z
    .number()
    .int({ error: 'Use um número inteiro.' })
    .min(minimo, { error: `Use de ${minimo} a ${maximo}.` })
    .max(maximo, { error: `Use de ${minimo} a ${maximo}.` });

const fuso = z.string().refine((valor) => valor === 'sistema' || fusoReconhecido(valor), {
  error: 'Use "sistema" ou um fuso horário reconhecido.',
});

/**
 * As visões fixadas no menu de cada tabela, na ordem da fixação (change visoes-no-dock): a lista
 * inteira, com o limite e o que a camada pode usar conferidos pela rota.
 */
const FixadasDasTabelas = z
  .object({
    ativos: z
      .array(z.uuid({ error: 'Fixe uma visão.' }))
      .max(100, { error: 'Fixe no máximo 20 visões.' })
      .optional(),
  })
  .strict();

/** A visão escolhida de uma tabela: a de fábrica ou o id de uma visão, conferido pela rota. */
const VisaoEscolhida = z.union([z.literal(VISAO_DE_FABRICA), z.uuid()], {
  error: 'Escolha uma visão.',
});

/** As entradas do tema Personalizado, gravadas inteiras (change tema-personalizado, design, decisão 1). */
const TemaPersonalizado = z
  .object({
    tom: z.enum(TONS, { error: 'Use escuro ou claro.' }),
    matiz: inteiroEntre(LIMITES_DAS_PREFERENCIAS.matiz),
    tingimento: inteiroEntre(LIMITES_DAS_PREFERENCIAS.percentual),
    contraste: inteiroEntre(LIMITES_DAS_PREFERENCIAS.percentual),
  })
  .strict();

/** As entradas do destaque Personalizado, gravadas inteiras. */
const DestaquePersonalizado = z
  .object({
    matiz: inteiroEntre(LIMITES_DAS_PREFERENCIAS.matiz),
    intensidade: inteiroEntre(LIMITES_DAS_PREFERENCIAS.percentual),
  })
  .strict();

const CAMPOS = {
  aparencia: {
    tema: z.enum(TEMAS_DA_ESCOLHA),
    destaque: z.enum(DESTAQUES_DA_ESCOLHA),
    densidade: z.enum(DENSIDADES),
    raio: inteiroEntre(LIMITES_DAS_PREFERENCIAS.raio),
    personalizado: TemaPersonalizado,
    destaquePersonalizado: DestaquePersonalizado,
  },
  dock: {
    posicao: z.enum(POSICOES_DO_DOCK),
    tamanho: inteiroEntre(LIMITES_DAS_PREFERENCIAS.tamanhoDoDock),
    ampliar: z.boolean(),
    ocultar: z.boolean(),
  },
  cursor: {
    tipo: z.enum(['suavizado', 'sistema']),
    suavizacao: inteiroEntre(LIMITES_DAS_PREFERENCIAS.suavizacao),
    abracar: z.boolean(),
  },
  notificacoes: {
    atencao: z.boolean(),
    informacao: z.boolean(),
    tempo: z.literal([...TEMPOS_DO_AVISO], { error: 'Use 6, 10 ou 20 s.' }),
    foco: z.boolean(),
    emailCritico: z.boolean(),
    resumo: z.enum(RESUMOS_POR_EMAIL, { error: 'Use desligado ou diario.' }),
    pushCritico: z.boolean(),
    pushAtencao: z.boolean(),
    pushInformacao: z.boolean(),
  },
  tabelas: {
    linhasAlternadas: z.boolean(),
    miniaturas: z.boolean(),
    resumoDaLinha: z.boolean(),
    /** A visão de cada tabela com visões, pelo id da tabela. */
    visoes: z.object({ ativos: VisaoEscolhida.optional() }).strict(),
    /** As visões que a conta fixou no menu; só as preferências da conta gravam. */
    fixadas: FixadasDasTabelas,
    /** As que a organização fixou no menu de todos; só os padrões gravam. */
    fixadasPelaOrganizacao: FixadasDasTabelas,
  },
  regiao: { fuso },
  inicio: {
    /** Os blocos do Início, na ordem, com os ocultos, gravados inteiros (change inicio-ajustavel). */
    blocos: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9.-]{1,40}$/, {
              error: 'Use letras minúsculas, números, ponto e hífen.',
            }),
            visivel: z.boolean(),
          })
          .strict(),
      )
      .max(LIMITES_DAS_PREFERENCIAS.blocosDoInicio, { error: 'Use até 20 blocos.' })
      .refine((lista) => new Set(lista.map((bloco) => bloco.id)).size === lista.length, {
        error: 'Não repita o bloco.',
      }),
    ordenacao: z
      .object({
        coluna: z.enum(COLUNAS_DA_TELA_INICIAL),
        direcao: z.enum(['crescente', 'decrescente']),
      })
      .strict(),
  },
  acessibilidade: {
    movimento: z.enum(['sistema', 'reduzido']),
    transparencia: z.enum(['sistema', 'reduzida']),
  },
} as const;

type Campos = typeof CAMPOS;

/** Uma seção com só alguns campos. */
const parcial = <T extends z.ZodRawShape>(forma: T) => z.object(forma).partial().strict();

/** Uma seção da mudança: cada campo pode vir com o valor novo ou com `null`, que o tira. */
function anulaveis<T extends z.ZodRawShape>(forma: T) {
  const campos = Object.fromEntries(
    Object.entries(forma).map(([campo, esquema]) => [
      campo,
      (esquema as z.ZodType).nullable().optional(),
    ]),
  ) as unknown as { [C in keyof T]: z.ZodOptional<z.ZodNullable<T[C]>> };
  return z.object(campos).strict();
}

/** Uma camada das preferências (a da organização ou a da conta), só com os campos mudados. */
export const AjustesDasPreferencias = z
  .object({
    aparencia: parcial(CAMPOS.aparencia).optional(),
    dock: parcial(CAMPOS.dock).optional(),
    cursor: parcial(CAMPOS.cursor).optional(),
    notificacoes: parcial(CAMPOS.notificacoes).optional(),
    tabelas: parcial(CAMPOS.tabelas).optional(),
    regiao: parcial(CAMPOS.regiao).optional(),
    inicio: parcial(CAMPOS.inicio).optional(),
    acessibilidade: parcial(CAMPOS.acessibilidade).optional(),
  })
  .strict()
  .meta({ id: 'AjustesDasPreferencias' });

const secaoDaMudanca = <S extends keyof Campos>(secao: S) =>
  anulaveis(CAMPOS[secao]).nullable().optional();

/** A mudança numa camada, como merge patch: o valor grava o campo, `null` o tira ou tira a seção. */
export const MudancaDasPreferencias = z
  .object({
    aparencia: secaoDaMudanca('aparencia'),
    dock: secaoDaMudanca('dock'),
    cursor: secaoDaMudanca('cursor'),
    notificacoes: secaoDaMudanca('notificacoes'),
    tabelas: secaoDaMudanca('tabelas'),
    regiao: secaoDaMudanca('regiao'),
    inicio: secaoDaMudanca('inicio'),
    acessibilidade: secaoDaMudanca('acessibilidade'),
  })
  .strict()
  .meta({ id: 'MudancaDasPreferencias' });
