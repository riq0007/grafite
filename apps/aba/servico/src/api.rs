//! A API pelo `reqwest`, com o schannel do Windows (design, decisão 10): o certificado conferido
//! pelo repositório do Windows, que tem a autoridade interna da empresa, e o proxy da máquina, do
//! `netsh winhttp`. Sem seguir redirecionamento, para o token não ir a outro endereço.

use std::time::Duration;

use reqwest::blocking::{Client, RequestBuilder, Response};
use reqwest::redirect::Policy;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::json;

use crate::aparelho::{Api, Falha, PedidoDeRegistro, Registro, RespostaDaConfiguracao, VERSAO};
use crate::problema::{Decisao, Problema, decidir};
use crate::segredo::Segredo;

pub const CABECALHO_DA_VERSAO: &str = "x-grafite-versao-da-aba";
pub const CABECALHO_DO_COMPUTADOR: &str = "x-grafite-computador";

/// A sessão aberta pela API.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessaoAberta {
    pub token: Segredo,
    pub expira_em: String,
    pub pessoa: PessoaDaSessao,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PessoaDaSessao {
    pub nome: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Renovacao {
    pub expira_em: String,
}

/// A resposta da entrada pela senha: a sessão, ou a pendente do código.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Aberta {
    #[serde(rename_all = "camelCase")]
    FaltaOCodigo {
        #[allow(dead_code, reason = "só a forma da resposta, que o serde confere")]
        falta_o_codigo: bool,
        pendente: Segredo,
        expira_em: String,
    },
    Sessao(SessaoAberta),
}

/// Os pedidos da sessão pelo Windows, que o pipe faz em nome de quem chama.
pub trait ApiDaSessao {
    fn abrir_pelo_windows(
        &self,
        servidor: &str,
        token_do_aparelho: &Segredo,
        sid: &str,
        usuario_do_windows: &str,
        computador: Option<&str>,
    ) -> Result<SessaoAberta, Falha>;

    fn renovar(
        &self,
        servidor: &str,
        token_da_sessao: &Segredo,
        sid: &str,
        computador: Option<&str>,
    ) -> Result<Renovacao, Falha>;

    fn abrir_pela_senha(
        &self,
        servidor: &str,
        token_do_aparelho: &Segredo,
        usuario: &str,
        senha: &Segredo,
        computador: Option<&str>,
    ) -> Result<Aberta, Falha>;

    fn codigo(
        &self,
        servidor: &str,
        token_do_aparelho: &Segredo,
        pendente: &Segredo,
        codigo: &Segredo,
        computador: Option<&str>,
    ) -> Result<Aberta, Falha>;

    fn sair(&self, servidor: &str, token_da_sessao: &Segredo) -> Result<(), Falha>;

    fn uso(&self, servidor: &str, token_da_sessao: &Segredo) -> Result<(), Falha>;
}

#[derive(Clone)]
pub struct ApiHttp {
    cliente: Client,
}

impl ApiHttp {
    pub fn nova() -> reqwest::Result<Self> {
        let construtor = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .redirect(Policy::none())
            .user_agent(format!("grafite-aba-servico/{VERSAO}"))
            // Só o proxy da máquina, e não o das variáveis de ambiente.
            .no_proxy();
        #[cfg(windows)]
        let construtor = match grafite_aba_pipe::proxy::da_maquina() {
            Some(proxy) => construtor.proxy(reqwest::Proxy::custom(move |url| {
                proxy
                    .para(url.scheme(), url.host_str()?, url.port_or_known_default())
                    .and_then(|servidor| reqwest::Url::parse(&servidor).ok())
            })),
            None => construtor,
        };
        Ok(Self {
            cliente: construtor.build()?,
        })
    }
}

/// A versão e o nome do computador, este só em ASCII (`computador::nome_no_cabecalho`).
fn cabecalhos(pedido: RequestBuilder, computador: Option<&str>) -> RequestBuilder {
    let pedido = pedido.header(CABECALHO_DA_VERSAO, VERSAO);
    match computador {
        Some(nome) => pedido.header(CABECALHO_DO_COMPUTADOR, nome),
        None => pedido,
    }
}

fn resposta<T: DeserializeOwned>(enviado: reqwest::Result<Response>) -> Result<T, Falha> {
    let resposta = sem_erro(enviado)?;
    let status = resposta.status();
    resposta.json::<T>().map_err(|erro| Falha {
        decisao: Decisao::TentarDepois,
        status: status.as_u16(),
        problema: None,
        para_o_log: format!("resposta estranha da API: {erro}"),
    })
}

/// O `204`, sem corpo.
fn resposta_vazia(enviado: reqwest::Result<Response>) -> Result<(), Falha> {
    sem_erro(enviado).map(drop)
}

