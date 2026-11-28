//! A sessão da aba (spec "Pessoa pelo usuário do Windows", "Pessoa pela senha do AD" e "Sessão da
//! aba"; design, decisões 1, 2 e 4): a aba pede a sessão ao serviço pelo pipe, e o serviço a pede à
//! API, com o token do aparelho.
//!
//! Pelo Windows, o serviço pede com o SID que o Windows lhe dá. O token fica com a aba, na memória e
//! cifrado pelo DPAPI da pessoa, e a renovação vai pelo serviço a cada 50 minutos, antes de a hora da
//! sessão acabar, sem a pessoa ver.
//!
//! Pela senha, no perfil genérico, a aba mostra o formulário, e o usuário, a senha e o código vão ao
//! serviço só no pedido. O token fica só na memória, e ao abrir a aba, ao abrir a sessão e ao
//! terminá-la, a aba apaga o que guardou da pessoa, também os dados do chat. O uso, a aba ou a tela
//! maior com o foco, vai no máximo uma vez por minuto, e a API conta os 30 minutos sem ele.
//!
//! A aba decide pelo código do problema, e não pelo status:
//! - a pessoa recusada fica sem conexão com a frase do motivo e tenta de novo a cada 10 minutos; a
//!   TI fora do alcance tenta em 30 s, e na renovação não derruba a sessão, que vale até vencer;
//! - a sessão recusada na renovação abre outra na hora, fora a encerrada por outra sessão do
//!   Windows com a mesma conta, que espera a pessoa entrar no Windows de novo; pela senha, ela volta
//!   ao formulário;
//! - a senha errada, o código errado e o bloqueio da entrada são da pessoa, e ficam no formulário;
//! - o token do aparelho recusado e o bloqueio são do computador: o serviço os mostra no pedido
//!   seguinte da situação do aparelho.

use std::io;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::Manager;

use grafite_aba_pipe::{Aparelho, Entrada, Oculto, Pedido, Recusa, Resposta, Situacao};

use crate::cofre::SessaoGuardada;
use crate::estado::{Formulario, Passo};

/// As frases do `FRASES_SEM_CONEXAO` do domínio que a aba usa sem a API.
pub const NAO_CONFIGURADA: &str = "A aba não foi configurada. Fale com a TI.";
pub const SEM_REDE: &str = "Sem conexão com o Grafite.";
pub const OUTRA_SESSAO_DO_WINDOWS: &str =
    "Você abriu a aba em outra sessão do Windows deste computador.";

pub const RENOVAR_A_CADA: Duration = Duration::from_secs(50 * 60);
/// O `INTERVALO_DA_RECUSA_DA_PESSOA` do domínio.
pub const RECUSA_DA_PESSOA: Duration = Duration::from_secs(10 * 60);
pub const TI_FORA_DO_ALCANCE: Duration = Duration::from_secs(30);
pub const SEM_REDE_DE_NOVO: Duration = Duration::from_secs(30);
pub const UM_MINUTO: Duration = Duration::from_secs(60);
/// O uso vai à API no máximo uma vez por minuto.
pub const USO_A_CADA: Duration = Duration::from_secs(60);
/// O `SEM_USO_DA_ABA_PELA_SENHA` da API, com a folga do caminho: a esta altura sem uso, a aba
/// confere a sessão, e a API, que conta, a dá por encerrada.
pub const SEM_USO: Duration = Duration::from_secs(30 * 60 + 15);
const AO_MESMO_TEMPO: Duration = Duration::from_secs(5);

/// O serviço do outro lado do pipe.
pub trait Servico {
    fn pedir(&self, pedido: &Pedido) -> Result<Resposta, String>;
}

/// O que a aba guarda da pessoa: o token da entrada pelo Windows no disco, e os dados do chat.
pub trait Cofre {
    fn ler(&self) -> Option<SessaoGuardada>;
    fn gravar(&self, sessao: &SessaoGuardada) -> io::Result<()>;
    fn apagar(&self);
    fn apagar_os_dados_do_chat(&self);
}

pub struct Sessao<S, C> {
    servico: S,
    cofre: C,
    atual: Option<SessaoGuardada>,
    lida_do_disco: bool,
    renovar_em: Option<Instant>,
    tentar_em: Option<Instant>,
    /// A sessão encerrada por outra sessão do Windows: só a pessoa a traz de volta.
    parada: bool,
    /// A entrada do aparelho no último passo, `None` antes do primeiro.
    entrada: Option<Entrada>,
    servidor: Option<String>,
    /// A pendente do código, da conta com os dois passos.
    pendente: Option<Oculto>,
    /// O 429 do formulário: o "Entrar" não vai ao serviço antes disto.
    esperar_ate: Option<Instant>,
    /// O último uso que foi à API, ou a abertura da sessão pela senha.
    uso_em: Option<Instant>,
    /// Sem o uso até aqui, a API já encerrou a sessão pela senha.
    conferir_o_uso_em: Option<Instant>,
    /// Quem está na aba.
    pub nome: Option<String>,
    /// A sessão é da entrada pela senha, com o "Sair".
    pub pela_senha: bool,
    /// O motivo da aba sem conexão.
    pub motivo: Option<String>,
    /// Na entrada pela senha, sem sessão.
    pub formulario: Option<Formulario>,
}

impl<S: Servico, C: Cofre> Sessao<S, C> {
    pub fn nova(servico: S, cofre: C) -> Self {
        Self {
            servico,
            cofre,
            atual: None,
            lida_do_disco: false,
            renovar_em: None,
            tentar_em: None,
            parada: false,
            entrada: None,
            servidor: None,
            pendente: None,
            esperar_ate: None,
            uso_em: None,
            conferir_o_uso_em: None,
            nome: None,
            pela_senha: false,
            motivo: None,
            formulario: None,
        }
    }

    /// O token da sessão que vale agora, para os pedidos da aba à API.
    #[allow(dead_code, reason = "os pedidos da aba à API entram na tarefa 5.14")]
    pub fn atual(&self) -> Option<&SessaoGuardada> {
        self.atual.as_ref()
    }

    /// Esquece a sessão: a do Windows sai do disco, e a da senha leva os dados do chat.
    fn esquecer(&mut self) {
        if self.atual.take().is_some() {
            if self.pela_senha {
                self.cofre.apagar_os_dados_do_chat();
            } else {
                self.cofre.apagar();
            }
        }
        self.pela_senha = false;
        self.renovar_em = None;
        self.uso_em = None;
        self.conferir_o_uso_em = None;
        self.nome = None;
    }

    fn do_aparelho(&mut self, aparelho: &Aparelho) {
        self.formulario = None;
        self.motivo = Some(
            aparelho
                .motivo
                .clone()
                .unwrap_or_else(|| NAO_CONFIGURADA.to_owned()),
        );
    }

