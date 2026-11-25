use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

fn decode_hex_utf8(hex: &str) -> Result<String, String> {
    if hex.len() % 2 != 0 {
        return Err("Invalid hex path length".to_string());
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for i in (0..hex.len()).step_by(2) {
        let byte = u8::from_str_radix(&hex[i..i + 2], 16)
            .map_err(|e| format!("Invalid hex in path: {}", e))?;
        bytes.push(byte);
    }
    String::from_utf8(bytes).map_err(|e| format!("Invalid UTF-8 path: {}", e))
}

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn new_silent_command(bin: &str) -> Command {
    let mut cmd = Command::new(bin);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[tauri::command]
fn check_ffmpeg_installed() -> Result<String, String> {
    match new_silent_command("ffmpeg").arg("-version").output() {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next().unwrap_or("FFmpeg is available").to_string();
                Ok(first_line)
            } else {
                Err("FFmpeg returned a non-zero exit code".to_string())
            }
        }
        Err(e) => Err(format!("FFmpeg not found in PATH: {}", e)),
    }
}

#[tauri::command]
fn probe_media_streams(path: String) -> Result<serde_json::Value, String> {
    let output = new_silent_command("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            &path,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        return Ok(serde_json::json!({ "has_video": false, "has_audio": false, "duration": 0.0, "width": 0, "height": 0 }));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap_or_default();
    let streams = parsed["streams"].as_array().cloned().unwrap_or_default();

    let mut has_video = false;
    let mut has_audio = false;
    let mut width = 0i64;
    let mut height = 0i64;

    for s in streams {
        let codec_type = s["codec_type"].as_str().unwrap_or("");
        if codec_type == "video" {
            has_video = true;
            width = s["width"].as_i64().unwrap_or(0);
            height = s["height"].as_i64().unwrap_or(0);
        } else if codec_type == "audio" {
            has_audio = true;
        }
    }

    let duration = parsed["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(serde_json::json!({
        "has_video": has_video,
        "has_audio": has_audio,
        "duration": duration,
        "width": width,
        "height": height
    }))
}

#[tauri::command]
async fn run_ffmpeg_export(args: Vec<String>) -> Result<String, String> {
    let mut cmd = new_silent_command("ffmpeg");
    cmd.args(&args);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;
    if output.status.success() {
        Ok("FFmpeg export completed successfully!".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

#[tauri::command]
fn ensure_directory(path: String) -> Result<String, String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory {}: {}", path, e))?;
    Ok(path)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<String, String> {
    let path_obj = Path::new(&path);
    if let Some(parent) = path_obj.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }
    fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write file {}: {}", path, e))?;
    Ok(path)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file {}: {}", path, e))
}

#[tauri::command]
fn save_raw_binary_file(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let hex_path = request
        .headers()
        .get("x-path-hex")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "Missing x-path-hex header".to_string())?;

    let target_path = decode_hex_utf8(hex_path)?;
    let path_obj = Path::new(&target_path);
    if let Some(parent) = path_obj.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
    }

    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => {
            let mut file = fs::File::create(&target_path)
                .map_err(|e| format!("Failed to create file {}: {}", target_path, e))?;
            file.write_all(bytes)
                .map_err(|e| format!("Failed to write file {}: {}", target_path, e))?;
            Ok(target_path)
        }
        tauri::ipc::InvokeBody::Json(val) => {
            Err(format!("Expected raw binary body, got JSON: {}", val))
        }
    }
}

#[tauri::command]
fn read_raw_binary_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read binary {}: {}", path, e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn save_video_file(path: String, data: Vec<u8>) -> Result<String, String> {
    let path_obj = Path::new(&path);
    if let Some(parent) = path_obj.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
    }

    let mut file = fs::File::create(&path)
        .map_err(|e| format!("Failed to create file at {}: {}", path, e))?;
    file.write_all(&data)
        .map_err(|e| format!("Failed to write data: {}", e))?;
    Ok(path)
}

#[tauri::command]
fn delete_temp_file(path: String) -> Result<String, String> {
    let _ = fs::remove_file(&path);
    Ok(format!("Deleted temp file: {}", path))
}

#[tauri::command]
fn list_cached_projects(cache_dir: String) -> Result<Vec<String>, String> {
    let projects_dir = Path::new(&cache_dir).join("projects");
    if !projects_dir.exists() {
        let _ = fs::create_dir_all(&projects_dir);
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects dir: {}", e))?;

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&p) {
                results.push(content);
            }
        }
    }
    Ok(results)
}

#[tauri::command]
fn delete_cached_project(cache_dir: String, project_id: String) -> Result<String, String> {
    let json_path = Path::new(&cache_dir)
        .join("projects")
        .join(format!("{}.json", project_id));
    if json_path.exists() {
        let _ = fs::remove_file(&json_path);
    }
    let media_dir = Path::new(&cache_dir).join("media").join(&project_id);
    if media_dir.exists() {
        let _ = fs::remove_dir_all(&media_dir);
    }
    Ok(format!("Deleted project {}", project_id))
}

fn dir_size_recursive(path: &Path) -> (u64, u64) {
    let mut total_bytes = 0u64;
    let mut total_files = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let (b, f) = dir_size_recursive(&p);
                total_bytes += b;
                total_files += f;
            } else if let Ok(meta) = p.metadata() {
                total_bytes += meta.len();
                total_files += 1;
            }
        }
    }
    (total_bytes, total_files)
}

#[tauri::command]
fn get_cache_stats(cache_dir: String) -> Result<serde_json::Value, String> {
    let p = PathBuf::from(&cache_dir);
    if !p.exists() {
        return Ok(serde_json::json!({ "bytes": 0, "files": 0 }));
    }
    let (bytes, files) = dir_size_recursive(&p);
    Ok(serde_json::json!({ "bytes": bytes, "files": files }))
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_file() {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    } else {
        let _ = fs::create_dir_all(p);
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_ffmpeg_installed,
            probe_media_streams,
            run_ffmpeg_export,
            ensure_directory,
            write_text_file,
            read_text_file,
            save_raw_binary_file,
            read_raw_binary_file,
            save_video_file,
            delete_temp_file,
            list_cached_projects,
            delete_cached_project,
            get_cache_stats,
            open_in_explorer
        ])
        .setup(|_app| {
            // Ensure default CineCraft directories exist on startup
            let _ = fs::create_dir_all("D:\\Editor\\downloads");
            let _ = fs::create_dir_all("D:\\Editor\\cache\\projects");
            let _ = fs::create_dir_all("D:\\Editor\\cache\\media");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CineCraft Studio");
}
