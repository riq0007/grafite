// A regra da coluna da direita do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "A coluna da direita, a pessoa e o ativo (tarefa 5.13)"): as ações do
// ativo de quem atende, os contatos da pessoa, as OS do ativo no ano e a nota do estoque. A ficha
// já vem só com o que a conta vê: o que não vem fica de fora.
import {
  type Permissao,
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  type SituacaoDoChamado,
} from '@grafite/domain';
import type { DataHora } from '@grafite/ui';
import type { FichaDoChamado } from '../consultas.ts';
import { ROTULO_DA_SITUACAO } from '../situacoes.ts';
import { type ItemDaConversa, momentoNaConversa } from './conversa.ts';

type Ativo = NonNullable<FichaDoChamado['ativo']>;
type Resumo = NonNullable<Ativo['resumo']>;

export interface AcoesDoAtivo {
  /** "Virar OS", no cabeçalho. */
  virarOs: boolean;
  /** "Pedir toner", no cabeçalho. */
  pedirToner: boolean;
  /**
   * "Trocar o ativo" ou, sem o ativo, "Ligar um ativo", na seção; nulo a quem não atende e, sem o
   * ativo, a quem não vê os ativos.
   */
  trocar: 'trocar' | 'ligar' | null;
}

/**
 * As ações do ativo, só a quem atende os locais do chamado e fora do resolvido. Virar OS e pedir
 * toner pedem o ativo, o chamado sem a OS ou sem a solicitação e o Operação ligado; pedir toner
 * pede também a impressora que usa consumíveis, a ficha dela, porque o registro recusa a impressora
 * que a conta não vê, e as solicitações, que a API confere nos locais da impressora.
 */
export function acoesDoAtivo(
  {
    situacao,
    permite,
    ativo,
    os,
    solicitacao,
  }: Pick<FichaDoChamado, 'situacao' | 'permite' | 'ativo' | 'os' | 'solicitacao'>,
  { operacaoLigada, pode }: { operacaoLigada: boolean; pode: (chave: Permissao) => boolean },
): AcoesDoAtivo {
  if (!permite.atender || situacao === 'resolvido') {
    return { virarOs: false, pedirToner: false, trocar: null };
  }
  const comOperacao = ativo !== null && operacaoLigada;
  return {
    virarOs: comOperacao && os === null,
    pedirToner:
      comOperacao &&
      solicitacao === null &&
      ativo.usaConsumiveis &&
      ativo.abrir &&
      pode('solicitacoes.atender'),
    // Ligar pede a busca dos ativos; tirar o ligado, não.
    trocar: ativo ? 'trocar' : pode('ativos.ver') ? 'ligar' : null,
  };
}

/**
 * Quem preenche os campos só da TI nos "Campos do tipo": quem atende os locais do chamado, fora do
 * resolvido, como a API (`recusaDaEdicao`); a quem só vê, tudo para ler.
 */
export const preencheOsCampos = ({
  situacao,
  permite,
}: Pick<FichaDoChamado, 'situacao' | 'permite'>): boolean =>
  permite.atender && situacao !== 'resolvido';

export interface ContatoDaPessoa {
  rotulo: string;
  texto: string;
  /** O endereço do link: o `mailto:` e o `tel:`. */
  endereco: string;
}

/**
 * Os contatos da pessoa em links; nulo a quem não vê a pessoa e na anonimizada, que a ficha manda
 * sem eles. O vazio é a pessoa sem contato no cadastro.
 */
export function contatosDaPessoa({
  contatos,
}: Pick<FichaDoChamado['pessoa'], 'contatos'>): ContatoDaPessoa[] | null {
  if (contatos === null) return null;
  const lista: ContatoDaPessoa[] = [];
  if (contatos.email) {
    lista.push({ rotulo: 'E-mail', texto: contatos.email, endereco: `mailto:${contatos.email}` });
  }
  if (contatos.telefone) {
    const discar = contatos.telefone.replace(/(?!^\+)[^\d]/g, '');
    lista.push({ rotulo: 'Telefone', texto: contatos.telefone, endereco: `tel:${discar}` });
  }
  return lista;
}

const quantas = (numero: number, singular: string, plural: string) => {
  if (numero === 0) return `nenhuma ${singular}`;
  return `${numero.toLocaleString('pt-BR')} ${numero === 1 ? singular : plural}`;
};

