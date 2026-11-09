import {
  conferirConfiguracao,
  lerValor,
  type PoliticaDeEscrita,
  ROTULOS_DOS_TIPOS_DE_CAMPO,
  TIPOS_DE_CAMPO,
  type TipoDeCampo,
} from '@grafite/domain';
import {
  Botao,
  BuscaComSugestoes,
  CampoDeTexto,
  Checkbox,
  EditorDeOpcoes,
  Formulario,
  GrupoDeCheckboxes,
  GrupoDeRadios,
  MensagemDoPasso,
  type OpcaoEditavel,
  Radio,
  Selecao,
} from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import type { RecusaDoFormulario } from '../../administracao/recusa.ts';
import estilos from '../Ativos.module.css';
import { type CampoDaOrganizacao, useTipos } from '../consultas.ts';

/** O campo no formulário: os números da configuração como o texto digitado. */
export interface DadosDoCampo {
  rotulo: string;
  tipo: TipoDeCampo | null;
  grupo: string;
  minimo: string;
  maximo: string;
  casas: string;
  opcoes: OpcaoEditavel[];
  /** No campo de ativo, os ids dos tipos aceitos; sem nenhum, qualquer tipo. */
  tipos: string[];
  /** No campo de ativo, o nome do lado de lá, como o texto digitado. */
  ladoDeLa: string;
  restrito: boolean;
  escrita: PoliticaDeEscrita;
}

/** O que vai para a API; quem edita o campo não manda o tipo, que não muda. */
export interface PedidoDoCampo {
  rotulo: string;
  tipo: TipoDeCampo;
  grupo: string | null;
  configuracao: Record<string, unknown>;
  restrito: boolean;
  escrita: PoliticaDeEscrita;
}

export const CAMPO_VAZIO: DadosDoCampo = {
  rotulo: '',
  tipo: null,
  grupo: '',
  minimo: '',
  maximo: '',
  casas: '2',
  opcoes: [],
  tipos: [],
  ladoDeLa: '',
  restrito: false,
  escrita: 'automatica',
};

const TIPOS_NA_ESCOLHA = TIPOS_DE_CAMPO.map((tipo) => ({
  id: tipo,
  rotulo: ROTULOS_DOS_TIPOS_DE_CAMPO[tipo],
}));

const CASAS = ['0', '1', '2', '3', '4', '5', '6'].map((casas) => ({
  id: casas,
  rotulo: casas === '1' ? '1 casa' : `${casas} casas`,
}));

const comNumeros = (tipo: TipoDeCampo | null) => tipo === 'inteiro' || tipo === 'decimal';
const comOpcoes = (tipo: TipoDeCampo | null) => tipo === 'lista' || tipo === 'lista-multipla';

/**
 * As regras do formulário, com as do domínio para a configuração: a mesma conferência da API, para
 * a recusa aparecer antes do envio e com a mesma mensagem.
 */
function conferir(dados: DadosDoCampo): {
  erros: Record<string, string>;
  configuracao: Record<string, unknown>;
} {
  const erros: Record<string, string> = {};
  if (dados.rotulo.trim() === '') erros.rotulo = 'Informe o rótulo do campo.';
  else if (dados.rotulo.trim().length > 60) erros.rotulo = 'Use até 60 caracteres.';
  if (dados.tipo === null) erros.tipo = 'Escolha o tipo do campo.';
  if (dados.grupo.trim().length > 40) erros.grupo = 'Use até 40 caracteres.';
  const configuracao: Record<string, unknown> = {};
  const tipo = dados.tipo;
  if (tipo === 'inteiro' || tipo === 'decimal') {
    if (tipo === 'decimal') configuracao.casas = Number(dados.casas);
    for (const chave of ['minimo', 'maximo'] as const) {
      const lido = lerValor({ tipo, configuracao: { casas: Number(dados.casas) } }, dados[chave]);
      if (!lido.ok) erros[chave] = lido.erro;
      else if (lido.valor !== null) configuracao[chave] = lido.valor;
    }
  }
  if (tipo === 'lista' || tipo === 'lista-multipla') {
    configuracao.opcoes = dados.opcoes.map(({ id, rotulo, situacao }) => ({
      ...(id ? { id } : {}),
      rotulo: rotulo.trim(),
      situacao,
    }));
  }
  if (tipo === 'ativo') {
    if (dados.tipos.length > 0) configuracao.tipos = dados.tipos;
    if (dados.ladoDeLa.trim() !== '') configuracao.ladoDeLa = dados.ladoDeLa.trim();
  }
  if (
    tipo !== null &&
    Object.keys(erros).every((chave) => chave === 'rotulo' || chave === 'grupo')
  ) {
    const conferida = conferirConfiguracao(tipo, configuracao, () => 'nova');
    if (!conferida.ok) Object.assign(erros, conferida.erros);
  }
  return { erros, configuracao };
}

