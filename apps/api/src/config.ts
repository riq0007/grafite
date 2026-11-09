import { createECDH } from 'node:crypto';
import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import {
  AMBIENTES,
  type Ambiente,
  conferirChavePrivadaDoPush,
  conferirChavePublicaDoPush,
  conferirContatoDoPush,
  conferirEnderecoDoSmtp,
  conferirRemetente,
  type Retencao,
} from '@grafite/domain';
import { z } from 'zod';
import { normalizarEndereco } from './acesso/organizacao.ts';
import type { ChavesDoCofre } from './cofre/cifra.ts';

/** Configuração inválida: lista todas as variáveis com problema, na ordem do esquema. */
export class ErroDeConfiguracao extends Error {
  variaveis: string[];

  constructor(variaveis: string[], detalhes: string[]) {
    super(`Configuração inválida da API:\n${detalhes.map((d) => `  - ${d}`).join('\n')}`);
    this.name = 'ErroDeConfiguracao';
    this.variaveis = variaveis;
  }
}

/** O backup do servidor (design do F2d, decisão 11): os limites que a tela de backup respeita. */
export interface ConfiguracaoDoBackup {
  /** As pastas de destino, absolutas, na ordem: o backup é montado na primeira. */
  destinos: string[];
  retencao: Retencao;
  /** A janela em que o horário do backup pode ficar, em `HH:MM`, no fuso do servidor. */
  janela: { inicio: string; fim: string };
  /** A frequência do teste de restauração. */
  teste: 'semanal' | 'diario';
  /** A conexão do papel do backup (grafite_backup). */
  urlBackup: string;
  /** A conexão do superusuário da instância do teste, onde o teste de restauração restaura. */
  urlRestauracao: string;
  /** A pasta dos binários do PostgreSQL 18 (pg_dump e pg_restore). */
  pastaPgBin: string;
  /**
   * Se cada destino precisa da marca da instalação, como no servidor Linux (change
   * servidor-linux-com-docker, design, decisão 11), onde o destino pode ser um ponto de montagem.
   */
  exigirMarca: boolean;
  /**
   * A pasta de dados da instância do teste, vista do app, cujo disco dá o espaço livre do teste de
   * restauração: no Linux, a do servidor, montada só para ler.
   */
  pastaDaRestauracao?: string;
}

/** O e-mail (change p3c-email-e-push, design, decisão 10): o SMTP, com a senha, e o remetente. */
export interface ConfiguracaoDoEmail {
  urlSmtp: string;
  remetente: string;
}

/** O push: o par das chaves VAPID, em base64url, e o contato do servidor para os serviços de push. */
export interface ConfiguracaoDoPush {
  chavePublica: string;
  chavePrivada: string;
  contato: string;
}

export interface Configuracao {
  ambiente: Ambiente;
  urlBanco: string;
  porta: number;
  host: string;
  /** Pasta da web compilada, servida pela própria API (só em produção). */
  pastaDaWeb?: string;
  /** Pasta do armazenamento em disco das fotos e dos outros arquivos, já absoluta. */
  pastaDosArquivos: string;
  /** Chave AES-256 que cifra as chaves dos apps autenticadores (verificação em dois passos). */
  chaveDoisPassos: Buffer;
  /** A chave mestra do cofre e, só durante a troca dela, a anterior (design do P6, decisão 2). */
  chavesDoCofre: ChavesDoCofre;
  /** Os proxies cujo `X-Forwarded-For` vale, como endereços ou faixas CIDR. */
  proxiesConfiaveis: string[];
  /** O endereço de acesso da organização que opera o servidor, a única que vê o backup. */
  organizacaoOperadora?: string;
  backup?: ConfiguracaoDoBackup;
  /** O endereço cujo certificado a tarefa diária confere, como `grafite.empresa.local:443`. */
  certificadoVigiar?: string;
  /** O e-mail; sem ele, ou no ambiente de teste, não sai e-mail. */
  email?: ConfiguracaoDoEmail;
  /** O push; sem ele, ou no ambiente de teste, não sai push nem há inscrição de aparelho. */
  push?: ConfiguracaoDoPush;
  /** O e-mail ou o push configurados no ambiente de teste, que não os usa: a partida avisa. */
  canaisIgnoradosNoTeste?: true;
  /** A origem dos links dos e-mails no lugar do endereço da organização, como no desenvolvimento. */
  origemDosLinks?: string;
  /** As origens de serviços de push aceitas além das dos navegadores, como a falsa dos testes. */
  servicosDePushExtras?: string[];
}

