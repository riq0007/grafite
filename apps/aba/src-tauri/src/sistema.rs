//! O que o Windows diz da pessoa (design, decisão 7): o tema dos apps, o alto contraste, as animações
//! e a apresentação. As leituras são do Windows; o que elas decidem é puro, com testes.

use crate::aparencia::Tema;

/// O tema e o movimento que a tela recebe na aparência.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DoWindows {
    pub tema: Tema,
    pub movimento_reduzido: bool,
}

/// O tema da aba: o alto contraste vence o claro e o escuro dos apps.
pub fn tema(apps_no_claro: bool, alto_contraste: bool) -> Tema {
    if alto_contraste {
        Tema::AltoContraste
    } else if apps_no_claro {
        Tema::Claro
    } else {
        Tema::Escuro
    }
}

/// Os estados do `SHQueryUserNotificationState` que encolhem a aba: um programa em tela cheia
/// (`QUNS_BUSY`, 2), o Direct3D em tela cheia (`QUNS_RUNNING_D3D_FULL_SCREEN`, 3) e o modo de
/// apresentação (`QUNS_PRESENTATION_MODE`, 4). A leitura não diz o monitor.
pub fn em_apresentacao(estado: i32) -> bool {
    matches!(estado, 2..=4)
}

#[cfg(windows)]
pub use nativo::{apresentacao, ler};

#[cfg(windows)]
mod nativo {
    use std::ffi::c_void;
    use std::mem::size_of;

    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
    use windows::Win32::UI::Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW};
    use windows::Win32::UI::Shell::SHQueryUserNotificationState;
    use windows::Win32::UI::WindowsAndMessaging::{
        SPI_GETCLIENTAREAANIMATION, SPI_GETHIGHCONTRAST, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        SystemParametersInfoW,
    };
    use windows::core::{BOOL, w};

    use super::{DoWindows, em_apresentacao, tema};

    /// O `AppsUseLightTheme`. Sem o valor, o Windows usa o claro.
    fn apps_no_claro() -> bool {
        let mut valor: u32 = 1;
        let mut tamanho = size_of::<u32>() as u32;
        // SAFETY: o valor e o tamanho são nossos e vivem durante a chamada.
        let lido = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
                w!("AppsUseLightTheme"),
                RRF_RT_REG_DWORD,
                None,
                Some((&raw mut valor).cast::<c_void>()),
                Some(&raw mut tamanho),
            )
        };
        lido != ERROR_SUCCESS || valor != 0
    }

    /// O `SPI_GETHIGHCONTRAST`.
    fn alto_contraste() -> bool {
        let mut contraste = HIGHCONTRASTW {
            cbSize: size_of::<HIGHCONTRASTW>() as u32,
            ..Default::default()
        };
        // SAFETY: a estrutura é nossa, com o tamanho dela.
        let lido = unsafe {
            SystemParametersInfoW(
                SPI_GETHIGHCONTRAST,
                contraste.cbSize,
                Some((&raw mut contraste).cast::<c_void>()),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
        };
        lido.is_ok() && (contraste.dwFlags.0 & HCF_HIGHCONTRASTON.0) != 0
    }

    /// O `SPI_GETCLIENTAREAANIMATION`: as animações do Windows desligadas são o reduzir movimento.
    fn animacoes() -> bool {
        let mut animar = BOOL(1);
        // SAFETY: o BOOL é nosso e vive durante a chamada.
        let lido = unsafe {
            SystemParametersInfoW(
                SPI_GETCLIENTAREAANIMATION,
                0,
                Some((&raw mut animar).cast::<c_void>()),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
        };
        lido.is_err() || animar.as_bool()
    }

    pub fn ler() -> DoWindows {
        DoWindows {
            tema: tema(apps_no_claro(), alto_contraste()),
            movimento_reduzido: !animacoes(),
        }
    }

    /// Se um programa está em tela cheia ou o Windows está no modo de apresentação.
    pub fn apresentacao() -> bool {
        // SAFETY: a leitura não recebe nada nosso.
        unsafe { SHQueryUserNotificationState() }.is_ok_and(|estado| em_apresentacao(estado.0))
    }
}

#[cfg(not(windows))]
pub fn ler() -> DoWindows {
    DoWindows {
        tema: Tema::Escuro,
        movimento_reduzido: false,
    }
}

#[cfg(not(windows))]
pub fn apresentacao() -> bool {
    false
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn o_alto_contraste_vence_o_tema_dos_apps() {
        assert_eq!(tema(false, false), Tema::Escuro);
        assert_eq!(tema(true, false), Tema::Claro);
        assert_eq!(tema(true, true), Tema::AltoContraste);
        assert_eq!(tema(false, true), Tema::AltoContraste);
    }

    #[test]
    fn a_tela_cheia_e_a_apresentacao_encolhem_a_aba() {
        // QUNS_NOT_PRESENT, a tela bloqueada ou o protetor de tela, não encolhe.
        assert!(!em_apresentacao(1));
        assert!(em_apresentacao(2));
        assert!(em_apresentacao(3));
        assert!(em_apresentacao(4));
        // QUNS_ACCEPTS_NOTIFICATIONS, QUNS_QUIET_TIME e QUNS_APP seguem com a aba.
        assert!(!em_apresentacao(5));
        assert!(!em_apresentacao(6));
        assert!(!em_apresentacao(7));
    }
}
