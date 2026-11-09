import { FileText } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { DropZone, FileTrigger, isFileDropItem, Link } from 'react-aria-components';
import { MensagemDoPasso } from '../../entrada/MensagemDoPasso.tsx';
import { Icone } from '../../icones/Icone.tsx';
import estilosDoBotao from '../botao/Botao.module.css';
import { Botao } from '../botao/Botao.tsx';
import estilosDoCampo from '../campo/Campo.module.css';
import { BarraDeProgresso } from '../exibicao/BarraDeProgresso.tsx';
import estilos from './EscolhaDeArquivo.module.css';
import { RemocaoConfirmada, type ResultadoDaRemocao } from './RemocaoConfirmada.tsx';
import { formatarTamanho } from './tamanho.ts';

/**
 * Os formatos que a escolha oferece (spec arquivos-e-imagens, "Arquivos aceitos"). Quem decide é a
 * API, pelo conteúdo: a lista só filtra a janela de escolha do sistema.
 */
export const FORMATOS_DE_ARQUIVO = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  '.docx',
  '.xlsx',
  '.pptx',
  '.doc',
  '.xls',
  '.ppt',
  '.odt',
  '.ods',
  '.odp',
  'text/plain',
  '.csv',
  '.zip',
] as const;

/** O maior arquivo: 25 MB, como a API confere. */
export const LIMITE_DOS_ARQUIVOS = 25 * 1024 * 1024;

const REGRAS_DO_ENVIO =
  'PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP, até 25 MB.';

/** O arquivo atual do campo, pelo nome original, com o tamanho e o endereço para baixar. */
export interface ArquivoDaEscolha {
  nome: string;
  bytes: number;
  endereco: string;
}

export interface PropsDaEscolhaDeArquivo {
  /** O nome da escolha para o leitor de tela, como o rótulo do campo. */
  rotulo: string;
  /**
   * O rótulo à vista, acima da escolha, como o de um campo do formulário. Sem ele, o rótulo só dá o
   * nome da escolha ao leitor de tela.
   */
  rotuloAVista?: boolean;
  /** Um texto sobre a escolha, abaixo dela e ligado a ela, como o de um campo restrito. */
  descricao?: string;
  /** O arquivo atual; sem ele, "Sem arquivo". */
  arquivo?: ArquivoDaEscolha | null;
  /** O arquivo escolhido ou solto na área, para enviar. Sem ela, a escolha só mostra e baixa. */
  aoEscolher?: (arquivo: File) => void;
  /** A remoção, depois de confirmada. Sem ela, a escolha não oferece "Remover". */
  aoRemover?: () => Promise<ResultadoDaRemocao>;
  /** Durante o envio, de 0 a 100, ou `null` sem o progresso conhecido. Fora do envio, ausente. */
  progresso?: number | null;
  /** A recusa do último envio, com a mensagem da API. */
  erro?: string | null;
  /** O que acontece ao remover, na confirmação. Sem ela, o arquivo sai do campo na hora. */
  explicacaoDaRemocao?: string;
  /** Os formatos que a janela de escolha oferece; sem eles, os dos campos de arquivo. */
  formatos?: readonly string[];
  /** O maior arquivo, em bytes, recusado antes do envio; sem ele, 25 MB. */
  limite?: number;
  /** A regra dos formatos e do tamanho, abaixo da escolha. */
  regras?: string;
  /** O botão que escolhe o arquivo, sem um arquivo; sem ele, "Enviar arquivo". */
  rotuloDoEnvio?: string;
}

/** A recusa que dá para saber antes do envio, pelo tamanho; o formato quem confere é a API. */
function recusaAntesDoEnvio(arquivo: File, limite: number): string | null {
  if (arquivo.size === 0) return 'O arquivo está vazio.';
  if (arquivo.size > limite) return `O arquivo passa de ${Math.round(limite / 1024 / 1024)} MB.`;
  return null;
}

/**
 * O arquivo de um campo e o envio dele (design do P1d, decisão 8): sem arquivo, "Enviar arquivo";
 * com arquivo, o nome, o tamanho, "Baixar", "Trocar" e "Remover", com a confirmação. Um arquivo
 * também pode ser solto na área. Durante o envio, a escolha mostra o progresso e não aceita outro. A
 * recusa aparece junto, e o arquivo anterior continua. Os formatos, o limite e a regra são os dos
 * campos de arquivo, a menos que a escolha diga outros, como a planilha da importação.
 */