/** Base64 de exatamente 32 bytes: 43 caracteres e um `=` de preenchimento. */
export const CHAVE_DE_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;
const HORA = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
const JANELA = new RegExp(`^(${HORA})-(${HORA})$`);
const ENDERECO = /^[a-z0-9.-]+$/;
const ENDERECO_COM_PORTA = /^[a-z0-9.-]+(?::[0-9]{1,5})?$/;

/** As variáveis do e-mail e as do push, cada grupo configurado inteiro ou nada. */
const DO_EMAIL = ['GRAFITE_SMTP_URL', 'GRAFITE_EMAIL_REMETENTE'] as const;
const DO_PUSH = [
  'GRAFITE_PUSH_CHAVE_PUBLICA',
  'GRAFITE_PUSH_CHAVE_PRIVADA',
  'GRAFITE_PUSH_CONTATO',
] as const;

/** Um texto conferido por uma regra do domínio, que devolve o motivo da recusa ou `null`. */
const conferidoPor = (conferir: (valor: string) => string | null) =>
  z.string().superRefine((valor, contexto) => {
    const motivo = conferir(valor);
    if (motivo !== null) contexto.addIssue({ code: 'custom', message: motivo });
  });

/** Uma origem `http://` ou `https://`, sem caminho, usuário, consulta nem fragmento. */
function origemValida(valor: string): boolean {
  try {
    const url = new URL(valor);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.hostname !== '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.username === ''
    );
  } catch {
    return false;
  }
}

/** Se a chave pública é a da privada, pela conta da curva P-256. */
function formamPar(publica: string, privada: string): boolean {
  try {
    const curva = createECDH('prime256v1');
    curva.setPrivateKey(Buffer.from(privada, 'base64url'));
    return curva.getPublicKey().equals(Buffer.from(publica, 'base64url'));
  } catch {
    return false;
  }
}

/** As variáveis que o backup pede juntas: sem uma delas, nenhuma vale. */
const DO_BACKUP = [
  'GRAFITE_BACKUP_DESTINOS',
  'GRAFITE_BACKUP_URL',
  'GRAFITE_RESTAURACAO_URL',
  'GRAFITE_PG_BIN',
] as const;

