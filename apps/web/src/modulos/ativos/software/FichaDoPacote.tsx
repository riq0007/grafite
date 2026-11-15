// A ficha do pacote (spec distribuicao-de-software, "Ficha do pacote"; change software-por-pacote,
// m01): à esquerda, o pacote, com o tipo, o arquivo em partes, quem o guardou, a categoria e o nome
// no inventário, e "Distribuir este pacote", "Editar" e "Inativar"; no centro, os quatro números
// frente ao inventário, "O que a instalação faz", as barras das versões encontradas e as
// distribuições do pacote, que abrem a ficha de cada uma.
import { explicarOComando } from '@grafite/domain';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  Carimbo,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  formatarTamanho,
  Icone,
  Linha,
  RotuloDeSituacao,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeft, Pencil, Rocket } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { CHAVE_DO_SOFTWARE, type FichaDoPacote as Ficha, usePacote } from './consultas.ts';
import { Distribuir } from './Distribuir.tsx';
import dividida from './Dividida.module.css';
import estilos from './FichaDoPacote.module.css';
import { momentoCurto, plural } from './formatos.ts';
import { Pacote } from './Pacote.tsx';
import { BarraDeSituacoes, IconeDoPacote, RotulosDoResultado } from './Pecas.tsx';

/** O estado escrito de cada barra das versões. */
const ESTADO_DA_VERSAO = {
  alvo: 'alvo',
  abaixo: 'abaixo do alvo',
  acima: 'acima do alvo',
} as const;

/** O nome do programa nas contas e nas barras: o do inventário, que é o que casa. */
const nomeDoPrograma = (pacote: Ficha['pacote']) => pacote.nomeNoInventario ?? pacote.nome;

/** Os quatro números frente ao inventário; sem a versão-alvo, só o instalado e o sem. */
function Numeros({ ficha }: { ficha: Ficha }) {
  const { pacote, contas } = ficha;
  const programa = nomeDoPrograma(pacote);
  return (
    <dl className={estilos.numeros}>
      <div>
        <dt>Instalado em</dt>
        <dd>
          <span className={estilos.numero}>
            {contas.instalado}
            <small>
              {contas.maquinas === 1 ? 'da 1 máquina' : `das ${contas.maquinas} máquinas`}
            </small>
          </span>
          <BarraDeSituacoes
            className={estilos.barraDoInstalado}
            partes={[
              { parte: 'ok', quantidade: contas.instalado },
              { parte: 'neutra', quantidade: contas.sem },
            ]}
          />
          <span className={estilos.legendaDaBarra}>Em todas as versões do {programa}</span>
        </dd>
      </div>
      {pacote.versao !== null && (
        <>
          <div>
            <dt>Na versão {pacote.versao}</dt>
            <dd>
              <span className={estilos.numero}>{contas.naVersao ?? 0}</span>
              <span className={estilos.legenda}>Com a {pacote.versao} ou mais nova</span>
            </dd>
          </div>
          <div>
            <dt>Desatualizadas</dt>
            <dd>
              <span className={estilos.numero}>{contas.desatualizadas ?? 0}</span>
              <span className={estilos.legenda}>Têm o {programa} em versão anterior</span>
            </dd>
          </div>
        </>
      )}
      <div>
        <dt>Sem o {programa}</dt>
        <dd>
          <span className={estilos.numero}>{contas.sem}</span>
          <span className={estilos.legenda}>Ainda não têm o programa</span>
        </dd>
      </div>
    </dl>
  );
}

