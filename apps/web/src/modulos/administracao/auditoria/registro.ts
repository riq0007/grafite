// Um registro da auditoria em texto (spec consulta-da-auditoria): quem fez, o alvo e o detalhe, com
// o antes → depois de cada campo que mudou e os dados da ação. Os ids internos ficam de fora. Os
// campos de um ativo aparecem um a um, pelo rótulo, e não como um bloco. Os registros dos chamados
// (change chamados-da-ti, design, "Os registros dos chamados na Auditoria (tarefa 5.28)") falam os
// termos das telas dos chamados, e o formulário de um tipo sai campo a campo.
import type { components } from '@grafite/api-client';
import {
  type CampoDoFormulario,
  DIAS_DA_SEMANA_DO_HORARIO,
  type DiaDaSemana,
  descricaoDa,
  type Formulario,
  fraseDoPrazo,
  MODOS_DO_PRAZO,
  type PrazoDoTipo,
  permissaoConhecida,
  ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO,
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  ROTULOS_DOS_MOTIVOS_DO_AJUSTE,
  ROTULOS_DOS_TIPOS,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_SEGREDO,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  type SituacaoDoTipoDeChamado,
  type SolicitacaoDoTipoDeChamado,
  UNIDADES_DO_PRAZO,
} from '@grafite/domain';
import { type CampoDaPrevia, descreverFuso, fusoReconhecido } from '@grafite/ui';
import { diasNaFrase, horaDoMinuto } from '../../chamados/ajustes/horario.ts';
import { NOMES_DOS_ICONES_DOS_TIPOS } from '../../chamados/icones.ts';
import { ROTULO_DA_SITUACAO } from '../../chamados/situacoes.ts';
import { avisarEmTexto } from '../../chat/equipesECanais.ts';

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
  // Os chamados (change chamados-da-ti); os sem id são as listas e o horário da organização.
  chamado: 'Chamado',
  'tipo-de-chamado': 'Tipo de chamado',
  'tipos-de-chamado': 'Ordem dos tipos de chamado',
  'resposta-pronta': 'Resposta pronta',
  'respostas-prontas': 'Ordem das respostas prontas',
  'horario-da-ti': 'Horário da TI',
  // As equipes e os canais do chat (change chat-com-chamados), que saem pelo tipo da ação.
  conversa: 'Conversa',
};

/** O tipo da conversa do alvo pela ação: as `equipe.*` e as `canal.*`. */
const tipoDaConversa = (acao: string) =>
  acao.startsWith('equipe.') ? 'Equipe' : acao.startsWith('canal.') ? 'Canal' : null;

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

/** Os alvos dos chamados, com os nomes e os valores das telas dos chamados. */
const ALVOS_DOS_CHAMADOS = new Set([
  'chamado',
  'tipo-de-chamado',
  'tipos-de-chamado',
  'resposta-pronta',
  'respostas-prontas',
  'horario-da-ti',
]);

/**
 * Os nomes dos campos nos registros dos chamados. A mesma chave muda de nome onde a palavra muda: a
 * `pessoa` do chamado não é a "Pedida por" da solicitação, e a `ordem` do tipo é a posição dele na
 * lista, e não a ordem de serviço.
 */
const CAMPOS_DOS_CHAMADOS: Record<string, string> = {
  numero: 'Número',
  tipo: 'Tipo',
  titulo: 'Título',
  pessoa: 'Pessoa',
  responsavel: 'Quem atende',
  os: 'Ordem de serviço',
  como: 'Pedido',
  icone: 'Ícone',
  frase: 'Frase',
  ordem: 'Posição na lista',
  prazo: 'Prazo',
  atendePorPadrao: 'Quem atende por padrão',
  semNinguem: 'Se não houver ninguém',
  podeVirarOs: 'Pode virar OS',
  geraSolicitacao: 'Gera uma Solicitação',
  tipoDeAtivoDoEquipamento: 'Tipo de ativo do equipamento',
  pedeOAtivo: 'Pede o ativo',
  apareceParaOColaborador: 'Aparece para o colaborador',
  soATiAbre: 'Só a TI abre',
  duplicadoDe: 'Duplicado de',
  rotulo: 'Rótulo',
  texto: 'Texto',
  esperaAResposta: 'Espera a resposta',
  opcoes: 'Opções da pergunta',
  tipos: 'Tipos',
  dias: 'Dias',
  inicio: 'Início',
  fim: 'Fim',
  fuso: 'Fuso horário',
  cargaCheia: 'Carga cheia',
  relogiosFechados: 'Chamados que contavam no horário da TI',
  // De onde o chamado veio: a TI ou o chat (change chat-com-chamados, decisão 8).
  origem: 'Origem',
};

