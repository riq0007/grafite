//! O lado nativo da aba (change aba-dos-colaboradores, design, decisão 1): a janela da tela, os
//! comandos que ela chama e, nas tarefas seguintes, a conversa com o serviço pelo pipe.

/// Abre a aba e fica nela até o Windows encerrar o programa.
pub fn rodar() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("a aba não abriu");
}
