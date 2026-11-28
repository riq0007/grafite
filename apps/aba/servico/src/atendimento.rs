//! O pipe do lado do serviço: cada aba abre uma conexão, faz um pedido e recebe a resposta. Uma
//! linha por conexão, até 64 ao mesmo tempo. A leitura do pedido e a escrita da resposta têm o prazo
//! de 5 s cada uma: a aba parada não segura o serviço das outras pessoas do computador. O pedido à
//! API, entre as duas, tem o prazo do `reqwest`.
//!
//! A sessão pelo Windows vai com o SID e o nome que o Windows dá ao serviço
//! (`ImpersonateNamedPipeClient`), e não com o que a aba diz, e o token da sessão volta só pela
//! conexão de quem pediu.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use grafite_aba_pipe::{
    Aparelho, Chamador, Erro, Instancia, NOME_DO_PIPE, Pedido, Resposta, Situacao, com_prazo,
};

use crate::aparelho::Falha;
use crate::api::ApiDaSessao;
use crate::log;
use crate::problema::Decisao;
use crate::segredo::Segredo;

const CONEXOES: usize = 64;
const PRAZO: Duration = Duration::from_secs(5);

/// O que o laço do aparelho recebe: parar, ou dar o passo seguinte já.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sinal {
    Parar,
    Acordar,
}

/// O que o pipe lê do laço do aparelho, trocado a cada passo, e a API da sessão.
pub struct Contexto<A> {
    pub retrato: Mutex<Aparelho>,
    pub credencial: Mutex<Option<(String, Segredo)>>,
    pub api: A,
    /// O nome do computador no cabeçalho, só em ASCII.
    pub computador: Option<String>,
    /// O token do aparelho recusado num pedido da sessão acorda o laço do aparelho.
    pub acordar: Sender<Sinal>,
}

impl<A: ApiDaSessao> Contexto<A> {
    fn retrato(&self) -> Aparelho {
        self.retrato.lock().map_or_else(
            |_| Aparelho {
                servidor: None,
                situacao: Situacao::SemConexao,
                motivo: None,
                configuracao: None,
            },
            |retrato| retrato.clone(),
        )
    }

    fn credencial(&self) -> Option<(String, Segredo)> {
        self.credencial.lock().ok()?.clone()
    }

    /// A resposta a um pedido. Quem chama só é lido nos pedidos da sessão.
    pub fn responder(
        &self,
        mensagem: &[u8],
        quem_chama: impl FnOnce() -> Option<Chamador>,
    ) -> Resposta {
        let Ok(pedido) = serde_json::from_slice::<Pedido>(mensagem) else {
            return Resposta::PedidoRecusado;
        };
        let retrato = self.retrato();
        let computador = self.computador.as_deref();
        match pedido {
            Pedido::Aparelho => Resposta::Aparelho(retrato),
            Pedido::SessaoPeloWindows => {
                // Sem o token do aparelho, a aba recebe a situação dele, com o motivo.
                let Some((servidor, token)) = self.credencial() else {
                    return Resposta::Aparelho(retrato);
                };
                let Some(chamador) = quem_chama() else {
                    return Resposta::PedidoRecusado;
                };
                match self.api.abrir_pelo_windows(
                    &servidor,
                    &token,
                    &chamador.sid,
                    &chamador.nome,
                    computador,
                ) {
                    Ok(sessao) => {
                        log::info(&format!("a sessão de {} foi aberta", chamador.nome));
                        Resposta::Sessao {
                            token: sessao.token.expor().to_owned(),
                            expira_em: sessao.expira_em,
                            nome: sessao.pessoa.nome,
                        }
                    }
                    Err(falha) => self.recusa(&falha, &chamador, "a sessão"),
                }
            }
            Pedido::Renovar { token } => {
                let Some(servidor) = retrato.servidor.clone() else {
                    return Resposta::Aparelho(retrato);
                };
                let Some(chamador) = quem_chama() else {
                    return Resposta::PedidoRecusado;
                };
                let token = Segredo::novo(token);
                match self
                    .api
                    .renovar(&servidor, &token, &chamador.sid, computador)
                {
                    Ok(renovacao) => Resposta::Renovada {
                        expira_em: renovacao.expira_em,
                    },
                    Err(falha) => self.recusa(&falha, &chamador, "a renovação"),
                }
            }
        }
    }

