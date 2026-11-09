// As regras de alerta na tela (spec modulo-alertas, "Regras na tela"; change p3a-regras-e-alertas,
// design, decisão 11): para quem administra os alertas, a lista das regras, a regra nova e a ficha,
// com a edição, a inativação, confirmada, e a reativação.
import { ROTULOS_DAS_SEVERIDADES } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  ContagemDaLista,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Tabela,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { Confirmacao } from '../administracao/Confirmacao.tsx';
import { recusaDe } from '../administracao/recusa.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import estilos from './Alertas.module.css';
import {
  CHAVE_DA_REGRA,
  CHAVE_DAS_REGRAS,
  CHAVE_DOS_ALERTAS,
  type RegraDeAlerta,
  useRegra,
  useRegras,
} from './consultas.ts';
import { FormularioDaRegra } from './FormularioDaRegra.tsx';
import {
  duracaoEmTexto,
  escopoEmTexto,
  excecoesEmTexto,
  RASCUNHO_VAZIO,
  rascunhoDa,
  resumoDaCondicao,
} from './regrasNaTela.ts';

const SITUACOES_DA_REGRA = {
  ativa: { tipo: 'sucesso', texto: 'Ativa' },
  inativa: { tipo: 'neutra', texto: 'Inativa' },
} as const;

/** As telas das regras só para quem administra os alertas. */
function SoParaQuemAdministra({ children }: { children: ReactNode }) {
  const { pode } = useAcesso();
  return pode('alertas.administrar') ? children : <SemPermissao a="às regras de alerta" />;
}

/** Põe a regra que a API devolveu na ficha e relê as listas. */
function useAplicarRegra() {
  const consultas = useQueryClient();
  return async (regra: RegraDeAlerta) => {
    consultas.setQueryData([...CHAVE_DA_REGRA, regra.id], regra);
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_REGRAS });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_ALERTAS });
  };
}

export function Regras() {
  return (
    <SoParaQuemAdministra>
      <ListaDasRegras />
    </SoParaQuemAdministra>
  );
}

