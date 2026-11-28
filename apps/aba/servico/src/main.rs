//! O serviço do Windows da aba (change aba-dos-colaboradores, design, decisão 1), que roda como o
//! sistema: registra o aparelho com a chave, guarda o token cifrado, confere a configuração a cada
//! 60 s e atende a aba de cada pessoa pelo pipe local (`grafite-aba-pipe`).
//!
//! Sem argumentos, ele é o serviço `GrafiteAba`, que o gerenciador de serviços inicia. Com o
//! `--console`, roda no terminal de um administrador, para o desenvolvimento, com o log repetido no
//! stderr; o Ctrl+C o para.

mod aparelho;
mod api;
mod atendimento;
mod cofre;
mod computador;
mod instalacao;
mod log;
mod pastas;
mod problema;
mod segredo;

#[cfg(windows)]
mod servico;

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    servico::principal()
}

#[cfg(not(windows))]
fn main() {
    eprintln!("O serviço da aba só roda no Windows.");
}

#[cfg(test)]
mod testes {
    use grafite_aba_pipe::NOME_DO_SERVICO;

    #[test]
    fn o_nome_do_servico_e_o_que_a_aba_confere() {
        assert_eq!(NOME_DO_SERVICO, "GrafiteAba");
    }
}
