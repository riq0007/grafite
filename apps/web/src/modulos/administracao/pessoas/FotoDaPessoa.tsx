import { Avatar, avisar, EscolhaDeImagem } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { miniaturasDaPessoa } from '../../../api/fotos.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { chaveDaFicha, type Ficha } from './ficha.ts';

/**
 * A foto da pessoa na aba Dados (spec administracao-de-pessoas): quem edita a pessoa troca e remove
 * a foto, com o progresso do envio e a recusa da API junto da escolha; os outros só a veem.
 */
export function FotoDaPessoa({ pessoa }: { pessoa: Ficha }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);
  const imagens = miniaturasDaPessoa(pessoa.id, pessoa.foto);
  const rotulo = `Foto de ${pessoa.nome}`;

  if (!pessoa.permite.editar) {
    return <Avatar nome={rotulo} imagens={imagens} tamanho="ficha" />;
  }

  /** A ficha que a API devolveu vale na hora, e as listas de pessoas são relidas. */
  function aplicar(ficha: Ficha) {
    consultas.setQueryData(chaveDaFicha(ficha.id), ficha);
    void consultas.invalidateQueries({ queryKey: ['pessoas'] });
  }

  const avatar = <Avatar nome={pessoa.nome} imagens={imagens} tamanho="ficha" decorativo />;
  return (
    <EscolhaDeImagem
      rotulo={rotulo}
      imagem={pessoa.foto ? avatar : undefined}
      vazio={avatar}
      progresso={progresso}
      erro={erro}
      rotuloDeEscolher="Trocar foto"
      rotuloDeRemover="Remover foto"
      explicacaoDaRemocao="A foto deixa de aparecer na hora. Para voltar, envie a foto de novo."
      aoEscolher={async (arquivo) => {
        definirErro(null);
        definirProgresso(0);
        const resultado = await pedir(
          () => api.enviarArquivo<Ficha>(`/pessoas/${pessoa.id}/foto`, arquivo, definirProgresso),
          'trocar a foto',
        );
        definirProgresso(undefined);
        if ('erro' in resultado) {
          definirErro(resultado.erro);
          return;
        }
        aplicar(resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Foto trocada.' });
      }}
      aoRemover={async () => {
        const resultado = await pedir(
          () => api.DELETE('/pessoas/{id}/foto', { params: { path: { id: pessoa.id } } }),
          'remover a foto',
        );
        if ('erro' in resultado) return { erro: resultado.erro };
        aplicar(resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Foto removida.' });
        return { ok: true };
      }}
    />
  );
}
