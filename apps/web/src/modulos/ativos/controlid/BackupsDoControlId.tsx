// Os backups do Control iD na web (spec backup-do-control-id; change p5a-backup-do-control-id,
// design, decisões 8 e 10): a seção Backups da ficha do controle, a tela "Backups do Control iD" do
// Ativos, com o "Backup de todos os controles" e o "Baixar os filtrados", e o visualizador do
// conteúdo, numa gaveta com as abas Pessoas, Grupos, Regras de acesso e Horários. A situação vai
// sempre por extenso, e as telas se releem pelo evento `controlid.mudaram`.
import {
  Abas,
  avisar,
  Botao,
  CabecalhoDaPagina,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Coluna,
  ControleSegmentado,
  CorpoDaTabela,
  Dialogo,
  EstadoVazio,
  Gaveta,
  Linha,
  RotuloDeSituacao,
  Segmento,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, HardDriveDownload, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from './Backups.module.css';
import {
  type AbaDoConteudo,
  type BackupDoControlId,
  CHAVE_DOS_BACKUPS,
  enderecoDaFoto,
  enderecoDoZip,
  type SituacaoDoBackup,
  tamanhoLegivel,
  useBackups,
  useBackupsDoControle,
  useConteudoDoBackup,
  useResumoDosBackups,
} from './consultas.ts';
import { AcoesDeOperacao, OperacoesDoControle } from './OperacoesDoBackup.tsx';
import { ResumoDoControle, UltimosDias } from './ResumoDosBackups.tsx';
import { SITUACOES_NA_TELA } from './situacoes.ts';

/** O resumo do controle na ficha; sem ele, a seção continua só com a lista. */
function ResumoNaFicha({ ativoId }: { ativoId: string }) {
  const resumo = useResumoDosBackups(ativoId).data?.controles[0];
  return resumo ? <ResumoDoControle resumo={resumo} /> : null;
}

/** Os últimos dias de cada controle, acima da lista da tela dos backups. */
function UltimosDiasNaTela() {
  const controles = useResumoDosBackups().data?.controles ?? [];
  return controles.length > 0 ? <UltimosDias controles={controles} /> : null;
}

const ORIGENS = { manual: 'Manual', agendado: 'Agendado' } as const;

/** Os números do backup numa linha: os registros, as fotos e o tamanho. */
export function numerosDoBackup(backup: BackupDoControlId): string {
  if (backup.situacao === 'na-fila' || backup.situacao === 'em-andamento') {
    return backup.situacao === 'na-fila'
      ? 'Esperando o coletor buscar o pedido.'
      : `Com o ${backup.coletor ?? 'coletor'}.`;
  }
  if (backup.situacao === 'falha') return backup.erro ?? 'O backup falhou.';
  const partes = [
    `${backup.registros ?? 0} registros`,
    `${backup.fotos ?? 0} ${backup.fotos === 1 ? 'foto' : 'fotos'}`,
    tamanhoLegivel(backup.tamanho),
  ];
  return backup.erro ? `${partes.join(' · ')} · ${backup.erro}` : partes.join(' · ');
}

/** Baixa o ZIP pelo navegador, por uma âncora, sem sair da tela. */
function baixar(backupId: string) {
  const ancora = document.createElement('a');
  ancora.href = enderecoDoZip(backupId);
  ancora.download = '';
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
}

/** Apagar um backup, com a confirmação. */
function ApagarBackup({ backup }: { backup: BackupDoControlId }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [apagando, definirApagando] = useState(false);
  const { formatarDataEHora } = useDataHora();
  return (
    <Dialogo
      gatilho={<Botao nivel="terciario">Apagar</Botao>}
      titulo="Apagar este backup?"
      alerta
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            nivel="destrutivo"
            carregando={apagando}
            rotuloCarregando="Apagando"
            onPress={async () => {
              definirApagando(true);
              const resultado = await pedir(
                () =>
                  api.DELETE('/controlid/backups/{id}', { params: { path: { id: backup.id } } }),
                'apagar o backup',
              );
              definirApagando(false);
              if ('erro' in resultado) {
                avisar({ situacao: 'critico', titulo: resultado.erro });
                return;
              }
              fechar();
              avisar({ situacao: 'sucesso', titulo: 'Backup apagado.' });
              await consultas.invalidateQueries({ queryKey: CHAVE_DOS_BACKUPS });
            }}
          >
            Apagar backup
          </Botao>
        </>
      )}
    >
      <p>
        {`O backup de ${formatarDataEHora(new Date(backup.pedidoEm))} sai com o arquivo. Os outros backups do controle continuam.`}
      </p>
    </Dialogo>
  );
}

