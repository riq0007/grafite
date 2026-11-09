import {
  Botao,
  BuscaComSugestoes,
  CampoDeTexto,
  Formulario,
  MensagemDoPasso,
  Selecao,
} from '@grafite/ui';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';
import type { RecusaDoFormulario } from '../../administracao/recusa.ts';
import { CampoComCadastro } from '../../cadastros.tsx';
import estilos from '../Ativos.module.css';
import { useFabricantes } from '../consultas.ts';

export interface DadosDoModelo {
  tipoId: string | null;
  fabricante: string;
  nome: string;
}

export interface PedidoDoModelo {
  tipoId: string;
  fabricante: string;
  nome: string;
}

export const MODELO_VAZIO: DadosDoModelo = { tipoId: null, fabricante: '', nome: '' };

type CampoDoModelo = keyof DadosDoModelo;

function conferir(dados: DadosDoModelo): Partial<Record<CampoDoModelo, string>> {
  const erros: Partial<Record<CampoDoModelo, string>> = {};
  if (dados.tipoId === null) erros.tipoId = 'Escolha o tipo do modelo.';
  const fabricante = dados.fabricante.trim();
  if (fabricante === '') erros.fabricante = 'Informe o fabricante.';
  else if (fabricante.length > 60) erros.fabricante = 'Use até 60 caracteres.';
  const nome = dados.nome.trim();
  if (nome === '') erros.nome = 'Informe o nome do modelo.';
  else if (nome.length > 80) erros.nome = 'Use até 80 caracteres.';
  return erros;
}

export interface PropsDoFormularioDoModelo {
  inicial: DadosDoModelo;
  /** Os tipos ativos, para a escolha no cadastro. */
  tipos?: readonly { id: string; nome: string }[];
  /** Na edição, o nome do tipo do modelo, só para leitura: o tipo não muda depois de criado. */
  tipoFixo?: string;
  soLeitura?: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoModelo) => Promise<{ ok: true } | RecusaDoFormulario>;
  aoCancelar?: () => void;
  /** Avisa se algo já foi preenchido, para fechar a aba do cadastro pedir confirmação. */
  aoMudarPreenchido?: (preenchido: boolean) => void;
  /** O que vai entre os campos e as ações, como a escolha da imagem no cadastro. */
  children?: ReactNode;
}

/**
 * O formulário do modelo de equipamento (spec catalogo-de-ativos): o tipo, só no cadastro e entre
 * os ativos, o fabricante com as sugestões dos já usados e o nome do modelo.
 */
export function FormularioDoModelo({
  inicial,
  tipos = [],
  tipoFixo,
  soLeitura = false,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
  aoMudarPreenchido,
  children,
}: PropsDoFormularioDoModelo) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoModelo, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const nome = useRef<HTMLInputElement>(null);
  const fabricantes = useFabricantes(dados.fabricante, dados.tipoId, !soLeitura);

  const mudar = (mudanca: Partial<DadosDoModelo>) => {
    const novos = { ...dados, ...mudanca };
    aoMudarPreenchido?.(
      novos.tipoId !== inicial.tipoId || novos.fabricante.trim() !== '' || novos.nome.trim() !== '',
    );
    definirDados((atuais) => ({ ...atuais, ...mudanca }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const chave of Object.keys(mudanca)) delete restantes[chave as CampoDoModelo];
      return restantes;
    });
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const motivos = conferir(dados);
    if (Object.keys(motivos).length > 0) {
      definirErros(motivos);
      if (motivos.nome && !motivos.tipoId && !motivos.fabricante) nome.current?.focus();
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await enviar({
        tipoId: dados.tipoId as string,
        fabricante: dados.fabricante.trim(),
        nome: dados.nome.trim(),
      });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        definirErros(resultado.campos);
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
      {tipoFixo !== undefined ? (
        <p className={estilos.informacao}>{`Tipo: ${tipoFixo}`}</p>
      ) : (
        // O tipo que ainda não existe é cadastrado numa aba, e volta escolhido (change
        // cadastro-em-abas).
        <CampoComCadastro
          alvo="tipo"
          campo="Tipo"
          bloqueado={soLeitura}
          aoCriar={(tipo) => mudar({ tipoId: tipo.id })}
        >
          <Selecao
            rotulo="Tipo"
            obrigatorio
            opcoes={tipos.map((tipo) => ({ id: tipo.id, rotulo: tipo.nome }))}
            selectedKey={dados.tipoId}
            onSelectionChange={(chave) => mudar({ tipoId: String(chave) })}
            erro={erros.tipoId}
          />
        </CampoComCadastro>
      )}
      <BuscaComSugestoes
        rotulo="Fabricante"
        obrigatorio={!soLeitura}
        descricao={
          soLeitura ? undefined : 'Escolha um dos já usados para os modelos ficarem juntos.'
        }
        sugestoes={(fabricantes.data?.fabricantes ?? []).map((fabricante) => ({
          id: fabricante,
          rotulo: fabricante,
        }))}
        sugestoesDeFora
        sugeridas={{ ids: fabricantes.data?.doTipo ?? [], origem: 'Já usados neste tipo' }}
        inputValue={dados.fabricante}
        onInputChange={(texto) => mudar({ fabricante: texto })}
        isReadOnly={soLeitura}
        erro={erros.fabricante}
      />
      <CampoDeTexto
        ref={nome}
        rotulo="Modelo"
        obrigatorio={!soLeitura}
        autoComplete="off"
        value={dados.nome}
        onChange={(texto) => mudar({ nome: texto })}
        isReadOnly={soLeitura}
        erro={erros.nome}
      />
      {children}
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
