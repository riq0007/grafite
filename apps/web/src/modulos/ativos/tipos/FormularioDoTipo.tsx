import type { components } from '@grafite/api-client';
import {
  CAPACIDADES_COM_CARTAO,
  conferirCamposDoTipo,
  conferirConfiguracaoDasCapacidades,
  ICONES_DE_TIPO,
  type IconeDeTipo,
  PORTA_PADRAO_DO_VNC,
  primeiroCartaoAutomatico,
  ROTULOS_DOS_ICONES,
  ROTULOS_DOS_TIPOS_DE_CAMPO,
  type VersaoDoSnmp,
  VISAO_GERAL_DA_FICHA,
} from '@grafite/domain';
import {
  Botao,
  BotaoDeIcone,
  CampoDeTexto,
  Checkbox,
  ControleSegmentado,
  EscolhaDeIcone,
  Formulario,
  GrupoDeCheckboxes,
  MensagemDoPasso,
  type OpcaoDeSelecao,
  RotuloDeSituacao,
  Segmento,
  Selecao,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import type { RecusaDoFormulario } from '../../administracao/recusa.ts';
import estilos from '../Ativos.module.css';
import {
  type CampoDaOrganizacao,
  type Capacidade,
  useComunidadesSnmp,
  useLoginsDoControlId,
} from '../consultas.ts';

export interface CampoNoTipo {
  campoId: string;
  obrigatorio: boolean;
}

/** O que o tipo guarda das capacidades que pedem uma configuração, como o IP do ping. */
export type ConfiguracaoDasCapacidades = components['schemas']['ConfiguracaoDasCapacidades'];

/** O tipo no formulário. */
export interface DadosDoTipo {
  nome: string;
  icone: IconeDeTipo | null;
  capacidades: string[];
  configuracaoDasCapacidades: ConfiguracaoDasCapacidades;
  campos: CampoNoTipo[];
  /** O primeiro cartão da ficha; nulo no automático (change primeiro-cartao-da-ficha). */
  primeiroCartao: string | null;
}

/** O que vai para a API: o nome sem os espaços das pontas e o ícone escolhido. */
export interface PedidoDoTipo {
  nome: string;
  icone: IconeDeTipo;
  capacidades: string[];
  configuracaoDasCapacidades: ConfiguracaoDasCapacidades;
  campos: CampoNoTipo[];
  primeiroCartao: string | null;
}

type CampoDoFormulario =
  | 'nome'
  | 'icone'
  | 'capacidades'
  | 'configuracaoDasCapacidades'
  | 'campos'
  | 'primeiroCartao';

/** As capacidades que pedem o campo de IP: a disponibilidade, os suprimentos e o Control iD. */
type ComCampoDeIp = Exclude<keyof ConfiguracaoDasCapacidades, 'controlid.backup' | 'acesso.vnc'>;

/** O horário do backup do Control iD que o tipo já traz escolhido. */
const HORARIO_PADRAO_DO_BACKUP = '02:00';

/** O que o tipo guarda do SNMP: o campo de IP, a versão e a comunidade do cofre, ou a public. */
type ConfiguracaoDoSnmp = NonNullable<ConfiguracaoDasCapacidades['snmp.suprimentos']>;

/** O motivo de a capacidade que pede um campo de IP não ligar, no tipo que não tem nenhum. */
const SEM_CAMPO_DE_IP: Record<string, string> = {
  'rede.disponibilidade':
    'Inclua no tipo um campo do tipo IP para ligar a disponibilidade na rede.',
  'snmp.suprimentos': 'Inclua no tipo um campo do tipo IP para ligar os suprimentos e contadores.',
  'controlid.saude': 'Inclua no tipo um campo do tipo IP para ligar a saúde do Control iD.',
  'controlid.backup':
    'Inclua no tipo um campo do tipo IP e ligue a saúde do Control iD para ligar o backup.',
  'acesso.vnc':
    'Inclua no tipo um campo do tipo IP e ligue a disponibilidade na rede para ligar o acesso remoto.',
};

/** O que o tipo guarda da sondagem do Control iD: o campo de IP, a porta e o login do cofre. */
type ConfiguracaoDoControlId = NonNullable<ConfiguracaoDasCapacidades['controlid.saude']>;

/** A porta que o tipo já traz escolhida. */
const PORTA_PADRAO = 80;

export const TIPO_VAZIO: DadosDoTipo = {
  nome: '',
  icone: null,
  capacidades: [],
  configuracaoDasCapacidades: {},
  campos: [],
  primeiroCartao: null,
};

const OPCOES_DE_ICONE = ICONES_DE_TIPO.map((chave) => ({
  chave,
  rotulo: ROTULOS_DOS_ICONES[chave],
}));

/**
 * As regras do formulário, com as conferências do domínio, as mesmas da API, da lista de campos e da
 * configuração das capacidades, para a recusa, como a do arquivo obrigatório ou a do IP do ping que
 * sai do tipo, aparecer antes do envio e com a mesma mensagem.
 */
function validar(
  { nome, icone, capacidades, configuracaoDasCapacidades, campos: pedidos }: DadosDoTipo,
  inicial: DadosDoTipo,
  campos: readonly CampoDaOrganizacao[],
): Partial<Record<CampoDoFormulario, string>> {
  const motivos: Partial<Record<CampoDoFormulario, string>> = {};
  if (nome.trim() === '') motivos.nome = 'Informe o nome do tipo.';
  else if (nome.trim().length > 60) motivos.nome = 'Use até 60 caracteres.';
  if (icone === null) motivos.icone = 'Escolha o ícone do tipo.';
  const lista = conferirCamposDoTipo(
    inicial.campos.map((campo) => campo.campoId),
    pedidos,
    campos,
  );
  if (!lista.ok) motivos.campos = lista.erro;
  const configuracao = conferirConfiguracaoDasCapacidades({
    capacidades,
    configuracao: configuracaoDasCapacidades,
    campos: pedidos.map((campo) => campo.campoId),
    atual: inicial.configuracaoDasCapacidades,
    definicoes: campos,
  });
  if (!configuracao.ok) {
    const onde = configuracao.onde === 'campos' ? 'campos' : 'configuracaoDasCapacidades';
    motivos[onde] ??= configuracao.erro;
  }
  return motivos;
}

/** A capacidade cuja configuração o domínio recusa, para a recusa aparecer só nela. */
function capacidadeRecusada(
  dados: DadosDoTipo,
  inicial: DadosDoTipo,
  campos: readonly CampoDaOrganizacao[],
): string | null {
  const recusada = dados.capacidades.find(
    (chave) =>
      !conferirConfiguracaoDasCapacidades({
        capacidades: [chave],
        configuracao: dados.configuracaoDasCapacidades,
        campos: dados.campos.map((campo) => campo.campoId),
        atual: inicial.configuracaoDasCapacidades,
        definicoes: campos,
      }).ok,
  );
  return recusada ?? null;
}

export interface PropsDoFormularioDoTipo {
  inicial: DadosDoTipo;
  /** Os campos da organização, para a lista do tipo e os que dá para incluir. */
  campos: readonly CampoDaOrganizacao[];
  capacidades: readonly Capacidade[];
  /** Os dados à vista, sem edição nem ação, para quem não pode mudar o catálogo. */
  soLeitura?: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoTipo) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoFormulario>>;
  aoCancelar?: () => void;
  /** Avisa se algo já foi preenchido, para fechar a aba do cadastro pedir confirmação. */
  aoMudarPreenchido?: (preenchido: boolean) => void;
}

