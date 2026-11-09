import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  MensagemDoPasso,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { useFocoPerdido } from '../../administracao/Parte.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import estilos from '../Ativos.module.css';
import {
  type CampoDaOrganizacao,
  CHAVE_DOS_CAMPOS,
  CHAVE_DOS_TIPOS,
  useCampos,
  useTipos,
} from '../consultas.ts';
import { dadosDoCampo, FormularioDoCampo } from './FormularioDoCampo.tsx';
import { gruposUsados } from './grupos.ts';

type ListaDeCampos = { campos: CampoDaOrganizacao[]; permite: { cadastrar: boolean } };

/**
 * A ficha do campo da organização (spec catalogo-de-ativos): o rótulo e a situação no título, o
 * formulário, com o tipo de campo só para leitura, os tipos que usam o campo e, para quem cuida do
 * catálogo, a inativação, que diz de quantos tipos ele sai.
 */
export function FichaDoCampo() {
  const { id } = useParams({ from: '/gestao/catalogo/campos/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const campos = useCampos();
  const tipos = useTipos();
  const campo = campos.data?.campos.find((candidato) => candidato.id === id);
  const pedirFoco = useFocoPerdido(campo, () => focarDestino(undefined));
  const aplicar = useCallback(
    (novo: CampoDaOrganizacao) => {
      consultas.setQueryData<ListaDeCampos>(CHAVE_DOS_CAMPOS, (lista) =>
        lista
          ? { ...lista, campos: lista.campos.map((atual) => (atual.id === novo.id ? novo : atual)) }
          : lista,
      );
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_TIPOS });
    },
    [consultas],
  );

  const falha = campos.error ?? tipos.error;
  if (falha) {
    return (
      <>
        <CabecalhoDaPagina titulo="Campo" />
        <EstadoVazio
          titulo={falha.message}
          acao={
            <Botao
              onPress={() => {
                void campos.refetch();
                void tipos.refetch();
              }}
            >
              Tentar de novo
            </Botao>
          }
        />
      </>
    );
  }
  if (!campos.data || !tipos.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Campo" />
        <p role="status" className={estilos.contagem}>
          Carregando o campo…
        </p>
      </>
    );
  }
  if (!campo) {
    return (
      <>
        <CabecalhoDaPagina titulo="Campo" />
        <EstadoVazio titulo="Campo não encontrado." />
      </>
    );
  }

  const situacao = SITUACOES_DO_REGISTRO[campo.situacao];
  const usam = tipos.data.tipos.filter((tipo) =>
    tipo.campos.some((noTipo) => noTipo.campoId === campo.id),
  );
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={campo.rotulo}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          campo.permite.editar && (
            <AcoesDoCampo
              campo={campo}
              aplicar={(novo) => {
                pedirFoco();
                aplicar(novo);
              }}
            />
          )
        }
      />
      <FormularioDoCampo
        key={campo.id}
        inicial={dadosDoCampo(campo)}
        grupos={gruposUsados(campos.data.campos)}
        tipoFixo
        soLeitura={!campo.permite.editar}
        rotuloDoEnvio="Salvar alterações"
        enviar={async ({ tipo: _fixo, ...pedido }) => {
          const resultado = await pedir(
            () => api.PATCH('/campos/{id}', { params: { path: { id: campo.id } }, body: pedido }),
            'salvar o campo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Campo salvo.' });
          return { ok: true };
        }}
      />
      <section className={estilos.parte} aria-labelledby="tipos-do-campo">
        <h2 id="tipos-do-campo" className={estilos.tituloDaParte}>
          Tipos que usam o campo
        </h2>
        {usam.length === 0 ? (
          <p className={estilos.informacao}>Nenhum tipo usa este campo.</p>
        ) : (
          <ul aria-label="Tipos que usam o campo" className={estilos.itens}>
            {usam.map((tipo) => (
              <li key={tipo.id} className={estilos.item}>
                <p className={estilos.nomeDoItem}>
                  <Link
                    to="/gestao/catalogo/tipos/$id"
                    params={{ id: tipo.id }}
                    className={estilos.link}
                  >
                    {tipo.nome}
                  </Link>
                  {tipo.situacao === 'inativo' && (
                    <RotuloDeSituacao situacao="neutra">Tipo inativo</RotuloDeSituacao>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const saida = (tipos: number) => {
  if (tipos === 0) return 'Nenhum tipo ativo usa o campo.';
  return tipos === 1
    ? 'O campo sai dos formulários de 1 tipo.'
    : `O campo sai dos formulários de ${tipos} tipos.`;
};

/** "Reativar" e, confirmada, "Inativar". */
function AcoesDoCampo({
  campo,
  aplicar,
}: {
  campo: CampoDaOrganizacao;
  aplicar: (campo: CampoDaOrganizacao) => void;
}) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noCampo = { params: { path: { id: campo.id } } };

  const aplicarResultado = (
    resultado: { dados: CampoDaOrganizacao } | FalhaDoPedido,
    aviso: string,
  ) => {
    if ('erro' in resultado) return recusaDe(resultado);
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaFicha}>
      {campo.situacao === 'inativo' ? (
        <Botao
          carregando={reativando}
          rotuloCarregando="Reativando"
          onPress={async () => {
            definirReativando(true);
            definirFalha(null);
            const resultado = aplicarResultado(
              await pedir(() => api.POST('/campos/{id}/reativacao', noCampo), 'reativar o campo'),
              'Campo reativado.',
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
          titulo={`Inativar o campo ${campo.rotulo}?`}
          confirmar="Inativar o campo"
          confirmando="Inativando"
          fazer={async () =>
            aplicarResultado(
              await pedir(() => api.POST('/campos/{id}/inativacao', noCampo), 'inativar o campo'),
              'Campo inativado.',
            )
          }
        >
          <p className={estilos.informacao}>
            {saida(campo.usadoPor)} Os valores ficam guardados nos ativos e voltam se o campo for
            reativado.
          </p>
        </Confirmacao>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
