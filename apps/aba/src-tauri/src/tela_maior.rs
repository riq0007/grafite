//! A tela maior (design, decisão 8): a segunda janela, embaixo da aba, com a moldura local
//! (`maior.html`). O webview do chat entra nela na tarefa 5.15, no lugar que o `informar_corpo` diz.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::janela::{self, JANELA_DA_TELA_MAIOR, Janelas};

pub const EVENTO_DA_TELA_MAIOR: &str = "tela-maior-mudou";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Destino {
    AbrirChamado,
    AbrirChat,
    VisualizarChamados,
    Chamado,
}

/// O que a tela maior mostra, como o `TelaMaior` da tela.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TelaMaior {
    pub destino: Destino,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub numero: Option<u32>,
}

impl TelaMaior {
    /// O destino com o número só no chamado, e o chamado sempre com ele.
    pub fn nova(destino: Destino, numero: Option<u32>) -> Result<Self, String> {
        match (destino, numero) {
            (Destino::Chamado, Some(numero)) if numero > 0 => Ok(Self {
                destino,
                numero: Some(numero),
            }),
            (Destino::Chamado, _) => Err("o chamado precisa do número".into()),
            (_, _) => Ok(Self {
                destino,
                numero: None,
            }),
        }
    }
}

/// O lugar do chat na moldura, em px CSS da janela da tela maior.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct RetanguloDoCorpo {
    pub x: f64,
    pub y: f64,
    pub largura: f64,
    pub altura: f64,
}

#[derive(Default)]
pub struct EstadoDaTelaMaior {
    pub tela: Mutex<Option<TelaMaior>>,
    pub corpo: Mutex<Option<RetanguloDoCorpo>>,
}

#[tauri::command]
pub fn tela_maior(estado: tauri::State<'_, EstadoDaTelaMaior>) -> Option<TelaMaior> {
    estado.tela.lock().ok().and_then(|tela| *tela)
}

/// Abre a tela maior no destino, ou troca o destino da que está aberta. Assíncrono: criar a janela
/// num comando síncrono trava no Windows.
#[tauri::command]
pub async fn abrir_tela_maior(
    app: AppHandle,
    destino: Destino,
    numero: Option<u32>,
) -> Result<(), String> {
    let tela = TelaMaior::nova(destino, numero)?;
    if let Ok(mut atual) = app.state::<EstadoDaTelaMaior>().tela.lock() {
        *atual = Some(tela);
    }
    if app.get_webview_window(JANELA_DA_TELA_MAIOR).is_none() {
        criar(&app).map_err(|erro| erro.to_string())?;
    }
    app.emit(EVENTO_DA_TELA_MAIOR, Some(tela))
        .map_err(|erro| erro.to_string())
}

#[tauri::command]
pub async fn fechar_tela_maior(app: AppHandle) -> Result<(), String> {
    let estado = app.state::<EstadoDaTelaMaior>();
    if let Ok(mut tela) = estado.tela.lock() {
        *tela = None;
    }
    if let Ok(mut corpo) = estado.corpo.lock() {
        *corpo = None;
    }
    if let Some(maior) = app.get_webview_window(JANELA_DA_TELA_MAIOR) {
        maior.destroy().map_err(|erro| erro.to_string())?;
    }
    app.emit(EVENTO_DA_TELA_MAIOR, None::<TelaMaior>)
        .map_err(|erro| erro.to_string())
}

#[tauri::command]
pub fn informar_corpo(
    estado: tauri::State<'_, EstadoDaTelaMaior>,
    retangulo: Option<RetanguloDoCorpo>,
) {
    if let Ok(mut corpo) = estado.corpo.lock() {
        *corpo = retangulo;
    }
}

fn criar(app: &AppHandle) -> tauri::Result<()> {
    let maior = WebviewWindowBuilder::new(
        app,
        JANELA_DA_TELA_MAIOR,
        WebviewUrl::App("maior.html".into()),
    )
    .title("Suporte da TI")
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .visible(false)
    .build()?;
    if let Some(monitor) = janela::monitor_principal(app) {
        let topo = app
            .state::<Janelas>()
            .aparencia
            .lock()
            .map_or(8.0, |aparencia| aparencia.topo_da_aba());
        let lugar = monitor.lugar_da_tela_maior(topo);
        maior.set_size(tauri::PhysicalSize::new(lugar.largura, lugar.altura))?;
        maior.set_position(tauri::PhysicalPosition::new(lugar.x, lugar.y))?;
    }
    janela::registrar(&maior);
    maior.show()?;
    maior.set_focus()
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn le_o_destino_da_tela() {
        let tela: TelaMaior =
            serde_json::from_str(r#"{"destino":"abrir-chat"}"#).expect("o destino");
        assert_eq!(
            tela,
            TelaMaior {
                destino: Destino::AbrirChat,
                numero: None
            }
        );
    }

    #[test]
    fn o_chamado_vai_com_o_numero_e_as_opcoes_sem_ele() {
        assert_eq!(
            serde_json::to_value(TelaMaior::nova(Destino::Chamado, Some(1041))).ok(),
            Some(serde_json::json!({ "Ok": { "destino": "chamado", "numero": 1041 } }))
        );
        assert_eq!(
            TelaMaior::nova(Destino::VisualizarChamados, Some(3)),
            Ok(TelaMaior {
                destino: Destino::VisualizarChamados,
                numero: None
            })
        );
        assert!(TelaMaior::nova(Destino::Chamado, None).is_err());
        assert!(TelaMaior::nova(Destino::Chamado, Some(0)).is_err());
    }
}