/** As OS do ativo, como no m04: "2 concluídas, nenhuma aberta". */
export const textoDasOrdens = ({ abertas, concluidas }: NonNullable<Resumo['ordens']>) =>
  `${quantas(concluidas, 'concluída', 'concluídas')}, ${quantas(abertas, 'aberta', 'abertas')}`;

export interface NotaDoEstoque {
  linhas: string[];
  /** Algum compatível está abaixo do mínimo: a nota vai no quadro da atenção. */
  atencao: boolean;
}

/**
 * A nota do estoque: o saldo e o mínimo dos compatíveis com cor, os do toner, e a solicitação
 * pendente da impressora, cada um só a quem o vê. O `abaixo` vem de cada local: com a soma acima do
 * mínimo, a nota diz que é num dos locais. "Pedir toner" se junta à pendente só quando aparece, e a
 * pendente que já é a do chamado fica só na lista do chamado, embaixo.
 */
export function linhasDoEstoque(
  { compativeis, solicitacao }: Pick<Resumo, 'compativeis' | 'solicitacao'>,
  {
    pedirToner,
    solicitacaoDoChamado,
  }: { pedirToner: boolean; solicitacaoDoChamado: string | null },
): NotaDoEstoque | null {
  const numero = (valor: number) => valor.toLocaleString('pt-BR');
  const comCor = (compativeis ?? []).filter((compativel) => compativel.cor !== null);
  const linhas = comCor.map(({ codigo, saldo, minimo, abaixo }) => {
    const quanto =
      minimo > 0 ? `${numero(saldo)} de ${numero(minimo)}` : `${numero(saldo)} no estoque`;
    if (!abaixo) return `${codigo}: ${quanto}.`;
    return saldo < minimo
      ? `${codigo}: ${quanto}, abaixo do mínimo.`
      : `${codigo}: ${quanto}, abaixo do mínimo num dos locais.`;
  });
  if (solicitacao && solicitacao.id !== solicitacaoDoChamado) {
    const situacao =
      ROTULOS_DAS_SITUACOES_DA_SOLICITACAO[solicitacao.situacao].toLocaleLowerCase('pt-BR');
    linhas.push(
      pedirToner
        ? `A solicitação ${solicitacao.numero} está ${situacao}; “Pedir toner” se junta a ela.`
        : `A solicitação ${solicitacao.numero} está ${situacao}.`,
    );
  }
  if (linhas.length === 0) return null;
  return { linhas, atencao: comCor.some((compativel) => compativel.abaixo) };
}

/** Um passo da linha do tempo: a situação, em peso forte, e embaixo a hora, o que houve e quem fez. */
export interface PassoDaLinha {
  /** O id do evento que fez o passo. */
  id: string;
  titulo: string;
  texto: string;
  /** O passo de agora, o último. */
  agora: boolean;
}

const juntarPartes = (...partes: (string | null)[]) =>
  partes.filter((parte): parte is string => parte !== null).join(' · ');

/**
 * A linha do tempo (change chamados-da-ti, design, "A linha do tempo, os campos do tipo e as seções
 * guardadas"): o caminho do chamado pelas situações, montado dos eventos da conversa, na ordem
 * dela. A situação de cada passo sai da matriz das ações (spec chamados, "Ações do atendimento"): o
 * assumir e o passar no aguardando continuam nele, e a reabertura sem ninguém volta à triagem. O
 * desfazer tira o passo do assumir que ele desfaz. O relógio entra quando para ou volta a contar.
 */