    /// Um passo: a situação do aparelho, e a abertura ou a renovação da sessão. Devolve quanto
    /// esperar.
    pub fn passo(&mut self, agora: Instant) -> Duration {
        let aparelho = match self.servico.pedir(&Pedido::Aparelho) {
            Ok(Resposta::Aparelho(aparelho)) => aparelho,
            // Sem o serviço, ou com o pipe falso, a aba não foi configurada neste computador.
            _ => {
                self.formulario = None;
                self.motivo = Some(NAO_CONFIGURADA.to_owned());
                return UM_MINUTO;
            }
        };
        let Some(servidor) = aparelho.servidor.clone() else {
            self.esquecer();
            self.do_aparelho(&aparelho);
            return UM_MINUTO;
        };
        if matches!(
            aparelho.situacao,
            Situacao::NaoConfigurada | Situacao::RegistrarDeNovo | Situacao::Bloqueada
        ) {
            self.esquecer();
            self.do_aparelho(&aparelho);
            return UM_MINUTO;
        }
        if self
            .atual
            .as_ref()
            .is_some_and(|sessao| sessao.servidor != servidor)
        {
            self.esquecer();
        }
        self.servidor = Some(servidor.clone());
        let pela_senha = aparelho
            .configuracao
            .as_ref()
            .is_some_and(|configuracao| configuracao.entrada == Entrada::Senha);
        if pela_senha {
            self.passo_pela_senha(agora)
        } else {
            self.passo_pelo_windows(servidor, agora)
        }
    }

    fn passo_pela_senha(&mut self, agora: Instant) -> Duration {
        if self.entrada != Some(Entrada::Senha) {
            // Ao abrir, e na troca da entrada: nada da pessoa fica no computador, nem a sessão do
            // Windows guardada, nem os dados do chat.
            self.esquecer();
            self.cofre.apagar();
            self.cofre.apagar_os_dados_do_chat();
            self.entrada = Some(Entrada::Senha);
        }
        self.motivo = None;
        match self.atual.clone() {
            Some(sessao) => self.renovar_pela_senha(sessao, agora),
            None => {
                if self.formulario.is_none() {
                    self.formulario = Some(Formulario::senha());
                }
                UM_MINUTO
            }
        }
    }

    fn passo_pelo_windows(&mut self, servidor: String, agora: Instant) -> Duration {
        if self.entrada == Some(Entrada::Senha) {
            self.esquecer();
            self.pendente = None;
            self.esperar_ate = None;
        }
        self.entrada = Some(Entrada::Windows);
        self.formulario = None;
        if !self.lida_do_disco {
            self.lida_do_disco = true;
            if let Some(guardada) = self.cofre.ler() {
                self.nome = Some(guardada.nome.clone());
                self.atual = Some(guardada);
                // A guardada é conferida logo, pela renovação.
                self.renovar_em = Some(agora);
            }
            if self
                .atual
                .as_ref()
                .is_some_and(|sessao| sessao.servidor != servidor)
            {
                self.esquecer();
            }
        }
        if self.parada {
            return UM_MINUTO;
        }
        match self.atual.clone() {
            Some(sessao) => self.renovar(sessao, agora),
            None => self.abrir(servidor, agora),
        }
    }

    fn abrir(&mut self, servidor: String, agora: Instant) -> Duration {
        if let Some(em) = self.tentar_em
            && agora < em
        {
            return em - agora;
        }
        self.tentar_em = None;
        match self.servico.pedir(&Pedido::SessaoPeloWindows) {
            Ok(Resposta::Sessao { token, nome, .. }) => {
                let sessao = SessaoGuardada {
                    servidor,
                    token: token.expor().to_owned(),
                    nome: nome.clone(),
                };
                // Sem o disco, a sessão vale na memória até a aba fechar.
                let _ = self.cofre.gravar(&sessao);
                self.atual = Some(sessao);
                self.nome = Some(nome);
                self.motivo = None;
                self.renovar_em = Some(agora + RENOVAR_A_CADA);
                RENOVAR_A_CADA
            }
            Ok(Resposta::Recusa(recusa)) => self.recusa_da_abertura(&recusa, agora),
            Ok(Resposta::Aparelho(aparelho)) => {
                self.do_aparelho(&aparelho);
                UM_MINUTO
            }
            _ => {
                self.motivo = Some(NAO_CONFIGURADA.to_owned());
                UM_MINUTO
            }
        }
    }

    fn recusa_da_abertura(&mut self, recusa: &Recusa, agora: Instant) -> Duration {
        let espera = match recusa.codigo.as_deref() {
            Some("pessoa-recusada-na-aba") => {
                self.motivo = recusa.detalhe.clone();
                if recusa.motivo.as_deref() == Some("ti-fora-do-alcance") {
                    TI_FORA_DO_ALCANCE
                } else {
                    RECUSA_DA_PESSOA
                }
            }
            Some("muitas-requisicoes") => espera_do_429(recusa),
            Some("sessao-da-aba-ao-mesmo-tempo") => AO_MESMO_TEMPO,
            // Do computador: o serviço relê e mostra a situação no passo seguinte.
            Some("token-da-aba-recusado" | "aparelho-da-aba-bloqueado") => {
                self.motivo = recusa.detalhe.clone();
                AO_MESMO_TEMPO
            }
            // A entrada trocada pelo comando chega com a configuração do serviço.
            Some("entrada-do-aparelho-diferente") => UM_MINUTO,
            _ => {
                self.motivo = Some(SEM_REDE.to_owned());
                SEM_REDE_DE_NOVO
            }
        };
        self.tentar_em = Some(agora + espera);
        espera
    }

    fn renovar(&mut self, sessao: SessaoGuardada, agora: Instant) -> Duration {
        if let Some(em) = self.renovar_em
            && agora < em
        {
            return em - agora;
        }
        match self.servico.pedir(&Pedido::Renovar {
            token: sessao.token.into(),
        }) {
            Ok(Resposta::Renovada { .. }) => {
                self.motivo = None;
                self.renovar_em = Some(agora + RENOVAR_A_CADA);
                RENOVAR_A_CADA
            }
            Ok(Resposta::Recusa(recusa)) => self.recusa_da_renovacao(&recusa, agora),
            Ok(Resposta::Aparelho(aparelho)) => {
                self.do_aparelho(&aparelho);
                UM_MINUTO
            }
            // O serviço fora: a sessão segue até vencer, e a renovação tenta de novo.
            _ => UM_MINUTO,
        }
    }

    fn recusa_da_renovacao(&mut self, recusa: &Recusa, agora: Instant) -> Duration {
        match recusa.codigo.as_deref() {
            Some("sessao-da-aba-recusada") => {
                self.esquecer();
                if recusa.motivo_do_fim.as_deref() == Some("outra-sessao-no-aparelho") {
                    self.parada = true;
                    self.motivo = Some(OUTRA_SESSAO_DO_WINDOWS.to_owned());
                    UM_MINUTO
                } else {
                    // A vencida e a encerrada por outro motivo: outra, já.
                    Duration::ZERO
                }
            }
            Some("pessoa-recusada-na-aba")
                if recusa.motivo.as_deref() != Some("ti-fora-do-alcance") =>
            {
                // A API encerrou a sessão da pessoa que não passa mais.
                self.esquecer();
                self.motivo = recusa.detalhe.clone();
                self.tentar_em = Some(agora + RECUSA_DA_PESSOA);
                RECUSA_DA_PESSOA
            }
            Some("aparelho-da-aba-bloqueado" | "entrada-do-aparelho-diferente") => {
                self.esquecer();
                UM_MINUTO
            }
            Some("muitas-requisicoes") => espera_do_429(recusa),
            // A TI fora do alcance, a rede e o resto: a sessão vale até vencer.
            _ => UM_MINUTO,
        }
    }

