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
    pub situacao: Situacao,
    /// A frase para a pessoa, fora da `registrada`.
    pub motivo: Option<String>,
    /// A última configuração guardada, também sem conexão; `null` antes do primeiro contato.
    pub configuracao: Option<Configuracao>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "pedido", rename_all = "kebab-case")]
pub enum Pedido {
    /// A situação do aparelho e a configuração guardada.
    Aparelho,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "resposta", rename_all = "kebab-case")]
pub enum Resposta {
    Aparelho(Aparelho),
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
    }

    #[test]
    fn a_resposta_do_aparelho_em_json() {
        let resposta = Resposta::Aparelho(Aparelho {
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
