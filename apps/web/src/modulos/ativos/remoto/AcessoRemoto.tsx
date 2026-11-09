import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeSenha,
  CampoDeTexto,
  Checkbox,
  Dialogo,
  EstadoVazio,
  RotuloDeSituacao,
  type Situacao,
} from '@grafite/ui';
import { useParams } from '@tanstack/react-router';
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilos from '../Ativos.module.css';
import { useAtivo } from '../consultas.ts';
import estilosDoRemoto from './AcessoRemoto.module.css';
import { abrirSessaoRemota, enderecoDaPonte, type SessaoRemota } from './sessao.ts';

type SituacaoDaConexao = 'conectando' | 'conectado' | 'desconectado';

const TEXTOS: Record<SituacaoDaConexao, { texto: string; situacao: Situacao }> = {
  conectando: { texto: 'Conectando…', situacao: 'info' },
  conectado: { texto: 'Conectado', situacao: 'sucesso' },
  desconectado: { texto: 'Desconectado', situacao: 'neutra' },
};

/** O fim sem motivo da ponte nem da máquina, como a conexão que não abriu. */
const SEM_MOTIVO = 'A conexão foi encerrada.';

/** A menor altura da tela da máquina, na janela baixa. */
const ALTURA_MINIMA = 320;

/**
 * A tela do acesso remoto (spec acesso-remoto, "Tela do acesso remoto"): o nome e o patrimônio do
 * ativo, a situação da conexão em texto, com o motivo do fim, e a tela da máquina, que recebe o
 * teclado e o mouse e vai até o fim da janela; as ações Ctrl+Alt+Del, Ajustar à janela, Tela cheia,
 * Desconectar e, desconectado, Conectar de novo. A senha que a máquina pede vai num diálogo, só para
 * ela, e não fica guardada.
 */
