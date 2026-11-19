// A prévia em tamanho real do construtor (spec modulo-chamados, "Construtor do formulário"; change
// chamados-da-ti, design, "A prévia em tamanho real (tarefa 5.24)"; m11). A chave "Prévia do
// colaborador" troca a paleta, a lista e a prévia pequena por duas colunas: à esquerda, afundada, o
// "Ver como", o que a pessoa vê, campo a campo, e o aviso dos campos escondidos; à direita, a aba em
// 900 px, a largura da tela do colaborador, sem nenhuma marca do editor, que responde ao clique como
// a aba, e, embaixo dela, "O que chegaria para a TI".
import type { Formulario } from '@grafite/domain';
import { Avatar, Botao, Carimbo, Icone } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  ChevronRight,
  CircleCheck,
  Eye,
  EyeOff,
  Ruler,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useApi } from '../../../api/useApi.tsx';
import { SeletorDeConta } from '../../administracao/seletores/SeletorDeConta.tsx';
import { opcoesDasSugestoes, type PessoaDoFormulario } from '../formulario/buscas.ts';
import type { EstadoDoFormulario } from '../formulario/estado.ts';
import { FormularioQueSePreenche } from '../formulario/FormularioQueSePreenche.tsx';
import { useBuscaDaPessoa } from '../formulario/useBuscaDaPessoa.ts';
import { BotaoDaAba } from '../previa/BotaoDaAba.tsx';
import { TelaDaAba } from '../previa/TelaDaAba.tsx';
import estilos from './PreviaEmTamanhoReal.module.css';
import {
  avisoDosEscondidos,
  detalheDoVerComo,
  type EnvioDaPrevia,
  envioDaPrevia,
  mesmasRespostas,
  oQueChegaria,
  oQueElaVe,
  recusasQueValem,
} from './previa.ts';

export interface PropsDaPreviaEmTamanhoReal {
  formulario: Formulario;
  nomeDoTipo: string;
  /** As respostas da prévia, as mesmas da prévia pequena. */
  estado: EstadoDoFormulario;
  aoMudar: (mudar: (anterior: EstadoDoFormulario) => EstadoDoFormulario) => void;
  /** A pessoa como quem a prévia mostra o formulário; sem ninguém, a busca fica aberta. */
  verComo: PessoaDoFormulario | null;
  aoVerComo: (pessoa: PessoaDoFormulario) => void;
  /** A frase no lugar do formulário que a pessoa não vê, como a do formulário sem campos. */
  vazio: string | null;
}

/**
 * O primeiro controle recusado, na ordem do formulário: o campo marcado pelo kit, os rádios e as
 * caixas do grupo marcado e, no Anexo, que tem a recusa só em texto, o botão dele.
 */
const RECUSADO = [
  'input[aria-invalid="true"]',
  'textarea[aria-invalid="true"]',
  '[aria-invalid="true"] input',
  'fieldset:has([role="alert"]) button',
].join(', ');

/** O ícone do aviso do envio, com a frase, que diz o estado sem depender da cor. */
const ICONES_DO_AVISO = { sucesso: CircleCheck, atencao: TriangleAlert } as const;

/** O "Enviar para a TI" apertado, com as respostas de então, de que as recusas e o aviso valem. */
interface Envio extends EnvioDaPrevia {
  naRecusa: EstadoDoFormulario['respostas'];
}

