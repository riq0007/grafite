import {
  ROTULOS_DAS_CORES_DE_CONSUMIVEL,
  ROTULOS_DOS_TIPOS_DE_CONSUMIVEL,
  rendimentoEscrito,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  Carimbo,
  EstadoVazio,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { VerNaAuditoria } from '../../administracao/auditoria/VerNaAuditoria.tsx';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { useFocoPerdido } from '../../administracao/Parte.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import { SITUACOES_DO_REGISTRO } from '../../administracao/situacoes.ts';
import { EstoqueNaFichaDoConsumivel } from '../estoque/NaFichaDoConsumivel.tsx';
import estilos from '../Operacao.module.css';
import { aplicarConsumivel, type FichaDoConsumivel as Ficha, useConsumivel } from './consultas.ts';
import {
  dadosDoConsumivel,
  FormularioDoConsumivel,
  nomeDoModelo,
} from './FormularioDoConsumivel.tsx';

/** O endereço da ficha: a ficha, para quem vê os consumíveis, e o lugar sem acesso, para os outros. */
export function FichaDoConsumivel() {
  const { pode } = useAcesso();
  return pode('consumiveis.ver') || pode('consumiveis.editar') ? (
    <ConteudoDaFicha />
  ) : (
    <SemPermissao a="à Operação" />
  );
}

/**
 * A ficha do consumível (spec modulo-operacao, "Cadastro e ficha do consumível"): o código e a
 * situação no título, com o nome embaixo; para quem edita, o formulário, "Inativar consumível",
 * confirmada, e "Reativar consumível"; para quem só vê, os dados, os fornecedores e os modelos.
 */
function ConteudoDaFicha() {
  const { id } = useParams({ from: '/operacao/consumiveis/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const consumivel = useConsumivel(id);
  const ficha = consumivel.data;
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(ficha?.situacao, () => focarDestino(undefined));

  if (consumivel.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Consumível" />
        <p role="status" className={estilos.contagem}>
          Carregando o consumível…
        </p>
      </>
    );
  }
  if (consumivel.isError || !ficha) {
    return (
      <>
        <CabecalhoDaPagina titulo="Consumível" />
        <EstadoVazio
          titulo={consumivel.error?.message ?? 'Consumível não encontrado.'}
          acao={<Botao onPress={() => void consumivel.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }

  const situacao = SITUACOES_DO_REGISTRO[ficha.situacao];
  const aplicar = (nova: Ficha) => aplicarConsumivel(consultas, nova);

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={<span className="mono">{ficha.codigo}</span>}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        detalhe={ficha.nome || undefined}
        acoes={
          ficha.permite.editar && (
            <AcoesDoConsumivel
              ficha={ficha}
              aplicar={async (nova) => {
                pedirFoco();
                await aplicar(nova);
              }}
            />
          )
        }
      />
      {ficha.permite.editar ? (
        <FormularioDoConsumivel
          key={ficha.id}
          inicial={dadosDoConsumivel(ficha)}
          ficha={ficha}
          rotuloDoEnvio="Salvar"
          enviar={async (pedido) => {
            const resultado = await pedir(
              () =>
                api.PATCH('/consumiveis/{id}', {
                  params: { path: { id: ficha.id } },
                  body: pedido,
                }),
              'salvar o consumível',
            );
            if ('erro' in resultado) return recusaDe(resultado);
            await aplicar(resultado.dados);
            avisar({ situacao: 'sucesso', titulo: 'Consumível salvo.' });
            return { ok: true };
          }}
        />
      ) : (
        <DadosDoConsumivel ficha={ficha} />
      )}
      <EstoqueNaFichaDoConsumivel id={ficha.id} codigo={ficha.codigo} />
      <VerNaAuditoria alvo={[`consumivel:${ficha.id}`]} nome={ficha.codigo} />
    </div>
  );
}

/** Os dados do consumível para quem só vê, com os fornecedores e os modelos. */
function DadosDoConsumivel({ ficha }: { ficha: Ficha }) {
  const { pode } = useAcesso();
  return (
    <>
      <ListaDeDados
        itens={[
          { rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS_DE_CONSUMIVEL[ficha.tipo] },
          { rotulo: 'Cor', valor: ficha.cor ? ROTULOS_DAS_CORES_DE_CONSUMIVEL[ficha.cor] : '—' },
          {
            rotulo: 'Rendimento',
            valor: ficha.rendimento === null ? '—' : rendimentoEscrito(ficha.rendimento),
          },
        ]}
      />
      <section aria-label="Fornecedores" className={estilos.lista}>
        <Carimbo nivel={3}>Fornecedores</Carimbo>
        {ficha.fornecedores.length > 0 ? (
          <ul className={estilos.itens}>
            {ficha.fornecedores.map((fornecedor) => {
              const rotulo =
                fornecedor.situacao === 'inativo'
                  ? `${fornecedor.nome} (inativo)`
                  : fornecedor.nome;
              return (
                <li key={fornecedor.id} className={estilos.item}>
                  {pode('fornecedores.ver') ? (
                    <Link
                      to="/administracao/fornecedores/$id"
                      params={{ id: fornecedor.id }}
                      className={estilos.link}
                    >
                      {rotulo}
                    </Link>
                  ) : (
                    rotulo
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={estilos.semValor}>Nenhum fornecedor.</p>
        )}
      </section>
      <section aria-label="Modelos compatíveis" className={estilos.lista}>
        <Carimbo nivel={3}>Modelos compatíveis</Carimbo>
        {ficha.modelos.length > 0 ? (
          <ul className={estilos.itens}>
            {ficha.modelos.map((modelo) => {
              const nome = nomeDoModelo(modelo);
              return (
                <li key={modelo.id} className={estilos.item}>
                  <span className={estilos.nomeDoItem}>
                    <Link
                      to="/gestao/catalogo/modelos/$id"
                      params={{ id: modelo.id }}
                      className={estilos.link}
                    >
                      {modelo.situacao === 'inativo' ? `${nome} (inativo)` : nome}
                    </Link>
                    <span className={estilos.semValor}>{modelo.tipo.nome}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={estilos.semValor}>Nenhum modelo.</p>
        )}
      </section>
    </>
  );
}

/** "Reativar consumível" e, confirmada, "Inativar consumível", conforme a situação. */
function AcoesDoConsumivel({
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
  const noConsumivel = { params: { path: { id: ficha.id } } };

  const aplicarResultado = async (resultado: { dados: Ficha } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return resultado;
    await aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoes}>
      {ficha.situacao === 'inativo' ? (
        <Botao
          carregando={reativando}
          rotuloCarregando="Reativando"
          onPress={async () => {
            definirReativando(true);
            definirFalha(null);
            const resultado = await aplicarResultado(
              await pedir(
                () => api.POST('/consumiveis/{id}/reativacao', noConsumivel),
                'reativar o consumível',
              ),
              'Consumível reativado.',
            );
            definirReativando(false);
            if ('erro' in resultado) {
              definirFalha(resultado.erro);
              definirTentativa((atual) => atual + 1);
            }
          }}
        >
          Reativar consumível
        </Botao>
      ) : (
        <Confirmacao
          acao="Inativar consumível"
          titulo={`Inativar o consumível ${ficha.codigo}?`}
          confirmando="Inativando"
          fazer={async () =>
            aplicarResultado(
              await pedir(
                () => api.POST('/consumiveis/{id}/inativacao', noConsumivel),
                'inativar o consumível',
              ),
              'Consumível inativado.',
            )
          }
        >
          <p className={estilos.informacao}>
            O consumível sai dos consumíveis compatíveis dos modelos e dos ativos. Ele pode ser
            reativado.
          </p>
        </Confirmacao>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
