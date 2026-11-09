// A escrita dos ativos (spec cadastro-de-ativos; design do P1b, decisões 4 a 9): os valores
// conferidos pelo domínio, o modelo do tipo, as referências ativas, o escopo pelo local de antes e
// de depois, os restritos, o estado e as travas de cada campo, o patrimônio único, a auditoria com o
// antes → depois pelos rótulos e o evento. Quem grava (design do P1e, decisão 6) diz a conta, o
// acesso, a origem dos valores e o rastreio: a tela grava pela sessão, e a importação, pela conta que
// importou, fora da requisição.
import {
  ativos,
  campos,
  camposDoTipo,
  fornecedores,
  modelos,
  pessoas,
  type Transacao,
  tiposDeAtivo,
} from '@grafite/db';
import {
  type Acesso,
  type ArvoreDeLocais,
  aplicarTravas,
  CAMPOS_DO_ATIVO,
  type CampoNoCatalogo,
  type CamposDoAtivo,
  CHAVE_DO_MODELO,
  camposDoAtivo,
  conferirValoresDoAtivo,
  type EstadoDoCampo,
  MENSAGEM_DO_FORNECEDOR_INATIVO,
  mensagemDosTiposAceitos,
  mostrarValor,
  normalizarTexto,
  type OrigemDoValor,
  type Permissao,
  podeEm,
  podeGravar,
  registrarGravacao,
  type TipoDeCampo,
  type ValorDeCampo,
} from '@grafite/domain';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { RecusaDePermissao, sessaoDa } from '../acesso/escopo.ts';
import { exigirLocalAtivo } from '../arvore.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { saidaDoAtivo } from '../eventos/ativos.ts';
import { conflito, dadosInvalidos } from '../problemas.ts';
import { origemDa } from '../rotas/sessao.ts';
import { type LinhaDoAtivo, referenciasDos, valoresGuardados } from './leitura.ts';

export const PATRIMONIO_REPETIDO = 'Já existe um ativo com este patrimônio.';
const MODELO_INATIVO = 'O modelo escolhido está inativo. Escolha um modelo ativo.';
const PESSOA_INATIVA = 'A pessoa escolhida está inativa. Escolha uma pessoa ativa.';
const ATIVO_INATIVO = 'O ativo escolhido está inativo.';
const O_PROPRIO_ATIVO = 'Um ativo não pode se referir a si mesmo.';

/** Os tipos de campo cujo valor entra na busca da lista, quando o campo não é restrito. */
const TIPOS_DA_BUSCA = new Set<TipoDeCampo>(['texto', 'ip', 'mac', 'url', 'licenca']);

/** Quem grava o ativo: a conta, o acesso dela, a origem dos valores e de onde veio o pedido. */
export interface QuemGrava {
  contaId: string;
  acesso: Acesso;
  /** A tela grava `manual`, e a importação, `planilha`. */
  origem: OrigemDoValor;
  /** O IP e o código de rastreio da requisição, para a auditoria; a tarefa da fila não tem. */
  rastreio: { ip?: string | null; codigoDeRastreio?: string | null } | null;
  /** A importação que grava, para os dados da auditoria. */
  importacao?: { id: string; arquivo: string };
  /**
   * O autor de sistema, como o "Agente do GLPI" (change inventario-pelo-agente-glpi): a auditoria
   * leva o ator de sistema, o estado não tem a conta, e a gravação não confere permissões. Ele só
   * cria computadores quando o cadastro pelo agente está configurado; nas atualizações, o
   * chamador preserva o local administrativo.
   */
  sistema?: string;
}

/** Quem grava pela tela: a conta da sessão, com o acesso dela, e a origem manual. */
export function quemGravaPela(requisicao: FastifyRequest): QuemGrava {
  const sessao = sessaoDa(requisicao);
  return {
    contaId: sessao.contaId,
    acesso: sessao.acesso,
    origem: 'manual',
    rastreio: origemDa(requisicao),
  };
}