export function PreviaEmTamanhoReal({
  formulario,
  nomeDoTipo,
  estado,
  aoMudar,
  verComo,
  aoVerComo,
  vazio,
}: PropsDaPreviaEmTamanhoReal) {
  const id = useId();
  const aba = useRef<HTMLDivElement>(null);
  const [envio, definirEnvio] = useState<Envio | null>(null);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const erros = envio ? recusasQueValem(envio.erros, envio.naRecusa, estado.respostas) : {};
  const aviso = envio && mesmasRespostas(envio.naRecusa, estado.respostas) ? envio.aviso : null;
  const campos = oQueElaVe(formulario.campos);
  const escondidos = avisoDosEscondidos(formulario.campos);
  const chegaria = oQueChegaria(formulario, estado, nomeDoTipo);

  // A recusa leva o foco ao primeiro campo recusado, como na gaveta da abertura.
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    const recusado = aba.current?.querySelector<HTMLElement>(RECUSADO);
    recusado?.focus();
    recusado?.scrollIntoView({ block: 'nearest' });
  }, [pedidoDeFoco]);

  const enviar = () => {
    const conferido = envioDaPrevia(formulario, estado.respostas);
    definirEnvio({ ...conferido, naRecusa: estado.respostas });
    if (Object.keys(conferido.erros).length > 0) definirPedidoDeFoco((vez) => vez + 1);
  };

  return (
    <div className={estilos.corpo}>
      <aside className={estilos.lado} aria-label="Como a pessoa vê o formulário">
        <Carimbo nivel={2}>Ver como</Carimbo>
        <VerComo
          pessoa={verComo}
          aoEscolher={(pessoa) => {
            // As respostas de uma pessoa não valem para a outra: as sugestões mudam com ela.
            definirEnvio(null);
            aoVerComo(pessoa);
          }}
        />
        <Carimbo nivel={2} id={`${id}-ve`}>
          O que ela vê, campo a campo
        </Carimbo>
        {campos.length === 0 ? (
          <p className={estilos.semCampos}>O formulário ainda não tem campos.</p>
        ) : (
          <ul className={estilos.oQueElaVe} aria-labelledby={`${id}-ve`}>
            {campos.map((campo) => (
              <li key={campo.id} data-ve={campo.ve || undefined}>
                <Icone icone={campo.ve ? Eye : EyeOff} tamanho={16} />
                <span className={estilos.nomeDoCampo}>
                  {campo.nome}
                  {campo.condicao && <small>{campo.condicao}</small>}
                </span>
                <small className={estilos.nota}>{campo.nota}</small>
              </li>
            ))}
          </ul>
        )}
        {escondidos && (
          <p className={estilos.escondidos}>
            <Icone icone={EyeOff} tamanho={18} />
            <span>
              <b>{escondidos.titulo}</b> {escondidos.texto}
            </span>
          </p>
        )}
      </aside>

      <section className={estilos.mesa} aria-label="A prévia em tamanho real">
        <p className={estilos.regua}>
          <Icone icone={Ruler} tamanho={16} />
          <span>
            Tamanho real: <span className={estilos.mono}>900 px</span> de largura, como na tela do
            colaborador
          </span>
          <span className={estilos.fimDaRegua}>clique como ele clicaria</span>
        </p>
        <div ref={aba} className={estilos.aba}>
          <TelaDaAba
            rotulo="A aba do colaborador, em tamanho real"
            trilha={['Aba', 'Abrir chamado', nomeDoTipo]}
            passo="2 de 3"
            quem={verComo ? { nome: verComo.nome, voce: true } : undefined}
            rodape={{
              frase: 'A resposta chega aqui e no chat da aba.',
              acao: (
                <BotaoDaAba cheio icone={ChevronRight} iconeDepois onClick={enviar}>
                  Enviar para a TI
                </BotaoDaAba>
              ),
            }}
          >
            {vazio ? (
              <p className={estilos.semCampos}>{vazio}</p>
            ) : (
              <FormularioQueSePreenche
                formulario={formulario}
                estado={estado}
                aoMudar={aoMudar}
                quem="pessoa"
                pessoa={verComo}
                erros={erros}
                visual="aba"
              />
            )}
          </TelaDaAba>
        </div>
        <p role="status" className={estilos.aviso} data-situacao={aviso?.situacao}>
          {aviso && (
            <>
              <Icone icone={ICONES_DO_AVISO[aviso.situacao]} tamanho={16} />
              {aviso.texto}
            </>
          )}
        </p>
        <section className={estilos.chegaria} aria-labelledby={`${id}-chegaria`}>
          <Carimbo nivel={3} id={`${id}-chegaria`}>
            O que chegaria para a TI
          </Carimbo>
          <dl>
            <div>
              <dt>Título do chamado</dt>
              <dd>{chegaria.titulo}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{chegaria.tipo}</dd>
            </div>
            {chegaria.temAtivo && (
              <div>
                <dt>Ativo</dt>
                <dd>
                  {chegaria.ativo === null ? (
                    'Nenhum'
                  ) : (
                    <>
                      {chegaria.ativo.patrimonio && (
                        <span className={estilos.mono}>{chegaria.ativo.patrimonio}</span>
                      )}{' '}
                      {chegaria.ativo.rotulo}
                    </>
                  )}
                </dd>
              </div>
            )}
            {chegaria.respostas.map((parte, indice) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: dois campos podem ter o mesmo nome no resumo; a posição é a ordem do formulário.
              <div key={indice}>
                <dt>{parte.nome}</dt>
                <dd className={parte.mono ? estilos.mono : undefined}>{parte.resposta}</dd>
              </div>
            ))}
            {chegaria.camposDaTi && (
              <div>
                <dt>Campos da TI</dt>
                <dd>a TI preenche depois</dd>
              </div>
            )}
          </dl>
        </section>
      </section>
    </div>
  );
}

