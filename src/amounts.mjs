// Preserve every wei without converting token amounts through floating point.
export function formatAvax(wei) {
  const negative=wei<0n;const absolute=negative?-wei:wei;
  const whole=(absolute/10n**18n).toLocaleString('en-IN');
  const fraction=(absolute%10n**18n).toString().padStart(18,'0').replace(/0+$/,'');
  return `${negative?'-':''}${whole}${fraction?'.'+fraction:''}`;
}
