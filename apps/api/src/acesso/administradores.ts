// Quem administra os acessos da organização (design do F2b, decisão 7): a conta ativa, de pessoa
// ativa, com `acessos.administrar` numa atribuição em vigor para a organização inteira, direta ou
// por um grupo ativo, de um perfil ativo que tem a permissão ou todas elas. A recusa por falta de
// permissão diz a quem pedir acesso com os nomes dessas pessoas, e a organização nunca fica sem
// nenhuma delas.
import { type Banco, naOrganizacao, type Transacao } from '@grafite/db';
import type { Permissao } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { ProblemaDaApi } from '../problemas.ts';
import { travar } from '../travas.ts';

const ADMINISTRAR: Permissao = 'acessos.administrar';

/** As contas administradoras, com o nome da pessoa, numa consulta só. */
const CONTAS_ADMINISTRADORAS = sql`
  select c.id, p.nome
  from contas c
  join pessoas p on p.org_id = c.org_id and p.id = c.pessoa_id
  where c.situacao = 'ativa'
    and p.situacao = 'ativa'
    and exists (
      select 1
      from atribuicoes a
      join perfis pf on pf.org_id = a.org_id and pf.id = a.perfil_id
      left join membros_do_grupo m
        on m.org_id = a.org_id and m.grupo_id = a.grupo_id
        and m.conta_id = c.id and m.encerrada_em is null
      left join grupos g on g.org_id = m.org_id and g.id = m.grupo_id
      where a.encerrada_em is null
        and a.local_id is null
        and pf.situacao = 'ativo'
        and (pf.todas_as_permissoes or ${ADMINISTRAR} = any(pf.permissoes))
        and (a.conta_id = c.id or g.situacao = 'ativo')
    )`;

/** Até `limite` nomes de quem administra os acessos, em ordem alfabética: a quem pedir acesso. */
export async function nomesDosAdministradores(tx: Transacao, limite = 3): Promise<string[]> {
  const { rows } = await tx.execute<{ nome: string }>(
    sql`select nome from (${CONTAS_ADMINISTRADORAS}) as administradoras
        order by nome, id limit ${limite}`,
  );
  return rows.map((linha) => linha.nome);
}

export async function contarAdministradores(tx: Transacao): Promise<number> {
  const { rows } = await tx.execute<{ total: number }>(
    sql`select count(*)::int as total from (${CONTAS_ADMINISTRADORAS}) as administradoras`,
  );
  return rows[0]?.total ?? 0;
}

export const ultimoAdministrador = () =>
  new ProblemaDaApi({
    codigo: 'ultimo-administrador',
    status: 409,
    titulo: 'Último administrador',
    detalhe: 'A organização ficaria sem ninguém para administrar os acessos.',
  });

/**
 * Uma mudança que pode tirar alguém da administração dos acessos: inativar uma conta ou uma pessoa,
 * anonimizar, encerrar uma atribuição, tirar uma conta de um grupo, inativar um perfil ou um grupo
 * e mudar as permissões de um perfil. Ela roda com a trava `acessos` da organização, uma de cada
 * vez, e só é gravada se ainda sobrar quem administre; senão, desfaz tudo.
 */
export function mudarAcessos<T>(
  banco: Banco,
  orgId: string,
  fn: (tx: Transacao) => Promise<T>,
): Promise<T> {
  return naOrganizacao(banco, orgId, async (tx) => {
    await travar(tx, 'acessos');
    const resultado = await fn(tx);
    if ((await contarAdministradores(tx)) === 0) throw ultimoAdministrador();
    return resultado;
  });
}
