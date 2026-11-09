// Os endereços de acesso depois da instalação (spec operacao-servicos, "Serviços e configurações
// pelo comando de operação"; change painel-da-operacao, design, decisão 8): o `enderecos
// acrescentar` põe um endereço na produção e o do teste correspondente no teste, e o `enderecos
// tirar` tira os dois. A organização que opera o servidor recebe ou perde cada um no banco do
// ambiente dele, pelo comando da API da versão do ambiente: o comando de operação não escreve no
// banco. Depois, o proxy recebe os endereços do estado, e a saúde pelo HTTPS confere os novos.
import { writeFile } from 'node:fs/promises';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { type AmbienteInstalado, type EstadoDaInstalacao, gravarEstado } from './estado.ts';
import { type Instalacao, lerInstalacao } from './instalacao.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { ENDERECO, sugestaoDoTeste } from './respostas.ts';
import { conferirSaude, type Saude } from './saude.ts';
import { reiniciarAmbiente } from './servicos.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDosEnderecos {
  raiz: string;
  console: Console;
  servicos: Servicos;
  saude: Saude;
  plataforma: PlataformaDaInstalacao;
}

/** O endereço digitado, em minúsculas, ou a recusa. */
function conferido(digitado: string): string {
  const endereco = digitado.trim().toLowerCase();
  if (!ENDERECO.test(endereco)) {
    throw new Error(`O endereço ${endereco} não serve: use um nome como grafite.empresa.com.br.`);
  }
  return endereco;
}

/** O banco do teste ainda sem a cópia da produção não tem a organização. */
const SEM_A_COPIA = /Nenhuma organização tem o endereço/;

/**
 * Roda o comando da API da versão do ambiente, com a configuração dele. O teste sem a cópia da
 * produção fica como está: o endereço entra nele na próxima preparação do teste, pelo mapa.
 */
async function naOrganizacao(
  { plataforma }: DependenciasDosEnderecos,
  instalacao: Instalacao,
  ambiente: AmbienteInstalado,
  argumentos: string[],
): Promise<'feito' | 'sem-a-copia'> {
  const variaveis = await lerConfigEnv(instalacao.pastas[ambiente].configEnv);
  const { codigo, saida, erro } = await plataforma
    .scriptsDoAmbiente(instalacao, ambiente)
    .comandoDaApi(variaveis, argumentos);
  if (codigo === 0) return 'feito';
  const motivo = (erro || saida).trim();
  if (ambiente === 'teste' && SEM_A_COPIA.test(motivo)) return 'sem-a-copia';
  throw new Error(
    `O comando da API ${ambiente === 'producao' ? 'da produção' : 'do teste'} recusou: ${motivo}`,
  );
}

/** O endereço da organização que opera o servidor, como a configuração da produção o diz. */
async function operadoraDa(instalacao: Instalacao): Promise<string> {
  const { GRAFITE_ORGANIZACAO_OPERADORA } = await lerConfigEnv(
    instalacao.pastas.producao.configEnv,
  );
  return GRAFITE_ORGANIZACAO_OPERADORA ?? instalacao.estado.ambientes.producao.enderecos[0] ?? '';
}

/** A saúde de cada endereço pelo proxy, com a raiz da AC do Caddy no modo interno com ela. */
async function conferirPeloProxy(
  { saude }: DependenciasDosEnderecos,
  instalacao: Instalacao,
  estado: EstadoDaInstalacao,
  enderecos: [AmbienteInstalado, string][],
) {
  const { certificado } = estado;
  const raizDaAc =
    certificado.modo === 'interno' && certificado.ac === 'caddy'
      ? { raiz: instalacao.pastas.raizDaAcDoCaddy }
      : {};
  for (const [ambiente, endereco] of enderecos) {
    conferirSaude(
      await saude.peloProxy(endereco, raizDaAc),
      { versao: estado.ambientes[ambiente].atual ?? '', ambiente },
      `O endereço https://${endereco}`,
    );
  }
}

