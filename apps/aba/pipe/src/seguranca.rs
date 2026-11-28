//! A segurança do Windows que o pipe usa: o descritor a partir da SDDL, o SID em texto e quem é dono
//! de um token.

use std::ffi::c_void;
use std::io;

use windows::Win32::Foundation::{HANDLE, HLOCAL, LocalFree};
use windows::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows::Win32::Security::{
    GetTokenInformation, LookupAccountSidW, PSECURITY_DESCRIPTOR, PSID, SID_NAME_USE, TOKEN_USER,
    TokenSessionId, TokenUser,
};
use windows::core::{HSTRING, PWSTR};

use crate::Chamador;

/// Um descritor de segurança feito da SDDL, solto ao sair.
pub struct Descritor(PSECURITY_DESCRIPTOR);

impl Descritor {
    pub fn da_sddl(sddl: &str) -> io::Result<Self> {
        let mut descritor = PSECURITY_DESCRIPTOR::default();
        // SAFETY: o Windows aloca o descritor, que o `Drop` solta.
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                &HSTRING::from(sddl),
                SDDL_REVISION_1,
                &raw mut descritor,
                None,
            )
        }?;
        Ok(Self(descritor))
    }

    pub fn ponteiro(&self) -> *mut c_void {
        self.0.0
    }
}

impl Drop for Descritor {
    fn drop(&mut self) {
        // SAFETY: o descritor veio do LocalAlloc do Windows e é solto uma vez.
        unsafe {
            let _ = LocalFree(Some(HLOCAL(self.0.0)));
        }
    }
}

/// Uma informação do token, no tamanho que o Windows pede.
fn informacao(
    token: HANDLE,
    classe: windows::Win32::Security::TOKEN_INFORMATION_CLASS,
) -> io::Result<Vec<u8>> {
    let mut tamanho = 0;
    // SAFETY: a primeira chamada só pede o tamanho.
    let _ = unsafe { GetTokenInformation(token, classe, None, 0, &raw mut tamanho) };
    let mut dados = vec![0_u8; tamanho as usize];
    // SAFETY: o buffer tem o tamanho pedido.
    unsafe {
        GetTokenInformation(
            token,
            classe,
            Some(dados.as_mut_ptr().cast()),
            tamanho,
            &raw mut tamanho,
        )
    }?;
    Ok(dados)
}

fn sid_em_texto(sid: PSID) -> io::Result<String> {
    let mut texto = PWSTR::null();
    // SAFETY: o Windows aloca o texto, solto logo depois de copiado.
    unsafe {
        ConvertSidToStringSidW(sid, &raw mut texto)?;
        let copia = texto
            .to_string()
            .map_err(|_| io::Error::from(io::ErrorKind::InvalidData));
        let _ = LocalFree(Some(HLOCAL(texto.0.cast())));
        copia
    }
}

fn nome_da_conta(sid: PSID) -> String {
    let mut nome = [0_u16; 256];
    let mut dominio = [0_u16; 256];
    let (mut tamanho_do_nome, mut tamanho_do_dominio) = (256_u32, 256_u32);
    let mut uso = SID_NAME_USE::default();
    // SAFETY: os buffers são nossos, com os tamanhos deles.
    let achou = unsafe {
        LookupAccountSidW(
            None,
            sid,
            Some(PWSTR(nome.as_mut_ptr())),
            &raw mut tamanho_do_nome,
            Some(PWSTR(dominio.as_mut_ptr())),
            &raw mut tamanho_do_dominio,
            &raw mut uso,
        )
    };
    if achou.is_err() {
        return String::new();
    }
    let nome = String::from_utf16_lossy(&nome[..tamanho_do_nome as usize]);
    let dominio = String::from_utf16_lossy(&dominio[..tamanho_do_dominio as usize]);
    if dominio.is_empty() {
        nome
    } else {
        format!("{dominio}\\{nome}")
    }
}

/// Quem é dono do token: o SID, o nome e a sessão do Windows.
pub fn dono_do_token(token: HANDLE) -> io::Result<Chamador> {
    let usuario = informacao(token, TokenUser)?;
    // SAFETY: o buffer do TokenUser começa com o TOKEN_USER, e o SID aponta para dentro dele.
    let sid = unsafe { (*usuario.as_ptr().cast::<TOKEN_USER>()).User.Sid };
    let sessao = informacao(token, TokenSessionId)?;
    let sessao = u32::from_ne_bytes(
        sessao
            .get(..4)
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))?,
    );
    Ok(Chamador {
        sid: sid_em_texto(sid)?,
        nome: nome_da_conta(sid),
        sessao,
    })
}
