// O backup do Control iD no coletor (spec backup-do-control-id, "Resultado do backup"; change
// p5a-backup-do-control-id, design, decisão 4): o coletor entra no controle com o login do cofre, lê
// as informações do sistema e as dez categorias pelo `load_objects.fcgi`, depois a foto de cada
// usuário pelo `user_get_image.fcgi`, e sai. Uma categoria que falha não para as outras. O ZIP sai
// no formato do PMG, montado na memória pelo yazl: o `metadata.json`, o `device_info.json`, um JSON
// por categoria e as fotos em `face_images/user_<id>.jpg`. O login que não dá a sessão é a falha do
// backup inteiro, sem arquivo. O usuário e a senha só vão ao pedido do login.
import { CATEGORIAS_DO_BACKUP, MENSAGENS_DO_BACKUP } from '@grafite/domain';
import yazl from 'yazl';

/** O backup que a API pede, com o login decifrado só para ele. */
export interface PedidoDeBackup {
  id: string;
  ativoId: string;
  rotulo: string;
  ip: string;
  porta: number;
  usuario: string;
  senha: string;
}

export type ResultadoDoBackupNoColetor =
  | { tipo: 'zip'; conteudo: Buffer }
  | { tipo: 'falha'; mensagem: string };

export interface OpcoesDoBackup {
  /** A espera de cada pedido, em ms (padrão: 10 s). */
  espera?: number;
  /** A espera de cada foto, em ms (padrão: 15 s). */
  esperaDasFotos?: number;
  /** A espera antes da tentativa a mais, em ms (padrão: 1 s). */
  esperaDaTentativa?: number;
  agora?: () => Date;
}

type Resposta = { status: number; tipo: string; bytes: Buffer } | null;

/** Um POST em JSON ao controle, com uma tentativa a mais; `null` quando ele não responde. */
async function postar(
  endereco: string,
  corpo: object,
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
  for (let tentativa = 0; ; tentativa++) {
    try {
      const resposta = await fetch(endereco, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(espera),
      });
      return {
        status: resposta.status,
        tipo: resposta.headers.get('content-type') ?? '',
        bytes: Buffer.from(await resposta.arrayBuffer()),
      };
    } catch {
      if (tentativa >= tentativasAMais) return null;
      await new Promise((pronto) => setTimeout(pronto, esperaDaTentativa));
    }
  }
}

const json = (resposta: Resposta): unknown => {
  if (!resposta) return null;
  const texto = resposta.bytes.toString('utf8');
  if (texto.trim() === '') return {};
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
};

const objeto = (valor: unknown): Record<string, unknown> | null =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;

interface CategoriaDoPmg {
  category: string;
  status: 'OK' | 'ERRO';
  count: number;
  error?: string;
}

const falhaDaResposta = (resposta: Resposta) =>
  resposta === null ? 'O controle não respondeu.' : `O controle respondeu ${resposta.status}.`;

/** Monta o ZIP na memória, com os arquivos na ordem dada. */
function zipar(arquivos: readonly { nome: string; conteudo: Buffer }[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const { nome, conteudo } of arquivos) zip.addBuffer(conteudo, nome);
  zip.end();
  return new Promise((resolver, recusar) => {
    const partes: Buffer[] = [];
    zip.outputStream.on('data', (parte: Buffer) => partes.push(parte));
    zip.outputStream.on('end', () => resolver(Buffer.concat(partes)));
    zip.outputStream.on('error', recusar);
  });
}

