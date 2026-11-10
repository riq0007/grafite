// Seção Conta dos Ajustes (spec ajustes-do-sistema; design do F2a, decisão 15): os dados da conta,
// a senha, a verificação em dois passos e as sessões. Ela não guarda preferências: cada ação tem o
// seu botão, e não há "Restaurar padrões".
import type { components } from '@grafite/api-client';
import { avaliarSenha, textoDosDias } from '@grafite/domain';
import {
  Avatar,
  avisar,
  Botao,
  CabecalhoDaPagina,
  CampoDeSenha,
  CampoDeTexto,
  Carimbo,
  CodigosDeRecuperacao,
  EscolhaDeImagem,
  ListaDeDados,
  MensagemDoPasso,
  REGRA_DA_SENHA,
  useDataHora,
} from '@grafite/ui';
import { type QueryKey, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { miniaturasDaConta } from '../../../api/fotos.ts';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { focarDestino } from '../../../casca/foco.ts';
import type { BuscaDaRaiz } from '../../../rotas/raiz.tsx';
import { CadastroComChave } from '../../../sessao/CadastroComChave.tsx';
import { useLojaDaSessao, useSessao } from '../../../sessao/useSessao.tsx';
import estilos from './Secoes.module.css';

type DoisPassosDaConta = components['schemas']['Conta']['doisPassos'];
type SessaoDaConta = components['schemas']['SessaoDaConta'];

/**
 * As partes só existem depois de ler o servidor: o foco do endereço vai a elas quando aparecem.
 * Com `parte`, só quando o endereço pede aquela parte, como as sessões, que chegam por último.
 */
function useFocoQuandoAparecer(apareceu: boolean, parte?: string) {
  const foco = useRouterState({
    select: (estado) => (estado.location.search as BuscaDaRaiz).foco,
  });
  useEffect(() => {
    if (apareceu && foco && (parte === undefined || foco === parte)) focarDestino(foco);
  }, [apareceu, foco, parte]);
}

/** Uma leitura da API como a tela a mostra. */
type Leitura<T> =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; erro: string }
  | { tipo: 'pronta'; dados: T };

const SEM_SERVIDOR = 'Sem conexão com o servidor. A sua conta aparece quando a conexão voltar.';

/**
 * As consultas da seção, que o módulo Ajustes declara para os eventos da pessoa e da conta: uma
 * mudança feita em outro lugar relê as duas (spec eventos-em-tempo-real).
 */
const CHAVE_DA_CONTA = ['conta'] as const;
const CHAVE_DAS_SESSOES = ['conta', 'sessoes'] as const;
const CHAVE_DOS_APARELHOS = ['conta', 'aparelhos'] as const;

/**
 * Lê da API ao aparecer, quando a pessoa pede de novo e quando um evento invalida a consulta. Na
 * releitura, os dados continuam à vista. `ler` precisa ser estável (useCallback).
 */
function useLeitura<T>(chave: QueryKey, ler: () => Promise<{ dados: T } | { erro: string }>) {
  const consultas = useQueryClient();
  const consulta = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const resultado = await ler();
      if ('erro' in resultado) throw new Error(resultado.erro);
      return resultado.dados;
    },
  });
  const leitura: Leitura<T> = consulta.isPending
    ? { tipo: 'carregando' }
    : consulta.isError
      ? { tipo: 'erro', erro: consulta.error.message }
      : { tipo: 'pronta', dados: consulta.data };
  /** Muda os dados lidos depois de uma ação que a API confirmou, sem ler de novo. */
  const atualizar = useCallback(
    (mudar: (dados: T) => T) => {
      consultas.setQueryData<T>(chave, (atual) => (atual === undefined ? atual : mudar(atual)));
    },
    [consultas, chave],
  );
  return { leitura, tentarDeNovo: () => consulta.refetch(), atualizar };
}

export function SecaoConta() {
  const sessao = useSessao();
  return (
    <>
      <CabecalhoDaPagina titulo="Conta" />
      {sessao.tipo === 'desconhecida' ? (
        <p className={estilos.informacao}>{SEM_SERVIDOR}</p>
      ) : (
        <ContaDaSessao />
      )}
    </>
  );
}

