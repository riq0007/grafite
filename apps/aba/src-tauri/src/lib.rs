//! O lado nativo da aba (change aba-dos-colaboradores, design, decisão 1): as janelas da tela, os
//! comandos que ela chama, a sessão, que ela pede ao serviço pelo pipe, e a rede do estado.

mod aparencia;
mod atalho;
mod cofre;
mod estado;
mod foco;
mod forma;
mod janela;
mod posicao;
mod rede;
mod sessao;
mod sistema;
mod tela_maior;

use tauri::{Manager, WebviewWindow};

use aparencia::Aparencia;
use estado::Estado;
use foco::Foco;
use janela::{JANELA_DA_ABA, Janelas};
use sessao::Comandos;
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
        // Uma aba por pessoa no Windows: abrir de novo só traz a que já roda. O nome do mutex não leva
        // o `Global\`, e cada sessão do Windows, como a de outra pessoa pelo RDP, tem a sua.
        .plugin(tauri_plugin_single_instance::init(
            |app, _argumentos, _pasta| {
                if let Some(aba) = app.get_webview_window(JANELA_DA_ABA) {
                    let _ = aba.show();
                }
            },
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(EstadoDaTelaMaior::default())
        .manage(Estado::default())
        .manage(Foco::default())
        .invoke_handler(tauri::generate_handler![
            aparencia,
            informar_forma,
            estado::estado,
            foco::devolver_o_foco,
            tela_maior::tela_maior,
            tela_maior::abrir_tela_maior,
            tela_maior::fechar_tela_maior,
            tela_maior::informar_corpo,
            sessao::entrar,
            sessao::enviar_o_codigo,
            sessao::recomecar_a_entrada,
            sessao::sair,
        ])
        .setup(|app| {
            let tela = janela::tela_principal(app.handle());
            let do_windows = sistema::ler();
            let aparencia = Aparencia {
                tema: do_windows.tema,
                movimento_reduzido: do_windows.movimento_reduzido,
                apresentacao: sistema::apresentacao(),
                ..Aparencia::de_fabrica(tela)
            };
            let (janelas, trocas) = Janelas::nova(aparencia);
            app.manage(janelas);
            janela::preparar(app.handle(), trocas)?;
            atalho::registrar(app.handle());
            let (comandos, da_sessao) = Comandos::nova();
            #[cfg(windows)]
            {
                if let Some(aba) = app.get_webview_window(JANELA_DA_ABA) {
                    sessao::ouvir_os_fins(&aba, comandos.copia());
                }
                let (credenciais, da_rede) = tokio::sync::watch::channel(None);
                sessao::iniciar(app.handle().clone(), da_sessao, credenciais);
                rede::iniciar(app.handle().clone(), da_rede, comandos.copia());
            }
            #[cfg(not(windows))]
            drop(da_sessao);
            app.manage(comandos);
            Ok(())
        })
        .on_window_event(janela::ao_mudar)
        .run(tauri::generate_context!())
        .expect("a aba não abriu");
}
