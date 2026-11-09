// Ligar e desligar cada ambiente pelo comando de operação (spec operacao-servicos, "Serviços e
// configurações pelo comando de operação"; change painel-da-operacao, design, decisão 8): o parar
// do app do ambiente e, na produção, do coletor, com o nome do banco da produção digitado antes; e o
// iniciar do que estiver parado, com a saúde do app conferida antes do coletor.
import type { AmbienteInstalado } from './estado.ts';
import { comServicosParados, mensagemDe, vejaNoRunbook } from './falhas.ts';
import { lerInstalacao } from './instalacao.ts';
import {
  BANCOS,
  NO_SERVIDOR,
  PORTAS,
  SERVICOS,
  type ServicoDaInstalacao,
  servicosDaInstalacao,
} from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { EstadoDoServico, Servicos } from './windows/servicos.ts';

const TEXTO_DO_ESTADO: Record<EstadoDoServico, string> = {
  rodando: 'rodando',
  parado: 'parado',
  mudando: 'iniciando ou parando',
  ausente: 'não registrado',
};

/** As linhas do servicos estado, uma por serviço da declaração, com o nome na plataforma. */
export async function linhasDoEstado(
  servicos: Servicos,
  nomeDoServico: (id: string) => string,
  declaracao: readonly ServicoDaInstalacao[] = servicosDaInstalacao(),
): Promise<string[]> {
  const linhas: string[] = [];
  for (const { id, nome } of declaracao) {
    linhas.push(`${nome} (${nomeDoServico(id)}): ${TEXTO_DO_ESTADO[await servicos.estado(id)]}`);
  }
  return linhas;
}

export interface DependenciasDosServicos {
  raiz: string;
  console: Console;
  servicos: Servicos;
  saude: Saude;
  plataforma: PlataformaDaInstalacao;
}

/** Os serviços que desligam o ambiente, na ordem: na produção, o coletor antes do app. */
const PARA_DESLIGAR: Record<AmbienteInstalado, readonly string[]> = {
  producao: [SERVICOS.coletor, SERVICOS.producao],
  teste: [SERVICOS.teste],
};

export async function pararAmbiente(
  dep: DependenciasDosServicos,
  ambiente: AmbienteInstalado,
): Promise<void> {
  const { console, servicos, plataforma } = dep;
  await lerInstalacao(dep.raiz, plataforma.nome);
  const producao = ambiente === 'producao';
  if (producao) {
    await console.confirmarDigitado(
      'Para desligar a produção, digite o nome do banco da produção',
      BANCOS.producao.nome,
    );
  }
  for (const id of PARA_DESLIGAR[ambiente]) await servicos.parar(id);
  const ligar = `${NO_SERVIDOR[plataforma.nome].comando} servicos iniciar --ambiente ${ambiente}`;
  console.escrever(
    producao
      ? `A produção foi desligada: o app e o coletor estão parados. Para ligá-la: ${ligar}.`
      : `O teste foi desligado: o app do teste está parado. Para ligá-lo: ${ligar}.`,
  );
}

/**
 * Reinicia o app do ambiente e, na produção, o coletor, com a saúde do app conferida antes do
 * coletor. A falha os deixa parados e aponta a seção do runbook.
 */
export async function reiniciarAmbiente(
  { servicos, saude, plataforma }: Omit<DependenciasDosServicos, 'raiz' | 'console'>,
  ambiente: AmbienteInstalado,
  versao: string,
  secaoDoRunbook = 'Serviços',
): Promise<void> {
  const producao = ambiente === 'producao';
  await comServicosParados(
    servicos,
    PARA_DESLIGAR[ambiente],
    `${producao ? 'O app e o coletor da produção ficaram parados.' : 'O app do teste ficou parado.'} ${vejaNoRunbook(secaoDoRunbook, plataforma.nome)}`,
    async () => {
      await servicos.iniciar(producao ? SERVICOS.producao : SERVICOS.teste);
      conferirSaude(
        await saude.local(PORTAS[ambiente]),
        { versao, ambiente },
        producao ? 'O app da produção' : 'O app do teste',
      );
      if (producao) await servicos.iniciar(SERVICOS.coletor);
    },
  );
}

export async function iniciarAmbiente(
  dep: DependenciasDosServicos,
  ambiente: AmbienteInstalado,
): Promise<void> {
  const { console, servicos, saude, plataforma } = dep;
  const { estado } = await lerInstalacao(dep.raiz, plataforma.nome);
  const versao = estado.ambientes[ambiente].atual ?? '';
  const producao = ambiente === 'producao';
  let iniciados = 0;
  const iniciarSeParado = async (id: string) => {
    if ((await servicos.estado(id)) === 'rodando') return;
    await servicos.iniciar(id);
    iniciados += 1;
  };
  try {
    await iniciarSeParado(producao ? SERVICOS.producao : SERVICOS.teste);
    conferirSaude(
      await saude.local(PORTAS[ambiente]),
      { versao, ambiente },
      producao ? 'O app da produção' : 'O app do teste',
    );
    if (producao) {
      for (const id of [SERVICOS.coletor, ...plataforma.servicosDaProducao]) {
        await iniciarSeParado(id);
      }
    }
  } catch (erro) {
    throw new Error(`${mensagemDe(erro)}\n${vejaNoRunbook('Serviços', plataforma.nome)}`, {
      cause: erro,
    });
  }
  const [nome, ligado] = producao ? ['A produção', 'ligada'] : ['O teste', 'ligado'];
  console.escrever(
    `${nome} ${iniciados > 0 ? 'foi' : 'já estava'} ${ligado} e responde, na versão ${versao}.`,
  );
}