function ContaDaSessao() {
  const api = useApi();
  const lerConta = useCallback(() => pedir(() => api.GET('/conta'), 'carregar a conta'), [api]);
  const { leitura, tentarDeNovo, atualizar } = useLeitura(CHAVE_DA_CONTA, lerConta);
  useFocoQuandoAparecer(leitura.tipo === 'pronta');

  if (leitura.tipo === 'carregando') {
    return (
      <p role="status" className={estilos.informacao}>
        Carregando a conta…
      </p>
    );
  }
  if (leitura.tipo === 'erro') {
    return (
      <div className={estilos.falha}>
        <p role="alert" className={estilos.informacao}>
          {leitura.erro}
        </p>
        <div>
          <Botao onPress={() => void tentarDeNovo()}>Tentar de novo</Botao>
        </div>
      </div>
    );
  }
  const conta = leitura.dados;
  return (
    <div className={estilos.partes}>
      <Parte titulo="Foto" foco="foto">
        <FotoDaConta />
      </Parte>
      <Parte titulo="Dados da conta" foco="dados-da-conta">
        <ListaDeDados
          itens={[
            { rotulo: 'Nome', valor: conta.nome },
            { rotulo: 'Usuário', valor: conta.usuario },
            ...(conta.email ? [{ rotulo: 'E-mail', valor: conta.email }] : []),
          ]}
        />
      </Parte>
      <Parte titulo="Senha" foco="senha">
        <TrocaDaSenha usuario={conta.usuario} />
      </Parte>
      <Parte titulo="Verificação em dois passos" foco="dois-passos">
        <DoisPassos
          doisPassos={conta.doisPassos}
          aoMudar={(doisPassos) => atualizar((anterior) => ({ ...anterior, doisPassos }))}
        />
      </Parte>
      {conta.doisPassos.situacao === 'ativa' && (
        <Parte titulo="Aparelhos confiáveis" foco="aparelhos-confiaveis">
          <AparelhosConfiaveis />
        </Parte>
      )}
      <Parte titulo="Sessões" foco="sessoes">
        <Sessoes />
      </Parte>
    </div>
  );
}

/**
 * A foto da pessoa da conta, que só muda por aqui (spec ajustes-do-sistema): "Trocar foto", com as
 * regras do envio de imagens, e "Remover foto", com confirmação. A sessão é relida depois, e a
 * seção e o menu do usuário passam a mostrar a foto nova.
 */
function FotoDaConta() {
  const api = useApi();
  const loja = useLojaDaSessao();
  const sessao = useSessao();
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);
  if (sessao.tipo !== 'ativa') return null;
  const { nome, foto } = sessao.conta;
  const avatar = (
    <Avatar nome={nome} imagens={miniaturasDaConta(foto)} tamanho="ficha" decorativo />
  );
  return (
    <EscolhaDeImagem
      rotulo={`Foto de ${nome}`}
      imagem={foto ? avatar : undefined}
      vazio={avatar}
      progresso={progresso}
      erro={erro}
      rotuloDeEscolher="Trocar foto"
      rotuloDeRemover="Remover foto"
      explicacaoDaRemocao="A foto deixa de aparecer na hora. Para voltar, envie a foto de novo."
      aoEscolher={async (arquivo) => {
        definirErro(null);
        definirProgresso(0);
        const resultado = await pedir(
          () => api.enviarArquivo('/conta/foto', arquivo, definirProgresso),
          'trocar a foto',
        );
        if ('erro' in resultado) {
          definirProgresso(undefined);
          definirErro(resultado.erro);
          return;
        }
        await loja.validar();
        definirProgresso(undefined);
        avisar({ situacao: 'sucesso', titulo: 'Foto trocada.' });
      }}
      aoRemover={async () => {
        const resultado = await pedir(() => api.DELETE('/conta/foto'), 'remover a foto');
        if ('erro' in resultado) return { erro: resultado.erro };
        await loja.validar();
        avisar({ situacao: 'sucesso', titulo: 'Foto removida.' });
        return { ok: true };
      }}
    />
  );
}

/** Uma parte da seção, com o título e o `data-foco` que a busca e o endereço usam. */
function Parte({ titulo, foco, children }: { titulo: string; foco: string; children?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-foco={foco} className={estilos.parte}>
      <Carimbo id={id}>{titulo}</Carimbo>
      {children}
    </section>
  );
}