/**
 * O formulário do tipo de ativo (spec catalogo-de-ativos): o nome, o ícone, as capacidades, com a
 * descrição de cada uma, e os campos da organização que o tipo usa, em ordem, com os obrigatórios.
 * Os campos das capacidades ligadas aparecem no grupo de cada uma, só para leitura.
 */
export function FormularioDoTipo({
  inicial,
  campos,
  capacidades,
  soLeitura = false,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoFormularioDoTipo) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoFormulario, string>>>({});
  /** A capacidade da recusa da configuração; a da API, que não diz qual, vale para todas. */
  const [capacidadeDoErro, definirCapacidadeDoErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const nome = useRef<HTMLInputElement>(null);
  const porId = new Map(campos.map((campo) => [campo.id, campo]));

  const mudar = (mudanca: Partial<DadosDoTipo>) => {
    const novos = { ...dados, ...mudanca };
    aoMudarPreenchido?.(
      novos.nome.trim() !== '' ||
        novos.icone !== null ||
        novos.capacidades.length > 0 ||
        novos.campos.length > 0,
    );
    definirDados((atuais) => ({ ...atuais, ...mudanca }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const campo of Object.keys(mudanca)) delete restantes[campo as CampoDoFormulario];
      return restantes;
    });
  };

  const mudarCampos = (lista: CampoNoTipo[]) => mudar({ campos: lista });
  const mover = (indice: number, passo: -1 | 1) => {
    const lista = [...dados.campos];
    const [campo] = lista.splice(indice, 1);
    if (campo) lista.splice(indice + passo, 0, campo);
    mudarCampos(lista);
  };
  const noTipo = new Set(dados.campos.map((campo) => campo.campoId));
  const paraIncluir = campos.filter((campo) => campo.situacao === 'ativo' && !noTipo.has(campo.id));
  const ligadas = capacidades.filter((capacidade) => dados.capacidades.includes(capacidade.chave));
  /** Os campos ativos do tipo IP que estão no tipo: as escolhas do IP do ping. */
  const opcoesDeIp = dados.campos.flatMap((noTipoAgora) => {
    const campo = porId.get(noTipoAgora.campoId);
    return campo?.tipo === 'ip' && campo.situacao === 'ativo'
      ? [{ id: campo.id, rotulo: campo.rotulo }]
      : [];
  });
  const campoDoIp = (chave: string) =>
    dados.configuracaoDasCapacidades[chave as ComCampoDeIp]?.campoDoIp ?? null;
  const erroDa = (chave: string) =>
    capacidadeDoErro === null || capacidadeDoErro === chave
      ? erros.configuracaoDasCapacidades
      : undefined;

  /**
   * A configuração das capacidades ligadas: a da desligada sai, o IP único já vem escolhido, o
   * SNMP começa na versão 2c, com a public, e a sondagem do Control iD, na porta 80.
   */
  const configuracaoPara = (lista: readonly string[]) => {
    const resultado: ConfiguracaoDasCapacidades = {};
    const ipUnico = opcoesDeIp.length === 1 ? opcoesDeIp[0]?.id : undefined;
    for (const capacidade of capacidades) {
      if (!capacidade.configuracao || !lista.includes(capacidade.chave)) continue;
      const escolhido = campoDoIp(capacidade.chave) ?? ipUnico;
      if (capacidade.configuracao === 'snmp') {
        const atual = dados.configuracaoDasCapacidades['snmp.suprimentos'];
        resultado['snmp.suprimentos'] = {
          ...(escolhido && { campoDoIp: escolhido }),
          versao: atual?.versao ?? '2c',
          segredoId: atual?.segredoId ?? null,
        };
      } else if (capacidade.configuracao === 'control-id') {
        const atual = dados.configuracaoDasCapacidades['controlid.saude'];
        resultado['controlid.saude'] = {
          ...(escolhido && { campoDoIp: escolhido }),
          porta: atual?.porta ?? PORTA_PADRAO,
          segredoId: atual?.segredoId ?? null,
        };
      } else if (capacidade.configuracao === 'backup-do-control-id') {
        const atual = dados.configuracaoDasCapacidades['controlid.backup'];
        resultado['controlid.backup'] = { horario: atual?.horario ?? HORARIO_PADRAO_DO_BACKUP };
      } else if (capacidade.configuracao === 'acesso-remoto') {
        const atual = dados.configuracaoDasCapacidades['acesso.vnc'];
        resultado['acesso.vnc'] = { porta: atual?.porta ?? PORTA_PADRAO_DO_VNC };
      } else if (escolhido) {
        resultado[capacidade.chave as 'rede.disponibilidade'] = { campoDoIp: escolhido };
      }
    }
    return resultado;
  };
  const mudarConfiguracao = (chave: string, configuracao: object) =>
    mudar({
      configuracaoDasCapacidades: { ...dados.configuracaoDasCapacidades, [chave]: configuracao },
    });

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const motivos = validar(dados, inicial, campos);
    if (Object.keys(motivos).length > 0) {
      definirErros(motivos);
      definirCapacidadeDoErro(capacidadeRecusada(dados, inicial, campos));
      if (motivos.nome) nome.current?.focus();
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await enviar({
        nome: dados.nome.trim(),
        icone: dados.icone as IconeDeTipo,
        capacidades: dados.capacidades,
        configuracaoDasCapacidades: dados.configuracaoDasCapacidades,
        campos: dados.campos,
        primeiroCartao: dados.primeiroCartao,
      });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        definirErros(resultado.campos);
        definirCapacidadeDoErro(null);
        if (resultado.campos.nome) nome.current?.focus();
        return;
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      <CampoDeTexto
        ref={nome}
        rotulo="Nome"
        obrigatorio={!soLeitura}
        autoComplete="off"
        value={dados.nome}
        onChange={(texto) => mudar({ nome: texto })}
        isReadOnly={soLeitura}
        erro={erros.nome}
      />
      <EscolhaDeIcone
        rotulo="Ícone"
        opcoes={OPCOES_DE_ICONE}
        valor={dados.icone}
        aoMudar={(icone) => mudar({ icone: icone as IconeDeTipo })}
        erro={erros.icone}
        somenteLeitura={soLeitura}
      />
      <GrupoDeCheckboxes
        rotulo="Capacidades"
        value={dados.capacidades}
        onChange={(escolhidas) => {
          const lista = capacidades
            .map((capacidade) => capacidade.chave)
            .filter((chave) => escolhidas.includes(chave));
          // A capacidade desligada leva junto a escolha do primeiro cartão, como a API faria.
          const { primeiroCartao } = dados;
          const esquecido =
            primeiroCartao !== null &&
            primeiroCartao !== VISAO_GERAL_DA_FICHA &&
            !lista.includes(primeiroCartao);
          mudar({
            capacidades: lista,
            configuracaoDasCapacidades: configuracaoPara(lista),
            primeiroCartao: esquecido ? null : primeiroCartao,
          });
        }}
        isReadOnly={soLeitura}
      >
        {capacidades.map((capacidade) => {
          // Sem um campo de IP no tipo, a capacidade que pede um não liga, e diz o porquê.
          const semIp =
            capacidade.configuracao !== null &&
            opcoesDeIp.length === 0 &&
            !dados.capacidades.includes(capacidade.chave);
          return (
            <Checkbox key={capacidade.chave} value={capacidade.chave} isDisabled={semIp}>
              <span className={estilos.capacidade}>
                <span>{capacidade.nome}</span>
                <span className={estilos.descricaoDaCapacidade}>{capacidade.descricao}</span>
                {semIp && !soLeitura && (
                  <span className={estilos.descricaoDaCapacidade}>
                    {SEM_CAMPO_DE_IP[capacidade.chave] ??
                      `Inclua no tipo um campo do tipo IP para ligar ${capacidade.nome}.`}
                  </span>
                )}
              </span>
            </Checkbox>
          );
        })}
      </GrupoDeCheckboxes>
      {erros.capacidades && <p className={estilos.erro}>{erros.capacidades}</p>}
      <PrimeiroCartao
        capacidades={capacidades}
        ligadas={dados.capacidades}
        valor={dados.primeiroCartao}
        soLeitura={soLeitura}
        erro={erros.primeiroCartao}
        aoMudar={(primeiroCartao) => mudar({ primeiroCartao })}
      />

      <section className={estilos.parte} aria-labelledby="campos-do-tipo">
        <h2 id="campos-do-tipo" className={estilos.tituloDaParte}>
          Campos
        </h2>
        {dados.campos.length === 0 ? (
          <p className={estilos.informacao}>Nenhum campo neste tipo.</p>
        ) : (
          <ul aria-label="Campos do tipo" className={estilos.itens}>
            {dados.campos.map((noTipoAgora, indice) => {
              const campo = porId.get(noTipoAgora.campoId);
              const rotulo = campo?.rotulo ?? 'Campo';
              return (
                <li key={noTipoAgora.campoId} className={estilos.item}>
                  <div className={estilos.textoDoItem}>
                    <p className={estilos.nomeDoItem}>
                      {rotulo}
                      {campo?.situacao === 'inativo' && (
                        <RotuloDeSituacao situacao="neutra">Inativo</RotuloDeSituacao>
                      )}
                    </p>
                    {campo && (
                      <p className={estilos.detalheDoItem}>
                        {[ROTULOS_DOS_TIPOS_DE_CAMPO[campo.tipo], campo.grupo]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                  {soLeitura ? (
                    noTipoAgora.obrigatorio && (
                      <span className={estilos.detalheDoItem}>Obrigatório</span>
                    )
                  ) : (
                    <div className={estilos.acoesDoItem}>
                      <Checkbox
                        aria-label={`${rotulo} obrigatório`}
                        isSelected={noTipoAgora.obrigatorio}
                        onChange={(obrigatorio) =>
                          mudarCampos(
                            dados.campos.map((item, i) =>
                              i === indice ? { ...item, obrigatorio } : item,
                            ),
                          )
                        }
                      >
                        Obrigatório
                      </Checkbox>
                      <BotaoDeIcone
                        icone={ArrowUp}
                        rotulo={`Mover ${rotulo} para cima`}
                        isDisabled={indice === 0}
                        onPress={() => mover(indice, -1)}
                      />
                      <BotaoDeIcone
                        icone={ArrowDown}
                        rotulo={`Mover ${rotulo} para baixo`}
                        isDisabled={indice === dados.campos.length - 1}
                        onPress={() => mover(indice, 1)}
                      />
                      <Botao
                        nivel="terciario"
                        aria-label={`Tirar ${rotulo}`}
                        onPress={() => mudarCampos(dados.campos.filter((_, i) => i !== indice))}
                      >
                        Tirar
                      </Botao>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {erros.campos && <p className={estilos.erro}>{erros.campos}</p>}
        {!soLeitura && (
          <>
            <h3 className={estilos.tituloDaParte}>Incluir campos</h3>
            {campos.every((campo) => campo.situacao !== 'ativo') ? (
              <p className={estilos.informacao}>
                A organização ainda não tem campos ativos.{' '}
                <Link to="/gestao/catalogo/campos/novo" className={estilos.link}>
                  Cadastrar um campo
                </Link>
              </p>
            ) : paraIncluir.length === 0 ? (
              <p className={estilos.informacao}>
                Todos os campos ativos da organização já estão neste tipo.
              </p>
            ) : (
              <ul aria-label="Campos para incluir" className={estilos.itens}>
                {paraIncluir.map((campo) => (
                  <li key={campo.id} className={estilos.item}>
                    <div className={estilos.textoDoItem}>
                      <p className={estilos.nomeDoItem}>{campo.rotulo}</p>
                      <p className={estilos.detalheDoItem}>
                        {[ROTULOS_DOS_TIPOS_DE_CAMPO[campo.tipo], campo.grupo]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Botao
                      nivel="terciario"
                      aria-label={`Incluir ${campo.rotulo}`}
                      onPress={() =>
                        mudarCampos([...dados.campos, { campoId: campo.id, obrigatorio: false }])
                      }
                    >
                      Incluir
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {ligadas.map((capacidade) => (
        <section
          key={capacidade.chave}
          className={estilos.parte}
          aria-labelledby={`capacidade-${capacidade.chave}`}
        >
          <h2 id={`capacidade-${capacidade.chave}`} className={estilos.tituloDaParte}>
            {capacidade.nome}
          </h2>
          {capacidade.configuracao === 'campo-de-ip' &&
            (soLeitura ? (
              <p className={estilos.informacao}>
                {`Campo de IP do ping: ${porId.get(campoDoIp(capacidade.chave) ?? '')?.rotulo ?? 'nenhum'}`}
              </p>
            ) : (
              <Selecao
                rotulo="Campo de IP do ping"
                descricao="O ping usa o IP deste campo em cada ativo do tipo."
                obrigatorio
                opcoes={opcoesDeIp}
                selectedKey={campoDoIp(capacidade.chave)}
                onSelectionChange={(chave) =>
                  mudarConfiguracao(capacidade.chave, { campoDoIp: String(chave) })
                }
                erro={erroDa(capacidade.chave)}
              />
            ))}
          {capacidade.configuracao === 'snmp' && (
            <ConfiguracaoDoSnmp
              configuracao={dados.configuracaoDasCapacidades['snmp.suprimentos']}
              opcoesDeIp={opcoesDeIp}
              rotuloDoIp={porId.get(campoDoIp(capacidade.chave) ?? '')?.rotulo ?? null}
              soLeitura={soLeitura}
              erro={erroDa(capacidade.chave)}
              aoMudar={(configuracao) => mudarConfiguracao(capacidade.chave, configuracao)}
            />
          )}
          {capacidade.configuracao === 'control-id' && (
            <ConfiguracaoDoControlId
              configuracao={dados.configuracaoDasCapacidades['controlid.saude']}
              opcoesDeIp={opcoesDeIp}
              rotuloDoIp={porId.get(campoDoIp(capacidade.chave) ?? '')?.rotulo ?? null}
              soLeitura={soLeitura}
              erro={erroDa(capacidade.chave)}
              aoMudar={(configuracao) => mudarConfiguracao(capacidade.chave, configuracao)}
            />
          )}
          {capacidade.configuracao === 'backup-do-control-id' &&
            (soLeitura ? (
              <p className={estilos.informacao}>
                {`Horário do backup: ${dados.configuracaoDasCapacidades['controlid.backup']?.horario ?? HORARIO_PADRAO_DO_BACKUP}`}
              </p>
            ) : (
              <CampoDeTexto
                rotulo="Horário do backup"
                descricao="O backup diário de cada controle do tipo entra na fila neste horário, no fuso de São Paulo. Ele usa o IP, a porta e o login da saúde do Control iD."
                inputMode="numeric"
                autoComplete="off"
                value={
                  dados.configuracaoDasCapacidades['controlid.backup']?.horario ??
                  HORARIO_PADRAO_DO_BACKUP
                }
                onChange={(texto) => mudarConfiguracao(capacidade.chave, { horario: texto.trim() })}
                erro={erroDa(capacidade.chave)}
              />
            ))}
          {capacidade.configuracao === 'acesso-remoto' && (
            <PortaDoVnc
              porta={dados.configuracaoDasCapacidades['acesso.vnc']?.porta ?? PORTA_PADRAO_DO_VNC}
              soLeitura={soLeitura}
              erro={erroDa(capacidade.chave)}
              aoMudar={(porta) => mudarConfiguracao(capacidade.chave, { porta })}
            />
          )}
          {capacidade.campos.length > 0 && (
            <>
              <p className={estilos.informacao}>
                Os campos da capacidade valem para todo ativo deste tipo e não são tirados um a um.
              </p>
              <ul aria-label={`Campos do ${capacidade.nome}`} className={estilos.itens}>
                {capacidade.campos.map((campo) => (
                  <li key={campo.chave} className={estilos.item}>
                    <div className={estilos.textoDoItem}>
                      <p className={estilos.nomeDoItem}>{campo.rotulo}</p>
                      <p className={estilos.detalheDoItem}>{campo.grupo}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}

      {!soLeitura && (
        <>
          <MensagemDoPasso texto={falha} chave={tentativa} />
          <div className={estilos.acoes}>
            <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Enviando">
              {rotuloDoEnvio}
            </Botao>
            {aoCancelar && (
              <Botao nivel="terciario" onPress={aoCancelar}>
                Cancelar
              </Botao>
            )}
          </div>
        </>
      )}
    </Formulario>
  );
}

/** A chave da comunidade padrão na seleção, que vale sem nenhuma do cofre. */
const PUBLIC = 'public';

/**
 * A configuração do SNMP no tipo (design do P2b, decisão 10): o campo de IP, a versão num
 * segmentado e a comunidade numa seleção, com "public (padrão)" e as comunidades ativas do cofre,
 * pelo nome. A escolhida que ficou inativa tem o aviso de que o coletor usa a public; com o Cofre
 * desligado, ela fica, e a escolha de outra espera o módulo. Só para leitura, tudo em texto, sem
 * pedir as comunidades.
 */
function ConfiguracaoDoSnmp({
  configuracao,
  opcoesDeIp,
  rotuloDoIp,
  soLeitura,
  erro,
  aoMudar,
}: {
  configuracao: ConfiguracaoDoSnmp | undefined;
  opcoesDeIp: OpcaoDeSelecao[];
  rotuloDoIp: string | null;
  soLeitura: boolean;
  erro: string | undefined;
  aoMudar: (configuracao: ConfiguracaoDoSnmp) => void;
}) {
  const comunidades = useComunidadesSnmp(!soLeitura);
  const versao = configuracao?.versao ?? '2c';
  const segredoId = configuracao?.segredoId ?? null;
  if (soLeitura) {
    return (
      <>
        <p className={estilos.informacao}>{`Campo de IP do SNMP: ${rotuloDoIp ?? 'nenhum'}`}</p>
        <p className={estilos.informacao}>{`Versão do SNMP: v${versao}`}</p>
        <p className={estilos.informacao}>
          {`Comunidade: ${segredoId === null ? 'public (padrão)' : 'escolhida no cofre'}`}
        </p>
      </>
    );
  }
  const lista = comunidades.data?.comunidades ?? [];
  const motivo = comunidades.data?.motivo ?? null;
  const naLista = lista.some((comunidade) => comunidade.id === segredoId);
  const inativa =
    comunidades.data !== undefined && motivo === null && segredoId !== null && !naLista;
  const opcoes: OpcaoDeSelecao[] = [
    { id: PUBLIC, rotulo: 'public (padrão)' },
    ...lista.map(({ id, nome }) => ({ id, rotulo: nome })),
  ];
  if (segredoId !== null && !naLista) {
    opcoes.push({ id: segredoId, rotulo: inativa ? 'Comunidade inativa' : 'Comunidade do cofre' });
  }
  const mudar = (mudanca: Partial<ConfiguracaoDoSnmp>) =>
    aoMudar({ ...configuracao, versao, segredoId, ...mudanca });
  return (
    <>
      <Selecao
        rotulo="Campo de IP do SNMP"
        descricao="O SNMP lê a impressora no IP deste campo em cada ativo do tipo."
        obrigatorio
        opcoes={opcoesDeIp}
        selectedKey={configuracao?.campoDoIp ?? null}
        onSelectionChange={(chave) => mudar({ campoDoIp: String(chave) })}
        erro={erro}
      />
      <ControleSegmentado
        rotulo="Versão do SNMP"
        value={versao}
        onChange={(valor) => mudar({ versao: valor as VersaoDoSnmp })}
      >
        <Segmento value="1">v1</Segmento>
        <Segmento value="2c">v2c</Segmento>
      </ControleSegmentado>
      <Selecao
        rotulo="Comunidade"
        descricao={
          motivo ??
          comunidades.error?.message ??
          'As comunidades vêm do cofre, pelo nome; sem nenhuma escolhida, vale a public.'
        }
        opcoes={opcoes}
        selectedKey={segredoId ?? PUBLIC}
        isDisabled={motivo !== null}
        onSelectionChange={(chave) => mudar({ segredoId: chave === PUBLIC ? null : String(chave) })}
      />
      {inativa && (
        <p className={estilos.informacao}>
          A comunidade escolhida está inativa: o coletor usa a public.
        </p>
      )}
    </>
  );
}

/** As recusas da configuração que dizem respeito à porta e ao login; as outras são do campo de IP. */
const DA_PORTA = 'Informe uma porta de 1 a 65535.';
const DO_LOGIN = /^(Escolha o login|Escolha um login|Com o módulo Cofre desligado)/;

/** A opção da seleção do login para o tipo sem login (change login-de-cada-controle). */
const SEM_LOGIN = 'nenhum';

/**
 * A configuração da sondagem do Control iD no tipo (design do P2c, decisão 8): o campo de IP, a porta
 * num campo numérico, com a 80 já escolhida, e o login numa seleção com os nomes do cofre, que começa
 * em "Nenhum": sem login no tipo, só os controles com login próprio são sondados (change
 * login-de-cada-controle, decisão 1). O login escolhido que ficou inativo tem o aviso de que os
 * controles sem login próprio não são sondados; com o Cofre desligado, ele fica, e a escolha de
 * outro espera o módulo. A recusa aparece no controle a que ela diz respeito. Só para leitura, tudo
 * em texto, sem pedir os logins.
 */
function ConfiguracaoDoControlId({
  configuracao,
  opcoesDeIp,
  rotuloDoIp,
  soLeitura,
  erro,
  aoMudar,
}: {
  configuracao: ConfiguracaoDoControlId | undefined;
  opcoesDeIp: OpcaoDeSelecao[];
  rotuloDoIp: string | null;
  soLeitura: boolean;
  erro: string | undefined;
  aoMudar: (configuracao: ConfiguracaoDoControlId) => void;
}) {
  const logins = useLoginsDoControlId(!soLeitura);
  const porta = configuracao?.porta ?? PORTA_PADRAO;
  const [portaDigitada, definirPortaDigitada] = useState(String(porta));
  const segredoId = configuracao?.segredoId ?? null;
  if (soLeitura) {
    return (
      <>
        <p className={estilos.informacao}>{`Campo de IP da sondagem: ${rotuloDoIp ?? 'nenhum'}`}</p>
        <p className={estilos.informacao}>{`Porta: ${porta}`}</p>
        <p className={estilos.informacao}>
          {`Login: ${segredoId === null ? 'nenhum' : 'escolhido no cofre'}`}
        </p>
      </>
    );
  }
  const lista = logins.data?.logins ?? [];
  const motivo = logins.data?.motivo ?? null;
  const naLista = lista.some((login) => login.id === segredoId);
  const inativo = logins.data !== undefined && motivo === null && segredoId !== null && !naLista;
  const opcoes: OpcaoDeSelecao[] = [
    { id: SEM_LOGIN, rotulo: 'Nenhum' },
    ...lista.map(({ id, nome }) => ({ id, rotulo: nome })),
  ];
  if (segredoId !== null && !naLista) {
    opcoes.push({ id: segredoId, rotulo: inativo ? 'Login inativo' : 'Login do cofre' });
  }
  const mudar = (mudanca: Partial<ConfiguracaoDoControlId>) =>
    aoMudar({ ...configuracao, porta, segredoId, ...mudanca });
  const erroDaPorta = erro === DA_PORTA ? erro : undefined;
  const erroDoLogin = erro && DO_LOGIN.test(erro) ? erro : undefined;
  const erroDoIp = erro && !erroDaPorta && !erroDoLogin ? erro : undefined;
  return (
    <>
      <Selecao
        rotulo="Campo de IP da sondagem"
        descricao="A sondagem entra em cada controle do tipo pelo IP deste campo."
        obrigatorio
        opcoes={opcoesDeIp}
        selectedKey={configuracao?.campoDoIp ?? null}
        onSelectionChange={(chave) => mudar({ campoDoIp: String(chave) })}
        erro={erroDoIp}
      />
      <CampoDeTexto
        rotulo="Porta"
        descricao="A porta HTTP dos controles; a 80 é a padrão."
        inputMode="numeric"
        autoComplete="off"
        value={portaDigitada}
        onChange={(texto) => {
          definirPortaDigitada(texto);
          const lida = texto.trim();
          mudar({ porta: /^\d+$/.test(lida) ? Number(lida) : Number.NaN });
        }}
        erro={erroDaPorta}
      />
      <Selecao
        rotulo="Login"
        descricao={
          motivo ??
          logins.error?.message ??
          'Os logins vêm do cofre, pelo nome. Sem nenhum, só os controles com login próprio, escolhido na ficha deles, são sondados.'
        }
        opcoes={opcoes}
        placeholder={logins.isPending ? 'Carregando os logins' : 'Selecione'}
        selectedKey={segredoId ?? SEM_LOGIN}
        isDisabled={motivo !== null}
        onSelectionChange={(chave) =>
          mudar({ segredoId: chave === SEM_LOGIN ? null : String(chave) })
        }
        erro={erroDoLogin}
      />
      {inativo && (
        <p className={estilos.informacao}>
          O login escolhido está inativo: os controles sem login próprio não são sondados.
        </p>
      )}
    </>
  );
}

/**
 * A porta do acesso remoto (change acesso-remoto-vnc): num campo numérico, com a 5900 já escolhida;
 * o IP é o da disponibilidade na rede. Só para leitura, em texto.
 */
function PortaDoVnc({
  porta,
  soLeitura,
  erro,
  aoMudar,
}: {
  porta: number;
  soLeitura: boolean;
  erro: string | undefined;
  aoMudar: (porta: number) => void;
}) {
  const [digitada, definirDigitada] = useState(String(porta));
  if (soLeitura) return <p className={estilos.informacao}>{`Porta do VNC: ${porta}`}</p>;
  return (
    <CampoDeTexto
      rotulo="Porta do VNC"
      descricao="O acesso remoto entra em cada máquina do tipo pelo IP da disponibilidade na rede, nesta porta; a 5900 é a padrão."
      inputMode="numeric"
      autoComplete="off"
      value={digitada}
      onChange={(texto) => {
        definirDigitada(texto);
        const lida = texto.trim();
        aoMudar(/^\d+$/.test(lida) ? Number(lida) : Number.NaN);
      }}
      erro={erro}
    />
  );
}

/** A opção do automático na seleção do primeiro cartão. */
const AUTOMATICO = 'automatico';

/**
 * O primeiro cartão da ficha no tipo (change primeiro-cartao-da-ficha, design, decisão 5): o
 * automático, com o nome do cartão que ele abre, a Visão geral e as capacidades ligadas que têm
 * cartão, na ordem da lista das capacidades. Só para leitura, a escolha em texto.
 */
function PrimeiroCartao({
  capacidades,
  ligadas,
  valor,
  soLeitura,
  erro,
  aoMudar,
}: {
  capacidades: readonly Capacidade[];
  ligadas: readonly string[];
  valor: string | null;
  soLeitura: boolean;
  erro: string | undefined;
  aoMudar: (primeiroCartao: string | null) => void;
}) {
  const nomeDo = (chave: string) =>
    chave === VISAO_GERAL_DA_FICHA
      ? 'Visão geral'
      : (capacidades.find((capacidade) => capacidade.chave === chave)?.nome ?? chave);
  const opcoes: OpcaoDeSelecao[] = [
    { id: AUTOMATICO, rotulo: `Automático: ${nomeDo(primeiroCartaoAutomatico(ligadas))}` },
    { id: VISAO_GERAL_DA_FICHA, rotulo: 'Visão geral' },
    ...capacidades
      .filter(({ chave }) => ligadas.includes(chave) && CAPACIDADES_COM_CARTAO.includes(chave))
      .map(({ chave, nome }) => ({ id: chave, rotulo: nome })),
  ];
  const escolhida = valor ?? AUTOMATICO;
  if (soLeitura) {
    const rotulo = opcoes.find((opcao) => opcao.id === escolhida)?.rotulo ?? nomeDo(escolhida);
    return <p className={estilos.informacao}>{`Primeiro cartão da ficha: ${rotulo}`}</p>;
  }
  return (
    <Selecao
      rotulo="Primeiro cartão da ficha"
      descricao="O cartão em que a ficha dos ativos deste tipo abre."
      opcoes={opcoes}
      selectedKey={escolhida}
      onSelectionChange={(chave) => aoMudar(chave === AUTOMATICO ? null : String(chave))}
      erro={erro}
    />
  );
}

/** Os dados de um tipo da API no formulário. */
export function dadosDoTipo(tipo: {
  nome: string;
  icone: IconeDeTipo;
  capacidades: string[];
  configuracaoDasCapacidades: ConfiguracaoDasCapacidades;
  campos: CampoNoTipo[];
  primeiroCartao?: string | null;
}): DadosDoTipo {
  return {
    nome: tipo.nome,
    icone: tipo.icone,
    capacidades: tipo.capacidades,
    configuracaoDasCapacidades: tipo.configuracaoDasCapacidades,
    campos: tipo.campos,
    primeiroCartao: tipo.primeiroCartao ?? null,
  };
}
