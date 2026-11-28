//! O chat na tela maior (design, decisão 8): um webview remoto, filho da janela da tela maior, com a
//! página `/chat` do servidor, no lugar que a moldura informa. Ele não tem permissão nenhuma do
//! Tauri: nenhuma capability lista o domínio remoto, e a página não chama o lado nativo. Ele nasce ao
//! abrir a tela maior no chat e morre ao fechá-la. Os dados do WebView2 ficam no perfil de toda a
//! aba, da pessoa do Windows (`janela::pasta_do_webview2`), que a sessão pela senha limpa ao abrir e
//! ao terminar.
//!
//! A navegação é o canal da página com a aba. O webview só navega em `/chat` do servidor: outro
//! endereço, mesmo da mesma origem, e a janela nova abrem no navegador padrão. Dois endereços não
//! carregam:
//! - `/chat/entrar` sem o fragmento: a sessão do chat falta, e a aba pede o bilhete
//!   (`POST /api/aba/bilhete`) e navega para `/chat/entrar#<bilhete>`;
//! - `/chat/fechar-a-aba`: o Esc que a página não usou, e a tela maior fecha.
//!
//! O bilhete também vai na primeira abertura com cada sessão da aba: a página carregada sem a sessão
//! do chat mostraria a entrada dela, e não navegaria. A conta com os dois passos, na entrada pelo
//! Windows, não recebe o bilhete e entra pela página do chat, com a marca da aba.

use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl};
use tokio::sync::watch;

use crate::janela::{self, JANELA_DA_TELA_MAIOR};
use crate::rede::Credencial;
use crate::sessao::{Acao, Comando};
use crate::tela_maior::{Destino, EstadoDaTelaMaior, RetanguloDoCorpo, TelaMaior};

pub const ROTULO_DO_CHAT: &str = "chat";
const ENTRAR: &str = "/chat/entrar";
const FECHAR_A_ABA: &str = "/chat/fechar-a-aba";
const PRAZO_DO_BILHETE: Duration = Duration::from_secs(30);
const PEDE_A_ENTRADA: &str = "urn:grafite:problema:bilhete-pede-a-entrada";

/// O que a aba faz com uma navegação do webview do chat.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Navegacao {
    Seguir,
    /// O `/chat/entrar` sem o fragmento: a sessão do chat falta.
    PedirOBilhete,
    /// O `/chat/fechar-a-aba`: o Esc que a página não usou.
    FecharATela,
    /// Fora do `/chat` do servidor, no navegador padrão.
    NoNavegador(Url),
    /// O que não é página: nem carrega, nem vai ao navegador.
    Recusar,
}

pub fn decidir(servidor: &Url, destino: &Url) -> Navegacao {
    // O `about:blank` do começo não passa por aqui; o "Voltar" até ele deixaria o chat em branco.
    if !matches!(destino.scheme(), "http" | "https") {
        return Navegacao::Recusar;
    }
    if destino.origin() != servidor.origin() {
        return Navegacao::NoNavegador(destino.clone());
    }
    let caminho = destino.path().trim_end_matches('/');
    if caminho == FECHAR_A_ABA {
        return Navegacao::FecharATela;
    }
    if caminho == ENTRAR {
        let com_bilhete = destino
            .fragment()
            .is_some_and(|fragmento| !fragmento.is_empty());
        let com_marca = destino
            .query_pairs()
            .any(|(chave, valor)| chave == "aba" && !valor.trim().is_empty());
        return if com_bilhete || com_marca {
            Navegacao::Seguir
        } else {
            Navegacao::PedirOBilhete
        };
    }
    if caminho == "/chat" || caminho.starts_with("/chat/") {
        Navegacao::Seguir
    } else {
        Navegacao::NoNavegador(destino.clone())
    }
}

/// O endereço do chat do destino, como o `enderecoDoDestino` da web.
pub fn caminho_do_destino(tela: TelaMaior) -> String {
    match (tela.destino, tela.numero) {
        (Destino::Chamado, Some(numero)) => format!("/chat/chamados/{numero}"),
        _ => "/chat".to_owned(),
    }
}