export function linhaDoTempo(
  conversa: readonly ItemDaConversa[],
  { pessoa, agora, dataHora }: { pessoa: string; agora: Date; dataHora: DataHora },
): PassoDaLinha[] {
  const passos: (PassoDaLinha & { situacao: SituacaoDoChamado; doAssumir: boolean })[] = [];
  let situacao: SituacaoDoChamado = 'triagem';
  for (const item of conversa) {
    if (item.especie !== 'evento') continue;
    const quando = momentoNaConversa(new Date(item.em), agora, dataHora);
    const quem = item.autor.nome;
    const estava = situacao;
    const comAlguem = estava === 'aguardando' ? 'aguardando' : 'em-atendimento';
    const passo = (nova: SituacaoDoChamado, ...partes: (string | null)[]) => {
      situacao = nova;
      passos.push({
        id: item.id,
        situacao: nova,
        titulo: ROTULO_DA_SITUACAO[nova],
        texto: juntarPartes(quando, ...partes),
        agora: false,
        doAssumir: item.evento === 'assumiu',
      });
    };
    switch (item.evento) {
      case 'abertura':
        passo(
          'triagem',
          item.autor.tipo === 'pessoa' ? `aberto por ${quem}` : `aberto por ${quem} para ${pessoa}`,
        );
        break;
      case 'assumiu':
        passo(comAlguem, `assumido por ${quem}`);
        break;
      case 'passou':
        passo(
          comAlguem,
          item.para ? `passado para ${item.para.nome} por ${quem}` : `passado por ${quem}`,
        );
        break;
      case 'devolveu':
        passo('triagem', `devolvido por ${quem}`);
        break;
      case 'desfez':
        // O desfazer vem logo depois do assumir que ele desfaz (decidirDesfazer, no domínio).
        if (passos.at(-1)?.doAssumir) {
          passos.pop();
          situacao = passos.at(-1)?.situacao ?? 'triagem';
        }
        break;
      case 'aguardando':
        passo('aguardando', 'o relógio parou');
        break;
      case 'retomou':
        passo('em-atendimento', `retomado por ${quem}`, 'o relógio voltou a contar');
        break;
      case 'resolveu':
        // No aguardando, o relógio já estava parado.
        passo(
          'resolvido',
          `resolvido por ${quem}`,
          estava === 'aguardando' ? null : 'o relógio parou',
        );
        break;
      case 'reabriu': {
        const para =
          item.para && item.para.conta !== item.autor.id ? ` para ${item.para.nome}` : '';
        passo(
          item.para ? 'em-atendimento' : 'triagem',
          `reaberto por ${quem}${para}`,
          'o relógio voltou a contar',
        );
        break;
      }
      case 'ativo':
      case 'os':
      case 'solicitacao':
      case 'solicitacao-nao-gerada':
        // A troca do ativo, a OS e a solicitação ficam só na conversa.
        break;
    }
  }
  return passos.map(({ id, titulo, texto }, indice) => ({
    id,
    titulo,
    texto,
    agora: indice === passos.length - 1,
  }));
}

/** As seções da coluna da direita, abertas ou fechadas. */
export interface SecoesDoLado {
  pessoa: boolean;
  ativo: boolean;
  linha: boolean;
  campos: boolean;
}

/** Como as seções começam: o Ativo ligado e a Linha do tempo abertos, como no m04. */
export const SECOES_DE_FABRICA: Readonly<SecoesDoLado> = {
  pessoa: false,
  ativo: true,
  linha: true,
  campos: false,
};

const CHAVE_DAS_SECOES = 'grafite.chamados.secoes';

/** A escolha guardada neste navegador, a mesma em todos os chamados; o que não se lê fica com a fábrica. */
export function lerSecoes(): SecoesDoLado {
  const lidas = { ...SECOES_DE_FABRICA };
  try {
    const guardadas: unknown = JSON.parse(localStorage.getItem(CHAVE_DAS_SECOES) ?? 'null');
    if (typeof guardadas !== 'object' || guardadas === null) return lidas;
    for (const nome of Object.keys(SECOES_DE_FABRICA) as (keyof SecoesDoLado)[]) {
      const valor = (guardadas as Partial<Record<keyof SecoesDoLado, unknown>>)[nome];
      if (typeof valor === 'boolean') lidas[nome] = valor;
    }
    return lidas;
  } catch {
    // O texto que não é JSON e o armazenamento bloqueado: a fábrica.
    return { ...SECOES_DE_FABRICA };
  }
}

/** Grava a escolha; com o armazenamento bloqueado, ela vale até a tela fechar. */
export function gravarSecoes(secoes: SecoesDoLado): void {
  try {
    localStorage.setItem(CHAVE_DAS_SECOES, JSON.stringify(secoes));
  } catch {
    // Navegação privada ou armazenamento bloqueado: a escolha fica só na tela aberta.
  }
}
