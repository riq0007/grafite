//! O lado da aba: abre o pipe só para a identificação e confere o serviço do outro lado.

use std::io;
use std::thread;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{CloseHandle, ERROR_PIPE_BUSY, HANDLE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_READ_ATTRIBUTES, FILE_READ_DATA, FILE_SHARE_NONE, FILE_WRITE_ATTRIBUTES,
    FILE_WRITE_DATA, OPEN_EXISTING, SECURITY_IDENTIFICATION, SECURITY_SQOS_PRESENT,
};
use windows::Win32::System::Pipes::{
    GetNamedPipeServerProcessId, PIPE_READMODE_MESSAGE, SetNamedPipeHandleState, WaitNamedPipeW,
};
use windows::Win32::System::Services::{
    CloseServiceHandle, OpenSCManagerW, OpenServiceW, QUERY_SERVICE_CONFIGW, QueryServiceConfigW,
    QueryServiceStatusEx, SC_HANDLE, SC_MANAGER_CONNECT, SC_STATUS_PROCESS_INFO,
    SERVICE_QUERY_CONFIG, SERVICE_QUERY_STATUS, SERVICE_STATUS_PROCESS,
};
use windows::core::HSTRING;

use crate::servidor::{escrever, ler};
use crate::{Erro, NOME_DO_PIPE, NOME_DO_SERVICO, conferir};

/// Quanto a aba espera uma instância livre do pipe.
const ESPERA_DO_PIPE: Duration = Duration::from_secs(2);

/// A aba do lado de cá do pipe, já conferido.
pub struct Cliente {
    pipe: HANDLE,
}

// SAFETY: o handle do pipe pode ir a outra linha; a aba faz um pedido por vez.
unsafe impl Send for Cliente {}

impl Cliente {
    /// Abre o pipe do serviço e confere o serviço do outro lado.
    pub fn abrir() -> Result<Self, Erro> {
        Self::abrir_com(NOME_DO_PIPE, conferir_o_servico)
    }

    /// Abre o pipe com outra conferência, para os testes.
    pub fn abrir_com(
        nome: &str,
        conferencia: impl FnOnce(u32) -> Result<(), Erro>,
    ) -> Result<Self, Erro> {
        let nome = HSTRING::from(nome);
        let limite = Instant::now() + ESPERA_DO_PIPE;
        // Só ler e escrever os dados e os atributos, e o SYNCHRONIZE (0x100000): o `GENERIC_WRITE` pediria também o criar
        // instâncias, que a DACL não dá. A identificação deixa o serviço saber quem chama, sem agir
        // como a pessoa.
        let acesso = FILE_READ_DATA.0
            | FILE_WRITE_DATA.0
            | FILE_READ_ATTRIBUTES.0
            | FILE_WRITE_ATTRIBUTES.0
            | 0x0010_0000;
        let pipe = loop {
            // SAFETY: o nome vive durante a chamada; o handle fica com o `Cliente`.
            match unsafe {
                CreateFileW(
                    &nome,
                    acesso,
                    FILE_SHARE_NONE,
                    None,
                    OPEN_EXISTING,
                    SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION,
                    None,
                )
            } {
                Ok(pipe) => break pipe,
                Err(erro)
                    if erro.code() == ERROR_PIPE_BUSY.to_hresult() && Instant::now() < limite =>
                {
                    // SAFETY: só espera uma instância livre.
                    let _ = unsafe { WaitNamedPipeW(&nome, 500) };
                    thread::sleep(Duration::from_millis(10));
                }
                Err(erro) => return Err(io::Error::from(erro).into()),
            }
        };
        let cliente = Self { pipe };
        // SAFETY: o modo é nosso e vive durante a chamada.
        unsafe { SetNamedPipeHandleState(cliente.pipe, Some(&PIPE_READMODE_MESSAGE), None, None) }
            .map_err(io::Error::from)?;
        let mut processo = 0;
        // SAFETY: o processo vem num número nosso.
        unsafe { GetNamedPipeServerProcessId(cliente.pipe, &raw mut processo) }
            .map_err(io::Error::from)?;
        conferencia(processo)?;
        Ok(cliente)
    }

