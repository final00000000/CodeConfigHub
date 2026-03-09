; Custom NSIS installer script for CodeConfigHub
; Force installation into app subfolder

!include "LogicLib.nsh"

!macro customInit
  ; Set default installation directory with app subfolder
  StrCpy $INSTDIR "$PROGRAMFILES64\CodeConfigHub"
!macroend

!macro customHeader
  !system "echo NSIS custom header loaded"
!macroend