interface ErrosDaSenha {
  senhaAtual?: string;
  senhaNova?: string;
  confirmacao?: string;
}

/**
 * Trocar a senha: nada muda até "Trocar senha". A regra fica à vista, e o motivo de uma recusa
 * aparece no campo antes de enviar. A troca encerra as outras sessões da conta.
 */
function TrocaDaSenha({ usuario }: { usuario: string }) {
  const loja = useLojaDaSessao();
  const [atual, definirAtual] = useState('');
  const [nova, definirNova] = useState('');
  const [confirmacao, definirConfirmacao] = useState('');
  const [erros, definirErros] = useState<ErrosDaSenha>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [trocada, definirTrocada] = useState(false);
  const [enviando, definirEnviando] = useState(false);
  const emEnvio = useRef(false);

  const mudar =
    (campo: keyof ErrosDaSenha, definir: (valor: string) => void) => (valor: string) => {
      definir(valor);
      definirTrocada(false);
      definirErros((anteriores) => ({ ...anteriores, [campo]: undefined }));
    };

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (emEnvio.current) return;
    const antes: ErrosDaSenha = {
      senhaAtual: atual === '' ? 'Informe a senha atual.' : undefined,
      senhaNova:
        nova !== '' && nova === atual
          ? 'A senha nova precisa ser diferente da atual.'
          : (avaliarSenha(nova, { usuario }) ?? undefined),
      confirmacao: nova !== confirmacao ? 'As senhas não são iguais.' : undefined,
    };
    definirFalha(null);
    if (antes.senhaAtual || antes.senhaNova || antes.confirmacao) {
      definirErros(antes);
      return;
    }
    emEnvio.current = true;
    definirEnviando(true);
    try {
      const resultado = await loja.trocarSenha({ senhaAtual: atual, senhaNova: nova });
      if ('erro' in resultado) {
        if (resultado.campo) definirErros({ [resultado.campo]: resultado.erro });
        else {
          definirFalha(resultado.erro);
          definirTentativa((anterior) => anterior + 1);
        }
        return;
      }
      definirAtual('');
      definirNova('');
      definirConfirmacao('');
      definirErros({});
      definirTrocada(true);
    } finally {
      emEnvio.current = false;
      definirEnviando(false);
    }
  }

  return (
    <form className={estilos.formularioDaConta} onSubmit={enviar} noValidate>
      <CampoDeSenha
        rotulo="Senha atual"
        name="senhaAtual"
        autoComplete="current-password"
        value={atual}
        onChange={mudar('senhaAtual', definirAtual)}
        erro={erros.senhaAtual}
      />
      <CampoDeSenha
        rotulo="Senha nova"
        name="senhaNova"
        autoComplete="new-password"
        descricao={REGRA_DA_SENHA}
        value={nova}
        onChange={mudar('senhaNova', definirNova)}
        erro={erros.senhaNova}
      />
      <CampoDeSenha
        rotulo="Confirmar a senha nova"
        name="confirmacao"
        autoComplete="new-password"
        value={confirmacao}
        onChange={mudar('confirmacao', definirConfirmacao)}
        erro={erros.confirmacao}
      />
      <MensagemDoPasso texto={falha} chave={tentativa} />
      {trocada && (
        <p role="status" className={estilos.informacao}>
          Senha trocada. As outras sessões foram encerradas e os aparelhos confiáveis, esquecidos.
        </p>
      )}
      <div>
        <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Trocando">
          Trocar senha
        </Botao>
      </div>
    </form>
  );
}

/** "A", "A e B" ou "A, B e C". */
const listaComE = (nomes: readonly string[]) =>
  nomes.length < 2 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;

/**
 * Quem exige a verificação (spec ajustes-do-sistema): a própria conta, um perfil ou os dois, como
 * "Exigida pelo perfil Administrador"; sem exigência, `null`.
 */
function textoDaExigencia({ conta, perfis }: DoisPassosDaConta['exigidaPor']): string | null {
  const dosPerfis =
    perfis.length === 0
      ? null
      : perfis.length === 1
        ? `pelo perfil ${perfis[0]}`
        : `pelos perfis ${listaComE(perfis)}`;
  if (conta && dosPerfis) return `Exigida para a sua conta e ${dosPerfis}`;
  if (conta) return 'Exigida para a sua conta';
  return dosPerfis && `Exigida ${dosPerfis}`;
}