/** Faz o backup do controle do pedido: o ZIP, ou a falha com a mensagem. */
export async function fazerBackup(
  pedido: PedidoDeBackup,
  {
    espera = 10_000,
    esperaDasFotos = 15_000,
    esperaDaTentativa = 1000,
    agora = () => new Date(),
  }: OpcoesDoBackup = {},
): Promise<ResultadoDoBackupNoColetor> {
  const base = `http://${pedido.ip}:${pedido.porta}`;
  const comTentativa = { espera, esperaDaTentativa };
  const login = await postar(
    `${base}/login.fcgi`,
    { login: pedido.usuario, password: pedido.senha },
    comTentativa,
  );
  if (!login) return { tipo: 'falha', mensagem: 'O controle não respondeu ao login.' };
  if (login.status === 401 || login.status === 403) {
    return { tipo: 'falha', mensagem: MENSAGENS_DO_BACKUP.loginRecusado };
  }
  const sessao = objeto(json(login))?.session;
  if (login.status !== 200 || typeof sessao !== 'string' || sessao === '') {
    return login.status === 200
      ? { tipo: 'falha', mensagem: MENSAGENS_DO_BACKUP.loginRecusado }
      : { tipo: 'falha', mensagem: `O controle respondeu ${login.status} ao login.` };
  }
  const daSessao = `?session=${encodeURIComponent(sessao)}`;
  const categorias: CategoriaDoPmg[] = [];
  const arquivos: { nome: string; conteudo: Buffer }[] = [];
  let informacoes: Record<string, unknown> = {};
  try {
    const lida = await postar(`${base}/system_information.fcgi${daSessao}`, {}, comTentativa);
    const lidas = lida?.status === 200 ? objeto(json(lida)) : null;
    if (lidas) {
      informacoes = lidas;
      categorias.push({ category: 'device_info', status: 'OK', count: 1 });
    } else {
      categorias.push({
        category: 'device_info',
        status: 'ERRO',
        count: 0,
        error: falhaDaResposta(lida),
      });
    }

    let usuarios: unknown[] = [];
    for (const categoria of CATEGORIAS_DO_BACKUP) {
      const resposta = await postar(
        `${base}/load_objects.fcgi${daSessao}`,
        { object: categoria },
        comTentativa,
      );
      const linhas = resposta?.status === 200 ? objeto(json(resposta))?.[categoria] : undefined;
      if (!Array.isArray(linhas)) {
        categorias.push({
          category: categoria,
          status: 'ERRO',
          count: 0,
          error: falhaDaResposta(resposta),
        });
        arquivos.push({ nome: `${categoria}.json`, conteudo: Buffer.from('[]') });
        continue;
      }
      if (categoria === 'users') usuarios = linhas;
      categorias.push({ category: categoria, status: 'OK', count: linhas.length });
      arquivos.push({ nome: `${categoria}.json`, conteudo: Buffer.from(JSON.stringify(linhas)) });
    }

    // As fotos: o que não é JPEG fica de fora, como no PMG; só o controle calado é erro.
    let fotos = 0;
    let caladas = 0;
    for (const usuario of usuarios) {
      const id = Number(objeto(usuario)?.id);
      if (!Number.isInteger(id)) continue;
      const resposta = await postar(
        `${base}/user_get_image.fcgi${daSessao}`,
        { user_id: id },
        { espera: esperaDasFotos, esperaDaTentativa, tentativasAMais: 0 },
      );
      if (!resposta) {
        caladas += 1;
        continue;
      }
      const { bytes } = resposta;
      if (resposta.status === 200 && bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        arquivos.push({ nome: `face_images/user_${id}.jpg`, conteudo: bytes });
        fotos += 1;
      }
    }
    categorias.push(
      caladas > 0 && fotos === 0
        ? {
            category: 'face_images',
            status: 'ERRO',
            count: 0,
            error: 'O controle não respondeu às fotos.',
          }
        : { category: 'face_images', status: 'OK', count: fotos },
    );
  } finally {
    // A sessão sempre sai, sem tentativa a mais; a falha da saída não muda o backup.
    await postar(`${base}/logout.fcgi${daSessao}`, {}, { ...comTentativa, tentativasAMais: 0 });
  }

  const comErro = categorias.filter((categoria) => categoria.status === 'ERRO');
  const metadados = {
    version: 'grafite-controlid-1',
    created_at: agora().toISOString(),
    device: { id: pedido.ativoId, name: pedido.rotulo, ip: pedido.ip, port: pedido.porta },
    system_info: {
      serial: typeof informacoes.serial === 'string' ? informacoes.serial : null,
      firmware: typeof informacoes.firmware === 'string' ? informacoes.firmware : null,
      product_name: typeof informacoes.product_name === 'string' ? informacoes.product_name : null,
    },
    status:
      comErro.length === 0 ? 'SUCESSO' : comErro.length === categorias.length ? 'FALHA' : 'PARCIAL',
    total_records: categorias.reduce((soma, categoria) => soma + categoria.count, 0),
    categories: categorias,
    errors: comErro.map(({ category, error }) => ({ category, error })),
  };
  const conteudo = await zipar([
    { nome: 'metadata.json', conteudo: Buffer.from(JSON.stringify(metadados, null, 2)) },
    { nome: 'device_info.json', conteudo: Buffer.from(JSON.stringify(informacoes, null, 2)) },
    ...arquivos,
  ]);
  return { tipo: 'zip', conteudo };
}