/// O destino fechado do bilhete: o chat ou um chamado.
pub fn destino_do_bilhete(tela: TelaMaior) -> serde_json::Value {
    match (tela.destino, tela.numero) {
        (Destino::Chamado, Some(numero)) => json!({ "destino": "chamado", "numero": numero }),
        _ => json!({ "destino": "chat" }),
    }
}

/// O webview do chat, quando a tela maior o mostra, e a sessão da aba com que ele entrou.
pub struct Chat {
    webview: Mutex<Option<tauri::Webview>>,
    /// O token da sessão da aba que já levou o chat à sessão dele; outro token pede outro bilhete.
    entrou_com: Mutex<Option<String>>,
    credenciais: watch::Receiver<Option<Credencial>>,
    cliente: Option<reqwest::Client>,
    /// Um `mostrar` por vez: dois informes seguidos do corpo criariam dois webviews.
    mostrando: tokio::sync::Mutex<()>,
}

impl Chat {
    pub fn novo(credenciais: watch::Receiver<Option<Credencial>>) -> Self {
        Self {
            webview: Mutex::new(None),
            entrou_com: Mutex::new(None),
            credenciais,
            cliente: crate::rede::cliente().ok(),
            mostrando: tokio::sync::Mutex::new(()),
        }
    }

    fn credencial(&self) -> Option<Credencial> {
        self.credenciais.borrow().clone()
    }

    fn webview(&self) -> Option<tauri::Webview> {
        self.webview.lock().ok().and_then(|webview| webview.clone())
    }
}

/// Mostra o chat no lugar do corpo: cria o webview, ou o move, e o leva ao destino quando ele muda.
pub async fn mostrar(app: &AppHandle, tela: TelaMaior, corpo: RetanguloDoCorpo) {
    let Some(chat) = app.try_state::<Chat>() else {
        return;
    };
    let _um_por_vez = chat.mostrando.lock().await;
    let posicao = LogicalPosition::new(corpo.x, corpo.y);
    let tamanho = LogicalSize::new(corpo.largura, corpo.altura);
    if let Some(webview) = chat.webview() {
        let _ = webview.set_position(posicao);
        let _ = webview.set_size(tamanho);
        return;
    }
    let Some(credencial) = chat.credencial() else {
        return;
    };
    let Ok(servidor) = Url::parse(&credencial.servidor) else {
        return;
    };
    let Some(maior) = app.get_webview_window(JANELA_DA_TELA_MAIOR) else {
        return;
    };
    let Ok(em_branco) = Url::parse("about:blank") else {
        return;
    };
    let navegacao = app.clone();
    let mut construtor = WebviewBuilder::new(ROTULO_DO_CHAT, WebviewUrl::External(em_branco))
        .on_navigation(move |destino| aceitar(&navegacao, &servidor, destino))
        .on_new_window(|destino, _| {
            if matches!(destino.scheme(), "http" | "https") {
                abrir_no_navegador(&destino);
            }
            NewWindowResponse::Deny
        });
    if let Some(pasta) = janela::pasta_do_webview2() {
        construtor = construtor.data_directory(pasta);
    }
    let Ok(webview) = maior
        .as_ref()
        .window()
        .add_child(construtor, posicao, tamanho)
    else {
        return;
    };
    let _ = webview.set_focus();
    if let Ok(mut atual) = chat.webview.lock() {
        *atual = Some(webview);
    }
    ir_ao_destino(app, tela).await;
}

/// A navegação que a página pediu: segue, ou vira o pedido do bilhete, o fecho ou o navegador.
fn aceitar(app: &AppHandle, servidor: &Url, destino: &Url) -> bool {
    match decidir(servidor, destino) {
        Navegacao::Seguir => true,
        Navegacao::PedirOBilhete => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(chat) = app.try_state::<Chat>()
                    && let Ok(mut entrou_com) = chat.entrou_com.lock()
                {
                    *entrou_com = None;
                }
                if let Some(tela) = tela_de_agora(&app) {
                    pedir_o_bilhete(&app, tela, true).await;
                }
            });
            false
        }
        Navegacao::FecharATela => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                crate::tela_maior::fechar(&app, true);
            });
            false
        }
        Navegacao::NoNavegador(endereco) => {
            abrir_no_navegador(&endereco);
            false
        }
        Navegacao::Recusar => false,
    }
}

