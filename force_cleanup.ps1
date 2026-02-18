Write-Host "Forcing removal of catering containers..."
$containers = docker ps -aq --filter "name=catering"
if ($containers) {
    docker rm -f $containers
    Write-Host "Successfully removed catering containers."
} else {
    Write-Host "No catering containers found."
}