    /// A renovação da sessão pela senha, que a aba também usa para conferir os 30 minutos sem uso:
    /// a API, que os conta, responde se a sessão segue.
    fn renovar_pela_senha(&mut self, sessao: SessaoGuardada, agora: Instant) -> Duration {
        let renovar = self.renovar_em.is_some_and(|em| agora >= em);
        let conferir = self.conferir_o_uso_em.is_some_and(|em| agora >= em);
        if !renovar && !conferir {
            return [self.renovar_em, self.conferir_o_uso_em]
                .into_iter()
                .flatten()
                .map(|em| em - agora)
                .min()
                .unwrap_or(UM_MINUTO);
        }
        match self.servico.pedir(&Pedido::Renovar {
            token: sessao.token.into(),
        }) {
            Ok(Resposta::Renovada { .. }) => {
                self.renovar_em = Some(agora + RENOVAR_A_CADA);
                if conferir {
                    // A API contou um uso que a aba não viu: confere de novo daqui a 1 minuto.
                    self.conferir_o_uso_em = Some(agora + UM_MINUTO);
                }
                UM_MINUTO
            }
            Ok(Resposta::Recusa(recusa)) => {
                self.recusa_pela_senha(&recusa);
                UM_MINUTO
            }
            Ok(Resposta::Aparelho(aparelho)) => {
                self.do_aparelho(&aparelho);
                UM_MINUTO
            }
            _ => UM_MINUTO,
        }
    }

    /// A sessão pela senha recusada na renovação ou no uso: de volta ao formulário.
    fn recusa_pela_senha(&mut self, recusa: &Recusa) {
        let erro = match recusa.codigo.as_deref() {
            // Os 30 minutos sem uso, o "Sair" de outro lugar e a vencida.
            Some("sessao-da-aba-recusada") => None,
            Some("pessoa-recusada-na-aba") => match recusa.motivo.as_deref() {
                // A rede da TI volta sozinha: a sessão vale até vencer.
                Some("ti-fora-do-alcance") => return,
                // O usuário apagado ou renomeado no AD: a frase dele é a de quem entra pelo Windows.
                Some("usuario-de-fora") => None,
                _ => recusa.detalhe.clone(),
            },
            Some("aparelho-da-aba-bloqueado" | "entrada-do-aparelho-diferente") => {
                // Do computador: o passo seguinte mostra a situação do serviço.
                self.esquecer();
                self.formulario = None;
                return;
            }
            // A rede e o resto: a sessão vale até vencer.
            _ => return,
        };
        self.esquecer();
        self.formulario = Some(Formulario {
            erro,
            ..Formulario::senha()
        });
    }

    fn no_formulario(&self) -> bool {
        self.entrada == Some(Entrada::Senha) && self.atual.is_none() && self.formulario.is_some()
    }

    /// O usuário e a senha do formulário. Devolve quando dar o passo seguinte, se antes do que ele
    /// já esperava.
    pub fn entrar(&mut self, usuario: &str, senha: &str, agora: Instant) -> Option<Duration> {
        if !self.no_formulario() || self.esperando(agora) {
            return None;
        }
        self.pendente = None;
        let resposta = self.servico.pedir(&Pedido::SessaoPelaSenha {
            usuario: usuario.to_owned(),
            senha: senha.into(),
        });
        self.da_entrada(resposta, Passo::Senha, agora)
    }

    /// O código do app, com a pendente da primeira chamada.
    pub fn enviar_o_codigo(&mut self, codigo: &str, agora: Instant) -> Option<Duration> {
        if !self.no_formulario() || self.esperando(agora) {
            return None;
        }
        let Some(pendente) = self.pendente.clone() else {
            self.recomecar_a_entrada();
            return None;
        };
        let resposta = self.servico.pedir(&Pedido::Codigo {
            pendente,
            codigo: codigo.into(),
        });
        self.da_entrada(resposta, Passo::Codigo, agora)
    }

    /// Do passo do código de volta ao do usuário e da senha, com a espera que houver.
    pub fn recomecar_a_entrada(&mut self) {
        if !self.no_formulario() {
            return;
        }
        self.pendente = None;
        let espera_ate = self
            .formulario
            .as_ref()
            .and_then(|formulario| formulario.espera_ate.clone());
        self.formulario = Some(Formulario {
            espera_ate,
            ..Formulario::senha()
        });
    }

    fn esperando(&mut self, agora: Instant) -> bool {
        if self.esperar_ate.is_some_and(|ate| agora >= ate) {
            self.esperar_ate = None;
        }
        self.esperar_ate.is_some()
    }

    fn da_entrada(
        &mut self,
        resposta: Result<Resposta, String>,
        passo: Passo,
        agora: Instant,
    ) -> Option<Duration> {
        match resposta {
            Ok(Resposta::Sessao { token, nome, .. }) => {
                let servidor = self.servidor.clone()?;
                // Ao abrir: nada de quem esteve antes no chat.
                self.cofre.apagar_os_dados_do_chat();
                self.atual = Some(SessaoGuardada {
                    servidor,
                    token: token.expor().to_owned(),
                    nome: nome.clone(),
                });
                self.pela_senha = true;
                self.nome = Some(nome);
                self.formulario = None;
                self.pendente = None;
                self.motivo = None;
                self.renovar_em = Some(agora + RENOVAR_A_CADA);
                self.uso_em = Some(agora);
                self.conferir_o_uso_em = Some(agora + SEM_USO);
                None
            }
            Ok(Resposta::FaltaOCodigo { pendente, .. }) => {
                self.pendente = Some(pendente);
                self.formulario = Some(Formulario {
                    passo: Passo::Codigo,
                    ..Formulario::senha()
                });
                None
            }
            Ok(Resposta::Recusa(recusa)) => self.recusa_da_entrada(&recusa, passo, agora),
            Ok(Resposta::Aparelho(aparelho)) => {
                self.do_aparelho(&aparelho);
                Some(AO_MESMO_TEMPO)
            }
            _ => {
                self.no_passo(passo, Some(SEM_REDE.to_owned()), None);
                None
            }
        }
    }

    fn no_passo(&mut self, passo: Passo, erro: Option<String>, espera_ate: Option<String>) {
        if passo == Passo::Senha {
            self.pendente = None;
        }
        self.formulario = Some(Formulario {
            passo,
            erro,
            espera_ate,
        });
    }

