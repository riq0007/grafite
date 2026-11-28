// A conferência do MSI da aba (change aba-dos-colaboradores, design, decisão 12, e tarefa 6.2). O
// mesmo MSI vai a qualquer organização, e o servidor, a chave e a entrada chegam pela linha de
// comando do Intune: ele não leva endereço, chave nem token. A conferência extrai o MSI pela
// instalação administrativa (`msiexec /a`), que só copia os arquivos, e confere:
// - os arquivos: só o programa da aba e o serviço;
// - a tabela Property: sem o servidor, a chave e a entrada de fábrica;
// - o texto do MSI e dos arquivos, em UTF-8 e em UTF-16: sem endereço local com porta, como o do
//   `pnpm dev` e o da tela no `tauri dev`, e sem os valores do ambiente e do .env da raiz que são
//   servidor, chave, token ou senha.
// A saída diz só o nome do que achou, e nunca o valor.
// Uso: node apps/aba/scripts/conferir-msi.ts <Grafite-Aba.msi>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Procurado {
  /** O que a saída diz quando acha, sem o valor. */
  nome: string;
  padrao: RegExp;
}

/** O que o MSI instala, pelo caminho na extração. */
export const ARQUIVOS_ESPERADOS: readonly string[] = [
  'PFiles/Grafite Aba/grafite-aba-servico.exe',
  'PFiles/Grafite Aba/grafite-aba.exe',
];

/** As propriedades que só a linha de comando traz. */
export const PROPRIEDADES_DA_LINHA_DE_COMANDO: readonly string[] = [
  'GRAFITE_SERVIDOR',
  'GRAFITE_CHAVE',
  'GRAFITE_ENTRADA',
];

/** As variáveis cujo valor não pode ir no MSI: um servidor, uma chave, um token ou uma senha. */
const VARIAVEIS_SECRETAS = /^GRAFITE_\w*(SERVIDOR|ORIGEM|URL|CHAVE|TOKEN|SENHA|PASSWORD|SEGREDO)/;
/** Um valor curto acharia por acaso; os segredos e os endereços do .env são maiores. */
const MENOR_VALOR = 8;

const ENDERECO_LOCAL: Procurado = {
  nome: 'um endereço local com porta',
  padrao: /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/i,
};

const literal = (valor: string) => new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/** As linhas `NOME=valor` de um .env, sem os comentários e sem as aspas. */
export function lerDotenv(texto: string): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const linha of texto.split(/\r?\n/)) {
    const achado = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!achado?.[1] || linha.trimStart().startsWith('#')) continue;
    valores[achado[1]] = (achado[2] ?? '').replace(/^(['"])(.*)\1$/, '$2');
  }
  return valores;
}

/** O que procurar: o endereço local e cada valor secreto do ambiente e do .env, pelo nome dele. */
export function procurados(
  ambiente: Record<string, string | undefined>,
  dotenv: Record<string, string> = {},
): Procurado[] {
  const lista = [ENDERECO_LOCAL];
  const vistos = new Set<string>();
  const origens: [string, Record<string, string | undefined>][] = [
    ['do ambiente', ambiente],
    ['do .env', dotenv],
  ];
  for (const [origem, valores] of origens) {
    for (const [nome, valor] of Object.entries(valores)) {
      if (!VARIAVEIS_SECRETAS.test(nome) || !valor || valor.length < MENOR_VALOR) continue;
      if (vistos.has(valor)) continue;
      vistos.add(valor);
      lista.push({ nome: `o ${nome} ${origem}`, padrao: literal(valor) });
    }
  }
  return lista;
}

/** Os procurados achados no conteúdo, lido como texto de 8 bits e como UTF-16 nos dois alinhamentos. */
export function achados(conteudo: Buffer, lista: readonly Procurado[]): string[] {
  const textos = [
    conteudo.toString('latin1'),
    conteudo.toString('utf16le'),
    conteudo.subarray(1).toString('utf16le'),
  ];
  return lista
    .filter(({ padrao }) => textos.some((texto) => padrao.test(texto)))
    .map(({ nome }) => nome);
}

/** Os arquivos a mais e os que faltam, pelo caminho na extração. */
export function arquivosForaDoEsperado(arquivos: readonly string[]): string[] {
  const aMais = arquivos.filter((arquivo) => !ARQUIVOS_ESPERADOS.includes(arquivo));
  const faltam = ARQUIVOS_ESPERADOS.filter((arquivo) => !arquivos.includes(arquivo));
  return [
    ...aMais.map((arquivo) => `o arquivo ${arquivo}, que o MSI não instala`),
    ...faltam.map((arquivo) => `a falta do arquivo ${arquivo}`),
  ];
}

/** As propriedades da linha de comando que o MSI traz com valor de fábrica. */
export function propriedadesDeFabrica(nomesComValor: readonly string[]): string[] {
  return PROPRIEDADES_DA_LINHA_DE_COMANDO.filter((nome) => nomesComValor.includes(nome)).map(
    (nome) => `a propriedade ${nome} com valor de fábrica`,
  );
}

function arquivosDaPasta(pasta: string): string[] {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' }).filter((caminho) =>
    statSync(join(pasta, caminho)).isFile(),
  );
}

