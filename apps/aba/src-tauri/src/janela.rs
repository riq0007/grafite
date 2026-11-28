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
use crate::{foco, sistema};

pub const JANELA_DA_ABA: &str = "aba";
pub const JANELA_DA_TELA_MAIOR: &str = "maior";

/// O ponteiro é conferido a cada 16 ms, um quadro de 60 Hz.
const PASSO_DO_PONTEIRO: Duration = Duration::from_millis(16);
/// As trocas da tela e dos ajustes chegam em rajada: a releitura espera elas pararem.
const ESPERA_DA_TROCA: Duration = Duration::from_millis(250);
/// A apresentação é lida a cada 2 s.
const PASSO_DA_APRESENTACAO: Duration = Duration::from_secs(2);

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

/// Muda a aparência e avisa a tela, só quando ela muda.
fn mudar_a_aparencia(app: &AppHandle, mudanca: impl FnOnce(&mut Aparencia)) {
    let janelas = app.state::<Janelas>();
    let nova = {
        let Ok(mut atual) = janelas.aparencia.lock() else {
            return;
        };
        let antes = atual.clone();
        mudanca(&mut atual);
        (*atual != antes).then(|| atual.clone())
    };
    if let Some(nova) = nova {
        let _ = app.emit(EVENTO_DA_APARENCIA, nova);
    }
}

/// Prepara uma janela nossa antes de ela aparecer: fora do Alt+Tab e com o clique que passa, que até
/// a forma chegar deixa todo clique passar.
pub fn registrar(janela: &WebviewWindow) {
    nativo::tirar_do_alt_tab(janela);
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
    nativo::ouvir_o_windows(
        &aba,
        app.state::<Janelas>().trocas.lock().map(|t| t.clone()).ok(),
    );
    // A aba aparece sem tirar o foco do programa em que a pessoa está.
    nativo::mostrar_sem_ativar(&aba)?;

    let ponteiro = app.clone();
    thread::spawn(move || acompanhar_o_ponteiro(&ponteiro));
    let apresentacao = app.clone();
    thread::spawn(move || acompanhar_a_apresentacao(&apresentacao));
    let atualizacao = app.clone();
    thread::spawn(move || {
        while trocas.recv().is_ok() {
            // A rajada de trocas vira uma releitura só.
            thread::sleep(ESPERA_DA_TROCA);
            while trocas.try_recv().is_ok() {}
            atualizar(&atualizacao);
        }
    });
    Ok(())
}

/// O `SHQueryUserNotificationState` a cada 2 s: um programa em tela cheia em qualquer monitor, ou o
/// modo de apresentação, encolhe a aba para a linha.
fn acompanhar_a_apresentacao(app: &AppHandle) {
    loop {
        thread::sleep(PASSO_DA_APRESENTACAO);
        let agora = sistema::apresentacao();
        mudar_a_aparencia(app, |aparencia| aparencia.apresentacao = agora);
    }
}

/// Liga e desliga o clique que passa conforme o ponteiro entra e sai da forma. Só chama o Windows
/// quando muda, e a linha da apresentação, com a forma vazia, nunca desliga.
fn acompanhar_o_ponteiro(app: &AppHandle) {
    loop {
        thread::sleep(PASSO_DO_PONTEIRO);
        foco::guardar_a_frente(app);
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

/// Lê de novo o tema, o alto contraste e as animações, volta as janelas ao monitor principal, com a
/// escala dele, e avisa a tela do que mudou.
fn atualizar(app: &AppHandle) {
    let do_windows = sistema::ler();
    mudar_a_aparencia(app, |aparencia| {
        aparencia.tema = do_windows.tema;
        aparencia.movimento_reduzido = do_windows.movimento_reduzido;
    });
    let Some(monitor) = monitor_principal(app) else {
        return;
    };
    mudar_a_aparencia(app, |aparencia| aparencia.tela = monitor.tela());
    let estado = app.state::<Janelas>();
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
}

/// O que as janelas avisam: o lugar novo, a escala trocada, o foco perdido e a janela fechada.
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
        WindowEvent::Focused(false) => foco::ao_perder_o_foco(janela.app_handle()),
        WindowEvent::Destroyed => {
            if let Ok(mut cliques) = estado.cliques.lock() {
                cliques.remove(janela.label());
            }
        }
        _ => {}
    }
}

