import { avisar, EscolhaDeImagem, MiniaturaDeAtivo } from '@grafite/ui';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Ativos.module.css';
import type { FichaDoAtivo as Ficha } from '../consultas.ts';
import { imagensDoAtivo } from './imagens.ts';

/**
 * A imagem própria do ativo, no alto da aba Dados (spec cadastro-de-ativos): quem edita o ativo
 * envia, troca e remove a imagem, com o progresso do envio e a recusa da API junto da escolha; os
 * outros só a veem. Sem imagem própria, a escolha mostra a do modelo ou o ícone do tipo, que voltam
 * a valer quando ela é removida.
 */
export function ImagemDoAtivo({
  ficha,
  aplicar,
}: {
  ficha: Ficha;
  aplicar: (ficha: Ficha) => void;
}) {
  const api = useApi();
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);
  const rotulo = `Imagem de ${ficha.rotulo}`;
  const miniatura = (descrita: boolean) => (
    <MiniaturaDeAtivo
      tipo={ficha.tipo.icone}
      {...imagensDoAtivo(ficha, 256)}
      rotulo={descrita ? rotulo : undefined}
      className={estilos.imagemDaFicha}
    />
  );

  if (!ficha.permite.editar) return miniatura(true);

  const propria = ficha.imagem !== null;
  return (
    <EscolhaDeImagem
      rotulo={rotulo}
      imagem={propria ? miniatura(false) : undefined}
      vazio={miniatura(false)}
      progresso={progresso}
      erro={erro}
      rotuloDeEscolher={propria ? 'Trocar imagem' : 'Enviar imagem'}
      explicacaoDaRemocao={
        ficha.modelo?.imagem
          ? 'A imagem deixa de aparecer na hora, e a ficha volta a mostrar a imagem do modelo.'
          : 'A imagem deixa de aparecer na hora, e a ficha volta a mostrar o ícone do tipo.'
      }
      aoEscolher={async (arquivo) => {
        definirErro(null);
        definirProgresso(0);
        const resultado = await pedir(
          () => api.enviarArquivo<Ficha>(`/ativos/${ficha.id}/imagem`, arquivo, definirProgresso),
          'trocar a imagem do ativo',
        );
        definirProgresso(undefined);
        if ('erro' in resultado) {
          definirErro(resultado.erro);
          return;
        }
        aplicar(resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Imagem do ativo trocada.' });
      }}
      aoRemover={async () => {
        const resultado = await pedir(
          () => api.DELETE('/ativos/{id}/imagem', { params: { path: { id: ficha.id } } }),
          'remover a imagem do ativo',
        );
        if ('erro' in resultado) return { erro: resultado.erro };
        aplicar(resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Imagem do ativo removida.' });
        return { ok: true };
      }}
    />
  );
}
