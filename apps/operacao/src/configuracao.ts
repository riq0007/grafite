// O config.env de cada ambiente (design do F2d, decisão 2): as variáveis que a API lê com
// `node --env-file`, com as senhas geradas no servidor. Cada valor vai entre aspas simples, que o
// Node lê sem interpretar nada (nem a barra invertida dos caminhos do Windows); com uma aspa
// simples no valor, entre crases. A leitura usa o próprio leitor do Node, então o que o comando lê
// é o que a API lê.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const NOME = /^[A-Z_][A-Z0-9_]*$/;

export function gerarConfigEnv(variaveis: Record<string, string>): string {
  const linhas = [
    '# Gerado pelo comando de operação do Grafite. Tem segredos: nunca versionar nem copiar.',
  ];
  for (const [nome, valor] of Object.entries(variaveis)) {
    if (!NOME.test(nome))
      throw new Error(`O nome ${nome} não serve para uma variável de ambiente.`);
    if (/[\r\n]/.test(valor)) {
      throw new Error(`O valor de ${nome} tem uma quebra de linha, que o config.env não guarda.`);
    }
    if (!valor.includes("'")) linhas.push(`${nome}='${valor}'`);
    else if (!valor.includes('`')) linhas.push(`${nome}=\`${valor}\``);
    else {
      throw new Error(
        `O valor de ${nome} tem aspas simples, duplas e crases, e não cabe no config.env.`,
      );
    }
  }
  return `${linhas.join('\n')}\n`;
}

export async function lerConfigEnv(caminho: string): Promise<Record<string, string>> {
  const texto = await readFile(caminho, 'utf8').catch(() => {
    throw new Error(`Falta o arquivo de configuração ${caminho}.`);
  });
  return parseEnv(texto) as Record<string, string>;
}
