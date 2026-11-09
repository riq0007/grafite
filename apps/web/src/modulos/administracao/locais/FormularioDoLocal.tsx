import {
  ROTULOS_DOS_TIPOS,
  TIPOS_DE_LOCAL,
  type TipoDeLocal,
  validarNomeDoLocal,
} from '@grafite/domain';
import { Botao, CampoDeTexto, Formulario, Gaveta, MensagemDoPasso, Selecao } from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import estilos from '../Administracao.module.css';
import type { RecusaDoFormulario } from '../recusa.ts';
import { SeletorDeLocal } from '../seletores/SeletorDeLocal.tsx';

export interface DadosDoLocal {
  nome: string;
  tipo: TipoDeLocal | null;
}

export interface PedidoDoLocal {
  nome: string;
  tipo: TipoDeLocal;
}

export interface PropsDoFormularioDoLocal {
  titulo: string;
  aberta: boolean;
  aoMudarAberta: (aberta: boolean) => void;
  inicial: DadosDoLocal;
  rotuloDoEnvio: string;
  /** A regra da árvore para o nome, como o nome repetido entre irmãos; `null` quando serve. */
  conferirNome: (nome: string) => string | null;
  enviar: (pedido: PedidoDoLocal) => Promise<{ ok: true } | RecusaDoFormulario<'nome' | 'tipo'>>;
}

const TIPOS = TIPOS_DE_LOCAL.map((tipo) => ({ id: tipo, rotulo: ROTULOS_DOS_TIPOS[tipo] }));

/**
 * O local numa gaveta (design do F2b, decisão 15), com a árvore à vista: o nome e o tipo, com o
 * local de dentro dado pela tela. As regras da árvore avisam antes de enviar, e a recusa da API
 * aparece no campo.
 */
export function FormularioDoLocal({
  titulo,
  aberta,
  aoMudarAberta,
  inicial,
  rotuloDoEnvio,
  conferirNome,
  enviar,
}: PropsDoFormularioDoLocal) {
  return (
    <Gaveta titulo={titulo} aberta={aberta} aoMudarAberta={aoMudarAberta}>
      {/* Cada abertura começa do que foi dado. */}
      {aberta && (
        <CorpoDoLocal
          inicial={inicial}
          rotuloDoEnvio={rotuloDoEnvio}
          conferirNome={(nome) => conferirNome(nome)}
          enviar={({ nome, tipo }) => enviar({ nome, tipo })}
        />
      )}
    </Gaveta>
  );
}

/** Onde o local fica, quando o próprio formulário o escolhe, como na aba do Novo local. */
export interface DentroDe {
  /** A conta pode cadastrar na raiz: sem o local de dentro, o local fica na raiz. */
  podeNaRaiz: boolean;
  /** Os locais em que a conta não altera os locais, à vista na árvore e sem a escolha. */
  semPermissao: ReadonlySet<string>;
}

export interface PropsDoCorpoDoLocal {
  inicial: DadosDoLocal;
  rotuloDoEnvio: string;
  /** A regra da árvore para o nome no local de dentro (`null` na raiz); `null` quando serve. */
  conferirNome: (nome: string, paiId: string | null) => string | null;
  enviar: (
    pedido: PedidoDoLocal & { paiId: string | null },
  ) => Promise<{ ok: true } | RecusaDoFormulario<'nome' | 'tipo'>>;
  /** Com ele, o formulário pede também o local de dentro; sem ele, a tela já o deu. */
  dentroDe?: DentroDe;
  /** Avisa se algo já foi preenchido, para fechar a aba pedir confirmação. */
  aoMudarPreenchido?: (preenchido: boolean) => void;
  /** Com ele, o formulário tem o Cancelar. */
  aoCancelar?: () => void;
}

/**
 * O corpo do formulário do local (change cadastro-em-abas, design, decisão 5), o mesmo na gaveta
 * da tela dos locais e na aba do Novo local: o nome, o tipo e, quando o formulário o escolhe, o
 * local de dentro, entre os que a conta altera.
 */
export function CorpoDoLocal({
  inicial,
  rotuloDoEnvio,
  conferirNome,
  enviar,
  dentroDe,
  aoMudarPreenchido,
  aoCancelar,
}: PropsDoCorpoDoLocal) {
  const [dados, definirDados] = useState(inicial);
  const [paiId, definirPaiId] = useState<string | null>(null);
  const [erros, definirErros] = useState<{ nome?: string; tipo?: string; paiId?: string }>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const nome = useRef<HTMLInputElement>(null);

  const avisarPreenchido = (novos: DadosDoLocal, pai: string | null) =>
    aoMudarPreenchido?.(novos.nome.trim() !== '' || novos.tipo !== null || pai !== null);
  const mudarDados = (mudanca: Partial<DadosDoLocal>) => {
    const novos = { ...dados, ...mudanca };
    definirDados(novos);
    avisarPreenchido(novos, paiId);
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const motivos = {
      nome: validarNomeDoLocal(dados.nome) ?? conferirNome(dados.nome, paiId) ?? undefined,
      tipo: dados.tipo === null ? 'Escolha o tipo do local.' : undefined,
      paiId:
        dentroDe && !dentroDe.podeNaRaiz && paiId === null
          ? 'Escolha onde o local fica.'
          : undefined,
    };
    if (motivos.nome || motivos.tipo || motivos.paiId || dados.tipo === null) {
      definirErros(motivos);
      if (motivos.nome) nome.current?.focus();
      return;
    }
    definirEnviando(true);
    try {
      const resultado = await enviar({ nome: dados.nome.trim(), tipo: dados.tipo, paiId });
      if ('ok' in resultado) return;
      if (resultado.campos?.nome || resultado.campos?.tipo) {
        definirErros({ nome: resultado.campos.nome, tipo: resultado.campos.tipo });
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
        obrigatorio
        autoComplete="off"
        value={dados.nome}
        onChange={(valor) => {
          mudarDados({ nome: valor });
          definirErros((atuais) => ({ ...atuais, nome: undefined }));
        }}
        erro={erros.nome}
      />
      <Selecao
        rotulo="Tipo"
        obrigatorio
        opcoes={TIPOS}
        selectedKey={dados.tipo}
        onSelectionChange={(chave) => {
          mudarDados({ tipo: chave as TipoDeLocal });
          definirErros((atuais) => ({ ...atuais, tipo: undefined }));
        }}
        erro={erros.tipo}
      />
      {dentroDe && (
        <SeletorDeLocal
          rotulo="Dentro de"
          valor={paiId}
          aoMudar={(id) => {
            definirPaiId(id);
            avisarPreenchido(dados, id);
            definirErros((atuais) => ({ ...atuais, nome: undefined, paiId: undefined }));
          }}
          excluir={dentroDe.semPermissao}
          obrigatorio={!dentroDe.podeNaRaiz}
          descricao={dentroDe.podeNaRaiz ? 'Sem ele, o local fica na raiz.' : undefined}
          erro={erros.paiId}
        />
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
      <div className={estilos.acoes}>
        {aoCancelar && <Botao onPress={aoCancelar}>Cancelar</Botao>}
        <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Enviando">
          {rotuloDoEnvio}
        </Botao>
      </div>
    </Formulario>
  );
}
