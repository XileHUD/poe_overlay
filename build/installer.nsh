; XileHUD Custom NSIS Installer Script
; Strategy: MANUAL cleanup of old installation (don't call old uninstaller - it has the same bug!)

!include "MUI2.nsh"
!include "FileFunc.nsh"

; UI tweaks
!define MUI_INSTFILESPAGE_COLORS "FFFFFF 000000"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

!macro customInit
  DetailPrint "Pre-install: cleaning up any previous XileHUD installation..."
  
  ; Kill any running processes FIRST (both old and new exe names)
  DetailPrint "→ Stopping any running XileHUD processes..."
  ExecWait 'taskkill /F /IM XileHUD.exe /T' $R0
  ExecWait 'taskkill /F /IM XileHUDOverlay.exe /T' $R0
  Sleep 800
  
  ; Manually delete old installation files (per-user location)
  StrCpy $0 "$LOCALAPPDATA\Programs\XileHUD"
  IfFileExists "$0\*.*" 0 skip_user_cleanup
    DetailPrint "→ Removing old per-user installation..."
    RMDir /r "$0"
    Delete "$DESKTOP\XileHUD.lnk"
    Delete "$SMPROGRAMS\XileHUD.lnk"
  skip_user_cleanup:
  
  ; Manually delete old installation files (per-machine location)
  StrCpy $1 "$PROGRAMFILES64\XileHUD"
  IfFileExists "$1\*.*" 0 skip_machine_cleanup
    DetailPrint "→ Removing old per-machine installation..."
    RMDir /r "$1"
  skip_machine_cleanup:
  
  Sleep 300
  DetailPrint "Ready to install fresh version..."
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
