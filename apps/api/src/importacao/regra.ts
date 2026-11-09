// A regra da importação com os dados do banco (design do P1e, decisões 4 e 5): a base lida uma vez
// (o tipo, os campos, a identificação de cada ativo da organização, os locais, as pessoas e os
// modelos do tipo, com os nomes), o contexto que a regra da linha do domínio usa e a prévia, que
// planeja todas as linhas sem gravar nada. A tarefa da fila usa a mesma base e o mesmo contexto,
// relendo o ativo de cada linha na hora de gravar.
import { ativos, fornecedores, modelos, pessoas, type Transacao, tiposDeAtivo } from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  type AtivoAtual,
  type AtivoNoIndice,
  type CampoDaImportacao,
  type CamposDoAtivo,
  type Casamento,
  type Celula,
  type ContextoDaLinha,
  camposDaImportacao,
  camposDoAtivo,
  criarCasamento,
  criarReferencias,
  type EstadoDoCampo,
  identificacaoDaLinha,
  montarArvore,
  type PlanoDaLinha,
  planejarLinha,
  pode,
  podeEm,
  type ReferenciasPorTexto,
  rotuloDoAtivo,
} from '@grafite/domain';
import { eq, inArray } from 'drizzle-orm';
import { lerLocais } from '../arvore.ts';
import { camposDaOrganizacao, lerTipoDoAtivo } from '../ativos/escrita.ts';
import { doModelo, doTipo, valoresGuardados } from '../ativos/leitura.ts';

/** O tipo da importação, com os campos que o ativo dele usa. */
export interface TipoDaImportacao {
  id: string;
  nome: string;
  situacao: 'ativo' | 'inativo';
  definicoes: CamposDoAtivo;
}

/** O tipo e os campos dele, ou `null` se o tipo não existe. */
export async function lerTipoDaImportacao(
  tx: Transacao,
  tipoId: string,
): Promise<TipoDaImportacao | null> {
  const tipo = await lerTipoDoAtivo(tx, tipoId);
  if (!tipo) return null;
  return {
    id: tipo.id,
    nome: tipo.nome,
    situacao: tipo.situacao,
    definicoes: camposDoAtivo({ tipo, campos: await camposDaOrganizacao(tx) }),
  };
}

/** Os campos que as colunas podem receber, com os restritos para quem os vê em algum ramo. */
export const camposOferecidos = (tipo: TipoDaImportacao, acesso: Acesso): CampoDaImportacao[] =>
  camposDaImportacao(tipo.definicoes, { restritos: pode(acesso, 'ativos.restritos') });

/** O que a regra da linha precisa do banco, lido uma vez para a planilha inteira. */
export interface BaseDaImportacao {
  tipo: TipoDaImportacao;
  arvore: ArvoreDeLocais;
  /** A identificação de cada ativo da organização, para o casamento. */
  indice: AtivoNoIndice[];
  porId: Map<string, AtivoNoIndice>;
  localDoAtivo: Map<string, string | null>;
  referencias: ReferenciasPorTexto;
  /** O nome de cada pessoa, modelo do tipo e ativo, pelo id. */
  nomes: Map<string, string>;
  tipos: Map<string, string>;
}

export async function lerBaseDaImportacao(
  tx: Transacao,
  tipo: TipoDaImportacao,
): Promise<BaseDaImportacao> {
  const locais = await lerLocais(tx);
  const daOrganizacao = await tx
    .select({
      id: ativos.id,
      tipoId: ativos.tipoId,
      situacao: ativos.situacao,
      nome: ativos.nome,
      patrimonio: ativos.patrimonio,
      serie: ativos.serie,
      hostname: ativos.hostname,
      localId: ativos.localId,
      tipo: tiposDeAtivo.nome,
      fabricante: modelos.fabricante,
      modelo: modelos.nome,
    })
    .from(ativos)
    .innerJoin(tiposDeAtivo, doTipo)
    .leftJoin(modelos, doModelo);
  const indice = daOrganizacao.map(
    (ativo): AtivoNoIndice => ({
      id: ativo.id,
      tipoId: ativo.tipoId,
      tipo: ativo.tipo,
      nome: rotuloDoAtivo({
        nome: ativo.nome,
        modelo:
          ativo.fabricante && ativo.modelo
            ? { fabricante: ativo.fabricante, nome: ativo.modelo }
            : null,
        tipo: { nome: ativo.tipo },
      }),
      situacao: ativo.situacao,
      patrimonio: ativo.patrimonio,
      serie: ativo.serie,
      hostname: ativo.hostname,
    }),
  );
  const daPessoa = await tx
    .select({
      id: pessoas.id,
      nome: pessoas.nome,
      email: pessoas.email,
      matricula: pessoas.matricula,
      situacao: pessoas.situacao,
    })
    .from(pessoas);
  const doTipoDaImportacao = await tx
    .select({
      id: modelos.id,
      fabricante: modelos.fabricante,
      nome: modelos.nome,
      situacao: modelos.situacao,
    })
    .from(modelos)
    .where(eq(modelos.tipoId, tipo.id));
  const tipos = await tx
    .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
    .from(tiposDeAtivo);
  // O fornecedor pelo CNPJ ou pelo nome, entre os ativos (change p4a-fornecedores, design, decisão 3).
  const dosFornecedores = await tx
    .select({
      id: fornecedores.id,
      nome: fornecedores.nome,
      cnpj: fornecedores.cnpj,
      situacao: fornecedores.situacao,
    })
    .from(fornecedores);

  const nomes = new Map<string, string>();
  for (const pessoa of daPessoa) nomes.set(pessoa.id, pessoa.nome);
  for (const modelo of doTipoDaImportacao)
    nomes.set(modelo.id, `${modelo.fabricante} ${modelo.nome}`);
  for (const ativo of indice) nomes.set(ativo.id, ativo.nome);
  for (const fornecedor of dosFornecedores) {
    nomes.set(
      fornecedor.id,
      fornecedor.situacao === 'ativo' ? fornecedor.nome : `${fornecedor.nome} (inativo)`,
    );
  }

  return {
    tipo,
    arvore: montarArvore(locais),
    indice,
    porId: new Map(indice.map((ativo) => [ativo.id, ativo])),
    localDoAtivo: new Map(daOrganizacao.map((ativo) => [ativo.id, ativo.localId])),
    referencias: criarReferencias({
      locais,
      pessoas: daPessoa.filter((pessoa) => pessoa.situacao === 'ativa'),
      modelos: doTipoDaImportacao.filter((modelo) => modelo.situacao === 'ativo'),
      fornecedores: dosFornecedores.filter((fornecedor) => fornecedor.situacao === 'ativo'),
    }),
    nomes,
    tipos: new Map(tipos.map((um) => [um.id, um.nome])),
  };
}