/** As ações de um backup: ver o conteúdo, baixar e apagar, conforme a situação e a permissão. */
function AcoesDoBackup({ backup }: { backup: BackupDoControlId }) {
  const [vendo, definirVendo] = useState(false);
  return (
    <div className={estilos.acoes}>
      {backup.temArquivo && (
        <>
          <Botao onPress={() => definirVendo(true)}>Ver conteúdo</Botao>
          <Botao nivel="terciario" icone={Download} onPress={() => baixar(backup.id)}>
            Baixar
          </Botao>
        </>
      )}
      <AcoesDeOperacao backup={backup} />
      {backup.podeApagar && <ApagarBackup backup={backup} />}
      {vendo && <ConteudoDoBackup backup={backup} aoFechar={() => definirVendo(false)} />}
    </div>
  );
}

/** O "Fazer backup agora" de um controle. */
function FazerBackupAgora({ ativoId }: { ativoId: string }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [pedindo, definirPedindo] = useState(false);
  return (
    <Botao
      nivel="primario"
      icone={HardDriveDownload}
      carregando={pedindo}
      rotuloCarregando="Pondo na fila"
      onPress={async () => {
        definirPedindo(true);
        const resultado = await pedir(
          () =>
            api.POST('/ativos/{id}/backups-do-control-id', { params: { path: { id: ativoId } } }),
          'pedir o backup',
        );
        definirPedindo(false);
        if ('erro' in resultado) {
          avisar({ situacao: 'critico', titulo: resultado.erro });
          return;
        }
        avisar({
          situacao: resultado.dados.situacao === 'falha' ? 'critico' : 'sucesso',
          titulo:
            resultado.dados.situacao === 'falha'
              ? (resultado.dados.erro ?? 'O backup falhou.')
              : 'Backup na fila. O coletor busca o pedido em até 15 segundos.',
        });
        await consultas.invalidateQueries({ queryKey: CHAVE_DOS_BACKUPS });
      }}
    >
      Fazer backup agora
    </Botao>
  );
}

/**
 * A seção Backups na ficha do controle (spec backup-do-control-id, "Histórico dos backups"): do mais
 * novo para o mais antigo, com a situação por extenso, os números e as ações.
 */
