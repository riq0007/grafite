//! O lado nativo da aba (change aba-dos-colaboradores, design, decisão 1): as janelas da tela, os
//! comandos que ela chama e, nas tarefas seguintes, a conversa com o serviço pelo pipe.

mod aparencia;
mod forma;
mod janela;
mod posicao;
mod tela_maior;

use tauri::{Manager, WebviewWindow};

use aparencia::Aparencia;
use janela::Janelas;
use tela_maior::EstadoDaTelaMaior;

#[tauri::command]
fn aparencia(estado: tauri::State<'_, Janelas>) -> Result<Aparencia, String> {
    estado
        .aparencia
        .lock()
        .map(|aparencia| aparencia.clone())
        .map_err(|erro| erro.to_string())
}

#[tauri::command]
fn informar_forma(janela: WebviewWindow, retangulos: Vec<forma::Retangulo>) {
    janela::informar(&janela, retangulos);
}

/// Abre a aba e fica nela até o Windows encerrar o programa.
pub fn rodar() {
    tauri::Builder::default()
        .manage(EstadoDaTelaMaior::default())
        .invoke_handler(tauri::generate_handler![
            aparencia,
            informar_forma,
            tela_maior::tela_maior,
            tela_maior::abrir_tela_maior,
            tela_maior::fechar_tela_maior,
            tela_maior::informar_corpo,
        ])
        .setup(|app| {
            let tela = janela::tela_principal(app.handle());
            let (janelas, trocas) = Janelas::nova(Aparencia::de_fabrica(tela));
            app.manage(janelas);
            janela::preparar(app.handle(), trocas)?;
            Ok(())
        })
        .on_window_event(janela::ao_mudar)
        .run(tauri::generate_context!())
        .expect("a aba não abriu");
}
