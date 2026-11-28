//! O log do serviço para a TI, em `%ProgramData%\Grafite\Aba\logs`, com rotação de 5 arquivos de
//! 1 MB (design, decisão 12): os contatos, as recusas e os erros, sem a chave, os tokens, as senhas e
//! as mensagens. Os segredos são do tipo `Segredo`, que não tem `Display` e cujo `Debug` os
//! esconde: eles não chegam a uma linha do log nem por engano.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

pub const TAMANHO_DO_ARQUIVO: u64 = 1024 * 1024;
pub const ARQUIVOS: usize = 5;
const NOME: &str = "servico";

static LOG: OnceLock<Log> = OnceLock::new();

struct Log {
    rotacao: Mutex<Rotacao>,
    no_console: bool,
}

/// Liga o log na pasta; `no_console` repete as linhas no stderr, para o `--console`.
pub fn iniciar(pasta: PathBuf, no_console: bool) {
    let _ = LOG.set(Log {
        rotacao: Mutex::new(Rotacao::nova(pasta, TAMANHO_DO_ARQUIVO, ARQUIVOS)),
        no_console,
    });
}

pub fn info(mensagem: &str) {
    escrever("INFO", mensagem);
}

pub fn aviso(mensagem: &str) {
    escrever("AVISO", mensagem);
}

pub fn erro(mensagem: &str) {
    escrever("ERRO", mensagem);
}

fn escrever(nivel: &str, mensagem: &str) {
    let Some(log) = LOG.get() else {
        return;
    };
    let segundos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |desde| desde.as_secs());
    let linha = linha(segundos, nivel, mensagem);
    if log.no_console {
        eprint!("{linha}");
    }
    if let Ok(mut rotacao) = log.rotacao.lock() {
        let _ = rotacao.escrever(&linha);
    }
}

/// Uma linha do log, sem quebra no meio: o que vem da API não abre uma linha falsa.
pub fn linha(segundos: u64, nivel: &str, mensagem: &str) -> String {
    let limpa: String = mensagem
        .chars()
        .map(|caractere| {
            if caractere.is_control() {
                ' '
            } else {
                caractere
            }
        })
        .collect();
    format!("{} {nivel} {limpa}\n", momento_utc(segundos))
}

/// O momento em UTC, como `2026-11-28T03:05:06Z`.
pub fn momento_utc(segundos: u64) -> String {
    let dias = (segundos / 86_400) as i64;
    let resto = segundos % 86_400;
    // O calendário civil a partir dos dias desde 1970 (Howard Hinnant, "days_from_civil" ao contrário).
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let dia_da_era = z.rem_euclid(146_097);
    let ano_da_era =
        (dia_da_era - dia_da_era / 1_460 + dia_da_era / 36_524 - dia_da_era / 146_096) / 365;
    let dia_do_ano = dia_da_era - (365 * ano_da_era + ano_da_era / 4 - ano_da_era / 100);
    let mes_desde_marco = (5 * dia_do_ano + 2) / 153;
    let dia = dia_do_ano - (153 * mes_desde_marco + 2) / 5 + 1;
    let mes = if mes_desde_marco < 10 {
        mes_desde_marco + 3
    } else {
        mes_desde_marco - 9
    };
    let ano = ano_da_era + era * 400 + i64::from(mes <= 2);
    format!(
        "{ano:04}-{mes:02}-{dia:02}T{:02}:{:02}:{:02}Z",
        resto / 3_600,
        resto % 3_600 / 60,
        resto % 60
    )
}

/// Os arquivos do log: o `servico.log` e os antigos, do `servico.1.log` ao `servico.4.log`.
pub struct Rotacao {
    pasta: PathBuf,
    maximo: u64,
    arquivos: usize,
    atual: Option<(File, u64)>,
}

impl Rotacao {
    pub fn nova(pasta: PathBuf, maximo: u64, arquivos: usize) -> Self {
        Self {
            pasta,
            maximo,
            arquivos,
            atual: None,
        }
    }

