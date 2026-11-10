// As plantas do mapa (spec mapa-da-planta, "Plantas da organização" e "Ações da planta na tela";
// changes p7-mapa-da-planta, design, decisão 6, e gestao-das-plantas, design, decisões 1 e 4): os
// cartões das plantas, com as medidas e o que veio do arquivo, a "Nova planta", que envia o DXF ou
// o modelo do PMG, e as ações de cada planta, para quem edita o mapa. Uma planta que falhou ou foi
// inativada diz isso em texto.
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  EscolhaDeArquivo,
  EstadoVazio,
  Gaveta,
  ItemDeMenu,
  Menu,
  RotuloDeSituacao,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { Confirmacao } from '../administracao/Confirmacao.tsx';
import { SeletorDeLocal } from '../administracao/seletores/SeletorDeLocal.tsx';
import {
  CHAVE_DO_MAPA,
  type PlantaDoMapa,
  type SubstituicaoDoDesenho,
  usePlantas,
} from './consultas.ts';
import estilos from './Mapa.module.css';

const SITUACOES = {
  convertendo: { texto: 'Convertendo', tom: 'info' },
  ativa: { texto: 'Ativa', tom: 'sucesso' },
  falhou: { texto: 'Falhou', tom: 'critico' },
  inativa: { texto: 'Inativa', tom: 'neutra' },
} as const;

/** A gaveta da planta nova: o nome e o arquivo. */
function NovaPlanta({ aoFechar }: { aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [nome, definirNome] = useState('');
  const [arquivo, definirArquivo] = useState<File | null>(null);
  // Fora do envio, sem valor: para a escolha de arquivo, `null` é o envio sem progresso conhecido.
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);

  async function enviar() {
    if (!arquivo) return;
    definirErro(null);
    definirProgresso(0);
    const resultado = await pedir(
      () =>
        api.enviarArquivo<PlantaDoMapa>(
          `/mapa/plantas?nome=${encodeURIComponent(nome.trim())}&fonte=${encodeURIComponent(arquivo.name)}`,
          arquivo,
          definirProgresso,
          'POST',
        ),
      'cadastrar a planta',
    );
    definirProgresso(undefined);
    if ('erro' in resultado) {
      definirErro(resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `Planta ${resultado.dados.nome} cadastrada.` });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_MAPA });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Nova planta"
    >
      <div className={estilos.tela}>
        <CampoDeTexto rotulo="Nome" obrigatorio value={nome} onChange={definirNome} />
        <EscolhaDeArquivo
          rotulo="Arquivo"
          descricao="O desenho em DXF, convertido no servidor, ou o modelo da planta do PMG, em JSON."
          formatos={['.dxf', '.json']}
          limite={300 * 1024 * 1024}
          progresso={progresso}
          erro={erro}
          aoEscolher={definirArquivo}
        />
        {arquivo && <p className={estilos.nota}>{arquivo.name}</p>}
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            isDisabled={!arquivo || nome.trim() === ''}
            carregando={progresso !== undefined}
            rotuloCarregando="Enviando e convertendo"
            onPress={() => void enviar()}
          >
            Cadastrar planta
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** O que muda numa planta pelo `PATCH`: o nome, o local ou a situação. */
type MudancaDaPlanta = { nome?: string; local?: string | null; situacao?: 'ativa' | 'inativa' };

/** Muda a planta e relê o mapa; a falha volta em texto, com o problema da API. */
function useMudarPlanta() {
  const api = useApi();
  const consultas = useQueryClient();
  return async (planta: PlantaDoMapa, mudanca: MudancaDaPlanta, acao: string) => {
    const resultado = await pedir(
      () => api.PATCH('/mapa/plantas/{id}', { params: { path: { id: planta.id } }, body: mudanca }),
      acao,
    );
    if (!('erro' in resultado)) await consultas.invalidateQueries({ queryKey: CHAVE_DO_MAPA });
    return resultado;
  };
}

