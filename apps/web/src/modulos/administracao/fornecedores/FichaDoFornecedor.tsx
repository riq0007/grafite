import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { RelacoesDaFicha } from '../../relacoes.tsx';
import estilos from '../Administracao.module.css';
import { VerNaAuditoria } from '../auditoria/VerNaAuditoria.tsx';
import { Confirmacao } from '../Confirmacao.tsx';
import { useFocoPerdido } from '../Parte.tsx';
import { recusaDe } from '../recusa.ts';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { aplicarFornecedor, type FichaDoFornecedor as Ficha, useFornecedor } from './consultas.ts';
import { dadosDoFornecedor, FormularioDoFornecedor } from './FormularioDoFornecedor.tsx';

/**
 * A ficha do fornecedor (spec modulo-administracao, "Tela de fornecedores", e fornecedores): o nome
 * e a situação no título; para quem edita, o formulário, "Inativar fornecedor", confirmada, e
 * "Reativar fornecedor"; para quem só vê, os dados. As relações dos outros módulos, como os ativos
 * deste fornecedor, entram embaixo (change relacoes-vivas).
 */
export function FichaDoFornecedor() {
  const { id } = useParams({ from: '/administracao/fornecedores/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const fornecedor = useFornecedor(id);
  const { formatarDataEHora } = useDataHora();
  const ficha = fornecedor.data;
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(ficha?.situacao, () => focarDestino(undefined));

  if (fornecedor.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Fornecedor" />
        <p role="status" className={estilos.contagem}>
          Carregando o fornecedor…
        </p>
      </>
    );
  }
  if (fornecedor.isError || !ficha) {
    return (
      <>
        <CabecalhoDaPagina titulo="Fornecedor" />
        <EstadoVazio
          titulo={fornecedor.error?.message ?? 'Fornecedor não encontrado.'}
          acao={<Botao onPress={() => void fornecedor.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }

  const situacao = SITUACOES_DO_REGISTRO[ficha.situacao];
  const aplicar = (nova: Ficha) => aplicarFornecedor(consultas, nova);

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={ficha.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          ficha.permite.editar && (
            <AcoesDoFornecedor
              ficha={ficha}
              aplicar={async (nova) => {
                pedirFoco();
                await aplicar(nova);
              }}
            />
          )
        }
      />
      <ListaDeDados
        itens={[
          ...(ficha.permite.editar
            ? []
            : [
                {
                  rotulo: 'CNPJ',
                  valor: ficha.cnpj ? <span className="mono">{ficha.cnpj}</span> : '—',
                },
                { rotulo: 'Contato', valor: ficha.contato ?? '—' },
                { rotulo: 'E-mail', valor: ficha.email ?? '—' },
                { rotulo: 'Telefone', valor: ficha.telefone ?? '—' },
                { rotulo: 'Observações', valor: ficha.observacoes ?? '—' },
              ]),
          { rotulo: 'Cadastrado em', valor: formatarDataEHora(new Date(ficha.criadoEm)) },
        ]}
      />
      {ficha.permite.editar && (
        <FormularioDoFornecedor
          key={ficha.id}
          inicial={dadosDoFornecedor(ficha)}
          rotuloDoEnvio="Salvar alterações"
          enviar={async (pedido) => {
            const resultado = await pedir(
              () =>
                api.PATCH('/fornecedores/{id}', {
                  params: { path: { id: ficha.id } },
                  body: pedido,
                }),
              'salvar o fornecedor',
            );
            if ('erro' in resultado) return recusaDe(resultado);
            await aplicar(resultado.dados);
            avisar({ situacao: 'sucesso', titulo: 'Fornecedor salvo.' });
            return { ok: true };
          }}
        />
      )}
      <RelacoesDaFicha alvo="fornecedor" id={ficha.id} nome={ficha.nome} />
      <VerNaAuditoria alvo={[`fornecedor:${ficha.id}`]} nome={ficha.nome} />
    </div>
  );
}

/** "Reativar fornecedor" e, confirmada, "Inativar fornecedor", conforme a situação. */
function AcoesDoFornecedor({
  ficha,
  aplicar,
}: {
  ficha: Ficha;
  aplicar: (ficha: Ficha) => Promise<void>;
}) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noFornecedor = { params: { path: { id: ficha.id } } };

  const aplicarResultado = async (resultado: { dados: Ficha } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return resultado;
    await aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaPessoa}>
      <div className={estilos.gruposDeAcoes}>
        {ficha.situacao === 'inativo' ? (
          <Botao
            carregando={reativando}
            rotuloCarregando="Reativando"
            onPress={async () => {
              definirReativando(true);
              definirFalha(null);
              const resultado = await aplicarResultado(
                await pedir(
                  () => api.POST('/fornecedores/{id}/reativacao', noFornecedor),
                  'reativar o fornecedor',
                ),
                'Fornecedor reativado.',
              );
              definirReativando(false);
              if ('erro' in resultado) {
                definirFalha(resultado.erro);
                definirTentativa((atual) => atual + 1);
              }
            }}
          >
            Reativar fornecedor
          </Botao>
        ) : (
          <Confirmacao
            acao="Inativar fornecedor"
            titulo={`Inativar o fornecedor ${ficha.nome}?`}
            confirmando="Inativando"
            fazer={async () =>
              aplicarResultado(
                await pedir(
                  () => api.POST('/fornecedores/{id}/inativacao', noFornecedor),
                  'inativar o fornecedor',
                ),
                'Fornecedor inativado.',
              )
            }
          >
            <p className={estilos.informacao}>
              O fornecedor continua nos registros que já apontam para ele, mas não pode mais ser
              escolhido.
            </p>
          </Confirmacao>
        )}
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
