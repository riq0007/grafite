// O cadastro das salas e dos itens (spec modulo-salas, "Pedidos e cadastro"; change
// salas-de-reuniao, design, decisão 6): as duas listas, cada uma com "Nova sala" ou "Novo item", a
// edição numa gaveta e "Inativar" e "Reativar". A conferência é a do domínio, e a recusa fica no
// campo.
import { conferirItemDaSala, conferirSala } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeTexto,
  Carimbo,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Gaveta,
  Linha,
  MensagemDoPasso,
  RotuloDeSituacao,
  Tabela,
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
import {
  CHAVE_DAS_SALAS,
  type ItemDaSala,
  type SalaDeReuniao,
  useCadastroDasSalas,
} from './consultas.ts';
import estilos from './Salas.module.css';

const SITUACAO = {
  ativo: { texto: 'Ativa', tom: 'sucesso' },
  inativo: { texto: 'Inativa', tom: 'neutra' },
} as const;

const SITUACAO_DO_ITEM = {
  ativo: { texto: 'Ativo', tom: 'sucesso' },
  inativo: { texto: 'Inativo', tom: 'neutra' },
} as const;

/** A gaveta da sala nova ou da que existe. */
function FormularioDaSala({
  sala,
  aoFechar,
}: {
  sala: SalaDeReuniao | null;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [nome, definirNome] = useState(sala?.nome ?? '');
  const [localId, definirLocalId] = useState<string | null>(sala?.local?.id ?? null);
  const [capacidade, definirCapacidade] = useState(sala?.capacidade ? String(sala.capacidade) : '');
  const [recursos, definirRecursos] = useState(sala?.recursos ?? '');
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  async function salvar() {
    const pedido = {
      nome,
      localId,
      capacidade: capacidade.trim() === '' ? null : Number(capacidade.trim()),
      recursos: recursos.trim() === '' ? null : recursos,
    };
    const conferida = conferirSala(pedido);
    if (!conferida.ok) {
      definirErros(conferida.erros as Record<string, string>);
      return;
    }
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        sala
          ? api.PATCH('/salas/{id}', { params: { path: { id: sala.id } }, body: pedido })
          : api.POST('/salas', { body: pedido }),
      'salvar a sala',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<string>(resultado);
      if (campos && Object.keys(campos).length > 0) definirErros(campos as Record<string, string>);
      else definirFalha(resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: sala ? 'Sala salva.' : 'Sala cadastrada.' });
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SALAS });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={sala ? 'Editar sala' : 'Nova sala'}
    >
      <div className={estilos.formulario}>
        <CampoDeTexto
          rotulo="Nome"
          obrigatorio
          value={nome}
          onChange={definirNome}
          erro={erros.nome}
        />
        <SeletorDeLocal
          rotulo="Local"
          valor={localId}
          aoMudar={definirLocalId}
          erro={erros.local}
        />
        <CampoDeTexto
          rotulo="Capacidade"
          inputMode="numeric"
          descricao="Quantas pessoas cabem sentadas."
          value={capacidade}
          onChange={definirCapacidade}
          erro={erros.capacidade}
        />
        <CampoDeTexto
          rotulo="Recursos"
          descricao="O que a sala já tem, como a TV e o quadro branco."
          value={recursos}
          onChange={definirRecursos}
          erro={erros.recursos}
        />
        <MensagemDoPasso texto={falha} chave={0} />
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao nivel="primario" carregando={enviando} onPress={() => void salvar()}>
            {sala ? 'Salvar' : 'Cadastrar sala'}
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** A gaveta do item novo ou do que existe. */
function FormularioDoItem({ item, aoFechar }: { item: ItemDaSala | null; aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [nome, definirNome] = useState(item?.nome ?? '');
  const [descricao, definirDescricao] = useState(item?.descricao ?? '');
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  async function salvar() {
    const pedido = { nome, descricao: descricao.trim() === '' ? null : descricao };
    const conferido = conferirItemDaSala(pedido);
    if (!conferido.ok) {
      definirErros(conferido.erros as Record<string, string>);
      return;
    }
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        item
          ? api.PATCH('/salas/itens/{id}', { params: { path: { id: item.id } }, body: pedido })
          : api.POST('/salas/itens', { body: pedido }),
      'salvar o item',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<string>(resultado);
      if (campos && Object.keys(campos).length > 0) definirErros(campos as Record<string, string>);
      else definirFalha(resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: item ? 'Item salvo.' : 'Item cadastrado.' });
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SALAS });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={item ? 'Editar item' : 'Novo item'}
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
          rotulo="Descrição"
          value={descricao}
          onChange={definirDescricao}
          erro={erros.descricao}
        />
        <MensagemDoPasso texto={falha} chave={0} />
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao nivel="primario" carregando={enviando} onPress={() => void salvar()}>
            {item ? 'Salvar' : 'Cadastrar item'}
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

