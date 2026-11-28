//! A rede da aba (design, decisões 6 e 10): o estado e os eventos da API, pelo token da sessão, com o
//! `reqwest` e o schannel do Windows, e o proxy manual da pessoa. A tela não fala com a rede: o
//! estado chega a ela pelo `emit`.
//!
//! A conexão de eventos não retoma pelo `Last-Event-ID`, e por isso o estado é lido depois de ela
//! abrir, e não antes. Cada evento pede uma releitura:
//! - a resposta a uma pessoa relê na hora, e os eventos de muita gente, como a configuração e o
//!   `reiniciar`, com um atraso sorteado de até 3 s, para as abas não lerem no mesmo instante;
//! - os eventos que chegam durante o atraso viram uma leitura só, com 1 s entre duas, abaixo do
//!   limite de 120 por minuto do token;
//! - o `sessao` é o fim: a linha da sessão confere a sessão, e o 401 da renovação dá o motivo.
//!
//! A conexão que termina sem o `sessao`, como a mais antiga fechada pelo limite ou todas na
//! atualização da API, não é o fim: a aba reconecta com o atraso sorteado, e só fica sem conexão
//! pelos 30 s sem o sinal de vida. Sem a conexão, o estado é lido a cada 60 s.
//!
//! O aviso de uma resposta por ver nova espera cerca de 1 s e só aparece se a releitura seguir com
//! ela: com a conversa à vista na web, a abertura chega logo depois da mensagem.

use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tokio::sync::watch;

use crate::estado::{self, PorVer};
use crate::sessao::{Acao, Comando, UM_MINUTO};

/// Sem o sinal de vida, que vem a cada 10 s, por este tempo, a aba fica sem conexão.
pub const SEM_SINAL: Duration = Duration::from_secs(30);
/// Sem a conexão de eventos, o estado é lido a cada 60 s.
pub const RELER_SEM_CONEXAO: Duration = Duration::from_secs(60);
/// O maior atraso sorteado dos eventos de muita gente e da reconexão.
pub const ATRASO_DE_MUITOS: Duration = Duration::from_secs(3);
/// O menor intervalo entre duas leituras do estado.
pub const ENTRE_LEITURAS: Duration = Duration::from_secs(1);
/// Quanto o aviso de uma resposta nova espera a releitura.
pub const SEGURAR_O_AVISO: Duration = Duration::from_secs(1);
const PRAZO_DO_PEDIDO: Duration = Duration::from_secs(30);
const PRIMEIRA_ESPERA: Duration = Duration::from_secs(3);
const CABECALHO_DA_VERSAO: &str = "x-grafite-versao-da-aba";
const VERSAO: &str = env!("CARGO_PKG_VERSION");

/// O servidor e o token da sessão que vale agora.
#[derive(Clone, PartialEq, Eq)]
pub struct Credencial {
    pub servidor: String,
    pub token: String,
}

impl fmt::Debug for Credencial {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Credencial")
            .field("servidor", &self.servidor)
            .finish_non_exhaustive()
    }
}

/// O `GET /api/aba/estado`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDaApi {
    pub nao_lidas: Option<u32>,
    pub respostas_novas: Option<u32>,
    pub por_ver: Option<PorVer>,
    pub versao_da_configuracao: i64,
}

/// Um evento do `text/event-stream`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Evento {
    pub nome: String,
    pub dados: String,
}

/// O leitor do `text/event-stream`, pedaço a pedaço: a linha pode chegar partida, também no meio
/// de um caractere.
#[derive(Debug, Default)]
pub struct Leitor {
    pendente: Vec<u8>,
    nome: Option<String>,
    dados: Option<String>,
}

impl Leitor {
    pub fn ler(&mut self, pedaco: &[u8]) -> Vec<Evento> {
        self.pendente.extend_from_slice(pedaco);
        let mut eventos = Vec::new();
        while let Some(fim) = self.pendente.iter().position(|byte| *byte == b'\n') {
            let linha: Vec<u8> = self.pendente.drain(..=fim).collect();
            let linha = String::from_utf8_lossy(&linha[..fim]);
            let linha = linha.strip_suffix('\r').unwrap_or(&linha);
            if linha.is_empty() {
                if let Some(dados) = self.dados.take() {
                    eventos.push(Evento {
                        nome: self.nome.take().unwrap_or_else(|| "message".to_owned()),
                        dados,
                    });
                }
                self.nome = None;
                continue;
            }
            // O comentário, como o `: vivo` do sinal de vida.
            if linha.starts_with(':') {
                continue;
            }
            let (campo, valor) = linha.split_once(':').unwrap_or((linha, ""));
            let valor = valor.strip_prefix(' ').unwrap_or(valor);
            match campo {
                "event" => self.nome = Some(valor.to_owned()),
                "data" => {
                    let dados = self.dados.get_or_insert_with(String::new);
                    if !dados.is_empty() {
                        dados.push('\n');
                    }
                    dados.push_str(valor);
                }
                _ => {}
            }
        }
        eventos
    }
}

