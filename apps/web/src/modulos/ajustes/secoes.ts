import {
  Accessibility,
  Bell,
  Globe,
  MousePointer2,
  Palette,
  PanelBottom,
  Table2,
  UserRound,
} from 'lucide-react';

/**
 * Um ajuste de uma seção, como a busca o encontra: o `foco` é o `data-foco` do controle dele na
 * seção, e as palavras-chave o acham por outros nomes.
 */
export interface AjusteDaSecao {
  foco: string;
  rotulo: string;
  palavrasChave?: readonly string[];
}

/**
 * As seções dos Ajustes, na ordem da lista e do menu do dock, cada uma com os seus ajustes. A Conta
 * vem no topo, separada das seções de preferências, e as partes dela entram na busca como ajustes.
 */
export const SECOES = [
  {
    id: 'conta',
    nome: 'Conta',
    icone: UserRound,
    endereco: '/ajustes/conta',
    ajustes: [
      { foco: 'foto', rotulo: 'Foto', palavrasChave: ['trocar foto', 'imagem', 'retrato'] },
      { foco: 'senha', rotulo: 'Trocar senha', palavrasChave: ['senha nova', 'senha atual'] },
      {
        foco: 'dois-passos',
        rotulo: 'Verificação em dois passos',
        palavrasChave: ['autenticador', 'código do app', '2FA', 'segurança'],
      },
      {
        foco: 'codigos-de-recuperacao',
        rotulo: 'Códigos de recuperação',
        palavrasChave: ['celular perdido', 'recuperar'],
      },
      {
        foco: 'aparelhos-confiaveis',
        rotulo: 'Aparelhos confiáveis',
        palavrasChave: ['aparelhos', 'confiar', 'navegador', 'lembrar', 'esquecer'],
      },
      {
        foco: 'sessoes',
        rotulo: 'Sessões',
        palavrasChave: ['dispositivos', 'aparelhos', 'encerrar', 'sair'],
      },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'aparencia',
    nome: 'Aparência',
    icone: Palette,
    endereco: '/ajustes/aparencia',
    ajustes: [
      { foco: 'tema', rotulo: 'Tema', palavrasChave: ['cores', 'escuro', 'claro'] },
      {
        foco: 'destaque',
        rotulo: 'Cor de destaque',
        palavrasChave: ['grafite', 'monocromático', 'azul', 'verde', 'laranja'],
      },
      { foco: 'cantos', rotulo: 'Cantos', palavrasChave: ['raio', 'arredondados', 'bordas'] },
      { foco: 'densidade', rotulo: 'Densidade', palavrasChave: ['compacta', 'espaçamento'] },
      {
        foco: 'barra-de-rolagem',
        rotulo: 'Barra de rolagem',
        palavrasChave: ['rolar', 'polegar', 'sempre visível', 'scroll'],
      },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'dock',
    nome: 'Dock',
    icone: PanelBottom,
    endereco: '/ajustes/dock',
    ajustes: [
      {
        foco: 'posicao-do-dock',
        rotulo: 'Posição do dock',
        palavrasChave: ['esquerda', 'direita'],
      },
      { foco: 'tamanho-do-dock', rotulo: 'Tamanho do dock', palavrasChave: ['ícones', 'itens'] },
      {
        foco: 'ampliar-o-dock',
        rotulo: 'Ampliar o dock ao passar o mouse',
        palavrasChave: ['ampliação', 'zoom'],
      },
      {
        foco: 'ocultar-o-dock',
        rotulo: 'Ocultar o dock automaticamente',
        palavrasChave: ['esconder'],
      },
      {
        foco: 'modulos-do-dock',
        rotulo: 'Módulos do dock',
        palavrasChave: ['ordem', 'organizar', 'tirar do dock', 'mais'],
      },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'cursor',
    nome: 'Cursor',
    icone: MousePointer2,
    endereco: '/ajustes/cursor',
    ajustes: [
      {
        foco: 'tipo-de-cursor',
        rotulo: 'Tipo de cursor',
        palavrasChave: ['suavizado', 'do sistema', 'ponteiro', 'mouse'],
      },
      {
        foco: 'suavizacao-do-cursor',
        rotulo: 'Suavização do cursor',
        palavrasChave: ['anel', 'ponteiro', 'mouse'],
      },
      { foco: 'abracar-botoes', rotulo: 'Abraçar botões', palavrasChave: ['cursor', 'anel'] },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'notificacoes',
    nome: 'Notificações',
    icone: Bell,
    endereco: '/ajustes/notificacoes',
    ajustes: [
      {
        foco: 'avisos-na-tela',
        rotulo: 'Avisos na tela',
        palavrasChave: ['notificações', 'alertas', 'crítico', 'atenção', 'informação'],
      },
      {
        foco: 'tempo-do-aviso',
        rotulo: 'Tempo do aviso',
        palavrasChave: ['notificações', 'duração', 'segundos'],
      },
      {
        foco: 'modo-foco',
        rotulo: 'Modo Foco',
        palavrasChave: ['notificações', 'avisos', 'concentração', 'não perturbe', 'crítico'],
      },
      {
        foco: 'email-do-critico',
        rotulo: 'E-mail do crítico',
        palavrasChave: ['e-mail', 'email', 'notificações', 'crítico', 'alertas'],
      },
      {
        foco: 'resumo-por-email',
        rotulo: 'Resumo por e-mail',
        palavrasChave: ['e-mail', 'email', 'notificações', 'diário', 'resumo'],
      },
      {
        foco: 'avisos-no-celular',
        rotulo: 'Avisos no celular',
        palavrasChave: ['push', 'celular', 'aparelho', 'notificações', 'telefone'],
      },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'tabelas',
    nome: 'Tabelas',
    icone: Table2,
    endereco: '/ajustes/tabelas',
    ajustes: [
      {
        foco: 'linhas-alternadas',
        rotulo: 'Linhas alternadas',
        palavrasChave: ['tabelas', 'zebrado', 'listras'],
      },
      { foco: 'miniaturas', rotulo: 'Miniaturas nas tabelas', palavrasChave: ['imagem', 'foto'] },
      {
        foco: 'resumo-da-linha',
        rotulo: 'Resumo da linha',
        palavrasChave: ['colunas', 'mouse', 'fora da tela'],
      },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'idioma-e-regiao',
    nome: 'Idioma e região',
    icone: Globe,
    endereco: '/ajustes/idioma-e-regiao',
    ajustes: [
      {
        foco: 'fuso-horario',
        rotulo: 'Fuso horário',
        palavrasChave: ['hora', 'relógio', 'horário de Brasília', 'UTC'],
      },
    ] as readonly AjusteDaSecao[],
  },
  {
    id: 'acessibilidade',
    nome: 'Acessibilidade',
    icone: Accessibility,
    endereco: '/ajustes/acessibilidade',
    ajustes: [
      { foco: 'movimento', rotulo: 'Reduzir movimento', palavrasChave: ['animação'] },
      {
        foco: 'transparencia',
        rotulo: 'Reduzir transparência',
        palavrasChave: ['vidro', 'desfoque'],
      },
    ] as readonly AjusteDaSecao[],
  },
] as const;
