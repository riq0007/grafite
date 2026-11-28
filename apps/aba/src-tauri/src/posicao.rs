//! A posição das janelas no monitor principal, com a escala dele (design, decisão 7). As contas são
//! em px físicos do Windows; a tela mede em px lógicos, os px CSS da janela.

use serde::Serialize;

/// A janela da aba, em px lógicos: a do painel mais alto, com a folga da sombra (372×506 do painel
/// sem conexão, com a resposta e o "Sair"). A forma fica no alto e no meio dela, e fora da forma o
/// clique passa: a janela não muda de tamanho entre a aba fechada e o painel.
pub const JANELA_DA_ABA: Tamanho = Tamanho {
    largura: 440.0,
    altura: 560.0,
};
/// A tela maior, em px lógicos, com a folga da sombra dos lados e embaixo.
pub const JANELA_DA_TELA_MAIOR: Tamanho = Tamanho {
    largura: 760.0,
    altura: 560.0,
};
/// A tela maior começa abaixo do logo e da primeira opção do painel, que fica atrás (m08).
pub const TELA_MAIOR_ABAIXO_DO_TOPO: f64 = 160.0;
/// O que sobra entre a tela maior e as bordas da tela, em px lógicos.
pub const MARGEM_DA_TELA: f64 = 8.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Tamanho {
    pub largura: f64,
    pub altura: f64,
}

/// O monitor, em px físicos, com a escala dele (1,5 em 150%).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Monitor {
    pub x: i32,
    pub y: i32,
    pub largura: u32,
    pub altura: u32,
    pub escala: f64,
}

/// A tela principal em px lógicos, que a aparência leva à tela.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Tela {
    pub largura: u32,
    pub altura: u32,
}

/// O lugar e o tamanho de uma janela, em px físicos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Lugar {
    pub x: i32,
    pub y: i32,
    pub largura: u32,
    pub altura: u32,
}

impl Monitor {
    pub fn tela(&self) -> Tela {
        Tela {
            largura: (f64::from(self.largura) / self.escala).round() as u32,
            altura: (f64::from(self.altura) / self.escala).round() as u32,
        }
    }

    fn fisico(&self, logico: f64) -> u32 {
        (logico * self.escala).round().max(0.0) as u32
    }

    /// No meio do monitor, a `topo` px lógicos do alto, sem passar das bordas.
    fn no_meio(&self, tamanho: Tamanho, topo: f64) -> Lugar {
        let largura = self.fisico(tamanho.largura).min(self.largura);
        let altura = self.fisico(tamanho.altura).min(self.altura);
        let sobra = i64::from(self.largura) - i64::from(largura);
        Lugar {
            x: self.x + (sobra / 2) as i32,
            y: self.y + self.fisico(topo) as i32,
            largura,
            altura,
        }
    }

    /// A janela da aba, presa ao alto e no meio: a tela põe a forma a 0, 8 ou 36 px dela.
    pub fn lugar_da_aba(&self) -> Lugar {
        self.no_meio(JANELA_DA_ABA, 0.0)
    }

    /// A tela maior, embaixo da aba: no meio, por cima da parte de baixo do painel, que fica atrás,
    /// e menor numa tela que não a cabe.
    pub fn lugar_da_tela_maior(&self, topo_da_aba: f64) -> Lugar {
        let tela = self.tela();
        let topo = topo_da_aba + TELA_MAIOR_ABAIXO_DO_TOPO;
        let tamanho = Tamanho {
            largura: JANELA_DA_TELA_MAIOR
                .largura
                .min(f64::from(tela.largura) - 2.0 * MARGEM_DA_TELA),
            altura: JANELA_DA_TELA_MAIOR
                .altura
                .min(f64::from(tela.altura) - topo - MARGEM_DA_TELA),
        };
        self.no_meio(tamanho, topo)
    }
}

/// Onde a janela está, em px físicos, e a escala dela: o que o clique precisa para levar o ponteiro
/// aos px CSS da forma.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Origem {
    pub x: i32,
    pub y: i32,
    pub escala: f64,
}

impl Origem {
    /// O ponteiro, em px físicos da tela, em px CSS da janela.
    pub fn na_janela(&self, x: f64, y: f64) -> (f64, f64) {
        (
            (x - f64::from(self.x)) / self.escala,
            (y - f64::from(self.y)) / self.escala,
        )
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    const FULL_HD: Monitor = Monitor {
        x: 0,
        y: 0,
        largura: 1920,
        altura: 1080,
        escala: 1.0,
    };
    const NOTEBOOK: Monitor = Monitor {
        x: 0,
        y: 0,
        largura: 1366,
        altura: 768,
        escala: 1.0,
    };
    const QHD_EM_150: Monitor = Monitor {
        x: 0,
        y: 0,
        largura: 2560,
        altura: 1440,
        escala: 1.5,
    };

    #[test]
    fn a_tela_e_o_monitor_em_px_logicos() {
        assert_eq!(
            FULL_HD.tela(),
            Tela {
                largura: 1920,
                altura: 1080
            }
        );
        assert_eq!(
            QHD_EM_150.tela(),
            Tela {
                largura: 1707,
                altura: 960
            }
        );
        let em_125 = Monitor {
            largura: 1920,
            altura: 1200,
            escala: 1.25,
            ..FULL_HD
        };
        assert_eq!(
            em_125.tela(),
            Tela {
                largura: 1536,
                altura: 960
            }
        );
    }

    #[test]
    fn a_aba_fica_no_alto_e_no_meio() {
        assert_eq!(
            FULL_HD.lugar_da_aba(),
            Lugar {
                x: 740,
                y: 0,
                largura: 440,
                altura: 560
            }
        );
    }

    #[test]
    fn na_escala_de_150_a_janela_cresce_e_segue_no_meio() {
        assert_eq!(
            QHD_EM_150.lugar_da_aba(),
            Lugar {
                x: 950,
                y: 0,
                largura: 660,
                altura: 840
            }
        );
    }

    #[test]
    fn o_monitor_principal_fora_da_origem() {
        let a_direita = Monitor {
            x: 1920,
            y: -120,
            ..FULL_HD
        };
        assert_eq!(
            a_direita.lugar_da_aba(),
            Lugar {
                x: 2660,
                y: -120,
                largura: 440,
                altura: 560
            }
        );
    }

    #[test]
    fn a_tela_maior_fica_embaixo_da_aba() {
        assert_eq!(
            FULL_HD.lugar_da_tela_maior(8.0),
            Lugar {
                x: 580,
                y: 168,
                largura: 760,
                altura: 560
            }
        );
    }

    #[test]
    fn no_notebook_a_tela_maior_cabe_na_altura() {
        // A pílula a 36 px numa tela de até 800 de altura: a tela maior vai de 196 a 760.
        assert_eq!(
            NOTEBOOK.lugar_da_tela_maior(36.0),
            Lugar {
                x: 303,
                y: 196,
                largura: 760,
                altura: 560
            }
        );
        let baixinho = Monitor {
            altura: 600,
            ..NOTEBOOK
        };
        assert_eq!(baixinho.lugar_da_tela_maior(36.0).altura, 396);
    }

    #[test]
    fn o_ponteiro_em_px_css_da_janela() {
        let origem = Origem {
            x: 950,
            y: 0,
            escala: 1.5,
        };
        assert_eq!(origem.na_janela(1280.0, 37.5), (220.0, 25.0));
    }
}