/// O que a aba faz com um evento.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reacao {
    /// Relê o estado; com muita gente, depois do atraso sorteado. A configuração, a entrada e o
    /// bloqueio também pedem ao serviço que fale com a API.
    Reler {
        de_muitos: bool,
        conferir_o_aparelho: bool,
    },
    /// A sessão terminou no servidor.
    Fim,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DadosDoEvento {
    #[serde(default)]
    de_muitos: bool,
}

pub fn reacao(evento: &Evento) -> Reacao {
    let de_muitos = serde_json::from_str::<DadosDoEvento>(&evento.dados)
        .map(|dados| dados.de_muitos)
        .unwrap_or(false);
    match evento.nome.as_str() {
        "sessao" => Reacao::Fim,
        "reiniciar" => Reacao::Reler {
            de_muitos: true,
            conferir_o_aparelho: false,
        },
        "configuracao-da-aba.mudou" | "entrada-da-aba.mudou" | "bloqueio-da-aba.mudou" => {
            Reacao::Reler {
                de_muitos,
                conferir_o_aparelho: true,
            }
        }
        _ => Reacao::Reler {
            de_muitos,
            conferir_o_aparelho: false,
        },
    }
}

/// Quando ler o estado: os pedidos que chegam antes da leitura viram uma só, e duas leituras
/// ficam a 1 s uma da outra.
#[derive(Debug, Default)]
pub struct Agenda {
    pub ler_em: Option<Instant>,
    pub ultima: Option<Instant>,
}

impl Agenda {
    pub fn pedir(&mut self, agora: Instant, atraso: Duration) {
        let mut em = agora + atraso;
        if let Some(ultima) = self.ultima {
            em = em.max(ultima + ENTRE_LEITURAS);
        }
        self.ler_em = Some(self.ler_em.map_or(em, |ja| ja.min(em)));
    }

    pub fn devida(&self, agora: Instant) -> bool {
        self.ler_em.is_some_and(|em| agora >= em)
    }

    pub fn lida(&mut self, agora: Instant) {
        self.ultima = Some(agora);
        self.ler_em = None;
    }
}

/// A resposta por ver nova, que a aba ainda não mostrou, espera a releitura.
pub fn segurar_o_aviso(mostrado: Option<&PorVer>, lido: Option<&PorVer>) -> bool {
    let Some(ultima) = lido.and_then(|por_ver| por_ver.ultima.as_ref()) else {
        return false;
    };
    mostrado.and_then(|por_ver| por_ver.ultima.as_ref()) != Some(ultima)
}

/// Um atraso sorteado entre zero e `ate`.
pub fn sorteio(ate: Duration) -> Duration {
    static ESTADO: AtomicU64 = AtomicU64::new(0);
    let mut x = ESTADO.load(Ordering::Relaxed);
    if x == 0 {
        let agora = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |desde| desde.as_nanos() as u64);
        x = (agora ^ u64::from(std::process::id()).rotate_left(32)) | 1;
    }
    // O xorshift: basta para espalhar as abas, e não é segredo.
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    ESTADO.store(x, Ordering::Relaxed);
    let ate = u64::try_from(ate.as_millis()).unwrap_or(u64::MAX);
    Duration::from_millis(if ate == 0 { 0 } else { x % (ate + 1) })
}

/// A espera da reconexão depois de uma falha: 3 s, 6 s, 12 s… até 1 minuto, com o sorteio.
pub fn espera_da_falha(falhas: u32) -> Duration {
    let dobro = PRIMEIRA_ESPERA.saturating_mul(1 << falhas.saturating_sub(1).min(5));
    dobro.min(UM_MINUTO) + sorteio(ATRASO_DE_MUITOS)
}

