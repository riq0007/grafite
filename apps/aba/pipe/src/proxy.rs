//! O proxy do Windows (design, decisão 10): a aba usa a parte manual do proxy da pessoa
//! (`WinHttpGetIEProxyConfigForCurrentUser`), e o serviço, o da máquina
//! (`WinHttpGetDefaultProxyConfiguration`, o `netsh winhttp`), os dois com as exceções. O PAC fica
//! fora. A lista vem no formato do WinHTTP: `proxy:8080`, ou `http=proxy:8080;https=proxy:8443`.

/// O proxy de cada esquema, ou o de todos, e as exceções.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Proxy {
    servidores: Vec<(Option<String>, String)>,
    excecoes: Vec<String>,
}

impl Proxy {
    /// O proxy da lista e das exceções do WinHTTP; `None` sem nenhum servidor.
    pub fn do_texto(lista: &str, excecoes: Option<&str>) -> Option<Self> {
        let servidores: Vec<(Option<String>, String)> = itens(lista)
            .filter_map(|item| match item.split_once('=') {
                Some((esquema, servidor)) => {
                    let esquema = esquema.trim().to_ascii_lowercase();
                    // O SOCKS e o FTP ficam de fora: a aba só fala HTTP e HTTPS.
                    matches!(esquema.as_str(), "http" | "https")
                        .then(|| (Some(esquema), com_esquema(servidor.trim())))
                }
                None => Some((None, com_esquema(item))),
            })
            .filter(|(_, servidor)| servidor.len() > "http://".len())
            .collect();
        if servidores.is_empty() {
            return None;
        }
        let excecoes = excecoes
            .map(|texto| itens(texto).map(str::to_ascii_lowercase).collect())
            .unwrap_or_default();
        Some(Self {
            servidores,
            excecoes,
        })
    }

    /// O endereço do proxy para o pedido, ou `None` para ir direto.
    pub fn para(&self, esquema: &str, host: &str, porta: Option<u16>) -> Option<String> {
        let host = host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .to_ascii_lowercase();
        if self.direto(&host, porta) {
            return None;
        }
        let esquema = esquema.to_ascii_lowercase();
        self.servidores
            .iter()
            .find(|(de, _)| de.as_deref() == Some(esquema.as_str()))
            .or_else(|| self.servidores.iter().find(|(de, _)| de.is_none()))
            .map(|(_, servidor)| servidor.clone())
    }

    fn direto(&self, host: &str, porta: Option<u16>) -> bool {
        // O próprio computador nunca vai pelo proxy, como no Windows.
        if matches!(host, "localhost" | "127.0.0.1" | "::1") {
            return true;
        }
        let com_porta = porta.map(|porta| format!("{host}:{porta}"));
        self.excecoes.iter().any(|excecao| {
            if excecao == "<local>" {
                return !host.contains('.') && !host.contains(':');
            }
            let excecao = excecao
                .trim_start_matches("http://")
                .trim_start_matches("https://");
            casa(excecao, host) || com_porta.as_deref().is_some_and(|com| casa(excecao, com))
        })
    }
}

fn itens(texto: &str) -> impl Iterator<Item = &str> {
    texto
        .split(|c: char| c == ';' || c == ',' || c.is_whitespace())
        .map(str::trim)
        .filter(|item| !item.is_empty())
}

fn com_esquema(servidor: &str) -> String {
    if servidor.contains("://") {
        servidor.to_owned()
    } else {
        format!("http://{servidor}")
    }
}

/// O padrão das exceções, com o `*` valendo qualquer trecho.
fn casa(padrao: &str, texto: &str) -> bool {
    let partes: Vec<&str> = padrao.split('*').collect();
    let [primeira, meio @ .., ultima] = partes.as_slice() else {
        return padrao == texto;
    };
    let Some(mut resto) = texto.strip_prefix(primeira) else {
        return false;
    };
    for parte in meio {
        match resto.find(parte) {
            Some(lugar) => resto = &resto[lugar + parte.len()..],
            None => return false,
        }
    }
    resto.len() >= ultima.len() && resto.ends_with(ultima)
}

/// O proxy manual da pessoa que roda a aba.
#[cfg(windows)]
pub fn da_pessoa() -> Option<Proxy> {
    use windows::Win32::Networking::WinHttp::{
        WINHTTP_CURRENT_USER_IE_PROXY_CONFIG, WinHttpGetIEProxyConfigForCurrentUser,
    };

    let mut configuracao = WINHTTP_CURRENT_USER_IE_PROXY_CONFIG::default();
    // SAFETY: a estrutura é nossa; o Windows a preenche com textos que soltamos abaixo.
    unsafe { WinHttpGetIEProxyConfigForCurrentUser(&raw mut configuracao) }.ok()?;
    let lista = nativo::tomar(configuracao.lpszProxy);
    let excecoes = nativo::tomar(configuracao.lpszProxyBypass);
    let _ = nativo::tomar(configuracao.lpszAutoConfigUrl);
    Proxy::do_texto(&lista?, excecoes.as_deref())
}

