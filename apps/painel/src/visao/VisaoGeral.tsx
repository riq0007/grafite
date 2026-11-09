// A tela principal do painel (spec painel-da-operacao, "Estado do servidor no painel"): cada
// serviço da instalação, com o estado escrito por extenso e os botões do ambiente dele; as versões
// de cada ambiente; o backup e o teste de restauração; o certificado; e o disco. A lista dos
// serviços vem do servidor: um serviço novo aparece sem mudar a página.
import { Botao, RotuloDeSituacao } from '@grafite/ui';
import type { EstadoDoPainel } from '../api/tipos.ts';
import { AMBIENTE_COM_ARTIGO, formatarGigabytes, formatarMomento } from '../formatos.ts';
import { useTarefas } from '../tarefas/pedirTarefa.tsx';
import estilos from './VisaoGeral.module.css';

type Servico = EstadoDoPainel['servicos'][number];

const ESTADO: Record<
  Servico['estado'],
  { texto: string; situacao: 'sucesso' | 'critico' | 'info' | 'atencao' }
> = {
  rodando: { texto: 'Rodando', situacao: 'sucesso' },
  parado: { texto: 'Parado', situacao: 'critico' },
  mudando: { texto: 'Iniciando ou parando', situacao: 'info' },
  ausente: { texto: 'Não registrado', situacao: 'atencao' },
};

const NOME_DO_AMBIENTE = { producao: 'Produção', teste: 'Teste' } as const;

function AcoesDoServico({ servico }: { servico: Servico }) {
  const { pedir, emAndamento } = useTarefas();
  if (!servico.ligadoPeloAmbiente || servico.ambiente === null) return null;
  const ambiente = servico.ambiente;
  const doAmbiente = AMBIENTE_COM_ARTIGO[ambiente];
  const ocupado = emAndamento !== null;
  if (servico.estado !== 'rodando') {
    return (
      <Botao
        aria-label={`Ligar ${doAmbiente}`}
        isDisabled={ocupado}
        onPress={() => void pedir('servicos-iniciar', { ambiente })}
      >
        Ligar
      </Botao>
    );
  }
  return (
    <>
      <Botao
        aria-label={`Reiniciar ${doAmbiente}`}
        isDisabled={ocupado}
        onPress={() => void pedir('servicos-reiniciar', { ambiente })}
      >
        Reiniciar
      </Botao>
      <Botao
        aria-label={`Desligar ${doAmbiente}`}
        isDisabled={ocupado}
        onPress={() => void pedir('servicos-parar', { ambiente })}
      >
        Desligar
      </Botao>
    </>
  );
}

