// O estado da instalação (design do F2d, decisão 2): o `operacao.json` na raiz, com a plataforma, as
// versões, os endereços, as portas e o modo do certificado de cada ambiente. Sem segredos: as senhas
// ficam só nos config.env, com o acesso restrito. É gravado por inteiro numa cópia e renomeado, então
// uma queda no meio nunca deixa o arquivo pela metade. A instalação de antes da plataforma (change
// servidor-linux-com-docker, design, decisão 1) é a do Windows.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { PLATAFORMAS } from './layout.ts';

export const AMBIENTES_INSTALADOS = ['producao', 'teste'] as const;
export type AmbienteInstalado = (typeof AMBIENTES_INSTALADOS)[number];

const Versao = z.string().regex(/^\d+\.\d+\.\d+$/);

const DadosDoAmbiente = z.object({
  /** Os endereços de acesso, como grafite.empresa.local. */
  enderecos: z.array(z.string().min(1)),
  /** A porta do app, que atende só em 127.0.0.1. */
  porta: z.number().int().min(1).max(65535),
  /** A versão em uso, para onde a junção `atual` aponta. */
  atual: Versao.nullable(),
  /** A versão de antes da última atualização, para a volta. */
  anterior: Versao.nullable(),
});

/** O modo do certificado do proxy (design do F2d, decisão 9). */
export const Certificado = z.union([
  /** Let's Encrypt pelo desafio de DNS; o token do DNS fica só na configuração do proxy. */
  z.object({
    modo: z.literal('publico'),
    email: z.string().min(1),
    provedorDns: z.literal('cloudflare'),
  }),
  z.object({
    modo: z.literal('interno'),
    ac: z.literal('caddy'),
  }),
  z.object({
    modo: z.literal('interno'),
    ac: z.literal('empresa'),
    certificado: z.string().min(1),
    chave: z.string().min(1),
  }),
]);

const EstadoDaInstalacao = z.object({
  raiz: z.string().min(1),
  /** O sistema do servidor; o estado de antes do Linux não a tem e é o do Windows. */
  plataforma: z.enum(PLATAFORMAS).default('windows'),
  ambientes: z.object({ producao: DadosDoAmbiente, teste: DadosDoAmbiente }),
  /** Cada endereço da produção e o do teste que o substitui na cópia da produção. */
  mapaDoTeste: z.record(z.string(), z.string()),
  certificado: Certificado,
  /** As versões desempacotadas em `versoes\`. */
  versoes: z.array(Versao),
  /** A pasta dos binários do PostgreSQL 18. */
  pgBin: z.string().min(1),
});

export type EstadoDaInstalacao = z.infer<typeof EstadoDaInstalacao>;
export type DadosDoAmbiente = z.infer<typeof DadosDoAmbiente>;
export type CertificadoDaInstalacao = z.infer<typeof Certificado>;

const ARQUIVO = 'operacao.json';

/** O estado da instalação na raiz, ou `null` quando ela ainda não foi instalada. */
export async function lerEstado(raiz: string): Promise<EstadoDaInstalacao | null> {
  let texto: string;
  try {
    texto = await readFile(join(raiz, ARQUIVO), 'utf8');
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw erro;
  }
  let conteudo: unknown;
  try {
    conteudo = JSON.parse(texto);
  } catch {
    conteudo = null;
  }
  const lido = EstadoDaInstalacao.safeParse(conteudo);
  if (!lido.success) {
    throw new Error(
      `O ${ARQUIVO} de ${raiz} não é válido; confira o arquivo ou refaça a instalação.`,
    );
  }
  return lido.data;
}

export async function gravarEstado(estado: EstadoDaInstalacao): Promise<void> {
  const conferido = EstadoDaInstalacao.parse(estado);
  const destino = join(estado.raiz, ARQUIVO);
  const copia = `${destino}.gravando`;
  await writeFile(copia, `${JSON.stringify(conferido, null, 2)}\n`);
  await rename(copia, destino);
}
