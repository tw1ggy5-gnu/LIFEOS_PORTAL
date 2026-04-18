$projectPaths = @(
    "Documents\Codex",
    "Documents\Claude\foodlogging",
    "OneDrive\Documents\My Vampire System"
)

$allData = @()

foreach ($path in $projectPaths) {
    $fullPath = Join-Path $HOME $path
    $statusFile = Join-Path $fullPath "status.json"
    
    if (Test-Path $statusFile) {
        $json = Get-Content $statusFile | ConvertFrom-Json
        $allData += $json
    }
}

$jsContent = "const projectData = " + ($allData | ConvertTo-Json -Compress) + ";"
$outputPath = Join-Path $HOME "Documents\LIFEOS_PORTAL\assets\data.js"

Set-Content -Path $outputPath -Value $jsContent
Write-Host "Dashboard data synced successfully to $outputPath" -ForegroundColor Cyan
