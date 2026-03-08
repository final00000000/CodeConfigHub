!macro customInit
  ; 确保默认安装路径包含应用子文件夹
  ${If} $INSTDIR == ""
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  ${EndIf}
!macroend

!macro customInstall
  ; 安装完成后创建开始菜单快捷方式的目录
  CreateDirectory "$INSTDIR"
!macroend
