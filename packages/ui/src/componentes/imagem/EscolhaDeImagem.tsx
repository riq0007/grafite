import { ImageIcon } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { DropZone, FileTrigger, isFileDropItem } from 'react-aria-components';
import { MensagemDoPasso } from '../../entrada/MensagemDoPasso.tsx';
import { Icone } from '../../icones/Icone.tsx';
import { RemocaoConfirmada, type ResultadoDaRemocao } from '../arquivo/RemocaoConfirmada.tsx';
import { Botao } from '../botao/Botao.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { BarraDeProgresso } from '../exibicao/BarraDeProgresso.tsx';
import estilos from './EscolhaDeImagem.module.css';

/** Os formatos que o envio de imagens aceita (spec arquivos-e-imagens). */
export const FORMATOS_DE_IMAGEM = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/svg+xml',
] as const;

export const FORMATO_NAO_ACEITO =
  'Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.';

const REGRAS_DO_ENVIO = 'PNG, JPG, WebP, AVIF ou SVG, até 10 MB.';

/**
 * O tipo que o navegador informa vem do nome do arquivo: um GIF já é recusado aqui. Sem tipo
 * conhecido, quem decide é a API, que confere o conteúdo.
 */
const formatoAceito = (arquivo: File) =>
  arquivo.type === '' || (FORMATOS_DE_IMAGEM as readonly string[]).includes(arquivo.type);

export type { ResultadoDaRemocao };

export interface PropsDaEscolhaDeImagem {
  /** O nome da escolha para o leitor de tela, como "Foto de Ana Souza". */
  rotulo: string;
  /**
   * O rótulo à vista, acima da escolha, como o de um campo do formulário. Sem ele, o rótulo só dá o
   * nome da escolha ao leitor de tela.
   */
  rotuloAVista?: boolean;
  /** Um texto sobre a escolha, abaixo dela e ligado a ela, como o de um campo restrito. */
  descricao?: string;
  /** A imagem atual, como o avatar com a foto. Sem ela, a escolha mostra o `vazio`. */
  imagem?: ReactNode;
  /** O que aparece sem imagem, como as iniciais da pessoa. Sem ele, "Sem imagem". */
  vazio?: ReactNode;
  /**
   * O arquivo escolhido ou solto na área, já num dos formatos aceitos, para enviar. Sem ela, a
   * escolha só mostra a imagem, a quem não pode trocá-la.
   */
  aoEscolher?: (arquivo: File) => void;
  /** A remoção, depois de confirmada. Sem ela, a escolha não oferece "Remover imagem". */
  aoRemover?: () => Promise<ResultadoDaRemocao>;
  /** Durante o envio, de 0 a 100, ou `null` sem o progresso conhecido. Fora do envio, ausente. */
  progresso?: number | null;
  /** A recusa do último envio, com a mensagem da API. */
  erro?: string | null;
  rotuloDeEscolher?: string;
  rotuloDeRemover?: string;
  /** O que acontece ao remover, na confirmação. */
  explicacaoDaRemocao?: string;
}

/**
 * A imagem de um registro e a troca dela (spec componentes-base): "Escolher imagem" abre a escolha
 * de arquivos filtrada pelos formatos aceitos (no celular, com a câmera), e um arquivo também pode
 * ser solto ou colado na área da imagem. Durante o envio, a escolha mostra o progresso e não aceita
 * outra. A recusa aparece junto, e a imagem anterior continua.
 */
