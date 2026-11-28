//! Pergunta ao serviço instalado, pelo pipe conferido, a situação do aparelho:
//! `cargo run -p grafite-aba-pipe --example aparelho`.

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use grafite_aba_pipe::{Cliente, Pedido};

    let cliente = Cliente::abrir()?;
    let resposta = cliente.pedir(&serde_json::to_vec(&Pedido::Aparelho)?)?;
    println!("{}", String::from_utf8_lossy(&resposta));
    Ok(())
}

#[cfg(not(windows))]
fn main() {}