    fn recusa_da_entrada(
        &mut self,
        recusa: &Recusa,
        passo: Passo,
        agora: Instant,
    ) -> Option<Duration> {
        let detalhe = recusa.detalhe.clone();
        match recusa.codigo.as_deref() {
            // A senha ou o código errados: de novo, no mesmo passo.
            Some("credenciais-invalidas" | "codigo-invalido") => {
                self.no_passo(passo, detalhe, None);
            }
            // A pendente que acabou: o usuário e a senha de novo.
            Some("tentativas-esgotadas" | "pendente-da-aba-recusada") => {
                self.no_passo(Passo::Senha, detalhe, None);
            }
            // O bloqueio do usuário, com o `retry-after`, e o do computador, com a espera no
            // `detail`: o "Entrar" volta no momento que a API deu.
            Some(codigo @ ("entrada-bloqueada" | "muitas-requisicoes")) => {
                let espera = espera_do_429(recusa);
                self.esperar_ate = Some(agora + espera);
                let passo = if codigo == "entrada-bloqueada" {
                    Passo::Senha
                } else {
                    passo
                };
                self.no_passo(passo, detalhe, Some(iso_utc(SystemTime::now() + espera)));
            }
            Some("pessoa-recusada-na-aba")
                if recusa.motivo.as_deref() == Some("usuario-de-fora") =>
            {
                self.no_passo(Passo::Senha, None, None);
            }
            // Do computador: o serviço mostra a situação no passo seguinte, que vem logo.
            Some("token-da-aba-recusado" | "aparelho-da-aba-bloqueado") => {
                self.formulario = None;
                self.pendente = None;
                self.motivo = detalhe;
                return Some(AO_MESMO_TEMPO);
            }
            Some("entrada-do-aparelho-diferente") => {
                self.formulario = None;
                self.pendente = None;
                return Some(AO_MESMO_TEMPO);
            }
            // A conta inativa, sem o grupo, sem o código cadastrado, e o resto que tem a frase.
            _ => {
                self.no_passo(
                    Passo::Senha,
                    Some(detalhe.unwrap_or_else(|| SEM_REDE.to_owned())),
                    None,
                );
            }
        }
        None
    }

    /// A aba ou a tela maior com o foco, na sessão pela senha: no máximo uma vez por minuto.
    pub fn uso(&mut self, agora: Instant) {
        if !self.pela_senha {
            return;
        }
        let Some(sessao) = self.atual.clone() else {
            return;
        };
        if self.uso_em.is_some_and(|em| agora < em + USO_A_CADA) {
            return;
        }
        match self.servico.pedir(&Pedido::Uso {
            token: sessao.token.into(),
        }) {
            Ok(Resposta::Feito) => {
                self.uso_em = Some(agora);
                self.conferir_o_uso_em = Some(agora + SEM_USO);
            }
            Ok(Resposta::Recusa(recusa)) => self.recusa_pela_senha(&recusa),
            // O serviço fora: o foco seguinte tenta de novo.
            _ => {}
        }
    }

    /// O "Sair", a tela bloqueada e a saída do Windows: a sessão pela senha termina no servidor, e
    /// a aba volta ao formulário. Sem o servidor, ela termina pelos 30 minutos sem uso.
    pub fn sair(&mut self) {
        if !self.pela_senha {
            return;
        }
        if let Some(sessao) = self.atual.clone() {
            let _ = self.servico.pedir(&Pedido::Sair {
                token: sessao.token.into(),
            });
        }
        self.esquecer();
        self.formulario = Some(Formulario::senha());
    }
}

fn espera_do_429(recusa: &Recusa) -> Duration {
    recusa
        .espera_em_segundos
        .map_or(UM_MINUTO, |segundos| Duration::from_secs(segundos.max(1)))
}

/// O momento em ISO 8601, em UTC e com os milissegundos, como a tela o lê.
pub fn iso_utc(momento: SystemTime) -> String {
    let desde = momento.duration_since(UNIX_EPOCH).unwrap_or_default();
    let segundos = desde.as_secs();
    let resto = segundos % 86_400;
    // Os dias desde 1970 no calendário civil (o `civil_from_days`, de Howard Hinnant).
    let dias = i64::try_from(segundos / 86_400).unwrap_or(0) + 719_468;
    let era = dias.div_euclid(146_097);
    let do_era = dias.rem_euclid(146_097);
    let ano_do_era = (do_era - do_era / 1_460 + do_era / 36_524 - do_era / 146_096) / 365;
    let dia_do_ano = do_era - (365 * ano_do_era + ano_do_era / 4 - ano_do_era / 100);
    let mes_de_marco = (5 * dia_do_ano + 2) / 153;
    let dia = dia_do_ano - (153 * mes_de_marco + 2) / 5 + 1;
    let mes = if mes_de_marco < 10 {
        mes_de_marco + 3
    } else {
        mes_de_marco - 9
    };
    let ano = ano_do_era + era * 400 + i64::from(mes <= 2);
    format!(
        "{ano:04}-{mes:02}-{dia:02}T{:02}:{:02}:{:02}.{:03}Z",
        resto / 3_600,
        resto % 3_600 / 60,
        resto % 60,
        desde.subsec_millis()
    )
}

/// O que a tela e o Windows pedem à linha da sessão. Sem o `Debug`: a senha vai aqui.
pub enum Acao {
    Entrar {
        usuario: String,
        senha: String,
    },
    Codigo(String),
    Recomecar,
    /// O "Sair", a tela bloqueada e a saída do Windows.
    Sair,
    Uso,
}

pub struct Comando {
    acao: Acao,
    /// Avisa quem pediu quando a linha terminou, para o "Entrando…" da tela durar o pedido.
    feito: Option<Sender<()>>,
}

/// A entrada da linha da sessão, que a tela e a janela da aba usam.
pub struct Comandos(Sender<Comando>);

impl Comandos {
    pub fn nova() -> (Self, Receiver<Comando>) {
        let (enviar, receber) = mpsc::channel();
        (Self(enviar), receber)
    }

    pub fn enviar(&self, acao: Acao) {
        let _ = self.0.send(Comando { acao, feito: None });
    }

    /// Envia e espera a linha terminar, até o prazo.
    pub fn esperar(&self, acao: Acao, prazo: Duration) {
        let (feito, terminou) = mpsc::channel();
        if self
            .0
            .send(Comando {
                acao,
                feito: Some(feito),
            })
            .is_ok()
        {
            let _ = terminou.recv_timeout(prazo);
        }
    }

    pub fn copia(&self) -> Sender<Comando> {
        self.0.clone()
    }
}

/// O pipe leva até 5 s em cada sentido, e a API, até 30 s.
const PRAZO_DO_PEDIDO: Duration = Duration::from_secs(40);

async fn pedir_e_esperar(app: tauri::AppHandle, acao: Acao) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        app.state::<Comandos>().esperar(acao, PRAZO_DO_PEDIDO);
    })
    .await;
}

#[tauri::command]
pub async fn entrar(app: tauri::AppHandle, usuario: String, senha: String) {
    pedir_e_esperar(app, Acao::Entrar { usuario, senha }).await;
}

