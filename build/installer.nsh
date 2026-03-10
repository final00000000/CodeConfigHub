; Custom NSIS installer script for CodeConfigHub
; Keep the visible install path aligned with the final product folder

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!macro customInit
  Push $0
  ${GetFileName} "$INSTDIR" $0
  ${If} "$INSTDIR" == ""
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  ${ElseIf} $0 != "${PRODUCT_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${PRODUCT_NAME}"
  ${EndIf}
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