export interface PropsDoFormularioDoCampo {
  inicial: DadosDoCampo;
  /** Os grupos já usados, para a sugestão. */
  grupos: readonly string[];
  /** O tipo de campo só se escolhe no cadastro. */
  tipoFixo?: boolean;
  soLeitura?: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoCampo) => Promise<{ ok: true } | RecusaDoFormulario>;
  aoCancelar?: () => void;
}

/**
 * Os tipos aceitos de um campo de ativo (spec campos-personalizados): os tipos ativos, na ordem do
 * catálogo, e os inativos que já estavam marcados, para poderem sair.
 */
function TiposAceitos({
  valores,
  aoMudar,
  soLeitura,
  erro,
}: {
  valores: string[];
  aoMudar: (tipos: string[]) => void;
  soLeitura: boolean;
  erro?: string;
}) {
  const tipos = useTipos();
  const oferecidos = (tipos.data?.tipos ?? []).filter(
    (tipo) => tipo.situacao === 'ativo' || valores.includes(tipo.id),
  );
  return (
    <GrupoDeCheckboxes
      rotulo="Tipos aceitos"
      descricao="Sem nenhum marcado, o campo aceita ativos de qualquer tipo."
      value={valores}
      onChange={(marcados) =>
        aoMudar(oferecidos.map((tipo) => tipo.id).filter((id) => marcados.includes(id)))
      }
      isReadOnly={soLeitura}
      erro={erro}
    >
      {tipos.isPending && (
        <p role="status" className={estilos.contagem}>
          Carregando os tipos…
        </p>
      )}
      {tipos.isError && <p className={estilos.erro}>{tipos.error.message}</p>}
      {oferecidos.map((tipo) => (
        <Checkbox key={tipo.id} value={tipo.id}>
          {tipo.situacao === 'ativo' ? tipo.nome : `${tipo.nome} (inativo)`}
        </Checkbox>
      ))}
    </GrupoDeCheckboxes>
  );
}

/**
 * O formulário do campo da organização (spec catalogo-de-ativos e campos-personalizados): o
 * rótulo, o tipo de campo, só no cadastro, o grupo com as sugestões, a configuração conforme o tipo
 * (no campo de ativo, os tipos aceitos e o nome do lado de lá), a marca de restrito e a política de
 * escrita.
 */