/** Quantos códigos de recuperação restam, em texto. */
function textoDosRestantes(restantes: number): string {
  if (restantes === 0) return 'Não resta nenhum código de recuperação. Gere novos.';
  if (restantes === 1) return 'Resta 1 código de recuperação.';
  return `Restam ${restantes} códigos de recuperação.`;
}

type ModoDosDoisPassos =
  | { tipo: 'resumo' }
  | { tipo: 'cadastro' }
  | { tipo: 'desativar' }
  | { tipo: 'gerar' }
  | { tipo: 'codigos'; codigos: string[] };

/**
 * A verificação em dois passos da conta: a situação em texto, "Ativar" com o cadastro pelo QR
 * code, "Desativar" (só quando não é exigida) e os códigos de recuperação, cada ação confirmada
 * por um código. Os códigos novos aparecem uma vez só.
 */
function DoisPassos({
  doisPassos,
  aoMudar,
}: {
  doisPassos: DoisPassosDaConta;
  aoMudar: (doisPassos: DoisPassosDaConta) => void;
}) {
  const loja = useLojaDaSessao();
  const api = useApi();
  const [modo, definirModo] = useState<ModoDosDoisPassos>({ tipo: 'resumo' });
  const [aviso, definirAviso] = useState<string | null>(null);
  const voltar = () => definirModo({ tipo: 'resumo' });
  const ativa = doisPassos.situacao === 'ativa';

  if (modo.tipo === 'cadastro') {
    return (
      <CadastroComChave
        loja={loja}
        nivelDoTitulo={3}
        rotuloDeSair="Cancelar"
        aoSair={voltar}
        aoConfirmar={async (codigo) => {
          const resultado = await loja.confirmarCadastro(codigo);
          if ('ok' in resultado) {
            aoMudar({
              ...doisPassos,
              situacao: 'ativa',
              codigosRestantes: resultado.codigos.length,
            });
            definirAviso(null);
            definirModo({ tipo: 'codigos', codigos: resultado.codigos });
          }
          return resultado;
        }}
      />
    );
  }
  if (modo.tipo === 'codigos') {
    return <CodigosDeRecuperacao codigos={modo.codigos} nivelDoTitulo={3} aoContinuar={voltar} />;
  }
  if (modo.tipo === 'desativar') {
    return (
      <ConfirmarComCodigo
        explicacao="Para desativar, digite um código do app autenticador ou um código de recuperação."
        rotulo="Desativar"
        rotuloCarregando="Desativando"
        destrutiva
        aoCancelar={voltar}
        aoConfirmar={async (codigo) => {
          const resultado = await pedir(
            () => api.POST('/conta/dois-passos/desativacao', { body: { codigo } }),
            'desativar a verificação em dois passos',
          );
          if ('erro' in resultado) return resultado;
          aoMudar({ ...doisPassos, situacao: 'desativada', codigosRestantes: 0 });
          definirAviso('Verificação em dois passos desativada.');
          voltar();
          return { ok: true };
        }}
      />
    );
  }
  if (modo.tipo === 'gerar') {
    return (
      <ConfirmarComCodigo
        explicacao="Para gerar códigos novos, digite um código do app autenticador ou um código de recuperação. Os códigos atuais deixam de valer."
        rotulo="Gerar códigos"
        rotuloCarregando="Gerando"
        aoCancelar={voltar}
        aoConfirmar={async (codigo) => {
          const resultado = await pedir(
            () => api.POST('/conta/dois-passos/codigos-de-recuperacao', { body: { codigo } }),
            'gerar os códigos de recuperação',
          );
          if ('erro' in resultado) return resultado;
          const codigos = resultado.dados.codigosDeRecuperacao;
          aoMudar({ ...doisPassos, codigosRestantes: codigos.length });
          definirAviso(null);
          definirModo({ tipo: 'codigos', codigos });
          return { ok: true };
        }}
      />
    );
  }

  const exigencia = textoDaExigencia(doisPassos.exigidaPor);
  return (
    <>
      <ListaDeDados
        itens={[
          { rotulo: 'Situação', valor: ativa ? 'Ativa' : 'Desativada' },
          ...(exigencia ? [{ rotulo: 'Exigência', valor: exigencia }] : []),
        ]}
      />
      {aviso && (
        <p role="status" className={estilos.informacao}>
          {aviso}
        </p>
      )}
      {(!ativa || !doisPassos.exigida) && (
        <div className={estilos.acoesDaParte}>
          {ativa ? (
            <Botao onPress={() => definirModo({ tipo: 'desativar' })}>Desativar</Botao>
          ) : (
            <Botao onPress={() => definirModo({ tipo: 'cadastro' })}>Ativar</Botao>
          )}
        </div>
      )}
      <div data-foco="codigos-de-recuperacao" className={estilos.parte}>
        <Carimbo nivel={3}>Códigos de recuperação</Carimbo>
        {ativa ? (
          <>
            <p className={estilos.informacao}>{textoDosRestantes(doisPassos.codigosRestantes)}</p>
            <div>
              <Botao onPress={() => definirModo({ tipo: 'gerar' })}>
                Gerar novos códigos de recuperação
              </Botao>
            </div>
          </>
        ) : (
          <p className={estilos.informacao}>
            Os códigos de recuperação vêm com a ativação da verificação.
          </p>
        )}
      </div>
    </>
  );
}

