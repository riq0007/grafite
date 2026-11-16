// O quadro dos chamados (spec chamados, "Carga de cada pessoa"; spec modulo-chamados, "Início dos
// chamados" e "Quem está com o quê"; change chamados-da-ti, design, decisão 7, e tarefa 4.9): a
// triagem, as colunas das pessoas da TI e de quem não atende mais e os resolvidos hoje, pelo
// `cargaDasPessoas` do domínio, só com os chamados que a conta que olha vê, no dia do fuso dela.
import { chamados, contas, pessoas, type Transacao } from '@grafite/db';
import {
  type Acesso,
  type AlcanceDaPermissao,
  type ArvoreDeLocais,
  alcance,
  type CargaDasPessoas,
  type ChamadoMaisAntigo,
  type ContaNaCarga,
  cargaDasPessoas,
  comecoDoDia,
} from '@grafite/domain';
import { and, eq, gte, inArray, or, type SQL, sql } from 'drizzle-orm';
import { carregarAcessosDaOrganizacao } from '../acesso/acesso.ts';
import { arrayDeIds } from '../estoque/leitura.ts';
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

/**
 * O quadro para a conta que olha. Os chamados vêm antes das contas: os abertos e os resolvidos desde
 * o começo do dia dela, já filtrados pelo que ela vê na consulta. Depois, as contas: as ativas com
 * `chamados.atender` e as de quem atende os abertos lidos, pelos ids. Lidas antes, a conta que
 * ganhasse o `chamados.atender` e um chamado entre as duas consultas faltaria, e o
 * `cargaDasPessoas` recusaria o chamado sem a conta de quem atende.
 */
export async function quadroDosChamados(
  tx: Transacao,
  {
    acesso,
    arvore,
    fuso,
    agora,
  }: { acesso: Acesso; arvore: ArvoreDeLocais; fuso: string; agora: Date },
): Promise<QuadroDosChamados> {
  const doVer = alcance(acesso, 'chamados.ver', arvore);

  // O chamado que a conta vê tem um dos locais no alcance dela; o sem local, só pela organização.
  const deVer: SQL | undefined =
    doVer === null
      ? sql`false`
      : doVer === 'organizacao'
        ? undefined
        : sql`${chamados.locais} && ${arrayDeIds([...doVer])}`;
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
    })
    .from(chamados)
    .where(
      and(
        deVer,
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
  return {
    triagem: { abertos: carga.triagem.abertos, maisAntigo: noQuadro(carga.triagem.maisAntigo) },
    colunas: carga.colunas.map((coluna) => ({
      ...coluna,
      maisAntigo: noQuadro(coluna.maisAntigo),
      atende: ondeAtende(acessos.get(coluna.conta)?.permissoes.get('chamados.atender')),
    })),
    resolvidosHoje: carga.resolvidosHoje,
    contandoSoOsLocaisQueVe: carga.contandoSoOsLocaisQueVe,
  };
}
