# test_api.ps1 - Script untuk testing API endpoint
$baseUrl = "http://localhost:3000"
$userId = "cm9m9wh1w0000vbw4w2bffppe"  # Ganti dengan ID user yang valid

# Fungsi untuk menampilkan pesan berwarna
function Show-Message {
    param([string]$text, [string]$type = "info")
    switch ($type) {
        "success" { Write-Host $text -ForegroundColor Green }
        "error"   { Write-Host $text -ForegroundColor Red }
        "info"    { Write-Host $text -ForegroundColor Cyan }
        "warning" { Write-Host $text -ForegroundColor Yellow }
        default   { Write-Host $text }
    }
}

# 1. Login untuk mendapatkan token
try {
    Show-Message "Memproses login..." "info"
    
    $loginData = @{
        email = "superadmin@absensi.app"
        password = "Password123!"
    }
    
    $jsonBody = $loginData | ConvertTo-Json -Compress
    Show-Message "Request Body: $jsonBody" "warning"
    
    $loginResponse = Invoke-RestMethod "$baseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonBody `
        -Verbose  # Aktifkan verbose untuk debugging
    
    # Validasi response login
    if (-not $loginResponse.accessToken) {
        throw "Token tidak ditemukan dalam response"
    }
    
    $token = $loginResponse.accessToken
    Show-Message "Login berhasil!" "success"
    Show-Message "Token: $($token[0..15] -join '')..." "warning"  # Hanya tampilkan sebagian token
    
} catch {
    Show-Message "Gagal login: $($_.Exception.Message)" "error"
    
    # Tambahan debugging untuk response error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $errorResponse = $reader.ReadToEnd() | ConvertFrom-Json
        Show-Message "Detail Error dari Server:" "error"
        $errorResponse | ConvertTo-Json -Depth 4 | Out-Host
    }
    
    exit
}

# 2. Test endpoint dengan token
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    Show-Message "`nMengakses data user ID: $userId" "info"
    
    $response = Invoke-RestMethod "$baseUrl/api/admin/users/$userId" `
        -Method GET `
        -Headers $headers `
        -Verbose  # Aktifkan verbose
    
    # Validasi response
    if (-not $response) {
        throw "Response kosong"
    }
    
    Show-Message "Response API:" "success"
    $response | ConvertTo-Json -Depth 4 | Out-Host
    
    # Contoh pengecekan data
    if ($response.id -ne $userId) {
        Show-Message "Warning: ID response tidak sesuai request" "warning"
    }
    
} catch {
    Show-Message "Error: $($_.Exception.Message)" "error"
    
    # Tangani error details
    if ($_.ErrorDetails) {
        try {
            $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
            Show-Message "Detail Error:" "error"
            $errorDetails | ConvertTo-Json -Depth 4 | Out-Host
        } catch {
            Show-Message "Raw Error Response: $($_.ErrorDetails.Message)" "error"
        }
    }
    
    # Tambahan debugging untuk status code
    if ($_.Exception.Response) {
        Show-Message "Status Code: $($_.Exception.Response.StatusCode.value__)" "error"
    }
}

# 3. Tambahan informasi
Show-Message "`nScript selesai dijalankan" "info"
Show-Message "Waktu: $(Get-Date -Format 'HH:mm:ss')" "info"