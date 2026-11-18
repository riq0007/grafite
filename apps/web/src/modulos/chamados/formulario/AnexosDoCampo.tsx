// O campo Anexo do formulário que se preenche (change chamados-da-ti, design, decisões 10 e 21):
// cada arquivo vai na hora, um a um, pelo `POST /chamados/anexos`, antes da gravação, que os toma.
// A lista mostra cada arquivo com o nome, o tamanho, o download e "Tirar", e os que ainda vão, com
// o progresso ou "Na fila". Até 5; os escolhidos a mais ficam de fora, com o nome. Na prévia, o
// arquivo não é enviado: entra na resposta só no navegador. A fila e a lista são as do campo de
// escrever do chamado aberto (`useFilaDeAnexos` e `ListaDeAnexos`).
import { type CampoDoFormulario, MAXIMO_DE_ANEXOS } from '@grafite/domain';
import { Botao, FORMATOS_DE_ARQUIVO } from '@grafite/ui';
import { Paperclip } from 'lucide-react';
import { useId, useRef } from 'react';
import { type AnexoCitado, descricaoDoCampo, type QuemPreenche } from './estado.ts';
import estilos from './Formulario.module.css';
import { ListaDeAnexos } from './ListaDeAnexos.tsx';
import { Recusa } from './Recusa.tsx';
import { useFilaDeAnexos } from './useFilaDeAnexos.ts';

export interface PropsDosAnexosDoCampo {
  campo: CampoDoFormulario;
  /** Os arquivos da resposta, na ordem. */
  ids: readonly string[];
  anexos: ReadonlyMap<string, AnexoCitado>;
  editavel: boolean;
  quem: QuemPreenche;
  /** O número do chamado aberto, de onde baixam os arquivos dele. */
  numero?: number;
  erro?: string;
  /** O arquivo que entrou: o enviado, ou o da prévia, que só está no navegador. */
  aoAnexar: (id: string, anexo: AnexoCitado) => void;
  aoTirar: (id: string) => void;
}

export function AnexosDoCampo({
  campo,
  ids,
  anexos,
  editavel,
  quem,
  numero,
  erro,
  aoAnexar,
  aoTirar,
}: PropsDosAnexosDoCampo) {
  const id = useId();
  const escolha = useRef<HTMLInputElement>(null);
  const { fila, progresso, recusas, receber } = useFilaDeAnexos({
    ocupados: ids.length,
    soNoNavegador: quem === 'pessoa',
    aoAnexar,
  });

  const exigido = campo.obrigatorio && !campo.soDaTi;
  const descricao =
    [
      descricaoDoCampo(campo),
      editavel && quem === 'pessoa' && 'Na prévia, o arquivo não é enviado.',
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  const cabeMais = editavel && ids.length + fila.length < MAXIMO_DE_ANEXOS;
  const vazio = ids.length === 0 && fila.length === 0;
  return (
    <fieldset
      aria-labelledby={`${id}-rotulo`}
      aria-describedby={descricao ? `${id}-descricao` : undefined}
      className={estilos.anexos}
    >
      <span id={`${id}-rotulo`} className={estilos.rotulo} data-parte="rotulo">
        {campo.rotulo}
        {/* O grupo não anuncia a obrigatoriedade pelo controle: a marca é lida com o nome. */}
        {editavel && exigido && (
          <>
            {' '}
            <span className={estilos.obrigatorio}>obrigatório</span>
          </>
        )}
      </span>
      {vazio && !editavel && (
        <p className={estilos.resposta} data-vazia="">
          Sem resposta
        </p>
      )}
      <ListaDeAnexos
        ids={ids}
        anexos={anexos}
        fila={fila}
        progresso={progresso}
        numero={numero}
        editavel={editavel}
        aoTirar={aoTirar}
      />
      {cabeMais && (
        <div className={estilos.acoes}>
          <input
            ref={escolha}
            type="file"
            multiple
            hidden
            accept={FORMATOS_DE_ARQUIVO.join(',')}
            onChange={(evento) => {
              receber([...(evento.target.files ?? [])]);
              // O mesmo arquivo pode ser escolhido de novo, depois de tirado.
              evento.target.value = '';
            }}
          />
          <Botao icone={Paperclip} onPress={() => escolha.current?.click()}>
            Anexar arquivos
          </Botao>
        </div>
      )}
      {descricao && (
        <p id={`${id}-descricao`} className={estilos.descricao}>
          {descricao}
        </p>
      )}
      {recusas.map(({ chave, texto }) => (
        <Recusa key={chave} texto={texto} />
      ))}
      {erro && <Recusa texto={erro} />}
    </fieldset>
  );
}
