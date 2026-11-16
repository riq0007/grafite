// O comando e o código de saída em português (spec distribuicao-de-software, "O que a instalação
// faz"; change software-por-pacote, design, decisões 5 e 6). O comando é lido em pedaços, com as
// aspas, e cada pedaço conhecido do `msiexec`, dos instaladores EXE mais comuns e do
// `powershell -File` vira uma parte da frase, com o pedaço em mono entre parênteses. O comando sem
// nenhum pedaço conhecido fica só em mono.

/** Um trecho do comando, com o pedaço conhecido destacado. */
export interface TrechoDoComando {
  texto: string;
  destaque: boolean;
}

/** Uma parte da frase em português; a parte em mono é o pedaço do comando que ela explica. */
export interface ParteDaFrase {
  texto: string;
  mono: boolean;
}

export interface ExplicacaoDoComando {
  comando: TrechoDoComando[];
  /** A frase, ou `null` quando nenhum pedaço do comando é conhecido. */
  frase: ParteDaFrase[] | null;
  /** "sem perguntar e sem reiniciar", "sem perguntar", "sem reiniciar" ou `null`. */
  resumo: string | null;
}

interface Pedaco {
  texto: string;
  valor: string;
  inicio: number;
  fim: number;
}

/** Os pedaços do comando: o que não é espaço, com as aspas, que podem ter espaço dentro. */
function pedacos(comando: string): Pedaco[] {
  return [...comando.matchAll(/(?:"[^"]*"|[^\s"])+/g)].map((achado) => ({
    texto: achado[0],
    valor: achado[0].replaceAll('"', ''),
    inicio: achado.index ?? 0,
    fim: (achado.index ?? 0) + achado[0].length,
  }));
}

type TipoDaParte = 'acao' | 'modo' | 'depois';

interface Parte {
  tipo: TipoDaParte;
  texto: string;
  /** O pedaço entre parênteses na frase; a ação não tem. */
  pedaco: string | null;
}

interface Leitura {
  partes: Parte[];
  /** Os pedaços destacados no comando, pelo índice, com a peça a que cada um pertence. */
  destaques: Map<number, number>;
  semPerguntar: boolean;
  silencioso: boolean;
  semReiniciar: boolean;
  reinicia: boolean;
}

const SEM_JANELA = 'sem abrir janela nem fazer pergunta';
const SO_O_PROGRESSO = 'mostrando só o progresso';
const NAO_REINICIA = 'não reinicia a máquina quando terminar';

const nomeDoPrograma = (valor: string) => valor.toLowerCase().split(/[\\/]/).pop() ?? '';

function novaLeitura(): Leitura {
  return {
    partes: [],
    destaques: new Map(),
    semPerguntar: false,
    silencioso: false,
    semReiniciar: false,
    reinicia: false,
  };
}

/** O `msiexec`: aceita a opção com "/" ou com "-", sem diferenciar a maiúscula. */
function lerMsiexec(lidos: Pedaco[]): Leitura {
  const leitura = novaLeitura();
  const destacar = (indice: number, peca = indice) => leitura.destaques.set(indice, peca);
  for (let indice = 1; indice < lidos.length; indice++) {
    const pedaco = lidos[indice] as Pedaco;
    const opcao = pedaco.valor.toLowerCase().replace(/^-/, '/');
    const parte = (tipo: TipoDaParte, texto: string) => {
      leitura.partes.push({ tipo, texto, pedaco: tipo === 'acao' ? null : pedaco.texto });
      destacar(indice, tipo === 'acao' ? 0 : indice);
    };
    if (opcao === '/i' || opcao === '/package') {
      parte('acao', 'instala o arquivo');
      indice++;
    } else if (opcao === '/x' || opcao === '/uninstall') {
      parte('acao', 'desinstala o programa');
      indice++;
    } else if (/^\/q(n[+-]?)?$/.test(opcao) || opcao === '/quiet') {
      parte('modo', SEM_JANELA);
      leitura.semPerguntar = true;
      leitura.silencioso = true;
    } else if (/^\/qb[+!-]*$/.test(opcao) || opcao === '/passive') {
      parte('modo', SO_O_PROGRESSO);
      leitura.semPerguntar = true;
    } else if (opcao === '/norestart' || opcao === 'reboot=reallysuppress') {
      parte('depois', NAO_REINICIA);
      leitura.semReiniciar = true;
    } else if (opcao === '/forcerestart') {
      parte('depois', 'reinicia a máquina ao terminar');
      leitura.reinicia = true;
    } else if (opcao === 'allusers=1') {
      parte('modo', 'para todos os usuários');
    } else if (/^\/l[*a-z+!]*$/.test(opcao) && lidos[indice + 1]) {
      parte('depois', `grava o log em ${lidos[indice + 1]?.texto}`);
      indice++;
    }
  }
  // O programa vai junto com a ação, na mesma peça.
  if (leitura.partes.length > 0) destacar(0, 0);
  return leitura;
}