/** O contexto da regra da linha, com o acesso de quem importa. */
export function contextoDaLinha(
  base: BaseDaImportacao,
  {
    mapeamento,
    casamento,
    acesso,
  }: { mapeamento: readonly (string | null)[]; casamento: Casamento; acesso: Acesso },
): ContextoDaLinha {
  const { arvore } = base;
  return {
    definicoes: base.tipo.definicoes,
    mapeamento,
    referencias: base.referencias,
    casamento,
    nomeDoTipo: (id) => base.tipos.get(id),
    nomeDoRegistro: (id) => (arvore.local(id) ? arvore.caminho(id) : base.nomes.get(id)),
    caminhoDoLocal: (id) => arvore.caminho(id),
    acesso: {
      editaEm: (localId) => podeEm(acesso, 'ativos.editar', localId, arvore),
      restritosEm: (localId) => podeEm(acesso, 'ativos.restritos', localId, arvore),
    },
  };
}

/** O ativo guardado, como a regra da linha o compara. */
export const ativoAtual = (ativo: typeof ativos.$inferSelect): AtivoAtual => ({
  id: ativo.id,
  localId: ativo.localId,
  modeloId: ativo.modeloId,
  valores: valoresGuardados(ativo),
  estado: ativo.estado as Record<string, EstadoDoCampo>,
});

/** O ativo novo de uma linha, como o casamento das linhas seguintes o conhece. */
export function ativoNovoNoIndice(
  base: BaseDaImportacao,
  id: string,
  plano: PlanoDaLinha,
): AtivoNoIndice {
  const valores = plano.pedido.valores;
  const texto = (chave: string) => {
    const valor = valores[chave];
    return typeof valor === 'string' ? valor : null;
  };
  return {
    id,
    tipoId: base.tipo.id,
    tipo: base.tipo.nome,
    nome: rotuloDoAtivo({ nome: texto('ativo.nome'), modelo: null, tipo: base.tipo }),
    situacao: 'ativo',
    patrimonio: texto('ativo.patrimonio'),
    serie: texto('ativo.serie'),
    hostname: texto('ativo.hostname'),
  };
}

export interface LinhaDaPlanilhaGuardada {
  linha: number;
  celulas: Celula[];
}

/**
 * A prévia: o plano de cada linha, na ordem, sem gravar nada. Os ativos que alguma linha casa são
 * lidos inteiros numa consulta só, e o ativo novo de cada linha entra no casamento das seguintes.
 */
export async function planejarImportacao(
  tx: Transacao,
  base: BaseDaImportacao,
  {
    conteudo,
    mapeamento,
    acesso,
  }: {
    conteudo: readonly LinhaDaPlanilhaGuardada[];
    mapeamento: readonly (string | null)[];
    acesso: Acesso;
  },
): Promise<PlanoDaLinha[]> {
  const ensaio = criarCasamento(base.indice, base.tipo.id);
  const casados = new Set<string>();
  for (const { linha, celulas } of conteudo) {
    const casamento = ensaio.casar(linha, identificacaoDaLinha(celulas, mapeamento));
    if (casamento.tipo === 'casado') casados.add(casamento.ativo.id);
  }
  const lidos =
    casados.size > 0
      ? await tx
          .select()
          .from(ativos)
          .where(inArray(ativos.id, [...casados]))
      : [];
  const atuais = new Map(lidos.map((ativo) => [ativo.id, ativoAtual(ativo)]));

  const casamento = criarCasamento(base.indice, base.tipo.id);
  const contexto = contextoDaLinha(base, { mapeamento, casamento, acesso });
  return conteudo.map(({ linha, celulas }) => {
    const casado = casamento.casar(linha, identificacaoDaLinha(celulas, mapeamento));
    const atual = casado.tipo === 'casado' ? (atuais.get(casado.ativo.id) ?? null) : null;
    const plano = planejarLinha(linha, celulas, casado, atual, contexto);
    if (plano.acao === 'novo') {
      casamento.acrescentar(linha, ativoNovoNoIndice(base, `linha-${linha}`, plano));
    }
    return plano;
  });
}

/** Os totais das ações das linhas. */
export function totaisDos(planos: readonly Pick<PlanoDaLinha, 'acao'>[]) {
  const totais = { novos: 0, alterados: 0, semMudanca: 0, comErro: 0 };
  for (const { acao } of planos) {
    if (acao === 'novo') totais.novos += 1;
    else if (acao === 'alterar') totais.alterados += 1;
    else if (acao === 'sem-mudanca') totais.semMudanca += 1;
    else totais.comErro += 1;
  }
  return totais;
}
