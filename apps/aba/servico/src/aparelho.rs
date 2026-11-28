//! O aparelho do lado do serviço: o registro com a chave, o contato com o token e a configuração
//! guardada (spec "Aparelho registrado pela chave" e "Configuração da aba"; design, decisões 2, 3 e
//! 12). Um passo por vez, numa linha só: o registro é um por vez.
//!
//! - A chave do `HKLM` é lida a cada passo, e o registro vai com ela sempre que não há um token que
//!   valha. A chave é apagada só depois de um contato com o token dar certo, e de o token estar no
//!   disco: o serviço que reinicia antes disso ainda tem a chave.
//! - O 429 do registro é "tentar depois", e não a chave recusada.
//! - O token recusado volta à API a cada 10 minutos, como a recusa da pessoa, e a chave nova no
//!   registro do Windows registra de novo no passo seguinte.
//! - A decisão é pelo `type` do problema (`problema::decidir`).

use std::io;
use std::time::{Duration, Instant};

use grafite_aba_pipe::{Aparelho, Configuracao, Entrada, Forma, Situacao};
use serde::{Deserialize, Serialize};

use crate::cofre::Guardado;
use crate::computador::{Computador, nome_no_cabecalho};
use crate::instalacao::{Instalacao, endereco_valido};
use crate::log;
use crate::problema::Decisao;
use crate::segredo::Segredo;

pub const VERSAO: &str = env!("CARGO_PKG_VERSION");

pub const SEM_CONFIGURACAO: &str = "A aba não foi configurada. Fale com a TI.";
pub const REGISTRAR_DE_NOVO: &str =
    "Este computador precisa ser registrado de novo. Fale com a TI.";
pub const BLOQUEADO: &str = "Este computador foi bloqueado na aba. Fale com a TI.";
pub const SEM_CONEXAO: &str = "Sem conexão com o Grafite.";

pub const UM_MINUTO: Duration = Duration::from_secs(60);
pub const DEZ_MINUTOS: Duration = Duration::from_secs(600);
/// O `proximaEm` da API, dentro de limites que não deixem o serviço parado nem insistente.
const MENOR_INTERVALO: u64 = 10;
const MAIOR_INTERVALO: u64 = 3_600;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PedidoDeRegistro<'a> {
    pub chave: &'a Segredo,
    pub identificador_da_maquina: &'a str,
    pub nome: &'a str,
    pub versao: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entrada_sugerida: Option<Entrada>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registro {
    pub token: Segredo,
    pub entrada: Entrada,
    pub identificador_curto: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RespostaDaConfiguracao {
    pub forma: Forma,
    pub contato: Option<String>,
    pub entrada: Entrada,
    pub versao: i64,
    pub proxima_em: u64,
}

/// A configuração guardada no disco, com o servidor que a deu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguracaoGuardada {
    pub servidor: String,
    #[serde(flatten)]
    pub configuracao: Configuracao,
}

/// Uma resposta que não deu certo: a decisão, a frase do `detail` e o que vai ao log.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Falha {
    pub decisao: Decisao,
    pub detalhe: Option<String>,
    pub para_o_log: String,
}

pub trait Api {
    fn registrar(
        &self,
        servidor: &str,
        pedido: &PedidoDeRegistro<'_>,
        computador: Option<&str>,
    ) -> Result<Registro, Falha>;

    fn configuracao(
        &self,
        servidor: &str,
        token: &Segredo,
        computador: Option<&str>,
    ) -> Result<RespostaDaConfiguracao, Falha>;
}

/// O lado do computador: o registro do Windows e o disco.
pub trait Maquina {
    fn instalacao(&self) -> Instalacao;
    fn computador(&self) -> Option<Computador>;
    fn apagar_a_chave(&self) -> io::Result<()>;
    fn guardar_o_token(&self, guardado: &Guardado) -> io::Result<()>;
    fn guardar_a_configuracao(&self, configuracao: &ConfiguracaoGuardada) -> io::Result<()>;
}

pub struct ServicoDoAparelho<A, M> {
    api: A,
    maquina: M,
    guardado: Option<Guardado>,
    /// O token está no disco: só então a chave pode sair do registro do Windows.
    token_no_disco: bool,
    configuracao: Option<ConfiguracaoGuardada>,
    token_recusado_em: Option<Instant>,
    chave_recusada: Option<(Segredo, Instant)>,
    situacao: Situacao,
    motivo: Option<String>,
}

