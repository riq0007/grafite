// A lista dos anexos que se escrevem (change chamados-da-ti, design, decisões 10 e 21, e "O campo de
// escrever (tarefa 5.12)"): a do campo Anexo do formulário que se preenche e a do campo de escrever do
// chamado aberto. Cada arquivo com o nome, o tamanho, o download e "Tirar", e os que ainda vão, com o
// progresso ou "Na fila".
import { BarraDeProgresso, Botao, formatarTamanho, Icone } from '@grafite/ui';
import { FileText } from 'lucide-react';
import { enderecoDoAnexo } from './anexos.ts';
import type { AnexoCitado } from './estado.ts';
import estilos from './Formulario.module.css';
import type { AnexoNaFila } from './useFilaDeAnexos.ts';

export interface PropsDaListaDeAnexos {
  /** Os arquivos que já entraram, na ordem. */
  ids: readonly string[];
  anexos: ReadonlyMap<string, AnexoCitado>;
  fila: readonly AnexoNaFila[];
  progresso: number | null;
  /** O número do chamado aberto, de onde baixam os arquivos dele. */
  numero?: number;
  editavel: boolean;
  aoTirar: (id: string) => void;
  /** O nome da lista, quando nenhum grupo em volta o dá. */
  rotulo?: string;
}

/** A lista, que não aparece sem arquivos. */
export function ListaDeAnexos({
  ids,
  anexos,
  fila,
  progresso,
  numero,
  editavel,
  aoTirar,
  rotulo,
}: PropsDaListaDeAnexos) {
  if (ids.length === 0 && fila.length === 0) return null;
  return (
    <ul className={estilos.arquivos} aria-label={rotulo}>
      {ids.map((anexoId) => {
        const anexo = anexos.get(anexoId);
        const nome = anexo?.nome ?? 'Arquivo';
        const endereco = enderecoDoAnexo(anexoId, anexo, numero);
        return (
          <li key={anexoId} className={estilos.arquivo}>
            <Icone icone={FileText} />
            <span className={estilos.nome} title={nome}>
              {nome}
            </span>
            {anexo && <span className={estilos.tamanho}>{formatarTamanho(anexo.bytes)}</span>}
            {endereco && (
              <a
                href={endereco}
                download={nome}
                aria-label={`Baixar ${nome}`}
                className={estilos.baixar}
              >
                Baixar
              </a>
            )}
            {editavel && (
              <Botao
                nivel="terciario"
                aria-label={`Tirar ${nome}`}
                onPress={() => aoTirar(anexoId)}
              >
                Tirar
              </Botao>
            )}
          </li>
        );
      })}
      {fila.map(({ chave, arquivo }, posicao) => (
        <li key={`na-fila-${chave}`} className={estilos.arquivo}>
          <Icone icone={FileText} />
          <span className={estilos.nome} title={arquivo.name}>
            {arquivo.name}
          </span>
          {posicao === 0 ? (
            <BarraDeProgresso
              rotulo={`Enviando ${arquivo.name}`}
              valor={progresso ?? undefined}
              className={estilos.progresso}
            />
          ) : (
            <span className={estilos.tamanho}>Na fila</span>
          )}
        </li>
      ))}
    </ul>
  );
}
