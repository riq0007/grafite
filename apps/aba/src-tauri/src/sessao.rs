//! A sessão pelo Windows (spec "Pessoa pelo usuário do Windows" e "Sessão da aba"; design, decisões
//! 1, 2 e 4): a aba pede a sessão ao serviço pelo pipe, e o serviço a pede à API com o SID que o
//! Windows lhe dá. O token fica com a aba, na memória e cifrado pelo DPAPI da pessoa, e a renovação
//! vai pelo serviço a cada 50 minutos, antes de a hora da sessão acabar, sem a pessoa ver.
//!
//! A aba decide pelo código do problema, e não pelo status:
//! - a pessoa recusada fica sem conexão com a frase do motivo e tenta de novo a cada 10 minutos; a
//!   TI fora do alcance tenta em 30 s, e na renovação não derruba a sessão, que vale até vencer;
//! - a sessão recusada na renovação abre outra na hora, fora a encerrada por outra sessão do
//!   Windows com a mesma conta, que espera a pessoa entrar no Windows de novo;
//! - o token do aparelho recusado e o bloqueio são do computador: o serviço os mostra no pedido
//!   seguinte da situação do aparelho.

use std::io;
use std::time::{Duration, Instant};

use grafite_aba_pipe::{Aparelho, Entrada, Pedido, Recusa, Resposta, Situacao};

use crate::cofre::SessaoGuardada;

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
const AO_MESMO_TEMPO: Duration = Duration::from_secs(5);

/// O serviço do outro lado do pipe.
pub trait Servico {
    fn pedir(&self, pedido: &Pedido) -> Result<Resposta, String>;
}

/// O token da pessoa no disco.
pub trait Cofre {
    fn ler(&self) -> Option<SessaoGuardada>;
    fn gravar(&self, sessao: &SessaoGuardada) -> io::Result<()>;
    fn apagar(&self);
}

pub struct SessaoPeloWindows<S, C> {
    servico: S,
    cofre: C,
    atual: Option<SessaoGuardada>,
    lida_do_disco: bool,
    renovar_em: Option<Instant>,
    tentar_em: Option<Instant>,
    /// A sessão encerrada por outra sessão do Windows: só a pessoa a traz de volta.
    parada: bool,
    /// Quem está na aba.
    pub nome: Option<String>,
    /// O motivo da aba sem conexão.
    pub motivo: Option<String>,
}

impl<S: Servico, C: Cofre> SessaoPeloWindows<S, C> {
    pub fn nova(servico: S, cofre: C) -> Self {
        Self {
            servico,
            cofre,
            atual: None,
            lida_do_disco: false,
            renovar_em: None,
            tentar_em: None,
            parada: false,
            nome: None,
            motivo: None,
        }
    }

    /// O token da sessão que vale agora, para os pedidos da aba à API.
    #[allow(dead_code, reason = "os pedidos da aba à API entram na tarefa 5.14")]
    pub fn atual(&self) -> Option<&SessaoGuardada> {
        self.atual.as_ref()
    }

    fn esquecer(&mut self) {
        if self.atual.take().is_some() {
            self.cofre.apagar();
        }
        self.renovar_em = None;
        self.nome = None;
    }

    fn do_aparelho(&mut self, aparelho: &Aparelho) {
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
        // A entrada pela senha é do formulário (tarefa 5.13).
        if aparelho
            .configuracao
            .as_ref()
            .is_some_and(|configuracao| configuracao.entrada == Entrada::Senha)
        {
            self.esquecer();
            self.motivo = None;
            return UM_MINUTO;
        }
        if !self.lida_do_disco {
            self.lida_do_disco = true;
            if let Some(guardada) = self.cofre.ler() {
                self.nome = Some(guardada.nome.clone());
                self.atual = Some(guardada);
                // A guardada é conferida logo, pela renovação.
                self.renovar_em = Some(agora);
            }
        }
        if self
            .atual
            .as_ref()
            .is_some_and(|sessao| sessao.servidor != servidor)
        {
            self.esquecer();
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
                    token,
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
            token: sessao.token,
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
}

fn espera_do_429(recusa: &Recusa) -> Duration {
    recusa
        .espera_em_segundos
        .map_or(UM_MINUTO, |segundos| Duration::from_secs(segundos.max(1)))
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

/// A linha da sessão: um passo, o estado da tela, e a espera, de no máximo 1 minuto, para a
/// situação do aparelho chegar à tela.
#[cfg(windows)]
pub fn iniciar(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut sessao =
            SessaoPeloWindows::nova(ServicoPeloPipe, crate::cofre::CofreDaPessoa::novo());
        loop {
            let espera = sessao.passo(Instant::now());
            let nome = sessao.nome.clone();
            let motivo = sessao.motivo.clone();
            crate::estado::mudar(&app, |estado| {
                estado.pessoa = nome.map(|nome| crate::estado::Pessoa {
                    nome,
                    pela_senha: false,
                });
                estado.sem_conexao = motivo.map(|motivo| crate::estado::SemConexao { motivo });
            });
            std::thread::sleep(espera.min(UM_MINUTO));
        }
    });
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), TI_FORA_DO_ALCANCE);

        // Na renovação, a sessão segue.
        let servico = ServicoFalso::com(registrado(Entrada::Windows));
        servico.depois(Resposta::Recusa(fora));
        let cofre = CofreFalso::default();
        *cofre.guardada.borrow_mut() = Some(guardada("tok_1"));
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
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
        let mut aba = SessaoPeloWindows::nova(&servico, &cofre);
        assert_eq!(aba.passo(Instant::now()), SEM_REDE_DE_NOVO);
        assert_eq!(aba.motivo.as_deref(), Some(SEM_REDE));
    }
}
