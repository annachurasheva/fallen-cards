#Requires -Version 7.0
# run-edge-obd.ps1 — лаунчер парсера OBD (TASK-0005, п.7; TASK-0009: рабочий ввод-вывод)
#
# 1) Запускает внешний Edge с CDP-портом (профиль изолирован, браузер остаётся открытым).
# 2) Запускает node scripts/parse-obd.js и пробрасывает его stdout/stderr в консоль
#    без буферизации: два постоянных асинхронных задания ReadLineAsync() + WaitAny(500).
# 3) Сторож: тишина >= WatchdogSeconds по отметке последнего вывода → строка активности.
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
$lastOutputAt = Get-Date

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null

Write-Host "$(Get-Stamp) Парсер запущен: node parse-obd.js $($ParserArgs -join ' ')"

# Два ПОСТОЯННЫХ асинхронных чтения построчно. Каждое завершённое задание
# даёт очередную строку (null = поток закрыт); затем то же задание запускается снова.
$taskOut = $proc.StandardOutput.ReadLineAsync()
$taskErr = $proc.StandardError.ReadLineAsync()
$outOpen = $true
$errOpen = $true

# Активное множество заданий (исключаем закрытые потоки из ожидания)
$activeTasks = @($taskOut, $taskErr)

while ($true) {
    # Ждём любую новую строку либо таймаут 500 мс (для проверки сторожа)
    $completedIndex = [System.Threading.Tasks.Task]::WaitAny($activeTasks, 500)

    if ($completedIndex -ge 0) {
        $completedTask = $activeTasks[$completedIndex]

        if ($completedTask -eq $taskOut) {
            $line = $taskOut.Result
            if ($null -ne $line) {
                Write-Host $line
                $lastOutputAt = Get-Date
                $taskOut = $proc.StandardOutput.ReadLineAsync() # постоянное задание перезапускаем
            } else {
                $outOpen = $false # stdout закрыт — исключаем из WaitAny
            }
        } elseif ($completedTask -eq $taskErr) {
            $line = $taskErr.Result
            if ($null -ne $line) {
                Write-Host $line
                $lastOutputAt = Get-Date
                $taskErr = $proc.StandardError.ReadLineAsync()
            } else {
                $errOpen = $false
            }
        }

        # Пересобрать активное множество (после закрытия потока или перезапуска задания)
        $activeTasks = @()
        if ($outOpen) { $activeTasks += $taskOut }
        if ($errOpen) { $activeTasks += $taskErr }
    } else {
        # Таймаут WaitAny (-1): проверка сторожа по отметке последнего вывода
        if (((Get-Date) - $lastOutputAt).TotalSeconds -ge $WatchdogSeconds) {
            Write-Host "$(Get-Stamp) Процесс активен. Ожидание ответа от obd-memorial.ru..."
            $lastOutputAt = Get-Date # не спамить каждые 500 мс
        }
    }

    # Оба потока закрыты и процесс завершился → выход из цикла
    if ((-not $outOpen) -and (-not $errOpen) -and $proc.WaitForExit(0)) {
        break
    }
    # Защита: процесс умер, но хвостовые строки ещё могут читаться из открытых потоков —
    # цикл продолжается, пока хотя бы один поток открыт; если оба закрылись — выйдем выше.
    if ($proc.HasExited -and (-not $outOpen) -and (-not $errOpen)) {
        break
    }
}

# ---------- 3. Итог ----------
$stopwatch.Stop()
$elapsed = $stopwatch.Elapsed
$timeStr = "{0}м {1:D2}с" -f [int][Math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds

Write-Host "$(Get-Stamp) Процесс завершён. Код возврата: $($proc.ExitCode). Время работы: $timeStr."
exit $proc.ExitCode
