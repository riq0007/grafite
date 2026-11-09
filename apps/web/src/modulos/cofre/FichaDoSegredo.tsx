import {
  mostrarData,
  ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO,
  ROTULOS_DOS_TIPOS_DE_SEGREDO,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeSenha,
  Dialogo,
  EstadoVazio,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { FalhaDaConsulta } from '../../api/consultas.ts';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { focarDestino } from '../../casca/foco.ts';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { Confirmacao } from '../administracao/Confirmacao.tsx';
import { useFocoPerdido } from '../administracao/Parte.tsx';
import { recusaDe } from '../administracao/recusa.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { SITUACOES_DO_REGISTRO } from '../administracao/situacoes.ts';
import { AcessoDoSegredo } from './AcessoDoSegredo.tsx';
import estilos from './Cofre.module.css';
import {
  aplicarSegredo,
  type FichaDoSegredo as Ficha,
  SEM_DOIS_PASSOS,
  useSegredo,
} from './consultas.ts';
import { type DadosDoSegredo, FormularioDoSegredo } from './FormularioDoSegredo.tsx';
import { RevelarECopiar } from './RevelarECopiar.tsx';
import { SemDoisPassos } from './SemDoisPassos.tsx';
import { useSituacaoDaValidade } from './validade.tsx';

/** A ficha de um segredo, para quem usa o cofre (spec modulo-cofre, "Cadastro e ficha do segredo"). */
export function FichaDoSegredo() {
  const { pode } = useAcesso();
  if (!pode('cofre.usar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Segredo" />
        <SemPermissao a="ao Cofre" />
      </>
    );
  }
  return <FichaCarregada />;
}

/**
 * O nome e a situação no título, os dados, a pessoa e os ativos ligados, com o caminho até cada um,
 * e, para quem administra o cofre, a edição, "Trocar o valor", a inativação e o acesso. Quem só usa
 * o cofre lê a ficha. O valor nunca aparece aqui fora da revelação.
 */
function FichaCarregada() {
  const { id } = useParams({ from: '/cofre/$id' });
  const segredo = useSegredo(id);
  const [editando, definirEditando] = useState(false);
  // "Inativar" vira "Reativar" no título: o foco perdido vai ao título da janela.
  const pedirFoco = useFocoPerdido(segredo.data?.situacao, () => focarDestino(undefined));

  if (segredo.isPending) {
    return (
      <>
        <CabecalhoDaPagina titulo="Segredo" />
        <p role="status" className={estilos.contagem}>
          Carregando o segredo…
        </p>
      </>
    );
  }
  if (segredo.isError) {
    return (
      <>
        <CabecalhoDaPagina titulo="Segredo" />
        {segredo.error instanceof FalhaDaConsulta && segredo.error.codigo === SEM_DOIS_PASSOS ? (
          <SemDoisPassos />
        ) : (
          <EstadoVazio
            titulo={segredo.error.message}
            acao={<Botao onPress={() => void segredo.refetch()}>Tentar de novo</Botao>}
          />
        )}
      </>
    );
  }

  const ficha = segredo.data;
  const situacao = SITUACOES_DO_REGISTRO[ficha.situacao];
  const administra = ficha.permite.administrar;

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={ficha.nome}
        selos={<RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>}
        acoes={
          administra &&
          !editando && (
            <AcoesDoSegredo
              segredo={ficha}
              aoEditar={() => definirEditando(true)}
              pedirFoco={pedirFoco}
            />
          )
        }
      />
      {ficha.permite.revelar && <RevelarECopiar segredo={ficha} />}
      {editando ? (
        <EdicaoDoSegredo segredo={ficha} aoTerminar={() => definirEditando(false)} />
      ) : (
        <DadosDaFicha segredo={ficha} />
      )}
      {administra && <AcessoDoSegredo segredo={ficha} />}
    </div>
  );
}

const semValor = <span className={estilos.semValor}>—</span>;

