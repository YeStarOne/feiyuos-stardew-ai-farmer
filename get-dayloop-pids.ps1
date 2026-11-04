# 列出所有 day-loop 的 node 进程 PID (day-loop.mjs 启动查重用)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*day-loop*' } |
  Select-Object -ExpandProperty ProcessId
