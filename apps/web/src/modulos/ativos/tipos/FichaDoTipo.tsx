import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  MensagemDoPasso,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { useFocoPerdido } from '../../administracao/Parte.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import { RelacoesDaFicha } from '../../relacoes.tsx';
import estilos from '../Ativos.module.css';
import {
  CHAVE_DOS_CAMPOS,
  CHAVE_DOS_TIPOS,
  type TipoDeAtivo,
  useCampos,
  useCapacidades,
  useTipos,
} from '../consultas.ts';
import { dadosDoTipo, FormularioDoTipo } from './FormularioDoTipo.tsx';

type ListaDeTipos = { tipos: TipoDeAtivo[]; permite: { cadastrar: boolean } };

/**
 * A ficha do tipo de ativo (spec catalogo-de-ativos): o nome e a situação no título, o formulário
 * e, para quem cuida do catálogo, a inativação com confirmação e a reativação. O tipo vem da lista,
 * que traz o catálogo inteiro.
 */
export function FichaDoTipo() {
  const { id } = useParams({ from: '/gestao/catalogo/tipos/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const tipos = useTipos();
  const campos = useCampos();
  const capacidades = useCapacidades();
  const tipo = tipos.data?.tipos.find((candidato) => candidato.id === id);
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(tipo, () => focarDestino(undefined));
  const aplicar = useCallback(
    (novo: TipoDeAtivo) => {
      consultas.setQueryData<ListaDeTipos>(CHAVE_DOS_TIPOS, (lista) =>
        lista
          ? { ...lista, tipos: lista.tipos.map((atual) => (atual.id === novo.id ? novo : atual)) }
          : lista,
      );
      // Quantos tipos usam cada campo muda junto.
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CAMPOS });
    },
    [consultas],
  );

  const falha = tipos.error ?? campos.error ?? capacidades.error;
  if (falha) {
    return (
      <>
        <CabecalhoDaPagina titulo="Tipo de ativo" />
        <EstadoVazio
          titulo={falha.message}
          acao={
            <Botao
              onPress={() => {
                for (const consulta of [tipos, campos, capacidades]) void consulta.refetch();
              }}
            >
              Tentar de novo
            </Botao>
          }
        />
      </>
    );
  }
  if (!tipos.data || !campos.data || !capacidades.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Tipo de ativo" />
        <p role="status" className={estilos.contagem}>
          Carregando o tipo…
        </p>
      </>
    );
  }
  if (!tipo) {
    return (
      <>
        <CabecalhoDaPagina titulo="Tipo de ativo" />
        <EstadoVazio titulo="Tipo de ativo não encontrado." />
      </>
    );
  }

  const situacao = SITUACOES_DO_REGISTRO[tipo.situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={tipo.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          tipo.permite.editar && (
            <AcoesDoTipo
              tipo={tipo}
              aplicar={(novo) => {
                pedirFoco();
                aplicar(novo);
              }}
            />
          )
        }
      />
      <RelacoesDaFicha alvo="tipo" id={tipo.id} />
      <FormularioDoTipo
        key={tipo.id}
        inicial={dadosDoTipo(tipo)}
        campos={campos.data.campos}
        capacidades={capacidades.data.capacidades}
        soLeitura={!tipo.permite.editar}
        rotuloDoEnvio="Salvar alterações"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () =>
              api.PATCH('/tipos-de-ativo/{id}', {
                params: { path: { id: tipo.id } },
                body: pedido,
              }),
            'salvar o tipo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Tipo salvo.' });
          return { ok: true };
        }}
      />
    </div>
  );
}

/** "Reativar" e, confirmada, "Inativar". */
function AcoesDoTipo({
  tipo,
  aplicar,
}: {
  tipo: TipoDeAtivo;
  aplicar: (tipo: TipoDeAtivo) => void;
}) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noTipo = { params: { path: { id: tipo.id } } };

  const aplicarResultado = (resultado: { dados: TipoDeAtivo } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return recusaDe(resultado);
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaFicha}>
      {tipo.situacao === 'inativo' ? (
        <Botao
          carregando={reativando}
          rotuloCarregando="Reativando"
          onPress={async () => {
            definirReativando(true);
            definirFalha(null);
            const resultado = aplicarResultado(
              await pedir(
                () => api.POST('/tipos-de-ativo/{id}/reativacao', noTipo),
                'reativar o tipo',
              ),
              'Tipo reativado.',
            );
            definirReativando(false);
            if ('erro' in resultado) {
              definirFalha(resultado.erro);
              definirTentativa((atual) => atual + 1);
            }
          }}
        >
          Reativar
        </Botao>
      ) : (
        <Confirmacao
          acao="Inativar"
          titulo={`Inativar o tipo ${tipo.nome}?`}
          confirmar="Inativar o tipo"
          confirmando="Inativando"
          fazer={async () =>
            aplicarResultado(
              await pedir(
                () => api.POST('/tipos-de-ativo/{id}/inativacao', noTipo),
                'inativar o tipo',
              ),
              'Tipo inativado.',
            )
          }
        >
          <p className={estilos.informacao}>
            O tipo sai das escolhas para os modelos e os ativos novos. Os modelos e os ativos que já
            o usam continuam como estão, e o tipo pode ser reativado.
          </p>
        </Confirmacao>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