const urlDoPostgres = (obrigatoria: string) =>
  z
    .string({ error: obrigatoria })
    .regex(/^postgres(ql)?:\/\//, { error: 'deve começar com postgres://' });

function faixaValida(item: string): boolean {
  const [endereco, prefixo, ...resto] = item.split('/');
  const versao = isIP(endereco ?? '');
  if (versao === 0 || resto.length > 0) return false;
  if (prefixo === undefined) return true;
  const bits = Number(prefixo);
  return /^\d+$/.test(prefixo) && bits <= (versao === 4 ? 32 : 128);
}

// Valores sensíveis não têm padrão; só os não sensíveis têm.
const esquema = z
  .object({
    GRAFITE_AMBIENTE: z.enum(AMBIENTES, {
      error: (problema) =>
        problema.input === undefined
          ? 'obrigatório (desenvolvimento, teste ou producao)'
          : 'deve ser desenvolvimento, teste ou producao',
    }),
    GRAFITE_DATABASE_URL: urlDoPostgres('obrigatória (conexão do papel grafite_app)'),
    GRAFITE_API_PORTA: z.coerce
      .number({ error: 'deve ser um número' })
      .int({ error: 'deve ser inteira' })
      .min(1, { error: 'deve estar entre 1 e 65535' })
      .max(65535, { error: 'deve estar entre 1 e 65535' })
      .default(3000),
    GRAFITE_API_HOST: z.string().min(1, { error: 'não pode ser vazio' }).default('127.0.0.1'),
    GRAFITE_WEB_PASTA: z.string().min(1, { error: 'não pode ser vazia' }).optional(),
    GRAFITE_ARQUIVOS_PASTA: z
      .string({ error: 'obrigatória (pasta onde ficam as fotos e os outros arquivos)' })
      .min(1, { error: 'não pode ser vazia' }),
    GRAFITE_CHAVE_DOIS_PASSOS: z
      .string({
        error:
          "obrigatória (32 bytes em base64; gere com node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\")",
      })
      .regex(CHAVE_DE_32_BYTES, { error: 'deve ter 32 bytes em base64' }),
    GRAFITE_CHAVE_DO_COFRE: z
      .string({
        error:
          "obrigatória (a chave mestra do cofre, 32 bytes em base64; gere com node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64'))\")",
      })
      .regex(CHAVE_DE_32_BYTES, { error: 'deve ter 32 bytes em base64' }),
    GRAFITE_CHAVE_DO_COFRE_ANTERIOR: z
      .string()
      .regex(CHAVE_DE_32_BYTES, { error: 'deve ter 32 bytes em base64' })
      .optional(),
    GRAFITE_PROXIES_CONFIAVEIS: z
      .string()
      .default('127.0.0.1,::1')
      .transform((lista) => lista.split(',').map((item) => item.trim()))
      .refine((itens) => itens.every(faixaValida), {
        error:
          'deve ser uma lista de endereços IP ou faixas CIDR, separados por vírgula, como 127.0.0.1,::1',
      }),
    GRAFITE_ORGANIZACAO_OPERADORA: z
      .string()
      .transform(normalizarEndereco)
      .refine((endereco) => ENDERECO.test(endereco), {
        error: 'deve ser um endereço de acesso, como grafite.empresa.local',
      })
      .optional(),
    GRAFITE_BACKUP_DESTINOS: z
      .string()
      .transform((lista) => lista.split(';').map((item) => item.trim()))
      .refine((destinos) => destinos.every((destino) => destino !== '' && isAbsolute(destino)), {
        error: 'deve ter pastas absolutas, separadas por ponto e vírgula',
      })
      .transform((destinos) => destinos.map((destino) => resolve(destino)))
      .refine((destinos) => new Set(destinos).size === destinos.length, {
        error: 'o mesmo destino aparece duas vezes',
      })
      .optional(),
    GRAFITE_BACKUP_RETENCAO: z
      .string()
      .default('7,4,12')
      .refine((texto) => /^\d+,\d+,\d+$/.test(texto), {
        error: 'deve ter três inteiros não negativos: diários, semanais e mensais, como 7,4,12',
      })
      .transform((texto) => {
        const [diarios = 0, semanais = 0, mensais = 0] = texto.split(',').map(Number);
        return { diarios, semanais, mensais };
      }),
    GRAFITE_BACKUP_JANELA: z
      .string()
      .default('00:00-06:00')
      .refine((texto) => JANELA.test(texto), {
        error: 'deve ser HH:MM-HH:MM, como 00:00-06:00',
      })
      .transform((texto) => {
        const [, inicio = '', fim = ''] = JANELA.exec(texto) ?? [];
        return { inicio, fim };
      })
      .refine(({ inicio, fim }) => inicio < fim, { error: 'o início deve vir antes do fim' }),
    GRAFITE_BACKUP_TESTE: z
      .enum(['semanal', 'diario'], { error: 'deve ser semanal ou diario' })
      .default('semanal'),
    GRAFITE_BACKUP_URL: urlDoPostgres('obrigatória').optional(),
    GRAFITE_BACKUP_EXIGIR_MARCA: z
      .enum(['sim', 'nao'], { error: 'deve ser sim ou nao' })
      .optional(),
    GRAFITE_RESTAURACAO_URL: urlDoPostgres('obrigatória').optional(),
    GRAFITE_RESTAURACAO_PASTA: z
      .string()
      .refine((pasta) => isAbsolute(pasta), { error: 'deve ser uma pasta absoluta' })
      .optional(),
    GRAFITE_PG_BIN: z
      .string()
      .refine((pasta) => pasta !== '' && isAbsolute(pasta), {
        error: 'deve ser a pasta absoluta dos binários do PostgreSQL 18',
      })
      .optional(),
    GRAFITE_CERTIFICADO_VIGIAR: z
      .string()
      .refine((endereco) => ENDERECO_COM_PORTA.test(endereco), {
        error:
          'deve ser o endereço vigiado, como grafite.empresa.local ou grafite.empresa.local:443',
      })
      .optional(),
    GRAFITE_SMTP_URL: conferidoPor(conferirEnderecoDoSmtp).optional(),
    GRAFITE_EMAIL_REMETENTE: conferidoPor(conferirRemetente).optional(),
    GRAFITE_PUSH_CHAVE_PUBLICA: conferidoPor(conferirChavePublicaDoPush).optional(),
    GRAFITE_PUSH_CHAVE_PRIVADA: conferidoPor(conferirChavePrivadaDoPush).optional(),
    GRAFITE_PUSH_CONTATO: conferidoPor(conferirContatoDoPush).optional(),
    GRAFITE_ORIGEM_DOS_LINKS: z
      .string()
      .refine(origemValida, {
        error: 'deve ser uma origem http:// ou https://, sem caminho, como http://localhost:5173',
      })
      .transform((origem) => new URL(origem).origin)
      .optional(),
    GRAFITE_PUSH_SERVICOS_EXTRAS: z
      .string()
      .transform((lista) =>
        lista
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== ''),
      )
      .refine((origens) => origens.every(origemValida), {
        error:
          'deve ser uma lista de origens http:// ou https://, separadas por vírgula, como http://127.0.0.1:4380',
      })
      .transform((origens) => origens.map((origem) => new URL(origem).origin))
      .optional(),
  })
  .superRefine((env, contexto) => {
    const anterior = env.GRAFITE_CHAVE_DO_COFRE_ANTERIOR;
    if (
      anterior !== undefined &&
      Buffer.from(anterior, 'base64').equals(Buffer.from(env.GRAFITE_CHAVE_DO_COFRE, 'base64'))
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['GRAFITE_CHAVE_DO_COFRE_ANTERIOR'],
        message:
          'deve ser diferente de GRAFITE_CHAVE_DO_COFRE (a anterior só fica durante a troca da chave)',
      });
    }
    for (const [grupo, nomes] of [
      ['e-mail', DO_EMAIL],
      ['push', DO_PUSH],
    ] as const) {
      const dados = nomes.filter((nome) => env[nome] !== undefined);
      if (dados.length === 0 || dados.length === nomes.length) continue;
      for (const nome of nomes.filter((variavel) => env[variavel] === undefined)) {
        contexto.addIssue({
          code: 'custom',
          path: [nome],
          message: `obrigatório com o resto do ${grupo} (o ${grupo} é configurado inteiro ou nada)`,
        });
      }
    }
    const publica = env.GRAFITE_PUSH_CHAVE_PUBLICA;
    const privada = env.GRAFITE_PUSH_CHAVE_PRIVADA;
    if (
      publica !== undefined &&
      privada !== undefined &&
      conferirChavePublicaDoPush(publica) === null &&
      conferirChavePrivadaDoPush(privada) === null &&
      !formamPar(publica, privada)
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['GRAFITE_PUSH_CHAVE_PUBLICA'],
        message: 'não forma par com GRAFITE_PUSH_CHAVE_PRIVADA',
      });
    }
    const dadas = DO_BACKUP.filter((nome) => env[nome] !== undefined);
    if (dadas.length === 0 || dadas.length === DO_BACKUP.length) return;
    for (const nome of DO_BACKUP.filter((variavel) => env[variavel] === undefined)) {
      contexto.addIssue({
        code: 'custom',
        path: [nome],
        message: 'obrigatória com o resto do backup (o backup é configurado inteiro ou nada)',
      });
    }
  });

