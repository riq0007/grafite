// O catálogo de ativos no domínio (spec catalogo-de-ativos; design do P1a, decisões 1 e 4): os
// ícones genéricos que um tipo escolhe, as capacidades, que só existem no código, e a regra da
// lista de campos de um tipo.
import { type ConfiguracaoDoCampo, campoDeArquivo, type TipoDeCampo } from '../campos/tipos.ts';
import { FORMATO_DO_HORARIO, HORARIO_PADRAO_DO_BACKUP } from '../coleta/backup-do-control-id.ts';
import {
  PORTA_DO_CONTROL_ID,
  ROTULOS_DAS_SITUACOES_DO_CONTROL_ID,
  SITUACOES_DO_CONTROL_ID,
} from '../coleta/control-id.ts';
import {
  ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE,
  SITUACOES_DA_DISPONIBILIDADE,
} from '../coleta/disponibilidade.ts';

/** Os ícones genéricos do F0 que um tipo de ativo escolhe; a UI tem o desenho de cada um. */
export const ICONES_DE_TIPO = [
  'impressora',
  'computador',
  'notebook',
  'monitor',
  'switch',
  'rack',
  'controle-de-acesso',
  'camera',
  'storage',
  'nobreak',
  'generico',
] as const;

export type IconeDeTipo = (typeof ICONES_DE_TIPO)[number];

export const ROTULOS_DOS_ICONES = {
  impressora: 'Impressora',
  computador: 'Computador',
  notebook: 'Notebook',
  monitor: 'Monitor',
  switch: 'Switch',
  rack: 'Rack',
  'controle-de-acesso': 'Controle de acesso',
  camera: 'Câmera',
  storage: 'Storage',
  nobreak: 'Nobreak',
  generico: 'Genérico',
} as const satisfies Record<IconeDeTipo, string>;

export const SITUACOES_DO_CADASTRO = ['ativo', 'inativo'] as const;
export type SituacaoDoCadastro = (typeof SITUACOES_DO_CADASTRO)[number];

/** Quem pode gravar o valor: só a edição manual, ou também a importação e a coleta. */
export const POLITICAS_DE_ESCRITA = ['manual', 'automatica'] as const;
export type PoliticaDeEscrita = (typeof POLITICAS_DE_ESCRITA)[number];

/** Um campo trazido por uma capacidade, com a chave fixa no código. */
export interface CampoDaCapacidade {
  chave: string;
  rotulo: string;
  tipo: TipoDeCampo;
  grupo: string;
  configuracao: ConfiguracaoDoCampo;
  escrita: PoliticaDeEscrita;
}

/**
 * Uma coluna da tabela dos ativos com um valor coletado: a situação, como a da disponibilidade, ou um
 * número, como o menor nível dos suprimentos (change p2b-impressoras-por-snmp, design, decisão 8).
 */
export type ColunaColetada =
  | {
      chave: string;
      rotulo: string;
      tipo: 'situacao';
      /** As situações que a coluna mostra e que o filtro "é qualquer de" escolhe. */
      opcoes: readonly { id: string; rotulo: string }[];
      /** A largura de fábrica, em px: a que mostra a situação e a idade da leitura sem corte. */
      largura: number;
    }
  | {
      chave: string;
      rotulo: string;
      tipo: 'numero';
      /** O sufixo do número, como "%"; sem ele, só o número. */
      unidade?: string;
      /** A largura de fábrica, em px: a que mostra o número, o item e a idade sem corte. */
      largura: number;
    };

export interface Capacidade {
  chave: string;
  nome: string;
  descricao: string;
  campos: readonly CampoDaCapacidade[];
  /**
   * O que o tipo escolhe ao ligá-la: o campo de IP da disponibilidade na rede; o campo de IP, a
   * versão e a comunidade do SNMP; ou o campo de IP, a porta e o login do Control iD.
   */
  configuracao?: 'campo-de-ip' | 'snmp' | 'control-id' | 'backup-do-control-id' | 'acesso-remoto';
  /** As colunas coletadas que ela dá à tabela dos ativos. */
  colunas?: readonly ColunaColetada[];
}

const doInventario = (
  chave: string,
  rotulo: string,
  tipo: TipoDeCampo,
  grupo: 'Hardware' | 'Software',
  configuracao: ConfiguracaoDoCampo = {},
): CampoDaCapacidade => ({ chave, rotulo, tipo, grupo, configuracao, escrita: 'automatica' });

/**
 * As capacidades com código. Cada uma chega com o subprojeto dela: a disponibilidade e o SNMP no
 * P2, o Control iD no P5, o mapa no P7, as portas e o rack no T2 e os consumíveis no P4b. Os monitores
 * não são campo do inventário: o monitor é um ativo, ligado ao computador (P1d).
 */
