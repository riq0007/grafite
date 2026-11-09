// O proxy no servidor Linux (change servidor-linux-com-docker, design, decisão 7): o Caddyfile do
// mesmo gerador do Windows, com o nome do serviço de cada app, conferido pelo Caddy da imagem do
// proxy da versão da produção, num contêiner descartável e sem rede, com a pasta do Caddy no mesmo
// caminho, antes de trocar o atual. No modo interno com a AC do Caddy, que a conferência já cria, a
// raiz é copiada para a pasta pública que os apps montam, legível por eles; as chaves ficam.
import { access, copyFile } from 'node:fs/promises';
import { posix } from 'node:path';
import type { ExecutarProcesso } from '@grafite/operacao';
import type { EstadoDaInstalacao } from '../estado.ts';
import { pastasDaInstalacaoNoLinux } from '../layout.ts';
import { trocarCaddyfile } from '../proxy.ts';
import type { Servicos } from '../windows/servicos.ts';
import { imagemDaVersao } from './pacote.ts';
import { PERMISSOES_DO_SISTEMA, type Permissoes } from './permissoes.ts';

export async function configurarProxyNoLinux({
  estado,
  executar,
  servicos,
  permissoes = PERMISSOES_DO_SISTEMA,
}: {
  estado: EstadoDaInstalacao;
  executar: ExecutarProcesso;
  servicos: Servicos;
  permissoes?: Permissoes;
}): Promise<void> {
  const pastas = pastasDaInstalacaoNoLinux(estado.raiz);
  const { certificado } = estado;
  // O proxy roda com a imagem da versão da produção, como no projeto do Compose.
  const versao = estado.ambientes.producao.atual;
  if (versao === null) {
    throw new Error('A produção ainda não tem versão instalada, e o proxy usa a imagem dela.');
  }
  // Com a AC da empresa, o Caddy lê o certificado e a chave de onde a instalação os pôs.
  const daAcDaEmpresa =
    certificado.modo === 'interno' && certificado.ac === 'empresa'
      ? [certificado.certificado, certificado.chave]
      : [];
  await trocarCaddyfile({
    estado,
    servicos,
    caddyfile: posix.join(pastas.caddy, 'Caddyfile'),
    validar: (novo) =>
      executar(
        'docker',
        [
          'run',
          '--rm',
          '--pull',
          'never',
          '--network',
          'none',
          '--env-file',
          pastas.caddyEnv,
          '--volume',
          `${pastas.caddy}:${pastas.caddy}`,
          ...daAcDaEmpresa.flatMap((arquivo) => ['--volume', `${arquivo}:${arquivo}:ro`]),
          '--entrypoint',
          'caddy',
          imagemDaVersao('proxy', versao),
          'validate',
          '--config',
          novo,
          '--adapter',
          'caddyfile',
        ],
        { env: process.env },
      ),
  });
  if (certificado.modo === 'interno' && certificado.ac === 'caddy') {
    await access(pastas.raizDaAcDoCaddy).catch(() => {
      throw new Error(
        `O Caddy não criou a AC em ${pastas.raizDaAcDoCaddy}: confira o log do proxy (docker compose --project-name grafite logs proxy).`,
      );
    });
    await copyFile(pastas.raizDaAcDoCaddy, pastas.raizDaAcPublica);
    await permissoes.modo(pastas.raizDaAcPublica, 0o644);
  }
}