fn tela_de_agora(app: &AppHandle) -> Option<TelaMaior> {
    app.state::<EstadoDaTelaMaior>()
        .tela
        .lock()
        .ok()
        .and_then(|tela| *tela)
}

/// Leva o chat aberto ao destino: direto, com a sessão do chat desta sessão da aba, ou pelo bilhete.
pub async fn ir_ao_destino(app: &AppHandle, tela: TelaMaior) {
    let Some(chat) = app.try_state::<Chat>() else {
        return;
    };
    let (Some(webview), Some(credencial)) = (chat.webview(), chat.credencial()) else {
        return;
    };
    let entrou = chat
        .entrou_com
        .lock()
        .is_ok_and(|entrou_com| entrou_com.as_deref() == Some(credencial.token.as_str()));
    if !entrou {
        pedir_o_bilhete(app, tela, false).await;
        return;
    }
    if let Ok(endereco) = Url::parse(&format!(
        "{}{}",
        credencial.servidor,
        caminho_do_destino(tela)
    )) {
        let _ = webview.navigate(endereco);
    }
}

#[derive(Deserialize)]
struct Bilhete {
    bilhete: String,
}

#[derive(Deserialize)]
struct RecusaDoBilhete {
    #[serde(rename = "type")]
    tipo: String,
    aba: Option<String>,
}

/// O `/chat/entrar#<bilhete>`. O pedido da página (`de_novo`) vem de uma página do servidor, às vezes
/// a própria `/chat/entrar`, e o bilhete só no fragmento não a carregaria de novo: a busca
/// `?de-novo` faz o endereço mudar.
pub fn endereco_do_bilhete(servidor: &str, bilhete: &str, de_novo: bool) -> Option<Url> {
    let busca = if de_novo { "?de-novo" } else { "" };
    Url::parse(&format!("{servidor}{ENTRAR}{busca}#{bilhete}")).ok()
}

/// A marca da aba na recusa do bilhete à conta que entra no chat com a senha e o código.
pub fn marca_da_recusa(corpo: &[u8]) -> Option<String> {
    let recusa: RecusaDoBilhete = serde_json::from_slice(corpo).ok()?;
    (recusa.tipo == PEDE_A_ENTRADA)
        .then_some(recusa.aba)
        .flatten()
        .filter(|aba| !aba.trim().is_empty())
}

/// A entrada do chat com a marca da aba: a conta com os dois passos entra ali, com a senha e o
/// código, e a sessão que sai dela fica ligada à sessão da aba.
pub fn entrada_com_a_marca(servidor: &str, marca: &str) -> Option<Url> {
    let mut endereco = Url::parse(&format!("{servidor}{ENTRAR}")).ok()?;
    endereco.query_pairs_mut().append_pair("aba", marca);
    Some(endereco)
}

/// Pede o bilhete e leva o chat a `/chat/entrar#<bilhete>`; a conta com os dois passos vai à
/// entrada do chat com a marca da aba.
async fn pedir_o_bilhete(app: &AppHandle, tela: TelaMaior, de_novo: bool) {
    let Some(chat) = app.try_state::<Chat>() else {
        return;
    };
    let (Some(webview), Some(credencial), Some(cliente)) =
        (chat.webview(), chat.credencial(), chat.cliente.clone())
    else {
        return;
    };
    let enviado = cliente
        .post(format!("{}/api/aba/bilhete", credencial.servidor))
        .bearer_auth(&credencial.token)
        .json(&destino_do_bilhete(tela))
        .timeout(PRAZO_DO_BILHETE)
        .send()
        .await;
    let Ok(resposta) = enviado else {
        return;
    };
    let endereco = match resposta.status().as_u16() {
        200..=299 => match resposta.json::<Bilhete>().await {
            Ok(Bilhete { bilhete }) => endereco_do_bilhete(&credencial.servidor, &bilhete, de_novo),
            Err(_) => return,
        },
        403 => {
            let corpo = resposta.bytes().await.unwrap_or_default();
            match marca_da_recusa(&corpo) {
                Some(marca) => entrada_com_a_marca(&credencial.servidor, &marca),
                None => return conferir_a_sessao(app),
            }
        }
        401 => return conferir_a_sessao(app),
        _ => return,
    };
    let Some(endereco) = endereco else {
        return;
    };
    if let Ok(mut entrou_com) = chat.entrou_com.lock() {
        *entrou_com = Some(credencial.token.clone());
    }
    let _ = webview.navigate(endereco);
}

