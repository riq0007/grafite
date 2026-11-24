// `pnpm grafite aba …` (spec aba-dos-colaboradores, "Comando da aba no servidor"; design, decisão
// 11): a chave da aba, a configuração e os aparelhos da organização do endereço, para quem opera o
// servidor. A chave só aparece uma vez e só o hash fica no banco. O aparelho é escolhido pelo nome
// ou pelo identificador curto; com o nome repetido, o comando recusa e lista os identificadores.
// Os eventos às abas e o fim das sessões no bloqueio e na troca da entrada vêm nas tarefas 3.7 e 3.8.
import { randomBytes } from 'node:crypto';
import {
  aparelhosDaAba,
  type Banco,
  chavesDaAba,
  configuracoesDaAba,
  ENTRADAS_DA_ABA,
  FORMAS_DA_ABA,
  naOrganizacao,
  type Transacao,
} from '@grafite/db';
import { lerIdentificadorCurto } from '@grafite/domain';
import { asc, eq, sql } from 'drizzle-orm';
import { organizacaoDoEndereco } from '../acesso/organizacao.ts';
import { hashDoToken } from '../acesso/sessoes.ts';
import { type Ator, registrarNaAuditoria } from '../auditoria.ts';
import { ErroDoComando } from './erros.ts';

export type FormaDaAba = (typeof FORMAS_DA_ABA)[number];
export type EntradaDaAba = (typeof ENTRADAS_DA_ABA)[number];

const TETO_MAXIMO = 500;
const UM_DIA = 24 * 60 * 60 * 1000;

const ator = (acao: string): Ator => ({
  tipo: 'sistema',
  descricao: `comando no servidor: aba ${acao}`,
});

async function naOrganizacaoDoEndereco<T>(
  banco: Banco,
  endereco: string,
  fazer: (tx: Transacao) => Promise<T>,
): Promise<T> {
  const orgId = await organizacaoDoEndereco(banco, endereco);
  if (!orgId) throw new ErroDoComando(1, `Nenhuma organização tem o endereço ${endereco}.`);
  return naOrganizacao(banco, orgId, fazer);
}

/** A chave nova: 32 bytes aleatórios em base64url. */
export const novaChaveDaAba = () => randomBytes(32).toString('base64url');

/** O exemplo da instalação pelo Intune, com as propriedades do MSI. */
export function exemploDoMsi(endereco: string, chave: string): string {
  return `msiexec /i Grafite-Aba.msi GRAFITE_SERVIDOR=https://${endereco} GRAFITE_CHAVE=${chave} GRAFITE_ENTRADA=windows /qn`;
}

/** `aba chave criar` e `aba chave trocar`: grava o hash e devolve a chave, que só aparece aqui. */
export async function gravarChaveDaAba(
  banco: Banco,
  agora: () => Date,
  { endereco, trocar }: { endereco: string; trocar: boolean },
): Promise<string> {
  return naOrganizacaoDoEndereco(banco, endereco, async (tx) => {
    const momento = agora();
    const chave = novaChaveDaAba();
    const [atual] = await tx.select({ id: chavesDaAba.id }).from(chavesDaAba);
    if (!trocar && atual) {
      throw new ErroDoComando(
        1,
        'Esta organização já tem a chave da aba. Para outra, use: grafite aba chave trocar.',
      );
    }
    if (trocar && !atual) {
      throw new ErroDoComando(
        1,
        'Esta organização ainda não tem a chave da aba. Crie com: grafite aba chave criar.',
      );
    }
    let id: string;
    if (atual) {
      await tx
        .update(chavesDaAba)
        .set({ hash: hashDoToken(chave), trocadaEm: momento })
        .where(eq(chavesDaAba.id, atual.id));
      id = atual.id;
    } else {
      const [criada] = await tx
        .insert(chavesDaAba)
        .values({ orgId: sql`app.current_org()`, hash: hashDoToken(chave), criadaEm: momento })
        .returning({ id: chavesDaAba.id });
      if (!criada) throw new Error('A chave da aba não foi gravada.');
      id = criada.id;
    }
    await registrarNaAuditoria(tx, {
      acao: trocar ? 'chave-da-aba.trocada' : 'chave-da-aba.criada',
      ator: ator(trocar ? 'chave trocar' : 'chave criar'),
      alvo: { tipo: 'chave-da-aba', id },
      momento,
    });
    return chave;
  });
}

export interface ConfiguracaoPeloComando {
  forma?: FormaDaAba;
  /** O contato novo; `null` o tira. */
  contato?: string | null;
}

