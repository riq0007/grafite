//! O Ctrl+Alt+T (design, decisão 7), pelo plugin `global-shortcut` do Tauri: abre o painel de qualquer
//! programa, com o foco em "Abrir chamado". Com o atalho de outro programa, a aba segue sem ele, e o
//! painel diz que ele está ocupado.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::estado;
use crate::foco;
use crate::janela::JANELA_DA_ABA;

pub const EVENTO_DO_ATALHO: &str = "atalho";

pub fn registrar(app: &AppHandle) {
    let atalho = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT);
    let registrado = app
        .global_shortcut()
        .on_shortcut(atalho, |app, _atalho, evento| {
            if evento.state() == ShortcutState::Pressed {
                abrir_o_painel(app);
            }
        });
    estado::mudar(app, |atual| atual.atalho_ocupado = registrado.is_err());
}

/// Guarda a janela da frente para o Esc, traz a janela da aba e avisa a tela. O WM_HOTKEY dá à aba
/// o direito de vir para a frente.
fn abrir_o_painel(app: &AppHandle) {
    foco::guardar_a_frente(app);
    if let Some(aba) = app.get_webview_window(JANELA_DA_ABA) {
        let _ = aba.set_focus();
    }
    let _ = app.emit(EVENTO_DO_ATALHO, ());
}
