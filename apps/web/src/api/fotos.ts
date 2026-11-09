// Os endereços das fotos (design do F2c, decisão 8): a pessoa e o estado da sessão trazem só o id
// da foto, e a web monta o endereço de cada miniatura. Foto nova é endereço novo, e o navegador
// guarda cada uma sem servir a antiga depois da troca.
import type { ImagensDoAvatar } from '@grafite/ui';

/** As miniaturas que a API gera de cada foto, pelo lado do quadrado em px. */
export const TAMANHOS_DA_FOTO = [64, 128, 256, 512] as const;

const miniaturas = (base: string, foto: { id: string } | null): ImagensDoAvatar | undefined =>
  foto
    ? Object.fromEntries(TAMANHOS_DA_FOTO.map((lado) => [lado, `${base}/${foto.id}/${lado}`]))
    : undefined;

/** As miniaturas da foto de uma pessoa, para quem pode ver a pessoa. */
export const miniaturasDaPessoa = (pessoaId: string, foto: { id: string } | null) =>
  miniaturas(`/api/pessoas/${pessoaId}/foto`, foto);

/** As miniaturas da foto da pessoa da própria conta, que ela vê sem permissão. */
export const miniaturasDaConta = (foto: { id: string } | null) =>
  miniaturas('/api/conta/foto', foto);
