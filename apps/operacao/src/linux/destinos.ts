// Um destino novo do backup no servidor Linux, depois da instalação (change painel-da-operacao,
// design, decisão 8): um contêiner descartável da imagem do comando, com o destino montado pelo
// `--mount`, que recusa a pasta que não existe em vez de criá-la, como o `--volume` faz. Assim, um
// compartilhamento que não está montado não vira uma pasta no disco do servidor. O contêiner grava
// a marca do destino e o dá ao usuário dos contêineres, que é quem grava o backup.
import { type ExecutarProcesso, MARCA_DO_DESTINO } from '@grafite/operacao';
import { USUARIO_DOS_CONTEINERES } from '../layout.ts';

/** Grava a marca e dá o destino ao usuário dos contêineres, ou diz que não deu. */
const MARCAR_O_DESTINO = `printf '%s\\n' "$3" > "$1/${MARCA_DO_DESTINO}" && { chown "$2" "$1" 2>/dev/null || echo sem-dono; }`;

export async function prepararDestinoNovo({
  executar,
  imagemDoComando,
  destino,
  marca,
}: {
  executar: ExecutarProcesso;
  imagemDoComando: string;
  destino: string;
  marca: string;
}): Promise<void> {
  const { uid, gid } = USUARIO_DOS_CONTEINERES;
  const { codigo, saida, erro } = await executar(
    'docker',
    [
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--mount',
      `type=bind,source=${destino},target=${destino}`,
      '--entrypoint',
      'sh',
      imagemDoComando,
      '-c',
      MARCAR_O_DESTINO,
      'sh',
      destino,
      `${uid}:${gid}`,
      marca,
    ],
    { env: process.env },
  );
  if (codigo !== 0) {
    const motivo = (erro || saida).trim();
    if (/bind source path does not exist/i.test(motivo)) {
      throw new Error(
        `O destino ${destino} não existe: crie a pasta, ou monte o compartilhamento, antes de configurá-lo.`,
      );
    }
    throw new Error(`O destino ${destino} não aceita gravação: ${motivo}`);
  }
  if (saida.includes('sem-dono')) {
    throw new Error(
      `O destino ${destino} não aceitou o dono dos contêineres (${uid}): dê ao usuário ${uid} a permissão de gravar nele.`,
    );
  }
}
