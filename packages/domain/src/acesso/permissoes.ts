// O catálogo de permissões (design do F2b, decisão 2): definido pelo sistema, e não pela
// organização. Cada módulo acrescenta aqui as suas, e a API e a web leem o mesmo catálogo. Perfis,
// grupos e atribuições são dados da organização; as permissões, não.

/** Onde a permissão vale: no ramo de um local ou só na organização inteira. */
export type EscopoDaPermissao = 'local' | 'organizacao';

export interface DefinicaoDePermissao {
  /** "area.acao", em minúsculas e sem acento, como `pessoas.editar`. */
  chave: string;
  /** O grupo da permissão na ficha do perfil, como "Pessoas". */
  area: string;
  /** Escrita para caber depois de "Você não tem permissão para…". */
  descricao: string;
  escopo: EscopoDaPermissao;
  /** As permissões que ela traz junto, como ver quem se edita. */
  inclui: readonly string[];
}

export const PERMISSOES = [
  {
    chave: 'pessoas.ver',
    area: 'Pessoas',
    descricao: 'Ver pessoas e contas',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'pessoas.editar',
    area: 'Pessoas',
    descricao: 'Cadastrar e editar pessoas, inativar e reativar',
    escopo: 'local',
    inclui: ['pessoas.ver'],
  },
  {
    chave: 'pessoas.anonimizar',
    area: 'Pessoas',
    descricao: 'Anonimizar pessoas inativas',
    escopo: 'organizacao',
    inclui: ['pessoas.ver'],
  },
  {
    chave: 'contas.administrar',
    area: 'Pessoas',
    descricao:
      'Criar contas, redefinir a senha e os dois passos, desbloquear, inativar, reativar e encerrar sessões',
    escopo: 'organizacao',
    inclui: ['pessoas.ver'],
  },
  {
    chave: 'acessos.ver',
    area: 'Acessos',
    descricao: 'Ver perfis, grupos e o acesso de cada conta',
    escopo: 'organizacao',
    inclui: ['pessoas.ver'],
  },
  {
    chave: 'acessos.administrar',
    area: 'Acessos',
    descricao: 'Criar e editar perfis e grupos e atribuir perfis',
    escopo: 'organizacao',
    inclui: ['acessos.ver'],
  },
  // O diretório da organização (change integracao-ad-ldap): a configuração, os mapeamentos e a
  // gerência dos usuários e dos grupos do AD
  {
    chave: 'diretorio.administrar',
    area: 'Acessos',
    descricao: 'Administrar o diretório (AD)',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'locais.editar',
    area: 'Locais',
    descricao: 'Cadastrar, renomear, mover, inativar e reativar locais',
    escopo: 'local',
    inclui: [],
  },
  // Fornecedores (P4a): o cadastro da organização, na Administração.
  {
    chave: 'fornecedores.ver',
    area: 'Fornecedores',
    descricao: 'Ver os fornecedores',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'fornecedores.editar',
    area: 'Fornecedores',
    descricao: 'Cadastrar e editar os fornecedores, inativar e reativar',
    escopo: 'organizacao',
    inclui: ['fornecedores.ver'],
  },
  {
    chave: 'organizacao.editar',
    area: 'Organização',
    descricao: 'Definir os padrões, as visões compartilhadas e os módulos da organização',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'auditoria.ver',
    area: 'Auditoria',
    descricao: 'Consultar a auditoria',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'tarefas.administrar',
    area: 'Tarefas',
    descricao: 'Ver as tarefas com falha e tentar de novo',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'backup.administrar',
    area: 'Backup',
    descricao:
      'Ver os backups, fazer um backup na hora e mudar o horário (só na organização que opera o servidor)',
    escopo: 'organizacao',
    inclui: [],
  },
  // Ativos (P1a): quem desenha o cadastro e quem cuida dos modelos de equipamento.
  {
    chave: 'catalogo.administrar',
    area: 'Ativos',
    descricao: 'Cadastrar e editar os tipos de ativo e os campos, inativar e reativar',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'modelos.editar',
    area: 'Ativos',
    descricao: 'Cadastrar e editar os modelos de equipamento e a imagem deles, inativar e reativar',
    escopo: 'organizacao',
    inclui: [],
  },
  // Ativos (P1b): pelo local do ativo, como as pessoas pelo local de trabalho.
  {
    chave: 'ativos.ver',
    area: 'Ativos',
    descricao: 'Ver os ativos',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'ativos.editar',
    area: 'Ativos',
    descricao: 'Cadastrar e editar os ativos, travar os campos, inativar e reativar',
    escopo: 'local',
    inclui: ['ativos.ver'],
  },
  {
    chave: 'ativos.restritos',
    area: 'Ativos',
    descricao: 'Ver os campos restritos dos ativos e, com a edição, editá-los',
    escopo: 'local',
    inclui: ['ativos.ver'],
  },
  // Coleta (P2a): quem cuida dos coletores da organização e das faixas de rede deles.
  {
    chave: 'coletores.administrar',
    area: 'Coleta',
    descricao:
      'Cadastrar e editar os coletores e as faixas de rede deles, trocar o token, inativar e reativar',
    escopo: 'organizacao',
    inclui: [],
  },
  // Cofre (P6): quem usa o cofre revela os segredos liberados a ele; quem o administra cuida dos
  // segredos e do acesso, e revela só o que liberou a si mesmo.
  {
    chave: 'cofre.usar',
    area: 'Cofre',
    descricao: 'Abrir o cofre e revelar e copiar os segredos liberados à conta',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'cofre.administrar',
    area: 'Cofre',
    descricao:
      'Cadastrar e editar os segredos, trocar o valor, dar e tirar o acesso, inativar e reativar',
    escopo: 'organizacao',
    inclui: ['cofre.usar'],
  },
  // Alertas (P3a): quem vê e trata os alertas, pelo local do ativo, e quem cuida das regras.
  {
    chave: 'alertas.ver',
    area: 'Alertas',
    descricao: 'Ver os alertas',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'alertas.tratar',
    area: 'Alertas',
    descricao: 'Reconhecer e adiar os alertas e silenciar os alertas de um ativo',
    escopo: 'local',
    inclui: ['alertas.ver'],
  },
  {
    chave: 'alertas.administrar',
    area: 'Alertas',
    descricao:
      'Cadastrar e editar as regras de alerta, inativar e reativar, e mudar as metas dos indicadores',
    escopo: 'organizacao',
    inclui: ['alertas.ver'],
  },
  {
    chave: 'consumiveis.ver',
    area: 'Consumíveis',
    descricao: 'Ver os consumíveis',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'consumiveis.editar',
    area: 'Consumíveis',
    descricao:
      'Cadastrar e editar os consumíveis, com os fornecedores e os modelos compatíveis, inativar e reativar',
    escopo: 'organizacao',
    inclui: ['consumiveis.ver'],
  },
  {
    chave: 'estoque.ver',
    area: 'Estoque',
    descricao: 'Ver o estoque e as movimentações',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'estoque.movimentar',
    area: 'Estoque',
    descricao:
      'Lançar as entradas, as saídas, as transferências e os ajustes do estoque e definir o mínimo',
    escopo: 'local',
    inclui: ['estoque.ver'],
  },
  {
    chave: 'solicitacoes.ver',
    area: 'Solicitações',
    descricao: 'Ver as solicitações',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'solicitacoes.atender',
    area: 'Solicitações',
    descricao:
      'Registrar e alterar as solicitações, pedir ao fornecedor, entregar, concluir, cancelar e mudar a situação',
    escopo: 'local',
    inclui: ['solicitacoes.ver'],
  },
  {
    chave: 'ordens.ver',
    area: 'Ordens de serviço',
    descricao: 'Ver as ordens de serviço',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'ordens.atender',
    area: 'Ordens de serviço',
    descricao:
      'Abrir e corrigir as ordens de serviço, mudar a situação, informar o fornecedor, lançar as peças, resolver, reabrir e encerrar',
    escopo: 'local',
    inclui: ['ordens.ver'],
  },
  // Os indicadores da operação (change p4f-indicadores-da-operacao): quem decide a operação vê as
  // OS e o estoque da organização inteira.
  {
    chave: 'operacao.administrar',
    area: 'Operação',
    descricao: 'Mudar as metas dos indicadores da operação e receber o aviso de fora da meta',
    escopo: 'organizacao',
    inclui: ['ordens.ver', 'estoque.ver'],
  },
  // O backup do Control iD (change p5a-backup-do-control-id): o local do backup é o do controle.
  {
    chave: 'controlid.ver',
    area: 'Control iD',
    descricao: 'Ver os backups do Control iD e o conteúdo deles',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'controlid.backup',
    area: 'Control iD',
    descricao: 'Fazer e apagar os backups do Control iD',
    escopo: 'local',
    inclui: ['controlid.ver'],
  },
  // A restauração (change p5b-comparacao-e-restauracao): no local do controle de destino.
  {
    chave: 'controlid.restaurar',
    area: 'Control iD',
    descricao: 'Restaurar os backups do Control iD nos controles',
    escopo: 'local',
    inclui: ['controlid.ver'],
  },
  // O mapa da planta (change p7-mapa-da-planta): o que aparece de cada ativo segue o ativos.ver.
  {
    chave: 'mapa.ver',
    area: 'Mapa',
    descricao: 'Ver as plantas e o mapa',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'mapa.editar',
    area: 'Mapa',
    descricao: 'Cadastrar as plantas e posicionar no mapa',
    escopo: 'organizacao',
    inclui: ['mapa.ver'],
  },
  // A distribuição de software pelo agente do GLPI (change distribuicao-de-software)
  {
    chave: 'software.distribuir',
    area: 'Software',
    descricao: 'Distribuir software às máquinas',
    escopo: 'local',
    inclui: [],
  },
  {
    chave: 'software.administrar',
    area: 'Software',
    descricao: 'Administrar a base de software',
    escopo: 'organizacao',
    inclui: ['software.distribuir'],
  },
  // O acesso remoto por VNC (change acesso-remoto-vnc)
  {
    chave: 'ativos.acesso-remoto',
    area: 'Ativos',
    descricao: 'Acessar as máquinas por VNC',
    escopo: 'local',
    inclui: ['ativos.ver'],
  },
  // As salas de reunião (change salas-de-reuniao)
  {
    chave: 'salas.ver',
    area: 'Salas',
    descricao: 'Ver as salas e pedir as reservas',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'salas.administrar',
    area: 'Salas',
    descricao: 'Cadastrar as salas e os itens e aprovar as reservas',
    escopo: 'organizacao',
    inclui: ['salas.ver'],
  },
  // Os painéis das VMs (change painel-de-dashboards)
  {
    chave: 'paineis.ver',
    area: 'Painéis',
    descricao: 'Ver os painéis',
    escopo: 'organizacao',
    inclui: [],
  },
  {
    chave: 'paineis.administrar',
    area: 'Painéis',
    descricao: 'Cadastrar os painéis',
    escopo: 'organizacao',
    inclui: ['paineis.ver'],
  },
] as const satisfies readonly DefinicaoDePermissao[];

