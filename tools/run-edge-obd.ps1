#Requires -Version 7.0
# run-edge-obd.ps1 — лаунчер парсера OBD (TASK-0005, п.7; TASK-0007: асинхронное чтение)
#
# 1) Запускает внешний Edge с CDP-портом (профиль изолирован, браузер остаётся открытым).
# 2) Запускает node scripts/parse-obd.js и пробрасывает его stdout в консоль
#    без буферизации через асинхронные обработчики OutputDataReceived/ErrorDataReceived.
# 3) Сторож: таймер по отметке последнего вывода; тишина >30 секунд → строка активности.
# 4) По завершении печатает код возврата и общее время работы.
#
# ПРИМЕРЫ:
#   pwsh -File tools/run-edge-obd.ps1 --input=links_id_658.txt
#   pwsh -File tools/run-edge-obd.ps1 -Port 9227 -- --input=file.txt --limit=50

param(
    [int]$Port = 9226,
    [int]$WatchdogSeconds = 30,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ParserArgs = @()
)

$ErrorActionPreference = "Stop"

function Get-Stamp {
    "[" + (Get-Date).ToString("HH:mm:ss") + "]"
}

# ---------- 1. Edge с CDP ----------
$edgePaths = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
    Write-Error "Microsoft Edge не найден. Укажите путь вручную."
    exit 1
}

$ProfileDir = "$env:LOCALAPPDATA\fallen-cards-edge-profile"

# Если Edge с этим портом уже запущен — повторно не поднимаем
$cdpReady = $false
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2 | Out-Null
    $cdpReady = $true
} catch { }

if (-not $cdpReady) {
    Write-Host "$(Get-Stamp) Запуск Edge: port=$Port profile=$ProfileDir"
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
    Start-Sleep -Seconds 2
} else {
    Write-Host "$(Get-Stamp) Edge уже активен на порту $Port — подключаемся без перезапуска."
}

# ---------- 2. Запуск парсера, асинхронный проброс stdout/stderr ----------
$repoRoot = Split-Path -Parent $PSScriptRoot
$parserScript = Join-Path $repoRoot "scripts\parse-obd.js"

if ($ParserArgs.Count -eq 0) {
    Write-Host "$(Get-Stamp) Не переданы аргументы парсеру (--input=...). Пример:"
    Write-Host "    pwsh -File tools/run-edge-obd.ps1 --input=имя.txt"
    exit 1
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = ('"{0}" {1}' -f $parserScript, ($ParserArgs -join " "))
$psi.WorkingDirectory = $repoRoot
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

# Отметка последнего вывода — обновляется из событийных обработчиков
$script:lastOutputAt = Get-Date

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi

$outHandler = [System.Diagnostics.DataReceivedEventHandler] {
    param($sender, $e)
    if ($e.Data -ne $null) {
        Write-Host $e.Data
        $script:lastOutputAt = Get-Date
    }
}
$errHandler = [System.Diagnostics.DataReceivedEventHandler] {
    param($sender, $e)
    if ($e.Data -ne $null) {
        Write-Host $e.Data
        $script:lastOutputAt = Get-Date
    }
}

Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $outHandler | Out-Null
Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action $errHandler | Out-Null

$proc.Start() | Out-Null
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()

Write-Host "$(Get-Stamp) Парсер запущен: node parse-obd.js $($ParserArgs -join ' ')"

# ---------- 3. Сторож: тишина более WatchdogSeconds → строка активности ----------
while (-not $proc.WaitForExit(1000)) {
    if (((Get-Date) - $script:lastOutputAt).TotalSeconds -ge $WatchdogSeconds) {
        Write-Host "$(Get-Stamp) Процесс активен. Ожидание ответа от obd-memorial.ru..."
        $script:lastOutputAt = Get-Date # не спамить каждую секунду
    }
}

# Дочитать остаток асинхронных потоков до завершения событий
Start-Sleep -Milliseconds 200
Unregister-Event * -ErrorAction SilentlyContinue

# ---------- 4. Итог ----------
$stopwatch.Stop()
$elapsed = $stopwatch.Elapsed
$timeStr = "{0}м {1:D2}с" -f [int][Math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds

Write-Host "$(Get-Stamp) Процесс завершён. Код возврата: $($proc.ExitCode). Время работы: $timeStr."
exit $proc.ExitCode