export function AcessoRemoto() {
  const { id } = useParams({ from: '/ativos/$id/remoto' });
  const ativo = useAtivo(id);
  const ficha = ativo.data;
  const permitido = ficha?.permite.acessoRemoto === true;

  const [situacao, definirSituacao] = useState<SituacaoDaConexao>('conectando');
  const [motivo, definirMotivo] = useState<string | null>(null);
  const [pedido, definirPedido] = useState<{ comUsuario: boolean } | null>(null);
  const [ajustar, definirAjustar] = useState(true);
  const [tentativa, definirTentativa] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLElement>(null);
  const sessao = useRef<SessaoRemota | null>(null);
  const pelaPessoa = useRef(false);
  const ajustarAgora = useRef(ajustar);
  ajustarAgora.current = ajustar;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a sessão recomeça no "Conectar de novo", pela tentativa.
  useEffect(() => {
    const elemento = tela.current;
    if (!permitido || !elemento) return;
    let saiu = false;
    pelaPessoa.current = false;
    definirSituacao('conectando');
    definirMotivo(null);
    const aberta = abrirSessaoRemota(
      elemento,
      enderecoDaPonte(id, window.location),
      {
        aoConectar: () => {
          if (!saiu) definirSituacao('conectado');
        },
        aoPedirSenha: (comUsuario) => {
          if (!saiu) definirPedido({ comUsuario });
        },
        aoDesconectar: (dado) => {
          if (saiu) return;
          definirPedido(null);
          definirSituacao('desconectado');
          definirMotivo(dado ?? (pelaPessoa.current ? null : SEM_MOTIVO));
        },
      },
      { ajustar: ajustarAgora.current },
    );
    sessao.current = aberta;
    return () => {
      saiu = true;
      sessao.current = null;
      aberta.desconectar();
    };
  }, [id, permitido, tentativa]);

  // A tela da máquina vai até o fim da área da janela: a altura é medida, porque a área que rola
  // não tem altura definida para o 100%.
  const [altura, definirAltura] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a área só existe com o acesso permitido; a medida começa quando ela aparece.
  useLayoutEffect(() => {
    const elemento = area.current;
    const janela = elemento?.closest<HTMLElement>('[data-rolagem-da-janela]');
    if (!elemento || !janela) return;
    const medir = () => {
      const respiro = Number.parseFloat(getComputedStyle(janela).paddingBottom) || 0;
      const sobra = janela.getBoundingClientRect().bottom - elemento.getBoundingClientRect().top;
      definirAltura(Math.max(ALTURA_MINIMA, Math.floor(sobra - respiro)));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(janela);
    return () => observador.disconnect();
  }, [permitido]);

  if (ativo.error) {
    return (
      <>
        <CabecalhoDaPagina titulo="Acesso remoto" />
        <EstadoVazio
          titulo={ativo.error.message}
          acao={<Botao onPress={() => void ativo.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }
  if (!ficha) {
    return (
      <>
        <CabecalhoDaPagina titulo="Acesso remoto" />
        <p role="status" className={estilos.contagem}>
          Carregando o ativo…
        </p>
      </>
    );
  }
  if (!permitido) {
    return (
      <>
        <CabecalhoDaPagina titulo="Acesso remoto" />
        <SemPermissao a="ao acesso remoto desta máquina" />
      </>
    );
  }

  const desconectar = () => {
    pelaPessoa.current = true;
    sessao.current?.desconectar();
  };
  const textos = TEXTOS[situacao];
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina
        titulo={
          <span className={estilos.tituloDaFicha}>
            {`Acesso remoto · ${ficha.rotulo}`}
            {ficha.patrimonio && <span className={estilos.patrimonio}>{ficha.patrimonio}</span>}
          </span>
        }
        acoes={
          <>
            <Botao
              isDisabled={situacao !== 'conectado'}
              onPress={() => sessao.current?.ctrlAltDel()}
            >
              Ctrl+Alt+Del
            </Botao>
            <Checkbox
              isSelected={ajustar}
              onChange={(ligado) => {
                definirAjustar(ligado);
                sessao.current?.ajustar(ligado);
              }}
            >
              Ajustar à janela
            </Checkbox>
            <Botao
              onPress={() => {
                const pedidoDaTelaCheia = area.current?.requestFullscreen?.();
                void pedidoDaTelaCheia?.catch(() =>
                  avisar({ situacao: 'atencao', titulo: 'O navegador não abriu a tela cheia.' }),
                );
              }}
            >
              Tela cheia
            </Botao>
            {situacao === 'desconectado' ? (
              <Botao nivel="primario" onPress={() => definirTentativa((atual) => atual + 1)}>
                Conectar de novo
              </Botao>
            ) : (
              <Botao onPress={desconectar}>Desconectar</Botao>
            )}
          </>
        }
      />
      <p role="status" aria-label="Situação da conexão" className={estilosDoRemoto.situacao}>
        <RotuloDeSituacao situacao={motivo ? 'atencao' : textos.situacao}>
          {textos.texto}
        </RotuloDeSituacao>
        {situacao === 'desconectado' && motivo && (
          <span className={estilosDoRemoto.motivo}>{motivo}</span>
        )}
      </p>
      <div
        ref={area}
        className={estilosDoRemoto.area}
        style={altura === null ? undefined : { height: altura }}
      >
        <section ref={tela} aria-label="Tela da máquina" className={estilosDoRemoto.maquina} />
      </div>
      <PedidoDaSenha
        pedido={pedido}
        aoEnviar={(credenciais) => {
          definirPedido(null);
          sessao.current?.enviarSenha(credenciais);
        }}
        aoCancelar={desconectar}
      />
    </div>
  );
}

/** O diálogo da senha do VNC: a senha vai só para a máquina e sai da tela com o diálogo. */
function PedidoDaSenha({
  pedido,
  aoEnviar,
  aoCancelar,
}: {
  pedido: { comUsuario: boolean } | null;
  aoEnviar: (credenciais: { usuario?: string; senha: string }) => void;
  aoCancelar: () => void;
}) {
  const [usuario, definirUsuario] = useState('');
  const [senha, definirSenha] = useState('');
  const [erro, definirErro] = useState<string | undefined>();
  const limpar = () => {
    definirUsuario('');
    definirSenha('');
    definirErro(undefined);
  };
  const enviar = (evento?: FormEvent) => {
    evento?.preventDefault();
    if (senha === '') {
      definirErro('Informe a senha do VNC.');
      return;
    }
    aoEnviar({
      ...(pedido?.comUsuario && usuario.trim() ? { usuario: usuario.trim() } : {}),
      senha,
    });
    limpar();
  };
  return (
    <Dialogo
      titulo="Senha do VNC"
      aberto={pedido !== null}
      aoMudarAberto={(aberto) => {
        if (aberto) return;
        limpar();
        aoCancelar();
      }}
      acoes={
        <>
          <Botao
            onPress={() => {
              limpar();
              aoCancelar();
            }}
          >
            Cancelar
          </Botao>
          <Botao nivel="primario" onPress={() => enviar()}>
            Entrar
          </Botao>
        </>
      }
    >
      <form className={estilosDoRemoto.formulario} onSubmit={enviar} noValidate>
        <p>A máquina pede a senha do VNC. Ela vai só para a máquina e não fica guardada.</p>
        {pedido?.comUsuario && (
          <CampoDeTexto
            rotulo="Usuário"
            autoComplete="username"
            value={usuario}
            onChange={definirUsuario}
          />
        )}
        <CampoDeSenha
          rotulo="Senha"
          autoComplete="current-password"
          value={senha}
          onChange={(texto) => {
            definirSenha(texto);
            definirErro(undefined);
          }}
          erro={erro}
        />
      </form>
    </Dialogo>
  );
}
