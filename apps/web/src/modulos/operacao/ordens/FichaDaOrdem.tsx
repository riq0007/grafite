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
import { rotuloDoAtivo } from '../estoque/apresentacao.ts';
import estilos from '../Operacao.module.css';
import { GavetaDaAcaoDaOrdem } from './Acoes.tsx';
import { type AcaoDaOrdem, acoesDaOrdem, ROTULOS_DAS_ACOES_DA_ORDEM } from './acoes.ts';
import {
  ativoEmTexto,
  fornecedorDaOrdemEmTexto,
  rotuloDaMudanca,
  SITUACOES_DA_ORDEM_NA_TELA,
} from './apresentacao.ts';
import { type OrdemDeServico, useOrdem } from './consultas.ts';
import { consumivelEmTexto } from './escolhas.ts';

/** O endereço da ficha: a ficha, para quem vê as OS, e o lugar sem acesso, para os outros. */
export function FichaDaOrdem() {
  const { pode } = useAcesso();
  return pode('ordens.ver') || pode('ordens.atender') ? (
    <ConteudoDaFicha />
  ) : (
    <SemPermissao a="às ordens de serviço" />
  );
}

/**
 * A ficha da OS (spec modulo-operacao, "Ficha da ordem de serviço"): o número e a situação no
 * título, o ativo, o local, o problema, a solicitação de origem, o fornecedor, quem abriu, resolveu
 * e encerrou, o histórico das situações e as peças. Quem atende tem as ações que a situação
 * permite, cada uma numa gaveta.
 */
