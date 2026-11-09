// A troca da chave mestra do cofre no servidor (spec operacao-servicos, "Troca da chave do cofre";
// design do P6, decisão 10): a chave nova e a anterior nos dois config.env, o reinício dos dois apps,
// que aceitam as duas, o comando da API que recifra a chave de cada segredo na produção e no teste, a
// retirada da anterior e o reinício de novo. Uma falha no meio deixa as duas chaves; rodar de novo
// continua a troca com elas, sem gerar outra. O fluxo é das duas plataformas (change
// servidor-linux-com-docker, design, decisão 1): a peça da plataforma restringe o acesso à
// configuração e roda o comando da API da versão de cada ambiente; no Linux, o reinício recria os
// contêineres com a configuração nova.
import { writeFile } from 'node:fs/promises';
import type { ExecutarProcesso } from '@grafite/operacao';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import type { EstadoDaInstalacao } from './estado.ts';
import { comServicosParados, vejaNoRunbook } from './falhas.ts';
import { lerInstalacao } from './instalacao.ts';
import { BANCOS, NO_SERVIDOR, type Plataforma, PORTAS, SERVICOS } from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

const runbookDaTroca = (plataforma: Plataforma) =>
  vejaNoRunbook('Troca da chave do cofre', plataforma);
const AMBIENTES = ['producao', 'teste'] as const;
const NO_AMBIENTE = { producao: 'na produção', teste: 'no teste' } as const;

export interface DependenciasDaTroca {
  raiz: string;
  console: Console;
  executar: ExecutarProcesso;
  servicos: Servicos;
  saude: Saude;
  /** As peças da plataforma: o acesso à configuração e o comando da API de cada ambiente. */
  plataforma: PlataformaDaInstalacao;
  /** Uma chave AES-256 nova, em base64. */
  gerarChave: () => string;
}

/** Reinicia o app da produção, com o coletor, e o do teste, conferindo a saúde de cada um. */
async function reiniciarOsApps(
  { servicos, saude, plataforma }: Pick<DependenciasDaTroca, 'servicos' | 'saude' | 'plataforma'>,
  estado: EstadoDaInstalacao,
) {
  for (const ambiente of AMBIENTES) {
    const producao = ambiente === 'producao';
    await comServicosParados(
      servicos,
      producao ? [SERVICOS.coletor, SERVICOS.producao] : [SERVICOS.teste],
      `${producao ? 'O app e o coletor da produção ficaram parados.' : 'O app do teste ficou parado.'} ${runbookDaTroca(plataforma.nome)}`,
      async () => {
        await servicos.iniciar(producao ? SERVICOS.producao : SERVICOS.teste);
        conferirSaude(
          await saude.local(PORTAS[ambiente]),
          { versao: estado.ambientes[ambiente].atual ?? '', ambiente },
          producao ? 'O app da produção' : 'O app do teste',
        );
        if (producao) await servicos.iniciar(SERVICOS.coletor);
      },
    );
  }
}

export async function trocarChaveDoCofre(dep: DependenciasDaTroca): Promise<void> {
  const { console, plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const { estado, pastas } = instalacao;
  const configs = { producao: pastas.producao.configEnv, teste: pastas.teste.configEnv };
  const variaveis = {
    producao: await lerConfigEnv(configs.producao),
    teste: await lerConfigEnv(configs.teste),
  };
  for (const ambiente of AMBIENTES) {
    if (!variaveis[ambiente].GRAFITE_CHAVE_DO_COFRE) {
      throw new Error(
        `Falta GRAFITE_CHAVE_DO_COFRE em ${configs[ambiente]}: a atualização do teste grava a chave do cofre nos dois ambientes.`,
      );
    }
  }
  await console.confirmarDigitado(
    'Para trocar a chave do cofre nos dois ambientes, digite o nome do banco da produção',
    BANCOS.producao.nome,
  );
  const gravar = async (ambiente: (typeof AMBIENTES)[number]) => {
    await writeFile(configs[ambiente], gerarConfigEnv(variaveis[ambiente]));
    await plataforma.restringirAcesso(configs[ambiente]);
  };

  // A troca que parou no meio continua com as chaves dela: uma chave nova agora perderia a anterior.
  const emAndamento = AMBIENTES.map((ambiente) => variaveis[ambiente]).find(
    (doAmbiente) => doAmbiente.GRAFITE_CHAVE_DO_COFRE_ANTERIOR,
  );
  if (emAndamento) {
    console.escrever(
      'A troca anterior não terminou: a configuração já tem a chave nova e a anterior. A troca continua com elas.',
    );
  }
  const nova = emAndamento?.GRAFITE_CHAVE_DO_COFRE ?? dep.gerarChave();
  const anterior =
    emAndamento?.GRAFITE_CHAVE_DO_COFRE_ANTERIOR ?? variaveis.producao.GRAFITE_CHAVE_DO_COFRE ?? '';
  for (const ambiente of AMBIENTES) {
    const doAmbiente = variaveis[ambiente];
    if (
      doAmbiente.GRAFITE_CHAVE_DO_COFRE === nova &&
      doAmbiente.GRAFITE_CHAVE_DO_COFRE_ANTERIOR === anterior
    ) {
      continue;
    }
    variaveis[ambiente] = {
      ...doAmbiente,
      GRAFITE_CHAVE_DO_COFRE: nova,
      GRAFITE_CHAVE_DO_COFRE_ANTERIOR: anterior,
    };
    await gravar(ambiente);
  }

  await reiniciarOsApps(dep, estado);
  for (const ambiente of AMBIENTES) {
    const { codigo, saida, erro } = await plataforma
      .scriptsDoAmbiente(instalacao, ambiente)
      .comandoDaApi(variaveis[ambiente], ['cofre', 'trocar-chave']);
    if (codigo !== 0) {
      throw new Error(
        `O comando da API não terminou a troca ${NO_AMBIENTE[ambiente]}: ${(erro || saida).trim()}. As duas chaves ficaram na configuração, e a API aceita as duas: rode ${NO_SERVIDOR[plataforma.nome].comando} cofre trocar-chave de novo. ${runbookDaTroca(plataforma.nome)}`,
      );
    }
    console.escrever(ambiente === 'producao' ? 'Na produção:' : 'No teste:');
    for (const linha of saida.split('\n')) {
      if (linha.trim() !== '') console.escrever(linha.trimEnd());
    }
  }

  for (const ambiente of AMBIENTES) {
    const { GRAFITE_CHAVE_DO_COFRE_ANTERIOR: _, ...semAnterior } = variaveis[ambiente];
    variaveis[ambiente] = semAnterior;
    await gravar(ambiente);
  }
  await reiniciarOsApps(dep, estado);
  console.escrever(
    'A chave do cofre foi trocada nos dois ambientes. Atualize a cópia dos config.env guardada fora do servidor e mantenha a de antes da troca, com a chave anterior, junto dos backups feitos até hoje: só ela abre os segredos deles (runbook, "Guarda das chaves").',
  );
}
