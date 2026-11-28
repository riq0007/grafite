//! O pipe local entre a aba e o serviço do Windows (change aba-dos-colaboradores, design, decisão 1).
//!
//! O serviço, que roda como o sistema, cria o pipe com a DACL explícita, a primeira instância e a
//! recusa dos clientes remotos, e sabe quem chama pelo próprio Windows (`ImpersonateNamedPipeClient`),
//! sem aceitar o que a tela diz. A aba abre o pipe só para a identificação e confere, pelo
//! `GetNamedPipeServerProcessId`, que do outro lado está o processo do serviço `GrafiteAba`, rodando
//! como o sistema: o pipe falso de outro usuário é recusado. As mensagens vão inteiras, no modo de
//! mensagem do pipe, até 64 KiB, um pedido e uma resposta em JSON por conexão (`protocolo`).

use std::fmt;
use std::io;

#[cfg(windows)]
mod cliente;
#[cfg(windows)]
mod prazo;
mod protocolo;
#[cfg(windows)]
mod seguranca;
#[cfg(windows)]
mod servidor;

#[cfg(windows)]
pub use cliente::{Cliente, conferir_o_servico};
#[cfg(windows)]
pub use prazo::com_prazo;
pub use protocolo::{Aparelho, Configuracao, Entrada, Forma, Pedido, Resposta, Situacao};
#[cfg(windows)]
pub use seguranca::Descritor;
#[cfg(windows)]
pub use servidor::Instancia;

/// O pipe do serviço, na máquina local.
pub const NOME_DO_PIPE: &str = r"\\.\pipe\grafite-aba";
/// O nome do serviço no Windows, que a aba confere do outro lado do pipe.
pub const NOME_DO_SERVICO: &str = "GrafiteAba";
/// A conta do serviço, como o gerenciador de serviços a escreve.
pub const CONTA_DO_SERVICO: &str = "LocalSystem";

/// A DACL do pipe, protegida da herança: o sistema com tudo, e os usuários interativos só ler e
/// escrever (`0x12019b`: o `FILE_GENERIC_READ` e o `FILE_GENERIC_WRITE` sem o
/// `FILE_CREATE_PIPE_INSTANCE`, para ninguém além do sistema criar outra instância do pipe).
pub const DACL_DO_PIPE: &str = "D:P(A;;GA;;;SY)(A;;0x12019b;;;IU)";

/// A maior mensagem, nos dois sentidos.
pub const TAMANHO_MAXIMO: usize = 64 * 1024;

/// Quem está do outro lado do pipe, pelo token do Windows, e não pelo que a tela diz.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chamador {
    /// O SID em texto, como `S-1-5-21-…`.
    pub sid: String,
    /// O nome com o domínio, como `EMPRESA\fernanda`, que vai só à auditoria.
    pub nome: String,
    /// A sessão do Windows de quem chama: cada pessoa no RDP tem a sua aba.
    pub sessao: u32,
}

#[derive(Debug)]
pub enum Erro {
    /// O serviço da aba não está instalado ou não está rodando.
    SemServico,
    /// Do outro lado do pipe está outro processo, e não o serviço da aba como o sistema.
    ServidorFalso {
        processo: u32,
    },
    /// A mensagem passa dos 64 KiB.
    MensagemGrande,
    /// O outro lado fechou o pipe.
    Fechado,
    Windows(io::Error),
}

impl fmt::Display for Erro {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SemServico => write!(f, "o serviço da aba não está rodando"),
            Self::ServidorFalso { processo } => {
                write!(
                    f,
                    "o processo {processo} do outro lado do pipe não é o serviço da aba"
                )
            }
            Self::MensagemGrande => write!(f, "a mensagem passa de {TAMANHO_MAXIMO} bytes"),
            Self::Fechado => write!(f, "o outro lado fechou o pipe"),
            Self::Windows(erro) => write!(f, "o Windows recusou: {erro}"),
        }
    }
}

impl std::error::Error for Erro {}

impl From<io::Error> for Erro {
    fn from(erro: io::Error) -> Self {
        Self::Windows(erro)
    }
}

/// A conferência do lado da aba: o processo do pipe é o do serviço, que está rodando, e o serviço é
/// o do sistema. O gerenciador de serviços é a fonte, e só o administrador muda o serviço.
pub fn conferir(
    processo_do_pipe: u32,
    processo_do_servico: u32,
    conta_do_servico: &str,
) -> Result<(), Erro> {
    if processo_do_servico == 0 {
        return Err(Erro::SemServico);
    }
    if processo_do_pipe != processo_do_servico
        || !conta_do_servico.eq_ignore_ascii_case(CONTA_DO_SERVICO)
    {
        return Err(Erro::ServidorFalso {
            processo: processo_do_pipe,
        });
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_pipe_do_servico_e_o_da_aba() {
        assert_eq!(NOME_DO_PIPE, r"\\.\pipe\grafite-aba");
        assert_eq!(NOME_DO_SERVICO, "GrafiteAba");
    }

    #[test]
    fn o_processo_do_servico_como_o_sistema_e_aceito() {
        assert!(conferir(4120, 4120, "LocalSystem").is_ok());
        assert!(conferir(4120, 4120, "localsystem").is_ok());
    }

    #[test]
    fn outro_processo_no_pipe_e_o_servidor_falso() {
        assert!(matches!(
            conferir(9001, 4120, "LocalSystem"),
            Err(Erro::ServidorFalso { processo: 9001 })
        ));
    }

    #[test]
    fn o_servico_com_outra_conta_e_recusado() {
        assert!(matches!(
            conferir(4120, 4120, r"NT AUTHORITY\LocalService"),
            Err(Erro::ServidorFalso { .. })
        ));
        assert!(matches!(
            conferir(4120, 4120, r".\fernanda"),
            Err(Erro::ServidorFalso { .. })
        ));
    }

    #[test]
    fn o_servico_parado_e_sem_servico() {
        assert!(matches!(
            conferir(9001, 0, "LocalSystem"),
            Err(Erro::SemServico)
        ));
    }

    #[test]
    fn a_dacl_nao_da_a_criacao_de_instancias_aos_usuarios() {
        const FILE_CREATE_PIPE_INSTANCE: u32 = 0x4;
        let dos_usuarios = u32::from_str_radix("12019b", 16).expect("a máscara");
        assert_eq!(dos_usuarios & FILE_CREATE_PIPE_INSTANCE, 0);
        // Ler, escrever, os atributos e esperar: o que o cliente pede.
        assert_eq!(dos_usuarios & 0x0010_0183, 0x0010_0183);
        assert!(
            DACL_DO_PIPE.starts_with("D:P"),
            "sem herdar a DACL da pasta"
        );
    }
}
