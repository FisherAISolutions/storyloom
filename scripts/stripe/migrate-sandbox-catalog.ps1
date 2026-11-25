[CmdletBinding()]
param(
  [string]$SourceProfile = 'mystorybook-source',
  [string]$TargetProfile = 'default',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$sourceAccountId = 'acct_1S5NhuHEiMUagmiv'
$targetAccountId = 'acct_1S5NiGH8FszCF9JP'
$migrationVersion = 'mystorybook-catalog-v1'

$catalog = @(
  @{ key = 'starter'; source_price_id = 'price_1UfPW7HEiMUagmivdejEVlTs'; amount = 299; interval = $null },
  @{ key = 'family'; source_price_id = 'price_1UfPD8HEiMUagmivmbdfyImM'; amount = 1299; interval = 'month' },
  @{ key = 'creator'; source_price_id = 'price_1U2LvdHEiMUagmivD6tjJMkF'; amount = 2499; interval = 'month' },
  @{ key = 'credits_small'; source_price_id = 'price_1UfPjTHEiMUagmivwnsaJLuy'; amount = 499; interval = $null },
  @{ key = 'credits_medium'; source_price_id = 'price_1UfQJyHEiMUagmivWYL3h4dh'; amount = 999; interval = $null },
  @{ key = 'credits_large'; source_price_id = 'price_1UfQLSHEiMUagmivm4X5clC1'; amount = 1999; interval = $null }
)

function Invoke-StripeJson {
  param(
    [Parameter(Mandatory)][string]$Profile,
    [Parameter(Mandatory)][ValidateSet('get', 'post')][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [string[]]$Fields = @(),
    [string]$IdempotencyKey
  )

  $arguments = @($Method, $Path, '-p', $Profile)
  if ($IdempotencyKey) { $arguments += @('-i', $IdempotencyKey) }
  foreach ($field in $Fields) { $arguments += @('-d', $field) }
  $raw = & stripe @arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Stripe $Method request failed for $Path." }
  $payload = $raw | ConvertFrom-Json
  if ($payload.error) {
    $safeCode = if ($payload.error.code) { $payload.error.code } else { $payload.error.type }
    throw "Stripe $Method request failed for $Path ($safeCode)."
  }
  return $payload
}

function Get-MetadataFields {
  param([object]$Metadata)
  $fields = @()
  if ($Metadata) {
    foreach ($property in $Metadata.PSObject.Properties) {
      if ($null -ne $property.Value -and [string]$property.Value -ne '') {
        $fields += "metadata[$($property.Name)]=$($property.Value)"
      }
    }
  }
  return $fields
}

function Assert-Account {
  param([string]$Profile, [string]$ExpectedId)
  $account = Invoke-StripeJson -Profile $Profile -Method get -Path '/v1/account'
  if ($account.id -ne $ExpectedId) { throw "Stripe profile '$Profile' targets $($account.id), expected $ExpectedId." }
}

Assert-Account -Profile $SourceProfile -ExpectedId $sourceAccountId
Assert-Account -Profile $TargetProfile -ExpectedId $targetAccountId

$targetProducts = @(Invoke-StripeJson -Profile $TargetProfile -Method get -Path '/v1/products?limit=100').data
$targetPrices = @(Invoke-StripeJson -Profile $TargetProfile -Method get -Path '/v1/prices?limit=100').data
$results = @()

foreach ($entry in $catalog) {
  $sourcePrice = Invoke-StripeJson -Profile $SourceProfile -Method get -Path "/v1/prices/$($entry.source_price_id)"
  if ($sourcePrice.livemode -ne $false) { throw "Source Price $($entry.source_price_id) is not test-mode." }
  if ($sourcePrice.unit_amount -ne $entry.amount -or $sourcePrice.currency -ne 'usd') { throw "Source Price $($entry.source_price_id) does not match the approved amount/currency." }
  $actualInterval = if ($sourcePrice.recurring) { $sourcePrice.recurring.interval } else { $null }
  if ($actualInterval -ne $entry.interval) { throw "Source Price $($entry.source_price_id) has an unexpected billing interval." }

  $sourceProductId = if ($sourcePrice.product -is [string]) { $sourcePrice.product } else { $sourcePrice.product.id }
  $sourceProduct = Invoke-StripeJson -Profile $SourceProfile -Method get -Path "/v1/products/$sourceProductId"
  if ($sourceProduct.livemode -ne $false) { throw "Source Product $sourceProductId is not test-mode." }

  $targetProduct = $targetProducts | Where-Object { $_.metadata.catalog_migration_source_product_id -eq $sourceProductId } | Select-Object -First 1
  if (-not $targetProduct) {
    $sameName = $targetProducts | Where-Object { $_.name -eq $sourceProduct.name } | Select-Object -First 1
    if ($sameName) { throw "Target already contains '$($sourceProduct.name)' without migration metadata; refusing to create a duplicate." }
    if ($Apply) {
      $productActive = $sourceProduct.active.ToString().ToLowerInvariant()
      $productFields = @("name=$($sourceProduct.name)", "active=$productActive")
      if ($sourceProduct.description) { $productFields += "description=$($sourceProduct.description)" }
      if ($sourceProduct.statement_descriptor) { $productFields += "statement_descriptor=$($sourceProduct.statement_descriptor)" }
      if ($sourceProduct.tax_code) { $productFields += "tax_code=$($sourceProduct.tax_code)" }
      if ($sourceProduct.unit_label) { $productFields += "unit_label=$($sourceProduct.unit_label)" }
      if ($sourceProduct.url) { $productFields += "url=$($sourceProduct.url)" }
      for ($imageIndex = 0; $imageIndex -lt @($sourceProduct.images).Count; $imageIndex += 1) {
        $productFields += "images[$imageIndex]=$($sourceProduct.images[$imageIndex])"
      }
      $productFields += @(Get-MetadataFields -Metadata $sourceProduct.metadata)
      $productFields += @(
        "metadata[catalog_migration_version]=$migrationVersion",
        "metadata[catalog_migration_key]=$($entry.key)",
        "metadata[catalog_migration_source_account_id]=$sourceAccountId",
        "metadata[catalog_migration_source_product_id]=$sourceProductId"
      )
      $targetProduct = Invoke-StripeJson -Profile $TargetProfile -Method post -Path '/v1/products' -Fields $productFields -IdempotencyKey "$migrationVersion-product-$sourceProductId"
    }
  }

  if ($targetProduct) {
    foreach ($fieldName in @('name', 'description', 'statement_descriptor', 'tax_code', 'unit_label', 'url', 'active')) {
      if ($targetProduct.$fieldName -ne $sourceProduct.$fieldName) { throw "Target Product $fieldName verification failed for $($entry.key)." }
    }
    $sourceImages = @($sourceProduct.images) | ConvertTo-Json -Compress
    $targetImages = @($targetProduct.images) | ConvertTo-Json -Compress
    if ($sourceImages -ne $targetImages) { throw "Target Product image verification failed for $($entry.key)." }
    foreach ($property in $sourceProduct.metadata.PSObject.Properties) {
      if ([string]$targetProduct.metadata.($property.Name) -ne [string]$property.Value) { throw "Target Product metadata verification failed for $($entry.key)." }
    }
  }

  $targetPrice = $targetPrices | Where-Object { $_.metadata.catalog_migration_source_price_id -eq $sourcePrice.id } | Select-Object -First 1
  if (-not $targetPrice -and $Apply) {
    if (-not $targetProduct) { throw "Target product was not created for $($entry.key)." }
    $priceActive = $sourcePrice.active.ToString().ToLowerInvariant()
    $priceFields = @(
      "product=$($targetProduct.id)",
      "unit_amount=$($sourcePrice.unit_amount)",
      "currency=$($sourcePrice.currency)",
      "active=$priceActive"
    )
    if ($sourcePrice.tax_behavior -and $sourcePrice.tax_behavior -ne 'unspecified') { $priceFields += "tax_behavior=$($sourcePrice.tax_behavior)" }
    if ($sourcePrice.nickname) { $priceFields += "nickname=$($sourcePrice.nickname)" }
    if ($sourcePrice.lookup_key) { $priceFields += "lookup_key=$($sourcePrice.lookup_key)" }
    if ($sourcePrice.recurring) {
      $priceFields += "recurring[interval]=$($sourcePrice.recurring.interval)"
      $priceFields += "recurring[interval_count]=$($sourcePrice.recurring.interval_count)"
      $priceFields += "recurring[usage_type]=$($sourcePrice.recurring.usage_type)"
    }
    $priceFields += @(Get-MetadataFields -Metadata $sourcePrice.metadata)
    $priceFields += @(
      "metadata[catalog_migration_version]=$migrationVersion",
      "metadata[catalog_migration_key]=$($entry.key)",
      "metadata[catalog_migration_source_account_id]=$sourceAccountId",
      "metadata[catalog_migration_source_price_id]=$($sourcePrice.id)"
    )
    $targetPrice = Invoke-StripeJson -Profile $TargetProfile -Method post -Path '/v1/prices' -Fields $priceFields -IdempotencyKey "$migrationVersion-price-$($sourcePrice.id)"
  }

  if ($targetPrice) {
    $targetPriceProductId = if ($targetPrice.product -is [string]) { $targetPrice.product } else { $targetPrice.product.id }
    if ($targetPrice.livemode -ne $false -or $targetPriceProductId -ne $targetProduct.id -or $targetPrice.unit_amount -ne $sourcePrice.unit_amount -or $targetPrice.currency -ne $sourcePrice.currency -or $targetPrice.tax_behavior -ne $sourcePrice.tax_behavior) {
      throw "Target Price verification failed for $($entry.key)."
    }
    $targetInterval = if ($targetPrice.recurring) { $targetPrice.recurring.interval } else { $null }
    if ($targetInterval -ne $actualInterval) { throw "Target Price interval verification failed for $($entry.key)." }
    if ($sourcePrice.recurring -and ($targetPrice.recurring.interval_count -ne $sourcePrice.recurring.interval_count -or $targetPrice.recurring.usage_type -ne $sourcePrice.recurring.usage_type)) {
      throw "Target Price recurring configuration verification failed for $($entry.key)."
    }
    foreach ($property in $sourcePrice.metadata.PSObject.Properties) {
      if ([string]$targetPrice.metadata.($property.Name) -ne [string]$property.Value) { throw "Target Price metadata verification failed for $($entry.key)." }
    }
  }

  $results += [pscustomobject]@{
    catalog_key = $entry.key
    source_product_id = $sourceProductId
    source_price_id = $sourcePrice.id
    target_product_id = if ($targetProduct) { $targetProduct.id } else { $null }
    target_price_id = if ($targetPrice) { $targetPrice.id } else { $null }
    unit_amount = $sourcePrice.unit_amount
    currency = $sourcePrice.currency
    interval = $actualInterval
    tax_behavior = $sourcePrice.tax_behavior
    action = if ($targetPrice) { 'verified' } elseif ($Apply) { 'failed' } else { 'planned' }
  }
}

[pscustomobject]@{
  migration_version = $migrationVersion
  applied = [bool]$Apply
  source_account_id = $sourceAccountId
  target_account_id = $targetAccountId
  catalog = $results
} | ConvertTo-Json -Depth 6
