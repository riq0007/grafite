// O formulário da regra de alerta (spec alertas, "Regras de alerta", e modulo-alertas, "Regras na
// tela"): o nome, a condição e os campos dela, a duração, a severidade, o escopo, com o registro
// escolhido, e as exceções (change regras-indicadores-e-tarefas, design, decisão 1). A conferência é
// a do domínio, a mesma da API, e a recusa dela fica no campo ou na exceção; a condição de uma regra
// que existe não muda.
import {
  type CampoDaRegra,
  CONDICOES_DA_IMPRESSORA,
  CONDICOES_DE_ALERTA,
  type CondicaoDeAlerta,
  conferirRegra,
  type DadosDaRegra,
  type EfeitoDaExcecao,
  type ExcecaoDaRegra,
  type LugarDaExcecao,
  ROTULOS_DAS_SEVERIDADES,
  ROTULOS_DAS_SITUACOES_DO_CONTROL_ID,
  ROTULOS_DOS_EFEITOS,
  SEVERIDADES_DO_ALERTA,
  type SeveridadeDoAlerta,
  SITUACOES_DO_CONTROL_ID_EM_ALERTA,
  type TipoDeEscopo,
} from '@grafite/domain';
import {
  Botao,
  CampoDeTexto,
  Carimbo,
  Checkbox,
  Formulario,
  GrupoDeCheckboxes,
  LinhaDeCampos,
  MensagemDoPasso,
  Selecao,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useCallback, useState } from 'react';
import { consultar } from '../../api/consultas.ts';
import { useApi } from '../../api/useApi.tsx';
import type { RecusaDoFormulario } from '../administracao/recusa.ts';
import { SeletorDeConta } from '../administracao/seletores/SeletorDeConta.tsx';
import { SeletorDeLocal } from '../administracao/seletores/SeletorDeLocal.tsx';
import estilos from './Alertas.module.css';
import {
  entradaDa,
  excecaoNova,
  OPCOES_DO_ESCOPO,
  OPCOES_DO_LUGAR,
  parametrosIniciais,
  type RascunhoDaExcecao,
  type RascunhoDaRegra,
} from './regrasNaTela.ts';

/** A regra como a API a recebe. */
export interface PedidoDaRegra {
  nome: string;
  condicao: CondicaoDeAlerta;
  parametros: DadosDaRegra['parametros'];
  duracao: number;
  severidade: SeveridadeDoAlerta;
  escopo: { tipo: TipoDeEscopo; id: string | null };
  excecoes: ExcecaoDaRegra[];
}

type Registro = { id: string; rotulo: string } | null;
type Busca = (
  texto: string,
  sinal: AbortSignal,
) => Promise<{ itens: { id: string; rotulo: string }[]; total: number }>;

/** O registro de um tipo, de um modelo, de um ativo ou de um local: o do escopo e o da exceção. */
function EscolhaDoRegistro({
  tipo,
  registro,
  aoMudar,
  erro,
  tipos,
  buscarModelos,
  buscarAtivos,
}: {
  tipo: LugarDaExcecao['tipo'];
  registro: Registro;
  aoMudar: (registro: Registro) => void;
  erro?: string | undefined;
  tipos: readonly { id: string; nome: string; situacao: string }[];
  buscarModelos: Busca;
  buscarAtivos: Busca;
}) {
  switch (tipo) {
    case 'tipo':
      return (
        <Selecao
          rotulo="Tipo"
          placeholder="Escolha o tipo"
          opcoes={tipos
            .filter((um) => um.situacao === 'ativo')
            .map(({ id, nome }) => ({ id, rotulo: nome }))}
          selectedKey={registro?.id ?? null}
          onSelectionChange={(chave) => {
            const escolhido = tipos.find((um) => um.id === chave);
            aoMudar(escolhido ? { id: escolhido.id, rotulo: escolhido.nome } : null);
          }}
          erro={erro}
        />
      );
    case 'modelo':
      return (
        <SeletorDeConta
          rotulo="Modelo"
          valor={registro}
          aoMudar={aoMudar}
          buscar={buscarModelos}
          erro={erro}
        />
      );
    case 'ativo':
      return (
        <SeletorDeConta
          rotulo="Ativo"
          valor={registro}
          aoMudar={aoMudar}
          buscar={buscarAtivos}
          erro={erro}
        />
      );
    case 'local':
      return (
        <SeletorDeLocal
          rotulo="Local"
          valor={registro?.id ?? null}
          aoMudar={(id) => aoMudar(id ? { id, rotulo: '' } : null)}
          erro={erro}
        />
      );
  }
}

