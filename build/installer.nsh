; Custom NSIS installer script for CodeConfigHub
; Keep the visible install path aligned with the final product folder

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!macro customInit
  Push $0
  Push $1

  StrCpy $1 ""
  SetRegView 64
  ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} "$1" == ""
    ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  ${If} "$1" == ""
    SetRegView 32
    ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  ${If} "$1" == ""
    ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${EndIf}
  SetRegView 64

  ${If} "$1" != ""
    StrCpy $INSTDIR "$1"
  ${EndIf}

  ${GetFileName} "$INSTDIR" $0
  ${If} "$INSTDIR" == ""
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  ${ElseIf} $0 != "${PRODUCT_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${PRODUCT_NAME}"
  ${EndIf}
  Pop $1
  Pop $0
!macroend

Function .onVerifyInstDir
  Push $0
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "${PRODUCT_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${PRODUCT_NAME}"
  ${EndIf}
  Pop $0
FunctionEnd
