// Quem usa o chat e quem é da TI, na consulta das outras contas (spec chat, "Quem usa o chat";
// change chat-com-chamados, design, decisão 3; tarefa 3.1). A conta da sessão tem o acesso lido a
// cada requisição (`carregarAcesso`); as outras, como a escolha da pessoa da direta, o canal e quem
// recebe a mensagem, passam pelo mesmo corte, na consulta: a conta ativa, de pessoa ativa, com a
// permissão numa atribuição sem encerramento, de um perfil ativo, direta ou por um grupo ativo de
// que a conta é sem encerramento. A permissão da organização inteira, como o `chat.usar`, só vale
// na atribuição sem local, como no `resolverAcesso`.
import { definicaoDa, fechamento, PERMISSOES, type Permissao } from '@grafite/domain';
import { type SQL, type SQLWrapper, sql } from 'drizzle-orm';

/**
 * As permissões que dão a chave, ela e as que a incluem, pelo escopo de cada uma: a da organização
 * inteira só vale na atribuição sem local, também pelo que ela inclui, como no `resolverAcesso`.
 */
const quemDa = (chave: Permissao) => {
  const daChave = PERMISSOES.filter((permissao) => fechamento([permissao.chave]).has(chave));
  const doEscopo = (escopo: 'local' | 'organizacao') =>
    daChave.filter((permissao) => permissao.escopo === escopo).map((permissao) => permissao.chave);
  return { deLocal: doEscopo('local'), daOrganizacao: doEscopo('organizacao') };
};

/** O perfil declara uma das chaves. */
const declara = (chaves: readonly string[]) =>
  chaves.length > 0
    ? sql`qu_pf.permissoes && array[${sql.join(
        chaves.map((c) => sql`${c}`),
        sql`, `,
      )}]::text[]`
    : sql`false`;

/**
 * A conta (a coluna ou o id) tem a permissão agora. Os apelidos próprios (`qu_*`) deixam a consulta
 * de fora usar as tabelas sem apelido.
 */
export function contaTemAPermissao(conta: SQLWrapper | string, chave: Permissao): SQL {
  const daOrganizacao = definicaoDa(chave).escopo === 'organizacao';
  const { deLocal, daOrganizacao: queIncluem } = quemDa(chave);
  return sql`exists (
    select 1
    from contas qu_c
    join pessoas qu_p on qu_p.org_id = qu_c.org_id and qu_p.id = qu_c.pessoa_id
    where qu_c.id = ${conta}
      and qu_c.situacao = 'ativa'
      and qu_p.situacao = 'ativa'
      and exists (
        select 1
        from atribuicoes qu_a
        join perfis qu_pf on qu_pf.org_id = qu_a.org_id and qu_pf.id = qu_a.perfil_id
        left join membros_do_grupo qu_m
          on qu_m.org_id = qu_a.org_id and qu_m.grupo_id = qu_a.grupo_id
          and qu_m.conta_id = qu_c.id and qu_m.encerrada_em is null
        left join grupos qu_g on qu_g.org_id = qu_m.org_id and qu_g.id = qu_m.grupo_id
        where qu_a.encerrada_em is null
          ${daOrganizacao ? sql`and qu_a.local_id is null` : sql``}
          and qu_pf.situacao = 'ativo'
          and (qu_pf.todas_as_permissoes or ${declara(deLocal)}
            or (qu_a.local_id is null and ${declara(queIncluem)}))
          and (qu_a.conta_id = qu_c.id or qu_g.situacao = 'ativo')))`;
}

/** A conta usa o chat: o módulo é conferido pela guarda das rotas, que vale para a organização. */
export const usaOChatNaConsulta = (conta: SQLWrapper | string) =>
  contaTemAPermissao(conta, 'chat.usar');

/** A conta é da TI no chat: tem `chamados.atender` em algum local ou na organização. */
export const daTiNaConsulta = (conta: SQLWrapper | string) =>
  contaTemAPermissao(conta, 'chamados.atender');
