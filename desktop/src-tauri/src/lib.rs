use std::fs::OpenOptions;
use std::io::Write;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, RunEvent};

const DEFAULT_PORT: u16 = 47832;

struct ServerProcess(Mutex<Option<Child>>);

fn exe_dir() -> PathBuf {
    let mut path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    path.pop();
    path
}

fn append_log(data_dir: &Path, message: &str) {
    let path = data_dir.join("desktop.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

fn js_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn set_splash_status(app: &AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!(
            "var el=document.getElementById('status'); if(el) el.textContent={};",
            js_string(message)
        ));
    }
}

fn origin(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_millis(200),
    )
    .is_ok()
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if port_open(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn find_sidecar_node() -> Result<PathBuf, String> {
    let dir = exe_dir();
    for name in ["node", "node.exe"] {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut matches: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.is_file()
                    && path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name.starts_with("node-"))
            })
            .collect();
        matches.sort();
        if let Some(path) = matches.into_iter().next() {
            return Ok(path);
        }
    }
    Err(format!(
        "Bundled Node runtime missing next to {}. Expected node or node-<target-triple>.",
        dir.display()
    ))
}

fn find_server_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(root) = app.path().resource_dir() {
        candidates.push(root.join("resources/server"));
        candidates.push(root.join("server"));
    }
    for key in ["resources/server", "server"] {
        if let Ok(resolved) = app.path().resolve(key, BaseDirectory::Resource) {
            candidates.push(resolved);
        }
    }
    let exe = exe_dir();
    candidates.push(exe.join("../Resources/resources/server"));
    candidates.push(exe.join("../Resources/server"));

    let mut looked = Vec::new();
    for dir in candidates {
        looked.push(dir.display().to_string());
        if dir.join("server.js").is_file() {
            return Ok(dir.canonicalize().unwrap_or(dir));
        }
    }
    Err(format!(
        "Standalone server.js missing. Looked in: {}",
        looked.join(", ")
    ))
}

fn claim_first_launch(data_dir: &Path) -> bool {
    let marker = data_dir.join("desktop-launched");
    if marker.exists() {
        return false;
    }
    let _ = std::fs::write(&marker, b"1\n");
    true
}

fn spawn_standalone(app: &AppHandle, port: u16, data_dir: &Path) -> Result<Child, String> {
    let resource_dir = find_server_dir(app)?;
    let node = find_sidecar_node()?;
    append_log(
        data_dir,
        &format!(
            "Starting {} with {} in {}",
            node.display(),
            resource_dir.join("server.js").display(),
            resource_dir.display()
        ),
    );

    let log_path = data_dir.join("server.log");
    let log_file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|error| format!("Could not write {}: {error}", log_path.display()))?;
    let log_err = log_file
        .try_clone()
        .map_err(|error| format!("Could not clone server log: {error}"))?;

    let mut command = Command::new(&node);
    command
        .arg("server.js")
        .current_dir(&resource_dir)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOST", "127.0.0.1")
        .env("HOSTNAME", "127.0.0.1")
        .env("PROMPT_DATA_DIR", data_dir)
        .env("PROMPT_API_URL", origin(port))
        .env("PROMPT_DESKTOP", "1")
        .env("PROMPT_AUTH_ENABLED", "false")
        .env("PROMPT_NSFW_GENERATOR_ENABLED", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err));

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn().map_err(|error| {
        format!(
            "Could not spawn {}: {error}",
            node.display()
        )
    })
}

fn navigate_to_studio(app: &AppHandle, port: u16, first_launch: bool) {
    // heal=1 auto-starts Heal & ready once the connection panel mounts.
    let path = if first_launch {
        "/settings?tab=comfyui&section=connection&heal=1"
    } else {
        "/"
    };
    let href = format!("{}{path}", origin(port));
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(parsed) = href.parse() {
            if window.navigate(parsed).is_ok() {
                return;
            }
        }
        let _ = window.eval(&format!("window.location.replace({})", js_string(&href)));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // AppImage packaging strips bundled libwayland* so host Mesa/EGL matches
    // (see desktop/scripts/unbundle-appimage-wayland.sh). Do not default
    // WEBKIT_DISABLE_DMABUF_RENDERER here — that forces software compositing
    // and makes the shell feel sluggish. Users can still set it manually if
    // a host still aborts with "Could not create GBM EGL display".

    tauri::Builder::default()
        .setup(|app| {
            app.manage(ServerProcess(Mutex::new(None)));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let port = DEFAULT_PORT;
                let data_dir = match handle.path().app_data_dir() {
                    Ok(path) => path,
                    Err(error) => {
                        set_splash_status(
                            &handle,
                            &format!("Could not resolve app data dir: {error}"),
                        );
                        return;
                    }
                };
                if let Err(error) = std::fs::create_dir_all(&data_dir) {
                    set_splash_status(
                        &handle,
                        &format!("Could not create {}: {error}", data_dir.display()),
                    );
                    return;
                }
                append_log(&data_dir, &format!("Launch data dir {}", data_dir.display()));
                let first_launch = claim_first_launch(&data_dir);
                if port_open(port) {
                    append_log(&data_dir, &format!("Port {port} already open — reusing"));
                    set_splash_status(&handle, "Opening Castcut…");
                    navigate_to_studio(&handle, port, first_launch);
                    return;
                }
                set_splash_status(&handle, "Starting the local server…");
                match spawn_standalone(&handle, port, &data_dir) {
                    Ok(child) => {
                        if let Some(state) = handle.try_state::<ServerProcess>() {
                            if let Ok(mut slot) = state.0.lock() {
                                *slot = Some(child);
                            }
                        }
                        if !wait_for_port(port, Duration::from_secs(90)) {
                            let message = format!(
                                "Server did not open port {port}. See {} and {}",
                                data_dir.join("server.log").display(),
                                data_dir.join("desktop.log").display()
                            );
                            append_log(&data_dir, &message);
                            set_splash_status(&handle, &message);
                            return;
                        }
                    }
                    Err(error) => {
                        append_log(&data_dir, &error);
                        set_splash_status(&handle, &error);
                        return;
                    }
                }
                append_log(&data_dir, &format!("Server ready on {}", origin(port)));
                set_splash_status(&handle, "Opening Castcut…");
                navigate_to_studio(&handle, port, first_launch);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Castcut")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerProcess>() {
                    if let Ok(mut slot) = state.0.lock() {
                        if let Some(mut child) = slot.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
