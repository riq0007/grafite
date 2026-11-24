// A senha do ambiente de desenvolvimento (spec plataforma-base; design da change
// senha-do-admin-no-desenvolvimento): a conta `admin` da organização de desenvolvimento entra com a
// senha fixa `admin123`, sem troca. E o diretório de desenvolvimento (change aba-dos-colaboradores,
// design, decisão 13): o AD simulado ligado na mesma organização, com o grupo mapeado ao chat e a
// chave da aba do .env. Só o `pnpm dev` os grava, pelo ponto de entrada que fica fora da imagem, e
// as duas funções recusam a produção e a organização que tem algum endereço que não é local.
import {
  atribuicoes,
  type Banco,
  contas,
  diretorios,
  enderecosDeAcesso,
  grupos,
  mapeamentosDoDiretorio,
  naOrganizacao,
  perfis,
  segredos,
  type Transacao,
  tentativasDeEntrada,
} from '@grafite/db';
import { normalizarDn, normalizarTexto } from '@grafite/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { comCredenciais } from '../acesso/credenciais.ts';
import { encerrarSessoesDaConta } from '../acesso/encerramento.ts';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { conferirSenha, gerarHashDaSenha } from '../acesso/senhas.ts';
import { registrarNaAuditoria, visaoDaConta } from '../auditoria.ts';
import { type ChavesDoCofre, cifrarSegredo } from '../cofre/cifra.ts';
import {
  BASE_DO_DIRETORIO_DE_DESENVOLVIMENTO,
  CONTA_DE_SERVICO_DE_DESENVOLVIMENTO,
  ENDERECOS_LOCAIS,
  GRUPO_DO_AD_DE_DESENVOLVIMENTO,
  NOME_DO_GRUPO_DE_DESENVOLVIMENTO,
  SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO,
} from '../diretorio/desenvolvimento.ts';
import { saidaDaConta } from '../eventos/pessoas.ts';
import { gravarChave } from './aba.ts';
import { ErroDoComando } from './erros.ts';

/** O endereço pelo qual a organização de desenvolvimento é achada. */
export const ENDERECO_DE_DESENVOLVIMENTO = 'localhost';
export const USUARIO_DE_DESENVOLVIMENTO = 'admin';
/** Só do desenvolvimento: não passa pela regra da senha, e nenhuma tela a aceita. */
export const SENHA_DE_DESENVOLVIMENTO = 'admin123';

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
/**
 * Roda `fazer` na organização de desenvolvimento, depois das recusas: a produção, antes de abrir o
 * banco, a organização que falta e a que tem algum endereço que não é local. O `oQue` diz, nas
 * frases, o que seria gravado.
 */
async function naOrganizacaoDeDesenvolvimento<T>(
  oQue: { nome: string; genero: 'a' | 'o' },
  { banco: abrirBanco, nodeEnv }: Pick<AmbienteDoDesenvolvimento, 'banco' | 'nodeEnv'>,
  fazer: (tx: Transacao, orgId: string) => Promise<T>,
): Promise<T> {
  const artigo = oQue.genero === 'a' ? 'A' : 'O';
  if (nodeEnv === 'production') {
    throw new ErroDoComando(
      1,
      `${artigo} ${oQue.nome} não é gravad${oQue.genero} em produção (NODE_ENV=production).`,
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
        `A organização do endereço ${ENDERECO_DE_DESENVOLVIMENTO} também tem ${naoLocais.join(', ')}, que não é local: ${oQue.genero} ${oQue.nome} só vale numa organização só com endereços locais.`,
      );
    }
    return fazer(tx, orgId);
  });
}

