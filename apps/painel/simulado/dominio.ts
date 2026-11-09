// O servidor de mentira do painel (change painel-da-operacao, design, decisão 10): o estado de um
// servidor Windows com o Grafite e os comandos de operação de mentira, com as mesmas perguntas, as
// mesmas confirmações digitadas e as mesmas mensagens dos de verdade. O servidor simulado da página
// e os testes dela rodam estes comandos pelo mesmo executor de tarefas, o mesmo canal de eventos e
// as mesmas rotas do comando de verdade: só o que roda no servidor é de mentira.
import { avisosDoEstado, type EstadoDoServidor } from '../../operacao/src/estado-do-servidor.ts';
import { servicosDaInstalacao } from '../../operacao/src/layout.ts';
import type { LogDoServico, PedidoDoLog } from '../../operacao/src/logs.ts';
import type { ConsoleDoPainel } from '../../operacao/src/painel/console.ts';
import type {
  BackupsListados,
  ConfiguracoesDoServidor,
  PacoteDaVersao,
} from '../../operacao/src/painel/painel.ts';
import type { EstadoDoServico } from '../../operacao/src/windows/servicos.ts';

/** O que muda o servidor de mentira, para cada cenário dos testes. */
export interface CenarioSimulado {
  /** Quanto cada passo de uma tarefa demora, em ms. */
  esperaMs?: number;
  /** Os serviços parados no começo, pelo nome no Windows. */
  parados?: string[];
  /** Os dias até o certificado vencer. */
  diasDoCertificado?: number;
  /** O momento do servidor. */
  agora?: Date;
}

export interface DominioSimulado {
  estado(): EstadoDoServidor;
  rodar(
    argumentos: string[],
    console: ConsoleDoPainel,
    escreverErro: (texto: string) => void,
  ): Promise<number>;
  logs(servico: string, pedido: PedidoDoLog): LogDoServico[];
  pacotes(): PacoteDaVersao[];
  backups(): BackupsListados[];
  configuracoes(): ConfiguracoesDoServidor;
}

const DIA = 24 * 60 * 60 * 1000;
const DESTINOS = ['D:\\Backups\\Grafite', '\\\\nas01\\backups\\grafite'];
const BANCO_DA_PRODUCAO = 'grafite';

/** O valor da opção nos argumentos, como o de --ambiente. */
const opcao = (argumentos: string[], nome: string) => {
  const indice = argumentos.indexOf(`--${nome}`);
  return indice < 0 ? undefined : argumentos[indice + 1];
};

/** O nome do backup de um momento, como 2026-10-28T0500Z. */
const nomeDoBackup = (momento: Date) => {
  const iso = momento.toISOString();
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
};

