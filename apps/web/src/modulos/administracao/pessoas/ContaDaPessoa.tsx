import type { components } from '@grafite/api-client';
import { normalizarUsuario, validarUsuario } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeTexto,
  Checkbox,
  Dialogo,
  Formulario,
  ListaDeDados,
  MensagemDoPasso,
  RotuloDeSituacao,
  TextoParaCopiar,
  useDataHora,
} from '@grafite/ui';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useId, useRef, useState } from 'react';
import { type FalhaDoPedido, pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useSessao } from '../../../sessao/useSessao.tsx';
import estilos from '../Administracao.module.css';
import { Confirmacao } from '../Confirmacao.tsx';
import { type RecusaDoFormulario, recusaDe } from '../recusa.ts';
import type { Ficha } from './ficha.ts';
import { SITUACOES_DA_PESSOA } from './Pessoas.tsx';

export type Conta = components['schemas']['ContaDaFicha'];
type ContaComSenha = components['schemas']['ContaComSenhaTemporaria'];

/** Põe na ficha a conta como a API a devolveu; com `sessoes`, as sessões dela também mudaram. */
export type AplicarNaConta = (conta: Conta, opcoes?: { sessoes?: boolean }) => void;

/** O que a administração escolhe na conta: o usuário e a exigência dos dois passos. */
interface CamposDaConta {
  usuario: string;
  exigeDoisPassos: boolean;
}

const textoDosDoisPassos = (conta: Conta) =>
  `${conta.doisPassos === 'ativa' ? 'Ativa' : 'Desativada'}${
    conta.exigeDoisPassos ? ', exigida para esta conta' : ''
  }`;

/**
 * A conta da pessoa na aba Acesso (spec administracao-de-pessoas): os dados e as ações que a API
 * permite, com as destrutivas separadas das outras e confirmadas. A própria conta se cuida nos
 * Ajustes.
 */
