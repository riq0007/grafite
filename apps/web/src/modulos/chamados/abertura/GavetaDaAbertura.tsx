// A gaveta da abertura (spec modulo-chamados, "Abrir um chamado"; spec chamados, "Abrir um chamado
// pela TI"; change chamados-da-ti, design, "A gaveta da abertura (tarefa 5.18)"): quem pediu, pela
// busca da abertura, que não pede `pessoas.ver`; a grade dos tipos em uso; o formulário do tipo, com
// os campos só da TI; o título montado das respostas, que quem abre troca; e o "Fica comigo". O
// retorno é o aviso com o número, e as recusas ficam no campo, no alto do formulário ou antes dos
// botões.
import { destinoDoChamado } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeTexto,
  Formulario,
  Gaveta,
  GrupoDeRadios,
  Interruptor,
  MensagemDoPasso,
  Radio,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  type ContaDoSeletor,
  SeletorDeConta,
} from '../../administracao/seletores/SeletorDeConta.tsx';
import { CHAVE_DOS_CHAMADOS, type TipoDaAbertura, useTiposDaAbertura } from '../consultas.ts';
import type { PessoaDoFormulario } from '../formulario/buscas.ts';
import { ESTADO_VAZIO } from '../formulario/estado.ts';
import { FormularioQueSePreenche } from '../formulario/FormularioQueSePreenche.tsx';
import { useBuscaDaPessoa } from '../formulario/useBuscaDaPessoa.ts';
import { IconeDoTipo } from '../Pecas.tsx';
import estilos from './Abertura.module.css';
import {
  ABERTURA_VAZIA,
  type Abertura,
  errosDaAbertura,
  errosQueValem,
  pedidoDaAbertura,
  retornoDaAbertura,
  tituloNaGaveta,
} from './abertura.ts';

/** O que a recusa de campos recusou: as chaves da tela e a abertura no momento do pedido. */
interface RecusaDosCampos {
  erros: Record<string, string>;
  naRecusa: Abertura;
}

/** O primeiro campo recusado, na ordem da gaveta: o campo de texto ou a grade dos tipos. */
const RECUSADO =
  'input[aria-invalid="true"], textarea[aria-invalid="true"], [role="radiogroup"][aria-invalid="true"] input';

export function GavetaDaAbertura({ aoFechar }: { aoFechar: () => void }) {
  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta) aoFechar();
      }}
      titulo="Novo chamado"
      larga
    >
      <FormularioDaAbertura aoFechar={aoFechar} />
    </Gaveta>
  );
}