    fn caminho(&self, numero: usize) -> PathBuf {
        if numero == 0 {
            self.pasta.join(format!("{NOME}.log"))
        } else {
            self.pasta.join(format!("{NOME}.{numero}.log"))
        }
    }

    pub fn escrever(&mut self, linha: &str) -> io::Result<()> {
        let tamanho = linha.len() as u64;
        if let Some((_, escrito)) = &self.atual
            && *escrito > 0
            && *escrito + tamanho > self.maximo
        {
            self.rodar()?;
        }
        if self.atual.is_none() {
            let arquivo = OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.caminho(0))?;
            let escrito = arquivo.metadata()?.len();
            self.atual = Some((arquivo, escrito));
            if escrito > 0 && escrito + tamanho > self.maximo {
                self.rodar()?;
                return self.escrever(linha);
            }
        }
        if let Some((arquivo, escrito)) = &mut self.atual {
            arquivo.write_all(linha.as_bytes())?;
            *escrito += tamanho;
        }
        Ok(())
    }

    fn rodar(&mut self) -> io::Result<()> {
        self.atual = None;
        let ultimo = self.caminho(self.arquivos - 1);
        match fs::remove_file(&ultimo) {
            Err(erro) if erro.kind() != io::ErrorKind::NotFound => return Err(erro),
            _ => {}
        }
        for numero in (0..self.arquivos - 1).rev() {
            match fs::rename(self.caminho(numero), self.caminho(numero + 1)) {
                Err(erro) if erro.kind() != io::ErrorKind::NotFound => return Err(erro),
                _ => {}
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::segredo::Segredo;

    #[test]
    fn o_momento_em_utc() {
        assert_eq!(momento_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(momento_utc(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(momento_utc(1_795_835_106), "2026-11-28T03:05:06Z");
    }

    #[test]
    fn a_linha_nao_quebra() {
        assert_eq!(
            linha(0, "AVISO", "recusado\r\nERRO falso"),
            "1970-01-01T00:00:00Z AVISO recusado  ERRO falso\n"
        );
    }

    #[test]
    fn o_segredo_nao_chega_ao_log() {
        let token = Segredo::novo("tok_abc123");
        let linha = linha(0, "INFO", &format!("registrado com {token:?}"));
        assert!(!linha.contains("abc123"));
    }

    #[test]
    fn a_rotacao_guarda_cinco_arquivos_de_um_tamanho() {
        let pasta = std::env::temp_dir().join(format!("grafite-aba-log-{}", std::process::id()));
        let _ = fs::remove_dir_all(&pasta);
        fs::create_dir_all(&pasta).expect("a pasta do teste");
        let mut rotacao = Rotacao::nova(pasta.clone(), 100, 5);
        for numero in 0..40 {
            rotacao
                .escrever(&format!("linha {numero:04} com trinta bytes\n"))
                .expect("escrito");
        }
        drop(rotacao);
        let mut nomes: Vec<String> = fs::read_dir(&pasta)
            .expect("a pasta")
            .filter_map(|entrada| entrada.ok()?.file_name().into_string().ok())
            .collect();
        nomes.sort();
        assert_eq!(
            nomes,
            [
                "servico.1.log",
                "servico.2.log",
                "servico.3.log",
                "servico.4.log",
                "servico.log"
            ]
        );
        for nome in &nomes {
            let tamanho = fs::metadata(pasta.join(nome)).expect("o arquivo").len();
            assert!(tamanho <= 100, "{nome} com {tamanho} bytes");
        }
        let atual = fs::read_to_string(pasta.join("servico.log")).expect("o atual");
        assert!(atual.ends_with("linha 0039 com trinta bytes\n"));
        // Reaberto, o log segue no mesmo arquivo, sem passar do tamanho.
        let mut reaberta = Rotacao::nova(pasta.clone(), 100, 5);
        reaberta
            .escrever("mais uma linha com trinta b\n")
            .expect("escrito");
        drop(reaberta);
        let tamanho = fs::metadata(pasta.join("servico.log"))
            .expect("o atual")
            .len();
        assert!(tamanho <= 100);
        let _ = fs::remove_dir_all(&pasta);
    }
}
