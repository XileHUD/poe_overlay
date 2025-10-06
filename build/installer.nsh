; XileHUD Custom NSIS Installer Script
; This script customizes the installation process with detailed progress

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Show detailed progress during installation
!define MUI_INSTFILESPAGE_COLORS "FFFFFF 000000"
!define MUI_INSTFILESPAGE_PROGRESSBAR "smooth"

; Custom install messages
!macro customInstall
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Installing XileHUD Overlay for Path of Exile 2"
  DetailPrint "════════════════════════════════════════════"
  DetailPrint ""
  
  DetailPrint "→ Installing application files..."
  Sleep 100
  
  DetailPrint "→ Extracting bundled item images (1900+ images)..."
  Sleep 100
  
  DetailPrint "→ Installing Path of Exile 2 data files..."
  Sleep 100
  
  DetailPrint "→ Setting up configuration directories..."
  Sleep 100
  
  DetailPrint "→ Creating shortcuts..."
  Sleep 100
  
  DetailPrint ""
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Installation completed successfully!"
  DetailPrint "════════════════════════════════════════════"
!macroend

; Custom uninstall messages
!macro customUnInstall
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Uninstalling XileHUD Overlay"
  DetailPrint "════════════════════════════════════════════"
  DetailPrint ""
  
  DetailPrint "→ Removing application files..."
  Sleep 50
  
  DetailPrint "→ Cleaning up shortcuts..."
  Sleep 50
  
  ; Preserve user data (settings, history)
  DetailPrint "→ Preserving user settings and merchant history..."
  DetailPrint "  (Stored in: $APPDATA\xilehud-overlay)"
  Sleep 50
  
  DetailPrint ""
  DetailPrint "════════════════════════════════════════════"
  DetailPrint "Uninstallation completed!"
  DetailPrint "Your settings and history have been preserved."
  DetailPrint "════════════════════════════════════════════"
!macroend

; Make the installer show details by default
ShowInstDetails show
ShowUnInstDetails show
