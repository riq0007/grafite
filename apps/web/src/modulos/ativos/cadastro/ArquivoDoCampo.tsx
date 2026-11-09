import type { DefinicaoNoAtivo } from '@grafite/domain';
import { avisar, EscolhaDeArquivo, EscolhaDeImagem, MiniaturaDeAtivo } from '@grafite/ui';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Ativos.module.css';
import type { FichaDoAtivo } from '../consultas.ts';

const ENVIE_DEPOIS = 'Envie depois de cadastrar o ativo.';

export interface PropsDoArquivoDoCampo {
  definicao: DefinicaoNoAtivo;
  /** O ativo gravado; sem ele, no cadastro, o campo só diz que o envio vem depois. */
  ficha?: FichaDoAtivo;
  soLeitura: boolean;
  /** O texto sobre o campo, como o do restrito. */
  descricao?: string;
  /** A ficha que a API devolve depois de enviar ou remover o arquivo. */
  aplicar?: (ficha: FichaDoAtivo) => void;
}

/**
 * Um campo de arquivo ou de imagem do ativo (spec cadastro-de-ativos, "Arquivos e imagens nos
 * campos do ativo"): na ficha, o arquivo vai e sai na hora, fora do "Salvar alterações", e a API
 * grava o estado do campo como uma edição manual. O documento aparece pelo nome, com o tamanho e
 * "Baixar"; a imagem, pela miniatura, que abre a imagem inteira. Quem não pode mudar o campo só
 * baixa e vê. No cadastro, o campo diz que o arquivo é enviado depois.
 */
export function ArquivoDoCampo({
  definicao,
  ficha,
  soLeitura,
  descricao,
  aplicar,
}: PropsDoArquivoDoCampo) {
  const api = useApi();
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);
  const deImagem = definicao.tipo === 'imagem';

  if (!ficha) {
    const texto = [ENVIE_DEPOIS, descricao].filter(Boolean).join(' ');
    return deImagem ? (
      <EscolhaDeImagem rotulo={definicao.rotulo} rotuloAVista descricao={texto} />
    ) : (
      <EscolhaDeArquivo rotulo={definicao.rotulo} rotuloAVista descricao={texto} />
    );
  }

  const valor = ficha.valores[definicao.chave];
  const id = typeof valor === 'string' ? valor : null;
  const registro = id ? ficha.referencias.arquivos[id] : undefined;
  const noCampo = { params: { path: { id: ficha.id, campoId: definicao.chave } } };
  const caminho = `/ativos/${ficha.id}/campos/${definicao.chave}/arquivo`;
  const endereco = (arquivo: string, variante: string) => `/api${caminho}/${arquivo}/${variante}`;

  async function enviar(arquivo: File) {
    definirErro(null);
    definirProgresso(0);
    const resultado = await pedir(
      () =>
        api.enviarArquivo<FichaDoAtivo>(
          `${caminho}?nome=${encodeURIComponent(arquivo.name)}`,
          arquivo,
          definirProgresso,
        ),
      deImagem ? 'enviar a imagem' : 'enviar o arquivo',
    );
    definirProgresso(undefined);
    if ('erro' in resultado) {
      definirErro(resultado.erro);
      return;
    }
    aplicar?.(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: deImagem ? 'Imagem enviada.' : 'Arquivo enviado.' });
  }

  async function remover() {
    const resultado = await pedir(
      () => api.DELETE('/ativos/{id}/campos/{campoId}/arquivo', noCampo),
      deImagem ? 'remover a imagem' : 'remover o arquivo',
    );
    if ('erro' in resultado) return { erro: resultado.erro };
    aplicar?.(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: deImagem ? 'Imagem removida.' : 'Arquivo removido.' });
    return { ok: true } as const;
  }

  const mudar =
    !soLeitura && aplicar ? { aoEscolher: enviar, aoRemover: remover, progresso, erro } : {};

  if (deImagem) {
    return (
      <EscolhaDeImagem
        rotulo={definicao.rotulo}
        rotuloAVista
        descricao={descricao}
        imagem={
          id ? (
            <a
              href={endereco(id, 'completa')}
              target="_blank"
              rel="noopener"
              aria-label={`Abrir a imagem inteira de ${definicao.rotulo}`}
            >
              <MiniaturaDeAtivo
                tipo="generico"
                imagemDoAtivo={endereco(id, '256')}
                className={estilos.imagemDaFicha}
              />
            </a>
          ) : undefined
        }
        rotuloDeEscolher={id ? 'Trocar imagem' : 'Enviar imagem'}
        explicacaoDaRemocao={`"${registro?.nome ?? definicao.rotulo}" sai do campo na hora.`}
        {...mudar}
      />
    );
  }
  return (
    <EscolhaDeArquivo
      rotulo={definicao.rotulo}
      rotuloAVista
      descricao={descricao}
      arquivo={
        id && registro
          ? { nome: registro.nome, bytes: registro.bytes, endereco: endereco(id, 'completa') }
          : null
      }
      {...mudar}
    />
  );
}
