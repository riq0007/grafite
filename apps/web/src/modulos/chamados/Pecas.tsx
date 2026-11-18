// As peças comuns das telas dos chamados (spec modulo-chamados, "Selos, prazo em texto e
// movimento"; change chamados-da-ti, design, decisão 20): o selo de cada palavra, com a marca e o
// ícone dela, e o prazo em texto, curto no quadrado e inteiro na linha, que anda a cada minuto pelo
// contador do prazo.ts. Só componentes e tipos, para a atualização a quente do Vite.
import type { GrupoDoPrazo, SituacaoDoPrazo } from '@grafite/domain';
import { Icone, RotuloDeSituacao, type Situacao } from '@grafite/ui';
import {
  Circle,
  CircleAlert,
  CircleCheck,
  Clock,
  Headset,
  Hourglass,
  Inbox,
  Lock,
  type LucideIcon,
  SquarePen,
} from 'lucide-react';
import type { ReactNode } from 'react';
import estilos from './Pecas.module.css';

interface DoSelo {
  rotulo: string;
  situacao: Situacao;
  icone: LucideIcon;
}

/**
 * Os selos dos chamados, numa lista fechada: a mesma palavra tem sempre a mesma marca e o mesmo
 * ícone. A chave do selo de uma situação, do chamado ou do tipo, é o código dela.
 */
const SELOS = {
  estourado: { rotulo: 'Estourado', situacao: 'critico', icone: CircleAlert },
  'ate-2-horas': { rotulo: 'Vencem em até 2 h', situacao: 'atencao', icone: Clock },
  parado: { rotulo: 'Relógio parado', situacao: 'neutra', icone: Hourglass },
  triagem: { rotulo: 'Na triagem', situacao: 'neutra', icone: Inbox },
  'em-atendimento': { rotulo: 'Em atendimento', situacao: 'info', icone: Headset },
  aguardando: { rotulo: 'Aguardando o colaborador', situacao: 'info', icone: Hourglass },
  resolvido: { rotulo: 'Resolvido', situacao: 'sucesso', icone: CircleCheck },
  'em-uso': { rotulo: 'Em uso', situacao: 'sucesso', icone: CircleCheck },
  inativo: { rotulo: 'Inativo', situacao: 'neutra', icone: Circle },
  'so-a-ti-abre': { rotulo: 'Só a TI abre', situacao: 'info', icone: Lock },
  rascunho: { rotulo: 'Rascunho', situacao: 'atencao', icone: SquarePen },
  'ainda-nao-criado': { rotulo: 'Ainda não criado', situacao: 'atencao', icone: SquarePen },
  'toner-critico': { rotulo: 'Toner crítico', situacao: 'critico', icone: CircleAlert },
} as const satisfies Record<string, DoSelo>;

export type QualSelo = keyof typeof SELOS;

/** O selo da palavra, com a marca e o ícone dela. A contagem vai no lugar da palavra. */
export function Selo({ selo, children }: { selo: QualSelo; children?: ReactNode }) {
  const { rotulo, situacao, icone } = SELOS[selo];
  return (
    <RotuloDeSituacao situacao={situacao} icone={icone}>
      {children ?? rotulo}
    </RotuloDeSituacao>
  );
}

/** O ícone do estado, o mesmo do selo dele: o círculo com a exclamação no estourado. */
const ICONE_DO_GRUPO: Record<GrupoDoPrazo, LucideIcon> = {
  estourado: SELOS.estourado.icone,
  'ate-2-horas': SELOS['ate-2-horas'].icone,
  hoje: Clock,
  'depois-de-hoje': Clock,
  parado: SELOS.parado.icone,
};

/** No quadrado, o estourado e o parado dizem só a palavra; o "vence em 2 h" fica inteiro. */
const CURTO: Partial<Record<GrupoDoPrazo, string>> = {
  estourado: 'estourado',
  parado: 'parado',
};

export type FormaDoPrazo = 'curta' | 'inteira';

/**
 * O prazo em texto, na mono, com o ícone e a cor do estado: curto e menor no quadrado
 * ("estourado", "parado" ou "vence em 2 h"), inteiro na linha ("estourado há 20 min"). A situação
 * vem do contador do prazo (`useContarOPrazo`).
 */
export function PrazoEmTexto({
  situacao,
  forma,
}: {
  situacao: SituacaoDoPrazo;
  forma: FormaDoPrazo;
}) {
  const { grupo, texto } = situacao;
  return (
    <span className={estilos.prazo} data-grupo={grupo} data-forma={forma}>
      <Icone icone={ICONE_DO_GRUPO[grupo]} tamanho={forma === 'curta' ? 12 : 14} />
      {(forma === 'curta' && CURTO[grupo]) || texto}
    </span>
  );
}
