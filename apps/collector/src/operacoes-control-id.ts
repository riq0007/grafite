// A comparação e a restauração no coletor (spec comparacao-e-restauracao-do-control-id; change
// p5b-comparacao-e-restauracao, design, decisão 4): o coletor lê o ZIP do backup baixado pela API,
// entra no controle e, na comparação, conta cada categoria contra o que o controle tem; na
// restauração, segue a ordem das dependências, cria pelo `create_objects.fcgi` o que falta, conta o
// que já existe como ignorado e manda as fotos pelo `user_set_image.fcgi`. A categoria que o controle
// não deixa ler é comparada como vazia do lado dele e, na restauração, segue criando. A sessão
// sempre sai.
import {
  CATEGORIA_DAS_FOTOS,
  CATEGORIAS_DO_BACKUP,
  chaveDoItem,
  compararCategoria,
  type ItemDoControle,
  MENSAGENS_DO_BACKUP,
  ORDEM_DA_RESTAURACAO,
} from '@grafite/domain';
import yauzl from 'yauzl';

/** Uma operação que a API pede, com o login decifrado só para ela. */
export interface PedidoDeOperacao {
  id: string;
  tipo: 'restauracao' | 'comparacao';
  backupId: string | null;
  categorias: string[] | null;
  ativoId: string;
  rotulo: string;
  ip: string;
  porta: number;
  usuario: string;
  senha: string;
}

export type ResultadoDaOperacaoNoColetor =
  | {
      tipo: 'resultado';
      categorias: ({ categoria: string; situacao: 'ok' | 'erro' | 'pulado' } & Record<
        string,
        number | string | string[]
      >)[];
    }
  | { tipo: 'falha'; mensagem: string };

export interface OpcoesDaOperacao {
  espera?: number;
  esperaDaTentativa?: number;
}

/** As tabelas e as fotos do ZIP do backup. */
async function lerZip(conteudo: Buffer) {
  const zip = await yauzl.fromBufferPromise(conteudo, { lazyEntries: true });
  const tabelas = new Map<string, ItemDoControle[]>();
  const fotos = new Map<number, Buffer>();
  await new Promise<void>((pronto, recusar) => {
    zip.on('end', () => pronto());
    zip.on('error', recusar);
    zip.on('entry', (entrada: yauzl.Entry) => {
      const nome = entrada.fileName;
      const foto = /^face_images\/user_(\d+)\.jpg$/.exec(nome);
      const tabela = /^([a-z_]+)\.json$/.exec(nome);
      if (!foto && !tabela) {
        zip.readEntry();
        return;
      }
      zip.openReadStreamPromise(entrada).then((leitura) => {
        const partes: Buffer[] = [];
        leitura.on('data', (parte: Buffer) => partes.push(parte));
        leitura.on('error', recusar);
        leitura.on('end', () => {
          const bytes = Buffer.concat(partes);
          if (foto) fotos.set(Number(foto[1]), bytes);
          else if (tabela?.[1]) {
            try {
              const linhas = JSON.parse(bytes.toString('utf8')) as unknown;
              tabelas.set(
                tabela[1],
                Array.isArray(linhas)
                  ? (linhas.filter((item) => item && typeof item === 'object') as ItemDoControle[])
                  : [],
              );
            } catch {
              tabelas.set(tabela[1], []);
            }
          }
          zip.readEntry();
        });
      }, recusar);
    });
    zip.readEntry();
  });
  return { tabelas, fotos };
}

type Resposta = { status: number; bytes: Buffer } | null;

async function postar(
  endereco: string,
  corpo: object | Buffer,
  {
    espera,
    esperaDaTentativa,
    tentativasAMais = 1,
  }: {
    espera: number;
    esperaDaTentativa: number;
    tentativasAMais?: number;
  },
): Promise<Resposta> {
  const binario = Buffer.isBuffer(corpo);
  for (let tentativa = 0; ; tentativa++) {
    try {
      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: { 'content-type': binario ? 'application/octet-stream' : 'application/json' },
        body: binario ? new Uint8Array(corpo) : JSON.stringify(corpo),
        signal: AbortSignal.timeout(espera),
      });
      return { status: resposta.status, bytes: Buffer.from(await resposta.arrayBuffer()) };
    } catch {
      if (tentativa >= tentativasAMais) return null;
      await new Promise((pronto) => setTimeout(pronto, esperaDaTentativa));
    }
  }
}