/** A porta do VNC de fábrica (change acesso-remoto-vnc). */
export const PORTA_PADRAO_DO_VNC = 5900;

export const CAPACIDADES: readonly Capacidade[] = [
  {
    chave: 'hardware.inventario',
    nome: 'Inventário de hardware',
    descricao:
      'Identificação, rede, processador, memória, discos, sistema e licenças do computador.',
    campos: [
      doInventario('hardware.uuid', 'UUID', 'texto', 'Hardware'),
      doInventario('hardware.ip', 'IP do computador', 'ip', 'Hardware'),
      doInventario('hardware.mac', 'MAC', 'mac', 'Hardware'),
      doInventario('hardware.processador', 'Processador', 'texto', 'Hardware'),
      doInventario('hardware.memoria', 'Memória (GB)', 'inteiro', 'Hardware', {
        minimo: 0,
        maximo: 100_000,
      }),
      doInventario('hardware.discos', 'Discos', 'texto-longo', 'Hardware'),
      doInventario('software.sistema', 'Sistema operacional', 'texto', 'Software'),
      doInventario('software.versao-do-sistema', 'Versão do sistema', 'texto', 'Software'),
      doInventario('software.licenca-do-windows', 'Licença do Windows', 'licenca', 'Software'),
      doInventario('software.licenca-do-office', 'Licença do Office', 'licenca', 'Software'),
      doInventario('software.antivirus', 'Antivírus', 'texto', 'Software'),
      doInventario('software.usuario', 'Último usuário informado', 'texto', 'Software'),
      doInventario('software.ultima-inicializacao', 'Última inicialização', 'texto', 'Software'),
    ],
  },
  {
    chave: 'rede.disponibilidade',
    nome: 'Disponibilidade na rede',
    descricao: 'Confere pelo ping, a cada 2 minutos, se o ativo responde na rede.',
    campos: [],
    configuracao: 'campo-de-ip',
    colunas: [
      {
        chave: 'coleta.disponibilidade',
        rotulo: 'Disponibilidade',
        tipo: 'situacao',
        largura: 210,
        opcoes: SITUACOES_DA_DISPONIBILIDADE.map((situacao) => ({
          id: situacao,
          rotulo: ROTULOS_DAS_SITUACOES_DA_DISPONIBILIDADE[situacao],
        })),
      },
    ],
  },
  {
    chave: 'snmp.suprimentos',
    nome: 'Suprimentos e contadores',
    descricao:
      'Lê por SNMP, a cada 10 minutos, os suprimentos, os contadores e as condições da impressora.',
    campos: [],
    configuracao: 'snmp',
    colunas: [
      {
        chave: 'coleta.suprimentos',
        rotulo: 'Suprimentos',
        tipo: 'numero',
        unidade: '%',
        largura: 340,
      },
      { chave: 'coleta.paginas', rotulo: 'Total de páginas', tipo: 'numero', largura: 200 },
    ],
  },
  {
    chave: 'controlid.saude',
    nome: 'Saúde do Control iD',
    descricao: 'Confere, a cada 5 minutos, se o controle de acesso responde e aceita o login.',
    campos: [],
    configuracao: 'control-id',
    colunas: [
      {
        chave: 'coleta.control-id',
        rotulo: 'Control iD',
        tipo: 'situacao',
        largura: 280,
        opcoes: SITUACOES_DO_CONTROL_ID.map((situacao) => ({
          id: situacao,
          rotulo: ROTULOS_DAS_SITUACOES_DO_CONTROL_ID[situacao],
        })),
      },
    ],
  },
  {
    // O backup usa o IP, a porta e o login da saúde do Control iD do mesmo tipo (change
    // p5a-backup-do-control-id, design, decisão 1); a configuração própria é o horário.
    chave: 'controlid.backup',
    nome: 'Backup do Control iD',
    descricao:
      'Guarda, todo dia, os usuários, os grupos, os cartões, a biometria, as regras de acesso, os horários e as fotos do controle de acesso.',
    campos: [],
    configuracao: 'backup-do-control-id',
  },
  {
    // Sem campos nem configuração: os modelos do tipo passam a ter os consumíveis compatíveis,
    // escolhidos na ficha de cada consumível (change p4b-consumiveis, design, decisão 3).
    chave: 'consumiveis.compatibilidade',
    nome: 'Consumíveis compatíveis',
    descricao: 'Os consumíveis que servem nos modelos do tipo, como o toner de cada impressora.',
    campos: [],
  },
  {
    // O acesso remoto usa o IP da disponibilidade na rede do mesmo tipo; a configuração própria é a
    // porta (change acesso-remoto-vnc, design, decisão 1).
    chave: 'acesso.vnc',
    nome: 'Acesso remoto por VNC',
    descricao: 'Abre a tela da máquina no navegador, pelo VNC.',
    campos: [],
    configuracao: 'acesso-remoto',
  },
];

