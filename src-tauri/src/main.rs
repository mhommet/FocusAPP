// FocusApp - Tauri 2.0 Desktop Application
// Minimal backend - all logic is in the external Rust Axum API
//
// Debug Guide:
// - Build with `cargo tauri build --debug` to enable console output
// - Check %APPDATA%/com.focusapp.frontend for any app data files
// - Common issues: file paths, permissions, missing resources

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::panic;

/// Initialize the application with proper error handling.
/// This function runs before Tauri starts to catch early errors.
fn initialize_app() -> Result<(), Box<dyn std::error::Error>> {
    // Set up panic hook for better error messages in debug builds
    #[cfg(debug_assertions)]
    {
        panic::set_hook(Box::new(|panic_info| {
            eprintln!("=== PANIC DETECTED ===");
            eprintln!("{}", panic_info);
            if let Some(location) = panic_info.location() {
                eprintln!("Location: {}:{}:{}",
                    location.file(),
                    location.line(),
                    location.column()
                );
            }
            eprintln!("======================");
        }));
    }

    // Log startup in debug mode
    #[cfg(debug_assertions)]
    {
        eprintln!("=== FocusApp Starting ===");
        eprintln!("Debug mode enabled");
        if let Ok(exe_path) = std::env::current_exe() {
            eprintln!("Executable path: {:?}", exe_path);
        }
        if let Ok(cwd) = std::env::current_dir() {
            eprintln!("Current directory: {:?}", cwd);
        }
    }

    Ok(())
}

fn main() {
    // Run initialization and catch any errors before Tauri starts
    if let Err(e) = initialize_app() {
        eprintln!("Initialization error: {:?}", e);
        #[cfg(debug_assertions)]
        {
            // In debug mode, wait for user to see the error
            eprintln!("Press Enter to exit...");
            let mut input = String::new();
            let _ = std::io::stdin().read_line(&mut input);
        }
        std::process::exit(1);
    }

    // Build and run Tauri application
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            eprintln!("Tauri setup complete");
            Ok(())
        })
        .run(tauri::generate_context!());

    // Handle Tauri errors
    if let Err(e) = result {
        eprintln!("Tauri error: {:?}", e);
        #[cfg(debug_assertions)]
        {
            eprintln!("Press Enter to exit...");
            let mut input = String::new();
            let _ = std::io::stdin().read_line(&mut input);
        }
        std::process::exit(1);
    }
}
