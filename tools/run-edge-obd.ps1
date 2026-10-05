# run-edge-obd.ps1 — запуск внешнего Edge с CDP-портом 9226 для парсера OBD
# (ESM, профиль изолирован; браузер остаётся открытым между прогонами)

param(
    [int]$Port = 9226,
    [string]$ProfileDir = "$env:LOCALAPPDATA\fallen-cards-edge-profile"
)

$edgePaths = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
    Write-Error "❌ Microsoft Edge не найден. Укажите путь вручную."
    exit 1
}

Write-Host "🚀 Запуск Edge: port=$Port profile=$ProfileDir"

Start-Process -FilePath $edge -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=`"$ProfileDir`"",
    "--headless=new",
    "--disable-gpu",
    "--window-size=1920,1080",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "about:blank"
)

Write-Host "✅ Edge запущен. Проверка: http://127.0.0.1:$Port/json/version"