/** O cartão da Visão geral na ficha do ativo. */
export const VISAO_GERAL_DA_FICHA = 'visao-geral';

/**
 * As capacidades que dão um cartão na ficha do ativo, com o painel ou com os campos: todas menos o
 * acesso por VNC (change primeiro-cartao-da-ficha, design, decisão 2).
 */
export const CAPACIDADES_COM_CARTAO: readonly string[] = CAPACIDADES.map(
  (capacidade) => capacidade.chave,
).filter((chave) => chave !== 'acesso.vnc');

/** A ordem em que a ficha procura o cartão da capacidade principal do tipo, no automático. */
export const PRIORIDADE_DO_PRIMEIRO_CARTAO = [
  'snmp.suprimentos',
  'controlid.saude',
  'hardware.inventario',
  'rede.disponibilidade',
] as const;

/** O cartão que o automático abre: a primeira capacidade da prioridade que o tipo liga. */
export function primeiroCartaoAutomatico(capacidades: readonly string[]): string {
  return (
    PRIORIDADE_DO_PRIMEIRO_CARTAO.find((chave) => capacidades.includes(chave)) ??
    VISAO_GERAL_DA_FICHA
  );
}

/**
 * Confere o primeiro cartão escolhido no tipo: o nulo, o ausente e o vazio são o automático; a
 * Visão geral e uma capacidade ligada com cartão valem; a capacidade desligada é esquecida, como a
 * configuração dela.
 */
export function conferirPrimeiroCartao({
  pedido,
  capacidades,
}: {
  pedido: unknown;
  /** As capacidades ligadas no tipo, já conferidas. */
  capacidades: readonly string[];
}): { ok: true; primeiroCartao: string | null } | { ok: false; erro: string } {
  if (pedido === undefined || pedido === null || pedido === '') {
    return { ok: true, primeiroCartao: null };
  }
  if (pedido === VISAO_GERAL_DA_FICHA) return { ok: true, primeiroCartao: pedido };
  if (typeof pedido !== 'string' || !CAPACIDADES_COM_CARTAO.includes(pedido)) {
    return {
      ok: false,
      erro: 'Escolha a Visão geral ou uma capacidade do tipo com cartão na ficha.',
    };
  }
  return { ok: true, primeiroCartao: capacidades.includes(pedido) ? pedido : null };
}

export function capacidadeDa(chave: string): Capacidade | undefined {
  return CAPACIDADES.find((capacidade) => capacidade.chave === chave);
}

/** O que a regra da lista de campos precisa saber de cada campo da organização. */
export interface CampoDaOrganizacao {
  id: string;
  rotulo: string;
  tipo: TipoDeCampo;
  situacao: SituacaoDoCadastro;
}

export interface CampoDoTipo {
  campoId: string;
  obrigatorio: boolean;
}

const MAXIMO_DE_CAMPOS = 100;

/**
 * Confere a lista de campos pedida para um tipo: sem repetir, até 100 e só campos da organização. O
 * campo inativo só fica se já estava no tipo (`atuais`); a inclusão nova dele é recusada. O arquivo
 * e a imagem não são obrigatórios, porque são enviados depois do cadastro do ativo.
 */
export function conferirCamposDoTipo(
  atuais: readonly string[],
  pedidos: readonly CampoDoTipo[],
  campos: readonly CampoDaOrganizacao[],
): { ok: true; campos: CampoDoTipo[] } | { ok: false; erro: string } {
  if (pedidos.length > MAXIMO_DE_CAMPOS) {
    return { ok: false, erro: `Use até ${MAXIMO_DE_CAMPOS} campos por tipo.` };
  }
  const porId = new Map(campos.map((campo) => [campo.id, campo]));
  const vistos = new Set<string>();
  for (const { campoId, obrigatorio } of pedidos) {
    const campo = porId.get(campoId);
    if (!campo) return { ok: false, erro: 'Campo não encontrado.' };
    if (obrigatorio && campoDeArquivo(campo.tipo)) {
      return {
        ok: false,
        erro: 'Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro.',
      };
    }
    if (vistos.has(campoId))
      return { ok: false, erro: `O campo ${campo.rotulo} aparece duas vezes.` };
    vistos.add(campoId);
    if (campo.situacao === 'inativo' && !atuais.includes(campoId)) {
      return { ok: false, erro: `O campo ${campo.rotulo} está inativo.` };
    }
  }
  return {
    ok: true,
    campos: pedidos.map(({ campoId, obrigatorio }) => ({ campoId, obrigatorio })),
  };
}

