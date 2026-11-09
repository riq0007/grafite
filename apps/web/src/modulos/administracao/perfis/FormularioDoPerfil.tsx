import { descricaoDa, type Permissao } from '@grafite/domain';
import {
  AreaDeTexto,
  Botao,
  CampoDeTexto,
  Carimbo,
  Checkbox,
  Formulario,
  GrupoDeCheckboxes,
  MensagemDoPasso,
} from '@grafite/ui';
import { type FormEvent, useRef, useState } from 'react';
import estilos from '../Administracao.module.css';
import type { RecusaDoFormulario } from '../recusa.ts';
import { AREAS, escolhidasDepois, incluidaPor, permissoesQueValem } from './permissoes.ts';

/** O perfil no formulário: as permissões escolhidas, sem as que vêm junto com elas. */
export interface DadosDoPerfil {
  nome: string;
  descricao: string;
  permissoes: Permissao[];
  exigeDoisPassos: boolean;
  /** O perfil que tem todas as permissões do catálogo, como o Administrador. */
  todasAsPermissoes?: boolean;
}

/** O que vai para a API: o nome sem os espaços das pontas, e a descrição vazia como nula. */
export interface PedidoDoPerfil {
  nome: string;
  descricao: string | null;
  permissoes: Permissao[];
  exigeDoisPassos: boolean;
}

type CampoDoPerfil = 'nome' | 'descricao' | 'permissoes';

export const PERFIL_VAZIO: DadosDoPerfil = {
  nome: '',
  descricao: '',
  permissoes: [],
  exigeDoisPassos: false,
};

function validar({ nome, descricao }: DadosDoPerfil): Partial<Record<CampoDoPerfil, string>> {
  const motivos: Partial<Record<CampoDoPerfil, string>> = {};
  if (nome.trim() === '') motivos.nome = 'Informe o nome do perfil.';
  else if (nome.trim().length > 80) motivos.nome = 'Use até 80 caracteres.';
  if (descricao.trim().length > 500) motivos.descricao = 'Use até 500 caracteres.';
  return motivos;
}

export interface PropsDoFormularioDoPerfil {
  inicial: DadosDoPerfil;
  /** Os dados à vista, sem edição nem ação, para quem não pode alterar o perfil. */
  soLeitura?: boolean;
  rotuloDoEnvio: string;
  enviar: (pedido: PedidoDoPerfil) => Promise<{ ok: true } | RecusaDoFormulario<CampoDoPerfil>>;
  aoCancelar?: () => void;
}

/**
 * O formulário do perfil (spec perfis-e-grupos): o nome, a descrição, "Exige verificação em dois
 * passos" e as permissões por área. As que valem só na organização inteira ficam marcadas, e a
 * que vem junto com outra escolhida aparece marcada, com quem a inclui.
 */
export function FormularioDoPerfil({
  inicial,
  soLeitura = false,
  rotuloDoEnvio,
  enviar,
  aoCancelar,
}: PropsDoFormularioDoPerfil) {
  const [dados, definirDados] = useState(inicial);
  const [erros, definirErros] = useState<Partial<Record<CampoDoPerfil, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entradas = useRef<Partial<Record<'nome' | 'descricao', HTMLElement | null>>>({});
  const todas = dados.todasAsPermissoes ?? false;
  const valem = permissoesQueValem({ permissoes: dados.permissoes, todasAsPermissoes: todas });

  const mudar = (mudanca: Partial<DadosDoPerfil>) => {
    definirDados((atuais) => ({ ...atuais, ...mudanca }));
    definirErros((atuais) => {
      const restantes = { ...atuais };
      for (const campo of Object.keys(mudanca)) delete restantes[campo as CampoDoPerfil];
      return restantes;
    });
  };

  /** Mostra os motivos e leva o foco ao primeiro campo recusado. */
  const recusar = (motivos: Partial<Record<CampoDoPerfil, string>>) => {
    definirErros(motivos);
    const primeiro = (['nome', 'descricao'] as const).find((campo) => motivos[campo]);
    if (primeiro) entradas.current[primeiro]?.focus();
  };

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    const motivos = validar(dados);
    if (Object.keys(motivos).length > 0) return recusar(motivos);
    definirEnviando(true);
    try {
      const resultado = await enviar({
        nome: dados.nome.trim(),
        descricao: dados.descricao.trim() === '' ? null : dados.descricao.trim(),
        permissoes: dados.permissoes,
        exigeDoisPassos: dados.exigeDoisPassos,
      });
      if ('ok' in resultado) return;
      if (resultado.campos && Object.keys(resultado.campos).length > 0) {
        recusar(resultado.campos);
        if (resultado.campos.permissoes) {
          definirFalha(resultado.campos.permissoes);
          definirTentativa((atual) => atual + 1);
        }
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
        ref={(elemento) => {
          entradas.current.nome = elemento;
        }}
        rotulo="Nome"
        obrigatorio={!soLeitura}
        autoComplete="off"
        value={dados.nome}
        onChange={(nome) => mudar({ nome })}
        isReadOnly={soLeitura}
        erro={erros.nome}
      />
      <AreaDeTexto
        rotulo="Descrição"
        value={dados.descricao}
        onChange={(descricao) => mudar({ descricao })}
        isReadOnly={soLeitura}
        erro={erros.descricao}
      />
      <Checkbox
        isSelected={dados.exigeDoisPassos}
        onChange={(exigeDoisPassos) => mudar({ exigeDoisPassos })}
        isReadOnly={soLeitura}
      >
        Exige verificação em dois passos
      </Checkbox>
      <Carimbo>Permissões</Carimbo>
      <div className={estilos.areas}>
        {AREAS.map(({ area, permissoes }) => (
          <GrupoDeCheckboxes
            key={area}
            rotulo={area}
            value={[...valem]}
            onChange={(novas) =>
              mudar({ permissoes: escolhidasDepois(dados.permissoes, valem, novas) })
            }
            isReadOnly={soLeitura}
          >
            {permissoes.map((definicao) => {
              const incluida = todas ? null : incluidaPor(definicao.chave, dados.permissoes);
              return (
                <Checkbox
                  key={definicao.chave}
                  value={definicao.chave}
                  isDisabled={!soLeitura && incluida !== null}
                >
                  <span className={estilos.permissaoDoPerfil}>
                    <span>{definicao.descricao}</span>
                    {definicao.escopo === 'organizacao' && (
                      <span className={estilos.marcaDaPermissao}>Só na organização inteira</span>
                    )}
                    {incluida && (
                      <span className={estilos.marcaDaPermissao}>
                        Incluída por “{descricaoDa(incluida)}”
                      </span>
                    )}
                  </span>
                </Checkbox>
              );
            })}
          </GrupoDeCheckboxes>
        ))}
      </div>
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

/** Os dados de um perfil da API no formulário. */
export function dadosDoPerfil(perfil: {
  nome: string;
  descricao: string | null;
  permissoes: Permissao[];
  exigeDoisPassos: boolean;
  todasAsPermissoes: boolean;
}): DadosDoPerfil {
  return {
    nome: perfil.nome,
    descricao: perfil.descricao ?? '',
    permissoes: perfil.permissoes,
    exigeDoisPassos: perfil.exigeDoisPassos,
    todasAsPermissoes: perfil.todasAsPermissoes,
  };
}
