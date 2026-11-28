//! O lado do serviço: as instâncias do pipe e quem chama.

use std::io;

use windows::Win32::Foundation::{
    CloseHandle, ERROR_BROKEN_PIPE, ERROR_MORE_DATA, ERROR_PIPE_CONNECTED, HANDLE,
};
use windows::Win32::Security::{RevertToSelf, SECURITY_ATTRIBUTES, TOKEN_QUERY};
use windows::Win32::Storage::FileSystem::{
    FILE_FLAG_FIRST_PIPE_INSTANCE, FlushFileBuffers, PIPE_ACCESS_DUPLEX, ReadFile, WriteFile,
};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, ImpersonateNamedPipeClient,
    PIPE_READMODE_MESSAGE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_MESSAGE, PIPE_UNLIMITED_INSTANCES,
    PIPE_WAIT,
};
use windows::Win32::System::Threading::{GetCurrentThread, OpenThreadToken};
use windows::core::HSTRING;

use crate::seguranca::{Descritor, dono_do_token};
use crate::{Chamador, DACL_DO_PIPE, Erro, TAMANHO_MAXIMO};

/// Uma instância do pipe, do lado do serviço: espera uma aba, lê, responde e desliga.
pub struct Instancia {
    pipe: HANDLE,
}

// SAFETY: o handle do pipe pode ir a outra linha; cada instância atende uma aba por vez.
unsafe impl Send for Instancia {}

impl Instancia {
    /// Cria uma instância com a DACL do pipe. A `primeira` leva o `FILE_FLAG_FIRST_PIPE_INSTANCE`:
    /// se outro processo criou o pipe antes, o serviço não o usa.
    pub fn criar(nome: &str, primeira: bool) -> Result<Self, Erro> {
        Self::criar_com(nome, primeira, DACL_DO_PIPE)
    }

    pub(crate) fn criar_com(nome: &str, primeira: bool, dacl: &str) -> Result<Self, Erro> {
        let descritor = Descritor::da_sddl(dacl)?;
        let atributos = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descritor.ponteiro(),
            bInheritHandle: false.into(),
        };
        let abertura = if primeira {
            PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE
        } else {
            PIPE_ACCESS_DUPLEX
        };
        let modo =
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS;
        let tamanho = TAMANHO_MAXIMO as u32;
        // SAFETY: os atributos e o descritor vivem durante a chamada.
        let pipe = unsafe {
            CreateNamedPipeW(
                &HSTRING::from(nome),
                abertura,
                modo,
                PIPE_UNLIMITED_INSTANCES,
                tamanho,
                tamanho,
                0,
                Some(&raw const atributos),
            )
        };
        if pipe.is_invalid() {
            return Err(io::Error::last_os_error().into());
        }
        Ok(Self { pipe })
    }

    /// Espera uma aba abrir o pipe.
    pub fn esperar(&self) -> Result<(), Erro> {
        // SAFETY: o pipe é nosso e está aberto.
        match unsafe { ConnectNamedPipe(self.pipe, None) } {
            Ok(()) => Ok(()),
            // A aba abriu entre o criar e o esperar.
            Err(erro) if erro.code() == ERROR_PIPE_CONNECTED.to_hresult() => Ok(()),
            Err(erro) => Err(io::Error::from(erro).into()),
        }
    }

    pub fn ler(&self) -> Result<Vec<u8>, Erro> {
        ler(self.pipe)
    }

    pub fn escrever(&self, mensagem: &[u8]) -> Result<(), Erro> {
        escrever(self.pipe, mensagem)
    }

    /// Quem chama, pelo token de quem abriu o pipe, com a identificação que a aba deu. O Windows só
    /// deixa depois de o serviço ler a primeira mensagem. O token é aberto como quem chama e lido já
    /// como o serviço: com a identificação, a linha não consulta o nome da conta.
    pub fn quem_chama(&self) -> Result<Chamador, Erro> {
        // SAFETY: o pipe é nosso; a linha volta a ser do serviço logo depois, também no erro.
        unsafe { ImpersonateNamedPipeClient(self.pipe) }.map_err(io::Error::from)?;
        let volta = Volta;
        let mut token = HANDLE::default();
        // SAFETY: o token da linha é o de quem chama, aberto com o acesso do serviço.
        let aberto =
            unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_QUERY, true, &raw mut token) };
        drop(volta);
        aberto.map_err(io::Error::from)?;
        let dono = dono_do_token(token);
        // SAFETY: o token foi aberto acima e é fechado uma vez.
        let _ = unsafe { CloseHandle(token) };
        Ok(dono?)
    }

    /// Termina a conversa com a aba, depois de ela ler a resposta, e deixa a instância para a próxima.
    pub fn desligar(&self) {
        // SAFETY: o pipe é nosso.
        unsafe {
            let _ = FlushFileBuffers(self.pipe);
            let _ = DisconnectNamedPipe(self.pipe);
        }
    }
}

impl Drop for Instancia {
    fn drop(&mut self) {
        // SAFETY: o handle é nosso e é fechado uma vez.
        let _ = unsafe { CloseHandle(self.pipe) };
    }
}

/// Volta a linha ao serviço, também quando a leitura de quem chama falha.
struct Volta;

impl Drop for Volta {
    fn drop(&mut self) {
        // SAFETY: a linha estava como quem chama; voltar é sempre possível.
        let _ = unsafe { RevertToSelf() };
    }
}

/// Lê uma mensagem inteira. A que passa do tamanho é recusada, sem ler o resto.
pub(crate) fn ler(pipe: HANDLE) -> Result<Vec<u8>, Erro> {
    let mut mensagem = vec![0_u8; TAMANHO_MAXIMO];
    let mut lidos = 0;
    // SAFETY: o buffer é nosso, com o tamanho dele.
    match unsafe { ReadFile(pipe, Some(&mut mensagem), Some(&raw mut lidos), None) } {
        Ok(()) => {
            mensagem.truncate(lidos as usize);
            Ok(mensagem)
        }
        Err(erro) if erro.code() == ERROR_MORE_DATA.to_hresult() => Err(Erro::MensagemGrande),
        Err(erro) if erro.code() == ERROR_BROKEN_PIPE.to_hresult() => Err(Erro::Fechado),
        Err(erro) => Err(io::Error::from(erro).into()),
    }
}

/// Escreve uma mensagem inteira, de uma vez.
pub(crate) fn escrever(pipe: HANDLE, mensagem: &[u8]) -> Result<(), Erro> {
    if mensagem.len() > TAMANHO_MAXIMO {
        return Err(Erro::MensagemGrande);
    }
    let mut escritos = 0;
    // SAFETY: a mensagem é nossa e vive durante a chamada.
    match unsafe { WriteFile(pipe, Some(mensagem), Some(&raw mut escritos), None) } {
        Ok(()) if escritos as usize == mensagem.len() => Ok(()),
        Ok(()) => Err(io::Error::from(io::ErrorKind::WriteZero).into()),
        Err(erro) if erro.code() == ERROR_BROKEN_PIPE.to_hresult() => Err(Erro::Fechado),
        Err(erro) => Err(io::Error::from(erro).into()),
    }
}