export function carregarConfiguracao(env: Record<string, string | undefined>): Configuracao {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const ordem = Object.keys(esquema.shape);
    const variaveis = [...new Set(resultado.error.issues.map((i) => String(i.path[0])))].sort(
      (a, b) => ordem.indexOf(a) - ordem.indexOf(b),
    );
    const detalhes = resultado.error.issues.map((i) => `${String(i.path[0])}: ${i.message}`);
    throw new ErroDeConfiguracao(variaveis, detalhes);
  }
  const dados = resultado.data;
  const email =
    dados.GRAFITE_SMTP_URL && dados.GRAFITE_EMAIL_REMETENTE
      ? { urlSmtp: dados.GRAFITE_SMTP_URL, remetente: dados.GRAFITE_EMAIL_REMETENTE }
      : undefined;
  const push =
    dados.GRAFITE_PUSH_CHAVE_PUBLICA &&
    dados.GRAFITE_PUSH_CHAVE_PRIVADA &&
    dados.GRAFITE_PUSH_CONTATO
      ? {
          chavePublica: dados.GRAFITE_PUSH_CHAVE_PUBLICA,
          chavePrivada: dados.GRAFITE_PUSH_CHAVE_PRIVADA,
          contato: dados.GRAFITE_PUSH_CONTATO,
        }
      : undefined;
  // O ambiente de teste tem a cópia das contas da produção: ele não avisa pessoas de verdade.
  const noTeste = dados.GRAFITE_AMBIENTE === 'teste';
  return {
    ambiente: dados.GRAFITE_AMBIENTE,
    urlBanco: dados.GRAFITE_DATABASE_URL,
    porta: dados.GRAFITE_API_PORTA,
    host: dados.GRAFITE_API_HOST,
    pastaDaWeb: dados.GRAFITE_WEB_PASTA,
    pastaDosArquivos: resolve(dados.GRAFITE_ARQUIVOS_PASTA),
    chaveDoisPassos: Buffer.from(dados.GRAFITE_CHAVE_DOIS_PASSOS, 'base64'),
    chavesDoCofre: {
      atual: Buffer.from(dados.GRAFITE_CHAVE_DO_COFRE, 'base64'),
      ...(dados.GRAFITE_CHAVE_DO_COFRE_ANTERIOR !== undefined && {
        anterior: Buffer.from(dados.GRAFITE_CHAVE_DO_COFRE_ANTERIOR, 'base64'),
      }),
    },
    proxiesConfiaveis: dados.GRAFITE_PROXIES_CONFIAVEIS,
    organizacaoOperadora: dados.GRAFITE_ORGANIZACAO_OPERADORA,
    backup:
      dados.GRAFITE_BACKUP_DESTINOS &&
      dados.GRAFITE_BACKUP_URL &&
      dados.GRAFITE_RESTAURACAO_URL &&
      dados.GRAFITE_PG_BIN
        ? {
            destinos: dados.GRAFITE_BACKUP_DESTINOS,
            retencao: dados.GRAFITE_BACKUP_RETENCAO,
            janela: dados.GRAFITE_BACKUP_JANELA,
            teste: dados.GRAFITE_BACKUP_TESTE,
            urlBackup: dados.GRAFITE_BACKUP_URL,
            urlRestauracao: dados.GRAFITE_RESTAURACAO_URL,
            pastaPgBin: dados.GRAFITE_PG_BIN,
            exigirMarca: dados.GRAFITE_BACKUP_EXIGIR_MARCA === 'sim',
            ...(dados.GRAFITE_RESTAURACAO_PASTA !== undefined && {
              pastaDaRestauracao: dados.GRAFITE_RESTAURACAO_PASTA,
            }),
          }
        : undefined,
    certificadoVigiar: dados.GRAFITE_CERTIFICADO_VIGIAR,
    email: noTeste ? undefined : email,
    push: noTeste ? undefined : push,
    ...(noTeste && (email || push) && { canaisIgnoradosNoTeste: true }),
    origemDosLinks: dados.GRAFITE_ORIGEM_DOS_LINKS,
    servicosDePushExtras: dados.GRAFITE_PUSH_SERVICOS_EXTRAS,
  };
}
