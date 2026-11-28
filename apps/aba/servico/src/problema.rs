//! A resposta de erro da API (`application/problem+json`) e o que o serviço faz com ela. O serviço
//! decide pelo `type` do problema, e não pelo status: só o `token-da-aba-recusado` é do computador, e
//! os 401 da pessoa voltam à aba.

use std::time::Duration;

use serde::Deserialize;

const PREFIXO_DO_TIPO: &str = "urn:grafite:problema:";
/// Sem o `retry-after` nem o tempo no `detail`, o 429 espera 1 minuto.
pub const ESPERA_DO_429: Duration = Duration::from_secs(60);

/// As recusas da pessoa, que a aba mostra no formulário ou resolve pedindo outra sessão.
const DA_PESSOA: [&str; 5] = [
    "credenciais-invalidas",
    "codigo-invalido",
    "tentativas-esgotadas",
    "pendente-da-aba-recusada",
    "sessao-da-aba-recusada",
];

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Problema {
    #[serde(rename = "type")]
    pub tipo: String,
    #[serde(rename = "detail", default)]
    pub detalhe: Option<String>,
}

impl Problema {
    /// O fim do `type`, como `token-da-aba-recusado`.
    pub fn codigo(&self) -> Option<&str> {
        self.tipo.strip_prefix(PREFIXO_DO_TIPO)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decisao {
    /// O token do aparelho não vale mais: registrar de novo, com a chave que aparecer.
    TokenRecusado,
    /// A chave do registro não vale.
    ChaveRecusada,
    /// O computador foi bloqueado na aba.
    Bloqueado,
    /// Muitas requisições: esperar e tentar de novo, sem mudar nada.
    Esperar(Duration),
    /// Da pessoa: volta à aba, com o código.
    DaPessoa(String),
    /// A rede, o servidor fora ou uma recusa que o tempo resolve: tentar depois.
    TentarDepois,
}

/// Quanto o 429 espera: o `retry-after`, em segundos; senão o que o `detail` diz, como "Tente de
/// novo em 42 s."; senão 1 minuto.
pub fn espera_do_429(retry_after: Option<&str>, detalhe: Option<&str>) -> Duration {
    if let Some(segundos) = retry_after.and_then(|valor| valor.trim().parse::<u64>().ok()) {
        return Duration::from_secs(segundos.max(1));
    }
    let do_detalhe = detalhe.and_then(|texto| {
        let depois = texto.split(" em ").nth(1)?;
        let numero: String = depois.chars().take_while(char::is_ascii_digit).collect();
        let resto = depois[numero.len()..].trim_start();
        resto
            .starts_with('s')
            .then(|| numero.parse::<u64>().ok())
            .flatten()
    });
    do_detalhe.map_or(ESPERA_DO_429, |segundos| {
        Duration::from_secs(segundos.max(1))
    })
}

/// A decisão por uma resposta de erro, pelo código do problema.
pub fn decidir(status: u16, problema: Option<&Problema>, retry_after: Option<&str>) -> Decisao {
    match problema.and_then(Problema::codigo) {
        Some("token-da-aba-recusado") => Decisao::TokenRecusado,
        Some("chave-da-aba-recusada") => Decisao::ChaveRecusada,
        Some("aparelho-da-aba-bloqueado") => Decisao::Bloqueado,
        Some("muitas-requisicoes") => Decisao::Esperar(espera_do_429(
            retry_after,
            problema.and_then(|problema| problema.detalhe.as_deref()),
        )),
        Some(codigo) if DA_PESSOA.contains(&codigo) => Decisao::DaPessoa(codigo.to_owned()),
        // O 429 sem o corpo do problema, de um proxy no caminho, também espera.
        _ if status == 429 => Decisao::Esperar(espera_do_429(retry_after, None)),
        _ => Decisao::TentarDepois,
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn problema(codigo: &str) -> Problema {
        Problema {
            tipo: format!("{PREFIXO_DO_TIPO}{codigo}"),
            detalhe: None,
        }
    }

    #[test]
    fn so_o_token_recusado_e_do_computador() {
        assert_eq!(
            decidir(401, Some(&problema("token-da-aba-recusado")), None),
            Decisao::TokenRecusado
        );
        for da_pessoa in DA_PESSOA {
            assert_eq!(
                decidir(401, Some(&problema(da_pessoa)), None),
                Decisao::DaPessoa(da_pessoa.to_owned()),
                "{da_pessoa} volta à aba",
            );
        }
    }

    #[test]
    fn o_status_sozinho_nao_decide() {
        // Um 401 sem o tipo do token não põe o computador em "registrar de novo".
        assert_eq!(decidir(401, None, None), Decisao::TentarDepois);
        assert_eq!(
            decidir(401, Some(&problema("sem-sessao")), None),
            Decisao::TentarDepois
        );
    }

    #[test]
    fn a_chave_recusada_e_o_bloqueio() {
        assert_eq!(
            decidir(401, Some(&problema("chave-da-aba-recusada")), None),
            Decisao::ChaveRecusada
        );
        assert_eq!(
            decidir(403, Some(&problema("aparelho-da-aba-bloqueado")), None),
            Decisao::Bloqueado
        );
    }

    #[test]
    fn o_429_espera_o_retry_after_o_detail_ou_1_minuto() {
        let muitas = Problema {
            detalhe: Some("Muitas requisições. Tente de novo em 42 s.".into()),
            ..problema("muitas-requisicoes")
        };
        assert_eq!(
            decidir(429, Some(&muitas), Some("7")),
            Decisao::Esperar(Duration::from_secs(7))
        );
        assert_eq!(
            decidir(429, Some(&muitas), None),
            Decisao::Esperar(Duration::from_secs(42))
        );
        assert_eq!(
            decidir(429, Some(&problema("muitas-requisicoes")), None),
            Decisao::Esperar(ESPERA_DO_429)
        );
        assert_eq!(decidir(429, None, None), Decisao::Esperar(ESPERA_DO_429));
    }

    #[test]
    fn o_retry_after_estranho_cai_no_detail() {
        assert_eq!(
            espera_do_429(
                Some("Wed, 21 Oct 2026 07:28:00 GMT"),
                Some("Tente de novo em 3 s.")
            ),
            Duration::from_secs(3)
        );
        assert_eq!(
            espera_do_429(None, Some("Tente de novo em breve.")),
            ESPERA_DO_429
        );
    }
}
