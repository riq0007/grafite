// Um registro da auditoria em texto (spec consulta-da-auditoria): quem fez, o alvo e o detalhe, com
// o antes → depois de cada campo que mudou e os dados da ação. Os ids internos ficam de fora. Os
// campos de um ativo aparecem um a um, pelo rótulo, e não como um bloco.
import type { components } from '@grafite/api-client';
import {
  descricaoDa,
  permissaoConhecida,
  ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  ROTULOS_DOS_MOTIVOS_DO_AJUSTE,
  ROTULOS_DOS_TIPOS,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_SEGREDO,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
} from '@grafite/domain';
import type { CampoDaPrevia } from '@grafite/ui';

export type Registro = components['schemas']['RegistroDeAuditoria'];

const TIPOS_DO_ALVO: Record<string, string> = {
  pessoa: 'Pessoa',
  conta: 'Conta',
  perfil: 'Perfil',
  grupo: 'Grupo',
  local: 'Local',
  sessao: 'Sessão',
  organizacao: 'Organização',
  ativo: 'Ativo',
  segredo: 'Segredo',
  cofre: 'Cofre',
  indicador: 'Indicador',
  fornecedor: 'Fornecedor',
  consumivel: 'Consumível',
  solicitacao: 'Solicitação',
  ordem: 'Ordem de serviço',
};

/** Os nomes dos campos do antes → depois e dos dados, como a tela os mostra. */
const CAMPOS: Record<string, string> = {
  nome: 'Nome',
  email: 'E-mail',
  matricula: 'Matrícula',
  telefone: 'Telefone',
  local: 'Local',
  caminho: 'Caminho',
  tipo: 'Tipo',
  situacao: 'Situação',
  usuario: 'Usuário',
  senhaTemporaria: 'Senha temporária',
  exigeDoisPassos: 'Exige verificação em dois passos',
  descricao: 'Descrição',
  permissoes: 'Permissões',
  todasAsPermissoes: 'Todas as permissões',
  perfil: 'Perfil',
  grupo: 'Grupo',
  encerradaEm: 'Encerrada em',
  motivo: 'Motivo',
  sessoesEncerradas: 'Sessões encerradas',
  encerradas: 'Sessões encerradas',
  ignoradas: 'Permissões que não valem no local',
  camposApagados: 'Campos apagados',
  falhasSeguidas: 'Tentativas erradas seguidas',
  bloqueadaAte: 'Bloqueada até',
  dispositivo: 'Dispositivo',
  modelo: 'Modelo',
  travados: 'Travados',
  outro: 'Outro ativo',
  ipDaDisponibilidade: 'IP da disponibilidade',
  classificacao: 'Classificação',
  identificador: 'Identificador',
  endereco: 'Endereço',
  notas: 'Notas',
  validade: 'Validade',
  proximaRotacao: 'Próxima rotação',
  acesso: 'Acesso',
  ate: 'Até',
  recifrados: 'Segredos com a chave nova',
  meta: 'Meta',
  indicador: 'Indicador',
  cnpj: 'CNPJ',
  contato: 'Contato',
  observacoes: 'Observações',
  origem: 'Origem',
  codigoDoFabricante: 'Código',
  cor: 'Cor',
  rendimento: 'Rendimento',
  fornecedores: 'Fornecedores',
  modelos: 'Modelos',
  // O estoque (change p4c-estoque): a movimentação e o mínimo.
  consumivel: 'Consumível',
  quantidade: 'Quantidade',
  destino: 'Destino',
  fornecedor: 'Fornecedor',
  notaFiscal: 'Nota fiscal',
  ativo: 'Ativo',
  contador: 'Total de páginas',
  contadorLidoEm: 'Lido em',
  observacao: 'Observação',
  minimo: 'Mínimo',
  // As solicitações (change p4d-solicitacoes): o pedido, o atendimento e o encerramento.
  numero: 'Número',
  pessoa: 'Pedida por',
  impressoras: 'Impressoras',
  itens: 'Itens',
  defeito: 'Defeito',
  tipoDeAtivo: 'Tipo de ativo',
  osDoFornecedor: 'OS do fornecedor',
  entregues: 'Entregues',
  oQueFoiFeito: 'O que foi feito',
  motivoDoCancelamento: 'Motivo do cancelamento',
  entreguePeloFornecedor: 'Entregue pelo fornecedor',
  // As ordens de serviço (change p4e-ordens-de-servico): a abertura, a situação e a peça, e a OS
  // que a solicitação segue.
  solicitacao: 'Solicitação',
  problema: 'Problema',
  solucao: 'O que foi feito',
  ordem: 'Ordem de serviço',
};