function FormularioDaAbertura({ aoFechar }: { aoFechar: () => void }) {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const tipos = useTiposDaAbertura();
  const busca = useBuscaDaPessoa('abertura');
  const [abertura, definirAbertura] = useState<Abertura>(ABERTURA_VAZIA);
  // A pessoa escolhida como o campo a mostra, com o local, e o nome dela, para as sugestões.
  const [pessoa, definirPessoa] = useState<{
    conta: ContaDoSeletor;
    doFormulario: PessoaDoFormulario;
  } | null>(null);
  const [recusa, definirRecusa] = useState<RecusaDosCampos | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);

  // O tipo escolhido que saiu da lista, inativado com a gaveta aberta, deixa a escolha vazia.
  const lista = tipos.data?.tipos ?? [];
  const tipo = lista.find(({ id }) => id === abertura.tipo) ?? null;
  const atual: Abertura = { ...abertura, tipo: tipo?.id ?? null };
  const erros = recusa ? errosQueValem(recusa.erros, recusa.naRecusa, atual) : {};
  const titulo = tipo ? tituloNaGaveta(tipo, abertura) : null;

  // O foco vai ao primeiro campo recusado, depois de a tela mostrar as recusas.
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current?.querySelector<HTMLElement>(RECUSADO)?.focus();
  }, [pedidoDeFoco]);

  const mudar = (mudanca: Partial<Abertura>) =>
    definirAbertura((anterior) => ({ ...anterior, ...mudanca }));
  // As respostas de um formulário não valem no outro: a troca do tipo recomeça as respostas.
  const escolherTipo = (id: string) =>
    definirAbertura((anterior) =>
      anterior.tipo === id ? anterior : { ...anterior, tipo: id, estado: ESTADO_VAZIO },
    );

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    definirFalha(null);
    definirEnviando(true);
    try {
      const resultado = await pedir(
        () => api.POST('/chamados', { body: pedidoDaAbertura(atual) }),
        'abrir o chamado',
      );
      if ('erro' in resultado) {
        const recusada = recusaDe<string>(resultado);
        const campos = Object.fromEntries(
          Object.entries(recusada.campos ?? {}).flatMap(([chave, erro]) =>
            erro ? [[chave, erro] as const] : [],
          ),
        );
        if (Object.keys(campos).length > 0) {
          definirRecusa({ erros: errosDaAbertura(campos), naRecusa: atual });
          definirPedidoDeFoco((anterior) => anterior + 1);
          return;
        }
        // A recusa sem campo, como a dos locais, e a falha sem resposta: os campos já passaram.
        definirRecusa(null);
        definirFalha(recusada.erro);
        definirTentativa((anterior) => anterior + 1);
        return;
      }
      await consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS });
      const { numero } = resultado.dados;
      avisar({
        situacao: 'sucesso',
        titulo: retornoDaAbertura(numero),
        aoAbrir: () => void navegar({ href: destinoDoChamado(numero) }),
      });
      aoFechar();
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <div ref={area} className={estilos.abertura}>
      <Formulario validationBehavior="aria" onSubmit={aoEnviar}>
        <SeletorDeConta
          rotulo="Quem pediu"
          obrigatorio
          valor={pessoa?.conta ?? null}
          aoMudar={(conta) => {
            definirPessoa(
              conta && { conta, doFormulario: { id: conta.id, nome: busca.nomeDa(conta) } },
            );
            mudar({ pessoa: conta?.id ?? null });
          }}
          buscar={busca.buscar}
          erro={erros.pessoa}
        />
        <TiposDaAbertura
          consulta={tipos}
          valor={tipo?.id ?? null}
          aoMudar={escolherTipo}
          erro={erros.tipo}
        />
        {tipo && titulo && (
          <>
            <FormularioQueSePreenche
              formulario={tipo.formulario}
              estado={abertura.estado}
              aoMudar={(mudarEstado) =>
                definirAbertura((anterior) => ({
                  ...anterior,
                  estado: mudarEstado(anterior.estado),
                }))
              }
              quem="abertura"
              pessoa={pessoa?.doFormulario ?? null}
              erros={erros}
            />
            <div className={estilos.titulo}>
              <CampoDeTexto
                rotulo="Título"
                obrigatorio
                descricao={
                  abertura.tituloEscrito === null
                    ? 'Montado das respostas. Você pode trocá-lo.'
                    : 'Escrito por você. As respostas não o mudam mais.'
                }
                value={titulo.valor}
                onChange={(tituloEscrito) => mudar({ tituloEscrito })}
                erro={erros.titulo}
              />
              {titulo.trocado && (
                <Botao nivel="terciario" onPress={() => mudar({ tituloEscrito: null })}>
                  Usar o título montado
                </Botao>
              )}
            </div>
          </>
        )}
        <Interruptor
          isSelected={abertura.ficaComigo}
          onChange={(ficaComigo) => mudar({ ficaComigo })}
          descricao="Desligado, o chamado vai para quem atende o tipo ou para a triagem."
        >
          Fica comigo
        </Interruptor>
        <MensagemDoPasso
          texto={falha ?? (tipo ? null : (erros.formulario ?? null))}
          chave={tentativa}
        />
        <div className={estilos.acoes}>
          <Botao
            type="submit"
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Abrindo o chamado"
          >
            Abrir o chamado
          </Botao>
          <Botao nivel="terciario" onPress={aoFechar}>
            Cancelar
          </Botao>
        </div>
      </Formulario>
    </div>
  );
}

/**
 * A grade dos tipos em uso, na ordem: cada um com o ícone na série dele, o nome, que é o nome lido
 * do rádio, e a frase, lida como a descrição dele. No lugar dela, os tipos carregando, a falha, com
 * "Tentar de novo", ou nenhum tipo em uso.
 */
function TiposDaAbertura({
  consulta,
  valor,
  aoMudar,
  erro,
}: {
  consulta: ReturnType<typeof useTiposDaAbertura>;
  valor: string | null;
  aoMudar: (id: string) => void;
  erro?: string | undefined;
}) {
  const prefixo = useId();
  if (consulta.isPending) {
    return (
      <p role="status" className={estilos.semTipos}>
        Carregando os tipos…
      </p>
    );
  }
  if (consulta.isError) {
    return (
      <div className={estilos.falhaDosTipos}>
        <p role="alert">{consulta.error.message}</p>
        <Botao
          carregando={consulta.isFetching}
          rotuloCarregando="Tentando de novo"
          onPress={() => void consulta.refetch()}
        >
          Tentar de novo
        </Botao>
      </div>
    );
  }
  const { tipos } = consulta.data;
  if (tipos.length === 0) {
    return <p className={estilos.semTipos}>Nenhum tipo de chamado está em uso.</p>;
  }
  const idDe = (tipo: TipoDaAbertura, parte: string) => `${prefixo}-${tipo.id}-${parte}`;
  return (
    <GrupoDeRadios
      rotulo="Tipo"
      obrigatorio
      value={valor}
      onChange={aoMudar}
      erro={erro}
      className={estilos.tipos}
    >
      {tipos.map((tipo) => (
        <Radio
          key={tipo.id}
          value={tipo.id}
          className={estilos.tipo}
          aria-labelledby={idDe(tipo, 'nome')}
          aria-describedby={tipo.frase ? idDe(tipo, 'frase') : undefined}
        >
          <IconeDoTipo icone={tipo.icone} nome={tipo.nome} decorativo tamanho="grande" />
          <span className={estilos.textoDoTipo}>
            <span id={idDe(tipo, 'nome')} className={estilos.nomeDoTipo}>
              {tipo.nome}
            </span>
            {tipo.frase && (
              <span id={idDe(tipo, 'frase')} className={estilos.fraseDoTipo}>
                {tipo.frase}
              </span>
            )}
          </span>
        </Radio>
      ))}
    </GrupoDeRadios>
  );
}