interface PropsDaConfirmacao {
  explicacao: string;
  rotulo: string;
  rotuloCarregando: string;
  /** Destrutiva quando a ação tira uma proteção da conta, como desativar a verificação. */
  destrutiva?: boolean;
  aoConfirmar: (codigo: string) => Promise<{ ok: true } | { erro: string }>;
  aoCancelar: () => void;
}

/** Uma ação da verificação, confirmada por um código do app ou de recuperação. */
function ConfirmarComCodigo({
  explicacao,
  rotulo,
  rotuloCarregando,
  destrutiva = false,
  aoConfirmar,
  aoCancelar,
}: PropsDaConfirmacao) {
  const [codigo, definirCodigo] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const emEnvio = useRef(false);
  const campo = useRef<HTMLInputElement>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (emEnvio.current) return;
    emEnvio.current = true;
    definirEnviando(true);
    try {
      const resultado = await aoConfirmar(codigo.trim());
      if ('erro' in resultado) {
        definirErro(resultado.erro);
        definirTentativa((anterior) => anterior + 1);
        definirCodigo('');
        campo.current?.focus();
      }
    } finally {
      emEnvio.current = false;
      definirEnviando(false);
    }
  }

  return (
    <form className={estilos.formularioDaConta} onSubmit={enviar} noValidate>
      <p className={estilos.informacao}>{explicacao}</p>
      <CampoDeTexto
        ref={campo}
        rotulo="Código do app ou de recuperação"
        name="codigo"
        autoComplete="one-time-code"
        value={codigo}
        onChange={definirCodigo}
        autoFocus
      />
      <MensagemDoPasso texto={erro} chave={tentativa} />
      <div className={estilos.acoesDaParte}>
        <Botao
          type="submit"
          nivel={destrutiva ? 'destrutivo' : 'primario'}
          carregando={enviando}
          rotuloCarregando={rotuloCarregando}
        >
          {rotulo}
        </Botao>
        <Botao nivel="terciario" onPress={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

/**
 * As sessões abertas da conta, com o dispositivo, o IP e os horários no fuso escolhido: "Esta
 * sessão" na atual, "Encerrar" em cada outra e "Encerrar as outras sessões".
 */
function Sessoes() {
  const api = useApi();
  const { formatarHorario } = useDataHora();
  const lerSessoes = useCallback(
    () => pedir(() => api.GET('/conta/sessoes'), 'carregar as sessões'),
    [api],
  );
  const { leitura, tentarDeNovo, atualizar } = useLeitura(CHAVE_DAS_SESSOES, lerSessoes);
  useFocoQuandoAparecer(leitura.tipo === 'pronta', 'sessoes');
  /** A sessão que está sendo encerrada, ou "outras". */
  const [encerrando, definirEncerrando] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [aviso, definirAviso] = useState<string | null>(null);
  const idDoTitulo = useId();

  if (leitura.tipo === 'carregando') {
    return (
      <p role="status" className={estilos.informacao}>
        Carregando as sessões…
      </p>
    );
  }
  if (leitura.tipo === 'erro') {
    return (
      <div className={estilos.falha}>
        <p role="alert" className={estilos.informacao}>
          {leitura.erro}
        </p>
        <div>
          <Botao onPress={() => void tentarDeNovo()}>Tentar de novo</Botao>
        </div>
      </div>
    );
  }

  async function encerrar(alvo: string, fazer: () => ReturnType<typeof pedir<unknown>>) {
    definirEncerrando(alvo);
    definirFalha(null);
    definirAviso(null);
    const resultado = await fazer();
    definirEncerrando(null);
    if ('erro' in resultado) {
      definirFalha(resultado.erro);
      definirTentativa((anterior) => anterior + 1);
      return false;
    }
    return true;
  }

  const lista: SessaoDaConta[] = leitura.dados;
  const temOutras = lista.some((sessao) => !sessao.atual);
  return (
    <>
      <ul aria-label="Sessões abertas" className={estilos.sessoes}>
        {lista.map((sessao) => (
          <li key={sessao.id} className={estilos.sessao}>
            <p className={estilos.cabecalhoDaSessao}>
              <strong id={`${idDoTitulo}-${sessao.id}`}>{sessao.dispositivo}</strong>
              {sessao.atual && <span className={estilos.marca}>Esta sessão</span>}
            </p>
            <ListaDeDados
              itens={[
                { rotulo: 'Endereço IP', valor: sessao.ip ?? 'Desconhecido' },
                { rotulo: 'Entrou em', valor: formatarHorario(new Date(sessao.criadaEm)) },
                { rotulo: 'Último uso', valor: formatarHorario(new Date(sessao.ultimoUsoEm)) },
              ]}
            />
            {!sessao.atual && (
              <div>
                <Botao
                  aria-describedby={`${idDoTitulo}-${sessao.id}`}
                  carregando={encerrando === sessao.id}
                  rotuloCarregando="Encerrando"
                  onPress={async () => {
                    const encerrou = await encerrar(sessao.id, () =>
                      pedir(
                        () =>
                          api.DELETE('/conta/sessoes/{id}', {
                            params: { path: { id: sessao.id } },
                          }),
                        'encerrar a sessão',
                      ),
                    );
                    if (encerrou)
                      atualizar((atuais) => atuais.filter((outra) => outra.id !== sessao.id));
                  }}
                >
                  Encerrar
                </Botao>
              </div>
            )}
          </li>
        ))}
      </ul>
      <MensagemDoPasso texto={falha} chave={tentativa} />
      {aviso && (
        <p role="status" className={estilos.informacao}>
          {aviso}
        </p>
      )}
      {temOutras && (
        <div>
          <Botao
            nivel="destrutivo"
            carregando={encerrando === 'outras'}
            rotuloCarregando="Encerrando"
            onPress={async () => {
              const encerrou = await encerrar('outras', () =>
                pedir(() => api.DELETE('/conta/sessoes'), 'encerrar as outras sessões'),
              );
              if (!encerrou) return;
              atualizar((atuais) => atuais.filter((sessao) => sessao.atual));
              definirAviso('As outras sessões foram encerradas.');
            }}
          >
            Encerrar as outras sessões
          </Botao>
        </div>
      )}
    </>
  );
}

type AparelhosDaConta = components['schemas']['AparelhosDaConta'];

/** O prazo que vale para a conta, em texto, como a parte o diz acima da lista. */
const textoDoPrazoDaConta = (dias: number) =>
  dias === 0
    ? 'O código é pedido em toda entrada.'
    : `O código é pedido de novo a cada ${textoDosDias(dias)} em cada aparelho confiável.`;

/**
 * Os aparelhos confiáveis da conta (spec ajustes-do-sistema, "Seção Conta"; change
 * aparelho-confiavel, design, decisão 6): o prazo que vale, em texto, e cada aparelho com desde
 * quando é confiável, o último uso e até quando vale, com "Este aparelho" no navegador atual,
 * "Esquecer" em cada um e "Esquecer todos".
 */
function AparelhosConfiaveis() {
  const api = useApi();
  const { formatarHorario } = useDataHora();
  const lerAparelhos = useCallback(
    () => pedir(() => api.GET('/conta/aparelhos'), 'carregar os aparelhos confiáveis'),
    [api],
  );
  const { leitura, tentarDeNovo, atualizar } = useLeitura(CHAVE_DOS_APARELHOS, lerAparelhos);
  useFocoQuandoAparecer(leitura.tipo === 'pronta', 'aparelhos-confiaveis');
  /** O aparelho que está sendo esquecido, ou "todos". */
  const [esquecendo, definirEsquecendo] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [aviso, definirAviso] = useState<string | null>(null);
  const idDoTitulo = useId();

  if (leitura.tipo === 'carregando') {
    return (
      <p role="status" className={estilos.informacao}>
        Carregando os aparelhos confiáveis…
      </p>
    );
  }
  if (leitura.tipo === 'erro') {
    return (
      <div className={estilos.falha}>
        <p role="alert" className={estilos.informacao}>
          {leitura.erro}
        </p>
        <div>
          <Botao onPress={() => void tentarDeNovo()}>Tentar de novo</Botao>
        </div>
      </div>
    );
  }

  async function esquecer(alvo: string, fazer: () => ReturnType<typeof pedir<unknown>>) {
    definirEsquecendo(alvo);
    definirFalha(null);
    definirAviso(null);
    const resultado = await fazer();
    definirEsquecendo(null);
    if ('erro' in resultado) {
      definirFalha(resultado.erro);
      definirTentativa((anterior) => anterior + 1);
      return false;
    }
    return true;
  }

  const { prazo, aparelhos }: AparelhosDaConta = leitura.dados;
  return (
    <>
      <p className={estilos.informacao}>{textoDoPrazoDaConta(prazo.dias)}</p>
      {aparelhos.length === 0 ? (
        <p className={estilos.informacao}>Nenhum aparelho confiável.</p>
      ) : (
        <ul aria-label="Aparelhos confiáveis" className={estilos.sessoes}>
          {aparelhos.map((aparelho) => (
            <li key={aparelho.id} className={estilos.sessao}>
              <p className={estilos.cabecalhoDaSessao}>
                <strong id={`${idDoTitulo}-${aparelho.id}`}>{aparelho.dispositivo}</strong>
                {aparelho.esteAparelho && <span className={estilos.marca}>Este aparelho</span>}
              </p>
              <ListaDeDados
                itens={[
                  {
                    rotulo: 'Confiável desde',
                    valor: formatarHorario(new Date(aparelho.criadoEm)),
                  },
                  { rotulo: 'Último uso', valor: formatarHorario(new Date(aparelho.usadoEm)) },
                  { rotulo: 'Vale até', valor: formatarHorario(new Date(aparelho.valeAte)) },
                ]}
              />
              <div>
                <Botao
                  aria-describedby={`${idDoTitulo}-${aparelho.id}`}
                  carregando={esquecendo === aparelho.id}
                  rotuloCarregando="Esquecendo"
                  onPress={async () => {
                    const esqueceu = await esquecer(aparelho.id, () =>
                      pedir(
                        () =>
                          api.DELETE('/conta/aparelhos/{id}', {
                            params: { path: { id: aparelho.id } },
                          }),
                        'esquecer o aparelho',
                      ),
                    );
                    if (!esqueceu) return;
                    atualizar((atuais) => ({
                      ...atuais,
                      aparelhos: atuais.aparelhos.filter((outro) => outro.id !== aparelho.id),
                    }));
                    definirAviso('Aparelho esquecido.');
                  }}
                >
                  Esquecer
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
      {aviso && (
        <p role="status" className={estilos.informacao}>
          {aviso}
        </p>
      )}
      {aparelhos.length > 0 && (
        <div>
          <Botao
            nivel="destrutivo"
            carregando={esquecendo === 'todos'}
            rotuloCarregando="Esquecendo"
            onPress={async () => {
              const esqueceu = await esquecer('todos', () =>
                pedir(() => api.DELETE('/conta/aparelhos'), 'esquecer os aparelhos'),
              );
              if (!esqueceu) return;
              atualizar((atuais) => ({ ...atuais, aparelhos: [] }));
              definirAviso('Aparelhos esquecidos.');
            }}
          >
            Esquecer todos
          </Botao>
        </div>
      )}
    </>
  );
}
