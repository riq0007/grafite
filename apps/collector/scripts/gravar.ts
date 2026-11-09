// O comando gravar (change p2b-impressoras-por-snmp, design, decisão 6): lê uma impressora de verdade
// na descrição do sistema e nas subárvores da leitura do coletor, e grava a gravação no formato do
// snmpsim, que alimenta o simulador dos testes. Assim, as gravações reais entram no lugar das
// montadas quando houver acesso às impressoras. O texto legível vai como texto, e o resto, como o
// campo de bits das condições, em hexadecimal. A comunidade só abre a sessão: ela não vai à gravação.
// Uso: pnpm --filter @grafite/collector gravar -- --ip <ip> --comunidade <c> --saida <arquivo>
//        [--versao 1|2c] [--porta <porta>]
// A saída relativa fica na pasta do coletor, onde o pnpm roda o comando.
import { isUtf8 } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { VERSOES_DO_SNMP, type VersaoDoSnmp } from '@grafite/domain';
import snmp from 'net-snmp';
import {
  abrirSessao,
  lerSubarvore,
  type OpcoesDaLeitura,
  SUBARVORES_DA_IMPRESSORA,
} from '../src/snmp.ts';

/** A descrição do sistema, que diz o modelo da impressora. */
const DESCRICAO_DO_SISTEMA = '1.3.6.1.2.1.1.1.0';
/** O campo de bits das condições, que vai sempre em hexadecimal. */
const DO_CAMPO_DE_BITS = `${SUBARVORES_DA_IMPRESSORA.condicoes}.`;
/** O texto legível: sem caractere de controle nem espaço nas pontas, que a leitura da gravação apara. */
const LEGIVEL = /^[^\p{Cc}\s](?:[^\p{Cc}]*[^\p{Cc}\s])?$/u;

const NAO_RESPONDEU = 'A impressora não respondeu ao SNMP. Confira o IP, a versão e a comunidade.';
const USO =
  'Uso: pnpm --filter @grafite/collector gravar -- --ip <ip> --comunidade <c> --saida <arquivo> [--versao 1|2c] [--porta <porta>]';

/** A linha de um objeto, com o tipo do snmpsim, ou nenhuma, num tipo que o simulador não lê. */
function linhaDo({ oid, type, value }: snmp.Varbind): string | null {
  switch (type) {
    case snmp.ObjectType.Integer:
    case snmp.ObjectType.Counter:
    case snmp.ObjectType.Gauge:
    case snmp.ObjectType.TimeTicks:
    case snmp.ObjectType.OID:
    case snmp.ObjectType.IpAddress:
      return `${oid}|${type}|${String(value)}`;
    case snmp.ObjectType.OctetString: {
      const bytes = value as Buffer;
      const legivel =
        !oid.startsWith(DO_CAMPO_DE_BITS) && isUtf8(bytes) && LEGIVEL.test(bytes.toString('utf8'));
      return legivel ? `${oid}|4|${bytes.toString('utf8')}` : `${oid}|4x|${bytes.toString('hex')}`;
    }
    case snmp.ObjectType.Null:
      return `${oid}|5|`;
    case snmp.ObjectType.Counter64:
      return `${oid}|70|${BigInt(`0x${(value as Buffer).toString('hex') || '0'}`)}`;
    default:
      return null;
  }
}

function compararOids(a: string, b: string) {
  const [de, para] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < Math.min(de.length, para.length); i++) {
    const diferenca = (de[i] ?? 0) - (para[i] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return de.length - para.length;
}

/** O objeto pedido pelo GET; o que a impressora não tem fica de fora. */
function lerObjeto(sessao: snmp.Session, oid: string): Promise<snmp.Varbind[]> {
  return new Promise((resolver, rejeitar) => {
    sessao.get([oid], (erro, ligacoes) => {
      if (erro instanceof snmp.RequestFailedError) return resolver([]);
      if (erro) return rejeitar(erro);
      resolver((ligacoes ?? []).filter((ligacao) => !snmp.isVarbindError(ligacao)));
    });
  });
}

/** Lê a impressora e devolve a gravação; rejeita quando ela não responde. */
export async function gravarImpressora({
  momento = new Date(),
  ...opcoes
}: OpcoesDaLeitura & { momento?: Date }): Promise<string> {
  const sessao = abrirSessao(opcoes);
  const objetos = new Map<string, snmp.Varbind>();
  try {
    for (const ligacao of await lerObjeto(sessao, DESCRICAO_DO_SISTEMA)) {
      objetos.set(ligacao.oid, ligacao);
    }
    for (const base of Object.values(SUBARVORES_DA_IMPRESSORA)) {
      for (const ligacao of await lerSubarvore(sessao, base)) objetos.set(ligacao.oid, ligacao);
    }
  } catch (erro) {
    throw new Error(NAO_RESPONDEU, { cause: erro });
  } finally {
    sessao.close();
  }
  const linhas = [...objetos.values()]
    .sort((a, b) => compararOids(a.oid, b.oid))
    .map(linhaDo)
    .filter((linha): linha is string => linha !== null);
  const dia = momento.toISOString().slice(0, 10);
  const cabecalho = [
    `# Gravação lida de uma impressora pelo comando gravar, em ${dia}, pelo SNMP v${opcoes.versao}: a`,
    '# descrição do sistema e as subárvores da leitura do coletor. Formato do snmpsim: oid|tipo|valor,',
    '# em ordem de OID.',
  ];
  return `${[...cabecalho, ...linhas].join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // O pnpm passa o `--` adiante.
  const argumentos = process.argv.slice(2);
  if (argumentos[0] === '--') argumentos.shift();
  const { values } = parseArgs({
    args: argumentos,
    options: {
      ip: { type: 'string' },
      comunidade: { type: 'string' },
      saida: { type: 'string' },
      versao: { type: 'string', default: '2c' },
      porta: { type: 'string', default: '161' },
    },
  });
  const porta = Number(values.porta);
  const versaoValida = (VERSOES_DO_SNMP as readonly string[]).includes(values.versao);
  if (
    !values.ip ||
    !values.comunidade ||
    !values.saida ||
    !versaoValida ||
    !Number.isInteger(porta) ||
    porta < 1 ||
    porta > 65535
  ) {
    console.error(USO);
    process.exit(2);
  }
  try {
    const texto = await gravarImpressora({
      ip: values.ip,
      comunidade: values.comunidade,
      versao: values.versao as VersaoDoSnmp,
      porta,
    });
    const saida = resolve(values.saida);
    await writeFile(saida, texto);
    const linhas = texto.split('\n').filter((linha) => linha !== '' && !linha.startsWith('#'));
    console.log(`Gravação com ${linhas.length} linhas em ${saida}.`);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  }
}
