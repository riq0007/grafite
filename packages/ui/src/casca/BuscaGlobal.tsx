import { type LucideIcon, Search } from 'lucide-react';
import { useEffect } from 'react';
import {
  Autocomplete,
  Collection,
  Dialog,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  ModalOverlay,
  Text,
  TextField,
} from 'react-aria-components';
import { plataformaAtual } from '../componentes/atalho/atalho.ts';
import { Icone } from '../icones/Icone.tsx';
import estilos from './BuscaGlobal.module.css';

/** Teclas do atalho da busca, como o `TeclaDeAtalho` as recebe: Ctrl K, ou ⌘K no Mac. */
export const ATALHO_DA_BUSCA = ['mod', 'k'];

/**
 * Se o evento é o atalho da busca: ⌘K no Mac, onde o Ctrl+K dos campos de texto apaga até o fim
 * da linha, e Ctrl+K nos demais.
 */
export function ehOAtalhoDaBusca(evento: KeyboardEvent, mac: boolean): boolean {
  if (evento.key.toLowerCase() !== 'k' || evento.shiftKey || evento.altKey) return false;
  return mac ? evento.metaKey && !evento.ctrlKey : evento.ctrlKey && !evento.metaKey;
}

/**
 * Ouve o atalho no documento inteiro, na fase de captura: vale mesmo com o foco num campo, e o
 * navegador não usa o atalho para a barra de endereço.
 */
function useAtalhoDaBusca(aberta: boolean, aoMudarAberta: (aberta: boolean) => void) {
  useEffect(() => {
    const mac = plataformaAtual() === 'mac';
    const aoTeclar = (evento: KeyboardEvent) => {
      if (!ehOAtalhoDaBusca(evento, mac)) return;
      evento.preventDefault();
      evento.stopPropagation();
      aoMudarAberta(!aberta);
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => document.removeEventListener('keydown', aoTeclar, true);
  }, [aberta, aoMudarAberta]);
}

export interface ResultadoDaBusca {
  /** Identificador único entre todos os resultados; é o que `aoEscolher` recebe. */
  id: string;
  rotulo: string;
  /** Onde fica, em texto secundário, como "Ajustes › Dock". */
  caminho?: string;
  icone?: LucideIcon;
}

export interface GrupoDaBusca {
  id: string;
  nome: string;
  resultados: readonly ResultadoDaBusca[];
  /**
   * Só nos grupos de provedores: enquanto busca, o grupo diz "Buscando…"; com erro, diz que não
   * foi possível buscar. Os grupos locais não têm estado.
   */
  estado?: 'buscando' | 'pronto' | 'erro';
}

/** A linha de estado de um grupo de provedor, quando há uma. */
function mensagemDoEstado(grupo: GrupoDaBusca): string | null {
  if (grupo.estado === 'buscando') return 'Buscando…';
  if (grupo.estado === 'erro') return `Não foi possível buscar em ${grupo.nome} agora.`;
  return null;
}

/** O que a região viva anuncia dos provedores que terminaram: quantos resultados, ou o erro. */
function anuncioDosProvedores(grupos: readonly GrupoDaBusca[]): string {
  return grupos
    .flatMap((grupo) => {
      if (grupo.estado === 'erro') return [mensagemDoEstado(grupo) ?? ''];
      if (grupo.estado !== 'pronto') return [];
      const total = grupo.resultados.length;
      if (total === 0) return [`${grupo.nome}: nenhum resultado`];
      return [`${grupo.nome}: ${total} ${total === 1 ? 'resultado' : 'resultados'}`];
    })
    .join('. ');
}

export interface PropsDaBuscaGlobal {
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  termo: string;
  aoMudarTermo: (termo: string) => void;
  /** Os grupos já filtrados e na ordem em que aparecem (design do F1b, decisão 2). */
  grupos: readonly GrupoDaBusca[];
  aoEscolher: (idDoResultado: string) => void;
}

/**
 * Busca global da casca: uma camada em material sobre a tela, com o campo e os resultados em
 * grupos. O foco fica no campo, e as setas movem o resultado escolhido (foco virtual). A filtragem
 * é de quem chama: a busca mostra os grupos como chegam.
 */
export function BuscaGlobal({
  aberta,
  aoMudarAberta,
  termo,
  aoMudarTermo,
  grupos,
  aoEscolher,
}: PropsDaBuscaGlobal) {
  useAtalhoDaBusca(aberta, aoMudarAberta);
  const texto = termo.trim();
  // Um provedor pronto e sem resultados não ocupa espaço; o anúncio diz que ele não achou nada.
  const visiveis = grupos.filter(
    (grupo) => grupo.resultados.length > 0 || mensagemDoEstado(grupo) !== null,
  );
  return (
    <ModalOverlay
      isOpen={aberta}
      onOpenChange={aoMudarAberta}
      isDismissable
      className={estilos.fundo}
    >
      <Modal className={estilos.painel}>
        <Dialog aria-label="Busca" className={estilos.dialogo}>
          <Autocomplete inputValue={termo} onInputChange={aoMudarTermo}>
            <TextField aria-label="Buscar" autoFocus className={estilos.campo}>
              <span className={estilos.lupa}>
                <Icone icone={Search} />
              </span>
              <Input
                type="search"
                placeholder="Buscar módulos, ajustes e ações"
                className={estilos.entrada}
              />
            </TextField>
            <ListBox
              aria-label="Resultados da busca"
              items={visiveis}
              onAction={(chave) => aoEscolher(String(chave))}
              renderEmptyState={() =>
                texto ? <p className={estilos.vazio}>Nada encontrado para “{texto}”.</p> : null
              }
              className={estilos.lista}
            >
              {(grupo) => (
                <ListBoxSection id={`grupo:${grupo.id}`} className={estilos.grupo}>
                  <Header className={estilos.nomeDoGrupo}>{grupo.nome}</Header>
                  <Collection items={grupo.resultados}>
                    {(resultado) => (
                      <ListBoxItem
                        id={resultado.id}
                        textValue={resultado.rotulo}
                        className={estilos.resultado}
                      >
                        <span className={estilos.icone}>
                          {resultado.icone && <Icone icone={resultado.icone} />}
                        </span>
                        <Text slot="label" className={estilos.rotulo}>
                          {resultado.rotulo}
                        </Text>
                        {resultado.caminho && (
                          <Text slot="description" className={estilos.caminho}>
                            {resultado.caminho}
                          </Text>
                        )}
                      </ListBoxItem>
                    )}
                  </Collection>
                  {mensagemDoEstado(grupo) && (
                    <ListBoxItem
                      id={`estado:${grupo.id}`}
                      textValue={mensagemDoEstado(grupo) ?? ''}
                      isDisabled
                      className={estilos.estado}
                    >
                      {mensagemDoEstado(grupo)}
                    </ListBoxItem>
                  )}
                </ListBoxSection>
              )}
            </ListBox>
          </Autocomplete>
          <div role="status" className={estilos.somenteLeitor}>
            {anuncioDosProvedores(grupos)}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