/** Os motivos das recusas do cofre, como a tela os diz. */
const MOTIVOS: Record<string, string> = {
  'cofre-fechado': 'Cofre fechado',
  'segredo-inativo': 'Segredo inativo',
  'nao-liberado': 'Segredo não liberado',
  'segredo-nao-abre': 'O cofre não abre o segredo',
  'codigo-incorreto': 'Código incorreto',
  'codigo-de-recuperacao': 'Código de recuperação',
  // Os motivos do ajuste do estoque.
  ...ROTULOS_DOS_MOTIVOS_DO_AJUSTE,
};

/**
 * O que a visão do ativo guarda para o histórico, e não para quem consulta: os rótulos dos campos
 * restritos que estavam nela.
 */
const SO_PARA_O_HISTORICO = new Set(['restritos']);

const SITUACOES: Record<string, string> = {
  ativa: 'Ativa',
  inativa: 'Inativa',
  anonimizada: 'Anonimizada',
  ativo: 'Ativo',
  inativo: 'Inativo',
  ...ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  ...ROTULOS_DAS_SITUACOES_DA_ORDEM,
};

/** Os ids internos, que não dizem nada a quem consulta. */
const ehId = (campo: string) => campo === 'id' || /Ids?$/.test(campo);

export function textoDoAtor(ator: Registro['ator']): string {
  if (ator.tipo === 'conta') return ator.usuario ? `${ator.nome} (${ator.usuario})` : ator.nome;
  if (ator.tipo === 'sistema') return ator.descricao;
  return 'Sem sessão';
}

/** O tipo do alvo e, quando ele tem, o nome atual, como "Conta: Ana Souza (ana.souza)". */
export function textoDoAlvo(alvo: Registro['alvo']): string {
  const tipo = TIPOS_DO_ALVO[alvo.tipo] ?? alvo.tipo;
  if (!alvo.nome) return tipo;
  return `${tipo}: ${alvo.usuario ? `${alvo.nome} (${alvo.usuario})` : alvo.nome}`;
}

