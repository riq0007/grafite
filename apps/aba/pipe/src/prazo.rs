//! O prazo da conversa no pipe: o `ReadFile` e o `FlushFileBuffers` sem o modo sobreposto esperam
//! o outro lado para sempre, e uma aba parada seguraria uma linha do serviço. A vigia cancela a
//! E/S da linha passado o prazo, e segue cancelando até o trabalho terminar, para a E/S seguinte
//! não escapar entre uma chamada e outra.

use std::io;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::IO::CancelSynchronousIo;
use windows::Win32::System::Threading::{GetCurrentThreadId, OpenThread, THREAD_TERMINATE};

/// De quanto em quanto a vigia cancela de novo, depois do prazo.
const DE_NOVO: Duration = Duration::from_millis(50);

/// O handle da linha, que vai à vigia.
struct Linha(HANDLE);

// SAFETY: o handle da linha vale em qualquer linha do processo.
unsafe impl Send for Linha {}

/// Roda o `trabalho` nesta linha com o prazo: passado ele, cada E/S síncrona da linha falha com o
/// `ERROR_OPERATION_ABORTED`.
pub fn com_prazo<T>(prazo: Duration, trabalho: impl FnOnce() -> T) -> io::Result<T> {
    // SAFETY: a linha atual, com o acesso que o `CancelSynchronousIo` pede; fechada no fim.
    let linha = Linha(unsafe { OpenThread(THREAD_TERMINATE, false, GetCurrentThreadId()) }?);
    let (fim, sinal) = mpsc::channel::<()>();
    let vigia = thread::spawn(move || {
        let linha = linha;
        let mut espera = prazo;
        while let Err(RecvTimeoutError::Timeout) = sinal.recv_timeout(espera) {
            // SAFETY: o handle é desta função, que só o fecha depois de a vigia terminar.
            let _ = unsafe { CancelSynchronousIo(linha.0) };
            espera = DE_NOVO;
        }
        linha
    });
    let resultado = trabalho();
    drop(fim);
    let linha = vigia
        .join()
        .map_err(|_| io::Error::other("a vigia do prazo parou"))?;
    // SAFETY: o handle foi aberto acima e é fechado uma vez.
    let _ = unsafe { CloseHandle(linha.0) };
    Ok(resultado)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_trabalho_rapido_nao_e_cancelado() {
        assert_eq!(com_prazo(Duration::from_secs(5), || 42).ok(), Some(42));
    }
}