export function FormularioDoCampo({
  inicial,
  grupos,
  tipoFixo = false,
  soLeitura = false,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
}: PropsDoFormularioDoCampo) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const rotulo = useRef<HTMLInputElement>(null);

  const mudar = (mudanca: Partial<DadosDoCampo>) => {
    definirDados((atuais) => ({ ...atuais, ...mudanca }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const chave of Object.keys(mudanca)) {
        delete restantes[chave];
        if (chave === 'opcoes') {
          for (const erro of Object.keys(restantes)) {
            if (erro.startsWith('opcoes.')) delete restantes[erro];
          }
        }
      }
      if ('minimo' in mudanca || 'maximo' in mudanca || 'casas' in mudanca) {
        delete restantes.minimo;
        delete restantes.maximo;
      }
      return restantes;
    });
  };

  const errosDasOpcoes = Object.fromEntries(
    Object.entries(erros)
      .filter(([chave]) => /^opcoes\.\d+$/.test(chave))
      .map(([chave, motivo]) => [Number(chave.slice('opcoes.'.length)), motivo]),
  );

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const { erros: motivos, configuracao } = conferir(dados);
    if (Object.keys(motivos).length > 0) {
      definirErros(motivos);
      if (motivos.rotulo) rotulo.current?.focus();
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await enviar({
        rotulo: dados.rotulo.trim(),
        tipo: dados.tipo as TipoDeCampo,
        grupo: dados.grupo.trim() === '' ? null : dados.grupo.trim(),
        configuracao,
        restrito: dados.restrito,
        escrita: dados.escrita,
      });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        // A API diz `configuracao.minimo`; o formulário, só `minimo`.
        definirErros(
          Object.fromEntries(
            Object.entries(resultado.campos).map(([chave, motivo]) => [
              chave.replace(/^configuracao\./, ''),
              motivo ?? '',
            ]),
          ),
        );
        if (resultado.campos.rotulo) rotulo.current?.focus();
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
        ref={rotulo}
        rotulo="Rótulo"
        obrigatorio={!soLeitura}
        autoComplete="off"
        value={dados.rotulo}
        onChange={(texto) => mudar({ rotulo: texto })}
        isReadOnly={soLeitura}
        erro={erros.rotulo}
      />
      {tipoFixo || soLeitura ? (
        <p className={estilos.informacao}>
          {`Tipo do campo: ${dados.tipo ? ROTULOS_DOS_TIPOS_DE_CAMPO[dados.tipo] : ''}`}
        </p>
      ) : (
        <Selecao
          rotulo="Tipo do campo"
          obrigatorio
          opcoes={TIPOS_NA_ESCOLHA}
          selectedKey={dados.tipo}
          onSelectionChange={(chave) => mudar({ tipo: chave as TipoDeCampo })}
          erro={erros.tipo}
        />
      )}
      <BuscaComSugestoes
        rotulo="Grupo"
        descricao="Reúne os campos nos formulários, como Rede ou Hardware."
        sugestoes={grupos.map((grupo) => ({ id: grupo, rotulo: grupo }))}
        inputValue={dados.grupo}
        onInputChange={(texto) => mudar({ grupo: texto })}
        isReadOnly={soLeitura}
        erro={erros.grupo}
      />
      {comNumeros(dados.tipo) && (
        <>
          {dados.tipo === 'decimal' && (
            <Selecao
              rotulo="Casas decimais"
              opcoes={CASAS}
              selectedKey={dados.casas}
              onSelectionChange={(chave) => mudar({ casas: String(chave) })}
              isDisabled={soLeitura}
              erro={erros.casas}
            />
          )}
          <CampoDeTexto
            rotulo="Mínimo"
            inputMode="decimal"
            value={dados.minimo}
            onChange={(texto) => mudar({ minimo: texto })}
            isReadOnly={soLeitura}
            erro={erros.minimo}
          />
          <CampoDeTexto
            rotulo="Máximo"
            inputMode="decimal"
            value={dados.maximo}
            onChange={(texto) => mudar({ maximo: texto })}
            isReadOnly={soLeitura}
            erro={erros.maximo}
          />
        </>
      )}
      {comOpcoes(dados.tipo) && (
        <EditorDeOpcoes
          rotulo="Opções"
          opcoes={dados.opcoes}
          aoMudar={(opcoes) => mudar({ opcoes })}
          erros={errosDasOpcoes}
          erro={erros.opcoes}
          somenteLeitura={soLeitura}
        />
      )}
      {dados.tipo === 'ativo' && (
        <>
          <TiposAceitos
            valores={dados.tipos}
            aoMudar={(tipos) => mudar({ tipos })}
            soLeitura={soLeitura}
            erro={erros.tipos}
          />
          <CampoDeTexto
            rotulo="Nome do lado de lá"
            descricao='O título do grupo na aba Ligados do ativo escolhido, como "Monitores".'
            autoComplete="off"
            value={dados.ladoDeLa}
            onChange={(texto) => mudar({ ladoDeLa: texto })}
            isReadOnly={soLeitura}
            erro={erros.ladoDeLa}
          />
        </>
      )}
      {erros.configuracao && <p className={estilos.erro}>{erros.configuracao}</p>}
      <Checkbox
        isSelected={dados.restrito}
        onChange={(restrito) => mudar({ restrito })}
        isReadOnly={soLeitura}
      >
        <span className={estilos.capacidade}>
          <span>Restrito</span>
          <span className={estilos.descricaoDaCapacidade}>
            Só quem pode ver os campos restritos vê o valor dele.
          </span>
        </span>
      </Checkbox>
      <GrupoDeRadios
        rotulo="Escrita"
        value={dados.escrita}
        onChange={(escrita) => mudar({ escrita: escrita as PoliticaDeEscrita })}
        isReadOnly={soLeitura}
      >
        <Radio value="manual">Só a edição manual</Radio>
        <Radio value="automatica">Também a importação e a coleta</Radio>
      </GrupoDeRadios>
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

/** Os dados de um campo da API no formulário. */
export function dadosDoCampo(campo: CampoDaOrganizacao): DadosDoCampo {
  const { minimo, maximo, casas, opcoes = [], tipos = [], ladoDeLa = '' } = campo.configuracao;
  const comoTexto = (numero: number | undefined) =>
    numero === undefined ? '' : String(numero).replace('.', ',');
  return {
    rotulo: campo.rotulo,
    tipo: campo.tipo,
    grupo: campo.grupo ?? '',
    minimo: comoTexto(minimo),
    maximo: comoTexto(maximo),
    casas: String(casas ?? 2),
    opcoes: opcoes.map((opcao) => ({
      chave: opcao.id,
      id: opcao.id,
      rotulo: opcao.rotulo,
      situacao: opcao.situacao,
    })),
    tipos,
    ladoDeLa,
    restrito: campo.restrito,
    escrita: campo.escrita,
  };
}
