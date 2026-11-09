import {
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ContagemDaLista,
  ControleSegmentado,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Segmento,
  Tabela,
} from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import estilos from '../Administracao.module.css';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { type Coletor, useColetores } from './consultas.ts';
import { contatoDoColetor } from './contato.ts';

const FILTROS = { ativos: 'Ativos', inativos: 'Inativos', todos: 'Todos' } as const;
type Filtro = keyof typeof FILTROS;

const noFiltro = (filtro: Filtro, coletor: Coletor) =>
  filtro === 'todos' || (filtro === 'ativos') === (coletor.situacao === 'ativo');

/** As faixas numa linha, ou "Nenhuma faixa": o coletor sem faixas não recebe nada para coletar. */
export const textoDasFaixas = (faixas: readonly string[]) =>
  faixas.length === 0 ? 'Nenhuma faixa' : faixas.join(', ');

/** O último contato com a idade; o coletor parado aparece na situação de atenção. */
export function ContatoDoColetor({ coletor, agora }: { coletor: Coletor; agora: Date }) {
  const contato = contatoDoColetor(coletor, agora);
  return contato.situacao ? (
    <RotuloDeSituacao situacao={contato.situacao}>{contato.texto}</RotuloDeSituacao>
  ) : (
    contato.texto
  );
}

/**
 * A lista de coletores (spec modulo-administracao, "Tela de coletores"): os ativos pelo nome, com
 * as faixas, o último contato com a idade, a versão e a situação; o filtro mostra os inativos. A
 * linha abre a ficha. A idade anda na virada do minuto, e a lista é relida a cada minuto.
 */
export function Coletores() {
  const navegar = useNavigate();
  const coletores = useColetores();
  const agora = useAgora();
  const [filtro, definirFiltro] = useState<Filtro>('ativos');
  const novoColetor = () => void navegar({ to: '/administracao/coletores/novo' });
  const cadastrar = coletores.data?.permite.cadastrar ?? false;

  const cabecalho = (
    <CabecalhoDaPagina
      titulo="Coletores"
      acoes={
        cadastrar && (
          <Botao nivel="primario" icone={Plus} onPress={novoColetor}>
            Novo coletor
          </Botao>
        )
      }
    />
  );

  if (coletores.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando os coletores…
        </p>
      </div>
    );
  }
  if (coletores.isError) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={coletores.error.message}
          acao={<Botao onPress={() => void coletores.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  if (coletores.data.coletores.length === 0) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum coletor ainda."
          descricao="O coletor fica num servidor da rede e confere os equipamentos das faixas dele."
          acao={
            cadastrar ? (
              <Botao icone={Plus} onPress={novoColetor}>
                Novo coletor
              </Botao>
            ) : undefined
          }
        />
      </div>
    );
  }

  const visiveis = coletores.data.coletores.filter((coletor) => noFiltro(filtro, coletor));
  return (
    <div className={estilos.tela}>
      {cabecalho}
      <ControleSegmentado
        rotulo="Situação"
        value={filtro}
        onChange={(escolhido) => definirFiltro(escolhido as Filtro)}
      >
        {(Object.keys(FILTROS) as Filtro[]).map((chave) => (
          <Segmento key={chave} value={chave}>
            {FILTROS[chave]}
          </Segmento>
        ))}
      </ControleSegmentado>
      <ContagemDaLista quantos={visiveis.length} singular="coletor" plural="coletores" />
      <Tabela
        rotulo="Coletores"
        aoAbrirLinha={(id) =>
          void navegar({ to: '/administracao/coletores/$id', params: { id: String(id) } })
        }
      >
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Nome
          </Coluna>
          <Coluna id="faixas" especie="codigo">
            Faixas
          </Coluna>
          <Coluna id="contato" especie="data">
            Último contato
          </Coluna>
          <Coluna id="versao" especie="codigo">
            Versão
          </Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={visiveis}
          dependencias={[agora]}
          vazio={
            <EstadoVazio
              titulo={filtro === 'inativos' ? 'Nenhum coletor inativo.' : 'Nenhum coletor ativo.'}
            />
          }
        >
          {(coletor) => (
            <Linha id={coletor.id}>
              <Celula>{coletor.nome}</Celula>
              <Celula>{textoDasFaixas(coletor.faixas)}</Celula>
              <Celula>
                <ContatoDoColetor coletor={coletor} agora={agora} />
              </Celula>
              <Celula>{coletor.versao ?? '—'}</Celula>
              <Celula>
                <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[coletor.situacao].tipo}>
                  {SITUACOES_DO_REGISTRO[coletor.situacao].texto}
                </RotuloDeSituacao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </div>
  );
}