fn sem_erro(enviado: reqwest::Result<Response>) -> Result<Response, Falha> {
    let resposta = enviado.map_err(|erro| Falha {
        decisao: Decisao::TentarDepois,
        status: 0,
        problema: None,
        // O erro do reqwest leva o endereço, sem segredo: o token vai no cabeçalho.
        para_o_log: format!("sem resposta: {erro}"),
    })?;
    let status = resposta.status();
    if status.is_success() {
        return Ok(resposta);
    }
    let retry_after = resposta
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|valor| valor.to_str().ok())
        .map(str::to_owned);
    let problema = resposta.json::<Problema>().ok();
    let codigo = problema
        .as_ref()
        .and_then(Problema::codigo)
        .unwrap_or("sem o tipo");
    let para_o_log = format!("{} {codigo}", status.as_u16());
    Err(Falha {
        decisao: decidir(status.as_u16(), problema.as_ref(), retry_after.as_deref()),
        status: status.as_u16(),
        problema: problema.map(Box::new),
        para_o_log,
    })
}

impl Api for ApiHttp {
    fn registrar(
        &self,
        servidor: &str,
        pedido: &PedidoDeRegistro<'_>,
        computador: Option<&str>,
    ) -> Result<Registro, Falha> {
        let enviado = cabecalhos(
            self.cliente.post(format!("{servidor}/api/aba/aparelho")),
            computador,
        )
        .json(pedido)
        .send();
        resposta(enviado)
    }

    fn configuracao(
        &self,
        servidor: &str,
        token: &Segredo,
        computador: Option<&str>,
    ) -> Result<RespostaDaConfiguracao, Falha> {
        let enviado = cabecalhos(
            self.cliente.get(format!("{servidor}/api/aba/configuracao")),
            computador,
        )
        .bearer_auth(token.expor())
        .send();
        resposta(enviado)
    }
}

impl ApiDaSessao for ApiHttp {
    fn abrir_pelo_windows(
        &self,
        servidor: &str,
        token_do_aparelho: &Segredo,
        sid: &str,
        usuario_do_windows: &str,
        computador: Option<&str>,
    ) -> Result<SessaoAberta, Falha> {
        let enviado = cabecalhos(
            self.cliente.post(format!("{servidor}/api/aba/sessao")),
            computador,
        )
        .bearer_auth(token_do_aparelho.expor())
        .json(&json!({
            "entrada": "windows",
            "sid": sid,
            "usuarioDoWindows": usuario_do_windows,
        }))
        .send();
        resposta(enviado)
    }

    fn renovar(
        &self,
        servidor: &str,
        token_da_sessao: &Segredo,
        sid: &str,
        computador: Option<&str>,
    ) -> Result<Renovacao, Falha> {
        let enviado = cabecalhos(
            self.cliente
                .post(format!("{servidor}/api/aba/sessao/renovar")),
            computador,
        )
        .bearer_auth(token_da_sessao.expor())
        .json(&json!({ "sid": sid }))
        .send();
        resposta(enviado)
    }

    fn abrir_pela_senha(
        &self,
        servidor: &str,
        token_do_aparelho: &Segredo,
        usuario: &str,
        senha: &Segredo,
        computador: Option<&str>,
    ) -> Result<Aberta, Falha> {
        let enviado = cabecalhos(
            self.cliente.post(format!("{servidor}/api/aba/sessao")),
            computador,
        )
        .bearer_auth(token_do_aparelho.expor())
        .json(&json!({
            "entrada": "senha",
            "usuario": usuario,
            "senha": senha.expor(),
        }))
        .send();
        resposta(enviado)
    }

    fn codigo(
        &self,
        servidor: &str,
        token_do_aparelho: &Segredo,
        pendente: &Segredo,
        codigo: &Segredo,
        computador: Option<&str>,
    ) -> Result<Aberta, Falha> {
        let enviado = cabecalhos(
            self.cliente.post(format!("{servidor}/api/aba/sessao")),
            computador,
        )
        .bearer_auth(token_do_aparelho.expor())
        .json(&json!({
            "entrada": "senha",
            "pendente": pendente.expor(),
            "codigo": codigo.expor(),
        }))
        .send();
        resposta(enviado)
    }

    fn sair(&self, servidor: &str, token_da_sessao: &Segredo) -> Result<(), Falha> {
        let enviado = cabecalhos(
            self.cliente.delete(format!("{servidor}/api/aba/sessao")),
            None,
        )
        .bearer_auth(token_da_sessao.expor())
        .send();
        resposta_vazia(enviado)
    }

    fn uso(&self, servidor: &str, token_da_sessao: &Segredo) -> Result<(), Falha> {
        let enviado = cabecalhos(self.cliente.post(format!("{servidor}/api/aba/uso")), None)
            .bearer_auth(token_da_sessao.expor())
            .send();
        resposta_vazia(enviado)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn a_resposta_da_senha_e_a_sessao_ou_a_pendente() {
        let sessao: Aberta = serde_json::from_value(json!({
            "token": "tok",
            "expiraEm": "2026-11-28T04:00:00.000Z",
            "pessoa": { "nome": "Carla Dias" },
        }))
        .expect("a sessão");
        assert!(
            matches!(sessao, Aberta::Sessao(SessaoAberta { pessoa, .. }) if pessoa.nome == "Carla Dias")
        );
        let pendente: Aberta = serde_json::from_value(json!({
            "faltaOCodigo": true,
            "pendente": "pend",
            "expiraEm": "2026-11-28T04:05:00.000Z",
        }))
        .expect("a pendente");
        assert!(
            matches!(pendente, Aberta::FaltaOCodigo { pendente, .. } if pendente.expor() == "pend")
        );
    }
}
