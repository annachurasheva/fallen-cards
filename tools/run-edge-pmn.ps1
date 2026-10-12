#Requires -Version 7.0

# run-edge-pmn.ps1 — лаунчер парсера персон pamyat-naroda.ru
#
# ОСНОВАН НА РАБОЧЕЙ ВЕРСИИ: tools/run-edge-obd.ps1 (коммит 2a22593, TASK-0005)
# Единственное отличие: убран флаг --headless=new для возможности ручной капчи.

param(
    [int]$Port = 9230,
    [int]$WatchdogSeconds = 30,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ParserArgs = @()
)

$ErrorActionPreference = "Stop"

function Get-Stamp {
    "[" + (Get-Date).ToString("HH:mm:ss") + "]"
}

# ---------- 1. Edge с CDP (конфигурация из проверенного рабочего скрипта) ----------
$edgePaths = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
    Write-Error "Microsoft Edge не найден. Укажите путь вручную."
    exit 1
}

# Изолированный профиль (не пересекается с вашим основным браузером)
$ProfileDir = "$env:LOCALAPPDATA\fallen-cards-edge-pmn-profile"

# Если Edge с этим портом уже запущен — повторно не поднимаем
$cdpReady = $false
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 | Out-Null
    $cdpReady = $true
} catch { }

if (-not $cdpReady) {
    Write-Host "$(Get-Stamp) Запуск Edge: port=$Port profile=$ProfileDir"
    
    # АРГУМЕНТЫ ДОСЛОВНО ИЗ РАБОЧЕГО ВАРИАНТА OBD.
    # Флаг --headless=new УБРАН специально для ручной капчи PMN.
    Start-Process -FilePath $edge -ArgumentList @(
        "--remote-debugging-port=$Port",
        "--user-data-dir=`"$ProfileDir`"",
        "--window-size=1920,1080",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "https://pamyat-naroda.ru/"
    )
    Start-Sleep -Seconds 2
} else {
    Write-Host "$(Get-Stamp) Edge уже активен на порту $Port — подключаемся без перезапуска."
}

# ---------- 2. Пауза для ручной верификации ----------
if (-not $cdpReady) {
    Write-Host "$(Get-Stamp) ЕСЛИ ТРЕБУЕТСЯ: пройдите капчу/логин на pamyat-naroda.ru в открывшемся окне."
    Write-Host "$(Get-Stamp) Cookies сохраняются в профиль; следующий запуск входа не потребует."
    Write-Host "$(Get-Stamp) Ожидание подтверждения: нажмите Enter, чтобы продолжить (Edge не закрывать)."
    $null = Read-Host "Нажмите Enter"
}