/**
 * Search for a symbol in the config with fuzzy matching.
 * Handles symbols that might have slight variations in names.
 */
export async function searchSymbol(query) {
  try {
    const response = await fetch('/tickersconfig.json')
    const config = await response.json()
    
    const searchTerm = query.toUpperCase().trim()
    
    // Exact match first
    let symbol = config.symbols.find(s => 
      s.symbol.toUpperCase() === searchTerm || 
      s.full_name.toUpperCase() === searchTerm
    )
    if (symbol) return symbol
    
    // Check if searchTerm is contained in symbol or full_name (e.g., "EUR" in "EURUSD")
    symbol = config.symbols.find(s => 
      s.symbol.toUpperCase().includes(searchTerm) ||
      searchTerm.split(' ').some(part => s.symbol.toUpperCase().includes(part))
    )
    if (symbol) return symbol
    
    // Fuzzy search: check for symbols that contain all characters in order
    const scoredSymbols = config.symbols
      .map(s => {
        const score = fuzzyScore(searchTerm, s.symbol.toUpperCase())
        return { symbol: s, score }
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
    
    return scoredSymbols.length > 0 ? scoredSymbols[0].symbol : null
  } catch (error) {
    console.error('Error loading tickersconfig:', error)
    return null
  }
}

/**
 * Simple fuzzy score: how many characters match in order
 */
function fuzzyScore(search, target) {
  let score = 0
  let searchIdx = 0
  
  for (let i = 0; i < target.length && searchIdx < search.length; i++) {
    if (target[i] === search[searchIdx]) {
      score += 10
      searchIdx++
    }
  }
  
  // Penalty if not all characters matched
  if (searchIdx < search.length) return 0
  
  // Bonus for shorter targets (more likely to be exact)
  score -= target.length * 0.1
  
  return score
}

/**
 * Get all available symbol names for autocomplete
 */
export async function getAllSymbols() {
  try {
    const response = await fetch('/tickersconfig.json')
    const config = await response.json()
    return config.symbols.map(s => ({
      symbol: s.symbol,
      full_name: s.full_name
    }))
  } catch (error) {
    console.error('Error loading symbols:', error)
    return []
  }
}

/**
 * Get account currency and default leverage
 */
export async function getAccountDefaults() {
  try {
    const response = await fetch('/tickersconfig.json')
    const config = await response.json()
    return {
      account_currency: config.account_currency,
      default_leverage: config.default_leverage
    }
  } catch (error) {
    console.error('Error loading account defaults:', error)
    return { account_currency: 'USD', default_leverage: 100 }
  }
}