    fn recusa(&self, falha: &Falha, chamador: &Chamador, o_que: &str) -> Resposta {
        log::aviso(&format!(
            "{o_que} de {} foi recusada: {}",
            chamador.nome, falha.para_o_log
        ));
        if matches!(falha.decisao, Decisao::TokenRecusado | Decisao::Bloqueado) {
            let _ = self.acordar.send(Sinal::Acordar);
        }
        Resposta::Recusa(falha.para_a_aba())
    }
}

/// Atende as abas até o processo terminar. A primeira instância falha se outro processo criou o
/// pipe antes: o serviço não o usa.
pub fn atender<A: ApiDaSessao + Send + Sync + 'static>(
    contexto: Arc<Contexto<A>>,
) -> Result<(), Erro> {
    let ativas = Arc::new(AtomicUsize::new(0));
    let mut proxima = Some(Instancia::criar(NOME_DO_PIPE, true)?);
    loop {
        let instancia = proxima.take().unwrap_or_else(outra_instancia);
        if let Err(erro) = instancia.esperar() {
            log::aviso(&format!("uma aba não conectou ao pipe: {erro}"));
            continue;
        }
        // A próxima antes de entregar esta: o pipe não fica sem uma instância esperando.
        proxima = Instancia::criar(NOME_DO_PIPE, false).ok();
        if ativas.fetch_add(1, Ordering::SeqCst) >= CONEXOES {
            ativas.fetch_sub(1, Ordering::SeqCst);
            instancia.desligar();
            continue;
        }
        let contexto = Arc::clone(&contexto);
        let ativas = Arc::clone(&ativas);
        thread::spawn(move || {
            conversar(&instancia, &contexto);
            ativas.fetch_sub(1, Ordering::SeqCst);
        });
    }
}

/// Outra instância: a seguinte, ao lado das que atendem, ou a primeira de novo, quando o pipe sumiu.
/// Só o sistema cria a seguinte: no `--console`, como administrador, ela espera as conversas
/// terminarem e o pipe sumir.
fn outra_instancia() -> Instancia {
    for tentativa in 0_u32.. {
        if let Ok(instancia) = Instancia::criar(NOME_DO_PIPE, true) {
            return instancia;
        }
        if let Ok(instancia) = Instancia::criar(NOME_DO_PIPE, false) {
            return instancia;
        }
        if tentativa == 100 {
            log::aviso("o pipe não abre outra instância; o serviço segue tentando");
        }
        thread::sleep(Duration::from_millis(50));
    }
    unreachable!("as tentativas não acabam")
}

fn conversar<A: ApiDaSessao>(instancia: &Instancia, contexto: &Contexto<A>) {
    let mensagem = match com_prazo(PRAZO, || instancia.ler()) {
        Ok(Ok(mensagem)) => mensagem,
        Ok(Err(Erro::Fechado)) => return,
        Ok(Err(erro)) => {
            log::aviso(&format!("o pedido de uma aba não foi lido: {erro}"));
            return;
        }
        Err(erro) => {
            log::aviso(&format!("o prazo do pipe não começou: {erro}"));
            return;
        }
    };
    let resposta = contexto.responder(&mensagem, || {
        instancia
            .quem_chama()
            .inspect_err(|erro| log::aviso(&format!("quem chama não foi lido: {erro}")))
            .ok()
    });
    let Ok(bytes) = serde_json::to_vec(&resposta) else {
        return;
    };
    let _ = com_prazo(PRAZO, || {
        if let Err(erro) = instancia.escrever(&bytes) {
            log::aviso(&format!("a resposta a uma aba não foi: {erro}"));
        }
        instancia.desligar();
    });
}

#[cfg(test)]
mod testes {
    use std::cell::RefCell;
    use std::sync::mpsc;

