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
import { FalhaDaConsulta } from '../../../api/consultas.ts';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { useFocoPerdido } from '../../administracao/Parte.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import { RelacoesDaFicha } from '../../relacoes.tsx';
import estilos from '../Ativos.module.css';
import { CHAVE_DOS_MODELOS, chaveDoModelo, type Modelo, useModelo } from '../consultas.ts';
import { ConsumiveisDoModelo } from './ConsumiveisDoModelo.tsx';
import { FormularioDoModelo } from './FormularioDoModelo.tsx';
import { ImagemDoModelo } from './ImagemDoModelo.tsx';

/**
 * A ficha do modelo de equipamento (spec catalogo-de-ativos): o fabricante, o nome e a situação no
 * título, a imagem, o formulário, com o tipo só para leitura, e, para quem edita modelos, a
 * inativação e a reativação.
 */
export function FichaDoModelo() {
  const { id } = useParams({ from: '/gestao/catalogo/modelos/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const modelo = useModelo(id);
  const pedirFoco = useFocoPerdido(modelo.data, () => focarDestino(undefined));
  const aplicar = useCallback(
    (novo: Modelo) => {
      consultas.setQueryData(chaveDoModelo(novo.id), novo);
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_MODELOS });
    },
    [consultas],
  );

  if (modelo.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Modelo" />
        <p role="status" className={estilos.contagem}>
          Carregando o modelo…
        </p>
      </>
    );
  }
  if (modelo.isError) {
    const naoExiste =
      modelo.error instanceof FalhaDaConsulta && modelo.error.codigo === 'nao-encontrado';
    return (
      <>
        <CabecalhoDaPagina titulo="Modelo" />
        <EstadoVazio
          titulo={modelo.error.message}
          acao={
            naoExiste ? undefined : (
              <Botao onPress={() => void modelo.refetch()}>Tentar de novo</Botao>
            )
          }
        />
      </>
    );
  }

  const atual = modelo.data;
  const situacao = SITUACOES_DO_REGISTRO[atual.situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={`${atual.fabricante} ${atual.nome}`}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          atual.permite.editar && (
            <AcoesDoModelo
              modelo={atual}
              aplicar={(novo) => {
                pedirFoco();
                aplicar(novo);
              }}
            />
          )
        }
      />
      <ImagemDoModelo modelo={atual} aplicar={aplicar} />
      <RelacoesDaFicha alvo="modelo" id={atual.id} />
      <ConsumiveisDoModelo id={atual.id} />
      <FormularioDoModelo
        key={atual.id}
        inicial={{ tipoId: atual.tipo.id, fabricante: atual.fabricante, nome: atual.nome }}
        tipoFixo={atual.tipo.nome}
        soLeitura={!atual.permite.editar}
        rotuloDoEnvio="Salvar alterações"
        enviar={async ({ fabricante, nome }) => {
          const resultado = await pedir(
            () =>
              api.PATCH('/modelos/{id}', {
                params: { path: { id: atual.id } },
                body: { fabricante, nome },
              }),
            'salvar o modelo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Modelo salvo.' });
          return { ok: true };
        }}
      />
    </div>
  );
}

/** "Reativar" e, confirmada, "Inativar". */
function AcoesDoModelo({ modelo, aplicar }: { modelo: Modelo; aplicar: (modelo: Modelo) => void }) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noModelo = { params: { path: { id: modelo.id } } };
  const nome = `${modelo.fabricante} ${modelo.nome}`;

  const aplicarResultado = (resultado: { dados: Modelo } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return recusaDe(resultado);
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaFicha}>
      {modelo.situacao === 'inativo' ? (
        <Botao
          carregando={reativando}
          rotuloCarregando="Reativando"
          onPress={async () => {
            definirReativando(true);
            definirFalha(null);
            const resultado = aplicarResultado(
              await pedir(
                () => api.POST('/modelos/{id}/reativacao', noModelo),
                'reativar o modelo',
              ),
              'Modelo reativado.',
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
          titulo={`Inativar o modelo ${nome}?`}
          confirmar="Inativar o modelo"
          confirmando="Inativando"
          fazer={async () =>
            aplicarResultado(
              await pedir(
                () => api.POST('/modelos/{id}/inativacao', noModelo),
                'inativar o modelo',
              ),
              'Modelo inativado.',
            )
          }
        >
          <p className={estilos.informacao}>
            O modelo sai das escolhas dos ativos novos. Os ativos que já o usam continuam como
            estão.
          </p>
        </Confirmacao>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