#[tauri::command]
pub async fn enviar_o_codigo(app: tauri::AppHandle, codigo: String) {
    pedir_e_esperar(app, Acao::Codigo(codigo)).await;
}

#[tauri::command]
pub async fn recomecar_a_entrada(app: tauri::AppHandle) {
    pedir_e_esperar(app, Acao::Recomecar).await;
}

#[tauri::command]
pub async fn sair(app: tauri::AppHandle) {
    pedir_e_esperar(app, Acao::Sair).await;
}

/// Uma janela nossa ganhou o foco: é o uso da sessão pela senha.
pub fn usar(app: &tauri::AppHandle) {
    if let Some(comandos) = app.try_state::<Comandos>() {
        comandos.enviar(Acao::Uso);
    }
}

/// O serviço de verdade, pelo pipe conferido: uma conexão por pedido.
#[cfg(windows)]
pub struct ServicoPeloPipe;

#[cfg(windows)]
impl Servico for ServicoPeloPipe {
    fn pedir(&self, pedido: &Pedido) -> Result<Resposta, String> {
        let cliente = grafite_aba_pipe::Cliente::abrir().map_err(|erro| erro.to_string())?;
        let mensagem = serde_json::to_vec(pedido).map_err(|erro| erro.to_string())?;
        let resposta = cliente.pedir(&mensagem).map_err(|erro| erro.to_string())?;
        serde_json::from_slice(&resposta).map_err(|erro| erro.to_string())
    }
}

/// O cofre da pessoa e os dados do WebView2, onde o chat guarda os cookies e o armazenamento. As
/// janelas da aba usam o mesmo perfil, e apagar por uma apaga o do chat.
#[cfg(windows)]
struct DaPessoa {
    cofre: crate::cofre::CofreDaPessoa,
    app: tauri::AppHandle,
}

#[cfg(windows)]
impl Cofre for DaPessoa {
    fn ler(&self) -> Option<SessaoGuardada> {
        self.cofre.ler()
    }

    fn gravar(&self, sessao: &SessaoGuardada) -> io::Result<()> {
        self.cofre.gravar(sessao)
    }

    fn apagar(&self) {
        self.cofre.apagar();
    }

    fn apagar_os_dados_do_chat(&self) {
        for janela in self.app.webview_windows().values() {
            let _ = janela.clear_all_browsing_data();
        }
    }
}

/// O que a tela mostra da sessão.
fn publicar<S: Servico, C: Cofre>(app: &tauri::AppHandle, sessao: &Sessao<S, C>) {
    let pessoa = sessao.nome.clone().map(|nome| crate::estado::Pessoa {
        nome,
        pela_senha: sessao.pela_senha,
    });
    let sem_conexao = sessao
        .motivo
        .clone()
        .map(|motivo| crate::estado::SemConexao { motivo });
    let formulario = sessao.formulario.clone();
    crate::estado::mudar(app, |estado| {
        estado.pessoa = pessoa;
        estado.sem_conexao = sem_conexao;
        estado.formulario = formulario;
    });
}

/// A linha da sessão: os passos, de no máximo 1 minuto, para a situação do aparelho chegar à tela,
/// e entre eles o que a tela e o Windows pedem. A cada passo com uma janela nossa na frente, o uso.
#[cfg(windows)]
pub fn iniciar(app: tauri::AppHandle, comandos: Receiver<Comando>) {
    std::thread::spawn(move || {
        let mut sessao = Sessao::nova(
            ServicoPeloPipe,
            DaPessoa {
                cofre: crate::cofre::CofreDaPessoa::novo(),
                app: app.clone(),
            },
        );
        let mut proximo = Instant::now();
        loop {
            let agora = Instant::now();
            if agora >= proximo {
                proximo = agora + sessao.passo(agora).min(UM_MINUTO);
                if crate::foco::nossa_na_frente() {
                    sessao.uso(agora);
                }
            }
            publicar(&app, &sessao);
            let comando =
                match comandos.recv_timeout(proximo.saturating_duration_since(Instant::now())) {
                    Ok(comando) => comando,
                    Err(RecvTimeoutError::Timeout) => continue,
                    Err(RecvTimeoutError::Disconnected) => return,
                };
            let agora = Instant::now();
            let logo = match comando.acao {
                Acao::Entrar { usuario, senha } => sessao.entrar(&usuario, &senha, agora),
                Acao::Codigo(codigo) => sessao.enviar_o_codigo(&codigo, agora),
                Acao::Recomecar => {
                    sessao.recomecar_a_entrada();
                    None
                }
                Acao::Sair => {
                    sessao.sair();
                    None
                }
                Acao::Uso => {
                    sessao.uso(agora);
                    None
                }
            };
            if let Some(espera) = logo {
                proximo = proximo.min(agora + espera);
            }
            publicar(&app, &sessao);
            if let Some(feito) = comando.feito {
                let _ = feito.send(());
            }
        }
    });
}

/// A tela bloqueada e a saída do Windows terminam a sessão pela senha.
#[cfg(windows)]
pub fn ouvir_os_fins(janela: &tauri::WebviewWindow, comandos: Sender<Comando>) {
    nativo::ouvir_os_fins(janela, comandos);
}

#[cfg(windows)]
mod nativo {
    use std::sync::mpsc::{self, Sender};
    use std::time::Duration;

    use tauri::WebviewWindow;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::RemoteDesktop::{
        NOTIFY_FOR_THIS_SESSION, WTSRegisterSessionNotification,
    };
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::{WM_ENDSESSION, WM_WTSSESSION_CHANGE};

    use super::{Acao, Comando};

    /// O identificador do subclass dos fins, outro que o da janela.
    const DOS_FINS: usize = 0x6772_6167;
    const WTS_SESSION_LOGOFF: usize = 0x6;
    const WTS_SESSION_LOCK: usize = 0x7;
    /// O Windows dá uns 5 s aos programas na saída: o "Sair" vai antes de ele fechar a aba.
    const PRAZO_DA_SAIDA: Duration = Duration::from_secs(4);

    unsafe extern "system" fn ao_receber(
        janela: HWND,
        mensagem: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        dados: usize,
    ) -> LRESULT {
        // SAFETY: `dados` é o `Sender` que `ouvir_os_fins` deixou para a vida do programa.
        let comandos = unsafe { &*(dados as *const Sender<Comando>) };
        match mensagem {
            WM_WTSSESSION_CHANGE if matches!(wparam.0, WTS_SESSION_LOCK | WTS_SESSION_LOGOFF) => {
                let _ = comandos.send(Comando {
                    acao: Acao::Sair,
                    feito: None,
                });
            }
            // A saída do Windows de verdade: espera o "Sair" chegar ao servidor.
            WM_ENDSESSION if wparam.0 != 0 => {
                let (feito, terminou) = mpsc::channel();
                if comandos
                    .send(Comando {
                        acao: Acao::Sair,
                        feito: Some(feito),
                    })
                    .is_ok()
                {
                    let _ = terminou.recv_timeout(PRAZO_DA_SAIDA);
                }
            }
            _ => {}
        }
        // SAFETY: a mensagem segue para a janela como chegou.
        unsafe { DefSubclassProc(janela, mensagem, wparam, lparam) }
    }

