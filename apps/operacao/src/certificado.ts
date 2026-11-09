// O certificado do proxy pelo comando de operação (spec operacao-servicos, "Serviços e
// configurações pelo comando de operação"; change painel-da-operacao, design, decisão 8): o
// `certificado configurar` troca o modo do certificado (design do F2d, decisão 9) depois da
// instalação. O token do DNS é pedido sem eco e vai só para a configuração do proxy. O proxy recebe
// a configuração nova, conferida pelo Caddy antes de trocar a atual; o estado guarda o modo; os apps
// confiam na raiz da AC do Caddy só no modo interno com ela; e os dois ambientes respondem pelo HTTPS.
import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { type CertificadoDaInstalacao, gravarEstado } from './estado.ts';
import { lerInstalacao } from './instalacao.ts';
import { NO_SERVIDOR, pastasDaInstalacaoNoLinux } from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import { reiniciarAmbiente } from './servicos.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDoCertificado {
  raiz: string;
  console: Console;
  servicos: Servicos;
  saude: Saude;
  plataforma: PlataformaDaInstalacao;
}

/** O modo pedido, como a linha de comando o dá. */
export interface PedidoDoCertificado {
  modo?: string;
  ac?: string;
  email?: string;
  certificado?: string;
  chave?: string;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** O certificado conferido, ou o motivo da recusa. */
function conferirPedido(pedido: PedidoDoCertificado): CertificadoDaInstalacao {
  if (pedido.modo === 'publico') {
    const email = pedido.email?.trim() ?? '';
    if (!EMAIL.test(email)) {
      throw new Error("--email: com o modo público, diga o e-mail da conta do Let's Encrypt.");
    }
    return { modo: 'publico', email, provedorDns: 'cloudflare' };
  }
  if (pedido.modo !== 'interno') throw new Error('--modo: use interno ou publico.');
  const ac = pedido.ac ?? 'caddy';
  if (ac === 'caddy') return { modo: 'interno', ac: 'caddy' };
  if (ac !== 'empresa') throw new Error('--ac: use caddy ou empresa.');
  const certificado = pedido.certificado?.trim() ?? '';
  const chave = pedido.chave?.trim() ?? '';
  if (!isAbsolute(certificado) || !isAbsolute(chave)) {
    throw new Error(
      '--certificado e --chave: com a AC da empresa, diga os arquivos do certificado e da chave.',
    );
  }
  return { modo: 'interno', ac: 'empresa', certificado, chave };
}

const AMBIENTES = ['producao', 'teste'] as const;

const DESCRICAO = {
  publico: "no modo público, pelo Let's Encrypt com o DNS da Cloudflare",
  caddy: 'no modo interno, com a AC do próprio proxy',
  empresa: 'no modo interno, com o certificado da AC da empresa',
} as const;

export async function configurarCertificado(
  dep: DependenciasDoCertificado,
  pedido: PedidoDoCertificado,
): Promise<void> {
  const certificado = conferirPedido(pedido);
  const { plataforma, console, servicos, saude } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { estado, pastas } = instalacao;
  let token: string | undefined;
  if (certificado.modo === 'publico') {
    token = (
      await console.perguntarSegredo(
        'Token da Cloudflare, com permissão de editar o DNS só da zona',
      )
    ).trim();
    if (token === '') {
      throw new Error('O modo público precisa do token da Cloudflare. Nada foi mudado.');
    }
  }

  // 1. O proxy: o token só na configuração dele, o projeto (no Linux, o que o proxy monta) e o
  // Caddyfile novo, que o Caddy confere antes de trocar o atual.
  const { CLOUDFLARE_API_TOKEN: _, ...semToken } = await lerConfigEnv(pastas.caddyEnv);
  await writeFile(
    pastas.caddyEnv,
    gerarConfigEnv(token === undefined ? semToken : { ...semToken, CLOUDFLARE_API_TOKEN: token }),
  );
  await plataforma.restringirAcesso(pastas.caddyEnv);
  const novo = { ...estado, certificado };
  const { GRAFITE_BACKUP_DESTINOS = '' } = await lerConfigEnv(pastas.producao.configEnv);
  await plataforma.regerarProjeto(novo, GRAFITE_BACKUP_DESTINOS.split(';').filter(Boolean));
  await plataforma.configurarProxy(novo, servicos);
  await gravarEstado(novo);

  // 2. Os apps: a raiz da AC do Caddy só no modo interno com ela; no Linux, a cópia pública.
  const daAcDoCaddy = certificado.modo === 'interno' && certificado.ac === 'caddy';
  const raizNosApps =
    plataforma.nome === 'linux'
      ? pastasDaInstalacaoNoLinux(estado.raiz).raizDaAcPublica
      : pastas.raizDaAcDoCaddy;
  for (const ambiente of AMBIENTES) {
    const caminho = pastas[ambiente].configEnv;
    const { NODE_EXTRA_CA_CERTS: __, ...semRaiz } = await lerConfigEnv(caminho);
    await writeFile(
      caminho,
      gerarConfigEnv(daAcDoCaddy ? { ...semRaiz, NODE_EXTRA_CA_CERTS: raizNosApps } : semRaiz),
    );
    await plataforma.restringirAcesso(caminho);
  }
  for (const ambiente of AMBIENTES) {
    await reiniciarAmbiente(dep, ambiente, estado.ambientes[ambiente].atual ?? '', 'Certificado');
  }

  // 3. Os dois ambientes pelo HTTPS, com o certificado novo.
  const raizDaAc = daAcDoCaddy ? { raiz: pastas.raizDaAcDoCaddy } : {};
  for (const ambiente of AMBIENTES) {
    for (const endereco of estado.ambientes[ambiente].enderecos) {
      conferirSaude(
        await saude.peloProxy(endereco, raizDaAc),
        { versao: estado.ambientes[ambiente].atual ?? '', ambiente },
        `O endereço https://${endereco}`,
      );
    }
  }
  const descricao = DESCRICAO[certificado.modo === 'publico' ? 'publico' : certificado.ac];
  console.escrever(
    `O certificado do proxy está ${descricao}, e os dois ambientes respondem pelo HTTPS.${daAcDoCaddy ? ` Distribua o certificado raiz às máquinas e aos celulares: ${NO_SERVIDOR[plataforma.nome].comando} proxy raiz <pasta>.` : ''}`,
  );
}
