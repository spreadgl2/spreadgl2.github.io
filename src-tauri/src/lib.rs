use serde::Serialize;
use std::{
  fs::File,
  io::Read,
  path::Path,
  sync::Mutex,
};
use tauri::{Emitter, Manager, State};

const TREE_EXTS: &[&str] = &["tree", "trees", "nex", "nexus"];
const MAX_TREE_BYTES: u64 = 128 * 1024 * 1024;

fn is_tree_path(path: &str) -> bool {
  Path::new(path)
    .extension()
    .and_then(|extension| extension.to_str())
    .is_some_and(|extension| TREE_EXTS.contains(&extension.to_ascii_lowercase().as_str()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedTreeFile {
  path: String,
  text: Option<String>,
  error: Option<String>,
}

struct PendingTreeFile(Mutex<Option<OpenedTreeFile>>);

fn read_opened_tree(path: &Path) -> Result<(String, String), String> {
  if !is_tree_path(&path.to_string_lossy()) {
    return Err("Unsupported tree file extension.".into());
  }
  let original_metadata = std::fs::symlink_metadata(path).map_err(|_| "Could not open the tree file.")?;
  if original_metadata.file_type().is_symlink() {
    return Err("Symbolic links are not accepted for associated tree files.".into());
  }
  let canonical = path.canonicalize().map_err(|_| "Could not resolve the tree file path.")?;
  let metadata = canonical.metadata().map_err(|_| "Could not inspect the tree file.")?;
  if !metadata.is_file() {
    return Err("The selected tree path is not a regular file.".into());
  }
  if metadata.len() > MAX_TREE_BYTES {
    return Err("Tree files must be 128 MiB or smaller.".into());
  }

  let file = File::open(&canonical).map_err(|_| "Could not open the tree file.")?;
  let mut bytes = Vec::with_capacity(metadata.len() as usize);
  file
    .take(MAX_TREE_BYTES + 1)
    .read_to_end(&mut bytes)
    .map_err(|_| "Could not read the tree file.")?;
  if bytes.len() as u64 > MAX_TREE_BYTES {
    return Err("Tree files must be 128 MiB or smaller.".into());
  }
  let text = String::from_utf8(bytes).map_err(|_| "Tree files must contain valid UTF-8 text.")?;
  Ok((canonical.to_string_lossy().into_owned(), text))
}

fn emit_open_path(app: &tauri::AppHandle, path: &str) {
  let payload = match read_opened_tree(Path::new(path)) {
    Ok((canonical, text)) => OpenedTreeFile {
      path: canonical,
      text: Some(text),
      error: None,
    },
    Err(error) => OpenedTreeFile {
      path: path.to_owned(),
      text: None,
      error: Some(error),
    },
  };
  if let Ok(mut pending) = app.state::<PendingTreeFile>().0.lock() {
    *pending = Some(payload.clone());
  }
  let _ = app.emit("opened-tree-file", payload);
}

#[tauri::command]
fn take_pending_tree_file(state: State<'_, PendingTreeFile>) -> Option<OpenedTreeFile> {
  state.0.lock().ok()?.take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(PendingTreeFile(Mutex::new(None)))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(
      tauri_plugin_single_instance::init(|app, argv, _cwd| {
        // A second launch on Windows/Linux forwards its argv here.
        for arg in argv.iter().skip(1) {
          if is_tree_path(arg) {
            emit_open_path(app, arg);
            break;
          }
        }
      }),
    )
    .invoke_handler(tauri::generate_handler![take_pending_tree_file])
    .setup(|app| {
      #[cfg(desktop)]
      build_menu(app)?;

      // Windows/Linux: OS passes the double-clicked file as a CLI argument.
      // macOS uses RunEvent::Opened (handled below), so skip there.
      #[cfg(not(target_os = "macos"))]
      {
        let args: Vec<String> = std::env::args().collect();
        if let Some(path) = args.iter().skip(1).find(|a| is_tree_path(a)) {
          let handle = app.handle().clone();
          let path = path.clone();
          // Defer one tick so the frontend WebView has time to mount.
          std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            emit_open_path(&handle, &path);
          });
        }
      }

      Ok(())
    })
    .on_menu_event(|app, event| {
      let _ = app.emit("menu-action", event.id().as_ref());
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|app, event| {
      // macOS: double-clicking a .tree file in Finder fires RunEvent::Opened.
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Opened { urls } = event {
        for url in urls {
          let raw = url.to_string();
          let path = if raw.starts_with("file://") {
            match url.to_file_path() {
              Ok(p) => p.to_string_lossy().into_owned(),
              Err(_) => continue,
            }
          } else {
            raw
          };
          if is_tree_path(&path) {
            emit_open_path(app, &path);
          }
        }
      }
      let _ = event;
    });
}

#[cfg(test)]
mod tests {
  use super::is_tree_path;

  #[test]
  fn accepts_only_supported_tree_extensions() {
    assert!(is_tree_path("sample.TREE"));
    assert!(is_tree_path("sample.nexus"));
    assert!(!is_tree_path("sample.tree.txt"));
    assert!(!is_tree_path("sample.spreadgl2.json"));
  }
}

#[cfg(desktop)]
fn build_menu(app: &tauri::App) -> tauri::Result<()> {
  use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};

  // macOS promotes the FIRST submenu to the app-menu slot (titled with the app name).
  // Placing a conventional app-menu submenu first ensures "File" renders as a visible label.
  let app_menu = SubmenuBuilder::new(app, "SpreadGL2")
    .item(&PredefinedMenuItem::about(app, None, None)?)
    .separator()
    .item(&PredefinedMenuItem::services(app, None)?)
    .separator()
    .item(&PredefinedMenuItem::hide(app, None)?)
    .item(&PredefinedMenuItem::hide_others(app, None)?)
    .item(&PredefinedMenuItem::show_all(app, None)?)
    .separator()
    .item(&PredefinedMenuItem::quit(app, None)?)
    .build()?;

  let open = MenuItemBuilder::with_id("file:open", "Open…")
    .accelerator("CmdOrCtrl+O")
    .build(app)?;
  let save = MenuItemBuilder::with_id("file:save-project", "Save Project")
    .accelerator("CmdOrCtrl+S")
    .build(app)?;
  let export = MenuItemBuilder::with_id("file:export", "Export…")
    .accelerator("CmdOrCtrl+E")
    .build(app)?;

  let file = SubmenuBuilder::new(app, "File")
    .item(&open)
    .separator()
    .item(&save)
    .item(&export)
    .separator()
    .item(&PredefinedMenuItem::close_window(app, None)?)
    .build()?;

  let edit = SubmenuBuilder::new(app, "Edit")
    .item(&PredefinedMenuItem::undo(app, None)?)
    .item(&PredefinedMenuItem::redo(app, None)?)
    .separator()
    .item(&PredefinedMenuItem::cut(app, None)?)
    .item(&PredefinedMenuItem::copy(app, None)?)
    .item(&PredefinedMenuItem::paste(app, None)?)
    .item(&PredefinedMenuItem::select_all(app, None)?)
    .build()?;

  let style = MenuItemBuilder::with_id("view:style", "Style Panel")
    .accelerator("T")
    .build(app)?;
  let layers = MenuItemBuilder::with_id("view:layers", "Layers Panel")
    .accelerator("L")
    .build(app)?;
  let filter = MenuItemBuilder::with_id("view:filter", "Filter Panel")
    .accelerator("F")
    .build(app)?;
  let export_panel = MenuItemBuilder::with_id("view:export", "Export Panel")
    .accelerator("E")
    .build(app)?;
  let settings = MenuItemBuilder::with_id("view:settings", "Settings")
    .accelerator("Comma")
    .build(app)?;

  let view = SubmenuBuilder::new(app, "View")
    .item(&style)
    .item(&layers)
    .item(&filter)
    .item(&export_panel)
    .item(&settings)
    .build()?;

  let keyboard_help = MenuItemBuilder::with_id("help:keyboard-shortcuts", "Keyboard Shortcuts")
    .accelerator("?")
    .build(app)?;
  let about = PredefinedMenuItem::about(app, None, None)?;

  let help = SubmenuBuilder::new(app, "Help")
    .item(&keyboard_help)
    .separator()
    .item(&about)
    .build()?;

  let menu = MenuBuilder::new(app)
    .item(&app_menu)
    .item(&file)
    .item(&edit)
    .item(&view)
    .item(&help)
    .build()?;

  app.set_menu(menu)?;
  Ok(())
}
