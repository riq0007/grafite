//! O computador que o serviço registra: o identificador da máquina (`MachineGuid`) e o nome.

/// O nome no cabeçalho `x-grafite-computador`, só em ASCII visível: o Node lê o cabeçalho em latin1,
/// e o nome com acento sairia trocado. Esse nome não vai no cabeçalho, sem transliterar, e vai só no
/// corpo do registro.
pub fn nome_no_cabecalho(nome: &str) -> Option<&str> {
    let visivel = nome.bytes().all(|byte| (0x20..0x7f).contains(&byte));
    (!nome.is_empty() && visivel).then_some(nome)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Computador {
    pub identificador: String,
    pub nome: String,
}

#[cfg(windows)]
pub fn este() -> Option<Computador> {
    use windows::Win32::System::SystemInformation::{
        ComputerNameDnsHostname, ComputerNameNetBIOS, GetComputerNameExW,
    };
    use windows::core::PWSTR;

    let identificador =
        crate::instalacao::texto_da_maquina(r"SOFTWARE\Microsoft\Cryptography", "MachineGuid")?;
    // O nome que a TI vê no Windows e no Intune, com as maiúsculas e as minúsculas; o do NetBIOS,
    // em maiúsculas, só quando falta o outro.
    let nome = [ComputerNameDnsHostname, ComputerNameNetBIOS]
        .into_iter()
        .find_map(|formato| {
            let mut nome = [0_u16; 256];
            let mut tamanho = nome.len() as u32;
            // SAFETY: o buffer é nosso, com o tamanho dele.
            unsafe {
                GetComputerNameExW(formato, Some(PWSTR(nome.as_mut_ptr())), &raw mut tamanho)
            }
            .ok()?;
            let nome = String::from_utf16_lossy(&nome[..tamanho as usize]);
            (!nome.is_empty()).then_some(nome)
        })?;
    Some(Computador {
        identificador,
        nome,
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_nome_em_ascii_vai_no_cabecalho() {
        assert_eq!(nome_no_cabecalho("PC-FIN-09"), Some("PC-FIN-09"));
    }

    #[test]
    fn o_nome_com_acento_fica_fora_do_cabecalho() {
        assert_eq!(nome_no_cabecalho("PC-GERÊNCIA"), None);
        assert_eq!(nome_no_cabecalho("PC-FIN\t09"), None);
        assert_eq!(nome_no_cabecalho(""), None);
    }
}
