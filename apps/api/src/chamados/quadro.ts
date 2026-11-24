// O quadro dos chamados (spec chamados, "Carga de cada pessoa"; spec modulo-chamados, "Início dos
// chamados" e "Quem está com o quê"; change chamados-da-ti, design, decisão 7, e tarefa 4.9): a
// triagem, as colunas das pessoas da TI e de quem não atende mais e os resolvidos hoje, pelo
// `cargaDasPessoas` do domínio, só com os chamados que a conta que olha vê, no dia do fuso dela; e a
// versão de cada aberto, que a tela manda nas ações (tarefa 4.12). E quem recebe o chamado no
// "Passar para…" do chat, pelas mesmas colunas (change andamento-e-varias-mensagens, tarefa 3.2).
import { chamados, contas, pessoas, type Transacao } from '@grafite/db';
import {
  type Acesso,
  type AlcanceDaPermissao,
  type ArvoreDeLocais,
  alcance,
  atendeOChamado,
  type CargaDasPessoas,
  type ChamadoMaisAntigo,
  type ContaNaCarga,
  cargaDasPessoas,
  comecoDoDia,
  type LocaisDoChamado,
} from '@grafite/domain';
import { and, eq, gte, inArray, or } from 'drizzle-orm';
import { carregarAcessosDaOrganizacao } from '../acesso/acesso.ts';
import { ondeAContaVe } from './alcance.ts';
import { lerHorarioDaTi } from './horario.ts';

const ABERTOS = ['triagem', 'em-atendimento', 'aguardando'] as const;

/** Onde a conta atende os chamados agora: a organização inteira ou as raízes dos ramos. */
export interface OndeAtende {
  organizacao: boolean;
  locais: string[];
}

export interface QuadroDosChamados {
  triagem: { abertos: number[]; maisAntigo: MaisAntigoNoQuadro | null };
  colunas: (Omit<CargaDasPessoas['colunas'][number], 'maisAntigo'> & {
    maisAntigo: MaisAntigoNoQuadro | null;
    atende: OndeAtende;
  })[];
  resolvidosHoje: number[];
  contandoSoOsLocaisQueVe: boolean;
  /** A versão de cada aberto que a conta vê, pelo número. */
  versoes: Record<string, number>;
}

interface MaisAntigoNoQuadro {
  numero: number;
  abertoEm: string;
}

const noQuadro = (antigo: ChamadoMaisAntigo | null): MaisAntigoNoQuadro | null =>
  antigo && { numero: antigo.numero, abertoEm: antigo.abertoEm.toISOString() };

const ondeAtende = (doAtender: AlcanceDaPermissao | undefined): OndeAtende =>
  doAtender?.organizacao
    ? { organizacao: true, locais: [] }
    : { organizacao: false, locais: [...(doAtender?.locais ?? [])].sort() };

interface QuemOlha {
  acesso: Acesso;
  arvore: ArvoreDeLocais;
  fuso: string;
  agora: Date;
}

/**
 * A carga das pessoas para a conta que olha. Os chamados vêm antes das contas: os abertos e os
 * resolvidos desde o começo do dia dela, já filtrados pelo que ela vê na consulta. Depois, as
 * contas: as ativas com `chamados.atender` e as de quem atende os abertos lidos, pelos ids. Lidas
 * antes, a conta que ganhasse o `chamados.atender` e um chamado entre as duas consultas faltaria, e
 * o `cargaDasPessoas` recusaria o chamado sem a conta de quem atende.
 */
