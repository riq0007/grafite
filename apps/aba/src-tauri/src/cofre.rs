//! O token da sessão da pessoa no disco, no `%LOCALAPPDATA%\Grafite\Aba\sessao`, cifrado pelo DPAPI
//! dela (design, decisão 1): outra pessoa do mesmo computador não o abre. Ele vai com o servidor que
//! o deu, para nunca ir a outro.

use std::fmt;
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessaoGuardada {
    pub servidor: String,
    pub token: String,
    pub nome: String,
}

impl fmt::Debug for SessaoGuardada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SessaoGuardada")
            .field("servidor", &self.servidor)
            .field("token", &"…")
            .field("nome", &self.nome)
            .finish()
    }
}

/// O arquivo da sessão, na pasta da pessoa.
pub fn caminho() -> Option<PathBuf> {
    let pasta = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(pasta)
            .join("Grafite")
            .join("Aba")
            .join("sessao"),
    )
}

#[cfg(windows)]
pub use nativo::{apagar, gravar, ler};

#[cfg(windows)]
mod nativo {
    use std::fs;
    use std::io;
    use std::path::{Path, PathBuf};

    use windows::Win32::Foundation::{HLOCAL, LocalFree};
    use windows::Win32::Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
    };
    use windows::core::PCWSTR;

    use super::SessaoGuardada;

    /// O sal do DPAPI, para o blob da aba não abrir no lugar de outro da mesma pessoa.
    const ENTROPIA: &[u8] = b"grafite-aba-sessao";

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

    /// Cifra para a pessoa que roda a aba: sem o `CRYPTPROTECT_LOCAL_MACHINE`.
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
                CRYPTPROTECT_UI_FORBIDDEN,
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

    /// A sessão guardada; o arquivo que não abre vale como nenhum.
    pub fn ler(caminho: &Path) -> Option<SessaoGuardada> {
        let cifrado = fs::read(caminho).ok()?;
        let aberto = decifrar(&cifrado).ok()?;
        serde_json::from_slice(&aberto).ok()
    }

    pub fn gravar(caminho: &Path, sessao: &SessaoGuardada) -> io::Result<()> {
        if let Some(pasta) = caminho.parent() {
            fs::create_dir_all(pasta)?;
        }
        let aberto = serde_json::to_vec(sessao).map_err(io::Error::other)?;
        let cifrado = cifrar(&aberto)?;
        let mut novo = caminho.as_os_str().to_owned();
        novo.push(".novo");
        let novo = PathBuf::from(novo);
        fs::write(&novo, cifrado)?;
        fs::rename(&novo, caminho)
    }

    pub fn apagar(caminho: &Path) {
        let _ = fs::remove_file(caminho);
    }
}

/// O cofre de verdade, no arquivo da pessoa.
pub struct CofreDaPessoa {
    caminho: Option<PathBuf>,
}

impl CofreDaPessoa {
    pub fn novo() -> Self {
        Self { caminho: caminho() }
    }
}

impl crate::sessao::Cofre for CofreDaPessoa {
    fn ler(&self) -> Option<SessaoGuardada> {
        ler(self.caminho.as_deref()?)
    }

    fn gravar(&self, sessao: &SessaoGuardada) -> io::Result<()> {
        let caminho = self
            .caminho
            .as_deref()
            .ok_or_else(|| io::Error::other("sem o %LOCALAPPDATA%"))?;
        gravar(caminho, sessao)
    }

    fn apagar(&self) {
        if let Some(caminho) = self.caminho.as_deref() {
            apagar(caminho);
        }
    }
}

#[cfg(all(test, windows))]
mod testes {
    use super::*;

    fn sessao() -> SessaoGuardada {
        SessaoGuardada {
            servidor: "https://grafite.empresa.local".into(),
            token: "tok_segredo_da_sessao".into(),
            nome: "Fernanda Lima".into(),
        }
    }

    #[test]
    fn a_sessao_volta_inteira_e_cifrada() {
        let pasta = std::env::temp_dir().join(format!("grafite-aba-sessao-{}", std::process::id()));
        let arquivo = pasta.join("sessao");
        gravar(&arquivo, &sessao()).expect("gravada");
        assert_eq!(ler(&arquivo), Some(sessao()));
        let bruto = std::fs::read(&arquivo).expect("o arquivo");
        assert!(
            !bruto
                .windows(b"tok_segredo".len())
                .any(|pedaco| pedaco == b"tok_segredo")
        );
        apagar(&arquivo);
        assert_eq!(ler(&arquivo), None);
        let _ = std::fs::remove_dir_all(&pasta);
    }

    #[test]
    fn o_debug_nao_mostra_o_token() {
        assert!(!format!("{:?}", sessao()).contains("tok_segredo"));
    }
}
