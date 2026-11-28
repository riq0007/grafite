//! O estado que a tela lê pelo comando `estado` e recebe no evento `estado-mudou`, com o formato do
//! `GET /api/aba/estado` (design, decisão 6). A sessão dá a pessoa, o motivo da aba sem conexão e,
//! na entrada pela senha, o formulário; a rede dá as contagens, as respostas por ver e a queda.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENTO_DO_ESTADO: &str = "estado-mudou";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RespostaPorVer {
    pub quem: String,
    pub numero: u32,
    pub titulo: String,
    pub momento: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PorVer {
    pub quantas: u32,
    pub ultima: Option<RespostaPorVer>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pessoa {
    pub nome: String,
    pub pela_senha: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SemConexao {
    pub motivo: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Passo {
    Senha,
    Codigo,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Formulario {
    pub passo: Passo,
    pub erro: Option<String>,
    pub espera_ate: Option<String>,
}

impl Formulario {
    /// O usuário e a senha, sem recusa nem espera.
    pub fn senha() -> Self {
        Self {
            passo: Passo::Senha,
            erro: None,
            espera_ate: None,
        }
    }
}

/// O estado da aba, como o `EstadoDaAba` da tela.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaAba {
    pub nao_lidas: Option<u32>,
    pub respostas_novas: Option<u32>,
    pub por_ver: Option<PorVer>,
    pub pessoa: Option<Pessoa>,
    pub atalho_ocupado: bool,
    pub sem_conexao: Option<SemConexao>,
    pub formulario: Option<Formulario>,
    /// O motivo que a sessão dá, do aparelho ou da pessoa, que vem antes da rede.
    #[serde(skip)]
    pub motivo_da_sessao: Option<String>,
    /// A conexão de eventos sem o sinal de vida por 30 s.
    #[serde(skip)]
    pub rede_caida: bool,
}

impl EstadoDaAba {
    /// O `semConexao` da tela, do motivo da sessão ou da rede caída.
    pub fn recompor(&mut self) {
        self.sem_conexao = self
            .motivo_da_sessao
            .clone()
            .or_else(|| self.rede_caida.then(|| crate::sessao::SEM_REDE.to_owned()))
            .map(|motivo| SemConexao { motivo });
    }
}

impl Default for EstadoDaAba {
    /// O de fábrica, o `ESTADO_DE_FABRICA` da tela.
    fn default() -> Self {
        Self {
            nao_lidas: Some(0),
            respostas_novas: Some(0),
            por_ver: None,
            pessoa: None,
            atalho_ocupado: false,
            sem_conexao: None,
            formulario: None,
            motivo_da_sessao: None,
            rede_caida: false,
        }
    }
}

#[derive(Default)]
pub struct Estado(pub Mutex<EstadoDaAba>);

#[tauri::command]
pub fn estado(estado: tauri::State<'_, Estado>) -> Result<EstadoDaAba, String> {
    estado
        .0
        .lock()
        .map(|atual| atual.clone())
        .map_err(|erro| erro.to_string())
}

/// Muda o estado e avisa a tela, só quando ele muda.
pub fn mudar(app: &AppHandle, mudanca: impl FnOnce(&mut EstadoDaAba)) {
    let estado = app.state::<Estado>();
    let novo = {
        let Ok(mut atual) = estado.0.lock() else {
            return;
        };
        let antes = atual.clone();
        mudanca(&mut atual);
        (*atual != antes).then(|| atual.clone())
    };
    if let Some(novo) = novo {
        let _ = app.emit(EVENTO_DO_ESTADO, novo);
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_de_fabrica_e_o_da_tela() {
        assert_eq!(
            serde_json::to_value(EstadoDaAba::default()).expect("o estado em JSON"),
            serde_json::json!({
                "naoLidas": 0,
                "respostasNovas": 0,
                "porVer": null,
                "pessoa": null,
                "atalhoOcupado": false,
                "semConexao": null,
                "formulario": null,
            })
        );
    }

    #[test]
    fn o_motivo_da_sessao_vem_antes_da_rede_caida() {
        let mut estado = EstadoDaAba {
            rede_caida: true,
            ..EstadoDaAba::default()
        };
        estado.recompor();
        assert_eq!(
            estado.sem_conexao.as_ref().map(|sem| sem.motivo.as_str()),
            Some(crate::sessao::SEM_REDE)
        );
        estado.motivo_da_sessao =
            Some("Este computador foi bloqueado na aba. Fale com a TI.".into());
        estado.recompor();
        assert_eq!(
            estado.sem_conexao.as_ref().map(|sem| sem.motivo.as_str()),
            Some("Este computador foi bloqueado na aba. Fale com a TI.")
        );
        estado.motivo_da_sessao = None;
        estado.rede_caida = false;
        estado.recompor();
        assert_eq!(estado.sem_conexao, None);
    }

    #[test]
    fn o_formulario_vai_com_os_nomes_da_tela() {
        let formulario = Formulario {
            passo: Passo::Codigo,
            erro: None,
            espera_ate: Some("2026-11-11T12:05:00.000Z".into()),
        };
        assert_eq!(
            serde_json::to_value(formulario).ok(),
            Some(serde_json::json!({
                "passo": "codigo",
                "erro": null,
                "esperaAte": "2026-11-11T12:05:00.000Z",
            }))
        );
    }
}