export function ContaDaPessoa({
  pessoa,
  conta,
  aplicar,
}: {
  pessoa: Ficha;
  conta: Conta;
  aplicar: AplicarNaConta;
}) {
  const api = useApi();
  const sessao = useSessao();
  const { formatarHorario } = useDataHora();
  const [emAndamento, definirEmAndamento] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const { permite } = conta;
  const propria =
    sessao.tipo === 'ativa' && conta.usuario !== null && conta.usuario === sessao.conta.usuario;
  const situacao = SITUACOES_DA_PESSOA[conta.situacao];
  const anonimizada = conta.situacao === 'anonimizada';

  /** Uma ação sem confirmação, como "Desbloquear a entrada": a recusa aparece junto às ações. */
  async function agir(
    acao: string,
    fazer: () => Promise<{ dados: Conta } | FalhaDoPedido>,
    aviso: string,
  ) {
    definirEmAndamento(acao);
    definirFalha(null);
    const resultado = await fazer();
    definirEmAndamento(null);
    if ('erro' in resultado) {
      definirFalha(resultado.erro);
      definirTentativa((atual) => atual + 1);
      return;
    }
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: aviso });
  }

  /** Uma ação destrutiva confirmada: a conta como ficou vai para a ficha, com as sessões. */
  const confirmada =
    (fazer: () => Promise<{ dados: Conta } | FalhaDoPedido>, aviso: string) => async () => {
      const resultado = await fazer();
      if ('erro' in resultado) return resultado;
      aplicar(resultado.dados, { sessoes: true });
      avisar({ situacao: 'sucesso', titulo: aviso });
      return { ok: true } as const;
    };
  const naConta = { params: { path: { id: conta.id } } };

  return (
    <>
      <ListaDeDados
        itens={[
          { rotulo: 'Usuário', valor: conta.usuario ?? 'Sem usuário' },
          {
            rotulo: 'Situação',
            valor: <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>,
          },
          {
            rotulo: 'Senha',
            valor: anonimizada
              ? 'Sem senha'
              : conta.senhaTemporaria
                ? 'Temporária: a próxima entrada pede uma senha nova.'
                : 'Escolhida pela pessoa',
          },
          { rotulo: 'Verificação em dois passos', valor: textoDosDoisPassos(conta) },
          ...(conta.entradaBloqueadaAte
            ? [
                {
                  rotulo: 'Entrada',
                  valor: `Bloqueada pelas tentativas erradas até ${formatarHorario(new Date(conta.entradaBloqueadaAte))}`,
                },
              ]
            : []),
          {
            rotulo: 'Última entrada',
            valor: conta.ultimaEntradaEm
              ? formatarHorario(new Date(conta.ultimaEntradaEm))
              : 'Nunca entrou',
          },
        ]}
      />
      {propria && (
        <p className={estilos.informacao}>
          Esta é a sua conta. Cuide dela na{' '}
          <Link to="/ajustes/conta" className={estilos.link}>
            seção Conta dos Ajustes
          </Link>
          .
        </p>
      )}
      {(permite.editar || permite.desbloquear || permite.reativar) && (
        <div className={estilos.acoes}>
          {permite.editar && <AlterarConta pessoa={pessoa} conta={conta} aplicar={aplicar} />}
          {permite.desbloquear && (
            <Botao
              carregando={emAndamento === 'desbloquear'}
              rotuloCarregando="Desbloqueando"
              onPress={() =>
                agir(
                  'desbloquear',
                  () =>
                    pedir(
                      () => api.POST('/contas/{id}/desbloqueio', naConta),
                      'desbloquear a entrada',
                    ),
                  'Entrada desbloqueada.',
                )
              }
            >
              Desbloquear a entrada
            </Botao>
          )}
          {permite.reativar && (
            <Botao
              carregando={emAndamento === 'reativar'}
              rotuloCarregando="Reativando"
              onPress={() =>
                agir(
                  'reativar',
                  () =>
                    pedir(() => api.POST('/contas/{id}/reativacao', naConta), 'reativar a conta'),
                  'Conta reativada.',
                )
              }
            >
              Reativar a conta
            </Botao>
          )}
        </div>
      )}
      <MensagemDoPasso texto={falha} chave={tentativa} />
      {(permite.redefinir || permite.removerDoisPassos || permite.inativar) && (
        <div className={estilos.acoesDestrutivas}>
          {permite.redefinir && <RedefinirSenha pessoa={pessoa} conta={conta} aplicar={aplicar} />}
          {permite.removerDoisPassos && (
            <Confirmacao
              acao="Remover a verificação em dois passos"
              titulo={`Remover a verificação em dois passos de ${pessoa.nome}?`}
              confirmar="Remover a verificação"
              confirmando="Removendo"
              fazer={confirmada(
                () =>
                  pedir(
                    () => api.POST('/contas/{id}/remocao-dos-dois-passos', naConta),
                    'remover a verificação em dois passos',
                  ),
                'Verificação em dois passos removida.',
              )}
            >
              <p className={estilos.informacao}>
                As sessões abertas da conta terminam, e a próxima entrada pede só a senha. Se a
                verificação for exigida, a próxima entrada pede o cadastro dela de novo.
              </p>
            </Confirmacao>
          )}
          {permite.inativar && (
            <Confirmacao
              acao="Inativar a conta"
              titulo={`Inativar a conta de ${pessoa.nome}?`}
              confirmando="Inativando"
              fazer={confirmada(
                () => pedir(() => api.POST('/contas/{id}/inativacao', naConta), 'inativar a conta'),
                'Conta inativada.',
              )}
            >
              <p className={estilos.informacao}>
                As sessões abertas terminam, e a entrada passa a ser recusada. Os perfis e os grupos
                da conta continuam registrados, e ela pode ser reativada.
              </p>
            </Confirmacao>
          )}
        </div>
      )}
    </>
  );
}

/**
 * A pessoa sem conta: "Criar conta" para quem pode, que abre o diálogo da criação, ou o que falta
 * para criar.
 */
export function SemConta({ pessoa, aoCriarConta }: { pessoa: Ficha; aoCriarConta: () => void }) {
  const { pode } = useAcesso();
  return (
    <>
      <p className={estilos.informacao}>Esta pessoa não tem conta.</p>
      {pessoa.permite.criarConta ? (
        <div className={estilos.acoes}>
          <Botao nivel="primario" onPress={aoCriarConta}>
            Criar conta
          </Botao>
        </div>
      ) : (
        pessoa.situacao === 'inativa' &&
        pode('contas.administrar') && (
          <p className={estilos.informacao}>Reative a pessoa para criar a conta dela.</p>
        )
      )}
    </>
  );
}

/**
 * O formulário da conta num diálogo: o usuário conferido pela regra antes de enviar, e a recusa da
 * API no campo dele ou, sem campo, junto às ações.
 */
