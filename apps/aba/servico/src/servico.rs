//! O serviço no gerenciador de serviços do Windows e o `--console`: as pastas, o log, o pipe e o
//! laço do aparelho, que espera o passo seguinte ou o pedido de parar.

use std::ffi::OsString;
use std::io;
use std::process::ExitCode;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use grafite_aba_pipe::NOME_DO_SERVICO;
use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher};

use crate::aparelho::{ConfiguracaoGuardada, Maquina, ServicoDoAparelho, VERSAO};
use crate::api::ApiHttp;
use crate::atendimento::{Contexto, Sinal};
use crate::cofre::{self, Guardado};
use crate::computador::{self, Computador, nome_no_cabecalho};
use crate::instalacao::{self, Instalacao};
use crate::pastas::{self, Pastas};
use crate::{atendimento, log};

const USO: &str = "uso: grafite-aba-servico [--console]";

pub fn principal() -> ExitCode {
    let argumentos: Vec<String> = std::env::args().skip(1).collect();
    match argumentos
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        [] => match service_dispatcher::start(NOME_DO_SERVICO, servico_ffi) {
            Ok(()) => ExitCode::SUCCESS,
            Err(erro) => {
                eprintln!("{NOME_DO_SERVICO}: não roda fora do gerenciador de serviços ({erro}).");
                eprintln!("{USO}");
                ExitCode::FAILURE
            }
        },
        ["--console"] => no_console(),
        _ => {
            eprintln!("{USO}");
            ExitCode::from(2)
        }
    }
}

define_windows_service!(servico_ffi, servico_principal);

fn servico_principal(_argumentos: Vec<OsString>) {
    let (parar, pedido) = mpsc::channel();
    let acordar = parar.clone();
    let controle = move |evento| match evento {
        ServiceControl::Stop | ServiceControl::Shutdown => {
            let _ = parar.send(Sinal::Parar);
            ServiceControlHandlerResult::NoError
        }
        ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
        _ => ServiceControlHandlerResult::NotImplemented,
    };
    let Ok(estado) = service_control_handler::register(NOME_DO_SERVICO, controle) else {
        return;
    };
    let situacao = |atual, aceita, saida| ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: atual,
        controls_accepted: aceita,
        exit_code: saida,
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    };
    let _ = estado.set_service_status(situacao(
        ServiceState::Running,
        ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        ServiceExitCode::Win32(0),
    ));
    let saida = match rodar(&pedido, acordar, false) {
        Ok(()) => ServiceExitCode::Win32(0),
        // O gerenciador de serviços guarda o código no log de eventos do Windows.
        Err(erro) => ServiceExitCode::ServiceSpecific(erro.raw_os_error().unwrap_or(1) as u32),
    };
    let _ = estado.set_service_status(situacao(
        ServiceState::Stopped,
        ServiceControlAccept::empty(),
        saida,
    ));
}

fn no_console() -> ExitCode {
    // Ninguém pede para parar: o Ctrl+C termina o processo, e o laço não deixa nada pela metade,
    // porque o disco só recebe o arquivo inteiro.
    let (acordar, pedido) = mpsc::channel();
    match rodar(&pedido, acordar, true) {
        Ok(()) => ExitCode::SUCCESS,
        Err(erro) => {
            eprintln!("{NOME_DO_SERVICO}: {erro}");
            ExitCode::FAILURE
        }
    }
}

/// O computador do Windows para o laço do aparelho.
struct MaquinaDoWindows {
    pastas: Pastas,
}

impl Maquina for MaquinaDoWindows {
    fn instalacao(&self) -> Instalacao {
        instalacao::ler()
    }

    fn computador(&self) -> Option<Computador> {
        computador::este()
    }

    fn apagar_a_chave(&self) -> io::Result<()> {
        instalacao::apagar_a_chave()
    }

    fn guardar_o_token(&self, guardado: &Guardado) -> io::Result<()> {
        cofre::gravar(&self.pastas.aparelho(), guardado)
    }

    fn guardar_a_configuracao(&self, configuracao: &ConfiguracaoGuardada) -> io::Result<()> {
        let dados = serde_json::to_vec_pretty(configuracao).map_err(io::Error::other)?;
        pastas::gravar(&self.pastas.configuracao(), &dados)
    }
}

fn ler_a_configuracao(pastas: &Pastas) -> Option<ConfiguracaoGuardada> {
    let dados = std::fs::read(pastas.configuracao()).ok()?;
    serde_json::from_slice(&dados)
        .inspect_err(|erro| log::aviso(&format!("a configuração guardada não abriu: {erro}")))
        .ok()
}

fn rodar(sinais: &Receiver<Sinal>, acordar: Sender<Sinal>, no_console: bool) -> io::Result<()> {
    let pastas = pastas::preparar()?;
    log::iniciar(pastas.logs(), no_console);
    log::info(&format!("o serviço da aba {VERSAO} começou"));
    let guardado = cofre::ler(&pastas.aparelho()).unwrap_or_else(|erro| {
        log::aviso(&format!(
            "o token guardado não abriu, e vale como nenhum: {erro}"
        ));
        None
    });
    let configuracao = ler_a_configuracao(&pastas);
    let api = ApiHttp::nova().map_err(io::Error::other)?;
    let computador =
        computador::este().and_then(|este| nome_no_cabecalho(&este.nome).map(str::to_owned));
    let mut aparelho = ServicoDoAparelho::novo(
        api.clone(),
        MaquinaDoWindows { pastas },
        guardado,
        configuracao,
    );
    let contexto = Arc::new(Contexto {
        retrato: Mutex::new(aparelho.retrato()),
        credencial: Mutex::new(None),
        api,
        computador,
        acordar,
    });
    {
        let contexto = Arc::clone(&contexto);
        thread::spawn(move || {
            if let Err(erro) = atendimento::atender(contexto) {
                log::erro(&format!("o pipe da aba não abriu: {erro}"));
            }
        });
    }
    loop {
        let espera = aparelho.passo(Instant::now());
        if let Ok(mut atual) = contexto.retrato.lock() {
            *atual = aparelho.retrato();
        }
        if let Ok(mut atual) = contexto.credencial.lock() {
            *atual = aparelho.credencial();
        }
        match sinais.recv_timeout(espera) {
            Err(RecvTimeoutError::Timeout) | Ok(Sinal::Acordar) => {}
            Ok(Sinal::Parar) | Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    log::info("o serviço da aba parou");
    Ok(())
}