/// O que só o Windows responde: o ponteiro, o Alt+Tab e o aviso da troca da tela e dos ajustes.
#[cfg(windows)]
mod nativo {
    use std::sync::mpsc::Sender;

    use tauri::WebviewWindow;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, STYLESTRUCT,
        SetForegroundWindow, SetWindowLongPtrW, WM_DISPLAYCHANGE, WM_SETTINGCHANGE,
        WM_STYLECHANGING, WM_SYSCOLORCHANGE, WM_THEMECHANGED, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    };

    /// O identificador do nosso subclass nas janelas.
    const DA_ABA: usize = 0x6772_6166;

    #[cfg(test)]
    pub fn sem_alt_tab_para_teste(estilo: u32) -> u32 {
        sem_alt_tab(estilo)
    }

    /// Fora do Alt+Tab e da barra de tarefas: a janela de ferramenta, sem a de app. O Tauri refaz o
    /// estilo a cada mudança, como a do clique que passa, e por isso o filtro fica no WM_STYLECHANGING.
    fn sem_alt_tab(estilo: u32) -> u32 {
        (estilo | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0
    }

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
        match mensagem {
            WM_STYLECHANGING if wparam.0 as i32 == GWL_EXSTYLE.0 => {
                // SAFETY: no WM_STYLECHANGING do estilo estendido, o lparam é o STYLESTRUCT que o
                // Windows vai aplicar.
                let estilos = unsafe { &mut *(lparam.0 as *mut STYLESTRUCT) };
                estilos.styleNew = sem_alt_tab(estilos.styleNew);
            }
            // A resolução, o monitor principal, o tema, o alto contraste e as animações.
            WM_DISPLAYCHANGE | WM_SETTINGCHANGE | WM_THEMECHANGED | WM_SYSCOLORCHANGE
                if dados != 0 =>
            {
                // SAFETY: `dados` é o `Sender` que `ouvir_o_windows` deixou para a vida do programa.
                let trocas = unsafe { &*(dados as *const Sender<()>) };
                let _ = trocas.send(());
            }
            _ => {}
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

    fn subclasse(janela: &WebviewWindow, dados: usize) {
        let Ok(hwnd) = janela.hwnd() else {
            return;
        };
        // SAFETY: a janela é nossa; o mesmo identificador troca os dados do subclass anterior.
        let _ = unsafe { SetWindowSubclass(hwnd, Some(ao_receber), DA_ABA, dados) };
    }

    /// Tira a janela do Alt+Tab, antes de ela aparecer.
    pub fn tirar_do_alt_tab(janela: &WebviewWindow) {
        subclasse(janela, 0);
        let Ok(hwnd) = janela.hwnd() else {
            return;
        };
        // SAFETY: a janela é nossa; o filtro do subclass confere o estilo novo.
        unsafe {
            let estilo = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, sem_alt_tab(estilo) as isize);
        }
    }

    /// O WM_DISPLAYCHANGE e o WM_SETTINGCHANGE, que chegam a toda janela de cima e que o Tauri não
    /// passa adiante.
    pub fn ouvir_o_windows(janela: &WebviewWindow, trocas: Option<Sender<()>>) {
        let Some(trocas) = trocas else {
            return;
        };
        // Os dados nunca são soltos: a janela da aba vive com o programa.
        subclasse(janela, Box::into_raw(Box::new(trocas)) as usize);
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

    pub fn tirar_do_alt_tab(_janela: &WebviewWindow) {}

    pub fn ouvir_o_windows(_janela: &WebviewWindow, _trocas: Option<Sender<()>>) {}
}

#[cfg(test)]
mod testes {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn a_janela_fica_fora_do_alt_tab_mesmo_com_o_estilo_de_app() {
        // O estilo que o Tauri dá: por cima, o clique que passa, a borda, os arquivos e o de app.
        let do_tauri = 0x000C_0138;
        let estilo = nativo::sem_alt_tab_para_teste(do_tauri);
        assert_eq!(estilo & 0x0004_0000, 0, "sem o WS_EX_APPWINDOW");
        assert_eq!(estilo & 0x0000_0080, 0x80, "com o WS_EX_TOOLWINDOW");
        assert_eq!(estilo & 0x0000_0008, 0x08, "segue por cima");
        assert_eq!(estilo & 0x0000_0020, 0x20, "segue com o clique que passa");
    }

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