    /// Manda o pedido e espera a resposta.
    pub fn pedir(&self, pedido: &[u8]) -> Result<Vec<u8>, Erro> {
        escrever(self.pipe, pedido)?;
        ler(self.pipe)
    }
}

impl Drop for Cliente {
    fn drop(&mut self) {
        // SAFETY: o handle é nosso e é fechado uma vez.
        let _ = unsafe { CloseHandle(self.pipe) };
    }
}

/// Um handle do gerenciador de serviços, fechado ao sair.
struct Servico(SC_HANDLE);

impl Drop for Servico {
    fn drop(&mut self) {
        // SAFETY: o handle é nosso e é fechado uma vez.
        let _ = unsafe { CloseServiceHandle(self.0) };
    }
}

/// O processo do serviço `GrafiteAba`, pelo gerenciador de serviços, e a conta dele. Qualquer pessoa
/// lê os dois, e só o administrador muda o serviço.
fn o_servico() -> Result<(u32, String), Erro> {
    // SAFETY: os handles ficam com o `Servico`, que os fecha.
    let gerenciador = Servico(
        unsafe { OpenSCManagerW(None, None, SC_MANAGER_CONNECT) }.map_err(io::Error::from)?,
    );
    let servico = Servico(
        unsafe {
            OpenServiceW(
                gerenciador.0,
                &HSTRING::from(NOME_DO_SERVICO),
                SERVICE_QUERY_STATUS | SERVICE_QUERY_CONFIG,
            )
        }
        .map_err(|_| Erro::SemServico)?,
    );

    let mut estado = SERVICE_STATUS_PROCESS::default();
    let mut tamanho = 0;
    // SAFETY: o buffer é o SERVICE_STATUS_PROCESS, com o tamanho dele.
    unsafe {
        QueryServiceStatusEx(
            servico.0,
            SC_STATUS_PROCESS_INFO,
            Some(std::slice::from_raw_parts_mut(
                (&raw mut estado).cast::<u8>(),
                size_of::<SERVICE_STATUS_PROCESS>(),
            )),
            &raw mut tamanho,
        )
    }
    .map_err(io::Error::from)?;

    // SAFETY: a primeira chamada só pede o tamanho; a segunda escreve num buffer alinhado.
    let conta = unsafe {
        let _ = QueryServiceConfigW(servico.0, None, 0, &raw mut tamanho);
        let mut buffer = vec![0_u64; (tamanho as usize).div_ceil(8)];
        let configuracao = buffer.as_mut_ptr().cast::<QUERY_SERVICE_CONFIGW>();
        QueryServiceConfigW(servico.0, Some(configuracao), tamanho, &raw mut tamanho)
            .map_err(io::Error::from)?;
        (*configuracao)
            .lpServiceStartName
            .to_string()
            .unwrap_or_default()
    };
    Ok((estado.dwProcessId, conta))
}

/// A conferência de verdade: o processo do pipe é o do serviço da aba, como o sistema.
pub fn conferir_o_servico(processo_do_pipe: u32) -> Result<(), Erro> {
    let (processo_do_servico, conta) = o_servico()?;
    conferir(processo_do_pipe, processo_do_servico, &conta)
}

#[cfg(test)]
mod testes {
    use std::sync::mpsc;

    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Security::TOKEN_QUERY;
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    use super::*;
    use crate::seguranca::dono_do_token;
    use crate::{Chamador, DACL_DO_PIPE, Instancia, TAMANHO_MAXIMO};

    /// Um nome só deste teste, para não esbarrar no pipe do serviço nem nos outros testes.
    fn nome_do_teste(teste: &str) -> String {
        format!(r"\\.\pipe\grafite-aba-teste-{}-{teste}", std::process::id())
    }

