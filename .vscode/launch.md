## 1. Edge CDP (обязательный предварительный шаг)

Терминал PowerShell:

    powershell -File tools/run-edge-obd.ps1

Проверить: http://127.0.0.1:9226/json/version

## 2. Dry-run (без браузера)

    node scripts/parse-obd.js --input=obd_primary_urls_2026-10-04-test.txt --dry-run

## 3. Боевой прогон

    node scripts/parse-obd.js --input=obd_primary_urls_2026-10-04-test.txt
    node scripts/parse-obd.js --input=obd_primary_urls_2026-10-04-test.txt --limit=10

## 4. Объекты захоронений

    node scripts/parse-obd-objects.js --input=objects.txt

## 5. Нормализация словарей мест

    node scripts/normalize.js --input=obd_primary_urls_2026-10-04-test.txt

## launch.json (референс)

{
"version": "0.2.0",
"configurations": [
{
"type": "node",
"request": "launch",
"name": "parse-obd (dry-run)",
"program": "${workspaceFolder}/scripts/parse-obd.js",
      "console": "integratedTerminal",
      "args": ["--input=obd_primary_urls_2026-10-04-test.txt", "--dry-run"]
    },
    {
      "type": "node",
      "request": "launch",
      "name": "parse-obd (full)",
      "program": "${workspaceFolder}/scripts/parse-obd.js",
"console": "integratedTerminal",
"args": ["--input=obd_primary_urls_2026-10-04-test.txt"]
},
{
"type": "node",
"request": "launch",
"name": "normalize",
"program": "${workspaceFolder}/scripts/normalize.js",
"console": "integratedTerminal",
"args": ["--input=obd_primary_urls_2026-10-04-test.txt"]
}
]
}