    use grafite_aba_pipe::{Configuracao, Entrada, Forma, Recusa};

    use super::*;
    use crate::api::{PessoaDaSessao, Renovacao, SessaoAberta};
    use crate::problema::Problema;

    const SERVIDOR: &str = "https://grafite.empresa.local";

    #[derive(Default)]
    struct ApiFalsa {
        chamadas: Mutex<Vec<String>>,
        recusar: Option<Falha>,
    }

    impl ApiDaSessao for ApiFalsa {
        fn abrir_pelo_windows(
            &self,
            servidor: &str,
            token_do_aparelho: &Segredo,
            sid: &str,
            usuario_do_windows: &str,
            computador: Option<&str>,
        ) -> Result<SessaoAberta, Falha> {
            self.chamadas.lock().expect("as chamadas").push(format!(
                "abrir {servidor} {} {sid} {usuario_do_windows} {computador:?}",
                token_do_aparelho.expor()
            ));
            if let Some(falha) = &self.recusar {
                return Err(falha.clone());
            }
            Ok(SessaoAberta {
                token: Segredo::novo("tok_da_sessao"),
                expira_em: "2026-11-28T04:00:00.000Z".into(),
                pessoa: PessoaDaSessao {
                    nome: "Fernanda Lima".into(),
                },
            })
        }

        fn renovar(
            &self,
            servidor: &str,
            token_da_sessao: &Segredo,
            sid: &str,
            _computador: Option<&str>,
        ) -> Result<Renovacao, Falha> {
            self.chamadas.lock().expect("as chamadas").push(format!(
                "renovar {servidor} {} {sid}",
                token_da_sessao.expor()
            ));
            if let Some(falha) = &self.recusar {
                return Err(falha.clone());
            }
            Ok(Renovacao {
                expira_em: "2026-11-28T05:00:00.000Z".into(),
            })
        }
    }

    fn retrato() -> Aparelho {
        Aparelho {
            servidor: Some(SERVIDOR.into()),
            situacao: Situacao::Registrada,
            motivo: None,
            configuracao: Some(Configuracao {
                forma: Forma::Pilula,
                contato: None,
                entrada: Entrada::Windows,
                versao: 1,
            }),
        }
    }

    fn contexto(
        api: ApiFalsa,
        credencial: Option<(String, Segredo)>,
    ) -> (Contexto<ApiFalsa>, mpsc::Receiver<Sinal>) {
        let (acordar, sinais) = mpsc::channel();
        let contexto = Contexto {
            retrato: Mutex::new(retrato()),
            credencial: Mutex::new(credencial),
            api,
            computador: Some("PC-FIN-09".into()),
            acordar,
        };
        (contexto, sinais)
    }

    fn fernanda() -> Option<Chamador> {
        Some(Chamador {
            sid: "S-1-5-21-1-2-3-1104".into(),
            nome: r"EMPRESA\fernanda.lima".into(),
            sessao: 1,
        })
    }

    fn credencial() -> Option<(String, Segredo)> {
        Some((SERVIDOR.into(), Segredo::novo("tok_do_aparelho")))
    }