impl<A: Api, M: Maquina> ServicoDoAparelho<A, M> {
    pub fn novo(
        api: A,
        maquina: M,
        guardado: Option<Guardado>,
        configuracao: Option<ConfiguracaoGuardada>,
    ) -> Self {
        let situacao = if guardado.is_some() {
            Situacao::SemConexao
        } else {
            Situacao::NaoConfigurada
        };
        let motivo = Some(
            if guardado.is_some() {
                SEM_CONEXAO
            } else {
                SEM_CONFIGURACAO
            }
            .to_owned(),
        );
        Self {
            api,
            maquina,
            token_no_disco: guardado.is_some(),
            guardado,
            configuracao,
            token_recusado_em: None,
            chave_recusada: None,
            situacao,
            motivo,
        }
    }

    /// O que a aba de cada pessoa recebe pelo pipe.
    pub fn retrato(&self) -> Aparelho {
        Aparelho {
            situacao: self.situacao,
            motivo: self.motivo.clone(),
            configuracao: self
                .configuracao
                .as_ref()
                .map(|guardada| guardada.configuracao.clone()),
        }
    }

    fn mudar(&mut self, situacao: Situacao, motivo: Option<&str>) {
        if self.situacao != situacao {
            log::info(&format!("o aparelho passou a {situacao:?}"));
        }
        self.situacao = situacao;
        self.motivo = motivo.map(str::to_owned);
    }

    /// Um passo: o contato com o token ou o registro com a chave. Devolve quanto esperar.
    pub fn passo(&mut self, agora: Instant) -> Duration {
        let instalacao = self.maquina.instalacao();
        let Some(servidor) = instalacao.servidor.as_deref().and_then(endereco_valido) else {
            if instalacao.servidor.is_some() && self.situacao != Situacao::NaoConfigurada {
                log::aviso("o endereço do servidor no registro do Windows foi recusado");
            }
            self.mudar(Situacao::NaoConfigurada, Some(SEM_CONFIGURACAO));
            return UM_MINUTO;
        };
        // A configuração e o token de outro servidor não valem neste.
        if self
            .configuracao
            .as_ref()
            .is_some_and(|guardada| guardada.servidor != servidor)
        {
            self.configuracao = None;
        }
        let Some(computador) = self.maquina.computador() else {
            log::erro("o identificador da máquina não foi lido");
            self.mudar(Situacao::SemConexao, Some(SEM_CONEXAO));
            return UM_MINUTO;
        };
        let cabecalho = nome_no_cabecalho(&computador.nome);
        let token = self
            .guardado
            .as_ref()
            .filter(|guardado| guardado.servidor == servidor)
            .map(|guardado| guardado.token.clone());

        if let Some(token) = &token {
            let recusado_ha_pouco = self
                .token_recusado_em
                .is_some_and(|em| agora.duration_since(em) < DEZ_MINUTOS);
            if !recusado_ha_pouco {
                match self.api.configuracao(&servidor, token, cabecalho) {
                    Ok(resposta) => return self.contato_certo(servidor, resposta, &instalacao),
                    Err(falha) => match falha.decisao {
                        Decisao::TokenRecusado => {
                            log::aviso("o token do aparelho foi recusado");
                            self.token_recusado_em = Some(agora);
                        }
                        Decisao::Bloqueado => {
                            log::aviso("o aparelho está bloqueado na aba");
                            self.mudar(Situacao::Bloqueada, Some(BLOQUEADO));
                            return DEZ_MINUTOS;
                        }
                        Decisao::Esperar(espera) => {
                            log::aviso(&format!("a API pediu para esperar {} s", espera.as_secs()));
                            return espera;
                        }
                        _ => {
                            log::aviso(&format!("a configuração não veio: {}", falha.para_o_log));
                            self.mudar(Situacao::SemConexao, Some(SEM_CONEXAO));
                            return UM_MINUTO;
                        }
                    },
                }
            }
        }

        // Sem um token que valha: o registro, com a chave do registro do Windows.
        let token_recusado = token.is_some() && self.token_recusado_em.is_some();
        let sem_registro = if token_recusado {
            (Situacao::RegistrarDeNovo, REGISTRAR_DE_NOVO)
        } else {
            (Situacao::NaoConfigurada, SEM_CONFIGURACAO)
        };
        let Some(chave) = instalacao.chave.clone() else {
            self.mudar(sem_registro.0, Some(sem_registro.1));
            return UM_MINUTO;
        };
        if let Some((recusada, em)) = &self.chave_recusada
            && *recusada == chave
            && agora.duration_since(*em) < DEZ_MINUTOS
        {
            return UM_MINUTO;
        }
        let pedido = PedidoDeRegistro {
            chave: &chave,
            identificador_da_maquina: &computador.identificador,
            nome: &computador.nome,
            versao: VERSAO,
            entrada_sugerida: instalacao.entrada,
        };
        match self.api.registrar(&servidor, &pedido, cabecalho) {
            Ok(registro) => {
                log::info(&format!(
                    "o aparelho foi registrado como {}, com a entrada {:?}",
                    registro.identificador_curto, registro.entrada
                ));
                let guardado = Guardado {
                    servidor,
                    token: registro.token,
                    identificador_curto: registro.identificador_curto,
                };
                self.token_no_disco = match self.maquina.guardar_o_token(&guardado) {
                    Ok(()) => true,
                    Err(erro) => {
                        log::erro(&format!("o token do aparelho não foi gravado: {erro}"));
                        false
                    }
                };
                self.guardado = Some(guardado);
                self.token_recusado_em = None;
                self.chave_recusada = None;
                // O contato com o token logo em seguida, que confirma o registro e apaga a chave.
                Duration::ZERO
            }
            Err(falha) => match falha.decisao {
                Decisao::ChaveRecusada => {
                    log::aviso("a chave da aba foi recusada");
                    self.chave_recusada = Some((chave, agora));
                    self.mudar(sem_registro.0, Some(sem_registro.1));
                    UM_MINUTO
                }
                Decisao::Bloqueado => {
                    log::aviso("o aparelho está bloqueado na aba");
                    self.mudar(Situacao::Bloqueada, Some(BLOQUEADO));
                    DEZ_MINUTOS
                }
                Decisao::Esperar(espera) => {
                    log::aviso(&format!(
                        "o registro vai esperar {} s, com a mesma chave",
                        espera.as_secs()
                    ));
                    espera
                }
                _ => {
                    log::aviso(&format!("o registro não foi: {}", falha.para_o_log));
                    if !token_recusado {
                        self.mudar(Situacao::SemConexao, Some(SEM_CONEXAO));
                    }
                    UM_MINUTO
                }
            },
        }
    }

