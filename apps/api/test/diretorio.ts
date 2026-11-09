// O AD em memória dos testes de integração (change integracao-ad-ldap, design, decisão 1): os
// usuários com a senha e o userAccountControl, os grupos com os membros, o memberOf calculado, a
// conta de serviço conferida e o AD fora do ar. Ele cumpre o mesmo ClienteDoDiretorio do ldapts.
import { comSituacaoNoAd, contaAtivaNoAd, normalizarDn } from '@grafite/domain';
import {
  type AcessoAoDiretorio,
  type ConectarDiretorio,
  FalhaDoDiretorio,
  type GrupoDoDiretorio,
  type UsuarioDoDiretorio,
} from '../src/diretorio/cliente.ts';

interface UsuarioNoAd {
  dn: string;
  usuario: string;
  nome: string;
  email: string | null;
  senha: string;
  controle: number;
}

interface GrupoNoAd {
  dn: string;
  nome: string;
  membros: Set<string>;
}

export const CONTA_DE_SERVICO_DE_TESTE = {
  usuario: 'svc_grafite@empresa.local',
  senha: 'senha-do-servico',
};

export function criarAdDeTeste() {
  const usuarios = new Map<string, UsuarioNoAd>();
  const grupos = new Map<string, GrupoNoAd>();
  const estado = {
    foraDoAr: false,
    /**
     * A AC da empresa que emite o certificado do LDAPS, ou `null` com um certificado público: com
     * ela, a conferência ligada só passa com essa AC no acesso (change guia-do-diretorio).
     */
    acDaEmpresa: null as string | null,
    /** Cada conexão aberta, com a configuração e a conta de serviço que recebeu. */
    acessos: [] as AcessoAoDiretorio[],
  };

  const gruposDo = (dn: string) =>
    [...grupos.values()]
      .filter((grupo) => grupo.membros.has(normalizarDn(dn)))
      .map((grupo) => grupo.dn);
  const visao = (usuario: UsuarioNoAd): UsuarioDoDiretorio => ({
    dn: usuario.dn,
    usuario: usuario.usuario,
    nome: usuario.nome,
    email: usuario.email,
    ativa: contaAtivaNoAd(usuario.controle),
    grupos: gruposDo(usuario.dn),
  });
  const visaoDoGrupo = (grupo: GrupoNoAd): GrupoDoDiretorio => ({
    dn: grupo.dn,
    nome: grupo.nome,
    membros: grupo.membros.size,
  });
  const contem = (texto: string | null, termo: string) =>
    (texto ?? '').toLowerCase().includes(termo.trim().toLowerCase());
  const exigirUsuario = (dn: string) => {
    const usuario = usuarios.get(normalizarDn(dn));
    if (!usuario) throw new FalhaDoDiretorio('nao-encontrado');
    return usuario;
  };
  const exigirGrupo = (dn: string) => {
    const grupo = grupos.get(normalizarDn(dn));
    if (!grupo) throw new FalhaDoDiretorio('nao-encontrado');
    return grupo;
  };

  const conectar: ConectarDiretorio = (acesso) => {
    estado.acessos.push(acesso);
    const servico = async () => {
      if (estado.foraDoAr) throw new FalhaDoDiretorio('nao-respondeu');
      if (
        estado.acDaEmpresa &&
        acesso.conferirCertificado &&
        acesso.acDoServidor !== estado.acDaEmpresa
      ) {
        throw new FalhaDoDiretorio('certificado');
      }
      if (
        acesso.conta.usuario !== CONTA_DE_SERVICO_DE_TESTE.usuario ||
        acesso.conta.senha !== CONTA_DE_SERVICO_DE_TESTE.senha
      ) {
        throw new FalhaDoDiretorio('conta-recusada');
      }
    };
    return {
      async contarUsuarios(limite) {
        await servico();
        return Math.min(usuarios.size, limite + 1);
      },
      async autenticar(usuario, senha) {
        await servico();
        if (senha === '') return null;
        const achado = [...usuarios.values()].find(
          (candidato) => candidato.usuario.toLowerCase() === usuario.toLowerCase(),
        );
        // A conta desativada no AD é recusada no bind, como a senha errada.
        if (!achado || achado.senha !== senha || !contaAtivaNoAd(achado.controle)) return null;
        return visao(achado);
      },
      async buscarUsuarios(termo, limite) {
        await servico();
        return [...usuarios.values()]
          .filter(
            (usuario) =>
              contem(usuario.usuario, termo) ||
              contem(usuario.nome, termo) ||
              contem(usuario.email, termo),
          )
          .slice(0, limite)
          .map(visao);
      },
      async usuario(dn) {
        await servico();
        const usuario = usuarios.get(normalizarDn(dn));
        return usuario ? visao(usuario) : null;
      },
      async buscarGrupos(termo, limite) {
        await servico();
        return [...grupos.values()]
          .filter((grupo) => contem(grupo.nome, termo))
          .slice(0, limite)
          .map(visaoDoGrupo);
      },
      async grupo(dn) {
        await servico();
        const grupo = grupos.get(normalizarDn(dn));
        return grupo ? visaoDoGrupo(grupo) : null;
      },
      async membros(grupoDn, limite) {
        await servico();
        const grupo = exigirGrupo(grupoDn);
        return [...grupo.membros]
          .flatMap((dn) => {
            const usuario = usuarios.get(dn);
            return usuario ? [visao(usuario)] : [];
          })
          .slice(0, limite);
      },
      async incluirNoGrupo(usuarioDn, grupoDn) {
        await servico();
        exigirUsuario(usuarioDn);
        exigirGrupo(grupoDn).membros.add(normalizarDn(usuarioDn));
      },
      async tirarDoGrupo(usuarioDn, grupoDn) {
        await servico();
        exigirGrupo(grupoDn).membros.delete(normalizarDn(usuarioDn));
      },
      async mudarSituacao(usuarioDn, ativa) {
        await servico();
        const usuario = exigirUsuario(usuarioDn);
        usuario.controle = comSituacaoNoAd(usuario.controle, ativa);
      },
      async redefinirSenha(usuarioDn, senha) {
        await servico();
        if (senha.length < 8) throw new FalhaDoDiretorio('politica-da-senha');
        exigirUsuario(usuarioDn).senha = senha;
      },
    };
  };

  return {
    conectar,
    estado,
    /** Um usuário do AD, com o DN dele. */
    usuario(dados: {
      usuario: string;
      nome: string;
      senha: string;
      email?: string;
      ativa?: boolean;
    }): string {
      const dn = `CN=${dados.nome},OU=Usuarios,DC=empresa,DC=local`;
      usuarios.set(normalizarDn(dn), {
        dn,
        usuario: dados.usuario,
        nome: dados.nome,
        email: dados.email ?? null,
        senha: dados.senha,
        controle: comSituacaoNoAd(512, dados.ativa ?? true),
      });
      return dn;
    },
    /** Um grupo do AD, com os membros dados pelos DNs. */
    grupo(nome: string, membros: string[] = []): string {
      const dn = `CN=${nome},OU=Grupos,DC=empresa,DC=local`;
      grupos.set(normalizarDn(dn), { dn, nome, membros: new Set(membros.map(normalizarDn)) });
      return dn;
    },
    incluir(usuarioDn: string, grupoDn: string) {
      grupos.get(normalizarDn(grupoDn))?.membros.add(normalizarDn(usuarioDn));
    },
    tirar(usuarioDn: string, grupoDn: string) {
      grupos.get(normalizarDn(grupoDn))?.membros.delete(normalizarDn(usuarioDn));
    },
    /** Os nomes dos grupos do usuário. */
    gruposDe(usuarioDn: string): string[] {
      return [...grupos.values()]
        .filter((grupo) => grupo.membros.has(normalizarDn(usuarioDn)))
        .map((grupo) => grupo.nome);
    },
    ativa(usuarioDn: string): boolean {
      return contaAtivaNoAd(usuarios.get(normalizarDn(usuarioDn))?.controle ?? 2);
    },
    senhaDe(usuarioDn: string): string | undefined {
      return usuarios.get(normalizarDn(usuarioDn))?.senha;
    },
  };
}

export type AdDeTeste = ReturnType<typeof criarAdDeTeste>;
