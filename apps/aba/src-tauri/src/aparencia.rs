//! A aparência que a tela lê pelo comando `aparencia` e recebe no evento `aparencia-mudou` (design,
//! decisão 7): a forma, o tema e as animações do Windows, a tela principal, o contato de reserva e a
//! apresentação. O tema e a apresentação entram na tarefa 5.9, e a configuração, na 5.14.

use serde::Serialize;

use crate::posicao::Tela;

pub const EVENTO_DA_APARENCIA: &str = "aparencia-mudou";

/// A tela pequena (spec "Aba fechada"; m12), e a altura até a qual a pílula desce.
const ALTURA_DA_TELA_BAIXA: u32 = 800;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Forma {
    Pilula,
    #[allow(dead_code, reason = "a forma da configuração entra na tarefa 5.14")]
    Entalhe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tema {
    Escuro,
    Claro,
    AltoContraste,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aparencia {
    pub forma: Forma,
    pub tema: Tema,
    pub movimento_reduzido: bool,
    pub tela: Tela,
    pub contato: Option<String>,
    pub apresentacao: bool,
}

impl Aparencia {
    /// A de fábrica, a da tela (`APARENCIA_DE_FABRICA`), na tela principal de agora.
    pub fn de_fabrica(tela: Tela) -> Self {
        Self {
            forma: Forma::Pilula,
            tema: Tema::Escuro,
            movimento_reduzido: false,
            tela,
            contato: None,
            apresentacao: false,
        }
    }

    /// A distância da forma ao alto da tela, em px lógicos, como a `medidasDaAbaFechada` da tela.
    pub fn topo_da_aba(&self) -> f64 {
        match self.forma {
            Forma::Entalhe => 0.0,
            Forma::Pilula if self.tela.altura <= ALTURA_DA_TELA_BAIXA => 36.0,
            Forma::Pilula => 8.0,
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn vai_a_tela_com_os_nomes_dela() {
        let aparencia = Aparencia::de_fabrica(Tela {
            largura: 1366,
            altura: 768,
        });
        assert_eq!(
            serde_json::to_value(&aparencia).expect("a aparência em JSON"),
            serde_json::json!({
                "forma": "pilula",
                "tema": "escuro",
                "movimentoReduzido": false,
                "tela": { "largura": 1366, "altura": 768 },
                "contato": null,
                "apresentacao": false,
            })
        );
        assert_eq!(
            serde_json::to_value(Tema::AltoContraste).ok(),
            Some("alto-contraste".into())
        );
    }

    #[test]
    fn o_topo_da_aba_segue_a_forma_e_a_altura_da_tela() {
        let grande = Aparencia::de_fabrica(Tela {
            largura: 1920,
            altura: 1080,
        });
        assert_eq!(grande.topo_da_aba(), 8.0);
        let baixa = Aparencia::de_fabrica(Tela {
            largura: 1366,
            altura: 768,
        });
        assert_eq!(baixa.topo_da_aba(), 36.0);
        let entalhe = Aparencia {
            forma: Forma::Entalhe,
            ..baixa
        };
        assert_eq!(entalhe.topo_da_aba(), 0.0);
    }
}
