$ErrorActionPreference = 'Stop'
$AppId   = '293c64b7-5105-4cbd-a9e4-c0996b519dbb'   # Application (client) ID, not the tenant ID
$Mailbox = 'no-reply@egdigital.com.au'
$Group   = 'egmailersenders@egdigital.com.au'
$Admin   = 'rj@elomagroup.org'

Import-Module ExchangeOnlineManagement

Write-Host "=== Connecting as $Admin ==="
Connect-ExchangeOnline -UserPrincipalName $Admin -ShowBanner:$false
Write-Host "=== CONNECTED ==="
Get-ConnectionInformation | Select-Object UserPrincipalName, Organization, State |
  Format-List | Out-String | Write-Host

# 1. Mail-enabled security group containing only the mailer mailbox
$existing = Get-DistributionGroup -Identity $Group -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "=== Creating group $Group ==="
  New-DistributionGroup -Name 'EG Mailer Senders' -Alias egmailersenders `
    -PrimarySmtpAddress $Group -Type Security -Members $Mailbox | Out-Null
  Write-Host "=== Created; waiting 60s for replication ==="
  Start-Sleep 60
} else {
  Write-Host "=== Group already exists ==="
  $members = Get-DistributionGroupMember -Identity $Group |
             Select-Object -ExpandProperty PrimarySmtpAddress
  if ($members -notcontains $Mailbox) {
    Write-Host "=== Adding $Mailbox to group ==="
    Add-DistributionGroupMember -Identity $Group -Member $Mailbox
    Start-Sleep 60
  }
}
Write-Host "--- Group members ---"
Get-DistributionGroupMember -Identity $Group |
  Select-Object DisplayName, PrimarySmtpAddress | Format-Table -AutoSize | Out-String | Write-Host

# 2. Application access policy restricting the app to that group
$pol = Get-ApplicationAccessPolicy -ErrorAction SilentlyContinue |
       Where-Object { $_.AppId -eq $AppId }
if ($pol) {
  Write-Host "=== Policy already present for this AppId ==="
  $pol | Select-Object AppId, ScopeName, AccessRight | Format-List | Out-String | Write-Host
} else {
  Write-Host "=== Creating application access policy ==="
  $retry = 0
  while ($true) {
    try {
      New-ApplicationAccessPolicy -AppId $AppId -PolicyScopeGroupId $Group `
        -AccessRight RestrictAccess -Description 'EG Digital mailer: no-reply only' |
        Format-List | Out-String | Write-Host
      break
    } catch {
      $retry++
      if ($retry -ge 5) { throw }
      Write-Host "   attempt $retry failed ($($_.Exception.Message)); retrying in 60s"
      Start-Sleep 60
    }
  }
}

# 3. Verify: allowed mailbox should be Granted
Write-Host "=== Test: $Mailbox (expect Granted) ==="
Test-ApplicationAccessPolicy -Identity $Mailbox -AppId $AppId |
  Select-Object Mailbox, AccessCheckResult | Format-Table -AutoSize | Out-String | Write-Host

Write-Host "=== Test: $Admin (expect Denied) ==="
try {
  Test-ApplicationAccessPolicy -Identity $Admin -AppId $AppId |
    Select-Object Mailbox, AccessCheckResult | Format-Table -AutoSize | Out-String | Write-Host
} catch { Write-Host "   (not testable: $($_.Exception.Message))" }

Disconnect-ExchangeOnline -Confirm:$false
Write-Host "=== DONE ==="
