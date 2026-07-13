; ---------------------------------------------------------------------------
; vcredist-prerequisites.nsh
;
; NSIS include script for detecting and silently installing the
; Microsoft Visual C++ Redistributable (2015–2022 x64).
;
; Detection uses the Windows registry, checking for the official
; VC++ 14.x runtime installation key. This is more reliable than
; checking for individual DLLs.
;
; Registry key: HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64
;
; On 64-bit Windows, SetRegView 64 is always applied to ensure the
; native 64-bit registry is read, avoiding WOW64 redirection which
; could cause false negatives if the installer runs as a 32-bit process.
;
; Compatible with Windows 10 and Windows 11.
;
; Called during installer initialization via customInit.
; ---------------------------------------------------------------------------

!ifndef VCREDIST_PREREQUISITES_NSH
!define VCREDIST_PREREQUISITES_NSH

!include "LogicLib.nsh"
!include "x64.nsh"

; Registry key for VC++ 2015-2022 x64 runtime
; Microsoft writes "Installed" DWORD = 1 under this key when VC++ 14.x is present.
; This key exists on both Windows 10 and Windows 11.
!define VCREDIST_REG_KEY "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64"
!define VCREDIST_REG_VALUE "Installed"

; ---------------------------------------------------------------------------
; Function: CheckAndInstallVCRedist
;
; Checks registry for installed VC++ runtime. If missing, runs the bundled
; VC_redist.x64.exe silently. Aborts installation on failure.
;
; Exit code handling (per Microsoft documentation):
;   0    — Success
;   1638 — Another version already installed
;   3010 — Success, reboot required
;   5100 — Newer version already installed (older installer blocked)
;
; All other exit codes are treated as failure.
; ---------------------------------------------------------------------------
Function CheckAndInstallVCRedist
  DetailPrint "Checking prerequisites..."
  DetailPrint "Checking Microsoft Visual C++ Runtime..."

  ; Always set 64-bit registry view on x64 Windows.
  ; This is critical: if the NSIS installer runs as a 32-bit process (which
  ; is common — NSIS is 32-bit by default), Windows will redirect registry
  ; reads to WOW6432Node unless we explicitly request the 64-bit view.
  ; The VC++ x64 runtime writes to the native 64-bit registry, so reading
  ; from WOW6432Node would cause a false negative (runtime appears missing
  ; when it is actually installed).
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  ; Check if VC++ runtime is installed
  ReadRegDWORD $0 HKLM "${VCREDIST_REG_KEY}" "${VCREDIST_REG_VALUE}"

  ${If} $0 == 1
    ; Runtime is installed — read version for logging
    ReadRegDWORD $1 HKLM "${VCREDIST_REG_KEY}" "Major"
    ReadRegDWORD $2 HKLM "${VCREDIST_REG_KEY}" "Minor"
    ReadRegDWORD $3 HKLM "${VCREDIST_REG_KEY}" "Bld"
    DetailPrint "Microsoft Visual C++ Runtime detected (version $1.$2.$3)."
    DetailPrint "Skipping prerequisite installation."
    
    ; Restore registry view
    ${If} ${RunningX64}
      SetRegView lastused
    ${EndIf}
    Return
  ${EndIf}

  ; Restore registry view before installing
  ${If} ${RunningX64}
    SetRegView lastused
  ${EndIf}

  ; VC++ runtime is NOT installed — install it silently
  DetailPrint "Microsoft Visual C++ Runtime not detected."
  DetailPrint "Installing Microsoft Visual C++ Redistributable..."

  ; Extract the redistributable from the installer to a temp location
  ; PROJECT_DIR is defined by electron-builder as the project root directory.
  ; The VC_redist.x64.exe is copied to electron/runtime-build/tools/ during
  ; the build pipeline (npm run package:prerequisites).
  File "/oname=$PLUGINSDIR\VC_redist.x64.exe" "${PROJECT_DIR}\electron\runtime-build\tools\VC_redist.x64.exe"

  DetailPrint "Installer path: $PLUGINSDIR\VC_redist.x64.exe"

  ; Run the VC++ installer silently
  ; /install   — Install mode
  ; /quiet     — No UI
  ; /norestart — Do not restart (we handle this)
  ExecWait '"$PLUGINSDIR\VC_redist.x64.exe" /install /quiet /norestart' $0

  DetailPrint "VC++ Redistributable installer exited with code: $0"

  ; Handle documented exit codes
  ${If} $0 == 0
    DetailPrint "Microsoft Visual C++ Redistributable installed successfully."
  ${ElseIf} $0 == 1638
    ; 1638 = ERROR_INSTALL_ALREADY_RUNNING or another version already installed
    DetailPrint "Microsoft Visual C++ Redistributable: another version already present."
  ${ElseIf} $0 == 3010
    ; 3010 = success, but reboot required
    DetailPrint "Microsoft Visual C++ Redistributable installed successfully (reboot may be required)."
  ${ElseIf} $0 == 5100
    ; 5100 = a newer version is already installed (older installer blocked)
    DetailPrint "Microsoft Visual C++ Redistributable: newer version already installed."
  ${Else}
    ; Unrecognized exit code — treat as failure
    DetailPrint "ERROR: Microsoft Visual C++ Redistributable installation failed."
    DetailPrint "Exit code: $0"
    DetailPrint "Installer path: $PLUGINSDIR\VC_redist.x64.exe"
    DetailPrint "Installation aborted."
    MessageBox MB_OK|MB_ICONSTOP "Failed to install the Microsoft Visual C++ Redistributable.$\r$\n$\r$\nExit code: $0$\r$\n$\r$\nPlease install it manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe$\r$\n$\r$\nThen re-run this installer."
    Abort "Prerequisite installation failed."
  ${EndIf}

  ; Clean up temp file
  Delete "$PLUGINSDIR\VC_redist.x64.exe"

FunctionEnd

!endif ; VCREDIST_PREREQUISITES_NSH
