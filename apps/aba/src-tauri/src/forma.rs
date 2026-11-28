//! A forma da aba, que a tela informa (design, decisão 7): fora dela, o clique passa para a janela
//! de baixo. A forma são retângulos em px CSS da janela, com o raio dos cantos de cima e dos de baixo.

use serde::Deserialize;

/// Um retângulo da forma, em px CSS da janela, como o `RetanguloDaForma` da tela.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Retangulo {
    pub x: f64,
    pub y: f64,
    pub largura: f64,
    pub altura: f64,
    pub raio_de_cima: f64,
    pub raio_de_baixo: f64,
}

impl Retangulo {
    /// Se o ponto, em px CSS da janela, cai no retângulo, sem os cantos que o raio corta.
    pub fn contem(&self, x: f64, y: f64) -> bool {
        let direita = self.x + self.largura;
        let baixo = self.y + self.altura;
        if x < self.x || x >= direita || y < self.y || y >= baixo {
            return false;
        }
        let em_cima = y < self.y + self.altura / 2.0;
        let limite = self.largura.min(self.altura) / 2.0;
        let raio = if em_cima {
            self.raio_de_cima
        } else {
            self.raio_de_baixo
        }
        .clamp(0.0, limite);
        if raio == 0.0 {
            return true;
        }
        // O centro do arco mais perto: dentro da faixa reta, o próprio ponto, e a distância é zero.
        let centro_x = x.clamp(self.x + raio, direita - raio);
        let centro_y = if em_cima {
            y.max(self.y + raio)
        } else {
            y.min(baixo - raio)
        };
        let (dx, dy) = (x - centro_x, y - centro_y);
        dx * dx + dy * dy <= raio * raio
    }
}

/// Se o ponto cai na forma. A forma vazia, como a da linha da apresentação, deixa todo clique passar.
pub fn dentro(forma: &[Retangulo], x: f64, y: f64) -> bool {
    forma.iter().any(|retangulo| retangulo.contem(x, y))
}

#[cfg(test)]
mod testes {
    use super::*;

    /// A pílula de 162×34, a 8 px do alto, no meio da janela de 440 px.
    const PILULA: Retangulo = Retangulo {
        x: 139.0,
        y: 8.0,
        largura: 162.0,
        altura: 34.0,
        raio_de_cima: 17.0,
        raio_de_baixo: 17.0,
    };

    /// O entalhe de 184×32, preso à borda: reto em cima e redondo embaixo.
    const ENTALHE: Retangulo = Retangulo {
        x: 128.0,
        y: 0.0,
        largura: 184.0,
        altura: 32.0,
        raio_de_cima: 0.0,
        raio_de_baixo: 16.0,
    };

    #[test]
    fn o_meio_da_pilula_e_da_aba() {
        assert!(dentro(&[PILULA], 220.0, 25.0));
    }

    #[test]
    fn ao_lado_da_pilula_o_clique_passa() {
        assert!(!dentro(&[PILULA], 120.0, 25.0));
        assert!(!dentro(&[PILULA], 320.0, 25.0));
        assert!(!dentro(&[PILULA], 220.0, 4.0));
        assert!(!dentro(&[PILULA], 220.0, 42.0));
    }

    #[test]
    fn o_canto_que_o_raio_corta_deixa_o_clique_passar() {
        assert!(!dentro(&[PILULA], 140.0, 9.0));
        assert!(!dentro(&[PILULA], 300.0, 41.0));
        // Na curva, perto da ponta, ainda é a aba.
        assert!(dentro(&[PILULA], 141.0, 25.0));
    }

    #[test]
    fn o_entalhe_tem_os_cantos_de_cima_retos() {
        assert!(dentro(&[ENTALHE], 128.5, 0.5));
        assert!(dentro(&[ENTALHE], 311.5, 0.5));
        assert!(!dentro(&[ENTALHE], 128.5, 31.5));
        assert!(!dentro(&[ENTALHE], 311.5, 31.5));
    }

    #[test]
    fn o_raio_maior_que_a_meia_altura_fica_na_meia_altura() {
        let exagerado = Retangulo {
            raio_de_cima: 400.0,
            raio_de_baixo: 400.0,
            ..PILULA
        };
        assert_eq!(
            dentro(&[exagerado], 141.0, 25.0),
            dentro(&[PILULA], 141.0, 25.0)
        );
    }

    #[test]
    fn a_forma_vazia_da_apresentacao_deixa_todo_clique_passar() {
        assert!(!dentro(&[], 220.0, 2.0));
    }

    #[test]
    fn le_o_retangulo_da_tela() {
        let lido: Vec<Retangulo> = serde_json::from_str(
            r#"[{"x":139,"y":8,"largura":162,"altura":34,"raioDeCima":17,"raioDeBaixo":17}]"#,
        )
        .expect("o retângulo da tela");
        assert_eq!(lido, vec![PILULA]);
    }
}
