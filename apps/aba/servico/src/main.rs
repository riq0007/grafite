//! O serviço do Windows da aba (change aba-dos-colaboradores, design, decisão 1), que roda como o
//! sistema: guarda o token do aparelho e atende a aba de cada pessoa pelo pipe local. O esqueleto:
//! o serviço, o pipe e a conversa com a API entram nas tarefas do serviço.

/// O nome do serviço no Windows, que a aba confere do outro lado do pipe.
pub const NOME_DO_SERVICO: &str = "GrafiteAba";

fn main() {
    println!("{NOME_DO_SERVICO}: o serviço da aba ainda não atende.");
}

#[cfg(test)]
mod testes {
    use super::NOME_DO_SERVICO;

    #[test]
    fn o_nome_do_servico_e_o_que_a_aba_confere() {
        assert_eq!(NOME_DO_SERVICO, "GrafiteAba");
    }
}
