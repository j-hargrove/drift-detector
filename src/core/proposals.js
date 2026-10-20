// What an Amend would change in the contract, derived from the offending snippet.

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /\b\d+(?:\.\d+)?px\b/g;
const VARIANT = /variant=["']([^"']+)["']/;

export function proposeChange(deviation, componentName) {
  const { rule, snippet } = deviation;

  if (rule === 'no-hardcoded-color') {
    const hex = snippet.match(HEX)?.[0];
    if (hex) return `add ${hex.toUpperCase()} to ${componentName}.allowedTokens.color`;
  }
  if (rule === 'no-arbitrary-spacing') {
    const values = snippet.match(PX);
    if (values) return `add ${[...new Set(values)].join(', ')} to ${componentName}.allowedTokens.spacing`;
  }
  if (rule === 'no-off-contract-variant') {
    const variant = snippet.match(VARIANT)?.[1];
    if (variant) return `add "${variant}" to ${componentName}.variants`;
  }
  return `allow \`${snippet.trim()}\` under ${rule}`;
}

// "color.primary" -> "#2563EB"; null when the suggestion isn't a token path.
export function resolveToken(contract, path) {
  const [group, name] = String(path).split('.');
  return contract.tokens?.[group]?.[name] ?? null;
}