function ListaDasRegras() {
  const navegar = useNavigate();
  const regras = useRegras();
  const novaRegra = () => void navegar({ to: '/alertas/regras/nova' });
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Regras de alerta"
        acoes={
          <Botao nivel="primario" icone={Plus} onPress={novaRegra}>
            Nova regra
          </Botao>
        }
      />
      <p className={estilos.explicacao}>
        Uma regra diz quando abrir um alerta: a condição, o limite e para quais ativos. O alerta é
        cada vez que a regra dispara num ativo, e ele fecha sozinho quando o ativo volta ao normal.
        Para tratar um tipo, um modelo ou um local de outro jeito, use as exceções da regra.
      </p>
      {regras.isPending ? (
        <p role="status" className={estilos.contagem}>
          Carregando as regras…
        </p>
      ) : regras.isError ? (
        <EstadoVazio
          titulo={regras.error.message}
          acao={<Botao onPress={() => void regras.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <>
          <ContagemDaLista quantos={regras.data.regras.length} singular="regra" plural="regras" />
          <Tabela
            rotulo="Regras de alerta"
            aoAbrirLinha={(id) =>
              void navegar({ to: '/alertas/regras/$regraId', params: { regraId: String(id) } })
            }
          >
            <CabecalhoDaTabela>
              <Coluna id="nome" principal>
                Nome
              </Coluna>
              <Coluna id="condicao">Condição</Coluna>
              <Coluna id="duracao">Duração</Coluna>
              <Coluna id="severidade" especie="situacao">
                Severidade
              </Coluna>
              <Coluna id="escopo">Escopo</Coluna>
              <Coluna id="excecoes">Exceções</Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={regras.data.regras}
              vazio={
                <EstadoVazio
                  titulo="Nenhuma regra ainda."
                  acao={
                    <Botao icone={Plus} onPress={novaRegra}>
                      Nova regra
                    </Botao>
                  }
                />
              }
            >
              {(regra) => (
                <Linha id={regra.id}>
                  <Celula>{regra.nome}</Celula>
                  <Celula>{resumoDaCondicao(regra.condicao, regra.parametros)}</Celula>
                  <Celula>{duracaoEmTexto(regra.condicao, regra.duracao)}</Celula>
                  <Celula>
                    <RotuloDeSituacao situacao={regra.severidade}>
                      {ROTULOS_DAS_SEVERIDADES[regra.severidade]}
                    </RotuloDeSituacao>
                  </Celula>
                  <Celula>{escopoEmTexto(regra.escopo)}</Celula>
                  <Celula>{excecoesEmTexto(regra.excecoes)}</Celula>
                  <Celula>
                    <RotuloDeSituacao situacao={SITUACOES_DA_REGRA[regra.situacao].tipo}>
                      {SITUACOES_DA_REGRA[regra.situacao].texto}
                    </RotuloDeSituacao>
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
    </div>
  );
}

export function RegraNova() {
  return (
    <SoParaQuemAdministra>
      <CadastroDaRegra />
    </SoParaQuemAdministra>
  );
}

function CadastroDaRegra() {
  const api = useApi();
  const navegar = useNavigate();
  const aplicar = useAplicarRegra();
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Nova regra de alerta" />
      <FormularioDaRegra
        inicial={RASCUNHO_VAZIO}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/regras-de-alerta', { body: pedido }),
            'cadastrar a regra',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Regra salva.' });
          void navegar({
            to: '/alertas/regras/$regraId',
            params: { regraId: resultado.dados.id },
          });
          return { ok: true };
        }}
        aoCancelar={() => void navegar({ to: '/alertas/regras' })}
      />
    </div>
  );
}

export function FichaDaRegra() {
  return (
    <SoParaQuemAdministra>
      <FichaDaRegraParaQuemAdministra />
    </SoParaQuemAdministra>
  );
}

function FichaDaRegraParaQuemAdministra() {
  const { regraId } = useParams({ from: '/alertas/regras/$regraId' });
  const api = useApi();
  const regra = useRegra(regraId);
  const aplicar = useAplicarRegra();
  if (regra.isPending) {
    return (
      <p role="status" className={estilos.contagem}>
        Carregando a regra…
      </p>
    );
  }
  if (regra.isError) {
    return (
      <EstadoVazio
        titulo={regra.error.message}
        acao={<Botao onPress={() => void regra.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  const atual = regra.data;
  const naRegra = { params: { path: { id: atual.id } } };
  const situacao = SITUACOES_DA_REGRA[atual.situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={atual.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          atual.situacao === 'ativa' ? (
            <Confirmacao
              acao="Inativar"
              titulo={`Inativar a regra ${atual.nome}?`}
              confirmar="Inativar a regra"
              confirmando="Inativando"
              fazer={async () => {
                const resultado = await pedir(
                  () => api.POST('/regras-de-alerta/{id}/inativacao', naRegra),
                  'inativar a regra',
                );
                if ('erro' in resultado) return resultado;
                await aplicar(resultado.dados);
                avisar({ situacao: 'sucesso', titulo: 'Regra inativada.' });
                return { ok: true };
              }}
            >
              <p className={estilos.informacao}>
                Os alertas abertos por ela são encerrados, e nenhum outro abre por ela até ser
                reativada.
              </p>
            </Confirmacao>
          ) : (
            <Botao
              onPress={async () => {
                const resultado = await pedir(
                  () => api.POST('/regras-de-alerta/{id}/reativacao', naRegra),
                  'reativar a regra',
                );
                if ('erro' in resultado) {
                  avisar({ situacao: 'critico', titulo: resultado.erro });
                  return;
                }
                await aplicar(resultado.dados);
                avisar({ situacao: 'sucesso', titulo: 'Regra reativada.' });
              }}
            >
              Reativar
            </Botao>
          )
        }
      />
      <FormularioDaRegra
        key={atual.atualizadoEm}
        inicial={rascunhoDa(atual)}
        condicaoAtual={atual.condicao}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.PATCH('/regras-de-alerta/{id}', { ...naRegra, body: pedido }),
            'salvar a regra',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Regra salva.' });
          return { ok: true };
        }}
      />
    </div>
  );
}