export function EscolhaDeArquivo({
  rotulo,
  rotuloAVista = false,
  descricao,
  arquivo,
  aoEscolher,
  aoRemover,
  progresso,
  erro,
  explicacaoDaRemocao,
  formatos = FORMATOS_DE_ARQUIVO,
  limite = LIMITE_DOS_ARQUIVOS,
  regras = REGRAS_DO_ENVIO,
  rotuloDoEnvio = 'Enviar arquivo',
}: PropsDaEscolhaDeArquivo) {
  const enviando = progresso !== undefined;
  const [recusa, definirRecusa] = useState<{ texto: string; vez: number } | null>(null);
  const id = useId();

  // Depois da remoção, o botão dela some: o foco perdido vai para "Enviar arquivo".
  const acoes = useRef<HTMLDivElement>(null);
  const focarAoSumir = useRef(false);
  useEffect(() => {
    if (arquivo || !focarAoSumir.current) return;
    focarAoSumir.current = false;
    if (document.activeElement === document.body || document.activeElement === null) {
      acoes.current?.querySelector('button')?.focus();
    }
  }, [arquivo]);

  const receber = (escolhido: File | undefined) => {
    if (enviando || !escolhido || !aoEscolher) return;
    const motivo = recusaAntesDoEnvio(escolhido, limite);
    if (motivo) {
      definirRecusa((anterior) => ({ texto: motivo, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    definirRecusa(null);
    aoEscolher(escolhido);
  };

  const conteudo = arquivo ? (
    <span className={estilos.arquivo}>
      <Icone icone={FileText} tamanho={20} />
      <span className={estilos.nome} title={arquivo.nome}>
        {arquivo.nome}
      </span>
      <span className={estilos.tamanho}>{formatarTamanho(arquivo.bytes)}</span>
    </span>
  ) : (
    <span className={estilos.vazio}>Sem arquivo</span>
  );

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
      {aoEscolher ? (
        <DropZone
          aria-label="Soltar um arquivo"
          data-area-do-arquivo=""
          className={estilos.area}
          getDropOperation={() => (enviando ? 'cancel' : 'copy')}
          onDrop={async (evento) => {
            const item = evento.items.find(isFileDropItem);
            receber(item ? await item.getFile() : undefined);
          }}
        >
          {conteudo}
        </DropZone>
      ) : (
        <div className={estilos.area}>{conteudo}</div>
      )}
      <div ref={acoes} className={estilos.acoes}>
        {arquivo && (
          <Link
            href={arquivo.endereco}
            download={arquivo.nome}
            data-nivel="secundario"
            className={estilosDoBotao.botao}
          >
            <span className={estilosDoBotao.rotulo}>Baixar</span>
          </Link>
        )}
        {aoEscolher && (
          <FileTrigger
            acceptedFileTypes={[...formatos]}
            onSelect={(escolhidos) => receber(escolhidos?.[0] ?? undefined)}
          >
            <Botao carregando={enviando} rotuloCarregando="Enviando">
              {arquivo ? 'Trocar' : rotuloDoEnvio}
            </Botao>
          </FileTrigger>
        )}
        {arquivo && aoRemover && (
          <RemocaoConfirmada
            rotulo="Remover"
            titulo="Remover arquivo?"
            rotuloDeConfirmar="Remover arquivo"
            explicacao={
              explicacaoDaRemocao ??
              `"${arquivo.nome}" sai do campo na hora e não pode mais ser baixado.`
            }
            desabilitada={enviando}
            aoRemover={async () => {
              // Marcado antes: o arquivo pode sumir antes de a remoção responder.
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
        aoEscolher && <p className={estilos.regras}>{regras}</p>
      )}
      {descricao && (
        <span id={`${id}-descricao`} className={estilosDoCampo.descricao}>
          {descricao}
        </span>
      )}
      <MensagemDoPasso texto={mensagem} chave={recusa?.vez ?? 0} />
    </fieldset>
  );
}
