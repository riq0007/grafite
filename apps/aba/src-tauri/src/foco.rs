//! O foco (design, decisão 7): a janela da frente, guardada para o Esc a devolver, e a perda do foco,
//! que fecha o painel. A tela não usa o `blur`: a tela maior também tira o foco da janela da aba sem
//! fechar o painel, e só uma janela de outro programa na frente fecha. A janela que é dona de uma
//! nossa conta como nossa: o menu do botão direito, a lista do `select` e o seletor de arquivos do
//! chat são do processo do WebView2, donos da tela maior.

use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::tela_maior;

pub const EVENTO_DE_FECHAR_O_PAINEL: &str = "fechar-o-painel";

/// O foco leva um instante para chegar à janela nova, depois de sair da nossa.
const ESPERA_DO_FOCO: Duration = Duration::from_millis(80);

/// A última janela de outro programa na frente, como o `HWND` em número.
#[derive(Default)]
pub struct Foco(Mutex<Option<isize>>);

/// Guarda a janela da frente, se ela é de outro programa. A linha do ponteiro chama a cada passo, e
/// o atalho, antes de trazer a aba.
pub fn guardar_a_frente(app: &AppHandle) {
    if let Some(frente) = nativo::frente_de_fora()
        && let Ok(mut guardada) = app.state::<Foco>().0.lock()
    {
        *guardada = Some(frente);
    }
}

/// Uma janela nossa na frente: a aba ou a tela maior com o foco.
pub fn nossa_na_frente() -> bool {
    nativo::nossa_na_frente()
}

/// O Esc do painel: devolve o foco à janela que estava na frente antes da aba.
#[tauri::command]
pub fn devolver_o_foco(foco: tauri::State<'_, Foco>) {
    if let Ok(guardada) = foco.0.lock()
        && let Some(janela) = *guardada
    {
        nativo::por_na_frente(janela);
    }
}

/// Uma janela nossa perdeu o foco: se ele foi a outro programa, o painel e a tela maior fecham.
pub fn ao_perder_o_foco(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(ESPERA_DO_FOCO);
        if nativo::frente_de_fora().is_some() {
            tela_maior::fechar(&app, false);
            let _ = app.emit(EVENTO_DE_FECHAR_O_PAINEL, ());
        }
    });
}

#[cfg(windows)]
mod nativo {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::WindowsAndMessaging::{
        GA_ROOTOWNER, GetAncestor, GetForegroundWindow, GetWindowThreadProcessId, IsWindow,
        SetForegroundWindow,
    };

    fn processo_de(janela: HWND) -> u32 {
        let mut processo = 0;
        // SAFETY: só leitura do Windows; o processo vem num número nosso.
        unsafe { GetWindowThreadProcessId(janela, Some(&raw mut processo)) };
        processo
    }

    /// A janela é nossa, ou tem uma nossa como dona, como os popups do WebView2 do chat.
    fn nossa(janela: HWND) -> bool {
        // SAFETY: só leituras do Windows.
        let (nosso, dona) = unsafe { (GetCurrentProcessId(), GetAncestor(janela, GA_ROOTOWNER)) };
        processo_de(janela) == nosso || (!dona.is_invalid() && processo_de(dona) == nosso)
    }

    fn frente() -> Option<HWND> {
        // SAFETY: só leitura do Windows.
        let frente = unsafe { GetForegroundWindow() };
        (!frente.is_invalid()).then_some(frente)
    }

    /// A janela da frente, se ela é de outro programa.
    pub fn frente_de_fora() -> Option<isize> {
        frente()
            .filter(|&janela| !nossa(janela))
            .map(|janela| janela.0 as isize)
    }

    pub fn nossa_na_frente() -> bool {
        frente().is_some_and(nossa)
    }

    pub fn por_na_frente(janela: isize) {
        let janela = HWND(janela as *mut _);
        // SAFETY: a janela pode ter fechado; o IsWindow confere antes, e a chamada só falha.
        unsafe {
            if IsWindow(Some(janela)).as_bool() {
                let _ = SetForegroundWindow(janela);
            }
        }
    }
}

#[cfg(not(windows))]
mod nativo {
    pub fn frente_de_fora() -> Option<isize> {
        None
    }

    pub fn nossa_na_frente() -> bool {
        false
    }

    pub fn por_na_frente(_janela: isize) {}
}