/// O cliente da aba: o schannel, sem seguir redirecionamento, e o proxy manual da pessoa. Sem o
/// prazo total, que cortaria a conexão de eventos: o prazo vai em cada leitura do estado.
pub fn cliente() -> reqwest::Result<reqwest::Client> {
    let construtor = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(format!("grafite-aba/{VERSAO}"))
        .no_proxy();
    #[cfg(windows)]
    let construtor = match grafite_aba_pipe::proxy::da_pessoa() {
        Some(proxy) => construtor.proxy(reqwest::Proxy::custom(move |url| {
            proxy
                .para(url.scheme(), url.host_str()?, url.port_or_known_default())
                .and_then(|servidor| reqwest::Url::parse(&servidor).ok())
        })),
        None => construtor,
    };
    construtor.build()
}

fn espera_do_429(resposta: &reqwest::Response) -> Duration {
    resposta
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|valor| valor.to_str().ok())
        .and_then(|valor| valor.trim().parse::<u64>().ok())
        .map_or(UM_MINUTO, |segundos| {
            Duration::from_secs(segundos.clamp(1, 3_600))
        })
}

enum Falha {
    /// O 401 e o 403: a linha da sessão confere.
    Sessao,
    Esperar(Duration),
    Rede,
}

/// A linha da rede: com a credencial, a conexão e o estado; sem ela, o estado de fábrica.
pub fn iniciar(
    app: AppHandle,
    credenciais: watch::Receiver<Option<Credencial>>,
    comandos: Sender<Comando>,
) {
    tauri::async_runtime::spawn(laco(app, credenciais, comandos));
}

async fn laco(
    app: AppHandle,
    mut credenciais: watch::Receiver<Option<Credencial>>,
    comandos: Sender<Comando>,
) {
    let Ok(cliente) = cliente() else {
        return;
    };
    loop {
        let atual = credenciais.borrow_and_update().clone();
        let Some(credencial) = atual else {
            de_fabrica(&app);
            if credenciais.changed().await.is_err() {
                return;
            }
            continue;
        };
        let mut conexao = Conexao::nova(&app, &cliente, credencial, &comandos);
        tokio::select! {
            mudou = credenciais.changed() => {
                if mudou.is_err() {
                    return;
                }
            }
            () = conexao.rodar() => {
                // A sessão recusada: a linha da sessão confere, e a credencial muda; sem mudar em
                // 1 minuto, a mesma tenta de novo.
                if let Ok(Err(_)) = tokio::time::timeout(UM_MINUTO, credenciais.changed()).await {
                    return;
                }
            }
        }
    }
}

/// Sem a sessão, nada da pessoa fica no estado.
fn de_fabrica(app: &AppHandle) {
    let fabrica = estado::EstadoDaAba::default();
    estado::mudar(app, |atual| {
        atual.nao_lidas = fabrica.nao_lidas;
        atual.respostas_novas = fabrica.respostas_novas;
        atual.por_ver = fabrica.por_ver;
        atual.rede_caida = false;
        atual.recompor();
    });
}

struct Conexao<'a> {
    app: &'a AppHandle,
    cliente: &'a reqwest::Client,
    credencial: Credencial,
    comandos: &'a Sender<Comando>,
    agenda: Agenda,
    ultimo_sinal: Instant,
    caida: bool,
    mostrado: Option<PorVer>,
    confirmando: bool,
    falhas: u32,
}

impl<'a> Conexao<'a> {
    fn nova(
        app: &'a AppHandle,
        cliente: &'a reqwest::Client,
        credencial: Credencial,
        comandos: &'a Sender<Comando>,
    ) -> Self {
        let mostrado = app
            .try_state::<estado::Estado>()
            .and_then(|estado| estado.0.lock().ok().and_then(|atual| atual.por_ver.clone()));
        Self {
            app,
            cliente,
            credencial,
            comandos,
            agenda: Agenda::default(),
            ultimo_sinal: Instant::now(),
            caida: false,
            mostrado,
            confirmando: false,
            falhas: 0,
        }
    }

    fn endereco(&self, caminho: &str) -> String {
        format!("{}/api/aba/{caminho}", self.credencial.servidor)
    }

    fn enviar(&self, acao: Acao) {
        let _ = self.comandos.send(Comando::sem_resposta(acao));
    }

