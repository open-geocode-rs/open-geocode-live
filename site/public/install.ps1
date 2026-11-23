$releaseUrl = 'https://github.com/open-geocode-rs/open-geocode/releases/latest/download/open-geocode-installer.ps1'
$installer = (Invoke-WebRequest -UseBasicParsing -Uri $releaseUrl -ErrorAction Stop).Content
if ($installer -is [byte[]]) {
    $installer = [System.Text.Encoding]::UTF8.GetString($installer)
}
if ([string]::IsNullOrWhiteSpace($installer)) {
    throw 'The OpenGeocode release installer was empty.'
}

& ([scriptblock]::Create($installer))
