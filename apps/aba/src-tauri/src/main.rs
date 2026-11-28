// Sem a janela do console no Windows, fora do build de depuração.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    grafite_aba::rodar();
}