    async fn rodar(&mut self) {
        let mut fluxo: Option<reqwest::Response> = None;
        let mut leitor = Leitor::default();
        let mut conectar_em = Instant::now();
        loop {
            let agora = Instant::now();
            self.marcar_a_queda(agora);
            if fluxo.is_none() && agora >= conectar_em {
                match self.abrir_os_eventos().await {
                    Ok(resposta) => {
                        fluxo = Some(resposta);
                        leitor = Leitor::default();
                        self.falhas = 0;
                        self.ultimo_sinal = Instant::now();
                        self.marcar_a_queda(Instant::now());
                        // O estado depois de a conexão abrir: o que mudou antes dela está nele.
                        self.agenda.pedir(Instant::now(), Duration::ZERO);
                    }
                    Err(Falha::Sessao) => return self.enviar(Acao::ConferirASessao),
                    Err(Falha::Esperar(espera)) => conectar_em = Instant::now() + espera,
                    Err(Falha::Rede) => {
                        self.falhas += 1;
                        conectar_em = Instant::now() + espera_da_falha(self.falhas);
                    }
                }
            }
            let agora = Instant::now();
            if fluxo.is_none()
                && self.agenda.ler_em.is_none()
                && self
                    .agenda
                    .ultima
                    .is_none_or(|ultima| agora >= ultima + RELER_SEM_CONEXAO)
            {
                self.agenda.pedir(agora, Duration::ZERO);
            }
            if self.agenda.devida(agora) && !self.ler_o_estado().await {
                return self.enviar(Acao::ConferirASessao);
            }
            let prazo = self.prazo(fluxo.is_some(), conectar_em);
            let mut fechar = false;
            if let Some(resposta) = fluxo.as_mut() {
                tokio::select! {
                    pedaco = resposta.chunk() => match pedaco {
                        Ok(Some(bytes)) => {
                            self.ultimo_sinal = Instant::now();
                            for evento in leitor.ler(&bytes) {
                                if !self.reagir(&evento) {
                                    return self.enviar(Acao::ConferirASessao);
                                }
                            }
                        }
                        // A conexão que terminou sem o `sessao` não é o fim: outra, com o atraso.
                        _ => {
                            fechar = true;
                            conectar_em = Instant::now() + sorteio(ATRASO_DE_MUITOS);
                        }
                    },
                    () = tokio::time::sleep_until(prazo.into()) => {
                        // A conexão muda, sem o sinal de vida: outra, já.
                        if Instant::now() >= self.ultimo_sinal + SEM_SINAL {
                            fechar = true;
                            conectar_em = Instant::now();
                        }
                    }
                }
            } else {
                tokio::time::sleep_until(prazo.into()).await;
            }
            if fechar {
                fluxo = None;
            }
        }
    }

    /// O próximo momento de olhar: a leitura agendada, a reconexão, a releitura sem a conexão e o
    /// fim do sinal de vida.
    fn prazo(&self, conectado: bool, conectar_em: Instant) -> Instant {
        let agora = Instant::now();
        let mut prazo = agora + RELER_SEM_CONEXAO;
        if let Some(em) = self.agenda.ler_em {
            prazo = prazo.min(em);
        }
        if !conectado {
            prazo = prazo.min(conectar_em);
            if let Some(ultima) = self.agenda.ultima {
                prazo = prazo.min(ultima + RELER_SEM_CONEXAO);
            }
        }
        if !self.caida {
            prazo = prazo.min(self.ultimo_sinal + SEM_SINAL);
        }
        prazo.max(agora + Duration::from_millis(50))
    }

    fn marcar_a_queda(&mut self, agora: Instant) {
        let caida = agora >= self.ultimo_sinal + SEM_SINAL;
        if caida != self.caida {
            self.caida = caida;
            estado::mudar(self.app, |atual| {
                atual.rede_caida = caida;
                atual.recompor();
            });
        }
    }

    async fn abrir_os_eventos(&self) -> Result<reqwest::Response, Falha> {
        let resposta = self
            .cliente
            .get(self.endereco("eventos"))
            .bearer_auth(&self.credencial.token)
            .header(reqwest::header::ACCEPT, "text/event-stream")
            .header(CABECALHO_DA_VERSAO, VERSAO)
            .send()
            .await
            .map_err(|_| Falha::Rede)?;
        match resposta.status().as_u16() {
            200..=299 => Ok(resposta),
            401 | 403 => Err(Falha::Sessao),
            429 => Err(Falha::Esperar(espera_do_429(&resposta))),
            _ => Err(Falha::Rede),
        }
    }