/** As versões do SNMP que o coletor lê. */
export const VERSOES_DO_SNMP = ['1', '2c'] as const;
export type VersaoDoSnmp = (typeof VERSOES_DO_SNMP)[number];

/**
 * A configuração que o tipo guarda de cada capacidade que pede uma (design do P2a, decisão 10, e do
 * P2b, decisão 3). Sem o segredo da comunidade, vale a `public`.
 */
export interface ConfiguracaoDasCapacidades {
  'rede.disponibilidade'?: { campoDoIp: string };
  'snmp.suprimentos'?: { campoDoIp: string; versao: VersaoDoSnmp; segredoId: string | null };
  /** Sem o login, só os controles com login próprio são sondados (change login-de-cada-controle). */
  'controlid.saude'?: { campoDoIp: string; porta: number; segredoId: string | null };
  'controlid.backup'?: { horario: string };
  'acesso.vnc'?: { porta: number };
}

/** As capacidades que escolhem um campo de IP, com o que a recusa diz de cada uma. */
const DO_CAMPO_DE_IP = {
  'rede.disponibilidade': { usa: 'o ping', de: 'da disponibilidade' },
  'snmp.suprimentos': { usa: 'o SNMP', de: 'dos suprimentos e contadores' },
  'controlid.saude': { usa: 'a sondagem', de: 'da saúde do Control iD' },
} as const;

export type CapacidadeComIp = keyof typeof DO_CAMPO_DE_IP;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecusaDaConfiguracao = { ok: false; erro: string; onde: 'campos' | 'configuracao' };

const recusa = (erro: string, onde: 'campos' | 'configuracao' = 'configuracao') =>
  ({ ok: false, erro, onde }) as RecusaDaConfiguracao;

/**
 * O campo de IP que uma capacidade escolhe: do tipo IP, ativo e no tipo. Com a configuração de antes,
 * o campo que era o IP dela e saiu do tipo tem a recusa própria, que diz qual capacidade o usa.
 */
function campoDeIp(
  capacidade: CapacidadeComIp,
  pedido: unknown,
  {
    campos,
    atual,
    definicoes,
  }: { campos: readonly string[]; atual: unknown; definicoes: readonly CampoDaOrganizacao[] },
): string | RecusaDaConfiguracao {
  const { usa, de } = DO_CAMPO_DE_IP[capacidade];
  if (typeof pedido !== 'string' || !pedido) return recusa(`Escolha o campo de IP que ${usa} usa.`);
  const definicao = definicoes.find((campo) => campo.id === pedido);
  if (!definicao) return recusa('Escolha um campo de IP que esteja no tipo.');
  if (!campos.includes(pedido)) {
    const antes = (atual as ConfiguracaoDasCapacidades | null | undefined)?.[capacidade];
    return antes?.campoDoIp === pedido
      ? recusa(
          `O campo ${definicao.rotulo} é o IP ${de} neste tipo: escolha outro antes de tirá-lo.`,
          'campos',
        )
      : recusa('Escolha um campo de IP que esteja no tipo.');
  }
  if (definicao.tipo !== 'ip') return recusa(`O campo ${definicao.rotulo} não é do tipo IP.`);
  if (definicao.situacao === 'inativo') return recusa(`O campo ${definicao.rotulo} está inativo.`);
  return pedido;
}

/**
 * Confere a configuração das capacidades ligadas no tipo: a disponibilidade na rede pede um campo do
 * tipo IP, ativo e no tipo, e os suprimentos e contadores pedem também a versão do SNMP, 1 ou 2c, com
 * a 2c sem escolha, e a comunidade, um segredo do cofre, ou nenhum, para a `public`. A API confere no
 * banco que o segredo está ativo e é do tipo Comunidade SNMP. A configuração de uma capacidade
 * desligada, ou desconhecida, é esquecida.
 */
