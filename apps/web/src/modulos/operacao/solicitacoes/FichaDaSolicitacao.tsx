import {
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_SOLICITACAO,
  textoDoContadorCongelado,
} from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  Carimbo,
  type DadoDaFicha,
  EstadoVazio,
  ListaDeDados,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { Link, useParams } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { VerNaAuditoria } from '../../administracao/auditoria/VerNaAuditoria.tsx';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { lidoEmCurto, rotuloDoAtivo } from '../estoque/apresentacao.ts';
import estilos from '../Operacao.module.css';
import { useAbrirOS } from '../ordens/useAbrirOS.ts';
import { GavetaDaAcao } from './Acoes.tsx';
import { type AcaoDaSolicitacao, acoesDaSolicitacao, ROTULOS_DAS_ACOES } from './acoes.ts';
import {
  fornecedorEmTexto,
  locaisEmTexto,
  ordemEmTexto,
  SITUACOES_NA_TELA,
} from './apresentacao.ts';
import { type Solicitacao, useSolicitacao } from './consultas.ts';
import estilosDasSolicitacoes from './Solicitacoes.module.css';

type ImpressoraDaFicha = Solicitacao['impressoras'][number];
type ItemDaFicha = ImpressoraDaFicha['itens'][number];

/** O endereço da ficha: a ficha, para quem vê as solicitações, e o lugar sem acesso, para os outros. */
export function FichaDaSolicitacao() {
  const { pode } = useAcesso();
  return pode('solicitacoes.ver') || pode('solicitacoes.atender') ? (
    <ConteudoDaFicha />
  ) : (
    <SemPermissao a="às solicitações" />
  );
}

/**
 * A ficha da solicitação (spec modulo-operacao, "Ficha da solicitação"): o número e a situação no
 * título, quem pediu, o pedido de cada tipo, o pedido ao fornecedor, quem registrou e quem
 * encerrou, e, no toner, as impressoras com o contador congelado e a entrega de cada item. Quem
 * atende tem as ações que a situação e o tipo permitem, cada uma numa gaveta.
 */