function useFormularioDaConta(
  enviar: (pedido: CamposDaConta) => Promise<{ ok: true } | RecusaDoFormulario<'usuario'>>,
) {
  const [campos, definirCampos] = useState<CamposDaConta>({ usuario: '', exigeDoisPassos: false });
  const [erro, definirErro] = useState<string | undefined>();
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const recusarUsuario = (motivo: string) => {
    definirErro(motivo);
    entrada.current?.focus();
  };

  return {
    campos,
    erro,
    falha,
    tentativa,
    enviando,
    entrada,
    /** Começa de novo com os campos dados, sem as recusas, ao abrir o diálogo. */
    comecar: (inicial: CamposDaConta) => {
      definirCampos(inicial);
      definirErro(undefined);
      definirFalha(null);
    },
    mudar: (mudanca: Partial<CamposDaConta>) => {
      definirCampos((atuais) => ({ ...atuais, ...mudanca }));
      if (mudanca.usuario !== undefined) definirErro(undefined);
    },
    aoEnviar: async (evento: FormEvent) => {
      evento.preventDefault();
      if (enviando) return;
      definirFalha(null);
      const motivo = validarUsuario(campos.usuario);
      if (motivo) return recusarUsuario(motivo);
      definirEnviando(true);
      try {
        const resultado = await enviar({
          usuario: normalizarUsuario(campos.usuario),
          exigeDoisPassos: campos.exigeDoisPassos,
        });
        if ('ok' in resultado) return;
        if (resultado.campos?.usuario) return recusarUsuario(resultado.campos.usuario);
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
      } finally {
        definirEnviando(false);
      }
    },
  };
}

function FormularioDaConta({
  id,
  formulario,
  explicacao,
}: {
  id: string;
  formulario: ReturnType<typeof useFormularioDaConta>;
  explicacao?: string;
}) {
  const { campos, erro, falha, tentativa, entrada, mudar, aoEnviar } = formulario;
  return (
    <Formulario id={id} validationBehavior="aria" onSubmit={aoEnviar}>
      {explicacao && <p className={estilos.informacao}>{explicacao}</p>}
      <CampoDeTexto
        ref={entrada}
        rotulo="Usuário"
        obrigatorio
        autoComplete="off"
        value={campos.usuario}
        onChange={(usuario) => mudar({ usuario })}
        erro={erro}
      />
      <Checkbox
        isSelected={campos.exigeDoisPassos}
        onChange={(exigeDoisPassos) => mudar({ exigeDoisPassos })}
      >
        Exigir a verificação em dois passos
      </Checkbox>
      <MensagemDoPasso texto={falha} chave={tentativa} />
    </Formulario>
  );
}

/**
 * A senha temporária, mostrada uma vez só (spec administracao-de-pessoas), com "Copiar" e o aviso
 * de que ela não aparece de novo.
 */
function SenhaTemporaria({ usuario, senha }: { usuario: string | null; senha: string }) {
  return (
    <>
      <p className={estilos.informacao}>
        Passe à pessoa o usuário {usuario} e a senha temporária. Na primeira entrada, a pessoa
        escolhe uma senha nova.
      </p>
      <TextoParaCopiar rotulo="Senha temporária" valor={senha} />
      <p className={estilos.informacao}>
        Esta senha não aparece de novo. Se ela se perder, redefina a senha.
      </p>
    </>
  );
}

/**
 * Criar a conta: o usuário e a exigência num diálogo, que depois mostra a senha temporária. Quem o
 * usa o põe fora do trecho que a releitura troca (spec eventos-em-tempo-real): o evento da criação
 * relê a ficha, que já mostra a conta, e a senha, que não aparece de novo, continua à vista até o
 * diálogo fechar. Ao fechar, a conta entra na ficha, e o foco vai ao título da conta. Cada abertura
 * começa de novo, com o diálogo montado outra vez.
 */
export function CriarConta({
  pessoa,
  aberto,
  aoFechar,
  aplicar,
}: {
  pessoa: Ficha;
  aberto: boolean;
  /** O diálogo fechou, depois de criar a conta ou não. */
  aoFechar: (criou: boolean) => void;
  aplicar: AplicarNaConta;
}) {
  const api = useApi();
  const id = useId();
  const [criada, definirCriada] = useState<ContaComSenha | null>(null);
  const formulario = useFormularioDaConta(async (pedido) => {
    const resultado = await pedir(
      () => api.POST('/pessoas/{id}/conta', { params: { path: { id: pessoa.id } }, body: pedido }),
      'criar a conta',
    );
    if ('erro' in resultado) return recusaDe(resultado);
    definirCriada(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: 'Conta criada.' });
    return { ok: true };
  });
  return (
    <Dialogo
      titulo={criada ? 'Conta criada' : `Criar a conta de ${pessoa.nome}`}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        if (abrir) return;
        aoFechar(criada !== null);
        if (criada) aplicar(criada.conta);
      }}
      acoes={(fechar) =>
        criada ? (
          <Botao nivel="primario" autoFocus onPress={fechar}>
            Concluir
          </Botao>
        ) : (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              type="submit"
              form={id}
              nivel="primario"
              carregando={formulario.enviando}
              rotuloCarregando="Criando"
            >
              Criar conta
            </Botao>
          </>
        )
      }
    >
      {criada ? (
        <SenhaTemporaria usuario={criada.conta.usuario} senha={criada.senhaTemporaria} />
      ) : (
        <FormularioDaConta
          id={id}
          formulario={formulario}
          explicacao="A senha da conta é temporária e aparece uma vez só, a seguir. Na primeira entrada, a pessoa escolhe uma senha nova."
        />
      )}
    </Dialogo>
  );
}