/** O comando em mono, os pedaços reconhecidos sublinhados e a frase em português. */
function OQueAInstalacaoFaz({ comando }: { comando: string }) {
  const explicacao = explicarOComando(comando);
  const pedacos = [
    ...new Set(explicacao.comando.filter(({ destaque }) => destaque).map(({ texto }) => texto)),
  ];
  return (
    <section className={estilos.secao}>
      <Carimbo>O que a instalação faz</Carimbo>
      <div className={estilos.comando}>
        <div className={estilos.explicacao}>
          <code className={estilos.linhaDeComando}>{comando}</code>
          {pedacos.length > 0 && (
            <span className={estilos.pedacos} aria-hidden="true">
              {pedacos.map((pedaco) => (
                <span key={pedaco}>{pedaco}</span>
              ))}
            </span>
          )}
        </div>
        {explicacao.frase && (
          <p className={estilos.frase}>
            <b>Em português:</b>{' '}
            {explicacao.frase.map((parte, indice) =>
              parte.mono ? (
                // A frase não muda de ordem: a posição faz parte da chave.
                // biome-ignore lint/suspicious/noArrayIndexKey: as partes vêm sempre na mesma ordem.
                <code key={indice} className={estilos.mono}>
                  {parte.texto}
                </code>
              ) : (
                parte.texto
              ),
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/** As barras das versões encontradas, da mais nova para a mais velha, com o estado escrito. */
function Versoes({ ficha }: { ficha: Ficha }) {
  const maior = Math.max(1, ...ficha.versoes.map(({ quantas }) => quantas));
  const programa = nomeDoPrograma(ficha.pacote);
  if (ficha.versoes.length === 0) return null;
  return (
    <ul className={estilos.versoes} aria-label="Versões encontradas no inventário">
      {ficha.versoes.map(({ versao, estado, quantas }) => (
        <li key={versao ?? 'sem-versao'} data-estado={estado ?? undefined}>
          <span className={estilos.nomeDaVersao}>
            {programa} {versao ?? 'sem versão'}
            {estado && ` · ${ESTADO_DA_VERSAO[estado]}`}
          </span>
          <span className={estilos.quantas}>
            <b>{quantas}</b>
            <span className={estilos.trilho} aria-hidden="true">
              <i style={{ width: `${(quantas / maior) * 100}%` }} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A tela da ficha do pacote. */
export function FichaDoPacote() {
  const { id } = useParams({ from: '/gestao/software/pacotes/$id' });
  const pacote = usePacote(id);
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const dataHora = useDataHora();
  const [aberta, definirAberta] = useState<'distribuir' | 'editar' | null>(null);
  const [mudando, definirMudando] = useState(false);

  if (pacote.isPending) {
    return (
      <div className={dividida.espera}>
        <CabecalhoDaPagina titulo="Pacote" />
        <p role="status" className={dividida.nota}>
          Carregando o pacote…
        </p>
      </div>
    );
  }
  if (pacote.isError) {
    return (
      <div className={dividida.espera}>
        <CabecalhoDaPagina titulo="Pacote" />
        <EstadoVazio
          titulo={pacote.error.message}
          acao={<Botao onPress={() => void pacote.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  const ficha = pacote.data;
  const { pacote: dados, permite } = ficha;
  const ativo = dados.situacao === 'ativo';
  const agora = new Date();
  const { arquivo } = dados;

  async function mudarSituacao() {
    definirMudando(true);
    const caminho = { params: { path: { id: dados.id } } };
    const resultado = await pedir(
      () =>
        ativo
          ? api.POST('/software/pacotes/{id}/inativacao', caminho)
          : api.POST('/software/pacotes/{id}/reativacao', caminho),
      ativo ? 'inativar o pacote' : 'reativar o pacote',
    );
    definirMudando(false);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: ativo ? 'Pacote inativado.' : 'Pacote reativado.' });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
  }

  return (
    <div className={dividida.tela}>
      <div className={`${dividida.lateral} ${estilos.lateral}`}>
        <Link to="/gestao/software" className={dividida.volta}>
          <Icone icone={ChevronLeft} tamanho={14} />
          Base de pacotes
        </Link>
        <IconeDoPacote nome={dados.nome} tamanho="gg" />
        <CabecalhoDaPagina
          titulo={dados.nome}
          detalhe={
            <span className={estilos.selos}>
              {dados.versao && (
                <RotuloDeSituacao situacao="neutra" semIcone className={estilos.selo}>
                  Versão {dados.versao}
                </RotuloDeSituacao>
              )}
              <RotuloDeSituacao situacao={ativo ? 'sucesso' : 'neutra'}>
                {ativo ? 'Ativo' : 'Inativo'}
              </RotuloDeSituacao>
            </span>
          }
        />
        {dados.descricao && <p className={estilos.descricao}>{dados.descricao}</p>}
        <dl className={estilos.definicoes}>
          <dt>Tipo</dt>
          <dd>{dados.tipo.longo}</dd>
          <dt>Arquivo</dt>
          <dd className={arquivo ? estilos.mono : undefined}>{arquivo?.nome ?? 'Sem arquivo'}</dd>
          {arquivo && (
            <>
              <dt>Tamanho</dt>
              <dd className={estilos.mono}>
                {formatarTamanho(arquivo.tamanho)}, em {plural(ficha.partes, 'parte', 'partes')}
              </dd>
            </>
          )}
          {arquivo?.guardadoEm && (
            <>
              <dt>Guardado em</dt>
              <dd>
                {momentoCurto(new Date(arquivo.guardadoEm), agora, dataHora)}
                {arquivo.guardadoPor && `, por ${arquivo.guardadoPor.nome}`}
              </dd>
            </>
          )}
          <dt>Categoria</dt>
          <dd>{dados.categoria?.nome ?? 'Sem categoria'}</dd>
          <dt>Nome no inventário</dt>
          <dd>{nomeDoPrograma(dados)}</dd>
        </dl>
        <div className={dividida.pe}>
          {!ativo && (
            <p className={dividida.nota}>O pacote inativo não entra em distribuições novas.</p>
          )}
          <Botao
            nivel="primario"
            icone={Rocket}
            isDisabled={!ativo}
            className={dividida.principal}
            onPress={() => definirAberta('distribuir')}
          >
            Distribuir este pacote
          </Botao>
          {permite.administrar && (
            <Botao icone={Pencil} onPress={() => definirAberta('editar')}>
              Editar
            </Botao>
          )}
          {permite.administrar && (
            <Botao
              nivel={ativo ? 'destrutivo' : 'secundario'}
              carregando={mudando}
              onPress={() => void mudarSituacao()}
            >
              {ativo ? 'Inativar' : 'Reativar'}
            </Botao>
          )}
        </div>
      </div>
      <div className={dividida.centro}>
        <Numeros ficha={ficha} />
        <OQueAInstalacaoFaz comando={dados.comando} />
        <Versoes ficha={ficha} />
        <section className={estilos.secao}>
          <Carimbo>Distribuições deste pacote</Carimbo>
          <Tabela
            rotulo="Distribuições deste pacote"
            aoAbrirLinha={(distribuicao) =>
              void navegar({
                to: '/gestao/software/distribuicoes/$id',
                params: { id: String(distribuicao) },
              })
            }
          >
            <CabecalhoDaTabela>
              <Coluna id="para" principal>
                Para quem
              </Coluna>
              <Coluna id="quando">Quando</Coluna>
              <Coluna id="maquinas">Máquinas</Coluna>
              <Coluna id="resultado">Resultado</Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={ficha.distribuicoes}
              vazio={<EstadoVazio titulo="Nenhuma distribuição deste pacote ainda." />}
            >
              {(distribuicao) => (
                <Linha id={distribuicao.id}>
                  <Celula>{distribuicao.paraQuem}</Celula>
                  <Celula mono>
                    {momentoCurto(new Date(distribuicao.criadaEm), agora, dataHora)}
                  </Celula>
                  <Celula>{distribuicao.maquinas}</Celula>
                  <Celula>
                    <RotulosDoResultado
                      maquinas={distribuicao.maquinas}
                      resultado={distribuicao.resultado}
                    />
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        </section>
      </div>
      {aberta === 'distribuir' && (
        <Distribuir pacote={dados} pacotes={[dados]} aoFechar={() => definirAberta(null)} />
      )}
      {aberta === 'editar' && <Pacote pacote={dados} aoFechar={() => definirAberta(null)} />}
    </div>
  );
}
