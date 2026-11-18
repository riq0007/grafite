// A conversa do chamado aberto (spec modulo-chamados, "Chamado aberto"; change chamados-da-ti,
// design, "O chamado aberto, a conversa (tarefa 5.11)"; mockups m03 e m04): numa coluna de até
// 720 px, na ordem da API, a mensagem sem balão, com a sigla de 32 px, a nota interna no quadro
// tracejado da atenção, o evento numa linha entre dois fios, o alerta do ativo em peso forte e, logo
// depois da abertura, o resumo das respostas do formulário. Os anexos de cada mensagem e de cada
// nota vão numa lista, como a do formulário, com o nome, o tamanho e "Baixar".
import { partesDoResumo } from '@grafite/domain';
import { type DataHora, formatarTamanho, Icone, RotuloDeSituacao, useDataHora } from '@grafite/ui';
import { BellRing, FileText, Hourglass, Lock } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import type { FichaDoChamado } from '../consultas.ts';
import { enderecoDoAnexo } from '../formulario/anexos.ts';
import { SiglaDaPessoa } from '../Pecas.tsx';
import estilos from './Conversa.module.css';
import {
  contextoDaFicha,
  type ItemDaConversa,
  linhaDoAlerta,
  linhaDoEvento,
  momentoNaConversa,
} from './conversa.ts';

type Escrito = Extract<ItemDaConversa, { especie: 'mensagem' | 'nota' }>;

/** A conversa do chamado, com o resumo das respostas depois da abertura. */
export function Conversa({ ficha }: { ficha: FichaDoChamado }) {
  const agora = useAgora();
  const dataHora = useDataHora();
  const partes = partesDoResumo(ficha.formulario, ficha.respostas, contextoDaFicha(ficha));
  const resumo =
    partes.length === 0 ? null : (
      <li key="resumo">
        <dl className={estilos.resumo} aria-label="Respostas do formulário">
          {partes.map((parte) => (
            <div key={parte.nome}>
              <dt>{parte.nome}</dt>
              <dd className={parte.mono ? estilos.mono : undefined}>{parte.resposta}</dd>
            </div>
          ))}
        </dl>
      </li>
    );
  // O resumo vai depois do evento da abertura; sem ele, no começo da conversa.
  const abertura = ficha.conversa.findIndex(
    (item) => item.especie === 'evento' && item.evento === 'abertura',
  );
  const itens = ficha.conversa.map((item) => (
    <Fragment key={item.id}>
      <ItemNaConversa item={item} ficha={ficha} agora={agora} dataHora={dataHora} />
      {item.especie === 'evento' && item.evento === 'abertura' && resumo}
    </Fragment>
  ));
  return (
    <section className={estilos.conversa} aria-label="Conversa">
      <ol className={estilos.itens}>
        {abertura === -1 && resumo}
        {itens}
      </ol>
    </section>
  );
}

function ItemNaConversa({
  item,
  ficha,
  agora,
  dataHora,
}: {
  item: ItemDaConversa;
  ficha: FichaDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  switch (item.especie) {
    case 'mensagem':
    case 'nota':
      return <Escrito item={item} numero={ficha.numero} agora={agora} dataHora={dataHora} />;
    case 'evento': {
      const linha = linhaDoEvento(item, { pessoa: ficha.pessoa.nome, agora, dataHora });
      if (!linha) return null;
      return (
        <LinhaEntreFios forte={linha.aguardando} icone={linha.aguardando ? Hourglass : undefined}>
          {linha.texto}
        </LinhaEntreFios>
      );
    }
    case 'alerta':
      return (
        <LinhaEntreFios forte icone={BellRing}>
          {linhaDoAlerta(item, ficha.ativo, agora, dataHora)}
        </LinhaEntreFios>
      );
  }
}

/** O evento e o alerta: a frase no meio, entre dois fios. */
function LinhaEntreFios({
  forte,
  icone,
  children,
}: {
  forte: boolean;
  icone?: typeof BellRing;
  children: ReactNode;
}) {
  return (
    <li className={estilos.evento} data-forte={forte ? '' : undefined}>
      <span>
        {icone && <Icone icone={icone} tamanho={14} />}
        {children}
      </span>
    </li>
  );
}

/**
 * A mensagem, sem balão: a sigla, o nome com a hora, o texto e os anexos. A nota interna, no quadro
 * tracejado, com o cadeado, "Nota interna · Ana Souza", a hora e o selo "Só a TI vê".
 */
function Escrito({
  item,
  numero,
  agora,
  dataHora,
}: {
  item: Escrito;
  numero: number;
  agora: Date;
  dataHora: DataHora;
}) {
  const { autor, especie } = item;
  const hora = (
    <time className={estilos.hora} dateTime={item.em}>
      {momentoNaConversa(new Date(item.em), agora, dataHora)}
    </time>
  );
  return (
    <li className={especie === 'nota' ? estilos.nota : estilos.mensagem}>
      <SiglaDaPessoa
        conta={autor.tipo === 'conta' ? autor.id : null}
        nome={autor.nome}
        tamanho="media"
      />
      <div className={estilos.corpo}>
        {especie === 'nota' ? (
          <p className={estilos.quem}>
            <Icone icone={Lock} tamanho={14} />
            <b>{`Nota interna · ${autor.nome}`}</b>
            {hora}
            <span className={estilos.selo}>
              <RotuloDeSituacao situacao="neutra" semIcone>
                Só a TI vê
              </RotuloDeSituacao>
            </span>
          </p>
        ) : (
          <p className={estilos.quem}>
            <b>{autor.nome}</b>
            {hora}
          </p>
        )}
        {item.texto && <p className={estilos.texto}>{item.texto}</p>}
        {item.anexos.length > 0 && <Anexos anexos={item.anexos} numero={numero} />}
      </div>
    </li>
  );
}

/** Os anexos, como a lista do formulário: o ícone, o nome, o tamanho e "Baixar". */
function Anexos({ anexos, numero }: { anexos: Escrito['anexos']; numero: number }) {
  return (
    <ul className={estilos.arquivos} aria-label="Anexos">
      {anexos.map(({ id, nome, bytes }) => {
        const endereco = enderecoDoAnexo(id, { nome, bytes, onde: 'no-chamado' }, numero);
        return (
          <li key={id} className={estilos.arquivo}>
            <Icone icone={FileText} />
            <span className={estilos.nome} title={nome}>
              {nome}
            </span>
            <span className={estilos.tamanho}>{formatarTamanho(bytes)}</span>
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
          </li>
        );
      })}
    </ul>
  );
}
