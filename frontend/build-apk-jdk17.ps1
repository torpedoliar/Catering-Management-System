# HalloFood APK Build Script with JDK 17
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  HalloFood APK Builder (JDK 17)" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Set JDK 17
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "[✓] Using JDK 17 from: $env:JAVA_HOME" -ForegroundColor Green
Write-Host ""

# Verify Java version
Write-Host "Java version:" -ForegroundColor Yellow
java -version 2>&1
Write-Host ""

# Step 1: Web Build
Write-Host "[1/3] Building web assets..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { 
    Write-Host "❌ Web build failed!" -ForegroundColor Red
    exit 1 
}
Write-Host "  ✓ Web build complete." -ForegroundColor Green
Write-Host ""

# Step 2: Capacitor Sync
Write-Host "[2/3] Syncing to Android..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { 
    Write-Host "❌ Capacitor sync failed!" -ForegroundColor Red
    exit 1 
}
Write-Host "  ✓ Sync complete." -ForegroundColor Green
Write-Host ""

# Step 3: Build APK
Write-Host "[3/3] Building APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew.bat assembleDebug --no-daemon
$gradleExitCode = $LASTEXITCODE
Pop-Location

if ($gradleExitCode -ne 0) { 
    Write-Host "❌ Gradle build failed!" -ForegroundColor Red
    exit 1 
}
Write-Host "  ✓ APK build complete." -ForegroundColor Green
Write-Host ""

# Find APK
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
$apkFile = Get-Item $apkPath -ErrorAction SilentlyContinue

if ($apkFile) {
    $sizeMB = [math]::Round($apkFile.Length / 1MB, 2)
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  ✅ BUILD SUCCESS!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  APK: $apkPath" -ForegroundColor White
    Write-Host "  Size: $sizeMB MB" -ForegroundColor White
    Write-Host "  Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host ""
    
    # Open folder
    Write-Host "Opening APK folder..." -ForegroundColor Yellow
    explorer /select,$apkFile.FullName
} else {
    Write-Host "❌ APK not found at $apkPath" -ForegroundColor Red
    exit 1
}