    pub fn ouvir_os_fins(janela: &WebviewWindow, comandos: Sender<Comando>) {
        let Ok(hwnd) = janela.hwnd() else {
            return;
        };
        // Os dados nunca são soltos: a janela da aba vive com o programa.
        let dados = Box::into_raw(Box::new(comandos)) as usize;
        // SAFETY: a janela é nossa; o aviso da sessão do Windows chega a ela enquanto ela vive.
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(ao_receber), DOS_FINS, dados);
            let _ = WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION);
        }
    }
}

#[cfg(test)]
mod testes {
    use std::cell::RefCell;
    use std::collections::VecDeque;

    use grafite_aba_pipe::{Configuracao, Forma};

    use super::*;

    const SERVIDOR: &str = "https://grafite.empresa.local";

    #[derive(Default)]
    struct ServicoFalso {
        respostas: RefCell<VecDeque<Resposta>>,
        pedidos: RefCell<Vec<Pedido>>,
        aparelho: RefCell<Option<Aparelho>>,
    }

    impl ServicoFalso {
        fn com(aparelho: Aparelho) -> Self {
            Self {
                aparelho: RefCell::new(Some(aparelho)),
                ..Self::default()
            }
        }

        fn depois(&self, resposta: Resposta) {
            self.respostas.borrow_mut().push_back(resposta);
        }

        fn da_sessao(&self) -> Vec<Pedido> {
            self.pedidos
                .borrow()
                .iter()
                .filter(|pedido| **pedido != Pedido::Aparelho)
                .cloned()
                .collect()
        }
    }

    impl Servico for &ServicoFalso {
        fn pedir(&self, pedido: &Pedido) -> Result<Resposta, String> {
            self.pedidos.borrow_mut().push(pedido.clone());
            if *pedido == Pedido::Aparelho {
                return self
                    .aparelho
                    .borrow()
                    .clone()
                    .map(Resposta::Aparelho)
                    .ok_or_else(|| "sem o serviço".to_owned());
            }
            self.respostas
                .borrow_mut()
                .pop_front()
                .ok_or_else(|| "sem resposta".to_owned())
        }
    }

    #[derive(Default)]
    struct CofreFalso {
        guardada: RefCell<Option<SessaoGuardada>>,
        chat_apagado: RefCell<u32>,
    }

    impl Cofre for &CofreFalso {
        fn ler(&self) -> Option<SessaoGuardada> {
            self.guardada.borrow().clone()
        }

        fn gravar(&self, sessao: &SessaoGuardada) -> io::Result<()> {
            *self.guardada.borrow_mut() = Some(sessao.clone());
            Ok(())
        }

        fn apagar(&self) {
            *self.guardada.borrow_mut() = None;
        }

        fn apagar_os_dados_do_chat(&self) {
            *self.chat_apagado.borrow_mut() += 1;
        }
    }

    fn registrado(entrada: Entrada) -> Aparelho {
        Aparelho {
            servidor: Some(SERVIDOR.into()),
            situacao: Situacao::Registrada,
            motivo: None,
            configuracao: Some(Configuracao {
                forma: Forma::Pilula,
                contato: None,
                entrada,
                versao: 1,
            }),
        }
    }

    fn sessao(token: &str) -> Resposta {
        Resposta::Sessao {
            token: token.into(),
            expira_em: "2026-11-28T04:00:00.000Z".into(),
            nome: "Fernanda Lima".into(),
        }
    }

    fn recusa(codigo: &str) -> Recusa {
        Recusa {
            status: 401,
            codigo: Some(codigo.into()),
            detalhe: None,
            motivo: None,
            motivo_do_fim: None,
            espera_em_segundos: None,
        }
    }

    fn guardada(token: &str) -> SessaoGuardada {
        SessaoGuardada {
            servidor: SERVIDOR.into(),
            token: token.into(),
            nome: "Fernanda Lima".into(),
        }
    }