/// O bilhete recusado pela sessão da aba: a linha da sessão confere.
fn conferir_a_sessao(app: &AppHandle) {
    if let Some(comandos) = app.try_state::<crate::sessao::Comandos>() {
        let _ = comandos
            .copia()
            .send(Comando::sem_resposta(Acao::ConferirASessao));
    }
}

/// Destrói o webview do chat: a tela maior fechou, saiu do chat ou ficou sem conexão.
pub fn fechar(app: &AppHandle) {
    let webview = app.try_state::<Chat>().and_then(|chat| {
        chat.webview
            .lock()
            .ok()
            .and_then(|mut webview| webview.take())
    });
    if let Some(webview) = webview {
        let _ = webview.close();
    }
}

/// O endereço de fora, no navegador padrão da pessoa. Só o http e o https chegam aqui.
fn abrir_no_navegador(endereco: &Url) {
    nativo::abrir(endereco.as_str());
}

#[cfg(windows)]
mod nativo {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{HSTRING, w};

    pub fn abrir(endereco: &str) {
        let endereco = HSTRING::from(endereco);
        // SAFETY: os textos vivem durante a chamada; o Windows abre o endereço no navegador padrão.
        unsafe {
            ShellExecuteW(None, w!("open"), &endereco, None, None, SW_SHOWNORMAL);
        }
    }
}

#[cfg(not(windows))]
mod nativo {
    pub fn abrir(_endereco: &str) {}
}

#[cfg(test)]
mod testes {
    use super::*;

    fn url(texto: &str) -> Url {
        Url::parse(texto).expect("o endereço")
    }

    const SERVIDOR: &str = "https://grafite.empresa.local";

    #[test]
    fn o_chat_do_servidor_segue() {
        let servidor = url(SERVIDOR);
        assert_eq!(
            decidir(&servidor, &url("https://grafite.empresa.local/chat")),
            Navegacao::Seguir
        );
        assert_eq!(
            decidir(
                &servidor,
                &url("https://grafite.empresa.local/chat/chamados/1041")
            ),
            Navegacao::Seguir
        );
    }

    #[test]
    fn o_entrar_sem_o_fragmento_pede_o_bilhete() {
        let servidor = url(SERVIDOR);
        assert_eq!(
            decidir(&servidor, &url("https://grafite.empresa.local/chat/entrar")),
            Navegacao::PedirOBilhete
        );
        assert_eq!(
            decidir(
                &servidor,
                &url("https://grafite.empresa.local/chat/entrar/")
            ),
            Navegacao::PedirOBilhete
        );
        assert_eq!(
            decidir(
                &servidor,
                &url("https://grafite.empresa.local/chat/entrar#")
            ),
            Navegacao::PedirOBilhete,
            "o fragmento vazio não é bilhete"
        );
        assert_eq!(
            decidir(
                &servidor,
                &url("https://grafite.empresa.local/chat/entrar#b1lh3t3")
            ),
            Navegacao::Seguir
        );
        assert_eq!(
            decidir(
                &servidor,
                &url("https://grafite.empresa.local/chat/entrar?aba=T3XX8W")
            ),
            Navegacao::Seguir,
            "a entrada do chat com a marca da aba"
        );
    }

    #[test]
    fn o_esc_que_a_pagina_nao_usou_fecha_a_tela() {
        assert_eq!(
            decidir(
                &url(SERVIDOR),
                &url("https://grafite.empresa.local/chat/fechar-a-aba")
            ),
            Navegacao::FecharATela
        );
    }

