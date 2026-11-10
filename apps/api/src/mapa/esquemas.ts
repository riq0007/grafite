// Os esquemas do mapa da planta pela API (spec mapa-da-planta; change p7-mapa-da-planta, design,
// decisões 1, 3 e 4): a planta, o modelo navegável, os marcadores das camadas e a posição.
import { z } from 'zod';

export const PlantaDoMapa = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    local: z.object({ id: z.uuid(), caminho: z.string() }).nullable(),
    largura: z.number().nullable(),
    profundidade: z.number().nullable(),
    situacao: z.enum(['convertendo', 'ativa', 'falhou', 'inativa']),
    /**
     * Quantas posições a planta tem, de tudo o que está nela, para quem edita o mapa: a exclusão
     * diz quantas saem. Para quem só vê o mapa, `null`.
     */
    posicoes: z.number().int().min(0).nullable(),
    erro: z.string().nullable(),
    fonte: z.string(),
    contagens: z
      .object({
        segmentos: z.number().int(),
        rotulos: z.number().int(),
        camadas: z.number().int(),
        maquinas: z.number().int(),
      })
      .nullable(),
    criadaEm: z.string(),
  })
  .meta({ id: 'PlantaDoMapa' });

export const ListaDePlantas = z
  .object({ plantas: z.array(PlantaDoMapa), podeEditar: z.boolean() })
  .meta({ id: 'ListaDePlantas' });

export const ModeloDaPlanta = z
  .object({
    largura: z.number(),
    profundidade: z.number(),
    camadas: z.array(z.object({ nome: z.string(), segmentos: z.array(z.number()) })),
    paredes: z.array(
      z.object({
        nome: z.string(),
        pontos: z.array(z.tuple([z.number(), z.number()])),
        altura: z.number(),
      }),
    ),
    rotulos: z.array(z.object({ texto: z.string(), x: z.number(), z: z.number() })),
    maquinas: z.array(
      z.object({
        nome: z.string(),
        x: z.number(),
        z: z.number(),
        largura: z.number(),
        profundidade: z.number(),
      }),
    ),
  })
  .meta({ id: 'ModeloDaPlanta' });

export const MarcadorDoMapa = z
  .object({
    alvo: z.object({ tipo: z.string(), id: z.uuid() }),
    /** A camada do módulo, como "Ativos", que o mapa liga e desliga. */
    camada: z.string(),
    rotulo: z.string(),
    /** Uma linha a mais no resumo, como o patrimônio. */
    detalhe: z.string().nullable(),
    x: z.number(),
    z: z.number(),
    situacao: z.object({
      texto: z.string(),
      tom: z.enum(['critico', 'atencao', 'sucesso', 'neutra', 'info']),
    }),
    acoes: z.array(z.object({ rotulo: z.string(), destino: z.string() })),
  })
  .meta({ id: 'MarcadorDoMapa' });

export const MarcadoresDoMapa = z
  .object({
    marcadores: z.array(MarcadorDoMapa),
    /** As camadas dos módulos que têm fornecedor, na ordem do registro. */
    camadas: z.array(z.string()),
    /** O tipo do alvo de cada camada, que quem edita o mapa posiciona: o ativo, a sala, o painel. */
    posicionaveis: z.array(z.object({ tipo: z.string(), camada: z.string() })),
    podeEditar: z.boolean(),
  })
  .meta({ id: 'MarcadoresDoMapa' });

export const ParametrosDaPlanta = z.object({ id: z.uuid() });

export const ParametrosDaPosicao = z.object({
  id: z.uuid(),
  tipo: z.string().max(40),
  alvo: z.uuid(),
});

export const PedidoDePosicao = z
  .object({
    alvo: z.object({ tipo: z.string().max(40), id: z.uuid() }),
    x: z.number({ error: 'Escolha o ponto no mapa.' }),
    z: z.number({ error: 'Escolha o ponto no mapa.' }),
  })
  .meta({ id: 'PedidoDePosicao' });

export const PedidoDaPlanta = z
  .object({
    nome: z.string().max(80).optional(),
    local: z.uuid().nullable().optional(),
    situacao: z.enum(['ativa', 'inativa']).optional(),
  })
  .meta({ id: 'PedidoDaPlanta' });

export const EnvioDaPlanta = z.object({
  nome: z.string().min(1, { error: 'Dê um nome à planta.' }).max(80),
  fonte: z.string().max(200).optional(),
});

/** O arquivo que substitui o desenho de uma planta: o nome dele vai na consulta, como no cadastro. */
export const EnvioDoDesenho = z.object({
  fonte: z.string().max(200).optional(),
});

/** A planta com o desenho novo e quantas posições ficaram fora da área dele. */
export const SubstituicaoDoDesenho = z
  .object({
    planta: PlantaDoMapa,
    posicoesFora: z.number().int().min(0),
  })
  .meta({ id: 'SubstituicaoDoDesenho' });