export function criarDominioSimulado(cenario: CenarioSimulado = {}): DominioSimulado {
  const agora = () => cenario.agora ?? new Date('2026-10-28T12:00:00.000Z');
  const esperar = () => new Promise<void>((pronto) => setTimeout(pronto, cenario.esperaMs ?? 0));
  const estados = new Map<string, EstadoDoServico>(
    servicosDaInstalacao().map(({ id }) => [
      id,
      cenario.parados?.includes(id) ? 'parado' : 'rodando',
    ]),
  );
  const versoes = {
    producao: { atual: '0.1.1', anterior: '0.1.0' as string | null },
    teste: { atual: '0.1.1', anterior: null as string | null },
  };
  const enderecos = {
    producao: ['grafite.empresa.com.br'],
    teste: ['grafite-teste.empresa.com.br'],
    mapaDoTeste: { 'grafite.empresa.com.br': 'grafite-teste.empresa.com.br' } as Record<
      string,
      string
    >,
  };
  const ontem = new Date(agora().getTime() - 7 * 60 * 60 * 1000);
  const backups = DESTINOS.map((destino) => ({
    destino,
    backups: [
      { nome: nomeDoBackup(ontem), criadoEm: ontem.toISOString(), tamanho: 412e6, versao: '0.1.1' },
    ],
  }));
  let ultimoBackup = { situacao: 'feito' as const, momento: ontem.toISOString() };
  let testeDeRestauracao = {
    situacao: 'feito' as const,
    momento: new Date(agora().getTime() - 2 * DIA).toISOString(),
  };
  const configuracao = {
    email: {
      smtp: 'smtp://grafite@smtp.empresa.com.br:587' as string | null,
      remetente: 'Grafite <grafite@empresa.com.br>' as string | null,
      senhaConfigurada: true,
    },
    backup: {
      destinos: [...DESTINOS],
      janela: '00:00-06:00',
      retencao: '7,4,12',
      teste: 'semanal',
    },
    certificado: {
      modo: 'publico',
      email: 'ti@empresa.com.br',
      provedorDns: 'cloudflare',
      tokenConfigurado: true,
    } as ConfiguracoesDoServidor['certificado'],
  };

  const estado = (): EstadoDoServidor => {
    const dias = cenario.diasDoCertificado ?? 75;
    const semAvisos: Omit<EstadoDoServidor, 'avisos'> = {
      plataforma: 'windows',
      servicos: servicosDaInstalacao().map(({ id, nome, ambiente, ligadoPeloAmbiente }) => ({
        id,
        nome,
        nomeNaPlataforma: id,
        ambiente,
        ligadoPeloAmbiente,
        estado: estados.get(id) ?? 'ausente',
      })),
      ambientes: {
        producao: { ...versoes.producao, enderecos: enderecos.producao },
        teste: { ...versoes.teste, enderecos: enderecos.teste },
      },
      backups: backups.map(({ destino, backups: doDestino }) => {
        const ultimo = doDestino.at(-1);
        return {
          destino,
          ultimo:
            ultimo === undefined
              ? null
              : { nome: ultimo.nome, momento: ultimo.criadoEm, versao: ultimo.versao },
        };
      }),
      ultimoBackup,
      testeDeRestauracao,
      certificado: {
        ...(configuracao.certificado.modo === 'publico'
          ? { modo: 'publico', email: configuracao.certificado.email, provedorDns: 'cloudflare' }
          : configuracao.certificado.ac === 'empresa'
            ? {
                modo: 'interno',
                ac: 'empresa',
                certificado: configuracao.certificado.certificado,
                chave: configuracao.certificado.chave,
              }
            : { modo: 'interno', ac: 'caddy' }),
        venceEm: new Date(agora().getTime() + dias * DIA).toISOString(),
        dias,
      },
      disco: { livre: 412e9, total: 1000e9 },
    };
    return { ...semAvisos, avisos: avisosDoEstado(semAvisos, agora()) };
  };

  /** Os comandos de mentira: os mesmos argumentos, perguntas e mensagens dos de verdade. */
  async function rodar(
    argumentos: string[],
    console: ConsoleDoPainel,
    escreverErro: (texto: string) => void,
  ): Promise<number> {
    const [comando, acao] = argumentos;
    const ambiente = opcao(argumentos, 'ambiente') === 'teste' ? 'teste' : 'producao';
    const nome = ambiente === 'producao' ? 'A produção' : 'O teste';
    const confirmarProducao = (pedido: string) =>
      console.confirmarDigitado(pedido, BANCO_DA_PRODUCAO);
    try {
      if (
        comando === 'servicos' &&
        (acao === 'parar' || acao === 'iniciar' || acao === 'reiniciar')
      ) {
        const ids = ambiente === 'producao' ? ['grafite-coletor', 'grafite'] : ['grafite-teste'];
        if (acao === 'parar' && ambiente === 'producao') {
          await confirmarProducao('Para desligar a produção, digite o nome do banco da produção');
        }
        await esperar();
        for (const id of ids) estados.set(id, acao === 'parar' ? 'parado' : 'rodando');
        console.escrever(
          acao === 'parar'
            ? `${nome} foi ${ambiente === 'producao' ? 'desligada' : 'desligado'}: ${ambiente === 'producao' ? 'o app e o coletor estão parados' : 'o app do teste está parado'}.`
            : `${nome} ${acao === 'reiniciar' ? (ambiente === 'producao' ? 'foi reiniciada' : 'foi reiniciado') : ambiente === 'producao' ? 'foi ligada' : 'foi ligado'} e responde, na versão ${versoes[ambiente].atual}.`,
        );
        return 0;
      }
      if (comando === 'atualizar') {
        const pacote = argumentos[1] ?? '';
        const versao = /grafite-(\d+\.\d+\.\d+)-/.exec(pacote)?.[1] ?? '0.0.0';
        console.escrever(`Conferindo o pacote ${pacote}.`);
        await esperar();
        if (ambiente === 'producao' && versoes.teste.atual !== versao) {
          escreverErro(
            `A produção só recebe a versão que já roda no teste, e o teste roda a ${versoes.teste.atual}: atualize o teste para a ${versao} antes.`,
          );
          return 1;
        }
        if (ambiente === 'producao') {
          console.escrever('Fazendo o backup da produção, antes de mudar qualquer coisa.');
          await esperar();
          const momento = agora();
          console.escrever(`Backup ${nomeDoBackup(momento)} feito e conferido em ${DESTINOS[0]}.`);
          await confirmarProducao(
            `Para atualizar a produção para a ${versao}, digite o nome do banco da produção`,
          );
        }
        console.escrever('Aplicando as migrations.');
        await esperar();
        versoes[ambiente] = { atual: versao, anterior: versoes[ambiente].atual };
        console.escrever(`${nome} roda a versão ${versao}.`);
        return 0;
      }
      if (comando === 'voltar') {
        const { anterior, atual } = versoes[ambiente];
        if (anterior === null) {
          escreverErro(`${nome} não tem versão anterior: ela só existe depois de uma atualização.`);
          return 1;
        }
        if (ambiente === 'producao') {
          await confirmarProducao(
            `Para voltar a produção à ${anterior}, digite o nome do banco da produção`,
          );
        }
        await esperar();
        versoes[ambiente] = { atual: anterior, anterior: atual };
        console.escrever(
          `${nome} voltou à ${anterior}. Para ir de novo à ${atual}: grafite voltar --ambiente ${ambiente}.`,
        );
        return 0;
      }
      if (comando === 'backup' && acao === 'agora') {
        console.escrever('Fazendo o backup da produção.');
        await esperar();
        const momento = agora();
        for (const destino of backups) {
          destino.backups.push({
            nome: nomeDoBackup(momento),
            criadoEm: momento.toISOString(),
            tamanho: 415e6,
            versao: versoes.producao.atual,
          });
        }
        ultimoBackup = { situacao: 'feito', momento: momento.toISOString() };
        console.escrever(
          `Backup ${nomeDoBackup(momento)} feito em todos os destinos e conferido: ${DESTINOS[0]}\\grafite-producao\\${nomeDoBackup(momento)}.`,
        );
        return 0;
      }
      if (comando === 'backup' && acao === 'listar') {
        for (const { destino, backups: doDestino } of backups) {
          console.escrever(destino);
          for (const backup of doDestino) {
            console.escrever(
              `  ${backup.nome}  ${Math.round(backup.tamanho / 1e6)} MB  versão ${backup.versao}`,
            );
          }
        }
        return 0;
      }
      if (comando === 'backup' && acao === 'testar') {
        console.escrever('Restaurando o backup mais novo na instância do teste.');
        await esperar();
        const ultimo = backups[0]?.backups.at(-1);
        testeDeRestauracao = { situacao: 'feito', momento: agora().toISOString() };
        console.escrever(
          `O backup ${ultimo?.nome ?? ''} restaurou na instância do teste: 48 tabelas, 12.840 linhas e 37 arquivos conferidos.`,
        );
        return 0;
      }
      if (comando === 'backup' && acao === 'configurar') {
        const destinos = opcao(argumentos, 'destinos');
        if (destinos !== undefined) configuracao.backup.destinos = destinos.split(';');
        configuracao.backup.janela = opcao(argumentos, 'janela') ?? configuracao.backup.janela;
        configuracao.backup.retencao =
          opcao(argumentos, 'retencao') ?? configuracao.backup.retencao;
        configuracao.backup.teste =
          opcao(argumentos, 'teste-de-restauracao') ?? configuracao.backup.teste;
        await esperar();
        console.escrever('O backup da produção está configurado, e o app reiniciou com saúde.');
        return 0;
      }
      if (comando === 'preparar-teste') {
        const ultimo = backups[0]?.backups.at(-1);
        console.escrever(`A cópia vem do backup ${ultimo?.nome ?? ''}, em ${DESTINOS[0]}.`);
        await console.confirmarDigitado(
          'Para trocar os dados do teste pela cópia da produção, digite o nome do banco do teste',
          'grafite_teste',
        );
        await esperar();
        console.escrever('O teste recebeu a cópia da produção, com os endereços do teste.');
        return 0;
      }
      if (comando === 'restaurar') {
        const backup = argumentos[1] ?? '';
        await console.perguntarSegredo('Senha do usuário postgres do PostgreSQL da produção');
        await confirmarProducao(
          `Para restaurar a produção a partir do backup ${backup}, digite o nome do banco da produção`,
        );
        await esperar();
        console.escrever(
          `A produção foi restaurada do backup ${backup}. O banco de antes ficou guardado como grafite_antes_${nomeDoBackup(agora()).replace(/[-:]/g, '').toLowerCase()}: confira os dados e, depois, apague-o como diz o runbook ("Depois da restauração").`,
        );
        return 0;
      }
      if (comando === 'cofre') {
        await confirmarProducao(
          'Para trocar a chave do cofre nos dois ambientes, digite o nome do banco da produção',
        );
        await esperar();
        console.escrever(
          'A chave do cofre foi trocada nos dois ambientes. Atualize a cópia dos config.env guardada fora do servidor e mantenha a de antes da troca, com a chave anterior, junto dos backups feitos até hoje: só ela abre os segredos deles (runbook, "Guarda das chaves").',
        );
        return 0;
      }
      if (comando === 'email' && acao === 'configurar') {
        const smtp = new URL(opcao(argumentos, 'smtp') ?? '');
        if (smtp.username !== '' && smtp.password === '') {
          await console.perguntarSegredo('Senha do SMTP');
        }
        smtp.password = '';
        configuracao.email = {
          smtp: smtp.href,
          remetente: opcao(argumentos, 'remetente') ?? null,
          senhaConfigurada: smtp.username !== '',
        };
        await esperar();
        console.escrever(
          'O e-mail da produção está configurado, e o app reiniciou com saúde. Confira o envio com grafite email testar --para <e-mail>.',
        );
        return 0;
      }
      if (comando === 'email' && acao === 'testar') {
        await esperar();
        escreverErro('O servidor de e-mail recusou a autenticação. (535 Authentication failed)');
        return 1;
      }
      if (comando === 'certificado') {
        const modo = opcao(argumentos, 'modo');
        if (modo === 'publico') {
          await console.perguntarSegredo(
            'Token da Cloudflare, com permissão de editar o DNS só da zona',
          );
          configuracao.certificado = {
            modo: 'publico',
            email: opcao(argumentos, 'email') ?? '',
            provedorDns: 'cloudflare',
            tokenConfigurado: true,
          };
        } else {
          configuracao.certificado = { modo: 'interno', ac: 'caddy', tokenConfigurado: false };
        }
        await esperar();
        console.escrever('O certificado do proxy mudou, e os dois ambientes respondem pelo HTTPS.');
        return 0;
      }
      if (comando === 'enderecos' && acao === 'acrescentar') {
        const endereco = argumentos[2] ?? '';
        const [primeiro, ...resto] = endereco.split('.');
        const doTeste = await console.perguntar(
          `Endereço do teste que corresponde a ${endereco}`,
          [`${primeiro}-teste`, ...resto].join('.'),
        );
        enderecos.producao.push(endereco);
        enderecos.teste.push(doTeste);
        enderecos.mapaDoTeste[endereco] = doTeste;
        console.escrever(
          `A produção atende também por https://${endereco}, e o teste, por https://${doTeste}. Cadastre os dois no DNS da empresa, apontando para este servidor.`,
        );
        return 0;
      }
      if (comando === 'enderecos' && acao === 'tirar') {
        const endereco = argumentos[2] ?? '';
        if (enderecos.producao.length === 1) {
          escreverErro(
            `A produção precisa de pelo menos um endereço: acrescente outro antes de tirar ${endereco}.`,
          );
          return 1;
        }
        await console.confirmarDigitado(`Para tirar ${endereco}, digite o endereço`, endereco);
        enderecos.producao = enderecos.producao.filter((item) => item !== endereco);
        console.escrever(
          `A produção deixou de atender por https://${endereco}. Tire-o do DNS da empresa.`,
        );
        return 0;
      }
      if (comando === 'conta' && acao === 'criar') {
        const usuario = opcao(argumentos, 'usuario') ?? '';
        const pessoa = opcao(argumentos, 'pessoa') ?? '';
        await esperar();
        console.escrever(
          `Conta ${usuario} (${pessoa}) criada na organização do endereço ${opcao(argumentos, 'endereco')}${argumentos.includes('--administrador') ? ', com o perfil Administrador' : ''}.`,
        );
        console.escrever('Senha temporária: 7Q4-TV8-KJ2-P3M');
        console.escrever(
          'Guarde esta senha agora: ela não aparece de novo. Na primeira entrada, a conta troca a senha.',
        );
        return 0;
      }
      if (comando === 'conta' && acao === 'redefinir') {
        await esperar();
        console.escrever(
          `Acesso de ${opcao(argumentos, 'usuario')} redefinido: nenhuma sessão estava aberta.`,
        );
        console.escrever('Senha temporária: 9H2-WQ5-LM7-X4C');
        console.escrever(
          'Guarde esta senha agora: ela não aparece de novo. Na próxima entrada, a conta troca a senha.',
        );
        return 0;
      }
      escreverErro(`O servidor simulado não conhece o comando ${argumentos.join(' ')}.`);
      return 2;
    } catch (erro) {
      escreverErro(erro instanceof Error ? erro.message : String(erro));
      return 1;
    }
  }

  return {
    estado,
    rodar,
    logs(servico, { linhas, busca }) {
      const todas = Array.from({ length: 120 }, (_, i) =>
        i % 25 === 24
          ? `{"level":40,"time":"2026-10-28T11:${String(i % 60).padStart(2, '0')}:00Z","msg":"Coleta atrasada: Disponibilidade na rede"}`
          : `{"level":30,"time":"2026-10-28T11:${String(i % 60).padStart(2, '0')}:00Z","msg":"pedido atendido","servico":"${servico}"}`,
      );
      const achadas = busca
        ? todas.filter((linha) => linha.toLowerCase().includes(busca.toLowerCase()))
        : todas;
      return [
        {
          origem: `C:\\Grafite\\producao\\logs\\${servico}.out.log`,
          linhas: achadas.slice(-linhas),
        },
      ];
    },
    pacotes: () => [
      {
        caminho: 'C:\\Users\\ti\\Downloads\\grafite-0.2.0-windows-x64.zip',
        nome: 'grafite-0.2.0-windows-x64.zip',
        versao: '0.2.0',
        tamanho: 56e6,
        modificadoEm: '2026-10-28T10:30:00.000Z',
      },
      {
        caminho: 'C:\\Temp\\grafite-0.1.1-windows-x64.zip',
        nome: 'grafite-0.1.1-windows-x64.zip',
        versao: '0.1.1',
        tamanho: 54e6,
        modificadoEm: '2026-10-27T09:00:00.000Z',
      },
    ],
    backups: () =>
      backups.map(({ destino, backups: doDestino }) => ({ destino, backups: [...doDestino] })),
    configuracoes: () => ({
      email: { ...configuracao.email },
      backup: { ...configuracao.backup, destinos: [...configuracao.backup.destinos] },
      certificado: { ...configuracao.certificado },
      enderecos: {
        producao: [...enderecos.producao],
        teste: [...enderecos.teste],
        mapaDoTeste: { ...enderecos.mapaDoTeste },
      },
      organizacaoOperadora: 'grafite.empresa.com.br',
    }),
  };
}
