// A coluna da direita do chamado aberto (spec modulo-chamados, "Chamado aberto"; change
// chamados-da-ti, design, "A coluna da direita, a pessoa e o ativo (tarefa 5.13)" e "A linha do
// tempo, os campos do tipo e as seções guardadas (tarefa 5.14)"; mockups m03 e m04): as seções
// que recolhem, com a Pessoa, o Ativo ligado, a Linha do tempo e os Campos do tipo, e a escolha de
// cada uma guardada neste navegador.
import {
  ROTULOS_DAS_SITUACOES_DA_ORDEM,
  ROTULOS_DAS_SITUACOES_DA_SOLICITACAO,
  ROTULOS_DOS_TIPOS_DE_SUPRIMENTO,
  tintaDoSuprimento,
} from '@grafite/domain';
import {
  Botao,
  Icone,
  Medidor,
  MiniaturaDeAtivo,
  NOMES_DAS_TINTAS,
  RotuloDeSituacao,
  useDataHora,
} from '@grafite/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, Package } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { diaDoReabrir } from '../../../chat/chamado.ts';
import { Desatualizado, IdadeDaLeitura, SituacaoNaTela } from '../../ativos/disponibilidade.tsx';
import type { PainelDeSuprimentos } from '../../ativos/suprimentos.tsx';
import type { FichaDoChamado } from '../consultas.ts';
import { SiglaDaPessoa } from '../Pecas.tsx';
import { CamposDoTipo } from './CamposDoTipo.tsx';
import estilos from './Lado.module.css';
import {
  type AcoesDoAtivo,
  contatosDaPessoa,
  gravarSecoes,
  lerSecoes,
  linhaDoTempo,
  linhasDoEstoque,
  preencheOsCampos,
  type SecoesDoLado,
  textoDasOrdens,
} from './lado.ts';
import { SecaoDoLado } from './SecaoDoLado.tsx';
import { TrocarOAtivo } from './TrocarOAtivo.tsx';

export function LadoDoChamado({ ficha, acoes }: { ficha: FichaDoChamado; acoes: AcoesDoAtivo }) {
  const [secoes, definirSecoes] = useState(lerSecoes);
  /** A escolha de uma seção, junta à guardada, que outro chamado aberto pode ter mudado. */
  const mudar = (nome: keyof SecoesDoLado) => (aberta: boolean) => {
    const novas = { ...lerSecoes(), [nome]: aberta };
    gravarSecoes(novas);
    definirSecoes(novas);
  };
  return (
    <aside className={estilos.lado} aria-label="Detalhes do chamado">
      <SecaoDoLado titulo="Pessoa" aberta={secoes.pessoa} aoMudarAberta={mudar('pessoa')}>
        <SecaoDaPessoa pessoa={ficha.pessoa} />
      </SecaoDoLado>
      <SecaoDoLado titulo="Ativo ligado" aberta={secoes.ativo} aoMudarAberta={mudar('ativo')}>
        <SecaoDoAtivo ficha={ficha} acoes={acoes} />
      </SecaoDoLado>
      <SecaoDoLado titulo="Linha do tempo" aberta={secoes.linha} aoMudarAberta={mudar('linha')}>
        <LinhaDoTempo ficha={ficha} />
      </SecaoDoLado>
      {/* O tipo sem campos não tem o que mostrar nem o que preencher. */}
      {ficha.formulario.campos.length > 0 && (
        <CamposDoTipo
          // Outro chamado começa do zero, depois de gravar o que ficou no anterior.
          key={ficha.numero}
          ficha={ficha}
          preenche={preencheOsCampos(ficha)}
          aberta={secoes.campos}
          aoMudarAberta={mudar('campos')}
        />
      )}
    </aside>
  );
}

/**
 * A linha do tempo, como no m03 e no m04: o caminho do chamado pelas situações, com o ponto de cada
 * passo e o fio entre eles; o passo de agora, o último, com o ponto na cor da informação. O fechado
 * acaba em "Fechado · 18/11", com o último dia em que ele se reabria.
 */