/** A permissão no local, pelo acesso de quem grava, com a mesma recusa da requisição. */
function exigirDe(
  quem: QuemGrava,
  permissao: Permissao,
  localId: string | null,
  arvore: ArvoreDeLocais,
) {
  if (quem.sistema) return;
  if (!podeEm(quem.acesso, permissao, localId, arvore)) throw new RecusaDePermissao(permissao);
}

/** O ator da auditoria: a conta, ou o sistema que grava. */
const atorDe = (quem: QuemGrava) =>
  quem.sistema
    ? ({ tipo: 'sistema', descricao: quem.sistema } as const)
    : ({ tipo: 'conta', contaId: quem.contaId } as const);

/** O que a auditoria guarda de quem grava: o rastreio e a importação, quando houver. */
const daAuditoria = (quem: QuemGrava) => ({
  ...(quem.rastreio ? { origem: quem.rastreio } : {}),
  ...(quem.importacao ? { dados: { importacao: quem.importacao } } : {}),
});

export interface PedidoDeGravacao {
  /** O modelo: `null` tira, e a ausência mantém. */
  modeloId?: string | null;
  valores?: Readonly<Record<string, unknown>>;
  travas?: Readonly<Record<string, boolean>>;
}

/** O tipo do ativo, com as capacidades e a lista de campos, em ordem. */
export async function lerTipoDoAtivo(tx: Transacao, tipoId: string) {
  const [tipo] = await tx
    .select({
      id: tiposDeAtivo.id,
      nome: tiposDeAtivo.nome,
      capacidades: tiposDeAtivo.capacidades,
      situacao: tiposDeAtivo.situacao,
    })
    .from(tiposDeAtivo)
    .where(eq(tiposDeAtivo.id, tipoId));
  if (!tipo) return null;
  const lista = await tx
    .select({ campoId: camposDoTipo.campoId, obrigatorio: camposDoTipo.obrigatorio })
    .from(camposDoTipo)
    .where(eq(camposDoTipo.tipoId, tipoId))
    .orderBy(asc(camposDoTipo.ordem));
  return { ...tipo, campos: lista };
}

/** Os campos da organização, como o domínio os usa. */
export async function camposDaOrganizacao(tx: Transacao): Promise<CampoNoCatalogo[]> {
  const linhas = await tx
    .select({
      id: campos.id,
      rotulo: campos.rotulo,
      tipo: campos.tipo,
      grupo: campos.grupo,
      configuracao: campos.configuracao,
      restrito: campos.restrito,
      escrita: campos.escrita,
      situacao: campos.situacao,
    })
    .from(campos);
  return linhas.map((linha) => ({
    ...linha,
    configuracao: linha.configuracao as CampoNoCatalogo['configuracao'],
  }));
}

const prefixar = (prefixo: string, erros: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(erros).map(([chave, motivo]) => [`${prefixo}${chave}`, motivo]),
  );

/** A recusa do ativo de um tipo que o campo não aceita, com os nomes dos aceitos, na ordem dele. */
async function recusaDosTiposAceitos(tx: Transacao, aceitos: readonly string[]): Promise<string> {
  const linhas = await tx
    .select({ id: tiposDeAtivo.id, nome: tiposDeAtivo.nome })
    .from(tiposDeAtivo)
    .where(inArray(tiposDeAtivo.id, [...aceitos]));
  const nomes = new Map(linhas.map((linha) => [linha.id, linha.nome]));
  return mensagemDosTiposAceitos(
    aceitos.flatMap((id) => {
      const nome = nomes.get(id);
      return nome ? [nome] : [];
    }),
  );
}

/**
 * As referências que mudaram: o local, a pessoa, o fornecedor e o ativo existem e estão ativos, e o ativo é de um
 * tipo que o campo aceita. O valor igual ao guardado não chega aqui: o escolhido antes de os tipos
 * aceitos mudarem continua.
 */