/** Os instaladores EXE mais comuns: o NSIS, o InstallShield, o Inno Setup e os de "--silent". */
function lerInstalador(lidos: Pedaco[]): Leitura {
  const leitura = novaLeitura();
  for (let indice = 1; indice < lidos.length; indice++) {
    const pedaco = lidos[indice] as Pedaco;
    const opcao = pedaco.valor.toLowerCase();
    const parte = (tipo: TipoDaParte, texto: string) => {
      leitura.partes.push({ tipo, texto, pedaco: pedaco.texto });
      leitura.destaques.set(indice, indice);
    };
    if (
      pedaco.valor === '/S' ||
      pedaco.valor === '/s' ||
      ['/verysilent', '--silent', '/quiet'].includes(opcao)
    ) {
      parte('modo', 'sem perguntar');
      leitura.semPerguntar = true;
      leitura.silencioso = true;
    } else if (opcao === '/silent') {
      parte('modo', 'sem perguntar');
      leitura.semPerguntar = true;
    } else if (opcao === '/suppressmsgboxes') {
      parte('modo', 'sem caixas de mensagem');
    } else if (opcao === '/norestart') {
      parte('depois', NAO_REINICIA);
      leitura.semReiniciar = true;
    }
  }
  if (leitura.partes.length > 0)
    leitura.partes.unshift({ tipo: 'acao', texto: 'roda o instalador', pedaco: null });
  return leitura;
}

/** O `powershell -File <roteiro>`, com as outras opções do PowerShell antes. */
function lerPowershell(lidos: Pedaco[]): Leitura {
  const leitura = novaLeitura();
  const indice = lidos.findIndex(
    (pedaco, posicao) => posicao > 0 && pedaco.valor.toLowerCase() === '-file',
  );
  const roteiro = lidos[indice + 1];
  if (indice > 0 && roteiro) {
    leitura.partes.push({
      tipo: 'acao',
      texto: `roda o roteiro do PowerShell ${roteiro.texto}`,
      pedaco: null,
    });
    leitura.destaques.set(0, 0);
    leitura.destaques.set(indice, 0);
  }
  return leitura;
}

/** A frase: a ação, os modos separados por vírgula e o que vem depois, com o "e" no último. */
function montarFrase(leitura: Leitura): ParteDaFrase[] {
  const vistas = new Set<string>();
  const partes = leitura.partes.filter(({ texto }) => !vistas.has(texto) && vistas.add(texto));
  const ordem: TipoDaParte[] = ['acao', 'modo', 'depois'];
  const emOrdem = ordem.flatMap((tipo) => partes.filter((parte) => parte.tipo === tipo));
  const frase: ParteDaFrase[] = [];
  const escrever = (texto: string, mono = false) => {
    const ultima = frase.at(-1);
    if (ultima && ultima.mono === mono && !mono) ultima.texto += texto;
    else frase.push({ texto, mono });
  };
  const depois = emOrdem.filter((parte) => parte.tipo === 'depois');
  emOrdem.forEach((parte, posicao) => {
    if (posicao > 0) {
      const ultimaDepois = parte.tipo === 'depois' && parte === depois.at(-1);
      escrever(
        ultimaDepois
          ? ' e '
          : parte.tipo === 'modo' && emOrdem[posicao - 1]?.tipo === 'acao'
            ? ' '
            : ', ',
      );
    }
    escrever(parte.texto);
    if (parte.pedaco) {
      escrever(' (');
      escrever(parte.pedaco, true);
      escrever(')');
    }
  });
  escrever('.');
  if (leitura.silencioso && leitura.semReiniciar && !leitura.reinicia)
    escrever(' A pessoa nem percebe.');
  return frase;
}

