export function packagedSmokeConfirmationsEnabled(extensionMode: number, value: string | undefined): boolean {
  const productionExtensionMode = 1;
  return extensionMode !== productionExtensionMode && value === "1";
}
