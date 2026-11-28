//! As pastas do serviço em `%ProgramData%\Grafite\Aba`, só do sistema e dos administradores: o
//! token do aparelho, a configuração guardada e os logs. Uma pasta que a pessoa também escrevesse
//! deixaria quem não é administrador pôr ali um atalho e fazer o serviço escrever onde quisesse: a
//! pasta que é um atalho é recusada, a que falta nasce já com a permissão, e a que existe ganha a
//! permissão de novo a cada início, com o dono nos administradores.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// A pasta do Grafite: o sistema e os administradores com tudo, e os usuários só leem.
pub const SDDL_DO_GRAFITE: &str = "O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)";
/// A pasta da aba e a dos logs: só o sistema e os administradores.
pub const SDDL_DA_ABA: &str = "O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)";

#[derive(Debug, Clone)]
pub struct Pastas {
    aba: PathBuf,
}

impl Pastas {
    pub fn em(aba: PathBuf) -> Self {
        Self { aba }
    }

    /// O token do aparelho, cifrado pelo DPAPI da máquina.
    pub fn aparelho(&self) -> PathBuf {
        self.aba.join("aparelho")
    }

    /// A última configuração da API, para todas as pessoas do computador.
    pub fn configuracao(&self) -> PathBuf {
        self.aba.join("configuracao.json")
    }

    pub fn logs(&self) -> PathBuf {
        self.aba.join("logs")
    }
}

/// Grava o arquivo inteiro ou nada: o novo ao lado, e depois a troca.
pub fn gravar(caminho: &Path, dados: &[u8]) -> io::Result<()> {
    let mut novo = caminho.as_os_str().to_owned();
    novo.push(".novo");
    let novo = PathBuf::from(novo);
    match fs::remove_file(&novo) {
        Err(erro) if erro.kind() != io::ErrorKind::NotFound => return Err(erro),
        _ => {}
    }
    fs::write(&novo, dados)?;
    fs::rename(&novo, caminho)
}

#[cfg(windows)]
pub use nativo::preparar;

#[cfg(windows)]
mod nativo {
    use std::env;
    use std::fs;
    use std::io;
    use std::os::windows::fs::MetadataExt;
    use std::path::{Path, PathBuf};

    use grafite_aba_pipe::Descritor;
    use windows::Win32::Foundation::ERROR_ALREADY_EXISTS;
    use windows::Win32::Security::Authorization::{SE_FILE_OBJECT, SetNamedSecurityInfoW};
    use windows::Win32::Security::{
        ACL, DACL_SECURITY_INFORMATION, GetSecurityDescriptorDacl, GetSecurityDescriptorOwner,
        OWNER_SECURITY_INFORMATION, PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR,
        PSID, SECURITY_ATTRIBUTES,
    };
    use windows::Win32::Storage::FileSystem::CreateDirectoryW;
    use windows::core::{BOOL, HSTRING};

    use super::{Pastas, SDDL_DA_ABA, SDDL_DO_GRAFITE};

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

    /// Prepara `%ProgramData%\Grafite\Aba` e a dos logs, com a permissão de cada uma.
    pub fn preparar() -> io::Result<Pastas> {
        let dados = env::var_os("ProgramData")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
        let grafite = dados.join("Grafite");
        let aba = grafite.join("Aba");
        proteger(&grafite, SDDL_DO_GRAFITE)?;
        proteger(&aba, SDDL_DA_ABA)?;
        let pastas = Pastas::em(aba);
        proteger(&pastas.logs(), SDDL_DA_ABA)?;
        Ok(pastas)
    }

    fn proteger(pasta: &Path, sddl: &str) -> io::Result<()> {
        let descritor = Descritor::da_sddl(sddl)?;
        match fs::symlink_metadata(pasta) {
            Ok(dados) if dados.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 => {
                Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("{} é um atalho, e não uma pasta", pasta.display()),
                ))
            }
            Ok(dados) if !dados.is_dir() => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} não é uma pasta", pasta.display()),
            )),
            Ok(_) => aplicar(pasta, &descritor),
            Err(erro) if erro.kind() == io::ErrorKind::NotFound => {
                let atributos = SECURITY_ATTRIBUTES {
                    nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
                    lpSecurityDescriptor: descritor.ponteiro(),
                    bInheritHandle: false.into(),
                };
                // SAFETY: o caminho e os atributos vivem durante a chamada.
                match unsafe { CreateDirectoryW(&HSTRING::from(pasta), Some(&raw const atributos)) }
                {
                    Ok(()) => Ok(()),
                    // Criada por outro entre a leitura e a criação: confere de novo.
                    Err(erro) if erro.code() == ERROR_ALREADY_EXISTS.to_hresult() => {
                        proteger(pasta, sddl)
                    }
                    Err(erro) => Err(erro.into()),
                }
            }
            Err(erro) => Err(erro),
        }
    }

    /// O dono e a DACL protegida do descritor, que descem às pastas e aos arquivos de dentro.
    fn aplicar(pasta: &Path, descritor: &Descritor) -> io::Result<()> {
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
        let informacao = OWNER_SECURITY_INFORMATION
            | DACL_SECURITY_INFORMATION
            | PROTECTED_DACL_SECURITY_INFORMATION;
        // SAFETY: o caminho, o dono e a DACL vivem durante a chamada.
        let resultado = unsafe {
            SetNamedSecurityInfoW(
                &HSTRING::from(pasta),
                SE_FILE_OBJECT,
                informacao,
                Some(dono),
                None,
                Some(dacl),
                None,
            )
        };
        resultado.ok().map_err(io::Error::from)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn os_arquivos_ficam_na_pasta_da_aba() {
        let pastas = Pastas::em(PathBuf::from(r"C:\ProgramData\Grafite\Aba"));
        assert_eq!(
            pastas.aparelho(),
            PathBuf::from(r"C:\ProgramData\Grafite\Aba\aparelho")
        );
        assert_eq!(
            pastas.logs(),
            PathBuf::from(r"C:\ProgramData\Grafite\Aba\logs")
        );
    }

    #[test]
    fn gravar_troca_o_arquivo_inteiro() {
        let pasta = std::env::temp_dir().join(format!("grafite-aba-gravar-{}", std::process::id()));
        fs::create_dir_all(&pasta).expect("a pasta do teste");
        let arquivo = pasta.join("configuracao.json");
        gravar(&arquivo, b"primeiro").expect("o primeiro");
        gravar(&arquivo, b"segundo").expect("o segundo");
        assert_eq!(fs::read(&arquivo).ok().as_deref(), Some(&b"segundo"[..]));
        assert!(!pasta.join("configuracao.json.novo").exists());
        let _ = fs::remove_dir_all(&pasta);
    }

    #[cfg(windows)]
    #[test]
    fn as_permissoes_sao_validas() {
        assert!(grafite_aba_pipe::Descritor::da_sddl(SDDL_DO_GRAFITE).is_ok());
        assert!(grafite_aba_pipe::Descritor::da_sddl(SDDL_DA_ABA).is_ok());
    }
}