function Servicos({ servicos }: { servicos: Servico[] }) {
  return (
    <table className={estilos.tabela} aria-label="Serviços">
      <thead>
        <tr>
          <th scope="col">Serviço</th>
          <th scope="col">Nome no servidor</th>
          <th scope="col">Ambiente</th>
          <th scope="col">Estado</th>
          <th scope="col">
            <span className={estilos.semTexto}>Ações</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {servicos.map((servico) => (
          <tr key={servico.id}>
            <th scope="row">{servico.nome}</th>
            <td className={estilos.mono}>{servico.nomeNaPlataforma}</td>
            <td>{servico.ambiente === null ? 'Os dois' : NOME_DO_AMBIENTE[servico.ambiente]}</td>
            <td>
              <RotuloDeSituacao situacao={ESTADO[servico.estado].situacao}>
                {ESTADO[servico.estado].texto}
              </RotuloDeSituacao>
            </td>
            <td>
              <div className={estilos.acoes}>
                <AcoesDoServico servico={servico} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Um registro do banco da produção, como o último backup, ou a falta dele. */
function registro(
  rotulo: string,
  valor: EstadoDoPainel['ultimoBackup'],
  semRegistro: string,
): string {
  if (valor === 'sem-informacao') {
    return `${rotulo}: sem informação, com o banco da produção parado.`;
  }
  if (valor === null) return semRegistro;
  const situacao =
    valor.situacao === 'feito' ? 'feito' : valor.situacao === 'falhou' ? 'falhou' : 'em andamento';
  return `${rotulo}: ${situacao} em ${formatarMomento(valor.momento)}${valor.erro ? `. ${valor.erro}` : '.'}`;
}

function Certificado({ certificado }: { certificado: EstadoDoPainel['certificado'] }) {
  const modo =
    certificado.modo === 'publico'
      ? "Let's Encrypt, pelo DNS da Cloudflare"
      : certificado.ac === 'empresa'
        ? 'Da AC da empresa'
        : 'Da AC do próprio proxy, que o renova sozinha';
  const vencimento =
    certificado.dias === null || certificado.venceEm === null
      ? 'O proxy não respondeu: sem a data de vencimento.'
      : certificado.modo === 'interno' && certificado.ac === 'caddy'
        ? `Vale até ${formatarMomento(certificado.venceEm)}.`
        : `Vence em ${certificado.dias} dias, em ${formatarMomento(certificado.venceEm)}.`;
  return (
    <section className={estilos.cartao} aria-label="Certificado">
      <h2>Certificado</h2>
      <p>{modo}</p>
      <p className={estilos.nota}>{vencimento}</p>
    </section>
  );
}

export function VisaoGeral({ estado }: { estado: EstadoDoPainel }) {
  const { disco } = estado;
  return (
    <div className={estilos.visao}>
      <Servicos servicos={estado.servicos} />
      <div className={estilos.cartoes}>
        {(['producao', 'teste'] as const).map((ambiente) => {
          const { atual, anterior, enderecos } = estado.ambientes[ambiente];
          return (
            <section
              key={ambiente}
              className={estilos.cartao}
              aria-label={NOME_DO_AMBIENTE[ambiente]}
            >
              <h2>{NOME_DO_AMBIENTE[ambiente]}</h2>
              <p className={estilos.versao}>{atual === null ? 'Sem versão' : `Versão ${atual}`}</p>
              <p className={estilos.nota}>
                {anterior === null ? 'Sem versão anterior' : `Anterior: ${anterior}`}
              </p>
              <ul className={estilos.lista}>
                {enderecos.map((endereco) => (
                  <li key={endereco} className={estilos.mono}>
                    https://{endereco}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <section className={estilos.cartao} aria-label="Backup">
          <h2>Backup</h2>
          <p>{registro('Último backup', estado.ultimoBackup, 'Nenhum backup registrado.')}</p>
          <ul className={estilos.lista}>
            {estado.backups.map(({ destino, ultimo }) => (
              <li key={destino}>
                <span className={estilos.mono}>{destino}</span>
                {': '}
                {ultimo === null
                  ? 'nenhum backup pronto'
                  : `${ultimo.nome}${ultimo.momento === null ? '' : `, de ${formatarMomento(ultimo.momento)}`}`}
              </li>
            ))}
          </ul>
          <p className={estilos.nota}>
            {registro(
              'Teste de restauração',
              estado.testeDeRestauracao,
              'Nenhum teste de restauração registrado.',
            )}
          </p>
        </section>
        <Certificado certificado={estado.certificado} />
        <section className={estilos.cartao} aria-label="Disco">
          <h2>Disco</h2>
          <p>
            {disco === null
              ? 'Sem informação do disco.'
              : `${formatarGigabytes(disco.livre)} livres de ${formatarGigabytes(disco.total)} (${Math.round((disco.livre / disco.total) * 100)}%)`}
          </p>
        </section>
      </div>
    </div>
  );
}

/** A faixa de avisos, em texto, no topo da página: some sem nenhum aviso. */
export function FaixaDeAvisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <section className={estilos.avisos} aria-label="Avisos">
      <ul className={estilos.lista}>
        {avisos.map((aviso) => (
          <li key={aviso}>
            <RotuloDeSituacao situacao="atencao">Atenção</RotuloDeSituacao> {aviso}
          </li>
        ))}
      </ul>
    </section>
  );
}