/** Os nomes da tabela Property com valor, pelo Windows Installer: os valores não saem do PowerShell. */
function nomesDaTabelaProperty(msi: string): string[] {
  const script = [
    '$i = New-Object -ComObject WindowsInstaller.Installer',
    "$db = $i.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $i, @($env:GRAFITE_MSI_CONFERIDO, 0))",
    "$v = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @('SELECT Property, Value FROM Property'))",
    "[void]$v.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $v, $null)",
    "while ($r = $v.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $v, $null)) {",
    "  $valor = $r.GetType().InvokeMember('StringData', 'GetProperty', $null, $r, 2)",
    "  if ($valor) { $r.GetType().InvokeMember('StringData', 'GetProperty', $null, $r, 1) }",
    '}',
  ].join('\n');
  const saida = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { encoding: 'utf8', env: { ...process.env, GRAFITE_MSI_CONFERIDO: msi } },
  );
  if (saida.status !== 0) throw new Error(`A tabela Property não abriu: ${saida.stderr}`);
  return saida.stdout.split(/\r?\n/).filter(Boolean);
}

/** Confere o MSI e devolve os problemas, que dizem o nome do que acharam, sem o valor. */
export function conferirMsi(msi: string, raiz: string): string[] {
  const pasta = mkdtempSync(join(tmpdir(), 'grafite-aba-msi-'));
  try {
    const extracao = spawnSync('msiexec', ['/a', msi, '/qn', `TARGETDIR=${pasta}`]);
    if (extracao.status !== 0) {
      throw new Error(`A extração do MSI terminou com ${extracao.status ?? extracao.error}.`);
    }
    const arquivos = arquivosDaPasta(pasta)
      .map((caminho) => caminho.split(sep).join('/'))
      .filter((caminho) => !caminho.toLowerCase().endsWith('.msi'));
    const dotenv = join(raiz, '.env');
    const lista = procurados(
      process.env,
      existsSync(dotenv) ? lerDotenv(readFileSync(dotenv, 'utf8')) : {},
    );
    const problemas = [
      ...arquivosForaDoEsperado(arquivos),
      ...propriedadesDeFabrica(nomesDaTabelaProperty(msi)),
      ...achados(readFileSync(msi), lista).map((nome) => `${nome}, no MSI`),
    ];
    for (const arquivo of arquivos) {
      const nomes = achados(readFileSync(join(pasta, arquivo)), lista);
      problemas.push(...nomes.map((nome) => `${nome}, em ${arquivo}`));
    }
    return problemas;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const msi = process.argv[2];
  if (!msi || process.platform !== 'win32') {
    console.error('Uso, no Windows: node apps/aba/scripts/conferir-msi.ts <Grafite-Aba.msi>');
    process.exitCode = 2;
  } else {
    const raiz = resolve(import.meta.dirname, '..', '..', '..');
    const problemas = conferirMsi(resolve(msi), raiz);
    if (problemas.length > 0) {
      console.error(`O MSI leva o que não pode:\n- ${problemas.join('\n- ')}`);
      process.exitCode = 1;
    } else {
      console.log(
        `O MSI ${relative(process.cwd(), resolve(msi))} só leva a aba e o serviço, sem endereço, chave nem token.`,
      );
    }
  }
}
