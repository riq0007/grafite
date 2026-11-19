// Os ícones dos tipos de chamado (change chamados-da-ti, design, decisão 6): a lista fechada do
// domínio no lucide, porque os mockups usam o Phosphor. No fim, os dos tipos de campo do formulário
// (design, "O construtor, a paleta (tarefa 5.21)").
import type { IconeDoTipoDeChamado, TipoDeCampoDoChamado } from '@grafite/domain';
import {
  AlignLeft,
  AppWindow,
  ArrowLeftRight,
  Calendar,
  Camera,
  CircleEllipsis,
  Droplet,
  Globe,
  Hash,
  Headset,
  KeyRound,
  Laptop,
  List,
  ListChecks,
  LockKeyhole,
  type LucideIcon,
  MapPin,
  Monitor,
  Package,
  Paperclip,
  PcCase,
  Phone,
  Printer,
  ToggleLeft,
  Type,
  User,
  Wifi,
} from 'lucide-react';

export const ICONES_DOS_TIPOS_DE_CHAMADO: Readonly<Record<IconeDoTipoDeChamado, LucideIcon>> = {
  gota: Droplet,
  notebook: Laptop,
  impressora: Printer,
  cadeado: LockKeyhole,
  janela: AppWindow,
  globo: Globe,
  telefone: Phone,
  reticencias: CircleEllipsis,
  setas: ArrowLeftRight,
  computador: Monitor,
  torre: PcCase,
  fone: Headset,
  chave: KeyRound,
  caixa: Package,
  camera: Camera,
  'wi-fi': Wifi,
};

/** O nome de cada ícone, que o leitor de tela lê na escolha do ícone do tipo. */
export const NOMES_DOS_ICONES_DOS_TIPOS: Readonly<Record<IconeDoTipoDeChamado, string>> = {
  gota: 'Gota',
  notebook: 'Notebook',
  impressora: 'Impressora',
  cadeado: 'Cadeado',
  janela: 'Janela',
  globo: 'Globo',
  telefone: 'Telefone',
  reticencias: 'Reticências',
  setas: 'Setas',
  computador: 'Computador',
  torre: 'Gabinete',
  fone: 'Fone de ouvido',
  chave: 'Chave',
  caixa: 'Caixa',
  camera: 'Câmera',
  'wi-fi': 'Wi-Fi',
};

/** O ícone de cada tipo de campo, na paleta e nos campos do construtor (m09). */
export const ICONES_DOS_TIPOS_DE_CAMPO: Readonly<Record<TipoDeCampoDoChamado, LucideIcon>> = {
  'texto-curto': Type,
  'texto-longo': AlignLeft,
  'escolha-unica': List,
  'varias-opcoes': ListChecks,
  ativo: Package,
  local: MapPin,
  pessoa: User,
  data: Calendar,
  numero: Hash,
  anexo: Paperclip,
  'sim-ou-nao': ToggleLeft,
};
