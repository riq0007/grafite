// As respostas da instalação (design do F2d, decisão 6): os endereços, o modo do certificado, os
// destinos e a janela do backup e a organização que opera o servidor. Elas são perguntadas no
// console ou lidas de um arquivo, para o roteiro automático do CI, que traz também os segredos que
// seriam digitados. Até a instalação terminar, ficam em `instalacao.json` na raiz, sem os segredos,
// para a retomada de uma instalação interrompida não perguntar de novo.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { normalizarUsuario, validarUsuario } from '@grafite/domain';
import { z } from 'zod';
import type { CertificadoDaInstalacao } from './estado.ts';
import type { PastasDaInstalacao, Plataforma } from './layout.ts';
import type { Console } from './windows/console.ts';

export const ENDERECO =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const HORA = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
const JANELA = new RegExp(`^(${HORA})-(${HORA})$`);

const obrigatorio = { error: 'obrigatório' };

const Caminho = z
  .string(obrigatorio)
  .trim()
  .refine((caminho) => caminho !== '' && isAbsolute(caminho), {
    error: 'deve ser um caminho absoluto, como C:\\Grafite',
  });

const Endereco = z
  .string(obrigatorio)
  .trim()
  .toLowerCase()
  .regex(ENDERECO, { error: 'deve ser um endereço como grafite.empresa.com.br' });

const Janela = z
  .string(obrigatorio)
  .regex(JANELA, { error: 'deve ser HH:MM-HH:MM, como 00:00-06:00' })
  .refine(
    (janela) => {
      const [, inicio = '', fim = ''] = JANELA.exec(janela) ?? [];
      return inicio < fim;
    },
    { error: 'o início deve vir antes do fim' },
  );

const Usuario = z
  .string(obrigatorio)
  .superRefine((usuario, contexto) => {
    const motivo = validarUsuario(usuario);
    if (motivo) contexto.addIssue({ code: 'custom', message: motivo });
  })
  .transform(normalizarUsuario);

const Texto = z.string(obrigatorio).trim().min(1, obrigatorio);

const CertificadoDasRespostas = z.discriminatedUnion(
  'modo',
  [
    z.object({
      modo: z.literal('publico'),
      email: z.string(obrigatorio).trim().includes('@', { error: 'deve ser um e-mail' }),
      provedorDns: z.literal('cloudflare').default('cloudflare'),
    }),
    z
      .object({
        modo: z.literal('interno'),
        ac: z.enum(['caddy', 'empresa'], { error: 'deve ser caddy ou empresa' }).default('caddy'),
        certificado: Caminho.optional(),
        chave: Caminho.optional(),
      })
      .superRefine(({ ac, certificado, chave }, contexto) => {
        if (ac === 'empresa' && (certificado === undefined || chave === undefined)) {
          contexto.addIssue({
            code: 'custom',
            message: 'com a AC da empresa, diga os arquivos do certificado e da chave',
          });
        }
      }),
  ],
  { error: 'deve ter o modo publico ou interno' },
);

const campos = {
  raiz: Caminho,
  /** A pasta dos binários do PostgreSQL 18. */
  pgBin: Caminho,
  /** Os endereços de acesso da produção; o primeiro é o da organização que opera o servidor. */
  enderecos: z
    .array(Endereco, { error: 'deve ser uma lista de endereços' })
    .min(1, { error: 'diga ao menos um endereço' }),
  /** O endereço do teste no lugar de cada endereço da produção. */
  mapaDoTeste: z.record(z.string(), Endereco, { error: 'deve ligar cada endereço ao do teste' }),
  certificado: CertificadoDasRespostas,
  backup: z.object(
    {
      destinos: z
        .array(Caminho, { error: 'deve ser uma lista de pastas' })
        .min(1, { error: 'diga ao menos um destino' }),
      janela: Janela,
    },
    { error: 'obrigatório' },
  ),
  organizacao: z.object(
    {
      nome: Texto,
      pessoa: Texto,
      usuario: Usuario,
      email: z
        .string()
        .trim()
        .optional()
        .transform((email) => (email === '' ? undefined : email))
        .refine((email) => email === undefined || email.includes('@'), {
          error: 'deve ser um e-mail',
        }),
    },
    { error: 'obrigatório' },
  ),
};

type Lidas = z.output<z.ZodObject<typeof campos>>;

/** O mapa do teste liga cada endereço da produção a um endereço só do teste. */
function conferirMapa({ enderecos, mapaDoTeste }: Lidas, contexto: z.RefinementCtx) {
  const validos = enderecos.filter((endereco) => ENDERECO.test(endereco));
  const problema = (endereco: string, message: string) =>
    contexto.addIssue({ code: 'custom', path: ['mapaDoTeste', endereco], message });
  const vistos = new Set<string>();
  for (const endereco of validos) {
    const doTeste = mapaDoTeste[endereco];
    if (doTeste === undefined) problema(endereco, 'falta o endereço do teste no lugar dele');
    else if (validos.includes(doTeste)) {
      problema(endereco, 'o endereço do teste não pode ser um da produção');
    } else if (vistos.has(doTeste)) problema(endereco, 'o endereço do teste já é de outro');
    else vistos.add(doTeste);
  }
  for (const endereco of Object.keys(mapaDoTeste)) {
    if (!validos.includes(endereco)) problema(endereco, 'não é um endereço da produção');
  }
}

