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

/// O corpo da entrada pelo Windows, como o exemplo `pelo-windows` de `exemplos/sessao.json`.
fn corpo_pelo_windows(sid: &str, usuario_do_windows: &str) -> serde_json::Value {
    json!({
        "entrada": "windows",
        "sid": sid,
        "usuarioDoWindows": usuario_do_windows,
    })
}

/// O corpo da renovação, como o exemplo de `exemplos/sessao-renovar.json`.
fn corpo_da_renovacao(sid: &str) -> serde_json::Value {
    json!({ "sid": sid })
}

/// O corpo da entrada pela senha, como o exemplo `pela-senha` de `exemplos/sessao.json`.
fn corpo_pela_senha(usuario: &str, senha: &Segredo) -> serde_json::Value {
    json!({
        "entrada": "senha",
        "usuario": usuario,
        "senha": senha.expor(),
    })
}

/// O corpo do código, como o exemplo `codigo` de `exemplos/sessao.json`.
fn corpo_do_codigo(pendente: &Segredo, codigo: &Segredo) -> serde_json::Value {
    json!({
        "entrada": "senha",
        "pendente": pendente.expor(),
        "codigo": codigo.expor(),
    })
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
        .json(&corpo_pelo_windows(sid, usuario_do_windows))
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
        .json(&corpo_da_renovacao(sid))
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
        .json(&corpo_pela_senha(usuario, senha))
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
        .json(&corpo_do_codigo(pendente, codigo))
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
    use std::time::Duration;

    use serde_json::Value;

    use grafite_aba_pipe::Entrada;

    use super::*;

    // Os exemplos que o teste de `exemplos/exemplos.test.ts` confere contra o OpenAPI: o corpo que o
    // serviço monta é o do exemplo, e o que ele lê sai do exemplo.
    const APARELHO: &str = include_str!("../../exemplos/aparelho.json");
    const CONFIGURACAO: &str = include_str!("../../exemplos/configuracao.json");
    const SESSAO: &str = include_str!("../../exemplos/sessao.json");
    const RENOVACAO: &str = include_str!("../../exemplos/sessao-renovar.json");

    fn exemplo(arquivo: &str, caminho: &[&str]) -> Value {
        let mut valor: Value = serde_json::from_str(arquivo).expect("os exemplos");
        for parte in caminho {
            valor = valor
                .get_mut(*parte)
                .map(Value::take)
                .unwrap_or_else(|| panic!("o exemplo {caminho:?}"));
        }
        valor
    }

    fn texto<'a>(corpo: &'a Value, campo: &str) -> &'a str {
        corpo[campo].as_str().unwrap_or_else(|| panic!("o {campo}"))
    }

    #[test]
    fn os_pedidos_da_sessao_sao_os_dos_exemplos() {
        let windows = exemplo(SESSAO, &["pedidos", "pelo-windows"]);
        assert_eq!(
            corpo_pelo_windows(texto(&windows, "sid"), texto(&windows, "usuarioDoWindows")),
            windows
        );
        let senha = exemplo(SESSAO, &["pedidos", "pela-senha"]);
        assert_eq!(
            corpo_pela_senha(
                texto(&senha, "usuario"),
                &Segredo::novo(texto(&senha, "senha"))
            ),
            senha
        );
        let codigo = exemplo(SESSAO, &["pedidos", "codigo"]);
        assert_eq!(
            corpo_do_codigo(
                &Segredo::novo(texto(&codigo, "pendente")),
                &Segredo::novo(texto(&codigo, "codigo"))
            ),
            codigo
        );
        let renovacao = exemplo(RENOVACAO, &["pedidos", "renovacao"]);
        assert_eq!(corpo_da_renovacao(texto(&renovacao, "sid")), renovacao);
    }

    #[test]
    fn o_pedido_do_registro_e_o_do_exemplo() {
        let pedido = exemplo(APARELHO, &["pedidos", "registro"]);
        let chave = Segredo::novo(texto(&pedido, "chave"));
        let entrada: Entrada =
            serde_json::from_value(pedido["entradaSugerida"].clone()).expect("a entrada");
        let registro = PedidoDeRegistro {
            chave: &chave,
            identificador_da_maquina: texto(&pedido, "identificadorDaMaquina"),
            nome: texto(&pedido, "nome"),
            versao: texto(&pedido, "versao"),
            entrada_sugerida: Some(entrada),
        };
        assert_eq!(serde_json::to_value(&registro).expect("o corpo"), pedido);
    }

    #[test]
    fn as_respostas_dos_exemplos_sao_lidas() {
        let registro: Registro =
            serde_json::from_value(exemplo(APARELHO, &["respostas", "200", "registro"]))
                .expect("o registro");
        assert!(!registro.token.expor().is_empty());
        for nome in ["configurada", "de-fabrica"] {
            let configuracao: Result<RespostaDaConfiguracao, _> =
                serde_json::from_value(exemplo(CONFIGURACAO, &["respostas", "200", nome]));
            assert!(configuracao.is_ok(), "a configuração {nome}");
        }
        let sessao: SessaoAberta =
            serde_json::from_value(exemplo(SESSAO, &["respostas", "200", "sessao"]))
                .expect("a sessão");
        assert_eq!(sessao.pessoa.nome, "Carla Dias");
        let aberta: Aberta =
            serde_json::from_value(exemplo(SESSAO, &["respostas", "200", "sessao"]))
                .expect("a sessão pela senha");
        assert!(matches!(aberta, Aberta::Sessao(_)));
        let pendente: Aberta =
            serde_json::from_value(exemplo(SESSAO, &["respostas", "200", "falta-o-codigo"]))
                .expect("a pendente");
        assert!(
            matches!(pendente, Aberta::FaltaOCodigo { pendente, .. } if !pendente.expor().is_empty())
        );
        let renovada: Renovacao =
            serde_json::from_value(exemplo(RENOVACAO, &["respostas", "200", "renovada"]))
                .expect("a renovação");
        assert!(!renovada.expira_em.is_empty());
    }

    #[test]
    fn os_problemas_dos_exemplos_decidem() {
        let da_pessoa = |codigo: &str| Decisao::DaPessoa(codigo.to_owned());
        let casos = [
            (APARELHO, "401", "chave-recusada", Decisao::ChaveRecusada),
            (
                CONFIGURACAO,
                "401",
                "token-recusado",
                Decisao::TokenRecusado,
            ),
            (CONFIGURACAO, "403", "bloqueado", Decisao::Bloqueado),
            (
                SESSAO,
                "401",
                "credenciais-invalidas",
                da_pessoa("credenciais-invalidas"),
            ),
            (
                SESSAO,
                "403",
                "pessoa-recusada",
                da_pessoa("pessoa-recusada-na-aba"),
            ),
            (
                SESSAO,
                "429",
                "muitas-requisicoes",
                Decisao::Esperar(Duration::from_secs(42)),
            ),
            (
                RENOVACAO,
                "401",
                "sessao-encerrada",
                da_pessoa("sessao-da-aba-recusada"),
            ),
        ];
        for (arquivo, status, nome, decisao) in casos {
            let problema: Problema =
                serde_json::from_value(exemplo(arquivo, &["respostas", status, nome]))
                    .unwrap_or_else(|erro| panic!("o problema {nome}: {erro}"));
            let status = status.parse().expect("o status");
            assert_eq!(decidir(status, Some(&problema), None), decisao, "{nome}");
        }
        let recusada: Problema =
            serde_json::from_value(exemplo(SESSAO, &["respostas", "403", "pessoa-recusada"]))
                .expect("a pessoa recusada");
        assert_eq!(recusada.motivo.as_deref(), Some("sem-grupo"));
        let encerrada: Problema = serde_json::from_value(exemplo(
            RENOVACAO,
            &["respostas", "401", "sessao-encerrada"],
        ))
        .expect("a sessão encerrada");
        assert_eq!(encerrada.motivo_do_fim.as_deref(), Some("sem-uso"));
    }
}
