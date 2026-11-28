//! As janelas no lado nativo (design, decisão 7): transparentes, por cima e fora da barra de tarefas,
//! no monitor principal com a escala dele, e com o clique que passa fora da forma.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window, WindowEvent,
};

use crate::aparencia::{Aparencia, EVENTO_DA_APARENCIA};
use crate::forma::{self, Retangulo};
use crate::posicao::{Lugar, Monitor, Origem, Tela};

pub const JANELA_DA_ABA: &str = "aba";
pub const JANELA_DA_TELA_MAIOR: &str = "maior";

/// O ponteiro é conferido a cada 16 ms, um quadro de 60 Hz.
const PASSO_DO_PONTEIRO: Duration = Duration::from_millis(16);
/// As trocas da tela chegam em rajada: a recolocação espera elas pararem.
const ESPERA_DA_TROCA: Duration = Duration::from_millis(250);

/// O que o clique precisa de cada janela: a forma, onde ela está e se o clique passa agora.
#[derive(Debug, Clone, PartialEq)]
pub struct Clique {
    pub forma: Vec<Retangulo>,
    pub origem: Origem,
    pub passando: bool,
}

impl Clique {
    fn nova(origem: Origem) -> Self {
        Self {
            forma: Vec::new(),
            origem,
            passando: true,
        }
    }

    /// Se o clique deve passar com o ponteiro em `(x, y)`, em px físicos da tela.
    pub fn deve_passar(&self, x: f64, y: f64) -> bool {
        let (na_janela_x, na_janela_y) = self.origem.na_janela(x, y);
        !forma::dentro(&self.forma, na_janela_x, na_janela_y)
    }
}

/// O estado das janelas, que os comandos e a linha do ponteiro dividem.
pub struct Janelas {
    pub aparencia: Mutex<Aparencia>,
    cliques: Mutex<HashMap<String, Clique>>,
    trocas: Mutex<Sender<()>>,
}

impl Janelas {
    pub fn nova(aparencia: Aparencia) -> (Self, Receiver<()>) {
        let (trocas, recebidas) = mpsc::channel();
        let janelas = Self {
            aparencia: Mutex::new(aparencia),
            cliques: Mutex::new(HashMap::new()),
            trocas: Mutex::new(trocas),
        };
        (janelas, recebidas)
    }

    fn avisar_a_troca(&self) {
        if let Ok(trocas) = self.trocas.lock() {
            let _ = trocas.send(());
        }
    }
}

/// O monitor principal, em px físicos, com a escala dele.
pub fn monitor_principal(app: &AppHandle) -> Option<Monitor> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let (posicao, tamanho) = (monitor.position(), monitor.size());
    Some(Monitor {
        x: posicao.x,
        y: posicao.y,
        largura: tamanho.width,
        altura: tamanho.height,
        escala: monitor.scale_factor(),
    })
}

pub fn tela_principal(app: &AppHandle) -> Tela {
    monitor_principal(app).map_or(
        Tela {
            largura: 1920,
            altura: 1080,
        },
        |monitor| monitor.tela(),
    )
}

fn colocar(janela: &WebviewWindow, lugar: Lugar) {
    let _ = janela.set_size(PhysicalSize::new(lugar.largura, lugar.altura));
    let _ = janela.set_position(PhysicalPosition::new(lugar.x, lugar.y));
}

/// Liga o clique que passa numa janela nova: até a forma chegar, todo clique passa.
pub fn registrar(janela: &WebviewWindow) {
    let origem = origem_de(janela.as_ref().window()).unwrap_or(Origem {
        x: 0,
        y: 0,
        escala: 1.0,
    });
    let _ = janela.set_ignore_cursor_events(true);
    if let Ok(mut cliques) = janela.state::<Janelas>().cliques.lock() {
        cliques.insert(janela.label().to_owned(), Clique::nova(origem));
    }
}

/// A forma que a tela informou, em px CSS da janela.
pub fn informar(janela: &WebviewWindow, retangulos: Vec<Retangulo>) {
    if let Ok(mut cliques) = janela.state::<Janelas>().cliques.lock()
        && let Some(clique) = cliques.get_mut(janela.label())
    {
        clique.forma = retangulos;
    }
}

fn origem_de(janela: Window) -> Option<Origem> {
    let posicao = janela.inner_position().ok()?;
    let escala = janela.scale_factor().ok()?;
    Some(Origem {
        x: posicao.x,
        y: posicao.y,
        escala,
    })
}

