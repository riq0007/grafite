// O cadastro dos painéis (spec modulo-paineis, "Cadastro dos painéis"; change painel-de-dashboards):
// a lista, ativos e inativos, com o endereço, o local, a ordem, a verificação e a exibição (change
// diagnostico-dos-paineis), "Novo painel" e a edição numa gaveta, "Inativar", "Reativar" e
// "Verificar agora".
import {
  conferirPainel,
  EXIBICOES_DO_PAINEL_NA_TELA,
  SITUACOES_DO_PAINEL_NA_TELA,
} from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Coluna,
  ContagemDaLista,
  CorpoDaTabela,
  EstadoVazio,
  Gaveta,
  Linha,
  MensagemDoPasso,
  RotuloDeSituacao,
  Tabela,
  ValorComposto,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { recusaDe } from '../administracao/recusa.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { SeletorDeLocal } from '../administracao/seletores/SeletorDeLocal.tsx';
import { SITUACOES_DO_REGISTRO } from '../administracao/situacoes.ts';
import { CHAVE_DOS_PAINEIS, type Painel, usePaineis } from './consultas.ts';
import estilos from './Paineis.module.css';

function FormularioDoPainel({ painel, aoFechar }: { painel: Painel | null; aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [nome, definirNome] = useState(painel?.nome ?? '');
  const [endereco, definirEndereco] = useState(painel?.endereco ?? '');
  const [localId, definirLocalId] = useState<string | null>(painel?.local?.id ?? null);
  const [ordem, definirOrdem] = useState(String(painel?.ordem ?? 100));
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  async function salvar() {
    const pedido = {
      nome,
      endereco,
      localId,
      ordem: ordem.trim() === '' ? null : Number(ordem.trim()),
    };
    const conferido = conferirPainel(pedido);
    if (!conferido.ok) {
      definirErros(conferido.erros as Record<string, string>);
      return;
    }
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        painel
          ? api.PATCH('/paineis/{id}', { params: { path: { id: painel.id } }, body: pedido })
          : api.POST('/paineis', { body: pedido }),
      'salvar o painel',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<string>(resultado);
      if (campos && Object.keys(campos).length > 0) definirErros(campos as Record<string, string>);
      else definirFalha(resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: painel ? 'Painel salvo.' : 'Painel cadastrado.' });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_PAINEIS });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={painel ? 'Editar painel' : 'Novo painel'}
    >
      <div className={estilos.formulario}>
        <CampoDeTexto
          rotulo="Nome"
          obrigatorio
          value={nome}
          onChange={definirNome}
          erro={erros.nome}
        />
        <CampoDeTexto
          rotulo="Endereço"
          obrigatorio
          descricao="Com o protocolo, o IP e a porta, como http://10.0.0.20:3000."
          value={endereco}
          onChange={definirEndereco}
          erro={erros.endereco}
        />
        <SeletorDeLocal
          rotulo="Local"
          valor={localId}
          aoMudar={definirLocalId}
          erro={erros.local}
        />
        <CampoDeTexto
          rotulo="Ordem na grade"
          inputMode="numeric"
          descricao="De 1 a 999; os de mesma ordem vão pelo nome."
          value={ordem}
          onChange={definirOrdem}
          erro={erros.ordem}
        />
        <MensagemDoPasso texto={falha} chave={0} />
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao nivel="primario" carregando={enviando} onPress={() => void salvar()}>
            {painel ? 'Salvar' : 'Cadastrar painel'}
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/**
 * O retorno do "Verificar agora": a situação e, no painel no ar que não aparece na grade, a
 * exibição também, como "No ar, mas recusa ser embutido.".
 */
function retornoDaVerificacao(painel: Painel): string {
  const situacao = SITUACOES_DO_PAINEL_NA_TELA[painel.verificacao.situacao].texto;
  const exibicao = painel.exibicao?.situacao ?? 'aparece';
  if (painel.verificacao.situacao !== 'no-ar' || exibicao === 'aparece') {
    return `Painel verificado: ${situacao}.`;
  }
  const { texto } = EXIBICOES_DO_PAINEL_NA_TELA[exibicao];
  return `Painel verificado: ${situacao}, mas ${texto.charAt(0).toLowerCase()}${texto.slice(1)}.`;
}

/** A exibição em texto, com o motivo ao lado, ou o travessão no painel sem exibição. */
function ExibicaoDoPainel({ exibicao }: { exibicao: Painel['exibicao'] }) {
  if (!exibicao) return '—';
  const { texto, tom } = EXIBICOES_DO_PAINEL_NA_TELA[exibicao.situacao];
  return (
    <ValorComposto fixo={<RotuloDeSituacao situacao={tom}>{texto}</RotuloDeSituacao>}>
      {exibicao.motivo}
    </ValorComposto>
  );
}