/** Os efeitos que a condição aceita: o "Outro limite" só na regra do toner. */
const opcoesDoEfeito = (condicao: CondicaoDeAlerta | null) =>
  (condicao === 'toner.nivel'
    ? (['nao-alertar', 'outro-limite'] as const)
    : (['nao-alertar'] as const)
  ).map((id) => ({ id, rotulo: ROTULOS_DOS_EFEITOS[id] }));

export interface PropsDoFormularioDaRegra {
  inicial: RascunhoDaRegra;
  /** A condição da regra que existe, que não muda; nenhuma na regra nova. */
  condicaoAtual?: CondicaoDeAlerta;
  enviar: (pedido: PedidoDaRegra) => Promise<{ ok: true } | RecusaDoFormulario<CampoDaRegra>>;
  aoCancelar?: () => void;
}

const OPCOES_DA_CONDICAO = CONDICOES_DE_ALERTA.map(({ chave, rotulo }) => ({ id: chave, rotulo }));
const OPCOES_DA_SEVERIDADE = SEVERIDADES_DO_ALERTA.map((id) => ({
  id,
  rotulo: ROTULOS_DAS_SEVERIDADES[id],
}));

/** A ordem dos campos para o foco ir ao primeiro recusado. */
const ORDEM_DOS_CAMPOS: CampoDaRegra[] = [
  'nome',
  'condicao',
  'limite',
  'folga',
  'condicoes',
  'situacoes',
  'ciclos',
  'minutos',
  'duracao',
  'severidade',
  'escopo',
];

/** Os tipos de ativo ativos, para o escopo de um tipo. */
function useTiposDeAtivo() {
  const api = useApi();
  return useQuery({
    queryKey: ['tipos-de-ativo'],
    queryFn: () => consultar(() => api.GET('/tipos-de-ativo'), 'carregar os tipos de ativo'),
  });
}