    fn contato_certo(
        &mut self,
        servidor: String,
        resposta: RespostaDaConfiguracao,
        instalacao: &Instalacao,
    ) -> Duration {
        self.token_recusado_em = None;
        let guardada = ConfiguracaoGuardada {
            servidor,
            configuracao: Configuracao {
                forma: resposta.forma,
                contato: resposta.contato,
                entrada: resposta.entrada,
                versao: resposta.versao,
            },
        };
        if self.configuracao.as_ref() != Some(&guardada) {
            log::info(&format!(
                "a configuração da versão {} chegou, com a entrada {:?}",
                guardada.configuracao.versao, guardada.configuracao.entrada
            ));
            if let Err(erro) = self.maquina.guardar_a_configuracao(&guardada) {
                log::erro(&format!("a configuração não foi gravada: {erro}"));
            }
            self.configuracao = Some(guardada);
        }
        if instalacao.chave.is_some() && self.token_no_disco {
            match self.maquina.apagar_a_chave() {
                Ok(()) => log::info("a chave da aba saiu do registro do Windows"),
                Err(erro) => log::erro(&format!("a chave da aba não saiu do registro: {erro}")),
            }
        }
        self.mudar(Situacao::Registrada, None);
        Duration::from_secs(resposta.proxima_em.clamp(MENOR_INTERVALO, MAIOR_INTERVALO))
    }
}

#[cfg(test)]
mod testes {
    use std::cell::RefCell;
    use std::collections::VecDeque;

    use super::*;

    const SERVIDOR: &str = "https://grafite.empresa.local";

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum Chamada {
        Registrar {
            servidor: String,
            chave: String,
            nome: String,
            cabecalho: Option<String>,
            entrada: Option<Entrada>,
        },
        Configuracao {
            servidor: String,
            token: String,
        },
    }

    #[derive(Default)]
    struct ApiFalsa {
        registros: RefCell<VecDeque<Result<Registro, Falha>>>,
        configuracoes: RefCell<VecDeque<Result<RespostaDaConfiguracao, Falha>>>,
        chamadas: RefCell<Vec<Chamada>>,
    }

