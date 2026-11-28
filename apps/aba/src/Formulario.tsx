import { type FormEvent, useEffect, useRef, useState } from 'react';
import estilos from './Formulario.module.css';
import { entrar, enviarOCodigo, type FormularioDaEntrada, recomecarAEntrada } from './nativo.ts';

interface Props {
  formulario: FormularioDaEntrada;
  compacta: boolean;
  /** Aberto pelo atalho ou usado pelo teclado: o anel aparece também no foco dado pela tela. */
  teclado: boolean;
  pedidoDeFoco: number;
}

/** O "Entrar" volta no momento da espera, sem a pessoa recarregar nada. */
function useLiberadoEm(esperaAte: string | null): boolean {
  const ate = esperaAte ? new Date(esperaAte).getTime() : Number.NaN;
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!(ate > Date.now())) return;
    const espera = setTimeout(() => setAgora(Date.now()), ate - Date.now());
    return () => clearTimeout(espera);
  }, [ate]);
  return !(ate > agora);
}

/**
 * O formulário da entrada pela senha (spec aba-dos-colaboradores, "Pessoa pela senha do AD"): o
 * usuário e a senha do AD, e depois o código do app para a conta com os dois passos. A senha não
 * fica na tela depois da tentativa, e a recusa chega pelo estado, escrita.
 */
export function Formulario({ formulario, compacta, teclado, pedidoDeFoco }: Props) {
  const { passo, erro, esperaAte } = formulario;
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const liberado = useLiberadoEm(esperaAte);
  const campoDoUsuario = useRef<HTMLInputElement>(null);
  const campoDaSenha = useRef<HTMLInputElement>(null);
  const campoDoCodigo = useRef<HTMLInputElement>(null);

  // O foco vai ao primeiro campo que falta: ao abrir, a cada pedido e depois de cada recusa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o foco é pedido por estes três.
  useEffect(() => {
    if (passo === 'codigo') campoDoCodigo.current?.focus();
    else if (usuario && erro) campoDaSenha.current?.focus();
    else campoDoUsuario.current?.focus();
  }, [pedidoDeFoco, passo, erro]);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (enviando || !liberado) return;
    setEnviando(true);
    const pedido =
      passo === 'codigo' ? enviarOCodigo(codigo.trim()) : entrar(usuario.trim(), senha);
    pedido
      .catch(() => undefined)
      .finally(() => {
        setEnviando(false);
        setSenha('');
        setCodigo('');
      });
  };

  const descricao = (dica: string) => (erro ? `erro-da-entrada ${dica}` : dica);
  return (
    <form
      className={`${estilos.formulario} ${compacta ? estilos.compacta : ''}`}
      data-teclado={teclado || undefined}
      onSubmit={enviar}
      noValidate
    >
      <h2 className={estilos.titulo}>
        {passo === 'codigo' ? 'Falta o código do app' : 'Entre com o seu usuário da empresa'}
      </h2>
      {erro && (
        <p id="erro-da-entrada" className={estilos.erro} role="alert">
          {erro}
        </p>
      )}
      {passo === 'senha' ? (
        <>
          <label className={estilos.campo}>
            <span>Usuário</span>
            <input
              ref={campoDoUsuario}
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={usuario}
              aria-invalid={erro ? true : undefined}
              aria-describedby={descricao('dica-do-usuario')}
              onChange={(evento) => setUsuario(evento.target.value)}
            />
          </label>
          <p id="dica-do-usuario" className={estilos.dica}>
            Só o usuário, sem o domínio nem o e-mail.
          </p>
          <label className={estilos.campo}>
            <span>Senha</span>
            <input
              ref={campoDaSenha}
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? 'erro-da-entrada' : undefined}
              onChange={(evento) => setSenha(evento.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <label className={estilos.campo}>
            <span>Código</span>
            <input
              ref={campoDoCodigo}
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={codigo}
              aria-invalid={erro ? true : undefined}
              aria-describedby={descricao('dica-do-codigo')}
              onChange={(evento) => setCodigo(evento.target.value)}
            />
          </label>
          <p id="dica-do-codigo" className={estilos.dica}>
            O código do app autenticador, ou um código de recuperação.
          </p>
        </>
      )}
      <button
        type="submit"
        className={estilos.entrar}
        aria-disabled={enviando || !liberado || undefined}
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      {passo === 'codigo' && (
        <button
          type="button"
          className={estilos.recomecar}
          onClick={() => recomecarAEntrada().catch(() => undefined)}
        >
          Voltar ao usuário
        </button>
      )}
    </form>
  );
}
