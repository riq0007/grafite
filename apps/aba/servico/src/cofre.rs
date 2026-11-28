//! O token do aparelho no disco: cifrado pelo DPAPI da máquina, na pasta que só o sistema e os
//! administradores leem (design, decisão 1). O DPAPI da máquina abre em qualquer conta do
//! computador; quem segura o token é a permissão da pasta. O token vai junto com o servidor que o
//! deu, para nunca ir a outro.

use serde::{Deserialize, Serialize};

use crate::segredo::Segredo;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Guardado {
    /// O endereço do servidor que deu o token.
    pub servidor: String,
    pub token: Segredo,
    pub identificador_curto: String,
}

#[cfg(windows)]
pub use nativo::{gravar, ler};

#[cfg(windows)]
mod nativo {
    use std::io;
    use std::path::Path;

    use windows::Win32::Foundation::{HLOCAL, LocalFree};
    use windows::Win32::Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_LOCAL_MACHINE, CRYPTPROTECT_UI_FORBIDDEN,
        CryptProtectData, CryptUnprotectData,
    };
    use windows::core::PCWSTR;

    use super::Guardado;

    /// O sal do DPAPI, para o blob deste serviço não abrir no lugar de outro.
    const ENTROPIA: &[u8] = b"grafite-aba-aparelho";

    fn blob(dados: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: dados.len() as u32,
            pbData: dados.as_ptr().cast_mut(),
        }
    }

    /// Copia o blob do Windows e o solta.
    fn tomar(saida: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        // SAFETY: o Windows alocou `cbData` bytes em `pbData`, soltos uma vez aqui.
        unsafe {
            let dados = std::slice::from_raw_parts(saida.pbData, saida.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(saida.pbData.cast())));
            dados
        }
    }

    pub fn cifrar(dados: &[u8]) -> io::Result<Vec<u8>> {
        let entrada = blob(dados);
        let entropia = blob(ENTROPIA);
        let mut saida = CRYPT_INTEGER_BLOB::default();
        // SAFETY: os blobs de entrada vivem durante a chamada; a saída é solta pelo `tomar`.
        unsafe {
            CryptProtectData(
                &raw const entrada,
                PCWSTR::null(),
                Some(&raw const entropia),
                None,
                None,
                CRYPTPROTECT_LOCAL_MACHINE | CRYPTPROTECT_UI_FORBIDDEN,
                &raw mut saida,
            )
        }?;
        Ok(tomar(saida))
    }

    pub fn decifrar(dados: &[u8]) -> io::Result<Vec<u8>> {
        let entrada = blob(dados);
        let entropia = blob(ENTROPIA);
        let mut saida = CRYPT_INTEGER_BLOB::default();
        // SAFETY: como no `cifrar`.
        unsafe {
            CryptUnprotectData(
                &raw const entrada,
                None,
                Some(&raw const entropia),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &raw mut saida,
            )
        }?;
        Ok(tomar(saida))
    }

    /// O token guardado. O arquivo que não abre, como o copiado de outra máquina, vale como nenhum:
    /// o serviço registra de novo com a chave.
    pub fn ler(caminho: &Path) -> io::Result<Option<Guardado>> {
        let cifrado = match std::fs::read(caminho) {
            Ok(cifrado) => cifrado,
            Err(erro) if erro.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(erro) => return Err(erro),
        };
        let aberto = decifrar(&cifrado)?;
        serde_json::from_slice(&aberto)
            .map(Some)
            .map_err(io::Error::other)
    }

    pub fn gravar(caminho: &Path, guardado: &Guardado) -> io::Result<()> {
        let aberto = serde_json::to_vec(guardado).map_err(io::Error::other)?;
        crate::pastas::gravar(caminho, &cifrar(&aberto)?)
    }
}

#[cfg(all(test, windows))]
mod testes {
    use super::nativo::decifrar;
    use super::*;

    fn guardado() -> Guardado {
        Guardado {
            servidor: "https://grafite.empresa.local".into(),
            token: Segredo::novo("tok_segredo_do_aparelho"),
            identificador_curto: "K7M2QX".into(),
        }
    }

    #[test]
    fn o_token_volta_inteiro() {
        let pasta = std::env::temp_dir().join(format!("grafite-aba-cofre-{}", std::process::id()));
        std::fs::create_dir_all(&pasta).expect("a pasta do teste");
        let arquivo = pasta.join("aparelho");
        gravar(&arquivo, &guardado()).expect("gravado");
        assert_eq!(ler(&arquivo).expect("lido"), Some(guardado()));
        let bruto = std::fs::read(&arquivo).expect("o arquivo");
        assert!(
            !bruto
                .windows(b"tok_segredo".len())
                .any(|pedaco| pedaco == b"tok_segredo"),
            "o arquivo não leva o token aberto"
        );
        let _ = std::fs::remove_dir_all(&pasta);
    }

    #[test]
    fn sem_o_arquivo_nao_ha_token() {
        let arquivo = std::env::temp_dir().join("grafite-aba-cofre-inexistente");
        assert_eq!(ler(&arquivo).expect("sem erro"), None);
    }

    #[test]
    fn o_arquivo_estranho_nao_abre() {
        assert!(decifrar(b"nao e um blob do dpapi").is_err());
    }
}