const json = (resposta: Resposta): Record<string, unknown> | null => {
  if (!resposta) return null;
  try {
    const lido = JSON.parse(resposta.bytes.toString('utf8') || '{}') as unknown;
    return lido && typeof lido === 'object' && !Array.isArray(lido)
      ? (lido as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const falhaDaResposta = (resposta: Resposta) =>
  resposta === null ? 'O controle não respondeu.' : `O controle respondeu ${resposta.status}.`;

/** Faz a operação no controle: o resultado por categoria, ou a falha do login. */
export async function executarOperacao(
  pedido: PedidoDeOperacao,
  zip: Buffer,
  { espera = 10_000, esperaDaTentativa = 1000 }: OpcoesDaOperacao = {},
): Promise<ResultadoDaOperacaoNoColetor> {
  const { tabelas, fotos } = await lerZip(zip);
  const base = `http://${pedido.ip}:${pedido.porta}`;
  const comTentativa = { espera, esperaDaTentativa };
  const login = await postar(
    `${base}/login.fcgi`,
    { login: pedido.usuario, password: pedido.senha },
    comTentativa,
  );
  if (!login) return { tipo: 'falha', mensagem: 'O controle não respondeu ao login.' };
  const sessao = json(login)?.session;
  if (login.status !== 200 || typeof sessao !== 'string' || sessao === '') {
    return {
      tipo: 'falha',
      mensagem:
        login.status === 200 || login.status === 401 || login.status === 403
          ? MENSAGENS_DO_BACKUP.loginRecusado
          : `O controle respondeu ${login.status} ao login.`,
    };
  }
  const daSessao = `?session=${encodeURIComponent(sessao)}`;
  /** O que o controle tem da categoria, ou `null` quando ele não deixa ler. */
  const doControle = async (categoria: string) => {
    const resposta = await postar(
      `${base}/load_objects.fcgi${daSessao}`,
      { object: categoria },
      comTentativa,
    );
    const linhas = resposta?.status === 200 ? json(resposta)?.[categoria] : undefined;
    return Array.isArray(linhas)
      ? { linhas: linhas as ItemDoControle[], erro: null }
      : { linhas: null, erro: falhaDaResposta(resposta) };
  };
  const categorias: Extract<ResultadoDaOperacaoNoColetor, { tipo: 'resultado' }>['categorias'] = [];
  try {
    if (pedido.tipo === 'comparacao') {
      for (const categoria of CATEGORIAS_DO_BACKUP) {
        const lido = await doControle(categoria);
        const contagem = compararCategoria(
          categoria,
          tabelas.get(categoria) ?? [],
          lido.linhas ?? [],
        );
        categorias.push({
          categoria,
          situacao: 'ok',
          ...contagem,
          ...(lido.erro ? { erro: `O controle não deixou ler: ${lido.erro}` } : {}),
        });
      }
      return { tipo: 'resultado', categorias };
    }

    const escolhidas =
      pedido.categorias && pedido.categorias.length > 0 ? new Set(pedido.categorias) : null;
    for (const categoria of ORDEM_DA_RESTAURACAO) {
      if (escolhidas && !escolhidas.has(categoria)) {
        categorias.push({ categoria, situacao: 'pulado' });
        continue;
      }
      const itens = tabelas.get(categoria) ?? [];
      if (itens.length === 0) {
        categorias.push({
          categoria,
          situacao: 'ok',
          total: 0,
          criados: 0,
          ignorados: 0,
          erros: 0,
        });
        continue;
      }
      const existentes = new Set(
        ((await doControle(categoria)).linhas ?? []).flatMap((item) => {
          const chave = chaveDoItem(categoria, item);
          return chave === null ? [] : [chave];
        }),
      );
      let criados = 0;
      let ignorados = 0;
      const detalhes: string[] = [];
      for (const item of itens) {
        const chave = chaveDoItem(categoria, item);
        if (chave !== null && existentes.has(chave)) {
          ignorados += 1;
          continue;
        }
        const resposta = await postar(
          `${base}/create_objects.fcgi${daSessao}`,
          { object: categoria, values: [item] },
          { ...comTentativa, tentativasAMais: 0 },
        );
        if (resposta?.status === 200) criados += 1;
        else detalhes.push(`ID ${chave ?? '?'}: ${falhaDaResposta(resposta)}`);
      }
      const erros = detalhes.length;
      categorias.push({
        categoria,
        situacao: erros > 0 && criados === 0 ? 'erro' : 'ok',
        total: itens.length,
        criados,
        ignorados,
        erros,
        ...(erros > 0 ? { detalhes: detalhes.slice(0, 20) } : {}),
      });
    }
    if (!escolhidas || escolhidas.has(CATEGORIA_DAS_FOTOS)) {
      let criados = 0;
      const detalhes: string[] = [];
      for (const [usuario, foto] of fotos) {
        const resposta = await postar(
          `${base}/user_set_image.fcgi${daSessao}&user_id=${usuario}`,
          foto,
          { espera: espera * 1.5, esperaDaTentativa, tentativasAMais: 0 },
        );
        if (resposta?.status === 200) criados += 1;
        else detalhes.push(`Usuário ${usuario}: ${falhaDaResposta(resposta)}`);
      }
      categorias.push({
        categoria: CATEGORIA_DAS_FOTOS,
        situacao: detalhes.length > 0 && criados === 0 ? 'erro' : 'ok',
        total: fotos.size,
        criados,
        ignorados: 0,
        erros: detalhes.length,
        ...(detalhes.length > 0 ? { detalhes: detalhes.slice(0, 20) } : {}),
      });
    } else {
      categorias.push({ categoria: CATEGORIA_DAS_FOTOS, situacao: 'pulado' });
    }
    return { tipo: 'resultado', categorias };
  } finally {
    await postar(`${base}/logout.fcgi${daSessao}`, {}, { ...comTentativa, tentativasAMais: 0 });
  }
}