function DadosDaFicha({ segredo }: { segredo: Ficha }) {
  const { pode } = useAcesso();
  const { formatarDataEHora } = useDataHora();
  const { vencido, rotacaoAtrasada } = useSituacaoDaValidade(segredo);
  return (
    <ListaDeDados
      itens={[
        { rotulo: 'Tipo', valor: ROTULOS_DOS_TIPOS_DE_SEGREDO[segredo.tipo] },
        {
          rotulo: 'Classificação',
          valor: ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO[segredo.classificacao],
        },
        { rotulo: 'Identificador', valor: segredo.identificador ?? semValor },
        { rotulo: 'Endereço', valor: segredo.endereco ?? semValor },
        {
          rotulo: 'Validade',
          valor: (
            <span className={estilos.validade}>
              {segredo.validade ? mostrarData(segredo.validade) : semValor}
              {vencido && <RotuloDeSituacao situacao="atencao">Vencido</RotuloDeSituacao>}
            </span>
          ),
        },
        {
          rotulo: 'Próxima rotação',
          valor: (
            <span className={estilos.validade}>
              {segredo.proximaRotacao ? mostrarData(segredo.proximaRotacao) : semValor}
              {rotacaoAtrasada && (
                <RotuloDeSituacao situacao="atencao">Rotação atrasada</RotuloDeSituacao>
              )}
            </span>
          ),
        },
        {
          rotulo: 'Pessoa',
          valor: segredo.pessoa ? (
            pode('pessoas.ver') ? (
              <Link
                to="/administracao/pessoas/$id"
                params={{ id: segredo.pessoa.id }}
                className={estilos.link}
              >
                {segredo.pessoa.nome}
              </Link>
            ) : (
              segredo.pessoa.nome
            )
          ) : (
            semValor
          ),
        },
        {
          rotulo: 'Ativos',
          valor:
            segredo.ativos.length === 0 ? (
              semValor
            ) : (
              <ul className={estilos.lista}>
                {segredo.ativos.map((ativo) => {
                  const rotulo = [ativo.patrimonio, ativo.rotulo].filter(Boolean).join(' · ');
                  return (
                    <li key={ativo.id}>
                      {pode('ativos.ver') ? (
                        <Link to="/ativos/$id" params={{ id: ativo.id }} className={estilos.link}>
                          {rotulo}
                        </Link>
                      ) : (
                        rotulo
                      )}
                    </li>
                  );
                })}
              </ul>
            ),
        },
        { rotulo: 'Notas', valor: segredo.notas ?? semValor },
        {
          rotulo: 'Valor trocado em',
          valor: formatarDataEHora(new Date(segredo.valorTrocadoEm)),
        },
      ]}
    />
  );
}

/** Os dados do segredo no formulário, com os vínculos pelo nome que a ficha mostra. */
function dadosDoFormulario(segredo: Ficha): DadosDoSegredo {
  return {
    nome: segredo.nome,
    tipo: segredo.tipo,
    classificacao: segredo.classificacao,
    identificador: segredo.identificador ?? '',
    endereco: segredo.endereco ?? '',
    notas: segredo.notas ?? '',
    validade: segredo.validade,
    proximaRotacao: segredo.proximaRotacao,
    pessoa: segredo.pessoa ? { id: segredo.pessoa.id, rotulo: segredo.pessoa.nome } : null,
    ativos: segredo.ativos.map((ativo) => ({
      id: ativo.id,
      rotulo: [ativo.patrimonio, ativo.rotulo].filter(Boolean).join(' · '),
    })),
    valor: '',
  };
}

