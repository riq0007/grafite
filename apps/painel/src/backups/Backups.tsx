// Os backups pelo painel (spec painel-da-operacao, "Tarefas do painel pelos mesmos comandos"): o
// backup agora, o teste de restauração do mais novo e a preparação do teste, pelos mesmos comandos,
// e a lista dos backups prontos de cada destino, como o backup listar a dá.
import { Botao, EstadoVazio, formatarTamanho } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import type { ApiDoPainel } from '../api/tipos.ts';
import { formatarMomento } from '../formatos.ts';
import { useTarefas } from '../tarefas/pedirTarefa.tsx';
import estilos from './Backups.module.css';

export function Backups({ api }: { api: ApiDoPainel }) {
  const { pedir, emAndamento } = useTarefas();
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.backups() });
  const ocupado = emAndamento !== null;
  return (
    <div className={estilos.tela}>
      <div className={estilos.acoes}>
        <div className={estilos.acao}>
          <Botao nivel="primario" isDisabled={ocupado} onPress={() => void pedir('backup-agora')}>
            Fazer o backup agora
          </Botao>
          <p className={estilos.nota}>Faz o backup da produção em todos os destinos e o confere.</p>
        </div>
        <div className={estilos.acao}>
          <Botao isDisabled={ocupado} onPress={() => void pedir('backup-testar')}>
            Testar a restauração
          </Botao>
          <p className={estilos.nota}>
            Restaura o backup mais novo na instância do teste e confere as tabelas e os arquivos.
          </p>
        </div>
        <div className={estilos.acao}>
          <Botao isDisabled={ocupado} onPress={() => void pedir('preparar-teste')}>
            Preparar o teste
          </Botao>
          <p className={estilos.nota}>
            Troca os dados do teste pela cópia da produção, do backup mais novo, com os endereços do
            teste.
          </p>
        </div>
      </div>
      {backups.isError && <p role="alert">{backups.error.message}</p>}
      {backups.data?.length === 0 && (
        <EstadoVazio
          titulo="Nenhum destino de backup"
          descricao="Configure os destinos na aba Configurações."
        />
      )}
      {backups.data?.map(({ destino, backups: doDestino }) => (
        <section key={destino} className={estilos.destino}>
          <h2 className={estilos.mono}>{destino}</h2>
          {doDestino.length === 0 ? (
            <p className={estilos.nota}>Nenhum backup pronto neste destino.</p>
          ) : (
            <table className={estilos.tabela} aria-label={`Backups em ${destino}`}>
              <thead>
                <tr>
                  <th scope="col">Backup</th>
                  <th scope="col">Feito em</th>
                  <th scope="col">Tamanho</th>
                  <th scope="col">Versão</th>
                </tr>
              </thead>
              <tbody>
                {[...doDestino].reverse().map((backup) => (
                  <tr key={backup.nome}>
                    <th scope="row" className={estilos.mono}>
                      {backup.nome}
                    </th>
                    {backup.problema === undefined ? (
                      <>
                        <td>{backup.criadoEm === null ? '' : formatarMomento(backup.criadoEm)}</td>
                        <td>
                          {backup.tamanho === undefined ? '' : formatarTamanho(backup.tamanho)}
                        </td>
                        <td>{backup.versao ?? ''}</td>
                      </>
                    ) : (
                      <td colSpan={3}>{backup.problema}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