export function FormularioDaRegra({
  inicial,
  condicaoAtual,
  enviar,
  aoCancelar,
}: PropsDoFormularioDaRegra) {
  const api = useApi();
  const tipos = useTiposDeAtivo();
  const [rascunho, definirRascunho] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDaRegra, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const definicao = rascunho.condicao
    ? CONDICOES_DE_ALERTA.find((condicao) => condicao.chave === rascunho.condicao)
    : undefined;

  const mudar = (mudanca: Partial<RascunhoDaRegra>, ...campos: CampoDaRegra[]) => {
    definirRascunho((atual) => ({ ...atual, ...mudanca }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const campo of campos) delete restantes[campo];
      return restantes;
    });
  };

  /** Muda uma exceção e tira a recusa dela e a da lista. */
  const mudarExcecao = (posicao: number, mudanca: Partial<RascunhoDaExcecao>) => {
    definirRascunho((atual) => ({
      ...atual,
      excecoes: atual.excecoes.map((excecao, indice) =>
        indice === posicao ? { ...excecao, ...mudanca } : excecao,
      ),
    }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      delete restantes[`excecoes.${posicao}`];
      delete restantes.excecoes;
      return restantes;
    });
  };

  /** Tira uma exceção; as recusas das outras mudam de posição e saem também. */
  const tirarExcecao = (posicao: number) => {
    definirRascunho((atual) => ({
      ...atual,
      excecoes: atual.excecoes.filter((_, indice) => indice !== posicao),
    }));
    definirErros((atuais) =>
      Object.fromEntries(Object.entries(atuais).filter(([campo]) => !campo.startsWith('excecoes'))),
    );
  };

  const recusar = (motivos: Partial<Record<CampoDaRegra, string>>) => {
    definirErros(motivos);
    const primeiro = ORDEM_DOS_CAMPOS.find((campo) => motivos[campo]);
    if (primeiro) document.querySelector<HTMLElement>(`[data-campo="${primeiro}"] input`)?.focus();
  };

  const buscarAtivos = useCallback(
    async (texto: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/ativos', {
        params: { query: { busca: texto, limite: 8 } },
        signal: sinal,
      });
      if (!data) throw new Error(error ? 'Não foi possível buscar os ativos.' : 'Sem conexão.');
      return {
        itens: data.itens.map((ativo) => ({
          id: ativo.id,
          rotulo: ativo.patrimonio ? `${ativo.rotulo} · ${ativo.patrimonio}` : ativo.rotulo,
        })),
        total: data.total,
      };
    },
    [api],
  );
  const buscarModelos = useCallback(
    async (texto: string, sinal: AbortSignal) => {
      const { data, error } = await api.GET('/modelos', {
        params: { query: { busca: texto, limite: 8 } },
        signal: sinal,
      });
      if (!data) throw new Error(error ? 'Não foi possível buscar os modelos.' : 'Sem conexão.');
      return {
        itens: data.itens.map((modelo) => ({
          id: modelo.id,
          rotulo: `${modelo.fabricante} ${modelo.nome}`,
        })),
        total: data.total,
      };
    },
    [api],
  );

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const conferida = conferirRegra(entradaDa(rascunho), { condicaoAtual });
    if (!conferida.ok) return recusar(conferida.erros);
    definirEnviando(true);
    try {
      const { dados } = conferida;
      const resultado = await enviar({
        nome: dados.nome,
        condicao: dados.condicao,
        parametros: dados.parametros,
        duracao: dados.duracao,
        severidade: dados.severidade,
        escopo: { tipo: dados.escopo.tipo, id: dados.escopo.id },
        excecoes: dados.excecoes ?? [],
      });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        return recusar(resultado.campos);
      }
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
    } finally {
      definirEnviando(false);
    }
  }

  const campoDeNumero = (
    campo: 'limite' | 'folga' | 'ciclos' | 'minutos' | 'duracao',
    rotulo: string,
    descricao?: string,
  ) => (
    <div data-campo={campo}>
      <CampoDeTexto
        rotulo={rotulo}
        descricao={descricao}
        inputMode="numeric"
        autoComplete="off"
        value={rascunho[campo]}
        onChange={(valor) => mudar({ [campo]: valor }, campo)}
        erro={erros[campo]}
      />
    </div>
  );

  return (
    <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
      <div data-campo="nome">
        <CampoDeTexto
          rotulo="Nome"
          obrigatorio
          autoComplete="off"
          value={rascunho.nome}
          onChange={(nome) => mudar({ nome }, 'nome')}
          erro={erros.nome}
        />
      </div>
      <div data-campo="condicao">
        <Selecao
          rotulo="Condição"
          obrigatorio
          placeholder="Escolha a condição"
          opcoes={OPCOES_DA_CONDICAO}
          selectedKey={rascunho.condicao}
          isDisabled={condicaoAtual !== undefined}
          descricao={
            condicaoAtual !== undefined
              ? 'A condição de uma regra não muda: para outra condição, cadastre outra regra.'
              : undefined
          }
          onSelectionChange={(chave) => {
            const condicao = String(chave) as CondicaoDeAlerta;
            mudar({ condicao, ...parametrosIniciais(condicao) }, 'condicao');
          }}
          erro={erros.condicao}
        />
      </div>
      {rascunho.condicao === 'toner.nivel' && (
        <LinhaDeCampos>
          {campoDeNumero(
            'limite',
            'Limite (%)',
            'O alerta abre com o toner neste nível ou abaixo.',
          )}
          {campoDeNumero(
            'folga',
            'Folga (pontos)',
            'O alerta só se resolve acima do limite mais a folga.',
          )}
        </LinhaDeCampos>
      )}
      {rascunho.condicao === 'impressora.condicao' && (
        <div data-campo="condicoes">
          <GrupoDeCheckboxes
            rotulo="Condições"
            value={rascunho.condicoes}
            onChange={(condicoes) => mudar({ condicoes }, 'condicoes')}
            erro={erros.condicoes}
          >
            {CONDICOES_DA_IMPRESSORA.map(({ chave, rotulo }) => (
              <Checkbox key={chave} value={chave}>
                {rotulo}
              </Checkbox>
            ))}
          </GrupoDeCheckboxes>
        </div>
      )}
      {rascunho.condicao === 'controlid.situacao' && (
        <div data-campo="situacoes">
          <GrupoDeCheckboxes
            rotulo="Situações"
            value={rascunho.situacoes}
            onChange={(situacoes) => mudar({ situacoes }, 'situacoes')}
            erro={erros.situacoes}
          >
            {SITUACOES_DO_CONTROL_ID_EM_ALERTA.map((situacao) => (
              <Checkbox key={situacao} value={situacao}>
                {ROTULOS_DAS_SITUACOES_DO_CONTROL_ID[situacao]}
              </Checkbox>
            ))}
          </GrupoDeCheckboxes>
        </div>
      )}
      {rascunho.condicao === 'coleta.atrasada' &&
        campoDeNumero('ciclos', 'Ciclos', 'Quantos intervalos da coleta sem a leitura chegar.')}
      {rascunho.condicao === 'coletor.sem-contato' &&
        campoDeNumero('minutos', 'Minutos', 'Quanto tempo o coletor fica sem falar com a API.')}
      {definicao?.comDuracao &&
        campoDeNumero(
          'duracao',
          'Duração (minutos)',
          'Quanto tempo a condição dura até o alerta abrir; 0 abre na hora.',
        )}
      <div data-campo="severidade">
        <Selecao
          rotulo="Severidade"
          obrigatorio
          opcoes={OPCOES_DA_SEVERIDADE}
          selectedKey={rascunho.severidade}
          onSelectionChange={(chave) =>
            mudar({ severidade: String(chave) as SeveridadeDoAlerta }, 'severidade')
          }
          erro={erros.severidade}
        />
      </div>
      {definicao?.alvo !== 'coletor' && (
        <div data-campo="escopo" className={estilos.escopo}>
          <Selecao
            rotulo="Escopo"
            opcoes={OPCOES_DO_ESCOPO}
            selectedKey={rascunho.escopo}
            onSelectionChange={(chave) =>
              mudar({ escopo: String(chave) as TipoDeEscopo, registro: null }, 'escopo')
            }
            erro={rascunho.escopo === 'organizacao' ? erros.escopo : undefined}
          />
          {rascunho.escopo !== 'organizacao' && (
            <EscolhaDoRegistro
              tipo={rascunho.escopo}
              registro={rascunho.registro}
              aoMudar={(registro) => mudar({ registro }, 'escopo')}
              erro={erros.escopo}
              tipos={tipos.data?.tipos ?? []}
              buscarModelos={buscarModelos}
              buscarAtivos={buscarAtivos}
            />
          )}
        </div>
      )}
      {definicao && definicao.alvo !== 'coletor' && (
        <section className={estilos.excecoes} aria-labelledby="excecoes-da-regra">
          <Carimbo nivel={3} id="excecoes-da-regra">
            Exceções
          </Carimbo>
          <p className={estilos.informacao}>
            {rascunho.condicao === 'toner.nivel'
              ? 'Num tipo, num modelo, num ativo ou num local, a regra pode não alertar ou usar outro limite. A exceção mais específica vence: a do ativo, a do modelo, a do tipo e a do local.'
              : 'Num tipo, num modelo, num ativo ou num local, a regra pode não alertar. A exceção mais específica vence: a do ativo, a do modelo, a do tipo e a do local.'}
          </p>
          {erros.excecoes && <p className={estilos.erroDaExcecao}>{erros.excecoes}</p>}
          {rascunho.excecoes.map((excecao, posicao) => {
            const erro = erros[`excecoes.${posicao}`];
            return (
              <fieldset key={excecao.chave} className={estilos.excecao}>
                <legend className={estilos.legendaDaExcecao}>Exceção {posicao + 1}</legend>
                <LinhaDeCampos>
                  <Selecao
                    rotulo="Onde vale"
                    placeholder="Escolha onde"
                    opcoes={OPCOES_DO_LUGAR}
                    selectedKey={excecao.lugar}
                    onSelectionChange={(chave) =>
                      mudarExcecao(posicao, {
                        lugar: String(chave) as LugarDaExcecao['tipo'],
                        registro: null,
                      })
                    }
                  />
                  {excecao.lugar && (
                    <EscolhaDoRegistro
                      tipo={excecao.lugar}
                      registro={excecao.registro}
                      aoMudar={(registro) => mudarExcecao(posicao, { registro })}
                      tipos={tipos.data?.tipos ?? []}
                      buscarModelos={buscarModelos}
                      buscarAtivos={buscarAtivos}
                    />
                  )}
                  <Selecao
                    rotulo="Efeito"
                    opcoes={opcoesDoEfeito(rascunho.condicao)}
                    selectedKey={excecao.efeito}
                    onSelectionChange={(chave) =>
                      mudarExcecao(posicao, { efeito: String(chave) as EfeitoDaExcecao })
                    }
                  />
                </LinhaDeCampos>
                {excecao.efeito === 'outro-limite' && (
                  <LinhaDeCampos>
                    <CampoDeTexto
                      rotulo="Limite (%)"
                      inputMode="numeric"
                      autoComplete="off"
                      value={excecao.limite}
                      onChange={(limite) => mudarExcecao(posicao, { limite })}
                    />
                    <CampoDeTexto
                      rotulo="Folga (pontos)"
                      inputMode="numeric"
                      autoComplete="off"
                      value={excecao.folga}
                      onChange={(folga) => mudarExcecao(posicao, { folga })}
                    />
                  </LinhaDeCampos>
                )}
                {erro && <p className={estilos.erroDaExcecao}>{erro}</p>}
                <div className={estilos.acoes}>
                  <Botao nivel="terciario" onPress={() => tirarExcecao(posicao)}>
                    Tirar
                  </Botao>
                </div>
              </fieldset>
            );
          })}
          <div className={estilos.acoes}>
            <Botao
              icone={Plus}
              onPress={() =>
                definirRascunho((atual) => ({
                  ...atual,
                  excecoes: [...atual.excecoes, excecaoNova(atual.limite, atual.folga)],
                }))
              }
            >
              Incluir exceção
            </Botao>
          </div>
        </section>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
      <div className={estilos.acoes}>
        <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Salvando">
          Salvar
        </Botao>
        {aoCancelar && (
          <Botao nivel="terciario" onPress={aoCancelar}>
            Cancelar
          </Botao>
        )}
      </div>
    </Formulario>
  );
}