/** A gaveta que renomeia a planta, com o nome atual no campo. */
function RenomearPlanta({ planta, aoFechar }: { planta: PlantaDoMapa; aoFechar: () => void }) {
  const mudar = useMudarPlanta();
  const [nome, definirNome] = useState(planta.nome);
  const [erro, definirErro] = useState<string | undefined>(undefined);
  const [salvando, definirSalvando] = useState(false);

  async function salvar() {
    definirSalvando(true);
    definirErro(undefined);
    const resultado = await mudar(planta, { nome }, 'renomear a planta');
    definirSalvando(false);
    if ('erro' in resultado) {
      definirErro(resultado.problema?.campos?.nome ?? resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: 'Planta renomeada.' });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Renomear a planta"
    >
      <div className={estilos.tela}>
        <CampoDeTexto rotulo="Nome" obrigatorio value={nome} onChange={definirNome} erro={erro} />
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={salvando}
            rotuloCarregando="Salvando"
            onPress={() => void salvar()}
          >
            Salvar
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** A gaveta que liga a planta a um local da árvore, ou a deixa sem local. */
function LocalDaPlanta({ planta, aoFechar }: { planta: PlantaDoMapa; aoFechar: () => void }) {
  const mudar = useMudarPlanta();
  const [local, definirLocal] = useState<string | null>(planta.local?.id ?? null);
  const [erro, definirErro] = useState<string | undefined>(undefined);
  const [salvando, definirSalvando] = useState(false);

  async function salvar() {
    definirSalvando(true);
    definirErro(undefined);
    const resultado = await mudar(planta, { local }, 'ligar a planta ao local');
    definirSalvando(false);
    if ('erro' in resultado) {
      definirErro(resultado.problema?.campos?.local ?? resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: 'Local da planta alterado.' });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Local da planta"
    >
      <div className={estilos.tela}>
        <SeletorDeLocal
          rotulo="Local"
          valor={local}
          aoMudar={definirLocal}
          erro={erro}
          descricao={`Onde a planta ${planta.nome} fica na árvore dos locais.`}
        />
        <div>
          <Botao nivel="terciario" isDisabled={local === null} onPress={() => definirLocal(null)}>
            Deixar sem local
          </Botao>
        </div>
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={salvando}
            rotuloCarregando="Salvando"
            onPress={() => void salvar()}
          >
            Salvar
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** O aviso das posições que ficaram fora da área do desenho novo, para reposicionar. */
const avisoDasPosicoesFora = (quantas: number) =>
  quantas === 1
    ? '1 posição ficou fora do desenho novo. Reposicione-a no mapa.'
    : `${quantas.toLocaleString('pt-BR')} posições ficaram fora do desenho novo. Reposicione-as no mapa.`;

/**
 * A gaveta que substitui o desenho da planta (spec mapa-da-planta, "Substituição do desenho"): o
 * arquivo vai para a mesma planta, e o nome, o local e as posições ficam. A recusa do arquivo
 * aparece na escolha dele, e a planta continua como estava.
 */
function SubstituirDesenho({ planta, aoFechar }: { planta: PlantaDoMapa; aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [arquivo, definirArquivo] = useState<File | null>(null);
  // Fora do envio, sem valor: para a escolha de arquivo, `null` é o envio sem progresso conhecido.
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);

  async function enviar() {
    if (!arquivo) return;
    definirErro(null);
    definirProgresso(0);
    const resultado = await pedir(
      () =>
        api.enviarArquivo<SubstituicaoDoDesenho>(
          `/mapa/plantas/${planta.id}/modelo?fonte=${encodeURIComponent(arquivo.name)}`,
          arquivo,
          definirProgresso,
          'PUT',
        ),
      'substituir o desenho',
    );
    definirProgresso(undefined);
    if ('erro' in resultado) {
      definirErro(resultado.problema?.campos?.arquivo ?? resultado.erro);
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `Desenho da planta ${planta.nome} substituído.` });
    const { posicoesFora } = resultado.dados;
    if (posicoesFora > 0)
      avisar({ situacao: 'atencao', titulo: avisoDasPosicoesFora(posicoesFora) });
    // O mapa aberto passa ao desenho novo: a consulta do modelo é relida, com as outras do mapa.
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_MAPA });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Substituir o desenho"
    >
      <div className={estilos.tela}>
        <p className={estilos.nota}>
          {`O nome, o local e as posições da planta ${planta.nome} ficam como estão.`}
        </p>
        <EscolhaDeArquivo
          rotulo="Arquivo"
          descricao="O desenho em DXF, convertido no servidor, ou o modelo da planta do PMG, em JSON."
          formatos={['.dxf', '.json']}
          limite={300 * 1024 * 1024}
          progresso={progresso}
          erro={erro}
          aoEscolher={definirArquivo}
        />
        {arquivo && <p className={estilos.nota}>{arquivo.name}</p>}
        <div className={estilos.acoes}>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            isDisabled={!arquivo}
            carregando={progresso !== undefined}
            rotuloCarregando="Enviando e convertendo"
            onPress={() => void enviar()}
          >
            Substituir
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}

/** O que a exclusão apaga, em texto, pela quantidade de posições da planta. */
function oQueAExclusaoApaga(posicoes: number): string {
  if (posicoes === 0)
    return 'A exclusão apaga a planta e o desenho dela. Nada está posicionado nela.';
  const quantas = posicoes === 1 ? '1 posição' : `${posicoes.toLocaleString('pt-BR')} posições`;
  return `A exclusão apaga a planta, o desenho dela e ${quantas} no mapa. O que estava posicionado continua cadastrado.`;
}

/**
 * A confirmação da exclusão (spec mapa-da-planta, "Exclusão da planta"): diz quantas posições saem
 * e que a exclusão não se desfaz, e pede o nome da planta digitado.
 */
function ExcluirPlanta({ planta, aoFechar }: { planta: PlantaDoMapa; aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  return (
    <Confirmacao
      aberta
      aoFechar={aoFechar}
      acao="Excluir a planta"
      titulo={`Excluir a planta ${planta.nome}?`}
      confirmando="Excluindo"
      conferir={planta.nome}
      fazer={async () => {
        const resultado = await pedir(
          () => api.DELETE('/mapa/plantas/{id}', { params: { path: { id: planta.id } } }),
          'excluir a planta',
        );
        if ('erro' in resultado) return { erro: resultado.erro };
        avisar({ situacao: 'sucesso', titulo: `Planta ${planta.nome} excluída.` });
        await consultas.invalidateQueries({ queryKey: CHAVE_DO_MAPA });
        return { ok: true };
      }}
    >
      <p className={estilos.paragrafo}>{oQueAExclusaoApaga(planta.posicoes ?? 0)}</p>
      <p className={estilos.paragrafo}>A exclusão não se desfaz.</p>
    </Confirmacao>
  );
}

/** As ações que abrem uma gaveta ou a confirmação; as outras valem na hora. */
type AcaoComGaveta = 'renomear' | 'local' | 'substituir' | 'excluir';

/**
 * O menu "Ações" de uma planta. A planta que falhou não tem a situação nem o local para mudar: os
 * caminhos dela são renomear, substituir o desenho e excluir.
 */
function AcoesDaPlanta({
  planta,
  aoAbrir,
}: {
  planta: PlantaDoMapa;
  aoAbrir: (acao: AcaoComGaveta) => void;
}) {
  const mudar = useMudarPlanta();
  const rotulo = `Ações da planta ${planta.nome}`;

  async function mudarSituacao(situacao: 'ativa' | 'inativa') {
    const resultado = await mudar(
      planta,
      { situacao },
      situacao === 'ativa' ? 'reativar a planta' : 'inativar a planta',
    );
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo: situacao === 'ativa' ? 'Planta reativada.' : 'Planta inativada.',
    });
  }

  return (
    <Menu
      rotulo={rotulo}
      gatilho={
        <Botao nivel="secundario" aria-label={rotulo}>
          Ações
        </Botao>
      }
    >
      <ItemDeMenu id="renomear" onAction={() => aoAbrir('renomear')}>
        Renomear…
      </ItemDeMenu>
      {planta.situacao !== 'falhou' && (
        <ItemDeMenu id="local" onAction={() => aoAbrir('local')}>
          Ligar a um local…
        </ItemDeMenu>
      )}
      {planta.situacao === 'ativa' && (
        <ItemDeMenu id="inativar" onAction={() => void mudarSituacao('inativa')}>
          Inativar
        </ItemDeMenu>
      )}
      {planta.situacao === 'inativa' && (
        <ItemDeMenu id="reativar" onAction={() => void mudarSituacao('ativa')}>
          Reativar
        </ItemDeMenu>
      )}
      <ItemDeMenu id="substituir" onAction={() => aoAbrir('substituir')}>
        Substituir o desenho…
      </ItemDeMenu>
      <ItemDeMenu id="excluir" destrutivo onAction={() => aoAbrir('excluir')}>
        Excluir…
      </ItemDeMenu>
    </Menu>
  );
}

/** A ordem da tela: as ativas e, depois, as inativas e as que falharam, cada grupo pelo nome. */
const ORDEM_DAS_SITUACOES = { ativa: 0, convertendo: 0, inativa: 1, falhou: 2 } as const;

/** A tela das plantas do mapa. */
export function Plantas() {
  const plantas = usePlantas();
  const [nova, definirNova] = useState(false);
  const [aberta, definirAberta] = useState<{ acao: AcaoComGaveta; planta: string } | null>(null);
  const podeEditar = plantas.data?.podeEditar ?? false;
  // A API devolve pelo nome; a ordenação mantém essa ordem dentro de cada grupo.
  const lista = [...(plantas.data?.plantas ?? [])].sort(
    (a, b) => ORDEM_DAS_SITUACOES[a.situacao] - ORDEM_DAS_SITUACOES[b.situacao],
  );
  const plantaAberta = aberta ? lista.find(({ id }) => id === aberta.planta) : undefined;
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Mapa"
        acoes={
          podeEditar && (
            <Botao nivel="primario" icone={Plus} onPress={() => definirNova(true)}>
              Nova planta
            </Botao>
          )
        }
      />
      {plantas.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando as plantas…
        </p>
      ) : plantas.isError ? (
        <EstadoVazio
          titulo={plantas.error.message}
          acao={<Botao onPress={() => void plantas.refetch()}>Tentar de novo</Botao>}
        />
      ) : lista.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma planta ainda."
          descricao={
            podeEditar
              ? 'Cadastre a planta pelo desenho em DXF ou pelo modelo do PMG, em Nova planta.'
              : 'Quem cuida do mapa cadastra a planta pelo desenho da empresa.'
          }
        />
      ) : (
        <ul className={estilos.plantas} aria-label="Plantas">
          {lista.map((planta) => (
            <li key={planta.id} className={estilos.planta}>
              <p className={estilos.nomeDaPlanta}>
                {planta.situacao === 'ativa' ? (
                  <Link to="/mapa/$id" params={{ id: planta.id }}>
                    {planta.nome}
                  </Link>
                ) : (
                  planta.nome
                )}
              </p>
              <div className={estilos.acoes}>
                <RotuloDeSituacao situacao={SITUACOES[planta.situacao].tom}>
                  {SITUACOES[planta.situacao].texto}
                </RotuloDeSituacao>
                {planta.local && <span className={estilos.nota}>{planta.local.caminho}</span>}
              </div>
              {planta.largura !== null && planta.profundidade !== null && (
                <p className={estilos.nota}>
                  {`${Math.round(planta.largura)} × ${Math.round(planta.profundidade)} m`}
                  {planta.contagens
                    ? ` · ${planta.contagens.segmentos.toLocaleString('pt-BR')} linhas · ${planta.contagens.rotulos.toLocaleString('pt-BR')} textos`
                    : ''}
                </p>
              )}
              {planta.erro && <p className={estilos.nota}>{planta.erro}</p>}
              {podeEditar && (
                <div className={estilos.acoes}>
                  <AcoesDaPlanta
                    planta={planta}
                    aoAbrir={(acao) => definirAberta({ acao, planta: planta.id })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {nova && <NovaPlanta aoFechar={() => definirNova(false)} />}
      {plantaAberta && aberta?.acao === 'renomear' && (
        <RenomearPlanta planta={plantaAberta} aoFechar={() => definirAberta(null)} />
      )}
      {plantaAberta && aberta?.acao === 'local' && (
        <LocalDaPlanta planta={plantaAberta} aoFechar={() => definirAberta(null)} />
      )}
      {plantaAberta && aberta?.acao === 'substituir' && (
        <SubstituirDesenho planta={plantaAberta} aoFechar={() => definirAberta(null)} />
      )}
      {plantaAberta && aberta?.acao === 'excluir' && (
        <ExcluirPlanta planta={plantaAberta} aoFechar={() => definirAberta(null)} />
      )}
    </div>
  );
}
