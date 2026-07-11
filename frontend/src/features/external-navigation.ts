export function openExternalInNewTab(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (opened) opened.opener = null
  return Boolean(opened)
}