export function EscolhaDeImagem({
  rotulo,
  rotuloAVista = false,
  descricao,
  imagem,
  vazio,
  aoEscolher,
  aoRemover,
  progresso,
  erro,
  rotuloDeEscolher = 'Escolher imagem',
  rotuloDeRemover = 'Remover imagem',
  explicacaoDaRemocao = 'A imagem deixa de aparecer na hora. Para voltar, envie a imagem de novo.',
}: PropsDaEscolhaDeImagem) {
  const enviando = progresso !== undefined;
  const temImagem = imagem !== undefined && imagem !== null && imagem !== false;
  const [recusa, definirRecusa] = useState<{ texto: string; vez: number } | null>(null);
  const id = useId();

  // Depois da remoção, o botão dela some: o foco perdido vai para "Escolher imagem".
  const acoes = useRef<HTMLDivElement>(null);
  const focarAoSumir = useRef(false);
  useEffect(() => {
    if (temImagem || !focarAoSumir.current) return;
    focarAoSumir.current = false;
    if (document.activeElement === document.body || document.activeElement === null) {
      acoes.current?.querySelector('button')?.focus();
    }
  }, [temImagem]);

  const receber = (arquivo: File | undefined) => {
    if (enviando || !aoEscolher) return;
    if (!arquivo || !formatoAceito(arquivo)) {
      definirRecusa((anterior) => ({ texto: FORMATO_NAO_ACEITO, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    definirRecusa(null);
    aoEscolher(arquivo);
  };

  const conteudo = temImagem
    ? imagem
    : (vazio ?? (
        <span className={estilos.vazio}>
          <Icone icone={ImageIcon} tamanho={24} />
          Sem imagem
        </span>
      ));
  const mensagem = recusa?.texto ?? erro ?? null;
  return (
    <fieldset
      aria-label={rotuloAVista ? undefined : rotulo}
      aria-labelledby={rotuloAVista ? `${id}-rotulo` : undefined}
      aria-describedby={descricao ? `${id}-descricao` : undefined}
      className={estilos.escolha}
    >
      {rotuloAVista && (
        <span id={`${id}-rotulo`} className={estilosDoCampo.rotulo}>
          {rotulo}
        </span>
      )}
      <div className={estilos.linha}>
        {aoEscolher ? (
          <>
            <DropZone
              aria-label="Soltar ou colar uma imagem"
              data-area-da-imagem=""
              className={estilos.area}
              getDropOperation={() => (enviando ? 'cancel' : 'copy')}
              onDrop={async (evento) => {
                const item = evento.items.find(isFileDropItem);
                receber(item ? await item.getFile() : undefined);
              }}
            >
              {conteudo}
            </DropZone>
            <div className={estilos.lado}>
              <div ref={acoes} className={estilos.acoes}>
                <FileTrigger
                  acceptedFileTypes={[...FORMATOS_DE_IMAGEM]}
                  onSelect={(arquivos) => receber(arquivos?.[0] ?? undefined)}
                >
                  <Botao carregando={enviando} rotuloCarregando="Enviando">
                    {rotuloDeEscolher}
                  </Botao>
                </FileTrigger>
                {temImagem && aoRemover && (
                  <RemocaoConfirmada
                    rotulo={rotuloDeRemover}
                    explicacao={explicacaoDaRemocao}
                    desabilitada={enviando}
                    aoRemover={async () => {
                      // Marcado antes: a imagem pode sumir antes de a remoção responder.
                      focarAoSumir.current = true;
                      const resultado = await aoRemover();
                      if ('ok' in resultado) definirRecusa(null);
                      else focarAoSumir.current = false;
                      return resultado;
                    }}
                  />
                )}
              </div>
              {enviando ? (
                <BarraDeProgresso rotulo="Enviando…" valor={progresso ?? undefined} />
              ) : (
                <p className={estilos.regras}>{REGRAS_DO_ENVIO}</p>
              )}
              <MensagemDoPasso texto={mensagem} chave={recusa?.vez ?? 0} />
            </div>
          </>
        ) : (
          // Só para ver: a imagem, sem a área de soltar nem as ações.
          <div className={estilos.moldura}>{conteudo}</div>
        )}
      </div>
      {descricao && (
        <span id={`${id}-descricao`} className={estilosDoCampo.descricao}>
          {descricao}
        </span>
      )}
    </fieldset>
  );
}
