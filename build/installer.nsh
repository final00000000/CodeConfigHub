; Custom NSIS installer script for CodeConfigHub
; Force installation into app subfolder

!macro customInstall
  ; This macro runs during installation
!macroend

!macro customInit
  ; Set default installation directory with app subfolder
  StrCpy $INSTDIR "$PROGRAMFILES64\CodeConfigHub"
!macroend

; Page callback to ensure path always includes app subfolder
!macro customInstallPage
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryLeave
!macroend

Function DirectoryLeave
  ; Check if path ends with \CodeConfigHub
  StrLen $0 "$INSTDIR"
  IntOp $0 $0 - 15  ; Length of "\CodeConfigHub"
  ${If} $0 >= 0
    StrCpy $1 "$INSTDIR" 15 $0
    ${If} $1 != "\CodeConfigHub"
      StrCpy $INSTDIR "$INSTDIR\CodeConfigHub"
    ${EndIf}
  ${Else}
    StrCpy $INSTDIR "$INSTDIR\CodeConfigHub"
  ${EndIf}
FunctionEnd
