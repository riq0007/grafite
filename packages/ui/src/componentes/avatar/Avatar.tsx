import { User } from 'lucide-react';
import { useState } from 'react';
import { Icone } from '../../icones/Icone.tsx';
import estilos from './Avatar.module.css';
import { iniciais } from './iniciais.ts';

/**
 * Onde o avatar aparece: na barra e nos menus, na linha das tabelas (segue a densidade, como a
 * miniatura) ou no título das fichas.
 */
export type TamanhoDoAvatar = 'barra' | 'linha' | 'ficha';

/** As miniaturas da foto pela largura em px, como as de 64, 128, 256 e 512 px que a API gera. */
export type ImagensDoAvatar = Readonly<Partial<Record<number, string>>>;

/**
 * O `sizes` de cada tamanho, em px, para o navegador escolher a miniatura pela densidade de pixels.
 * A linha usa a largura que o avatar ocupa (`auto`, com a carga preguiçosa); sem `auto`, o
 * navegador conta com o maior lado dela, o da densidade confortável.
 */
const SIZES: Record<TamanhoDoAvatar, string> = {
  barra: '20px',
  linha: 'auto, 36px',
  ficha: '48px',
};

export interface PropsDoAvatar {
  /** Sem nome (antes do login), o avatar é neutro: o ícone de pessoa, sem iniciais inventadas. */
  nome?: string;
  /** Uma imagem só, sem miniaturas. */
  imagem?: string;
  /** As miniaturas da foto: viram o `srcSet`, e o navegador baixa a menor que basta. */
  imagens?: ImagensDoAvatar;
  tamanho?: TamanhoDoAvatar;
  /** Quando o nome já aparece ao lado, o avatar é só desenho. */
  decorativo?: boolean;
  className?: string;
}

/** Foto da pessoa, recortada no círculo, ou, sem foto (ou se ela não carregar), as iniciais do nome. */
export function Avatar({
  nome,
  imagem,
  imagens,
  tamanho = 'linha',
  decorativo = false,
  className,
}: PropsDoAvatar) {
  const miniaturas = Object.entries(imagens ?? {})
    .filter((par): par is [string, string] => Boolean(par[1]))
    .map(([largura, endereco]) => ({ largura: Number(largura), endereco }))
    .sort((a, b) => a.largura - b.largura);
  const srcSet = miniaturas.map(({ largura, endereco }) => `${endereco} ${largura}w`).join(', ');
  const src = miniaturas[0]?.endereco ?? imagem;

  // A falha vale para esta foto: uma foto nova (outro endereço) é tentada de novo.
  const chave = srcSet || src || '';
  const [falhou, setFalhou] = useState<string | null>(null);
  const acessivel = decorativo
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': nome ?? 'Usuário' };
  return (
    <span
      {...acessivel}
      data-tamanho={tamanho}
      className={[estilos.avatar, className].filter(Boolean).join(' ')}
    >
      {src && falhou !== chave ? (
        // A carga preguiçosa, o `srcSet` e o `sizes` antes do `src`: o navegador já escolhe com eles.
        <img
          loading="lazy"
          decoding="async"
          {...(srcSet ? { srcSet, sizes: SIZES[tamanho] } : {})}
          src={src}
          alt=""
          className={estilos.foto}
          onError={() => setFalhou(chave)}
        />
      ) : nome ? (
        iniciais(nome)
      ) : (
        <Icone icone={User} />
      )}
    </span>
  );
}
