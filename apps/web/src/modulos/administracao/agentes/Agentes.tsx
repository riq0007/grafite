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
  Dialogo,
  EstadoVazio,
  idadeRelativa,
  Linha,
  RotuloDeSituacao,
  Selecao,
  Tabela,
  TextoParaCopiar,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAgora } from '../../../casca/status/useAgora.ts';
import estilos from '../Administracao.module.css';
import { Confirmacao } from '../Confirmacao.tsx';
import { CadastroDosComputadores } from './CadastroDosComputadores.tsx';
import {
  type AgenteDoGlpi,
  CHAVE_DOS_AGENTES,
  useAgentes,
  useAtivosParaLigar,
} from './consultas.ts';

/** A idade do inventário: "Agora", ou "Há 3 h". */
function idadeNaTela(momento: string, agora: Date): string {
  const idade = idadeRelativa(new Date(momento), agora);
  return idade === 'agora' ? 'Agora' : `Há ${idade}`;
}

/**
 * A seção Agentes da Administração (spec inventario-pelo-agente, "Endereço dos agentes" e "Agentes
 * da organização"): o endereço para o `server` do agente do GLPI, que aparece uma vez só, e os
 * agentes com a situação em texto, o ativo ligado e a ligação à mão.
 */
export function Agentes() {
  const api = useApi();
  const consultas = useQueryClient();
  const agentes = useAgentes();
  const agora = useAgora();
  const dataHora = useDataHora();
  const [gerado, definirGerado] = useState<string | null>(null);
  const [gerando, definirGerando] = useState(false);
  const [ligando, definirLigando] = useState<AgenteDoGlpi | null>(null);

  async function gerar(): Promise<{ ok: true } | { erro: string }> {
    definirGerando(true);
    const resultado = await pedir(() => api.POST('/agentes/endereco'), 'gerar o endereço');
    definirGerando(false);
    if ('erro' in resultado) return { erro: resultado.erro };
    definirGerado(resultado.dados.endereco);
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_AGENTES });
    return { ok: true };
  }

  async function desligar(agente: AgenteDoGlpi) {
    const resultado = await pedir(
      () =>
        api.PUT('/agentes/{id}/ativo', {
          params: { path: { id: agente.id } },
          body: { ativoId: null },
        }),
      'desligar o agente',
    );
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: `${agente.nome} desligado do ativo.` });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_AGENTES });
  }

  const cabecalho = <CabecalhoDaPagina titulo="Agentes do GLPI" />;
  if (agentes.isPending) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <p role="status" className={estilos.contagem}>
          Carregando os agentes…
        </p>
      </div>
    );
  }
  if (agentes.isError) {
    return (
      <div className={estilos.tela}>
        {cabecalho}
        <EstadoVazio
          titulo={agentes.error.message}
          acao={<Botao onPress={() => void agentes.refetch()}>Tentar de novo</Botao>}
        />
      </div>
    );
  }
  const { endereco, agentes: lista } = agentes.data;
  return (
    <div className={estilos.tela}>
      {cabecalho}
      <section className={estilos.parte} aria-labelledby="endereco-dos-agentes">
        <h2 id="endereco-dos-agentes" className={estilos.tituloDaParte}>
          Endereço dos agentes
        </h2>
        <p className={estilos.informacao}>
          O agente do GLPI que já está nas máquinas manda o inventário também ao Grafite: acrescente
          o endereço ao <code>server</code> do agente, depois do endereço do GLPI, separado por
          vírgula.
        </p>
        {endereco ? (
          <>
            <p className={estilos.informacao}>
              {`Endereço gerado em ${dataHora.formatarDataEHora(new Date(endereco.geradoEm))} por ${endereco.geradoPor}.`}
            </p>
            <div className={estilos.acoes}>
              <Confirmacao
                acao="Gerar outro endereço"
                nivelDoGatilho="secundario"
                titulo="Gerar outro endereço?"
                confirmar="Gerar outro"
                confirmando="Gerando"
                fazer={gerar}
              >
                Os agentes com o endereço atual param de mandar o inventário até receberem o novo.
              </Confirmacao>
            </div>
          </>
        ) : (
          <div className={estilos.acoes}>
            <Botao
              nivel="primario"
              carregando={gerando}
              rotuloCarregando="Gerando"
              onPress={async () => {
                const resultado = await gerar();
                if ('erro' in resultado) avisar({ situacao: 'critico', titulo: resultado.erro });
              }}
            >
              Gerar o endereço
            </Botao>
          </div>
        )}
      </section>
      <CadastroDosComputadores />
      <ContagemDaLista quantos={lista.length} singular="agente" plural="agentes" />
      <Tabela rotulo="Agentes">
        <CabecalhoDaTabela>
          <Coluna id="maquina" principal>
            Máquina
          </Coluna>
          <Coluna id="ativo">Ativo</Coluna>
          <Coluna id="ip">IP</Coluna>
          <Coluna id="sistema">Sistema</Coluna>
          <Coluna id="situacao" especie="situacao">
            Situação
          </Coluna>
          <Coluna id="inventario" especie="data">
            Último inventário
          </Coluna>
          <Coluna id="contato" especie="data">
            Último contato
          </Coluna>
          <Coluna id="acoes" especie="acoes">
            Ações
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={lista}
          dependencias={[agora]}
          vazio={
            <EstadoVazio
              titulo="Nenhum agente falou com o Grafite ainda."
              descricao="Os agentes aparecem aqui no primeiro contato, depois que o endereço entra no server deles."
            />
          }
        >
          {(agente) => (
            <Linha id={agente.id}>
              <Celula>{agente.nome}</Celula>
              <Celula>
                {agente.ativo ? (
                  <Link to="/ativos/$id" params={{ id: agente.ativo.id }} className={estilos.link}>
                    {agente.ativo.patrimonio
                      ? `${agente.ativo.rotulo} (${agente.ativo.patrimonio})`
                      : agente.ativo.rotulo}
                  </Link>
                ) : (
                  <span className={estilos.linhasDaCelula}>
                    <span>Sem ativo</span>
                    {agente.pendenciaCadastro && (
                      <span className={estilos.pendenciaDoAgente}>
                        {PENDENCIAS[agente.pendenciaCadastro.motivo]}
                        {agente.pendenciaCadastro.campos.length > 0 &&
                          ` (${agente.pendenciaCadastro.campos.join(', ')})`}
                      </span>
                    )}
                  </span>
                )}
              </Celula>
              <Celula>{agente.ip ?? '—'}</Celula>
              <Celula>{agente.sistema ?? '—'}</Celula>
              <Celula>
                <RotuloDeSituacao situacao={agente.situacao.tipo}>
                  {agente.situacao.texto}
                </RotuloDeSituacao>
              </Celula>
              <Celula>
                {agente.ultimoInventario ? idadeNaTela(agente.ultimoInventario, agora) : '—'}
              </Celula>
              <Celula>
                <span title={dataHora.formatarDataEHora(new Date(agente.ultimoContato))}>
                  {idadeNaTela(agente.ultimoContato, agora)}
                </span>
              </Celula>
              <Celula>
                {agente.ativo ? (
                  <Botao
                    nivel="terciario"
                    aria-label={`Desligar ${agente.nome} do ativo`}
                    onPress={() => void desligar(agente)}
                  >
                    Desligar
                  </Botao>
                ) : (
                  <Botao
                    nivel="terciario"
                    aria-label={`Ligar ${agente.nome} a um ativo`}
                    onPress={() => definirLigando(agente)}
                  >
                    Ligar
                  </Botao>
                )}
              </Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
      {gerado && <EnderecoGerado endereco={gerado} aoFechar={() => definirGerado(null)} />}
      {ligando && <LigarAUmAtivo agente={ligando} aoFechar={() => definirLigando(null)} />}
    </div>
  );
}

/** O endereço novo, uma vez só, com o que pôr no `server` do agente. */
function EnderecoGerado({ endereco, aoFechar }: { endereco: string; aoFechar: () => void }) {
  return (
    <Dialogo
      titulo="Endereço dos agentes"
      aberto
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={
        <Botao nivel="primario" onPress={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <p>Este endereço aparece só agora. Copie e guarde onde a TI configura os agentes.</p>
      <TextoParaCopiar rotulo="Endereço dos agentes" valor={endereco} />
      <p>
        No Windows, no registro <code>HKLM\SOFTWARE\GLPI-Agent</code>, o valor <code>server</code>{' '}
        fica com o GLPI e o Grafite, separados por vírgula. Na instalação pelo MSI, o mesmo vai em{' '}
        <code>SERVER=</code>.
      </p>
      <p>
        Reinicie o serviço GLPI Agent depois de salvar. Para enviar agora, execute o agente com
        <code> --force --tasks=inventory</code> como administrador. A máquina aparece após o
        contato; o inventário pode levar alguns minutos.
      </p>
      <p>
        Se o log mostrar <code>certificate verify failed</code>, a conexão HTTPS falhou antes de
        chegar ao Grafite. Peça à TI o certificado da autoridade confiável, incluindo a inspeção
        HTTPS do antivírus, se houver, e configure <code>ca-cert-file</code> com o caminho do
        arquivo PEM. Mantenha a validação do certificado ligada e reinicie o serviço.
      </p>
      <p>
        Consulte <code>C:\Program Files\GLPI-Agent\logs\glpi-agent.log</code>. Se o agente aparecer
        como “Sem ativo”, confira o cadastro automático ou use “Ligar” na lista.
      </p>
    </Dialogo>
  );
}

/** O motivo, em texto, de o último inventário de um agente sem ativo não ter cadastrado a máquina. */
const PENDENCIAS: Record<NonNullable<AgenteDoGlpi['pendenciaCadastro']>['motivo'], string> = {
  parcial: 'Aguardando inventário completo',
  hostname: 'O inventário não informou o hostname',
  identidade: 'Identidade ligada a ativo inativo ou a mais de um cadastro',
  tipo: 'Tipo de entrada indisponível',
  local: 'Local de entrada indisponível',
  campos: 'Revise os campos exigidos pelo tipo de entrada',
};

/** A ligação à mão: o ativo achado pela busca recebe o inventário do agente. */
function LigarAUmAtivo({ agente, aoFechar }: { agente: AgenteDoGlpi; aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [termo, definirTermo] = useState(agente.nome);
  const [busca, definirBusca] = useState<string | null>(null);
  const ativos = useAtivosParaLigar(busca);
  const [ativoId, definirAtivoId] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  return (
    <Dialogo
      titulo={`Ligar ${agente.nome} a um ativo`}
      aberto
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={
        <>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            isDisabled={!ativoId}
            carregando={enviando}
            rotuloCarregando="Ligando"
            onPress={async () => {
              if (!ativoId) return;
              definirEnviando(true);
              const resultado = await pedir(
                () =>
                  api.PUT('/agentes/{id}/ativo', {
                    params: { path: { id: agente.id } },
                    body: { ativoId },
                  }),
                'ligar o agente',
              );
              definirEnviando(false);
              if ('erro' in resultado) {
                definirFalha(resultado.erro);
                return;
              }
              avisar({
                situacao: 'sucesso',
                titulo: `${agente.nome} ligado. O inventário entra no ativo no próximo envio do agente.`,
              });
              await consultas.invalidateQueries({ queryKey: CHAVE_DOS_AGENTES });
              aoFechar();
            }}
          >
            Ligar
          </Botao>
        </>
      }
    >
      <form
        className={estilos.acoes}
        noValidate
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault();
          definirBusca(termo.trim());
        }}
      >
        <CampoDeTexto
          rotulo="Buscar o ativo"
          descricao="Pelo nome, pelo patrimônio, pela série ou pelo hostname."
          autoComplete="off"
          value={termo}
          onChange={definirTermo}
        />
        <Botao type="submit">Buscar ativos</Botao>
      </form>
      {ativos.isError && <p className={estilos.falha}>{ativos.error.message}</p>}
      {ativos.data && (
        <Selecao
          rotulo="Ativo"
          opcoes={ativos.data.itens.map((ativo) => ({
            id: ativo.id,
            rotulo: ativo.patrimonio ? `${ativo.rotulo} (${ativo.patrimonio})` : ativo.rotulo,
          }))}
          placeholder={ativos.data.itens.length === 0 ? 'Nenhum ativo achado' : 'Selecione'}
          selectedKey={ativoId}
          onSelectionChange={(chave) => definirAtivoId(String(chave))}
        />
      )}
      {falha && <p className={estilos.falha}>{falha}</p>}
    </Dialogo>
  );
}
