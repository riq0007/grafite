//! O que a aba e o serviço dizem pelo pipe: um pedido e uma resposta por conexão, em JSON. O
//! serviço guarda o que é do computador, para todas as pessoas: a situação do aparelho e a última
//! configuração que a API mandou.

use serde::{Deserialize, Serialize};

/// A entrada do aparelho, que é do servidor (design, decisão 2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Entrada {
    Windows,
    Senha,
}

/// A forma da aba que a organização escolheu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Forma {
    Pilula,
    Entalhe,
}

/// A configuração da aba, como o `GET /api/aba/configuracao` a devolve, sem o `proximaEm`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Configuracao {
    pub forma: Forma,
    /// O contato de reserva, que a aba sem conexão mostra.
    pub contato: Option<String>,
    pub entrada: Entrada,
    /// 0 enquanto a organização não configurou a aba.
    pub versao: i64,
}

/// Como está o aparelho, do lado do serviço.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Situacao {
    /// Sem o endereço do servidor, sem a chave e sem o token, ou com a chave recusada.
    NaoConfigurada,
    /// O último contato com o token deu certo.
    Registrada,
    /// A rede ou o servidor fora: o serviço tenta de novo sozinho.
    SemConexao,
    /// O token do aparelho foi recusado, e não há outra chave no registro do Windows.
    RegistrarDeNovo,
    /// O computador foi bloqueado na aba.
    Bloqueada,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aparelho {
    /// O endereço do servidor do registro do Windows, que a aba usa; `null` sem ele.
    pub servidor: Option<String>,
    pub situacao: Situacao,
    /// A frase para a pessoa, fora da `registrada`.
    pub motivo: Option<String>,
    /// A última configuração guardada, também sem conexão; `null` antes do primeiro contato.
    pub configuracao: Option<Configuracao>,
}

/// A recusa da API, passada à aba como veio: a aba decide pelo `codigo`, o fim do `type` do
/// problema, e não pelo status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recusa {
    /// 0 quando a API não respondeu.
    pub status: u16,
    pub codigo: Option<String>,
    /// O `detail` do problema, a frase para a pessoa.
    pub detalhe: Option<String>,
    /// O motivo da pessoa recusada (`pessoa-recusada-na-aba`), como `sem-grupo`.
    pub motivo: Option<String>,
    /// O motivo do fim da sessão encerrada (`sessao-da-aba-recusada`).
    pub motivo_do_fim: Option<String>,
    /// Quanto esperar, no 429.
    pub espera_em_segundos: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "pedido", rename_all = "kebab-case")]
pub enum Pedido {
    /// A situação do aparelho e a configuração guardada.
    Aparelho,
    /// A sessão de quem chama, pelo SID que o Windows dá ao serviço, e não pelo que a aba diz.
    SessaoPeloWindows,
    /// A renovação da sessão de quem chama, com o SID dela.
    #[serde(rename_all = "camelCase")]
    Renovar { token: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "resposta", rename_all = "kebab-case")]
pub enum Resposta {
    Aparelho(Aparelho),
    /// A sessão aberta: o token vai só a quem pediu, pela conexão dele.
    #[serde(rename_all = "camelCase")]
    Sessao {
        token: String,
        expira_em: String,
        nome: String,
    },
    #[serde(rename_all = "camelCase")]
    Renovada {
        expira_em: String,
    },
    Recusa(Recusa),
    /// O pedido que o serviço não entendeu.
    PedidoRecusado,
}

#[cfg(test)]
mod testes {
    use serde_json::json;

    use super::*;

    #[test]
    fn o_pedido_em_json() {
        assert_eq!(
            serde_json::from_value::<Pedido>(json!({"pedido": "aparelho"})).ok(),
            Some(Pedido::Aparelho)
        );
        assert!(serde_json::from_value::<Pedido>(json!({"pedido": "token"})).is_err());
        assert_eq!(
            serde_json::from_value::<Pedido>(json!({"pedido": "sessao-pelo-windows"})).ok(),
            Some(Pedido::SessaoPeloWindows)
        );
        assert_eq!(
            serde_json::from_value::<Pedido>(json!({"pedido": "renovar", "token": "tok"})).ok(),
            Some(Pedido::Renovar {
                token: "tok".into()
            })
        );
    }

    #[test]
    fn a_sessao_e_a_recusa_em_json() {
        assert_eq!(
            serde_json::to_value(Resposta::Sessao {
                token: "tok".into(),
                expira_em: "2026-11-28T04:00:00.000Z".into(),
                nome: "Fernanda Lima".into(),
            })
            .ok(),
            Some(json!({
                "resposta": "sessao",
                "token": "tok",
                "expiraEm": "2026-11-28T04:00:00.000Z",
                "nome": "Fernanda Lima",
            }))
        );
        let recusa = Resposta::Recusa(Recusa {
            status: 403,
            codigo: Some("pessoa-recusada-na-aba".into()),
            detalhe: Some("Sua conta está inativa no Grafite. Fale com a TI.".into()),
            motivo: Some("conta-inativa".into()),
            motivo_do_fim: None,
            espera_em_segundos: None,
        });
        assert_eq!(
            serde_json::to_value(&recusa).ok(),
            Some(json!({
                "resposta": "recusa",
                "status": 403,
                "codigo": "pessoa-recusada-na-aba",
                "detalhe": "Sua conta está inativa no Grafite. Fale com a TI.",
                "motivo": "conta-inativa",
                "motivoDoFim": null,
                "esperaEmSegundos": null,
            }))
        );
    }

    #[test]
    fn a_resposta_do_aparelho_em_json() {
        let resposta = Resposta::Aparelho(Aparelho {
            servidor: Some("https://grafite.empresa.local".into()),
            situacao: Situacao::Registrada,
            motivo: None,
            configuracao: Some(Configuracao {
                forma: Forma::Pilula,
                contato: Some("Ramal 2000, das 8h às 18h".into()),
                entrada: Entrada::Windows,
                versao: 3,
            }),
        });
        assert_eq!(
            serde_json::to_value(&resposta).ok(),
            Some(json!({
                "resposta": "aparelho",
                "servidor": "https://grafite.empresa.local",
                "situacao": "registrada",
                "motivo": null,
                "configuracao": {
                    "forma": "pilula",
                    "contato": "Ramal 2000, das 8h às 18h",
                    "entrada": "windows",
                    "versao": 3,
                },
            }))
        );
        assert_eq!(
            serde_json::to_value(Resposta::PedidoRecusado).ok(),
            Some(json!({"resposta": "pedido-recusado"}))
        );
        assert_eq!(
            serde_json::to_value(Situacao::RegistrarDeNovo).ok(),
            Some(json!("registrar-de-novo"))
        );
    }
}