    fn eu() -> Chamador {
        let mut token = HANDLE::default();
        // SAFETY: o token do próprio processo, só para leitura.
        unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw mut token) }
            .expect("o token do teste");
        dono_do_token(token).expect("quem roda o teste")
    }

    /// A DACL do serviço, mais quem roda o teste, só com ler e escrever: no CI, o executor não é um
    /// usuário interativo.
    fn dacl_do_teste() -> String {
        format!("{DACL_DO_PIPE}(A;;0x12019b;;;{})", eu().sid)
    }

    /// Um servidor de teste que atende uma aba: lê, diz quem chamou e devolve a mensagem.
    fn servidor_de_eco(
        nome: &str,
    ) -> (
        thread::JoinHandle<Result<Chamador, Erro>>,
        mpsc::Receiver<()>,
    ) {
        let instancia =
            Instancia::criar_com(nome, true, &dacl_do_teste()).expect("o pipe do teste");
        let (pronto, esperar) = mpsc::channel();
        let linha = thread::spawn(move || {
            let _ = pronto.send(());
            instancia.esperar()?;
            let pedido = instancia.ler()?;
            let chamador = instancia.quem_chama()?;
            instancia.escrever(&pedido)?;
            instancia.desligar();
            Ok(chamador)
        });
        (linha, esperar)
    }

    #[test]
    fn o_servidor_falso_e_recusado() {
        let nome = nome_do_teste("falso");
        let (linha, pronto) = servidor_de_eco(&nome);
        pronto.recv().expect("o servidor de teste");
        // O serviço de verdade é outro processo, ou nem está aqui: o pipe deste teste é falso.
        let aberto = Cliente::abrir_com(&nome, |processo| conferir(processo, 4120, "LocalSystem"));
        assert!(
            matches!(aberto, Err(Erro::ServidorFalso { processo }) if processo == std::process::id())
        );
        drop(linha);
    }

    #[test]
    fn sem_o_servico_instalado_a_aba_nao_conversa() {
        let nome = nome_do_teste("sem-servico");
        let (linha, pronto) = servidor_de_eco(&nome);
        pronto.recv().expect("o servidor de teste");
        let aberto = Cliente::abrir_com(&nome, conferir_o_servico);
        assert!(matches!(
            aberto,
            Err(Erro::SemServico | Erro::ServidorFalso { .. })
        ));
        drop(linha);
    }

    #[test]
    fn o_servico_sabe_quem_chama_pelo_windows() {
        let nome = nome_do_teste("quem");
        let (linha, pronto) = servidor_de_eco(&nome);
        pronto.recv().expect("o servidor de teste");
        let proprio = std::process::id();
        let cliente =
            Cliente::abrir_com(&nome, |processo| conferir(processo, proprio, "LocalSystem"))
                .expect("o pipe conferido");
        let resposta = cliente.pedir(br#"{"pedido":"ola"}"#).expect("a resposta");
        assert_eq!(resposta, br#"{"pedido":"ola"}"#);
        let chamador = linha
            .join()
            .expect("a linha do servidor")
            .expect("quem chama");
        assert_eq!(chamador, eu());
        assert!(chamador.sid.starts_with("S-1-5-"));
    }

    #[test]
    fn so_o_sistema_cria_outra_instancia_do_pipe() {
        let nome = nome_do_teste("instancia");
        let _primeira = Instancia::criar_com(&nome, true, &dacl_do_teste()).expect("a primeira");
        // Quem não é o sistema não tem o criar instâncias: nem a primeira de novo, nem outra.
        assert!(Instancia::criar_com(&nome, true, &dacl_do_teste()).is_err());
        assert!(Instancia::criar_com(&nome, false, &dacl_do_teste()).is_err());
    }

    #[test]
    fn a_mensagem_grande_demais_nao_sai() {
        let nome = nome_do_teste("grande");
        let (linha, pronto) = servidor_de_eco(&nome);
        pronto.recv().expect("o servidor de teste");
        let proprio = std::process::id();
        let cliente =
            Cliente::abrir_com(&nome, |processo| conferir(processo, proprio, "LocalSystem"))
                .expect("o pipe conferido");
        let grande = vec![b'a'; TAMANHO_MAXIMO + 1];
        assert!(matches!(cliente.pedir(&grande), Err(Erro::MensagemGrande)));
        drop(cliente);
        assert!(matches!(linha.join().expect("a linha"), Err(Erro::Fechado)));
    }

    #[test]
    fn a_dacl_do_servico_e_valida() {
        assert!(crate::seguranca::Descritor::da_sddl(DACL_DO_PIPE).is_ok());
    }
}