/// Põe a janela da aba no monitor principal, mostra-a sem tirar o foco de ninguém e começa a
/// acompanhar o ponteiro e as trocas da tela.
pub fn preparar(app: &AppHandle, trocas: Receiver<()>) -> tauri::Result<()> {
    let aba = app
        .get_webview_window(JANELA_DA_ABA)
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    if let Some(monitor) = monitor_principal(app) {
        colocar(&aba, monitor.lugar_da_aba());
    }
    registrar(&aba);
    // A aba aparece sem tirar o foco do programa em que a pessoa está.
    nativo::mostrar_sem_ativar(&aba)?;
    nativo::ouvir_a_troca_da_tela(
        &aba,
        app.state::<Janelas>().trocas.lock().map(|t| t.clone()).ok(),
    );

    let ponteiro = app.clone();
    thread::spawn(move || acompanhar_o_ponteiro(&ponteiro));
    let recolocar = app.clone();
    thread::spawn(move || {
        while trocas.recv().is_ok() {
            // A rajada de trocas vira uma recolocação só.
            thread::sleep(ESPERA_DA_TROCA);
            while trocas.try_recv().is_ok() {}
            recolocar_as_janelas(&recolocar);
        }
    });
    Ok(())
}

/// Liga e desliga o clique que passa conforme o ponteiro entra e sai da forma. Só chama o Windows
/// quando muda, e a linha da apresentação, com a forma vazia, nunca desliga.
fn acompanhar_o_ponteiro(app: &AppHandle) {
    loop {
        thread::sleep(PASSO_DO_PONTEIRO);
        let Some((x, y)) = nativo::ponteiro() else {
            continue;
        };
        let estado = app.state::<Janelas>();
        let mudancas: Vec<(String, bool)> = {
            let Ok(mut cliques) = estado.cliques.lock() else {
                continue;
            };
            cliques
                .iter_mut()
                .filter_map(|(rotulo, clique)| {
                    let passar = clique.deve_passar(x, y);
                    (passar != clique.passando).then(|| {
                        clique.passando = passar;
                        (rotulo.clone(), passar)
                    })
                })
                .collect()
        };
        for (rotulo, passar) in mudancas {
            if let Some(janela) = app.get_webview_window(&rotulo) {
                let _ = janela.set_ignore_cursor_events(passar);
            }
        }
    }
}

/// Volta as janelas ao monitor principal, com a escala dele, e avisa a tela da tela nova.
fn recolocar_as_janelas(app: &AppHandle) {
    let Some(monitor) = monitor_principal(app) else {
        return;
    };
    let estado = app.state::<Janelas>();
    let aparencia = {
        let Ok(mut aparencia) = estado.aparencia.lock() else {
            return;
        };
        let mudou = aparencia.tela != monitor.tela();
        aparencia.tela = monitor.tela();
        mudou.then(|| aparencia.clone())
    };
    if let Some(aba) = app.get_webview_window(JANELA_DA_ABA) {
        colocar(&aba, monitor.lugar_da_aba());
    }
    if let Some(maior) = app.get_webview_window(JANELA_DA_TELA_MAIOR) {
        let topo = estado
            .aparencia
            .lock()
            .map_or(8.0, |aparencia| aparencia.topo_da_aba());
        colocar(&maior, monitor.lugar_da_tela_maior(topo));
    }
    if let Some(aparencia) = aparencia {
        let _ = app.emit(EVENTO_DA_APARENCIA, aparencia);
    }
}

/// O que as janelas avisam: o lugar novo, a escala trocada e a janela fechada.
pub fn ao_mudar(janela: &Window, evento: &WindowEvent) {
    let estado = janela.state::<Janelas>();
    match evento {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Some(origem) = origem_de(janela.clone())
                && let Ok(mut cliques) = estado.cliques.lock()
                && let Some(clique) = cliques.get_mut(janela.label())
            {
                clique.origem = origem;
            }
        }
        // O WM_DPICHANGED: a escala do monitor mudou, ou a janela passou a outro.
        WindowEvent::ScaleFactorChanged { .. } => estado.avisar_a_troca(),
        WindowEvent::Destroyed => {
            if let Ok(mut cliques) = estado.cliques.lock() {
                cliques.remove(janela.label());
            }
        }
        _ => {}
    }
}

/// O que só o Windows responde: o ponteiro e o aviso da troca da tela.
#[cfg(windows)]
mod nativo {
    use std::sync::mpsc::Sender;

