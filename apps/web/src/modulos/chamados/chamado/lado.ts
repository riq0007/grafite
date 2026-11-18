// A regra da coluna da direita do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "A coluna da direita, a pessoa e o ativo (tarefa 5.13)"): as ações do
// ativo de quem atende, os contatos da pessoa, as OS do ativo no ano e a nota do estoque. A ficha
// já vem só com o que a conta vê: o que não vem fica de fora.
import { type Permissao, ROTULOS_DAS_SITUACOES_DA_SOLICITACAO } from '@grafite/domain';
import type { FichaDoChamado } from '../consultas.ts';

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
