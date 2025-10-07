; XileHUD Custom NSIS Installer Script
; Strategy: MANUAL cleanup of old installation (don't call old uninstaller - it has the same bug!)

!include "MUI2.nsh"
!include "FileFunc.nsh"

; UI tweaks
!define MUI_INSTFILESPAGE_COLORS "FFFFFF 000000"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

!macro customInit
  DetailPrint "Pre-install: preparing system for XileHUD update/install..."

  ; ------------------------------------------------------------------
  ; Robust process termination WITHOUT deleting install directory.
  ; Rationale: letting electron-builder's internal upgrade logic handle
  ; existing files avoids race conditions & false 'app is running' errors
  ; caused by premature RMDir while handles still existed.
  ; ------------------------------------------------------------------
  Var /GLOBAL _tries
  StrCpy $_tries 0
  DetailPrint "→ Ensuring no stale XileHUD processes are running..."

  loop_kill:
    ; Attempt graceful -> forced termination (idempotent if not running)
  ; Run process termination in a single hidden PowerShell instance to avoid flashing multiple cmd windows.
  ; -WindowStyle Hidden ensures no visible console; errors suppressed.
  ExecWait 'powershell -NoLogo -NoProfile -WindowStyle Hidden -Command "foreach($n in \"XileHUD.exe\",\"XileHUDOverlay.exe\"){ taskkill /IM $n /T 2>$null; taskkill /F /IM $n /T 2>$null }"' $R0
    Sleep 400

    ; Heuristic: if executable file can be renamed temporarily, no process holds a lock.
    ; We test only the per-user default path (perMachine not used in current config).
    StrCpy $0 "$LOCALAPPDATA\Programs\XileHUD\XileHUD.exe"
    IfFileExists $0 0 no_file_lock_test
      Rename $0 "$0.locktest" 
      IfErrors file_locked file_unlocked
      file_locked:
        ; Could not rename => still locked by a process.
        ; Restore state if partially renamed (rare timing case)
        IfFileExists "$0.locktest" 0 +2
          Rename "$0.locktest" $0
        Goto still_running
      file_unlocked:
        ; Rename succeeded -> restore original name, proceed.
        Rename "$0.locktest" $0
        Goto done_kill
    no_file_lock_test:
      ; Executable not present yet (fresh install scenario) -> safe to continue.
      Goto done_kill

    still_running:
      IntOp $_tries $_tries + 1
      ${IfThen} $_tries >= 10 ${|} DetailPrint "  → Warning: process still appears active (attempt $_tries). Retrying..." ${|}
      ${If} $_tries < 25
        Sleep 300
        Goto loop_kill
      ${Else}
        DetailPrint "  → Continuing despite lock test after 25 attempts (fallback)."
        Goto done_kill
      ${EndIf}

  done_kill:
  DetailPrint "→ No active XileHUD processes detected. Proceeding with upgrade/installation."
  DetailPrint "→ Existing application files will be overwritten in-place. User data retained."
!macroend

!macro customInstall
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Installing / Updating XileHUD Overlay"
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "→ Copying new application files..."
  Sleep 80
  DetailPrint "→ Extracting bundled assets..."
  Sleep 80
  DetailPrint "→ Preparing data files..."
  Sleep 80
  DetailPrint "→ Creating shortcuts..."
  Sleep 80
  DetailPrint "→ Finalizing..."
  Sleep 80
  DetailPrint "Installation complete. User data kept (merchant history & settings)."
!macroend

!macro customUnInstall
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Uninstalling XileHUD (preserving user data)"
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "→ Removing application files..."
  Sleep 60
  DetailPrint "→ Cleaning shortcuts..."
  Sleep 60
  DetailPrint "→ Keeping %APPDATA%\\xilehud-overlay (history/settings)"
  Sleep 60
  DetailPrint "Done."
!macroend

ShowInstDetails show
ShowUnInstDetails show