/**
 * Os nomes dos campos das equipes e dos canais que não são os de todos, como a lista deles os
 * mostra (change chat-com-chamados).
 */
const CAMPOS_DO_CHAT: Record<string, string> = {
  escreve: 'Quem escreve',
  avisar: 'Avisar a cada mensagem',
};

/** As listas ordenadas, em que a `ordem` é a lista inteira. */
const LISTAS_DOS_CHAMADOS = new Set(['tipos-de-chamado', 'respostas-prontas']);

/**
 * As chaves na ordem das telas, pelo alvo: o banco guarda o JSON com as chaves curtas primeiro, e o
 * tipo sairia com o "Duplicado de" no meio. As que não estão aqui vão depois, como vieram.
 */
const ORDEM_NAS_TELAS: Readonly<Record<string, readonly string[]>> = {
  chamado: [
    'numero',
    'tipo',
    'titulo',
    'pessoa',
    'origem',
    'situacao',
    'responsavel',
    'ativo',
    'solicitacao',
    'os',
    'como',
  ],
  'tipo-de-chamado': [
    'nome',
    'icone',
    'frase',
    'situacao',
    'ordem',
    'prazo',
    'atendePorPadrao',
    'semNinguem',
    'podeVirarOs',
    'geraSolicitacao',
    'tipoDeAtivoDoEquipamento',
    'pedeOAtivo',
    'apareceParaOColaborador',
    'soATiAbre',
    'duplicadoDe',
  ],
  'resposta-pronta': ['rotulo', 'texto', 'esperaAResposta', 'opcoes', 'tipos'],
  'horario-da-ti': ['dias', 'inicio', 'fim', 'fuso', 'cargaCheia'],
  // As colunas da lista das equipes e dos canais.
  conversa: ['nome', 'tipo', 'grupo', 'escreve', 'avisar', 'situacao'],
};

/** As chaves do registro na ordem da tela do alvo; o alvo sem ordem fica como veio. */
function naOrdemDaTela(alvo: string, chaves: readonly string[]): string[] {
  const ordem = ORDEM_NAS_TELAS[alvo] ?? [];
  const posicao = (chave: string) => {
    const indice = ordem.indexOf(chave);
    return indice === -1 ? ordem.length : indice;
  };
  return [...chaves].sort((uma, outra) => posicao(uma) - posicao(outra));
}

const SITUACOES_DO_TIPO: Readonly<Record<SituacaoDoTipoDeChamado, string>> = {
  rascunho: 'Rascunho',
  'em-uso': 'Em uso',
  inativo: 'Inativo',
};

/** O "Se não houver ninguém" pelas opções do editor do tipo, sem o primeiro nome de quem atende. */
const SEM_NINGUEM: Readonly<Record<string, string>> = {
  triagem: 'Cai na triagem',
  fica: 'Fica com quem atende por padrão mesmo assim',
};

const GERA_SOLICITACAO: Readonly<Record<SolicitacaoDoTipoDeChamado, string>> = {
  nao: 'Não',
  toner: 'Toner',
  equipamento: 'Equipamento',
};

/** De onde o chamado veio. */
const ORIGENS_DO_CHAMADO: Readonly<Record<string, string>> = {
  ti: 'TI',
  chat: 'Chat',
};

/** Como o "Pedir toner" ligou o chamado à solicitação. */
const PEDIDOS_DO_TONER: Readonly<Record<string, string>> = {
  juntou: 'Juntou-se à solicitação pendente',
  pediu: 'Solicitação nova',
};

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

