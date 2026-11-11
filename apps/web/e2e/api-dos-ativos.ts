// Os ativos simulados na página, em memória (design do P1b, decisão 13, do P1c, decisão 10, e do P1d),
// sobre o catálogo simulado (api-do-catalogo.ts): a lista com a busca, as colunas, a ordem e os
// filtros das colunas, em páginas, o cadastro e a ficha, com o estado e a trava de cada campo, a
// inativação, a imagem do ativo, os arquivos dos campos, as ligações livres, o lado de lá, o
// histórico e as etiquetas, além dos locais e dos nomes das pessoas para a escolha e das visões da
// tabela. Os valores
// passam pelo motor de campos do domínio, como na API de verdade, e as recusas chegam no campo. Os
// caminhos de fora passam adiante: ao catálogo e, depois dele, à API da Administração, se o teste a
// simula antes, ou à fixture.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { components } from '@grafite/api-client';
import {
  aplicarTravas,
  CAMPOS_DO_ATIVO,
  type CamposDoAtivo,
  CHAVE_DO_MODELO,
  type ColunaDosAtivos,
  camposDoAtivo,
  cnpjComPontuacao,
  colunasDosAtivos,
  conferirValoresDoAtivo,
  type DefinicaoDaVisao,
  type EstadoDoCampo,
  type FiltroDaVisao,
  lerDefinicaoDaVisao,
  lerMudancasDaVisao,
  lerNomeDaVisao,
  montarArvore,
  mostrarValor,
  mudancasDoAtivo,
  normalizarTexto,
  parDaLigacao,
  RECUSAS_DA_LIGACAO,
  registrarGravacao,
  rotuloDaAcao,
  rotuloDoAtivo,
  type TipoDeCampo,
  tipoDoSuprimento,
  type ValorDeCampo,
  VISAO_DE_FABRICA,
  type VisaoDoAtivoNaAuditoria,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import { IDS_DO_CATALOGO, type OpcoesDoCatalogo, simularCatalogo } from './api-do-catalogo.ts';
import { SESSAO } from './fixtures.ts';

type Esquemas = components['schemas'];
type Local = Esquemas['Local'];
type AtivoNaLista = Esquemas['AtivoNaLista'];
type AtivoLigado = Esquemas['AtivoLigado'];
type Ficha = Esquemas['FichaDoAtivo'];
type Disponibilidade = Esquemas['DisponibilidadeDoAtivo'];
type PainelDeSuprimentos = Esquemas['SuprimentosDoAtivo'];
type SaudeDoControlId = Esquemas['SaudeDoControlId'];
type ItemDoHistorico = Esquemas['ItemDoHistorico'];
type ReferenciasDaLista = Esquemas['ListaDeAtivos']['referencias'];

const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;

/** A imagem que a API simulada entrega para a imagem de qualquer ativo, em todo tamanho. */
const IMAGEM = readFileSync(new URL('./exemplos/impressora.svg', import.meta.url), 'utf-8');

/** Os ids dos registros que a organização com ativos já tem, além dos do catálogo. */
export const IDS_DOS_ATIVOS = {
  ip: id(131),
  /** O campo do tipo ativo da impressora: a que ela substitui, com o lado de lá "Substituída por". */
  substitui: id(132),
  /** O campo de arquivo da impressora. */
  notaFiscal: id(133),
  jundiai: id(201),
  expedicao: id(202),
  rh: id(203),
  joao: id(211),
  marina: id(212),
  daExpedicao: id(301),
  doRh: id(302),
};

/** A conta da sessão, que grava os valores à mão. */
const CONTA = { id: SESSAO.sessao.conta.id, nome: SESSAO.sessao.conta.nome };

export const LOCAIS: Local[] = [
  { id: IDS_DOS_ATIVOS.jundiai, paiId: null, nome: 'Jundiaí', tipo: 'unidade' },
  { id: IDS_DOS_ATIVOS.expedicao, paiId: IDS_DOS_ATIVOS.jundiai, nome: 'Expedição', tipo: 'setor' },
  { id: IDS_DOS_ATIVOS.rh, paiId: IDS_DOS_ATIVOS.jundiai, nome: 'RH', tipo: 'setor' },
].map((local) => ({
  ...(local as Pick<Local, 'id' | 'paiId' | 'nome' | 'tipo'>),
  situacao: 'ativo',
  permite: { editar: true },
}));

export const PESSOAS = [
  { id: IDS_DOS_ATIVOS.joao, nome: 'João da Silva' },
  { id: IDS_DOS_ATIVOS.marina, nome: 'Marina Alves' },
];

/** O estado gravado de um campo, como a API o guarda: o autor pelo id da conta. */
/** O momento do cadastro e da última mudança de todo ativo simulado. */
const CADASTRO = '2026-10-09T12:00:00.000Z';

interface AtivoGuardado {
  id: string;
  tipoId: string;
  modeloId: string | null;
  /** A imagem própria do ativo, que vale no lugar da do modelo. */
  imagem?: { id: string } | null;
  valores: Record<string, ValorDeCampo>;
  estado: Record<string, EstadoDoCampo>;
  situacao: 'ativo' | 'inativo';
  /** A disponibilidade na rede, como a API a lê do estado atual da coleta. */
  disponibilidade?: Disponibilidade | null;
  /** O painel Suprimentos, como a API o lê do estado atual da coleta SNMP. */
  painelDeSuprimentos?: PainelDeSuprimentos | null;
  /** A saúde do Control iD, como a API a lê do estado atual da sondagem. */
  controlId?: SaudeDoControlId | null;
  /** Os segredos do cofre ligados ao ativo que a conta vê, como a API os põe na ficha. */
  segredos?: Ficha['segredos'];
}

/** Um arquivo enviado num campo, com o conteúdo, para a entrega. */
interface ArquivoGuardado {
  id: string;
  nome: string;
  bytes: number;
  tipo: string;
  conteudo: Buffer;
}

/** Uma ligação livre, com o par em ordem, como a API guarda. */
interface LigacaoGuardada {
  id: string;
  par: [string, string];
}

/** Duas impressoras de Jundiaí: a HP da Expedição, com o patrimônio travado, e a do RH. */
function comImpressoras(): AtivoGuardado[] {
  return [
    {
      id: IDS_DOS_ATIVOS.doRh,
      tipoId: IDS_DO_CATALOGO.impressora,
      modeloId: null,
      valores: {
        'ativo.nome': 'Impressora do RH',
        'ativo.patrimonio': 'PAT-00999',
        'ativo.uso': 'em-estoque',
        'ativo.local': IDS_DOS_ATIVOS.rh,
        [IDS_DOS_ATIVOS.ip]: '10.0.0.9',
      },
      estado: {},
      situacao: 'ativo',
    },
    {
      id: IDS_DOS_ATIVOS.daExpedicao,
      tipoId: IDS_DO_CATALOGO.impressora,
      modeloId: IDS_DO_CATALOGO.m404,
      valores: {
        'ativo.patrimonio': 'PAT-00412',
        'ativo.uso': 'em-uso',
        'ativo.local': IDS_DOS_ATIVOS.expedicao,
        'ativo.responsavel': IDS_DOS_ATIVOS.joao,
        [IDS_DOS_ATIVOS.ip]: '10.0.0.5',
      },
      estado: {
        'ativo.patrimonio': {
          origem: 'manual',
          momento: '2026-10-09T17:32:00.000Z',
          autorId: CONTA.id,
          trava: false,
        },
        [IDS_DOS_ATIVOS.ip]: {
          origem: 'planilha',
          momento: '2026-10-01T11:00:00.000Z',
          autorId: null,
          trava: false,
        },
      },
      situacao: 'ativo',
    },
  ];
}

/**
 * Mais impressoras no RH, cadastradas antes das duas de Jundiaí, para a lista ter páginas. Cada uma
 * tem o nome da posição dela na ordem do cadastro, depois das duas: "Impressora 03" é a terceira
 * linha, com o patrimônio PAT-10003 e o IP 10.0.1.3.
 */
function impressorasNumeradas(quantas: number): AtivoGuardado[] {
  return Array.from({ length: quantas }, (_, indice) => {
    const posicao = quantas + 2 - indice;
    return {
      id: id(1000 + posicao),
      tipoId: IDS_DO_CATALOGO.impressora,
      modeloId: null,
      valores: {
        'ativo.nome': `Impressora ${String(posicao).padStart(2, '0')}`,
        'ativo.patrimonio': `PAT-1${String(posicao).padStart(4, '0')}`,
        'ativo.uso': 'em-uso',
        'ativo.local': IDS_DOS_ATIVOS.rh,
        [IDS_DOS_ATIVOS.ip]: `10.0.1.${posicao}`,
      },
      estado: {},
      situacao: 'ativo',
    };
  });
}

/** Uma visão da tabela dos ativos: a da organização não tem conta. */
interface VisaoGuardada {
  id: string;
  nome: string;
  contaId: string | null;
  definicao: DefinicaoDaVisao;
}

/** As mudanças da conta sobre uma visão, como a API as devolve. */
interface MudancasGuardadas {
  visao: string;
  definicao: DefinicaoDaVisao;
  atualizadaEm: string;
}

/** Os campos comuns que a API guarda nas colunas da tabela, e não nos valores da lista. */
const NAS_COLUNAS = new Set<string>(
  CAMPOS_DO_ATIVO.filter((campo) => campo.coluna).map((campo) => campo.chave),
);

const NOME_REPETIDO = 'Já existe uma visão com este nome.';

type Corpo = Record<string, unknown>;
/** O JSON da API, ou um arquivo entregue, como a imagem e o documento de um campo. */
type Resposta =
  | { status: number; json: unknown }
  | { status: 200; conteudo: string | Buffer; cabecalhos: Record<string, string> };

const ok = (json: unknown, status = 200): Resposta => ({ status, json });
const problema = (
  status: number,
  codigo: string,
  detalhe: string,
  campos?: Record<string, string>,
): Resposta => ({
  status,
  json: {
    type: `urn:grafite:problema:${codigo}`,
    title: detalhe,
    status,
    detail: detalhe,
    codigoDeRastreio: 'T5EX-2E2E',
    ...(campos && { campos }),
  },
});

const prefixar = (prefixo: string, erros: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(erros).map(([chave, motivo]) => [`${prefixo}${chave}`, motivo]),
  );

/** Os tipos de campo cujo valor a busca da lista acha, quando o campo não é restrito. */
const TIPOS_DA_BUSCA = new Set<TipoDeCampo>(['texto', 'ip', 'mac', 'url', 'licenca']);

/** Os fornecedores da organização simulada, quando pedidos (change p4a-fornecedores). */
export const IDS_DOS_FORNECEDORES = { hpBrasil: id(401), locadoraNorte: id(402) };

/** Um fornecedor guardado na simulação, com o CNPJ nos 14 caracteres, como no banco. */
export interface FornecedorGuardado {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  situacao: 'ativo' | 'inativo';
}

/** A HP Brasil, ativa, com o CNPJ, e a Locadora Norte, inativa. */
const FORNECEDORES: readonly FornecedorGuardado[] = [
  {
    id: IDS_DOS_FORNECEDORES.hpBrasil,
    nome: 'HP Brasil',
    cnpj: '12345678000195',
    contato: 'Marina Lopes',
    email: 'vendas@hp.com.br',
    telefone: null,
    observacoes: null,
    situacao: 'ativo',
  },
  {
    id: IDS_DOS_FORNECEDORES.locadoraNorte,
    nome: 'Locadora Norte',
    cnpj: null,
    contato: null,
    email: null,
    telefone: null,
    observacoes: null,
    situacao: 'inativo',
  },
];

export interface OpcoesDosAtivos extends OpcoesDoCatalogo {
  /** Sem ativos cadastrados, com o catálogo como o do P1a. */
  semAtivos?: boolean;
  /** Com os fornecedores HP Brasil, ativo, e Locadora Norte, inativo. */
  fornecedores?: boolean;
  /** Quantas impressoras numeradas a organização tem além das duas de Jundiaí. */
  numeradas?: number;
  /** O máximo de ativos por página da lista, abaixo do que a tela pede. */
  porPagina?: number;
  /**
   * Os consumíveis compatíveis de um modelo, que a ficha traz nos ativos de um tipo com a
   * capacidade (change p4b-consumiveis); sem eles, a ficha não traz os compatíveis.
   */
  consumiveisDoModelo?: (modeloId: string) => components['schemas']['ConsumivelCompativel'][];
}

/**
 * Os caminhos, depois do /api, que esta API responde; os outros passam adiante. Os resumos da
 * pessoa, do modelo e do tipo contam os ativos, e ficam aqui (change relacoes-vivas), como os
 * fornecedores, que contam os ativos deles (change p4a-fornecedores).
 */
const DOS_ATIVOS =
  /^\/(ativos|locais|pessoas\/nomes|visoes|fornecedores)(\/|$)|^\/(pessoas|modelos|tipos-de-ativo)\/[^/]+\/resumo$/;

/** Compara duas chaves da ordem do mesmo tipo. */
const comparar = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Liga o catálogo e os ativos simulados à página. Fora do catálogo vazio, a impressora ganha o
 * campo IP, obrigatório, e a organização, as duas impressoras de Jundiaí e as numeradas pedidas.
 * Devolve o estado, para o teste conferir o que mudou, os corpos das escritas e os parâmetros das
 * leituras.
 */
export async function simularAtivos(
  pagina: Page,
  {
    semAtivos = false,
    numeradas = 0,
    porPagina,
    fornecedores: comFornecedores = false,
    consumiveisDoModelo,
    ...opcoes
  }: OpcoesDosAtivos = {},
) {
  const catalogo = await simularCatalogo(pagina, opcoes);
  const ativos: AtivoGuardado[] = [];
  const fornecedores: FornecedorGuardado[] = comFornecedores
    ? FORNECEDORES.map((fornecedor) => ({ ...fornecedor }))
    : [];
  if (!opcoes.vazio && !semAtivos) {
    const doCampo = { grupo: null, restrito: false, situacao: 'ativo' as const };
    catalogo.estado.campos.push(
      {
        ...doCampo,
        id: IDS_DOS_ATIVOS.ip,
        rotulo: 'IP',
        tipo: 'ip',
        grupo: 'Rede',
        configuracao: {},
        escrita: 'automatica',
      },
      {
        ...doCampo,
        id: IDS_DOS_ATIVOS.substitui,
        rotulo: 'Substitui',
        tipo: 'ativo',
        configuracao: { tipos: [IDS_DO_CATALOGO.impressora], ladoDeLa: 'Substituída por' },
        escrita: 'manual',
      },
      {
        ...doCampo,
        id: IDS_DOS_ATIVOS.notaFiscal,
        rotulo: 'PDF da nota fiscal',
        tipo: 'arquivo',
        configuracao: {},
        escrita: 'manual',
      },
    );
    const impressora = catalogo.estado.tipos.find((tipo) => tipo.id === IDS_DO_CATALOGO.impressora);
    impressora?.campos.unshift({ campoId: IDS_DOS_ATIVOS.ip, obrigatorio: true });
    impressora?.campos.push(
      { campoId: IDS_DOS_ATIVOS.substitui, obrigatorio: false },
      { campoId: IDS_DOS_ATIVOS.notaFiscal, obrigatorio: false },
    );
    ativos.push(...impressorasNumeradas(numeradas), ...comImpressoras());
  }
  const arquivos = new Map<string, ArquivoGuardado>();
  const ligacoes: LigacaoGuardada[] = [];
  /** O histórico de cada ativo, do registro mais novo para o mais antigo. */
  const historicos = new Map<string, ItemDoHistorico[]>();
  const visoes: VisaoGuardada[] = [];
  /** As mudanças da conta sobre as visões, pela visão, com a de fábrica como `fabrica`. */
  const mudancas = new Map<string, MudancasGuardadas>();
  const pedidos: { metodo: string; caminho: string; corpo: unknown; busca: URLSearchParams }[] = [];
  // Os locais desta página: os de exemplo e os que o Novo local cadastra (change cadastro-em-abas).
  const locais = [...LOCAIS];
  let arvore = montarArvore(locais);
  // O rascunho do cadastro da conta desta página, que o cadastro feito apaga (change
  // cadastro-em-etapas).
  let rascunho: (Corpo & { atualizadoEm: string }) | null = null;

  const tipoDe = (tipoId: unknown) => catalogo.estado.tipos.find((tipo) => tipo.id === tipoId);
  const modeloDe = (modeloId: unknown) =>
    catalogo.estado.modelos.find((modelo) => modelo.id === modeloId);
  const ativoDe = (ativoId: unknown) => ativos.find((ativo) => ativo.id === ativoId);
  const definicoesDe = (tipoId: string): CamposDoAtivo =>
    camposDoAtivo({
      tipo: tipoDe(tipoId) ?? { capacidades: [], campos: [] },
      campos: catalogo.estado.campos,
    });

  /** O ativo na lista, com os valores das colunas pedidas que a API guarda fora das colunas. */
  function naLista(ativo: AtivoGuardado, pedidas: readonly string[] = []): AtivoNaLista {
    const tipo = tipoDe(ativo.tipoId);
    if (!tipo) throw new Error(`O ativo ${ativo.id} tem um tipo que não existe.`);
    const modelo = modeloDe(ativo.modeloId);
    const localId = ativo.valores['ativo.local'] as string | undefined;
    const responsavelId = ativo.valores['ativo.responsavel'] as string | undefined;
    const responsavel = PESSOAS.find((pessoa) => pessoa.id === responsavelId);
    return {
      id: ativo.id,
      rotulo: rotuloDoAtivo({
        nome: (ativo.valores['ativo.nome'] as string | undefined) ?? null,
        modelo: modelo ?? null,
        tipo,
      }),
      tipo: { id: tipo.id, nome: tipo.nome, icone: tipo.icone },
      modelo: modelo
        ? { id: modelo.id, fabricante: modelo.fabricante, nome: modelo.nome, imagem: modelo.imagem }
        : null,
      imagem: ativo.imagem ?? null,
      patrimonio: (ativo.valores['ativo.patrimonio'] as string | undefined) ?? null,
      serie: (ativo.valores['ativo.serie'] as string | undefined) ?? null,
      hostname: (ativo.valores['ativo.hostname'] as string | undefined) ?? null,
      local: localId ? { id: localId, caminho: arvore.caminho(localId) } : null,
      responsavel: responsavel ?? null,
      uso: ativo.valores['ativo.uso'] as AtivoNaLista['uso'],
      situacao: ativo.situacao,
      criadoEm: CADASTRO,
      atualizadoEm: CADASTRO,
      valores: Object.fromEntries(
        pedidas
          .filter((chave) => !NAS_COLUNAS.has(chave) && Object.hasOwn(ativo.valores, chave))
          .map((chave) => [chave, ativo.valores[chave] as ValorDeCampo]),
      ),
      // A sessão simulada é da administradora: vê a pessoa responsável, quando há uma.
      permite: { editar: true, verRestritos: true, verResponsavel: responsavel !== undefined },
      disponibilidade: ativo.disponibilidade ?? null,
      suprimentos: ativo.painelDeSuprimentos
        ? { menor: ativo.painelDeSuprimentos.menor, total: ativo.painelDeSuprimentos.total }
        : null,
      controlId: ativo.controlId ?? null,
    };
  }

  const fornecedorDe = (outro: string) =>
    fornecedores.find((fornecedor) => fornecedor.id === outro);
  /** O nome atual do fornecedor, com "(inativo)" no inativo, como a API o mostra. */
  const nomeDoFornecedor = (fornecedor: FornecedorGuardado) =>
    fornecedor.situacao === 'inativo' ? `${fornecedor.nome} (inativo)` : fornecedor.nome;
  /** O fornecedor como a API o devolve, com o CNPJ escrito com a pontuação. */
  const comoFornecedor = (fornecedor: FornecedorGuardado) => ({
    ...fornecedor,
    cnpj: fornecedor.cnpj ? cnpjComPontuacao(fornecedor.cnpj) : null,
    criadoEm: '2026-10-14T12:00:00.000Z',
    atualizadoEm: '2026-10-14T12:00:00.000Z',
  });
  /** O texto do pedido, sem os espaços das pontas, e o vazio como nulo. */
  const textoDoPedido = (valor: unknown) =>
    typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;

  function ficha(ativo: AtivoGuardado): Ficha {
    const definicoes = definicoesDe(ativo.tipoId);
    const referencias: Ficha['referencias'] = {
      pessoas: {},
      locais: {},
      ativos: {},
      fornecedores: {},
      arquivos: {},
    };
    for (const [chave, valor] of Object.entries(ativo.valores)) {
      const tipo = definicoes.porChave.get(chave)?.tipo;
      const outro = String(valor);
      if (tipo === 'pessoa') {
        referencias.pessoas[outro] = PESSOAS.find((pessoa) => pessoa.id === outro)?.nome ?? '';
      }
      if (tipo === 'local') referencias.locais[outro] = arvore.caminho(outro);
      if (tipo === 'ativo') {
        const referido = ativoDe(outro);
        if (referido) referencias.ativos[outro] = naLista(referido).rotulo;
      }
      const fornecedor = fornecedorDe(outro);
      if (tipo === 'fornecedor' && fornecedor) {
        referencias.fornecedores[outro] = nomeDoFornecedor(fornecedor);
      }
      const arquivo = arquivos.get(outro);
      if ((tipo === 'arquivo' || tipo === 'imagem') && arquivo) {
        referencias.arquivos[outro] = {
          nome: arquivo.nome,
          bytes: arquivo.bytes,
          tipo: arquivo.tipo,
        };
      }
    }
    const lista = naLista(ativo);
    return {
      ...lista,
      valores: ativo.valores,
      estado: Object.fromEntries(
        Object.entries(ativo.estado).map(([chave, { origem, momento, autorId, trava }]) => [
          chave,
          { origem, momento, autor: autorId === CONTA.id ? CONTA : null, trava },
        ]),
      ),
      referencias,
      permite: {
        editar: true,
        verRestritos: true,
        editarRestritos: true,
        verResponsavel: lista.permite.verResponsavel,
      },
      ...(ativo.segredos ? { segredos: ativo.segredos } : {}),
      painelDeSuprimentos: ativo.painelDeSuprimentos ?? null,
      // Os compatíveis do modelo, só nos tipos com a capacidade; vazios no ativo sem modelo.
      ...(consumiveisDoModelo &&
      tipoDe(ativo.tipoId)?.capacidades.includes('consumiveis.compatibilidade')
        ? {
            consumiveisCompativeis: ativo.modeloId ? consumiveisDoModelo(ativo.modeloId) : [],
          }
        : {}),
    };
  }

  /** O nome atual do que um valor aponta: a pessoa, o local, o ativo ou o arquivo. */
  const nomeDoRegistro = (outro: string) => {
    const referido = ativoDe(outro);
    return (
      PESSOAS.find((pessoa) => pessoa.id === outro)?.nome ??
      (locais.some((local) => local.id === outro) ? arvore.caminho(outro) : undefined) ??
      (referido ? naLista(referido).rotulo : undefined) ??
      arquivos.get(outro)?.nome
    );
  };

  /** A visão do ativo que a API grava na auditoria: os valores mostrados e as travas, pelo rótulo. */
  function visao(ativo: AtivoGuardado): VisaoDoAtivoNaAuditoria {
    const modelo = modeloDe(ativo.modeloId);
    const campos: Record<string, string> = {};
    const travados = ativo.estado[CHAVE_DO_MODELO]?.trava ? ['Modelo'] : [];
    for (const grupo of definicoesDe(ativo.tipoId).grupos) {
      for (const definicao of grupo.campos) {
        const valor = ativo.valores[definicao.chave];
        if (valor !== undefined) {
          campos[definicao.rotulo] = mostrarValor(definicao, valor, nomeDoRegistro);
        }
        if (ativo.estado[definicao.chave]?.trava) travados.push(definicao.rotulo);
      }
    }
    return {
      modelo: modelo ? `${modelo.fabricante} ${modelo.nome}` : null,
      situacao: ativo.situacao,
      campos,
      travados,
    };
  }

  /** Um registro novo no histórico do ativo, por Ana Souza, agora. */
  function registrar(
    ativoId: string,
    acao: string,
    extras: Partial<Pick<ItemDoHistorico, 'mudancas' | 'travas' | 'outro'>> = {},
  ) {
    historicos.set(ativoId, [
      {
        id: randomUUID(),
        momento: new Date().toISOString(),
        acao,
        rotulo: rotuloDaAcao(acao),
        quem: CONTA.nome,
        mudancas: [],
        travas: { ligadas: [], desligadas: [] },
        outro: null,
        ...extras,
      },
      ...(historicos.get(ativoId) ?? []),
    ]);
  }

  /** Muda o ativo e registra no histórico o que mudou, pela visão de antes e a de depois. */
  function mudarComHistorico(ativo: AtivoGuardado, acao: string, mudar: () => void) {
    const antes = visao(ativo);
    mudar();
    registrar(
      ativo.id,
      acao,
      mudancasDoAtivo(antes, visao(ativo), { restritos: new Set(), verRestritos: true }),
    );
  }

  /** O ativo numa lista de ligados: o da lista, sem os valores. */
  function ligado(ativo: AtivoGuardado): AtivoLigado {
    const { valores: _valores, ...resto } = naLista(ativo);
    return resto;
  }

  /**
   * O lado de lá, como a API: um grupo para cada campo do tipo ativo, com os ativos cujo tipo usa o
   * campo e que apontam para este, na ordem do nome; e as ligações livres.
   */
  function ligadosDe(ativo: AtivoGuardado) {
    const porCampos = catalogo.estado.campos
      .filter((campo) => campo.tipo === 'ativo' && campo.situacao === 'ativo')
      .flatMap((campo) => {
        const apontam = ativos
          .filter(
            (outro) =>
              outro.valores[campo.id] === ativo.id &&
              tipoDe(outro.tipoId)?.campos.some((noTipo) => noTipo.campoId === campo.id),
          )
          .sort((a, b) => naLista(a).rotulo.localeCompare(naLista(b).rotulo, 'pt-BR'));
        if (apontam.length === 0) return [];
        const { id: campoId, rotulo, configuracao } = campo;
        return [
          {
            campo: { id: campoId, rotulo, ladoDeLa: configuracao.ladoDeLa ?? null },
            total: apontam.length,
            ativos: apontam.slice(0, 100).map(ligado),
          },
        ];
      });
    const livres = ligacoes
      .filter(({ par }) => par.includes(ativo.id))
      .flatMap(({ id: ligacaoId, par }) => {
        const outro = ativoDe(par[0] === ativo.id ? par[1] : par[0]);
        return outro ? [{ id: ligacaoId, outro: ligado(outro), permite: { desfazer: true } }] : [];
      });
    return ok({ porCampos, livres, permite: { ligar: ativo.situacao === 'ativo' } });
  }

  /** A ligação livre nova, com as recusas da API, e o registro no histórico dos dois ativos. */
  function ligar(ativo: AtivoGuardado, corpo: Corpo): Resposta {
    const outro = ativoDe(corpo.outroId);
    if (!outro) return naoEncontrado();
    const lida = parDaLigacao(ativo.id, outro.id);
    if (!lida.ok) return problema(400, 'dados-invalidos', lida.erro);
    if (ativo.situacao === 'inativo') {
      return problema(409, 'conflito', RECUSAS_DA_LIGACAO.esteInativo);
    }
    if (outro.situacao === 'inativo') {
      return problema(409, 'conflito', RECUSAS_DA_LIGACAO.outroInativo);
    }
    if (ligacoes.some(({ par }) => par[0] === lida.par[0] && par[1] === lida.par[1])) {
      return problema(409, 'conflito', RECUSAS_DA_LIGACAO.repetida);
    }
    const nova: LigacaoGuardada = { id: randomUUID(), par: lida.par };
    ligacoes.push(nova);
    registrar(ativo.id, 'ativo.ligado', { outro: { id: outro.id, rotulo: naLista(outro).rotulo } });
    registrar(outro.id, 'ativo.ligado', { outro: { id: ativo.id, rotulo: naLista(ativo).rotulo } });
    return ok({ id: nova.id, outro: ligado(outro), permite: { desfazer: true } }, 201);
  }

  function desligar(ativo: AtivoGuardado, ligacaoId: string): Resposta {
    const ligacao = ligacoes.find(
      (candidata) => candidata.id === ligacaoId && candidata.par.includes(ativo.id),
    );
    if (!ligacao) return problema(404, 'nao-encontrado', 'Ligação não encontrada.');
    ligacoes.splice(ligacoes.indexOf(ligacao), 1);
    const [a, b] = ligacao.par.map((ativoId) => ativoDe(ativoId) as AtivoGuardado);
    if (a && b) {
      registrar(a.id, 'ativo.desligado', { outro: { id: b.id, rotulo: naLista(b).rotulo } });
      registrar(b.id, 'ativo.desligado', { outro: { id: a.id, rotulo: naLista(a).rotulo } });
    }
    return { status: 204, json: null };
  }

  /**
   * O arquivo de um campo, enviado ou tirado: o registro novo com o nome, o valor e o estado de uma
   * edição manual, com o histórico pelos nomes, como a API.
   */
  function mudarArquivo(
    ativo: AtivoGuardado,
    campoId: string,
    novo: ArquivoGuardado | null,
  ): Resposta {
    const campo = catalogo.estado.campos.find((candidato) => candidato.id === campoId);
    if (!campo || (campo.tipo !== 'arquivo' && campo.tipo !== 'imagem')) {
      return problema(404, 'nao-encontrado', 'Campo não encontrado.');
    }
    mudarComHistorico(ativo, 'ativo.alterado', () => {
      if (novo) {
        arquivos.set(novo.id, novo);
        ativo.valores[campoId] = novo.id;
      } else delete ativo.valores[campoId];
      ativo.estado = registrarGravacao(ativo.estado, [campoId], {
        origem: 'manual',
        momento: new Date().toISOString(),
        autorId: CONTA.id,
      });
    });
    return ok(ficha(ativo));
  }

  /** O documento do campo, para baixar com o nome original, só se for o valor atual. */
  function entregarArquivo(ativo: AtivoGuardado, campoId: string, arquivoId: string): Resposta {
    const arquivo = arquivos.get(arquivoId);
    if (!arquivo || ativo.valores[campoId] !== arquivoId) {
      return problema(404, 'nao-encontrado', 'Arquivo não encontrado.');
    }
    return {
      status: 200,
      conteudo: arquivo.conteudo,
      cabecalhos: {
        'content-type': arquivo.tipo,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
        'x-content-type-options': 'nosniff',
      },
    };
  }

  /** O histórico do ativo em páginas, do registro mais novo para o mais antigo. */
  function historicoDe(ativo: AtivoGuardado, busca: URLSearchParams): Resposta {
    const todos = historicos.get(ativo.id) ?? [];
    const inicio = Number(busca.get('cursor') ?? 0) || 0;
    const limite = Number(busca.get('limite') ?? 50);
    return ok({
      itens: todos.slice(inicio, inicio + limite),
      proximo: inicio + limite < todos.length ? String(inicio + limite) : null,
    });
  }

  /** As colunas da tabela dos ativos, pelo catálogo de agora, como a API confere as pedidas. */
  const colunasDaTabela = () =>
    new Map(
      colunasDosAtivos({
        tipos: catalogo.estado.tipos,
        campos: catalogo.estado.campos,
        verRestritos: true,
      }).map((coluna) => [coluna.chave, coluna]),
    );

  /** Os locais na ordem dos caminhos, como a API ordena as colunas de local. */
  function locaisNaOrdem(): string[] {
    const ordem: string[] = [];
    const visitar = (paiId: string | null) => {
      for (const filho of arvore.filhos(paiId)) {
        ordem.push(filho.id);
        visitar(filho.id);
      }
    };
    visitar(null);
    return ordem;
  }

  /** O valor da coluna no ativo, como os filtros o comparam: o registro apontado, pelo id. */
  function valorDa(chave: string, ativo: AtivoGuardado): ValorDeCampo | null {
    if (chave === 'ativo.rotulo') return naLista(ativo).rotulo;
    if (chave === 'ativo.tipo') return ativo.tipoId;
    if (chave === 'ativo.modelo') return ativo.modeloId;
    if (chave === 'ativo.criado-em' || chave === 'ativo.atualizado-em') return CADASTRO;
    if (chave === 'coleta.disponibilidade') return ativo.disponibilidade?.situacao ?? null;
    if (chave === 'coleta.suprimentos') return ativo.painelDeSuprimentos?.menor?.nivel ?? null;
    if (chave === 'coleta.paginas') return ativo.painelDeSuprimentos?.total?.paginas ?? null;
    if (chave === 'coleta.control-id') return ativo.controlId?.situacao ?? null;
    return ativo.valores[chave] ?? null;
  }

  /** O ativo na situação pedida: os ativos (o padrão), uma situação de uso, os inativos ou todos. */
  function naSituacao(situacao: string, ativo: AtivoGuardado): boolean {
    if (situacao === 'todos') return true;
    if (situacao === 'ativos') return ativo.situacao === 'ativo';
    if (situacao === 'inativos') return ativo.situacao === 'inativo';
    return ativo.situacao === 'ativo' && ativo.valores['ativo.uso'] === situacao;
  }

  function passaNoFiltro(filtro: FiltroDaVisao, coluna: ColunaDosAtivos, ativo: AtivoGuardado) {
    const valor = valorDa(filtro.chave, ativo);
    const vazio = valor === null || valor === '' || (Array.isArray(valor) && valor.length === 0);
    switch (filtro.operador) {
      case 'contem':
        return !vazio && normalizarTexto(String(valor)).includes(normalizarTexto(filtro.texto));
      case 'vazio':
        return vazio;
      case 'preenchido':
        return !vazio;
      case 'entre': {
        if (vazio) return false;
        // Os dois lados do mesmo tipo: o número, a data em aaaa-mm-dd ou o dia do momento.
        const comparado = (
          coluna.filtro === 'numero' ? Number(valor) : String(valor).slice(0, 10)
        ) as number;
        return (
          (filtro.de === undefined || comparado >= (filtro.de as number)) &&
          (filtro.ate === undefined || comparado <= (filtro.ate as number))
        );
      }
      case 'qualquer':
        return (Array.isArray(valor) ? valor : vazio ? [] : [valor]).some((um) =>
          filtro.valores.includes(String(um)),
        );
      case 'em':
        return !vazio && arvore.ramo(filtro.local).has(String(valor));
      case 'igual':
        return !vazio && String(valor) === filtro.local;
      case 'situacao':
        return naSituacao(filtro.situacao, ativo);
    }
  }

  /**
   * A chave da ordem da coluna no ativo, como a API ordena: o texto sem acento e sem caixa, o
   * número, o IP pelos octetos e o local pelo caminho; nula quando vazia. Todos têm o mesmo momento
   * de cadastro: a posição no cadastro desempata, como o id na API.
   */
  function chaveDaOrdem(
    coluna: ColunaDosAtivos,
    ativo: AtivoGuardado,
    posicao: number,
    locais: readonly string[],
  ): string | number | null {
    const nomeDaPessoa = (pessoaId: unknown) => {
      const pessoa = PESSOAS.find((candidata) => candidata.id === pessoaId);
      return pessoa ? normalizarTexto(pessoa.nome) : null;
    };
    const posicaoDoLocal = (localId: unknown) => {
      const indice = locais.indexOf(String(localId));
      return indice < 0 ? null : indice;
    };
    switch (coluna.chave) {
      case 'ativo.rotulo':
        return normalizarTexto(naLista(ativo).rotulo);
      case 'ativo.tipo':
        return normalizarTexto(tipoDe(ativo.tipoId)?.nome ?? '');
      case 'ativo.modelo': {
        const modelo = modeloDe(ativo.modeloId);
        return modelo ? normalizarTexto(`${modelo.fabricante} ${modelo.nome}`) : null;
      }
      case 'ativo.situacao': {
        const uso = ativo.valores['ativo.uso'];
        if (ativo.situacao === 'inativo') return 3;
        return uso === 'em-uso' ? 0 : uso === 'em-estoque' ? 1 : 2;
      }
      case 'ativo.criado-em':
      case 'ativo.atualizado-em':
        return posicao;
      case 'ativo.responsavel':
        return nomeDaPessoa(ativo.valores['ativo.responsavel']);
      case 'ativo.local':
        return posicaoDoLocal(ativo.valores['ativo.local']);
      case 'coleta.suprimentos':
      case 'coleta.paginas': {
        const numero = valorDa(coluna.chave, ativo);
        return typeof numero === 'number' ? numero : null;
      }
    }
    const valor = ativo.valores[coluna.chave];
    if (valor === undefined || valor === null || valor === '') return null;
    switch (coluna.campo?.tipo) {
      case 'inteiro':
      case 'decimal':
      case 'moeda':
        return Number(valor);
      case 'ip':
        return String(valor)
          .split('.')
          .reduce((soma, octeto) => soma * 256 + Number(octeto), 0);
      case 'lista':
        return (coluna.campo.configuracao?.opcoes ?? []).findIndex((opcao) => opcao.id === valor);
      case 'pessoa':
        return nomeDaPessoa(valor);
      case 'local':
        return posicaoDoLocal(valor);
      default:
        return normalizarTexto(String(valor));
    }
  }

  /** Os nomes dos registros que a página e os filtros apontam, como a API os manda com a lista. */
  function referenciasDa(
    itens: readonly AtivoNaLista[],
    filtros: readonly FiltroDaVisao[],
    colunas: ReadonlyMap<string, ColunaDosAtivos>,
  ): ReferenciasDaLista {
    const referencias: ReferenciasDaLista = {
      pessoas: {},
      locais: {},
      ativos: {},
      fornecedores: {},
      arquivos: {},
      modelos: {},
      tiposDosModelos: {},
    };
    const apontar = (chave: string, ids: readonly unknown[]) => {
      const tipo = colunas.get(chave)?.campo?.tipo;
      for (const outro of ids.map(String)) {
        const pessoa = PESSOAS.find((candidata) => candidata.id === outro);
        if (tipo === 'pessoa' && pessoa) referencias.pessoas[outro] = pessoa.nome;
        if (tipo === 'local' && locais.some((local) => local.id === outro)) {
          referencias.locais[outro] = arvore.caminho(outro);
        }
        const referido = ativoDe(outro);
        if (tipo === 'ativo' && referido) referencias.ativos[outro] = naLista(referido).rotulo;
        const fornecedor = fornecedorDe(outro);
        if (tipo === 'fornecedor' && fornecedor) {
          referencias.fornecedores[outro] = nomeDoFornecedor(fornecedor);
        }
      }
    };
    for (const item of itens) {
      for (const [chave, valor] of Object.entries(item.valores)) {
        apontar(chave, Array.isArray(valor) ? valor : [valor]);
      }
    }
    for (const filtro of filtros) {
      if (filtro.operador === 'em') apontar(filtro.chave, [filtro.local]);
      if (filtro.operador !== 'qualquer') continue;
      if (filtro.chave !== 'ativo.modelo') {
        apontar(filtro.chave, filtro.valores);
        continue;
      }
      for (const modeloId of filtro.valores) {
        const modelo = modeloDe(modeloId);
        if (!modelo) continue;
        referencias.modelos[modeloId] = `${modelo.fabricante} ${modelo.nome}`;
        referencias.tiposDosModelos[modeloId] = modelo.tipoId;
      }
    }
    return referencias;
  }

  /** Lê o parâmetro `filtros`, o JSON da lista, com a forma conferida pelo domínio. */
  function lerFiltros(bruto: string | null): FiltroDaVisao[] | null {
    if (!bruto?.trim()) return [];
    try {
      const lida = lerDefinicaoDaVisao({
        colunas: [],
        ordenacao: null,
        filtros: JSON.parse(bruto),
      });
      return lida.ok ? lida.definicao.filtros : null;
    } catch {
      return null;
    }
  }

  /** Os ativos que passam na situação, na busca e nos filtros das colunas, como a API os conta. */
  function filtrarAtivos(
    busca: URLSearchParams,
    filtros: readonly FiltroDaVisao[],
    colunas: ReadonlyMap<string, ColunaDosAtivos>,
  ) {
    // Sem a situação pedida, só os ativos, a não ser que um filtro de situação decida.
    const situacao =
      busca.get('situacao') ??
      (filtros.some((filtro) => filtro.operador === 'situacao') ? 'todos' : 'ativos');
    const local = busca.get('local');
    const palavras = normalizarTexto(busca.get('busca') ?? '')
      .split(' ')
      .filter(Boolean);
    const textoDe = (ativo: AtivoGuardado) => {
      const definicoes = definicoesDe(ativo.tipoId);
      const modelo = modeloDe(ativo.modeloId);
      const valores = Object.entries(ativo.valores).flatMap(([chave, valor]) => {
        const definicao = definicoes.porChave.get(chave);
        return definicao && !definicao.restrito && TIPOS_DA_BUSCA.has(definicao.tipo)
          ? [String(valor)]
          : [];
      });
      return normalizarTexto(
        [...valores, modelo ? `${modelo.fabricante} ${modelo.nome}` : ''].join(' '),
      );
    };
    return ativos
      .map((ativo, posicao) => ({ ativo, posicao }))
      .reverse()
      .filter(({ ativo }) => naSituacao(situacao, ativo))
      .filter(({ ativo }) => !busca.get('tipo') || ativo.tipoId === busca.get('tipo'))
      .filter(({ ativo }) => !local || arvore.ramo(local).has(String(ativo.valores['ativo.local'])))
      .filter(({ ativo }) => palavras.every((palavra) => textoDe(ativo).includes(palavra)))
      .filter(({ ativo }) =>
        filtros.every((filtro) => {
          const coluna = colunas.get(filtro.chave);
          return !coluna || passaNoFiltro(filtro, coluna, ativo);
        }),
      );
  }

  /**
   * As contagens de uma coluna de escolha, como a API: a busca e os outros filtros, sem o da própria
   * coluna, e cada opção marcada de uma lista múltipla contada à parte.
   */
  function contar(busca: URLSearchParams): Resposta {
    const colunas = colunasDaTabela();
    const filtros = lerFiltros(busca.get('filtros'));
    const chave = busca.get('coluna') ?? '';
    const coluna = colunas.get(chave);
    if (!filtros || coluna?.filtro !== 'escolha' || coluna.campo?.tipo === 'pessoa') {
      return problema(400, 'dados-invalidos', 'Confira os campos.', {
        coluna: 'Esta coluna não tem contagem.',
      });
    }
    const filtrados = filtrarAtivos(
      busca,
      filtros.filter((filtro) => filtro.chave !== chave),
      colunas,
    );
    const contagens = new Map<string, number>();
    for (const { ativo } of filtrados) {
      const valor = valorDa(chave, ativo);
      const marcadas = Array.isArray(valor) ? valor : valor === null || valor === '' ? [] : [valor];
      for (const marcada of marcadas) {
        contagens.set(String(marcada), (contagens.get(String(marcada)) ?? 0) + 1);
      }
    }
    return ok({
      coluna: chave,
      total: filtrados.length,
      opcoes: [...contagens]
        .map(([valor, quantos]) => ({ valor, quantos }))
        .sort((a, b) => b.quantos - a.quantos || a.valor.localeCompare(b.valor)),
    });
  }

  /**
   * A lista, como a API: a situação, a busca e os filtros das colunas, a ordem pela coluna pedida,
   * com os vazios no fim, ou a do cadastro, os mais novos primeiro, e as páginas pelo cursor, com os
   * valores das colunas pedidas e os nomes que eles e os filtros apontam.
   */
  function listar(busca: URLSearchParams): Resposta {
    const colunas = colunasDaTabela();
    const filtros = lerFiltros(busca.get('filtros'));
    if (!filtros) {
      return problema(400, 'dados-invalidos', 'Confira os campos.', {
        filtros: 'Os filtros não são válidos.',
      });
    }
    const filtrados = filtrarAtivos(busca, filtros, colunas);
    const pelaColuna = colunas.get(busca.get('ordem') ?? '');
    const sentido = busca.get('direcao') === 'decrescente' ? -1 : 1;
    const locais = locaisNaOrdem();
    const ordenados = pelaColuna?.ordena
      ? filtrados
          .map((item) => ({
            ...item,
            chave: chaveDaOrdem(pelaColuna, item.ativo, item.posicao, locais),
          }))
          // Os vazios ficam no fim nas duas direções, e os iguais, na ordem do cadastro.
          .sort((a, b) =>
            a.chave === null
              ? Number(b.chave !== null)
              : b.chave === null
                ? -1
                : sentido * comparar(a.chave, b.chave),
          )
      : filtrados;
    const inicio = Number(busca.get('cursor') ?? 0) || 0;
    const limite = Math.min(
      Number(busca.get('limite') ?? 50),
      porPagina ?? Number.POSITIVE_INFINITY,
    );
    const pedidas = (busca.get('colunas') ?? '')
      .split(',')
      .map((chave) => chave.trim())
      .filter((chave) => colunas.has(chave));
    const itens = ordenados
      .slice(inicio, inicio + limite)
      .map(({ ativo }) => naLista(ativo, pedidas));
    return ok({
      itens,
      proximo: inicio + limite < ordenados.length ? String(inicio + limite) : null,
      total: ordenados.length,
      referencias: referenciasDa(itens, filtros, colunas),
      permite: { cadastrar: true },
    });
  }

  /** Confere e grava o cadastro (`atual` nulo) ou a edição, como a API, com as recusas no campo. */
  function gravar(corpo: Corpo, atual: AtivoGuardado | null): Resposta {
    const tipoId = atual?.tipoId ?? String(corpo.tipoId);
    const tipo = tipoDe(tipoId);
    if (!tipo)
      return problema(400, 'dados-invalidos', 'Confira os campos.', {
        tipoId: 'Tipo de ativo não encontrado.',
      });
    const definicoes = definicoesDe(tipoId);
    const conferida = conferirValoresDoAtivo({
      campos: definicoes,
      atuais: atual?.valores ?? {},
      pedidos: (corpo.valores ?? {}) as Corpo,
      cadastro: atual === null,
    });
    if (!conferida.ok) {
      return problema(
        400,
        'dados-invalidos',
        'Confira os campos indicados.',
        prefixar('valores.', conferida.erros),
      );
    }
    const { mudancas } = conferida;
    const patrimonio = mudancas['ativo.patrimonio'];
    if (
      typeof patrimonio === 'string' &&
      ativos.some(
        (outro) =>
          outro.id !== atual?.id &&
          normalizarTexto(String(outro.valores['ativo.patrimonio'] ?? '')) ===
            normalizarTexto(patrimonio),
      )
    ) {
      const motivo = 'Já existe um ativo com este patrimônio.';
      return problema(409, 'conflito', motivo, { 'valores.ativo.patrimonio': motivo });
    }
    let modeloId = atual?.modeloId ?? null;
    const modeloMudou = corpo.modeloId !== undefined && corpo.modeloId !== modeloId;
    if (modeloMudou) {
      const modelo = corpo.modeloId === null ? null : modeloDe(corpo.modeloId);
      if (corpo.modeloId !== null && modelo?.tipoId !== tipoId) {
        return problema(400, 'dados-invalidos', 'Confira os campos.', {
          modeloId: 'O modelo escolhido não é do tipo do ativo.',
        });
      }
      modeloId = modelo?.id ?? null;
    }
    const gravadas = [...Object.keys(mudancas), ...(modeloMudou ? [CHAVE_DO_MODELO] : [])];
    let estado = registrarGravacao(atual?.estado ?? {}, gravadas, {
      origem: 'manual',
      momento: new Date().toISOString(),
      autorId: CONTA.id,
    });
    const travas = (corpo.travas ?? {}) as Record<string, boolean>;
    const mudadas = Object.fromEntries(
      Object.entries(travas).filter(([chave, trava]) => (estado[chave]?.trava ?? false) !== trava),
    );
    if (Object.keys(mudadas).length > 0) estado = aplicarTravas(estado, mudadas);
    const valores = { ...(atual?.valores ?? {}) };
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null) delete valores[chave];
      else valores[chave] = valor;
    }
    if (atual) {
      mudarComHistorico(atual, 'ativo.alterado', () =>
        Object.assign(atual, { modeloId, valores, estado }),
      );
      return ok(ficha(atual));
    }
    const novo: AtivoGuardado = {
      id: randomUUID(),
      tipoId,
      modeloId,
      imagem: null,
      valores,
      estado,
      situacao: 'ativo',
    };
    ativos.push(novo);
    registrar(
      novo.id,
      'ativo.criado',
      mudancasDoAtivo(null, visao(novo), { restritos: new Set(), verRestritos: true }),
    );
    return ok(ficha(novo), 201);
  }

  const naoEncontrado = () => problema(404, 'nao-encontrado', 'Ativo não encontrado.');

  /** A visão como a API a devolve: a conta da sessão edita todas, as suas e as da organização. */
  const comoVisao = (visao: VisaoGuardada) => ({
    id: visao.id,
    nome: visao.nome,
    compartilhada: visao.contaId === null,
    definicao: visao.definicao,
    permite: { editar: true },
  });

  /**
   * Confere e grava a visão nova (`atual` nula) ou a mudança dela, como a API: o nome e a definição
   * pelo domínio, e o nome repetido entre as da conta, ou entre as da organização, recusado no campo.
   */
  function gravarVisao(corpo: Corpo, atual: VisaoGuardada | null): Resposta {
    let nome = atual?.nome ?? '';
    if (corpo.nome !== undefined || !atual) {
      const lido = lerNomeDaVisao(String(corpo.nome ?? ''));
      if (!lido.ok) {
        return problema(400, 'dados-invalidos', 'Confira os campos.', { nome: lido.erro });
      }
      nome = lido.nome;
    }
    let definicao = atual?.definicao;
    if (corpo.definicao !== undefined || !definicao) {
      const lida = lerDefinicaoDaVisao(corpo.definicao);
      if (!lida.ok) {
        return problema(400, 'dados-invalidos', 'Confira os campos.', { definicao: lida.erro });
      }
      definicao = lida.definicao;
    }
    const contaId = atual ? atual.contaId : corpo.compartilhada === true ? null : CONTA.id;
    const repetido = visoes.some(
      (outra) =>
        outra.id !== atual?.id &&
        outra.contaId === contaId &&
        normalizarTexto(outra.nome) === normalizarTexto(nome),
    );
    if (repetido) return problema(409, 'conflito', NOME_REPETIDO, { nome: NOME_REPETIDO });
    if (atual) {
      Object.assign(atual, { nome, definicao });
      return ok(comoVisao(atual));
    }
    const nova: VisaoGuardada = { id: randomUUID(), nome, contaId, definicao };
    visoes.push(nova);
    return ok(comoVisao(nova), 201);
  }
  /** Os ativos das etiquetas, na ordem pedida e sem repetir, com quantos ficaram de fora. */
  function etiquetas(busca: URLSearchParams): Resposta {
    const pedidos = [
      ...new Set(
        (busca.get('ids') ?? '')
          .split(',')
          .map((pedido) => pedido.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (pedidos.length > 200) {
      return problema(400, 'dados-invalidos', 'Confira os campos.', {
        ids: 'Escolha até 200 ativos por vez.',
      });
    }
    const itens = pedidos.flatMap((pedido) => {
      const ativo = ativoDe(pedido);
      if (!ativo) return [];
      const { id, rotulo, patrimonio } = naLista(ativo);
      return [{ id, rotulo, patrimonio }];
    });
    return ok({ itens, fora: pedidos.length - itens.length });
  }

  const visaoDe = (visaoId: unknown) => visoes.find((visao) => visao.id === visaoId);
  const visaoNaoEncontrada = () => problema(404, 'nao-encontrado', 'Visão não encontrada.');

  /**
   * As contagens dos resumos, como a API: os ativos, sem os inativos. A sessão simulada é da
   * administradora, que vê tudo: nenhuma contagem é recortada.
   */
  const contagem = (quantos: number) => ({ quantos, recortada: false });
  const osAtivos = () => ativos.filter((ativo) => ativo.situacao === 'ativo');
  const resumoDoLocal = (localId: string | undefined): Resposta => {
    const local = arvore.local(localId ?? '');
    if (!local) return problema(404, 'nao-encontrado', 'Local não encontrado.');
    const ramo = arvore.ramo(local.id);
    const dosAtivos = osAtivos().map((ativo) => String(ativo.valores['ativo.local'] ?? ''));
    return ok({
      id: local.id,
      caminho: arvore.caminho(local.id),
      tipo: local.tipo,
      situacao: local.situacao,
      ativos: {
        aqui: contagem(dosAtivos.filter((outro) => outro === local.id).length),
        comOsDeDentro: contagem(dosAtivos.filter((outro) => ramo.has(outro)).length),
      },
      // As pessoas simuladas não têm local de trabalho.
      pessoas: { aqui: contagem(0), comOsDeDentro: contagem(0) },
    });
  };
  const resumoDaPessoa = (pessoaId: string | undefined): Resposta => {
    const pessoa = PESSOAS.find((outra) => outra.id === pessoaId);
    if (!pessoa) return problema(404, 'nao-encontrado', 'Pessoa não encontrada.');
    return ok({
      id: pessoa.id,
      nome: pessoa.nome,
      situacao: 'ativa',
      foto: null,
      local: null,
      temConta: false,
      ativos: contagem(
        osAtivos().filter((ativo) => ativo.valores['ativo.responsavel'] === pessoa.id).length,
      ),
    });
  };
  const resumoDoModelo = (modeloId: string | undefined): Resposta => {
    const modelo = modeloDe(modeloId);
    const tipo = modelo && tipoDe(modelo.tipoId);
    if (!modelo || !tipo) return problema(404, 'nao-encontrado', 'Modelo não encontrado.');
    return ok({
      id: modelo.id,
      fabricante: modelo.fabricante,
      nome: modelo.nome,
      imagem: modelo.imagem,
      situacao: modelo.situacao,
      tipo: { id: tipo.id, nome: tipo.nome, icone: tipo.icone },
      ativos: contagem(osAtivos().filter((ativo) => ativo.modeloId === modelo.id).length),
    });
  };
  const resumoDoTipo = (tipoId: string | undefined): Resposta => {
    const tipo = tipoDe(tipoId);
    if (!tipo) return problema(404, 'nao-encontrado', 'Tipo de ativo não encontrado.');
    return ok({
      id: tipo.id,
      nome: tipo.nome,
      icone: tipo.icone,
      situacao: tipo.situacao,
      ativos: contagem(osAtivos().filter((ativo) => ativo.tipoId === tipo.id).length),
    });
  };

  const rotas: [
    string,
    RegExp,
    (partes: string[], busca: URLSearchParams, corpo: Corpo, conteudo: Buffer) => Resposta,
  ][] = [
    ['GET', /^\/locais$/, () => ok({ locais, permite: { cadastrarNaRaiz: true } })],
    // As impressoras de menor nível, do bloco dos suprimentos do Início (change
    // opcoes-dos-blocos-do-inicio): o menor nível de cada ativo com o painel, do menor para o maior.
    [
      'GET',
      /^\/ativos\/suprimentos\/menores$/,
      () =>
        ok({
          itens: ativos
            .flatMap((ativo) => {
              const menor = ativo.painelDeSuprimentos?.menor;
              if (!menor || ativo.situacao !== 'ativo') return [];
              return [
                {
                  ativo: { id: ativo.id, rotulo: naLista(ativo).rotulo },
                  suprimento: {
                    item: '1',
                    descricao: menor.descricao,
                    tipo: tipoDoSuprimento(menor.descricao),
                    nivel: menor.nivel,
                    momento: menor.momento,
                  },
                },
              ];
            })
            .sort((a, b) => a.suprimento.nivel - b.suprimento.nivel)
            .slice(0, 6),
        }),
    ],
    // Os fornecedores (change p4a-fornecedores): a escolha e os ativos antes da ficha, cujo padrão
    // pega qualquer id.
    [
      'GET',
      /^\/fornecedores\/escolha$/,
      () =>
        ok({
          fornecedores: fornecedores
            .filter((fornecedor) => fornecedor.situacao === 'ativo')
            .map(({ id, nome, cnpj }) => ({
              id,
              nome,
              cnpj: cnpj ? cnpjComPontuacao(cnpj) : null,
            })),
        }),
    ],
    [
      'GET',
      /^\/fornecedores$/,
      (_, busca) => {
        const texto = normalizarTexto(busca.get('busca') ?? '');
        const caracteres = (busca.get('busca') ?? '').toUpperCase().replace(/[\s./-]/g, '');
        const situacao = busca.get('situacao') ?? 'ativos';
        const itens = fornecedores
          .filter(
            (fornecedor) =>
              (situacao === 'todos' ||
                (situacao === 'ativos') === (fornecedor.situacao === 'ativo')) &&
              (texto === '' ||
                normalizarTexto(fornecedor.nome).includes(texto) ||
                (caracteres !== '' && (fornecedor.cnpj ?? '').startsWith(caracteres))),
          )
          .sort((a, b) => normalizarTexto(a.nome).localeCompare(normalizarTexto(b.nome)))
          .map(comoFornecedor);
        return ok({ itens, total: itens.length, proximo: null, permite: { cadastrar: true } });
      },
    ],
    [
      'GET',
      /^\/fornecedores\/([^/]+)\/ativos$/,
      ([fornecedorId]) =>
        ok({
          ativos: osAtivos().filter((ativo) => ativo.valores['ativo.fornecedor'] === fornecedorId)
            .length,
        }),
    ],
    [
      'GET',
      /^\/fornecedores\/([^/]+)$/,
      ([fornecedorId]) => {
        const fornecedor = fornecedorDe(fornecedorId ?? '');
        if (!fornecedor) return problema(404, 'nao-encontrado', 'Fornecedor não encontrado.');
        return ok({ ...comoFornecedor(fornecedor), permite: { editar: true } });
      },
    ],
    [
      'POST',
      /^\/fornecedores$/,
      (_, __, corpo) => {
        const nome = textoDoPedido(corpo.nome) ?? '';
        if (fornecedores.some((outro) => normalizarTexto(outro.nome) === normalizarTexto(nome))) {
          return problema(409, 'conflito', 'Já existe um fornecedor com este nome.', {
            nome: 'Já existe um fornecedor com este nome.',
          });
        }
        const criado: FornecedorGuardado = {
          id: randomUUID(),
          nome,
          cnpj:
            textoDoPedido(corpo.cnpj)
              ?.toUpperCase()
              .replace(/[\s./-]/g, '') ?? null,
          contato: textoDoPedido(corpo.contato),
          email: textoDoPedido(corpo.email),
          telefone: textoDoPedido(corpo.telefone),
          observacoes: textoDoPedido(corpo.observacoes),
          situacao: 'ativo',
        };
        fornecedores.push(criado);
        return ok({ ...comoFornecedor(criado), permite: { editar: true } }, 201);
      },
    ],
    [
      'POST',
      /^\/fornecedores\/([^/]+)\/(inativacao|reativacao)$/,
      ([fornecedorId, acao]) => {
        const fornecedor = fornecedorDe(fornecedorId ?? '');
        if (!fornecedor) return problema(404, 'nao-encontrado', 'Fornecedor não encontrado.');
        fornecedor.situacao = acao === 'inativacao' ? 'inativo' : 'ativo';
        return ok({ ...comoFornecedor(fornecedor), permite: { editar: true } });
      },
    ],
    [
      'POST',
      /^\/pessoas$/,
      (_, __, corpo) => {
        const { nome, localId } = corpo as { nome: string; localId: string | null };
        return ok(
          {
            id: randomUUID(),
            nome,
            email: null,
            matricula: null,
            telefone: null,
            situacao: 'ativa',
            local: localId ? { id: localId, caminho: arvore.caminho(localId) } : null,
            conta: null,
          },
          201,
        );
      },
    ],
    [
      'POST',
      /^\/locais$/,
      (_, __, corpo) => {
        const { nome, tipo, paiId } = corpo as Pick<Local, 'nome' | 'tipo' | 'paiId'>;
        const repetido = locais.some(
          (local) => local.paiId === paiId && normalizarTexto(local.nome) === normalizarTexto(nome),
        );
        if (repetido) {
          const motivo = 'Já existe um local com este nome aqui.';
          return problema(409, 'conflito', motivo, { nome: motivo });
        }
        const criado: Local = {
          id: randomUUID(),
          paiId,
          nome,
          tipo,
          situacao: 'ativo',
          permite: { editar: true },
        };
        locais.push(criado);
        arvore = montarArvore(locais);
        return ok(criado, 201);
      },
    ],
    ['GET', /^\/locais\/([^/]+)\/resumo$/, ([localId]) => resumoDoLocal(localId)],
    ['GET', /^\/pessoas\/([^/]+)\/resumo$/, ([pessoaId]) => resumoDaPessoa(pessoaId)],
    ['GET', /^\/modelos\/([^/]+)\/resumo$/, ([modeloId]) => resumoDoModelo(modeloId)],
    ['GET', /^\/tipos-de-ativo\/([^/]+)\/resumo$/, ([tipoId]) => resumoDoTipo(tipoId)],
    [
      'GET',
      /^\/pessoas\/nomes$/,
      (_, busca) => {
        const palavras = normalizarTexto(busca.get('busca') ?? '')
          .split(' ')
          .filter(Boolean);
        return ok({
          pessoas: PESSOAS.filter((pessoa) =>
            palavras.every((palavra) => normalizarTexto(pessoa.nome).includes(palavra)),
          ).slice(0, 20),
        });
      },
    ],
    ['GET', /^\/ativos$/, (_, busca) => listar(busca)],
    // Antes da ficha, que tomaria "contagens" por um id.
    ['GET', /^\/ativos\/contagens$/, (_, busca) => contar(busca)],
    // Antes da ficha, que tomaria "etiquetas" por um id.
    ['GET', /^\/ativos\/etiquetas$/, (_, busca) => etiquetas(busca)],
    // Antes da ficha, que tomaria "rascunho" por um id.
    ['GET', /^\/ativos\/rascunho$/, () => ok({ rascunho })],
    [
      'PUT',
      /^\/ativos\/rascunho$/,
      (_, __, corpo) => {
        const guardado = { ...corpo, atualizadoEm: new Date().toISOString() };
        rascunho = guardado;
        return ok({ atualizadoEm: guardado.atualizadoEm });
      },
    ],
    [
      'DELETE',
      /^\/ativos\/rascunho$/,
      () => {
        rascunho = null;
        return { status: 204, json: null };
      },
    ],
    [
      'POST',
      /^\/ativos$/,
      (_, __, corpo) => {
        const resposta = gravar(corpo, null);
        if ('status' in resposta && resposta.status === 201) rascunho = null;
        return resposta;
      },
    ],
    [
      'GET',
      /^\/ativos\/([^/]+)$/,
      ([ativoId]) => {
        const ativo = ativoDe(ativoId);
        return ativo ? ok(ficha(ativo)) : naoEncontrado();
      },
    ],
    [
      'PATCH',
      /^\/ativos\/([^/]+)$/,
      ([ativoId], __, corpo) => {
        const ativo = ativoDe(ativoId);
        return ativo ? gravar(corpo, ativo) : naoEncontrado();
      },
    ],
    [
      'POST',
      /^\/ativos\/([^/]+)\/(inativacao|reativacao)$/,
      ([ativoId, acao]) => {
        const ativo = ativoDe(ativoId);
        if (!ativo) return naoEncontrado();
        const inativar = acao === 'inativacao';
        mudarComHistorico(ativo, inativar ? 'ativo.inativado' : 'ativo.reativado', () => {
          ativo.situacao = inativar ? 'inativo' : 'ativo';
        });
        return ok(ficha(ativo));
      },
    ],
    [
      'PUT',
      /^\/ativos\/([^/]+)\/imagem$/,
      ([ativoId]) => {
        const ativo = ativoDe(ativoId);
        if (!ativo) return naoEncontrado();
        ativo.imagem = { id: randomUUID() };
        registrar(ativo.id, 'imagem-do-ativo.trocada');
        return ok(ficha(ativo));
      },
    ],
    [
      'DELETE',
      /^\/ativos\/([^/]+)\/imagem$/,
      ([ativoId]) => {
        const ativo = ativoDe(ativoId);
        if (!ativo) return naoEncontrado();
        ativo.imagem = null;
        registrar(ativo.id, 'imagem-do-ativo.removida');
        return ok(ficha(ativo));
      },
    ],
    [
      'GET',
      /^\/ativos\/([^/]+)\/imagem\/([^/]+)\/[^/]+$/,
      ([ativoId, arquivo]) =>
        ativoDe(ativoId)?.imagem?.id === arquivo
          ? { status: 200, conteudo: IMAGEM, cabecalhos: { 'content-type': 'image/svg+xml' } }
          : problema(404, 'nao-encontrado', 'Imagem não encontrada.'),
    ],
    [
      'PUT',
      /^\/ativos\/([^/]+)\/campos\/([^/]+)\/arquivo$/,
      ([ativoId, campoId = ''], busca, _, conteudo) => {
        const ativo = ativoDe(ativoId);
        if (!ativo) return naoEncontrado();
        if (conteudo.length === 0) return problema(400, 'dados-invalidos', 'O arquivo está vazio.');
        // O tipo não é conferido pelo conteúdo, como na API: os cenários só enviam PDF.
        return mudarArquivo(ativo, campoId, {
          id: randomUUID(),
          nome: busca.get('nome') || 'arquivo',
          bytes: conteudo.length,
          tipo: 'application/pdf',
          conteudo,
        });
      },
    ],
    [
      'DELETE',
      /^\/ativos\/([^/]+)\/campos\/([^/]+)\/arquivo$/,
      ([ativoId, campoId = '']) => {
        const ativo = ativoDe(ativoId);
        return ativo ? mudarArquivo(ativo, campoId, null) : naoEncontrado();
      },
    ],
    [
      'GET',
      /^\/ativos\/([^/]+)\/campos\/([^/]+)\/arquivo\/([^/]+)\/completa$/,
      ([ativoId, campoId = '', arquivoId = '']) => {
        const ativo = ativoDe(ativoId);
        return ativo ? entregarArquivo(ativo, campoId, arquivoId) : naoEncontrado();
      },
    ],
    [
      'GET',
      /^\/ativos\/([^/]+)\/ligados$/,
      ([ativoId]) => {
        const ativo = ativoDe(ativoId);
        return ativo ? ligadosDe(ativo) : naoEncontrado();
      },
    ],
    [
      'POST',
      /^\/ativos\/([^/]+)\/ligacoes$/,
      ([ativoId], __, corpo) => {
        const ativo = ativoDe(ativoId);
        return ativo ? ligar(ativo, corpo) : naoEncontrado();
      },
    ],
    [
      'DELETE',
      /^\/ativos\/([^/]+)\/ligacoes\/([^/]+)$/,
      ([ativoId, ligacaoId = '']) => {
        const ativo = ativoDe(ativoId);
        return ativo ? desligar(ativo, ligacaoId) : naoEncontrado();
      },
    ],
    [
      'GET',
      /^\/ativos\/([^/]+)\/historico$/,
      ([ativoId], busca) => {
        const ativo = ativoDe(ativoId);
        return ativo ? historicoDe(ativo, busca) : naoEncontrado();
      },
    ],
    [
      'GET',
      /^\/visoes$/,
      () =>
        ok({
          visoes: [...visoes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(comoVisao),
          mudancas: [...mudancas.values()],
          permite: { compartilhar: true },
        }),
    ],
    ['POST', /^\/visoes$/, (_, __, corpo) => gravarVisao(corpo, null)],
    [
      'PUT',
      /^\/visoes\/mudancas$/,
      (_, __, corpo) => {
        const lidas = lerMudancasDaVisao(corpo);
        if (!lidas.ok) return problema(400, 'dados-invalidos', lidas.erro);
        const { visao, definicao } = lidas.mudancas;
        if (visao !== VISAO_DE_FABRICA && !visaoDe(visao)) return visaoNaoEncontrada();
        const guardadas = { visao, definicao, atualizadaEm: new Date().toISOString() };
        mudancas.set(visao, guardadas);
        return ok(guardadas);
      },
    ],
    [
      'DELETE',
      /^\/visoes\/mudancas$/,
      (_, busca) => {
        const visao = busca.get('visao');
        if (visao === null) mudancas.clear();
        else mudancas.delete(visao);
        return { status: 204, json: null };
      },
    ],
    [
      'POST',
      /^\/visoes\/([^/]+)\/publicar$/,
      ([visaoId]) => {
        const visao = visaoDe(visaoId);
        if (!visao) return visaoNaoEncontrada();
        const minhas = mudancas.get(visao.id);
        if (!minhas) return problema(409, 'conflito', 'Não há mudanças suas nesta visão.');
        visao.definicao = minhas.definicao;
        mudancas.delete(visao.id);
        return ok(comoVisao(visao));
      },
    ],
    [
      'PATCH',
      /^\/visoes\/([^/]+)$/,
      ([visaoId], __, corpo) => {
        const visao = visaoDe(visaoId);
        return visao ? gravarVisao(corpo, visao) : visaoNaoEncontrada();
      },
    ],
    [
      'DELETE',
      /^\/visoes\/([^/]+)$/,
      ([visaoId]) => {
        const visao = visaoDe(visaoId);
        if (!visao) return visaoNaoEncontrada();
        visoes.splice(visoes.indexOf(visao), 1);
        return { status: 204, json: null };
      },
    ],
  ];

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      const metodo = pedido.method();
      // A Nova pessoa pedida pelo Responsável do ativo grava aqui (change cadastro-em-abas); as
      // outras rotas das pessoas passam adiante.
      const novaPessoa = metodo === 'POST' && caminho === '/pessoas';
      if (!DOS_ATIVOS.test(caminho) && !novaPessoa) return rota.fallback();
      // As escritas vêm em JSON, e o envio de um arquivo, nos bytes crus dele.
      const emJson = pedido.headers()['content-type']?.startsWith('application/json');
      const corpo: Corpo = (metodo !== 'GET' && emJson && pedido.postDataJSON()) || {};
      const conteudo = (!emJson && pedido.postDataBuffer()) || Buffer.alloc(0);
      pedidos.push({ metodo, caminho: url.pathname, corpo, busca: url.searchParams });
      const encontrada = rotas
        .map(([metodoDaRota, padrao, responder]) => ({
          partes: metodoDaRota === metodo ? caminho.match(padrao) : null,
          responder,
        }))
        .find(({ partes }) => partes !== null);
      const resposta = encontrada?.partes
        ? encontrada.responder(encontrada.partes.slice(1), url.searchParams, corpo, conteudo)
        : problema(501, 'nao-simulado', `A API simulada não responde ${metodo} ${url.pathname}.`);
      if ('conteudo' in resposta) {
        await rota.fulfill({ status: 200, headers: resposta.cabecalhos, body: resposta.conteudo });
        return;
      }
      if (resposta.status === 204) return rota.fulfill({ status: 204 });
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return {
    catalogo: catalogo.estado,
    ativos,
    ligacoes,
    fornecedores,
    /** Os corpos das escritas no caminho, como "POST /api/ativos", na ordem. */
    corposDe: (pedidoFeito: string) =>
      pedidos
        .filter(({ metodo, caminho }) => `${metodo} ${caminho}` === pedidoFeito)
        .map(({ corpo }) => corpo),
    /** Os parâmetros das leituras no caminho, como "GET /api/ativos", na ordem. */
    parametrosDe: (pedidoFeito: string) =>
      pedidos
        .filter(({ metodo, caminho }) => `${metodo} ${caminho}` === pedidoFeito)
        .map(({ busca }) => busca),
    visoes,
    mudancas,
    /** O rascunho do cadastro guardado, ou nada. */
    rascunho: () => rascunho,
  };
}
