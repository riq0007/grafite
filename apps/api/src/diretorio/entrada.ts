// A entrada pelo diretório (spec diretorio-ad, "Entrada pelo diretório"; change integracao-ad-ldap,
// design, decisão 3). Antes da transação da entrada, com o diretório ligado e sem conta local com o
// usuário, a senha é conferida no AD. Na transação, a primeira entrada cria a pessoa e a conta do
// diretório, e cada entrada atualiza o nome, o e-mail e os grupos mapeados. A senha do AD nunca é
// guardada: a conta do diretório tem uma senha local aleatória, que nunca confere.
import { randomBytes } from 'node:crypto';
import {
  type Banco,
  contas,
  grupos,
  mapeamentosDoDiretorio,
  membrosDoGrupo,
  naOrganizacao,
  pessoas,
  type Transacao,
} from '@grafite/db';
import {
  gruposDoGrafite,
  sincronizacaoDosGrupos,
  textoDeBusca,
  validarUsuario,
} from '@grafite/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { gerarHashDaSenha } from '../acesso/senhas.ts';
import { type Ator, registrarNaAuditoria, visaoDaConta, visaoDaPessoa } from '../auditoria.ts';
import { type ChavesDoCofre, SegredoQueNaoAbre } from '../cofre/cifra.ts';
import { saidaDaPessoa } from '../eventos/pessoas.ts';
import { type ConectarDiretorio, FalhaDoDiretorio, type UsuarioDoDiretorio } from './cliente.ts';
import { abrirContaDeServico, acessoAoDiretorio, lerDiretorio } from './diretorio.ts';

/** O que o AD disse da entrada. */
export type ConferenciaNoDiretorio =
  | { tipo: 'fora-do-ar' }
  | { tipo: 'recusada' }
  | { tipo: 'sem-acesso' }
  | {
      tipo: 'aceita';
      usuario: UsuarioDoDiretorio;
      /** Os grupos do Grafite que os grupos do AD dão. */
      grupos: string[];
      /** Os grupos do Grafite que são alvo de algum mapeamento. */
      alvos: string[];
    };

const DO_DIRETORIO: Ator = { tipo: 'sistema', descricao: 'Diretório' };

/**
 * Confere a entrada no AD, antes da transação: `null` quando a entrada é a local (o diretório
 * desligado, a conta local ou o usuário que não serve de conta).
 */
export async function conferirNoDiretorio(
  banco: Banco,
  {
    orgId,
    usuario,
    senha,
    chaves,
    conectar,
    avisar,
  }: {
    orgId: string;
    usuario: string;
    senha: string;
    chaves: ChavesDoCofre;
    conectar: ConectarDiretorio;
    avisar: (dados: object, mensagem: string) => void;
  },
): Promise<ConferenciaNoDiretorio | null> {
  if (validarUsuario(usuario) !== null) return null;
  const preparo = await naOrganizacao(banco, orgId, async (tx) => {
    const lido = await lerDiretorio(tx);
    if (!lido?.diretorio.ligado) return null;
    const [conta] = await tx
      .select({ origem: contas.origem })
      .from(contas)
      .where(eq(contas.usuario, usuario));
    if (conta?.origem === 'local') return null;
    const mapeamentos = await tx
      .select({ grupoDn: mapeamentosDoDiretorio.grupoDn, grupoId: mapeamentosDoDiretorio.grupoId })
      .from(mapeamentosDoDiretorio);
    try {
      const servico = await abrirContaDeServico(tx, {
        orgId,
        segredoId: lido.diretorio.segredoId,
        chaves,
      });
      return { acesso: servico ? acessoAoDiretorio(lido.diretorio, servico) : null, mapeamentos };
    } catch (erro) {
      if (!(erro instanceof SegredoQueNaoAbre)) throw erro;
      avisar({ motivo: erro.motivo }, 'conta de serviço do diretório que o cofre não abre');
      return { acesso: null, mapeamentos };
    }
  });
  if (!preparo) return null;
  if (!preparo.acesso) return { tipo: 'fora-do-ar' };
  let achado: UsuarioDoDiretorio | null;
  try {
    achado = await conectar(preparo.acesso).autenticar(usuario, senha);
  } catch (erro) {
    if (!(erro instanceof FalhaDoDiretorio)) throw erro;
    avisar({ motivo: erro.motivo }, 'o diretório não atendeu a entrada');
    return { tipo: 'fora-do-ar' };
  }
  if (!achado?.ativa) return { tipo: 'recusada' };
  const devidos = gruposDoGrafite(achado.grupos, preparo.mapeamentos);
  if (devidos.length === 0) return { tipo: 'sem-acesso' };
  return {
    tipo: 'aceita',
    usuario: achado,
    grupos: devidos,
    alvos: [...new Set(preparo.mapeamentos.map((mapeamento) => mapeamento.grupoId))],
  };
}

/**
 * Na transação da entrada: a conta do diretório, criada na primeira entrada, com a pessoa, o nome e
 * o e-mail do AD e a participação nos grupos mapeados sincronizada. Devolve o id da conta.
 */