/** Um valor de um campo em texto: o vazio como "—", e as chaves conhecidas pelo nome. */
function textoDoValor(campo: string, valor: unknown, formatarData: (data: Date) => string): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) {
    if (valor.length === 0) return '—';
    return valor
      .map((item) => {
        if (typeof item === 'string' && permissaoConhecida(item)) return descricaoDa(item);
        // Um registro com nome, como um titular do acesso de um segredo: o nome dele.
        if (typeof item === 'object' && item !== null && typeof item.nome === 'string') {
          return item.nome;
        }
        return String(item);
      })
      .join(', ');
  }
  if (typeof valor === 'string') {
    if (campo === 'situacao') return SITUACOES[valor] ?? valor;
    if (campo === 'tipo' && valor in ROTULOS_DOS_TIPOS) {
      return ROTULOS_DOS_TIPOS[valor as keyof typeof ROTULOS_DOS_TIPOS];
    }
    if (campo === 'tipo' && valor in ROTULOS_DOS_TIPOS_DE_SEGREDO) {
      return ROTULOS_DOS_TIPOS_DE_SEGREDO[valor as keyof typeof ROTULOS_DOS_TIPOS_DE_SEGREDO];
    }
    if (campo === 'tipo' && valor in ROTULOS_DOS_TIPOS_DE_CONSUMIVEL) {
      return ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[valor as keyof typeof ROTULOS_DOS_TIPOS_DE_CONSUMIVEL];
    }
    if (campo === 'tipo' && valor in ROTULOS_DOS_TIPOS_DE_SOLICITACAO) {
      return ROTULOS_DOS_TIPOS_DE_SOLICITACAO[
        valor as keyof typeof ROTULOS_DOS_TIPOS_DE_SOLICITACAO
      ];
    }
    if (campo === 'cor' && valor in ROTULOS_DAS_CORES_DE_CONSUMIVEL) {
      return ROTULOS_DAS_CORES_DE_CONSUMIVEL[valor as keyof typeof ROTULOS_DAS_CORES_DE_CONSUMIVEL];
    }
    if (campo === 'classificacao' && valor in ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO) {
      return ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO[
        valor as keyof typeof ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO
      ];
    }
    if (campo === 'motivo' && valor in MOTIVOS) return MOTIVOS[valor] ?? valor;
    if (/Em$|Ate$/.test(campo) && !Number.isNaN(Date.parse(valor))) {
      return formatarData(new Date(valor));
    }
    return valor;
  }
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR');
  // Um registro com nome, como o outro ativo de uma ligação: o nome dele.
  if (typeof valor === 'object' && typeof (valor as { rotulo?: unknown }).rotulo === 'string') {
    return (valor as { rotulo: string }).rotulo;
  }
  return JSON.stringify(valor);
}

const nomeDoCampo = (campo: string) => CAMPOS[campo] ?? campo;

/** Os campos do ativo na visão gravada: o valor mostrado de cada um, pelo rótulo. */
function camposDaVisao(valor: unknown): Record<string, string> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === 'string'),
  );
}

/**
 * O detalhe do registro na prévia: tudo o que a lista mostra, o antes → depois de cada campo que
 * mudou e os dados da ação.
 */
export function camposDoDetalhe(
  registro: Registro,
  formatarData: (data: Date) => string,
): CampoDaPrevia[] {
  const campos: CampoDaPrevia[] = [
    { rotulo: 'Quem fez', valor: textoDoAtor(registro.ator) },
    { rotulo: 'Alvo', valor: textoDoAlvo(registro.alvo) },
    { rotulo: 'Endereço IP', valor: registro.ip ?? '—', mono: true },
    { rotulo: 'Código de rastreio', valor: registro.codigoDeRastreio ?? '—', mono: true },
  ];
  const antes = registro.antes ?? {};
  const depois = registro.depois ?? {};
  const mudanca = (rotulo: string, valorAntes: string, valorDepois: string): CampoDaPrevia => ({
    rotulo,
    valor:
      registro.antes === null
        ? valorDepois
        : registro.depois === null
          ? `${valorAntes} → —`
          : `${valorAntes} → ${valorDepois}`,
  });
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(
    (campo) => !ehId(campo) && !SO_PARA_O_HISTORICO.has(campo),
  );
  for (const campo of chaves) {
    if (campo === 'campos') {
      // Os campos de um ativo, um a um: só os que mudaram, pelo valor mostrado.
      const de = camposDaVisao(antes.campos);
      const para = camposDaVisao(depois.campos);
      for (const rotulo of new Set([...Object.keys(de), ...Object.keys(para)])) {
        if (de[rotulo] !== para[rotulo]) {
          campos.push(mudanca(rotulo, de[rotulo] ?? '—', para[rotulo] ?? '—'));
        }
      }
      continue;
    }
    if (JSON.stringify(antes[campo]) === JSON.stringify(depois[campo])) continue;
    campos.push(
      mudanca(
        nomeDoCampo(campo),
        textoDoValor(campo, antes[campo], formatarData),
        textoDoValor(campo, depois[campo], formatarData),
      ),
    );
  }
  for (const [campo, valor] of Object.entries(registro.dados ?? {})) {
    if (ehId(campo)) continue;
    campos.push({ rotulo: nomeDoCampo(campo), valor: textoDoValor(campo, valor, formatarData) });
  }
  return campos;
}