    impl Api for &ApiFalsa {
        fn registrar(
            &self,
            servidor: &str,
            pedido: &PedidoDeRegistro<'_>,
            computador: Option<&str>,
        ) -> Result<Registro, Falha> {
            self.chamadas.borrow_mut().push(Chamada::Registrar {
                servidor: servidor.into(),
                chave: pedido.chave.expor().into(),
                nome: pedido.nome.into(),
                cabecalho: computador.map(str::to_owned),
                entrada: pedido.entrada_sugerida,
            });
            self.registros
                .borrow_mut()
                .pop_front()
                .expect("um registro esperado")
        }

        fn configuracao(
            &self,
            servidor: &str,
            token: &Segredo,
            _computador: Option<&str>,
        ) -> Result<RespostaDaConfiguracao, Falha> {
            self.chamadas.borrow_mut().push(Chamada::Configuracao {
                servidor: servidor.into(),
                token: token.expor().into(),
            });
            self.configuracoes
                .borrow_mut()
                .pop_front()
                .expect("uma configuração esperada")
        }
    }

    struct MaquinaFalsa {
        instalacao: RefCell<Instalacao>,
        nome: String,
        token: RefCell<Option<Guardado>>,
        configuracao: RefCell<Option<ConfiguracaoGuardada>>,
        disco_cheio: bool,
    }

    impl MaquinaFalsa {
        fn com(servidor: Option<&str>, chave: Option<&str>) -> Self {
            Self {
                instalacao: RefCell::new(Instalacao {
                    servidor: servidor.map(str::to_owned),
                    chave: chave.map(Segredo::novo),
                    entrada: Some(Entrada::Senha),
                }),
                nome: "PC-FIN-09".into(),
                token: RefCell::new(None),
                configuracao: RefCell::new(None),
                disco_cheio: false,
            }
        }

        fn chave(&self) -> Option<String> {
            self.instalacao
                .borrow()
                .chave
                .as_ref()
                .map(|chave| chave.expor().to_owned())
        }
    }

    impl Maquina for &MaquinaFalsa {
        fn instalacao(&self) -> Instalacao {
            self.instalacao.borrow().clone()
        }

        fn computador(&self) -> Option<Computador> {
            Some(Computador {
                identificador: "4c4c4544-0042-3510-8058-b7c04f4e3732".into(),
                nome: self.nome.clone(),
            })
        }

        fn apagar_a_chave(&self) -> io::Result<()> {
            self.instalacao.borrow_mut().chave = None;
            Ok(())
        }

        fn guardar_o_token(&self, guardado: &Guardado) -> io::Result<()> {
            if self.disco_cheio {
                return Err(io::Error::other("disco cheio"));
            }
            *self.token.borrow_mut() = Some(guardado.clone());
            Ok(())
        }

        fn guardar_a_configuracao(&self, configuracao: &ConfiguracaoGuardada) -> io::Result<()> {
            *self.configuracao.borrow_mut() = Some(configuracao.clone());
            Ok(())
        }
    }

    fn registro(token: &str) -> Result<Registro, Falha> {
        Ok(Registro {
            token: Segredo::novo(token),
            entrada: Entrada::Senha,
            identificador_curto: "K7M2QX".into(),
        })
    }

    fn configuracao(versao: i64) -> Result<RespostaDaConfiguracao, Falha> {
        Ok(RespostaDaConfiguracao {
            forma: Forma::Pilula,
            contato: Some("Ramal 2000".into()),
            entrada: Entrada::Senha,
            versao,
            proxima_em: 60,
        })
    }

    fn falha(decisao: Decisao) -> Falha {
        Falha {
            decisao,
            detalhe: None,
            para_o_log: "teste".into(),
        }
    }

    fn guardado(token: &str, servidor: &str) -> Guardado {
        Guardado {
            servidor: servidor.into(),
            token: Segredo::novo(token),
            identificador_curto: "K7M2QX".into(),
        }
    }

    fn so_configuracoes(api: &ApiFalsa) -> usize {
        api.chamadas
            .borrow()
            .iter()
            .filter(|chamada| matches!(chamada, Chamada::Configuracao { .. }))
            .count()
    }