const EsquemaDasRespostas = z.object(campos).superRefine(conferirMapa);
const EsquemaDoArquivo = z
  .object({
    ...campos,
    /** A senha do postgres da produção, que seria digitada. */
    senhaDoPostgres: z.string().min(1).optional(),
    /** O token da Cloudflare, no modo público, que seria digitado. */
    tokenDaCloudflare: z.string().min(1).optional(),
  })
  .superRefine(conferirMapa);

export interface RespostasDaInstalacao {
  raiz: string;
  /**
   * O sistema do servidor; sem ela, o Windows. No Linux (change servidor-linux-com-docker, design,
   * decisão 12), a instalação a dá, com o pgBin das imagens, sem perguntar.
   */
  plataforma?: Plataforma;
  pgBin: string;
  /** O fuso do servidor no Linux, como America/Sao_Paulo, que os contêineres seguem. */
  fuso?: string;
  enderecos: string[];
  mapaDoTeste: Record<string, string>;
  certificado: CertificadoDaInstalacao;
  backup: { destinos: string[]; janela: string };
  organizacao: { nome: string; pessoa: string; usuario: string; email?: string };
}

/** As respostas lidas no formato do estado da instalação. */
function respostasDe(lidas: Lidas): RespostasDaInstalacao {
  const { certificado } = lidas;
  const organizacao = { ...lidas.organizacao };
  if (organizacao.email === undefined) delete organizacao.email;
  return {
    raiz: lidas.raiz,
    pgBin: lidas.pgBin,
    enderecos: lidas.enderecos,
    mapaDoTeste: lidas.mapaDoTeste,
    certificado:
      certificado.modo === 'publico'
        ? certificado
        : certificado.ac === 'empresa'
          ? {
              modo: 'interno',
              ac: 'empresa',
              certificado: certificado.certificado ?? '',
              chave: certificado.chave ?? '',
            }
          : { modo: 'interno', ac: 'caddy' },
    backup: lidas.backup,
    organizacao,
  };
}

const problemas = (erro: z.ZodError) =>
  erro.issues.map(({ path, message }) => `  - ${path.join('.')}: ${message}`).join('\n');

async function lerJson(caminho: string, descricao: string): Promise<unknown> {
  const texto = await readFile(caminho, 'utf8').catch(() => {
    throw new Error(`${descricao} ${caminho} não existe.`);
  });
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`${descricao} ${caminho} não é um JSON válido.`);
  }
}

export interface ArquivoDeRespostas {
  respostas: RespostasDaInstalacao;
  senhaDoPostgres?: string;
  tokenDaCloudflare?: string;
}

/**
 * As respostas e os segredos do arquivo do roteiro automático, conferidos. No Linux (change
 * servidor-linux-com-docker, design, decisão 12), a pasta e o pgBin vêm da plataforma, e o arquivo
 * não os precisa dizer.
 */
export async function lerArquivoDeRespostas(
  caminho: string,
  daPlataforma?: { raiz: string; pgBin: string },
): Promise<ArquivoDeRespostas> {
  const conteudo = await lerJson(caminho, 'O arquivo de respostas');
  const lido = EsquemaDoArquivo.safeParse(
    daPlataforma !== undefined && typeof conteudo === 'object' && conteudo !== null
      ? { ...conteudo, ...daPlataforma }
      : conteudo,
  );
  if (!lido.success) {
    throw new Error(`O arquivo de respostas ${caminho} não é válido:\n${problemas(lido.error)}`);
  }
  const { senhaDoPostgres, tokenDaCloudflare, ...lidas } = lido.data;
  return { respostas: respostasDe(lidas), senhaDoPostgres, tokenDaCloudflare };
}

/** Guarda as respostas, sem segredos, até a instalação terminar. */
export async function salvarRespostas(
  pastas: Pick<PastasDaInstalacao, 'instalacao'>,
  respostas: RespostasDaInstalacao,
): Promise<void> {
  await mkdir(dirname(pastas.instalacao), { recursive: true });
  await writeFile(pastas.instalacao, `${JSON.stringify(respostas, null, 2)}\n`);
}

/** As respostas de uma instalação interrompida, ou `null` sem ela. */
export async function lerRespostasSalvas(
  pastas: Pick<PastasDaInstalacao, 'instalacao'>,
): Promise<RespostasDaInstalacao | null> {
  let texto: string;
  try {
    texto = await readFile(pastas.instalacao, 'utf8');
  } catch {
    return null;
  }
  let conteudo: unknown;
  try {
    conteudo = JSON.parse(texto);
  } catch {
    conteudo = null;
  }
  const lido = EsquemaDasRespostas.safeParse(conteudo);
  if (!lido.success) {
    throw new Error(
      `As respostas da instalação interrompida, em ${pastas.instalacao}, não são válidas: apague o arquivo para responder de novo.`,
    );
  }
  return respostasDe(lido.data);
}