function EdicaoDoSegredo({ segredo, aoTerminar }: { segredo: Ficha; aoTerminar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  return (
    <FormularioDoSegredo
      inicial={dadosDoFormulario(segredo)}
      comValor={false}
      rotuloDoEnvio="Salvar alterações"
      aoCancelar={aoTerminar}
      enviar={async (pedido) => {
        const resultado = await pedir(
          () =>
            api.PATCH('/cofre/segredos/{id}', {
              params: { path: { id: segredo.id } },
              body: pedido,
            }),
          'salvar o segredo',
        );
        if ('erro' in resultado) return recusaDe(resultado);
        await aplicarSegredo(consultas, resultado.dados);
        avisar({ situacao: 'sucesso', titulo: 'Segredo salvo.' });
        aoTerminar();
        return { ok: true };
      }}
    />
  );
}

/** "Editar", "Trocar o valor" e, confirmada, "Inativar", ou "Reativar", conforme a situação. */
function AcoesDoSegredo({
  segredo,
  aoEditar,
  pedirFoco,
}: {
  segredo: Ficha;
  aoEditar: () => void;
  pedirFoco: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [reativando, definirReativando] = useState(false);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const noSegredo = { params: { path: { id: segredo.id } } };

  return (
    <div className={estilos.acoes}>
      <Botao onPress={aoEditar}>Editar</Botao>
      <TrocaDoValor segredo={segredo} />
      {segredo.situacao === 'inativo' ? (
        <Botao
          carregando={reativando}
          rotuloCarregando="Reativando"
          onPress={async () => {
            definirReativando(true);
            definirFalha(null);
            try {
              const resultado = await pedir(
                () => api.POST('/cofre/segredos/{id}/reativacao', noSegredo),
                'reativar o segredo',
              );
              if ('erro' in resultado) {
                definirFalha(resultado.erro);
                definirTentativa((atual) => atual + 1);
                return;
              }
              pedirFoco();
              await aplicarSegredo(consultas, resultado.dados);
              avisar({ situacao: 'sucesso', titulo: 'Segredo reativado.' });
            } finally {
              definirReativando(false);
            }
          }}
        >
          Reativar
        </Botao>
      ) : (
        <Confirmacao
          acao="Inativar"
          titulo={`Inativar o segredo ${segredo.nome}?`}
          confirmando="Inativando"
          fazer={async () => {
            const resultado = await pedir(
              () => api.POST('/cofre/segredos/{id}/inativacao', noSegredo),
              'inativar o segredo',
            );
            if ('erro' in resultado) return resultado;
            pedirFoco();
            await aplicarSegredo(consultas, resultado.dados);
            avisar({ situacao: 'sucesso', titulo: 'Segredo inativado.' });
            return { ok: true };
          }}
        >
          <p className={estilos.informacao}>
            O segredo sai da lista de quem o usa e não pode mais ser revelado. Ele pode ser
            reativado.
          </p>
        </Confirmacao>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </div>
  );
}

/** "Trocar o valor": o valor novo, escondido enquanto é digitado; o antigo nunca aparece. */
function TrocaDoValor({ segredo }: { segredo: Ficha }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [aberto, definirAberto] = useState(false);
  const [valor, definirValor] = useState('');
  const [erro, definirErro] = useState<string | undefined>();
  const [enviando, definirEnviando] = useState(false);
  const fechar = () => {
    definirAberto(false);
    definirValor('');
    definirErro(undefined);
  };
  return (
    <Dialogo
      titulo={`Trocar o valor de ${segredo.nome}`}
      gatilho={<Botao>Trocar o valor</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => (abrir ? definirAberto(true) : fechar())}
      acoes={() => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Trocando"
            onPress={async () => {
              if (valor === '') return definirErro('Informe o valor do segredo.');
              definirEnviando(true);
              try {
                const resultado = await pedir(
                  () =>
                    api.PATCH('/cofre/segredos/{id}', {
                      params: { path: { id: segredo.id } },
                      body: { valor },
                    }),
                  'trocar o valor',
                );
                if ('erro' in resultado) {
                  definirErro(resultado.problema?.campos?.valor ?? resultado.erro);
                  return;
                }
                await aplicarSegredo(consultas, resultado.dados);
                avisar({ situacao: 'sucesso', titulo: 'Valor trocado.' });
                fechar();
              } finally {
                definirEnviando(false);
              }
            }}
          >
            Trocar o valor
          </Botao>
        </>
      )}
    >
      <p className={estilos.informacao}>
        O valor novo passa a valer na hora. A próxima rotação não muda sozinha: edite o segredo se
        quiser mudá-la.
      </p>
      <CampoDeSenha
        rotulo="Valor novo"
        obrigatorio
        autoComplete="new-password"
        value={valor}
        onChange={(novo) => {
          definirValor(novo);
          definirErro(undefined);
        }}
        erro={erro}
      />
    </Dialogo>
  );
}
