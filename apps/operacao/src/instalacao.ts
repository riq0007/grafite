// A instalação pronta, que os comandos depois do `grafite instalar` usam: o estado dela e as pastas.
// Uma instalação que não terminou é retomada pelo próprio `grafite instalar`, antes de tudo.
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AmbienteInstalado,
  type EstadoDaInstalacao,
  gravarEstado,
  lerEstado,
} from './estado.ts';
import {
  NO_SERVIDOR,
  type PastasDaInstalacao,
  type Plataforma,
  pastasDaInstalacao,
} from './layout.ts';
import type { Juncoes } from './windows/juncoes.ts';

export interface Instalacao {
  estado: EstadoDaInstalacao;
  pastas: PastasDaInstalacao;
}

const existe = (caminho: string) =>
  access(caminho).then(
    () => true,
    () => false,
  );

/**
 * A instalação terminada da raiz. No Linux (change servidor-linux-com-docker), as pastas que os
 * fluxos comuns usam, como a configuração de cada ambiente e as versões, têm os mesmos caminhos.
 */
export async function lerInstalacao(
  raiz: string,
  plataforma: Plataforma = 'windows',
): Promise<Instalacao> {
  const pastas = pastasDaInstalacao(raiz);
  const { comando } = NO_SERVIDOR[plataforma];
  if (await existe(pastas.instalacao)) {
    throw new Error(
      `A instalação em ${raiz} não terminou: rode ${comando} instalar de novo para retomá-la.`,
    );
  }
  const estado = await lerEstado(raiz);
  if (estado === null) {
    throw new Error(`O Grafite não está instalado em ${raiz}: rode ${comando} instalar primeiro.`);
  }
  return { estado, pastas };
}

/** Acrescenta a versão desempacotada ao estado, em ordem. */
export async function registrarVersao({ estado }: Instalacao, versao: string): Promise<void> {
  if (estado.versoes.includes(versao)) return;
  estado.versoes = [...estado.versoes, versao].sort((a, b) =>
    a.localeCompare(b, 'en', { numeric: true }),
  );
  await gravarEstado(estado);
}

/**
 * Passa o ambiente a rodar a versão: `anterior` recebe a de `atual`, e `atual` aponta para a nova.
 * Na mesma versão, só confere a junção, e a anterior fica como estava.
 */
export async function passarParaAVersao(
  { estado, pastas }: Instalacao,
  ambiente: AmbienteInstalado,
  versao: string,
  juncoes: Juncoes,
): Promise<void> {
  const dados = estado.ambientes[ambiente];
  const destino = join(pastas.versoes, versao);
  if (dados.atual === versao) {
    await juncoes.apontar(pastas[ambiente].atual, destino);
    return;
  }
  if (dados.atual !== null) {
    await juncoes.apontar(pastas[ambiente].anterior, join(pastas.versoes, dados.atual));
  }
  await juncoes.apontar(pastas[ambiente].atual, destino);
  estado.ambientes[ambiente] = { ...dados, anterior: dados.atual, atual: versao };
  await gravarEstado(estado);
}

/** Troca as versões `atual` e `anterior` do ambiente, nas junções e no estado. */
export async function trocarAtualEAnterior(
  { estado, pastas }: Instalacao,
  ambiente: AmbienteInstalado,
  juncoes: Juncoes,
): Promise<void> {
  const dados = estado.ambientes[ambiente];
  if (dados.anterior === null) throw new Error(`O ambiente ${ambiente} não tem versão anterior.`);
  await juncoes.apontar(pastas[ambiente].atual, join(pastas.versoes, dados.anterior));
  if (dados.atual !== null) {
    await juncoes.apontar(pastas[ambiente].anterior, join(pastas.versoes, dados.atual));
  }
  estado.ambientes[ambiente] = { ...dados, atual: dados.anterior, anterior: dados.atual };
  await gravarEstado(estado);
}