function ConteudoDaFicha() {
  const { numero: doEndereco } = useParams({ from: '/operacao/solicitacoes/$numero' });
  const numero = /^\d{1,9}$/.test(doEndereco) ? Number(doEndereco) : null;
  const consulta = useSolicitacao(numero);
  const ficha = consulta.data;
  const [emAcao, definirEmAcao] = useState<AcaoDaSolicitacao | null>(null);
  const { pode } = useAcesso();
  const abrirOS = useAbrirOS();

  if (numero === null) {
    return (
      <>
        <CabecalhoDaPagina titulo="Solicitação" />
        <EstadoVazio titulo="Solicitação não encontrada." />
      </>
    );
  }
  if (consulta.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo={<>Solicitação {numero}</>} />
        <p role="status" className={estilos.contagem}>
          Carregando a solicitação…
        </p>
      </>
    );
  }
  if (consulta.isError || !ficha) {
    return (
      <>
        <CabecalhoDaPagina titulo={<>Solicitação {numero}</>} />
        <EstadoVazio
          titulo={consulta.error?.message ?? 'Solicitação não encontrada.'}
          acao={<Botao onPress={() => void consulta.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }

  const situacao = SITUACOES_NA_TELA[ficha.situacao];
  const acoes = acoesDaSolicitacao(ficha, { abreOS: pode('ordens.atender') });
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={`Solicitação ${ficha.numero}`}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        detalhe={ROTULOS_DOS_TIPOS_DE_SOLICITACAO[ficha.tipo]}
        acoes={
          acoes.length > 0 &&
          acoes.map((acao, indice) => (
            <Botao
              key={acao}
              nivel={indice === 0 ? 'primario' : 'secundario'}
              onPress={() =>
                acao === 'abrir-os' ? void abrirOS(ficha.numero) : definirEmAcao(acao)
              }
            >
              {ROTULOS_DAS_ACOES[acao]}
            </Botao>
          ))
        }
      />
      <DadosDaSolicitacao ficha={ficha} />
      {ficha.tipo === 'toner' && <ImpressorasDaSolicitacao ficha={ficha} />}
      <VerNaAuditoria alvo={[`solicitacao:${ficha.id}`]} nome={`Solicitação ${ficha.numero}`} />
      {emAcao && (
        <GavetaDaAcao
          key={emAcao}
          acao={emAcao}
          solicitacao={ficha}
          aoFechar={() => definirEmAcao(null)}
        />
      )}
    </div>
  );
}

/** Um dado da ficha, com o travessão quando falta. */
const dado = (rotulo: string, valor: ReactNode): DadoDaFicha => ({ rotulo, valor: valor ?? '—' });

/** O ativo pela ficha dele, para quem o vê, ou só pelo nome. */
function AtivoDaFicha({ ativo }: { ativo: ImpressoraDaFicha['ativo'] }) {
  return ativo.abrir ? (
    <Link to="/ativos/$id" params={{ id: ativo.id }} className={estilos.link}>
      {rotuloDoAtivo(ativo)}
    </Link>
  ) : (
    rotuloDoAtivo(ativo)
  );
}

function DadosDaSolicitacao({ ficha }: { ficha: Solicitacao }) {
  const { formatarDataEHora } = useDataHora();
  const quando = (momento: string, conta: { nome: string }) =>
    `${formatarDataEHora(new Date(momento))}, por ${conta.nome}`;
  const fornecedor = fornecedorEmTexto(ficha);
  const itens = [dado('Pedida por', ficha.pessoa.nome), dado('Locais', locaisEmTexto(ficha))];
  if (ficha.tipo === 'conserto') {
    itens.push(
      dado('Ativo', ficha.ativo && <AtivoDaFicha ativo={ficha.ativo} />),
      dado('Defeito', ficha.defeito),
    );
    if (ficha.ordem) {
      itens.push(
        dado(
          'Ordem de serviço',
          ficha.ordem.abrir ? (
            <Link
              to="/operacao/ordens/$numero"
              params={{ numero: String(ficha.ordem.numero) }}
              className={estilos.link}
            >
              {ordemEmTexto(ficha.ordem)}
            </Link>
          ) : (
            ordemEmTexto(ficha.ordem)
          ),
        ),
      );
    }
  }
  if (ficha.tipo === 'equipamento') {
    itens.push(
      dado('Tipo de ativo', ficha.tipoDeAtivo?.nome),
      dado('Quantidade', ficha.quantidade),
      dado('Motivo', ficha.motivo),
      dado('Local', ficha.local?.caminho),
    );
  }
  if (fornecedor) {
    itens.push(
      dado(
        'Fornecedor',
        ficha.fornecedor?.abrir ? (
          <Link
            to="/administracao/fornecedores/$id"
            params={{ id: ficha.fornecedor.id }}
            className={estilos.link}
          >
            {fornecedor}
          </Link>
        ) : (
          fornecedor
        ),
      ),
    );
  }
  itens.push(
    dado('Observação', ficha.observacao),
    dado('Registrada', quando(ficha.registradaEm, ficha.registradaPor)),
  );
  if (ficha.encerradaEm && ficha.encerradaPor) {
    itens.push(
      dado(
        ficha.situacao === 'cancelada' ? 'Cancelada' : 'Concluída',
        quando(ficha.encerradaEm, ficha.encerradaPor),
      ),
    );
  }
  if (ficha.oQueFoiFeito) itens.push(dado('O que foi feito', ficha.oQueFoiFeito));
  if (ficha.motivoDoCancelamento) {
    itens.push(dado('Motivo do cancelamento', ficha.motivoDoCancelamento));
  }
  return <ListaDeDados itens={itens} />;
}

/** As impressoras do toner, cada uma com o total de páginas congelado e os itens dela. */
function ImpressorasDaSolicitacao({ ficha }: { ficha: Solicitacao }) {
  const dataHora = useDataHora();
  return (
    <section aria-label="Impressoras" className={estilos.lista}>
      <Carimbo nivel={3}>Impressoras</Carimbo>
      {ficha.impressoras.map(({ ativo, contador, itens }) => (
        <div key={ativo.id} className={estilosDasSolicitacoes.impressora}>
          <p className={estilosDasSolicitacoes.nomeDaImpressora}>
            <AtivoDaFicha ativo={ativo} />
          </p>
          <p className={estilosDasSolicitacoes.contador}>
            {textoDoContadorCongelado(
              contador?.paginas ?? null,
              contador ? lidoEmCurto(new Date(contador.lidoEm), dataHora) : null,
            )}
          </p>
          <ul className={estilos.itens}>
            {itens.map((item) => (
              <ItemDoToner key={item.id} item={item} impressora={ativo.id} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * Um item: a quantidade, a cor e o consumível, e a entrega, do estoque, com o local e o caminho
 * para a movimentação, para quem vê o estoque, ou pelo fornecedor; sem ela, "Pendente".
 */
function ItemDoToner({ item, impressora }: { item: ItemDaFicha; impressora: string }) {
  const { pode } = useAcesso();
  const { formatarDataEHora } = useDataHora();
  const { entrega, consumivel } = item;
  const nomeDoConsumivel = consumivel
    ? [consumivel.codigo, consumivel.nome].filter(Boolean).join(' · ')
    : null;
  const quem = entrega
    ? `por ${entrega.entreguePor.nome} em ${formatarDataEHora(new Date(entrega.entregueEm))}`
    : null;
  return (
    <li className={estilos.item}>
      <span className={estilos.nomeDoItem}>
        <span>
          {item.quantidade} {ROTULOS_DAS_CORES_DE_CONSUMIVEL[item.cor]}
        </span>
        {consumivel &&
          nomeDoConsumivel &&
          (consumivel.abrir ? (
            <Link
              to="/operacao/consumiveis/$id"
              params={{ id: consumivel.id }}
              className={estilos.link}
            >
              {nomeDoConsumivel}
            </Link>
          ) : (
            <span>{nomeDoConsumivel}</span>
          ))}
      </span>
      <span className={estilos.nomeDoItem}>
        {!entrega && <span className={estilos.semValor}>Pendente</span>}
        {entrega?.origem === 'estoque' && (
          <>
            <span>
              Entregue do estoque, de {entrega.local?.caminho ?? '—'}, {quem}
            </span>
            {pode('estoque.ver') && consumivel && (
              <Link
                to="/operacao/movimentacoes"
                search={{ ativo: impressora, consumivel: consumivel.id }}
                className={estilos.link}
              >
                Ver nas movimentações
              </Link>
            )}
          </>
        )}
        {entrega?.origem === 'fornecedor' && (
          <span>
            Entregue pela {entrega.fornecedor?.nome ?? '—'}, {quem}
          </span>
        )}
      </span>
    </li>
  );
}