async function cargaParaQuemOlha(tx: Transacao, { acesso, arvore, fuso, agora }: QuemOlha) {
  const doVer = alcance(acesso, 'chamados.ver', arvore);

  const lidos = await tx
    .select({
      numero: chamados.numero,
      situacao: chamados.situacao,
      responsavel: chamados.responsavelId,
      abertoEm: chamados.abertoEm,
      resolvidoEm: chamados.resolvidoEm,
      resolvidoPor: chamados.resolvidoPor,
      locais: chamados.locais,
      semLocal: chamados.semLocal,
      versao: chamados.versao,
    })
    .from(chamados)
    .where(
      and(
        ondeAContaVe(doVer),
        or(
          inArray(chamados.situacao, [...ABERTOS]),
          and(
            eq(chamados.situacao, 'resolvido'),
            gte(chamados.resolvidoEm, comecoDoDia(agora, fuso)),
          ),
        ),
      ),
    );

  const acessos = new Map(
    (await carregarAcessosDaOrganizacao(tx)).map((conta) => [conta.id, conta.acesso]),
  );
  const ids = new Set<string>();
  for (const [id, acessoDaConta] of acessos) {
    if (alcance(acessoDaConta, 'chamados.atender', arvore) !== null) ids.add(id);
  }
  for (const chamado of lidos) {
    if (chamado.responsavel !== null && chamado.situacao !== 'resolvido') {
      ids.add(chamado.responsavel);
    }
  }
  const nomes =
    ids.size === 0
      ? []
      : await tx
          .select({ id: contas.id, nome: pessoas.nome })
          .from(contas)
          .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
          .where(inArray(contas.id, [...ids]));
  const contasNaCarga: ContaNaCarga[] = nomes.map(({ id, nome }) => {
    const acessoDaConta = acessos.get(id);
    return {
      id,
      nome,
      ativa: acessoDaConta !== undefined,
      alcance: acessoDaConta ? alcance(acessoDaConta, 'chamados.atender', arvore) : null,
    };
  });

  const { cargaCheia } = await lerHorarioDaTi(tx);
  const carga = cargaDasPessoas({
    contas: contasNaCarga,
    chamados: lidos,
    alcanceDeQuemOlha: doVer,
    cargaCheia,
    agora,
    fuso,
  });
  return { lidos, acessos, contasNaCarga, carga };
}

/** O quadro para a conta que olha, pela carga das pessoas. */
export async function quadroDosChamados(
  tx: Transacao,
  quemOlha: QuemOlha,
): Promise<QuadroDosChamados> {
  const { lidos, acessos, carga } = await cargaParaQuemOlha(tx, quemOlha);
  return {
    triagem: { abertos: carga.triagem.abertos, maisAntigo: noQuadro(carga.triagem.maisAntigo) },
    colunas: carga.colunas.map((coluna) => ({
      ...coluna,
      maisAntigo: noQuadro(coluna.maisAntigo),
      atende: ondeAtende(acessos.get(coluna.conta)?.permissoes.get('chamados.atender')),
    })),
    resolvidosHoje: carga.resolvidosHoje,
    contandoSoOsLocaisQueVe: carga.contandoSoOsLocaisQueVe,
    // A consulta já lê só os chamados que a conta vê.
    versoes: Object.fromEntries(
      lidos
        .filter((chamado) => chamado.situacao !== 'resolvido')
        .map((chamado) => [chamado.numero, chamado.versao]),
    ),
  };
}

/** Uma conta que recebe o chamado no "Passar para…", com os abertos da coluna dela no quadro. */
export interface ContaQueRecebeOChamado {
  conta: string;
  nome: string;
  abertos: number;
}

/**
 * Quem recebe o chamado no "Passar para…" do andamento no chat (spec chamados, "Quem atende pelo
 * chat"; change andamento-e-varias-mensagens, design, decisão 3; tarefa 3.2): as colunas das
 * pessoas da TI, que são as contas ativas com `chamados.atender`, que atendem todos os locais dele,
 * fora quem está com ele, na ordem delas, que é a do nome. Os abertos são os da coluna, contados nos
 * locais que quem pede vê: o número é o mesmo do quadro, e a regra é a do arraste.
 */
export async function quemRecebeOChamado(
  tx: Transacao,
  chamado: LocaisDoChamado & { responsavel: string | null },
  quemOlha: QuemOlha,
): Promise<ContaQueRecebeOChamado[]> {
  const { contasNaCarga, carga } = await cargaParaQuemOlha(tx, quemOlha);
  const alcanceDe = new Map(contasNaCarga.map((conta) => [conta.id, conta.alcance]));
  return carga.colunas
    .filter(
      (coluna) =>
        !coluna.naoAtendeMais &&
        coluna.conta !== chamado.responsavel &&
        atendeOChamado(alcanceDe.get(coluna.conta) ?? null, chamado),
    )
    .map(({ conta, nome, abertos }) => ({ conta, nome, abertos: abertos.length }));
}