async function conferirReferencias(
  tx: Transacao,
  mudancas: Readonly<Record<string, ValorDeCampo | null>>,
  definicoes: CamposDoAtivo,
  ativoId: string | null,
) {
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor === null) continue;
    const tipo = definicoes.porChave.get(chave)?.tipo;
    const campo = `valores.${chave}`;
    const id = String(valor);
    if (tipo === 'local') await exigirLocalAtivo(tx, id, campo);
    if (tipo === 'pessoa') {
      const [pessoa] = await tx
        .select({ situacao: pessoas.situacao })
        .from(pessoas)
        .where(eq(pessoas.id, id))
        .for('share');
      if (!pessoa) throw dadosInvalidos({ [campo]: 'Pessoa não encontrada.' });
      if (pessoa.situacao !== 'ativa') throw conflito(PESSOA_INATIVA, { [campo]: PESSOA_INATIVA });
    }
    if (tipo === 'fornecedor') {
      const [fornecedor] = await tx
        .select({ situacao: fornecedores.situacao })
        .from(fornecedores)
        .where(eq(fornecedores.id, id))
        .for('share');
      if (!fornecedor) throw dadosInvalidos({ [campo]: 'Fornecedor não encontrado.' });
      if (fornecedor.situacao !== 'ativo') {
        throw conflito(MENSAGEM_DO_FORNECEDOR_INATIVO, { [campo]: MENSAGEM_DO_FORNECEDOR_INATIVO });
      }
    }
    if (tipo === 'ativo') {
      if (id === ativoId) throw dadosInvalidos({ [campo]: O_PROPRIO_ATIVO });
      const [outro] = await tx
        .select({ situacao: ativos.situacao, tipoId: ativos.tipoId })
        .from(ativos)
        .where(eq(ativos.id, id))
        .for('share');
      if (!outro) throw dadosInvalidos({ [campo]: 'Ativo não encontrado.' });
      if (outro.situacao !== 'ativo') throw conflito(ATIVO_INATIVO, { [campo]: ATIVO_INATIVO });
      const aceitos = definicoes.porChave.get(chave)?.configuracao.tipos ?? [];
      if (aceitos.length > 0 && !aceitos.includes(outro.tipoId)) {
        throw dadosInvalidos({ [campo]: await recusaDosTiposAceitos(tx, aceitos) });
      }
    }
  }
}

/** O texto da busca: os valores de texto, IP, MAC, URL e licença dos campos que não são restritos. */
export function textoDeBuscaDoAtivo(
  valores: Readonly<Record<string, ValorDeCampo>>,
  definicoes: CamposDoAtivo,
): string {
  const partes = Object.entries(valores).flatMap(([chave, valor]) => {
    const definicao = definicoes.porChave.get(chave);
    return definicao && !definicao.restrito && TIPOS_DA_BUSCA.has(definicao.tipo)
      ? [String(valor)]
      : [];
  });
  return normalizarTexto(partes.join(' '));
}

/**
 * O que a auditoria guarda de um ativo: o tipo, o modelo, a situação, cada campo pelo rótulo e pelo
 * valor mostrado, com as referências pelo nome, os campos travados, na ordem da ficha, e os rótulos
 * dos campos restritos que estão na visão, para o histórico escondê-los de quem não os vê.
 */
