import type { components } from '@grafite/api-client';
import { montarArvore, PERMISSOES } from '@grafite/domain';
import {
  avisar,
  Botao,
  ControleSegmentado,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  MensagemDoPasso,
  Radio,
  Segmento,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { SeletorDeLocal } from '../seletores/SeletorDeLocal.tsx';
import { listaDas, resultadoDaAtribuicao } from './resultadoDaAtribuicao.ts';

type Perfil = components['schemas']['Perfil'];

type Escopo = 'organizacao' | 'local';

export interface PropsDeAtribuirPerfil {
  /** O título da gaveta, como "Atribuir um perfil a Bruno Costa". */
  titulo: string;
  /** A quem o perfil é dado: uma conta ou um grupo. */
  alvo: { contaId: string } | { grupoId: string };
  /** Quem recebe, no começo das frases do resultado: "Bruno Costa" ou "O grupo Suporte". */
  quem: string;
  /** As atribuições em vigor de quem recebe, diretas ou por grupo, para avisar a repetida. */
  emVigor: readonly { perfil: { id: string }; local: { id: string } | null }[];
  /** O local provável, como o local de trabalho da pessoa, sugerido na escolha do local. */
  localSugerido?: { id: string; origem: string } | null;
  /** Relê o que a atribuição muda, antes do aviso. */
  atualizar: () => Promise<void>;
}

/** "12 permissões", "1 permissão". */
function quantasPermissoes(perfil: Perfil) {
  const total = perfil.todasAsPermissoes ? PERMISSOES.length : perfil.permissoes.length;
  return `${total.toLocaleString('pt-BR')} ${total === 1 ? 'permissão' : 'permissões'}`;
}

/**
 * Atribuir um perfil ativo a uma conta ou a um grupo (spec perfis-e-grupos; spec
 * modulo-administracao, "Atribuição de perfil pela tela"), numa gaveta, com a ficha à vista: os
 * perfis em rádios, o escopo num segmentado, o local na árvore, com o sugerido, e o "Resultado",
 * recalculado a cada mudança, antes de confirmar.
 */
export function AtribuirPerfil({
  titulo,
  alvo,
  quem,
  emVigor,
  localSugerido,
  atualizar,
}: PropsDeAtribuirPerfil) {
  const api = useApi();
  const idDoResultado = useId();
  const [aberta, definirAberta] = useState(false);
  const [perfilId, definirPerfilId] = useState<string | null>(null);
  const [escopo, definirEscopo] = useState<Escopo>('organizacao');
  const [localId, definirLocalId] = useState<string | null>(null);
  const [erros, definirErros] = useState<{ perfil?: string; local?: string }>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const perfis = useQuery({
    queryKey: ['perfis'],
    queryFn: () => consultar(() => api.GET('/perfis'), 'carregar os perfis'),
    enabled: aberta,
  });
  const locais = useQuery({
    queryKey: ['locais'],
    queryFn: () => consultar(() => api.GET('/locais'), 'carregar os locais'),
    enabled: aberta && escopo === 'local',
  });
  const atribuiveis = (perfis.data?.itens ?? []).filter((perfil) => perfil.permite.atribuir);
  const escolhido = atribuiveis.find((perfil) => perfil.id === perfilId);
  const arvore = montarArvore(locais.data?.locais ?? []);
  const resultado = resultadoDaAtribuicao({
    quem,
    perfil: escolhido,
    escopo,
    local:
      localId && arvore.local(localId) ? { id: localId, caminho: arvore.caminho(localId) } : null,
    emVigor,
  });

  function abrir(abrirAgora: boolean) {
    definirAberta(abrirAgora);
    if (!abrirAgora) return;
    definirPerfilId(null);
    definirEscopo('organizacao');
    definirLocalId(null);
    definirErros({});
    definirFalha(null);
  }

  async function atribuir(evento?: FormEvent) {
    evento?.preventDefault();
    const motivos = {
      perfil: perfilId === null ? 'Escolha o perfil.' : undefined,
      local: escopo === 'local' && localId === null ? 'Escolha o local.' : undefined,
    };
    definirErros(motivos);
    definirFalha(null);
    if (motivos.perfil || motivos.local || perfilId === null || resultado.impedimento) return;
    definirEnviando(true);
    try {
      const resposta = await pedir(
        () =>
          api.POST('/atribuicoes', {
            body: { perfilId, ...alvo, localId: escopo === 'local' ? localId : null },
          }),
        'atribuir o perfil',
      );
      if ('erro' in resposta) {
        const recusa = recusaDe<'perfilId' | 'localId'>(resposta);
        if (recusa.campos?.perfilId || recusa.campos?.localId) {
          definirErros({ perfil: recusa.campos.perfilId, local: recusa.campos.localId });
        } else {
          definirFalha(recusa.erro);
          definirTentativa((atual) => atual + 1);
        }
        return;
      }
      definirAberta(false);
      await atualizar();
      const { atribuicao, ignoradas: naoValem } = resposta.dados;
      avisar(
        naoValem.length > 0
          ? {
              situacao: 'atencao',
              titulo: 'Perfil atribuído.',
              descricao: `${naoValem.length === 1 ? 'Não vale' : 'Não valem'} em ${
                atribuicao.local?.caminho ?? 'num local'
              }: ${listaDas(naoValem)}.`,
            }
          : { situacao: 'sucesso', titulo: 'Perfil atribuído.' },
      );
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <>
      <Botao onPress={() => abrir(true)}>Atribuir perfil</Botao>
      <Gaveta titulo={titulo} aberta={aberta} aoMudarAberta={abrir}>
        <Formulario aria-label={titulo} onSubmit={atribuir}>
          {perfis.isError ? (
            <div className={estilos.falha}>
              <p role="alert" className={estilos.informacao}>
                {perfis.error.message}
              </p>
              <Botao onPress={() => void perfis.refetch()}>Tentar de novo</Botao>
            </div>
          ) : perfis.isPending ? (
            <p role="status" className={estilos.informacao}>
              Carregando os perfis…
            </p>
          ) : (
            <GrupoDeRadios
              rotulo="Perfil"
              obrigatorio
              value={perfilId}
              onChange={(id) => {
                // O escopo e o local escolhidos continuam: só o perfil muda.
                definirPerfilId(id);
                definirErros((atuais) => ({ ...atuais, perfil: undefined }));
              }}
              erro={erros.perfil}
            >
              {atribuiveis.map((perfil) => (
                <Radio key={perfil.id} value={perfil.id}>
                  <span className={estilos.opcaoComDetalhe}>
                    <span>{perfil.nome}</span>
                    <span className={estilos.detalheDoItem}>
                      {perfil.descricao
                        ? `${perfil.descricao} · ${quantasPermissoes(perfil)}`
                        : quantasPermissoes(perfil)}
                    </span>
                  </span>
                </Radio>
              ))}
            </GrupoDeRadios>
          )}
          <ControleSegmentado
            rotulo="Escopo"
            value={escopo}
            onChange={(valor) => definirEscopo(valor as Escopo)}
          >
            <Segmento value="organizacao">Organização inteira</Segmento>
            <Segmento value="local">Num local</Segmento>
          </ControleSegmentado>
          {escopo === 'local' && (
            <SeletorDeLocal
              rotulo="Local"
              obrigatorio
              valor={localId}
              sugerido={localSugerido}
              aoMudar={(id) => {
                definirLocalId(id);
                definirErros((atuais) => ({ ...atuais, local: undefined }));
              }}
              erro={erros.local}
            />
          )}
          <section id={idDoResultado} aria-label="Resultado" className={estilos.resultado}>
            <h3 className={estilos.tituloDoResultado}>Resultado</h3>
            <ul className={estilos.efeito}>
              {resultado.frases.map((frase) => (
                <li key={frase}>{frase}</li>
              ))}
            </ul>
          </section>
          <MensagemDoPasso texto={falha} chave={tentativa} />
          <div className={estilos.acoes}>
            <Botao onPress={() => abrir(false)}>Cancelar</Botao>
            <Botao
              type="submit"
              nivel="primario"
              carregando={enviando}
              rotuloCarregando="Atribuindo"
              isDisabled={resultado.impedimento !== null}
              aria-describedby={resultado.impedimento ? idDoResultado : undefined}
            >
              Atribuir perfil
            </Botao>
          </div>
        </Formulario>
      </Gaveta>
    </>
  );
}