export function BackupsNaFicha({ ativoId }: { ativoId: string }) {
  const backups = useBackupsDoControle(ativoId);
  const { formatarDataEHora } = useDataHora();
  if (backups.isPending) {
    return (
      <p role="status" className={estilos.nota}>
        Carregando os backups…
      </p>
    );
  }
  if (backups.isError) {
    return (
      <EstadoVazio
        titulo={backups.error.message}
        acao={<Botao onPress={() => void backups.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  const { itens, podeFazer, horario } = backups.data;
  return (
    <section className={estilos.secao} aria-label="Backups do controle">
      <div className={estilos.cabecalho}>
        <p className={estilos.nota}>{`Backup automático todo dia às ${horario}.`}</p>
        {podeFazer && <FazerBackupAgora ativoId={ativoId} />}
      </div>
      <ResumoNaFicha ativoId={ativoId} />
      {itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum backup deste controle ainda."
          descricao={`O primeiro sai às ${horario}, ou agora, pelo Fazer backup agora.`}
        />
      ) : (
        <ul className={estilos.lista} aria-label="Backups">
          {itens.map((backup) => (
            <li key={backup.id} className={estilos.item}>
              <div className={estilos.quando}>
                <p className={estilos.momento}>{formatarDataEHora(new Date(backup.pedidoEm))}</p>
                <div className={estilos.acoes}>
                  <RotuloDeSituacao situacao={SITUACOES_NA_TELA[backup.situacao].tom}>
                    {SITUACOES_NA_TELA[backup.situacao].texto}
                  </RotuloDeSituacao>
                  <span className={estilos.detalhe}>
                    {backup.pedidoPor
                      ? `${ORIGENS[backup.origem]}, por ${backup.pedidoPor}`
                      : ORIGENS[backup.origem]}
                  </span>
                </div>
              </div>
              <p className={estilos.detalhe}>{numerosDoBackup(backup)}</p>
              <AcoesDoBackup backup={backup} />
            </li>
          ))}
        </ul>
      )}
      <OperacoesDoControle ativoId={ativoId} />
    </section>
  );
}

const FILTROS: Record<'todos' | SituacaoDoBackup, string> = {
  todos: 'Todos',
  sucesso: 'Sucesso',
  parcial: 'Parcial',
  falha: 'Falha',
  'na-fila': 'Na fila',
  'em-andamento': 'Em andamento',
};

/**
 * A tela "Backups do Control iD" do Ativos: os backups dos controles que a conta vê, com o filtro
 * pela situação, o "Backup de todos os controles" e o "Baixar os filtrados".
 */
export function TelaDosBackups() {
  const api = useApi();
  const consultas = useQueryClient();
  const [filtro, definirFiltro] = useState<'todos' | SituacaoDoBackup>('todos');
  const backups = useBackups(filtro === 'todos' ? null : filtro);
  const { formatarDataEHora } = useDataHora();
  const [pedindo, definirPedindo] = useState(false);
  const comArquivo = backups.itens.filter((backup) => backup.temArquivo);

  async function backupDeTodos() {
    definirPedindo(true);
    const resultado = await pedir(
      () => api.POST('/controlid/backups/todos'),
      'pedir o backup de todos os controles',
    );
    definirPedindo(false);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    const { pedidos, jaNaFila, falhas } = resultado.dados;
    avisar({
      situacao: falhas > 0 ? 'atencao' : 'sucesso',
      titulo: `${pedidos} ${pedidos === 1 ? 'backup na fila' : 'backups na fila'}${jaNaFila > 0 ? `, ${jaNaFila} já estavam` : ''}${falhas > 0 ? `, ${falhas} com falha` : ''}.`,
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_BACKUPS });
  }

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo="Backups do Control iD"
        acoes={
          <>
            {comArquivo.length > 0 && (
              <Dialogo
                gatilho={
                  <Botao icone={Download}>{`Baixar os filtrados (${comArquivo.length})`}</Botao>
                }
                titulo={`Baixar ${comArquivo.length} ${comArquivo.length === 1 ? 'backup' : 'backups'}?`}
                acoes={(fechar) => (
                  <>
                    <Botao onPress={fechar}>Cancelar</Botao>
                    <Botao
                      nivel="primario"
                      onPress={() => {
                        fechar();
                        for (const backup of comArquivo) baixar(backup.id);
                        avisar({
                          situacao: 'sucesso',
                          titulo: `${comArquivo.length} downloads pedidos ao navegador.`,
                        });
                      }}
                    >
                      Baixar
                    </Botao>
                  </>
                )}
              >
                <p>
                  Cada backup vem num ZIP. O navegador pode pedir para permitir vários downloads.
                </p>
              </Dialogo>
            )}
            {backups.podeFazer && (
              <Botao
                nivel="primario"
                icone={RefreshCw}
                carregando={pedindo}
                rotuloCarregando="Pondo na fila"
                onPress={() => void backupDeTodos()}
              >
                Backup de todos os controles
              </Botao>
            )}
          </>
        }
      />
      <UltimosDiasNaTela />
      <ControleSegmentado
        rotulo="Situação"
        value={filtro}
        onChange={(escolhido) => definirFiltro(escolhido as typeof filtro)}
      >
        {(Object.keys(FILTROS) as (keyof typeof FILTROS)[]).map((chave) => (
          <Segmento key={chave} value={chave}>
            {FILTROS[chave]}
          </Segmento>
        ))}
      </ControleSegmentado>
      {backups.isError && !backups.data ? (
        <EstadoVazio
          titulo={backups.error.message}
          acao={<Botao onPress={() => void backups.refetch()}>Tentar de novo</Botao>}
        />
      ) : (
        <Tabela
          rotulo="Backups do Control iD"
          carregando={backups.isPending}
          carregarMais={{
            haMais: backups.hasNextPage,
            carregando: backups.isFetchingNextPage,
            aoCarregar: () => void backups.fetchNextPage(),
          }}
        >
          <CabecalhoDaTabela>
            <Coluna id="controle" principal>
              Controle
            </Coluna>
            <Coluna id="quando" especie="data">
              Pedido em
            </Coluna>
            <Coluna id="origem">Origem</Coluna>
            <Coluna id="situacao" especie="situacao">
              Situação
            </Coluna>
            <Coluna id="resultado">Resultado</Coluna>
            <Coluna id="acoes" especie="acoes">
              Ações
            </Coluna>
          </CabecalhoDaTabela>
          <CorpoDaTabela
            itens={backups.itens}
            vazio={
              <EstadoVazio
                titulo={
                  filtro === 'todos'
                    ? 'Nenhum backup do Control iD ainda.'
                    : 'Nenhum backup nesta situação.'
                }
                descricao="Ligue o backup do Control iD no tipo dos controles, no Catálogo. Os backups saem todo dia no horário do tipo, ou na hora, pelo Backup de todos os controles."
              />
            }
          >
            {(backup) => (
              <Linha id={backup.id}>
                <Celula>
                  {[backup.controle.patrimonio, backup.controle.rotulo].filter(Boolean).join(' · ')}
                </Celula>
                <Celula>{formatarDataEHora(new Date(backup.pedidoEm))}</Celula>
                <Celula>{ORIGENS[backup.origem]}</Celula>
                <Celula>
                  <RotuloDeSituacao situacao={SITUACOES_NA_TELA[backup.situacao].tom}>
                    {SITUACOES_NA_TELA[backup.situacao].texto}
                  </RotuloDeSituacao>
                </Celula>
                <Celula>{numerosDoBackup(backup)}</Celula>
                <Celula>
                  <AcoesDoBackup backup={backup} />
                </Celula>
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      )}
    </div>
  );
}

const ABAS: { id: AbaDoConteudo; rotulo: string }[] = [
  { id: 'pessoas', rotulo: 'Pessoas' },
  { id: 'grupos', rotulo: 'Grupos' },
  { id: 'regras', rotulo: 'Regras de acesso' },
  { id: 'horarios', rotulo: 'Horários' },
];

/** A lista de uma aba do conteúdo, com a busca e o "Carregar mais". */
function ListaDoConteudo({ backupId, aba }: { backupId: string; aba: AbaDoConteudo }) {
  const [busca, definirBusca] = useState('');
  const conteudo = useConteudoDoBackup(backupId, aba, busca.trim());
  const linhas = conteudo.data?.pages.flatMap((pagina) => pagina.linhas) ?? [];
  const total = conteudo.data?.pages[0]?.total ?? 0;
  return (
    <div className={estilos.conteudo}>
      <CampoDeTexto
        rotulo="Procurar"
        type="search"
        value={busca}
        onChange={definirBusca}
        autoComplete="off"
      />
      {conteudo.isPending ? (
        <p role="status" className={estilos.nota}>
          Lendo o backup…
        </p>
      ) : conteudo.isError ? (
        <EstadoVazio titulo={conteudo.error.message} />
      ) : linhas.length === 0 ? (
        <EstadoVazio
          titulo={busca ? 'Nada encontrado com esse texto.' : 'Esta parte do backup está vazia.'}
        />
      ) : (
        <>
          <p role="status" className={estilos.nota}>
            {total === 1 ? '1 encontrado' : `${total} encontrados`}
          </p>
          <ul className={estilos.linhas} aria-label={ABAS.find((uma) => uma.id === aba)?.rotulo}>
            {linhas.map((linha) => (
              <li
                key={linha.id}
                className={`${estilos.linha} ${linha.foto ? '' : estilos.semFoto}`}
              >
                {linha.foto && (
                  <img
                    className={estilos.foto}
                    src={enderecoDaFoto(backupId, linha.id)}
                    alt={`Foto de ${linha.titulo}`}
                    loading="lazy"
                  />
                )}
                <div>
                  <p className={estilos.titulo}>{linha.titulo}</p>
                  {linha.detalhes.length > 0 && (
                    <dl className={estilos.dados}>
                      {linha.detalhes.map((detalhe) => (
                        // O rótulo com o valor: os intervalos de um horário repetem o rótulo.
                        <div key={`${detalhe.rotulo}:${detalhe.valor}`}>
                          <dt>{detalhe.rotulo}</dt>
                          <dd>{detalhe.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {conteudo.hasNextPage && (
            <div>
              <Botao
                carregando={conteudo.isFetchingNextPage}
                rotuloCarregando="Carregando"
                onPress={() => void conteudo.fetchNextPage()}
              >
                Carregar mais
              </Botao>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** O conteúdo do backup numa gaveta, lido do ZIP guardado, sem falar com o controle. */
export function ConteudoDoBackup({
  backup,
  aoFechar,
}: {
  backup: BackupDoControlId;
  aoFechar: () => void;
}) {
  const { formatarDataEHora } = useDataHora();
  const [aba, definirAba] = useState<AbaDoConteudo>('pessoas');
  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo={`Backup de ${formatarDataEHora(new Date(backup.pedidoEm))}`}
    >
      <Abas
        rotulo="Conteúdo do backup"
        selecionada={aba}
        aoMudar={(escolhida) => definirAba(escolhida as AbaDoConteudo)}
        abas={ABAS.map((uma) => ({
          id: uma.id,
          rotulo: uma.rotulo,
          conteudo: <ListaDoConteudo backupId={backup.id} aba={uma.id} />,
        }))}
      />
    </Gaveta>
  );
}
