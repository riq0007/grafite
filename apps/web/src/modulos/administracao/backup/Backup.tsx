import type { components } from '@grafite/api-client';
import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeTexto,
  EstadoVazio,
  Formulario,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
  Selecao,
  type Situacao,
  useDataHora,
} from '@grafite/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';

type EstadoDoBackup = components['schemas']['EstadoDoBackup'];
type BackupDaLista = EstadoDoBackup['backups'][number];
type SituacaoDaOperacao = BackupDaLista['situacao'];

/** A chave do estado do backup nas consultas, que o evento `operacao.mudou` invalida. */
export const CHAVE_DO_BACKUP = ['backup'] as const;

const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const RESULTADOS: Record<SituacaoDaOperacao, { texto: string; situacao: Situacao }> = {
  feito: { texto: 'Feito', situacao: 'sucesso' },
  falhou: { texto: 'Falhou', situacao: 'critico' },
  'em-andamento': { texto: 'Em andamento', situacao: 'info' },
};

const UNIDADES = ['bytes', 'KB', 'MB', 'GB', 'TB'];

/** O tamanho em pt-BR, como "50 MB" ou "1,5 GB". */
function formatarTamanho(bytes: number): string {
  let valor = bytes;
  let unidade = 0;
  while (valor >= 1024 && unidade < UNIDADES.length - 1) {
    valor /= 1024;
    unidade += 1;
  }
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(valor);
  return `${numero} ${UNIDADES[unidade]}`;
}

/**
 * A tela de backup (spec modulo-administracao): os backups guardados, do mais novo ao mais antigo,
 * com quando, o tamanho, os destinos e o resultado; o próximo backup e "Fazer backup agora"; o
 * horário e o dia do teste, dentro dos limites do servidor; e o último teste de restauração. Ela
 * se atualiza sozinha quando um backup ou um teste termina. A restauração é só pelo comando.
 */
