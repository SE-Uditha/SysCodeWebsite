import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';

const securedPaths = new Set();
// Paths are supplied through an environment variable, never inserted into code.
// A protected DACL removes inherited/public grants and permits the owner plus
// the operating system and machine administrators to access private files.
const windowsPermissionScript = `
$ErrorActionPreference = 'Stop'
$privateTarget = [Environment]::GetEnvironmentVariable('SYSCODE_PRIVATE_ACL_TARGET', 'Process')
$privateDirectory = [Environment]::GetEnvironmentVariable('SYSCODE_PRIVATE_ACL_DIRECTORY', 'Process') -eq '1'
$privateItem = Get-Item -LiteralPath $privateTarget -Force
if (($privateItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked private paths are not allowed.' }
if ($privateItem.PSIsContainer -ne $privateDirectory) { throw 'Unexpected private path type.' }
$privateOwner = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ($privateDirectory) {
  $privateAcl = New-Object Security.AccessControl.DirectorySecurity
  $privateInheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
} else {
  $privateAcl = New-Object Security.AccessControl.FileSecurity
  $privateInheritance = [Security.AccessControl.InheritanceFlags]::None
}
$privateAcl.SetAccessRuleProtection($true, $false)
foreach ($privateSidText in @($privateOwner.Value, 'S-1-5-18', 'S-1-5-32-544')) {
  $privateSid = New-Object Security.Principal.SecurityIdentifier($privateSidText)
  $privateRule = New-Object Security.AccessControl.FileSystemAccessRule($privateSid, [Security.AccessControl.FileSystemRights]::FullControl, $privateInheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
  $privateAcl.AddAccessRule($privateRule)
}
# Persist only the modified access rules. Set-Acl can attempt to persist audit
# sections too, which requires privileges that an ordinary app account lacks.
$privateItem.SetAccessControl($privateAcl)
`;

/** Restrict an application-owned regular file or private data directory. */
export function restrictPrivatePath(file, isDirectory = false) {
  const target = resolve(file);
  const stat = lstatSync(target);
  if (stat.isSymbolicLink() || (isDirectory ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error('Private storage requires regular files and directories.');
  }
  if (process.platform !== 'win32') {
    chmodSync(target, isDirectory ? 0o700 : 0o600);
    return;
  }
  if (securedPaths.has(target)) return;
  try {
    execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(windowsPermissionScript, 'utf16le').toString('base64')], {
      windowsHide: true,
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SYSCODE_PRIVATE_ACL_TARGET: target, SYSCODE_PRIVATE_ACL_DIRECTORY: isDirectory ? '1' : '0' },
    });
    securedPaths.add(target);
  } catch {
    throw new Error('Unable to restrict private file permissions. Check the server account permissions.');
  }
}
