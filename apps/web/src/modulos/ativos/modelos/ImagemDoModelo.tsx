import { avisar, EscolhaDeImagem, MiniaturaDeAtivo } from '@grafite/ui';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Ativos.module.css';
import type { Modelo } from '../consultas.ts';
import { imagemDoModelo } from './imagens.ts';

/**
 * A imagem do modelo na ficha (spec catalogo-de-ativos): quem edita modelos troca e remove a
 * imagem, com o progresso do envio e a recusa da API junto da escolha; os outros só a veem. Sem
 * imagem, o ícone do tipo.
 */
export function ImagemDoModelo({
  modelo,
  aplicar,
}: {
  modelo: Modelo;
  aplicar: (modelo: Modelo) => void;
}) {
  const api = useApi();
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);
  const rotulo = `Imagem de ${modelo.fabricante} ${modelo.nome}`;
  const miniatura = (descrita: boolean) => (
    <MiniaturaDeAtivo
      tipo={modelo.tipo.icone}
      imagemDoModelo={imagemDoModelo(modelo, 256)}
      rotulo={descrita ? rotulo : undefined}
      className={estilos.imagemDaFicha}
    />
  );

  if (!modelo.permite.editar) return miniatura(true);

  return (
    <EscolhaDeImagem
      rotulo={rotulo}
      imagem={modelo.imagem ? miniatura(false) : undefined}
      vazio={miniatura(false)}
      progresso={progresso}
      erro={erro}
      rotuloDeEscolher="Trocar imagem"
      explicacaoDaRemocao="A imagem deixa de aparecer na hora, e o modelo fica com o ícone do tipo."
      aoEscolher={async (arquivo) => {
        definirErro(null);
        definirProgresso(0);
        const resultado = await pedir(
          () =>
            api.enviarArquivo<Modelo>(`/modelos/${modelo.id}/imagem`, arquivo, definirProgresso),
          'trocar a imagem do modelo',
        );
        definirProgresso(undefined);
        if ('erro' in resultado) {
          definirErro(resultado.erro);
          return;
        }
        aplicar(resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Imagem do modelo trocada.' });
      }}
      aoRemover={async () => {
        const resultado = await pedir(
          () => api.DELETE('/modelos/{id}/imagem', { params: { path: { id: modelo.id } } }),
          'remover a imagem do modelo',
        );
        if ('erro' in resultado) return { erro: resultado.erro };
        aplicar(resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Imagem do modelo removida.' });
        return { ok: true };
      }}
    />
  );
}