export function Backup() {
  const api = useApi();
  const consultas = useQueryClient();
  const { formatarDataEHora } = useDataHora();
  const idDoProximo = useId();
  const idDoTeste = useId();
  const [pedindo, definirPedindo] = useState(false);
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);
  const estado = useQuery({
    queryKey: CHAVE_DO_BACKUP,
    queryFn: () => consultar(() => api.GET('/operacao/backups'), 'carregar os backups'),
  });

  async function fazerAgora() {
    definirPedindo(true);
    definirFalha(null);
    const resultado = await pedir(
      () => api.POST('/operacao/backups/pedidos'),
      'pôr o backup na fila',
    );
    definirPedindo(false);
    if ('erro' in resultado) {
      definirFalha((anterior) => ({ texto: resultado.erro, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    avisar({ situacao: 'sucesso', titulo: 'Backup na fila.' });
  }

  if (estado.isPending) {
    return (
      <div className={estilos.tela}>
        <CabecalhoDaPagina titulo="Backup" />
        <p role="status" className={estilos.contagem}>
          Carregando os backups…
        </p>
      </div>
    );
  }
  if (estado.isError) {
    return (
      <div className={estilos.tela}>
        <CabecalhoDaPagina titulo="Backup" />
        <EstadoVazio
          titulo={estado.error.message}
          acao={<Botao onPress={() => void estado.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  const { configurado, agenda, proximoBackup, backups, ultimoTeste } = estado.data;
  if (!configurado) {
    return (
      <div className={estilos.tela}>
        <CabecalhoDaPagina titulo="Backup" />
        <EstadoVazio
          titulo="O backup não está configurado neste servidor."
          descricao="Quem opera o servidor configura os destinos pelo comando de operação."
        />
      </div>
    );
  }

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Backup" />
      <section aria-labelledby={idDoProximo} className={estilos.parteDoBackup}>
        <h2 id={idDoProximo} className={estilos.tituloDaParte}>
          Próximo backup
        </h2>
        <p className={estilos.textoDaParte}>
          {proximoBackup ? formatarDataEHora(new Date(proximoBackup)) : 'Nenhum agendado.'}
        </p>
        <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
        <div className={estilos.acoes}>
          <Botao
            carregando={pedindo}
            rotuloCarregando="Pondo na fila"
            onPress={() => void fazerAgora()}
          >
            Fazer backup agora
          </Botao>
        </div>
      </section>

      <FormularioDaAgenda
        key={`${agenda.horario}-${agenda.diaDoTeste}`}
        agenda={agenda}
        aoSalvar={(novo) => consultas.setQueryData(CHAVE_DO_BACKUP, novo)}
      />

      <section aria-labelledby={idDoTeste} className={estilos.parteDoBackup}>
        <h2 id={idDoTeste} className={estilos.tituloDaParte}>
          Último teste de restauração
        </h2>
        {ultimoTeste ? (
          <ListaDeDados
            itens={[
              { rotulo: 'Quando', valor: formatarDataEHora(new Date(ultimoTeste.iniciadoEm)) },
              {
                rotulo: 'Backup testado',
                valor: ultimoTeste.backup
                  ? `Backup de ${formatarDataEHora(new Date(ultimoTeste.backup.iniciadoEm))}`
                  : 'Nenhum backup pronto',
              },
              {
                rotulo: 'Resultado',
                valor: (
                  <RotuloDeSituacao situacao={RESULTADOS[ultimoTeste.situacao].situacao}>
                    {RESULTADOS[ultimoTeste.situacao].texto}
                  </RotuloDeSituacao>
                ),
              },
              ...(ultimoTeste.erro ? [{ rotulo: 'Motivo', valor: ultimoTeste.erro }] : []),
            ]}
          />
        ) : (
          <p className={estilos.textoDaParte}>Nenhum teste de restauração ainda.</p>
        )}
      </section>

      {backups.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum backup guardado."
          descricao="Os backups aparecem aqui quando terminam."
        />
      ) : (
        <ul aria-label="Backups" className={estilos.tarefas}>
          {backups.map((backup) => (
            <ItemDoBackup key={backup.id} backup={backup} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemDoBackup({ backup }: { backup: BackupDaLista }) {
  const { formatarDataEHora } = useDataHora();
  const idDoNome = useId();
  const resultado = RESULTADOS[backup.situacao];
  return (
    <li aria-labelledby={idDoNome} className={estilos.tarefa}>
      <p id={idDoNome} className={estilos.nomeDaTarefa}>
        Backup de {formatarDataEHora(new Date(backup.iniciadoEm))}
      </p>
      <ListaDeDados
        itens={[
          {
            rotulo: 'Resultado',
            valor: (
              <RotuloDeSituacao situacao={resultado.situacao}>{resultado.texto}</RotuloDeSituacao>
            ),
          },
          ...(backup.tamanho !== null
            ? [{ rotulo: 'Tamanho', valor: formatarTamanho(backup.tamanho) }]
            : []),
          {
            rotulo: 'Destinos',
            valor: (
              <ul className={estilos.destinos}>
                {backup.destinos.map(({ destino, situacao, erro }) => (
                  <li key={destino}>
                    {situacao === 'gravado'
                      ? `${destino}: gravado`
                      : `${destino}: falhou, ${erro ?? ''}`}
                  </li>
                ))}
              </ul>
            ),
          },
          ...(backup.erro ? [{ rotulo: 'Motivo', valor: backup.erro }] : []),
        ]}
      />
    </li>
  );
}

type CampoDaAgenda = 'horario' | 'diaDoTeste';

/** O horário do backup e o dia do teste, dentro da janela da configuração do servidor. */
function FormularioDaAgenda({
  agenda,
  aoSalvar,
}: {
  agenda: EstadoDoBackup['agenda'];
  aoSalvar: (estado: EstadoDoBackup) => void;
}) {
  const api = useApi();
  const [horario, definirHorario] = useState(agenda.horario);
  const [diaDoTeste, definirDiaDoTeste] = useState(agenda.diaDoTeste);
  const [erros, definirErros] = useState<Partial<Record<CampoDaAgenda, string>>>({});
  const [falha, definirFalha] = useState<{ texto: string; vez: number } | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const { inicio, fim } = agenda.janela;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (salvando) return;
    definirErros({});
    definirFalha(null);
    definirSalvando(true);
    const resultado = await pedir(
      () => api.PUT('/operacao/agenda', { body: { horario, diaDoTeste } }),
      'salvar o horário do backup',
    );
    definirSalvando(false);
    if ('erro' in resultado) {
      const recusa = recusaDe<CampoDaAgenda>(resultado);
      if (recusa.campos && Object.keys(recusa.campos).length > 0) definirErros(recusa.campos);
      else definirFalha((anterior) => ({ texto: recusa.erro, vez: (anterior?.vez ?? 0) + 1 }));
      return;
    }
    avisar({ situacao: 'sucesso', titulo: 'Horário do backup salvo.' });
    aoSalvar(resultado.dados);
  }

  return (
    <Formulario validationBehavior="aria" onSubmit={salvar}>
      <CampoDeTexto
        rotulo="Horário do backup"
        descricao={`Entre ${inicio} e ${fim}, no fuso do servidor.`}
        autoComplete="off"
        inputMode="numeric"
        value={horario}
        onChange={(valor) => {
          definirHorario(valor);
          definirErros(({ horario: _, ...outros }) => outros);
        }}
        erro={erros.horario}
      />
      {agenda.teste === 'semanal' ? (
        <Selecao
          rotulo="Dia do teste de restauração"
          descricao="O teste roda uma hora depois do backup desse dia."
          opcoes={DIAS_DA_SEMANA.map((dia, indice) => ({ id: String(indice), rotulo: dia }))}
          selectedKey={String(diaDoTeste)}
          onSelectionChange={(chave) => definirDiaDoTeste(Number(chave))}
          erro={erros.diaDoTeste}
        />
      ) : (
        <p className={estilos.textoDaParte}>
          O teste de restauração roda todo dia, uma hora depois do backup.
        </p>
      )}
      <MensagemDoPasso texto={falha?.texto ?? null} chave={falha?.vez ?? 0} />
      <div className={estilos.acoes}>
        <Botao type="submit" nivel="primario" carregando={salvando} rotuloCarregando="Salvando">
          Salvar horário
        </Botao>
      </div>
    </Formulario>
  );
}