export function conferirConfiguracaoDasCapacidades({
  capacidades,
  configuracao,
  campos,
  atual,
  definicoes,
}: {
  /** As capacidades ligadas no tipo, já conferidas. */
  capacidades: readonly string[];
  configuracao: unknown;
  /** Os ids dos campos do tipo, como ficam depois da gravação. */
  campos: readonly string[];
  /** A configuração guardada antes da gravação. */
  atual: unknown;
  definicoes: readonly CampoDaOrganizacao[];
}): { ok: true; configuracao: ConfiguracaoDasCapacidades } | RecusaDaConfiguracao {
  const resultado: ConfiguracaoDasCapacidades = {};
  const pedida = (configuracao ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const doTipo = { campos, atual, definicoes };
  if (capacidades.includes('rede.disponibilidade')) {
    const campoDoIp = campoDeIp(
      'rede.disponibilidade',
      pedida['rede.disponibilidade']?.campoDoIp,
      doTipo,
    );
    if (typeof campoDoIp !== 'string') return campoDoIp;
    resultado['rede.disponibilidade'] = { campoDoIp };
  }
  if (capacidades.includes('snmp.suprimentos')) {
    const doSnmp = pedida['snmp.suprimentos'];
    const campoDoIp = campoDeIp('snmp.suprimentos', doSnmp?.campoDoIp, doTipo);
    if (typeof campoDoIp !== 'string') return campoDoIp;
    const versao = doSnmp?.versao ?? '2c';
    if (!(VERSOES_DO_SNMP as readonly unknown[]).includes(versao)) {
      return recusa('Escolha a versão 1 ou 2c do SNMP.');
    }
    const segredoId = doSnmp?.segredoId ?? null;
    if (segredoId !== null && (typeof segredoId !== 'string' || !UUID.test(segredoId))) {
      return recusa('Escolha uma comunidade SNMP ativa do cofre.');
    }
    resultado['snmp.suprimentos'] = {
      campoDoIp,
      versao: versao as VersaoDoSnmp,
      segredoId: segredoId === null ? null : segredoId.toLowerCase(),
    };
  }
  if (capacidades.includes('controlid.saude')) {
    const doControle = pedida['controlid.saude'];
    const campoDoIp = campoDeIp('controlid.saude', doControle?.campoDoIp, doTipo);
    if (typeof campoDoIp !== 'string') return campoDoIp;
    const porta = doControle?.porta ?? PORTA_DO_CONTROL_ID;
    if (typeof porta !== 'number' || !Number.isInteger(porta) || porta < 1 || porta > 65535) {
      return recusa('Informe uma porta de 1 a 65535.');
    }
    const pedido = doControle?.segredoId;
    const segredoId = pedido === undefined || pedido === '' ? null : pedido;
    if (segredoId !== null && (typeof segredoId !== 'string' || !UUID.test(segredoId))) {
      return recusa(
        'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.',
      );
    }
    resultado['controlid.saude'] = {
      campoDoIp,
      porta,
      segredoId: segredoId === null ? null : segredoId.toLowerCase(),
    };
  }
  if (capacidades.includes('controlid.backup')) {
    if (!capacidades.includes('controlid.saude')) {
      return recusa(
        'Ligue a saúde do Control iD no tipo: o backup usa o mesmo IP, a mesma porta e o mesmo login.',
      );
    }
    const horario = pedida['controlid.backup']?.horario ?? HORARIO_PADRAO_DO_BACKUP;
    if (typeof horario !== 'string' || !FORMATO_DO_HORARIO.test(horario)) {
      return recusa('Informe o horário como 02:00.');
    }
    resultado['controlid.backup'] = { horario };
  }
  if (capacidades.includes('acesso.vnc')) {
    if (!capacidades.includes('rede.disponibilidade')) {
      return recusa('Ligue a disponibilidade na rede no tipo: o acesso remoto usa o mesmo IP.');
    }
    const porta = pedida['acesso.vnc']?.porta ?? PORTA_PADRAO_DO_VNC;
    if (typeof porta !== 'number' || !Number.isInteger(porta) || porta < 1 || porta > 65535) {
      return recusa('Informe a porta de 1 a 65535.');
    }
    resultado['acesso.vnc'] = { porta };
  }
  return { ok: true, configuracao: resultado };
}

/** A recusa de inativar o campo que é o IP de uma capacidade em algum tipo, dizendo qual. */
export function recusaDaInativacaoPeloIp(
  rotulo: string,
  capacidade: CapacidadeComIp,
  tipos: number,
): string {
  const onde =
    tipos === 1 ? '1 tipo: escolha outro campo nele' : `${tipos} tipos: escolha outro campo neles`;
  return `O campo ${rotulo} é o IP ${DO_CAMPO_DE_IP[capacidade].de} em ${onde} antes de inativá-lo.`;
}

/** A recusa de inativar o campo que é o IP da disponibilidade em algum tipo. */
export const recusaDaInativacaoPelaDisponibilidade = (rotulo: string, tipos: number): string =>
  recusaDaInativacaoPeloIp(rotulo, 'rede.disponibilidade', tipos);
