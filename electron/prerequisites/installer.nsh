; ---------------------------------------------------------------------------
; installer.nsh
;
; Custom NSIS installer hooks for AI Attendance System.
; electron-builder automatically includes this file when specified in the
; nsis.include configuration.
;
; This script hooks into the NSIS installation flow to:
;   1. Check for Microsoft Visual C++ Redistributable (2015–2022 x64)
;   2. Install it silently if not present
;   3. Create the shared ProgramData directory
;   4. Grant Modify permissions to standard users
; ---------------------------------------------------------------------------

!ifndef BUILD_UNINSTALLER
  Var PROGRAMDATA
  !include "${PROJECT_DIR}\electron\prerequisites\vcredist-prerequisites.nsh"
!endif

; ---------------------------------------------------------------------------
; customInit
; ---------------------------------------------------------------------------

!macro customInit
!ifndef BUILD_UNINSTALLER
  Call CheckAndInstallVCRedist
!endif
!macroend

; ---------------------------------------------------------------------------
; customInstall
; ---------------------------------------------------------------------------

!macro customInstall

!ifndef BUILD_UNINSTALLER

  SetShellVarContext all

  ReadEnvStr $PROGRAMDATA "PROGRAMDATA"

  ${If} $PROGRAMDATA == ""
    Abort "Unable to determine the ProgramData directory (PROGRAMDATA environment variable is missing)."
  ${EndIf}

  DetailPrint "Creating shared application data directory..."
  CreateDirectory "$PROGRAMDATA\AI Attendance System"

  DetailPrint "Granting Modify permissions to BUILTIN\Users..."
  nsExec::Exec '"$SYSDIR\icacls.exe" "$PROGRAMDATA\AI Attendance System" /grant *S-1-5-32-545:(OI)(CI)(M)'

!endif

!macroend