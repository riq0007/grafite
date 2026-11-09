import {
  avisar,
  Botao,
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { CHAVE_DO_DIRETORIO, useGruposDoAd, useMembrosDoAd, useUsuariosDoAd } from './consultas.ts';
import { BuscaNoAd, SituacaoNoAd } from './UsuariosDoAd.tsx';

const NUMERO = new Intl.NumberFormat('pt-BR');

/**
 * A aba Grupos (spec diretorio-ad, "Gerência dos grupos do AD"): a busca dos grupos, com o número de
 * membros e o grupo do Grafite de cada mapeado, e os membros do grupo escolhido, com "Tirar" e
 * "Incluir membro".
 */
export function GruposDoAd() {
  const [buscada, definirBuscada] = useState<string | null>(null);
  const grupos = useGruposDoAd(buscada ?? '', buscada !== null);
  const [aberto, definirAberto] = useState<string | null>(null);
  return (
    <section className={estilos.parte} aria-labelledby="grupos-do-ad">
      <h2 id="grupos-do-ad" className={estilos.tituloDaParte}>
        Grupos do AD
      </h2>
      <BuscaNoAd rotulo="Buscar o grupo pelo nome" aoBuscar={definirBuscada} />
      {grupos.isError && <p className={estilos.falha}>{grupos.error.message}</p>}
      {buscada === null ? (
        <p className={estilos.informacao}>
          Busque o grupo pelo nome para ver os membros; a busca traz até 50 grupos.
        </p>
      ) : (
        grupos.data && (
          <Tabela rotulo="Grupos do AD" aoAbrirLinha={(dn) => definirAberto(String(dn))}>
            <CabecalhoDaTabela>
              <Coluna id="nome" principal>
                Grupo
              </Coluna>
              <Coluna id="membros" especie="numero">
                Membros
              </Coluna>
              <Coluna id="mapeado">Dá acesso como</Coluna>
              <Coluna id="acoes" especie="acoes">
                Ações
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={grupos.data.grupos.map((grupo) => ({ ...grupo, id: grupo.dn }))}
              vazio={<EstadoVazio titulo="Nenhum grupo do AD achado." />}
            >
              {(grupo) => (
                <Linha id={grupo.id}>
                  <Celula>{grupo.nome}</Celula>
                  <Celula>{NUMERO.format(grupo.membros)}</Celula>
                  <Celula>{grupo.mapeadoPara?.nome ?? 'Não mapeado'}</Celula>
                  <Celula>
                    <Botao
                      nivel="terciario"
                      aria-label={`Ver os membros de ${grupo.nome}`}
                      onPress={() => definirAberto(grupo.dn)}
                    >
                      Membros
                    </Botao>
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        )
      )}
      {aberto && <MembrosDoGrupo grupoDn={aberto} />}
    </section>
  );
}

/** Os membros do grupo escolhido, com "Tirar", e a inclusão de um usuário achado pela busca. */
function MembrosDoGrupo({ grupoDn }: { grupoDn: string }) {
  const api = useApi();
  const consultas = useQueryClient();
  const membros = useMembrosDoAd(grupoDn);
  const [buscada, definirBuscada] = useState<string | null>(null);
  const achados = useUsuariosDoAd(buscada ?? '', buscada !== null);
  const [escolhido, definirEscolhido] = useState<string | null>(null);
  const [ocupado, definirOcupado] = useState<string | null>(null);

  async function mudar(operacao: 'incluir' | 'tirar', usuarioDn: string, nome: string) {
    definirOcupado(usuarioDn);
    const corpo = { body: { usuarioDn, grupoDn } };
    const resultado = await pedir(
      () =>
        operacao === 'incluir'
          ? api.POST('/diretorio/membros', corpo)
          : api.POST('/diretorio/membros/retirada', corpo),
      operacao === 'incluir' ? 'incluir o membro' : 'tirar o membro',
    );
    definirOcupado(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    const grupo = membros.data?.grupo.nome ?? 'o grupo';
    avisar({
      situacao: 'sucesso',
      titulo: operacao === 'incluir' ? `${nome} agora é de ${grupo}.` : `${nome} saiu de ${grupo}.`,
    });
    definirEscolhido(null);
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_DIRETORIO });
  }

  if (membros.isError) return <p className={estilos.falha}>{membros.error.message}</p>;
  if (!membros.data) {
    return (
      <p role="status" className={estilos.contagem}>
        Carregando os membros…
      </p>
    );
  }
  const { grupo } = membros.data;
  return (
    <section className={estilos.parte} aria-labelledby="membros-do-grupo">
      <h3 id="membros-do-grupo" className={estilos.tituloDaParte}>
        {`Membros de ${grupo.nome}`}
      </h3>
      {grupo.mapeadoPara && (
        <p className={estilos.informacao}>
          {`Quem está neste grupo entra no Grafite como ${grupo.mapeadoPara.nome}.`}
        </p>
      )}
      <Tabela rotulo={`Membros de ${grupo.nome}`}>
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Nome
          </Coluna>
          <Coluna id="usuario">Usuário</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <Coluna id="acoes" especie="acoes">
            Ações
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={membros.data.membros.map((membro) => ({ ...membro, id: membro.dn }))}
          vazio={<EstadoVazio titulo="Nenhum membro neste grupo." />}
        >
          {(membro) => (
            <Linha id={membro.id}>
              <Celula>{membro.nome}</Celula>
              <Celula>{membro.usuario}</Celula>
              <Celula>
                <SituacaoNoAd ativa={membro.ativa} />
              </Celula>
              <Celula>
                <Botao
                  nivel="terciario"
                  aria-label={`Tirar ${membro.nome} de ${grupo.nome}`}
                  carregando={ocupado === membro.dn}
                  rotuloCarregando="Tirando"
                  onPress={() => void mudar('tirar', membro.dn, membro.nome)}
                >
                  Tirar
                </Botao>
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
      <BuscaNoAd rotulo="Buscar a pessoa para incluir" aoBuscar={definirBuscada} />
      {achados.isError && <p className={estilos.falha}>{achados.error.message}</p>}
      {achados.data && (
        <div className={estilos.acoes}>
          <Selecao
            rotulo="Pessoa para incluir"
            opcoes={achados.data.usuarios
              .filter((usuario) => !membros.data.membros.some((membro) => membro.dn === usuario.dn))
              .map((usuario) => ({
                id: usuario.dn,
                rotulo: `${usuario.nome} (${usuario.usuario})`,
              }))}
            placeholder={achados.data.usuarios.length === 0 ? 'Nenhuma pessoa achada' : 'Selecione'}
            selectedKey={escolhido}
            onSelectionChange={(chave) => definirEscolhido(String(chave))}
          />
          <Botao
            nivel="primario"
            isDisabled={!escolhido}
            carregando={ocupado === escolhido}
            rotuloCarregando="Incluindo"
            onPress={() => {
              const usuario = achados.data.usuarios.find((achado) => achado.dn === escolhido);
              if (usuario) void mudar('incluir', usuario.dn, usuario.nome);
            }}
          >
            Incluir membro
          </Botao>
        </div>
      )}
    </section>
  );
}
