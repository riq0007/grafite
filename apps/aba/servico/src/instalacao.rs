//! O que o MSI grava em `HKLM\SOFTWARE\Grafite\Aba` (design, decisão 12), com a permissão só do
//! sistema e dos administradores: o servidor, a chave e a entrada sugerida. A permissão é do serviço,
//! que a põe ao começar, antes de se dizer pronto: o MSI do Tauri declara o Windows Installer 4.5, sem
//! o `MsiLockPermissionsEx`, e o `LockPermissions` não chega à chave que já existe. O MSI grava a
//! chave da organização depois do `StartServices`, que espera o serviço ficar pronto.

pub use grafite_aba_pipe::Entrada;

use crate::segredo::Segredo;

pub const CHAVE_DO_REGISTRO: &str = r"SOFTWARE\Grafite\Aba";
pub const VALOR_DO_SERVIDOR: &str = "Servidor";
pub const VALOR_DA_CHAVE: &str = "Chave";
pub const VALOR_DA_ENTRADA: &str = "Entrada";
/// A chave do registro: o sistema e os administradores com tudo, sem herdar, e o dono nos
/// administradores.
pub const SDDL_DA_CHAVE: &str = "O:BAD:P(A;CI;KA;;;SY)(A;CI;KA;;;BA)";

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
pub use nativo::{apagar_a_chave, ler, proteger, texto as texto_da_maquina};

#[cfg(windows)]
mod nativo {
    use std::io;

    use grafite_aba_pipe::Descritor;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, HANDLE};
    use windows::Win32::Security::Authorization::{SE_REGISTRY_KEY, SetSecurityInfo};
    use windows::Win32::Security::{
        ACL, DACL_SECURITY_INFORMATION, GetSecurityDescriptorDacl, GetSecurityDescriptorOwner,
        OWNER_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR,
        PSID, SECURITY_ATTRIBUTES,
    };
    use windows::Win32::System::Registry::{
        HKEY, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, KEY_WOW64_64KEY,
        REG_OPTION_NON_VOLATILE, REG_SAM_FLAGS, RRF_RT_REG_SZ, RegCloseKey, RegCreateKeyExW,
        RegDeleteValueW, RegGetValueW, RegOpenKeyExW,
    };
    use windows::core::{BOOL, HSTRING, PCWSTR};

    use super::{
        CHAVE_DO_REGISTRO, Instalacao, SDDL_DA_CHAVE, VALOR_DA_CHAVE, VALOR_DA_ENTRADA,
        VALOR_DO_SERVIDOR, entrada_do_texto,
    };

    /// O `WRITE_DAC` e o `WRITE_OWNER`, para trocar a permissão e o dono da chave.
    const TROCAR_A_PERMISSAO: REG_SAM_FLAGS = REG_SAM_FLAGS(0x0004_0000 | 0x0008_0000);
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

    /// Cria a chave do registro, se falta, já protegida, e põe de novo a permissão e o dono na que
    /// existe: o MSI a cria herdando a de `SOFTWARE`, que os usuários leem.
    pub fn proteger() -> io::Result<()> {
        let descritor = Descritor::da_sddl(SDDL_DA_CHAVE)?;
        let atributos = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descritor.ponteiro(),
            bInheritHandle: false.into(),
        };
        let mut chave = HKEY::default();
        // SAFETY: o caminho e os atributos vivem durante a chamada; a chave fica com o `Chave`.
        unsafe {
            RegCreateKeyExW(
                HKEY_LOCAL_MACHINE,
                &HSTRING::from(CHAVE_DO_REGISTRO),
                None,
                PCWSTR::null(),
                REG_OPTION_NON_VOLATILE,
                KEY_WOW64_64KEY | TROCAR_A_PERMISSAO,
                Some(&raw const atributos),
                &raw mut chave,
                None,
            )
        }
        .ok()?;
        let chave = Chave(chave);
        let sd = PSECURITY_DESCRIPTOR(descritor.ponteiro());
        let mut dono = PSID::default();
        let mut dono_padrao = BOOL::default();
        let mut presente = BOOL::default();
        let mut dacl: *mut ACL = std::ptr::null_mut();
        let mut dacl_padrao = BOOL::default();
        // SAFETY: o descritor vive até o fim da função; os ponteiros apontam para dentro dele.
        unsafe {
            GetSecurityDescriptorOwner(sd, &raw mut dono, &raw mut dono_padrao)?;
            GetSecurityDescriptorDacl(sd, &raw mut presente, &raw mut dacl, &raw mut dacl_padrao)?;
        }
        // SAFETY: a chave está aberta com o WRITE_DAC e o WRITE_OWNER; o dono e a DACL vivem
        // durante a chamada.
        unsafe {
            SetSecurityInfo(
                HANDLE(chave.0.0),
                SE_REGISTRY_KEY,
                OWNER_SECURITY_INFORMATION
                    | DACL_SECURITY_INFORMATION
                    | PROTECTED_DACL_SECURITY_INFORMATION,
                Some(dono),
                None,
                Some(dacl),
                None,
            )
        }
        .ok()
        .map_err(io::Error::from)
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
        assert_eq!(endereco_valido("https://ti@grafite.empresa.com.br"), None);
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