/**
 * O "Ver como": a pessoa, com o local e os ativos dela, que as sugestões do formulário mostram, e
 * "Trocar", que abre a busca da pessoa no lugar. Sem ninguém, a busca já fica aberta.
 */
function VerComo({
  pessoa,
  aoEscolher,
}: {
  pessoa: PessoaDoFormulario | null;
  aoEscolher: (pessoa: PessoaDoFormulario) => void;
}) {
  const api = useApi();
  const busca = useBuscaDaPessoa('pessoa');
  const [trocando, definirTrocando] = useState(false);
  // Para onde o foco vai ao abrir e ao fechar a busca, depois da pintura.
  const [foco, definirFoco] = useState<'busca' | 'trocar' | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const trocar = useRef<HTMLButtonElement>(null);
  const sugestoes = useQuery({
    ...opcoesDasSugestoes(api, 'pessoa', pessoa?.id ?? '', []),
    enabled: pessoa !== null,
  });
  const detalhe = pessoa === null ? [] : detalheDoVerComo(sugestoes.data);

  useEffect(() => {
    if (foco === null) return;
    if (foco === 'busca') area.current?.querySelector('input')?.focus();
    else trocar.current?.focus();
    definirFoco(null);
  }, [foco]);

  if (pessoa === null || trocando) {
    return (
      <div ref={area} className={estilos.busca}>
        <SeletorDeConta
          rotulo="Buscar a pessoa"
          valor={null}
          aoMudar={(conta) => {
            if (!conta) return;
            aoEscolher({ id: conta.id, nome: busca.nomeDa(conta) });
            definirTrocando(false);
            definirFoco('trocar');
          }}
          buscar={busca.buscar}
          placeholder="Digite o nome"
          descricao="Ela vê o formulário com o nome dela e as sugestões do local e dos ativos dela."
        />
        {pessoa !== null && (
          <Botao
            nivel="terciario"
            onPress={() => {
              definirTrocando(false);
              definirFoco('trocar');
            }}
          >
            Cancelar
          </Botao>
        )}
      </div>
    );
  }

  return (
    <div ref={area} className={estilos.verComo}>
      <Avatar nome={pessoa.nome} tamanho="linha" decorativo />
      <span className={estilos.quem}>
        <b>{pessoa.nome}</b>
        {detalhe.length > 0 && (
          <small>
            {detalhe.map((parte, indice) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: o detalhe não muda de ordem; a posição é a do local e dos ativos.
              <span key={indice}>
                {indice > 0 && ' · '}
                <span className={parte.mono ? estilos.mono : undefined}>{parte.texto}</span>
              </span>
            ))}
          </small>
        )}
      </span>
      <Botao
        ref={trocar}
        icone={ArrowLeftRight}
        onPress={() => {
          definirTrocando(true);
          definirFoco('busca');
        }}
      >
        Trocar
      </Botao>
    </div>
  );
}