const ehValorDoPrazo = (valor: unknown) =>
  ehObjeto(valor) &&
  typeof valor.valor === 'number' &&
  (UNIDADES_DO_PRAZO as readonly unknown[]).includes(valor.unidade);

const ehPrazo = (valor: unknown): valor is PrazoDoTipo =>
  ehObjeto(valor) &&
  (MODOS_DO_PRAZO as readonly unknown[]).includes(valor.modo) &&
  ehValorDoPrazo(valor.resposta) &&
  ehValorDoPrazo(valor.resolucao);

const ehDias = (valor: unknown): valor is DiaDaSemana[] =>
  Array.isArray(valor) &&
  valor.every((dia) => (DIAS_DA_SEMANA_DO_HORARIO as readonly unknown[]).includes(dia));

const ehMinutoDoDia = (valor: unknown): valor is number =>
  Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) < 24 * 60;

/**
 * Um valor de um registro dos chamados em texto, nos termos das telas; `null` deixa o valor para o
 * texto comum, como o sim e o não, as listas e o vazio.
 */
function textoNosChamados(alvo: string, campo: string, valor: unknown): string | null {
  if (valor === null || valor === undefined) return campo === 'atendePorPadrao' ? 'Ninguém' : null;
  switch (campo) {
    // Os números do chamado, da OS e da solicitação, sem o ponto do milhar, como nas telas.
    case 'numero':
      return typeof valor === 'number' && alvo === 'chamado' ? `#${valor}` : String(valor);
    case 'os':
    case 'solicitacao':
      return String(valor);
    case 'situacao':
      if (alvo === 'chamado' && typeof valor === 'string' && valor in ROTULO_DA_SITUACAO) {
        return ROTULO_DA_SITUACAO[valor as keyof typeof ROTULO_DA_SITUACAO];
      }
      if (typeof valor === 'string' && valor in SITUACOES_DO_TIPO) {
        return SITUACOES_DO_TIPO[valor as SituacaoDoTipoDeChamado];
      }
      return null;
    case 'icone':
      return typeof valor === 'string' && valor in NOMES_DOS_ICONES_DOS_TIPOS
        ? NOMES_DOS_ICONES_DOS_TIPOS[valor as keyof typeof NOMES_DOS_ICONES_DOS_TIPOS]
        : null;
    case 'prazo':
      return ehPrazo(valor) ? fraseDoPrazo(valor) : null;
    case 'semNinguem':
      return typeof valor === 'string' ? (SEM_NINGUEM[valor] ?? null) : null;
    case 'geraSolicitacao':
      return typeof valor === 'string' && valor in GERA_SOLICITACAO
        ? GERA_SOLICITACAO[valor as SolicitacaoDoTipoDeChamado]
        : null;
    case 'como':
      return typeof valor === 'string' ? (PEDIDOS_DO_TONER[valor] ?? null) : null;
    case 'origem':
      return typeof valor === 'string' ? (ORIGENS_DO_CHAMADO[valor] ?? null) : null;
    case 'tipos':
      return Array.isArray(valor) && valor.length === 0 ? 'Todos os tipos' : null;
    case 'opcoes':
      return Array.isArray(valor) && valor.length === 0 ? 'Sem pergunta' : null;
    case 'dias':
      return ehDias(valor) ? (diasNaFrase(valor) ?? '—') : null;
    case 'inicio':
    case 'fim':
      return ehMinutoDoDia(valor) ? horaDoMinuto(valor) : null;
    case 'fuso':
      return typeof valor === 'string' && fusoReconhecido(valor)
        ? descreverFuso(valor, new Date()).rotulo
        : null;
  }
  // Os textos dos chamados, como o nome do tipo, vão como foram escritos, sem os rótulos dos
  // outros módulos.
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/**
 * Um valor de um registro das equipes e dos canais em texto, nos termos da lista deles; `null`
 * deixa o valor para o texto comum, como o nome, quem escreve e a situação, que a API já grava em
 * texto.
 */
function textoNoChat(campo: string, valor: unknown, noCanal: boolean): string | null {
  if (campo === 'avisar' && typeof valor === 'boolean') return avisarEmTexto(valor);
  // O canal não tem grupo: participam todos que usam o chat, como a lista diz.
  if (campo === 'grupo' && (valor === null || valor === undefined) && noCanal) {
    return 'Todos que usam o chat';
  }
  return null;
}

/** As partes de uma frase juntas por vírgula e, a última, por "e". */
function juntar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

const ehFormulario = (valor: unknown): valor is Formulario =>
  ehObjeto(valor) && Array.isArray(valor.campos) && ehObjeto(valor.titulo);

const nomeDoTipoDoCampo = (tipo: string) =>
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[
    tipo as keyof typeof ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO
  ] ?? tipo;

/** O campo pelo rótulo; sem rótulo, pelo tipo, como a escolha do título do construtor. */
const rotuloDoCampo = (campo: CampoDoFormulario) => campo.rotulo || nomeDoTipoDoCampo(campo.tipo);

/** De onde o título do chamado vem, como o "Título do chamado" do construtor o explica. */
function textoDoTitulo({ titulo, campos }: Formulario): string {
  const campo = campos.find(({ id }) => id === titulo.campoId);
  if (!campo) return 'A primeira resposta de texto ou o nome do tipo';
  const resposta = `a resposta de “${rotuloDoCampo(campo)}”`;
  return titulo.comecaPeloTipo ? `O nome do tipo e ${resposta}` : `A${resposta.slice(1)}`;
}

const igual = (um: unknown, outro: unknown) => JSON.stringify(um) === JSON.stringify(outro);

/** O que mudou num campo do formulário, nas palavras do construtor. */
function oQueMudouNoCampo(de: CampoDoFormulario, para: CampoDoFormulario): string[] {
  const partes: string[] = [];
  if (de.rotulo !== para.rotulo) partes.push(`o rótulo (antes, “${de.rotulo}”)`);
  if (de.tipo !== para.tipo) partes.push(`o tipo (antes, ${nomeDoTipoDoCampo(de.tipo)})`);
  if (de.nomeNoResumo !== para.nomeNoResumo) partes.push('o nome no resumo');
  if (de.obrigatorio !== para.obrigatorio) {
    partes.push(para.obrigatorio ? 'agora obrigatório' : 'agora opcional');
  }
  if (de.soDaTi !== para.soDaTi) {
    partes.push(para.soDaTi ? 'agora só a TI vê' : 'agora a pessoa também vê');
  }
  if (de.apagarSeSumir !== para.apagarSeSumir) {
    partes.push(
      para.apagarSeSumir
        ? 'agora apaga a resposta se o campo sumir'
        : 'agora guarda a resposta se o campo sumir',
    );
  }
  if (!igual(de.opcoes, para.opcoes)) partes.push('as opções');
  if (!igual(de.tiposDeAtivo, para.tiposDeAtivo)) partes.push('os tipos de ativo');
  if (!igual(de.condicao, para.condicao)) partes.push('a condição');
  return partes;
}

/**
 * O formulário salvo, pelo que mudou: o título do chamado, uma linha por campo acrescentado, mudado
 * ou tirado, pelo rótulo, e a ordem dos campos que ficaram. `null`, sem os dois formulários.
 */
function linhasDoFormulario(de: unknown, para: unknown): CampoDaPrevia[] | null {
  if (!ehFormulario(de) || !ehFormulario(para)) return null;
  const linhas: CampoDaPrevia[] = [];
  const tituloAntes = textoDoTitulo(de);
  const tituloDepois = textoDoTitulo(para);
  if (!igual(de.titulo, para.titulo) && tituloAntes !== tituloDepois) {
    linhas.push({ rotulo: 'Título do chamado', valor: `${tituloAntes} → ${tituloDepois}` });
  }
  const antes = new Map(de.campos.map((campo) => [campo.id, campo]));
  const depois = new Map(para.campos.map((campo) => [campo.id, campo]));
  for (const campo of para.campos) {
    const doAntes = antes.get(campo.id);
    if (!doAntes) {
      linhas.push({
        rotulo: rotuloDoCampo(campo),
        valor: `Acrescentado: ${nomeDoTipoDoCampo(campo.tipo)}`,
      });
    } else if (!igual(doAntes, campo)) {
      const partes = oQueMudouNoCampo(doAntes, campo);
      linhas.push({
        rotulo: rotuloDoCampo(campo),
        valor: partes.length === 0 ? 'Mudado' : `Mudado: ${juntar(partes)}`,
      });
    }
  }
  for (const campo of de.campos) {
    if (!depois.has(campo.id)) linhas.push({ rotulo: rotuloDoCampo(campo), valor: 'Tirado' });
  }
  const ficaramAntes = de.campos.filter(({ id }) => depois.has(id));
  const ficaramDepois = para.campos.filter(({ id }) => antes.has(id));
  const ids = (campos: readonly CampoDoFormulario[]) => campos.map(({ id }) => id).join();
  if (ids(ficaramAntes) !== ids(ficaramDepois)) {
    const rotulos = (campos: readonly CampoDoFormulario[]) => campos.map(rotuloDoCampo).join(', ');
    linhas.push({
      rotulo: 'Ordem dos campos',
      valor: `${rotulos(ficaramAntes)} → ${rotulos(ficaramDepois)}`,
    });
  }
  return linhas;
}

/**
 * Os rótulos sem repetição: o segundo "Observação" vira "Observação (2)", como no resumo do
 * chamado, porque a prévia usa o rótulo como a chave da linha.
 */
function comRotulosUnicos(campos: readonly CampoDaPrevia[]): CampoDaPrevia[] {
  const usados = new Set<string>();
  return campos.map((campo) => {
    let rotulo = campo.rotulo;
    for (let vez = 2; usados.has(rotulo); vez++) rotulo = `${campo.rotulo} (${vez})`;
    usados.add(rotulo);
    return rotulo === campo.rotulo ? campo : { ...campo, rotulo };
  });
}

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

/**
 * O tipo do alvo e, quando ele tem, o nome atual, como "Conta: Ana Souza (ana.souza)". A conversa do
 * chat sai pelo tipo da ação, como "Canal: Avisos da TI".
 */
export function textoDoAlvo(alvo: Registro['alvo'], acao = ''): string {
  const tipo =
    (alvo.tipo === 'conversa' ? tipoDaConversa(acao) : null) ??
    TIPOS_DO_ALVO[alvo.tipo] ??
    alvo.tipo;
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
    { rotulo: 'Alvo', valor: textoDoAlvo(registro.alvo, registro.acao) },
    { rotulo: 'Endereço IP', valor: registro.ip ?? '—', mono: true },
    { rotulo: 'Código de rastreio', valor: registro.codigoDeRastreio ?? '—', mono: true },
  ];
  const antes = registro.antes ?? {};
  const depois = registro.depois ?? {};
  const alvo = registro.alvo.tipo;
  const dosChamados = ALVOS_DOS_CHAMADOS.has(alvo);
  const doChat = alvo === 'conversa';
  const noCanal = doChat && tipoDaConversa(registro.acao) === 'Canal';
  const nome = (campo: string) => {
    if (doChat) return CAMPOS_DO_CHAT[campo] ?? nomeDoCampo(campo);
    if (!dosChamados) return nomeDoCampo(campo);
    if (campo === 'ordem' && LISTAS_DOS_CHAMADOS.has(alvo)) return 'Ordem';
    return CAMPOS_DOS_CHAMADOS[campo] ?? nomeDoCampo(campo);
  };
  const texto = (campo: string, valor: unknown) =>
    (dosChamados ? textoNosChamados(alvo, campo, valor) : null) ??
    (doChat ? textoNoChat(campo, valor, noCanal) : null) ??
    textoDoValor(campo, valor, formatarData);
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
  for (const campo of naOrdemDaTela(alvo, chaves)) {
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
    if (campo === 'formulario' && dosChamados) {
      const linhas = linhasDoFormulario(antes.formulario, depois.formulario);
      if (linhas) {
        campos.push(...linhas);
        continue;
      }
    }
    campos.push(mudanca(nome(campo), texto(campo, antes[campo]), texto(campo, depois[campo])));
  }
  for (const [campo, valor] of Object.entries(registro.dados ?? {})) {
    if (ehId(campo)) continue;
    campos.push({ rotulo: nome(campo), valor: texto(campo, valor) });
  }
  return comRotulosUnicos(campos);
}
