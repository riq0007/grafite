// Os canais de fora nos testes (change p3c-email-e-push, design, decisão 1): um servidor SMTP de
// verdade, em processo, que guarda os e-mails recebidos já lidos, e um serviço de push falso, em
// HTTPS com um certificado próprio, como os de verdade, que guarda os pedidos e decifra o que cada
// aparelho recebe (RFC 8291 e RFC 8188).
import {
  createDecipheriv,
  createECDH,
  createHmac,
  type ECDH,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Agent, createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { type ParsedMail, simpleParser } from 'mailparser';
import { generate } from 'selfsigned';
import { SMTPServer } from 'smtp-server';

/** O endereço com o usuário e a senha, montado aqui para não ficar escrito no código. */
export function comSenha(endereco: string, usuario: string, senha: string): string {
  const url = new URL(endereco);
  url.username = usuario;
  url.password = senha;
  return url.href;
}

/** Um servidor SMTP que exige o usuário e a senha dados e guarda cada e-mail recebido. */
export async function servidorDeEmail({
  usuario = 'grafite',
  senha,
}: {
  usuario?: string;
  senha: string;
}) {
  const mensagens: ParsedMail[] = [];
  const servidor = new SMTPServer({
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    logger: false,
    onAuth(autenticacao, _sessao, feito) {
      if (autenticacao.username === usuario && autenticacao.password === senha) {
        feito(null, { user: usuario });
      } else {
        feito(new Error('Usuário ou senha recusados'));
      }
    },
    onData(fluxo, _sessao, feito) {
      simpleParser(fluxo).then(
        (mensagem) => {
          mensagens.push(mensagem);
          feito();
        },
        (erro) => feito(erro),
      );
    },
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const { port } = servidor.server.address() as AddressInfo;
  return {
    porta: port,
    /** O endereço do SMTP, com a senha certa ou com outra. */
    url: (comOutraSenha = senha) => comSenha(`smtp://127.0.0.1:${port}`, usuario, comOutraSenha),
    mensagens,
    fechar: () => new Promise<void>((pronto) => servidor.close(() => pronto())),
  };
}

const hmac = (chave: Buffer, dados: Buffer) => createHmac('sha256', chave).update(dados).digest();

/** Decifra o conteúdo de um push com a chave privada e o segredo do aparelho (RFC 8291). */
export function decifrarPush(corpo: Buffer, receptor: ECDH, segredo: Buffer): string {
  const sal = corpo.subarray(0, 16);
  const tamanhoDaChave = corpo.readUInt8(20);
  const chaveDoServidor = corpo.subarray(21, 21 + tamanhoDaChave);
  const cifrado = corpo.subarray(21 + tamanhoDaChave);
  const chaveDoSegredo = hmac(segredo, receptor.computeSecret(chaveDoServidor));
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receptor.getPublicKey(),
    chaveDoServidor,
  ]);
  const material = hmac(chaveDoSegredo, Buffer.concat([info, Buffer.from([1])]));
  const prk = hmac(sal, material);
  const chave = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const decifrador = createDecipheriv('aes-128-gcm', chave, nonce);
  decifrador.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([
    decifrador.update(cifrado.subarray(0, cifrado.length - 16)),
    decifrador.final(),
  ]);
  // O registro termina no delimitador 2, seguido dos zeros do preenchimento.
  let fim = claro.length - 1;
  while (fim >= 0 && claro[fim] === 0) fim--;
  return claro.subarray(0, fim).toString('utf8');
}

export interface PedidoAoPush {
  caminho: string;
  cabecalhos: IncomingHttpHeaders;
  corpo: Buffer;
}

/**
 * Um serviço de push falso, em HTTPS em 127.0.0.1: responde 201 a cada pedido, ou o código dado
 * ao caminho, e guarda os pedidos. O certificado dele é próprio: quem o chama confia pelo
 * `agente` ou pelo `certificado`. Cada aparelho criado nele tem as chaves de uma inscrição de
 * verdade e decifra o que recebeu.
 */
export async function servicoDePushFalso() {
  const pedidos: PedidoAoPush[] = [];
  const respostas = new Map<string, number>();
  const { private: chave, cert: certificado } = await generate(
    [{ name: 'commonName', value: '127.0.0.1' }],
    { extensions: [{ name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }] },
  );
  const servidor = createServer({ key: chave, cert: certificado }, (pedido, resposta) => {
    const partes: Buffer[] = [];
    pedido.on('data', (parte: Buffer) => partes.push(parte));
    pedido.on('end', () => {
      const caminho = pedido.url ?? '';
      pedidos.push({ caminho, cabecalhos: pedido.headers, corpo: Buffer.concat(partes) });
      resposta.writeHead(respostas.get(caminho) ?? 201).end();
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, '127.0.0.1', pronto));
  const { port } = servidor.address() as AddressInfo;
  const origem = `https://127.0.0.1:${port}`;
  return {
    origem,
    /** O certificado do serviço, em PEM, para quem precisa confiar nele. */
    certificado,
    /** Um agente HTTPS que confia no certificado do serviço. */
    agente: new Agent({ ca: certificado }),
    pedidos,
    /** O serviço passa a responder este código a este caminho. */
    responder: (caminho: string, codigo: number) => respostas.set(caminho, codigo),
    /** Um aparelho inscrito neste serviço, e o que ele recebeu, já decifrado. */
    aparelho(caminho = `/push/${randomUUID()}`) {
      const receptor = createECDH('prime256v1');
      receptor.generateKeys();
      const segredo = randomBytes(16);
      return {
        caminho,
        inscricao: {
          endpoint: `${origem}${caminho}`,
          p256dh: receptor.getPublicKey('base64url'),
          auth: segredo.toString('base64url'),
        },
        recebidos: () =>
          pedidos
            .filter((pedido) => pedido.caminho === caminho)
            .map((pedido) => JSON.parse(decifrarPush(pedido.corpo, receptor, segredo))),
      };
    },
    fechar: () => new Promise<void>((pronto) => servidor.close(() => pronto())),
  };
}

/** Um par novo das chaves do push, a pública não comprimida e a privada, em base64url. */
export function parDoPush() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { d = '', x = '', y = '' } = privateKey.export({ format: 'jwk' });
  const publica = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(x, 'base64url'),
    Buffer.from(y, 'base64url'),
  ]).toString('base64url');
  return { chavePublica: publica, chavePrivada: d };
}