function ConteudoDaFicha() {
  const { numero: doEndereco } = useParams({ from: '/operacao/ordens/$numero' });
  const numero = /^\d{1,9}$/.test(doEndereco) ? Number(doEndereco) : null;
  const consulta = useOrdem(numero);
  const ficha = consulta.data;
  const [emAcao, definirEmAcao] = useState<AcaoDaOrdem | null>(null);

  if (numero === null) {
    return (
      <>
        <CabecalhoDaPagina titulo="Ordem de serviço" />
        <EstadoVazio titulo="Ordem de serviço não encontrada." />
      </>
    );
  }
  if (consulta.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo={<>OS {numero}</>} />
        <p role="status" className={estilos.contagem}>
          Carregando a ordem de serviço…
        </p>
      </>
    );
  }
  if (consulta.isError || !ficha) {
    return (
      <>
        <CabecalhoDaPagina titulo={<>OS {numero}</>} />
        <EstadoVazio
          titulo={consulta.error?.message ?? 'Ordem de serviço não encontrada.'}
          acao={<Botao onPress={() => void consulta.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }

  const situacao = SITUACOES_DA_ORDEM_NA_TELA[ficha.situacao];
  const acoes = acoesDaOrdem(ficha);
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={`OS ${ficha.numero}`}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        detalhe={ativoEmTexto(ficha)}
        acoes={
          acoes.length > 0 &&
          acoes.map((acao, indice) => (
            <Botao
              key={acao}
              nivel={indice === 0 ? 'primario' : 'secundario'}
              onPress={() => definirEmAcao(acao)}
            >
              {ROTULOS_DAS_ACOES_DA_ORDEM[acao]}
            </Botao>
          ))
        }
      />
      <DadosDaOrdem ficha={ficha} />
      <HistoricoDaOrdem ficha={ficha} />
      <PecasDaOrdem ficha={ficha} />
      <VerNaAuditoria alvo={[`ordem:${ficha.id}`]} nome={`OS ${ficha.numero}`} />
      {emAcao && (
        <GavetaDaAcaoDaOrdem
          key={emAcao}
          acao={emAcao}
          ordem={ficha}
          aoFechar={() => definirEmAcao(null)}
        />
      )}
    </div>
  );
}

/** Um dado da ficha, com o travessão quando falta. */
const dado = (rotulo: string, valor: ReactNode): DadoDaFicha => ({ rotulo, valor: valor ?? '—' });

function DadosDaOrdem({ ficha }: { ficha: OrdemDeServico }) {
  const { formatarDataEHora } = useDataHora();
  const quando = (momento: string, conta: { nome: string }) =>
    `${formatarDataEHora(new Date(momento))}, por ${conta.nome}`;
  const fornecedor = fornecedorDaOrdemEmTexto(ficha);
  const itens = [
    dado(
      'Ativo',
      ficha.ativo.abrir ? (
        <Link to="/ativos/$id" params={{ id: ficha.ativo.id }} className={estilos.link}>
          {rotuloDoAtivo(ficha.ativo)}
        </Link>
      ) : (
        rotuloDoAtivo(ficha.ativo)
      ),
    ),
    dado('Local', ficha.local?.caminho),
    dado('Problema', ficha.problema),
  ];
  if (ficha.solicitacao) {
    itens.push(
      dado(
        'Solicitação',
        <Link
          to="/operacao/solicitacoes/$numero"
          params={{ numero: String(ficha.solicitacao.numero) }}
          className={estilos.link}
        >
          {`Solicitação ${ficha.solicitacao.numero} · ${ficha.solicitacao.pessoa.nome}`}
        </Link>,
      ),
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
  itens.push(dado('Aberta', quando(ficha.abertaEm, ficha.abertaPor)));
  if (ficha.resolvidaEm && ficha.resolvidaPor) {
    itens.push(dado('Resolvida', quando(ficha.resolvidaEm, ficha.resolvidaPor)));
  }
  if (ficha.solucao) itens.push(dado('O que foi feito', ficha.solucao));
  if (ficha.encerradaEm && ficha.encerradaPor) {
    itens.push(dado('Encerrada', quando(ficha.encerradaEm, ficha.encerradaPor)));
  }
  if (ficha.motivoDoEncerramento) {
    itens.push(dado('Motivo do encerramento', ficha.motivoDoEncerramento));
  }
  return <ListaDeDados itens={itens} />;
}

/** O histórico das situações, da mudança mais nova para a mais antiga. */
function HistoricoDaOrdem({ ficha }: { ficha: OrdemDeServico }) {
  const { formatarDataEHora } = useDataHora();
  return (
    <section aria-label="Histórico" className={estilos.lista}>
      <Carimbo nivel={3}>Histórico</Carimbo>
      <ul className={estilos.itens}>
        {ficha.historico.map((mudanca, indice) => (
          <li key={mudanca.id} className={estilos.item}>
            <span className={estilos.nomeDoItem}>
              <span>{rotuloDaMudanca(ficha.historico, indice)}</span>
              {mudanca.fornecedor && <span>{mudanca.fornecedor.nome}</span>}
              {mudanca.texto && <span>{mudanca.texto}</span>}
            </span>
            <span className={estilos.nomeDoItem}>
              {`${formatarDataEHora(new Date(mudanca.mudadaEm))}, por ${mudanca.mudadaPor.nome}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** As peças lançadas, com a saída do estoque, para quem vê o estoque. */
function PecasDaOrdem({ ficha }: { ficha: OrdemDeServico }) {
  const { pode } = useAcesso();
  const { formatarDataEHora } = useDataHora();
  return (
    <section aria-label="Peças" className={estilos.lista}>
      <Carimbo nivel={3}>Peças</Carimbo>
      {ficha.pecas.length === 0 ? (
        <p className={estilos.semValor}>Nenhuma peça lançada.</p>
      ) : (
        <ul className={estilos.itens}>
          {ficha.pecas.map((peca) => (
            <li key={peca.id} className={estilos.item}>
              <span className={estilos.nomeDoItem}>
                <span>{`${peca.quantidade} ${consumivelEmTexto(peca.consumivel)}`}</span>
              </span>
              <span className={estilos.nomeDoItem}>
                <span>
                  {`de ${peca.local.caminho}, por ${peca.lancadaPor.nome} em ${formatarDataEHora(new Date(peca.lancadaEm))}`}
                </span>
                {pode('estoque.ver') && (
                  <Link
                    to="/operacao/movimentacoes"
                    search={{ ativo: ficha.ativo.id, consumivel: peca.consumivel.id }}
                    className={estilos.link}
                  >
                    Ver nas movimentações
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
