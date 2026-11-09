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
import { useAgora } from '../../../casca/status/useAgora.ts';
import estilos from '../Administracao.module.css';
import { VerNaAuditoria } from '../auditoria/VerNaAuditoria.tsx';
import { Confirmacao } from '../Confirmacao.tsx';
import { Parte, useFocoPerdido } from '../Parte.tsx';
import { recusaDe } from '../recusa.ts';
import { SITUACOES_DO_REGISTRO } from '../situacoes.ts';
import { ContatoDoColetor } from './Coletores.tsx';
import { aplicarColetor, type Coletor, useColetores } from './consultas.ts';
import { DialogoDoToken } from './DialogoDoToken.tsx';
import { FormularioDoColetor } from './FormularioDoColetor.tsx';

/**
 * A ficha do coletor (spec modulo-administracao, "Tela de coletores"): o nome e a situação no
 * título, o último contato, a versão e o cadastro, a edição do nome e das faixas, "Trocar o token",
 * com o token novo mostrado uma vez, e a inativação e a reativação, com as confirmações.
 */
export function FichaDoColetor() {
  const { id } = useParams({ from: '/administracao/coletores/$id' });
  const api = useApi();
  const consultas = useQueryClient();
  const coletores = useColetores();
  const agora = useAgora();
  const { formatarDataEHora } = useDataHora();
  const [token, definirToken] = useState<string | null>(null);
  const coletor = coletores.data?.coletores.find((atual) => atual.id === id);
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(coletor?.situacao, () => focarDestino(undefined));

  if (coletores.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Coletor" />
        <p role="status" className={estilos.contagem}>
          Carregando o coletor…
        </p>
      </>
    );
  }
  if (coletores.isError) {
    return (
      <>
        <CabecalhoDaPagina titulo="Coletor" />
        <EstadoVazio
          titulo={coletores.error.message}
          acao={<Botao onPress={() => void coletores.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }
  if (!coletor) {
    return (
      <>
        <CabecalhoDaPagina titulo="Coletor" />
        <EstadoVazio titulo="Coletor não encontrado." />
      </>
    );
  }

  const situacao = SITUACOES_DO_REGISTRO[coletor.situacao];
  const noColetor = { params: { path: { id: coletor.id } } };
  const aplicar = (novo: Coletor) => aplicarColetor(consultas, novo);

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={coletor.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          <AcoesDoColetor
            coletor={coletor}
            aplicar={async (novo) => {
              pedirFoco();
              await aplicar(novo);
            }}
          />
        }
      />
      <ListaDeDados
        itens={[
          {
            rotulo: 'Último contato',
            valor: (
              <>
                {coletor.ultimoContatoEm && (
                  <>{formatarDataEHora(new Date(coletor.ultimoContatoEm))} · </>
                )}
                <ContatoDoColetor coletor={coletor} agora={agora} />
              </>
            ),
          },
          { rotulo: 'Versão', valor: coletor.versao ?? '—' },
          { rotulo: 'Cadastrado em', valor: formatarDataEHora(new Date(coletor.criadoEm)) },
        ]}
      />
      <FormularioDoColetor
        key={coletor.id}
        inicial={{ nome: coletor.nome, faixas: coletor.faixas.join('\n') }}
        rotuloDoEnvio="Salvar alterações"
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.PATCH('/coletores/{id}', { ...noColetor, body: pedido }),
            'salvar o coletor',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicar(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Coletor salvo.' });
          return { ok: true };
        }}
      />
      <Parte titulo="Token">
        <p className={estilos.informacao}>
          O token só aparece no cadastro e na troca. Para um coletor novo ou um token perdido,
          troque o token e ponha o novo na configuração do coletor.
        </p>
        <div className={estilos.acoes}>
          <Confirmacao
            acao="Trocar o token"
            titulo={`Trocar o token do ${coletor.nome}?`}
            confirmando="Trocando"
            fazer={async () => {
              const resultado = await pedir(
                () => api.POST('/coletores/{id}/token', noColetor),
                'trocar o token',
              );
              if ('erro' in resultado) return resultado;
              definirToken(resultado.dados.token);
              await aplicar(resultado.dados.coletor);
              avisar({ situacao: 'sucesso', titulo: 'Token trocado.' });
              return { ok: true };
            }}
          >
            <p className={estilos.informacao}>
              O token atual para de valer na hora, e o coletor que o usa para de coletar até receber
              o novo.
            </p>
          </Confirmacao>
        </div>
      </Parte>
      <VerNaAuditoria alvo={[`coletor:${coletor.id}`]} nome={coletor.nome} />
      <DialogoDoToken nome={coletor.nome} token={token} aoFechar={() => definirToken(null)} />
    </div>
  );
}

/** "Reativar" e, confirmada, "Inativar", conforme a situação. */
function AcoesDoColetor({
  coletor,
  aplicar,
}: {
  coletor: Coletor;
  aplicar: (coletor: Coletor) => Promise<void>;
}) {
  const api = useApi();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noColetor = { params: { path: { id: coletor.id } } };

  const aplicarResultado = async (resultado: { dados: Coletor } | FalhaDoPedido, aviso: string) => {
    if ('erro' in resultado) return resultado;
    await aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
    return { ok: true } as const;
  };

  return (
    <div className={estilos.acoesDaPessoa}>
      <div className={estilos.gruposDeAcoes}>
        {coletor.situacao === 'inativo' ? (
          <Botao
            carregando={reativando}
            rotuloCarregando="Reativando"
            onPress={async () => {
              definirReativando(true);
              definirFalha(null);
              const resultado = await aplicarResultado(
                await pedir(
                  () => api.POST('/coletores/{id}/reativacao', noColetor),
                  'reativar o coletor',
                ),
                'Coletor reativado.',
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
            titulo={`Inativar o ${coletor.nome}?`}
            confirmar="Inativar o coletor"
            confirmando="Inativando"
            fazer={async () =>
              aplicarResultado(
                await pedir(
                  () => api.POST('/coletores/{id}/inativacao', noColetor),
                  'inativar o coletor',
                ),
                'Coletor inativado.',
              )
            }
          >
            <p className={estilos.informacao}>
              O coletor para de coletar, e os ativos dele passam ao coletor que alcançar o IP deles.
              Reativado, ele volta a coletar com o mesmo token.
            </p>
          </Confirmacao>
        )}
      </div>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}