    /// Lê o estado e o passa à tela. Devolve `false` com a sessão recusada.
    async fn ler_o_estado(&mut self) -> bool {
        let enviado = self
            .cliente
            .get(self.endereco("estado"))
            .bearer_auth(&self.credencial.token)
            .header(CABECALHO_DA_VERSAO, VERSAO)
            .timeout(PRAZO_DO_PEDIDO)
            .send()
            .await;
        let agora = Instant::now();
        self.agenda.lida(agora);
        let Ok(resposta) = enviado else {
            return true;
        };
        match resposta.status().as_u16() {
            200..=299 => {
                if let Ok(lido) = resposta.json::<EstadoDaApi>().await {
                    self.aplicar(lido);
                }
                true
            }
            401 | 403 => false,
            429 => {
                let espera = espera_do_429(&resposta);
                self.agenda.ler_em = Some(agora + espera);
                true
            }
            _ => true,
        }
    }

    fn aplicar(&mut self, lido: EstadoDaApi) {
        let por_ver = if !self.confirmando
            && segurar_o_aviso(self.mostrado.as_ref(), lido.por_ver.as_ref())
        {
            // A resposta nova espera a releitura, e o resto do estado vai já.
            self.confirmando = true;
            self.agenda.pedir(Instant::now(), SEGURAR_O_AVISO);
            self.mostrado.clone()
        } else {
            self.confirmando = false;
            self.mostrado = lido.por_ver.clone();
            lido.por_ver.clone()
        };
        estado::mudar(self.app, |atual| {
            atual.nao_lidas = lido.nao_lidas;
            atual.respostas_novas = lido.respostas_novas;
            atual.por_ver = por_ver;
        });
        self.enviar(Acao::Versao(lido.versao_da_configuracao));
    }