export function Cadastro() {
  const api = useApi();
  const consultas = useQueryClient();
  const { pode } = useAcesso();
  const cadastro = useCadastroDasSalas();
  const [sala, definirSala] = useState<SalaDeReuniao | 'nova' | null>(null);
  const [item, definirItem] = useState<ItemDaSala | 'novo' | null>(null);

  if (!pode('salas.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Cadastro das salas" />
        <SemPermissao a="ao cadastro das salas" />
      </>
    );
  }

  async function mudarSituacao(tipo: 'sala' | 'item', id: string, situacao: 'ativo' | 'inativo') {
    const caminho = { params: { path: { id } } };
    const resultado =
      tipo === 'sala'
        ? await pedir(
            () =>
              situacao === 'inativo'
                ? api.POST('/salas/{id}/inativacao', caminho)
                : api.POST('/salas/{id}/reativacao', caminho),
            'mudar a situação da sala',
          )
        : await pedir(
            () =>
              situacao === 'inativo'
                ? api.POST('/salas/itens/{id}/inativacao', caminho)
                : api.POST('/salas/itens/{id}/reativacao', caminho),
            'mudar a situação do item',
          );
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo: `${tipo === 'sala' ? 'Sala' : 'Item'} ${situacao === 'inativo' ? (tipo === 'sala' ? 'inativada' : 'inativado') : tipo === 'sala' ? 'reativada' : 'reativado'}.`,
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DAS_SALAS });
  }

  const salas = cadastro.data?.salas ?? [];
  const itens = cadastro.data?.itens ?? [];

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Cadastro das salas"
        acoes={
          <>
            <Botao nivel="primario" icone={Plus} onPress={() => definirSala('nova')}>
              Nova sala
            </Botao>
            <Botao icone={Plus} onPress={() => definirItem('novo')}>
              Novo item
            </Botao>
          </>
        }
      />
      {cadastro.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando o cadastro…
        </p>
      ) : (
        <>
          <section className={estilos.secao} aria-labelledby="salas-do-cadastro">
            <Carimbo id="salas-do-cadastro">Salas</Carimbo>
            <Tabela
              rotulo="Salas"
              aoAbrirLinha={(id) => definirSala(salas.find((uma) => uma.id === id) ?? null)}
            >
              <CabecalhoDaTabela>
                <Coluna id="nome" principal>
                  Nome
                </Coluna>
                <Coluna id="local">Local</Coluna>
                <Coluna id="capacidade">Capacidade</Coluna>
                <Coluna id="situacao" especie="situacao">
                  Situação
                </Coluna>
                <Coluna id="acao" especie="acoes">
                  Ações
                </Coluna>
              </CabecalhoDaTabela>
              <CorpoDaTabela
                itens={salas}
                vazio={
                  <EstadoVazio
                    titulo="Nenhuma sala cadastrada."
                    descricao="Cadastre as salas de reunião com o local e a capacidade."
                  />
                }
              >
                {(uma) => (
                  <Linha id={uma.id}>
                    <Celula>{uma.nome}</Celula>
                    <Celula>{uma.local?.caminho ?? '—'}</Celula>
                    <Celula>{uma.capacidade ? `${uma.capacidade} lugares` : '—'}</Celula>
                    <Celula>
                      <RotuloDeSituacao situacao={SITUACAO[uma.situacao].tom}>
                        {SITUACAO[uma.situacao].texto}
                      </RotuloDeSituacao>
                    </Celula>
                    <Celula>
                      <Botao
                        nivel="terciario"
                        onPress={() =>
                          void mudarSituacao(
                            'sala',
                            uma.id,
                            uma.situacao === 'ativo' ? 'inativo' : 'ativo',
                          )
                        }
                      >
                        {uma.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
                      </Botao>
                    </Celula>
                  </Linha>
                )}
              </CorpoDaTabela>
            </Tabela>
          </section>
          <section className={estilos.secao} aria-labelledby="itens-do-cadastro">
            <Carimbo id="itens-do-cadastro">Itens solicitáveis</Carimbo>
            <Tabela
              rotulo="Itens solicitáveis"
              aoAbrirLinha={(id) => definirItem(itens.find((um) => um.id === id) ?? null)}
            >
              <CabecalhoDaTabela>
                <Coluna id="nome" principal>
                  Nome
                </Coluna>
                <Coluna id="descricao">Descrição</Coluna>
                <Coluna id="situacao" especie="situacao">
                  Situação
                </Coluna>
                <Coluna id="acao" especie="acoes">
                  Ações
                </Coluna>
              </CabecalhoDaTabela>
              <CorpoDaTabela
                itens={itens}
                vazio={
                  <EstadoVazio
                    titulo="Nenhum item cadastrado."
                    descricao="Cadastre o que a reunião pode pedir, como o projetor e o viva-voz."
                  />
                }
              >
                {(um) => (
                  <Linha id={um.id}>
                    <Celula>{um.nome}</Celula>
                    <Celula>{um.descricao ?? '—'}</Celula>
                    <Celula>
                      <RotuloDeSituacao situacao={SITUACAO_DO_ITEM[um.situacao].tom}>
                        {SITUACAO_DO_ITEM[um.situacao].texto}
                      </RotuloDeSituacao>
                    </Celula>
                    <Celula>
                      <Botao
                        nivel="terciario"
                        onPress={() =>
                          void mudarSituacao(
                            'item',
                            um.id,
                            um.situacao === 'ativo' ? 'inativo' : 'ativo',
                          )
                        }
                      >
                        {um.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
                      </Botao>
                    </Celula>
                  </Linha>
                )}
              </CorpoDaTabela>
            </Tabela>
          </section>
        </>
      )}
      {sala && (
        <FormularioDaSala sala={sala === 'nova' ? null : sala} aoFechar={() => definirSala(null)} />
      )}
      {item && (
        <FormularioDoItem item={item === 'novo' ? null : item} aoFechar={() => definirItem(null)} />
      )}
    </div>
  );
}
