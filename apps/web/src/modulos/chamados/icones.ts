// Os ícones dos tipos de chamado (change chamados-da-ti, design, decisão 6): a lista fechada do
// domínio no lucide, porque os mockups usam o Phosphor.
import type { IconeDoTipoDeChamado } from '@grafite/domain';
import {
  AppWindow,
  ArrowLeftRight,
  Camera,
  CircleEllipsis,
  Droplet,
  Globe,
  Headset,
  KeyRound,
  Laptop,
  LockKeyhole,
  type LucideIcon,
  Monitor,
  Package,
  PcCase,
  Phone,
  Printer,
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