    /// Devolve `false` no fim da sessão.
    fn reagir(&mut self, evento: &Evento) -> bool {
        match reacao(evento) {
            Reacao::Fim => false,
            Reacao::Reler {
                de_muitos,
                conferir_o_aparelho,
            } => {
                let atraso = if de_muitos {
                    sorteio(ATRASO_DE_MUITOS)
                } else {
                    Duration::ZERO
                };
                self.agenda.pedir(Instant::now(), atraso);
                if conferir_o_aparelho {
                    self.enviar(Acao::ConferirOAparelho);
                }
                true
            }
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::estado::RespostaPorVer;

    #[test]
    fn o_leitor_junta_a_linha_partida_e_pula_o_sinal_de_vida() {
        let mut leitor = Leitor::default();
        assert!(
            leitor
                .ler(b"retry: 3000\n\n: vivo\n\nevent: chat.mu")
                .is_empty()
        );
        let eventos = leitor
            .ler("dou\ndata: {\"deMuitos\":true}\n\nevent: sessao\r\ndata: {}\r\n\r\n".as_bytes());
        assert_eq!(
            eventos,
            [
                Evento {
                    nome: "chat.mudou".into(),
                    dados: r#"{"deMuitos":true}"#.into()
                },
                Evento {
                    nome: "sessao".into(),
                    dados: "{}".into()
                }
            ]
        );
    }

    #[test]
    fn o_leitor_aguenta_o_caractere_partido() {
        let mut leitor = Leitor::default();
        let texto = "event: chamados.mudaram\ndata: {\"alvo\":\"Atenção\"}\n\n".as_bytes();
        let meio = texto.iter().position(|byte| *byte == 0xC3).expect("o ç") + 1;
        assert!(leitor.ler(&texto[..meio]).is_empty());
        let eventos = leitor.ler(&texto[meio..]);
        assert_eq!(eventos[0].dados, r#"{"alvo":"Atenção"}"#);
    }

    fn evento(nome: &str, dados: &str) -> Evento {
        Evento {
            nome: nome.into(),
            dados: dados.into(),
        }
    }

    #[test]
    fn so_os_de_muita_gente_esperam_o_sorteio() {
        assert_eq!(
            reacao(&evento("chamados.mudaram", r#"{"deMuitos":false}"#)),
            Reacao::Reler {
                de_muitos: false,
                conferir_o_aparelho: false
            }
        );
        assert_eq!(
            reacao(&evento("chat.mudou", r#"{"deMuitos":true}"#)),
            Reacao::Reler {
                de_muitos: true,
                conferir_o_aparelho: false
            }
        );
        assert_eq!(
            reacao(&evento("reiniciar", r#"{"deMuitos":true}"#)),
            Reacao::Reler {
                de_muitos: true,
                conferir_o_aparelho: false
            }
        );
        assert_eq!(
            reacao(&evento("configuracao-da-aba.mudou", r#"{"deMuitos":true}"#)),
            Reacao::Reler {
                de_muitos: true,
                conferir_o_aparelho: true
            }
        );
        assert_eq!(reacao(&evento("sessao", "{}")), Reacao::Fim);
    }

    #[test]
    fn os_eventos_durante_o_atraso_viram_uma_leitura() {
        let agora = Instant::now();
        let mut agenda = Agenda::default();
        agenda.pedir(agora, Duration::from_secs(2));
        agenda.pedir(agora + Duration::from_millis(500), Duration::from_secs(2));
        assert_eq!(agenda.ler_em, Some(agora + Duration::from_secs(2)));
        // A resposta a uma pessoa não espera o sorteio dos outros.
        agenda.pedir(agora + Duration::from_millis(700), Duration::ZERO);
        assert_eq!(agenda.ler_em, Some(agora + Duration::from_millis(700)));
        agenda.lida(agora + Duration::from_millis(700));
        // E duas leituras ficam a 1 s uma da outra.
        agenda.pedir(agora + Duration::from_millis(800), Duration::ZERO);
        assert_eq!(agenda.ler_em, Some(agora + Duration::from_millis(1_700)));
        assert!(!agenda.devida(agora + Duration::from_millis(1_000)));
        assert!(agenda.devida(agora + Duration::from_millis(1_700)));
    }

    fn por_ver(numero: u32) -> PorVer {
        PorVer {
            quantas: 1,
            ultima: Some(RespostaPorVer {
                quem: "Ana Souza".into(),
                numero,
                titulo: "Impressora sem papel".into(),
                momento: "2026-11-28T09:21:00.000Z".into(),
            }),
        }
    }

    #[test]
    fn so_a_resposta_nova_espera_a_releitura() {
        assert!(segurar_o_aviso(None, Some(&por_ver(1041))));
        assert!(segurar_o_aviso(Some(&por_ver(1040)), Some(&por_ver(1041))));
        assert!(!segurar_o_aviso(Some(&por_ver(1041)), Some(&por_ver(1041))));
        assert!(!segurar_o_aviso(Some(&por_ver(1041)), None));
        assert!(!segurar_o_aviso(
            None,
            Some(&PorVer {
                quantas: 0,
                ultima: None
            })
        ));
    }

    #[test]
    fn o_estado_da_api() {
        let lido: EstadoDaApi = serde_json::from_value(serde_json::json!({
            "naoLidas": 2,
            "respostasNovas": null,
            "porVer": {
                "quantas": 1,
                "ultima": {
                    "quem": "Ana Souza",
                    "numero": 1041,
                    "titulo": "Impressora sem papel",
                    "momento": "2026-11-28T09:21:00.000Z",
                },
            },
            "versaoDaConfiguracao": 3,
        }))
        .expect("o estado");
        assert_eq!(lido.nao_lidas, Some(2));
        assert_eq!(lido.respostas_novas, None);
        assert_eq!(lido.por_ver, Some(por_ver(1041)));
        assert_eq!(lido.versao_da_configuracao, 3);
    }

    #[test]
    fn o_sorteio_fica_no_limite() {
        for _ in 0..200 {
            assert!(sorteio(ATRASO_DE_MUITOS) <= ATRASO_DE_MUITOS);
        }
        assert_eq!(sorteio(Duration::ZERO), Duration::ZERO);
    }

    #[test]
    fn a_reconexao_espera_mais_a_cada_falha_ate_1_minuto() {
        assert!(espera_da_falha(1) >= Duration::from_secs(3));
        assert!(espera_da_falha(1) <= Duration::from_secs(6));
        assert!(espera_da_falha(3) >= Duration::from_secs(12));
        assert!(espera_da_falha(30) <= UM_MINUTO + ATRASO_DE_MUITOS);
    }

    #[test]
    fn o_debug_da_credencial_esconde_o_token() {
        let credencial = Credencial {
            servidor: "https://grafite.empresa.local".into(),
            token: "tok_segredo".into(),
        };
        assert!(!format!("{credencial:?}").contains("tok_segredo"));
    }
}
