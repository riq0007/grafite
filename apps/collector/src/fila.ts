// A fila em disco do coletor (spec coletor-local, "Fila em disco"; design do P2a, decisão 8). Todo lote
// vira um arquivo JSON na pasta da fila, com o momento e a chave no nome, gravado num temporário e
// renomeado, para a escrita interrompida não deixar um lote pela metade. Um laço só manda os lotes, o
// mais antigo primeiro, e apaga o arquivo do aceito: as leituras chegam na ordem em que foram feitas,
// e a fila sobrevive ao reinício. Conforme a resposta:
// - API fora do ar ou com erro do servidor: o lote fica, e a tentativa seguinte espera 5 s, que dobram
//   a cada falha até 5 min;
// - lote recusado como inválido: descartado, com o motivo no log;
// - token recusado: a fila para de mandar e avisa o coletor, até ele retomar.
// O lote com mais de 7 dias é descartado sem mandar, e a saúde conta os descartados.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RespostaDaApi } from './api.ts';
import type { Registro } from './configuracao.ts';
import type { LoteParaEnviar } from './lotes.ts';

const PRIMEIRA_ESPERA = 5_000;
const ESPERA_MAXIMA = 5 * 60_000;
const IDADE_MAXIMA = 7 * 24 * 60 * 60_000;
const NOME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-[\w-]+\.json$/;

/** O momento no nome, sem os dois-pontos que o Windows não aceita; a ordem dos nomes é a dos lotes. */
const nomeDoArquivo = (momento: number, chave: string) =>
  `${new Date(momento).toISOString().replace(/[:.]/g, '-')}-${chave}.json`;

function momentoDoArquivo(nome: string): number {
  const [, dia, hora, minuto, segundo, milesimo] = NOME.exec(nome) ?? [];
  return Date.parse(`${dia}T${hora}:${minuto}:${segundo}.${milesimo}Z`);
}

/** Marca a ação para daqui a `ms` e devolve como desmarcar. */
export type Agendar = (acao: () => void, ms: number) => () => void;

const agendarNoRelogio: Agendar = (acao, ms) => {
  const temporizador = setTimeout(acao, ms);
  return () => clearTimeout(temporizador);
};

export interface EstadoDaFila {
  naFila: number;
  descartados: number;
  ultimoLoteAceito: Date | null;
  tokenRecusado: boolean;
  /** Desde quando a API não responde aos lotes, ou `null` quando respondeu no último. */
  apiSemResponderDesde: Date | null;
}

