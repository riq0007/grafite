// `pnpm grafite organizacao criar` (design do F2a, decisão 11; do F2b, decisão 8): a organização,
// os endereços, a pessoa, a primeira conta, o perfil Administrador, atribuído a ela, e as regras de
// fábrica dos alertas (design do P3a, decisão 4), numa transação só, com a auditoria feita pelo comando no servidor. A senha temporária aparece uma vez, na saída,
// e só o hash dela fica no banco.
import { type Banco, enderecosDeAcesso, naOrganizacao, organizacoes } from '@grafite/db';
import { normalizarUsuario, validarUsuario } from '@grafite/domain';
import { eq, sql } from 'drizzle-orm';
import { gerarSenhaTemporaria } from '../acesso/codigos.ts';
import { normalizarEndereco, organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { gerarHashDaSenha } from '../acesso/senhas.ts';
import { garantirRegrasDeFabrica } from '../alertas/fabrica.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { violouUnicidade } from '../banco.ts';
import { atribuirAdministrador, semearAdministrador } from './administrador.ts';
import { criarPessoaEConta } from './conta.ts';
import { ErroDoComando } from './erros.ts';

/** A mesma forma que o banco confere (enderecos_de_acesso_endereco_normalizado). */
const ENDERECO_NORMALIZADO = /^[a-z0-9:._-]+$/;
const UMA_PORTA = /^[^:]*:[^:]*$/;

/** O endereço normalizado, ou a recusa de um endereço que não é um nome de servidor nem um IP. */
export function enderecoValido(digitado: string): string {
  const invalido = new ErroDoComando(2, `O endereço ${digitado} não é válido.`);
  if (/[\s/\\@?#]/.test(digitado)) throw invalido;
  const endereco = normalizarEndereco(digitado);
  if (!ENDERECO_NORMALIZADO.test(endereco) || UMA_PORTA.test(endereco)) throw invalido;
  return endereco;
}

/** O usuário normalizado, ou a recusa com o motivo da regra. */
export function usuarioValido(digitado: string): string {
  const motivo = validarUsuario(digitado);
  if (motivo) throw new ErroDoComando(2, `Usuário ${digitado}: ${motivo}`);
  return normalizarUsuario(digitado);
}

export interface OpcoesDaOrganizacao {
  nome: string;
  enderecos: string[];
  pessoa: string;
  usuario: string;
  email?: string;
  exigirDoisPassos: boolean;
  seNaoExistir: boolean;
}

export type ResultadoDaOrganizacao =
  | { tipo: 'criada'; senhaTemporaria: string }
  | { tipo: 'ja-existe'; endereco: string };

const ATOR = { tipo: 'sistema', descricao: 'comando no servidor: organizacao criar' } as const;

export async function criarOrganizacao(
  banco: Banco,
  agora: () => Date,
  opcoes: OpcoesDaOrganizacao,
): Promise<ResultadoDaOrganizacao> {
  const { nome, enderecos, pessoa, usuario, email, exigirDoisPassos, seNaoExistir } = opcoes;
  for (const endereco of enderecos) {
    if ((await organizacaoDoEndereco(banco, endereco)) === null) continue;
    if (seNaoExistir && endereco === enderecos[0]) return { tipo: 'ja-existe', endereco };
    throw new ErroDoComando(1, `O endereço ${endereco} já está em uso.`);
  }
  const { rows } = await banco.execute<{ id: string }>(sql`select uuidv7() as id`);
  const orgId = rows[0]?.id ?? '';
  const senhaTemporaria = gerarSenhaTemporaria();
  const hashSenha = await gerarHashDaSenha(senhaTemporaria);
  const momento = agora();
  try {
    await naOrganizacao(banco, orgId, async (tx) => {
      await tx.insert(organizacoes).values({ id: orgId, nome });
      await registrarNaAuditoria(tx, {
        acao: 'organizacao.criada',
        ator: ATOR,
        alvo: { tipo: 'organizacao', id: orgId },
        depois: { nome },
        momento,
      });
      for (const endereco of enderecos) {
        const [registrado] = await tx
          .insert(enderecosDeAcesso)
          .values({ orgId, endereco })
          .returning({ id: enderecosDeAcesso.id });
        await registrarNaAuditoria(tx, {
          acao: 'endereco.registrado',
          ator: ATOR,
          alvo: { tipo: 'endereco', id: registrado?.id },
          depois: { endereco },
          momento,
        });
      }
      const conta = await criarPessoaEConta(
        tx,
        { orgId, pessoa, email, usuario, hashSenha, exigirDoisPassos },
        { ator: ATOR, momento },
      );
      await semearAdministrador(tx, { exigirDoisPassos }, { ator: ATOR, momento });
      await atribuirAdministrador(tx, conta.id, { ator: ATOR, momento });
      await garantirRegrasDeFabrica(tx, { ator: ATOR, momento });
    });
  } catch (erro) {
    if (violouUnicidade(erro)) throw new ErroDoComando(1, 'Um dos endereços já está em uso.');
    throw erro;
  }
  return { tipo: 'criada', senhaTemporaria };
}

/** O ator da auditoria de um comando sobre os endereços. */
const atorDo = (comando: string) =>
  ({ tipo: 'sistema', descricao: `comando no servidor: organizacao ${comando}` }) as const;

/** A organização de um endereço dela, ou a recusa. */
async function organizacaoDe(banco: Banco, endereco: string): Promise<string> {
  const orgId = await organizacaoDoEndereco(banco, endereco);
  if (orgId === null) throw new ErroDoComando(1, `Nenhuma organização tem o endereço ${endereco}.`);
  return orgId;
}

/**
 * Acrescenta um endereço de acesso à organização de um endereço dela (change painel-da-operacao,
 * design, decisão 8). O endereço que já é dela não muda nada; o de outra organização é recusado.
 */
export async function acrescentarEndereco(
  banco: Banco,
  agora: () => Date,
  { endereco, novo }: { endereco: string; novo: string },
): Promise<{ tipo: 'acrescentado' | 'ja-era'; organizacao: string }> {
  const orgId = await organizacaoDe(banco, endereco);
  const dono = await organizacaoDoEndereco(banco, novo);
  if (dono !== null && dono !== orgId) {
    throw new ErroDoComando(1, `O endereço ${novo} já está em uso.`);
  }
  try {
    return await naOrganizacao(banco, orgId, async (tx) => {
      const [organizacao] = await tx
        .select({ nome: organizacoes.nome })
        .from(organizacoes)
        .where(eq(organizacoes.id, orgId));
      const nome = organizacao?.nome ?? '';
      if (dono === orgId) return { tipo: 'ja-era' as const, organizacao: nome };
      const [registrado] = await tx
        .insert(enderecosDeAcesso)
        .values({ orgId, endereco: novo })
        .returning({ id: enderecosDeAcesso.id });
      await registrarNaAuditoria(tx, {
        acao: 'endereco.registrado',
        ator: atorDo('acrescentar-endereco'),
        alvo: { tipo: 'endereco', id: registrado?.id },
        depois: { endereco: novo },
        momento: agora(),
      });
      return { tipo: 'acrescentado' as const, organizacao: nome };
    });
  } catch (erro) {
    if (violouUnicidade(erro)) throw new ErroDoComando(1, `O endereço ${novo} já está em uso.`);
    throw erro;
  }
}

/** Tira um endereço de acesso da organização dele, que precisa de pelo menos um. */
export async function tirarEndereco(
  banco: Banco,
  agora: () => Date,
  { endereco }: { endereco: string },
): Promise<{ organizacao: string }> {
  const orgId = await organizacaoDe(banco, endereco);
  return naOrganizacao(banco, orgId, async (tx) => {
    const [organizacao] = await tx
      .select({ nome: organizacoes.nome })
      .from(organizacoes)
      .where(eq(organizacoes.id, orgId));
    const nome = organizacao?.nome ?? '';
    const enderecos = await tx
      .select({ id: enderecosDeAcesso.id, endereco: enderecosDeAcesso.endereco })
      .from(enderecosDeAcesso);
    const alvo = enderecos.find((registrado) => registrado.endereco === endereco);
    if (alvo === undefined || enderecos.length <= 1) {
      throw new ErroDoComando(
        1,
        `O endereço ${endereco} é o último da organização "${nome}": ela precisa de pelo menos um.`,
      );
    }
    await tx.delete(enderecosDeAcesso).where(eq(enderecosDeAcesso.id, alvo.id));
    await registrarNaAuditoria(tx, {
      acao: 'endereco.removido',
      ator: atorDo('tirar-endereco'),
      alvo: { tipo: 'endereco', id: alvo.id },
      antes: { endereco },
      momento: agora(),
    });
    return { organizacao: nome };
  });
}
