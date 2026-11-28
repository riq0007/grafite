//! A API pelo `reqwest`, com o schannel do Windows (design, decisão 10): o certificado conferido
//! pelo repositório do Windows, que tem a autoridade interna da empresa. Sem seguir redirecionamento,
//! para o token não ir a outro endereço.

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
}

#[derive(Clone)]
pub struct ApiHttp {
    cliente: Client,
}

impl ApiHttp {
    pub fn nova() -> reqwest::Result<Self> {
        let cliente = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .redirect(Policy::none())
            .user_agent(format!("grafite-aba-servico/{VERSAO}"))
            .build()?;
        Ok(Self { cliente })
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
    let resposta = enviado.map_err(|erro| Falha {
        decisao: Decisao::TentarDepois,
        status: 0,
        problema: None,
        // O erro do reqwest leva o endereço, sem segredo: o token vai no cabeçalho.
        para_o_log: format!("sem resposta: {erro}"),
    })?;
    let status = resposta.status();
    if status.is_success() {
        return resposta.json::<T>().map_err(|erro| Falha {
            decisao: Decisao::TentarDepois,
            status: status.as_u16(),
            problema: None,
            para_o_log: format!("resposta estranha da API: {erro}"),
        });
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
}