    #[test]
    fn sem_o_endereco_a_aba_nao_foi_configurada() {
        let api = ApiFalsa::default();
        let maquina = MaquinaFalsa::com(None, Some("chave"));
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        assert_eq!(servico.passo(Instant::now()), UM_MINUTO);
        assert_eq!(servico.retrato().situacao, Situacao::NaoConfigurada);
        assert_eq!(servico.retrato().motivo.as_deref(), Some(SEM_CONFIGURACAO));
        assert!(api.chamadas.borrow().is_empty());
    }

    #[test]
    fn sem_a_chave_e_sem_o_token_a_aba_nao_foi_configurada() {
        let api = ApiFalsa::default();
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), None);
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        servico.passo(Instant::now());
        assert_eq!(servico.retrato().situacao, Situacao::NaoConfigurada);
        assert!(api.chamadas.borrow().is_empty());
    }

    #[test]
    fn a_chave_registra_e_sai_so_depois_do_contato_com_o_token() {
        let api = ApiFalsa::default();
        api.registros.borrow_mut().push_back(registro("tok_1"));
        api.configuracoes.borrow_mut().push_back(configuracao(3));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave"));
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        let agora = Instant::now();
        assert_eq!(servico.passo(agora), Duration::ZERO);
        assert_eq!(
            maquina.token.borrow().as_ref(),
            Some(&guardado("tok_1", SERVIDOR))
        );
        assert_eq!(
            maquina.chave().as_deref(),
            Some("chave"),
            "a chave fica até o contato"
        );
        assert_eq!(servico.passo(agora), UM_MINUTO);
        assert_eq!(maquina.chave(), None);
        assert_eq!(servico.retrato().situacao, Situacao::Registrada);
        assert_eq!(servico.retrato().motivo, None);
        assert_eq!(
            servico
                .retrato()
                .configuracao
                .map(|configuracao| configuracao.versao),
            Some(3)
        );
        assert_eq!(
            maquina
                .configuracao
                .borrow()
                .as_ref()
                .map(|guardada| guardada.servidor.as_str()),
            Some(SERVIDOR)
        );
        assert_eq!(
            api.chamadas.borrow()[1],
            Chamada::Configuracao {
                servidor: SERVIDOR.into(),
                token: "tok_1".into()
            }
        );
    }

    #[test]
    fn o_registro_leva_a_entrada_sugerida_e_o_nome() {
        let api = ApiFalsa::default();
        api.registros.borrow_mut().push_back(registro("tok_1"));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave"));
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        servico.passo(Instant::now());
        assert_eq!(
            api.chamadas.borrow()[0],
            Chamada::Registrar {
                servidor: SERVIDOR.into(),
                chave: "chave".into(),
                nome: "PC-FIN-09".into(),
                cabecalho: Some("PC-FIN-09".into()),
                entrada: Some(Entrada::Senha),
            }
        );
    }

    #[test]
    fn o_nome_com_acento_vai_so_pelo_corpo() {
        let api = ApiFalsa::default();
        api.registros.borrow_mut().push_back(registro("tok_1"));
        let maquina = MaquinaFalsa {
            nome: "PC-GERÊNCIA".into(),
            ..MaquinaFalsa::com(Some(SERVIDOR), Some("chave"))
        };
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        servico.passo(Instant::now());
        let Chamada::Registrar {
            nome, cabecalho, ..
        } = api.chamadas.borrow()[0].clone()
        else {
            panic!("o registro");
        };
        assert_eq!(nome, "PC-GERÊNCIA");
        assert_eq!(cabecalho, None);
    }

    #[test]
    fn o_429_do_registro_e_tentar_depois_e_nao_a_chave_recusada() {
        let api = ApiFalsa::default();
        api.registros
            .borrow_mut()
            .push_back(Err(falha(Decisao::Esperar(Duration::from_secs(42)))));
        api.registros.borrow_mut().push_back(registro("tok_1"));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave"));
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        let agora = Instant::now();
        assert_eq!(servico.passo(agora), Duration::from_secs(42));
        assert_eq!(maquina.chave().as_deref(), Some("chave"));
        // Passada a espera, a mesma chave registra.
        assert_eq!(
            servico.passo(agora + Duration::from_secs(42)),
            Duration::ZERO
        );
        assert!(maquina.token.borrow().is_some());
    }

    #[test]
    fn a_chave_recusada_espera_10_minutos_e_a_nova_registra_logo() {
        let api = ApiFalsa::default();
        api.registros
            .borrow_mut()
            .push_back(Err(falha(Decisao::ChaveRecusada)));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave-velha"));
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        let agora = Instant::now();
        servico.passo(agora);
        assert_eq!(servico.retrato().situacao, Situacao::NaoConfigurada);
        // A mesma chave não volta à API antes dos 10 minutos.
        servico.passo(agora + UM_MINUTO);
        assert_eq!(api.chamadas.borrow().len(), 1);
        // A TI repõe a chave: o passo seguinte registra.
        maquina.instalacao.borrow_mut().chave = Some(Segredo::novo("chave-nova"));
        api.registros.borrow_mut().push_back(registro("tok_1"));
        assert_eq!(servico.passo(agora + 2 * UM_MINUTO), Duration::ZERO);
        assert_eq!(api.chamadas.borrow().len(), 2);
    }

    #[test]
    fn o_token_recusado_sem_chave_tenta_de_novo_a_cada_10_minutos() {
        let api = ApiFalsa::default();
        api.configuracoes
            .borrow_mut()
            .push_back(Err(falha(Decisao::TokenRecusado)));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), None);
        let mut servico =
            ServicoDoAparelho::novo(&api, &maquina, Some(guardado("tok_1", SERVIDOR)), None);
        let agora = Instant::now();
        assert_eq!(servico.passo(agora), UM_MINUTO);
        assert_eq!(servico.retrato().situacao, Situacao::RegistrarDeNovo);
        assert_eq!(servico.retrato().motivo.as_deref(), Some(REGISTRAR_DE_NOVO));
        // Nos 10 minutos, o token não volta à API; só o registro do Windows é relido.
        for minuto in 1..10 {
            servico.passo(agora + minuto * UM_MINUTO);
        }
        assert_eq!(so_configuracoes(&api), 1);
        api.configuracoes.borrow_mut().push_back(configuracao(1));
        servico.passo(agora + DEZ_MINUTOS);
        assert_eq!(so_configuracoes(&api), 2);
        assert_eq!(servico.retrato().situacao, Situacao::Registrada);
    }

    #[test]
    fn o_token_recusado_com_a_chave_registra_de_novo() {
        let api = ApiFalsa::default();
        api.configuracoes
            .borrow_mut()
            .push_back(Err(falha(Decisao::TokenRecusado)));
        api.registros.borrow_mut().push_back(registro("tok_2"));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave"));
        let mut servico =
            ServicoDoAparelho::novo(&api, &maquina, Some(guardado("tok_1", SERVIDOR)), None);
        assert_eq!(servico.passo(Instant::now()), Duration::ZERO);
        assert_eq!(
            maquina.token.borrow().as_ref(),
            Some(&guardado("tok_2", SERVIDOR))
        );
    }

    #[test]
    fn a_recusa_da_pessoa_nao_poe_o_computador_em_registrar_de_novo() {
        let api = ApiFalsa::default();
        api.configuracoes
            .borrow_mut()
            .push_back(Err(falha(Decisao::DaPessoa(
                "sessao-da-aba-recusada".into(),
            ))));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave"));
        let mut servico =
            ServicoDoAparelho::novo(&api, &maquina, Some(guardado("tok_1", SERVIDOR)), None);
        assert_eq!(servico.passo(Instant::now()), UM_MINUTO);
        assert_eq!(servico.retrato().situacao, Situacao::SemConexao);
        assert_eq!(api.chamadas.borrow().len(), 1, "sem registro de novo");
    }

    #[test]
    fn o_429_do_contato_espera_sem_mudar_nada() {
        let api = ApiFalsa::default();
        api.configuracoes
            .borrow_mut()
            .push_back(Err(falha(Decisao::Esperar(Duration::from_secs(7)))));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), Some("chave"));
        let mut servico =
            ServicoDoAparelho::novo(&api, &maquina, Some(guardado("tok_1", SERVIDOR)), None);
        assert_eq!(servico.passo(Instant::now()), Duration::from_secs(7));
        assert_eq!(api.chamadas.borrow().len(), 1);
        assert_eq!(maquina.chave().as_deref(), Some("chave"));
    }

    #[test]
    fn o_bloqueado_espera_10_minutos() {
        let api = ApiFalsa::default();
        api.configuracoes
            .borrow_mut()
            .push_back(Err(falha(Decisao::Bloqueado)));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), None);
        let mut servico =
            ServicoDoAparelho::novo(&api, &maquina, Some(guardado("tok_1", SERVIDOR)), None);
        assert_eq!(servico.passo(Instant::now()), DEZ_MINUTOS);
        assert_eq!(servico.retrato().situacao, Situacao::Bloqueada);
        assert_eq!(servico.retrato().motivo.as_deref(), Some(BLOQUEADO));
    }

    #[test]
    fn sem_o_token_no_disco_a_chave_fica() {
        let api = ApiFalsa::default();
        api.registros.borrow_mut().push_back(registro("tok_1"));
        api.configuracoes.borrow_mut().push_back(configuracao(1));
        let maquina = MaquinaFalsa {
            disco_cheio: true,
            ..MaquinaFalsa::com(Some(SERVIDOR), Some("chave"))
        };
        let mut servico = ServicoDoAparelho::novo(&api, &maquina, None, None);
        let agora = Instant::now();
        servico.passo(agora);
        servico.passo(agora);
        assert_eq!(servico.retrato().situacao, Situacao::Registrada);
        assert_eq!(maquina.chave().as_deref(), Some("chave"));
    }

    #[test]
    fn o_token_de_outro_servidor_nao_vai_ao_novo() {
        let api = ApiFalsa::default();
        api.registros.borrow_mut().push_back(registro("tok_novo"));
        let maquina = MaquinaFalsa::com(Some("https://outro.empresa.local"), Some("chave"));
        let configuracao_velha = ConfiguracaoGuardada {
            servidor: SERVIDOR.into(),
            configuracao: Configuracao {
                forma: Forma::Entalhe,
                contato: None,
                entrada: Entrada::Windows,
                versao: 9,
            },
        };
        let mut servico = ServicoDoAparelho::novo(
            &api,
            &maquina,
            Some(guardado("tok_velho", SERVIDOR)),
            Some(configuracao_velha),
        );
        servico.passo(Instant::now());
        assert!(matches!(
            &api.chamadas.borrow()[0],
            Chamada::Registrar { servidor, .. } if servidor == "https://outro.empresa.local"
        ));
        assert_eq!(servico.retrato().configuracao, None);
    }

    #[test]
    fn sem_conexao_a_configuracao_guardada_segue() {
        let api = ApiFalsa::default();
        api.configuracoes
            .borrow_mut()
            .push_back(Err(falha(Decisao::TentarDepois)));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), None);
        let guardada = ConfiguracaoGuardada {
            servidor: SERVIDOR.into(),
            configuracao: Configuracao {
                forma: Forma::Entalhe,
                contato: Some("Ramal 2000".into()),
                entrada: Entrada::Windows,
                versao: 4,
            },
        };
        let mut servico = ServicoDoAparelho::novo(
            &api,
            &maquina,
            Some(guardado("tok_1", SERVIDOR)),
            Some(guardada.clone()),
        );
        assert_eq!(servico.retrato().situacao, Situacao::SemConexao);
        servico.passo(Instant::now());
        assert_eq!(servico.retrato().situacao, Situacao::SemConexao);
        assert_eq!(servico.retrato().motivo.as_deref(), Some(SEM_CONEXAO));
        assert_eq!(servico.retrato().configuracao, Some(guardada.configuracao));
    }

    #[test]
    fn a_configuracao_igual_nao_e_gravada_de_novo() {
        let api = ApiFalsa::default();
        api.configuracoes.borrow_mut().push_back(configuracao(2));
        api.configuracoes.borrow_mut().push_back(configuracao(2));
        let maquina = MaquinaFalsa::com(Some(SERVIDOR), None);
        let mut servico =
            ServicoDoAparelho::novo(&api, &maquina, Some(guardado("tok_1", SERVIDOR)), None);
        let agora = Instant::now();
        servico.passo(agora);
        *maquina.configuracao.borrow_mut() = None;
        servico.passo(agora + UM_MINUTO);
        assert_eq!(*maquina.configuracao.borrow(), None);
    }

    #[test]
    fn a_configuracao_guardada_vai_com_o_servidor() {
        let guardada = ConfiguracaoGuardada {
            servidor: SERVIDOR.into(),
            configuracao: Configuracao {
                forma: Forma::Pilula,
                contato: None,
                entrada: Entrada::Windows,
                versao: 0,
            },
        };
        assert_eq!(
            serde_json::to_value(&guardada).ok(),
            Some(serde_json::json!({
                "servidor": SERVIDOR,
                "forma": "pilula",
                "contato": null,
                "entrada": "windows",
                "versao": 0,
            }))
        );
    }
}