    use tauri::WebviewWindow;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, SetForegroundWindow, WM_DISPLAYCHANGE,
    };

    /// O identificador do nosso subclass na janela da aba.
    const TROCA_DA_TELA: usize = 0x6772_6166;

    /// O ponteiro em px físicos da tela (`GetCursorPos`, com a janela ciente da escala por monitor).
    pub fn ponteiro() -> Option<(f64, f64)> {
        let mut ponto = POINT::default();
        // SAFETY: o ponto é nosso e vive durante a chamada.
        unsafe { GetCursorPos(&mut ponto) }.ok()?;
        Some((f64::from(ponto.x), f64::from(ponto.y)))
    }

    unsafe extern "system" fn ao_receber(
        janela: HWND,
        mensagem: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        dados: usize,
    ) -> LRESULT {
        if mensagem == WM_DISPLAYCHANGE {
            // SAFETY: `dados` é o `Sender` que `ouvir_a_troca_da_tela` deixou para a vida do programa.
            let trocas = unsafe { &*(dados as *const Sender<()>) };
            let _ = trocas.send(());
        }
        // SAFETY: a mensagem segue para a janela como chegou.
        unsafe { DefSubclassProc(janela, mensagem, wparam, lparam) }
    }

    /// Mostra pelo Tauri, que liga também o WebView2, e devolve a frente a quem estava nela.
    pub fn mostrar_sem_ativar(janela: &WebviewWindow) -> tauri::Result<()> {
        // SAFETY: só lê qual janela está na frente.
        let da_frente = unsafe { GetForegroundWindow() };
        janela.show()?;
        if !da_frente.is_invalid() && janela.hwnd().is_ok_and(|propria| propria != da_frente) {
            // SAFETY: a janela de antes pode ter fechado; a chamada então só falha.
            let _ = unsafe { SetForegroundWindow(da_frente) };
        }
        Ok(())
    }

    /// O WM_DISPLAYCHANGE, que chega a toda janela de cima quando a resolução ou o monitor principal
    /// mudam, e que o Tauri não passa adiante.
    pub fn ouvir_a_troca_da_tela(janela: &WebviewWindow, trocas: Option<Sender<()>>) {
        let (Some(trocas), Ok(hwnd)) = (trocas, janela.hwnd()) else {
            return;
        };
        let dados = Box::into_raw(Box::new(trocas)) as usize;
        // SAFETY: a janela é nossa e vive com o programa; os dados nunca são soltos.
        let _ = unsafe { SetWindowSubclass(hwnd, Some(ao_receber), TROCA_DA_TELA, dados) };
    }
}

#[cfg(not(windows))]
mod nativo {
    use std::sync::mpsc::Sender;

    use tauri::WebviewWindow;

    pub fn ponteiro() -> Option<(f64, f64)> {
        None
    }

    pub fn mostrar_sem_ativar(janela: &WebviewWindow) -> tauri::Result<()> {
        janela.show()
    }

    pub fn ouvir_a_troca_da_tela(_janela: &WebviewWindow, _trocas: Option<Sender<()>>) {}
}

#[cfg(test)]
mod testes {
    use super::*;

    fn clique_da_pilula(escala: f64) -> Clique {
        Clique {
            forma: vec![Retangulo {
                x: 139.0,
                y: 8.0,
                largura: 162.0,
                altura: 34.0,
                raio_de_cima: 17.0,
                raio_de_baixo: 17.0,
            }],
            origem: Origem {
                x: 740,
                y: 0,
                escala,
            },
            passando: true,
        }
    }

    #[test]
    fn o_clique_na_aba_fica_e_ao_lado_dela_passa() {
        let clique = clique_da_pilula(1.0);
        assert!(!clique.deve_passar(960.0, 25.0));
        assert!(clique.deve_passar(860.0, 25.0));
        assert!(clique.deve_passar(960.0, 300.0));
    }

    #[test]
    fn na_escala_de_150_a_forma_cresce_com_a_janela() {
        let clique = Clique {
            origem: Origem {
                x: 950,
                y: 0,
                escala: 1.5,
            },
            ..clique_da_pilula(1.5)
        };
        assert!(!clique.deve_passar(1280.0, 37.5));
        assert!(clique.deve_passar(1280.0, 70.0));
    }

    #[test]
    fn antes_da_forma_chegar_todo_clique_passa() {
        let clique = Clique::nova(Origem {
            x: 740,
            y: 0,
            escala: 1.0,
        });
        assert!(clique.passando);
        assert!(clique.deve_passar(960.0, 25.0));
    }
}
