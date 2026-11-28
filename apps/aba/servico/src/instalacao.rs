//! O que o MSI grava em `HKLM\SOFTWARE\Grafite\Aba` (design, decisão 12), com a permissão só do
//! sistema e dos administradores: o servidor, a chave e a entrada sugerida.

pub use grafite_aba_pipe::Entrada;

use crate::segredo::Segredo;

pub const CHAVE_DO_REGISTRO: &str = r"SOFTWARE\Grafite\Aba";
pub const VALOR_DO_SERVIDOR: &str = "Servidor";
pub const VALOR_DA_CHAVE: &str = "Chave";
pub const VALOR_DA_ENTRADA: &str = "Entrada";

/// A entrada sugerida que o MSI grava, `windows` ou `senha`.
pub fn entrada_do_texto(texto: &str) -> Option<Entrada> {
    match texto.trim().to_ascii_lowercase().as_str() {
        "windows" => Some(Entrada::Windows),
        "senha" => Some(Entrada::Senha),
        _ => None,
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Instalacao {
    pub servidor: Option<String>,
    pub chave: Option<Segredo>,
    pub entrada: Option<Entrada>,
}

/// O endereço do servidor que a aba aceita (spec "Aba instalada no Windows"): o `https://`, ou o
/// `http://` só de `localhost`, `127.0.0.1` e `::1`, para o desenvolvimento. Sem usuário, consulta
/// nem fragmento; sem a barra do fim.
pub fn endereco_valido(endereco: &str) -> Option<String> {
    let url = reqwest::Url::parse(endereco.trim()).ok()?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    let esquema_aceito = url.scheme() == "https" || (url.scheme() == "http" && local);
    let limpo = url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.host_str().is_some_and(|host| !host.is_empty());
    (esquema_aceito && limpo).then(|| url.as_str().trim_end_matches('/').to_owned())
}

#[cfg(windows)]
pub use nativo::{apagar_a_chave, ler, texto as texto_da_maquina};

#[cfg(windows)]
mod nativo {
    use std::io;

    use windows::Win32::Foundation::ERROR_FILE_NOT_FOUND;
    use windows::Win32::System::Registry::{
        HKEY, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, KEY_WOW64_64KEY, REG_SAM_FLAGS,
        RRF_RT_REG_SZ, RegCloseKey, RegDeleteValueW, RegGetValueW, RegOpenKeyExW,
    };
    use windows::core::HSTRING;

    use super::{
        CHAVE_DO_REGISTRO, Instalacao, VALOR_DA_CHAVE, VALOR_DA_ENTRADA, VALOR_DO_SERVIDOR,
        entrada_do_texto,
    };
    use crate::segredo::Segredo;

    struct Chave(HKEY);

    impl Drop for Chave {
        fn drop(&mut self) {
            // SAFETY: a chave foi aberta por nós e é fechada uma vez.
            let _ = unsafe { RegCloseKey(self.0) };
        }
    }

    fn abrir(caminho: &str, acesso: REG_SAM_FLAGS) -> Option<Chave> {
        let mut chave = HKEY::default();
        // SAFETY: a chave fica com o `Chave`, que a fecha. A visão de 64 bits, a do MSI.
        unsafe {
            RegOpenKeyExW(
                HKEY_LOCAL_MACHINE,
                &HSTRING::from(caminho),
                None,
                acesso | KEY_WOW64_64KEY,
                &raw mut chave,
            )
        }
        .ok()
        .ok()?;
        Some(Chave(chave))
    }

    /// Um valor de texto do `HKLM`, sem o valor vazio.
    pub fn texto(caminho: &str, valor: &str) -> Option<String> {
        let chave = abrir(caminho, KEY_READ)?;
        let nome = HSTRING::from(valor);
        let mut tamanho = 0_u32;
        // SAFETY: a primeira chamada pede o tamanho; a segunda escreve no buffer desse tamanho.
        unsafe {
            RegGetValueW(
                chave.0,
                None,
                &nome,
                RRF_RT_REG_SZ,
                None,
                None,
                Some(&raw mut tamanho),
            )
            .ok()
            .ok()?;
            let mut buffer = vec![0_u16; (tamanho as usize).div_ceil(2)];
            RegGetValueW(
                chave.0,
                None,
                &nome,
                RRF_RT_REG_SZ,
                None,
                Some(buffer.as_mut_ptr().cast()),
                Some(&raw mut tamanho),
            )
            .ok()
            .ok()?;
            let fim = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
            let lido = String::from_utf16(&buffer[..fim]).ok()?;
            (!lido.trim().is_empty()).then(|| lido.trim().to_owned())
        }
    }

    pub fn ler() -> Instalacao {
        Instalacao {
            servidor: texto(CHAVE_DO_REGISTRO, VALOR_DO_SERVIDOR),
            chave: texto(CHAVE_DO_REGISTRO, VALOR_DA_CHAVE).map(Segredo::novo),
            entrada: texto(CHAVE_DO_REGISTRO, VALOR_DA_ENTRADA)
                .as_deref()
                .and_then(entrada_do_texto),
        }
    }

    /// Apaga a chave do registro, depois de o token do aparelho ter dado certo.
    pub fn apagar_a_chave() -> io::Result<()> {
        let Some(chave) = abrir(CHAVE_DO_REGISTRO, KEY_SET_VALUE) else {
            return Ok(());
        };
        // SAFETY: a chave do registro está aberta para escrever.
        let apagado = unsafe { RegDeleteValueW(chave.0, &HSTRING::from(VALOR_DA_CHAVE)) };
        if apagado.is_ok() || apagado == ERROR_FILE_NOT_FOUND {
            Ok(())
        } else {
            Err(io::Error::from_raw_os_error(apagado.0 as i32))
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_servidor_e_https() {
        assert_eq!(
            endereco_valido("https://grafite.empresa.com.br/").as_deref(),
            Some("https://grafite.empresa.com.br")
        );
        assert_eq!(endereco_valido("http://grafite.empresa.com.br"), None);
    }

    #[test]
    fn o_http_so_vale_no_computador() {
        assert_eq!(
            endereco_valido("http://localhost:5173").as_deref(),
            Some("http://localhost:5173")
        );
        assert!(endereco_valido("http://127.0.0.1:5173").is_some());
        assert!(endereco_valido("http://[::1]:5173").is_some());
        assert_eq!(endereco_valido("http://localhost.empresa.com.br"), None);
        assert_eq!(endereco_valido("http://10.0.0.5"), None);
    }

    #[test]
    fn o_endereco_estranho_e_recusado() {
        assert_eq!(
            endereco_valido("https://ti@grafite.empresa.com.br"),
            None
        );
        assert_eq!(endereco_valido("https://grafite.empresa.com.br/?a=1"), None);
        assert_eq!(endereco_valido("ftp://grafite.empresa.com.br"), None);
        assert_eq!(endereco_valido("grafite.empresa.com.br"), None);
        assert_eq!(endereco_valido(""), None);
    }

    #[test]
    fn a_entrada_sugerida() {
        assert_eq!(entrada_do_texto("windows"), Some(Entrada::Windows));
        assert_eq!(entrada_do_texto(" Senha "), Some(Entrada::Senha));
        assert_eq!(entrada_do_texto("cartao"), None);
    }
}
