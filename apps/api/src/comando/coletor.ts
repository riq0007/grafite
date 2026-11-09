// `pnpm grafite coletor criar` (spec coletor-local, "Coletor pelo comando no servidor"; design do P2a,
// decisão 9): cria um coletor na organização do endereço, com o nome e as faixas. A instalação e a
// atualização da produção o usam para ligar o coletor do servidor à organização que opera o
// servidor, com o token que o coletor já tem; com --se-nao-existir, o mesmo token não cria outro.
import { type Banco, coletores, naOrganizacao } from '@grafite/db';
import { eq } from 'drizzle-orm';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { criarColetor } from '../coleta/coletores.ts';
import { ProblemaDaApi } from '../problemas.ts';
import { ErroDoComando } from './erros.ts';

export type ResultadoDoColetor = { tipo: 'criado' } | { tipo: 'ja-existe'; nome: string };

export async function criarColetorPeloComando(
  banco: Banco,
  agora: () => Date,
  {
    endereco,
    nome,
    faixas,
    token,
    seNaoExistir,
  }: { endereco: string; nome: string; faixas: string[]; token: string; seNaoExistir: boolean },
): Promise<ResultadoDoColetor> {
  const orgId = await organizacaoDoEndereco(banco, endereco);
  if (!orgId) throw new ErroDoComando(1, `Nenhuma organização tem o endereço ${endereco}.`);
  return naOrganizacao(banco, orgId, async (tx) => {
    if (seNaoExistir) {
      const [existente] = await tx
        .select({ nome: coletores.nome })
        .from(coletores)
        .where(eq(coletores.tokenHash, hashDoToken(token)));
      if (existente) return { tipo: 'ja-existe', nome: existente.nome };
    }
    try {
      await criarColetor(tx, {
        nome,
        faixas,
        token,
        ator: { tipo: 'sistema', descricao: 'comando no servidor: coletor criar' },
        momento: agora(),
      });
    } catch (erro) {
      if (erro instanceof ProblemaDaApi && erro.dados.status === 409) {
        throw new ErroDoComando(1, `Já existe um coletor com o nome ${nome} nesta organização.`);
      }
      throw erro;
    }
    return { tipo: 'criado' };
  });
}