export async function contaPeloDiretorio(
  tx: Transacao,
  {
    orgId,
    usuario,
    aceita,
    momento,
  }: {
    orgId: string;
    usuario: string;
    aceita: Extract<ConferenciaNoDiretorio, { tipo: 'aceita' }>;
    momento: Date;
  },
): Promise<string> {
  const { nome, email } = aceita.usuario;
  const [existente] = await tx
    .select({ conta: contas, pessoa: pessoas })
    .from(contas)
    .innerJoin(pessoas, and(eq(pessoas.orgId, contas.orgId), eq(pessoas.id, contas.pessoaId)))
    .where(eq(contas.usuario, usuario));
  let contaId: string;
  if (existente) {
    contaId = existente.conta.id;
    const { pessoa } = existente;
    if (pessoa.situacao === 'ativa' && (pessoa.nome !== nome || pessoa.email !== email)) {
      const [depois] = await tx
        .update(pessoas)
        .set({
          nome,
          email,
          busca: textoDeBusca({ nome, email, matricula: pessoa.matricula }),
          atualizadaEm: momento,
        })
        .where(eq(pessoas.id, pessoa.id))
        .returning();
      if (depois) {
        await registrarNaAuditoria(tx, {
          acao: 'pessoa.alterada',
          ator: DO_DIRETORIO,
          alvo: { tipo: 'pessoa', id: pessoa.id },
          antes: visaoDaPessoa(pessoa),
          depois: visaoDaPessoa(depois),
          momento,
          saida: saidaDaPessoa({ pessoaId: pessoa.id, locais: [pessoa.localId] }),
        });
      }
    }
  } else {
    const [pessoa] = await tx
      .insert(pessoas)
      .values({ orgId, nome, email, busca: textoDeBusca({ nome, email, matricula: null }) })
      .returning();
    if (!pessoa) throw new Error('A pessoa do diretório não foi criada.');
    await registrarNaAuditoria(tx, {
      acao: 'pessoa.criada',
      ator: DO_DIRETORIO,
      alvo: { tipo: 'pessoa', id: pessoa.id },
      depois: visaoDaPessoa(pessoa),
      momento,
      saida: saidaDaPessoa({ pessoaId: pessoa.id, locais: [pessoa.localId] }),
    });
    const [conta] = await tx
      .insert(contas)
      .values({
        orgId,
        pessoaId: pessoa.id,
        usuario,
        // A senha local nunca confere: a conta do diretório só entra pelo AD.
        hashSenha: await gerarHashDaSenha(randomBytes(32).toString('base64url')),
        senhaTemporaria: false,
        origem: 'diretorio',
      })
      .returning();
    if (!conta) throw new Error('A conta do diretório não foi criada.');
    contaId = conta.id;
    await registrarNaAuditoria(tx, {
      acao: 'diretorio.conta-criada',
      ator: DO_DIRETORIO,
      alvo: { tipo: 'conta', id: conta.id },
      depois: visaoDaConta(conta),
      dados: { dn: aceita.usuario.dn },
      momento,
    });
  }
  await sincronizarGrupos(tx, { orgId, contaId, aceita, momento });
  return contaId;
}

/** A participação nos grupos que são alvo de mapeamento, como o AD diz agora. */
async function sincronizarGrupos(
  tx: Transacao,
  {
    orgId,
    contaId,
    aceita,
    momento,
  }: {
    orgId: string;
    contaId: string;
    aceita: Extract<ConferenciaNoDiretorio, { tipo: 'aceita' }>;
    momento: Date;
  },
) {
  const atuais = await tx
    .select({ grupoId: membrosDoGrupo.grupoId })
    .from(membrosDoGrupo)
    .where(and(eq(membrosDoGrupo.contaId, contaId), isNull(membrosDoGrupo.encerradaEm)));
  const { incluir, encerrar } = sincronizacaoDosGrupos({
    alvos: aceita.alvos,
    devidos: aceita.grupos,
    atuais: atuais.map(({ grupoId }) => grupoId),
  });
  if (incluir.length === 0 && encerrar.length === 0) return;
  const nomes = new Map(
    (
      await tx
        .select({ id: grupos.id, nome: grupos.nome, situacao: grupos.situacao })
        .from(grupos)
        .where(inArray(grupos.id, [...incluir, ...encerrar]))
    ).map((grupo) => [grupo.id, grupo]),
  );
  for (const grupoId of incluir) {
    const grupo = nomes.get(grupoId);
    if (grupo?.situacao !== 'ativo') continue;
    await tx.insert(membrosDoGrupo).values({ orgId, grupoId, contaId, incluidaEm: momento });
    await registrarNaAuditoria(tx, {
      acao: 'membro.incluido',
      ator: DO_DIRETORIO,
      alvo: { tipo: 'conta', id: contaId },
      dados: { grupoId, grupo: grupo.nome },
      momento,
    });
  }
  for (const grupoId of encerrar) {
    await tx
      .update(membrosDoGrupo)
      .set({ encerradaEm: momento })
      .where(
        and(
          eq(membrosDoGrupo.contaId, contaId),
          eq(membrosDoGrupo.grupoId, grupoId),
          isNull(membrosDoGrupo.encerradaEm),
        ),
      );
    await registrarNaAuditoria(tx, {
      acao: 'membro.retirado',
      ator: DO_DIRETORIO,
      alvo: { tipo: 'conta', id: contaId },
      dados: { grupoId, grupo: nomes.get(grupoId)?.nome ?? null },
      momento,
    });
  }
}
