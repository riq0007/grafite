// `pnpm grafite conta criar` e `pnpm grafite conta redefinir` (design do F2a, decisão 11). A
// redefinição é a recuperação de último recurso de um acesso perdido: senha temporária nova, todas
// as sessões encerradas, a contagem de tentativas zerada e, se pedido, os dois passos removidos.
import { type Banco, contas, naOrganizacao, pessoas, type Transacao } from '@grafite/db';
import { textoDeBusca } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { gerarSenhaTemporaria } from '../acesso/codigos.ts';
import { comCredenciais } from '../acesso/credenciais.ts';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { redefinirConta } from '../acesso/redefinicao.ts';
import { gerarHashDaSenha } from '../acesso/senhas.ts';
import { type Ator, registrarNaAuditoria, visaoDaConta, visaoDaPessoa } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { saidaDaPessoa } from '../eventos/pessoas.ts';
import { atribuirAdministrador } from './administrador.ts';
import { ErroDoComando } from './erros.ts';

export interface PessoaEConta {
  orgId: string;
  pessoa: string;
  email?: string;
  usuario: string;
  hashSenha: string;
  exigirDoisPassos: boolean;
}

/** A pessoa e a conta dela, com a senha temporária e a auditoria, na transação dada. */
export async function criarPessoaEConta(
  tx: Transacao,
  { orgId, pessoa, email, usuario, hashSenha, exigirDoisPassos }: PessoaEConta,
  { ator, momento }: { ator: Ator; momento: Date },
) {
  const [criada] = await tx
    .insert(pessoas)
    .values({
      orgId,
      nome: pessoa,
      email: email ?? null,
      busca: textoDeBusca({ nome: pessoa, email: email ?? null, matricula: null }),
    })
    .returning();
  if (!criada) throw new Error('A pessoa não foi criada.');
  await registrarNaAuditoria(tx, {
    acao: 'pessoa.criada',
    ator,
    alvo: { tipo: 'pessoa', id: criada.id },
    depois: visaoDaPessoa(criada),
    momento,
    saida: saidaDaPessoa({ pessoaId: criada.id, locais: [criada.localId] }),
  });
  const [conta] = await tx
    .insert(contas)
    .values({
      orgId,
      pessoaId: criada.id,
      usuario,
      hashSenha,
      senhaTemporaria: true,
      exigeDoisPassos: exigirDoisPassos,
    })
    .returning();
  if (!conta) throw new Error('A conta não foi criada.');
  await registrarNaAuditoria(tx, {
    acao: 'conta.criada',
    ator,
    alvo: { tipo: 'conta', id: conta.id },
    depois: visaoDaConta(conta),
    momento,
    saida: saidaDaPessoa({ pessoaId: criada.id, locais: [criada.localId], contaId: conta.id }),
  });
  return conta;
}

async function organizacaoExistente(banco: Banco, endereco: string): Promise<string> {
  const orgId = await organizacaoDoEndereco(banco, endereco);
  if (!orgId) throw new ErroDoComando(1, `Nenhuma organização tem o endereço ${endereco}.`);
  return orgId;
}

export interface OpcoesDaConta {
  endereco: string;
  pessoa: string;
  usuario: string;
  email?: string;
  exigirDoisPassos: boolean;
  /** A conta recebe o Administrador para a organização inteira. */
  administrador: boolean;
}

export async function criarConta(banco: Banco, agora: () => Date, opcoes: OpcoesDaConta) {
  const orgId = await organizacaoExistente(banco, opcoes.endereco);
  const senhaTemporaria = gerarSenhaTemporaria();
  const hashSenha = await gerarHashDaSenha(senhaTemporaria);
  const ator = { tipo: 'sistema', descricao: 'comando no servidor: conta criar' } as const;
  try {
    const momento = agora();
    await naOrganizacao(banco, orgId, async (tx) => {
      const conta = await criarPessoaEConta(tx, { ...opcoes, orgId, hashSenha }, { ator, momento });
      if (opcoes.administrador) await atribuirAdministrador(tx, conta.id, { ator, momento });
    });
  } catch (erro) {
    if (violouUnicidade(erro)) {
      throw new ErroDoComando(1, `O usuário ${opcoes.usuario} já existe nesta organização.`);
    }
    throw erro;
  }
  return { senhaTemporaria };
}

export interface OpcoesDaRedefinicao {
  endereco: string;
  usuario: string;
  removerDoisPassos: boolean;
}

export async function redefinirAcesso(
  banco: Banco,
  agora: () => Date,
  { endereco, usuario, removerDoisPassos }: OpcoesDaRedefinicao,
) {
  const orgId = await organizacaoExistente(banco, endereco);
  const senhaTemporaria = gerarSenhaTemporaria();
  const hashSenha = await gerarHashDaSenha(senhaTemporaria);
  const ator = { tipo: 'sistema', descricao: 'comando no servidor: conta redefinir' } as const;
  const momento = agora();
  const resultado = await naOrganizacao(banco, orgId, async (tx) => {
    const [linha] = await tx.select().from(contas).where(eq(contas.usuario, usuario));
    if (!linha) {
      throw new ErroDoComando(1, `Nenhuma conta com o usuário ${usuario} nesta organização.`);
    }
    const conta = comCredenciais(linha);
    const redefinicao = await redefinirConta(tx, {
      conta,
      hashSenha,
      removerDoisPassos,
      ator,
      momento,
    });
    return { ...redefinicao, exigeDoisPassos: conta.exigeDoisPassos };
  });
  return { senhaTemporaria, ...resultado };
}
