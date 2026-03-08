!include "FileFunc.nsh"
!include "LogicLib.nsh"
!insertmacro GetFileName

!macro customHeader
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryLeave
!macroend

Function DirectoryLeave
  ${GetFileName} "$INSTDIR" $R0
  ${If} $R0 != "${PRODUCT_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${PRODUCT_NAME}"
  ${EndIf}
FunctionEnd
