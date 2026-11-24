// A pessoa da aba pelo SID (spec aba-dos-colaboradores, "Pessoa pelo usuário do Windows"; design,
// decisão 4). O serviço da aba manda o SID de quem está no Windows; a API busca o usuário no AD com a
// conta de serviço, dentro da base e do filtro das pessoas, e faz do atributo do usuário o usuário da
// conta, como na entrada pelo diretório. As recusas vêm antes do `contaPeloDiretorio`, que não olha
// a origem nem a situação da conta: cada uma com o motivo da aba sem conexão.
import { type Banco, contas, naOrganizacao, pessoas, type Transacao } from '@grafite/db';
import { type MotivoSemConexao, normalizarUsuario, validarUsuario } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import type { ChavesDoCofre } from '../cofre/cifra.ts';
import { type ConectarDiretorio, FalhaDoDiretorio } from './cliente.ts';
import { aceitaComOsGrupos, type ConferenciaNoDiretorio, prepararODiretorio } from './entrada.ts';
import { sidValido } from './ldap.ts';

/** Os motivos da pessoa recusada pelo SID. */
export type RecusaDaPessoaPeloSid = Extract<
  MotivoSemConexao,
  'usuario-de-fora' | 'conta-local' | 'conta-inativa' | 'sem-grupo' | 'ti-fora-do-alcance'
>;

/**
 * O caso de cada recusa, só para a auditoria: a TI resolve a desativada no AD e a sem grupo, ou o
 * SID fora do diretório e o usuário que não serve, de jeitos diferentes, e a frase da tela é a mesma.
 */
export type DetalheDaRecusa =
  | 'diretorio-desligado'
  | 'sid-fora-da-forma'
  | 'ad-fora-do-ar'
  | 'sid-fora-do-diretorio'
  | 'usuario-nao-serve'
  | 'conta-local'
  | 'conta-inativa'
  | 'desativada-no-ad'
  | 'sem-grupo-mapeado';

export type PessoaPeloSid =
  | {
      tipo: 'recusada';
      motivo: RecusaDaPessoaPeloSid;
      detalhe: DetalheDaRecusa;
      /** Quem o AD achou, quando achou: a auditoria diz quem é, e não só o SID. */
      quem?: { usuario: string; nome: string };
    }
  | {
      tipo: 'aceita';
      /** O usuário da conta, normalizado. */
      usuario: string;
      aceita: Extract<ConferenciaNoDiretorio, { tipo: 'aceita' }>;
    };

const recusa = (
  motivo: RecusaDaPessoaPeloSid,
  detalhe: DetalheDaRecusa,
  quem?: { usuario: string; nome: string },
) => ({ tipo: 'recusada', motivo, detalhe, ...(quem ? { quem } : {}) }) as const;

/**
 * A conta do Grafite com o usuário, se houver, que não entra pela aba: a local, com a mesma frase da
 * conta local, e a inativa, ou a da pessoa inativa. Conferida também na transação da sessão.
 */
export async function recusaDaConta(
  tx: Transacao,
  usuario: string,
): Promise<'conta-local' | 'conta-inativa' | null> {
  const [linha] = await tx
    .select({ origem: contas.origem, conta: contas.situacao, pessoa: pessoas.situacao })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.usuario, usuario));
  if (!linha) return null;
  if (linha.origem === 'local') return 'conta-local';
  if (linha.conta !== 'ativa' || linha.pessoa !== 'ativa') return 'conta-inativa';
  return null;
}

/**
 * Confere a pessoa do SID, antes da transação da sessão, nesta ordem (design, decisão 4): o
 * diretório desligado, sem o qual não há o que conferir; a forma do SID; o AD fora do ar; o SID fora
 * do diretório e o usuário que não serve; a conta local; a inativa; e a conta desativada no AD e a
 * falta de grupo mapeado, que dão a frase de quem não tem acesso.
 */
export async function conferirPessoaPeloSid(
  banco: Banco,
  {
    orgId,
    sid,
    chaves,
    conectar,
    avisar,
  }: {
    orgId: string;
    sid: string;
    chaves: ChavesDoCofre;
    conectar: ConectarDiretorio;
    avisar: (dados: object, mensagem: string) => void;
  },
): Promise<PessoaPeloSid> {
  const preparo = await naOrganizacao(banco, orgId, (tx) =>
    prepararODiretorio(tx, { orgId, chaves, avisar }),
  );
  if (!preparo) return recusa('ti-fora-do-alcance', 'diretorio-desligado');
  // A conta de serviço que o cofre não abre deixa o AD tão fora do alcance quanto a rede.
  if (!preparo.acesso) return recusa('ti-fora-do-alcance', 'ad-fora-do-ar');
  if (!sidValido(sid)) return recusa('usuario-de-fora', 'sid-fora-da-forma');
  let achado: Awaited<ReturnType<ReturnType<ConectarDiretorio>['buscarPeloSid']>>;
  try {
    achado = await conectar(preparo.acesso).buscarPeloSid(sid);
  } catch (erro) {
    if (!(erro instanceof FalhaDoDiretorio)) throw erro;
    avisar({ motivo: erro.motivo }, 'o diretório não atendeu a pessoa da aba');
    return recusa('ti-fora-do-alcance', 'ad-fora-do-ar');
  }
  if (!achado) return recusa('usuario-de-fora', 'sid-fora-do-diretorio');
  const quem = { usuario: achado.usuario, nome: achado.nome };
  if (validarUsuario(achado.usuario) !== null) {
    return recusa('usuario-de-fora', 'usuario-nao-serve', quem);
  }
  const usuario = normalizarUsuario(achado.usuario);
  const daConta = await naOrganizacao(banco, orgId, (tx) => recusaDaConta(tx, usuario));
  if (daConta) return recusa(daConta, daConta, quem);
  if (!achado.ativa) return recusa('sem-grupo', 'desativada-no-ad', quem);
  const aceita = aceitaComOsGrupos(achado, preparo.mapeamentos);
  if (!aceita) return recusa('sem-grupo', 'sem-grupo-mapeado', quem);
  return { tipo: 'aceita', usuario, aceita };
}