/** `aba configurar`: a forma e o contato, com a versão somada; cria a linha se faltar. */
export async function configurarAba(
  banco: Banco,
  agora: () => Date,
  { endereco, ...mudanca }: ConfiguracaoPeloComando & { endereco: string },
): Promise<{ forma: FormaDaAba; contato: string | null; versao: number }> {
  return naOrganizacaoDoEndereco(banco, endereco, async (tx) => {
    const momento = agora();
    const [antes] = await tx
      .select({
        id: configuracoesDaAba.id,
        forma: configuracoesDaAba.forma,
        contato: configuracoesDaAba.contato,
        versao: configuracoesDaAba.versao,
      })
      .from(configuracoesDaAba);
    const forma = mudanca.forma ?? antes?.forma ?? 'pilula';
    const contato = mudanca.contato === undefined ? (antes?.contato ?? null) : mudanca.contato;
    const versao = (antes?.versao ?? 0) + 1;
    let id: string;
    if (antes) {
      await tx
        .update(configuracoesDaAba)
        .set({ forma, contato, versao, atualizadaEm: momento })
        .where(eq(configuracoesDaAba.id, antes.id));
      id = antes.id;
    } else {
      const [criada] = await tx
        .insert(configuracoesDaAba)
        .values({ orgId: sql`app.current_org()`, forma, contato, versao, atualizadaEm: momento })
        .returning({ id: configuracoesDaAba.id });
      if (!criada) throw new Error('A configuração da aba não foi gravada.');
      id = criada.id;
    }
    await registrarNaAuditoria(tx, {
      acao: 'aba.configurada',
      ator: ator('configurar'),
      alvo: { tipo: 'configuracao-da-aba', id },
      ...(antes ? { antes: { forma: antes.forma, contato: antes.contato } } : {}),
      depois: { forma, contato },
      momento,
    });
    return { forma, contato, versao };
  });
}

export interface AparelhoListado {
  identificadorCurto: string;
  nome: string;
  entrada: EntradaDaAba;
  tetoDeContas: number;
  versao: string | null;
  ultimoContatoEm: Date | null;
  bloqueado: boolean;
  /** Registrado (ou re-registrado) nas últimas 24 horas. */
  novo: boolean;
}

/** `aba aparelhos`: os aparelhos da organização, pelo nome. */
export async function listarAparelhos(
  banco: Banco,
  agora: () => Date,
  { endereco }: { endereco: string },
): Promise<AparelhoListado[]> {
  return naOrganizacaoDoEndereco(banco, endereco, async (tx) => {
    const desde = agora().getTime() - UM_DIA;
    const linhas = await tx
      .select()
      .from(aparelhosDaAba)
      .orderBy(asc(aparelhosDaAba.nome), asc(aparelhosDaAba.identificadorCurto));
    return linhas.map((a) => ({
      identificadorCurto: a.identificadorCurto,
      nome: a.nome,
      entrada: a.entrada,
      tetoDeContas: a.tetoDeContas,
      versao: a.versao,
      ultimoContatoEm: a.ultimoContatoEm,
      bloqueado: a.bloqueadoEm !== null,
      novo: a.tokenTrocadoEm.getTime() >= desde,
    }));
  });
}

type Aparelho = typeof aparelhosDaAba.$inferSelect;

/** O aparelho pelo identificador curto ou pelo nome; o nome repetido é recusado com a lista. */
export async function acharAparelho(tx: Transacao, quem: string): Promise<Aparelho> {
  const curto = lerIdentificadorCurto(quem);
  if (curto) {
    const [pelo] = await tx
      .select()
      .from(aparelhosDaAba)
      .where(eq(aparelhosDaAba.identificadorCurto, curto));
    if (pelo) return pelo;
  }
  const nome = quem.trim();
  const achados = await tx
    .select()
    .from(aparelhosDaAba)
    .where(sql`lower(${aparelhosDaAba.nome}) = lower(${nome})`)
    .orderBy(asc(aparelhosDaAba.registradoEm));
  const [unico, ...outros] = achados;
  if (!unico)
    throw new ErroDoComando(
      1,
      `Nenhum computador com a aba tem o nome ou o identificador ${nome}.`,
    );
  if (outros.length > 0) {
    const lista = achados
      .map((a) => `  ${a.identificadorCurto}  registrado em ${dataLocal(a.registradoEm)}`)
      .join('\n');
    throw new ErroDoComando(
      1,
      `Há ${achados.length} computadores com o nome ${unico.nome}. Escolha pelo identificador:\n${lista}`,
    );
  }
  return unico;
}