    #[test]
    fn fora_do_chat_vai_ao_navegador() {
        let servidor = url(SERVIDOR);
        let conta = url("https://grafite.empresa.local/conta");
        assert_eq!(
            decidir(&servidor, &conta),
            Navegacao::NoNavegador(conta.clone())
        );
        let parecido = url("https://grafite.empresa.local/chatx");
        assert_eq!(
            decidir(&servidor, &parecido),
            Navegacao::NoNavegador(parecido.clone())
        );
        let subindo = url("https://grafite.empresa.local/chat/../conta");
        assert_eq!(
            decidir(&servidor, &subindo),
            Navegacao::NoNavegador(url("https://grafite.empresa.local/conta"))
        );
        let de_fora = url("https://exemplo.com/chat");
        assert_eq!(
            decidir(&servidor, &de_fora),
            Navegacao::NoNavegador(de_fora.clone())
        );
        let outra_porta = url("https://grafite.empresa.local:8443/chat");
        assert_eq!(
            decidir(&servidor, &outra_porta),
            Navegacao::NoNavegador(outra_porta.clone())
        );
    }

    #[test]
    fn o_que_nao_e_pagina_nem_carrega() {
        let servidor = url(SERVIDOR);
        assert_eq!(
            decidir(&servidor, &url("file:///C:/Windows/notepad.exe")),
            Navegacao::Recusar
        );
        assert_eq!(
            decidir(&servidor, &url("javascript:alert(1)")),
            Navegacao::Recusar
        );
        assert_eq!(
            decidir(&servidor, &url("ms-settings:privacy")),
            Navegacao::Recusar
        );
        assert_eq!(
            decidir(&servidor, &url("about:blank")),
            Navegacao::Recusar,
            "o voltar até o começo"
        );
    }

    #[test]
    fn o_destino_do_chat_e_do_bilhete() {
        let chat = TelaMaior {
            destino: Destino::AbrirChat,
            numero: None,
        };
        let chamado = TelaMaior {
            destino: Destino::Chamado,
            numero: Some(1041),
        };
        assert_eq!(caminho_do_destino(chat), "/chat");
        assert_eq!(caminho_do_destino(chamado), "/chat/chamados/1041");
        assert_eq!(destino_do_bilhete(chat), json!({ "destino": "chat" }));
        assert_eq!(
            destino_do_bilhete(chamado),
            json!({ "destino": "chamado", "numero": 1041 })
        );
    }

    #[test]
    fn o_bilhete_pedido_pela_pagina_muda_o_endereco() {
        let primeiro = endereco_do_bilhete(SERVIDOR, "b1lh3t3", false).expect("o endereço");
        assert_eq!(
            primeiro.as_str(),
            "https://grafite.empresa.local/chat/entrar#b1lh3t3"
        );
        let de_novo = endereco_do_bilhete(SERVIDOR, "0utr0", true).expect("o endereço");
        assert_eq!(
            de_novo.as_str(),
            "https://grafite.empresa.local/chat/entrar?de-novo#0utr0"
        );
        let servidor = url(SERVIDOR);
        assert_eq!(decidir(&servidor, &primeiro), Navegacao::Seguir);
        assert_eq!(decidir(&servidor, &de_novo), Navegacao::Seguir);
    }

    #[test]
    fn a_conta_com_os_dois_passos_vai_a_entrada_com_a_marca() {
        let recusa = br#"{"type":"urn:grafite:problema:bilhete-pede-a-entrada","title":"Entre no chat","status":403,"detail":"","codigoDeRastreio":"R7K2-9QXM","aba":"T3XX8W"}"#;
        assert_eq!(marca_da_recusa(recusa).as_deref(), Some("T3XX8W"));
        assert_eq!(
            entrada_com_a_marca(SERVIDOR, "T3XX8W").map(String::from),
            Some("https://grafite.empresa.local/chat/entrar?aba=T3XX8W".to_owned())
        );
        let outra = br#"{"type":"urn:grafite:problema:token-da-aba-recusado","aba":"T3XX8W"}"#;
        assert_eq!(
            marca_da_recusa(outra),
            None,
            "outra recusa confere a sessão"
        );
        let sem_marca = br#"{"type":"urn:grafite:problema:bilhete-pede-a-entrada","aba":" "}"#;
        assert_eq!(marca_da_recusa(sem_marca), None);
        assert_eq!(marca_da_recusa(b"<html>"), None);
    }

    #[test]
    fn a_pagina_remota_nao_tem_capability() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/aba.json")).expect("a capability");
        assert!(capability.get("remote").is_none(), "nenhum domínio remoto");
        assert_eq!(capability["windows"], json!(["aba", "maior"]));
        assert!(capability.get("webviews").is_none());
    }
}