export type Permissao = (typeof PERMISSOES)[number]['chave'];

const POR_CHAVE = new Map<string, DefinicaoDePermissao>(PERMISSOES.map((p) => [p.chave, p]));

const FORMATO = /^[a-z]+(?:-[a-z]+)*\.[a-z]+(?:-[a-z]+)*$/;

/**
 * Os problemas de um catálogo: chave repetida ou fora do formato, inclusão de uma permissão que não
 * existe ou em ciclo, e descrição vazia. O catálogo real não tem nenhum (teste do domínio).
 */
export function conferirCatalogo(catalogo: readonly DefinicaoDePermissao[]): string[] {
  const problemas: string[] = [];
  const chaves = new Set<string>();
  for (const { chave, descricao, inclui } of catalogo) {
    if (chaves.has(chave)) problemas.push(`A chave ${chave} se repete.`);
    chaves.add(chave);
    if (!FORMATO.test(chave)) problemas.push(`A chave ${chave} não segue o formato area.acao.`);
    if (descricao.trim() === '') problemas.push(`A permissão ${chave} está sem descrição.`);
    for (const incluida of inclui) {
      if (!catalogo.some((p) => p.chave === incluida)) {
        problemas.push(`A permissão ${chave} inclui ${incluida}, que não existe.`);
      }
    }
  }
  const inclusoes = new Map(catalogo.map((p) => [p.chave, p.inclui]));
  for (const { chave } of catalogo) {
    if (alcancaASiMesma(chave, inclusoes))
      problemas.push(`A permissão ${chave} se inclui num ciclo.`);
  }
  return problemas;
}

