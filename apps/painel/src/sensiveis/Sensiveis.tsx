// As operações sensíveis pelo painel (spec painel-da-operacao, "Operações sensíveis no painel"): a
// restauração da produção por um backup da lista, a volta de um ambiente à versão anterior e a
// troca da chave do cofre. Cada uma explica antes o que vai fazer, como o runbook diz; o nome do
// banco digitado, o que não muda nada e o resultado, com o que fazer depois, são os do comando.
import { Botao, ControleSegmentado, GrupoDeRadios, Radio, Segmento } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiDoPainel, EstadoDoPainel } from '../api/tipos.ts';
import { AMBIENTE_COM_ARTIGO, formatarMomento } from '../formatos.ts';
import { useTarefas } from '../tarefas/pedirTarefa.tsx';
import estilos from './Sensiveis.module.css';

function Restauracao({ api }: { api: ApiDoPainel }) {
  const { pedir, emAndamento } = useTarefas();
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.backups() });
  // Os backups pelo nome, do mais novo ao mais antigo: o mesmo backup está em cada destino.
  const nomes = [
    ...new Map(
      (backups.data ?? [])
        .flatMap(({ backups: doDestino }) => doDestino)
        .filter(({ problema }) => problema === undefined)
        .map((backup) => [backup.nome, backup]),
    ).values(),
  ].sort((a, b) => b.nome.localeCompare(a.nome));
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const backup = escolhido ?? '';
  return (
    <section className={estilos.cartao} aria-label="Restaurar a produção">
      <h2>Restaurar a produção</h2>
      <p>
        Troca o banco e os arquivos da produção pelos do backup escolhido. O banco e os arquivos de
        antes ficam guardados, com o nome que o fim mostra, até você conferir os dados. O comando
        pede a senha do usuário postgres e o nome do banco da produção digitado.
      </p>
      {nomes.length === 0 && !backups.isPending ? (
        <p className={estilos.nota}>Nenhum backup pronto para restaurar.</p>
      ) : (
        <GrupoDeRadios rotulo="Backup" value={backup} onChange={setEscolhido}>
          {nomes.map(({ nome, criadoEm, versao }) => (
            <Radio key={nome} value={nome}>
              <span className={estilos.mono}>{nome}</span>
              <span className={estilos.detalhe}>
                {criadoEm === null ? '' : ` · de ${formatarMomento(criadoEm)}`}
                {versao === undefined ? '' : ` · versão ${versao}`}
              </span>
            </Radio>
          ))}
        </GrupoDeRadios>
      )}
      {backup !== '' && (
        <div>
          <Botao
            isDisabled={emAndamento !== null}
            onPress={() => void pedir('restaurar', { backup })}
          >
            {`Restaurar a produção a partir do backup ${backup}`}
          </Botao>
        </div>
      )}
    </section>
  );
}

function Volta({ estado }: { estado: EstadoDoPainel }) {
  const { pedir, emAndamento } = useTarefas();
  const [ambiente, setAmbiente] = useState<'producao' | 'teste'>('producao');
  const { atual, anterior } = estado.ambientes[ambiente];
  const nome = ambiente === 'producao' ? 'A produção' : 'O teste';
  return (
    <section className={estilos.cartao} aria-label="Voltar à versão anterior">
      <h2>Voltar à versão anterior</h2>
      <p>
        Volta o ambiente à versão que ele usava antes da última atualização, no mesmo banco e sem
        desfazer as migrations. Na produção, o comando pede o nome do banco da produção digitado.
      </p>
      <ControleSegmentado
        rotulo="Ambiente"
        value={ambiente}
        onChange={(valor) => setAmbiente(valor as 'producao' | 'teste')}
      >
        <Segmento value="producao">Produção</Segmento>
        <Segmento value="teste">Teste</Segmento>
      </ControleSegmentado>
      {anterior === null ? (
        <p className={estilos.nota}>
          {nome} não tem versão anterior: ela só existe depois de uma atualização.
        </p>
      ) : (
        <div>
          <Botao
            isDisabled={emAndamento !== null}
            onPress={() => void pedir('voltar', { ambiente })}
          >
            {`Voltar ${AMBIENTE_COM_ARTIGO[ambiente]} à ${anterior}`}
          </Botao>
          <p className={estilos.nota}>Hoje: {atual ?? 'sem versão'}.</p>
        </div>
      )}
    </section>
  );
}

function TrocaDaChave() {
  const { pedir, emAndamento } = useTarefas();
  return (
    <section className={estilos.cartao} aria-label="Trocar a chave do cofre">
      <h2>Trocar a chave do cofre</h2>
      <p>
        Gera a chave mestra nova do cofre, recifra a chave de cada segredo nos dois ambientes e tira
        a anterior. Antes, o comando pede o nome do banco da produção digitado. Depois, guarde a
        cópia dos config.env de antes da troca junto dos backups feitos até hoje: só ela abre os
        segredos deles.
      </p>
      <div>
        <Botao isDisabled={emAndamento !== null} onPress={() => void pedir('cofre-trocar-chave')}>
          Trocar a chave do cofre
        </Botao>
      </div>
    </section>
  );
}

export function Sensiveis({ api, estado }: { api: ApiDoPainel; estado: EstadoDoPainel }) {
  return (
    <div className={estilos.tela}>
      <Restauracao api={api} />
      <Volta estado={estado} />
      <TrocaDaChave />
    </div>
  );
}