    #[test]
    fn o_pedido_do_aparelho_nao_le_quem_chama() {
        let (contexto, _) = contexto(ApiFalsa::default(), credencial());
        let lido = RefCell::new(false);
        let resposta = contexto.responder(br#"{"pedido":"aparelho"}"#, || {
            *lido.borrow_mut() = true;
            fernanda()
        });
        assert_eq!(resposta, Resposta::Aparelho(retrato()));
        assert!(!*lido.borrow());
    }

    #[test]
    fn o_pedido_estranho_e_recusado() {
        let (contexto, _) = contexto(ApiFalsa::default(), credencial());
        assert_eq!(
            contexto.responder(b"nada", fernanda),
            Resposta::PedidoRecusado
        );
        assert_eq!(
            contexto.responder(br#"{"pedido":"token"}"#, fernanda),
            Resposta::PedidoRecusado
        );
    }

    #[test]
    fn a_sessao_vai_com_o_sid_que_o_windows_deu() {
        let (contexto, _) = contexto(ApiFalsa::default(), credencial());
        let resposta = contexto.responder(br#"{"pedido":"sessao-pelo-windows"}"#, fernanda);
        assert_eq!(
            resposta,
            Resposta::Sessao {
                token: "tok_da_sessao".into(),
                expira_em: "2026-11-28T04:00:00.000Z".into(),
                nome: "Fernanda Lima".into(),
            }
        );
        assert_eq!(
            contexto
                .api
                .chamadas
                .lock()
                .expect("as chamadas")
                .as_slice(),
            [format!(
                r#"abrir {SERVIDOR} tok_do_aparelho S-1-5-21-1-2-3-1104 EMPRESA\fernanda.lima Some("PC-FIN-09")"#
            )]
        );
    }

    #[test]
    fn sem_o_token_do_aparelho_a_aba_recebe_a_situacao() {
        let (contexto, _) = contexto(ApiFalsa::default(), None);
        assert_eq!(
            contexto.responder(br#"{"pedido":"sessao-pelo-windows"}"#, fernanda),
            Resposta::Aparelho(retrato())
        );
        assert!(
            contexto
                .api
                .chamadas
                .lock()
                .expect("as chamadas")
                .is_empty()
        );
    }

    #[test]
    fn sem_saber_quem_chama_nao_ha_sessao() {
        let (contexto, _) = contexto(ApiFalsa::default(), credencial());
        assert_eq!(
            contexto.responder(br#"{"pedido":"sessao-pelo-windows"}"#, || None),
            Resposta::PedidoRecusado
        );
        assert!(
            contexto
                .api
                .chamadas
                .lock()
                .expect("as chamadas")
                .is_empty()
        );
    }

    #[test]
    fn a_renovacao_leva_o_token_da_pessoa_e_o_sid() {
        let (contexto, _) = contexto(ApiFalsa::default(), credencial());
        let resposta =
            contexto.responder(br#"{"pedido":"renovar","token":"tok_da_sessao"}"#, fernanda);
        assert_eq!(
            resposta,
            Resposta::Renovada {
                expira_em: "2026-11-28T05:00:00.000Z".into()
            }
        );
        assert_eq!(
            contexto
                .api
                .chamadas
                .lock()
                .expect("as chamadas")
                .as_slice(),
            [format!(
                "renovar {SERVIDOR} tok_da_sessao S-1-5-21-1-2-3-1104"
            )]
        );
    }

    #[test]
    fn o_token_do_aparelho_recusado_acorda_o_laco() {
        let api = ApiFalsa {
            recusar: Some(Falha {
                decisao: Decisao::TokenRecusado,
                status: 401,
                problema: Some(Box::new(Problema {
                    tipo: "urn:grafite:problema:token-da-aba-recusado".into(),
                    detalhe: None,
                    motivo: None,
                    motivo_do_fim: None,
                })),
                para_o_log: "401 token-da-aba-recusado".into(),
            }),
            ..ApiFalsa::default()
        };
        let (contexto, sinais) = contexto(api, credencial());
        let resposta = contexto.responder(br#"{"pedido":"sessao-pelo-windows"}"#, fernanda);
        assert!(matches!(
            resposta,
            Resposta::Recusa(Recusa { codigo: Some(codigo), .. }) if codigo == "token-da-aba-recusado"
        ));
        assert_eq!(sinais.try_recv().ok(), Some(Sinal::Acordar));
    }

    #[test]
    fn a_recusa_da_pessoa_nao_acorda_o_laco() {
        let api = ApiFalsa {
            recusar: Some(Falha {
                decisao: Decisao::DaPessoa("pessoa-recusada-na-aba".into()),
                status: 403,
                problema: None,
                para_o_log: "403".into(),
            }),
            ..ApiFalsa::default()
        };
        let (contexto, sinais) = contexto(api, credencial());
        contexto.responder(br#"{"pedido":"sessao-pelo-windows"}"#, fernanda);
        assert!(sinais.try_recv().is_err());
    }
}