export async function visaoDoAtivo(
  tx: Transacao,
  linha: LinhaDoAtivo,
  definicoes: CamposDoAtivo,
  arvore: ArvoreDeLocais,
) {
  const valores = valoresGuardados(linha.ativo);
  const referencias = await referenciasDos(
    tx,
    valores,
    (chave) => definicoes.porChave.get(chave)?.tipo,
    arvore,
    () => true,
  );
  const nomeDoRegistro = (id: string) =>
    referencias.pessoas[id] ??
    referencias.locais[id] ??
    referencias.ativos[id] ??
    referencias.arquivos[id]?.nome;
  const camposDaVisao: Record<string, string> = {};
  const travados: string[] = [];
  const restritos: string[] = [];
  const estado = linha.ativo.estado as Record<string, EstadoDoCampo>;
  if (estado[CHAVE_DO_MODELO]?.trava) travados.push('Modelo');
  for (const grupo of definicoes.grupos) {
    for (const definicao of grupo.campos) {
      const valor = valores[definicao.chave];
      const travado = estado[definicao.chave]?.trava ?? false;
      if (valor !== undefined) {
        camposDaVisao[definicao.rotulo] = mostrarValor(definicao, valor, nomeDoRegistro);
      }
      if (travado) travados.push(definicao.rotulo);
      if (definicao.restrito && (valor !== undefined || travado)) restritos.push(definicao.rotulo);
    }
  }
  return {
    tipo: linha.tipo.nome,
    modelo: linha.modelo ? `${linha.modelo.fabricante} ${linha.modelo.nome}` : null,
    situacao: linha.ativo.situacao,
    campos: camposDaVisao,
    travados,
    restritos,
  };
}

/** A gravação do ativo, com o patrimônio repetido como recusa no campo. */
async function semPatrimonioRepetido<T>(gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar();
  } catch (erro) {
    if (violouUnicidade(erro, 'ativos_patrimonio_unico')) {
      throw conflito(PATRIMONIO_REPETIDO, { 'valores.ativo.patrimonio': PATRIMONIO_REPETIDO });
    }
    throw erro;
  }
}

type ColunasDoAtivo = Partial<typeof ativos.$inferInsert>;

/**
 * Confere e grava o cadastro (`atual` nulo) ou a edição de um ativo. A rota já conferiu
 * `ativos.editar` no local atual; aqui vão o local novo e os restritos. A origem que não é a manual
 * não muda o campo travado nem o só manual, nem as travas. Devolve o id e se algo mudou: a edição
 * sem mudança não grava, nem audita.
 */