/** Mudar o usuário e a exigência dos dois passos, num diálogo. */
function AlterarConta({
  pessoa,
  conta,
  aplicar,
}: {
  pessoa: Ficha;
  conta: Conta;
  aplicar: AplicarNaConta;
}) {
  const api = useApi();
  const id = useId();
  const [aberto, definirAberto] = useState(false);
  const formulario = useFormularioDaConta(async (pedido) => {
    const resultado = await pedir(
      () => api.PATCH('/contas/{id}', { params: { path: { id: conta.id } }, body: pedido }),
      'alterar a conta',
    );
    if ('erro' in resultado) return recusaDe(resultado);
    definirAberto(false);
    aplicar(resultado.dados);
    avisar({ situacao: 'sucesso', titulo: 'Conta alterada.' });
    return { ok: true };
  });
  return (
    <Dialogo
      titulo={`Alterar a conta de ${pessoa.nome}`}
      gatilho={<Botao>Alterar a conta</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        definirAberto(abrir);
        if (abrir) {
          formulario.comecar({
            usuario: conta.usuario ?? '',
            exigeDoisPassos: conta.exigeDoisPassos,
          });
        }
      }}
      acoes={(fechar) => (
        <>
          <Botao onPress={fechar}>Cancelar</Botao>
          <Botao
            type="submit"
            form={id}
            nivel="primario"
            carregando={formulario.enviando}
            rotuloCarregando="Salvando"
          >
            Salvar alterações
          </Botao>
        </>
      )}
    >
      <FormularioDaConta id={id} formulario={formulario} />
    </Dialogo>
  );
}

/**
 * Redefinir a senha: a confirmação, com a remoção dos dois passos à escolha, e depois a senha
 * temporária nova, mostrada uma vez só.
 */
function RedefinirSenha({
  pessoa,
  conta,
  aplicar,
}: {
  pessoa: Ficha;
  conta: Conta;
  aplicar: AplicarNaConta;
}) {
  const api = useApi();
  const [aberto, definirAberto] = useState(false);
  const [removerDoisPassos, definirRemoverDoisPassos] = useState(false);
  const [senha, definirSenha] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  async function redefinir() {
    definirEnviando(true);
    definirFalha(null);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/contas/{id}/redefinicao', {
            params: { path: { id: conta.id } },
            body: { removerDoisPassos },
          }),
        'redefinir a senha',
      );
      if ('erro' in resultado) {
        definirFalha(resultado.erro);
        definirTentativa((atual) => atual + 1);
        return;
      }
      definirSenha(resultado.dados.senhaTemporaria);
      aplicar(resultado.dados.conta, { sessoes: true });
      avisar({ situacao: 'sucesso', titulo: 'Senha redefinida.' });
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <Dialogo
      alerta
      titulo={senha ? 'Senha redefinida' : `Redefinir a senha de ${pessoa.nome}?`}
      gatilho={<Botao nivel="destrutivo">Redefinir a senha</Botao>}
      aberto={aberto}
      aoMudarAberto={(abrir) => {
        // Ao abrir, a confirmação começa de novo; ao fechar, a senha sai da tela.
        definirAberto(abrir);
        definirSenha(null);
        definirRemoverDoisPassos(false);
        definirFalha(null);
      }}
      acoes={(fechar) =>
        senha ? (
          <Botao nivel="primario" autoFocus onPress={fechar}>
            Concluir
          </Botao>
        ) : (
          <>
            <Botao onPress={fechar}>Cancelar</Botao>
            <Botao
              nivel="destrutivo"
              carregando={enviando}
              rotuloCarregando="Redefinindo"
              onPress={redefinir}
            >
              Redefinir a senha
            </Botao>
          </>
        )
      }
    >
      {senha ? (
        <SenhaTemporaria usuario={conta.usuario} senha={senha} />
      ) : (
        <>
          <p className={estilos.informacao}>
            A senha atual para de funcionar, e as sessões abertas da conta terminam. A senha nova é
            temporária: na primeira entrada, a pessoa escolhe outra.
          </p>
          {conta.doisPassos === 'ativa' && (
            <Checkbox isSelected={removerDoisPassos} onChange={definirRemoverDoisPassos}>
              Remover também a verificação em dois passos
            </Checkbox>
          )}
          <MensagemDoPasso texto={falha} chave={tentativa} />
        </>
      )}
    </Dialogo>
  );
}
