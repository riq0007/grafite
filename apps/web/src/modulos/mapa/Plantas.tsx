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
import { SeletorDeLocal } from '../administracao/seletores/SeletorDeLocal.tsx';
import { CHAVE_DO_MAPA, type PlantaDoMapa, usePlantas } from './consultas.ts';
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

/** As ações que abrem uma gaveta; as outras valem na hora. */
type AcaoComGaveta = 'renomear' | 'local';

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
    </div>
  );
}
