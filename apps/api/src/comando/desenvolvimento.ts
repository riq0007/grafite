// A senha do ambiente de desenvolvimento (spec plataforma-base; design da change
// senha-do-admin-no-desenvolvimento): a conta `admin` da organização de desenvolvimento entra com a
// senha fixa `admin123`, sem troca. Só o `pnpm dev` a grava, pelo ponto de entrada que fica fora da
// imagem, e a função recusa a produção e a organização que tem algum endereço que não é local.
import {
  type Banco,
  contas,
  enderecosDeAcesso,
  naOrganizacao,
  tentativasDeEntrada,
} from '@grafite/db';
import { eq } from 'drizzle-orm';
import { comCredenciais } from '../acesso/credenciais.ts';
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { conferirSenha, gerarHashDaSenha } from '../acesso/senhas.ts';
import { registrarNaAuditoria, visaoDaConta } from '../auditoria.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import { ErroDoComando } from './erros.ts';

/** O endereço pelo qual a organização de desenvolvimento é achada. */
export const ENDERECO_DE_DESENVOLVIMENTO = 'localhost';
export const USUARIO_DE_DESENVOLVIMENTO = 'admin';
/** Só do desenvolvimento: não passa pela regra da senha, e nenhuma tela a aceita. */
export const SENHA_DE_DESENVOLVIMENTO = 'admin123';

/** Os únicos endereços de uma organização de desenvolvimento. */
const ENDERECOS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1']);

const ATOR = { tipo: 'sistema', descricao: 'comando de desenvolvimento' } as const;

export interface AmbienteDoDesenvolvimento {
  /** Aberto só depois de conferir que não é a produção. */
  banco: () => Banco;
  agora: () => Date;
  /** O `NODE_ENV` do processo: a imagem roda com `production`. */
  nodeEnv: string | undefined;
}

/**
 * Garante que a conta `admin` da organização de desenvolvimento entre com `admin123`, sem troca.
 * Com a senha já `admin123`, nada é gravado; senão, ela é gravada como na troca da senha: as
 * recusas seguidas zeradas, a auditoria e as sessões abertas da conta encerradas.
 */
export async function garantirSenhaDeDesenvolvimento({
  banco: abrirBanco,
  agora,
  nodeEnv,
}: AmbienteDoDesenvolvimento): Promise<'gravada' | 'mantida'> {
  if (nodeEnv === 'production') {
    throw new ErroDoComando(
      1,
      'A senha de desenvolvimento não é gravada em produção (NODE_ENV=production).',
    );
  }
  const banco = abrirBanco();
  const orgId = await organizacaoDoEndereco(banco, ENDERECO_DE_DESENVOLVIMENTO);
  if (!orgId) {
    throw new ErroDoComando(
      1,
      `Nenhuma organização tem o endereço ${ENDERECO_DE_DESENVOLVIMENTO}. O pnpm dev a cria antes.`,
    );
  }
  const momento = agora();
  return naOrganizacao(banco, orgId, async (tx) => {
    const enderecos = await tx
      .select({ endereco: enderecosDeAcesso.endereco })
      .from(enderecosDeAcesso);
    const naoLocais = enderecos
      .map(({ endereco }) => endereco)
      .filter((e) => !ENDERECOS_LOCAIS.has(e));
    if (naoLocais.length > 0) {
      throw new ErroDoComando(
        1,
        `A organização do endereço ${ENDERECO_DE_DESENVOLVIMENTO} também tem ${naoLocais.join(', ')}, que não é local: a senha de desenvolvimento só vale numa organização só com endereços locais.`,
      );
    }
    const [linha] = await tx
      .select()
      .from(contas)
      .where(eq(contas.usuario, USUARIO_DE_DESENVOLVIMENTO));
    if (!linha) {
      throw new ErroDoComando(
        1,
        `Nenhuma conta com o usuário ${USUARIO_DE_DESENVOLVIMENTO} na organização de desenvolvimento.`,
      );
    }
    const conta = comCredenciais(linha);
    if (
      !conta.senhaTemporaria &&
      (await conferirSenha(SENHA_DE_DESENVOLVIMENTO, conta.hashSenha))
    ) {
      return 'mantida';
    }
    const [depois] = await tx
      .update(contas)
      .set({
        hashSenha: await gerarHashDaSenha(SENHA_DE_DESENVOLVIMENTO),
        senhaTemporaria: false,
        senhaTrocadaEm: momento,
        atualizadaEm: momento,
      })
      .where(eq(contas.id, conta.id))
      .returning();
    await tx
      .update(tentativasDeEntrada)
      .set({ falhasSeguidas: 0, bloqueadaAte: null, atualizadaEm: momento })
      .where(eq(tentativasDeEntrada.usuario, conta.usuario));
    await registrarNaAuditoria(tx, {
      acao: 'senha.trocada',
      ator: ATOR,
      alvo: { tipo: 'conta', id: conta.id },
      antes: visaoDaConta(conta),
      depois: depois ? visaoDaConta(depois) : null,
      momento,
      saida: await saidaDaConta(tx, conta.id),
    });
    await encerrarSessoesDaConta(tx, {
      contaId: conta.id,
      motivo: 'senha-trocada',
      momento,
      ator: ATOR,
    });
    return 'gravada';
  });
}