export async function gravarAtivo(
  tx: Transacao,
  {
    quem,
    arvore,
    momento,
    atual,
    tipoId,
    pedido,
    lerLinha,
  }: {
    quem: QuemGrava;
    arvore: ArvoreDeLocais;
    momento: Date;
    atual: LinhaDoAtivo | null;
    tipoId: string;
    pedido: PedidoDeGravacao;
    /** A linha gravada, com o tipo, o modelo e o responsável, para a auditoria. */
    lerLinha: (id: string) => Promise<LinhaDoAtivo>;
  },
): Promise<{ id: string; mudou: boolean }> {
  const cadastro = atual === null;
  const tipo = await lerTipoDoAtivo(tx, tipoId);
  if (!tipo) throw dadosInvalidos({ tipoId: 'Tipo de ativo não encontrado.' });
  if (cadastro && tipo.situacao === 'inativo') {
    const motivo = `O tipo ${tipo.nome} está inativo.`;
    throw conflito(motivo, { tipoId: motivo });
  }
  const definicoes = camposDoAtivo({ tipo, campos: await camposDaOrganizacao(tx) });
  const atuais = atual ? valoresGuardados(atual.ativo) : {};
  const estadoAtual = (atual?.ativo.estado as Record<string, EstadoDoCampo> | undefined) ?? {};

  // A origem que não é a manual pula o campo travado e o só manual, e não mexe nas travas.
  const manual = quem.origem === 'manual';
  const pedidos = manual
    ? (pedido.valores ?? {})
    : Object.fromEntries(
        Object.entries(pedido.valores ?? {}).filter(([chave]) => {
          const definicao = definicoes.porChave.get(chave);
          return !definicao || podeGravar(definicao, estadoAtual[chave], quem.origem);
        }),
      );
  const modeloPedido =
    manual || podeGravar({ escrita: 'automatica' }, estadoAtual[CHAVE_DO_MODELO], quem.origem)
      ? pedido.modeloId
      : undefined;

  const conferida = conferirValoresDoAtivo({
    campos: definicoes,
    atuais,
    pedidos,
    cadastro,
  });
  if (!conferida.ok) throw dadosInvalidos(prefixar('valores.', conferida.erros));
  const mudancas = conferida.mudancas;

  const travas = manual ? (pedido.travas ?? {}) : {};
  const travasDesconhecidas = Object.keys(travas).filter(
    (chave) => chave !== CHAVE_DO_MODELO && !definicoes.porChave.has(chave),
  );
  if (travasDesconhecidas.length > 0) {
    throw dadosInvalidos(
      Object.fromEntries(
        travasDesconhecidas.map((chave) => [
          `travas.${chave}`,
          'Este campo não é do tipo do ativo.',
        ]),
      ),
    );
  }

  // O escopo: o local novo, e os restritos no local de antes e no de depois.
  const localAntes = atual?.ativo.localId ?? null;
  const localDepois =
    'ativo.local' in mudancas ? ((mudancas['ativo.local'] as string | null) ?? null) : localAntes;
  const locais = cadastro ? [localDepois] : [...new Set([localAntes, localDepois])];
  for (const local of locais) {
    if (cadastro || local !== localAntes) exigirDe(quem, 'ativos.editar', local, arvore);
  }
  const tocaRestrito = [...Object.keys(mudancas), ...Object.keys(travas)].some(
    (chave) => definicoes.porChave.get(chave)?.restrito,
  );
  if (tocaRestrito) {
    for (const local of locais) exigirDe(quem, 'ativos.restritos', local, arvore);
  }

  // O modelo, do tipo do ativo e ativo quando escolhido.
  let modeloId = atual?.ativo.modeloId ?? null;
  let modeloMudou = false;
  if (modeloPedido !== undefined && modeloPedido !== modeloId) {
    if (modeloPedido !== null) {
      const [modelo] = await tx
        .select({ tipoId: modelos.tipoId, situacao: modelos.situacao })
        .from(modelos)
        .where(eq(modelos.id, modeloPedido))
        .for('share');
      if (!modelo) throw dadosInvalidos({ modeloId: 'Modelo não encontrado.' });
      if (modelo.tipoId !== tipo.id) {
        throw dadosInvalidos({ modeloId: 'O modelo escolhido não é do tipo do ativo.' });
      }
      if (modelo.situacao === 'inativo')
        throw conflito(MODELO_INATIVO, { modeloId: MODELO_INATIVO });
    }
    modeloId = modeloPedido;
    modeloMudou = true;
  }

  await conferirReferencias(tx, mudancas, definicoes, atual?.ativo.id ?? null);

  // O estado: as chaves gravadas e as travas que mudaram.
  const gravadas = [...Object.keys(mudancas), ...(modeloMudou ? [CHAVE_DO_MODELO] : [])];
  let estado: Record<string, EstadoDoCampo> = { ...estadoAtual };
  if (gravadas.length > 0) {
    estado = registrarGravacao(estado, gravadas, {
      origem: quem.origem,
      momento: momento.toISOString(),
      autorId: quem.sistema ? null : quem.contaId,
    });
  }
  const travasMudadas = Object.fromEntries(
    Object.entries(travas).filter(([chave, trava]) => (estado[chave]?.trava ?? false) !== trava),
  );
  if (Object.keys(travasMudadas).length > 0) estado = aplicarTravas(estado, travasMudadas);

  if (atual && gravadas.length === 0 && Object.keys(travasMudadas).length === 0) {
    return { id: atual.ativo.id, mudou: false };
  }

  // As colunas dos campos comuns e o JSONB dos outros valores.
  const colunas: ColunasDoAtivo = {};
  const valoresDoJsonb: Record<string, ValorDeCampo> = {
    ...((atual?.ativo.valores as Record<string, ValorDeCampo> | undefined) ?? {}),
  };
  for (const [chave, valor] of Object.entries(mudancas)) {
    const coluna = CAMPOS_DO_ATIVO.find((campo) => campo.chave === chave)?.coluna;
    if (coluna) (colunas as Record<string, unknown>)[coluna] = valor;
    else if (valor === null) delete valoresDoJsonb[chave];
    else valoresDoJsonb[chave] = valor;
  }
  if ('patrimonio' in colunas) {
    colunas.patrimonioNormalizado = colunas.patrimonio
      ? normalizarTexto(String(colunas.patrimonio))
      : null;
  }
  const valoresDepois: Record<string, ValorDeCampo> = { ...atuais };
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (valor === null) delete valoresDepois[chave];
    else valoresDepois[chave] = valor;
  }
  const dados = {
    ...colunas,
    modeloId,
    valores: valoresDoJsonb,
    estado,
    busca: textoDeBuscaDoAtivo(valoresDepois, definicoes),
    atualizadoEm: momento,
  };

  const [gravado] = await semPatrimonioRepetido(() =>
    atual
      ? tx
          .update(ativos)
          .set(dados)
          .where(eq(ativos.id, atual.ativo.id))
          .returning({ id: ativos.id })
      : tx
          .insert(ativos)
          .values({ orgId: sql`app.current_org()`, tipoId: tipo.id, criadoEm: momento, ...dados })
          .returning({ id: ativos.id }),
  );
  if (!gravado) throw new Error('O ativo não foi gravado.');

  const depois = await lerLinha(gravado.id);
  await registrarNaAuditoria(tx, {
    acao: cadastro ? 'ativo.criado' : 'ativo.alterado',
    ator: atorDe(quem),
    alvo: { tipo: 'ativo', id: gravado.id },
    ...(atual ? { antes: await visaoDoAtivo(tx, atual, definicoes, arvore) } : {}),
    depois: await visaoDoAtivo(tx, depois, definicoes, arvore),
    ...daAuditoria(quem),
    momento,
    saida: saidaDoAtivo({ ativoId: gravado.id, locais }),
  });
  return { id: gravado.id, mudou: true };
}