const TENTATIVAS = 3;

/** Pergunta até a resposta servir, dizendo o motivo de cada recusa; desiste na terceira. */
async function perguntarAte<T>(
  console: Console,
  pergunta: string,
  padrao: string | undefined,
  esquema: z.ZodType<T>,
  preparar: (resposta: string) => unknown = (resposta) => resposta,
): Promise<T> {
  for (let tentativa = 1; ; tentativa += 1) {
    const lido = esquema.safeParse(preparar(await console.perguntar(pergunta, padrao)));
    if (lido.success) return lido.data;
    const motivo = lido.error.issues[0]?.message ?? 'não serve';
    if (tentativa === TENTATIVAS) throw new Error(`${pergunta}: ${motivo}`);
    console.escrever(motivo);
  }
}

/** Pergunta uma pasta, que deve ser um caminho absoluto. */
export function perguntarPasta(
  console: Console,
  pergunta: string,
  padrao: string,
): Promise<string> {
  return perguntarAte(console, pergunta, padrao, Caminho);
}

const lista = (separador: string) => (resposta: string) =>
  resposta
    .split(separador)
    .map((item) => item.trim())
    .filter((item) => item !== '');

/** O endereço do teste sugerido: `-teste` depois do primeiro nome, como grafite-teste.empresa. */
export function sugestaoDoTeste(endereco: string): string {
  const [primeiro, ...resto] = endereco.split('.');
  return [`${primeiro}-teste`, ...resto].join('.');
}

/** Pergunta o que falta depois da pasta e do PostgreSQL: os endereços, o certificado, o backup e a organização. */
export async function perguntarRespostas(
  console: Console,
  { raiz, pgBin }: { raiz: string; pgBin: string },
): Promise<{ respostas: RespostasDaInstalacao; tokenDaCloudflare?: string }> {
  const enderecos = await perguntarAte(
    console,
    'Endereços de acesso da produção, separados por vírgula (como grafite.empresa.com.br)',
    undefined,
    campos.enderecos,
    lista(','),
  );
  const mapaDoTeste: Record<string, string> = {};
  for (const endereco of enderecos) {
    mapaDoTeste[endereco] = await perguntarAte(
      console,
      `Endereço do teste no lugar de ${endereco}`,
      sugestaoDoTeste(endereco),
      Endereco.refine((doTeste) => !enderecos.includes(doTeste), {
        error: 'o endereço do teste não pode ser um da produção',
      }),
    );
  }

  const modo = await perguntarAte(
    console,
    "Certificado: publico (Let's Encrypt, com o DNS na Cloudflare) ou interno",
    'interno',
    z.enum(['publico', 'interno'], { error: 'responda publico ou interno' }),
    (resposta) => resposta.toLowerCase(),
  );
  let certificado: CertificadoDaInstalacao;
  let tokenDaCloudflare: string | undefined;
  if (modo === 'publico') {
    const email = await perguntarAte(
      console,
      "E-mail para os avisos do Let's Encrypt",
      undefined,
      z.string().trim().includes('@', { error: 'deve ser um e-mail' }),
    );
    certificado = { modo: 'publico', email, provedorDns: 'cloudflare' };
    tokenDaCloudflare = await console.perguntarSegredo(
      'Token da Cloudflare, com permissão de editar o DNS só da zona',
    );
  } else {
    const ac = await perguntarAte(
      console,
      'AC do certificado interno: caddy (a do próprio proxy) ou empresa (arquivos da AC da empresa)',
      'caddy',
      z.enum(['caddy', 'empresa'], { error: 'responda caddy ou empresa' }),
      (resposta) => resposta.toLowerCase(),
    );
    certificado =
      ac === 'caddy'
        ? { modo: 'interno', ac }
        : {
            modo: 'interno',
            ac,
            certificado: await perguntarAte(
              console,
              'Arquivo do certificado (PEM, com a cadeia)',
              undefined,
              Caminho,
            ),
            chave: await perguntarAte(console, 'Arquivo da chave (PEM)', undefined, Caminho),
          };
  }

  const destinos = await perguntarAte(
    console,
    'Destinos do backup, separados por ponto e vírgula',
    join(raiz, 'backups'),
    campos.backup.shape.destinos,
    lista(';'),
  );
  const janela = await perguntarAte(console, 'Janela do horário do backup', '00:00-06:00', Janela);

  const nome = await perguntarAte(
    console,
    'Nome da organização que opera o servidor',
    undefined,
    Texto,
  );
  const pessoa = await perguntarAte(console, 'Nome da pessoa da primeira conta', undefined, Texto);
  const usuario = await perguntarAte(console, 'Usuário da primeira conta', undefined, Usuario);
  const email = await perguntarAte(
    console,
    'E-mail da pessoa (opcional)',
    undefined,
    campos.organizacao.shape.email,
  );

  return {
    respostas: {
      raiz,
      pgBin,
      enderecos,
      mapaDoTeste,
      certificado,
      backup: { destinos, janela },
      organizacao:
        email === undefined ? { nome, pessoa, usuario } : { nome, pessoa, usuario, email },
    },
    tokenDaCloudflare,
  };
}