function alcancaASiMesma(chave: string, inclusoes: Map<string, readonly string[]>): boolean {
  const vistas = new Set<string>();
  const pendentes = [...(inclusoes.get(chave) ?? [])];
  while (pendentes.length > 0) {
    const atual = pendentes.pop() as string;
    if (atual === chave) return true;
    if (vistas.has(atual)) continue;
    vistas.add(atual);
    pendentes.push(...(inclusoes.get(atual) ?? []));
  }
  return false;
}

/** As permissões dadas mais as que elas incluem, de inclusão em inclusão. */
export function fechamento(chaves: Iterable<Permissao>): Set<Permissao> {
  const resultado = new Set<Permissao>();
  const pendentes = [...chaves];
  while (pendentes.length > 0) {
    const atual = pendentes.pop() as Permissao;
    if (resultado.has(atual)) continue;
    resultado.add(atual);
    pendentes.push(...((POR_CHAVE.get(atual)?.inclui ?? []) as Permissao[]));
  }
  return resultado;
}

export function permissaoConhecida(texto: string): texto is Permissao {
  return POR_CHAVE.has(texto);
}

/** `null` quando todas estão no catálogo; senão, o motivo com a primeira desconhecida. */
export function validarPermissoes(textos: readonly string[]): string | null {
  const desconhecida = textos.find((texto) => !permissaoConhecida(texto));
  return desconhecida === undefined ? null : `Permissão desconhecida: ${desconhecida}.`;
}

export function definicaoDa(chave: Permissao): DefinicaoDePermissao {
  const definicao = POR_CHAVE.get(chave);
  if (!definicao) throw new Error(`A permissão ${chave} não está no catálogo.`);
  return definicao;
}

export function descricaoDa(chave: Permissao): string {
  return definicaoDa(chave).descricao;
}
