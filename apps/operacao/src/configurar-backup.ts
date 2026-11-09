// O backup da produção pelo comando de operação (spec operacao-servicos, "Serviços e configurações
// pelo comando de operação"; change painel-da-operacao, design, decisão 8): `backup configurar`
// confere o formato de cada valor e cada destino antes de gravar, grava na configuração da produção,
// com o acesso restrito, e reinicia a produção com saúde. O que não vem no pedido fica como está.
// Os formatos são os que a API confere na partida, e as mensagens dizem a opção que não serve.
import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { comServicosParados, mensagemDe, vejaNoRunbook } from './falhas.ts';
import { lerInstalacao } from './instalacao.ts';
import { PORTAS, SERVICOS } from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDoBackup {
  raiz: string;
  console: Console;
  servicos: Servicos;
  saude: Saude;
  plataforma: PlataformaDaInstalacao;
}

/** O que mudar no backup, como a linha de comando o dá. */
export interface PedidoDoBackup {
  /** As pastas, separadas por ponto e vírgula. */
  destinos?: string;
  /** HH:MM-HH:MM. */
  janela?: string;
  /** Os diários, os semanais e os mensais guardados, como 7,4,12. */
  retencao?: string;
  testeDeRestauracao?: string;
}

const HORA = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
const JANELA = new RegExp(`^(${HORA})-(${HORA})$`);
const RETENCAO = /^(\d+),(\d+),(\d+)$/;
const TESTES = ['semanal', 'diario'] as const;

/** Os valores conferidos, no formato do config.env, ou o motivo da recusa. */
function conferirPedido(pedido: PedidoDoBackup): Record<string, string> {
  const variaveis: Record<string, string> = {};
  if (pedido.destinos !== undefined) {
    const destinos = pedido.destinos.split(';').map((destino) => destino.trim());
    if (destinos.some((destino) => destino === '' || !isAbsolute(destino))) {
      throw new Error('--destinos: use pastas completas, separadas por ponto e vírgula.');
    }
    const repetido = destinos.find((destino, i) => destinos.indexOf(destino) !== i);
    if (repetido !== undefined) {
      throw new Error(`--destinos: o destino ${repetido} aparece duas vezes.`);
    }
    variaveis.GRAFITE_BACKUP_DESTINOS = destinos.join(';');
  }
  if (pedido.janela !== undefined) {
    const [, inicio = '', fim = ''] = JANELA.exec(pedido.janela.trim()) ?? [];
    if (inicio === '' || inicio >= fim) {
      throw new Error('--janela: use HH:MM-HH:MM, como 00:00-06:00, com o início antes do fim.');
    }
    variaveis.GRAFITE_BACKUP_JANELA = `${inicio}-${fim}`;
  }
  if (pedido.retencao !== undefined) {
    if (!RETENCAO.test(pedido.retencao.trim())) {
      throw new Error(
        '--retencao: use três inteiros, os diários, os semanais e os mensais, como 7,4,12.',
      );
    }
    variaveis.GRAFITE_BACKUP_RETENCAO = pedido.retencao.trim();
  }
  if (pedido.testeDeRestauracao !== undefined) {
    const teste = pedido.testeDeRestauracao.trim();
    if (!(TESTES as readonly string[]).includes(teste)) {
      throw new Error('--teste-de-restauracao: use semanal ou diario.');
    }
    variaveis.GRAFITE_BACKUP_TESTE = teste;
  }
  return variaveis;
}

/** Uma lista em pt-BR: "a", "a e b", "a, b e c". */
const lista = (itens: readonly string[]) =>
  itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;

/** O que fica configurado, como a mensagem do fim o diz. */
function descrever(variaveis: Record<string, string | undefined>): string {
  const destinos = (variaveis.GRAFITE_BACKUP_DESTINOS ?? '').split(';').filter(Boolean);
  const [inicio = '00:00', fim = '06:00'] = (variaveis.GRAFITE_BACKUP_JANELA ?? '').split('-');
  const [diarios = '7', semanais = '4', mensais = '12'] = (
    variaveis.GRAFITE_BACKUP_RETENCAO ?? ''
  ).split(',');
  const teste = variaveis.GRAFITE_BACKUP_TESTE === 'diario' ? 'diário' : 'semanal';
  return `${destinos.length === 1 ? 'o destino' : 'os destinos'} ${lista(destinos)}, a janela das ${inicio} às ${fim}, ${diarios} diários, ${semanais} semanais e ${mensais} mensais guardados e o teste de restauração ${teste}`;
}

export async function configurarBackup(
  dep: DependenciasDoBackup,
  pedido: PedidoDoBackup,
): Promise<void> {
  const novas = conferirPedido(pedido);
  const { plataforma } = dep;
  const instalacao = await lerInstalacao(dep.raiz, plataforma.nome);
  const caminho = instalacao.pastas.producao.configEnv;
  const variaveis = await lerConfigEnv(caminho);
  // Cada destino do pedido, o novo e o que já estava: um compartilhamento que deixou de existir
  // também é recusado.
  for (const destino of (novas.GRAFITE_BACKUP_DESTINOS ?? '').split(';').filter(Boolean)) {
    try {
      await plataforma.prepararDestinoDoBackup(instalacao, destino);
    } catch (erro) {
      throw new Error(`${mensagemDe(erro)} Nada foi gravado.`, { cause: erro });
    }
  }

  const gravadas = { ...variaveis, ...novas };
  await writeFile(caminho, gerarConfigEnv(gravadas));
  await plataforma.restringirAcesso(caminho);
  // No Linux, o contêiner do app monta os destinos: o projeto do Compose muda com eles.
  await plataforma.regerarProjeto(
    instalacao.estado,
    (gravadas.GRAFITE_BACKUP_DESTINOS ?? '').split(';').filter(Boolean),
  );
  await comServicosParados(
    dep.servicos,
    [SERVICOS.coletor, SERVICOS.producao],
    `O app e o coletor da produção ficaram parados. ${vejaNoRunbook('Backup', plataforma.nome)}`,
    async () => {
      await dep.servicos.iniciar(SERVICOS.producao);
      conferirSaude(
        await dep.saude.local(PORTAS.producao),
        { versao: instalacao.estado.ambientes.producao.atual ?? '', ambiente: 'producao' },
        'O app da produção',
      );
      await dep.servicos.iniciar(SERVICOS.coletor);
    },
  );
  dep.console.escrever(
    `O backup da produção está configurado, e o app reiniciou com saúde: ${descrever(gravadas)}.`,
  );
}
