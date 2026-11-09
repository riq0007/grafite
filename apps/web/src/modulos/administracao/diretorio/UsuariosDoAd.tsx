import {
  avisar,
  Botao,
  CabecalhoDaTabela,
  CampoDeSenha,
  CampoDeTexto,
  Celula,
  Coluna,
  CorpoDaTabela,
  Dialogo,
  EstadoVazio,
  Linha,
  RotuloDeSituacao,
  Selecao,
  Tabela,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { Confirmacao } from '../Confirmacao.tsx';
import {
  CHAVE_DO_DIRETORIO,
  type EstadoDoDiretorio,
  type UsuarioNoDiretorio,
  useGruposDoAd,
  useUsuariosDoAd,
} from './consultas.ts';
import estilosDoDiretorio from './Diretorio.module.css';

/** A busca no AD: o campo e o "Buscar no AD", que pede a busca com o termo. */
export function BuscaNoAd({
  rotulo,
  aoBuscar,
}: {
  rotulo: string;
  aoBuscar: (termo: string) => void;
}) {
  const [termo, definirTermo] = useState('');
  return (
    <form
      className={estilosDoDiretorio.busca}
      noValidate
      onSubmit={(evento: FormEvent) => {
        evento.preventDefault();
        aoBuscar(termo.trim());
      }}
    >
      <CampoDeTexto rotulo={rotulo} autoComplete="off" value={termo} onChange={definirTermo} />
      <Botao type="submit">Buscar no AD</Botao>
    </form>
  );
}

/** A situação da conta no AD em texto. */
export function SituacaoNoAd({ ativa }: { ativa: boolean }) {
  return (
    <RotuloDeSituacao situacao={ativa ? 'sucesso' : 'neutra'}>
      {ativa ? 'Ativa' : 'Desativada'}
    </RotuloDeSituacao>
  );
}

/** Os grupos do AD do usuário, com o grupo do Grafite de cada mapeado. */
function GruposDoUsuario({ usuario }: { usuario: UsuarioNoDiretorio }) {
  if (usuario.grupos.length === 0) return 'Nenhum grupo';
  return (
    <span className={estilosDoDiretorio.grupos}>
      {usuario.grupos.map((grupo) => (
        <span key={grupo.dn}>
          {grupo.mapeadoPara ? `${grupo.nome} (${grupo.mapeadoPara.nome})` : grupo.nome}
        </span>
      ))}
    </span>
  );
}

type DialogoAberto =
  | { tipo: 'liberar'; usuario: UsuarioNoDiretorio }
  | { tipo: 'grupos'; usuario: UsuarioNoDiretorio }
  | { tipo: 'senha'; usuario: UsuarioNoDiretorio };

/**
 * A aba Usuários (spec diretorio-ad, "Gerência dos usuários do AD"): a busca e a tabela na largura
 * toda, com a situação em texto e os grupos, e as ações de cada um: liberar o acesso, os grupos,
 * ativar e desativar no AD e redefinir a senha.
 */
export function UsuariosDoAd({ estado }: { estado: EstadoDoDiretorio }) {
  const api = useApi();
  const consultas = useQueryClient();
  const [buscada, definirBuscada] = useState<string | null>(null);
  const usuarios = useUsuariosDoAd(buscada ?? '', buscada !== null);
  const [dialogo, definirDialogo] = useState<DialogoAberto | null>(null);
  const [ocupado, definirOcupado] = useState<string | null>(null);

  const reler = () =>
    consultas.invalidateQueries({ queryKey: [...CHAVE_DO_DIRETORIO, 'usuarios'] });

  async function mudarSituacao(
    usuario: UsuarioNoDiretorio,
    ativa: boolean,
  ): Promise<{ ok: true } | { erro: string }> {
    const resultado = await pedir(
      () => api.POST('/diretorio/usuarios/situacao', { body: { dn: usuario.dn, ativa } }),
      ativa ? 'ativar a conta no AD' : 'desativar a conta no AD',
    );
    if ('erro' in resultado) return { erro: resultado.erro };
    avisar({
      situacao: 'sucesso',
      titulo: `Conta de ${usuario.nome} ${ativa ? 'ativada' : 'desativada'} no AD.`,
    });
    await reler();
    return { ok: true };
  }

  return (
    <section className={estilos.parte} aria-labelledby="usuarios-do-ad">
      <h2 id="usuarios-do-ad" className={estilos.tituloDaParte}>
        Usuários do AD
      </h2>
      <BuscaNoAd rotulo="Buscar pelo usuário, nome ou e-mail" aoBuscar={definirBuscada} />
      {usuarios.isError && <p className={estilos.falha}>{usuarios.error.message}</p>}
      {buscada === null ? (
        <p className={estilos.informacao}>
          Busque no AD pelo usuário, pelo nome ou pelo e-mail; a busca traz até 50 pessoas.
        </p>
      ) : (
        usuarios.data && (
          <Tabela rotulo="Usuários do AD">
            <CabecalhoDaTabela>
              <Coluna id="nome" principal>
                Nome
              </Coluna>
              <Coluna id="usuario">Usuário</Coluna>
              <Coluna id="email">E-mail</Coluna>
              <Coluna id="situacao" especie="situacao">
                Situação
              </Coluna>
              <Coluna id="grupos">Grupos</Coluna>
              <Coluna id="acoes" especie="acoes">
                Ações
              </Coluna>
            </CabecalhoDaTabela>
            <CorpoDaTabela
              itens={usuarios.data.usuarios.map((usuario) => ({ ...usuario, id: usuario.dn }))}
              vazio={<EstadoVazio titulo="Nenhum usuário do AD achado." />}
            >
              {(usuario) => (
                <Linha id={usuario.id}>
                  <Celula>{usuario.nome}</Celula>
                  <Celula>{usuario.usuario}</Celula>
                  <Celula>{usuario.email ?? '—'}</Celula>
                  <Celula>
                    <SituacaoNoAd ativa={usuario.ativa} />
                  </Celula>
                  <Celula>
                    <GruposDoUsuario usuario={usuario} />
                  </Celula>
                  <Celula>
                    <span className={estilos.acoes}>
                      {!usuario.grupos.some((grupo) => grupo.mapeadoPara) && (
                        <Botao
                          nivel="primario"
                          aria-label={`Liberar acesso de ${usuario.nome}`}
                          onPress={() => definirDialogo({ tipo: 'liberar', usuario })}
                        >
                          Liberar acesso
                        </Botao>
                      )}
                      <Botao
                        nivel="terciario"
                        aria-label={`Grupos de ${usuario.nome}`}
                        onPress={() => definirDialogo({ tipo: 'grupos', usuario })}
                      >
                        Grupos
                      </Botao>
                      {usuario.ativa ? (
                        <Confirmacao
                          acao="Desativar"
                          nomeDoGatilho={`Desativar a conta de ${usuario.nome} no AD`}
                          nivelDoGatilho="terciario"
                          titulo={`Desativar a conta de ${usuario.nome} no AD?`}
                          confirmar="Desativar no AD"
                          confirmando="Desativando"
                          fazer={() => mudarSituacao(usuario, false)}
                        >
                          A pessoa deixa de entrar no Windows, no e-mail e no Grafite até a conta
                          ser ativada de novo.
                        </Confirmacao>
                      ) : (
                        <Botao
                          nivel="terciario"
                          aria-label={`Ativar a conta de ${usuario.nome} no AD`}
                          carregando={ocupado === usuario.dn}
                          rotuloCarregando="Ativando"
                          onPress={async () => {
                            definirOcupado(usuario.dn);
                            const resultado = await mudarSituacao(usuario, true);
                            definirOcupado(null);
                            if ('erro' in resultado) {
                              avisar({ situacao: 'critico', titulo: resultado.erro });
                            }
                          }}
                        >
                          Ativar
                        </Botao>
                      )}
                      <Botao
                        nivel="terciario"
                        aria-label={`Redefinir a senha de ${usuario.nome}`}
                        onPress={() => definirDialogo({ tipo: 'senha', usuario })}
                      >
                        Senha
                      </Botao>
                    </span>
                  </Celula>
                </Linha>
              )}
            </CorpoDaTabela>
          </Tabela>
        )
      )}
      {dialogo?.tipo === 'liberar' && (
        <LiberarAcesso
          usuario={dialogo.usuario}
          estado={estado}
          aoFechar={() => definirDialogo(null)}
          aoMudar={reler}
        />
      )}
      {dialogo?.tipo === 'grupos' && (
        <GruposNoAd
          usuario={dialogo.usuario}
          aoFechar={() => definirDialogo(null)}
          aoMudar={reler}
        />
      )}
      {dialogo?.tipo === 'senha' && (
        <RedefinirSenha usuario={dialogo.usuario} aoFechar={() => definirDialogo(null)} />
      )}
    </section>
  );
}

/** Inclui ou tira o usuário de um grupo do AD; devolve o erro, ou nada. */
function useMembro() {
  const api = useApi();
  return async (operacao: 'incluir' | 'tirar', usuarioDn: string, grupoDn: string) => {
    const corpo = { body: { usuarioDn, grupoDn } };
    const resultado = await pedir(
      () =>
        operacao === 'incluir'
          ? api.POST('/diretorio/membros', corpo)
          : api.POST('/diretorio/membros/retirada', corpo),
      operacao === 'incluir' ? 'incluir no grupo' : 'tirar do grupo',
    );
    return 'erro' in resultado ? resultado.erro : null;
  };
}

/** Liberar o acesso: incluir o usuário num grupo mapeado do AD. */
function LiberarAcesso({
  usuario,
  estado,
  aoFechar,
  aoMudar,
}: {
  usuario: UsuarioNoDiretorio;
  estado: EstadoDoDiretorio;
  aoFechar: () => void;
  aoMudar: () => Promise<unknown>;
}) {
  const membro = useMembro();
  const [grupoDn, definirGrupoDn] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  const escolhido = estado.mapeamentos.find((mapeamento) => mapeamento.grupoDn === grupoDn);
  return (
    <Dialogo
      titulo={`Liberar acesso de ${usuario.nome}`}
      aberto
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={
        <>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            isDisabled={!escolhido}
            carregando={enviando}
            rotuloCarregando="Liberando"
            onPress={async () => {
              if (!escolhido) return;
              definirEnviando(true);
              const erro = await membro('incluir', usuario.dn, escolhido.grupoDn);
              definirEnviando(false);
              if (erro) {
                definirFalha(erro);
                return;
              }
              avisar({
                situacao: 'sucesso',
                titulo: `${usuario.nome} agora é de ${escolhido.nomeNoAd} e entra como ${escolhido.grupo.nome}.`,
              });
              await aoMudar();
              aoFechar();
            }}
          >
            Liberar acesso
          </Botao>
        </>
      }
    >
      {estado.mapeamentos.length === 0 ? (
        <p>Nenhum grupo do AD está mapeado. Mapeie um grupo na Configuração.</p>
      ) : (
        <Selecao
          rotulo="Grupo do AD"
          descricao="O AD inclui a pessoa no grupo, e ela entra no Grafite com o grupo mapeado."
          opcoes={estado.mapeamentos.map((mapeamento) => ({
            id: mapeamento.grupoDn,
            rotulo: `${mapeamento.nomeNoAd} (entra como ${mapeamento.grupo.nome})`,
          }))}
          selectedKey={grupoDn}
          onSelectionChange={(chave) => definirGrupoDn(String(chave))}
        />
      )}
      {falha && <p className={estilos.falha}>{falha}</p>}
    </Dialogo>
  );
}

/** Os grupos do AD do usuário: tirar de cada um e incluir num grupo achado pela busca. */
function GruposNoAd({
  usuario,
  aoFechar,
  aoMudar,
}: {
  usuario: UsuarioNoDiretorio;
  aoFechar: () => void;
  aoMudar: () => Promise<unknown>;
}) {
  const membro = useMembro();
  const [grupos, definirGrupos] = useState(usuario.grupos);
  const [buscada, definirBuscada] = useState<string | null>(null);
  const achados = useGruposDoAd(buscada ?? '', buscada !== null);
  const [escolhido, definirEscolhido] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [ocupado, definirOcupado] = useState<string | null>(null);

  async function mudar(operacao: 'incluir' | 'tirar', grupoDn: string, nome: string) {
    definirOcupado(grupoDn);
    definirFalha(null);
    const erro = await membro(operacao, usuario.dn, grupoDn);
    definirOcupado(null);
    if (erro) {
      definirFalha(erro);
      return;
    }
    definirGrupos((atuais) =>
      operacao === 'tirar'
        ? atuais.filter((grupo) => grupo.dn !== grupoDn)
        : [...atuais, { dn: grupoDn, nome, mapeadoPara: null }],
    );
    avisar({
      situacao: 'sucesso',
      titulo:
        operacao === 'tirar'
          ? `${usuario.nome} saiu de ${nome}.`
          : `${usuario.nome} agora é de ${nome}.`,
    });
    await aoMudar();
  }

  return (
    <Dialogo
      titulo={`Grupos de ${usuario.nome} no AD`}
      aberto
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={<Botao onPress={aoFechar}>Fechar</Botao>}
    >
      {grupos.length === 0 ? (
        <p>Nenhum grupo.</p>
      ) : (
        <ul aria-label="Grupos do usuário" className={estilos.itens}>
          {grupos.map((grupo) => (
            <li key={grupo.dn} className={estilos.item}>
              <span className={estilos.textoDoItem}>
                <span className={estilos.nomeDoItem}>{grupo.nome}</span>
                {grupo.mapeadoPara && (
                  <span className={estilos.detalheDoItem}>
                    {`Dá acesso como ${grupo.mapeadoPara.nome}`}
                  </span>
                )}
              </span>
              <Botao
                nivel="terciario"
                aria-label={`Tirar de ${grupo.nome}`}
                carregando={ocupado === grupo.dn}
                rotuloCarregando="Tirando"
                onPress={() => void mudar('tirar', grupo.dn, grupo.nome)}
              >
                Tirar
              </Botao>
            </li>
          ))}
        </ul>
      )}
      <BuscaNoAd rotulo="Buscar o grupo do AD" aoBuscar={definirBuscada} />
      {achados.isError && <p className={estilos.falha}>{achados.error.message}</p>}
      {achados.data && (
        <>
          <Selecao
            rotulo="Grupo para incluir"
            opcoes={achados.data.grupos
              .filter((grupo) => !grupos.some((atual) => atual.dn === grupo.dn))
              .map((grupo) => ({ id: grupo.dn, rotulo: grupo.nome }))}
            placeholder={achados.data.grupos.length === 0 ? 'Nenhum grupo achado' : 'Selecione'}
            selectedKey={escolhido}
            onSelectionChange={(chave) => definirEscolhido(String(chave))}
          />
          <Botao
            isDisabled={!escolhido}
            carregando={ocupado === escolhido}
            rotuloCarregando="Incluindo"
            onPress={() => {
              const grupo = achados.data.grupos.find((achado) => achado.dn === escolhido);
              if (grupo) void mudar('incluir', grupo.dn, grupo.nome);
            }}
          >
            Incluir no grupo
          </Botao>
        </>
      )}
      {falha && <p className={estilos.falha}>{falha}</p>}
    </Dialogo>
  );
}

/** A senha nova vai só para o AD, pelo LDAPS, e sai da tela com o diálogo. */
function RedefinirSenha({
  usuario,
  aoFechar,
}: {
  usuario: UsuarioNoDiretorio;
  aoFechar: () => void;
}) {
  const api = useApi();
  const [senha, definirSenha] = useState('');
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  return (
    <Dialogo
      titulo={`Redefinir a senha de ${usuario.nome}`}
      aberto
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      acoes={
        <>
          <Botao onPress={aoFechar}>Cancelar</Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando="Redefinindo"
            onPress={async () => {
              if (senha === '') {
                definirFalha('Informe a senha nova.');
                return;
              }
              definirEnviando(true);
              const resultado = await pedir(
                () => api.POST('/diretorio/usuarios/senha', { body: { dn: usuario.dn, senha } }),
                'redefinir a senha',
              );
              definirEnviando(false);
              if ('erro' in resultado) {
                definirFalha(resultado.erro);
                return;
              }
              avisar({ situacao: 'sucesso', titulo: `Senha de ${usuario.nome} redefinida no AD.` });
              aoFechar();
            }}
          >
            Redefinir
          </Botao>
        </>
      }
    >
      <p>A senha nova vai só para o AD e não fica guardada no Grafite.</p>
      <CampoDeSenha
        rotulo="Senha nova"
        autoComplete="new-password"
        value={senha}
        onChange={(texto) => {
          definirSenha(texto);
          definirFalha(null);
        }}
        erro={falha ?? undefined}
      />
    </Dialogo>
  );
}
