; XileHUD Custom NSIS Installer Script
; Strategy: ALWAYS uninstall old version first (silent) preserving user data in %APPDATA%\xilehud-overlay

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Avoid built-in running process dialog (false positive due to installer exe name match)
!define DO_NOT_CHECK_RUNNING

; UI tweaks
!define MUI_INSTFILESPAGE_COLORS "FFFFFF 000000"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

!macro customInit
  DetailPrint "Pre-install: searching for previous XileHUD installation..."
  ; Potential per-user path
  StrCpy $0 "$LOCALAPPDATA\Programs\XileHUD\Uninstall XileHUD.exe"
  IfFileExists "$0" 0 +3
    DetailPrint "Found existing per-user install. Running silent uninstall..."
    ExecWait '"$0" /S'
  ; Potential per-machine 64-bit path
  StrCpy $1 "$PROGRAMFILES64\XileHUD\Uninstall XileHUD.exe"
  IfFileExists "$1" 0 +3
    DetailPrint "Found existing per-machine install. Running silent uninstall..."
    ExecWait '"$1" /S'
  ; Kill any leftover processes just in case (ignore errors)
  ExecWait 'taskkill /F /IM XileHUD.exe /T' $2
  ExecWait 'taskkill /F /IM XileHUDOverlay.exe /T' $2
  Sleep 300
!macroend

!macro customInstall
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Installing XileHUD Overlay (fresh after uninstall)"
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
