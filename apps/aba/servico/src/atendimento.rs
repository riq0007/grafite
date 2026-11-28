//! O pipe do lado do serviço: cada aba abre uma conexão, faz um pedido e recebe a resposta. Uma
//! linha por conexão, até 64 ao mesmo tempo, e cada uma com o prazo de 5 s: a aba parada não segura
//! o serviço das outras pessoas do computador.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use grafite_aba_pipe::{
    Aparelho, Erro, Instancia, NOME_DO_PIPE, Pedido, Resposta, Situacao, com_prazo,
};

use crate::log;

const CONEXOES: usize = 64;
const PRAZO: Duration = Duration::from_secs(5);

/// O retrato do aparelho, que o laço do aparelho troca a cada passo.
pub type Retrato = Arc<Mutex<Aparelho>>;

/// A resposta a um pedido, sem o pipe.
pub fn responder(mensagem: &[u8], retrato: &Aparelho) -> Resposta {
    match serde_json::from_slice::<Pedido>(mensagem) {
        Ok(Pedido::Aparelho) => Resposta::Aparelho(retrato.clone()),
        Err(_) => Resposta::PedidoRecusado,
    }
}

/// Atende as abas até o processo terminar. A primeira instância falha se outro processo criou o
/// pipe antes: o serviço não o usa.
pub fn atender(retrato: Retrato) -> Result<(), Erro> {
    let ativas = Arc::new(AtomicUsize::new(0));
    let mut proxima = Some(Instancia::criar(NOME_DO_PIPE, true)?);
    loop {
        let instancia = proxima.take().unwrap_or_else(outra_instancia);
        if let Err(erro) = instancia.esperar() {
            log::aviso(&format!("uma aba não conectou ao pipe: {erro}"));
            continue;
        }
        // A próxima antes de entregar esta: o pipe não fica sem uma instância esperando.
        proxima = Instancia::criar(NOME_DO_PIPE, false).ok();
        if ativas.fetch_add(1, Ordering::SeqCst) >= CONEXOES {
            ativas.fetch_sub(1, Ordering::SeqCst);
            instancia.desligar();
            continue;
        }
        let retrato = Arc::clone(&retrato);
        let ativas = Arc::clone(&ativas);
        thread::spawn(move || {
            let _ = com_prazo(PRAZO, || {
                conversar(&instancia, &retrato);
                instancia.desligar();
            });
            ativas.fetch_sub(1, Ordering::SeqCst);
        });
    }
}

/// Outra instância: a seguinte, ao lado das que atendem, ou a primeira de novo, quando o pipe sumiu.
/// Só o sistema cria a seguinte: no `--console`, como administrador, ela espera as conversas
/// terminarem e o pipe sumir.
fn outra_instancia() -> Instancia {
    for tentativa in 0_u32.. {
        if let Ok(instancia) = Instancia::criar(NOME_DO_PIPE, true) {
            return instancia;
        }
        if let Ok(instancia) = Instancia::criar(NOME_DO_PIPE, false) {
            return instancia;
        }
        if tentativa == 100 {
            log::aviso("o pipe não abre outra instância; o serviço segue tentando");
        }
        thread::sleep(Duration::from_millis(50));
    }
    unreachable!("as tentativas não acabam")
}

fn conversar(instancia: &Instancia, retrato: &Retrato) {
    let mensagem = match instancia.ler() {
        Ok(mensagem) => mensagem,
        Err(Erro::Fechado) => return,
        Err(erro) => {
            log::aviso(&format!("o pedido de uma aba não foi lido: {erro}"));
            return;
        }
    };
    let atual = retrato.lock().map_or_else(
        |_| Aparelho {
            situacao: Situacao::SemConexao,
            motivo: None,
            configuracao: None,
        },
        |retrato| retrato.clone(),
    );
    let resposta = responder(&mensagem, &atual);
    let Ok(bytes) = serde_json::to_vec(&resposta) else {
        return;
    };
    if let Err(erro) = instancia.escrever(&bytes) {
        log::aviso(&format!("a resposta a uma aba não foi: {erro}"));
    }
}

#[cfg(test)]
mod testes {
    use grafite_aba_pipe::{Configuracao, Entrada, Forma};

    use super::*;

    fn retrato() -> Aparelho {
        Aparelho {
            situacao: Situacao::Registrada,
            motivo: None,
            configuracao: Some(Configuracao {
                forma: Forma::Pilula,
                contato: None,
                entrada: Entrada::Windows,
                versao: 1,
            }),
        }
    }

    #[test]
    fn o_pedido_do_aparelho_recebe_o_retrato() {
        assert_eq!(
            responder(br#"{"pedido":"aparelho"}"#, &retrato()),
            Resposta::Aparelho(retrato())
        );
    }

    #[test]
    fn o_pedido_estranho_e_recusado() {
        assert_eq!(responder(b"nada", &retrato()), Resposta::PedidoRecusado);
        assert_eq!(
            responder(br#"{"pedido":"token"}"#, &retrato()),
            Resposta::PedidoRecusado
        );
    }
}