function LinhaDoTempo({ ficha }: { ficha: FichaDoChamado }) {
  const agora = useAgora();
  const dataHora = useDataHora();
  const passos = linhaDoTempo(ficha.conversa, {
    pessoa: ficha.pessoa.nome,
    agora,
    dataHora,
    fechado:
      ficha.fechado && ficha.reabrirAte !== null
        ? diaDoReabrir(ficha.reabrirAte, agora, dataHora)
        : null,
  });
  return (
    <ol className={estilos.linhaDoTempo} aria-label="Passos do chamado">
      {passos.map((passo) => (
        <li
          key={passo.id}
          data-agora={passo.agora ? '' : undefined}
          aria-current={passo.agora ? 'step' : undefined}
        >
          <span className={estilos.ponto} aria-hidden="true" />
          <div>
            <b>{passo.titulo}</b>
            <small>{passo.texto}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Um par do quadro de dados: o rótulo em versal pequena e o valor. */
function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * A pessoa: a sigla, o nome e o local; os contatos e "Abrir a ficha", só quando a ficha os traz. A
 * anonimizada vem com o nome anonimizado e sem os dois.
 */
function SecaoDaPessoa({ pessoa }: { pessoa: FichaDoChamado['pessoa'] }) {
  const navegar = useNavigate();
  const contatos = contatosDaPessoa(pessoa);
  return (
    <>
      <div className={estilos.quem}>
        <SiglaDaPessoa conta={null} nome={pessoa.nome} />
        <div className={estilos.nomeELocal}>
          <b>{pessoa.nome}</b>
          <span>{pessoa.local ?? 'Sem local de trabalho'}</span>
        </div>
      </div>
      {contatos &&
        (contatos.length === 0 ? (
          <p className={estilos.informacao}>Nenhum contato no cadastro.</p>
        ) : (
          <dl className={estilos.dados}>
            {contatos.map((contato) => (
              <Dado key={contato.rotulo} rotulo={contato.rotulo}>
                <a className={estilos.link} href={contato.endereco}>
                  {contato.texto}
                </a>
              </Dado>
            ))}
          </dl>
        ))}
      {pessoa.abrir && (
        <div className={estilos.acoes}>
          <Botao
            nivel="terciario"
            icone={ArrowUpRight}
            onPress={() =>
              void navegar({ to: '/administracao/pessoas/$id', params: { id: pessoa.id } })
            }
          >
            Abrir a ficha
          </Botao>
        </div>
      )}
    </>
  );
}

/**
 * O ativo ligado: o cartão com a miniatura, o nome, o patrimônio e o "Toner crítico", os
 * suprimentos, o estado, as páginas e as OS no ano; a nota do estoque; a OS e a solicitação do
 * chamado; e "Trocar o ativo" e "Abrir a ficha". Cada parte do resumo só quando ele a traz.
 */
function SecaoDoAtivo({ ficha, acoes }: { ficha: FichaDoChamado; acoes: AcoesDoAtivo }) {
  const navegar = useNavigate();
  const agora = useAgora();
  const { ativo } = ficha;
  const resumo = ativo?.resumo ?? null;
  const estoque = resumo
    ? linhasDoEstoque(resumo, {
        pedirToner: acoes.pedirToner,
        solicitacaoDoChamado: ficha.solicitacao?.id ?? null,
      })
    : null;
  const total = resumo?.suprimentos?.total ?? null;
  // O quadro de dados só com algum dado: vazio, ele deixaria uma sobra embaixo do cartão.
  const temDados = Boolean(ativo?.local || resumo?.disponibilidade || total || resumo?.ordens);
  return (
    <>
      {ativo ? (
        <div className={estilos.ativo}>
          <MiniaturaDeAtivo tipo={ativo.tipo.icone} className={estilos.miniatura} />
          <div className={estilos.nomeDoAtivo}>
            <b>{ativo.rotulo}</b>
            <div className={estilos.marcas}>
              {ativo.patrimonio && <span className={estilos.mono}>{ativo.patrimonio}</span>}
              {resumo?.tonerCritico && (
                <RotuloDeSituacao situacao="critico">Toner crítico</RotuloDeSituacao>
              )}
            </div>
          </div>
          {resumo?.suprimentos && <SuprimentosDoAtivo painel={resumo.suprimentos} agora={agora} />}
          {temDados && (
            <dl className={estilos.dados}>
              {ativo.local && <Dado rotulo="Local">{ativo.local}</Dado>}
              {resumo?.disponibilidade && (
                <Dado rotulo="Estado">
                  <span className={estilos.estado}>
                    <SituacaoNaTela disponibilidade={resumo.disponibilidade} />
                    {resumo.disponibilidade.desde && (
                      <IdadeDaLeitura momento={resumo.disponibilidade.desde} agora={agora} />
                    )}
                    <Desatualizado momento={resumo.disponibilidade.momento} agora={agora} />
                  </span>
                </Dado>
              )}
              {total && (
                <Dado rotulo="Páginas">
                  <span className={estilos.mono}>{total.paginas.toLocaleString('pt-BR')}</span>
                  {resumo?.paginasPorMes !== null &&
                    resumo?.paginasPorMes !== undefined &&
                    ` · cerca de ${resumo.paginasPorMes.toLocaleString('pt-BR')} por mês`}
                </Dado>
              )}
              {resumo?.ordens && <Dado rotulo="OS no ano">{textoDasOrdens(resumo.ordens)}</Dado>}
            </dl>
          )}
        </div>
      ) : (
        <p className={estilos.informacao}>Nenhum ativo ligado.</p>
      )}
      {estoque && (
        <div className={estilos.estoque} data-atencao={estoque.atencao ? '' : undefined}>
          <Icone icone={Package} tamanho={16} />
          <div>
            {estoque.linhas.map((linha) => (
              <p key={linha}>{linha}</p>
            ))}
          </div>
        </div>
      )}
      {(ficha.os || ficha.solicitacao) && (
        <ul className={estilos.ligados} aria-label="Ligados ao chamado">
          {ficha.os && (
            <li>
              <Link
                className={estilos.link}
                to="/operacao/ordens/$numero"
                params={{ numero: String(ficha.os.numero) }}
              >
                {`OS ${ficha.os.numero}`}
              </Link>
              {` · ${ROTULOS_DAS_SITUACOES_DA_ORDEM[ficha.os.situacao]}`}
              {/* A OS noutro ativo diz qual (tarefa 5.31): o chamado fica com o dele. */}
              {ficha.os.ativo.id !== ficha.ativo?.id &&
                ` · ${ficha.os.ativo.patrimonio ?? ficha.os.ativo.rotulo}`}
            </li>
          )}
          {ficha.solicitacao && (
            <li>
              <Link
                className={estilos.link}
                to="/operacao/solicitacoes/$numero"
                params={{ numero: String(ficha.solicitacao.numero) }}
              >
                {`Solicitação ${ficha.solicitacao.numero}`}
              </Link>
              {` · ${ROTULOS_DAS_SITUACOES_DA_SOLICITACAO[ficha.solicitacao.situacao]}`}
            </li>
          )}
        </ul>
      )}
      {(acoes.trocar || ativo?.abrir) && (
        <div className={estilos.acoes}>
          {acoes.trocar && <TrocarOAtivo ficha={ficha} />}
          {ativo?.abrir && (
            <Botao
              nivel="terciario"
              icone={ArrowUpRight}
              onPress={() => void navegar({ to: '/ativos/$id', params: { id: ativo.id } })}
            >
              Abrir a ficha
            </Botao>
          )}
        </div>
      )}
    </>
  );
}

type Suprimento = PainelDeSuprimentos['suprimentos'][number];

/** O nome do suprimento: o toner com a tinta, como "Toner preto", o tipo ou, no outro, a descrição. */
function nomeDoSuprimento(suprimento: Suprimento): string {
  const tinta = suprimento.tipo === 'toner' ? tintaDoSuprimento(suprimento.descricao) : null;
  if (tinta) return `Toner ${NOMES_DAS_TINTAS[tinta].toLocaleLowerCase('pt-BR')}`;
  if (suprimento.tipo === 'outro') return suprimento.descricao;
  return ROTULOS_DOS_TIPOS_DE_SUPRIMENTO[suprimento.tipo];
}

/** O nível em texto: o percentual medido ou o estado, que nunca vira um percentual. */
function nivelEmTexto(nivel: Suprimento['nivel']): string {
  switch (nivel.tipo) {
    case 'medido':
      return `${nivel.percentual.toLocaleString('pt-BR')}%`;
    case 'ha-suprimento':
      return 'Há suprimento';
    case 'sem-dado':
      return 'Sem dado';
    case 'inconsistente':
      return 'Inconsistente';
  }
}

/**
 * Os suprimentos, como no m04: o nome e o nível em texto e, no medido, a régua na tinta. Sem
 * leitura, "Não verificado", com o motivo; a leitura velha, com o "Desatualizado".
 */
function SuprimentosDoAtivo({ painel, agora }: { painel: PainelDeSuprimentos; agora: Date }) {
  if (!painel.resposta) {
    return (
      <p className={estilos.informacao}>
        {painel.motivo
          ? `Suprimentos não verificados: ${painel.motivo}`
          : 'Suprimentos não verificados.'}
      </p>
    );
  }
  if (painel.suprimentos.length === 0) return null;
  return (
    <div className={estilos.suprimentos}>
      <Desatualizado momento={painel.resposta.momento} agora={agora} metrica="snmp.resposta" />
      <ul aria-label="Suprimentos">
        {painel.suprimentos.map((suprimento) => {
          const nome = nomeDoSuprimento(suprimento);
          const tinta =
            suprimento.tipo === 'toner' ? tintaDoSuprimento(suprimento.descricao) : null;
          return (
            <li key={suprimento.item} title={suprimento.descricao}>
              <span className={estilos.linhaDoNivel}>
                <span>{nome}</span>
                <b className={estilos.mono}>{nivelEmTexto(suprimento.nivel)}</b>
              </span>
              {suprimento.nivel.tipo === 'medido' && (
                <Medidor
                  rotulo={nome}
                  valor={suprimento.nivel.percentual}
                  tinta={tinta ?? 'neutra'}
                  marcas={[]}
                  tamanho="compacto"
                  semNumero
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