export function Cadastro() {
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const paineis = usePaineis();
  const [aberto, definirAberto] = useState<Painel | 'novo' | null>(null);
  const [ocupado, definirOcupado] = useState<string | null>(null);

  if (!pode('paineis.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Cadastro dos painéis" />
        <SemPermissao a="ao cadastro dos painéis" />
      </>
    );
  }

  async function agir(painel: Painel, acao: 'inativacao' | 'reativacao' | 'verificacao') {
    definirOcupado(`${painel.id}-${acao}`);
    const caminho = { params: { path: { id: painel.id } } };
    const resultado = await pedir(
      () =>
        acao === 'inativacao'
          ? api.POST('/paineis/{id}/inativacao', caminho)
          : acao === 'reativacao'
            ? api.POST('/paineis/{id}/reativacao', caminho)
            : api.POST('/paineis/{id}/verificacao', caminho),
      'mudar o painel',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo:
        acao === 'verificacao'
          ? retornoDaVerificacao(resultado.dados)
          : acao === 'inativacao'
            ? 'Painel inativado.'
            : 'Painel reativado.',
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_PAINEIS });
  }

  const lista = paineis.data?.paineis ?? [];

  return (
    <div className={estilos.telaDoCadastro}>
      <CabecalhoDaPagina
        titulo="Cadastro dos painéis"
        acoes={
          <Botao nivel="primario" icone={Plus} onPress={() => definirAberto('novo')}>
            Novo painel
          </Botao>
        }
      />
      {paineis.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando os painéis…
        </p>
      ) : (
        <>
          <ContagemDaLista quantos={lista.length} singular="painel" plural="painéis" />
          <Tabela
            rotulo="Painéis"
            aoAbrirLinha={(id) => definirAberto(lista.find((um) => um.id === id) ?? null)}
          >
            <CabecalhoDaTabela>
              <Coluna id="nome" principal>
                Nome
              </Coluna>
              <Coluna id="endereco" especie="codigo">
                Endereço
              </Coluna>
              <Coluna id="local">Local</Coluna>
              <Coluna id="ordem" especie="numero">
                Ordem
              </Coluna>
              <Coluna id="verificacao" especie="situacao">
                Verificação
              </Coluna>
              <Coluna id="exibicao">Exibição</Coluna>
              <Coluna id="situacao" especie="situacao">
                Cadastro
              </Coluna>
              <Coluna id="acoes" especie="acoes">
                Ações
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={lista}
              vazio={
                <EstadoVazio
                  titulo="Nenhum painel cadastrado."
                  descricao="Cadastre o endereço de cada painel das VMs."
                />
              }
            >
              {(painel) => {
                const verificacao = SITUACOES_DO_PAINEL_NA_TELA[painel.verificacao.situacao];
                return (
                  <Linha id={painel.id}>
                    <Celula>{painel.nome}</Celula>
                    <Celula mono>{painel.endereco}</Celula>
                    <Celula>{painel.local?.caminho ?? '—'}</Celula>
                    <Celula>{painel.ordem}</Celula>
                    <Celula>
                      <RotuloDeSituacao situacao={verificacao.tom}>
                        {verificacao.texto}
                      </RotuloDeSituacao>
                    </Celula>
                    <Celula>
                      <ExibicaoDoPainel exibicao={painel.exibicao} />
                    </Celula>
                    <Celula>
                      <RotuloDeSituacao situacao={SITUACOES_DO_REGISTRO[painel.situacao].tipo}>
                        {SITUACOES_DO_REGISTRO[painel.situacao].texto}
                      </RotuloDeSituacao>
                    </Celula>
                    <Celula>
                      <span className={estilos.acoes}>
                        {painel.situacao === 'ativo' && (
                          <Botao
                            nivel="terciario"
                            carregando={ocupado === `${painel.id}-verificacao`}
                            onPress={() => void agir(painel, 'verificacao')}
                          >
                            Verificar agora
                          </Botao>
                        )}
                        <Botao
                          nivel="terciario"
                          onPress={() =>
                            void agir(
                              painel,
                              painel.situacao === 'ativo' ? 'inativacao' : 'reativacao',
                            )
                          }
                        >
                          {painel.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
                        </Botao>
                      </span>
                    </Celula>
                  </Linha>
                );
              }}
            </CorpoDaTabela>
          </Tabela>
        </>
      )}
      {aberto && (
        <FormularioDoPainel
          painel={aberto === 'novo' ? null : aberto}
          aoFechar={() => definirAberto(null)}
        />
      )}
    </div>
  );
}