    #[test]
    fn sem_o_servico_a_aba_nao_foi_configurada() {
        let servico = ServicoFalso::default();
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), UM_MINUTO);
        assert_eq!(aba.motivo.as_deref(), Some(NAO_CONFIGURADA));
    }

    #[test]
    fn o_aparelho_sem_registro_mostra_o_motivo_do_servico() {
        let servico = ServicoFalso::com(Aparelho {
            situacao: Situacao::RegistrarDeNovo,
            motivo: Some("Este computador precisa ser registrado de novo. Fale com a TI.".into()),
            ..registrado(Entrada::Windows)
        });
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.passo(Instant::now());
        assert_eq!(
            aba.motivo.as_deref(),
            Some("Este computador precisa ser registrado de novo. Fale com a TI.")
        );
        assert!(servico.da_sessao().is_empty());
    }

    #[test]
    fn a_sessao_aberta_fica_no_disco_e_renova_em_50_minutos() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(sessao("tok_1"));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        assert_eq!(aba.passo(agora), RENOVAR_A_CADA);
        assert_eq!(aba.nome.as_deref(), Some("Fernanda Lima"));
        assert_eq!(aba.motivo, None);
        assert_eq!(cofre.guardada.borrow().as_ref(), Some(&guardada("tok_1")));
        // Antes dos 50 minutos, só a situação do aparelho.
        aba.passo(agora + Duration::from_secs(60));
        assert_eq!(servico.da_sessao(), [Pedido::SessaoPeloWindows]);
        servico.depois(Resposta::Renovada {
            expira_em: "2026-11-28T05:00:00.000Z".into(),
        });
        assert_eq!(aba.passo(agora + RENOVAR_A_CADA), RENOVAR_A_CADA);
        assert_eq!(
            servico.da_sessao(),
            [
                Pedido::SessaoPeloWindows,
                Pedido::Renovar {
                    token: "tok_1".into()
                }
            ]
        );
    }

    #[test]
    fn a_sessao_guardada_e_conferida_pela_renovacao() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Renovada {
            expira_em: "2026-11-28T05:00:00.000Z".into(),
        });
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_guardado"));
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.passo(Instant::now());
        assert_eq!(
            servico.da_sessao(),
            [Pedido::Renovar {
                token: "tok_guardado".into()
            }]
        );
        assert_eq!(aba.nome.as_deref(), Some("Fernanda Lima"));
    }

    #[test]
    fn a_sessao_de_outro_servidor_nao_vai_ao_novo() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(sessao("tok_novo"));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(SessaoGuardada {
            servidor: "https://outro.empresa.local".into(),
            ..guardada("tok_velho")
        });
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.passo(Instant::now());
        assert_eq!(servico.da_sessao(), [Pedido::SessaoPeloWindows]);
        assert_eq!(
            cofre.guardada.borrow().as_ref(),
            Some(&guardada("tok_novo"))
        );
    }

    #[test]
    fn a_sessao_vencida_abre_outra_na_hora() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(recusa("sessao-da-aba-recusada")));
        servico.depois(sessao("tok_2"));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_1"));
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        assert_eq!(aba.passo(agora), Duration::ZERO);
        assert_eq!(aba.passo(agora), RENOVAR_A_CADA);
        assert_eq!(cofre.guardada.borrow().as_ref(), Some(&guardada("tok_2")));
    }

    #[test]
    fn a_sessao_derrubada_por_outra_do_windows_espera_a_pessoa() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(Recusa {
            motivo_do_fim: Some("outra-sessao-no-aparelho".into()),
            ..recusa("sessao-da-aba-recusada")
        }));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_1"));
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        aba.passo(agora);
        assert_eq!(aba.motivo.as_deref(), Some(OUTRA_SESSAO_DO_WINDOWS));
        assert_eq!(aba.nome, None);
        aba.passo(agora + RECUSA_DA_PESSOA);
        assert_eq!(servico.da_sessao().len(), 1, "sem pedir outra sozinha");
    }

    #[test]
    fn a_pessoa_recusada_tenta_de_novo_a_cada_10_minutos() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(Recusa {
            status: 403,
            detalhe: Some("Sua conta está inativa no Grafite. Fale com a TI.".into()),
            motivo: Some("conta-inativa".into()),
            ..recusa("pessoa-recusada-na-aba")
        }));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        assert_eq!(aba.passo(agora), RECUSA_DA_PESSOA);
        assert_eq!(
            aba.motivo.as_deref(),
            Some("Sua conta está inativa no Grafite. Fale com a TI.")
        );
        aba.passo(agora + Duration::from_secs(5 * 60));
        assert_eq!(servico.da_sessao().len(), 1);
        servico.depois(sessao("tok_1"));
        aba.passo(agora + RECUSA_DA_PESSOA);
        assert_eq!(servico.da_sessao().len(), 2);
        assert_eq!(aba.motivo, None);
    }

    #[test]
    fn a_ti_fora_do_alcance_tenta_em_30_s_e_nao_derruba_a_sessao() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        let fora = Recusa {
            status: 503,
            detalhe: Some("A TI não está ao alcance agora.".into()),
            motivo: Some("ti-fora-do-alcance".into()),
            ..recusa("pessoa-recusada-na-aba")
        };
        servico.depois(Resposta::Recusa(fora.clone()));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), TI_FORA_DO_ALCANCE);

        // Na renovação, a sessão segue.
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(fora));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_1"));
        let mut aba = Sessao::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), UM_MINUTO);
        assert_eq!(aba.nome.as_deref(), Some("Fernanda Lima"));
        assert!(cofre.guardada.borrow().is_some());
    }

    #[test]
    fn a_pessoa_que_nao_passa_mais_na_renovacao_perde_a_sessao() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(Recusa {
            status: 403,
            detalhe: Some("Entre no Windows com o seu usuário da empresa para usar a aba.".into()),
            motivo: Some("usuario-de-fora".into()),
            ..recusa("pessoa-recusada-na-aba")
        }));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_1"));
        let mut aba = Sessao::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), RECUSA_DA_PESSOA);
        assert_eq!(aba.nome, None);
        assert_eq!(*cofre.guardada.borrow(), None);
    }

    #[test]
    fn o_aparelho_bloqueado_esquece_a_sessao() {
        let servico = ServicoFalso::com(Aparelho {
            situacao: Situacao::Bloqueada,
            motivo: Some("Este computador foi bloqueado na aba. Fale com a TI.".into()),
            ..registrado(Entrada::Windows)
        });
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_1"));
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.lida_do_disco = false;
        aba.passo(Instant::now());
        assert!(servico.da_sessao().is_empty());
        assert_eq!(
            aba.motivo.as_deref(),
            Some("Este computador foi bloqueado na aba. Fale com a TI.")
        );
    }

    #[test]
    fn a_entrada_pela_senha_nao_pede_a_sessao_pelo_windows() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.passo(Instant::now());
        assert!(servico.da_sessao().is_empty());
    }

    #[test]
    fn o_429_espera_o_que_a_api_diz() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(Recusa {
            status: 429,
            espera_em_segundos: Some(12),
            ..recusa("muitas-requisicoes")
        }));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), Duration::from_secs(12));
    }

    #[test]
    fn sem_a_api_a_aba_fica_sem_conexao() {
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(Recusa {
            status: 0,
            codigo: None,
            ..recusa("")
        }));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), SEM_REDE_DE_NOVO);
        assert_eq!(aba.motivo.as_deref(), Some(SEM_REDE));
    }

    fn senha_aberta(
        aba: &mut Sessao<&ServicoFalso, &CofreFalso>,
        servico: &ServicoFalso,
        agora: Instant,
    ) {
        aba.passo(agora);
        servico.depois(Resposta::Sessao {
            token: "tok_da_carla".into(),
            expira_em: "2026-11-28T04:00:00.000Z".into(),
            nome: "Carla Dias".into(),
        });
        aba.entrar("carla.dias", "aba123", agora);
    }

    #[test]
    fn a_entrada_pela_senha_abre_o_formulario_e_apaga_o_que_era_da_pessoa() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_do_windows"));
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.passo(Instant::now());
        assert_eq!(aba.formulario, Some(Formulario::senha()));
        assert_eq!(
            *cofre.guardada.borrow(),
            None,
            "nada da sessão do Windows fica"
        );
        assert_eq!(*cofre.chat_apagado.borrow(), 1, "nem os dados do chat");
        assert!(servico.da_sessao().is_empty());
    }

    #[test]
    fn a_senha_e_o_codigo_abrem_a_sessao_so_na_memoria() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        aba.passo(agora);
        servico.depois(Resposta::FaltaOCodigo {
            pendente: "pend".into(),
            expira_em: "2026-11-28T04:05:00.000Z".into(),
        });
        aba.entrar("carla.dias", "aba123", agora);
        assert_eq!(
            aba.formulario.as_ref().map(|formulario| formulario.passo),
            Some(Passo::Codigo)
        );
        servico.depois(Resposta::Sessao {
            token: "tok_da_carla".into(),
            expira_em: "2026-11-28T04:00:00.000Z".into(),
            nome: "Carla Dias".into(),
        });
        aba.enviar_o_codigo("123456", agora);
        assert_eq!(aba.formulario, None);
        assert_eq!(aba.nome.as_deref(), Some("Carla Dias"));
        assert!(aba.pela_senha);
        assert_eq!(*cofre.guardada.borrow(), None, "o token não vai ao disco");
        assert_eq!(
            *cofre.chat_apagado.borrow(),
            2,
            "o chat limpo ao abrir a sessão"
        );
        assert_eq!(
            servico.da_sessao(),
            [
                Pedido::SessaoPelaSenha {
                    usuario: "carla.dias".into(),
                    senha: "aba123".into()
                },
                Pedido::Codigo {
                    pendente: "pend".into(),
                    codigo: "123456".into()
                }
            ]
        );
    }

    #[test]
    fn a_senha_errada_volta_ao_formulario_com_a_recusa() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        aba.passo(agora);
        servico.depois(Resposta::Recusa(Recusa {
            detalhe: Some("Usuário ou senha incorretos.".into()),
            ..recusa("credenciais-invalidas")
        }));
        aba.entrar("carla.dias", "errada", agora);
        assert_eq!(
            aba.formulario,
            Some(Formulario {
                passo: Passo::Senha,
                erro: Some("Usuário ou senha incorretos.".into()),
                espera_ate: None,
            })
        );
        // A senha errada de alguém não é do computador.
        aba.passo(agora + UM_MINUTO);
        assert_eq!(aba.motivo, None);
    }

    #[test]
    fn os_dois_429_esperam_no_formulario() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        aba.passo(agora);
        servico.depois(Resposta::Recusa(Recusa {
            status: 429,
            detalhe: Some("Entrada bloqueada por 15 minutos.".into()),
            espera_em_segundos: Some(900),
            ..recusa("entrada-bloqueada")
        }));
        aba.entrar("carla.dias", "errada", agora);
        let formulario = aba.formulario.clone().expect("o formulário");
        assert_eq!(
            formulario.erro.as_deref(),
            Some("Entrada bloqueada por 15 minutos.")
        );
        assert!(formulario.espera_ate.is_some_and(|ate| ate.ends_with('Z')));
        // Na espera, o "Entrar" não vai ao serviço.
        aba.entrar("carla.dias", "outra", agora + Duration::from_secs(60));
        assert_eq!(servico.da_sessao().len(), 1);

        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let mut aba = Sessao::nova(&servico, &cofre);
        aba.passo(agora);
        servico.depois(Resposta::Recusa(Recusa {
            status: 429,
            detalhe: Some("Muitas requisições. Tente de novo em 20 s.".into()),
            espera_em_segundos: Some(20),
            ..recusa("muitas-requisicoes")
        }));
        aba.entrar("carla.dias", "aba123", agora);
        assert!(
            aba.formulario
                .as_ref()
                .is_some_and(|formulario| formulario.espera_ate.is_some())
        );
        aba.entrar("carla.dias", "aba123", agora + Duration::from_secs(21));
        assert_eq!(servico.da_sessao().len(), 2, "passada a espera, entra");
    }

    #[test]
    fn o_sair_termina_no_servidor_e_limpa_o_chat() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        let chat_antes = *cofre.chat_apagado.borrow();
        servico.depois(Resposta::Feito);
        aba.sair();
        assert_eq!(
            servico.da_sessao().last(),
            Some(&Pedido::Sair {
                token: "tok_da_carla".into()
            })
        );
        assert_eq!(aba.nome, None);
        assert_eq!(aba.formulario, Some(Formulario::senha()));
        assert_eq!(*cofre.chat_apagado.borrow(), chat_antes + 1);
    }

    #[test]
    fn o_uso_vai_no_maximo_uma_vez_por_minuto() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        aba.uso(agora + Duration::from_secs(30));
        let usos = || {
            servico
                .da_sessao()
                .iter()
                .filter(|pedido| matches!(pedido, Pedido::Uso { .. }))
                .count()
        };
        assert_eq!(usos(), 0);
        servico.depois(Resposta::Feito);
        aba.uso(agora + USO_A_CADA);
        assert_eq!(usos(), 1);
        aba.uso(agora + USO_A_CADA + Duration::from_secs(10));
        assert_eq!(usos(), 1);
    }

    #[test]
    fn os_30_minutos_sem_uso_voltam_ao_formulario() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        servico.depois(Resposta::Recusa(Recusa {
            motivo_do_fim: Some("sem-uso".into()),
            ..recusa("sessao-da-aba-recusada")
        }));
        aba.passo(agora + RENOVAR_A_CADA);
        assert_eq!(aba.nome, None);
        assert_eq!(aba.formulario, Some(Formulario::senha()));
    }

    #[test]
    fn o_usuario_de_fora_volta_ao_formulario_sem_a_frase_do_windows() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        servico.depois(Resposta::Recusa(Recusa {
            status: 403,
            detalhe: Some("Entre no Windows com o seu usuário da empresa para usar a aba.".into()),
            motivo: Some("usuario-de-fora".into()),
            ..recusa("pessoa-recusada-na-aba")
        }));
        aba.passo(agora + RENOVAR_A_CADA);
        assert_eq!(aba.formulario, Some(Formulario::senha()));
        assert_eq!(aba.motivo, None);
    }

    #[test]
    fn a_conta_inativa_volta_ao_formulario_com_a_frase() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        servico.depois(Resposta::Recusa(Recusa {
            status: 403,
            detalhe: Some("Sua conta está inativa no Grafite. Fale com a TI.".into()),
            motivo: Some("conta-inativa".into()),
            ..recusa("pessoa-recusada-na-aba")
        }));
        aba.passo(agora + RENOVAR_A_CADA);
        assert_eq!(
            aba.formulario
                .and_then(|formulario| formulario.erro)
                .as_deref(),
            Some("Sua conta está inativa no Grafite. Fale com a TI.")
        );
    }

    #[test]
    fn sem_uso_a_aba_confere_a_sessao_aos_30_minutos() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        aba.passo(agora + Duration::from_secs(29 * 60));
        assert_eq!(servico.da_sessao().len(), 1, "antes dos 30 minutos, nada");
        servico.depois(Resposta::Recusa(Recusa {
            motivo_do_fim: Some("sem-uso".into()),
            ..recusa("sessao-da-aba-recusada")
        }));
        aba.passo(agora + SEM_USO);
        assert_eq!(
            servico.da_sessao().last(),
            Some(&Pedido::Renovar {
                token: "tok_da_carla".into()
            })
        );
        assert_eq!(aba.formulario, Some(Formulario::senha()));
    }

    #[test]
    fn a_troca_para_o_windows_esquece_a_pessoa_da_senha() {
        let servico = ServicoFalso::com(registrado(Entrada::Senha));
        let cofre = CofreFalso::default();
        let mut aba = Sessao::nova(&servico, &cofre);
        let agora = Instant::now();
        senha_aberta(&mut aba, &servico, agora);
        let chat_antes = *cofre.chat_apagado.borrow();
        *servico.aparelho.borrow_mut() = Some(registrado(Entrada::Windows));
        servico.depois(sessao("tok_do_windows"));
        aba.passo(agora + UM_MINUTO);
        assert_eq!(*cofre.chat_apagado.borrow(), chat_antes + 1);
        assert_eq!(aba.formulario, None);
        assert!(!aba.pela_senha);
        assert_eq!(aba.nome.as_deref(), Some("Fernanda Lima"));
    }

    #[test]
    fn o_momento_em_iso() {
        assert_eq!(iso_utc(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            iso_utc(UNIX_EPOCH + Duration::from_millis(1_795_835_106_250)),
            "2026-11-28T03:05:06.250Z"
        );
    }
}
