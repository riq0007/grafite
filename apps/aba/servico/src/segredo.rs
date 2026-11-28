//! A chave e os tokens: o `Debug` não os mostra, e o log nunca os recebe (spec "Aba instalada no
//! Windows": o log sem a chave, os tokens e as senhas).

use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Segredo(String);

impl Segredo {
    pub fn novo(valor: impl Into<String>) -> Self {
        Self(valor.into())
    }

    /// O valor, só para ir à API ou ao cofre.
    pub fn expor(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Segredo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Segredo(…)")
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_debug_nao_mostra_o_segredo() {
        let token = Segredo::novo("tok_abc123");
        assert_eq!(format!("{token:?}"), "Segredo(…)");
        assert!(!format!("{:?}", Some(&token)).contains("abc123"));
        assert_eq!(token.expor(), "tok_abc123");
    }
}