export async function garantirSenhaDeDesenvolvimento({
  banco: abrirBanco,
  agora,
  nodeEnv,
}: AmbienteDoDesenvolvimento): Promise<'gravada' | 'mantida'> {
  const momento = agora();
  const senha = { nome: 'senha de desenvolvimento', genero: 'a' } as const;
  return naOrganizacaoDeDesenvolvimento(senha, { banco: abrirBanco, nodeEnv }, async (tx) => {
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

/** O nome do perfil e do segredo que o diretório de desenvolvimento cria. */
const PERFIL_DA_ABA_DE_DESENVOLVIMENTO = 'Colaborador da aba';
const SEGREDO_DO_DIRETORIO_DE_DESENVOLVIMENTO = 'Conta do diretório de desenvolvimento';
/** O que o perfil dos colaboradores tem, como na chat-com-chamados: o chat e o pedido de chamados. */
export const PERMISSOES_DA_ABA_DE_DESENVOLVIMENTO = ['chat.usar', 'chamados.pedir'] as const;

export type ResultadoDoDiretorioDeDesenvolvimento =
  /** Algo foi gravado; com o servidor do diretório desligado que deu lugar ao simulado. */
  | { tipo: 'gravado'; desligadoSubstituido?: string; contaLocal: boolean }
  | { tipo: 'mantido'; contaLocal: boolean }
  | { tipo: 'outro-diretorio' }
  /** Sem quem desenvolve no Windows: só a chave da aba, e o diretório fica como está. */
  | { tipo: 'so-a-chave'; gravouAChave: boolean };

/**
 * Liga na organização de desenvolvimento o diretório simulado, com a conta de serviço no Cofre, o
 * grupo "Colaboradores" com o perfil do chat e dos chamados e o mapeamento, e grava a chave da aba
 * do .env. O diretório ligado com outro servidor, de quem desenvolve contra um AD de verdade, não é
 * tocado; o desligado dá lugar ao simulado. Sem o usuário do Windows, só a chave. O `contaLocal` diz que a
 * organização já tem uma conta local com o usuário do Windows, que então não entra pelo diretório. A
 * chave só é regravada quando o .env traz outra.
 */
export async function garantirDiretorioDeDesenvolvimento({
  banco,
  agora,
  nodeEnv,
  chavesDoCofre,
  chaveDaAba,
  usuarioDoWindows,
}: AmbienteDoDesenvolvimento & {
  chavesDoCofre: ChavesDoCofre;
  chaveDaAba: string;
  /** Quem roda o `pnpm dev` no Windows; sem ele, o diretório simulado não tem quem atender. */
  usuarioDoWindows: string | null;
}): Promise<ResultadoDoDiretorioDeDesenvolvimento> {
  const momento = agora();
  const oQue = { nome: 'diretório de desenvolvimento', genero: 'o' } as const;
  return naOrganizacaoDeDesenvolvimento(oQue, { banco, nodeEnv }, async (tx, orgId) => {
    const chave = await gravarChave(tx, { chave: chaveDaAba, momento, ator: ATOR });
    let gravou = chave !== 'igual';
    if (usuarioDoWindows === null) return { tipo: 'so-a-chave', gravouAChave: gravou };
    const [existente] = await tx.select().from(diretorios);
    const deOutroServidor =
      existente !== undefined && existente.servidor !== SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO;
    // O outro diretório ligado é o de quem desenvolve contra um AD de verdade, e fica.
    if (deOutroServidor && existente.ligado) return { tipo: 'outro-diretorio' };
    let desligadoSubstituido: string | undefined;
    if (!existente || deOutroServidor) {
      const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
      const segredoId = rows[0]?.id ?? '';
      await tx.insert(segredos).values({
        id: segredoId,
        orgId,
        nome: SEGREDO_DO_DIRETORIO_DE_DESENVOLVIMENTO,
        nomeNormalizado: normalizarTexto(SEGREDO_DO_DIRETORIO_DE_DESENVOLVIMENTO),
        tipo: 'conta-administrativa',
        classificacao: 'equipamento',
        identificador: CONTA_DE_SERVICO_DE_DESENVOLVIMENTO.usuario,
        ...cifrarSegredo({ valor: CONTA_DE_SERVICO_DE_DESENVOLVIMENTO.senha }, chavesDoCofre, {
          orgId,
          segredoId,
        }),
      });
      const configuracao = {
        servidor: SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO,
        baseDn: BASE_DO_DIRETORIO_DE_DESENVOLVIMENTO,
        atributoDoUsuario: 'sAMAccountName',
        filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
        conferirCertificado: false,
        ligado: true,
      };
      // O desligado, como o de um teste antigo, dá lugar ao simulado: só cabe um por organização.
      const [gravado] = existente
        ? await tx
            .update(diretorios)
            .set({ segredoId, ...configuracao, acDoServidor: null, atualizadoEm: momento })
            .returning({ id: diretorios.id })
        : await tx
            .insert(diretorios)
            .values({ orgId, segredoId, ...configuracao, criadoEm: momento, atualizadoEm: momento })
            .returning({ id: diretorios.id });
      await registrarNaAuditoria(tx, {
        acao: 'diretorio.configurado',
        ator: ATOR,
        alvo: { tipo: 'diretorio', id: gravado?.id ?? null },
        antes: existente ? { servidor: existente.servidor, ligado: existente.ligado } : undefined,
        depois: {
          ...configuracao,
          contaDeServico: SEGREDO_DO_DIRETORIO_DE_DESENVOLVIMENTO,
          acDoServidor: 'sem a AC',
        },
        momento,
      });
      if (existente) desligadoSubstituido = existente.servidor;
      gravou = true;
    }
    const grupo = await garantirGrupoDosColaboradores(tx, orgId);
    if (grupo.mudou) gravou = true;
    const [mapeado] = await tx
      .select({ id: mapeamentosDoDiretorio.id })
      .from(mapeamentosDoDiretorio)
      .where(
        eq(mapeamentosDoDiretorio.grupoDnNormalizado, normalizarDn(GRUPO_DO_AD_DE_DESENVOLVIMENTO)),
      );
    if (!mapeado) {
      await tx.insert(mapeamentosDoDiretorio).values({
        orgId,
        grupoDn: GRUPO_DO_AD_DE_DESENVOLVIMENTO,
        grupoDnNormalizado: normalizarDn(GRUPO_DO_AD_DE_DESENVOLVIMENTO),
        grupoId: grupo.id,
      });
      gravou = true;
    }
    const [local] = await tx
      .select({ id: contas.id })
      .from(contas)
      .where(and(eq(contas.usuario, usuarioDoWindows), eq(contas.origem, 'local')));
    const contaLocal = local !== undefined;
    if (!gravou) return { tipo: 'mantido', contaLocal };
    return desligadoSubstituido
      ? { tipo: 'gravado', desligadoSubstituido, contaLocal }
      : { tipo: 'gravado', contaLocal };
  });
}

/**
 * O grupo "Colaboradores" com o perfil "Colaborador da aba", cada peça garantida por si: o perfil
 * pelo nome, com as permissões que faltam acrescentadas; o grupo pelo nome; e a atribuição em vigor
 * do perfil ao grupo, na organização inteira.
 */
async function garantirGrupoDosColaboradores(
  tx: Transacao,
  orgId: string,
): Promise<{ id: string; mudou: boolean }> {
  let mudou = false;
  const nomeDoPerfil = normalizarTexto(PERFIL_DA_ABA_DE_DESENVOLVIMENTO);
  let [perfil] = await tx
    .select({ id: perfis.id, permissoes: perfis.permissoes })
    .from(perfis)
    .where(eq(perfis.nomeNormalizado, nomeDoPerfil));
  if (!perfil) {
    [perfil] = await tx
      .insert(perfis)
      .values({
        orgId,
        nome: PERFIL_DA_ABA_DE_DESENVOLVIMENTO,
        nomeNormalizado: nomeDoPerfil,
        permissoes: [...PERMISSOES_DA_ABA_DE_DESENVOLVIMENTO],
      })
      .returning({ id: perfis.id, permissoes: perfis.permissoes });
    mudou = true;
  } else {
    const faltam = PERMISSOES_DA_ABA_DE_DESENVOLVIMENTO.filter(
      (permissao) => !perfil?.permissoes.includes(permissao),
    );
    if (faltam.length > 0) {
      await tx
        .update(perfis)
        .set({ permissoes: [...perfil.permissoes, ...faltam] })
        .where(eq(perfis.id, perfil.id));
      mudou = true;
    }
  }
  if (!perfil) throw new Error('O perfil da aba não foi gravado.');

  const nomeDoGrupo = normalizarTexto(NOME_DO_GRUPO_DE_DESENVOLVIMENTO);
  let [grupo] = await tx
    .select({ id: grupos.id })
    .from(grupos)
    .where(eq(grupos.nomeNormalizado, nomeDoGrupo));
  if (!grupo) {
    [grupo] = await tx
      .insert(grupos)
      .values({ orgId, nome: NOME_DO_GRUPO_DE_DESENVOLVIMENTO, nomeNormalizado: nomeDoGrupo })
      .returning({ id: grupos.id });
    mudou = true;
  }
  if (!grupo) throw new Error('O grupo dos colaboradores não foi gravado.');

  const [emVigor] = await tx
    .select({ id: atribuicoes.id })
    .from(atribuicoes)
    .where(
      and(
        eq(atribuicoes.perfilId, perfil.id),
        eq(atribuicoes.grupoId, grupo.id),
        isNull(atribuicoes.localId),
        isNull(atribuicoes.encerradaEm),
      ),
    );
  if (!emVigor) {
    await tx.insert(atribuicoes).values({ orgId, perfilId: perfil.id, grupoId: grupo.id });
    mudou = true;
  }
  return { id: grupo.id, mudou };
}