export function criarFila({
  pasta,
  api,
  agora = () => new Date(),
  log,
  agendar = agendarNoRelogio,
  aoRecusarToken = () => {},
}: {
  pasta: string;
  api: { lote: (lote: LoteParaEnviar) => Promise<RespostaDaApi<unknown>> };
  agora?: () => Date;
  log: Registro;
  agendar?: Agendar;
  aoRecusarToken?: () => void;
}) {
  let naFila = 0;
  let descartados = 0;
  let ultimoLoteAceito: Date | null = null;
  let tokenRecusado = false;
  let apiSemResponderDesde: Date | null = null;
  let espera = PRIMEIRA_ESPERA;
  let desmarcar: (() => void) | null = null;
  let parada = false;
  let ultimoMomento = 0;
  let rodando: Promise<void> | null = null;
  let deNovo = false;

  const podeMandar = () => !parada && !tokenRecusado && desmarcar === null;

  async function lotesNaPasta() {
    return (await readdir(pasta)).filter((nome) => NOME.test(nome)).sort();
  }

  async function apagar(nome: string) {
    await rm(join(pasta, nome), { force: true });
    naFila = Math.max(0, naFila - 1);
  }

  async function descartar(nome: string, dados: object, mensagem: string) {
    await apagar(nome);
    descartados += 1;
    log.warn(dados, mensagem);
  }

  /** Manda os lotes da pasta, em ordem, até acabar, a API falhar ou recusar o token. */
  async function passar() {
    for (const nome of await lotesNaPasta()) {
      if (!podeMandar()) return;
      if (agora().getTime() - momentoDoArquivo(nome) > IDADE_MAXIMA) {
        await descartar(nome, { arquivo: nome }, 'lote com mais de 7 dias descartado da fila');
        continue;
      }
      let lote: LoteParaEnviar;
      try {
        lote = JSON.parse(await readFile(join(pasta, nome), 'utf8')) as LoteParaEnviar;
      } catch {
        await descartar(nome, { arquivo: nome }, 'lote ilegível descartado da fila');
        continue;
      }
      const resposta = await api.lote(lote);
      if (resposta.tipo === 'indisponivel') {
        apiSemResponderDesde ??= agora();
        log.warn(
          { motivo: resposta.motivo, esperaMs: espera },
          'API indisponível; o lote fica na fila',
        );
        desmarcar = agendar(() => {
          desmarcar = null;
          void esvaziar();
        }, espera);
        espera = Math.min(espera * 2, ESPERA_MAXIMA);
        return;
      }
      apiSemResponderDesde = null;
      if (resposta.tipo === 'token-recusado') {
        tokenRecusado = true;
        log.warn({}, 'token do coletor recusado ao mandar o lote');
        aoRecusarToken();
        return;
      }
      espera = PRIMEIRA_ESPERA;
      if (resposta.tipo === 'recusado') {
        await descartar(
          nome,
          { chave: lote.chave, motivo: resposta.motivo },
          'lote recusado pela API e descartado',
        );
        continue;
      }
      await apagar(nome);
      ultimoLoteAceito = agora();
    }
  }

  /** Manda o que estiver na fila, se puder; a chamada durante o envio junta-se a ele. */
  function esvaziar(): Promise<void> {
    if (rodando) {
      deNovo = true;
      return rodando;
    }
    if (!podeMandar()) return Promise.resolve();
    rodando = (async () => {
      try {
        do {
          deNovo = false;
          await passar();
        } while (deNovo && podeMandar());
      } catch (erro) {
        log.warn({ motivo: String(erro) }, 'falha ao ler a fila');
      } finally {
        rodando = null;
      }
    })();
    return rodando;
  }

  return {
    /** Prepara a pasta, apaga a escrita interrompida e conta os lotes que ficaram. */
    async iniciar() {
      parada = false;
      await mkdir(pasta, { recursive: true });
      const nomes = await readdir(pasta);
      await Promise.all(
        nomes
          .filter((nome) => nome.endsWith('.tmp'))
          .map((nome) => rm(join(pasta, nome), { force: true })),
      );
      const lotes = nomes.filter((nome) => NOME.test(nome)).sort();
      naFila = lotes.length;
      const ultimo = lotes.at(-1);
      if (ultimo) ultimoMomento = momentoDoArquivo(ultimo);
    },

    /** Grava o lote e tenta mandar; a falha ao gravar descarta o lote, com o motivo no log. */
    async guardar(lote: LoteParaEnviar) {
      // O momento só anda para a frente, mesmo com o relógio voltando.
      ultimoMomento = Math.max(agora().getTime(), ultimoMomento + 1);
      const caminho = join(pasta, nomeDoArquivo(ultimoMomento, lote.chave));
      try {
        await writeFile(`${caminho}.tmp`, JSON.stringify(lote));
        await rename(`${caminho}.tmp`, caminho);
      } catch (erro) {
        descartados += 1;
        log.warn({ chave: lote.chave, motivo: String(erro) }, 'falha ao gravar o lote na fila');
        return;
      }
      naFila += 1;
      void esvaziar();
    },

    esvaziar,

    /** Volta a mandar depois do token aceito de novo, sem esperar a tentativa marcada. */
    retomar() {
      tokenRecusado = false;
      desmarcar?.();
      desmarcar = null;
      void esvaziar();
    },

    /** Para de mandar e espera o envio em andamento; o que for guardado depois fica na pasta. */
    async parar() {
      parada = true;
      desmarcar?.();
      desmarcar = null;
      await rodando;
    },

    estado: (): EstadoDaFila => ({
      naFila,
      descartados,
      ultimoLoteAceito,
      tokenRecusado,
      apiSemResponderDesde,
    }),
  };
}

export type Fila = ReturnType<typeof criarFila>;