/** O comando em trechos: os pedaços da mesma peça vão juntos, com o espaço entre eles. */
function trechos(
  comando: string,
  lidos: Pedaco[],
  destaques: Map<number, number>,
): TrechoDoComando[] {
  const lista: (TrechoDoComando & { peca: number | null })[] = [];
  const acrescentar = (texto: string, peca: number | null) => {
    const ultimo = lista.at(-1);
    if (ultimo && ultimo.peca === peca) ultimo.texto += texto;
    else lista.push({ texto, destaque: peca !== null, peca });
  };
  let fim = 0;
  lidos.forEach((pedaco, indice) => {
    const peca = destaques.get(indice) ?? null;
    const espaco = comando.slice(fim, pedaco.inicio);
    if (espaco) acrescentar(espaco, peca !== null && lista.at(-1)?.peca === peca ? peca : null);
    acrescentar(pedaco.texto, peca);
    fim = pedaco.fim;
  });
  if (fim < comando.length) acrescentar(comando.slice(fim), null);
  return lista.map(({ texto, destaque }) => ({ texto, destaque }));
}

/** O comando explicado: os trechos destacados, a frase e o resumo de perguntar e reiniciar. */
export function explicarOComando(comando: string): ExplicacaoDoComando {
  const lidos = pedacos(comando);
  const programa = nomeDoPrograma(lidos[0]?.valor ?? '');
  const leitura = ['msiexec', 'msiexec.exe'].includes(programa)
    ? lerMsiexec(lidos)
    : ['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].includes(programa)
      ? lerPowershell(lidos)
      : lerInstalador(lidos);
  if (leitura.partes.length === 0) {
    return { comando: [{ texto: comando, destaque: false }], frase: null, resumo: null };
  }
  const semReiniciar = leitura.semReiniciar && !leitura.reinicia;
  const resumo =
    leitura.semPerguntar && semReiniciar
      ? 'sem perguntar e sem reiniciar'
      : leitura.semPerguntar
        ? 'sem perguntar'
        : semReiniciar
          ? 'sem reiniciar'
          : null;
  return {
    comando: trechos(comando, lidos, leitura.destaques),
    frase: montarFrase(leitura),
    resumo,
  };
}

/** As frases dos códigos de saída do Windows Installer que a TI mais vê. */
const CODIGOS_DE_SAIDA: Record<number, string> = {
  1602: 'Cancelada na máquina: a instalação foi fechada antes do fim. Tente de novo.',
  1603:
    'Erro fatal: costuma ser outra instalação em andamento. Espere alguns minutos e tente de novo; ' +
    'se repetir, reinicie a máquina.',
  1618: 'Outra instalação em andamento na máquina. Espere ela terminar e tente de novo.',
  1619:
    'O pacote não abriu: o arquivo não chegou inteiro ou não é um instalador válido. Confira o ' +
    'arquivo do pacote.',
  1633:
    'Plataforma sem suporte: o pacote não serve para o Windows desta máquina, como o de 64 bits ' +
    'num Windows de 32.',
  1638: 'Outra versão já instalada: desinstale a da máquina ou use um pacote que atualize.',
  1641: 'Pede reinício: o instalador começou a reiniciar a máquina para terminar.',
  3010: 'Pede reinício: a instalação termina quando a máquina reiniciar.',
};

/** A frase do código de saída, ou `null` no código sem frase, que aparece só com o número. */
export function explicarOCodigoDeSaida(codigo: number): string | null {
  return CODIGOS_DE_SAIDA[codigo] ?? null;
}

/** O código de saída da mensagem do agente ("exit status: `1603'"), ou `null`. */
export function codigoDaMensagem(mensagem: string | null | undefined): number | null {
  const achado = /exit status:\s*`?(-?\d+)'?/i.exec(mensagem ?? '');
  return achado ? Number(achado[1]) : null;
}