export type MudancaDoAparelho =
  | { tipo: 'entrada'; entrada: EntradaDaAba }
  | { tipo: 'teto'; teto: number }
  | { tipo: 'bloquear' }
  | { tipo: 'desbloquear' };

export type ResultadoDoAparelho = { nome: string; identificadorCurto: string; mudou: boolean };

/** `aba entrada`, `aba teto`, `aba bloquear` e `aba desbloquear` de um aparelho. */
export async function mudarAparelho(
  banco: Banco,
  agora: () => Date,
  {
    endereco,
    aparelho: quem,
    mudanca,
  }: { endereco: string; aparelho: string; mudanca: MudancaDoAparelho },
): Promise<ResultadoDoAparelho> {
  return naOrganizacaoDoEndereco(banco, endereco, async (tx) => {
    const momento = agora();
    const aparelho = await acharAparelho(tx, quem);
    const resultado = (mudou: boolean) => ({
      nome: aparelho.nome,
      identificadorCurto: aparelho.identificadorCurto,
      mudou,
    });
    const alvo = { tipo: 'aparelho-da-aba', id: aparelho.id };
    switch (mudanca.tipo) {
      case 'entrada': {
        if (aparelho.entrada === mudanca.entrada) return resultado(false);
        await tx
          .update(aparelhosDaAba)
          .set({ entrada: mudanca.entrada })
          .where(eq(aparelhosDaAba.id, aparelho.id));
        await registrarNaAuditoria(tx, {
          acao: 'entrada-do-aparelho.trocada',
          ator: ator('entrada'),
          alvo,
          antes: { entrada: aparelho.entrada },
          depois: { entrada: mudanca.entrada },
          momento,
        });
        return resultado(true);
      }
      case 'teto': {
        if (aparelho.tetoDeContas === mudanca.teto) return resultado(false);
        await tx
          .update(aparelhosDaAba)
          .set({ tetoDeContas: mudanca.teto })
          .where(eq(aparelhosDaAba.id, aparelho.id));
        await registrarNaAuditoria(tx, {
          acao: 'teto-do-aparelho.trocado',
          ator: ator('teto'),
          alvo,
          antes: { tetoDeContas: aparelho.tetoDeContas },
          depois: { tetoDeContas: mudanca.teto },
          momento,
        });
        return resultado(true);
      }
      case 'bloquear':
      case 'desbloquear': {
        const bloquear = mudanca.tipo === 'bloquear';
        if ((aparelho.bloqueadoEm !== null) === bloquear) return resultado(false);
        await tx
          .update(aparelhosDaAba)
          .set({ bloqueadoEm: bloquear ? momento : null })
          .where(eq(aparelhosDaAba.id, aparelho.id));
        await registrarNaAuditoria(tx, {
          acao: bloquear ? 'aparelho-da-aba.bloqueado' : 'aparelho-da-aba.desbloqueado',
          ator: ator(mudanca.tipo),
          alvo,
          momento,
        });
        return resultado(true);
      }
    }
  });
}

/** A data e a hora no fuso do servidor, para a saída do comando. */
export function dataLocal(momento: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    momento,
  );
}

export function lerForma(texto: string): FormaDaAba {
  const forma = texto.trim().toLowerCase();
  if (!(FORMAS_DA_ABA as readonly string[]).includes(forma)) {
    throw new ErroDoComando(2, `--forma: use ${FORMAS_DA_ABA.join(' ou ')}.`);
  }
  return forma as FormaDaAba;
}

export function lerEntrada(texto: string | undefined): EntradaDaAba {
  const entrada = texto?.trim().toLowerCase() ?? '';
  if (!(ENTRADAS_DA_ABA as readonly string[]).includes(entrada)) {
    throw new ErroDoComando(2, `A entrada é ${ENTRADAS_DA_ABA.join(' ou ')}.`);
  }
  return entrada as EntradaDaAba;
}

export function lerTeto(texto: string | undefined): number {
  const teto = Number(texto?.trim());
  if (!Number.isInteger(teto) || teto < 1 || teto > TETO_MAXIMO) {
    throw new ErroDoComando(
      2,
      `O teto é um número inteiro de contas por dia, de 1 a ${TETO_MAXIMO}.`,
    );
  }
  return teto;
}

export function lerContato(texto: string): string {
  const contato = texto.trim();
  if (contato.length < 1 || contato.length > 80) {
    throw new ErroDoComando(
      2,
      '--contato: use de 1 a 80 caracteres, como "Ramal 2000, das 8h às 18h".',
    );
  }
  return contato;
}