/// O proxy da máquina, do `netsh winhttp`, para o serviço.
#[cfg(windows)]
pub fn da_maquina() -> Option<Proxy> {
    use windows::Win32::Networking::WinHttp::{
        WINHTTP_ACCESS_TYPE_NAMED_PROXY, WINHTTP_PROXY_INFO, WinHttpGetDefaultProxyConfiguration,
    };

    let mut info = WINHTTP_PROXY_INFO::default();
    // SAFETY: a estrutura é nossa; o Windows a preenche com textos que soltamos abaixo.
    unsafe { WinHttpGetDefaultProxyConfiguration(&raw mut info) }.ok()?;
    let lista = nativo::tomar(info.lpszProxy);
    let excecoes = nativo::tomar(info.lpszProxyBypass);
    if info.dwAccessType != WINHTTP_ACCESS_TYPE_NAMED_PROXY {
        return None;
    }
    Proxy::do_texto(&lista?, excecoes.as_deref())
}

#[cfg(windows)]
mod nativo {
    use windows::Win32::Foundation::{GlobalFree, HGLOBAL};
    use windows::core::PWSTR;

    /// O texto que o WinHTTP alocou, solto depois de lido.
    pub fn tomar(texto: PWSTR) -> Option<String> {
        if texto.is_null() {
            return None;
        }
        // SAFETY: o WinHTTP devolve o texto terminado em zero, alocado pelo GlobalAlloc, e ele é
        // lido uma vez só, antes de solto.
        unsafe {
            let lido = texto.to_string().ok();
            let _ = GlobalFree(Some(HGLOBAL(texto.0.cast())));
            lido
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn um_servidor_para_todos() {
        let proxy = Proxy::do_texto("proxy.empresa.local:3128", None).expect("o proxy");
        assert_eq!(
            proxy
                .para("https", "grafite.empresa.local", Some(443))
                .as_deref(),
            Some("http://proxy.empresa.local:3128")
        );
        assert_eq!(
            proxy
                .para("http", "grafite.empresa.local", Some(80))
                .as_deref(),
            Some("http://proxy.empresa.local:3128")
        );
    }

    #[test]
    fn um_servidor_por_esquema() {
        let proxy = Proxy::do_texto("http=web:8080;https=seguro:8443;socks=meias:1080", None)
            .expect("o proxy");
        assert_eq!(
            proxy
                .para("https", "grafite.empresa.local", None)
                .as_deref(),
            Some("http://seguro:8443")
        );
        assert_eq!(
            proxy.para("http", "grafite.empresa.local", None).as_deref(),
            Some("http://web:8080")
        );
        let so_http = Proxy::do_texto("http=web:8080", None).expect("o proxy");
        assert_eq!(so_http.para("https", "grafite.empresa.local", None), None);
    }

    #[test]
    fn as_excecoes_vao_direto() {
        let proxy = Proxy::do_texto(
            "proxy:3128",
            Some("*.empresa.local; 10.*;<local>;intranet:8443"),
        )
        .expect("o proxy");
        assert_eq!(
            proxy.para("https", "grafite.empresa.local", Some(443)),
            None
        );
        assert_eq!(proxy.para("https", "10.0.0.20", Some(443)), None);
        assert_eq!(proxy.para("https", "grafite", Some(443)), None, "o <local>");
        assert_eq!(proxy.para("https", "intranet", Some(8443)), None);
        assert!(
            proxy
                .para("https", "grafite.exemplo.com", Some(443))
                .is_some()
        );
        assert!(
            proxy
                .para("https", "intranet.exemplo.com", Some(8443))
                .is_some()
        );
    }

    #[test]
    fn o_proprio_computador_vai_direto() {
        let proxy = Proxy::do_texto("proxy:3128", None).expect("o proxy");
        assert_eq!(proxy.para("http", "localhost", Some(5173)), None);
        assert_eq!(proxy.para("http", "127.0.0.1", Some(5173)), None);
        assert_eq!(proxy.para("http", "[::1]", Some(5173)), None);
    }

    #[test]
    fn sem_servidor_nao_ha_proxy() {
        assert_eq!(Proxy::do_texto("", Some("<local>")), None);
        assert_eq!(Proxy::do_texto("socks=meias:1080", None), None);
    }

    #[test]
    fn o_padrao_com_asterisco() {
        assert!(casa("*.empresa.local", "grafite.empresa.local"));
        assert!(!casa("*.empresa.local", "empresa.local"));
        assert!(casa("10.*.*.1", "10.2.3.1"));
        assert!(casa("grafite", "grafite"));
        assert!(!casa("grafite", "grafite2"));
        assert!(casa("*", "qualquer"));
    }
}
