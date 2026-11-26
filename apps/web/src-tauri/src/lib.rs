use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

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

struct ExportProcessState {
    active_pid: Arc<Mutex<Option<u32>>>,
    cancel_requested: Arc<AtomicBool>,
}

impl Default for ExportProcessState {
    fn default() -> Self {
        Self {
            active_pid: Arc::new(Mutex::new(None)),
            cancel_requested: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = new_silent_command("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
}

fn parse_ffprobe_rate(rate_str: &str) -> f64 {
    if let Some((num_s, den_s)) = rate_str.split_once('/') {
        let num = num_s.trim().parse::<f64>().unwrap_or(0.0);
        let den = den_s.trim().parse::<f64>().unwrap_or(1.0);
        if den > 0.0 { num / den } else { 0.0 }
    } else {
        rate_str.trim().parse::<f64>().unwrap_or(0.0)
    }
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
fn get_ffmpeg_capabilities() -> serde_json::Value {
    let enc_out = new_silent_command("ffmpeg")
        .args(["-hide_banner", "-encoders"])
        .output();
    let flt_out = new_silent_command("ffmpeg")
        .args(["-hide_banner", "-filters"])
        .output();

    let enc_str = enc_out
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();
    let flt_str = flt_out
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default();

    serde_json::json!({
        "libx264": enc_str.contains("libx264"),
        "libx265": enc_str.contains("libx265"),
        "prores_ks": enc_str.contains("prores_ks"),
        "h264_nvenc": enc_str.contains("h264_nvenc"),
        "hevc_nvenc": enc_str.contains("hevc_nvenc"),
        "h264_qsv": enc_str.contains("h264_qsv"),
        "h264_amf": enc_str.contains("h264_amf"),
        "has_psnr": flt_str.contains(" psnr "),
        "has_ssim": flt_str.contains(" ssim "),
        "has_vmaf": flt_str.contains(" libvmaf "),
        "has_zscale": flt_str.contains(" zscale ")
    })
}

fn run_ffprobe_json(path: &str) -> Result<serde_json::Value, String> {
    let output = new_silent_command("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        return Err("ffprobe exited with failure".to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse ffprobe JSON: {}", e))
}

#[tauri::command]
fn probe_media_streams(path: String) -> Result<serde_json::Value, String> {
    let parsed = match run_ffprobe_json(&path) {
        Ok(v) => v,
        Err(_) => {
            return Ok(serde_json::json!({
                "has_video": false,
                "has_audio": false,
                "duration": 0.0,
                "width": 0,
                "height": 0
            }));
        }
    };

    let streams = parsed["streams"].as_array().cloned().unwrap_or_default();

    let mut has_video = false;
    let mut has_audio = false;
    let mut width = 0i64;
    let mut height = 0i64;
    let mut codec_name = String::new();
    let mut pix_fmt = String::new();
    let mut r_frame_rate = String::new();
    let mut avg_frame_rate = String::new();
    let mut fps = 0.0f64;
    let mut nb_frames = 0i64;
    let mut color_space = String::new();
    let mut color_primaries = String::new();
    let mut color_transfer = String::new();
    let mut video_duration = 0.0f64;
    let mut audio_duration = 0.0f64;
    let mut audio_codec = String::new();
    let mut audio_sample_rate = 0i64;
    let mut audio_channels = 0i64;

    for s in streams {
        let codec_type = s["codec_type"].as_str().unwrap_or("");
        if codec_type == "video" && !has_video {
            has_video = true;
            width = s["width"].as_i64().unwrap_or(0);
            height = s["height"].as_i64().unwrap_or(0);
            codec_name = s["codec_name"].as_str().unwrap_or("").to_string();
            pix_fmt = s["pix_fmt"].as_str().unwrap_or("").to_string();
            r_frame_rate = s["r_frame_rate"].as_str().unwrap_or("").to_string();
            avg_frame_rate = s["avg_frame_rate"].as_str().unwrap_or("").to_string();
            fps = parse_ffprobe_rate(&avg_frame_rate);
            if fps <= 0.0 {
                fps = parse_ffprobe_rate(&r_frame_rate);
            }
            nb_frames = s["nb_frames"]
                .as_str()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            color_space = s["color_space"].as_str().unwrap_or("").to_string();
            color_primaries = s["color_primaries"].as_str().unwrap_or("").to_string();
            color_transfer = s["color_transfer"].as_str().unwrap_or("").to_string();
            video_duration = s["duration"]
                .as_str()
                .and_then(|v| v.parse::<f64>().ok())
                .unwrap_or(0.0);
        } else if codec_type == "audio" && !has_audio {
            has_audio = true;
            audio_codec = s["codec_name"].as_str().unwrap_or("").to_string();
            audio_sample_rate = s["sample_rate"]
                .as_str()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);
            audio_channels = s["channels"].as_i64().unwrap_or(0);
            audio_duration = s["duration"]
                .as_str()
                .and_then(|v| v.parse::<f64>().ok())
                .unwrap_or(0.0);
        }
    }

    let format_duration = parsed["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);
    let bit_rate = parsed["format"]["bit_rate"]
        .as_str()
        .and_then(|b| b.parse::<i64>().ok())
        .unwrap_or(0);
    let file_size = parsed["format"]["size"]
        .as_str()
        .and_then(|b| b.parse::<i64>().ok())
        .unwrap_or(0);

    Ok(serde_json::json!({
        "has_video": has_video,
        "has_audio": has_audio,
        "duration": if format_duration > 0.0 { format_duration } else { video_duration },
        "video_duration": video_duration,
        "audio_duration": audio_duration,
        "width": width,
        "height": height,
        "codec_name": codec_name,
        "pix_fmt": pix_fmt,
        "r_frame_rate": r_frame_rate,
        "avg_frame_rate": avg_frame_rate,
        "fps": fps,
        "nb_frames": nb_frames,
        "bit_rate": bit_rate,
        "file_size": file_size,
        "color_space": color_space,
        "color_primaries": color_primaries,
        "color_transfer": color_transfer,
        "audio_codec": audio_codec,
        "audio_sample_rate": audio_sample_rate,
        "audio_channels": audio_channels
    }))
}

#[tauri::command]
fn validate_exported_video(
    output_path: String,
    reference_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut probe = probe_media_streams(output_path.clone())?;
    let v_dur = probe["video_duration"].as_f64().unwrap_or(0.0);
    let a_dur = probe["audio_duration"].as_f64().unwrap_or(0.0);
    let audio_sync_delta_sec = if v_dur > 0.0 && a_dur > 0.0 {
        (v_dur - a_dur).abs()
    } else {
        0.0
    };

    let mut ssim_avg: Option<f64> = None;
    let mut psnr_avg: Option<f64> = None;

    if let Some(ref_p) = reference_path {
        if Path::new(&ref_p).exists() && Path::new(&output_path).exists() {
            let metric_out = new_silent_command("ffmpeg")
                .args([
                    "-i",
                    &output_path,
                    "-i",
                    &ref_p,
                    "-lavfi",
                    "[0:v][1:v]ssim=shortest=1:stats_file=-;[0:v][1:v]psnr=shortest=1:stats_file=-",
                    "-f",
                    "null",
                    "-",
                ])
                .output();
            if let Ok(out) = metric_out {
                let stderr = String::from_utf8_lossy(&out.stderr);
                for line in stderr.lines() {
                    if let Some(idx) = line.find("All:") {
                        let tail = &line[idx + 4..];
                        if line.contains("SSIM") {
                            if let Some(val_str) = tail.split_whitespace().next() {
                                ssim_avg = val_str.parse::<f64>().ok();
                            }
                        }
                    }
                    if line.contains("PSNR") {
                        if let Some(idx) = line.find("average:") {
                            let tail = &line[idx + 8..];
                            if let Some(val_str) = tail.split_whitespace().next() {
                                psnr_avg = val_str.parse::<f64>().ok();
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(obj) = probe.as_object_mut() {
        obj.insert("audio_sync_delta_sec".to_string(), serde_json::json!(audio_sync_delta_sec));
        obj.insert("ssim_avg".to_string(), serde_json::json!(ssim_avg));
        obj.insert("psnr_avg".to_string(), serde_json::json!(psnr_avg));
    }
    Ok(probe)
}

#[tauri::command]
fn cancel_ffmpeg_export(state: tauri::State<'_, ExportProcessState>) -> Result<(), String> {
    state.cancel_requested.store(true, Ordering::SeqCst);
    let pid_opt = {
        let guard = state.active_pid.lock().map_err(|e| e.to_string())?;
        *guard
    };
    if let Some(pid) = pid_opt {
        kill_process_tree(pid);
    }
    Ok(())
}

#[tauri::command]
async fn run_ffmpeg_export(
    app: tauri::AppHandle,
    state: tauri::State<'_, ExportProcessState>,
    args: Vec<String>,
) -> Result<String, String> {
    state.cancel_requested.store(false, Ordering::SeqCst);
    let active_pid_ref = Arc::clone(&state.active_pid);
    let cancel_flag_ref = Arc::clone(&state.cancel_requested);

    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = new_silent_command("ffmpeg");
        cmd.args(&args)
            .args(["-progress", "pipe:1", "-nostats"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

        let pid = child.id();
        if let Ok(mut guard) = active_pid_ref.lock() {
            *guard = Some(pid);
        }

        let stderr_handle = child.stderr.take().map(|err_pipe| {
            std::thread::spawn(move || {
                let mut reader = BufReader::new(err_pipe);
                let mut err_buf = String::new();
                let mut line = String::new();
                while let Ok(n) = reader.read_line(&mut line) {
                    if n == 0 {
                        break;
                    }
                    err_buf.push_str(&line);
                    line.clear();
                }
                err_buf
            })
        });

        if let Some(stdout_pipe) = child.stdout.take() {
            let mut reader = BufReader::new(stdout_pipe);
            let mut line = String::new();
            let mut last_out_ms = 0i64;
            let mut last_speed = String::new();
            while let Ok(n) = reader.read_line(&mut line) {
                if n == 0 {
                    break;
                }
                let trimmed = line.trim();
                if let Some(us_str) = trimmed.strip_prefix("out_time_us=") {
                    if let Ok(us) = us_str.parse::<i64>() {
                        last_out_ms = us / 1000;
                    }
                } else if let Some(sp) = trimmed.strip_prefix("speed=") {
                    last_speed = sp.to_string();
                } else if trimmed.starts_with("progress=") {
                    let _ = app.emit(
                        "ffmpeg-export-progress",
                        serde_json::json!({
                            "out_time_ms": last_out_ms,
                            "speed": last_speed,
                            "status": trimmed.strip_prefix("progress=").unwrap_or("")
                        }),
                    );
                }
                if cancel_flag_ref.load(Ordering::SeqCst) {
                    kill_process_tree(pid);
                    break;
                }
                line.clear();
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("Failed waiting for FFmpeg: {}", e))?;
        if let Ok(mut guard) = active_pid_ref.lock() {
            *guard = None;
        }
        let stderr_text = stderr_handle
            .and_then(|h| h.join().ok())
            .unwrap_or_default();

        if cancel_flag_ref.load(Ordering::SeqCst) {
            return Err("Export cancelled by user".to_string());
        }

        if status.success() {
            Ok("FFmpeg export completed successfully!".to_string())
        } else {
            Err(format!("FFmpeg error: {}", stderr_text))
        }
    })
    .await
    .map_err(|e| format!("Export worker join error: {}", e))?
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

    #[cfg(target_os = "windows")]
    {
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
    }

    #[cfg(target_os = "macos")]
    {
        if p.is_file() {
            Command::new("open")
                .args(["-R", &path])
                .spawn()
                .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
        } else {
            let _ = fs::create_dir_all(p);
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let target = if p.is_file() {
            p.parent().unwrap_or(p)
        } else {
            let _ = fs::create_dir_all(p);
            p
        };
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn get_default_app_paths() -> serde_json::Value {
    #[cfg(target_os = "windows")]
    {
        // Keep D:\Editor when present or chosen, otherwise fall back cleanly to user profile directories
        if Path::new("D:\\Editor").exists() || Path::new("D:\\").exists() {
            return serde_json::json!({
                "cachePath": "D:\\Editor\\cache",
                "downloadsPath": "D:\\Editor\\downloads",
                "separator": "\\"
            });
        }
        let home = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".to_string());
        let local_app = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| home.clone());
        return serde_json::json!({
            "cachePath": format!("{}\\Winecut\\cache", local_app),
            "downloadsPath": format!("{}\\Videos\\Winecut", home),
            "separator": "\\"
        });
    }

    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        return serde_json::json!({
            "cachePath": format!("{}/Library/Caches/Winecut", home),
            "downloadsPath": format!("{}/Movies/Winecut", home),
            "separator": "/"
        });
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        return serde_json::json!({
            "cachePath": format!("{}/.cache/Winecut", home),
            "downloadsPath": format!("{}/Videos/Winecut", home),
            "separator": "/"
        });
    }
}

#[tauri::command]
fn resolve_system_font() -> String {
    let candidates: &[&str] = &[
        #[cfg(target_os = "windows")]
        "C:/Windows/Fonts/arialbd.ttf",
        #[cfg(target_os = "windows")]
        "C:/Windows/Fonts/arial.ttf",
        #[cfg(target_os = "macos")]
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        #[cfg(target_os = "macos")]
        "/System/Library/Fonts/Helvetica.ttc",
        #[cfg(target_os = "linux")]
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        #[cfg(target_os = "linux")]
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        #[cfg(target_os = "linux")]
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    ];
    for c in candidates {
        if Path::new(c).exists() {
            return (*c).to_string();
        }
    }
    String::new()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ExportProcessState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            check_ffmpeg_installed,
            get_ffmpeg_capabilities,
            probe_media_streams,
            validate_exported_video,
            cancel_ffmpeg_export,
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
            open_in_explorer,
            get_default_app_paths,
            resolve_system_font
        ])
        .setup(|_app| {
            // Ensure default Winecut directories exist on startup
            let _ = fs::create_dir_all("D:\\Editor\\downloads");
            let _ = fs::create_dir_all("D:\\Editor\\cache\\projects");
            let _ = fs::create_dir_all("D:\\Editor\\cache\\media");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Winecut");
}
