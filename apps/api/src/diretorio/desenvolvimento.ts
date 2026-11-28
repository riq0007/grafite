// O diretório de desenvolvimento (spec plataforma-base, "Ambiente de desenvolvimento"; change
// aba-dos-colaboradores, design, decisão 13): o AD simulado com o usuário do Windows de quem roda o
// `pnpm dev`, com o SID dele, num grupo mapeado e com a senha `aba123`, para a aba entrar no
// computador de quem desenvolve. A API só carrega este módulo com a
// GRAFITE_DIRETORIO_DE_DESENVOLVIMENTO, que a configuração recusa fora do desenvolvimento. Ele só
// atende o servidor marcado e a organização só com endereços locais, como a senha fixa do `admin`.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { validarUsuario } from '@grafite/domain';
import {
  type AcessoAoDiretorio,
  type ClienteDoDiretorio,
  type ConectarDiretorio,
  FalhaDoDiretorio,
} from './cliente.ts';
import { CONTA_DE_SERVICO_SIMULADA, criarDiretorioSimulado } from './simulado.ts';

/** Os únicos endereços de uma organização de desenvolvimento. */
export const ENDERECOS_LOCAIS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);

/** O servidor que a organização de desenvolvimento guarda: só ele cai no diretório simulado. */
export const SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO = 'ldap://diretorio.localhost';
export const BASE_DO_DIRETORIO_DE_DESENVOLVIMENTO = 'DC=empresa,DC=local';
/** Só do desenvolvimento: a senha da entrada pela senha, que só o diretório simulado aceita. */
export const SENHA_DA_ABA_DE_DESENVOLVIMENTO = 'aba123';
export const CONTA_DE_SERVICO_DE_DESENVOLVIMENTO = CONTA_DE_SERVICO_SIMULADA;
/** O nome do grupo do AD simulado, que o `pnpm dev` mapeia a um grupo do Grafite com o chat. */
export const NOME_DO_GRUPO_DE_DESENVOLVIMENTO = 'Colaboradores';
export const GRUPO_DO_AD_DE_DESENVOLVIMENTO = `CN=${NOME_DO_GRUPO_DE_DESENVOLVIMENTO},OU=Grupos,${BASE_DO_DIRETORIO_DE_DESENVOLVIMENTO}`;

/** Quem roda o `pnpm dev`: o usuário do Windows, sem o domínio, e o SID dele. */
export interface UsuarioDoWindows {
  usuario: string;
  sid: string;
}

/** O usuário e o SID da saída do `whoami /user /fo csv /nh`, ou `null` sem eles. */
export function lerUsuarioDoWindows(saida: string): UsuarioDoWindows | null {
  const achado = /^"(?:[^"\\]*\\)?([^"]+)","(S-1-[0-9-]+)"/.exec(saida.trim());
  if (!achado?.[1] || !achado[2]) return null;
  return { usuario: achado[1].toLowerCase(), sid: achado[2] };
}

/** O usuário do Windows de quem roda a API, ou `null` fora do Windows. */
export function usuarioDoWindowsAtual(): UsuarioDoWindows | null {
  if (process.platform !== 'win32') return null;
  // O do Windows pelo caminho inteiro: o Git Bash põe o whoami dele antes no PATH.
  const whoami = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe');
  const r = spawnSync(whoami, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
  return r.status === 0 ? lerUsuarioDoWindows(r.stdout) : null;
}

/**
 * O que o `pnpm dev` diz de como a aba entra, ou por que o usuário do Windows não entra: o usuário
 * que não serve de usuário do Grafite, como o com espaço ou acento, e o de uma conta local que já
 * existe ficam com a entrada local, e a senha da aba responderia "usuário ou senha".
 */
export function fraseDaAba(usuario: string, contaLocal: boolean): string {
  const erro = validarUsuario(usuario);
  if (erro !== null) {
    return `O usuário do Windows "${usuario}" não serve de usuário do Grafite (${erro.replace(/\.$/, '')}): a aba não entra pelo diretório simulado neste computador.`;
  }
  if (contaLocal) {
    return `A organização de desenvolvimento já tem a conta local ${usuario}, que entra pela senha dela: a aba não entra pelo diretório simulado com esse usuário.`;
  }
  return `A aba entra pelo Windows com ${usuario}, ou pela senha com ${usuario} e ${SENHA_DA_ABA_DE_DESENVOLVIMENTO}.`;
}

const RECUSADO = 'o diretório de desenvolvimento só atende a organização só com endereços locais';

/**
 * O conectar da API com o diretório de desenvolvimento ligado: o servidor marcado cai no AD
 * simulado, e os outros seguem para o cliente de verdade. A organização com algum endereço que
 * não é local, ou sem endereço, recebe o AD fora do ar em cada pedido.
 */
export function conectarDiretorioDeDesenvolvimento({
  quem,
  enderecosDa,
  outro,
  avisar,
}: {
  quem: UsuarioDoWindows;
  enderecosDa: (orgId: string) => Promise<string[]>;
  outro: ConectarDiretorio;
  avisar: (dados: object, mensagem: string) => void;
}): ConectarDiretorio {
  const ad = criarDiretorioSimulado();
  const dn = ad.usuario({
    usuario: quem.usuario,
    nome: quem.usuario,
    senha: SENHA_DA_ABA_DE_DESENVOLVIMENTO,
    sid: quem.sid,
  });
  ad.grupo(NOME_DO_GRUPO_DE_DESENVOLVIMENTO, [dn]);

  return (acesso: AcessoAoDiretorio) => {
    if (acesso.servidor !== SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO) return outro(acesso);
    const simulado = ad.conectar(acesso);
    const conferir = async () => {
      const enderecos = await enderecosDa(acesso.orgId);
      const naoLocais = enderecos.filter((endereco) => !ENDERECOS_LOCAIS.has(endereco));
      if (enderecos.length === 0 || naoLocais.length > 0) {
        avisar({ orgId: acesso.orgId, enderecos: naoLocais }, RECUSADO);
        throw new FalhaDoDiretorio('nao-respondeu');
      }
    };
    return Object.fromEntries(
      Object.entries(simulado).map(([nome, metodo]) => [
        nome,
        async (...argumentos: unknown[]) => {
          await conferir();
          return (metodo as (...a: unknown[]) => Promise<unknown>)(...argumentos);
        },
      ]),
    ) as unknown as ClienteDoDiretorio;
  };
}
