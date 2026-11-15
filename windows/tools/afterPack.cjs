// Stamps the SnowDesk icon and version info onto the Windows executable (pure JS, no Wine needed).
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const ResEdit = await import('resedit');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.ico')));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map((i) => i.data));
  const infos = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (infos.length > 0) {
    const vi = infos[0];
    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: 'SnowDesk', ProductName: 'SnowDesk', CompanyName: 'SnowDesk',
      LegalCopyright: 'SnowDesk', OriginalFilename: 'SnowDesk.exe', InternalName: 'SnowDesk',
    });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  - icon and version info applied to', path.basename(exePath));
};