export async function acrescentarEndereco(
  dep: DependenciasDosEnderecos,
  digitado: string,
): Promise<void> {
  const endereco = conferido(digitado);
  const { console, plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { estado } = instalacao;
  const { producao, teste } = estado.ambientes;
  const usados = new Set([...producao.enderecos, ...teste.enderecos]);
  if (usados.has(endereco)) {
    throw new Error(`O endereço ${endereco} já é do Grafite neste servidor.`);
  }
  const doTeste = conferido(
    await console.perguntar(
      `Endereço do teste que corresponde a ${endereco}`,
      sugestaoDoTeste(endereco),
    ),
  );
  if (usados.has(doTeste) || doTeste === endereco) {
    throw new Error(`O endereço ${doTeste} já é do Grafite neste servidor.`);
  }

  // 1. A organização que opera o servidor, no banco de cada ambiente.
  const operadora = await operadoraDa(instalacao);
  await naOrganizacao(dep, instalacao, 'producao', [
    'organizacao',
    'acrescentar-endereco',
    '--endereco',
    operadora,
    '--novo',
    endereco,
  ]);
  const noTeste = await naOrganizacao(dep, instalacao, 'teste', [
    'organizacao',
    'acrescentar-endereco',
    '--endereco',
    estado.mapaDoTeste[operadora] ?? '',
    '--novo',
    doTeste,
  ]);

  // 2. O proxy e o estado, com o mapa do teste.
  const novo: EstadoDaInstalacao = {
    ...estado,
    ambientes: {
      producao: { ...producao, enderecos: [...producao.enderecos, endereco] },
      teste: { ...teste, enderecos: [...teste.enderecos, doTeste] },
    },
    mapaDoTeste: { ...estado.mapaDoTeste, [endereco]: doTeste },
  };
  await plataforma.configurarProxy(novo, dep.servicos);
  await gravarEstado(novo);
  await conferirPeloProxy(dep, instalacao, novo, [
    ['producao', endereco],
    ['teste', doTeste],
  ]);
  if (noTeste === 'sem-a-copia') {
    console.escrever(
      `O teste ainda não tem a cópia da produção: o endereço ${doTeste} entra nele na próxima preparação do teste.`,
    );
  }
  console.escrever(
    `A produção atende também por https://${endereco}, e o teste, por https://${doTeste}. Cadastre os dois no DNS da empresa, apontando para este servidor.`,
  );
}

/** Troca, nas variáveis, o valor que é o endereço de antes, puro ou com o https. */
function trocarEndereco(
  variaveis: Record<string, string>,
  nomes: string[],
  de: string,
  para: string,
) {
  const trocadas = { ...variaveis };
  for (const nome of nomes) {
    if (trocadas[nome] === de) trocadas[nome] = para;
    else if (trocadas[nome] === `https://${de}`) trocadas[nome] = `https://${para}`;
  }
  return trocadas;
}

export async function tirarEndereco(
  dep: DependenciasDosEnderecos,
  digitado: string,
): Promise<void> {
  const endereco = digitado.trim().toLowerCase();
  const { console, plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { estado, pastas } = instalacao;
  const { producao, teste } = estado.ambientes;
  if (!producao.enderecos.includes(endereco)) {
    throw new Error(`O endereço ${endereco} não é da produção.`);
  }
  if (producao.enderecos.length === 1) {
    throw new Error(
      `A produção precisa de pelo menos um endereço: acrescente outro antes de tirar ${endereco}.`,
    );
  }
  const doTeste = estado.mapaDoTeste[endereco];
  await console.confirmarDigitado(
    `Para tirar ${doTeste === undefined ? endereco : `${endereco} e ${doTeste}`}, digite o endereço`,
    endereco,
  );

  // 1. A organização que opera o servidor, no banco de cada ambiente.
  const operadora = await operadoraDa(instalacao);
  await naOrganizacao(dep, instalacao, 'producao', [
    'organizacao',
    'tirar-endereco',
    '--endereco',
    endereco,
  ]);
  if (doTeste !== undefined) {
    await naOrganizacao(dep, instalacao, 'teste', [
      'organizacao',
      'tirar-endereco',
      '--endereco',
      doTeste,
    ]);
  }

  // 2. O proxy e o estado, sem os dois e sem o par no mapa do teste.
  const restantes = producao.enderecos.filter((item) => item !== endereco);
  const { [endereco]: _, ...mapaDoTeste } = estado.mapaDoTeste;
  const novo: EstadoDaInstalacao = {
    ...estado,
    ambientes: {
      producao: { ...producao, enderecos: restantes },
      teste: { ...teste, enderecos: teste.enderecos.filter((item) => item !== doTeste) },
    },
    mapaDoTeste,
  };
  await plataforma.configurarProxy(novo, dep.servicos);
  await gravarEstado(novo);

  // 3. O endereço da organização que opera o servidor passa ao seguinte: a produção e o coletor o
  // usam para achar a organização, vigiar o certificado e assinar o push.
  let daOperadora = '';
  if (endereco === operadora) {
    const [seguinte = ''] = restantes;
    const configDaProducao = await lerConfigEnv(pastas.producao.configEnv);
    await writeFile(
      pastas.producao.configEnv,
      gerarConfigEnv(
        trocarEndereco(
          configDaProducao,
          ['GRAFITE_ORGANIZACAO_OPERADORA', 'GRAFITE_CERTIFICADO_VIGIAR', 'GRAFITE_PUSH_CONTATO'],
          endereco,
          seguinte,
        ),
      ),
    );
    await plataforma.restringirAcesso(pastas.producao.configEnv);
    const doColetor = await lerConfigEnv(pastas.coletorEnv);
    await writeFile(
      pastas.coletorEnv,
      gerarConfigEnv(trocarEndereco(doColetor, ['GRAFITE_COLETOR_ENDERECO'], endereco, seguinte)),
    );
    await plataforma.restringirAcesso(pastas.coletorEnv);
    await reiniciarAmbiente(dep, 'producao', producao.atual ?? '');
    daOperadora = ` A organização que opera o servidor passa a ser a do endereço ${seguinte}.`;
  }
  console.escrever(
    `A produção deixou de atender por https://${endereco}${doTeste === undefined ? '' : `, e o teste, por https://${doTeste}`}.${daOperadora} Tire ${doTeste === undefined ? 'o endereço' : 'os dois'} do DNS da empresa.`,
  );
}