/**
 * Inativa ou reativa o ativo, com a auditoria e o evento. A rota já conferiu `ativos.editar` no
 * local dele; a repetida não grava nada.
 */
export async function mudarSituacaoDoAtivo(
  tx: Transacao,
  {
    quem,
    arvore,
    momento,
    atual,
    situacao,
    lerLinha,
  }: {
    quem: QuemGrava;
    arvore: ArvoreDeLocais;
    momento: Date;
    atual: LinhaDoAtivo;
    situacao: 'ativo' | 'inativo';
    lerLinha: (id: string) => Promise<LinhaDoAtivo>;
  },
) {
  if (atual.ativo.situacao === situacao) return;
  await tx
    .update(ativos)
    .set({ situacao, atualizadoEm: momento })
    .where(eq(ativos.id, atual.ativo.id));
  const tipo = await lerTipoDoAtivo(tx, atual.ativo.tipoId);
  const definicoes = camposDoAtivo({
    tipo: tipo ?? { capacidades: [], campos: [] },
    campos: await camposDaOrganizacao(tx),
  });
  await registrarNaAuditoria(tx, {
    acao: situacao === 'inativo' ? 'ativo.inativado' : 'ativo.reativado',
    ator: atorDe(quem),
    alvo: { tipo: 'ativo', id: atual.ativo.id },
    antes: await visaoDoAtivo(tx, atual, definicoes, arvore),
    depois: await visaoDoAtivo(tx, await lerLinha(atual.ativo.id), definicoes, arvore),
    ...daAuditoria(quem),
    momento,
    saida: saidaDoAtivo({ ativoId: atual.ativo.id, locais: [atual.ativo.localId] }),
  });
}
