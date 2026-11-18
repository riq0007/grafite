// As peças comuns das telas dos chamados (spec modulo-chamados, "Selos, prazo em texto e
// movimento"; change chamados-da-ti, design, decisões 20 e 22): o selo de cada palavra, com a marca e
// o ícone dela; o prazo em texto, curto no quadrado e inteiro na linha, que anda a cada minuto pelo
// contador do prazo.ts, e o selo dele; o ícone do tipo e a sigla de quem atende, nas cores das
// séries. Só componentes e tipos, para a atualização a quente do Vite.
import type { GrupoDoPrazo, SituacaoDoPrazo } from '@grafite/domain';
import { Icone, iniciais, RotuloDeSituacao, type Situacao } from '@grafite/ui';
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
import { iconeDoTipo, SERIE_DO_ICONE, serieDaConta } from './cores.ts';
import { ICONES_DOS_TIPOS_DE_CHAMADO } from './icones.ts';
import estilos from './Pecas.module.css';
import { seloDoPrazo } from './prazo.ts';
import { ROTULO_DA_SITUACAO } from './situacoes.ts';

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
  triagem: { rotulo: ROTULO_DA_SITUACAO.triagem, situacao: 'neutra', icone: Inbox },
  'em-atendimento': {
    rotulo: ROTULO_DA_SITUACAO['em-atendimento'],
    situacao: 'info',
    icone: Headset,
  },
  aguardando: { rotulo: ROTULO_DA_SITUACAO.aguardando, situacao: 'info', icone: Hourglass },
  resolvido: { rotulo: ROTULO_DA_SITUACAO.resolvido, situacao: 'sucesso', icone: CircleCheck },
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
 * vem do contador do prazo (`useContarOPrazo`); sem ela, o chamado veio sem o relógio, porque o
 * prazo guardado não se lê, e o texto diz "prazo ilegível", sem a cor de um grupo.
 */
export function PrazoEmTexto({
  id,
  situacao,
  forma,
}: {
  /** Para o elemento que o prazo descreve, como o quadrado do chamado. */
  id?: string;
  situacao: SituacaoDoPrazo | null;
  forma: FormaDoPrazo;
}) {
  const tamanho = forma === 'curta' ? 12 : 14;
  if (!situacao) {
    return (
      <span id={id} className={estilos.prazo} data-forma={forma}>
        <Icone icone={Clock} tamanho={tamanho} />
        <span>prazo ilegível</span>
      </span>
    );
  }
  const { grupo, texto } = situacao;
  return (
    <span id={id} className={estilos.prazo} data-grupo={grupo} data-forma={forma}>
      <Icone icone={ICONE_DO_GRUPO[grupo]} tamanho={tamanho} />
      <span>
        <TextoComMedidas texto={(forma === 'curta' && CURTO[grupo]) || texto} />
      </span>
    </span>
  );
}

/**
 * O selo do prazo, com a situação inteira e o ícone do estado, como o da prévia do quadrado:
 * "Estourado há 20 min", no crítico, ou "Prazo ilegível", no neutro.
 */
export function SeloDoPrazo({ situacao }: { situacao: SituacaoDoPrazo | null }) {
  const { texto, marca } = seloDoPrazo(situacao);
  return (
    <RotuloDeSituacao situacao={marca} icone={situacao ? ICONE_DO_GRUPO[situacao.grupo] : Clock}>
      {texto}
    </RotuloDeSituacao>
  );
}

/** O ícone do estado do prazo, o mesmo do selo; sem o grupo, no prazo ilegível, o relógio. */
export function IconeDoPrazo({ grupo, tamanho }: { grupo: GrupoDoPrazo | null; tamanho?: number }) {
  return <Icone icone={grupo ? ICONE_DO_GRUPO[grupo] : Clock} tamanho={tamanho} />;
}

/** As medidas que não se partem: "35 min", "17 h", "2 d" e "menos de 1 min". */
const MEDIDA = /(menos de 1 min|\d+ (?:min|h|d)\b)/;

/**
 * O texto com cada medida numa peça só: quando a linha quebra, "vence em" fica numa e "35 min" na
 * outra, e não "vence em 35" e "min".
 */
export function TextoComMedidas({ texto }: { texto: string }) {
  // As partes ímpares são as medidas que a expressão separou.
  return texto.split(MEDIDA).map((parte, indice) =>
    indice % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: a posição é o lugar da parte no texto.
      <span key={indice} className={estilos.medida} data-medida="">
        {parte}
      </span>
    ) : (
      parte
    ),
  );
}

/**
 * O ícone do tipo, no quadrado da série do ícone (decisão 6), com o nome do tipo para o leitor de
 * tela, ou só desenho, quando o nome vai ao lado, em texto. O ícone que a web não conhece e as
 * reticências do "Outro" ficam neutros.
 */
export function IconeDoTipo({
  icone,
  nome,
  decorativo = false,
}: {
  icone: string;
  nome: string;
  decorativo?: boolean;
}) {
  const conhecido = iconeDoTipo(icone);
  return (
    <span
      className={estilos.iconeDoTipo}
      {...(decorativo ? { 'aria-hidden': true } : { role: 'img', 'aria-label': nome })}
      data-serie={SERIE_DO_ICONE[conhecido] ?? undefined}
    >
      <Icone icone={ICONES_DOS_TIPOS_DE_CHAMADO[conhecido]} tamanho={15} />
    </span>
  );
}

/**
 * As iniciais de quem atende, no círculo da série da conta: a de 38 px da coluna, a média, de 32, da
 * conversa, ou a pequena, de 26, dos botões. É só desenho: o nome vai sempre ao lado, em texto.
 */
export function SiglaDaPessoa({
  conta,
  nome,
  tamanho,
}: {
  /** A conta de quem atende, que dá a série; nula, como a de quem pediu, o círculo neutro. */
  conta: string | null;
  nome: string;
  tamanho?: 'media' | 'pequena';
}) {
  return (
    <span
      className={estilos.sigla}
      aria-hidden="true"
      data-serie={conta === null ? undefined : serieDaConta(conta)}
      data-tamanho={tamanho}
    >
      {iniciais(nome)}
    </span>
  );
}

/** A bandeja da coluna da triagem, no círculo neutro da sigla. */
export function BandejaDaTriagem() {
  return (
    <span className={estilos.sigla} aria-hidden="true">
      <Icone icone={Inbox} tamanho={19} />
    </span>
  );
}
