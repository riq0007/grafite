//! O serviço do Windows da aba (change aba-dos-colaboradores, design, decisão 1), que roda como o
//! sistema: guarda o token do aparelho e atende a aba de cada pessoa pelo pipe local. O esqueleto:
//! o serviço e a conversa com a API entram nas tarefas do serviço; o pipe fica no
//! `grafite-aba-pipe`, com a aba.

use grafite_aba_pipe::{NOME_DO_PIPE, NOME_DO_SERVICO};

fn main() {
    println!("{NOME_DO_SERVICO}: o serviço da aba ainda não atende em {NOME_DO_PIPE}.");
}

#[cfg(test)]
mod testes {
    use grafite_aba_pipe::NOME_DO_SERVICO;

    #[test]
    fn o_nome_do_servico_e_o_que_a_aba_confere() {
        assert_eq!(NOME_DO_SERVICO, "GrafiteAba");
    }
}
